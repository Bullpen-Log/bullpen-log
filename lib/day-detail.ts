import 'server-only';
import { prisma } from '@/lib/prisma';
import { trainingDay, type TrainingDayDetail } from '@/lib/report/training-history';
import { CHECKIN_PARTS, DETAIL_SCALES, pickCheckinParts } from '@/lib/checkin';
import { dbDate } from '@/lib/nutrition/days';
import { MEALS, amountText, isMealKey, type MealKey } from '@/lib/nutrition/meta';
import { ageOn, computeTargets } from '@/lib/nutrition/targets';
import { pitchingBurn, totalBurn, trainingBurn } from '@/lib/nutrition/burn';
import { toProfile } from '@/lib/nutrition/load';

/**
 * 홈 캘린더에서 고른 날의 '조금 더 자세한' 요약 — 캘린더 밑 칸이 보여 준다.
 *
 * 오른쪽 그날 칸은 한 줄 요약이라 캘린더와 함께 미리 읽어 둔다. 이것은 줄 하나를
 * 눌렀을 때 펴지는 칸이라, 날짜를 고를 때 그날 것만 따로 읽는다(열세 달치를 미리
 * 읽기에는 크다). 그래도 요약이다 — 진짜 자세한 것은 각 탭에 있고, 칸마다 그리로
 * 가는 길을 둔다.
 */

export type DayDetail = {
  date: string;
  /** 그날 운동 — 한 것과, 일정에 있었지만 못 한 것 */
  training: TrainingDayDetail;
  nutrition: {
    kcal: number;
    carbs: number;
    protein: number;
    fat: number;
    /** 그날 목표(운동한 만큼 더한 것) */
    target: {
      kcal: number;
      carbs: number;
      protein: number;
      fat: number;
      waterMl: number;
    };
    waterMl: number;
    /** 끼니별 — 먹은 것이 있는 끼니만 */
    meals: {
      meal: MealKey;
      label: string;
      kcal: number;
      items: { name: string; amount: string; kcal: number }[];
    }[];
  };
  checkin: null | {
    condition: number;
    sleep: string;
    /** 부위마다 — 정상 · 뻐근 · 통증 */
    parts: { label: string; value: string }[];
    /** 상세 체크인에서 적은 것 — '수면 7.5시간', '팔 피로 조금' */
    details: { label: string; value: string }[];
    note: string | null;
  };
};

type UserBody = {
  id: string;
  birthDate: Date | null;
  heightCm: number | null;
  weightKg: number | null;
};

export async function loadDayDetail(user: UserBody, date: string): Promise<DayDetail> {
  const day = dbDate(date);
  const where = { userId: user.id, date: day };

  const [training, meals, daily, profileRow, checkin, sessions, pitches] =
    await Promise.all([
      trainingDay(user.id, date),
      prisma.mealEntry.findMany({ where, orderBy: { createdAt: 'asc' } }),
      prisma.dailyNutrition.findUnique({
        where: { userId_date: { userId: user.id, date: day } },
      }),
      prisma.nutritionProfile.findUnique({ where: { userId: user.id } }),
      prisma.dailyCheckin.findUnique({
        where: { userId_date: { userId: user.id, date: day } },
      }),
      prisma.trainingSession.findMany({ where, select: { activeSeconds: true } }),
      prisma.pitchLog.findMany({
        where,
        select: { sessionType: true, pitchCount: true, intensity: true },
      }),
    ]);

  /* ── 영양: 합과 그날 목표 ── */
  const weightKg = daily?.weightKg ?? checkin?.bodyWeightKg ?? user.weightKg;
  const burnKg = weightKg ?? 75;
  const burn = totalBurn(
    [
      ...sessions.map((s) => trainingBurn(s.activeSeconds, burnKg)),
      ...pitches.map((p) =>
        pitchingBurn(p.sessionType, p.pitchCount, p.intensity, burnKg)
      ),
    ].filter((b): b is NonNullable<typeof b> => b !== null)
  );
  const targets = computeTargets(
    toProfile(profileRow),
    { weightKg, heightCm: user.heightCm, age: ageOn(user.birthDate, date) },
    burn
  );

  const sum = { kcal: 0, carbs: 0, protein: 0, fat: 0 };
  const byMeal = new Map<MealKey, DayDetail['nutrition']['meals'][number]>();
  for (const e of meals) {
    const kcal = e.kcal * e.amount;
    sum.kcal += kcal;
    sum.carbs += (e.carbs ?? 0) * e.amount;
    sum.protein += (e.protein ?? 0) * e.amount;
    sum.fat += (e.fat ?? 0) * e.amount;
    const meal = isMealKey(e.meal) ? e.meal : 'snack';
    const slot = byMeal.get(meal) ?? {
      meal,
      label: MEALS.find((m) => m.key === meal)!.label,
      kcal: 0,
      items: [],
    };
    slot.kcal += kcal;
    slot.items.push({
      name: e.name,
      amount: amountText(e.amount),
      kcal: Math.round(kcal),
    });
    byMeal.set(meal, slot);
  }

  /* ── 체크인: 부위와 상세 ── */
  let checkinOut: DayDetail['checkin'] = null;
  if (checkin) {
    const parts = pickCheckinParts(checkin);
    const details: { label: string; value: string }[] = [];
    if (checkin.sleepHours != null)
      details.push({ label: '잔 시간', value: `${checkin.sleepHours}시간` });
    for (const s of DETAIL_SCALES) {
      const v = checkin[s.key];
      if (v != null && v >= 1 && v <= s.options.length) {
        details.push({ label: s.label, value: s.options[v - 1] });
      }
    }
    if (checkin.bodyWeightKg != null)
      details.push({ label: '체중', value: `${checkin.bodyWeightKg}kg` });
    if (checkin.restingHr != null)
      details.push({ label: '안정 심박', value: `${checkin.restingHr}` });
    if (checkin.hydration) details.push({ label: '물', value: checkin.hydration });
    if (checkin.nutrition) details.push({ label: '식사', value: checkin.nutrition });
    checkinOut = {
      condition: checkin.condition,
      sleep: checkin.sleep,
      parts: CHECKIN_PARTS.map((p) => ({ label: p.label, value: parts[p.key] })),
      details,
      note: checkin.note?.trim() || null,
    };
  }

  return {
    date,
    training,
    nutrition: {
      kcal: Math.round(sum.kcal),
      carbs: Math.round(sum.carbs),
      protein: Math.round(sum.protein),
      fat: Math.round(sum.fat),
      target: {
        kcal: targets.kcal,
        carbs: targets.carbs,
        protein: targets.protein,
        fat: targets.fat,
        waterMl: targets.waterMl,
      },
      waterMl: daily?.waterMl ?? 0,
      meals: MEALS.map((m) => byMeal.get(m.key))
        .filter((m): m is NonNullable<typeof m> => m != null)
        .map((m) => ({ ...m, kcal: Math.round(m.kcal) })),
    },
    checkin: checkinOut,
  };
}
