'use client';

import { useSyncExternalStore } from 'react';

/**
 * 아이폰 앱의 일반 · 광각 동시 촬영 부품(앱 쪽 'DualCamera' 플러그인 — mobile/ios, 2026-10-03 계획의 2단계)이 있나.
 *
 * 웹 화면(사파리 · 앱 안의 웹뷰)은 카메라를 한 번에 하나만 켠다 — 두 번째를 켜면 앞의 카메라가 멈춘다(WebKit). 그래서
 * 광각 영상을 일반 카메라와 함께 찍는 일은 앱이 카메라를 직접 잡아야 한다(애플 AVCaptureMultiCamSession). 그 부품이
 * 든 앱이면 true. 설정 '광각 영상도 같이 저장'의 안내가 이것을 본다.
 */
export const DUAL_CAMERA_PLUGIN = 'DualCamera';

type CapacitorLike = { isPluginAvailable?: (name: string) => boolean };

export function dualCameraAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as Window & { Capacitor?: CapacitorLike }).Capacitor;
  return cap?.isPluginAvailable?.(DUAL_CAMERA_PLUGIN) === true;
}

const noSubscribe = () => () => undefined;

/** 화면에서 읽기 — 서버에서 그릴 때는 false(앱인지 모른다) */
export function useDualCameraAvailable(): boolean {
  return useSyncExternalStore(noSubscribe, dualCameraAvailable, () => false);
}

/* ── 앱 부품과의 약속(mobile/ios/App/App/DualCameraPlugin.swift 머리말과 같다) — 4단계에서 측정 화면이 쓴다 ── */

/** 볼 자리 · 미리보기 자리 */
export type DualRect = { x: number; y: number; w: number; h: number };

export type DualStatus = { supported: boolean; reason?: string };

export type DualStartInfo = {
  mainFps: number;
  wideFps: number;
  /** 세로 화면 기준 픽셀 */
  mainWidth: number;
  mainHeight: number;
  wideWidth: number;
  wideHeight: number;
  /** 긴 변 방향 화각(도) — 엔진의 '카메라 가로 화각'으로 넘긴다 */
  mainFovDeg: number;
  wideFovDeg: number;
  /** 두 카메라를 함께 켜는 하드웨어 몫(1 이하여야 켜진다) */
  hardwareCost: number;
};

/** 앱이 잘라 넘긴 클립 하나 — read 로 조금씩 읽어 Blob 으로 만든다 */
export type DualClip = {
  path: string;
  /** 클립 안에서 던짐이 일어난 시각(초) */
  eventSec: number;
  durationSec: number;
  bytes: number;
  fps: number;
  width: number;
  height: number;
  fovDeg: number;
};

type NativeBridge = {
  nativePromise?: (
    plugin: string,
    method: string,
    options?: unknown
  ) => Promise<unknown>;
};

/** 앱 부품 부르기 — 앱이 아니거나 부품이 없으면 던진다 */
export async function callDualCamera<T>(method: string, options?: unknown): Promise<T> {
  const cap = (window as Window & { Capacitor?: NativeBridge }).Capacitor;
  if (!cap?.nativePromise || !dualCameraAvailable()) {
    throw new Error('이 기기에는 일반 · 광각 동시 촬영이 없어요.');
  }
  return (await cap.nativePromise(DUAL_CAMERA_PLUGIN, method, options)) as T;
}

/** 클립 파일을 조금씩(1MB) 읽어 Blob 으로 — 다 읽으면 앱의 임시 파일을 지운다 */
export async function readDualClip(clip: DualClip): Promise<Blob> {
  const parts: BlobPart[] = [];
  let offset = 0;
  for (;;) {
    const chunk = await callDualCamera<{ data: string; size: number; eof: boolean }>(
      'read',
      {
        path: clip.path,
        offset,
        length: 1024 * 1024,
      }
    );
    const bytes = Uint8Array.from(atob(chunk.data), (c) => c.charCodeAt(0));
    parts.push(bytes);
    offset += bytes.length;
    if (chunk.eof || bytes.length === 0) break;
  }
  await callDualCamera('discard', { paths: [clip.path] }).catch(() => undefined);
  return new Blob(parts, { type: 'video/mp4' });
}
