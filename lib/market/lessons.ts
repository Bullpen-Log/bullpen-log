/**
 * 덕아웃 레슨 예약의 순수 규칙(2판, 2026-10-21) — 전문 분야 · 예약 상태 · 시간 고르기 · 후기. 서버 · 화면 · 시험이 같이 쓴다.
 * 닥터나우처럼: 코치 비교 → 날짜 · 시간 둘 고르고 요청 → 코치가 하나 확정 → 레슨장 회원 · 시간표에 들어감 → 끝난 뒤 후기.
 */

export const SPECIALTIES = [
  { key: 'pitching', label: '투구' },
  { key: 'hitting', label: '타격' },
  { key: 'fielding', label: '수비' },
  { key: 'catching', label: '포수' },
  { key: 'youth', label: '유소년' },
  { key: 'adult', label: '사회인' },
  { key: 'rehab', label: '재활 · 복귀' },
  { key: 'strength', label: '체력 · 웨이트' },
] as const;
export type SpecialtyKey = (typeof SPECIALTIES)[number]['key'];
export function isSpecialty(v: unknown): v is SpecialtyKey {
  return SPECIALTIES.some((s) => s.key === v);
}
export function specialtyLabel(key: string): string {
  return SPECIALTIES.find((s) => s.key === key)?.label ?? key;
}
/** 폼의 체크박스(specialty-<key>)에서 읽는다 */
export function readSpecialties(get: (name: string) => unknown): SpecialtyKey[] {
  return SPECIALTIES.filter((s) => get(`specialty-${s.key}`) === 'on').map(
    (s) => s.key
  );
}

export const BOOKING_STATUSES = [
  { key: 'REQUESTED', label: '요청함' },
  { key: 'CONFIRMED', label: '확정' },
  { key: 'DECLINED', label: '거절됨' },
  { key: 'CANCELED', label: '취소함' },
  { key: 'DONE', label: '끝남' },
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number]['key'];
export function bookingStatusLabel(key: string): string {
  return BOOKING_STATUSES.find((s) => s.key === key)?.label ?? key;
}

export const INTRO_MAX = 1000;
export const CAREER_MAX = 120;
export const PRICE_NOTE_MAX = 80;
export const HOURS_MAX = 80;
export const BOOKING_NOTE_MAX = 500;
export const REVIEW_MAX = 1000;
/** 요청은 지금부터 이 시간 뒤부터, 이 날 안에 */
export const BOOKING_MIN_HOURS_AHEAD = 2;
export const BOOKING_MAX_DAYS_AHEAD = 60;

/**
 * 'YYYY-MM-DDTHH:MM'(datetime-local)을 한국 시각의 Date 로 — 틀리면 null. 앞으로 2시간 뒤부터 60일 안.
 */
export function parseSlot(raw: unknown, now: Date): Date | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))
    return null;
  const d = new Date(`${raw}:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - now.getTime();
  if (ms < BOOKING_MIN_HOURS_AHEAD * 3_600_000) return null;
  if (ms > BOOKING_MAX_DAYS_AHEAD * 86_400_000) return null;
  return d;
}

/** 한국 시각으로 '10월 21일 (화) 19:00' */
export function formatSlot(d: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** 한국 날짜 키('YYYY-MM-DD')와 'HH:MM' — 시간표(OrgEvent)에 넣을 때 */
export function slotParts(d: Date): { dateKey: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`,
  };
}

export function isRating(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/** 평균 별점(소수 한 자리) — 없으면 null */
export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
}

/** 코치가 확정할 수 있는 요청인가 — 요청 상태이고 고른 때가 아직 안 지났을 때 */
export function canConfirm(
  b: { status: string; slot1: Date; slot2: Date | null },
  which: 1 | 2,
  now: Date
): boolean {
  if (b.status !== 'REQUESTED') return false;
  const slot = which === 1 ? b.slot1 : b.slot2;
  return !!slot && slot.getTime() > now.getTime();
}

/** 후기를 쓸 수 있나 — 끝난 예약이고 아직 안 썼을 때 */
export function canReview(b: { status: string; hasReview: boolean }): boolean {
  return b.status === 'DONE' && !b.hasReview;
}

/* ── 3판(2026-10-22, 닥터나우식 코치 찾기) — 누가 받나 · 언제 · 선호 조건 · 추천 점수 · 후기 칩 · 결제 수단 ── */

/** 누가 받나요 — 예약에 남기고 코치가 본다 */
export const AUDIENCES = [
  { key: 'kid', label: '초등 · 유소년', hint: '기본기 · 재미' },
  { key: 'teen', label: '중 · 고등', hint: '진학 · 선수반' },
  { key: 'adult', label: '대학 · 사회인', hint: '취미 · 동호회' },
  { key: 'pro', label: '선수 · 프로 지망', hint: '구속 · 세부 기술' },
] as const;
export type AudienceKey = (typeof AUDIENCES)[number]['key'];
export function isAudience(v: unknown): v is AudienceKey {
  return AUDIENCES.some((a) => a.key === v);
}
export function audienceLabel(key: string | null | undefined): string | null {
  return AUDIENCES.find((a) => a.key === key)?.label ?? null;
}

/** 언제 — 찾기 흐름의 날짜 칩. 'pick' 은 날짜를 직접 고른 것 */
export const WHEN_OPTIONS = [
  { key: 'today', label: '오늘' },
  { key: 'tomorrow', label: '내일' },
  { key: 'weekend', label: '이번 주말' },
  { key: 'week', label: '다음 주 안' },
  { key: 'any', label: '상관없어요' },
] as const;
export type WhenKey = (typeof WHEN_OPTIONS)[number]['key'];
export function isWhen(v: unknown): v is WhenKey {
  return WHEN_OPTIONS.some((w) => w.key === v);
}

/** 시간대 — 자정부터 몇 분 */
export const TIME_BANDS = [
  { key: 'morning', label: '오전', from: 6 * 60, to: 12 * 60 },
  { key: 'afternoon', label: '오후', from: 12 * 60, to: 18 * 60 },
  { key: 'evening', label: '저녁', from: 18 * 60, to: 23 * 60 },
] as const;
export type TimeBandKey = (typeof TIME_BANDS)[number]['key'];
export function isTimeBand(v: unknown): v is TimeBandKey {
  return TIME_BANDS.some((t) => t.key === v);
}

/** 선호 조건(닥터나우 '어떤 의사를 선호하시나요' 재해석) — 거르기가 아니라 추천 점수 · 까닭이 된다 */
export const PREFS = [
  { key: 'rated', label: '후기 좋음', hint: '평점 4.5 이상' },
  { key: 'reviewed', label: '후기 많음', hint: '후기 5개 이상' },
  { key: 'quick', label: '빠른 확정', hint: '하루 안에 답해요' },
  { key: 'sinker', label: '싱커 기록 봐 줌', hint: '내 기록 · 영상으로 레슨' },
  { key: 'trial', label: '체험가 있음', hint: '첫 레슨 할인' },
] as const;
export type PrefKey = (typeof PREFS)[number]['key'];
export function isPref(v: unknown): v is PrefKey {
  return PREFS.some((p) => p.key === v);
}
export function readPrefs(raw: string | undefined): PrefKey[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(isPref);
}

export const SORTS = [
  { key: 'match', label: '추천순' },
  { key: 'rating', label: '후기순' },
  { key: 'price', label: '가격 낮은순' },
  { key: 'quick', label: '확정 빠른순' },
] as const;
export type SortKey = (typeof SORTS)[number]['key'];
export function isSort(v: unknown): v is SortKey {
  return SORTS.some((s) => s.key === v);
}

/** 후기의 '좋았던 점' 칩 — 코치 상세에서 몇 명이 골랐는지 집계한다 */
export const REVIEW_TAGS = [
  { key: 'kind', label: '친절해요' },
  { key: 'clear', label: '설명이 쉬워요' },
  { key: 'fix', label: '바로 고쳐 줘요' },
  { key: 'ontime', label: '시간을 잘 지켜요' },
  { key: 'place', label: '시설이 좋아요' },
  { key: 'record', label: '기록을 봐 줘요' },
] as const;
export type ReviewTagKey = (typeof REVIEW_TAGS)[number]['key'];
export function reviewTagLabel(key: string): string {
  return REVIEW_TAGS.find((t) => t.key === key)?.label ?? key;
}
export function readReviewTags(get: (name: string) => unknown): ReviewTagKey[] {
  return REVIEW_TAGS.filter((t) => get(`tag-${t.key}`) === 'on').map((t) => t.key);
}

/** 결제 수단 — 저장만 한다(결제는 계약 뒤, lib/market/pay.ts). 'onsite' 는 레슨장에서 직접 */
export const PAY_METHODS = [
  { key: 'card', label: '카드', hint: '레슨이 끝난 뒤 결제돼요' },
  { key: 'easy', label: '간편결제', hint: '네이버 · 카카오 · 토스' },
  { key: 'onsite', label: '현장 결제', hint: '레슨장에서 직접' },
] as const;
export type PayMethodKey = (typeof PAY_METHODS)[number]['key'];
export function isPayMethod(v: unknown): v is PayMethodKey {
  return PAY_METHODS.some((p) => p.key === v);
}
export function payMethodLabel(key: string | null | undefined): string | null {
  return PAY_METHODS.find((p) => p.key === key)?.label ?? null;
}

export const QUICK_CONFIRM_HOURS = 24;
export const RATED_MIN = 4.5;
export const REVIEWED_MIN = 5;
export const COMPARE_MAX = 3;
export const SLOT_MIN_DEFAULT = 60;

/** 추천 점수에 쓰는 코치의 요약 — 읽기(lesson-load.ts)가 채운다 */
export type CoachFacts = {
  specialties: string[];
  region: string | null;
  rating: number | null;
  reviews: number;
  /** 확정까지 걸린 시간의 가운데 값(시간) — 확정한 예약이 없으면 null */
  confirmHours: number | null;
  sinkerReview: boolean;
  trialPrice: number | null;
  priceFrom: number | null;
  /** 요일별 레슨 가능 시간(VenueHours 모양) — 안 적었으면 null */
  slots: Record<string, { open: string; close: string } | null> | null;
};

export type CoachMatch = { score: number; reasons: string[] };

/**
 * 찾기 조건과 코치를 견줘 점수와 까닭을 낸다(순수). 점수는 차례만 정하고, 까닭은 카드의 '왜 추천' 칩이 된다.
 * 거르기(전문 · 지역 · 검색)는 DB 가 하고, 여기서는 선호 조건 · 시간대 · 후기로 차례를 매긴다.
 */
export function matchCoach(
  c: CoachFacts,
  f: {
    specialty?: string;
    prefs?: PrefKey[];
    band?: TimeBandKey;
    weekday?: number;
  }
): CoachMatch {
  let score = 0;
  const reasons: string[] = [];
  const prefs = new Set(f.prefs ?? []);
  if (f.specialty && c.specialties.includes(f.specialty)) {
    score += 30;
    reasons.push(`${specialtyLabel(f.specialty)} 전문`);
  }
  if (c.rating != null) {
    score += c.rating * 6;
    if (c.rating >= RATED_MIN && c.reviews > 0) {
      score += prefs.has('rated') ? 20 : 6;
      reasons.push(`후기 ${c.rating}`);
    }
  }
  if (c.reviews >= REVIEWED_MIN) {
    score += Math.min(10, Math.log2(c.reviews + 1) * 2) + (prefs.has('reviewed') ? 15 : 0);
    reasons.push(`후기 ${c.reviews}개`);
  }
  if (c.confirmHours != null && c.confirmHours <= QUICK_CONFIRM_HOURS) {
    score += prefs.has('quick') ? 20 : 5;
    reasons.push('빠른 확정');
  }
  if (c.sinkerReview) {
    score += prefs.has('sinker') ? 20 : 3;
    if (prefs.has('sinker')) reasons.push('싱커 기록 봐 줌');
  }
  if (c.trialPrice != null) {
    score += prefs.has('trial') ? 15 : 2;
    if (prefs.has('trial')) reasons.push('체험가');
  }
  if (f.band && c.slots) {
    const d = f.weekday ?? 6;
    if (openInBand(c.slots, d, f.band)) {
      score += 12;
      reasons.push(`${TIME_BANDS.find((b) => b.key === f.band)?.label} 가능`);
    }
  }
  return { score, reasons: reasons.slice(0, 3) };
}

/** 그 요일에 그 시간대로 레슨 시간이 겹치나 */
export function openInBand(
  slots: Record<string, { open: string; close: string } | null>,
  weekday: number,
  band: TimeBandKey
): boolean {
  const h = slots[String(weekday)];
  if (!h) return false;
  const b = TIME_BANDS.find((t) => t.key === band)!;
  const o = toMin(h.open);
  const c = toMin(h.close);
  if (o == null || c == null) return false;
  return o < b.to && c > b.from;
}

function toMin(t: string): number | null {
  const m = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** '언제' 칩 → 그 조건에 드는 요일 번호들(0=일). 날짜를 직접 고르면 그 요일 하나 */
export function weekdaysOfWhen(when: WhenKey, todayWeekday: number): number[] {
  if (when === 'today') return [todayWeekday];
  if (when === 'tomorrow') return [(todayWeekday + 1) % 7];
  if (when === 'weekend') return [6, 0];
  return [0, 1, 2, 3, 4, 5, 6];
}

/**
 * 카드의 '다음 가능' 한 줄 — 오늘 · 내일 · 요일 이름으로. 레슨 시간을 안 적은 코치는 null(카드는 '시간 문의').
 * now 는 한국 시각으로 넘긴다(요일 · 몇 분).
 */
export function nextOpenLabel(
  slots: Record<string, { open: string; close: string } | null> | null,
  kstWeekday: number,
  kstMin: number
): string | null {
  if (!slots) return null;
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  for (let i = 0; i < 7; i++) {
    const d = (kstWeekday + i) % 7;
    const h = slots[String(d)];
    if (!h) continue;
    const c = toMin(h.close);
    if (i === 0 && c != null && c - 60 <= kstMin) continue;
    const from = i === 0 && toMin(h.open)! < kstMin ? '지금' : `${h.open}부터`;
    return i === 0 ? `오늘 ${from}` : i === 1 ? `내일 ${h.open}부터` : `${names[d]}요일 ${h.open}부터`;
  }
  return null;
}

/** 확정까지 걸린 시간(시간 단위)의 가운데 값 */
export function medianHours(pairs: { createdAt: Date; confirmedAt: Date | null }[]): number | null {
  const hs = pairs
    .filter((p) => p.confirmedAt)
    .map((p) => (p.confirmedAt!.getTime() - p.createdAt.getTime()) / 3_600_000)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  if (hs.length === 0) return null;
  const mid = Math.floor(hs.length / 2);
  return hs.length % 2 ? hs[mid] : (hs[mid - 1] + hs[mid]) / 2;
}

/** 별점 분포(5 → 1)와 좋았던 점 집계 — 상세의 후기 요약 */
export function reviewSummary(reviews: { rating: number; tags: string[] }[]): {
  dist: { star: number; n: number; pct: number }[];
  tags: { key: string; label: string; n: number }[];
} {
  const total = reviews.length;
  const dist = [5, 4, 3, 2, 1].map((star) => {
    const n = reviews.filter((r) => r.rating === star).length;
    return { star, n, pct: total ? Math.round((n / total) * 100) : 0 };
  });
  const counts = new Map<string, number>();
  for (const r of reviews) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tags = REVIEW_TAGS.map((t) => ({ key: t.key, label: t.label, n: counts.get(t.key) ?? 0 }))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n);
  return { dist, tags };
}

/** 찾기 조건 → 목록 주소 */
export function listHref(p: Record<string, string | undefined>): string {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);
  return `/lessons/list${s.size ? `?${s}` : ''}`;
}

/** 후기에 적는 이름 — 닥터나우처럼 가운데를 가린다('금윤호' → '금*호', 두 글자는 '김*') */
export function maskName(name: string): string {
  const n = name.trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${'*'.repeat(n.length - 2)}${n[n.length - 1]}`;
}
