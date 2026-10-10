/**
 * 통계 움직임 틀 — 실제 투구 모션캡처에서 뽑은 '구간별 평균 자세 + 사람마다 다른 방향(주성분)'으로, 두 영상에 다 안 보인 관절을
 * 보인 관절에 맞춰 채운다(확률 주성분 분석 PPCA 의 조건부 평균). 같은 계산으로 얼마나 확실한지(표준편차)도 낸다.
 *
 * 2026-10-10 김민: 빠른 구간 짐작이 약하다(진짜 정답 기준 던지는 손목 0.13초 가리면 7~10cm, 팔꿈치+손목 0.2초 15~22cm) →
 * 신경망 대신 통계 틀(설명 가능 · 같은 입력 같은 답 · 확실한 정도가 같이 나옴). 틀은 scripts/pitch-lab/markers/motion_template.py 가 만든다.
 *
 * 좌표(틀): 엉덩이 가운데가 원점, x = 홈 쪽(F), y = 글러브 쪽(G), z = 위(U), 키로 나눔. 좌투는 G 가 오른쪽이라 저절로 거울이 되고,
 * 관절은 '글러브 쪽 · 던지는 쪽'으로 다시 묶는다(우투 차례 그대로 = 왼쪽이 글러브 쪽).
 * 구간(φ): 니업 0 · 착지 1 · 릴리스 2, 릴리스 뒤는 착지 → 릴리스 길이로 잰다(3 = 릴리스 + 그만큼).
 */
import { V2_PAIRS } from '@/lib/pitch-3d/v2/contract';
import type { Vec3 } from '@/lib/pitch-3d/linalg';

export type MotionTemplate = {
  version: number;
  /** 첫 칸의 φ · 칸 간격 · 칸 수 */
  phase0: number;
  dphi: number;
  /** 칸마다 평균(관절 × 3) · 주성분(관절 × 3 행, k 열) · 나머지 분산 */
  bins: { mu: number[]; W: number[][]; s2: number }[];
  /** 만든 투구 수 · 출처(사용 조건) */
  n: number;
  source: string;
};

export type Events = { kneeUp: number | null; footPlant: number; release: number };

/** 장면 번호 → φ. 니업이 없으면 착지 앞 (착지 → 릴리스) 네 배를 니업으로 */
export function phaseOf(k: number, ev: Events): number {
  const span = Math.max(1, ev.release - ev.footPlant);
  const ku = ev.kneeUp != null && ev.kneeUp < ev.footPlant ? ev.kneeUp : ev.footPlant - 4 * span;
  if (k < ev.footPlant) return (k - ev.footPlant) / Math.max(1, ev.footPlant - ku) + 1;
  if (k <= ev.release) return 1 + (k - ev.footPlant) / span;
  return 2 + (k - ev.release) / span;
}

/** 엔진 관절 번호 → 틀 관절 번호(좌투면 좌우 짝을 바꿈 — 틀은 글러브 쪽을 '왼쪽' 자리에 둔다) */
export function templateIndex(hand: 'R' | 'L'): number[] {
  const idx = Array.from({ length: 25 }, (_, j) => j);
  if (hand === 'L') for (const [a, b] of V2_PAIRS) [idx[a], idx[b]] = [idx[b], idx[a]];
  return idx;
}

/** k×k 양의 정부호 풀기(촐레스키) — A x = b */
function solveSpd(A: number[][], b: number[]): number[] {
  const n = b.length;
  const L = A.map((r) => r.map(() => 0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let p = 0; p < j; p++) s -= L[i][p] * L[j][p];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
    }
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let p = 0; p < i; p++) s -= L[i][p] * y[p];
    y[i] = s / L[i][i];
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let p = i + 1; p < n; p++) s -= L[p][i] * x[p];
    x[i] = s / L[i][i];
  }
  return x;
}

/**
 * 한 장면 채우기 — frame 은 엔진 관절 25(없으면 null), seen 은 믿을 만한 관절(조건으로 씀). U · F · G 는 엔진 축, H 는 키(엔진 단위).
 * 돌려줌: 빈 관절(null) 자리의 짐작 · 표준편차(엔진 단위). 엉덩이가 없거나 틀 범위 밖이면 null.
 */
export function templateFill(
  tpl: MotionTemplate,
  frame: (Vec3 | null)[],
  seen: boolean[],
  axes: { U: Vec3; F: Vec3; G: Vec3 },
  H: number,
  hand: 'R' | 'L',
  phase: number
): { pos: (Vec3 | null)[]; sd: number[] } | null {
  const bi = Math.round((phase - tpl.phase0) / tpl.dphi);
  if (bi < 0 || bi >= tpl.bins.length) return null;
  const bin = tpl.bins[bi];
  const lh = frame[7];
  const rh = frame[8];
  if (!lh || !rh) return null;
  const O: Vec3 = [(lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2, (lh[2] + rh[2]) / 2];
  const toT = (X: Vec3): Vec3 => {
    const d: Vec3 = [X[0] - O[0], X[1] - O[1], X[2] - O[2]];
    return [
      (d[0] * axes.F[0] + d[1] * axes.F[1] + d[2] * axes.F[2]) / H,
      (d[0] * axes.G[0] + d[1] * axes.G[1] + d[2] * axes.G[2]) / H,
      (d[0] * axes.U[0] + d[1] * axes.U[1] + d[2] * axes.U[2]) / H,
    ];
  };
  const fromT = (c: number[]): Vec3 => [
    O[0] + H * (c[0] * axes.F[0] + c[1] * axes.G[0] + c[2] * axes.U[0]),
    O[1] + H * (c[0] * axes.F[1] + c[1] * axes.G[1] + c[2] * axes.U[1]),
    O[2] + H * (c[0] * axes.F[2] + c[1] * axes.G[2] + c[2] * axes.U[2]),
  ];
  const ti = templateIndex(hand);
  const obsRows: number[] = [];
  const x: number[] = [];
  const missing: number[] = [];
  for (let j = 0; j < 25; j++) {
    const X = frame[j];
    if (X && seen[j]) {
      const c = toT(X);
      for (let d = 0; d < 3; d++) {
        obsRows.push(ti[j] * 3 + d);
        x.push(c[d]);
      }
    } else if (!X) missing.push(j);
  }
  if (missing.length === 0 || obsRows.length < 18) return null;
  const k = bin.W[0].length;
  const M = Array.from({ length: k }, (_, a) =>
    Array.from({ length: k }, (_, b) => {
      let s = a === b ? bin.s2 : 0;
      for (const r of obsRows) s += bin.W[r][a] * bin.W[r][b];
      return s;
    })
  );
  const rhs = Array.from({ length: k }, (_, a) => {
    let s = 0;
    obsRows.forEach((r, i) => (s += bin.W[r][a] * (x[i] - bin.mu[r])));
    return s;
  });
  const z = solveSpd(M, rhs);
  const pos: (Vec3 | null)[] = new Array(25).fill(null);
  const sd = new Array(25).fill(0);
  for (const j of missing) {
    const c = [0, 1, 2].map((d) => {
      const r = ti[j] * 3 + d;
      let v = bin.mu[r];
      for (let a = 0; a < k; a++) v += bin.W[r][a] * z[a];
      return v;
    });
    pos[j] = fromT(c);
    /* 분산: s2 (1 + w_r^T M^-1 w_r) 를 세 축 평균 */
    let varSum = 0;
    for (let d = 0; d < 3; d++) {
      const w = bin.W[ti[j] * 3 + d];
      const u = solveSpd(M, w);
      varSum += bin.s2 * (1 + w.reduce((s, v, i) => s + v * u[i], 0));
    }
    sd[j] = Math.sqrt(varSum / 3) * H;
  }
  return { pos, sd };
}
