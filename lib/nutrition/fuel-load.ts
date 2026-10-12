import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { shiftDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { isSex } from '@/lib/nutrition/meta';
import { ageOn, computeTargets } from '@/lib/nutrition/targets';
import { toProfile } from '@/lib/nutrition/load';
import {
  FUEL_WINDOW_DAYS,
  NO_FUEL_CHECK,
  fuelCardOf,
  fuelCheckOf,
  fuelDaysOf,
  mergeDayWeights,
  type FuelCard,
  type FuelCheck,
  type FuelDay,
} from '@/lib/nutrition/fuel-check';

/** 목표 계산의 체중을 고르는 창 — 영양 탭(load.ts WEIGHT_DAYS)과 같은 30일 */
const BODY_WEIGHT_DAYS = 30;

export type FuelState = {
  check: FuelCheck;
  /** 영양 탭 카드 글 — 깃발이 섰을 때만 */
  card: FuelCard | null;
};

/**
 * 영양 추세 깃발을 읽어 셈한다(lib/nutrition/fuel-check.ts) — 영양 탭(오늘만) · 프로그램 날 무게(program/load.ts) · 자유 운동 무게
 * (app/actions/workout.ts)가 같은 값을 본다. 인자는 문자열만 — React cache 가 같은 요청 안에서 한 번만 돌게(gather.ts 와 같은 규칙).
 *
 * 영양 목표 줄(NutritionProfile)이 없으면 깃발은 없다 — 목표를 정한 적 없는 사람의 '목표의 85%'는 남이 정한 기본값이라 근거가
 * 약하고, 그런 사람은 식사 기록도 드물다. 보는 날은 어제까지 7일(오늘은 아직 먹는 중), 목표는 운동 몫을 뺀 하루 기본 목표.
 */
export const loadFuelState = cache(
  async (userId: string, todayKey: string): Promise<FuelState> => {
    const from = shiftDateKey(todayKey, -FUEL_WINDOW_DAYS);
    const yesterday = shiftDateKey(todayKey, -1);
    const bodyFrom = shiftDateKey(todayKey, -(BODY_WEIGHT_DAYS - 1));
    const [user, profileRow, meals, daily, checkins] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { birthDate: true, sex: true, heightCm: true, weightKg: true },
      }),
      prisma.nutritionProfile.findUnique({ where: { userId } }),
      prisma.mealEntry.findMany({
        where: { userId, date: { gte: dbDate(from), lte: dbDate(yesterday) } },
        select: { date: true, meal: true, kcal: true, protein: true, amount: true },
      }),
      prisma.dailyNutrition.findMany({
        where: { userId, date: { gte: dbDate(bodyFrom), lte: dbDate(todayKey) } },
        select: { date: true, weightKg: true },
      }),
      prisma.dailyCheckin.findMany({
        where: { userId, date: { gte: dbDate(bodyFrom), lte: dbDate(todayKey) } },
        select: { date: true, condition: true, bodyWeightKg: true },
      }),
    ]);
    if (!user || !profileRow) return { check: NO_FUEL_CHECK, card: null };

    const weights = mergeDayWeights(
      checkins.map((c) => ({ date: keyOfDbDate(c.date), kg: c.bodyWeightKg })),
      daily.map((d) => ({ date: keyOfDbDate(d.date), kg: d.weightKg }))
    );
    /* 목표 계산의 체중 — 영양 탭과 같은 규칙(30일 안에서 가장 최근, 없으면 가입 때 적은 값) */
    const latestKey = [...weights.keys()].sort().at(-1);
    const bodyKg =
      (latestKey ? weights.get(latestKey)?.kg : undefined) ?? user.weightKg;
    const targets = computeTargets(
      toProfile(profileRow),
      {
        weightKg: bodyKg,
        heightCm: user.heightCm,
        age: ageOn(user.birthDate, todayKey),
        sex: isSex(user.sex) ? user.sex : null,
      },
      0
    );

    /* 날마다 재료 — 창(D-7..D-1) · 단백질 모름 · 기록한 날은 순수 함수 하나(fuel-check.ts fuelDaysOf — 자체 시험이 표로 본다, 2판 P6 검토) */
    const days: FuelDay[] = fuelDaysOf({
      todayKey,
      meals: meals.map((m) => ({ ...m, date: keyOfDbDate(m.date) })),
      weights,
      conditions: new Map(checkins.map((c) => [keyOfDbDate(c.date), c.condition])),
    });

    const check = fuelCheckOf({
      days,
      targets: { kcal: targets.base, protein: targets.protein },
    });
    return { check, card: fuelCardOf(check, targets.ageBand !== 'adult') };
  }
);

/** 무게 추천에 넘길 '올림 멈춤' 글 — 깃발이 없으면 undefined(free-weight.ts · next-weight.ts 의 holdProgress) */
export async function loadHoldProgress(
  userId: string,
  todayKey: string
): Promise<string | undefined> {
  return (await loadFuelState(userId, todayKey)).check.holdText ?? undefined;
}
