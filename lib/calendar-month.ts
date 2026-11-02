import { shiftDateKey } from '@/lib/pitch-stats';

/** Shared read-only calendar boundaries. Real dates only; never normalise February 30 into March. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function calendarRange(
  month: string
): { from: string; to: string; days: string[] } | null {
  if (!/^\d{4}-\d{2}$/.test(month) || !isCalendarDate(`${month}-01`)) return null;
  const first = `${month}-01`;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const from = shiftDateKey(first, -((weekday + 6) % 7));
  const days = Array.from({ length: 42 }, (_, n) => shiftDateKey(from, n));
  return { from, to: days[41], days };
}

export function calendarReadRange(from: unknown, to: unknown): from is string {
  if (!isCalendarDate(from) || !isCalendarDate(to)) return false;
  const days =
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
  return days >= 0 && days <= 62;
}
