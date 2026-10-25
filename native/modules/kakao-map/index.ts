import { requireOptionalNativeModule } from 'expo-modules-core';

export { KakaoMapView, type KakaoMapProps, type KakaoMarker } from './src/KakaoMap';

/** 이 앱 바닥 판에 카카오맵이 들었나 — 옛 앱(업데이트로 화면 코드만 받은 앱)은 없어 웹 지도를 그대로 쓴다 */
export const hasKakaoMap = requireOptionalNativeModule('KakaoMap') != null;
