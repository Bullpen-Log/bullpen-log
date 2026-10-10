import {
  BASELINE_FREQ_NAMES,
  BASELINE_INTENSITY_NAMES,
  BASELINE_VOLUME_NAMES,
  THROWING_HANDS,
} from '@/lib/baseline';
import type { FormLike } from '@/lib/nutrition/onboarding-answers';

/**
 * 투구 기록 첫 설정(/videos/setup)의 답 — 화면이 쥐는 상태이자 서버로 가는 폼 칸(순수, DB · React 없음).
 *
 * 던지는 손 · 평소 투구량 셋은 가입 문진에 있던 것(2026-10-09 가입에서 빠져 투구 기록 탭의 첫 설정이 됐다,
 * lib/feature-locks.ts). 읽히는 곳이 이 탭이라서다 — 던지는 손은 폼 분석 · 암케어, 투구량은 부하 지수의 시작 기준선.
 * 목표 구속은 2026-10-10 에 뺐다 — 사용자가 적는 값이 아니라 나중에 앱이 계산해 알려 줄 값이다.
 *
 * 답은 [이름, 값] 줄(toPitchFormFields)로 서버에 가고, 서버는 같은 이름으로 읽어(readPitchAnswers) 저장 규칙
 * (lib/baseline.ts validatePitchBaseline)에 넣는다. 영양 온보딩
 * (lib/nutrition/onboarding-answers.ts)과 같은 규약이라 서버 액션이 같은 FormLike 로 읽는다.
 */

export type PitchSetupAnswers = {
  /** 던지는 손(THROWING_HANDS). null 은 아직 안 고름 */
  throwingHand: string | null;
  /** 평소 투구량 셋(BASELINE_FREQ · VOLUME · INTENSITY 의 name). null 은 아직 안 고름 */
  baselineFreq: string | null;
  baselineVolume: string | null;
  baselineIntensity: string | null;
};

export const EMPTY_PITCH_ANSWERS: PitchSetupAnswers = {
  throwingHand: null,
  baselineFreq: null,
  baselineVolume: null,
  baselineIntensity: null,
};

/** 계정에 저장된 값 → 답 모양 — 다시 들어와 고칠 때 칸을 미리 채운다 */
export function pitchAnswersOf(user: {
  throwingHand: string | null;
  baselineFreq: string | null;
  baselineVolume: string | null;
  baselineIntensity: string | null;
}): PitchSetupAnswers {
  return {
    throwingHand: user.throwingHand,
    baselineFreq: user.baselineFreq,
    baselineVolume: user.baselineVolume,
    baselineIntensity: user.baselineIntensity,
  };
}

/* ─────────────────────────── 화면 차례 · 검사 ─────────────────────────── */

/**
 * 화면 차례 — 끼움(하루 투구 한도, 설정의 '왜') → 던지는 손 → 평소 투구량 → 요약.
 * 답에 따라 생기고 빠지는 화면이 없다. useStepWizard 의 steps 에 그대로 넣는다.
 */
export const PITCH_STEP_KEYS = [
  'capCard',
  'hand',
  'pitching',
  'summary',
] as const;
export type PitchStepKey = (typeof PITCH_STEP_KEYS)[number];

export function visiblePitchSteps(): PitchStepKey[] {
  return [...PITCH_STEP_KEYS];
}

/** 어느 칸이 막혔나 — 화면이 그 칸을 빨갛게 두르고 초점을 준다 */
export type PitchAnswerProblem = { error: string; field: string };

/**
 * 한 화면을 넘어가도 되는가 — 서버(validatePitchBaseline)와 같은 기준을 먼저 본다.
 */
export function checkPitchStep(
  key: PitchStepKey,
  a: PitchSetupAnswers
): PitchAnswerProblem | null {
  switch (key) {
    case 'hand':
      if (
        !a.throwingHand ||
        !(THROWING_HANDS as readonly string[]).includes(a.throwingHand)
      ) {
        return { error: '던지는 손을 골라 주세요.', field: 'throwingHand' };
      }
      return null;
    case 'pitching':
      if (!a.baselineFreq || !BASELINE_FREQ_NAMES.includes(a.baselineFreq)) {
        return { error: '던지는 횟수를 골라 주세요.', field: 'baselineFreq' };
      }
      if (!a.baselineVolume || !BASELINE_VOLUME_NAMES.includes(a.baselineVolume)) {
        return { error: '한 번에 던지는 양을 골라 주세요.', field: 'baselineVolume' };
      }
      if (
        !a.baselineIntensity ||
        !BASELINE_INTENSITY_NAMES.includes(a.baselineIntensity)
      ) {
        return { error: '평소 강도를 골라 주세요.', field: 'baselineIntensity' };
      }
      return null;
    case 'capCard':
    case 'summary':
      return null;
  }
}

/** 막힌 칸 → 그 칸이 있는 화면(서버가 막고 돌아올 때 되돌아갈 화면). 모르는 칸이면 null(지금 화면에 머문다) */
export function pitchStepOfField(field: string): PitchStepKey | null {
  switch (field) {
    case 'throwingHand':
      return 'hand';
    case 'baselineFreq':
    case 'baselineVolume':
    case 'baselineIntensity':
      return 'pitching';
    default:
      return null;
  }
}

/* ─────────────────────────── 폼 칸 ↔ 답 ─────────────────────────── */

/** 서버로 가는 [이름, 값] 줄 — 안 고른 것은 빈 글자(서버가 "골라 주세요"를 낸다) */
export function toPitchFormFields(a: PitchSetupAnswers): [string, string][] {
  return [
    ['throwingHand', a.throwingHand ?? ''],
    ['baselineFreq', a.baselineFreq ?? ''],
    ['baselineVolume', a.baselineVolume ?? ''],
    ['baselineIntensity', a.baselineIntensity ?? ''],
  ];
}

/**
 * 화면이 보낸 [이름, 값] 줄을 폼처럼 읽을 수 있게 — 영양 첫 설정(finishNutritionSetup)과 같은 읽기.
 * 줄 모양이 아닌 것(손으로 만든 요청)은 버린다. 줄 묶음 자체가 배열이 아니면 null.
 */
export function formOfFields(raw: unknown): FormLike | null {
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
 * 서버가 폼에서 답을 읽는다. 빈 글자는 '안 고름'(null) — 목록 밖의 값은 그대로 두어 뒤의 검사
 * (validatePitchBaseline)가 "선택해주세요"를 내게 둔다. 검사는 여기서 하지 않는다.
 */
export function readPitchAnswers(form: FormLike): PitchSetupAnswers {
  const str = (name: string) => String(form.get(name) ?? '').trim();
  const pick = (name: string) => str(name) || null;
  return {
    throwingHand: pick('throwingHand'),
    baselineFreq: pick('baselineFreq'),
    baselineVolume: pick('baselineVolume'),
    baselineIntensity: pick('baselineIntensity'),
  };
}
