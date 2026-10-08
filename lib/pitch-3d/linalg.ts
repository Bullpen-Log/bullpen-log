/**
 * 3D 투구 분석(lib/pitch-3d)이 쓰는 작은 수학 — 3차원 벡터 · 3×3 행렬 · 회전 · 대칭 행렬 고윳값(Jacobi) · 3×3 SVD ·
 * Nelder–Mead 최소화 · 중앙값. 새 패키지 없이 필요한 것만(설계 docs/designs/pitch-3d-analysis.md 3절, 검토 D1).
 *
 * 행렬은 행 우선 9칸 배열이다: [a00, a01, a02, a10, a11, a12, a20, a21, a22].
 */

export type Vec3 = [number, number, number];
export type Mat3 = number[];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const n = norm(a);
  return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
};
export const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
/** 두 벡터 사이 각(도) */
export const angleDeg = (a: Vec3, b: Vec3) => {
  const c = dot(a, b) / (norm(a) * norm(b) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
};
/** a 에서 n 방향 성분을 뺀다(n 은 단위 벡터) */
export const reject = (a: Vec3, n: Vec3): Vec3 => sub(a, scale(n, dot(a, n)));

export const I3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array<number>(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
export const mulV = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const det3 = (m: Mat3) =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
export const row = (m: Mat3, r: number): Vec3 => [m[r * 3], m[r * 3 + 1], m[r * 3 + 2]];
export const col = (m: Mat3, c: number): Vec3 => [m[c], m[3 + c], m[6 + c]];
export const fromCols = (a: Vec3, b: Vec3, c: Vec3): Mat3 => [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
export const fromRows = (a: Vec3, b: Vec3, c: Vec3): Mat3 => [...a, ...b, ...c];

/** 회전 벡터(축 × 각, 라디안) → 회전 행렬 */
export function rodrigues(r: Vec3): Mat3 {
  const th = norm(r);
  if (th < 1e-12) return [1, -r[2], r[1], r[2], 1, -r[0], -r[1], r[0], 1];
  const [x, y, z] = [r[0] / th, r[1] / th, r[2] / th];
  const c = Math.cos(th);
  const s = Math.sin(th);
  const C = 1 - c;
  return [
    c + x * x * C,
    x * y * C - z * s,
    x * z * C + y * s,
    y * x * C + z * s,
    c + y * y * C,
    y * z * C - x * s,
    z * x * C - y * s,
    z * y * C + x * s,
    c + z * z * C,
  ];
}

/** 회전 행렬 → 회전 벡터(rodrigues 의 거꾸로) */
export function rotvec(m: Mat3): Vec3 {
  const cos = Math.max(-1, Math.min(1, (m[0] + m[4] + m[8] - 1) / 2));
  const th = Math.acos(cos);
  if (th < 1e-9) return [(m[7] - m[5]) / 2, (m[2] - m[6]) / 2, (m[3] - m[1]) / 2];
  if (Math.PI - th < 1e-6) {
    /* 180° 근처 — 대각에서 축을 읽는다 */
    const x = Math.sqrt(Math.max(0, (m[0] + 1) / 2));
    const y = Math.sqrt(Math.max(0, (m[4] + 1) / 2)) * (m[1] >= 0 ? 1 : -1);
    const z = Math.sqrt(Math.max(0, (m[8] + 1) / 2)) * (m[2] >= 0 ? 1 : -1);
    return scale(normalize([x, y, z]), th);
  }
  const k = th / (2 * Math.sin(th));
  return [(m[7] - m[5]) * k, (m[2] - m[6]) * k, (m[3] - m[1]) * k];
}

/** 대칭 행렬(n×n)의 고윳값 · 고유벡터(열) — 순환 Jacobi. 값은 작은 것부터 */
export function eigenSym(a: number[][]): { values: number[]; vectors: number[][] } {
  const n = a.length;
  const A = a.map((r) => [...r]);
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p];
          const akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k];
          const aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = A.map((_, i) => i).sort((i, j) => A[i][i] - A[j][j]);
  return {
    values: order.map((i) => A[i][i]),
    vectors: order.map((i) => V.map((r) => r[i])),
  };
}

/** 3×3 SVD: m = U · diag(s) · Vᵀ, s 는 큰 것부터. 셋째 특잇값이 0 이어도(본질 행렬) U 가 직교가 되게 */
export function svd3(m: Mat3): { U: Mat3; s: Vec3; V: Mat3 } {
  const mtm = mul3(transpose(m), m);
  const { values, vectors } = eigenSym([
    [mtm[0], mtm[1], mtm[2]],
    [mtm[3], mtm[4], mtm[5]],
    [mtm[6], mtm[7], mtm[8]],
  ]);
  /* 큰 것부터 */
  const s = [2, 1, 0].map((i) => Math.sqrt(Math.max(0, values[i]))) as Vec3;
  const v1 = normalize(vectors[2] as Vec3);
  const v2 = normalize(reject(vectors[1] as Vec3, v1));
  const v3 = cross(v1, v2);
  /*
   * 특잇값은 MᵀM 고윳값의 제곱근이라 0 이어야 할 값이 √(1e-16) ≈ 1e-8 로 나온다 — 문턱은 1e-6 배. 그 밑을 0 이 아니라고 보면
   * 셋째 방향이 잡음을 정규화한 0 벡터가 됐다(본질 행렬의 이동 방향 t 가 통째로 사라짐, 2026-10-08).
   */
  const tiny = 1e-6 * Math.max(1e-12, s[0]);
  /** u 에 직교인 아무 단위 벡터(특잇값이 0 일 때 채움) */
  const anyOrtho = (u: Vec3): Vec3 => {
    const a = normalize(reject([1, 0, 0], u));
    return norm(a) > 0.5 ? a : normalize(reject([0, 1, 0], u));
  };
  const u1: Vec3 = s[0] > tiny ? normalize(mulV(m, v1)) : [1, 0, 0];
  const u2: Vec3 = s[1] > tiny ? normalize(reject(mulV(m, v2), u1)) : anyOrtho(u1);
  /* 셋째는 늘 두 열의 외적 — 특잇값이 0 이 아니면 M·v3 와 같은 쪽으로 부호만 맞춘다 */
  let u3: Vec3 = cross(u1, u2);
  if (s[2] > tiny && dot(u3, mulV(m, v3)) < 0) u3 = scale(u3, -1);
  return { U: fromCols(u1, u2, u3), s, V: fromCols(v1, v2, v3) };
}

/** 3×3 연립 a·x = b (부분 피벗 가우스). 특이하면 null */
export function solve3(a: Mat3, b: Vec3): Vec3 | null {
  const M = [
    [a[0], a[1], a[2], b[0]],
    [a[3], a[4], a[5], b[1]],
    [a[6], a[7], a[8], b[2]],
  ];
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/** Nelder–Mead 최소화. steps 는 처음 단체의 변 길이(인자마다) */
export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  steps: number[],
  opts: { maxEvals?: number; tol?: number } = {}
): { x: number[]; fx: number; evals: number } {
  const n = x0.length;
  const maxEvals = opts.maxEvals ?? 200 * n;
  const tol = opts.tol ?? 1e-8;
  let evals = 0;
  const F = (x: number[]) => {
    evals++;
    const v = f(x);
    return Number.isFinite(v) ? v : Number.MAX_VALUE;
  };
  let simplex = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + steps[i] : v)))];
  let vals = simplex.map(F);
  while (evals < maxEvals) {
    const order = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
    simplex = order.map((i) => simplex[i]);
    vals = order.map((i) => vals[i]);
    if (Math.abs(vals[n] - vals[0]) <= tol * (Math.abs(vals[0]) + tol)) break;
    const c = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += simplex[i][k] / n;
    const at = (t: number) => c.map((v, k) => v + t * (simplex[n][k] - v));
    const xr = at(-1);
    const fr = F(xr);
    if (fr < vals[0]) {
      const xe = at(-2);
      const fe = F(xe);
      if (fe < fr) [simplex[n], vals[n]] = [xe, fe];
      else [simplex[n], vals[n]] = [xr, fr];
    } else if (fr < vals[n - 1]) {
      [simplex[n], vals[n]] = [xr, fr];
    } else {
      const outside = fr < vals[n];
      const xc = at(outside ? -0.5 : 0.5);
      const fc = F(xc);
      if (fc < (outside ? fr : vals[n])) [simplex[n], vals[n]] = [xc, fc];
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, k) => simplex[0][k] + 0.5 * (v - simplex[0][k]));
          vals[i] = F(simplex[i]);
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i <= n; i++) if (vals[i] < vals[best]) best = i;
  return { x: simplex[best], fx: vals[best], evals };
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 흔들림 = 중앙값 절대 편차 × 1.4826 / 중앙값(검토 D8 — 튀는 값 몇 개에 덜 흔들린다) */
export function robustCv(values: number[]): number {
  if (values.length < 3) return NaN;
  const m = median(values);
  if (!(m > 0)) return NaN;
  return (1.4826 * median(values.map((v) => Math.abs(v - m)))) / m;
}
