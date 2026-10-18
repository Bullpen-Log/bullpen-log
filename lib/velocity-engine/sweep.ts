/**
 * 조용할 때 훑기 · 세션 녹화의 순수 셈 — 앱 카메라 시계와 훑을 구간(dual-capture.ts · velocity-dual-recorder.ts 가 쓴다, 시험 engine2-test).
 *
 * 앱 카메라 시계(CACurrentMediaTime, 부팅 뒤 초)는 사이트가 모른다. 알림(throw)의 atSec 이 그 시계라 받을 때마다 performance.now() 와 짝지어
 * 두고, 알림 전에는 clip({ atSec: 1e9, beforeSec: 1e9, afterSec: 0 }) 한 번으로 쥐고 있는 조각 전부를 받아 eventSec(= at − 조각 시작)에서 시작
 * 시각을 역산한다(앱은 그 순간까지 기다리다 5초 상한에 돌려준다). Swift 에 now 를 넣으면 이 꾀는 필요 없다(2.7 계획).
 */

/** 앱이 잘라 준 클립의 카메라 시계 구간 — eventSec = max(0, at − 조각 시작) 이라 at 이 조각 안이면 시작이 바로 나온다 */
export function clipSpanOf(
  atSec: number,
  clip: { eventSec: number; durationSec: number }
): { start: number; end: number } {
  const start = atSec - clip.eventSec;
  return { start, end: start + clip.durationSec };
}

/** 카메라 시계 ↔ performance.now() 짝 */
export type ClockAnchor = { cam: number; perf: number };

export const cameraNowOf = (anchor: ClockAnchor, perfNow: number) =>
  anchor.cam + (perfNow - anchor.perf) / 1000;

/**
 * 훑기 간격(초) · 창 겹침 · 가장 긴 창 · 지금에서 띄우는 여유(마지막 조각이 아직 안 닫혔을 수 있다).
 * 간격 5 · 창 6 · 겹침 1 이면 빈틈 없이 이어진다. 훑기 한 번(거친 48장)이 데스크톱 크롬에서 2~4초라 폰도 그쯤 — 간격을 더 좁히면 폰이 쉴 틈이 없다.
 * ponytail: 느린 폰이 2.5초 넘기면 한 번 건너뛰어(dual-capture) 4초쯤 빈틈이 생긴다 — 앱이 쥔 8초가 상한이라 창을 더 못 늘린다. Swift 가 쥐는 길이를 늘리면 풀린다.
 */
export const SWEEP_EVERY_SEC = 5;
export const SWEEP_OVERLAP_SEC = 1;
export const SWEEP_MAX_SEC = 6;
export const SWEEP_LAG_SEC = 0.4;
/** 창이 이보다 짧으면 안 훑는다(공 하나가 다 안 든다) */
export const SWEEP_MIN_SEC = 2;

/**
 * 다음 훑을 창 — 지난 훑은 끝에서 겹침만큼 앞부터 지금 − 여유까지, 길면 뒤쪽 SWEEP_MAX_SEC 만. 너무 짧으면 null.
 * sweptUntil 이 없으면(처음) 지난 SWEEP_MAX_SEC.
 */
export function nextSweepWindow(
  sweptUntil: number | null,
  cameraNow: number
): { from: number; to: number } | null {
  const to = cameraNow - SWEEP_LAG_SEC;
  const from0 = sweptUntil == null ? to - SWEEP_MAX_SEC : sweptUntil - SWEEP_OVERLAP_SEC;
  const from = Math.max(from0, to - SWEEP_MAX_SEC);
  return to - from >= SWEEP_MIN_SEC ? { from, to } : null;
}

/** 찾은 공 시각이 이미 재는 중 · 최근 잰 창에 들었나 */
export function coveredBy(t: number, spans: { start: number; end: number }[]): boolean {
  return spans.some((s) => t >= s.start && t <= s.end);
}

/** 세션 녹화 조각 길이(초) — 14Mbps 면 10MB 남짓(저장소 한 파일 50MB 안) */
export const RECORD_SEGMENT_SEC = 6;
/** 올리기가 이만큼 밀리면 그 조각은 건너뛴다(메모리) */
export const RECORD_MAX_PENDING = 3;
