/**
 * 구속 측정 오차 통계 — 서버(관리자 자료 읽기)와 브라우저(관리자 탐색기)가 같은 정의를 쓴다.
 *
 * 짝 = 스피드건 값이 있고 보정에서 빼지 않은 공. 오차 = (릴리스 추정 ?? 보정 후 값) − 스피드건.
 * 릴리스 추정이 스피드건과 물리적으로 같은 값(손을 떠난 직후 최고 속도)이라 그것을 먼저 견준다.
 */

export type PairLike = {
  kmh: number;
  releaseKmh: number | null;
  gunKmh: number | null;
  calibExclude: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 짝인가 — 스피드건 값이 있고 보정에서 빼지 않은 공 */
export function isPair<T extends PairLike>(p: T): p is T & { gunKmh: number } {
  return p.gunKmh != null && !p.calibExclude;
}

/** 공 하나의 오차 — (릴리스 추정 ?? 보정 후 값) − 스피드건. 짝이 아니면 null */
export function pitchError(p: PairLike): number | null {
  if (!isPair(p)) return null;
  return round1((p.releaseKmh ?? p.kmh) - p.gunKmh);
}

/** 오차 묶음의 편향 · p90 · 표준편차. 짝이 없으면 전부 null */
export function errorStats(errors: number[]): {
  biasKmh: number | null;
  p90Kmh: number | null;
  sdKmh: number | null;
} {
  const n = errors.length;
  if (n === 0) return { biasKmh: null, p90Kmh: null, sdKmh: null };
  const mean = errors.reduce((s, v) => s + v, 0) / n;
  const abs = errors.map((e) => Math.abs(e)).sort((a, b) => a - b);
  /* 90 백분위 — 가장 가까운 순위(nearest-rank) */
  const p90 = abs[Math.min(n - 1, Math.max(0, Math.ceil(n * 0.9) - 1))];
  const sd =
    n > 1 ? Math.sqrt(errors.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { biasKmh: round1(mean), p90Kmh: round1(p90), sdKmh: round1(sd) };
}
