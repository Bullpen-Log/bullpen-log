/**
 * EX-LOAD01 — 밴드 카탈로그(상표 → 제품 계열 → 단계).
 *
 * 밴드 단계는 '어느 제품인가'를 말할 뿐, 실제로 낸 힘(kg)이 아니다. 제조사 자료가 말하듯 힘은 늘인 길이 · 닳은 정도에 따라 달라진다
 * ("The force produced by bands and tubing is directly related to elongation."). 그래서
 *   - 색을 kg 으로 바꾸지 않는다 · 바벨 무게에 더하지 않는다 · 1RM 을 셈하지 않는다
 *   - 다른 계열 · 다른 상표의 같은 색을 같은 세기로 보지 않는다(견줌 열쇠에 계열이 들어간다)
 *   - 상표 하나의 모든 제품에 같은 색표를 붙이지 않는다 — 계열마다 따로, 제조사가 확인해 준 단계만 넣는다.
 *
 * 2026-11-16 원문 확인(제조사 지원 문서, WebFetch 로 직접 읽음):
 *   - THERABAND Professional Latex Resistance Bands — tan · yellow(가벼움) / red · green(중간) / blue · black · silver · gold(높음). 8색.
 *     https://support.performancehealth.com/support/solutions/articles/69000743839-theraband-professional-latex-resistance-bands
 *   - THERABAND Resistance Tubing(같은 회사 'Tubing, Active Recovery Kit, Light' 문서) — tan → silver 7색. **gold 없음** — 밴드 목록을 베끼지 않는다.
 *     https://support.performancehealth.com/support/solutions/articles/69000741800-theraband-tubing-active-recovery-kit-light
 *   묶음 안의 차례는 제조사 문서가 적은 차례 그대로다(묶음 사이 차례는 문서가 밝힌다).
 *
 * 후보(아직 넣지 않음 — 개별 단계를 원문으로 다시 확인한 뒤): Rogue Monster Bands, Jaeger J-Bands. 상표 · 단계가 목록에 없으면
 * '다른 상표'로 인쇄된 상표 · 단계 글자를 그대로 적는다(표준 단계로 맞추지 않음 — unstandardized).
 *
 * 순수 모듈 — 서버 · 웹 · 앱이 같이 쓴다.
 */

export const BAND_CATALOG_REVISION = '2026-11-16.1';

export type BandLevel = {
  /** 계열 안에서 바뀌지 않는 번호 — 저장에 쓴다 */
  id: string;
  /** 계열 안 차례(1 = 가장 가벼움). 다른 계열과 견주지 않는다 */
  order: number;
  /** 색 이름(글) — 색을 못 봐도 읽힌다 */
  label: { ko: string; en: string; ja: string };
  /** 화면 점 색(보조) — 글과 늘 같이 쓴다 */
  swatch: string;
};

export type BandSeries = {
  id: string;
  brand: string;
  /** 제조사가 쓰는 계열 이름 그대로 */
  name: string;
  kind: 'band' | 'tubing';
  source: { url: string; checkedAt: string; note: string };
  levels: BandLevel[];
};

const C = {
  tan: { ko: '탄', en: 'Tan', ja: 'タン', swatch: '#d8c3a5' },
  yellow: { ko: '노랑', en: 'Yellow', ja: 'イエロー', swatch: '#f2d43d' },
  red: { ko: '빨강', en: 'Red', ja: 'レッド', swatch: '#d83a34' },
  green: { ko: '초록', en: 'Green', ja: 'グリーン', swatch: '#2f9e55' },
  blue: { ko: '파랑', en: 'Blue', ja: 'ブルー', swatch: '#2d6fd6' },
  black: { ko: '검정', en: 'Black', ja: 'ブラック', swatch: '#222222' },
  silver: { ko: '은색', en: 'Silver', ja: 'シルバー', swatch: '#b9bec6' },
  gold: { ko: '금색', en: 'Gold', ja: 'ゴールド', swatch: '#c9a227' },
} as const;

type ColorName = keyof typeof C;

const levels = (seriesId: string, names: readonly ColorName[]): BandLevel[] =>
  names.map((n, i) => ({
    id: `${seriesId}:${n}`,
    order: i + 1,
    label: { ko: C[n].ko, en: C[n].en, ja: C[n].ja },
    swatch: C[n].swatch,
  }));

export const BAND_SERIES: readonly BandSeries[] = [
  {
    id: 'theraband-professional-latex-band',
    brand: 'THERABAND',
    name: 'THERABAND Professional Latex Resistance Bands',
    kind: 'band',
    source: {
      url: 'https://support.performancehealth.com/support/solutions/articles/69000743839-theraband-professional-latex-resistance-bands',
      checkedAt: '2026-11-16',
      note: 'tan · yellow / red · green / blue · black · silver · gold. Force depends on elongation.',
    },
    levels: levels('theraband-professional-latex-band', ['tan', 'yellow', 'red', 'green', 'blue', 'black', 'silver', 'gold']),
  },
  {
    id: 'theraband-resistance-tubing',
    brand: 'THERABAND',
    name: 'THERABAND Resistance Tubing',
    kind: 'tubing',
    source: {
      url: 'https://support.performancehealth.com/support/solutions/articles/69000741800-theraband-tubing-active-recovery-kit-light',
      checkedAt: '2026-11-16',
      note: 'tan → silver (7). Gold is not listed for tubing.',
    },
    levels: levels('theraband-resistance-tubing', ['tan', 'yellow', 'red', 'green', 'blue', 'black', 'silver']),
  },
];

export const CUSTOM_TEXT_MAX = 40;

export function seriesById(id: string): BandSeries | null {
  return BAND_SERIES.find((s) => s.id === id) ?? null;
}

export function levelById(seriesId: string, levelId: string): BandLevel | null {
  return seriesById(seriesId)?.levels.find((l) => l.id === levelId) ?? null;
}

/** 저장되는 밴드 하나 — 카탈로그 단계거나, 인쇄된 글자 그대로의 다른 상표 */
export type BandComponent =
  | {
      catalog: string;
      seriesId: string;
      levelId: string;
      /** 그때의 화면 이름(나중에 카탈로그 글이 바뀌어도 지난 기록은 그대로) */
      label: { ko: string; en: string; ja: string };
      swatch: string | null;
    }
  | {
      /**
       * 목록에 없는 상표 — 인쇄된 상표 · 제품 계열(모델) · 단계 글자 그대로. 계열을 모르면 series 가 null 이고 '계열 모름'이다 —
       * 상표 + 색만으로는 무엇인지 모르므로 어느 견줌에도 들어가지 않는다(같은 상표 안에서도).
       */
      custom: { brand: string; series: string | null; level: string };
      unstandardized: true;
    };

const cleanText = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = Array.from(v.replace(/\s+/g, ' ').trim()).slice(0, CUSTOM_TEXT_MAX).join('');
  return t.length ? t : null;
};

/**
 * 받은 밴드 하나를 거른다 — 카탈로그 단계면 화면 이름을 카탈로그에서 다시 붙이고(받은 글을 믿지 않는다), 다른 상표면 글자만.
 * 모르는 계열 · 단계, 빈 글자는 null.
 */
export function cleanBandComponent(raw: unknown): BandComponent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.custom && typeof o.custom === 'object') {
    const c = o.custom as Record<string, unknown>;
    const brand = cleanText(c.brand);
    const level = cleanText(c.level);
    const series = cleanText(c.series);
    if (!brand || !level) return null;
    return { custom: { brand, series, level }, unstandardized: true };
  }
  if (typeof o.seriesId !== 'string' || typeof o.levelId !== 'string') return null;
  const lv = levelById(o.seriesId, o.levelId);
  if (!lv) return null;
  return { catalog: BAND_CATALOG_REVISION, seriesId: o.seriesId, levelId: lv.id, label: lv.label, swatch: lv.swatch };
}

/** 한 세트에 같이 쓰는 밴드 수의 위쪽 끝 */
export const MAX_BANDS = 3;

/** 밴드 하나를 사람 말로 — '노랑 · THERABAND Professional Latex Resistance Bands' / '다른 상표: OO · 단계 3' */
export function bandText(b: BandComponent, lang: 'ko' | 'en' | 'ja' = 'ko'): string {
  if ('custom' in b) return [b.custom.brand, b.custom.series ?? '계열 모름', b.custom.level].join(' · ');
  const s = seriesById(b.seriesId);
  return `${b.label[lang]}${s ? ` · ${s.name}` : ''}`;
}

/**
 * 밴드 견줌 열쇠 — 같은 역할 · 같은 계열 · 같은 단계 묶음끼리만 견준다. 다른 상표(표준 아님)가 섞이면 견주지 않는다(null).
 * 단계 차례로 '세기'를 정하지 않는다 — 보조 밴드는 강할수록 쉬운 세트라 오름차순 최고 기록 규칙을 쓰지 않는다.
 */
export function bandComparisonKey(role: string, bands: readonly BandComponent[]): string | null {
  /* 역할을 모르면(세트마다 고르는 운동에서 '모름') 견주지 않는다 */
  if (bands.length === 0 || (role !== 'resistance' && role !== 'assistance')) return null;
  const parts: string[] = [];
  for (const b of bands) {
    if ('custom' in b) return null;
    parts.push(`${b.seriesId}:${b.levelId}`);
  }
  return `band:${role}:${parts.sort().join('+')}`;
}
