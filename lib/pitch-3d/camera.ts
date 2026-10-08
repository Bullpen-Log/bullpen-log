import {
  add,
  cross,
  det3,
  dot,
  I3,
  mul3,
  mulV,
  nelderMead,
  normalize,
  norm,
  reject,
  robustCv,
  rodrigues,
  row,
  scale,
  solve3,
  sub,
  svd3,
  transpose,
  eigenSym,
  type Mat3,
  type Vec3,
} from '@/lib/pitch-3d/linalg';

/**
 * 카메라 — 핀홀(화면 중심 = 주점, 정사각 화소, 왜곡 없음). 세계 → 카메라: Xc = R·X + t, 화면: x = f·Xc.x/Xc.z + cx (y 는 아래로).
 * 세계 좌표는 옆 카메라 좌표와 같다(옆: R = I, t = 0). 뒤 카메라의 |t| = 1 이라 3D 크기는 임의 — 지표는 키 대비로 잰다.
 *
 * 보정(calibrate)은 사람 몸을 보정판으로 쓴다(설계 3절 3, 검토 R2 · R3):
 *   초점 격자 × 8점 본질 행렬(IRLS) → 앞쪽 검사 → 비용(다시 비춤 + 뼈 길이 흔들림 + 초점 사전)이 작은 셋 → Nelder–Mead.
 *   두 폰이 같은 투수를 겨누면 기본 행렬로는 두 초점을 정할 수 없다(광축이 만나는 퇴화 배치, arXiv 2311.16304) — 초점은
 *   뼈 길이의 강체성과 약한 사전으로만 붙잡히므로, 격자에서 '거의 같은 비용'인 초점의 폭을 보정 믿음으로 남긴다.
 */

export type Camera = { f: number; cx: number; cy: number; R: Mat3; t: Vec3 };

export type Obs = { x: number; y: number; v: number };

export const cameraCenter = (c: Camera): Vec3 => scale(mulV(transpose(c.R), c.t), -1);
/** 카메라가 보는 방향(광축, 세계 좌표) */
export const opticalAxis = (c: Camera): Vec3 => row(c.R, 2);
/** 화면 오른쪽(x) · 위(−y) 방향(세계 좌표) */
export const imageRight = (c: Camera): Vec3 => row(c.R, 0);
export const imageUp = (c: Camera): Vec3 => scale(row(c.R, 1), -1);

export function project(c: Camera, X: Vec3): [number, number] | null {
  const p = add(mulV(c.R, X), c.t);
  if (p[2] <= 1e-9) return null;
  return [(c.f * p[0]) / p[2] + c.cx, (c.f * p[1]) / p[2] + c.cy];
}

/** 화면 점의 광선(세계 좌표의 시작점 · 단위 방향) */
export function ray(c: Camera, x: number, y: number): { o: Vec3; d: Vec3 } {
  const dc: Vec3 = [(x - c.cx) / c.f, (y - c.cy) / c.f, 1];
  return { o: cameraCenter(c), d: normalize(mulV(transpose(c.R), dc)) };
}

/** 광선 여럿의 가중 최소 제곱 교점. 거의 나란하면 null */
export function intersectRays(rays: { o: Vec3; d: Vec3; w: number }[]): Vec3 | null {
  const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const b: Vec3 = [0, 0, 0];
  for (const { o, d, w } of rays) {
    /* (I − d dᵀ) */
    const m = [1 - d[0] * d[0], -d[0] * d[1], -d[0] * d[2], -d[1] * d[0], 1 - d[1] * d[1], -d[1] * d[2], -d[2] * d[0], -d[2] * d[1], 1 - d[2] * d[2]];
    for (let k = 0; k < 9; k++) A[k] += w * m[k];
    const mo = mulV(m, o);
    b[0] += w * mo[0];
    b[1] += w * mo[1];
    b[2] += w * mo[2];
  }
  /* 거의 나란한 광선(조건이 나쁨)은 버린다 */
  const tr = A[0] + A[4] + A[8];
  if (!(tr > 0) || Math.abs(det3(A)) < 1e-10 * tr * tr * tr) return null;
  return solve3(A, b);
}

export function triangulate(a: Camera, oa: Obs, b: Camera, ob: Obs): Vec3 | null {
  const ra = ray(a, oa.x, oa.y);
  const rb = ray(b, ob.x, ob.y);
  return intersectRays([
    { ...ra, w: Math.max(0.05, oa.v) ** 2 },
    { ...rb, w: Math.max(0.05, ob.v) ** 2 },
  ]);
}

/** 광선 위에서 점 P 로부터 거리 L 인 점들(0 · 1 · 2개) */
export function rootsOnRay(r: { o: Vec3; d: Vec3 }, P: Vec3, L: number): Vec3[] {
  const op = sub(P, r.o);
  const s0 = dot(op, r.d);
  const disc = L * L - (dot(op, op) - s0 * s0);
  if (disc < 0) return [];
  if (disc === 0) return [add(r.o, scale(r.d, s0))];
  const k = Math.sqrt(disc);
  return [add(r.o, scale(r.d, s0 - k)), add(r.o, scale(r.d, s0 + k))];
}

/**
 * 광선 위에서 점 P 로부터 거리 L 인 점(검토 R4 — 한 영상에서만 잘 보이는 관절을 그 영상의 시선 위, 부모 관절로부터 뼈 길이만큼에).
 * 근이 둘이면 near 에 가까운 쪽, 없으면 광선 위에서 P 에 가장 가까운 점.
 */
export function pointOnRayAtDistance(r: { o: Vec3; d: Vec3 }, P: Vec3, L: number, near: Vec3): Vec3 {
  const op = sub(P, r.o);
  const s0 = dot(op, r.d);
  const h2 = dot(op, op) - s0 * s0;
  const disc = L * L - h2;
  if (disc <= 0) return add(r.o, scale(r.d, s0));
  const k = Math.sqrt(disc);
  const a = add(r.o, scale(r.d, s0 - k));
  const b = add(r.o, scale(r.d, s0 + k));
  return norm(sub(a, near)) <= norm(sub(b, near)) ? a : b;
}

/* ───────────────────────────── 본질 행렬 ───────────────────────────── */

type Pair = { a: [number, number]; b: [number, number]; w: number };

/**
 * 정규 좌표 짝으로 본질 행렬(가중 8점, Sampson 거리로 IRLS 3번 — 좌우 뒤바뀜 같은 튀는 짝을 덜 믿는다).
 * Hartley 정규화(두 영상 각각 무게중심 0 · 평균 거리 √2)를 거친다 — 줌을 당긴 좁은 화각에서는 좌표가 ±0.1 안에 몰려 이것 없이
 * 진짜 초점에서도 회전이 36° 틀렸다(2026-10-08 진단).
 */
export function essentialFrom(pairs: Pair[]): Mat3 | null {
  if (pairs.length < 8) return null;
  const norm2 = (pick: (p: Pair) => [number, number]) => {
    let sw = 0;
    let mx = 0;
    let my = 0;
    for (const p of pairs) {
      const [x, y] = pick(p);
      mx += p.w * x;
      my += p.w * y;
      sw += p.w;
    }
    mx /= sw || 1;
    my /= sw || 1;
    let d = 0;
    for (const p of pairs) {
      const [x, y] = pick(p);
      d += p.w * Math.hypot(x - mx, y - my);
    }
    const s = Math.SQRT2 / (d / (sw || 1) || 1);
    return { mx, my, s, T: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1] as Mat3 };
  };
  const na = norm2((p) => p.a);
  const nb = norm2((p) => p.b);
  const A = pairs.map((p) => [(p.a[0] - na.mx) * na.s, (p.a[1] - na.my) * na.s] as [number, number]);
  const B = pairs.map((p) => [(p.b[0] - nb.mx) * nb.s, (p.b[1] - nb.my) * nb.s] as [number, number]);
  let w = pairs.map((p) => p.w);
  let E: Mat3 | null = null;
  for (let iter = 0; iter < 3; iter++) {
    const M = Array.from({ length: 9 }, () => new Array<number>(9).fill(0));
    for (let i = 0; i < pairs.length; i++) {
      const [x1, y1] = A[i];
      const [x2, y2] = B[i];
      const r = [x2 * x1, x2 * y1, x2, y2 * x1, y2 * y1, y2, x1, y1, 1];
      const wi = w[i];
      if (!(wi > 0)) continue;
      for (let p = 0; p < 9; p++) {
        const rp = r[p] * wi;
        for (let q = p; q < 9; q++) M[p][q] += rp * r[q];
      }
    }
    for (let p = 0; p < 9; p++) for (let q = 0; q < p; q++) M[p][q] = M[q][p];
    const e = eigenSym(M).vectors[0];
    /* 정규화를 되돌린다: E = T_bᵀ · F̂ · T_a, 그다음 특잇값을 (1, 1, 0) 으로 */
    const raw: Mat3 = mul3(mul3(transpose(nb.T), e), na.T);
    const { U, V } = svd3(raw);
    E = mul3(mul3(U, [1, 0, 0, 0, 1, 0, 0, 0, 0]), transpose(V));
    /* Sampson 거리로 다시 가중(Cauchy, 문턱은 중앙값 기준) */
    const d = pairs.map((p) => sampson(E!, p));
    const sorted = [...d].sort((x, y) => x - y);
    const tau = Math.max(1e-8, 2.5 * sorted[sorted.length >> 1]);
    w = pairs.map((p, i) => p.w / (1 + d[i] / tau));
  }
  return E;
}

function sampson(E: Mat3, p: Pair): number {
  const x1: Vec3 = [p.a[0], p.a[1], 1];
  const x2: Vec3 = [p.b[0], p.b[1], 1];
  const Ex1 = mulV(E, x1);
  const Etx2 = mulV(transpose(E), x2);
  const num = dot(x2, Ex1) ** 2;
  const den = Ex1[0] ** 2 + Ex1[1] ** 2 + Etx2[0] ** 2 + Etx2[1] ** 2;
  return den > 0 ? num / den : 0;
}

/** E = [t]× R 의 네 후보 */
export function decomposeEssential(E: Mat3): { R: Mat3; t: Vec3 }[] {
  let { U, V } = svd3(E);
  if (det3(U) < 0) U = U.map((v) => -v);
  if (det3(V) < 0) V = V.map((v) => -v);
  const W: Mat3 = [0, -1, 0, 1, 0, 0, 0, 0, 1];
  const Vt = transpose(V);
  const R1 = mul3(mul3(U, W), Vt);
  const R2 = mul3(mul3(U, transpose(W)), Vt);
  const t: Vec3 = [U[2], U[5], U[8]];
  return [
    { R: R1, t },
    { R: R1, t: scale(t, -1) },
    { R: R2, t },
    { R: R2, t: scale(t, -1) },
  ];
}

/* ───────────────────────────── 보정 ───────────────────────────── */

export type CalibFrame = { side: (Obs | null)[]; back: (Obs | null)[] };

export type CalibInput = {
  frames: CalibFrame[];
  sideSize: { W: number; H: number };
  backSize: { W: number; H: number };
  /** 보정에 쓸 관절 자리(motion.ts JOINTS 의 순번) */
  use: number[];
  /** 강체성에 쓸 뼈 [a, b, 가중] */
  bones: [number, number, number][];
  /** 사람 크기(px) — 다시 비춤 오차를 사람 비율로 */
  personSide: number;
  personBack: number;
};

export type Calibration = {
  side: Camera;
  back: Camera;
  /** 다시 비춤 오차(두 영상 평균, 사람 높이 대비 비율) */
  reproj: number;
  /** 뼈 길이 흔들림(가중 평균) */
  rigidity: number;
  cost: number;
  /** 격자에서 거의 같은 비용인 초점의 폭(ln) — 클수록 초점이 덜 정해짐(R2) */
  focalSpread: number;
  /** 두 광축 사이 각(도) */
  axisAngleDeg: number;
};

/**
 * 초점 범위(긴 변의 배수) — 이 밖은 벌점. 사전(가운데로 당기기)은 두지 않는다: 깨끗한 합성에서도 사전이 데이터의 차이(진짜가 0.14 단위
 * 더 작음)보다 커서 맞는 초점을 밀어냈다(2026-10-08 진단). 정해지지 않으면 보정 믿음 · ± 로 알린다(R2).
 */
const FOCAL_MIN = 0.35;
const FOCAL_MAX = 6;
/** 격자: 긴 변의 0.45 ~ 4.3배(로그 간격 10칸) */
const FOCAL_GRID = Array.from({ length: 10 }, (_, i) => 0.45 * 1.285 ** i);
/** 비용 척도: 다시 비춤 1% · 뼈 흔들림 2% 가 한 단위 */
const REPROJ_UNIT = 0.01;
const RIGID_UNIT = 0.04;
/** 대응 상한 — 격자는 가볍게, 다듬기는 많이(속도) */
const GRID_PAIRS = 600;
const REFINE_PAIRS = 2400;

/** 보정용 대응을 숫자 배열로(빠른 계산) — 화면 중심 기준 픽셀 */
type Packed = {
  n: number;
  ax: Float64Array;
  ay: Float64Array;
  bx: Float64Array;
  by: Float64Array;
  wa: Float64Array;
  wb: Float64Array;
  w: Float64Array;
  /** 뼈마다 같은 장면의 두 대응 번호 */
  bones: { w: number; ia: Int32Array; ib: Int32Array }[];
  input: CalibInput;
};

function pack(input: CalibInput, maxPairs: number): Packed {
  const cxs = input.sideSize.W / 2;
  const cys = input.sideSize.H / 2;
  const cxb = input.backSize.W / 2;
  const cyb = input.backSize.H / 2;
  let total = 0;
  for (const fr of input.frames)
    for (const j of input.use) {
      const a = fr.side[j];
      const b = fr.back[j];
      if (a && b && a.v >= 0.5 && b.v >= 0.5) total++;
    }
  /* 고르게 솎기 — 장면 단위로(같은 장면의 관절은 함께 남아 뼈 길이를 잴 수 있게) */
  const keepEvery = Math.max(1, Math.ceil(total / maxPairs));
  const rows: { a: Obs; b: Obs; j: number; f: number }[] = [];
  input.frames.forEach((fr, f) => {
    if (f % keepEvery !== 0) return;
    for (const j of input.use) {
      const a = fr.side[j];
      const b = fr.back[j];
      if (a && b && a.v >= 0.5 && b.v >= 0.5) rows.push({ a, b, j, f });
    }
  });
  const n = rows.length;
  const P: Packed = {
    n,
    ax: new Float64Array(n),
    ay: new Float64Array(n),
    bx: new Float64Array(n),
    by: new Float64Array(n),
    wa: new Float64Array(n),
    wb: new Float64Array(n),
    w: new Float64Array(n),
    bones: [],
    input,
  };
  const at = new Map<string, number>();
  rows.forEach((r, i) => {
    P.ax[i] = r.a.x - cxs;
    P.ay[i] = r.a.y - cys;
    P.bx[i] = r.b.x - cxb;
    P.by[i] = r.b.y - cyb;
    P.wa[i] = Math.max(0.05, r.a.v) ** 2;
    P.wb[i] = Math.max(0.05, r.b.v) ** 2;
    P.w[i] = Math.min(r.a.v, r.b.v) ** 2;
    at.set(`${r.f}:${r.j}`, i);
  });
  for (const [ja, jb, w] of input.bones) {
    const ia: number[] = [];
    const ib: number[] = [];
    input.frames.forEach((_, f) => {
      const x = at.get(`${f}:${ja}`);
      const y = at.get(`${f}:${jb}`);
      if (x != null && y != null) {
        ia.push(x);
        ib.push(y);
      }
    });
    if (ia.length >= 6) P.bones.push({ w, ia: Int32Array.from(ia), ib: Int32Array.from(ib) });
  }
  return P;
}

/** 초점 범위 밖 벌점 */
function rangeCost(f: number, longSide: number) {
  const k = f / longSide;
  const out = k < FOCAL_MIN ? Math.log(FOCAL_MIN / k) : k > FOCAL_MAX ? Math.log(k / FOCAL_MAX) : 0;
  return 100 * out * out;
}

/**
 * 보정 비용(빠른 판) — 대응마다 두 시선의 가장 가까운 두 점을 신뢰도로 섞어 3D, 두 화면에 다시 비춰 오차(사람 비율), 뼈 길이 흔들림.
 * 옆 카메라는 R = I · t = 0, 뒤는 (R, t). 카메라 뒤로 간 점(거울 해)은 큰 벌점.
 */
function fastEval(fs: number, fb: number, R: Mat3, t: Vec3, P: Packed, X: Float64Array) {
  const { personSide, personBack } = P.input;
  /* 뒤 카메라 중심 Cb = −Rᵀ t */
  const cbx = -(R[0] * t[0] + R[3] * t[1] + R[6] * t[2]);
  const cby = -(R[1] * t[0] + R[4] * t[1] + R[7] * t[2]);
  const cbz = -(R[2] * t[0] + R[5] * t[1] + R[8] * t[2]);
  let se = 0;
  let rs2 = 0;
  let sw = 0;
  for (let i = 0; i < P.n; i++) {
    let d1x = P.ax[i] / fs;
    let d1y = P.ay[i] / fs;
    let d1z = 1;
    const n1 = Math.hypot(d1x, d1y, d1z);
    d1x /= n1;
    d1y /= n1;
    d1z /= n1;
    const qx = P.bx[i] / fb;
    const qy = P.by[i] / fb;
    let d2x = R[0] * qx + R[3] * qy + R[6];
    let d2y = R[1] * qx + R[4] * qy + R[7];
    let d2z = R[2] * qx + R[5] * qy + R[8];
    const n2 = Math.hypot(d2x, d2y, d2z);
    d2x /= n2;
    d2y /= n2;
    d2z /= n2;
    const b = d1x * d2x + d1y * d2y + d1z * d2z;
    const den = 1 - b * b;
    let bad = den < 1e-10;
    let ea = 1;
    let eb = 1;
    if (!bad) {
      /* w0 = o1 − o2 = −Cb */
      const d = -(d1x * cbx + d1y * cby + d1z * cbz);
      const e = -(d2x * cbx + d2y * cby + d2z * cbz);
      const s = (b * e - d) / den;
      const u = (e - b * d) / den;
      const wa = P.wa[i];
      const wb = P.wb[i];
      const k = 1 / (wa + wb);
      const x = (wa * s * d1x + wb * (cbx + u * d2x)) * k;
      const y = (wa * s * d1y + wb * (cby + u * d2y)) * k;
      const z = (wa * s * d1z + wb * (cbz + u * d2z)) * k;
      X[i * 3] = x;
      X[i * 3 + 1] = y;
      X[i * 3 + 2] = z;
      const zb = R[6] * x + R[7] * y + R[8] * z + t[2];
      if (z <= 1e-9 || zb <= 1e-9) bad = true;
      else {
        ea = Math.hypot((fs * x) / z - P.ax[i], (fs * y) / z - P.ay[i]) / personSide;
        const xb = R[0] * x + R[1] * y + R[2] * z + t[0];
        const yb = R[3] * x + R[4] * y + R[5] * z + t[1];
        eb = Math.hypot((fb * xb) / zb - P.bx[i], (fb * yb) / zb - P.by[i]) / personBack;
      }
    }
    if (bad) {
      X[i * 3] = NaN;
      ea = 1;
      eb = 1;
    }
    se += P.w[i] * (Math.min(ea, 1) ** 2 + Math.min(eb, 1) ** 2) * 0.5;
    /* 강건(Huber, 사람 높이의 3% 넘는 오차는 직선으로) — 실제 관절의 큰 오차 몇 개가 카메라를 끌고 가지 않게 */
    rs2 += P.w[i] * (huber(Math.min(ea, 1)) + huber(Math.min(eb, 1))) * 0.5;
    sw += P.w[i];
  }
  const reproj = sw > 0 ? Math.sqrt(se / sw) : 1;
  let rs = 0;
  let rw = 0;
  for (const bone of P.bones) {
    const ls: number[] = [];
    for (let k = 0; k < bone.ia.length; k++) {
      const a = bone.ia[k] * 3;
      const c = bone.ib[k] * 3;
      if (Number.isNaN(X[a]) || Number.isNaN(X[c])) continue;
      ls.push(Math.hypot(X[a] - X[c], X[a + 1] - X[c + 1], X[a + 2] - X[c + 2]));
    }
    const cv = robustCv(ls);
    if (Number.isFinite(cv) && ls.length >= 6) {
      rs += bone.w * Math.min(cv, 1);
      rw += bone.w;
    }
  }
  const rigidity = rw > 0 ? rs / rw : 1;
  const prior =
    rangeCost(fs, Math.max(P.input.sideSize.W, P.input.sideSize.H)) +
    rangeCost(fb, Math.max(P.input.backSize.W, P.input.backSize.H));
  const robust = sw > 0 ? Math.sqrt(rs2 / sw) : 1;
  return { cost: (robust / REPROJ_UNIT) ** 2 + (rigidity / RIGID_UNIT) ** 2 + prior, reproj, rigidity };
}

/** Huber — 3% 까지는 제곱, 넘으면 직선 */
const HUBER = 0.03;
const huber = (e: number) => (e <= HUBER ? e * e : HUBER * (2 * e - HUBER));

/** 정규 좌표로 8점(IRLS) — 격자 칸 하나 */
function essentialPacked(P: Packed, fs: number, fb: number): Mat3 | null {
  const pairs: Pair[] = new Array(P.n);
  for (let i = 0; i < P.n; i++) pairs[i] = { a: [P.ax[i] / fs, P.ay[i] / fs], b: [P.bx[i] / fb, P.by[i] / fb], w: P.w[i] };
  return essentialFrom(pairs);
}

/** 앞쪽 검사 — 두 카메라 앞에 놓이는 점이 가장 많은 후보 */
function chooseByCheirality(cands: { R: Mat3; t: Vec3 }[], fs: number, fb: number, P: Packed, X: Float64Array) {
  let best: { R: Mat3; t: Vec3 } | null = null;
  let bestCount = -1;
  for (const c of cands) {
    fastEval(fs, fb, c.R, c.t, P, X);
    let count = 0;
    for (let i = 0; i < P.n; i++) if (!Number.isNaN(X[i * 3])) count++;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

/** 보정 비용 — 진단 · 시험용(빠른 판과 같은 식) */
export function calibrationCost(side: Camera, back: Camera, input: CalibInput) {
  const P = pack(input, REFINE_PAIRS);
  return fastEval(side.f, back.f, back.R, back.t, P, new Float64Array(P.n * 3));
}

/**
 * 초점을 고정하고 회전 · 방향만 맞춘다(Nelder–Mead) — 다시 비춤 오차만으로. 뼈 길이 조건까지 넣으면 잡음을 설명하려고 기하를 비틀어
 * 진짜 카메라보다 비용이 낮은 틀린 해(이동 방향 8° 어긋남)에 앉았다(2026-10-08 합성 진단). 뼈 길이는 초점을 고를 때만 쓴다.
 */
function fitPose(fs: number, fb: number, R0: Mat3, t0in: Vec3, P: Packed, X: Float64Array, maxEvals: number) {
  const t0 = normalize(t0in);
  const e1 = normalize(Math.abs(t0[0]) < 0.9 ? reject([1, 0, 0], t0) : reject([0, 1, 0], t0));
  const e2 = cross(t0, e1);
  const build = (x: number[]) => ({
    R: mul3(rodrigues([x[0], x[1], x[2]]), R0),
    t: normalize(add(t0, add(scale(e1, x[3]), scale(e2, x[4])))),
  });
  const res = nelderMead((x) => {
    const c = build(x);
    return fastEval(fs, fb, c.R, c.t, P, X).cost;
  }, [0, 0, 0, 0, 0], [0.03, 0.03, 0.03, 0.03, 0.03], { maxEvals, tol: 1e-7 });
  const pose = build(res.x);
  return { ...pose, ...fastEval(fs, fb, pose.R, pose.t, P, X) };
}

/** 격자 한 축(ln 초점)에서 이웃 셋으로 포물선 꼭짓점 — 칸 하나 안으로 */
function parabolaShift(cm: number | undefined, c0: number, cp: number | undefined) {
  if (cm == null || cp == null) return 0;
  const den = cm - 2 * c0 + cp;
  if (!(den > 1e-12)) return 0;
  return Math.max(-1, Math.min(1, (cm - cp) / (2 * den)));
}

export function calibrate(
  input: CalibInput,
  /** 진단용 — 격자 프로파일(초점 배수 · 비용)을 받는다 */
  debug?: (grid: { ks: number; kb: number; cost: number }[]) => void
): Calibration | null {
  const G = pack(input, GRID_PAIRS);
  if (G.n < 40) return null;
  const Xg = new Float64Array(G.n * 3);
  const longS = Math.max(input.sideSize.W, input.sideSize.H);
  const longB = Math.max(input.backSize.W, input.backSize.H);

  /*
   * 1) 초점 프로파일 — 칸마다 8점 → 앞쪽 검사 → 다시 비춤만으로 회전 · 방향 → 그 자세에서 (다시 비춤 + 뼈 길이) 비용.
   * 두 폰이 같은 투수를 겨누면 초점은 다시 비춤으로는 거의 안 정해진다(R2) — 뼈 길이가 초점을 고른다.
   */
  const N = FOCAL_GRID.length;
  const cell: ({ fs: number; fb: number; R: Mat3; t: Vec3; cost: number } | null)[] = new Array(N * N).fill(null);
  for (let a = 0; a < N; a++) {
    for (let b = 0; b < N; b++) {
      const fs = FOCAL_GRID[a] * longS;
      const fb = FOCAL_GRID[b] * longB;
      const E = essentialPacked(G, fs, fb);
      if (!E) continue;
      const c = chooseByCheirality(decomposeEssential(E), fs, fb, G, Xg);
      if (!c) continue;
      const r = fitPose(fs, fb, c.R, c.t, G, Xg, 100);
      cell[a * N + b] = { fs, fb, R: r.R, t: r.t, cost: r.cost };
    }
  }
  const grid = cell.filter((g): g is NonNullable<typeof g> => g != null);
  if (grid.length === 0) return null;
  const sorted = [...grid].sort((x, y) => x.cost - y.cost);
  debug?.(sorted.map((g) => ({ ks: g.fs / longS, kb: g.fb / longB, cost: g.cost })));
  const top = sorted[0];
  const spreadGrid = Math.max(
    ...grid.filter((g) => g.cost <= top.cost + 1).map((g) => Math.max(Math.abs(Math.log(g.fs / top.fs)), Math.abs(Math.log(g.fb / top.fb))))
  );

  /* 2) 초점을 칸 사이로(축마다 포물선) → 그 초점에서 대응 많이로 회전 · 방향을 다시 */
  const ia = FOCAL_GRID.findIndex((k) => Math.abs(k * longS - top.fs) < 1e-6 * longS);
  const ib = FOCAL_GRID.findIndex((k) => Math.abs(k * longB - top.fb) < 1e-6 * longB);
  const costAt = (x: number, y: number) => (x >= 0 && x < N && y >= 0 && y < N ? cell[x * N + y]?.cost : undefined);
  const step = Math.log(FOCAL_GRID[1] / FOCAL_GRID[0]);
  const fs = top.fs * Math.exp(step * parabolaShift(costAt(ia - 1, ib), top.cost, costAt(ia + 1, ib)));
  const fb = top.fb * Math.exp(step * parabolaShift(costAt(ia, ib - 1), top.cost, costAt(ia, ib + 1)));
  const P = pack(input, REFINE_PAIRS);
  const X = new Float64Array(P.n * 3);
  const b = fitPose(fs, fb, top.R, top.t, P, X, 400);

  const side: Camera = { f: fs, cx: input.sideSize.W / 2, cy: input.sideSize.H / 2, R: I3, t: [0, 0, 0] };
  const back: Camera = { f: fb, cx: input.backSize.W / 2, cy: input.backSize.H / 2, R: b.R, t: b.t };
  const zb = opticalAxis(back);
  const axisAngleDeg = (Math.acos(Math.max(-1, Math.min(1, zb[2]))) * 180) / Math.PI;
  return { side, back, reproj: b.reproj, rigidity: b.rigidity, cost: b.cost, focalSpread: spreadGrid, axisAngleDeg };
}
