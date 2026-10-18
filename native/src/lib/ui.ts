import { useColorScheme, type TextStyle, type ViewStyle } from 'react-native';
import { usePrefs } from '~/lib/prefs';

/** 앱 화면 색 — 사이트(app/globals.css)의 밝은 · 어두운 바탕과 같은 값 */
const LIGHT = {
  page: '#f2f2f7',
  card: '#ffffff',
  ink: '#1d1d1f',
  muted: '#6e6e73',
  line: '#e5e5ea',
  /* 진한 선 — 사이트 --color-line-strong(작은 그래프 바탕 · 화살표) */
  lineStrong: '#c7c7cc',
  sky: '#0a84d6',
  danger: '#d70015',
  chip: '#e5e5ea',
  /* 주의(권하지 않음 · 통증을 남긴 날) — 사이트 --color-warn · --color-warn-bg */
  warn: '#b45309',
  warnBg: '#fffbeb',
  /* 좋음(적정 · 변화 좋음) — 사이트 --color-ok */
  ok: '#047857',
  /* 고르개의 고른 칸 — 사이트 --color-raised */
  /* 하늘색 판 · 짙은 하늘 글자(첫날 카드 등) · 경고 · 위험 판 — 사이트 --color-sky-tint · sky-strong · warn-line · danger-bg · danger-line */
  skyTint: '#e8f3fc',
  skyStrong: '#0369a1',
  warnLine: '#fde68a',
  dangerBg: '#fef2f2',
  dangerLine: '#fecaca',
  raised: '#ffffff',
  /* 카드가 바탕 위에 떠 보이게 — 사이트 globals.css --card-float 네 겹(위 빛 · 가장자리 · 접촉 · 주변 그림자) */
  float:
    'inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 0.5px rgba(20,30,50,0.06), 0 1px 2px rgba(20,30,50,0.05), 0 6px 16px -4px rgba(20,30,50,0.08), 0 22px 44px -14px rgba(20,30,50,0.12)',
};
/* 다크 · 네이비 카드 — 검은 바탕이라 그림자 대신 가장자리 빛(사이트 :root[data-theme='dark'] 의 --card-float) */
const FLOAT_DARK =
  'inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 0.5px rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.4), 0 8px 20px -6px rgba(0,0,0,0.5)';
const DARK: typeof LIGHT = {
  page: '#000000',
  card: '#1c1c1e',
  ink: '#f5f5f7',
  muted: '#98989d',
  line: '#38383a',
  /* 진한 선 — 사이트 --color-line-strong(작은 그래프 바탕 · 화살표) */
  lineStrong: '#48484a',
  /* 사이트 다크도 #0a84d6(단추 바탕 — 흰 글자 대비를 라이트와 같게) · 위험 #f87171 */
  sky: '#0a84d6',
  danger: '#f87171',
  chip: '#2c2c2e',
  warn: '#fcd34d',
  warnBg: '#2a1e08',
  ok: '#34d399',
  skyTint: '#0a1f2b',
  skyStrong: '#7dd3fc',
  warnLine: '#78350f',
  dangerBg: '#2a1010',
  dangerLine: '#7f1d1d',
  /* 사이트 :root[data-theme='dark'] --color-raised(네이비는 #3b4a63) */
  raised: '#636366',
  float: FLOAT_DARK,
};
/* 네이비 — 사이트 :root[data-theme='navy'](바탕 · 카드 · 선) + 어두운 테마가 같이 쓰는 글자 · 상태색 */
const NAVY: typeof LIGHT = {
  page: '#0b1220',
  card: '#141d2b',
  ink: '#e8eef7',
  muted: '#94a3b8',
  line: '#2a3648',
  /* 진한 선 — 사이트 --color-line-strong(작은 그래프 바탕 · 화살표) */
  lineStrong: '#44556e',
  sky: '#0a84d6',
  danger: '#f87171',
  chip: '#1e293b',
  warn: '#fcd34d',
  warnBg: '#2a1e08',
  ok: '#34d399',
  skyTint: '#0e2a3d',
  skyStrong: '#7dd3fc',
  warnLine: '#78350f',
  dangerBg: '#2a1010',
  dangerLine: '#7f1d1d',
  raised: '#3b4a63',
  float: FLOAT_DARK,
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

/**
 * 글자 — 사이트와 같은 느낌(app/globals.css). 큰 제목은 굵기 800 · 자간 −0.03em(.text-heading, 휴대폰 34px),
 * 숫자는 둥글고 고정폭(.text-numeric — 아이폰의 SF Pro Rounded). 화면마다 크기만 덧붙여 쓴다: [TYPE.num, { fontSize: 28 }].
 */
export const TYPE = {
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  heading: { fontWeight: '800', letterSpacing: -0.5 },
  num: { fontFamily: 'ui-rounded', fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
} satisfies Record<string, TextStyle>;

/** 간격 — 사이트 휴대폰 규격: 카드 안 20(--block-pad) · 카드 사이 16 · 큰 덩이 사이 24 · 화면 양옆 16 */
export const SPACE = { pad: 20, gap: 16, section: 24, side: 16 } as const;

/** 누르면 살짝 눌림 — 사이트 카드의 [data-pressed] scale(0.985) */
export const PRESSED = { transform: [{ scale: 0.985 }] } satisfies ViewStyle;

/** '#0a84d6' + 0.4 → 'rgba(10,132,214,0.4)' — 웹의 bg-sky/40 · ink/8 같은 투명 색 */
export const withAlpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
