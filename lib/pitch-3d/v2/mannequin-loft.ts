import { add, cross, dot, normalize, scale, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import type { MannequinJoints } from '@/lib/pitch-3d/v2/mannequin-prep';
import { basis, rotate, slerp, smooth01, type Frame, type Quat } from '@/lib/pitch-3d/v2/mannequin-frames';
import {
  TORSO,
  TORSO_KEYS,
  prof,
  torsoBack,
  torsoFront,
  torsoN,
  torsoWidth,
  type Profile,
} from '@/lib/pitch-3d/v2/mannequin-profiles';

/**
 * 데생 인형 — 변형되는 겉면(몸통 · 신발)의 정점 생성. 순수(three 없음)라 시험이 같은 코드를 돈다.
 *
 * 예시 page.js 는 장면마다 BufferGeometry 를 새로 만들었다. 여기서는 **색인은 고정, 정점만 장면마다 다시 쓴다**(2026-10-11 검토 B안) —
 * 화면(app/(app)/videos/lab/[id]/mannequin/figure.ts)이 Float32Array 를 한 번 잡아 두고 writeLoft · writeTorso 로 채운 뒤 needsUpdate 만 켠다.
 */

/* ───────────────────────────── 로프트 ───────────────────────────── */

export type LoftOpts = { RN: number; K: number; n: number };

/** 정점 수 — 고리 (RN + 1) × K, 두 끝을 막으면 + 2 */
export const loftVertexCount = (RN: number, K: number, capped: boolean) => (RN + 1) * K + (capped ? 2 : 0);

/** 삼각형 색인 — 고리를 이어 붙이고, 막으면 두 끝 가운데 점으로 부채꼴. (X, U, 진행) 이 오른손 꼴일 때 법선이 바깥쪽(옆면은 예시 loft 와 반대 감김 — 예시는 양면 재질이라 안 보였다) */
export function loftIndices(RN: number, K: number, capped: boolean): number[] {
  const idx: number[] = [];
  for (let r = 0; r < RN; r++)
    for (let i = 0; i < K; i++) {
      const a = r * K + i;
      const b = r * K + ((i + 1) % K);
      idx.push(a, b, a + K, b, b + K, a + K);
    }
  if (capped) {
    const c0 = (RN + 1) * K;
    for (let i = 0; i < K; i++) idx.push(c0, (i + 1) % K, i, c0 + 1, RN * K + i, RN * K + ((i + 1) % K));
  }
  return idx;
}

/** 초타원 고리 한 바퀴를 out 에 쓴다(x 는 옆 X, y 는 위 U 로 — 위 반쪽 up, 아래 반쪽 dn) */
function writeRing(
  out: Float32Array,
  at: number,
  c: Vec3,
  X: Vec3,
  U: Vec3,
  w: number,
  up: number,
  dn: number,
  n: number,
  K: number
) {
  const e = 2 / n;
  for (let i = 0; i < K; i++) {
    const a = (i / K) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const x = w * Math.sign(ca) * Math.abs(ca) ** e;
    const y = (sa > 0 ? up : dn) * Math.sign(sa) * Math.abs(sa) ** e;
    const o = (at + i) * 3;
    out[o] = c[0] + X[0] * x + U[0] * y;
    out[o + 1] = c[1] + X[1] * x + U[1] * y;
    out[o + 2] = c[2] + X[2] * x + U[2] * y;
  }
}

/**
 * 길이 방향 고리를 이어 만든 겉면(신발 · 밑창) — 예시 loft 와 같은 정점 차례. P(t) 가운데, X 옆 · U 위, w 너비 · up 위 · dn 아래.
 * out 은 loftVertexCount × 3.
 */
export function writeLoft(
  out: Float32Array,
  P: (t: number) => Vec3,
  X: Vec3,
  U: Vec3,
  w: (t: number) => number,
  up: (t: number) => number,
  dn: (t: number) => number,
  { RN, K, n }: LoftOpts,
  capped = true
) {
  for (let r = 0; r <= RN; r++) {
    const t = r / RN;
    writeRing(out, r * K, P(t), X, U, w(t), up(t), dn(t), n, K);
  }
  if (capped) {
    const c0 = (RN + 1) * K;
    const p0 = P(0);
    const p1 = P(1);
    out.set(p0, c0 * 3);
    out.set(p1, (c0 + 1) * 3);
  }
}

/** 정점 법선 — 색인으로 면 법선을 모아 평균(three 의 computeVertexNormals 와 같은 결과) */
export function computeNormals(pos: Float32Array, index: readonly number[], out: Float32Array) {
  out.fill(0);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3;
    const b = index[i + 1] * 3;
    const c = index[i + 2] * 3;
    const abx = pos[b] - pos[a];
    const aby = pos[b + 1] - pos[a + 1];
    const abz = pos[b + 2] - pos[a + 2];
    const acx = pos[c] - pos[a];
    const acy = pos[c + 1] - pos[a + 1];
    const acz = pos[c + 2] - pos[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const v of [a, b, c]) {
      out[v] += nx;
      out[v + 1] += ny;
      out[v + 2] += nz;
    }
  }
  for (let v = 0; v < out.length; v += 3) {
    const l = Math.hypot(out[v], out[v + 1], out[v + 2]) || 1;
    out[v] /= l;
    out[v + 1] /= l;
    out[v + 2] /= l;
  }
}

/* ───────────────────────────── 캣멀롬(구심) ───────────────────────────── */

/**
 * three 의 CatmullRomCurve3(centripetal) 과 같은 곡선 — 양 끝은 밖으로 늘린 점(2·P0 − P1), 매듭 사이 간격은 거리²^0.25,
 * 겹친 점은 보정. getTangent 는 ±0.0001 차분.
 */
export function catmullRom(points: readonly Vec3[]) {
  const l = points.length;
  const axis = (x0: number, x1: number, x2: number, x3: number, dt0: number, dt1: number, dt2: number) => {
    let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
    let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
    t1 *= dt1;
    t2 *= dt1;
    return [x1, t1, -3 * x1 + 3 * x2 - 2 * t1 - t2, 2 * x1 - 2 * x2 + t1 + t2];
  };
  const point = (t: number): Vec3 => {
    const p = (l - 1) * t;
    let intPoint = Math.floor(p);
    let weight = p - intPoint;
    if (weight === 0 && intPoint === l - 1) {
      intPoint = l - 2;
      weight = 1;
    }
    const p1 = points[intPoint];
    const p2 = points[intPoint + 1];
    const p0: Vec3 = intPoint > 0 ? points[intPoint - 1] : sub(scale(points[0], 2), points[1]);
    const p3: Vec3 = intPoint + 2 < l ? points[intPoint + 2] : sub(scale(points[l - 1], 2), points[l - 2]);
    const d2 = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    let dt0 = d2(p0, p1) ** 0.25;
    let dt1 = d2(p1, p2) ** 0.25;
    let dt2 = d2(p2, p3) ** 0.25;
    if (dt1 < 1e-4) dt1 = 1;
    if (dt0 < 1e-4) dt0 = dt1;
    if (dt2 < 1e-4) dt2 = dt1;
    const out: Vec3 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const [c0, c1, c2, c3] = axis(p0[c], p1[c], p2[c], p3[c], dt0, dt1, dt2);
      const w2 = weight * weight;
      out[c] = c0 + c1 * weight + c2 * w2 + c3 * w2 * weight;
    }
    return out;
  };
  const tangent = (t: number): Vec3 => {
    const d = 0.0001;
    const a = point(Math.max(0, t - d));
    const b = point(Math.min(1, t + d));
    return normalize(sub(b, a));
  };
  return { point, tangent };
}

/* ───────────────────────────── 몸통 ───────────────────────────── */

export type TorsoRing = { c: Vec3; X: Vec3; Y: Vec3; Fw: Vec3; q: Quat };

export type TorsoModel = {
  /** t(0 사타구니 ~ 1 목) 의 고리 틀 — 가운데 · 옆 · 길이 방향 · 앞 · 회전 */
  ring: (t: number) => TorsoRing;
  /** t 의 너비 · 앞 두께 · 뒤 두께 */
  width: (t: number) => number;
  front: (t: number) => number;
  back: (t: number) => number;
  /** 가운데 선 점열(t, 점) — 멈춤 화면의 척추 구슬이 쓴다 */
  C: readonly (readonly [number, Vec3])[];
  crotch: Vec3;
  neck: Vec3;
  hm: Vec3;
  shm: Vec3;
  hw: number;
  sw: number;
};

const mid3 = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);

/**
 * 몸통 마디 셋(가운데 · 좌우 축 단위) — 좌우 축의 부호는 골반 틀 → 가슴 틀을 높이대로 섞은 방향과 같은 쪽(던지는 쪽, 좌투 거울 뒤에도).
 * 마디가 없거나 좌우 점이 가운데에 붙어 있으면(못 잰 높이) null.
 */
function trunkLevelsOf(J: MannequinJoints, pf: Frame, cf: Frame): { c: Vec3; x: Vec3 }[] | null {
  const pairs: [Vec3 | undefined, Vec3 | undefined][] = [
    [J.t1, J.t1s],
    [J.t2, J.t2s],
    [J.t3, J.t3s],
  ];
  const fr = [0.41, 0.6, 0.83];
  const out: { c: Vec3; x: Vec3 }[] = [];
  for (let i = 0; i < 3; i++) {
    const [c, s] = pairs[i];
    if (!c || !s) return null;
    const d = sub(s, c);
    if (Math.hypot(...d) < 1e-6) return null;
    let x = normalize(d);
    const ref = add(scale(pf.xa, 1 - fr[i]), scale(cf.xa, fr[i]));
    if (dot(x, ref) < 0) x = scale(x, -1);
    out.push({ c, x });
  }
  return out;
}
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

/**
 * 몸통 모델 — 사타구니부터 목 밑까지 한 겹. 아래는 골반 틀, 위는 가슴 틀을 따르고 그 사이에서 돌아간다.
 * 가운데 선은 매끈한 곡선, 단면은 늘 그 곡선에 수직(허리를 숙여도 단면끼리 접히지 않게).
 *
 * 몸통 마디(J.t1 · t2 · t3 와 좌우 점 — trunk.ts, 2026-10-12)가 있으면 가운데 선의 허리 · 가슴 밑 · 가슴 세 점과 그 높이의 좌우 축을 그것으로 —
 * 골반 → 허리 → 등이 따로 꼬이고 휜다(꽈배기처럼). 없으면 예전처럼 곧은 축 위 세 점 · 골반 틀 → 가슴 틀 사이를 고르게 돌림.
 * 세 높이(엉덩이 → 어깨의 0.41 · 0.60 · 0.83)는 예전 세 점(축 위 0.4125 · 0.604 · 0.829)과 같은 자리라 마디가 없을 때와 이어진다.
 */
export function torsoModel(J: MannequinJoints, pf: Frame, cf: Frame, k: number): TorsoModel {
  const hm = mid3(J.rh, J.lh);
  const shm = mid3(J.sh, J.gs);
  const hw = Math.min(Math.hypot(...sub(J.rh, J.lh)) / 2, 0.1 * k);
  const sw = Math.hypot(...sub(J.sh, J.gs)) / 2;
  const crotch = add(add(hm, scale(pf.ya, -0.075 * k)), scale(pf.fw, -0.01 * k));
  const neck = add(shm, scale(cf.ya, 0.075 * k));
  const lv = trunkLevelsOf(J, pf, cf);
  const pts: Vec3[] = lv
    ? [crotch, hm, lv[0].c, lv[1].c, lv[2].c, shm, neck]
    : [crotch, hm, lerp3(hm, J.td, 0.75), lerp3(J.td, shm, 0.12), lerp3(J.td, shm, 0.62), shm, neck];
  const C = TORSO_KEYS.map((t, i) => [t, pts[i]] as const);
  const W = torsoWidth(hw, sw, k);
  const DF = torsoFront(k);
  const DB = torsoBack(k);
  const sp = catmullRom(pts);
  const tk = TORSO_KEYS;
  /* 높이마다 좌우 축 — 골반 틀(사타구니 · 엉덩이) · 마디 셋 · 가슴 틀(어깨 · 목) */
  const sides: Vec3[] | null = lv ? [pf.xa, pf.xa, lv[0].x, lv[1].x, lv[2].x, cf.xa, cf.xa] : null;
  const ring = (t: number): TorsoRing => {
    let i = 1;
    while (i < tk.length - 1 && t > tk[i]) i++;
    const f = Math.min(1, Math.max(0, (t - tk[i - 1]) / (tk[i] - tk[i - 1])));
    const u = Math.min(1, Math.max(0, (i - 1 + f) / (tk.length - 1)));
    const c = sp.point(u);
    const Y = sp.tangent(u);
    let X: Vec3;
    if (sides) {
      const s = smooth01(f);
      X = add(scale(sides[i - 1], 1 - s), scale(sides[i], s));
    } else {
      X = rotate(slerp(pf.q, cf.q, smooth01((t - 0.2) / 0.5)), [1, 0, 0]);
    }
    X = normalize(sub(X, scale(Y, dot(X, Y))));
    const Fw = cross(Y, X);
    return { c, X, Y, Fw, q: basis(X, Y, scale(Fw, -1)) };
  };
  return {
    ring,
    width: (t) => prof(W, t),
    front: (t) => prof(DF, t),
    back: (t) => prof(DB, t),
    C,
    crotch,
    neck,
    hm,
    shm,
    hw,
    sw,
  };
}

/** 몸통 두 겹의 정점 수 — 바지 고리 0..split, 상의 고리 split..RN(둘 다 끝을 막지 않는다) */
export const TORSO_PANTS_VERTS = (TORSO.split + 1) * TORSO.K;
export const TORSO_SHIRT_VERTS = (TORSO.RN - TORSO.split + 1) * TORSO.K;

/** 몸통 두 겹의 색인(열린 고리 띠) */
export const torsoIndices = () => ({
  pants: loftIndices(TORSO.split, TORSO.K, false),
  shirt: loftIndices(TORSO.RN - TORSO.split, TORSO.K, false),
});

/** 몸통 정점 쓰기 — 예시 torso 와 같은 고리 · 같은 차례 */
export function writeTorso(model: TorsoModel, pants: Float32Array, shirt: Float32Array) {
  const { RN, K, split } = TORSO;
  for (let r = 0; r <= RN; r++) {
    const t = r / RN;
    const { c, X, Fw } = model.ring(t);
    const w = model.width(t);
    const df = model.front(t);
    const db = model.back(t);
    const n = torsoN(t);
    if (r <= split) writeRing(pants, r * K, c, X, Fw, w, df, db, n, K);
    if (r >= split) writeRing(shirt, (r - split) * K, c, X, Fw, w, df, db, n, K);
  }
}

/** 신발 — 예시 shoe 의 틀: fx 발 축 · U 위 · X 옆, 시작점 s0(뒤꿈치 뒤 2.5%), 가운데 선 P(t) */
export function shoeAxes(heel: Vec3, toe: Vec3, up0: Vec3, k: number) {
  const fx = normalize(sub(toe, heel));
  const l = Math.max(Math.hypot(...sub(toe, heel)), 0.25 * k);
  const U = normalize(sub(up0, scale(fx, dot(up0, fx))));
  /* 옆 축은 U × fx — (X, U, fx) 가 오른손 꼴이라 고리 감김이 바깥 법선이 된다(몸통도 같은 꼴) */
  const X = cross(U, fx);
  const s0 = add(heel, scale(fx, -0.025 * k));
  const P = (t: number): Vec3 => add(add(s0, scale(fx, t * l)), scale(U, 0.018 * k));
  const Ps = (t: number): Vec3 => add(P(t), scale(U, -0.008 * k));
  return { fx, U, X, P, Ps, l };
}

/* ───────────────────────────── 호 관 · 부채꼴(멈춤 화면의 잰 선) ───────────────────────────── */

/**
 * 점열을 따라가는 관(잰 호) — 고리 i 는 points[min(i, 끝)] 에, 접선은 이웃 점으로(끝은 한쪽만). 점이 cap 보다 적으면 남은 고리는
 * 마지막 점에 겹쳐 둔다(넓이 0 → 안 보임). 색인은 loftIndices(cap − 1, K, true), 정점 수 loftVertexCount(cap − 1, K, true).
 * (X, U, 접선) 이 오른손 꼴이라 법선은 바깥쪽.
 */
export function writeTube(out: Float32Array, points: readonly Vec3[], normal: Vec3, r: number, cap: number, K: number) {
  const last = points.length - 1;
  const n = normalize(normal);
  const seed: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const fallback = normalize(cross(n, seed));
  for (let i = 0; i < cap; i++) {
    const j = Math.min(i, last);
    let t: Vec3 = fallback;
    if (last > 0) {
      const d = sub(points[Math.min(last, j + 1)], points[Math.max(0, j - 1)]);
      if (dot(d, d) > 1e-18) t = normalize(d);
    }
    let X = cross(n, t);
    if (dot(X, X) < 1e-18) X = fallback;
    X = normalize(X);
    const U = cross(t, X);
    writeRing(out, i * K, points[j], X, U, r, r, r, 2, K);
  }
  const c0 = cap * K;
  out.set(points[0], c0 * 3);
  out.set(points[last], (c0 + 1) * 3);
}

/** 부채꼴 면 — out[0] 가운데, 그 뒤 점열(모자라면 마지막 점 반복). 정점 cap + 1 */
export function writeFan(out: Float32Array, c: Vec3, points: readonly Vec3[], cap: number) {
  const last = points.length - 1;
  out.set(c, 0);
  for (let i = 1; i <= cap; i++) out.set(points[Math.min(i - 1, last)], i * 3);
}

/** 부채꼴 색인 — (0, i, i+1), 삼각형 cap − 1 개 */
export function fanIndices(cap: number): number[] {
  const idx: number[] = [];
  for (let i = 1; i < cap; i++) idx.push(0, i, i + 1);
  return idx;
}

export type { Profile };
