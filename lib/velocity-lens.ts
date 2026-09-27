import { BALL_DIAMETER_M } from '@/lib/velocity-engine/geometry';

/**
 * 렌즈 보정 — 공으로 초점거리를 잰다.
 *
 * 구속은 초점거리에 정비례한다(거리 z = 지름·초점거리/픽셀지름, 속도는 z 의 기울기). 그런데
 * 초점거리를 '화각 69°' 가정으로 구하면 기종 · 동영상 모드의 크롭 · 손떨림 보정 크롭 · 디지털 줌에
 * 따라 5~10% 어긋난다 — 130km/h 가 118 이나 143 으로 나온다(시험대에서 6° 차이에 −19km/h).
 *
 * 그래서 공을 카메라에서 정확히 아는 거리(줄자로 1.00m)에 두고 화면에서 몇 픽셀인지 재면
 * 초점거리가 바로 나온다: f = 픽셀지름 × 거리 / 0.073. 같은 공 · 같은 지름 상수로 재므로 공 지름
 * 상수(7.3cm 가 실제 7.4cm 여도)의 오차까지 함께 사라진다.
 *
 * 값은 해상도에 딸려 있어 '긴 변 픽셀당 초점거리'로 저장한다 — 1080p 로 재고 4K 로 찍어도 맞는다.
 * 기기(폰)마다 다르므로 브라우저에 둔다. 폰을 바꾸거나 렌즈(1x · 0.5x)를 바꾸면 다시 잰다.
 */

export const LENS_KEY = 'bullpen-velocity-lens';

export type LensCalibration = {
  /** 초점거리 ÷ 긴 변 픽셀 수 — 해상도와 무관한 렌즈의 성질 */
  focalPerLongSide: number;
  /** 잴 때의 공 지름(원본 픽셀) · 거리(m) · 긴 변 — 되짚어 볼 때 */
  ballPx: number;
  distanceM: number;
  longSide: number;
  /** 카메라 이름(있으면) */
  label: string;
  savedAt: string;
};

export function loadLens(): LensCalibration | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LENS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LensCalibration>;
    if (!(
      typeof p.focalPerLongSide === 'number' &&
      p.focalPerLongSide > 0.3 &&
      p.focalPerLongSide < 3
    )) {
      return null;
    }
    return {
      focalPerLongSide: p.focalPerLongSide,
      ballPx: Number(p.ballPx) || 0,
      distanceM: Number(p.distanceM) || 0,
      longSide: Number(p.longSide) || 0,
      label: typeof p.label === 'string' ? p.label : '',
      savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
    };
  } catch {
    return null;
  }
}

export function saveLens(cal: Omit<LensCalibration, 'savedAt'>): LensCalibration {
  const full = { ...cal, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(LENS_KEY, JSON.stringify(full));
  } catch {
    /* 사생활 보호 모드 등 — 이번만 쓴다 */
  }
  window.dispatchEvent(new Event(LENS_CHANGE_EVENT));
  return full;
}

export function clearLens() {
  try {
    localStorage.removeItem(LENS_KEY);
  } catch {
    /* 위와 같다 */
  }
  window.dispatchEvent(new Event(LENS_CHANGE_EVENT));
}

export const LENS_CHANGE_EVENT = 'bullpen:velocity-lens';

/** 공 지름(원본 픽셀)과 거리(m)로 초점거리(원본 픽셀) */
export function focalFromBall(ballPx: number, distanceM: number): number {
  return (ballPx * distanceM) / BALL_DIAMETER_M;
}

/** 보정값 → 이 해상도의 초점거리(원본 픽셀) */
export function focalPxFor(cal: LensCalibration, longSide: number): number {
  return cal.focalPerLongSide * longSide;
}

/** 초점거리 → 긴 변 기준 화각(도) — 화면에 '약 66°' 로 보여 줄 때 */
export function fovDegFromFocal(focalPx: number, longSide: number): number {
  return (
    Math.round(((2 * Math.atan(longSide / 2 / focalPx) * 180) / Math.PI) * 10) / 10
  );
}

/** 보정할 때 고를 수 있는 거리(m) — 줄자로 재기 쉬운 값 */
export const CALIBRATION_DISTANCES = [0.5, 1, 1.5, 2] as const;
