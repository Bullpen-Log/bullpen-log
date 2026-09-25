import {
  ACTIVITIES,
  GOALS,
  WATER_CUP_ML,
  type ActivityKey,
  type GoalKey,
  type Sex,
} from '@/lib/nutrition/meta';

/**
 * 하루 목표 — 칼로리, 탄수화물·단백질·지방, 물.
 *
 * 저장하지 않고 볼 때마다 계산한다. 체중이 바뀌면 목표도 따라 바뀌어야 하고,
 * 운동한 날은 쓴 만큼 더 먹어야 하기 때문이다.
 *
 *   기초대사량   Mifflin-St Jeor 식. 요즘 계산기들이 가장 많이 쓰는 식이다.
 *   운동 전 목표  기초대사량 × 평소 움직임 + 목표(증량 +300 · 감량 −400)
 *   오늘 목표    운동 전 목표 + 오늘 운동으로 쓴 것(OUT)
 *
 * 영양소는 단백질 → 지방 → 탄수화물 차례로 정한다.
 *   단백질    체중 × 1kg 당 g (기본 1.8g). 가장 먼저, 칼로리와 상관없이 챙길 것.
 *   지방      오늘 목표의 25%. 다만 체중 1kg 당 0.8g 아래로는 내리지 않는다.
 *   탄수화물  남은 칼로리 전부. 그래서 운동·투구를 많이 한 날은 탄수화물이
 *             저절로 늘어난다 — 던지는 날 먹어야 할 것이 바로 탄수화물이다.
 */

export type ProfileSettings = {
  sex: Sex | null;
  goal: GoalKey;
  activity: ActivityKey;
  proteinPerKg: number;
  /** 직접 정한 운동 전 하루 칼로리 */
  kcalTarget: number | null;
  waterGoalMl: number | null;
};

export const DEFAULT_PROFILE: ProfileSettings = {
  sex: null,
  goal: 'maintain',
  activity: 'mid',
  proteinPerKg: 1.8,
  kcalTarget: null,
  waterGoalMl: null,
};

export type Body = {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
};

/**
 * 비어 있어서 짐작으로 채운 것. 화면이 '내 정보를 채우면 더 정확해요'를 띄운다.
 *
 * 짐작 값은 고등·대학 투수의 흔한 몸이다. 비어 있다고 목표를 아예 안 보여 주면
 * 첫날부터 쓸 수가 없다.
 */
export type Assumed = 'weight' | 'height' | 'age' | 'sex';

const FALLBACK = { weightKg: 75, heightCm: 178, age: 20 };

export type Targets = {
  /** 기초대사량 */
  bmr: number;
  /** 운동 전 하루 목표 */
  base: number;
  /** 오늘 운동으로 쓴 것(OUT) */
  burn: number;
  /** 오늘 목표 = base + burn */
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  waterMl: number;
  /** 계산에 쓴 체중 */
  weightKg: number;
  assumed: Assumed[];
  /** 하루 칼로리를 직접 정했나 */
  manual: boolean;
};

/** 만 나이. 생일이 안 지났으면 한 살 뺀다. */
export function ageOn(birthDate: Date | null, todayKey: string): number | null {
  if (!birthDate) return null;
  const [y, m, d] = todayKey.split('-').map(Number);
  const by = birthDate.getUTCFullYear();
  const bm = birthDate.getUTCMonth() + 1;
  const bd = birthDate.getUTCDate();
  const age = y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  return age > 0 && age < 120 ? age : null;
}

/**
 * 기초대사량(kcal) — Mifflin-St Jeor.
 * 성별을 모르면 남녀 식의 가운데 값(−78)을 쓴다.
 */
export function basalKcal(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: Sex | null
) {
  const s = sex === 'M' ? 5 : sex === 'F' ? -161 : -78;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + s;
}

const round10 = (n: number) => Math.round(n / 10) * 10;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export function computeTargets(
  profile: ProfileSettings,
  body: Body,
  burnKcal: number
): Targets {
  const assumed: Assumed[] = [];
  const weightKg = body.weightKg ?? (assumed.push('weight'), FALLBACK.weightKg);
  const heightCm = body.heightCm ?? (assumed.push('height'), FALLBACK.heightCm);
  const age = body.age ?? (assumed.push('age'), FALLBACK.age);
  if (!profile.sex) assumed.push('sex');

  const bmr = Math.round(basalKcal(weightKg, heightCm, age, profile.sex));
  const activity = ACTIVITIES.find((a) => a.key === profile.activity) ?? ACTIVITIES[1];
  const goal = GOALS.find((g) => g.key === profile.goal) ?? GOALS[1];

  const manual = profile.kcalTarget !== null;
  const base = profile.kcalTarget ?? round10(bmr * activity.factor + goal.kcalDelta);
  const burn = Math.max(0, Math.round(burnKcal));
  const kcal = base + burn;

  const protein = Math.round(profile.proteinPerKg * weightKg);
  const fat = Math.round(Math.max((kcal * 0.25) / 9, 0.8 * weightKg));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  /*
   * 물: 체중 1kg 당 35ml, 운동한 날은 500ml 더. 한 잔(250ml) 단위로 맞춰
   * 화면의 잔 수와 딱 떨어지게 한다.
   */
  const waterMl =
    profile.waterGoalMl ?? roundTo(weightKg * 35 + (burn > 0 ? 500 : 0), WATER_CUP_ML);

  return {
    bmr,
    base,
    burn,
    kcal,
    protein,
    fat,
    carbs,
    waterMl,
    weightKg,
    assumed,
    manual,
  };
}
