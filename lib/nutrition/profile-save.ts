import 'server-only';
import { dbDate } from '@/lib/nutrition/days';
import {
  effectiveGoal,
  effectiveRate,
  paceChoices,
  storedRate,
} from '@/lib/nutrition/age';
import {
  FAT_G_MAX,
  FAT_G_MIN,
  PROTEIN_G_MAX,
  PROTEIN_G_MIN,
  PROTEIN_MAX,
  PROTEIN_MIN,
  isActivityKey,
  isGoalKey,
  isGoalKind,
  isMacroPreset,
  type GoalKey,
} from '@/lib/nutrition/meta';
import { foldGoalKind } from '@/lib/nutrition/onboarding';
import { ageOn } from '@/lib/nutrition/targets';
import { checkTargetWeight, planOnSave } from '@/lib/nutrition/weight-goal';
import { toDateKey } from '@/lib/pitch-stats';

/**
 * 영양 목표 줄(NutritionProfile)을 저장할 값으로 — 검사 · 나이 규칙 · 속도 · 목표 체중 · 계획 시작일을 한곳에서(순수, DB 없음).
 *
 * 목표 창(saveNutritionProfile) · 가입(trySignup) · 기존 사용자 온보딩(finishNutritionSetup) 셋이 같은 규칙으로 저장한다
 * (2026-10-08 인아웃식 온보딩 — 목표 창 동작에만 있던 것을 떼어냈다. 동작은 그대로).
 */

export type ProfileInput = {
  goal: string;
  activity: string;
  proteinPerKg: number;
  kcalTarget: number | null;
  /** 직접 정한 하루 단백질(g). null 은 계산으로. 안 보낸 화면(undefined)은 저장된 값 그대로 */
  proteinTargetG?: number | null;
  /*
   * 체중 목표(lib/nutrition/weight-goal.ts). 안 보낸 화면은 이 칸들을 undefined 로 — 그때는 목표가 그대로면 저장된 값을 두고,
   * 목표를 바꿨으면 비운다. 조정(kcalAdjust)과 계획 시작일(planSince)은 받지 않는다 — 서버가 정한다.
   */
  /** 목표 체중(kg). null 은 안 정함 */
  targetWeightKg?: number | null;
  /** 주당 속도(kg). null 은 나이별 기본 속도 */
  weeklyRateKg?: number | null;
  /** 받아들여 둔 체중 흐름 조정을 지운다 */
  clearAdjust?: boolean;
  /*
   * 인아웃식 온보딩(2026-10-08). 안 보낸 화면(undefined)은 저장된 값 그대로(목표가 바뀌면 카드 원답은 비운다).
   */
  /** 목표 카드의 원답. 있으면 goal 은 이 카드를 접은 목표로 맞춘다(lib/nutrition/onboarding.ts foldGoalKind) */
  goalKind?: string | null;
  /** 탄단지 나누기 프리셋. null 은 균형 */
  macroPreset?: string | null;
  /** 직접 정한 하루 지방(g). null 은 계산 */
  fatTargetG?: number | null;
  /** 온보딩을 끝냈다 — 처음 한 번만 시각을 적는다 */
  onboarded?: boolean;
};

/** 저장된 줄에서 보는 것(prisma.nutritionProfile 의 줄 — 이 칸들만 쓴다) */
export type ProfilePrev = {
  goal: string;
  activity: string;
  kcalTarget: number | null;
  targetWeightKg: number | null;
  weeklyRateKg: number | null;
  kcalAdjust: number | null;
  planSince: Date | null;
  updatedAt: Date;
  goalKind?: string | null;
  macroPreset?: string | null;
  fatTargetG?: number | null;
  onboardedAt?: Date | null;
};

export type ProfileUser = {
  birthDate: Date | null;
  heightCm: number | null;
  weightKg: number | null;
};

/** upsert 에 넣을 값 — 안 보낸 칸은 빠져서(undefined) 저장된 값을 건드리지 않는다 */
export type ProfileData = {
  goal: GoalKey;
  activity: string;
  proteinPerKg: number;
  kcalTarget: number | null;
  proteinTargetG?: number | null;
  targetWeightKg: number | null;
  weeklyRateKg: number | null;
  kcalAdjust: number | null;
  planSince?: Date;
  goalKind: string | null;
  macroPreset?: string | null;
  fatTargetG?: number | null;
  onboardedAt?: Date;
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 검사 → 저장할 값. 실패면 해요체 한 줄.
 *
 *   refKg   지금 체중(그날 → 30일 안 최근 → 가입 때 몸무게) — 속도 · 목표 체중의 기준
 *   today   'YYYY-MM-DD'(계획 시작일 · 만 나이)
 *   now     onboardedAt 에 적을 시각
 */
export function buildProfileData(
  input: ProfileInput,
  user: ProfileUser,
  prev: ProfilePrev | null,
  refKg: number | null,
  today: string = toDateKey(new Date()),
  now: Date = new Date()
): { ok: true; data: ProfileData } | { ok: false; error: string } {
  /* ── 목표 카드 → 계산이 읽는 목표 ── */
  const age = ageOn(user.birthDate, today);
  let goalKind: string | null | undefined = undefined;
  let goalInput = input.goal;
  if (input.goalKind === null) goalKind = null;
  else if (input.goalKind !== undefined) {
    if (!isGoalKind(input.goalKind))
      return { ok: false, error: '목표를 다시 골라 주세요.' };
    goalKind = input.goalKind;
    goalInput = foldGoalKind(input.goalKind, age).goal;
  }
  if (!isGoalKey(goalInput)) return { ok: false, error: '목표를 다시 골라 주세요.' };
  if (!isActivityKey(input.activity))
    return { ok: false, error: '평소 움직임을 다시 골라 주세요.' };
  if (
    !isNum(input.proteinPerKg) ||
    input.proteinPerKg < PROTEIN_MIN ||
    input.proteinPerKg > PROTEIN_MAX
  ) {
    return {
      ok: false,
      error: `단백질은 체중 1kg 당 ${PROTEIN_MIN}~${PROTEIN_MAX}g 사이로 골라 주세요.`,
    };
  }
  let kcalTarget: number | null = null;
  if (input.kcalTarget !== null) {
    if (
      !isNum(input.kcalTarget) ||
      input.kcalTarget < 1000 ||
      input.kcalTarget > 6000
    ) {
      return { ok: false, error: '하루 칼로리는 1,000~6,000 사이로 적어 주세요.' };
    }
    kcalTarget = Math.round(input.kcalTarget);
  }
  let proteinTargetG: number | null | undefined = undefined;
  if (input.proteinTargetG === null) proteinTargetG = null;
  else if (input.proteinTargetG !== undefined) {
    if (
      !isNum(input.proteinTargetG) ||
      input.proteinTargetG < PROTEIN_G_MIN ||
      input.proteinTargetG > PROTEIN_G_MAX
    ) {
      return {
        ok: false,
        error: `하루 단백질은 ${PROTEIN_G_MIN}~${PROTEIN_G_MAX}g 사이로 적어 주세요.`,
      };
    }
    proteinTargetG = Math.round(input.proteinTargetG);
  }
  let fatTargetG: number | null | undefined = undefined;
  if (input.fatTargetG === null) fatTargetG = null;
  else if (input.fatTargetG !== undefined) {
    if (
      !isNum(input.fatTargetG) ||
      input.fatTargetG < FAT_G_MIN ||
      input.fatTargetG > FAT_G_MAX
    ) {
      return {
        ok: false,
        error: `하루 지방은 ${FAT_G_MIN}~${FAT_G_MAX}g 사이로 적어 주세요.`,
      };
    }
    fatTargetG = Math.round(input.fatTargetG);
  }
  let macroPreset: string | null | undefined = undefined;
  if (input.macroPreset === null) macroPreset = null;
  else if (input.macroPreset !== undefined) {
    if (!isMacroPreset(input.macroPreset))
      return { ok: false, error: '탄단지 나누기를 다시 골라 주세요.' };
    macroPreset = input.macroPreset;
  }

  /* ── 체중 목표: 속도 · 목표 체중은 나이와 지금 체중으로 본다 ── */
  /* 어린이의 감량은 유지로 셈한다 — 속도와 목표 체중도 그 목표로 본다 */
  const goal = effectiveGoal(goalInput, age);
  const sameGoal = prev !== null && prev.goal === goalInput;

  let weeklyRateKg: number | null = null;
  if (input.weeklyRateKg === undefined) {
    weeklyRateKg = sameGoal ? prev.weeklyRateKg : null;
  } else if (isNum(input.weeklyRateKg)) {
    /*
     * 고를 수 있는 속도이거나, 이미 저장해 둔 속도 그대로(체중이 70kg 아래로 내려가도 다른 저장이 막히지 않게)일
     * 때만 받는다. 그 밖은 거절하지 않고 기본 속도로 둔다 — 지난 날을 보며 연 목표 창은 그날 나이로 셈한 속도를
     * 보내는데(만 18세 생일 전날의 0.2), 거절하면 고를 칸도 없는 화면에서 저장이 통째로 막힌다.
     * 어느 쪽이든 storedRate 가 오늘 나이의 선택지 안으로 당긴다.
     */
    const kept = sameGoal && prev.weeklyRateKg === input.weeklyRateKg;
    const picked = effectiveRate(input.weeklyRateKg, age, goal);
    const usable =
      kept || (picked !== null && paceChoices(age, goal, refKg).includes(picked));
    weeklyRateKg = storedRate(usable ? input.weeklyRateKg : null, age, goal);
  }

  let targetWeightKg: number | null = null;
  if (input.targetWeightKg === undefined) {
    targetWeightKg = sameGoal ? prev.targetWeightKg : null;
  } else {
    const checked = checkTargetWeight(
      goal,
      age,
      refKg,
      user.heightCm,
      input.targetWeightKg,
      sameGoal ? prev.targetWeightKg : null
    );
    if (!checked.ok) return checked;
    targetWeightKg = checked.kg;
  }

  /* 칼로리 계획이 바뀌면 조정은 0 으로, 계획은 오늘부터 — 목표 창의 미리보기와 같은 규칙 */
  const plan = planOnSave(
    prev && {
      goal: isGoalKey(prev.goal) ? prev.goal : 'maintain',
      activity: isActivityKey(prev.activity) ? prev.activity : 'mid',
      weeklyRateKg: prev.weeklyRateKg,
      kcalTarget: prev.kcalTarget,
      kcalAdjust: prev.kcalAdjust,
    },
    {
      goal: goalInput,
      activity: input.activity,
      weeklyRateKg,
      kcalTarget,
      clearAdjust: input.clearAdjust === true,
    },
    age
  );

  const data: ProfileData = {
    goal: goalInput,
    activity: input.activity,
    proteinPerKg: Math.round(input.proteinPerKg * 10) / 10,
    kcalTarget,
    /* 안 보낸 화면(undefined)은 저장된 값을 건드리지 않는다 */
    ...(proteinTargetG !== undefined ? { proteinTargetG } : {}),
    targetWeightKg,
    weeklyRateKg,
    kcalAdjust: plan.kcalAdjust,
    /*
     * 계획이 안 바뀐 저장(단백질만 고침)은 시작일을 그대로 둔다. 시작일이 없던 옛 줄은 여기서 '마지막으로
     * 저장한 날'로 굳힌다 — 이 저장이 updatedAt 을 오늘로 밀면 읽는 쪽(toProfile)이 오늘을 시작일로 읽는다.
     */
    ...(plan.restart
      ? { planSince: dbDate(today) }
      : prev && prev.planSince === null
        ? { planSince: dbDate(toDateKey(prev.updatedAt)) }
        : {}),
    /* 카드 원답 — 안 보낸 화면은 목표가 그대로면 두고, 바뀌었으면 비운다(카드와 접은 목표가 어긋나지 않게) */
    goalKind:
      goalKind !== undefined ? goalKind : sameGoal ? (prev.goalKind ?? null) : null,
    ...(macroPreset !== undefined ? { macroPreset } : {}),
    ...(fatTargetG !== undefined ? { fatTargetG } : {}),
    ...(input.onboarded && !prev?.onboardedAt ? { onboardedAt: now } : {}),
  };
  return { ok: true, data };
}
