import { normalizeLevel, type CompetitionLevel } from '@/lib/baseline';
import { ageRule, paceChoices } from '@/lib/nutrition/age';
import {
  AVOIDS,
  isAvoidKey,
  isDietStyle,
  isMealPattern,
  isSeasonPhase,
  type AvoidKey,
  type DietPrefs,
  type DietStyle,
  type MealPattern,
  type SeasonPhase,
} from '@/lib/nutrition/diet-prefs';
import {
  FAT_G_MAX,
  FAT_G_MIN,
  PROTEIN_G_MAX,
  PROTEIN_G_MIN,
  isActivityKey,
  isGoalKind,
  isMacroPreset,
  type ActivityKey,
  type GoalKey,
  type GoalKind,
  type MacroPreset,
} from '@/lib/nutrition/meta';
import {
  defaultActivity,
  foldGoalKind,
  goalKindOf,
  goalKindsFor,
  presetProtein,
} from '@/lib/nutrition/onboarding';
import { PERIOD_WEEKS, neededRate, pickPace } from '@/lib/nutrition/period';
import type { ProfileInput } from '@/lib/nutrition/profile-save';
import {
  computeTargets,
  type Body,
  type ProfileSettings,
  type Targets,
} from '@/lib/nutrition/targets';
import {
  etaWeeks,
  forecastWeights,
  targetAllowed,
  targetRange,
  type TargetRange,
} from '@/lib/nutrition/weight-goal';
import { shiftDateKey } from '@/lib/pitch-stats';
import type { Sex } from '@/lib/profile';

/**
 * 온보딩의 영양 질문(목표 카드 → 못 먹는 것 → 추천 계획)의 답 — 화면이 쥐는 상태이자 서버로 가는 폼 칸(순수, DB · React 없음).
 *
 * 가입 마법사(app/login/auth-form.tsx) · 기존 사용자 온보딩(/nutrition/setup) · 목표 창이 같은 답 모양을 쓴다.
 * 답은 숨은 칸(toFormFields)으로 서버에 가고, 서버는 같은 이름으로 읽어(readNutritionAnswers) 저장 규칙
 * (lib/nutrition/profile-save.ts buildProfileData · lib/nutrition/diet-prefs.ts cleanDietPrefs)에 넣는다.
 *
 * 화면이 보이는 숫자(추천 계획 · 탄단지 g)는 preview() — 저장 뒤 영양 탭이 보일 숫자와 같은 함수(computeTargets)다.
 */

export type NutritionAnswers = {
  /** 목표 카드(다섯). null 은 아직 안 고름 */
  goalKind: GoalKind | null;
  /** 목표 체중(kg). null 은 안 정함 — targetSkipped 가 '나중에 정할게요'를 눌렀다는 뜻 */
  targetWeightKg: number | null;
  targetSkipped: boolean;
  /** 주당 속도(kg, 크기만). null 은 나이별 기본 속도 */
  weeklyRateKg: number | null;
  /** '언제까지'('YYYY-MM-DD'). null 은 기간 없음 */
  goalEndDate: string | null;
  /** 운동을 뺀 평소 움직임. null 은 아직 안 고름(소속으로 미리 고른 값을 보인다) */
  activity: ActivityKey | null;
  seasonPhase: SeasonPhase | null;
  macroPreset: MacroPreset | null;
  dietStyle: DietStyle | null;
  mealPattern: MealPattern | null;
  avoid: AvoidKey[];
  supplements: boolean;
  /** 추천 계획에서 직접 고친 값. null 은 계산 그대로 */
  kcalTarget: number | null;
  proteinTargetG: number | null;
  fatTargetG: number | null;
};

export const EMPTY_ANSWERS: NutritionAnswers = {
  goalKind: null,
  targetWeightKg: null,
  targetSkipped: false,
  weeklyRateKg: null,
  goalEndDate: null,
  activity: null,
  seasonPhase: null,
  macroPreset: null,
  dietStyle: null,
  mealPattern: null,
  avoid: [],
  supplements: true,
  kcalTarget: null,
  proteinTargetG: null,
  fatTargetG: null,
};

/** 답을 계산에 넣을 때 필요한 몸 — 가입은 앞 질문의 답, 기존 사용자는 계정 */
export type OnboardingBody = {
  /** 만 나이. 모르면 null(생년월일을 안 적은 옛 계정) */
  age: number | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  /** 소속 — 평소 움직임을 미리 고르는 데만 쓴다 */
  level: CompetitionLevel | null;
};

/* ─────────────────────────── 답 → 계산 ─────────────────────────── */

/** 접은 목표 — 카드를 안 골랐으면 유지로 본다(미리보기용) */
export function goalOf(a: NutritionAnswers, age: number | null): GoalKey {
  return a.goalKind ? foldGoalKind(a.goalKind, age).goal : 'maintain';
}

/** 계산에 쓸 체중 1kg 당 단백질 — 카드가 높인 값에 '단백질 넉넉히' 프리셋을 얹는다. 둘 다 없으면 나이 기본 */
export function proteinPerKgOf(a: NutritionAnswers, age: number | null): number {
  const fold = a.goalKind ? foldGoalKind(a.goalKind, age).proteinPerKg : null;
  return presetProtein(a.macroPreset, fold, age) ?? ageRule(age).proteinDefault;
}

/** 보이는 평소 움직임 — 고른 것, 없으면 소속으로 미리 고른 것 */
export function activityOf(
  a: NutritionAnswers,
  level: CompetitionLevel | null
): ActivityKey {
  return a.activity ?? defaultActivity(level);
}

/** 답 → 목표 계산이 읽는 설정(lib/nutrition/targets.ts) */
export function draftOf(a: NutritionAnswers, body: OnboardingBody): ProfileSettings {
  const goal = goalOf(a, body.age);
  return {
    goal,
    activity: activityOf(a, body.level),
    proteinPerKg: proteinPerKgOf(a, body.age),
    kcalTarget: a.kcalTarget,
    proteinTargetG: a.proteinTargetG,
    targetWeightKg: targetAllowed(goal, body.age) ? a.targetWeightKg : null,
    weeklyRateKg: a.weeklyRateKg,
    kcalAdjust: null,
    planSince: null,
    goalKind: a.goalKind,
    macroPreset: a.macroPreset,
    fatTargetG: a.fatTargetG,
  };
}

export type Preview = {
  age: number | null;
  goal: GoalKey;
  draft: ProfileSettings;
  /** 운동 없는 날의 목표 — 직접 고친 값 포함 */
  targets: Targets;
  /** 직접 고친 값 없이 계산만 — '계산으로는 N' */
  auto: Targets;
  /** 목표 체중을 정할 수 있는 나이 · 목표인가 */
  targetAllowed: boolean;
  range: TargetRange;
  /** 고를 수 있는 주당 속도(kg) — 비면 속도 화면이 없다 */
  paces: number[];
  /** 지금 → 목표까지 남은 kg(크기). 목표 체중이 없으면 null */
  remainingKg: number | null;
  etaWeeks: number | null;
  forecast: { week: number; kg: number }[];
};

export function preview(a: NutritionAnswers, body: OnboardingBody): Preview {
  return previewOfProfile(draftOf(a, body), body);
}

/**
 * 저장된 목표 그대로(단백질 g/kg 도 저장값)로 셈한 미리보기 — 운동 없는 날. 영양 탭 '내 계획' 카드가 쓴다
 * (답에서 접은 값이 아니라 목표 창에서 고른 값을 그대로 보여야 한다).
 */
export function previewOfProfile(
  draft: ProfileSettings,
  body: OnboardingBody
): Preview {
  const calcBody: Body = {
    weightKg: body.weightKg,
    heightCm: body.heightCm,
    age: body.age,
    sex: body.sex,
  };
  const targets = computeTargets(draft, calcBody, 0);
  const auto = computeTargets(
    { ...draft, kcalTarget: null, proteinTargetG: null, fatTargetG: null },
    calcBody,
    0
  );
  const allowed = targetAllowed(draft.goal, body.age);
  const range = targetRange(draft.goal, body.age, body.weightKg, body.heightCm);
  const paces = paceChoices(body.age, draft.goal, body.weightKg);
  const targetKg = allowed ? draft.targetWeightKg : null;
  const remainingKg =
    targetKg !== null && body.weightKg !== null
      ? Math.max(0, Math.round(Math.abs(targetKg - body.weightKg) * 10)) / 10
      : null;
  const pace = targets.paceKg ?? 0;
  const eta = remainingKg !== null && pace > 0 ? etaWeeks(remainingKg, pace) : null;
  const forecast =
    targetKg !== null && body.weightKg !== null && pace > 0
      ? forecastWeights(body.weightKg, targetKg, pace)
      : [];
  return {
    age: body.age,
    goal: draft.goal,
    draft,
    targets,
    auto,
    targetAllowed: allowed,
    range,
    paces,
    remainingKg,
    etaWeeks: eta,
    forecast,
  };
}

/** 저장된 목표 · 취향 → 답 모양 — 영양 탭 '내 계획' 카드와 목표 창이 온보딩 부품(PlanStats 등)을 같이 쓰게 */
export function answersOfProfile(
  profile: ProfileSettings,
  prefs: DietPrefs,
  age: number | null
): NutritionAnswers {
  return {
    goalKind: goalKindOf(profile.goal, profile.goalKind, age),
    targetWeightKg: profile.targetWeightKg,
    targetSkipped: profile.targetWeightKg === null,
    weeklyRateKg: profile.weeklyRateKg,
    goalEndDate: prefs.goalEndDate,
    activity: profile.activity,
    seasonPhase: prefs.seasonPhase,
    macroPreset: profile.macroPreset,
    dietStyle: prefs.dietStyle,
    mealPattern: prefs.mealPattern,
    avoid: prefs.avoid,
    supplements: prefs.supplements,
    kcalTarget: profile.kcalTarget,
    proteinTargetG: profile.proteinTargetG,
    fatTargetG: profile.fatTargetG,
  };
}

/** '언제까지' 칩 — N주 뒤의 날짜('YYYY-MM-DD') */
export function periodDate(todayKey: string, weeks: number) {
  return shiftDateKey(todayKey, weeks * 7);
}

/** 날짜를 고르면 그 안에 닿는 속도 — 고를 수 없는 속도면 가장 빠른 것(lib/nutrition/period.ts pickPace) */
export function paceForDate(
  p: Preview,
  todayKey: string,
  endKey: string
): number | null {
  const needed = neededRate(p.remainingKg, todayKey, endKey);
  if (needed === null) return null;
  return pickPace(p.paces, needed);
}

export { PERIOD_WEEKS };

/* ─────────────────────────── 화면 차례 · 검사 ─────────────────────────── */

export const NUTRITION_STEP_KEYS = [
  'goal',
  'target',
  'pace',
  'activity',
  'season',
  'macroPreset',
  'diet',
  'avoid',
  'building',
  'plan',
  'macroEdit',
] as const;
export type NutritionStepKey = (typeof NUTRITION_STEP_KEYS)[number];

/**
 * 지금 답으로 보일 영양 화면 — 목표 체중은 정할 수 있는 나이 · 목표일 때만, 속도는 목표 체중을 적었을 때만.
 * 몸(키 · 체중)을 모르면 목표 체중 화면도 없다(범위를 셈할 수 없다).
 */
export function visibleNutritionSteps(
  a: NutritionAnswers,
  body: OnboardingBody
): NutritionStepKey[] {
  const p = preview(a, body);
  return NUTRITION_STEP_KEYS.filter((key) => {
    if (key === 'target') return p.targetAllowed && p.range.ok;
    if (key === 'pace') return p.targetAllowed && a.targetWeightKg !== null;
    return true;
  });
}

/** 어느 칸이 막혔나 — 화면이 그 칸을 빨갛게 두르고 초점을 준다 */
export type AnswerProblem = { error: string; field: string };

/** 한 화면을 넘어가도 되는가 — 서버(buildProfileData · cleanDietPrefs)와 같은 기준을 먼저 본다 */
export function checkNutritionStep(
  key: NutritionStepKey,
  a: NutritionAnswers,
  body: OnboardingBody
): AnswerProblem | null {
  switch (key) {
    case 'goal':
      if (!a.goalKind || !goalKindsFor(body.age).includes(a.goalKind)) {
        return { error: '목표를 하나 골라 주세요.', field: 'goalKind' };
      }
      return null;
    case 'target': {
      if (a.targetWeightKg === null) {
        return a.targetSkipped
          ? null
          : {
              error: '목표 체중을 적거나 "나중에 정할게요"를 눌러 주세요.',
              field: 'targetWeightKg',
            };
      }
      const p = preview(a, body);
      if (!p.range.ok) return null;
      const kg = Math.round(a.targetWeightKg * 10) / 10;
      if (kg < p.range.min || kg > p.range.max) {
        return {
          error: `목표 체중은 ${p.range.min}~${p.range.max}kg 사이로 적어 주세요.`,
          field: 'targetWeightKg',
        };
      }
      return null;
    }
    case 'pace':
      return null;
    case 'activity':
      /* 미리 고른 값이 늘 있다 — 틀린 값만 막는다 */
      if (a.activity !== null && !isActivityKey(a.activity)) {
        return { error: '평소 움직임을 다시 골라 주세요.', field: 'activity' };
      }
      return null;
    case 'season':
      if (!a.seasonPhase)
        return { error: '시즌을 하나 골라 주세요.', field: 'seasonPhase' };
      return null;
    case 'macroPreset':
      if (!a.macroPreset) {
        return { error: '탄단지 나누기를 하나 골라 주세요.', field: 'macroPreset' };
      }
      return null;
    case 'diet':
      if (!a.dietStyle)
        return { error: '주로 먹는 음식을 골라 주세요.', field: 'dietStyle' };
      if (!a.mealPattern)
        return { error: '끼니 구성을 골라 주세요.', field: 'mealPattern' };
      return null;
    case 'avoid':
    case 'building':
      return null;
    case 'plan':
      return checkKcal(a);
    case 'macroEdit': {
      const kcal = checkKcal(a);
      if (kcal) return kcal;
      if (
        a.proteinTargetG !== null &&
        (a.proteinTargetG < PROTEIN_G_MIN || a.proteinTargetG > PROTEIN_G_MAX)
      ) {
        return {
          error: `하루 단백질은 ${PROTEIN_G_MIN}~${PROTEIN_G_MAX}g 사이로 적어 주세요.`,
          field: 'proteinTargetG',
        };
      }
      if (
        a.fatTargetG !== null &&
        (a.fatTargetG < FAT_G_MIN || a.fatTargetG > FAT_G_MAX)
      ) {
        return {
          error: `하루 지방은 ${FAT_G_MIN}~${FAT_G_MAX}g 사이로 적어 주세요.`,
          field: 'fatTargetG',
        };
      }
      return null;
    }
  }
}

function checkKcal(a: NutritionAnswers): AnswerProblem | null {
  if (a.kcalTarget !== null && (a.kcalTarget < 1000 || a.kcalTarget > 6000)) {
    return {
      error: '하루 칼로리는 1,000~6,000 사이로 적어 주세요.',
      field: 'kcalTarget',
    };
  }
  return null;
}

/** 막힌 칸 → 그 칸이 있는 영양 화면(서버가 막고 돌아올 때 되돌아갈 화면) */
export function nutritionStepOfField(field: string): NutritionStepKey | null {
  switch (field) {
    case 'goalKind':
      return 'goal';
    case 'targetWeightKg':
      return 'target';
    case 'weeklyRateKg':
    case 'goalEndDate':
      return 'pace';
    case 'activity':
      return 'activity';
    case 'seasonPhase':
      return 'season';
    case 'macroPreset':
      return 'macroPreset';
    case 'dietStyle':
    case 'mealPattern':
      return 'diet';
    case 'avoid':
    case 'supplements':
      return 'avoid';
    case 'kcalTarget':
      return 'plan';
    case 'proteinTargetG':
    case 'fatTargetG':
      return 'macroEdit';
    default:
      return null;
  }
}

/* ─────────────────────────── 폼 칸 ↔ 답 ─────────────────────────── */

/** 폼에 이 칸이 있으면 온보딩 답이 실려 온 것이다 — 없는 옛 화면은 예전처럼 영양 목표 없이 가입한다 */
export const ONBOARDING_MARK = 'nutritionOnboarding';

/** 숨은 칸 — [이름, 값] 줄. avoid 는 같은 이름이 여러 줄 */
export function toFormFields(a: NutritionAnswers): [string, string][] {
  const num = (n: number | null) => (n === null ? '' : String(n));
  const rows: [string, string][] = [
    [ONBOARDING_MARK, '1'],
    ['goalKind', a.goalKind ?? ''],
    ['targetWeightKg', num(a.targetWeightKg)],
    ['weeklyRateKg', num(a.weeklyRateKg)],
    ['goalEndDate', a.goalEndDate ?? ''],
    ['activity', a.activity ?? ''],
    ['seasonPhase', a.seasonPhase ?? ''],
    ['macroPreset', a.macroPreset ?? ''],
    ['dietStyle', a.dietStyle ?? ''],
    ['mealPattern', a.mealPattern ?? ''],
    ['supplements', a.supplements ? '1' : '0'],
    ['kcalTarget', num(a.kcalTarget)],
    ['proteinTargetG', num(a.proteinTargetG)],
    ['fatTargetG', num(a.fatTargetG)],
  ];
  for (const k of a.avoid) rows.push(['avoid', k]);
  return rows;
}

/** FormData 같은 것 — 서버가 받은 폼 */
export type FormLike = {
  get(name: string): unknown;
  getAll(name: string): unknown[];
  has(name: string): boolean;
};

const numOrNull = (v: unknown): number | null | undefined => {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * 서버가 폼에서 답을 읽는다. 온보딩 표시가 없으면 null(옛 화면). 숫자 칸에 숫자가 아닌 것이 오면 오류 글.
 * 목록 밖의 값은 null 로 읽어 뒤의 검사(buildProfileData · cleanDietPrefs)가 "다시 골라 주세요"를 내게 둔다.
 */
export function readNutritionAnswers(form: FormLike): NutritionAnswers | string | null {
  if (!form.has(ONBOARDING_MARK)) return null;
  const str = (name: string) => String(form.get(name) ?? '').trim();
  const nums = {
    targetWeightKg: numOrNull(form.get('targetWeightKg')),
    weeklyRateKg: numOrNull(form.get('weeklyRateKg')),
    kcalTarget: numOrNull(form.get('kcalTarget')),
    proteinTargetG: numOrNull(form.get('proteinTargetG')),
    fatTargetG: numOrNull(form.get('fatTargetG')),
  };
  if (nums.targetWeightKg === undefined) return '목표 체중을 숫자로 적어 주세요.';
  if (nums.weeklyRateKg === undefined) return '속도를 다시 골라 주세요.';
  if (nums.kcalTarget === undefined) return '하루 칼로리를 숫자로 적어 주세요.';
  if (nums.proteinTargetG === undefined) return '하루 단백질을 숫자로 적어 주세요.';
  if (nums.fatTargetG === undefined) return '하루 지방을 숫자로 적어 주세요.';
  const goalKind = str('goalKind');
  const activity = str('activity');
  const season = str('seasonPhase');
  const preset = str('macroPreset');
  const diet = str('dietStyle');
  const meal = str('mealPattern');
  const goalEndDate = str('goalEndDate');
  const avoid = form
    .getAll('avoid')
    .map((v) => String(v))
    .filter(isAvoidKey);
  return {
    goalKind: isGoalKind(goalKind) ? goalKind : null,
    targetWeightKg: nums.targetWeightKg,
    targetSkipped: nums.targetWeightKg === null,
    weeklyRateKg: nums.weeklyRateKg,
    goalEndDate: /^\d{4}-\d{2}-\d{2}$/.test(goalEndDate) ? goalEndDate : null,
    activity: isActivityKey(activity) ? activity : null,
    seasonPhase: isSeasonPhase(season) ? season : null,
    macroPreset: isMacroPreset(preset) ? preset : null,
    dietStyle: isDietStyle(diet) ? diet : null,
    mealPattern: isMealPattern(meal) ? meal : null,
    avoid: [...new Set(avoid)].slice(0, AVOIDS.length),
    supplements: str('supplements') !== '0',
    kcalTarget: nums.kcalTarget,
    proteinTargetG: nums.proteinTargetG,
    fatTargetG: nums.fatTargetG,
  };
}

/** 답 → 저장 규칙에 넣을 값(lib/nutrition/profile-save.ts). 서버가 부른다 */
export function toProfileInput(
  a: NutritionAnswers,
  body: OnboardingBody
): ProfileInput {
  return {
    goal: goalOf(a, body.age),
    goalKind: a.goalKind,
    activity: activityOf(a, body.level),
    proteinPerKg: proteinPerKgOf(a, body.age),
    kcalTarget: a.kcalTarget,
    proteinTargetG: a.proteinTargetG,
    fatTargetG: a.fatTargetG,
    targetWeightKg: a.targetWeightKg,
    weeklyRateKg: a.weeklyRateKg,
    macroPreset: a.macroPreset,
    onboarded: true,
  };
}

/**
 * 답 → 식단 취향 검사에 넣을 값(lib/nutrition/diet-prefs.ts cleanDietPrefs). 안 고른 스타일 · 끼니는 기본값.
 * 보충식품은 성인만 — 성장기 · 어린이 · 나이를 모르는 계정은 늘 끔(목표 창의 '성장기 잠김'과 같은 규칙).
 */
export function toDietPrefsRaw(a: NutritionAnswers, body: OnboardingBody) {
  const adult = body.age !== null && ageRule(body.age).band === 'adult';
  return {
    goalEndDate: a.goalEndDate,
    seasonPhase: a.seasonPhase,
    dietStyle: a.dietStyle ?? 'mixed',
    mealPattern: a.mealPattern ?? '3+1',
    avoid: a.avoid,
    supplements: adult ? a.supplements : false,
  };
}

/** 저장 규칙의 오류 글 → 그 칸(화면이 그 화면으로 되돌아간다) */
export function fieldOfNutritionError(message: string): string {
  if (message.includes('목표 체중')) return 'targetWeightKg';
  if (message.includes('탄단지')) return 'macroPreset';
  if (message.includes('평소 움직임')) return 'activity';
  if (message.includes('칼로리')) return 'kcalTarget';
  if (message.includes('단백질')) return 'proteinTargetG';
  if (message.includes('지방')) return 'fatTargetG';
  if (message.includes('시즌')) return 'seasonPhase';
  if (message.includes('스타일')) return 'dietStyle';
  if (message.includes('끼니')) return 'mealPattern';
  if (message.includes('못 먹는')) return 'avoid';
  if (message.includes('날짜')) return 'goalEndDate';
  if (message.includes('속도')) return 'weeklyRateKg';
  return 'goalKind';
}

/** 소속 글자 → 소속(옛 선택지도 받는다) — 서버가 폼의 소속을 몸에 넣을 때 */
export function levelOf(raw: string | null | undefined): CompetitionLevel | null {
  return normalizeLevel(raw ?? null);
}
