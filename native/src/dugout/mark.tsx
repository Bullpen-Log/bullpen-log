import Svg, { Path, Rect } from 'react-native-svg';

/** 덕아웃 로고 — 둥근 지붕 + 벤치. 웹 components/logo.tsx DugoutMark 와 같은 그림(64 칸) */
export function DugoutMark({ size = 32, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M6.9 29.2 32.1 15.6 57.4 29.2" fill="none" stroke={color} strokeWidth={7.2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={11.2} y={33.3} width={42} height={7.7} rx={2.3} fill={color} />
      <Rect x={14.4} y={41.8} width={6.9} height={9.6} rx={2.3} fill={color} />
      <Rect x={43.1} y={41.8} width={6.9} height={9.6} rx={2.3} fill={color} />
    </Svg>
  );
}

/** 덕아웃 초록 — 웹 --color-dugout */
export const DUGOUT_GREEN = '#1d8a4f';

/** 아래 탭 막대의 고른 칸 색 — 웹 [data-brand='dugout'] 의 --tab-on(라이트 --color-sky · 네이비 --color-sky-strong) */
export const DUGOUT_TAB_ACCENT = { light: DUGOUT_GREEN, navy: '#7fe0a8' };
