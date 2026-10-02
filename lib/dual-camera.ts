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
