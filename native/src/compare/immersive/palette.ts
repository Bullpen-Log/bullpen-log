/**
 * 비교 화면 전용 검은 팔레트(순수 — IM01). 앱 전체 테마(라이트 · 다크 · 네이비)와 상관없이 이 화면만 검다.
 *
 * - 무대 · 화면 #000, 도구 바탕 #0B0B0D~#151518, 주 글자 #F5F5F7, 보조 글자는 검정 위 4.5:1 넘게.
 * - 싱커 강조색(주 단추 · 링크 · 상태색)은 그대로 쓰되 검은 바탕 위 대비만 다크 판 값으로 — 새 브랜드 색을 만들지 않는다.
 * - 화면의 팔레트 꼴(design-tokens Palette)을 그대로 돌려줘 기존 부품(c.ink · c.card …)에 그대로 꽂을 수 있다.
 *   창 · 시트처럼 따로 뜨는 면도 같은 값을 받아야 한다(화면이 넘긴다).
 * - 상태 막대는 밝은 글자('light'). 이 화면에 있을 때만 바꾸고 나가면 되돌린다(앱 설정 파일은 안 건드린다).
 *
 * 화면(workbench)이 이 규칙을 쓴다(2026-11-03 통합).
 */

/** 이 화면이 쓰는 팔레트 칸(design-tokens 의 Palette 와 같은 이름) */
export type PaletteLike = {
  page: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  lineStrong: string;
  sky: string;
  action: string;
  onAction: string;
  link: string;
  danger: string;
  chip: string;
  warn: string;
  warnBg: string;
  ok: string;
  skyTint: string;
  skyStrong: string;
  warnLine: string;
  dangerBg: string;
  dangerLine: string;
  raised: string;
};

export const COMPARE_BLACK = {
  page: '#000000',
  stage: '#000000',
  /** 도구 바탕 */
  card: '#0b0b0d',
  /** 칩 · 고른 바탕 */
  chip: '#151518',
  ink: '#f5f5f7',
  /** 보조 글자 — 검정 위 7:1 넘게, 도구 바탕 위 6.5:1 넘게 */
  muted: '#a1a1a6',
  line: '#2c2c2e',
  lineStrong: '#48484a',
  raised: '#3a3a3c',
  /** 영상 위 머리 · 이름표 뒤 옅은 막(글자 대비가 필요한 곳만) */
  scrim: 'rgba(0,0,0,0.45)',
  /** 칸 사이 구분선 */
  separator: '#000000',
} as const;

/** 강조 · 상태색은 다크 판 그대로(검정 위에서 읽히게 맞춘 값) — 주 단추는 흰 글자 대비를 위해 원래 파랑 */
const ACCENTS = {
  sky: '#0070c9',
  action: '#0070c9',
  onAction: '#ffffff',
  link: '#7dd3fc',
  danger: '#f87171',
  warn: '#fcd34d',
  warnBg: '#2a1e08',
  ok: '#34d399',
  skyTint: '#0a1f2b',
  skyStrong: '#7dd3fc',
  warnLine: '#78350f',
  dangerBg: '#2a1010',
  dangerLine: '#7f1d1d',
} as const;

/**
 * 앱 팔레트 → 이 화면 팔레트. base 의 다른 칸(그림자 등)은 그대로 두고 색 칸만 검게.
 * highContrast(폰 '대비 높이기')면 보조 글자 · 선을 더 밝게.
 */
export function compareBlackPalette<P extends PaletteLike>(base: P, opts: { highContrast?: boolean } = {}): P {
  const hc = opts.highContrast === true;
  return {
    ...base,
    ...ACCENTS,
    page: COMPARE_BLACK.page,
    card: COMPARE_BLACK.card,
    chip: COMPARE_BLACK.chip,
    ink: COMPARE_BLACK.ink,
    muted: hc ? '#d1d1d6' : COMPARE_BLACK.muted,
    line: hc ? '#636366' : COMPARE_BLACK.line,
    lineStrong: hc ? '#8e8e93' : COMPARE_BLACK.lineStrong,
    raised: COMPARE_BLACK.raised,
    ...(hc ? { link: '#bae6fd', skyStrong: '#bae6fd', danger: '#fca5a5', warn: '#fde68a', ok: '#6ee7b7' } : null),
  };
}

/** 이 화면에서의 상태 막대 글자 — 늘 밝게 */
export const COMPARE_STATUS_BAR = 'light' as const;

/* ---- 대비 셈(WCAG 2) — 시험 · 점검용 ---- */
function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
