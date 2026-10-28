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

/**
 * 앱스토어 계정 나라(StoreKit storefront, ISO 3166-1 alpha-3) → 싱커 나라(2026-10-28 김민 Q3 — 사용자가 고르지 않는다).
 * 한 · 미 · 일 밖이면 null — 그때는 마지막으로 알려진 나라를 그대로 둔다(Q14, 처음이면 한국)
 */
const STOREFRONT: Record<string, Country> = { KOR: 'kr', USA: 'us', JPN: 'jp' };
export const countryOfStorefront = (code: unknown): Country | null =>
  typeof code === 'string' ? (STOREFRONT[code.toUpperCase()] ?? null) : null;

/**
 * 타격 · 영양 — 지금은 세 나라 모두 숨긴다(2026-10-28 김민: "한국에서도 일단 타격 제외 · 영양도 완전 삭제 말고 숨기기").
 * 화면 · 서버 코드는 그대로 두고 탭 · 메뉴 · 주소만 막는다. 다시 열 때는 아래 묶음에 나라를 넣는다 — 둘 다 원래 'kr' 하나
 * (영양은 식약처 식품 DB · 한식 식단 틀이라 국내만이었다, 같은 날 Q1).
 */
const HITTING_IN = new Set<Country>();
const NUTRITION_IN = new Set<Country>();
export const hasHitting = (c: Country) => HITTING_IN.has(c);
export const hasNutrition = (c: Country) => NUTRITION_IN.has(c);
/** 싱커 안 덕아웃의 레슨 · 연습장 · 채팅 · 번개 · 예약 — 국내만(해외 덕아웃은 커뮤니티만) */
export const hasKoreaDugout = (c: Country) => c === 'kr';

const startsAt = (href: string, root: string) => href === root || href.startsWith(`${root}/`) || href.startsWith(`${root}?`);

/** 그 나라에 없는 주소인가 — 타격(탭 · 하위 화면 · 타격 트레이닝 · 3D 스윙) · 영양 */
export function hiddenIn(c: Country, href: string): boolean {
  if (!hasHitting(c) && (startsAt(href, '/hitting') || startsAt(href, '/swing') || /[?&]sport=hit(?:&|$)/.test(href))) return true;
  if (!hasNutrition(c) && startsAt(href, '/nutrition')) return true;
  return false;
}

export const forCountry = <T extends { href: string }>(items: T[], c: Country): T[] =>
  items.filter((i) => !hiddenIn(c, i.href));

export const forCountryGroups = <G extends { items: { href: string }[] }>(groups: G[], c: Country): G[] =>
  groups.map((g) => ({ ...g, items: forCountry(g.items, c) })).filter((g) => g.items.length > 0);
