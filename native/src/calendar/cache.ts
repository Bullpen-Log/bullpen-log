import type { CalendarEventView } from '@/lib/calendar-event';
import { calendarRange } from '@/lib/calendar-month';
import type { RecordItem } from '@/lib/records/day-records';

export type CalendarMonth = {
  records: RecordItem[] | null;
  events: CalendarEventView[] | null;
  recordError: string | null;
  eventError: string | null;
  refreshing: boolean;
};
const EMPTY: CalendarMonth = {
  records: null,
  events: null,
  recordError: null,
  eventError: null,
  refreshing: false,
};
type Entry = {
  value: CalendarMonth;
  at: number;
  write: number;
  ticket: number;
  pending?: Promise<void>;
};

/** Month + account scoped reads. Independent failures preserve the other source and any previous values. */
export function createCalendarCache(deps: {
  epoch: () => number;
  write: () => number;
  records: (from: string, to: string) => Promise<RecordItem[]>;
  events: (from: string, to: string) => Promise<CalendarEventView[]>;
  recalled: (from: string, to: string) => RecordItem[] | null;
  error: (error: unknown, source: 'records' | 'events') => string;
}) {
  let epoch = deps.epoch();
  let serial = 0;
  const months = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const current = () => {
    if (epoch !== deps.epoch()) {
      epoch = deps.epoch();
      months.clear();
    }
  };
  const snapshot = (month: string) =>
    epoch === deps.epoch() ? (months.get(month)?.value ?? EMPTY) : EMPTY;
  const load = (month: string, force = false): Promise<void> => {
    current();
    const range = calendarRange(month);
    if (!range) return Promise.resolve();
    let entry = months.get(month);
    const write = deps.write();
    if (entry?.pending && entry.write === write) return entry.pending;
    if (
      !force &&
      entry &&
      !entry.value.recordError &&
      !entry.value.eventError &&
      entry.write === write &&
      Date.now() - entry.at < 15000
    )
      return Promise.resolve();
    const recalled = !force ? deps.recalled(range.from, range.to) : null;
    entry = {
      value: {
        ...(entry?.value ?? EMPTY),
        records: entry?.value.records ?? recalled,
        refreshing: true,
      },
      at: 0,
      write,
      ticket: ++serial,
    };
    months.set(month, entry);
    const mine = entry;
    const account = epoch;
    const valid = () => deps.epoch() === account && months.get(month) === mine;
    const patch = (value: Partial<CalendarMonth>) => {
      if (valid()) {
        mine.value = { ...mine.value, ...value };
        emit();
      }
    };
    const records =
      recalled != null
        ? Promise.resolve(recalled)
        : Promise.resolve().then(() => deps.records(range.from, range.to));
    const events = Promise.resolve().then(() => deps.events(range.from, range.to));
    mine.pending = Promise.all([
      records.then(
        (records) => patch({ records, recordError: null }),
        (e: unknown) => patch({ recordError: deps.error(e, 'records') })
      ),
      events.then(
        (events) => patch({ events, eventError: null }),
        (e: unknown) => patch({ eventError: deps.error(e, 'events') })
      ),
    ]).then(() => {
      if (!valid()) return;
      mine.pending = undefined;
      mine.at = Date.now();
      patch({ refreshing: false });
    });
    emit();
    return mine.pending;
  };
  return {
    snapshot,
    load,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    invalidate() {
      current();
      for (const entry of months.values()) {
        entry.at = 0;
        entry.write = -1;
      }
    },
  };
}
