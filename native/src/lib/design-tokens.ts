import type { TextStyle, ViewStyle } from 'react-native';

/** 싱커 앱 공통 디자인. sky는 기존 채움색 호환용이며 새 행동은 action, 글자는 link를 사용한다. */
const LIGHT = {
  page: '#f2f2f7',
  card: '#ffffff',
  ink: '#1d1d1f',
  muted: '#6e6e73',
  line: '#e5e5ea',
  /* 진한 선 — 사이트 --color-line-strong(작은 그래프 바탕 · 화살표) */
  lineStrong: '#c7c7cc',
  sky: '#0070c9',
  action: '#0070c9',
  onAction: '#ffffff',
  link: '#0069b4',
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
  // 기본 정보 카드와 주요 행동 카드의 깊이를 구분한다.
  float: '0 0 0 0.5px rgba(20,30,50,0.06), 0 3px 10px -3px rgba(20,30,50,0.09)',
  floatHero: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 5px rgba(20,30,50,0.07), 0 14px 30px -10px rgba(20,30,50,0.18)',
};
// 어두운 테마에서는 큰 검은 그림자 대신 얕은 경계와 최소한의 깊이를 사용한다.
const FLOAT_DARK = 'inset 0 0 0 0.5px rgba(255,255,255,0.1), 0 3px 10px rgba(0,0,0,0.22)';
const FLOAT_HERO_DARK = 'inset 0 1px 0 rgba(255,255,255,0.14), 0 10px 24px -8px rgba(0,0,0,0.55)';
const DARK: typeof LIGHT = {
  page: '#000000',
  card: '#1c1c1e',
  ink: '#f5f5f7',
  muted: '#98989d',
  line: '#38383a',
  /* 진한 선 — 사이트 --color-line-strong(작은 그래프 바탕 · 화살표) */
  lineStrong: '#48484a',
  // 버튼은 흰 글씨 대비를 유지하고 링크는 어두운 면에서 밝게 표시한다.
  sky: '#0070c9',
  action: '#0070c9',
  onAction: '#ffffff',
  link: '#7dd3fc',
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
  floatHero: FLOAT_HERO_DARK,
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
  sky: '#0070c9',
  action: '#0070c9',
  onAction: '#ffffff',
  link: '#7dd3fc',
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
  floatHero: FLOAT_HERO_DARK,
};
export type Palette = typeof LIGHT;
export const PALETTES = { light: LIGHT, dark: DARK, navy: NAVY };

/**
 * 글자 — 사이트와 같은 느낌(app/globals.css). 큰 제목은 굵기 800 · 자간 −0.03em(.text-heading, 휴대폰 34px),
 * 숫자는 둥글고 고정폭(.text-numeric — 아이폰의 SF Pro Rounded). 화면마다 크기만 덧붙여 쓴다: [TYPE.num, { fontSize: 28 }].
 */
export const TYPE = {
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  heading: { fontWeight: '800', letterSpacing: -0.5 },
  num: { fontFamily: 'ui-rounded', fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  /*
   * 글자 단계(2026-10-21 김민 "포인트가 없어 눈에 안 들어온다") — 크기 다섯 · 굵기 셋. 새 글은 이 중 하나를 쓴다.
   * 화면마다 주인공(hero) 하나 → 구역 제목(section) → 카드 제목(card) → 본문(body) → 보조(sub, 회색 · 보통 굵기).
   * 강조는 굵기가 아니라 크기 · 색으로. 파랑(sky)은 누르는 주 단추 · 지금 고른 것에만 — 꾸밈 그림은 ink · muted.
   */
  hero: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  section: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  card: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  button: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  buttonCompact: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  sub: { fontSize: 13, fontWeight: '400', lineHeight: 19 },
  /*
   * 문장 안 숫자 — 글꼴 · 크기는 둘레 글 그대로, 굵기 · 고정폭만. TYPE.num(둥근 숫자 글꼴)은 혼자 서는 큰 숫자에만:
   * 문장 안에 쓰면 숫자만 다른 글꼴이라 크기가 안 맞아 보이고, 한글 단위를 그 안에 넣으면 기기 기본 글꼴로 그려진다(2026-10-21).
   */
  numInline: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  /* 혼자 서는 큰 숫자 옆 단위(회색으로 덧붙임) — 숫자 20~26 이면 unit, 28~34 면 unitLg, 48 넘으면 20(구속 큰 숫자). 화면마다 비율이 제각각이었다 */
  unit: { fontSize: 15, fontWeight: '400' },
  unitLg: { fontSize: 17, fontWeight: '400' },
} satisfies Record<string, TextStyle>;

/** 간격 — 사이트 휴대폰 규격: 카드 안 20(--block-pad) · 카드 사이 16 · 큰 덩이 사이 24 · 화면 양옆 16 */
export const SPACE = { pad: 20, gap: 16, section: 24, side: 16 } as const;


/** 같은 역할의 모서리와 누름 영역은 화면마다 다시 정하지 않는다. */
export const RADIUS = { card: 20, inset: 16, control: 12, sheet: 28, pill: 999 } as const;
export const CONTROL = { height: 48, compact: 44, icon: 44, gap: 8 } as const;
export const SURFACE = {
  card: { borderRadius: RADIUS.card, padding: SPACE.pad, gap: 12 },
  inset: { borderRadius: RADIUS.inset, padding: 16, gap: 8 },
} satisfies Record<string, ViewStyle>;
