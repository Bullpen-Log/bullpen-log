/**
 * 기종 · 촬영 fps 별 초점(긴 변의 배수) — 자기 보정의 흔들리는 축을 묶는다(2026-10-17).
 *
 * 두 폰이 같은 투수를 겨누면 초점은 다시 비춤으로 거의 안 정해지고 뼈 길이가 고른다(camera.ts). 그래서 몇 장면만 달라져도 초점이 흔들려
 * 회전 · 배율까지 따라 움직였다(10-12 마커 p9: 팔 이름 6~7장면에 뒤 초점 오차 +12.3 → +5.0%). 1배 사전(FOCAL_PRIOR_1X, k 0.78 · 폭 25%)은
 * 넓어서 못 묶는다. 같은 기종 · 같은 fps 모드면 초점이 거의 같으니 잰 값을 좁게 준다.
 *
 * 값 = 마커 촬영 보정의 초점 ÷ 긴 변 1920. 영상 머리의 기종(com.apple.quicktime.model)과 촬영 fps(240 · 120)로 찾는다 — 분석 서버가 읽어
 * 넘긴다(services/pitch3d-gpu pipeline.py device_info). 화면 녹화 · 표에 없는 기종 · fps · 줌은 예전처럼 1배 사전.
 * 값은 2026-10-16 막대 · 바닥 보정(다시 비춤 0.35px, 바닥 줄자 ±1%) 두 묶음의 가운데(120fps). 두 묶음 차이 ±0.8% → 폭 3%.
 * 10-16 마커 13구: 초점 오차 옆 −9.4 → −0.2% · 뒤 카메라 방향 4.9 → 1.3°, 관절 3.3/3.0 → 2.4/2.6cm, 몸통이 도는 때 오차 2.9 → 1.0%,
 * 착지 때 상체 3.7 → 1.0°, 레이백 4.7 → 2.9°(드리프트 판정만 10 → 9/13 — 경계의 한 구).
 *
 * 240fps 는 뺐다: 같은 폰도 240 이 120 보다 8~14% 넓게 찍혀(셋 모두) 따로 재야 하는데, 그 값(10-12 몸 스티커 보정 — 막대 · 바닥 없음)은
 * 보정 판마다 ±5% 흔들렸고, 넣어 보니 10-12 공식 채점에서 레이백 오차가 5.2 → 8.3° 로 나빠졌다(관절 · 골반 · 분리는 그대로).
 * 240fps 는 막대 · 바닥으로 다시 잰 뒤에 더한다(4판 촬영).
 */
import { FOCAL_PRIOR_1X, type FocalPrior, type FocalPriors } from '@/lib/pitch-3d/camera';

/** 카메라 한 대의 기종 · 촬영 fps — 영상 머리에서 읽은 그대로 */
export type CameraDevice = { model?: string | null; fps?: number | null };

const TABLE: { model: string; fps: number; k: number; sigma: number }[] = [
  { model: 'iPad (10th generation)', fps: 120, k: 0.8558, sigma: 0.03 },
  { model: 'iPhone SE (2nd generation)', fps: 120, k: 0.8433, sigma: 0.03 },
  { model: 'iPhone 15 Pro Max', fps: 120, k: 0.7967, sigma: 0.03 },
];

const MODES = [24, 25, 30, 48, 50, 60, 100, 120, 240];
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** 영상의 정해진 fps(예: 240, 59.94)를 가장 가까운 촬영 모드로 — 5% 밖이면 모름 */
export function fpsMode(fps: number | null | undefined): number | null {
  if (!(typeof fps === 'number' && fps > 0)) return null;
  const m = MODES.reduce((a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a));
  return Math.abs(m - fps) <= m * 0.05 ? m : null;
}

/** 표에서 찾은 초점 사전 — 기종 · fps 가 표에 없으면 null */
export function devicePrior(d: CameraDevice | null | undefined): FocalPrior | null {
  if (!d?.model) return null;
  const mode = fpsMode(d.fps);
  const row = TABLE.find((r) => r.fps === mode && norm(r.model) === norm(d.model!));
  return row ? { k: row.k, sigma: row.sigma } : null;
}

/**
 * 엔진에 줄 초점 사전 — 1배로 찍었으면(lens1x) 카메라마다 표 값, 표에 없는 카메라는 1배 사전. 표에 하나도 없으면 예전과 같은 1배 사전 하나.
 * 줌이면 표(1배에서 잰 값)를 안 쓴다.
 */
export function cameraFocalPriors(
  lens1x: boolean,
  devices?: { side?: CameraDevice | null; back?: CameraDevice | null } | null
): FocalPriors | undefined {
  if (!lens1x) return undefined;
  const side = devicePrior(devices?.side);
  const back = devicePrior(devices?.back);
  if (!side && !back) return FOCAL_PRIOR_1X;
  return { side: side ?? FOCAL_PRIOR_1X, back: back ?? FOCAL_PRIOR_1X };
}
