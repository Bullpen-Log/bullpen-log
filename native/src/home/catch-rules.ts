/**
 * 공 잡기(내 라커) 판정 — 순수(자체 시험 native-home:test). 서버 시간 · 훈련 기록과 섞지 않는다.
 *
 * 시안: 공이 1.9초 동안 왼쪽에서 날아와 오른쪽 과녁(75%)에 닿을 때 '잡기'. 시안은 58% 지점부터 단추를 켜 그때 누르면 늘 잡혔다 —
 * 앱은 단추를 처음부터 켜 두고 과녁에 닿는 순간 앞뒤 창(±0.13 = 약 ±250ms)만 잡힘으로 본다. 한 번 던지면 한 번만 판정하고(빨리 눌러도 늦어도 끝),
 * 결과 뒤 0.35초는 다시 던지기를 받지 않아 연타로 점수가 오르지 않는다.
 * 움직임 줄이기면 공이 미끄러지지 않고 일곱 칸을 0.52초씩 건너뛴다 — 과녁 칸에 있을 때 누르면 잡힘(칸이 밝아지고 짧게 떨림 · 화면 읽기는 '지금').
 */
export const CATCH = {
  flightMs: 1900,
  /** 공이 지나는 길(무대 너비 비율) */
  from: 0.1,
  to: 0.9,
  target: 0.75,
  /** 과녁에 닿는 순간(진행 비율) 앞뒤로 잡히는 폭 */
  window: 0.13,
  cooldownMs: 350,
  steps: 7,
  stepMs: 520,
} as const;

/** 과녁에 닿는 진행 비율 — (0.75 − 0.1) / 0.8 = 0.8125 */
export const ARRIVE = (CATCH.target - CATCH.from) / (CATCH.to - CATCH.from);

export type CatchResult = 'catch' | 'early' | 'late';

/** 진행 p(0~1)에 눌렀을 때 */
export function judgeCatch(p: number): CatchResult {
  if (p < ARRIVE - CATCH.window) return 'early';
  if (p > ARRIVE + CATCH.window) return 'late';
  return 'catch';
}

/** 칸 i 의 무대 위 자리(0~1) */
export const stepX = (i: number) => CATCH.from + (i * (CATCH.to - CATCH.from)) / (CATCH.steps - 1);
/** 과녁에 가장 가까운 칸 */
export const TARGET_STEP = (() => {
  let best = 0;
  for (let i = 1; i < CATCH.steps; i++) if (Math.abs(stepX(i) - CATCH.target) < Math.abs(stepX(best) - CATCH.target)) best = i;
  return best;
})();

export function judgeStep(i: number): CatchResult {
  return i < TARGET_STEP ? 'early' : i > TARGET_STEP ? 'late' : 'catch';
}

export const RESULT_TEXT: Record<CatchResult, string> = {
  catch: '캐치!',
  early: '조금 빨랐어요',
  late: '놓쳤어요',
};

/** 한 판의 상태 — 던지기 → (한 번 판정) → 결과. 결과 뒤 cooldown 안의 던지기는 무시 */
export type CatchState = { phase: 'idle' | 'flying' | 'done'; throwId: number; result: CatchResult | null; doneAt: number };
export const START_STATE: CatchState = { phase: 'idle', throwId: 0, result: null, doneAt: 0 };

export function canThrow(s: CatchState, now: number) {
  return s.phase === 'idle' || (s.phase === 'done' && now - s.doneAt >= CATCH.cooldownMs);
}
export function startThrow(s: CatchState, now: number): CatchState {
  return canThrow(s, now) ? { phase: 'flying', throwId: s.throwId + 1, result: null, doneAt: 0 } : s;
}
/** 판정 — 지금 날고 있는 그 공(throwId)일 때 한 번만 */
export function settle(s: CatchState, throwId: number, result: CatchResult, now: number): CatchState {
  if (s.phase !== 'flying' || s.throwId !== throwId) return s;
  return { ...s, phase: 'done', result, doneAt: now };
}
/** 닫기 · 앱이 뒤로 감 — 날던 공은 점수 없이 거둔다 */
export function cancelThrow(s: CatchState): CatchState {
  return s.phase === 'flying' ? { ...s, phase: 'idle', result: null } : s;
}
