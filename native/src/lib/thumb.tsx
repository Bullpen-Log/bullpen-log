import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

/**
 * 운동 · 드릴 썸네일 — RN Image 는 기억이 없어 판을 오갈 때마다 다시 받아 빈 칸이 깜빡였다(2026-10-24 두 번째 검토).
 * 서명 주소는 열 때마다 뒤(?token)가 바뀌어, 기억 열쇠는 ? 앞만 쓴다.
 */
export function Thumb({ uri, style, contentFit = 'cover' }: { uri: string; style?: StyleProp<ImageStyle>; /** 잘라 채우기(cover) · 다 보이기(contain) */ contentFit?: 'cover' | 'contain' }) {
  return (
    <Image
      source={{ uri, cacheKey: uri.split('?')[0] }}
      cachePolicy="memory-disk"
      contentFit={contentFit}
      transition={120}
      style={style}
    />
  );
}
