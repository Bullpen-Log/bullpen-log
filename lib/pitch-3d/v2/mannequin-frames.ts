import { add, cross, dot, normalize, scale, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import type { MannequinJoints, MannequinTrack } from '@/lib/pitch-3d/v2/mannequin-prep';

/**
 * 데생 인형 — 장면마다 미리 셈해 두는 '틀'(설계 docs/designs/pitch-3d-mannequin.md §6, 2026-10-11 금윤호). 순수 — three 없이 화면
 * (app/(app)/videos/lab/[id]/mannequin/*)과 시험(scripts/pitch-3d-v2-selftest.mts)이 같은 코드를 쓴다.
 *
 * 김민의 예시 페이지(scripts/pitch-lab/mannequin/page.js 의 draw)가 장면마다 three 로 셈하던 것을 그대로 옮겼다 — 골반 틀 · 가슴 틀 ·
 * 머리 방향 · 발 자세 · 손 틀. 좌표는 예시와 같다: 미터, x 홈 쪽 · y 투수 왼쪽 · z 위.
 *
 * 좌투는 여기서 거울을 뜬다(canonicalTrack — y 를 뒤집어 '던지는 쪽 = 몸 오른쪽'인 우투 꼴로). 예시는 우투 샘플로만 봤고, 관절 이름만
 * 바꾸면(mannequin-prep) frame() 의 앞 방향과 손의 엄지 쪽이 뒤집혀 앞판이 등에 붙고 공이 손등 뒤에 놓인다(2026-10-11 검토). 거울로
 * 뜨면 모든 규칙이 우투 그대로고, 화면은 인형 묶음의 y 축 배율을 −1 로 둬 되돌린다.
 */

export type Quat = [number, number, number, number];

/** 정규직교 틀 — xa 옆(몸 오른쪽) · ya 위 · fw 앞, q 는 (xa, ya, fw 의 반대) 를 열로 둔 회전 */
export type Frame = { xa: Vec3; ya: Vec3; fw: Vec3; q: Quat };

export type FootPose = {
  heel: Vec3;
  toe: Vec3;
  /** 신발 등 방향(발 축에 수직) */
  n: Vec3;
  /** 바닥에 묻힌 만큼 올린 발목(≤ 5cm) */
  ankle: Vec3;
  lift: number;
};

export type HandFrame = {
  /** 손목 → 손 방향 */
  hd: Vec3;
  /** 엄지 쪽 */
  side: Vec3;
  /** 손바닥 쪽 */
  nrm: Vec3;
  q: Quat;
  /** 손 가운데(손목에서 4.5% 앞) */
  hc: Vec3;
};

export type MannequinFrame = {
  pelvis: Frame;
  chest: Frame;
  /** 머리 — 가운데 · 위 · 앞 · 회전 */
  head: { hc: Vec3; up: Vec3; fw: Vec3; q: Quat; neck: Vec3; nk: Vec3 };
  rear: FootPose;
  lead: FootPose;
  throwing: HandFrame;
  glove: HandFrame;
};

/* ───────────────────────────── 쿼터니언 ───────────────────────────── */

/** 회전 행렬(열 = x · y · z 축) → 쿼터니언(three 의 setFromRotationMatrix 과 같은 분기) */
export function basis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const m11 = x[0], m12 = y[0], m13 = z[0];
  const m21 = x[1], m22 = y[1], m23 = z[1];
  const m31 = x[2], m32 = y[2], m33 = z[2];
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
}

/** 쿼터니언으로 벡터 돌리기 */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/** 구면 보간(three 의 slerp 과 같은 결과 — 가까운 쪽으로) */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  if (t <= 0) return [...a];
  if (t >= 1) return [...b];
  let [bx, by, bz, bw] = b;
  let cosHalf = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cosHalf < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
    cosHalf = -cosHalf;
  }
  if (cosHalf >= 1) return [...a];
  const sqrSinHalf = 1 - cosHalf * cosHalf;
  if (sqrSinHalf <= Number.EPSILON) {
    const s = 1 - t;
    const out: Quat = [s * a[0] + t * bx, s * a[1] + t * by, s * a[2] + t * bz, s * a[3] + t * bw];
    const l = Math.hypot(...out);
    return out.map((v) => v / l) as Quat;
  }
  const sinHalf = Math.sqrt(sqrSinHalf);
  const half = Math.atan2(sinHalf, cosHalf);
  const ra = Math.sin((1 - t) * half) / sinHalf;
  const rb = Math.sin(t * half) / sinHalf;
  return [a[0] * ra + bx * rb, a[1] * ra + by * rb, a[2] * ra + bz * rb, a[3] * ra + bw * rb];
}

/* ───────────────────────────── 틀 ───────────────────────────── */

export const smooth01 = (x: number) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
const mid3 = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);
const angleBetween = (a: Vec3, b: Vec3) =>
  Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b)))));
/** v 를 축 ax 둘레로 th 만큼 돌린다(로드리게스) */
function rotateAxis(v: Vec3, ax: Vec3, th: number): Vec3 {
  const k = normalize(ax);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/**
 * 틀 — x 옆 축과 위쪽 힌트 u 로. 예시 page.js 의 frame() 그대로: za = xa × ya, 앞 = −za.
 * 우투 꼴(던지는 쪽 = 몸 오른쪽 = −y)에서 x = 던지는 쪽 − 글러브 쪽 이면 앞이 +x(홈 쪽)가 된다.
 */
export function frame(x: Vec3, u: Vec3): Frame {
  const xa = normalize(x);
  const ya = normalize(sub(u, scale(xa, dot(u, xa))));
  const za = cross(xa, ya);
  return { xa, ya, fw: scale(za, -1), q: basis(xa, ya, za) };
}

/* ───────────────────────────── 우투 꼴 ───────────────────────────── */

/** 좌투는 y 를 뒤집어 우투 꼴로(화면이 y 배율 −1 로 되돌린다). 우투는 그대로 */
export function canonicalFrames(track: MannequinTrack): MannequinJoints[] {
  if (track.hand !== 'L') return track.frames;
  return track.frames.map((J) => {
    const out = {} as MannequinJoints;
    for (const key of Object.keys(J) as (keyof MannequinJoints)[]) {
      const p = J[key];
      if (p) out[key] = [p[0], -p[1], p[2]];
    }
    return out;
  });
}

/* ───────────────────────────── 장면별 틀 ───────────────────────────── */

/**
 * 몸통 축을 기준으로 한 골반 · 가슴 틀.
 * 골반 위 방향은 몸통 축만 따르면 숙일 때 엉덩이가 튀어나와, 몸통 축과 '허벅지 반대쪽'을 6:4 로 섞는다(예시 page.js draw).
 */
function trunkFrames(J: MannequinJoints): { pelvis: Frame; chest: Frame } {
  const hm = mid3(J.rh, J.lh);
  const tUp = normalize(sub(J.td, hm));
  const thUp = normalize(add(normalize(sub(J.rh, J.rk)), normalize(sub(J.lh, J.lk))));
  const pelvis = frame(sub(J.rh, J.lh), add(scale(tUp, 0.6), scale(thUp, 0.4)));
  const chest = frame(sub(J.sh, J.gs), sub(J.tp, J.td));
  return { pelvis, chest };
}

/** 머리 방향 원재료 — 귀 가운데 − 어깨 가운데(위), 코 − 귀(앞) */
function headRaw(J: MannequinJoints): [Vec3, Vec3] {
  return [sub(J.ear, mid3(J.sh, J.gs)), sub(J.nose, J.ear)];
}

/** 머리 — 앞뒤 5장면을 고르게 섞고, 목에서 35°(0.6rad) 안으로 */
function headFrame(
  J: MannequinJoints,
  chest: Frame,
  k: number,
  smoothedUp: Vec3,
  smoothedFw: Vec3,
  neck: Vec3
): MannequinFrame['head'] {
  const nk = add(neck, scale(chest.ya, 0.07 * k));
  let up = normalize(smoothedUp);
  const a = angleBetween(up, chest.ya);
  const mx = 0.6;
  if (a > mx) up = rotateAxis(chest.ya, cross(chest.ya, up), mx);
  let fw: Vec3 = Math.hypot(...smoothedFw) > 0.5 ? normalize(smoothedFw) : chest.fw;
  fw = sub(fw, scale(up, dot(fw, up)));
  if (dot(fw, fw) < 1e-6) fw = chest.fw;
  fw = normalize(fw);
  const hc = add(add(nk, scale(up, 0.1 * k)), scale(fw, 0.012 * k));
  const zb = scale(fw, -1);
  const hx = normalize(cross(up, zb));
  return { hc, up, fw, q: basis(hx, up, zb), neck, nk };
}

/**
 * 발 — 발목에 붙인 한 덩어리. 뒤꿈치 · 발끝 자료는 방향만(앞뒤 3장면과 고르게), 신발 등은 무릎 쪽.
 * 땅을 짚은 장면에 발목이 낮게 잡혀 신발이 묻히면 그만큼(최대 5cm) 발목째 올린다.
 */
function footPose(
  frames: MannequinJoints[],
  f: number,
  rear: boolean,
  k: number
): FootPose {
  const J = frames[f];
  const kn = rear ? J.rk : J.lk;
  const an0 = rear ? J.ra : J.la;
  const hk = rear ? 'rhe' : 'lhe';
  const tk = rear ? 'rto' : 'lto';
  const a = Math.max(0, f - 3);
  const b = Math.min(frames.length - 1, f + 3);
  let d3: Vec3 = [0, 0, 0];
  for (let i = a; i <= b; i++)
    d3 = add(d3, scale(normalize(sub(frames[i][tk], frames[i][hk])), 1 - Math.abs(i - f) / 4));
  d3 = normalize(d3);
  let n = sub(kn, an0);
  n = normalize(sub(n, scale(d3, dot(n, d3))));
  let heel = sub(sub(an0, scale(d3, 0.045 * k)), scale(n, 0.085 * k));
  let toe = add(heel, scale(d3, 0.25 * k));
  let gz = 0;
  let gw = 0;
  for (let i = a; i <= b; i++) {
    const q = 1 - Math.abs(i - f) / 4;
    gz += Math.min(frames[i][hk][2], frames[i][tk][2]) * q;
    gw += q;
  }
  const lift = Math.min(0.05, Math.max(0, gz / gw - Math.min(heel[2], toe[2])));
  heel = [heel[0], heel[1], heel[2] + lift];
  toe = [toe[0], toe[1], toe[2] + lift];
  return { heel, toe, n, ankle: [an0[0], an0[1], an0[2] + lift], lift };
}

/** 손 틀 — hd 손목 → 손, side = hd × (팔꿈치 − 어깨) 엄지 쪽, nrm 손바닥 쪽 */
function handFrame(s: Vec3, e: Vec3, w: Vec3, h: Vec3, k: number): HandFrame {
  const hd = normalize(sub(h, w));
  const side = normalize(cross(hd, sub(e, s)));
  const nrm = normalize(cross(side, hd));
  return { hd, side, nrm, q: basis(side, hd, nrm), hc: add(w, scale(hd, 0.045 * k)) };
}

/** 몸통 틀에서 목 밑(예시 torso 의 neck)을 — 머리가 쓴다 */
export function neckOf(J: MannequinJoints, chest: Frame, k: number): Vec3 {
  return add(mid3(J.sh, J.gs), scale(chest.ya, 0.075 * k));
}

/**
 * 모든 장면의 틀을 한 번에(마운트 때). 머리 방향은 앞뒤 5장면 삼각 가중 평균이라 장면을 한꺼번에 봐야 한다.
 * frames 는 우투 꼴(canonicalFrames). k = 키 / 1.8(치수 배율).
 */
export function mannequinFrames(frames: MannequinJoints[], heightM: number): MannequinFrame[] {
  const k = heightM / 1.8;
  const n = frames.length;
  const raw = frames.map(headRaw);
  const W = 5;
  return frames.map((J, i) => {
    const { pelvis, chest } = trunkFrames(J);
    let up: Vec3 = [0, 0, 0];
    let fw: Vec3 = [0, 0, 0];
    for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) {
      const q = 1 - Math.abs(j - i) / (W + 1);
      up = add(up, scale(raw[j][0], q));
      fw = add(fw, scale(raw[j][1], q));
    }
    const neck = neckOf(J, chest, k);
    return {
      pelvis,
      chest,
      head: headFrame(J, chest, k, up, fw, neck),
      rear: footPose(frames, i, true, k),
      lead: footPose(frames, i, false, k),
      throwing: handFrame(J.sh, J.el, J.wr, J.ha, k),
      glove: handFrame(J.gs, J.ge, J.gw, J.gh, k),
    };
  });
}

/** 왼쪽 · 오른쪽을 바꾼 벡터(거울 시험용) */
export const mirrorY = (v: Vec3): Vec3 => [v[0], -v[1], v[2]];
/** lerp · mid — 화면 쪽도 같은 것을 쓴다 */
export { lerp3 as lerp, mid3 as mid };
