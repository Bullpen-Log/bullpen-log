/**
 * 짧게 하는 날의 시간 — 등판 다음 날 · 구원 '어제 실전 강도로 20구 넘게'(날 종류의 shorten, lib/engine/microcycle.ts). 일정 만들기
 * (lib/report/daily-plan.ts)와 코치 칸 글(lib/coach/answers.ts slotLine — 앱 묶음에도 들어간다)이 같은 셈을 쓰게 따로 둔다. 순수 · 의존 없음.
 */
export const SHORTEN_SHARE = 0.75;
export const SHORTEN_MIN_MINUTES = 30;

/** 5분 단위로 내리고 바닥 30분(이미 그보다 짧으면 그대로). 회복 날에는 부르지 않는다(effectiveMinutes 가 줄인다) */
export function shortenedMinutes(minutes: number): number {
  const cut = Math.floor((minutes * SHORTEN_SHARE) / 5) * 5;
  return Math.min(minutes, Math.max(SHORTEN_MIN_MINUTES, cut));
}
