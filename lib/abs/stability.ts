/**
 * 삼각대 움직임 감시 — 세션 중 몇 초마다 다시 찾은 플레이트 앞변을 보정 때의 자리와 견준다.
 * 2px 넘게 밀렸으면 '다시 보정' 상태로 두고 띠를 1.5배 넓힌다(다시 찾기에 성공해 자리가 맞으면 풀린다). 못 찾은 장면(포수 · 타자가 가림)은 무시.
 */
import type { PlateFind } from './plate-detect.ts';
import type { Bands } from './rules.ts';

export const DRIFT_PX = 2;
export const DRIFT_BAND_SCALE = 1.5;

export type DriftState = {
  /** 보정 때 앞변 가운데 · 폭(px) */
  ref: { mid: [number, number]; width: number };
  /** 마지막으로 잰 밀림(px) · 다시 보정이 필요한가 · 못 찾은 횟수 */
  movedPx: number;
  recalibrate: boolean;
  misses: number;
  lastSeenAt: number | null;
};

export function driftInit(ref: PlateFind, now: number): DriftState {
  return {
    ref: {
      mid: [(ref.left[0] + ref.right[0]) / 2, (ref.left[1] + ref.right[1]) / 2],
      width: Math.hypot(ref.right[0] - ref.left[0], ref.right[1] - ref.left[1]),
    },
    movedPx: 0,
    recalibrate: false,
    misses: 0,
    lastSeenAt: now,
  };
}

/** 새로 찾은 결과를 넣는다 — 돌려주는 것은 새 상태(원본은 안 바꿈) */
export function driftUpdate(state: DriftState, found: PlateFind, now: number): DriftState {
  if (!found.ok) return { ...state, misses: state.misses + 1 };
  const mid: [number, number] = [(found.left[0] + found.right[0]) / 2, (found.left[1] + found.right[1]) / 2];
  const width = Math.hypot(found.right[0] - found.left[0], found.right[1] - found.left[1]);
  /* 폭이 15% 넘게 다르면 다른 것을 찾은 것(포수 장비 등) — 무시 */
  if (Math.abs(width - state.ref.width) / state.ref.width > 0.15) return { ...state, misses: state.misses + 1 };
  const movedPx = Math.hypot(mid[0] - state.ref.mid[0], mid[1] - state.ref.mid[1]);
  return { ...state, movedPx, recalibrate: movedPx > DRIFT_PX, misses: 0, lastSeenAt: now };
}

/** 밀렸으면 띠를 넓힌다 */
export function bandsFor(state: DriftState, bands: Bands): Bands {
  if (!state.recalibrate) return bands;
  return { lateralCm: bands.lateralCm * DRIFT_BAND_SCALE, verticalCm: bands.verticalCm * DRIFT_BAND_SCALE };
}
