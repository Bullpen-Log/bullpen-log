import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { loadAll, loadMonth, type PitchLog } from './api';

/**
 * 달마다 받은 투구 기록을 앱이 쥐고 있다가 화면을 열면 바로 그린다(검토 D10 '받아 둔 값 먼저') — 그리고 뒤에서 새로 받는다.
 * 남기기 · 고치기 · 지우기 뒤에는 그 달을 다시 받는다(refreshMonth). 앱을 껐다 켜면 비어 있다(폰 저장은 다음 단계).
 */
type Entry = { logs: PitchLog[] | null; error: string | null; loading: boolean };
const months = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const EMPTY: Entry = { logs: null, error: null, loading: false };

export async function refreshMonth(month: string): Promise<void> {
  if (months.has(ALL)) void refreshAll();
  const prev = months.get(month) ?? EMPTY;
  months.set(month, { ...prev, loading: true });
  emit();
  try {
    const logs = await loadMonth(month);
    months.set(month, { logs, error: null, loading: false });
  } catch (e) {
    months.set(month, { ...prev, error: e instanceof Error ? e.message : '불러오지 못했어요', loading: false });
  }
  emit();
}

export function useMonth(month: string) {
  const entry = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => months.get(month) ?? EMPTY
  );
  useEffect(() => {
    void refreshMonth(month);
  }, [month]);
  const reload = useCallback(() => refreshMonth(month), [month]);
  return { ...entry, reload };
}

/** 모든 기록(찾기용) — 달 묶음과 같은 보관에 'all' 이름으로. 남기기 · 고치기 · 지우기 뒤 refreshMonth 가 이것도 다시 받는다 */
const ALL = 'all';
async function refreshAll(): Promise<void> {
  const prev = months.get(ALL) ?? EMPTY;
  months.set(ALL, { ...prev, loading: true });
  emit();
  try {
    months.set(ALL, { logs: await loadAll(), error: null, loading: false });
  } catch (e) {
    months.set(ALL, { ...prev, error: e instanceof Error ? e.message : '불러오지 못했어요', loading: false });
  }
  emit();
}

export function useAllLogs(on: boolean) {
  const entry = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => months.get(ALL) ?? EMPTY
  );
  useEffect(() => {
    if (on) void refreshAll();
  }, [on]);
  return entry;
}

/** 2026-10 */
export const monthOf = (dateKey: string) => dateKey.slice(0, 7);
