import { loadJson, saveJson } from '~/lib/store';
import { LAST_MODE_KEY, parseMode, type CameraMode } from '@/lib/camera-mode';

/**
 * 카메라 화면의 모드(앱) — 정의는 웹과 같이 쓰는 lib/camera-mode.ts(MODES · modeInfo · MODE_YELLOW), 여기는 앱 저장소에 두는 것만
 * (docs/designs/camera-modes.md).
 */
export { MODES, modeInfo, allowedMode, MODE_YELLOW, type CameraMode, type ModeInfo } from '@/lib/camera-mode';

export async function loadLastMode(): Promise<CameraMode> {
  return parseMode(await loadJson(LAST_MODE_KEY));
}

export const saveLastMode = (mode: CameraMode) => saveJson(LAST_MODE_KEY, mode);

/** 지난 설정은 모드마다 따로 — 구속 측정은 옛 키 그대로(옛 판이 저장한 것이 그대로 보이게) */
export const setupKeyOf = (mode: CameraMode) => (mode === 'speed' ? 'bullpen-velocity-setup' : 'bullpen-velocity-setup:abs');
