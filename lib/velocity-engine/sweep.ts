/**
 * 조용할 때 훑기 · 세션 녹화의 순수 셈 — 앱 카메라 시계와 훑을 구간(dual-capture.ts · velocity-dual-recorder.ts 가 쓴다, 시험 engine2-test).
 *
 * 앱 카메라 시계(CACurrentMediaTime, 부팅 뒤 초)는 사이트가 모른다. 알림(throw)의 atSec 이 그 시계라 받을 때마다 performance.now() 와 짝지어
 * 두고, 알림 전에는 clip({ atSec: 1e9, beforeSec: 1e9, afterSec: 0 }) 한 번으로 쥐고 있는 조각 전부를 받아 eventSec(= at − 조각 시작)에서 시작
 * 시각을 역산한다(앱은 그 순간까지 기다리다 5초 상한에 돌려준다). Swift 에 now 를 넣으면 이 꾀는 필요 없다(2.7 계획).
 */

/**
 * 앱이 잘라 준 클립의 카메라 시계 구간 — eventSec = max(0, at − 조각 시작) 이라 at 이 조각 안이면 시작이 바로 나온다.
 * at 이 앱이 쥔 영상보다 앞이면 eventSec 이 0 으로 잘려 시작을 모른다 — 청한 끝(toSec)을 알면 끝에서 길이만큼 되짚어 어림한다
 * (2026-10-19: 세션 녹화가 뒤처진 뒤 시작을 at 으로 잘못 잡아 다음 조각이 같은 구간을 다시 청했다).
 */
export function clipSpanOf(
  atSec: number,
  clip: { eventSec: number; durationSec: number },
  toSec?: number
): { start: number; end: number } {
  const start =
    clip.eventSec <= 0 && toSec != null
      ? Math.max(atSec, toSec - clip.durationSec)
      : atSec - clip.eventSec;
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

/**
 * 세션 녹화 조각 길이(초) — 앱 모듈이 한 번에 잘라 주는 상한(DualCameraModule.swift clip 의 afterSec ≤ 4)과 같게. 6 이었을 때는 청한 6초 중
 * 4초만 와서 매번 1.6초씩 뒤처지다 셋째 조각부터 앱이 쥔 8초 밖으로 밀려 '그 순간의 영상이 없어요' → 녹화가 멎었다(2026-10-19 금윤호 녹화 다섯,
 * 189초 중 7초). 14Mbps 면 7MB 남짓.
 */
export const RECORD_SEGMENT_SEC = 4;
/** 앱 모듈이 한 번에 잘라 주는 가장 긴 길이(초) — DualCameraModule.swift `after = max(0.3, min(4, …))` */
export const CLIP_MAX_SEC = 4;
/** 앱이 쥐고 있는 영상 길이(초) — DualCameraCore.swift SegmentRecorder.keepSec */
export const CAMERA_KEEP_SEC = 8;
/**
 * 올리기가 이만큼 밀리면 그 조각은 폰에 두고(새 앱 · 옛 앱 모두 LocalVideo) 끝낸 뒤 올린다 — 폰에 둘 수 없으면 버린다. 조각 7MB × 6 = 42MB 가
 * 메모리 상한. 3 이었을 때는 와이파이가 느리면(10-19 현장 약 6.5Mbps — 필요한 건 14) 둘에 하나를 버렸다.
 */
export const RECORD_MAX_PENDING = 6;
/** 마지막 조각이 아직 안 닫혔을 수 있다 — 지금에서 이만큼 띄운다 */
export const RECORD_LAG_SEC = 0.4;

/**
 * 세션 녹화가 다음에 자를 구간 — 지난 끝(lastEnd)부터 지금 − 여유까지, 한 번에 CLIP_MAX_SEC 까지만(모듈 상한). 앱이 쥔 길이(8초) 밖으로
 * 뒤처졌으면 그만큼 건너뛰고 버퍼 안(지금 − 4초)부터 — 없는 영상을 청하면 모듈이 실패하고, 실패를 그대로 두면 다음에도 같은 자리를 청해
 * 영영 멎는다. skippedSec 은 그렇게 버린 길이. 너무 짧으면(끝낼 때 0.5 · 평소 2초 미만) null.
 */
export function nextRecordCut(
  lastEnd: number,
  cameraNow: number,
  final = false
): { from: number; to: number; skippedSec: number } | null {
  const to = cameraNow - RECORD_LAG_SEC;
  let from = lastEnd;
  let skippedSec = 0;
  if (to - from > CAMERA_KEEP_SEC - 1) {
    from = to - CLIP_MAX_SEC;
    skippedSec = from - lastEnd;
  }
  const span = Math.min(CLIP_MAX_SEC, to - from);
  if (span < (final ? 0.5 : 2)) return null;
  return { from, to: from + span, skippedSec };
}
