import { BASELINE_WORKOUT_FREQ_NAMES, THROWING_HANDS } from '@/lib/baseline';
import { pickOne } from '@/lib/exercise-meta';
import { profileBlock } from '@/lib/program/program';
import { TRAINING_LEVEL_NAMES } from '@/lib/report/personalize';
import {
  DEFAULT_WORKOUT_MINUTES,
  WORKOUT_MINUTES_CHOICES,
  nearestMinutesChoice,
} from '@/lib/report/theme';

/**
 * 트레이닝 첫 설정(/training/setup)의 답 — 순수 함수만. 화면(training-setup-wizard.tsx)과 서버
 * (app/actions/training-setup.ts finishTrainingSetup)가 같은 차례 · 같은 검사를 본다.
 *
 * 처음 가입한 사람은 트레이닝 탭이 잠겨 있다(lib/feature-locks.ts, 2026-10-09). 가입에서 받던 웨이트 횟수 · 경력이 여기로
 * 왔고, 운동을 고르는 데 쓰는 하루 운동 시간도 여기서 받는다 — 읽히는 곳이 이 탭이라서. 가진 장비는 2026-10-20 뺐다(김민: 장비는 프로그램
 * 시작 · 오늘 운동 만들기 때만 고른다 — app/actions/program.ts startProgram · 오늘 운동 만들기의 '오늘 쓸 수 있는 장비').
 *
 *   경력            경력에 비해 이른 운동을 뺀다(lib/report/personalize.ts) · 근력 · 파워 프로그램 자격(lib/program)
 *   웨이트 횟수      운동 부하 지수의 시작 기준선(lib/baseline.ts estimateTrainingDailyLoad)
 *   하루 운동 시간   일정을 그 시간에 맞춰 짠다(lib/report/theme.ts)
 *   던지는 손        암케어 · 메카닉이 어느 팔을 볼지 — 투구 설정 전이라 계정에 없을 때만 묻는다
 *
 * 답은 영양 온보딩(lib/nutrition/onboarding-answers.ts)과 같은 길로 보낸다 — 화면이 상태로 쥐고 [이름, 값] 줄로 한 번에.
 */

export type TrainingSetupAnswers = {
  trainingLevel: string | null;
  baselineWorkoutFreq: string | null;
  /** 하루 운동 시간(분) — 칩의 값이라 글자. WORKOUT_MINUTES_CHOICES 안 */
  dailyWorkoutMinutes: string;
  /** 던지는 손 — 묻는 화면이 있을 때만 검사한다(askHand) */
  throwingHand: string | null;
};

export const EMPTY_TRAINING_ANSWERS: TrainingSetupAnswers = {
  trainingLevel: null,
  baselineWorkoutFreq: null,
  dailyWorkoutMinutes: String(DEFAULT_WORKOUT_MINUTES),
  throwingHand: null,
};

export type TrainingStepKey =
  'level' | 'workoutFreq' | 'minutes' | 'hand' | 'burnCard' | 'summary';

export type TrainingSetupOptions = {
  /** 던지는 손을 여기서도 묻나 — 계정에 없을 때(투구 기록 설정 전)만 */
  askHand: boolean;
  /** 끼움 '운동 소모'를 보이나 — 체중을 알 때만(BurnInsert 가 체중으로 셈한다) */
  hasWeight: boolean;
};

/** 화면 차례 — 답에 따라 바뀌는 화면은 없고, 계정 상태(askHand · hasWeight)로만 생기고 빠진다 */
export function visibleTrainingSteps({ askHand }: TrainingSetupOptions): TrainingStepKey[] {
  return [
    'level',
    'workoutFreq',
    'minutes',
    ...(askHand ? (['hand'] as const) : []),
    /* '운동을 적으면 영양이 따라와요'(burnCard)는 2026-10-12 사용자 요청으로 뺐다 — hasWeight 는 옛 호출 때문에 받기만 한다 */
    'summary',
  ];
}

export type TrainingProblem = { error: string; field: string };

/** 이 화면을 넘어가도 되는가 — 막히면 까닭과 칸 이름. 서버도 같은 함수로 본다 */
export function checkTrainingStep(
  key: TrainingStepKey,
  a: TrainingSetupAnswers
): TrainingProblem | null {
  switch (key) {
    case 'level':
      if (!a.trainingLevel || !TRAINING_LEVEL_NAMES.includes(a.trainingLevel)) {
        return { error: '웨이트 경력을 골라 주세요.', field: 'trainingLevel' };
      }
      return null;
    case 'workoutFreq':
      if (
        !a.baselineWorkoutFreq ||
        !BASELINE_WORKOUT_FREQ_NAMES.includes(a.baselineWorkoutFreq)
      ) {
        return {
          error: '일주일에 몇 번 하는지 골라 주세요.',
          field: 'baselineWorkoutFreq',
        };
      }
      return null;
    case 'minutes':
      if (
        !(WORKOUT_MINUTES_CHOICES as readonly number[]).includes(
          Number(a.dailyWorkoutMinutes)
        )
      ) {
        return { error: '하루 운동 시간을 골라 주세요.', field: 'dailyWorkoutMinutes' };
      }
      return null;
    case 'hand':
      if (
        !a.throwingHand ||
        !(THROWING_HANDS as readonly string[]).includes(a.throwingHand)
      ) {
        return { error: '던지는 손을 골라 주세요.', field: 'throwingHand' };
      }
      return null;
    case 'burnCard':
    case 'summary':
      return null;
  }
}

/** 보이는 화면을 처음부터 다 본다 — 저장 직전(화면)과 서버가 쓴다. 끼움 화면은 검사가 없어 hasWeight 는 상관없다 */
export function checkTrainingAnswers(
  a: TrainingSetupAnswers,
  { askHand }: { askHand: boolean }
): TrainingProblem | null {
  for (const key of visibleTrainingSteps({ askHand, hasWeight: false })) {
    const bad = checkTrainingStep(key, a);
    if (bad) return bad;
  }
  return null;
}

/** 칸 이름이 있는 화면 — 모르면 null(지금 화면에 머문다) */
export function trainingStepOfField(field: string): TrainingStepKey | null {
  switch (field) {
    case 'trainingLevel':
      return 'level';
    case 'baselineWorkoutFreq':
      return 'workoutFreq';
    case 'dailyWorkoutMinutes':
      return 'minutes';
    case 'throwingHand':
      return 'hand';
    default:
      return null;
  }
}

/**
 * 계정에 있는 값으로 답을 미리 채운다 — 설정을 마치고 다시 온 사람(트레이닝 설정에서 고친 값)이 처음부터 다시 고르지 않게.
 * 처음 온 사람은 모두 비어 있어 EMPTY 와 같다. 저장된 시간이 지금 선택지 밖이면(옛 15 · 30 · 120분) 가장 가까운 값으로.
 */
export function answersOfUser(user: {
  trainingLevel: string | null;
  baselineWorkoutFreq: string | null;
  dailyWorkoutMinutes: number | null;
  throwingHand: string | null;
}): TrainingSetupAnswers {
  return {
    trainingLevel: pickOne(user.trainingLevel, TRAINING_LEVEL_NAMES),
    baselineWorkoutFreq: pickOne(user.baselineWorkoutFreq, BASELINE_WORKOUT_FREQ_NAMES),
    dailyWorkoutMinutes: String(
      nearestMinutesChoice(user.dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES)
    ),
    throwingHand: pickOne(user.throwingHand, THROWING_HANDS),
  };
}

/* ─────────────────────────── 화면 ↔ 서버 ─────────────────────────── */

/** 답을 [이름, 값] 줄로 — 폼처럼 읽히게. 던지는 손은 골랐을 때만 */
export function toTrainingFormFields(a: TrainingSetupAnswers): [string, string][] {
  const rows: [string, string][] = [
    ['trainingLevel', a.trainingLevel ?? ''],
    ['baselineWorkoutFreq', a.baselineWorkoutFreq ?? ''],
    ['dailyWorkoutMinutes', a.dailyWorkoutMinutes],
  ];
  if (a.throwingHand) rows.push(['throwingHand', a.throwingHand]);
  return rows;
}

/** FormData 같은 것 — 서버가 받은 폼(lib/nutrition/onboarding-answers.ts 의 FormLike 와 같은 모양) */
export type FormLike = {
  get(name: string): unknown;
  getAll(name: string): unknown[];
  has(name: string): boolean;
};

/** 화면이 보낸 줄을 폼처럼 읽는다. 모양이 아니면(손으로 만든 요청) null */
export function formOfRows(raw: unknown): FormLike | null {
  if (!Array.isArray(raw)) return null;
  const rows = raw.filter(
    (r): r is [string, string] =>
      Array.isArray(r) &&
      r.length === 2 &&
      typeof r[0] === 'string' &&
      typeof r[1] === 'string'
  );
  return {
    get: (name) => rows.find((r) => r[0] === name)?.[1] ?? null,
    getAll: (name) => rows.filter((r) => r[0] === name).map((r) => r[1]),
    has: (name) => rows.some((r) => r[0] === name),
  };
}

/**
 * 서버가 폼에서 답을 읽는다. 목록 밖의 값은 null 로 읽어 checkTrainingAnswers 가 '골라 주세요'를 내게 둔다.
 */
export function readTrainingAnswers(form: FormLike): TrainingSetupAnswers {
  const str = (name: string) => String(form.get(name) ?? '').trim();
  return {
    trainingLevel: pickOne(str('trainingLevel'), TRAINING_LEVEL_NAMES),
    baselineWorkoutFreq: pickOne(
      str('baselineWorkoutFreq'),
      BASELINE_WORKOUT_FREQ_NAMES
    ),
    dailyWorkoutMinutes: str('dailyWorkoutMinutes'),
    throwingHand: pickOne(str('throwingHand'), THROWING_HANDS),
  };
}

/* ─────────────────────────── 요약 화면 ─────────────────────────── */

/** 요약의 줄 — 묻지 않은 것(던지는 손)은 빼고 */
export function trainingAnswerLines(
  a: TrainingSetupAnswers,
  { askHand }: { askHand: boolean }
): { label: string; value: string }[] {
  /* 빈 값은 화면 검사 뒤라 보통 안 보이지만, 보이면 투구 마법사와 같은 말 */
  const lines = [
    { label: '웨이트 경력', value: a.trainingLevel ?? '아직 안 골랐어요' },
    { label: '일주일에', value: a.baselineWorkoutFreq ?? '아직 안 골랐어요' },
    { label: '하루 운동 시간', value: `${a.dailyWorkoutMinutes}분` },
  ];
  if (askHand)
    lines.push({ label: '던지는 손', value: a.throwingHand ?? '아직 안 골랐어요' });
  return lines;
}

/**
 * 근력 · 파워 프로그램을 시작할 수 있나 — 요약 화면의 안내 한두 줄. 시작 자격(lib/program/program.ts checkEligibility)과
 * 같은 함수에서 글을 가져온다: 나이 · 경력(profileBlock). 장비는 시작할 때 고른다(2026-10-20 — 여기서 묻지 않아 막힘을 미리 말할 수 없다).
 * basicsDone — 기본기 4주를 마친 적이 있나(lib/program/load.ts hasFinishedBasics). 입문이라도 마쳤으면 성인 프로그램이
 * 열리므로(training/page.tsx 와 같은 가름) 다시 온 사람에게 '아직이에요'를 잘못 내지 않게 받는다.
 */
export function programNote(
  a: TrainingSetupAnswers,
  age: number | null,
  basicsDone: boolean
): string {
  const block =
    profileBlock({
      audience: 'adult',
      age,
      trainingLevel: a.trainingLevel,
      basicsDone,
    });
  if (block)
    return `근력 · 파워 프로그램은 아직이에요. ${block.reason} ${block.action}`;
  return '근력 · 파워 프로그램도 바로 시작할 수 있어요. 트레이닝 탭에서 골라요.';
}
