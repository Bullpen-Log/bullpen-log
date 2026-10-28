import { useEffect, useSyncExternalStore } from 'react';
import type { RecordItem } from '@/lib/records/day-records';
import { shiftDateKey } from '@/lib/pitch-stats';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';

/**
 * 기록 탭 자료 — 오늘까지 최근 400일을 한 번에 받아 쥔다(날짜별 · 찾기 · 첫 사용 판정이 같이 쓴다). 그보다 옛 달을 고르면 그 달만 더 받는다.
 * 받은 창은 폰에도 남겨(cacheSet — 로그아웃 때 cacheClear 가 비운다) 신호가 없을 때도 받아 둔 만큼 보인다. 새로 받다 실패하면 받아 둔 값 위에 한 줄.
 */
const WINDOW_DAYS = 399;
type State = { today: string | null; from: string | null; items: RecordItem[] | null; older: Record<string, RecordItem[]>; error: string | null };
let state: State = { today: null, from: null, items: null, older: {}, error: null };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const KEY = 'records';

type Result = { ok: true; items: RecordItem[] } | { ok: false; error: string };
const fetchRange = (from: string, to: string) =>
  rpc<Result>('app.loadAppRecords', from, to).then((r) => {
    if (!r.ok) throw new Error(r.error);
    return r.items;
  });
const messageOf = (e: unknown) =>
  e instanceof RpcError && e.code === 'offline' ? '신호가 약해 새로 받지 못했어요.' : e instanceof RpcError && e.code === 'update' ? '앱을 업데이트해 주세요.' : '기록을 불러오지 못했어요.';

let inflight: Promise<void> | null = null;
export function reloadRecords(today: string): Promise<void> {
  if (inflight) return inflight;
  const e = cacheEpoch();
  const from = shiftDateKey(today, -WINDOW_DAYS);
  if (!state.items || state.today !== today)
    void cacheGet(KEY).then((v) => {
      const c = v as { today?: string; from?: string; items?: RecordItem[] } | null;
      if (e === cacheEpoch() && !state.items && c?.today === today && Array.isArray(c.items)) set({ today, from: c.from ?? from, items: c.items });
    });
  inflight = fetchRange(from, today)
    .then((items) => {
      if (e !== cacheEpoch()) return;
      set({ today, from, items, error: null, older: state.today === today ? state.older : {} });
      void cacheSet(KEY, { today, from, items });
    })
    .catch((err: unknown) => {
      if (e === cacheEpoch()) set({ error: messageOf(err) });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 창보다 옛 달(YYYY-MM) — 고를 때 한 번 받는다 */
const olderLoading = new Set<string>();
export function loadOlderMonth(month: string) {
  /* 창에 다 들어오는 달은 안 받는다 — 창에 반만 걸친 달은 통째로 받는다(겹치는 줄은 화면이 id 로 한 번만) */
  if (!state.from || `${month}-01` >= state.from || state.older[month] || olderLoading.has(month)) return;
  const e = cacheEpoch();
  olderLoading.add(month);
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  void fetchRange(`${month}-01`, `${month}-${String(last).padStart(2, '0')}`)
    .then((items) => {
      if (e === cacheEpoch()) set({ older: { ...state.older, [month]: items } });
    })
    .catch((err: unknown) => {
      if (e === cacheEpoch()) set({ error: messageOf(err) });
    })
    .finally(() => olderLoading.delete(month));
}

export function useRecords(today: string): State {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
  useEffect(() => {
    void reloadRecords(today);
  }, [today]);
  return s;
}

export function resetRecordsStore() {
  state = { today: null, from: null, items: null, older: {}, error: null };
  inflight = null;
  olderLoading.clear();
  listeners.forEach((l) => l());
}
