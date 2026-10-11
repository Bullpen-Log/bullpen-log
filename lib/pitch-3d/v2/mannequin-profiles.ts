import type { Vec3 } from '@/lib/pitch-3d/linalg';

/**
 * 데생 인형 치수표 · 색(설계 docs/designs/pitch-3d-mannequin.md §1). 김민의 예시 page.js 값 그대로 — k = 키 / 1.8 이 모든 치수에 곱해진다.
 * three 가 없는 순수 상수라 로프트(mannequin-loft.ts) · 시험이 같이 읽는다. 색은 김민이 정한 그대로("색상은 그대로").
 */

/** 색 — three 0.186 은 색 관리가 켜져 있어 hex 를 그대로 넘긴다(예시의 convertSRGBToLinear 는 안 쓴다) */
export const MANNEQUIN_COLOR = {
  skin: 0xdcb08f,
  shirt: 0x3a7fc4,
  pants: 0xe9e4da,
  belt: 0x2b2b2b,
  sock: 0x2a3446,
  shoe: 0x1c1c1c,
  sole: 0xf2f2f2,
  glove: 0x8b5a2b,
  lace: 0x5e3a1a,
  ball: 0xffffff,
  seam: 0xc8312c,
  stripe: 0x1f4f84,
  button: 0xf2efe6,
  buckle: 0xc9a227,
} as const;

/** 재질 거칠기(예시 mat(c, r) 의 r) · 금속성은 버클만 0.6 */
export const MANNEQUIN_ROUGHNESS: Record<keyof typeof MANNEQUIN_COLOR, number> = {
  skin: 0.6,
  shirt: 0.8,
  pants: 0.88,
  belt: 0.5,
  sock: 0.9,
  shoe: 0.42,
  sole: 0.6,
  glove: 0.55,
  lace: 0.6,
  ball: 0.45,
  seam: 0.6,
  stripe: 0.7,
  button: 0.4,
  buckle: 0.35,
};

/** 마운드 — 모래색(김민) · 착지 자리와 투수판 앞은 짙은 흙 · 가장자리는 어둡게 */
export const MOUND_COLOR = { sand: 0x8d6a4c, clay: 0x7a573c, rim: 0x4a3a2e, rubber: 0xf4f2ec } as const;

export type ProfileKey = readonly [number, number];
export type Profile = readonly ProfileKey[];

/** 매끈한 계단 보간(예시 prof) — 키 t 사이를 smoothstep 으로 */
export function prof(keys: Profile, t: number): number {
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

/** 점열 보간(예시 curve) — 키 t 사이를 직선으로 */
export function curve(pts: readonly (readonly [number, Vec3])[], t: number): Vec3 {
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, a] = pts[i - 1];
      const [t1, b] = pts[i];
      const u = (t - t0) / (t1 - t0);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    }
  }
  const last = pts[pts.length - 1][1];
  return [last[0], last[1], last[2]];
}

/* ───────────────────────────── 몸통 ───────────────────────────── */

/** 몸통 로프트 — 고리 48 · 고리당 64점, 16번째 고리에서 바지 → 상의 */
export const TORSO = { RN: 48, K: 64, split: 16, beltT: 0.325 } as const;

/** 몸통 가운데 선의 키(t) — 사타구니 · 엉덩이 · … · 목 */
export const TORSO_KEYS = [0, 0.16, 0.36, 0.55, 0.76, 0.9, 1] as const;

/** 몸통 너비 · 앞 두께 · 뒤 두께(k 배율 전) — hw 엉덩이 반폭 · sw 어깨 반폭은 장면마다 */
export const torsoWidth = (hw: number, sw: number, k: number): Profile => [
  [0, hw + 0.04 * k],
  [0.12, hw + 0.052 * k],
  [0.24, hw + 0.042 * k],
  [0.38, 0.132 * k],
  [0.55, 0.143 * k],
  [0.74, Math.max(0.15 * k, sw - 0.01 * k)],
  [0.88, Math.max(0.15 * k, sw - 0.005 * k)],
  [0.95, sw * 0.5],
  [1, 0.058 * k],
];
export const torsoFront = (k: number): Profile => [
  [0, 0.075 * k],
  [0.14, 0.09 * k],
  [0.3, 0.093 * k],
  [0.42, 0.09 * k],
  [0.58, 0.097 * k],
  [0.74, 0.1 * k],
  [0.9, 0.085 * k],
  [1, 0.055 * k],
];
export const torsoBack = (k: number): Profile => [
  [0, 0.085 * k],
  [0.12, 0.102 * k],
  [0.24, 0.098 * k],
  [0.4, 0.094 * k],
  [0.6, 0.1 * k],
  [0.78, 0.106 * k],
  [0.92, 0.088 * k],
  [1, 0.055 * k],
];
/** 단면 둥근 정도(초타원 n) — 허리 밑은 2.4, 위는 2.8 */
export const torsoN = (t: number) => (t < 0.2 ? 2.4 : 2.8);

/* ───────────────────────────── 팔다리(래스 프로필) ───────────────────────────── */

/** 허벅지 — 엉덩이 위 5% 부터 무릎까지 */
export const THIGH: Profile = [
  [0, 0.05],
  [0.1, 0.085],
  [0.24, 0.094],
  [0.45, 0.088],
  [0.75, 0.071],
  [1, 0.059],
];

/** limb(a,b,r0,r1,bulge,peak) — 21점 프로필(k 배율 전) */
export function limbProfile(r0: number, r1: number, bulge = 0, peak = 0.35): ProfileKey[] {
  const P: ProfileKey[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    let r = r0 + (r1 - r0) * t;
    r *= 1 + bulge * Math.exp(-((t - peak) ** 2) / 0.045);
    P.push([t, r]);
  }
  return P;
}

/** 팔다리 치수(k 배율 전) — 예시 draw 의 limb · ball · ring 인자 그대로 */
export const LIMB = {
  shin: { r0: 0.06, r1: 0.057, bulge: 0.07, peak: 0.55 },
  cuffR: 0.056,
  cuffTube: 0.0055,
  calf: { r0: 0.054, r1: 0.035, bulge: 0.1, peak: 0.12 },
  knee: 0.059,
  ankle: 0.036,
  shoulder: [0.053, 0.056, 0.053] as const,
  sleeve: { r0: 0.053, r1: 0.049, bulge: 0.02, peak: 0.3 },
  sleeveRingR: 0.049,
  sleeveRingTube: 0.0065,
  upper: { r0: 0.045, r1: 0.038, bulge: 0.1, peak: 0.25 },
  elbow: 0.038,
  forearm: { r0: 0.04, r1: 0.026, bulge: 0.13, peak: 0.22 },
  wrist: 0.026,
  neck: { r0: 0.06, r1: 0.05, bulge: -0.06, peak: 0.6 },
  neck2: { r0: 0.052, r1: 0.046, bulge: 0, peak: 0.35 },
  thumb: { r0: 0.011, r1: 0.009 },
} as const;

/* ───────────────────────────── 신발 ───────────────────────────── */

export const SHOE = { RN: 28, K: 44, n: 2.6, soleRN: 22, soleN: 3.2, length: 0.25 } as const;
export const shoeWidth = (k: number): Profile => [
  [0, 0.012 * k],
  [0.07, 0.034 * k],
  [0.28, 0.04 * k],
  [0.62, 0.049 * k],
  [0.86, 0.043 * k],
  [1, 0.008 * k],
];
export const shoeUp = (k: number): Profile => [
  [0, 0.03 * k],
  [0.08, 0.07 * k],
  [0.3, 0.08 * k],
  [0.48, 0.064 * k],
  [0.78, 0.04 * k],
  [0.95, 0.026 * k],
  [1, 0.01 * k],
];
export const soleWidth = (k: number): Profile => [
  [0, 0.014 * k],
  [0.07, 0.037 * k],
  [0.28, 0.042 * k],
  [0.62, 0.052 * k],
  [0.86, 0.046 * k],
  [1, 0.012 * k],
];
/** 끈 셋의 자리(t)와 높이 프로필 */
export const SHOE_LACE_T = [0.42, 0.5, 0.58] as const;
export const laceHeight = (k: number): Profile => [
  [0.4, 0.066 * k],
  [0.6, 0.052 * k],
];

/* ───────────────────────────── 머리 · 손 · 작은 것 ───────────────────────────── */

export const HEAD = {
  radii: [0.079, 0.108, 0.097] as const,
  nose: { offFw: 0.094, offUp: -0.014, radii: [0.011, 0.019, 0.015] as const },
  ear: { offX: 0.077, offFw: -0.008, radii: [0.011, 0.024, 0.015] as const },
} as const;

export const HAND = {
  palm: [0.031, 0.048, 0.019] as const,
  ballR: 0.037,
  seamR: 0.0372,
  seamTube: 0.0018,
  gloveBody: [0.06, 0.112, 0.04] as const,
  gloveThumb: [0.024, 0.07, 0.032] as const,
  gloveLace: [0.048, 0.09, 0.02] as const,
  gloveRingR: 0.032,
  gloveRingTube: 0.007,
} as const;

export const TRIM = {
  buckle: [0.05, 0.036, 0.01] as const,
  loop: [0.012, 0.05, 0.008] as const,
  stripe: { w: 0.02, d: 0.006, count: 12, t0: 0.36, step: 0.045 },
  buttonT: [0.46, 0.56, 0.66, 0.76] as const,
  button: [0.008, 0.008, 0.003] as const,
  collar: { sx: 0.064, sy: 0.06, tz: 0.06, tube: 0.14 },
  beltTube: 0.16,
  laceBox: [0.05, 0.006, 0.005] as const,
} as const;
