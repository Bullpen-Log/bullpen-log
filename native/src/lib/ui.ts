import { useColorScheme } from 'react-native';
import { usePrefs } from '~/lib/prefs';

/** 앱 화면 색 — 사이트(app/globals.css)의 밝은 · 어두운 바탕과 같은 값 */
const LIGHT = {
  page: '#f2f2f7',
  card: '#ffffff',
  ink: '#1d1d1f',
  muted: '#6e6e73',
  line: '#e5e5ea',
  sky: '#0a84d6',
  danger: '#d70015',
  chip: '#e5e5ea',
  /* 주의(권하지 않음 · 통증을 남긴 날) — 사이트 --color-warn · --color-warn-bg */
  warn: '#b45309',
  warnBg: '#fffbeb',
  /* 좋음(적정 · 변화 좋음) — 사이트 --color-ok */
  ok: '#047857',
  /* 고르개의 고른 칸 — 사이트 --color-raised */
  raised: '#ffffff',
};
const DARK: typeof LIGHT = {
  page: '#000000',
  card: '#1c1c1e',
  ink: '#f5f5f7',
  muted: '#98989d',
  line: '#38383a',
  sky: '#0a84ff',
  danger: '#ff453a',
  chip: '#2c2c2e',
  warn: '#fcd34d',
  warnBg: '#2a1e08',
  ok: '#34d399',
  raised: '#3b4a63',
};
/* 네이비 — 사이트 :root[data-theme='navy'](바탕 · 카드 · 선) + 어두운 테마가 같이 쓰는 글자 · 상태색 */
const NAVY: typeof LIGHT = {
  page: '#0b1220',
  card: '#141d2b',
  ink: '#e8eef7',
  muted: '#94a3b8',
  line: '#2a3648',
  sky: '#0a84d6',
  danger: '#f87171',
  chip: '#1e293b',
  warn: '#fcd34d',
  warnBg: '#2a1e08',
  ok: '#34d399',
  raised: '#3b4a63',
};
export type Palette = typeof LIGHT;

/** 칠할 테마 — 설정의 '자동'만 기기 밝기를 따른다(웹과 같다, 고른 적 없으면 라이트) */
export function useTheme(): 'light' | 'dark' | 'navy' {
  const { theme } = usePrefs();
  const system = useColorScheme();
  return theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : theme;
}

export function usePalette(): Palette {
  const theme = useTheme();
  return theme === 'navy' ? NAVY : theme === 'dark' ? DARK : LIGHT;
}
