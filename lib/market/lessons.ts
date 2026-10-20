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
