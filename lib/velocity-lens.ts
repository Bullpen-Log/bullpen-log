import { BALL_DIAMETER_M } from '@/lib/velocity-engine/geometry';

/**
 * 렌즈 보정 — 공으로 초점거리를 잰다.
 *
 * 구속은 초점거리에 정비례한다(거리 z = 지름·초점거리/픽셀지름, 속도는 z 의 기울기). 그런데
 * 초점거리를 '화각 69°' 가정으로 구하면 기종 · 동영상 모드의 크롭 · 손떨림 보정 크롭 · 디지털 줌에
 * 따라 5~10% 어긋난다 — 130km/h 가 118 이나 143 으로 나온다(시험대에서 6° 차이에 −14km/h).
 *
 * 그래서 공을 카메라에서 정확히 아는 거리(줄자로 1.0m)에 두고 화면에서 몇 픽셀인지 재면
 * 초점거리가 바로 나온다: f = 픽셀지름 × 거리 / 0.073. 같은 공 · 같은 지름 상수로 재므로 공 지름
 * 상수(7.3cm 가 실제 7.4cm 여도)의 오차까지 함께 사라진다.
 *
 * 거리는 '카메라 유리에서 공의 앞면까지'를 줄자로 재게 하고(사람이 재기 쉬운 것), 계산은 공의
 * 중심까지(+ 반지름 3.65cm)와 렌즈 입사동이 유리보다 안쪽에 있는 만큼(약 4mm)을 더해 쓴다 —
 * 0.5m 에서 이걸 빼먹으면 7%(−9km/h)가 어긋난다(2026-09-27 검토). 권장 거리는 1.0m: 줄자 1cm
 * 오차와 지름 0.5px 오차를 합친 몫이 1~1.5m 에서 가장 작다(0.5m 는 줄자 오차가 두 배).
 *
 * 값은 해상도에 딸려 있어 '긴 변 픽셀당 초점거리'로 저장한다 — 1080p 로 재고 4K 로 찍어도 맞는다.
 * 대신 카메라 자체가 바뀌면(다른 폰 · 다른 렌즈 · 다른 크롭) 틀리므로 카메라 이름 · 화면 비율 ·
 * 줌을 같이 저장해 두고, 측정 때 그것과 다르면 보정을 쓰지 않는다(lensMatches).
 */

export const LENS_KEY = 'bullpen-velocity-lens';
/**
 * 저장 형식 판 — 옛 값은 버리고 다시 재게 한다. 2: 거리 기준(앞면 + 반지름 + 입사동). 3(모델 1.6.0): 공 지름을 비행 중과
 * 같은 윤곽 자(limb.ts measureLimbStatic)로 잰다 — 2 는 면적으로 재 윤곽보다 0.91~0.95 배라, 그 값으로 재면 구속이
 * 5~9% 낮았다.
 */
export const LENS_VERSION = 3;

export type LensCalibration = {
  version: number;
  /** 초점거리 ÷ 긴 변 픽셀 수 — 해상도와 무관한 렌즈의 성질 */
  focalPerLongSide: number;
  /** 잴 때의 공 지름(원본 픽셀) · 앞면까지 거리(m) · 긴 변 — 되짚어 볼 때 */
  ballPx: number;
  surfaceDistanceM: number;
  longSide: number;
  /** 카메라 서명 — 이름 · 화면 비율(긴 변/짧은 변) · 줌. 다르면 보정을 안 쓴다 */
  label: string;
  aspect: number;
  zoom: number;
  savedAt: string;
};

export function loadLens(): LensCalibration | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LENS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LensCalibration>;
    if (p.version !== LENS_VERSION) return null;
    if (!(
      typeof p.focalPerLongSide === 'number' &&
      p.focalPerLongSide > 0.3 &&
      p.focalPerLongSide < 3
    )) {
      return null;
    }
    return {
      version: LENS_VERSION,
      focalPerLongSide: p.focalPerLongSide,
      ballPx: Number(p.ballPx) || 0,
      surfaceDistanceM: Number(p.surfaceDistanceM) || 0,
      longSide: Number(p.longSide) || 0,
      label: typeof p.label === 'string' ? p.label : '',
      aspect: Number(p.aspect) || 0,
      zoom: Number(p.zoom) || 1,
      savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
    };
  } catch {
    return null;
  }
}

export function saveLens(
  cal: Omit<LensCalibration, 'savedAt' | 'version'>
): LensCalibration {
  const full: LensCalibration = {
    ...cal,
    version: LENS_VERSION,
    savedAt: new Date().toISOString(),
  };
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

/** 렌즈 입사동이 카메라 유리보다 안쪽에 있는 만큼(m) — 어림 */
export const PUPIL_OFFSET_M = 0.004;

/** 공 앞면까지 잰 거리 → 공 중심 · 입사동 기준 거리(m) */
export function centerDistance(surfaceDistanceM: number): number {
  return surfaceDistanceM + BALL_DIAMETER_M / 2 + PUPIL_OFFSET_M;
}

/** 공 지름(원본 픽셀)과 앞면까지 거리(m)로 초점거리(원본 픽셀) */
export function focalFromBall(ballPx: number, surfaceDistanceM: number): number {
  return (ballPx * centerDistance(surfaceDistanceM)) / BALL_DIAMETER_M;
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

/** 화면 비율(긴 변 ÷ 짧은 변) — 가로 · 세로 어느 쪽으로 찍어도 같다 */
export function aspectOf(width: number, height: number): number {
  const a = Math.max(width, height) / Math.max(1, Math.min(width, height));
  return Math.round(a * 1000) / 1000;
}

/**
 * 저장된 보정을 지금 카메라에 써도 되나 — 같은 카메라(이름) · 같은 비율(±2%) · 같은 줌.
 * 해상도가 달라도(720p ↔ 1080p, 같은 크롭) 긴 변 비례라 괜찮다.
 */
export function lensMatches(
  cal: LensCalibration | null,
  camera: { label: string; width: number; height: number; zoom?: number | null } | null
): cal is LensCalibration {
  if (!cal || !camera) return false;
  if (cal.label && camera.label && cal.label !== camera.label) return false;
  const a = aspectOf(camera.width, camera.height);
  if (cal.aspect > 0 && Math.abs(a - cal.aspect) / cal.aspect > 0.02) return false;
  const z = camera.zoom ?? 1;
  if (Math.abs(z - (cal.zoom || 1)) > 0.05) return false;
  return true;
}

/** 보정할 때 고를 수 있는 거리(m, 공 앞면까지) — 줄자로 재기 쉬운 값. 1.0m 권장 */
export const CALIBRATION_DISTANCES = [1, 1.5, 2] as const;
export const RECOMMENDED_DISTANCE_M = 1;

/** 환산 화각이 이 범위 밖이면 잘못 잰 것(공이 아닌 것을 쟀거나 거리가 틀렸다) */
export const FOV_SANITY_DEG: readonly [number, number] = [45, 100];
