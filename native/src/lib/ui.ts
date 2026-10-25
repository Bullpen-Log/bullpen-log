import { useColorScheme, type ViewStyle } from 'react-native';
import { usePrefs } from '~/lib/prefs';
import { PALETTES, type Palette } from './design-tokens';
export { PALETTES, TYPE, SPACE, RADIUS, CONTROL, SURFACE, type Palette } from './design-tokens';

/** 칠할 테마 — 설정의 '자동'만 기기 밝기를 따른다(웹과 같다, 고른 적 없으면 라이트) */
export function useTheme(): 'light' | 'dark' | 'navy' {
  const { theme } = usePrefs();
  const system = useColorScheme();
  return theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : theme;
}

export function usePalette(): Palette {
  const theme = useTheme();
  return PALETTES[theme];
}

/** 누르면 살짝 눌림 — 사이트 카드의 [data-pressed] scale(0.985) */
export const PRESSED = { transform: [{ scale: 0.985 }] } satisfies ViewStyle;

/** '#0a84d6' + 0.4 → 'rgba(10,132,214,0.4)' — 웹의 bg-sky/40 · ink/8 같은 투명 색 */
export const withAlpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
