import { nativeApiNow } from '@/lib/native-bridge';

/**
 * 앱 부품 기능마다 필요한 약속 판(mobile/ios/App/App/BullpenNativePlugin.swift 의 API) — 2026-10-16 통합 검토(docs/architecture/04-interfaces.md 4-3).
 * 앱은 새로 깔아야 바뀌니, 새 웹이 업데이트 안 한 앱에 없는 기능을 부르지 않게 여기서 견준다. 부품을 바꿔 API 를 올리면 여기에 한 줄.
 */
export const NATIVE_FEATURES = {
  /** 앱 카메라 하나로 켜기(DualCamera status 의 single · 손떨림 보정 · 1080p 60) — 판 1 전 앱은 status 의 single 칸으로 짐작 */
  appCamera: 1,
} as const;

export type NativeFeature = keyof typeof NATIVE_FEATURES;

/** 이 앱이 그 기능을 하나 — 판을 아직 모르거나 판이 없는 옛 앱이면 null(부르는 쪽이 예전 짐작으로) */
export function nativeSupports(feature: NativeFeature, api = nativeApiNow()): boolean | null {
  return api == null ? null : api >= NATIVE_FEATURES[feature];
}
