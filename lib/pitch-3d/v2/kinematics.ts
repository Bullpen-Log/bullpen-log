import {
  add,
  cross,
  dot,
  fromCols,
  median,
  mul3,
  mulV,
  norm,
  normalize,
  scale,
  sub,
  transpose,
  type Mat3,
  type Vec3,
} from '@/lib/pitch-3d/linalg';
import { V2J, type V2Contact } from '@/lib/pitch-3d/v2/contract';

/**
 * 관절 각도 모델(2026-10-09 김민: "관절 각도 모델로 가자" — 점 규칙으로는 어깨 · 팔꿈치 회전 · 손 · 글러브 팔 · 목이 계속 어색했다).
 *
 * 맞춘 관절 점(25)을 사람 뼈대의 관절 각도로 바꾸고, 각도에 사람 몸의 한계를 넣고, 각도를 시간으로 다듬은 뒤, 고정 뼈 길이로 다시 점을 만든다.
 *
 *   골반(세상 방향 · 자리) → 몸통(골반에 대한 돌림 · 기울임) → 목 · 머리(몸통에 대해)
 *   어깨: 위팔 방향(몸통 틀) + 위팔 비틀림(팔꿈치가 굽는 면) · 팔꿈치 굽힘 · 아래팔 비틀림(손바닥 폭) · 손목 굽힘 · 옆
 *   엉덩이: 넙다리 방향(골반 틀) + 넙다리 비틀림(무릎이 굽는 면) · 무릎 굽힘 · 발(정강이 틀)
 *
 * 점에서 바로 그리면 거의 편 팔꿈치 · 무릎에서 굽는 면을 못 정해 팔이 홱 돌거나 반대로 꺾였다 — 여기서는 비틀림을 '보이는 만큼' 믿고
 * (굽힘이 클수록 · 확신이 높을수록) 안 보이는 장면은 앞뒤에서 잇는다. 반대로 꺾인 팔꿈치 · 무릎은 비틀림 반 바퀴 + 음의 굽힘으로 읽어
 * 앞 장면과 가까운 쪽을 고르고, 음의 굽힘(과신전)은 5° 까지만.
 *
 * 땅에 닿은 발(엔진의 contacts)은 그 자리에 두고 무릎을 두 마디 길이로 다시 접는다. 순수 함수 — 시험: scripts/pitch-3d-v2-selftest.mts.
 */

/**
 * 한 장면에 rate(라디안, 장면마다 다를 수 있음)까지만 바뀌게 — 앞으로 · 뒤로 한 번씩 묶어 가운데로(한쪽으로 늦지 않게).
 * 팔이 굽는 면 · 손 돌림이 한 장면에 80~90° 휙 돌던 것(편 팔꿈치에서 들고 있던 값 → 굽기 시작한 장면의 잰 값, 흐린 손 점)을 몇 장면에 걸쳐 돌게 한다.
 */
function rateLimit(xs: number[], rate: number | number[]): number[] {
  const r = (k: number) => (typeof rate === 'number' ? rate : rate[k]);
  const f = [...xs];
  for (let k = 1; k < f.length; k++) f[k] = f[k - 1] + clamp(f[k] - f[k - 1], -r(k), r(k));
  const b = [...xs];
  for (let k = b.length - 2; k >= 0; k--)
    b[k] = b[k + 1] + clamp(b[k] - b[k + 1], -r(k + 1), r(k + 1));
  return f.map((v, k) => (v + b[k]) / 2);
}

/** rateLimit 의 방향(단위 벡터)판 — 한 장면에 rate 라디안까지만 돈다 */
function rateLimitDir(vs: Vec3[], rate: number | number[]): Vec3[] {
  const r = (k: number) => (typeof rate === 'number' ? rate : rate[k]);
  const step = (from: Vec3, to: Vec3, m: number): Vec3 => {
    const ax = cross(from, to);
    const a = Math.atan2(norm(ax), dot(from, to));
    if (a <= m) return to;
    return norm(ax) > 1e-9 ? rot(from, normalize(ax), m) : from;
  };
  const f = [...vs];
  for (let k = 1; k < f.length; k++) f[k] = step(f[k - 1], vs[k], r(k));
  const b = [...vs];
  for (let k = b.length - 2; k >= 0; k--) b[k] = step(b[k + 1], vs[k], r(k + 1));
  return f.map((v, k) => unit(add(v, b[k]), v));
}

/** rateLimit 의 회전(사원수)판 */
function rateLimitQuat(qs: Quat[], rate: number): Quat[] {
  const step = (from: Quat, to: Quat): Quat => {
    let d = qMul(qConj(from), to);
    if (d[0] < 0) d = [-d[0], -d[1], -d[2], -d[3]];
    const a = 2 * Math.acos(clamp(d[0], -1, 1));
    const s = Math.sin(a / 2);
    if (a <= rate || s < 1e-9) return to;
    return qNorm(
      qMul(from, [Math.cos(rate / 2), ...scale([d[1] / s, d[2] / s, d[3] / s], Math.sin(rate / 2))] as Quat)
    );
  };
  const f = [...qs];
  for (let k = 1; k < f.length; k++) f[k] = step(f[k - 1], qs[k]);
  const b = [...qs];
  for (let k = b.length - 2; k >= 0; k--) b[k] = step(b[k + 1], qs[k]);
  return f.map((q, k) => {
    const sg = q[0] * b[k][0] + q[1] * b[k][1] + q[2] * b[k][2] + q[3] * b[k][3] < 0 ? -1 : 1;
    return qNorm([q[0] + sg * b[k][0], q[1] + sg * b[k][1], q[2] + sg * b[k][2], q[3] + sg * b[k][3]]);
  });
}

/*
 * 몸통 · 목 한계는 투구에서 실제로 나오는 만큼 넉넉히 — 60 · 55 · 70 · 45 일 때 좌투 샘플의 골반-어깨 꼬임 · 공 놓은 뒤 숙임과 고개가 잘려 팔 · 머리가
 * 영상에서 멀어졌다(2026-10-09 샘플 3 던지는 팔 착지~릴리스 3.2 → 2.3%, 샘플 4 머리 릴리스 뒤 3.0 → 2.0%). 여기 '몸통'은 엉덩이 가운데 → 어깨 가운데를
 * 엉덩이선 틀로 본 것이라 해부학 척추 범위보다 크게 읽힌다. 반 바퀴 도는 몸통 · 고개 같은 말도 안 되는 자세는 여전히 막는다.
 */
export const KIN_LIMITS = {
  spineTwist: 80,
  spineSwing: 75,
  neckTwist: 85,
  neckSwing: 65,
  /** 위팔이 어깨선 뒤로(수평면) */
  shoulderBack: 45,
  /** 어깨선이 몸통 축 수직에서 위아래로(어깨뼈 올림 · 내림) */
  shoulderTilt: 35,
  elbowFlex: 150,
  elbowHyper: 5,
  kneeFlex: 150,
  kneeHyper: 5,
  wristFlex: 75,
  wristDev: 30,
  /** 아래팔 비틀림 — 그 클립의 가운데에서 ± */
  pronation: 90,
  /** 엉덩이 돌림(무릎이 골반 앞을 볼 때 0) ± — 사람 범위 안 · 밖 각 45° 에 잰 값 흔들림을 더해, 무릎이 골반 뒤를 보지 않게 */
  hipRotation: 70,
  /**
   * 엉덩이가 안 보일수록(골반 방향을 모를수록) 엉덩이 돌림 한계에 더하는 폭 — 엉덩이가 가려져 엔진의 골반이 착지 직전 늦게 열리면(좌투 샘플
   * 103~159°) 영상과 맞는 다리를 그 골반에 맞춰 돌리게 되어 발이 영상에서 50cm 넘게 벗어났다. 못 본 골반으로 '사람이 못 하는 다리'라 할 수 없다.
   */
  hipRotationUnseen: 110,
  /** 한 장면(60fps)에 팔 · 다리가 굽는 면이 도는 최대 */
  twistRatePerFrame: 20,
  /** 한 장면에 손(아래팔 엎침)이 도는 최대 — 손 점이 작고 흐려 손바닥 방향이 장면마다 30~50° 흔들렸다 */
  pronationRatePerFrame: 8,
  /** 한 장면에 손목이 굽거나 옆으로 꺾이는 최대 */
  wristRatePerFrame: 12,
} as const;

/**
 * 사람 관절이 낼 수 있는 가장 빠른 각속도(°/초) — 투구 연구의 최대값(골반 ~700 · 몸통 ~1200 · 무릎 펴기 ~900 · 팔꿈치 펴기 ~2500)보다
 * 넉넉히. 엔진이 한 장면 잘못 맞춘 관절(2026-10-09 좌투 샘플: 땅을 디딘 앞무릎이 한 장면에 16cm · 넙다리 28°)이 화면에서 '휙' 하지 않게
 * 한 장면에 이만큼까지만 돈다. 슬로모는 영상 1초가 실제로는 더 짧아 이 상한이 더 넉넉해진다(실제 움직임은 안 깎는다).
 */
export const KIN_SPEED = {
  pelvis: 1200,
  spine: 1200,
  neck: 600,
  shoulderTilt: 600,
  throwUpperArm: 2700,
  throwElbow: 3000,
  gloveUpperArm: 1200,
  gloveElbow: 1500,
  thigh: 900,
  knee: 900,
  /** 땅을 디딘 다리 */
  plantedThigh: 480,
  plantedKnee: 600,
} as const;

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const perp = (v: Vec3, a: Vec3): Vec3 => sub(v, scale(a, dot(v, a)));
const midOf = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);
const unit = (v: Vec3, fallback: Vec3): Vec3 =>
  norm(v) > 1e-9 ? normalize(v) : fallback;

/** 단위 축 k 둘레로 v 를 th 만큼 */
function rot(v: Vec3, k: Vec3, th: number): Vec3 {
  const c = Math.cos(th);
  return add(
    add(scale(v, c), scale(cross(k, v), Math.sin(th))),
    scale(k, dot(k, v) * (1 - c))
  );
}

/** 가장 짧게 a → b 로 도는 회전을 v 에 */
function rotFromTo(v: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ax = cross(a, b);
  const s = norm(ax);
  const c = dot(a, b);
  if (s < 1e-9) return c > 0 ? v : rot(v, unit(perp([1, 0, 0], a), [0, 0, 1]), Math.PI);
  return rot(v, scale(ax, 1 / s), Math.atan2(s, c));
}

/** 축 a 둘레로 from → to 의 부호 있는 각(둘 다 a 에 수직 성분만) */
function signedAngle(from: Vec3, to: Vec3, a: Vec3): number {
  return Math.atan2(dot(cross(from, to), a), dot(from, to));
}

/* ───────────────────────────── 사원수 ───────────────────────────── */

type Quat = [number, number, number, number];

function quatFromMat(m: Mat3): Quat {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [(m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s];
  }
  return qNorm(q);
}

function matFromQuat([w, x, y, z]: Quat): Mat3 {
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - w * z),
    2 * (x * z + w * y),
    2 * (x * y + w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z - w * x),
    2 * (x * z - w * y),
    2 * (y * z + w * x),
    1 - 2 * (x * x + y * y),
  ];
}

const qNorm = (q: Quat): Quat => {
  const n = Math.hypot(...q) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
const qMul = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const qConj = (q: Quat): Quat => [q[0], -q[1], -q[2], -q[3]];

/** 회전을 축 a(단위, 같은 틀) 둘레 비틀림과 나머지(기울임)로 — 각을 한계 안으로 줄여 다시 합친다 */
function limitSwingTwist(q: Quat, a: Vec3, twistMax: number, swingMax: number): Quat {
  const p = q[1] * a[0] + q[2] * a[1] + q[3] * a[2];
  let twist: Quat = qNorm([q[0], a[0] * p, a[1] * p, a[2] * p]);
  if (Math.hypot(twist[0], p) < 1e-9) twist = [1, 0, 0, 0];
  let swing = qMul(q, qConj(twist));
  const tw =
    2 * Math.atan2(twist[1] * a[0] + twist[2] * a[1] + twist[3] * a[2], twist[0]);
  const twC = clamp(Math.atan2(Math.sin(tw), Math.cos(tw)), -twistMax, twistMax);
  twist = [
    Math.cos(twC / 2),
    a[0] * Math.sin(twC / 2),
    a[1] * Math.sin(twC / 2),
    a[2] * Math.sin(twC / 2),
  ];
  if (swing[0] < 0) swing = [-swing[0], -swing[1], -swing[2], -swing[3]];
  const sw = 2 * Math.acos(clamp(swing[0], -1, 1));
  if (sw > swingMax) {
    const s = Math.sin(sw / 2);
    if (s > 1e-9) {
      const ax: Vec3 = [swing[1] / s, swing[2] / s, swing[3] / s];
      swing = [Math.cos(swingMax / 2), ...scale(ax, Math.sin(swingMax / 2))] as Quat;
    }
  }
  return qNorm(qMul(swing, twist));
}

/* ───────────────────────────── 시간 다듬기 ───────────────────────────── */

/** 빠르기 기준의 바닥(라디안 · 키 / 장면) — 이보다 느린 움직임은 넓게 다듬는다 */
const VREF_FLOOR = 0.02;

/**
 * 무게(보이는 만큼) 있는 앞뒤 가우스 — 빠른 곳은 좁게, 느린 곳은 넓게. xs 는 여러 성분(벡터 · 사원수)을 한꺼번에 — 빠르기는 성분 전체로.
 *
 * 폭은 앞뒤 3장면으로 고른다 — 장면마다 폭이 크게 달라지면 이웃 장면 값이 계단처럼 튀었다(2026-10-09 좌투 샘플: 다듬은 손목이 원본보다 더
 * 떨림 0.62 → 1.08). widen 이면 주변 무게가 모자랄 때 폭을 넓혀 앞뒤에서 잇는다 — 팔을 편 장면에서 굽는 면(비틀림 · 엎침)을 못 볼 때만 쓴다.
 * 다른 값에 넓힘(폭 최대 23배)을 쓰면 흐린 장면을 멀리서 끌어와 영상과 멀어졌다.
 */
function smoothMulti(
  xs: number[][],
  ws: number[],
  sMin = 0.6,
  sMax = 2.2,
  widen = false
): number[][] {
  const n = xs.length;
  if (n < 3) return xs.map((x) => [...x]);
  const D = xs[0].length;
  /*
   * 빠르기는 한 번 넓게 다듬은 값에서 잰다 — 날 값에서 재면 잡음이 '빠름'으로 읽혀 가만있는 관절의 떨림을 못 줄였다. 기준은 그 값의
   * 상위 10% 의 4분의 1(빠른 팔은 좁게), 다만 VREF_FLOOR 밑으로는 안 내려간다(잡음뿐인 값에서 기준까지 잡음이 되지 않게).
   */
  const pre = xs.map((_, k) => {
    let sw = 0;
    const acc = new Array<number>(D).fill(0);
    for (let q = Math.max(0, k - 4); q <= Math.min(n - 1, k + 4); q++) {
      const g = (ws[q] + 1e-3) * Math.exp(-((q - k) ** 2) / (2 * 1.5 * 1.5));
      sw += g;
      for (let d = 0; d < D; d++) acc[d] += g * xs[q][d];
    }
    return acc.map((v) => v / sw);
  });
  const speed = pre.map((_, k) => {
    const a = pre[Math.max(0, k - 1)];
    const b = pre[Math.min(n - 1, k + 1)];
    let s = 0;
    for (let d = 0; d < D; d++) s += (b[d] - a[d]) ** 2;
    return Math.sqrt(s) / 2;
  });
  const sorted = [...speed].sort((a, b) => a - b);
  const vRef = Math.max(VREF_FLOOR, 0.25 * sorted[Math.floor(sorted.length * 0.9)]);
  const sig0 = speed.map((v) => sMin + (sMax - sMin) / (1 + (v / vRef) ** 2));
  const sig = sig0.map((_, k) => {
    let a = 0;
    let c = 0;
    for (let q = Math.max(0, k - 3); q <= Math.min(n - 1, k + 3); q++) {
      a += sig0[q];
      c++;
    }
    return a / c;
  });
  return xs.map((x, k) => {
    let sigma = sig[k];
    for (let tries = 0; tries < (widen ? 5 : 1); tries++) {
      const r = Math.ceil(sigma * 2.5);
      let sw = 0;
      const acc = new Array<number>(D).fill(0);
      for (let q = Math.max(0, k - r); q <= Math.min(n - 1, k + r); q++) {
        const g = ws[q] * Math.exp(-((q - k) ** 2) / (2 * sigma * sigma));
        sw += g;
        for (let d = 0; d < D; d++) acc[d] += g * xs[q][d];
      }
      if (sw > 0.15 || (!widen && sw > 0)) return acc.map((v) => v / sw);
      sigma *= 2.2;
    }
    return [...x];
  });
}

/** 각을 이어 붙인다(한 장면에 2π 넘게 튀지 않게) */
function unwrap(xs: number[]): number[] {
  const out = [...xs];
  for (let k = 1; k < out.length; k++) {
    let d = out[k] - out[k - 1];
    while (d > Math.PI) {
      out[k] -= 2 * Math.PI;
      d -= 2 * Math.PI;
    }
    while (d < -Math.PI) {
      out[k] += 2 * Math.PI;
      d += 2 * Math.PI;
    }
  }
  return out;
}

const smooth1 = (xs: number[], ws: number[], sMin?: number, sMax?: number, widen = false) =>
  smoothMulti(
    xs.map((x) => [x]),
    ws,
    sMin,
    sMax,
    widen
  ).map((v) => v[0]);

function smoothUnit(vs: Vec3[], ws: number[]): Vec3[] {
  return smoothMulti(vs as number[][], ws).map((v) => unit(v as Vec3, [0, -1, 0]));
}

function smoothQuat(qs: Quat[], ws: number[], sMin?: number, sMax?: number): Quat[] {
  const c = qs.map((q) => [...q] as Quat);
  for (let k = 1; k < c.length; k++)
    if (
      c[k][0] * c[k - 1][0] +
        c[k][1] * c[k - 1][1] +
        c[k][2] * c[k - 1][2] +
        c[k][3] * c[k - 1][3] <
      0
    )
      c[k] = [-c[k][0], -c[k][1], -c[k][2], -c[k][3]];
  return smoothMulti(c, ws, sMin, sMax).map((q) => qNorm(q as Quat));
}

/** 무게 있는 가운데값(각 — 이어 붙인 값으로) */
function weightedMedian(xs: number[], ws: number[]): number {
  const pairs = xs.map((x, i) => [x, ws[i]] as const).filter(([, w]) => w > 0.2);
  if (!pairs.length) return median(xs);
  return median(pairs.map(([x]) => x));
}

/* ───────────────────────────── 틀 ───────────────────────────── */

/** 열 = [왼쪽, 위, 앞] (앞 = 왼쪽 × 위) */
const frameOf = (left: Vec3, up: Vec3): Mat3 => fromCols(left, up, cross(left, up));
const toLocal = (M: Mat3, v: Vec3): Vec3 => mulV(transpose(M), v);
const toWorld = (M: Mat3, v: Vec3): Vec3 => mulV(M, v);

const DOWN: Vec3 = [0, -1, 0];
/** 쉬는 자세(팔 · 다리를 아래로)에서 굽는 면의 축 — 팔꿈치는 아래팔이 앞으로(오른쪽 축), 무릎은 정강이가 뒤로(왼쪽 축) */
const ELBOW_REST_AXIS: Vec3 = [-1, 0, 0];
const KNEE_REST_AXIS: Vec3 = [1, 0, 0];
/** 위팔 방향 → 비틀림 0 의 팔꿈치 축(아래 → 위팔로 가장 짧게 돌린 쉬는 축) */
const elbowRef = (u: Vec3): Vec3 => rotFromTo(ELBOW_REST_AXIS, DOWN, u);
/**
 * 넙다리 방향 → 비틀림 0 의 무릎 축 = 골반 좌우축을 넙다리에 수직으로(해부학 엉덩이 돌림 0). 예전엔 팔처럼 '아래 → 넙다리로 가장 짧게 돌린
 * 축'이라 다리를 높이 들면 기준이 같이 돌아 비틀림이 120° 넘게 바뀌었고, 그것을 클립 가운데 ±60° 로 묶어 영상과 맞는 앞다리를 착지 직전에
 * 56cm 엉뚱하게 그렸다(2026-10-09 좌투 샘플 · 우투 샘플도 18cm). 넙다리가 거의 옆을 가리키면(쓸 일 거의 없음) 예전 축 쪽으로 섞는다.
 */
const kneeRef = (u: Vec3): Vec3 => {
  const p = perp(KNEE_REST_AXIS, u);
  const w = clamp((norm(p) - 0.2) / 0.2, 0, 1);
  return unit(
    add(scale(unit(p, KNEE_REST_AXIS), w), scale(rotFromTo(KNEE_REST_AXIS, DOWN, u), 1 - w)),
    rotFromTo(KNEE_REST_AXIS, DOWN, u)
  );
};

type Limb = {
  /** 몸 틀(팔은 몸통, 다리는 골반)에서 위 마디 방향 */
  dir: Vec3[];
  /** 위 마디 비틀림(쉬는 축에서) */
  twist: number[];
  twistW: number[];
  /** 굽힘(라디안, 음수 = 과신전) */
  flex: number[];
  flexW: number[];
};

/** 두 마디(어깨 → 팔꿈치 → 손목, 엉덩이 → 무릎 → 발목)를 방향 · 비틀림 · 굽힘으로 */
function limbAngles(
  frames: Vec3[][],
  bodyM: Mat3[],
  [A, B, C]: [number, number, number],
  /** 위 마디 방향 → 비틀림 0 일 때 가운데 관절이 굽는 축 */
  refOf: (u: Vec3) => Vec3,
  conf: (k: number, j: number) => number,
  flexMaxDeg: number,
  hyperDeg: number
): Limb {
  const out: Limb = { dir: [], twist: [], twistW: [], flex: [], flexW: [] };
  let prevTwist: number | null = null;
  frames.forEach((fr, k) => {
    const M = bodyM[k];
    const u = toLocal(M, unit(sub(fr[B], fr[A]), toWorld(M, DOWN)));
    const f = toLocal(M, unit(sub(fr[C], fr[B]), toWorld(M, DOWN)));
    const th = Math.atan2(norm(cross(u, f)), dot(u, f));
    const nRef = refOf(u);
    let twist: number;
    let flex: number;
    const c = cross(u, f);
    if (norm(c) > 1e-6) {
      twist = signedAngle(nRef, normalize(c), u);
      flex = th;
    } else {
      twist = prevTwist ?? 0;
      flex = th;
    }
    /* 반대로 꺾임 = 비틀림 반 바퀴 + 음의 굽힘 — 거의 편 마디에서만, 앞 장면 비틀림에 가까운 쪽 */
    if (prevTwist != null && th < rad(40)) {
      const alt = twist + Math.PI;
      const d0 = Math.abs(
        Math.atan2(Math.sin(twist - prevTwist), Math.cos(twist - prevTwist))
      );
      const d1 = Math.abs(
        Math.atan2(Math.sin(alt - prevTwist), Math.cos(alt - prevTwist))
      );
      if (d1 < d0) {
        twist = alt;
        flex = -th;
      }
    }
    flex = clamp(flex, -rad(hyperDeg), rad(flexMaxDeg));
    const cAll = Math.min(conf(k, A), conf(k, B), conf(k, C));
    out.dir.push(u);
    out.twist.push(twist);
    /* 비틀림은 굽힘이 클수록 보인다(10° 밑이면 못 봄, 35° 넘으면 다) */
    out.twistW.push(cAll * clamp((th - rad(10)) / rad(25), 0, 1) + 0.01);
    out.flex.push(flex);
    out.flexW.push(cAll + 0.01);
    prevTwist = twist;
  });
  out.twist = unwrap(out.twist);
  return out;
}

/**
 * 두 마디 끝을 새 자리로 — 위 관절은 두고, 가운데 관절은 굽어 있던 쪽으로 접는다(길이 그대로).
 * hint = 가운데 관절이 굽는 쪽(무릎이면 앞). 거의 편 마디는 굽어 있던 쪽이 잡음이라 장면마다 무릎이 앞뒤 · 안팎으로 뒤집혔다
 * (2026-10-09 좌투 샘플 착지 때 다리가 한 장면에 41 ~ 55° 꺾임) — hint 를 조금 섞어 편 마디에서는 hint 쪽, 굽은 마디는 그대로.
 */
export function twoBoneIk(top: Vec3, midP: Vec3, end: Vec3, target: Vec3, hint?: Vec3): Vec3 {
  const l1 = norm(sub(midP, top));
  const l2 = norm(sub(end, midP));
  const v = sub(target, top);
  /*
   * 다 펴지기 직전(길이의 97%)부터는 끝이 목표에 천천히 다가가게 — 목표가 닿을 거리 밖이면 예전엔 마디가 한 장면에 일직선으로 펴졌다
   * (2026-10-09 샘플 4 착지 순간 앞무릎이 한 장면에 14°). 끝이 목표에서 다리 길이의 1% 쯤 모자랄 수 있다.
   */
  const reach = l1 + l2;
  const soft = 0.97 * reach;
  const raw = norm(v);
  const d = clamp(
    raw <= soft ? raw : soft + (reach - soft) * (1 - Math.exp(-(raw - soft) / (reach - soft))),
    Math.abs(l1 - l2) + 1e-6,
    reach - 1e-6
  );
  const e = unit(v, [0, -1, 0]);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const bent = perp(sub(midP, top), e);
  const pole = unit(
    hint ? add(bent, scale(unit(perp(hint, e), [0, 0, 0]), 0.15 * l1)) : bent,
    unit(perp([1, 0, 0], e), [0, 0, 1])
  );
  return add(add(top, scale(e, along)), scale(pole, h));
}

/** 무릎이 굽는 쪽(앞) — 넙다리 방향 × 무릎이 굽는 축(refs 의 thigh) */
export const kneePole = (hip: Vec3, knee: Vec3, axis: Vec3 | undefined): Vec3 | undefined =>
  axis ? cross(unit(sub(knee, hip), [0, -1, 0]), axis) : undefined;

export type KinematicTrack = {
  /** 다시 만든 관절 점(25, 키 = 1) */
  frames: Vec3[][];
  /**
   * 부위의 기준 방향(세상) — 위팔 · 아래팔은 팔꿈치가 굽는 축, 넙다리 · 정강이는 무릎이 굽는 축, 손은 손바닥 폭(검지 → 새끼).
   * 점에서 다시 셈하면 거의 편 마디에서 못 정해 이것을 그대로 쓴다(pose-rig rigPose 의 refs).
   */
  refs: Partial<
    Record<
      | 'upperArmL'
      | 'upperArmR'
      | 'forearmL'
      | 'forearmR'
      | 'handL'
      | 'handR'
      | 'thighL'
      | 'thighR'
      | 'shankL'
      | 'shankR',
      Vec3
    >
  >[];
};

/**
 * 점 → 각도 → 한계 · 다듬기 → 점. conf 는 장면 × 관절 확신(0~100), contacts 는 땅에 닿아 묶인 발 구간.
 * opts.dt = 장면 사이 영상 초(빠르기 상한 KIN_SPEED 를 한 장면으로 — 없으면 1/60), opts.hand = 던지는 손(던지는 팔만 빠르게 둔다).
 */
export function kinematicTrack(
  frames: Vec3[][],
  conf: number[][] | null,
  contacts: V2Contact[],
  opts: { dt?: number; hand?: 'L' | 'R' } = {}
): KinematicTrack {
  const n = frames.length;
  const dt = opts.dt && opts.dt > 0 ? opts.dt : 1 / 60;
  const perFrame = (degPerSec: number) => rad(degPerSec * dt);
  const planted = (side: 'L' | 'R') =>
    frames.map((_, k) => contacts.some((c) => c.side === side && k >= c.from && k <= c.to));
  /*
   * 확신은 손에만 쓴다. 엔진이 이미 흐린 관절을 앞뒤로 부드럽게 채워 보내는데, 여기서 흐린 장면의 무게를 0 가까이 두고 다시 다듬으면 흐린 장면과
   * 또렷한 장면 경계에서 값이 갑자기 바뀌어 팔이 원본보다 더 튀었다(2026-10-09 샘플 4 던지는 팔 흔들림 p90 원본 0.77 → 화면 1.26, 머리 · 다리도).
   * 손은 점이 작아 흐리면 손목을 곧게 두는 편이 낫다(시험 6).
   */
  const HAND = new Set<number>([V2J.lHandIdx, V2J.lHandMid, V2J.lHandPinky, V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky]);
  const cf = (k: number, j: number) =>
    conf && HAND.has(j) ? clamp(conf[k][j] / 100, 0, 1) : 1;
  const lenOf = (a: number, b: number) =>
    median(frames.map((fr) => norm(sub(fr[a], fr[b]))));

  /* ── 골반 · 몸통 · 머리 틀(세상) ── */
  const hipMid = frames.map((fr) => midOf(fr[V2J.lHip], fr[V2J.rHip]));
  const shMid = frames.map((fr) => midOf(fr[V2J.lSh], fr[V2J.rSh]));
  const pelvisM: Mat3[] = [];
  const trunkM: Mat3[] = [];
  const headM: Mat3[] = [];
  frames.forEach((fr, k) => {
    const T = unit(sub(shMid[k], hipMid[k]), [0, 1, 0]);
    /* 골반 — 왼쪽 = 엉덩이선 그대로(골반이 기운 것도), 위 = 몸통 축을 그에 수직으로 */
    const pl = unit(
      sub(fr[V2J.lHip], fr[V2J.rHip]),
      unit(perp([0, 0, -1], T), [1, 0, 0])
    );
    pelvisM.push(frameOf(pl, unit(perp(T, pl), T)));
    const tl = unit(
      perp(sub(fr[V2J.lSh], fr[V2J.rSh]), T),
      unit(perp(pl, T), [1, 0, 0])
    );
    trunkM.push(frameOf(tl, T));
    const earMid = midOf(fr[V2J.lEar], fr[V2J.rEar]);
    let hl = unit(sub(fr[V2J.lEar], fr[V2J.rEar]), tl);
    /* 귀가 어깨와 반대로 붙었으면(관절 모델의 좌우 뒤바뀜) 바꿔 읽는다 */
    if (dot(hl, tl) < 0) hl = scale(hl, -1);
    const hf = unit(perp(sub(fr[V2J.nose], earMid), hl), cross(tl, T));
    headM.push(frameOf(hl, cross(hf, hl)));
  });
  const wTrunk = frames.map(
    (_, k) =>
      Math.min(cf(k, V2J.lHip), cf(k, V2J.rHip), cf(k, V2J.lSh), cf(k, V2J.rSh)) + 0.02
  );
  const wHead = frames.map(
    (_, k) => Math.min(cf(k, V2J.nose), cf(k, V2J.lEar), cf(k, V2J.rEar)) + 0.02
  );

  /* 몸통(골반에 대해) · 목(몸통에 대해, 그 클립의 가운데 자세에서) — 비틀림 · 기울임 한계 */
  const spineQ = frames.map((_, k) =>
    limitSwingTwist(
      quatFromMat(mul3(transpose(pelvisM[k]), trunkM[k])),
      [0, 1, 0],
      rad(KIN_LIMITS.spineTwist),
      rad(KIN_LIMITS.spineSwing)
    )
  );
  const neckRaw = frames.map((_, k) =>
    quatFromMat(mul3(transpose(trunkM[k]), headM[k]))
  );
  const neckNeutral =
    smoothQuat(neckRaw, wHead, 50, 50)[Math.floor(n / 2)] ?? ([1, 0, 0, 0] as Quat);
  const neckQ = neckRaw.map((q) =>
    qMul(
      neckNeutral,
      limitSwingTwist(
        qMul(qConj(neckNeutral), q),
        [0, 1, 0],
        rad(KIN_LIMITS.neckTwist),
        rad(KIN_LIMITS.neckSwing)
      )
    )
  );

  /* 다듬기 — 골반 방향 · 자리, 몸통 · 목은 상대 회전으로(머리는 늘 넓게) */
  const pelvisQ = rateLimitQuat(smoothQuat(pelvisM.map(quatFromMat), wTrunk), perFrame(KIN_SPEED.pelvis));
  const spineS = rateLimitQuat(smoothQuat(spineQ, wTrunk), perFrame(KIN_SPEED.spine));
  const neckS = rateLimitQuat(smoothQuat(neckQ, wHead, 1.2, 4), perFrame(KIN_SPEED.neck));
  const hipS = smoothMulti(hipMid as number[][], wTrunk).map((v) => v as Vec3);
  const pM = pelvisQ.map(matFromQuat);
  const tM = pM.map((M, k) => mul3(M, matFromQuat(spineS[k])));
  const hM = tM.map((M, k) => mul3(M, matFromQuat(neckS[k])));

  /* ── 몸통 · 머리 모양(고정) ── */
  const trunkLen = median(frames.map((_, k) => norm(sub(shMid[k], hipMid[k]))));
  const hipHalf = lenOf(V2J.lHip, V2J.rHip) / 2;
  const shHalf = lenOf(V2J.lSh, V2J.rSh) / 2;
  /*
   * 어깨선 기울기 — 몸통 축(엉덩이 가운데 → 어깨 가운데)에 수직에서 위아래로. 던지는 어깨가 올라가면 10~20° 라, 예전처럼 늘 수직으로
   * 다시 만들면 어깨가 키의 3% 쯤 어긋나고 팔 전체가 따라 어긋났다(2026-10-09 샘플 4 던지는 팔이 영상에서 1.5 → 3.3%).
   */
  const tiltS = rateLimit(
    smooth1(
      frames.map((fr, k) => {
        const d = toLocal(trunkM[k], sub(fr[V2J.lSh], fr[V2J.rSh]));
        return Math.atan2(d[1], d[0]);
      }),
      wTrunk
    ).map((e) => clamp(e, -rad(KIN_LIMITS.shoulderTilt), rad(KIN_LIMITS.shoulderTilt))),
    perFrame(KIN_SPEED.shoulderTilt)
  );
  /*
   * 머리 — 목(어깨 가운데 → 귀 가운데, 몸통 틀)은 장면마다 다듬어 따라가고, 머리 점은 귀 가운데에서 머리 틀로(모양 고정). 예전엔 머리 점을
   * 어깨 가운데에서 머리 틀로 붙여 고개를 돌리면 머리 전체가 어깨 가운데를 돌았다(머리가 영상에서 0.8 → 2.0%).
   */
  const earMidOf = (fr: Vec3[]) => midOf(fr[V2J.lEar], fr[V2J.rEar]);
  const neckOffS = smoothMulti(
    frames.map((fr, k) => toLocal(trunkM[k], sub(earMidOf(fr), shMid[k]))) as number[][],
    wHead
  ).map((v) => v as Vec3);
  const headLocal = [V2J.nose, V2J.lEar, V2J.rEar].map((j) => {
    const ls = frames.map((fr, k) => toLocal(headM[k], sub(fr[j], earMidOf(fr))));
    return [0, 1, 2].map((d) => median(ls.map((v) => v[d]))) as Vec3;
  });

  const out: Vec3[][] = frames.map((fr) => fr.map((p) => [...p] as Vec3));
  const refs: KinematicTrack['refs'] = frames.map(() => ({}));
  for (let k = 0; k < n; k++) {
    const o = hipS[k];
    const left = toWorld(pM[k], [1, 0, 0]);
    out[k][V2J.lHip] = add(o, scale(left, hipHalf));
    out[k][V2J.rHip] = add(o, scale(left, -hipHalf));
    const sm = add(o, toWorld(tM[k], [0, trunkLen, 0]));
    const tl = toWorld(tM[k], [Math.cos(tiltS[k]), Math.sin(tiltS[k]), 0]);
    out[k][V2J.lSh] = add(sm, scale(tl, shHalf));
    out[k][V2J.rSh] = add(sm, scale(tl, -shHalf));
    const head = add(sm, toWorld(tM[k], neckOffS[k]));
    [V2J.nose, V2J.lEar, V2J.rEar].forEach(
      (j, i) => (out[k][j] = add(head, toWorld(hM[k], headLocal[i])))
    );
  }

  /* ── 팔 ── */
  for (const side of ['L', 'R'] as const) {
    const [Sh, El, Wr, Idx, Mid, Pk] =
      side === 'L'
        ? [V2J.lSh, V2J.lEl, V2J.lWr, V2J.lHandIdx, V2J.lHandMid, V2J.lHandPinky]
        : [V2J.rSh, V2J.rEl, V2J.rWr, V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky];
    const limb = limbAngles(
      frames,
      trunkM,
      [Sh, El, Wr],
      elbowRef,
      cf,
      KIN_LIMITS.elbowFlex,
      KIN_LIMITS.elbowHyper
    );
    /* 어깨 — 위팔이 어깨선 뒤로 너무 가지 않게(수평면에서 바깥 축 기준) */
    const outAx: Vec3 = side === 'L' ? [1, 0, 0] : [-1, 0, 0];
    limb.dir = limb.dir.map((u) => {
      const h = Math.hypot(u[0], u[2]);
      if (h < 0.35) return u;
      const back = Math.atan2(-u[2], dot(u, outAx));
      const lim = rad(KIN_LIMITS.shoulderBack);
      if (back <= lim) return u;
      const r1 = rot(u, [0, 1, 0], back - lim);
      const r2 = rot(u, [0, 1, 0], lim - back);
      return Math.atan2(-r1[2], dot(r1, outAx)) < Math.atan2(-r2[2], dot(r2, outAx))
        ? r1
        : r2;
    });
    /* 손을 모르면 두 팔 다 던지는 팔만큼 빠르게 둔다(깎지 않는 쪽) */
    const throwing = opts.hand == null || opts.hand === side;
    const dirS = rateLimitDir(
      smoothUnit(limb.dir, limb.flexW),
      perFrame(throwing ? KIN_SPEED.throwUpperArm : KIN_SPEED.gloveUpperArm)
    );
    const twistS = rateLimit(
      smooth1(limb.twist, limb.twistW, undefined, undefined, true),
      rad(KIN_LIMITS.twistRatePerFrame)
    );
    const flexS = rateLimit(
      smooth1(limb.flex, limb.flexW).map((f) =>
        clamp(f, -rad(KIN_LIMITS.elbowHyper), rad(KIN_LIMITS.elbowFlex))
      ),
      perFrame(throwing ? KIN_SPEED.throwElbow : KIN_SPEED.gloveElbow)
    );
    const Lu = lenOf(Sh, El);
    const Lf = lenOf(El, Wr);

    /* 아래팔 비틀림 · 손목 — 손 점을 아래팔 틀(축 = 아래팔, 둘째 = 팔꿈치가 굽는 축)에서 */
    const pron: number[] = [];
    const flexW: number[] = [];
    const devW: number[] = [];
    const wHand: number[] = [];
    const handLocal: Vec3[][] = [];
    frames.forEach((fr, k) => {
      const u = unit(sub(fr[El], fr[Sh]), [0, -1, 0]);
      const f = unit(sub(fr[Wr], fr[El]), u);
      const nb = cross(u, f);
      const e1 = f;
      const e2 = norm(nb) > 1e-6 ? normalize(nb) : toWorld(trunkM[k], [1, 0, 0]);
      const e3 = cross(e1, e2);
      const wv = perp(sub(fr[Pk], fr[Idx]), e1);
      const ps =
        norm(wv) > 1e-9 ? Math.atan2(dot(wv, e3), dot(wv, e2)) : (pron[k - 1] ?? 0);
      pron.push(ps);
      const h2 = add(scale(e2, Math.cos(ps)), scale(e3, Math.sin(ps)));
      const h3 = cross(e1, h2);
      const a = unit(sub(fr[Mid], fr[Wr]), e1);
      flexW.push(Math.atan2(dot(a, h3), dot(a, e1)));
      devW.push(Math.asin(clamp(dot(a, h2), -1, 1)));
      const ch = Math.min(cf(k, Idx), cf(k, Mid), cf(k, Pk));
      /* 비틀림은 팔꿈치가 굽어 있어야 기준 축이 선다 */
      const bendSeen = clamp(
        (Math.acos(clamp(dot(u, f), -1, 1)) - rad(10)) / rad(25),
        0,
        1
      );
      wHand.push(ch * bendSeen + 0.01);
      /* 손 모양 — 손 틀(손 축 · 손바닥 폭 · 손바닥)에서 세 점 */
      const ha = a;
      const hw = unit(perp(sub(fr[Pk], fr[Idx]), ha), h2);
      const hn = cross(ha, hw);
      handLocal.push(
        [Idx, Mid, Pk].map((j) => {
          const v = sub(fr[j], fr[Wr]);
          return [dot(v, ha), dot(v, hw), dot(v, hn)] as Vec3;
        })
      );
    });
    const pronU = unwrap(pron);
    const pronMid = weightedMedian(pronU, wHand);
    const pronS = rateLimit(
      smooth1(pronU, wHand, 0.8, 3, true),
      rad(KIN_LIMITS.pronationRatePerFrame)
    ).map((p) =>
      clamp(p, pronMid - rad(KIN_LIMITS.pronation), pronMid + rad(KIN_LIMITS.pronation))
    );
    const wHandOnly = frames.map(
      (_, k) => Math.min(cf(k, Idx), cf(k, Mid), cf(k, Pk)) + 0.01
    );
    /*
     * 손 점이 흐리거나 사람 손목이 못 가는 쪽(손등 · 손바닥 쪽으로 110° 넘게, 옆으로 70° 넘게)이면 손목을 곧게(0) 쪽으로 — 흐린 장면은
     * 앞뒤 값과 0 사이로. 손이 아래팔 뒤로 접혀 잡히면 굽힘이 −179° ↔ +166° 로 넘어가는데, 한계에서 자르기만 하면 −75° → +75° 로
     * 손이 한 장면에 뒤집혔다(2026-10-09 샘플 4 글러브 손 한 장면 78°).
     */
    const handOk = flexW.map(
      (v, k) =>
        clamp((wHandOnly[k] - 0.2) / 0.4, 0, 1) *
        clamp((rad(110) - Math.abs(v)) / rad(40), 0, 1) *
        clamp((rad(70) - Math.abs(devW[k])) / rad(30), 0, 1)
    );
    const wfS = rateLimit(
      smooth1(
        flexW.map((v, k) => v * handOk[k]),
        wHandOnly.map(() => 1),
        0.8,
        3
      ).map((v) => clamp(v, -rad(KIN_LIMITS.wristFlex), rad(KIN_LIMITS.wristFlex))),
      rad(KIN_LIMITS.wristRatePerFrame)
    );
    const wdS = rateLimit(
      smooth1(
        devW.map((v, k) => v * handOk[k]),
        wHandOnly.map(() => 1),
        0.8,
        3
      ).map((v) => clamp(v, -rad(KIN_LIMITS.wristDev), rad(KIN_LIMITS.wristDev))),
      rad(KIN_LIMITS.wristRatePerFrame)
    );
    const handShape = [0, 1, 2].map((i) => {
      const good = handLocal.filter((_, k) => wHandOnly[k] > 0.5).map((h) => h[i]);
      const src = good.length >= 5 ? good : handLocal.map((h) => h[i]);
      return [0, 1, 2].map((d) => median(src.map((v) => v[d]))) as Vec3;
    });

    for (let k = 0; k < n; k++) {
      const M = tM[k];
      const S = out[k][Sh];
      const u = dirS[k];
      const nRef = elbowRef(u);
      const nb = rot(nRef, u, twistS[k]);
      const f = rot(u, nb, flexS[k]);
      const uw = toWorld(M, u);
      const nw = toWorld(M, nb);
      const fw = toWorld(M, f);
      const E = add(S, scale(uw, Lu));
      const W = add(E, scale(fw, Lf));
      out[k][El] = E;
      out[k][Wr] = W;
      const e2 = nw;
      const e3 = cross(fw, e2);
      const h2 = add(scale(e2, Math.cos(pronS[k])), scale(e3, Math.sin(pronS[k])));
      const h3 = cross(fw, h2);
      const fl = wfS[k];
      const dv = wdS[k];
      const a = unit(
        add(
          add(
            scale(fw, Math.cos(fl) * Math.cos(dv)),
            scale(h3, Math.sin(fl) * Math.cos(dv))
          ),
          scale(h2, Math.sin(dv))
        ),
        fw
      );
      const hw = unit(perp(h2, a), h2);
      const hn = cross(a, hw);
      [Idx, Mid, Pk].forEach((j, i) => {
        const [x, y, z] = handShape[i];
        out[k][j] = add(W, add(add(scale(a, x), scale(hw, y)), scale(hn, z)));
      });
      refs[k][side === 'L' ? 'upperArmL' : 'upperArmR'] = nw;
      refs[k][side === 'L' ? 'forearmL' : 'forearmR'] = nw;
      refs[k][side === 'L' ? 'handL' : 'handR'] = hw;
    }
  }

  /* ── 다리 ── */
  /* 엉덩이가 보인 정도(0~1, 두 엉덩이 중 낮은 쪽 · 앞뒤로 다듬음) — 확신을 모르면 보인 것으로 */
  const hipSeen = smooth1(
    frames.map((_, k) =>
      conf ? clamp(Math.min(conf[k][V2J.lHip], conf[k][V2J.rHip]) / 100, 0, 1) : 1
    ),
    frames.map(() => 1)
  );
  for (const side of ['L', 'R'] as const) {
    const [Hp, Kn, An, He, To] =
      side === 'L'
        ? [V2J.lHip, V2J.lKn, V2J.lAn, V2J.lHe, V2J.lTo]
        : [V2J.rHip, V2J.rKn, V2J.rAn, V2J.rHe, V2J.rTo];
    const limb = limbAngles(
      frames,
      pelvisM,
      [Hp, Kn, An],
      kneeRef,
      cf,
      KIN_LIMITS.kneeFlex,
      KIN_LIMITS.kneeHyper
    );
    const onGround = planted(side);
    const dirS = rateLimitDir(
      smoothUnit(limb.dir, limb.flexW),
      onGround.map((g) => perFrame(g ? KIN_SPEED.plantedThigh : KIN_SPEED.thigh))
    );
    /*
     * 몇 장면만 튄 비틀림(앞뒤 7장면 가운데값에서 60° 넘게)은 안 본 것으로 — 이웃 장면으로 잇는다. 엔진이 무릎을 몇 장면 반대편에 두면
     * (시험 9: 3장면 반 바퀴) 사람 범위 안이라도 무릎이 한쪽으로 100° 휙 돌았다. 오래 이어지는 변화(다리를 드는 동안)는 그대로 둔다.
     */
    const twW = limb.twistW.map((w, k) => {
      const win = limb.twist.slice(Math.max(0, k - 7), k + 8).sort((a, b) => a - b);
      return Math.abs(limb.twist[k] - win[win.length >> 1]) > rad(60) ? 0.001 : w;
    });
    const twistU = rateLimit(
      smooth1(limb.twist, twW, undefined, undefined, true),
      rad(KIN_LIMITS.twistRatePerFrame)
    );
    /* 엉덩이 돌림 — 0(무릎이 앞)에서 사람 범위까지(이어 붙인 각이라 그 클립이 도는 바퀴 수를 맞춘 0 에서) */
    const c0 = 2 * Math.PI * Math.round(weightedMedian(limb.twist, limb.twistW) / (2 * Math.PI));
    const twistS = twistU.map((t, k) => {
      const lim = rad(KIN_LIMITS.hipRotation + KIN_LIMITS.hipRotationUnseen * (1 - hipSeen[k]));
      return clamp(t, c0 - lim, c0 + lim);
    });
    const flexS = rateLimit(
      smooth1(limb.flex, limb.flexW).map((f) =>
        clamp(f, -rad(KIN_LIMITS.kneeHyper), rad(KIN_LIMITS.kneeFlex))
      ),
      onGround.map((g) => perFrame(g ? KIN_SPEED.plantedKnee : KIN_SPEED.knee))
    );
    const Lt = lenOf(Hp, Kn);
    const Ls = lenOf(Kn, An);
    /* 발 — 정강이 틀(축 = 정강이, 둘째 = 무릎이 굽는 축)에서 발끝 · 뒤꿈치 */
    const footL: Vec3[][] = frames.map((fr, k) => {
      const u = unit(sub(fr[Kn], fr[Hp]), [0, -1, 0]);
      const s = unit(sub(fr[An], fr[Kn]), u);
      const e2 = unit(cross(u, s), toWorld(pelvisM[k], [1, 0, 0]));
      const e3 = cross(s, e2);
      return [To, He].map((j) => {
        const v = sub(fr[j], fr[An]);
        return [dot(v, s), dot(v, e2), dot(v, e3)] as Vec3;
      });
    });
    const wFoot = frames.map(
      (_, k) => Math.min(cf(k, An), cf(k, He), cf(k, To)) + 0.02
    );
    const toeS = smoothMulti(footL.map((f) => f[0]) as number[][], wFoot).map(
      (v) => v as Vec3
    );
    const heelS = smoothMulti(footL.map((f) => f[1]) as number[][], wFoot).map(
      (v) => v as Vec3
    );
    const Lto = lenOf(An, To);
    const Lhe = lenOf(An, He);

    for (let k = 0; k < n; k++) {
      const M = pM[k];
      const Hpt = out[k][Hp];
      const u = dirS[k];
      const nRef = kneeRef(u);
      const nb = rot(nRef, u, twistS[k]);
      const s = rot(u, nb, flexS[k]);
      const uw = toWorld(M, u);
      const nw = toWorld(M, nb);
      const sw = toWorld(M, s);
      const K = add(Hpt, scale(uw, Lt));
      const A = add(K, scale(sw, Ls));
      const e3 = cross(sw, nw);
      const fromLocal = (v: Vec3, L: number) =>
        scale(unit(add(add(scale(sw, v[0]), scale(nw, v[1])), scale(e3, v[2])), sw), L);
      out[k][Kn] = K;
      out[k][An] = A;
      out[k][To] = add(A, fromLocal(toeS[k], Lto));
      out[k][He] = add(A, fromLocal(heelS[k], Lhe));
      refs[k][side === 'L' ? 'thighL' : 'thighR'] = nw;
      refs[k][side === 'L' ? 'shankL' : 'shankR'] = nw;
    }
  }

  /*
   * 땅에 닿은 발 — 엔진이 묶은 자리(원래 점) 그대로, 무릎은 두 마디 길이로 다시 접는다. 앞뒤 장면은 섞는다 — 다듬은 발과 묶은 자리가 멀수록
   * 길게(한 장면에 키의 0.8% 까지만 끌려가게, 2~10장면). 늘 2장면이면 착지 순간 발을 한 번에 11cm 끌어 앞다리가 한 장면에 18° 꺾였다(좌투 샘플).
   */
  const easeFor = (k: number, An: number) =>
    k < 0 || k >= n
      ? 2
      : clamp(Math.ceil(norm(sub(frames[k][An], out[k][An])) / 0.008), 2, 10);
  for (const c of contacts) {
    const [Hp, Kn, An, He, To] =
      c.side === 'L'
        ? [V2J.lHip, V2J.lKn, V2J.lAn, V2J.lHe, V2J.lTo]
        : [V2J.rHip, V2J.rKn, V2J.rAn, V2J.rHe, V2J.rTo];
    const easeIn = easeFor(c.from, An);
    const easeOut = easeFor(c.to, An);
    for (let k = c.from - easeIn; k <= c.to + easeOut; k++) {
      if (k < 0 || k >= n) continue;
      const w =
        k >= c.from && k <= c.to
          ? 1
          : k < c.from
            ? 1 - (c.from - k) / (easeIn + 1)
            : 1 - (k - c.to) / (easeOut + 1);
      const target = add(scale(out[k][An], 1 - w), scale(frames[k][An], w));
      const shift = sub(target, out[k][An]);
      out[k][Kn] = twoBoneIk(
        out[k][Hp],
        out[k][Kn],
        out[k][An],
        target,
        kneePole(out[k][Hp], out[k][Kn], refs[k][c.side === 'L' ? 'thighL' : 'thighR'])
      );
      out[k][An] = target;
      out[k][He] = add(scale(add(out[k][He], shift), 1 - w), scale(frames[k][He], w));
      out[k][To] = add(scale(add(out[k][To], shift), 1 - w), scale(frames[k][To], w));
      const s = unit(sub(out[k][An], out[k][Kn]), [0, -1, 0]);
      const t = unit(sub(out[k][Kn], out[k][Hp]), s);
      const nb = cross(t, s);
      if (norm(nb) > 1e-6) {
        const ref = refs[k][c.side === 'L' ? 'thighL' : 'thighR'];
        const nn = normalize(nb);
        const pick = ref && dot(ref, nn) < 0 ? scale(nn, -1) : nn;
        refs[k][c.side === 'L' ? 'thighL' : 'thighR'] = pick;
        refs[k][c.side === 'L' ? 'shankL' : 'shankR'] = pick;
      }
    }
  }
  return { frames: out, refs };
}
