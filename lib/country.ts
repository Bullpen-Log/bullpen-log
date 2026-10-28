/**
 * 나라마다 다른 싱커(2026-10-28 김민: "미국 · 일본 앱스토어에 먼저 — 투수 전용으로"). 앱은 하나이고, 계정의 나라(User.country)가
 * 탭 · 메뉴를 가른다 — 같은 앱을 나라별로 따로 내면 애플 심사(4.3 같은 앱 여러 개)에 걸린다.
 *
 * 나라를 가르는 곳은 이 파일의 함수만 쓴다. "미국 싱커만 이렇게"는 여기 규칙을 더하거나 `country === 'us'` 로 가른다 —
 * 가르지 않은 화면은 세 나라에 다 바뀐다. 관리자는 앱 관리자 화면의 '나라'로 제 계정의 나라를 바꿔 본다(시험용).
 * 화면 글은 아직 모두 한국어다(번역은 따로).
 */
export type Country = 'kr' | 'us' | 'jp';

export const COUNTRIES: readonly Country[] = ['kr', 'us', 'jp'];
export const COUNTRY_LABEL: Record<Country, string> = { kr: '한국', us: '미국', jp: '일본' };

export const isCountry = (v: unknown): v is Country => v === 'kr' || v === 'us' || v === 'jp';
/** 계정 칸 → 나라. 비어 있으면 한국(이 칸이 생기기 전 계정 모두) */
export const countryOf = (v: string | null | undefined): Country => (isCountry(v) ? v : 'kr');

/** 타격 — 국내만. 미국 · 일본은 투수 전용으로 먼저 낸다 */
export const hasHitting = (c: Country) => c === 'kr';

/** 그 나라에 없는 주소인가 — 타격 탭 · 타격 하위 화면 · 타격 트레이닝 */
export function hiddenIn(c: Country, href: string): boolean {
  if (hasHitting(c)) return false;
  return /^\/hitting(?:[/?]|$)/.test(href) || /[?&]sport=hit(?:&|$)/.test(href);
}

export const forCountry = <T extends { href: string }>(items: T[], c: Country): T[] =>
  items.filter((i) => !hiddenIn(c, i.href));

export const forCountryGroups = <G extends { items: { href: string }[] }>(groups: G[], c: Country): G[] =>
  groups.map((g) => ({ ...g, items: forCountry(g.items, c) })).filter((g) => g.items.length > 0);
