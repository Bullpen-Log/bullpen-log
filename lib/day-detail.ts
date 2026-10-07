import 'server-only';
import { prisma } from '@/lib/prisma';
import { trainingDay, type TrainingDayDetail } from '@/lib/report/training-history';
import {
  APPETITE_LEVELS,
  CHECKIN_PARTS,
  DETAIL_SCALES,
  formatSleepHours,
  mealSummary,
  pickCheckinParts,
  sorenessWord,
} from '@/lib/checkin';
import { dbDate } from '@/lib/nutrition/days';
import {
  MEALS,
  amountText,
  isMealKey,
  isSex,
  type MealKey,
} from '@/lib/nutrition/meta';
import { ageOn, computeTargets } from '@/lib/nutrition/targets';
import { pitchingBurn, totalBurn, trainingBurn } from '@/lib/nutrition/burn';
import { recentWeightKg, toProfile } from '@/lib/nutrition/load';
import { loadVelocityClipsDay } from '@/lib/velocity-load';
import type { DayClip } from '@/lib/velocity-meta';

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
    };
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
    /** 간편 · 상세에서 적은 것(적은 날만) — '잔 시간 6.5시간', '근육통 많이', '팔 피로 조금' */
    details: { label: string; value: string }[];
    note: string | null;
  };
  /**
   * 그날 카메라로 잰 공의 클립 — 영상 칸이 공마다 튼다. 청할 때만 읽는다(opts.clips — 서명 왕복이 들어서, 홈 맨 위 링처럼
   * 안 쓰는 곳은 빼고). 서명 주소는 한 시간이라 오래 들고 있으면 만료된다 — 영상 칸이 못 불러오면 이 날을 다시 받는다.
   */
  clips: DayClip[];
};

type UserBody = {
  id: string;
  birthDate: Date | null;
  /** 계정의 성별 'M' | 'F' — 영양 탭과 같은 목표가 나오려면 같이 넘겨야 한다 */
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
};

export async function loadDayDetail(
  user: UserBody,
  date: string,
  opts: { clips?: boolean } = {}
): Promise<DayDetail> {
  const day = dbDate(date);
  const where = { userId: user.id, date: day };

  const [training, meals, profileRow, checkin, sessions, pitches, recentKg, clips] =
    await Promise.all([
      trainingDay(user.id, date),
      prisma.mealEntry.findMany({ where, orderBy: { createdAt: 'asc' } }),
      prisma.nutritionProfile.findUnique({ where: { userId: user.id } }),
      prisma.dailyCheckin.findUnique({
        where: { userId_date: { userId: user.id, date: day } },
      }),
      prisma.trainingSession.findMany({ where, select: { activeSeconds: true } }),
      prisma.pitchLog.findMany({
        where,
        select: { sessionType: true, pitchCount: true, intensity: true },
      }),
      /* 목표의 체중 — 영양 탭과 같은 규칙(그날 → 30일 안 가장 최근 → 가입 때) */
      recentWeightKg(user.id, date),
      opts.clips ? loadVelocityClipsDay(user.id, day) : Promise.resolve([]),
    ]);

  /* ── 영양: 합과 그날 목표 ── */
  const weightKg = recentKg ?? user.weightKg;
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
    {
      weightKg,
      heightCm: user.heightCm,
      age: ageOn(user.birthDate, date),
      sex: isSex(user.sex) ? user.sex : null,
    },
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
    /*
     * 잔 시간 · 근육통을 맨 앞에 둔다 — 간편 쪽에서 적는 칸이고 트레이닝 추천이 읽는 값이라,
     * 그날 운동이 왜 가벼웠는지 돌아볼 때 먼저 찾는다. 안 적은 날은 줄을 만들지 않는다.
     */
    if (checkin.sleepHours != null)
      details.push({ label: '잔 시간', value: formatSleepHours(checkin.sleepHours) });
    const soreness = sorenessWord(checkin.soreness);
    if (soreness) details.push({ label: '근육통', value: soreness });
    /* 식사(끼니 양 · 걸른 끼니) — 영양 조언이 읽는 간편 칸 */
    const meals = mealSummary(checkin.nutrition, checkin.skippedMeals);
    if (meals) details.push({ label: '식사', value: meals });
    for (const s of DETAIL_SCALES) {
      const v = checkin[s.key];
      if (v != null && v >= 1 && v <= s.options.length) {
        details.push({ label: s.label, value: s.options[v - 1] });
      }
    }
    if (checkin.bodyWeightKg != null)
      details.push({ label: '체중', value: `${checkin.bodyWeightKg}kg` });
    if (
      checkin.appetite != null &&
      checkin.appetite >= 1 &&
      checkin.appetite <= APPETITE_LEVELS.length
    )
      details.push({ label: '식욕', value: APPETITE_LEVELS[checkin.appetite - 1] });
    if (checkin.throwPlan)
      details.push({ label: '던지는 일정', value: checkin.throwPlan });
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
      },
      meals: MEALS.map((m) => byMeal.get(m.key))
        .filter((m): m is NonNullable<typeof m> => m != null)
        .map((m) => ({ ...m, kcal: Math.round(m.kcal) })),
    },
    checkin: checkinOut,
    clips,
  };
}
