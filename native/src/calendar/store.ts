import { useSyncExternalStore } from 'react';
import type { CalendarEventView } from '@/lib/calendar-event';
import type { RecordItem } from '@/lib/records/day-records';
import { cacheEpoch } from '~/lib/store';
import { lastWriteAt, rpc, RpcError } from '~/lib/rpc';
import { cachedRecordsRange } from '~/records/store';
import { createCalendarCache } from './cache';

const cache = createCalendarCache({
  epoch: cacheEpoch,
  write: lastWriteAt,
  recalled: cachedRecordsRange,
  records: async (from, to) => {
    const r = await rpc<
      { ok: true; items: RecordItem[] } | { ok: false; error: string }
    >('app.loadAppRecords', from, to);
    if (!r.ok) throw new Error(r.error);
    return r.items;
  },
  events: async (from, to) => {
    const r = await rpc<
      { ok: true; events: CalendarEventView[] } | { ok: false; error: string }
    >('app.loadAppCalendarEvents', from, to);
    if (!r.ok) throw new Error(r.error);
    return r.events;
  },
  error: (e, source) =>
    e instanceof RpcError && e.code === 'update'
      ? '앱을 업데이트해 주세요.'
      : `${source === 'events' ? '일정' : '기록'}을 불러오지 못했어요.`,
});

export const loadCalendarMonth = cache.load;
export const invalidateCalendar = cache.invalidate;
export const useCalendarMonth = (month: string) =>
  useSyncExternalStore(cache.subscribe, () => cache.snapshot(month));
