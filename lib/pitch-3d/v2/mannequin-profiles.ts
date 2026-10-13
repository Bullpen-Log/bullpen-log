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
  /* 꼬임 줄 — 유니폼 파이핑 같은 빨강(상아색 뼈 · 잰 선 색과 겹치지 않게) */
  twist: 0xd23b3b,
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
  twist: 0.6,
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
  /* 엉덩이 — 허리보다 넉넉히(2026-10-12 김민 "엉덩이가 부자연스럽다": 예전엔 허리와 거의 같은 폭이라 다리가 원통 옆에서 바로 나왔다) */
  [0, hw + 0.048 * k],
  [0.12, hw + 0.064 * k],
  [0.24, hw + 0.05 * k],
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
  /* 엉덩이 뒤(볼기) 볼륨 */
  [0, 0.092 * k],
  [0.12, 0.114 * k],
  [0.24, 0.104 * k],
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

/* ───────────────────────────── 무대 · 빛(4단계 — 예시 page.js 의 값) ───────────────────────────── */

/** 무대 — 노출 · 화각 · 바탕 그라데이션(예시 .stage) · 격자(미터) · 바닥 그림자 농도 */
export const STAGE = {
  exposure: 1.15,
  fov: 28,
  gradient: ['#2c3746', '#1b222c', '#12171e'],
  grid: { sizeM: 8, divisions: 16, a: 0x3c4858, b: 0x2a3442, opacity: 0.55 },
  shadowOpacity: 0.32,
} as const;

export type DirLightSpec = { color: number; intensity: number; position: Vec3; target: Vec3 };

/**
 * 빛 — 예시 page.js 의 반구 · L1(주, 그림자) · L2(보조) · L3(뒤). x · y 는 엉덩이 가운데 바닥점 기준, z 는 바닥에서의 높이(미터 · z 위 —
 * 예시의 z 는 절대 높이). 세기는 예시(r128 옛 조명)의 ×π 에서 시작해 나란히 견주며 맞춘 값. 반구 축: 예시는 자리를 안 정해 축이
 * 옆(+y, 1루 쪽)이었다 — 'side' 가 그 재현, 'up' 이 제대로 위.
 */
export const LIGHT_RIG: {
  hemi: { sky: number; ground: number; intensity: number; axis: 'up' | 'side' };
  key: DirLightSpec & {
    shadow: { size: number; half: number; near: number; far: number; bias: number; normalBias: number; radius: number };
  };
  fill: DirLightSpec;
  back: DirLightSpec;
} = {
  hemi: { sky: 0xf4f7ff, ground: 0x3a3f48, intensity: 2.3, axis: 'side' },
  key: {
    color: 0xfff6ea,
    intensity: 4.2,
    position: [1.6, -2.4, 4.6],
    target: [0, 0, 0.6],
    shadow: { size: 2048, half: 2.4, near: 0.5, far: 16, bias: -0.0005, normalBias: 0.015, radius: 4 },
  },
  fill: { color: 0xa9c2e2, intensity: 1.6, position: [-3, 3, 2], target: [0, 0, 0] },
  back: { color: 0xffffff, intensity: 1.1, position: [-2.5, 2.5, 3.2], target: [0, 0, 1] },
};

/** 예시 좌표(z 위 · 미터, x · y 는 엉덩이 바닥점 기준) → 보기 좌표(y 위 · 키 = 1). center 는 [cx, 0, cz] */
export const toDisplay = (p: Vec3, center: Vec3, H: number): Vec3 => [center[0] + p[0] / H, p[2] / H, center[2] - p[1] / H];

/** 마운드 결(미터) — 착지 자리 · 투수판 앞은 짙은 흙, 둘레는 어둡게, 값 잡음으로 얼룩 */
export const MOUND_GRAIN = { noiseAmp: 0.2, landingR: 0.55, rubberR: 0.6, rimW: 0.4, clayMix: 0.85, rimMix: 0.8 } as const;

/** 두 겹 값 잡음 0~1(예시 noise 그대로 — 미터 단위 x, y) */
export function valueNoise2(x: number, y: number): number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const f = (px: number, py: number) => {
    const i = Math.floor(px);
    const j = Math.floor(py);
    const u = px - i;
    const v = py - j;
    const a = h(i, j);
    const b = h(i + 1, j);
    const c = h(i, j + 1);
    const d = h(i + 1, j + 1);
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  return 0.6 * f(x * 9, y * 9) + 0.4 * f(x * 31, y * 31);
}

const smoothStep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * 마운드 색 섞임(미터) — [모래, 흙, 둘레] 무게(합 1)와 밝기. 예시 base.lerp(clay, w1).lerp(rim, w2)·(0.9 + 0.2·n) 과 같다.
 * dLanding 착지 발목까지, dRubber 투수판 앞(x0 − 0.08)까지, r 가운데에서의 거리, R 반지름.
 */
export function moundShade(dLanding: number, dRubber: number, r: number, R: number, noise: number): [number, number, number, number] {
  const g = MOUND_GRAIN;
  const w1 = g.clayMix * Math.max(smoothStep(1 - dLanding / g.landingR), smoothStep(1 - dRubber / g.rubberR));
  const w2 = g.rimMix * smoothStep((r - (R - g.rimW)) / g.rimW);
  return [(1 - w1) * (1 - w2), w1 * (1 - w2), w2, 0.9 + g.noiseAmp * noise];
}
