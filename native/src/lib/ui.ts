import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, useColorScheme, type ViewStyle } from 'react-native';
import { usePrefs } from '~/lib/prefs';
import { PALETTES, PALETTES_HIGH_CONTRAST, type Palette } from './design-tokens';
export { PALETTES, TYPE, SPACE, RADIUS, CONTROL, SURFACE, type Palette } from './design-tokens';

/** 칠할 테마 — 설정의 '자동'만 기기 밝기를 따른다(웹과 같다, 고른 적 없으면 자동) */
export function useTheme(): 'light' | 'dark' | 'navy' {
  const { theme } = usePrefs();
  const system = useColorScheme();
  return theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : theme;
}

/* 폰 '대비 높이기' — 앱 전체에 한 번만 묻고 듣는다(usePalette 는 화면 수백 곳이 부른다). 안드로이드는 늘 false */
let darker = false;
const darkerSubs = new Set<() => void>();
const setDarker = (v: boolean) => {
  if (v === darker) return;
  darker = v;
  darkerSubs.forEach((f) => f());
};
void AccessibilityInfo.isDarkerSystemColorsEnabled().then(setDarker, () => undefined);
AccessibilityInfo.addEventListener('darkerSystemColorsChanged', setDarker);
const subscribeDarker = (f: () => void) => {
  darkerSubs.add(f);
  return () => {
    darkerSubs.delete(f);
  };
};

export function usePalette(): Palette {
  const theme = useTheme();
  const highContrast = useSyncExternalStore(subscribeDarker, () => darker);
  return (highContrast ? PALETTES_HIGH_CONTRAST : PALETTES)[theme];
}

/** 누르면 살짝 눌림 — 사이트 카드의 [data-pressed] scale(0.985) */
export const PRESSED = { transform: [{ scale: 0.985 }] } satisfies ViewStyle;

/** '#0a84d6' + 0.4 → 'rgba(10,132,214,0.4)' — 웹의 bg-sky/40 · ink/8 같은 투명 색 */
export const withAlpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
