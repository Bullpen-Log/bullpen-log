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
  /** 카메라 모듈이 클립에 싣는 모델 후보(Clip.hits)의 약속 판 — 없으면 옛 판(후보를 안 싣는다). 2026-10-25 설계안 작업 B */
  hitsSchema?: number;
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

/** kind 'net' — 학습 모델 공 알림(SPEC-detect D3, strength = 첫 표본 점수 0~1). D4 부터 앱이 이 알림으로 잰다(capture.ts) */
export type ThrowEvent = { atSec: number; strength: number; kind: 'ball' | 'seed' | 'motion' | 'skip' | 'net'; thermal: number };
/**
 * 1초마다 — thermal 0~3(ProcessInfo.ThermalState) · feedMs 장면당 공 찾기 시간(ms) · feedSkipped 공 찾기가 밀려 건너뛴 장면 수(셋은 2026-10-20 판부터).
 * droppedLate · droppedBuffers 버린 장면의 까닭(늦음 · 버퍼 모자람), writerSkipped 인코더가 안 받아 클립에 빠진 장면, writerResets 깨진 녹화기를 새로 연 횟수(같은 날 밤 판부터)
 */
export type FpsEvent = {
  fps: number;
  dropped: number;
  shutter: number;
  iso: number;
  /** 지금 셔터 상한의 분모(2000 · 1000 · 500 — 어두우면 푼다, 2026-10-21 판부터) */
  shutterCap?: number;
  thermal?: number;
  feedMs?: number;
  feedSkipped?: number;
  droppedLate?: number;
  droppedBuffers?: number;
  writerSkipped?: number;
  writerResets?: number;
  /** 아이폰 화면 기록(또는 미러링)이 켜져 있나 — 장면이 빠져 공을 놓친다 */
  screenCaptured?: boolean;
  /** 장면당 학습 모델 공 알림 시간(ms) — 모델이 있는 판부터 */
  netMs?: number;
};

export type DualCameraEvents = {
  throw: (e: ThrowEvent) => void;
  error: (e: { message: string }) => void;
  fps: (e: FpsEvent) => void;
  /** 중력 방향(폰 좌표 x 오른쪽 · y 위 · z 화면 밖) — level({ on: true }) 동안 0.1초마다 */
  level: (e: { x: number; y: number; z: number }) => void;
};
