import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';

/** 지도 위 점 하나 — id 는 누르면 그대로 돌아온다 */
export type KakaoMarker = { id: string; lat: number; lng: number };

export type KakaoMapProps = {
  style?: StyleProp<ViewStyle>;
  markers: KakaoMarker[];
  /** 진하게 · 그 자리로 옮김 */
  selectedId?: string | null;
  onReady?: () => void;
  onMarkerPress?: (e: NativeSyntheticEvent<{ id: string }>) => void;
  /** message: 'no-key'(열쇠 없음) · 'auth'(카카오 인증 실패 — 번들 ID · 카카오맵 사용 설정) · 'view' */
  onError?: (e: NativeSyntheticEvent<{ message: string; code?: number; desc?: string }>) => void;
};

/** 카카오맵 뷰(modules/kakao-map/ios) — iOS 앱에서만. 바닥 판이 없으면(옛 앱) requireNativeView 가 던지니 부르는 쪽이 감싼다 */
export const KakaoMapView: ComponentType<KakaoMapProps> = requireNativeView('KakaoMap');
