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
};

export type ThrowEvent = { atSec: number; strength: number; kind: 'ball' | 'seed' | 'motion' | 'skip'; thermal: number };
export type FpsEvent = { fps: number; dropped: number; shutter: number; iso: number };

export type DualCameraEvents = {
  throw: (e: ThrowEvent) => void;
  error: (e: { message: string }) => void;
  fps: (e: FpsEvent) => void;
  /** 중력 방향(폰 좌표 x 오른쪽 · y 위 · z 화면 밖) — level({ on: true }) 동안 0.1초마다 */
  level: (e: { x: number; y: number; z: number }) => void;
};
