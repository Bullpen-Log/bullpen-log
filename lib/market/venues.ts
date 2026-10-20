/**
 * 덕아웃 장소 예약의 순수 규칙(3판, 2026-10-21) — 종류 · 요일별 영업시간 · 시간표 칸 · 겹침. 네이버 예약처럼 빈 칸을 보고 바로 잡는다.
 * 시각은 모두 '자정부터 몇 분'(0~1440)으로 센다 — 날짜 · 시간대 문제를 피한다.
 */

export const VENUE_KINDS = [
  { key: 'indoor', label: '실내 연습장' },
  { key: 'cage', label: '타격 케이지' },
  { key: 'machine', label: '피칭 머신' },
  { key: 'field', label: '야외 구장' },
  { key: 'other', label: '기타' },
] as const;
export type VenueKind = (typeof VENUE_KINDS)[number]['key'];
export function isVenueKind(v: unknown): v is VenueKind {
  return VENUE_KINDS.some((k) => k.key === v);
}
export function venueKindLabel(key: string): string {
  return VENUE_KINDS.find((k) => k.key === key)?.label ?? key;
}

export const SLOT_MINS = [30, 60, 120] as const;
export const VENUE_NAME_MAX = 40;
export const VENUE_INTRO_MAX = 1000;
export const VENUE_ADDRESS_MAX = 80;
export const BOOK_DAYS_AHEAD = 14;

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 요일(0=일)마다 열고 닫는 시각 'HH:MM', null 이면 쉼 */
export type VenueHours = Record<string, { open: string; close: string } | null>;

export function timeToMin(t: string): number | null {
  const m = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
export function minToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** 폼(hours-<요일>-open · -close · -closed)에서 영업시간을 읽는다. 열고 닫는 시각이 둘 다 있어야 그 요일이 선다 */
export function readHours(
  get: (name: string) => unknown
): { hours: VenueHours } | { error: string } {
  const hours: VenueHours = {};
  for (let d = 0; d < 7; d++) {
    if (get(`hours-${d}-closed`) === 'on') {
      hours[d] = null;
      continue;
    }
    const open = String(get(`hours-${d}-open`) ?? '').trim();
    const close = String(get(`hours-${d}-close`) ?? '').trim();
    if (!open && !close) {
      hours[d] = null;
      continue;
    }
    const o = timeToMin(open);
    const c = timeToMin(close);
    if (o == null || c == null || c <= o)
      return {
        error: `${WEEKDAYS[d]}요일 영업시간을 다시 봐 주세요(여는 시각이 닫는 시각보다 앞이어야 해요).`,
      };
    hours[d] = { open, close };
  }
  if (Object.values(hours).every((h) => h == null))
    return { error: '여는 요일이 하루는 있어야 해요.' };
  return { hours };
}

/** 저장된 JSON 을 안전하게 읽는다 */
export function parseHours(raw: unknown): VenueHours {
  const out: VenueHours = {};
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  for (let d = 0; d < 7; d++) {
    const v = src[String(d)];
    if (
      v &&
      typeof v === 'object' &&
      typeof (v as { open?: unknown }).open === 'string' &&
      typeof (v as { close?: unknown }).close === 'string'
    ) {
      const { open, close } = v as { open: string; close: string };
      out[d] =
        timeToMin(open) != null && timeToMin(close) != null ? { open, close } : null;
    } else out[d] = null;
  }
  return out;
}

export type Slot = { startMin: number; endMin: number; taken: boolean; past: boolean };

/**
 * 그날의 칸 — 영업시간을 slotMin 으로 자르고, 예약(확정 · 요청)과 겹치면 taken, 지난 칸은 past.
 * nowMin 은 그날이 오늘일 때 지금 몇 분(아니면 -1).
 */
export function slotsOf(
  hours: VenueHours,
  weekday: number,
  slotMin: number,
  booked: { startMin: number; endMin: number }[],
  nowMin = -1
): Slot[] {
  const h = hours[weekday];
  if (!h) return [];
  const o = timeToMin(h.open);
  const c = timeToMin(h.close);
  if (o == null || c == null) return [];
  const out: Slot[] = [];
  for (let s = o; s + slotMin <= c; s += slotMin) {
    const e = s + slotMin;
    out.push({
      startMin: s,
      endMin: e,
      taken: booked.some((b) => b.startMin < e && b.endMin > s),
      past: nowMin >= 0 && s < nowMin,
    });
  }
  return out;
}

/** 요청한 칸이 그날 영업시간 안의 칸인가(시작이 칸 경계에 맞고 끝이 닫는 시각 안) */
export function slotValid(
  hours: VenueHours,
  weekday: number,
  slotMin: number,
  startMin: number,
  endMin: number
): boolean {
  const h = hours[weekday];
  if (!h) return false;
  const o = timeToMin(h.open);
  const c = timeToMin(h.close);
  if (o == null || c == null) return false;
  if (endMin - startMin !== slotMin) return false;
  if (startMin < o || endMin > c) return false;
  return (startMin - o) % slotMin === 0;
}

export const VENUE_BOOKING_STATUSES = [
  { key: 'REQUESTED', label: '승인 기다림' },
  { key: 'CONFIRMED', label: '확정' },
  { key: 'DECLINED', label: '거절됨' },
  { key: 'CANCELED', label: '취소함' },
] as const;
export function venueBookingStatusLabel(key: string): string {
  return VENUE_BOOKING_STATUSES.find((s) => s.key === key)?.label ?? key;
}

/** 앞으로 BOOK_DAYS_AHEAD 일의 날짜 키(오늘부터) */
export function upcomingDays(todayKey: string, n = BOOK_DAYS_AHEAD): string[] {
  const out: string[] = [];
  const base = new Date(`${todayKey}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
export function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}
