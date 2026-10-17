import { useColorScheme } from 'react-native';

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
};
export type Palette = typeof LIGHT;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}
