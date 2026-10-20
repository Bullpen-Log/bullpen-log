/** 구속 측정 카메라(ios/DualCameraModule.swift)의 약속 — 사이트 lib/dual-camera.ts 와 같은 모양 */

/** 세로 화면 0~1 */
export type Rect01 = { x: number; y: number; w: number; h: number };
export type Point01 = { x: number; y: number };

export type StartOptions = {
  fps?: number;
  preferFps?: number;
  short?: number;
  net?: boolean;
  roi?: Rect01;
  armed?: boolean;
  zoom?: number;
  wide?: boolean;
  focus?: Point01;
  focusFar?: boolean;
};

export type StartInfo = {
  mainFps: number;
  mainWidth: number;
  mainHeight: number;
  mainFovDeg: number;
  stabilization?: string;
  /** Debug(최적화 없는 Swift) 빌드인가 — 장면을 반이나 버려 측정이 안 된다(2026-10-20). 옛 앱 판에는 없다 */
  debugBuild?: boolean;
  appVersion?: string;
  appBuild?: string;
  [key: string]: unknown;
};

export type Clip = {
  path: string;
  eventSec: number;
  durationSec: number;
  bytes: number;
  fps: number;
  width: number;
  height: number;
  fovDeg: number;
  fovSource: string;
  stabilized: boolean;
  /** 클립에 실제로 담긴 장면 수 · 그로 셈한 초당 장면 수 — 약속한 fps 보다 많이 모자라면 캡처가 장면을 버린 것(옛 앱 판에는 없다) */
  frames?: number;
  fpsActual?: number;
};

export type ThrowEvent = { atSec: number; strength: number; kind: 'ball' | 'seed' | 'motion' | 'skip'; thermal: number };
/** 1초마다 — thermal 0~3(ProcessInfo.ThermalState) · feedMs 장면당 공 찾기 시간(ms) · feedSkipped 공 찾기가 밀려 건너뛴 장면 수. 셋은 2026-10-20 판부터 */
export type FpsEvent = { fps: number; dropped: number; shutter: number; iso: number; thermal?: number; feedMs?: number; feedSkipped?: number };

export type DualCameraEvents = {
  throw: (e: ThrowEvent) => void;
  error: (e: { message: string }) => void;
  fps: (e: FpsEvent) => void;
  /** 중력 방향(폰 좌표 x 오른쪽 · y 위 · z 화면 밖) — level({ on: true }) 동안 0.1초마다 */
  level: (e: { x: number; y: number; z: number }) => void;
};
