/**
 * 깊이 단서 — 맞춘 궤적의 끝(te, 정규 깊이 1)이 카메라에서 실제로 몇 m 인가(D). 통과 순간 = 깊이라 ABS 의 높이 오차는 거의 이 σ 다.
 *
 * 1차 단서(2026-10-18):
 *  - 'mitt'  공은 포수 미트에서 멈춘다(엔진 impact). 미트는 플레이트 꼭지 뒤 0.4~0.9m — 보정된 플레이트 깊이 + MITT_BEHIND_M. 튕김을 봤으면(rebound) σ 0.2,
 *            끝만 봤으면(end) σ 0.35. 플레이트 깊이는 앞변 폭에서(0.5%) 와 같은 보정이라 거리 오차가 서로 상쇄된다.
 *  - 'ball'  엔진이 공 크기로 어림한 거리(sizeDistM, BLOB_SIZE_RATIO) — σ 4%(화각 짐작 포함). 약하지만 늘 있다.
 *  - 'input' 사용자가 줄자로 잰 카메라 → 미트 거리(있을 때만, σ 0.15).
 * 2차(P5): 포수 발 · 투수 디딤발(지면 호모그래피) · 시차. 10-19 촬영이 실제 미트 뒤 거리 분포와 σ 를 알려 준다.
 */
import type { Calib } from './calib.ts';
import { worldToCam } from './cross.ts';

export type DepthCueKind = 'mitt' | 'ball' | 'input' | 'catcher' | 'pitcher' | 'parallax';
export type DepthCue = { kind: DepthCueKind; D: number; sigma: number; used: boolean };

/** 포수 미트가 플레이트 꼭지 뒤에 있는 거리(m) · 높이(m) — 사전값. P0 촬영으로 바꾼다 */
export const MITT_BEHIND_M = 0.6;
export const MITT_HEIGHT_M = 0.6;
export const MITT_SIGMA_REBOUND = 0.2;
export const MITT_SIGMA_END = 0.35;
export const BALL_SIZE_SIGMA_REL = 0.04;
export const INPUT_SIGMA_M = 0.15;

export function mittCue(calib: Calib, impact: 'rebound' | 'end'): DepthCue {
  const pc = worldToCam([0, MITT_HEIGHT_M, -MITT_BEHIND_M], calib.pose);
  return { kind: 'mitt', D: pc[2], sigma: impact === 'rebound' ? MITT_SIGMA_REBOUND : MITT_SIGMA_END, used: false };
}

export function ballSizeCue(sizeDistM: number | null): DepthCue | null {
  if (sizeDistM == null || !(sizeDistM > 3)) return null;
  return { kind: 'ball', D: sizeDistM, sigma: sizeDistM * BALL_SIZE_SIGMA_REL, used: false };
}

export function inputCue(distM: number | null | undefined): DepthCue | null {
  if (distM == null || !(distM > 3)) return null;
  return { kind: 'input', D: distM, sigma: INPUT_SIGMA_M, used: false };
}

/**
 * 역분산 가중 평균 + χ² 일관성 — 가장 어긋난 단서가 3σ 넘게 벗어나면 빼고(한 번), 남은 단서가 하나뿐이면 σ 를 1.5배 넓힌다.
 * 돌려주는 cues 에는 used 가 적힌다.
 */
export function fuseDepth(cues: DepthCue[]): { D: number; sigma: number; cues: DepthCue[] } {
  const valid = cues.filter((c) => Number.isFinite(c.D) && c.sigma > 0);
  if (!valid.length) return { D: NaN, sigma: NaN, cues };
  const fuse = (xs: DepthCue[]) => {
    let w = 0;
    let s = 0;
    for (const c of xs) {
      const wi = 1 / (c.sigma * c.sigma);
      w += wi;
      s += wi * c.D;
    }
    return { D: s / w, sigma: Math.sqrt(1 / w) };
  };
  let use = valid;
  let f = fuse(use);
  if (use.length >= 2) {
    const worst = use
      .map((c) => ({ c, z: Math.abs(c.D - f.D) / Math.hypot(c.sigma, f.sigma) }))
      .sort((a, b) => b.z - a.z)[0];
    if (worst.z > 3) {
      use = use.filter((c) => c !== worst.c);
      f = fuse(use);
      if (use.length === 1) f = { D: f.D, sigma: f.sigma * 1.5 };
    }
  }
  return {
    D: f.D,
    sigma: f.sigma,
    cues: cues.map((c) => ({ ...c, used: use.includes(c) })),
  };
}
