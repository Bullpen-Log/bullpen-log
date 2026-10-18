import { useCallback, useEffect, useReducer, useSyncExternalStore } from 'react';
import { isRestSession } from '@/lib/session-type';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { rpc } from '~/lib/rpc';
import { isPhoneVideoPath, loadAll, loadMonth, serverThumbUrls, type PitchLog } from './api';

/**
 * 달마다 받은 투구 기록을 앱이 쥐고 있다가 화면을 열면 바로 그린다(검토 D10 '받아 둔 값 먼저') — 그리고 뒤에서 새로 받는다.
 * 남기기 · 고치기 · 지우기 뒤에는 그 달을 다시 받는다(refreshMonth). 받은 달은 폰에도 남겨(cacheSet) 앱을 껐다 켜도 먼저 그린다.
 */
type Entry = { logs: PitchLog[] | null; error: string | null; loading: boolean };
const months = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const EMPTY: Entry = { logs: null, error: null, loading: false };

/** 폰에 남긴 달을 먼저 — 서버 값이 먼저 오면 안 덮는다 */
function warm(key: string) {
  if (months.get(key)?.logs) return;
  void cacheGet(`pitch:${key}`).then((v) => {
    const now = months.get(key) ?? EMPTY;
    if (now.logs || !Array.isArray(v)) return;
    months.set(key, { ...now, logs: v as PitchLog[] });
    emit();
  });
}

/** 로그아웃 — 앞사람 기록을 지운다(폰 저장은 lib/store.ts cacheClear) */
export function resetPitchStore() {
  months.clear();
  emit();
}

export async function refreshMonth(month: string): Promise<void> {
  if (months.has(ALL)) void refreshAll();
  warm(month);
  const prev = months.get(month) ?? EMPTY;
  months.set(month, { ...prev, loading: true });
  emit();
  const e = cacheEpoch();
  try {
    const logs = await loadMonth(month);
    if (e !== cacheEpoch()) return;
    months.set(month, { logs, error: null, loading: false });
    void cacheSet(`pitch:${month}`, logs);
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

/**
 * 영상 달력 칸의 장면 그림 — 그날 대표 영상(쉬는 날 기록 빼고 처음 올린 영상, 웹 video-calendar repOf)의 썸네일 주소.
 * 받은 주소는 앱이 쥐고 있어 달을 오가도 다시 묻지 않는다(서명 주소라 앱을 다시 켜면 새로 받는다).
 */
const thumbUrls = new Map<string, string | null>();
/** 영상 경로 → 장면 그림 주소(목록 줄 · 달력 칸이 같이 쓴다). 못 받았거나 그림이 없는 영상은 빠진다 */
export function usePathThumbs(paths: string[]): Record<string, string> {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const want = [...new Set(paths)].filter((p) => !isPhoneVideoPath(p) && !thumbUrls.has(p));
  const key = want.join('|');
  useEffect(() => {
    if (!key) return;
    const ask = key.split('|');
    let alive = true;
    void serverThumbUrls(ask)
      .then((got) => {
        for (const p of ask) thumbUrls.set(p, got[p] ?? null);
        if (alive) bump();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  const out: Record<string, string> = {};
  for (const p of paths) {
    const url = thumbUrls.get(p);
    if (url) out[p] = url;
  }
  return out;
}

export function useDayThumbs(logs: PitchLog[] | null): Record<string, string> {
  const pick = useFeatured();
  const paths = new Map<string, string[]>();
  for (const l of logs ?? []) {
    if (isRestSession(l.sessionType) || !l.videoPaths.length) continue;
    const day = l.date.slice(0, 10);
    paths.set(day, [...(paths.get(day) ?? []), ...l.videoPaths]);
  }
  const reps = new Map<string, string>();
  for (const [day, ps] of paths) {
    const r = repOf(ps, pick[day]);
    if (r) reps.set(day, r);
  }
  const urls = usePathThumbs([...reps.values()]);
  const out: Record<string, string> = {};
  for (const [day, p] of reps) if (urls[p]) out[day] = urls[p];
  return out;
}

/**
 * 날짜별 구속 측정 요약 — app.loadAppVelocityDays(웹 loadVelocityByDate). 달력 영상 점(클립도 셈) · 홈 그날 칸 '카메라로 잰 공' 줄.
 * 한 번 받고, 탭을 다시 볼 때 reloadVelocityDays 로 새로 받는다.
 */
export type VelocityDays = Record<string, { n: number; max: number; clips: number; sig: string }>;
let velocityDays: VelocityDays | null = null;
const velocityListeners = new Set<() => void>();
let velocityLoading: Promise<void> | null = null;
export function reloadVelocityDays(): Promise<void> {
  velocityLoading ??= rpc<{ ok: true; days: VelocityDays } | { ok: false; error: string }>('app.loadAppVelocityDays')
    .then((r) => {
      if (!r.ok) return;
      velocityDays = r.days;
      velocityListeners.forEach((l) => l());
    })
    .catch(() => undefined)
    .finally(() => {
      velocityLoading = null;
    });
  return velocityLoading;
}
export function useVelocityDays(): VelocityDays | null {
  const v = useSyncExternalStore(
    (l) => {
      velocityListeners.add(l);
      return () => velocityListeners.delete(l);
    },
    () => velocityDays
  );
  useEffect(() => {
    if (!velocityDays) void reloadVelocityDays();
  }, []);
  return v;
}

/**
 * 그날의 대표 영상(★) — app.loadAppFeatured(웹 DailyFeaturedVideo). 고르지 않은 날은 그날 처음 올린 영상이 대표다.
 * 고르기는 setFeatured(웹 featured-video.setFeaturedVideo 와 같은 동작) — 바로 바꿔 보이고, 실패하면 되돌린다.
 */
let featured: Record<string, string> | null = null;
const featuredListeners = new Set<() => void>();
const emitFeatured = () => featuredListeners.forEach((l) => l());
let featuredLoading: Promise<void> | null = null;
export function reloadFeatured(): Promise<void> {
  featuredLoading ??= rpc<{ ok: true; featured: Record<string, string> } | { ok: false; error: string }>('app.loadAppFeatured')
    .then((r) => {
      if (!r.ok) return;
      featured = r.featured;
      emitFeatured();
    })
    .catch(() => undefined)
    .finally(() => {
      featuredLoading = null;
    });
  return featuredLoading;
}
export function useFeatured(): Record<string, string> {
  const v = useSyncExternalStore(
    (l) => {
      featuredListeners.add(l);
      return () => featuredListeners.delete(l);
    },
    () => featured
  );
  useEffect(() => {
    if (!featured) void reloadFeatured();
  }, []);
  return v ?? EMPTY_FEATURED;
}
const EMPTY_FEATURED: Record<string, string> = {};
export async function setFeatured(date: string, path: string): Promise<boolean> {
  const before = featured;
  featured = { ...(featured ?? {}), [date]: path };
  emitFeatured();
  try {
    const r = await rpc<{ videoPath: string } | { error: string }>('featured-video.setFeaturedVideo', date, path);
    if ('error' in r) throw new Error(r.error);
    return true;
  } catch {
    featured = before;
    emitFeatured();
    return false;
  }
}
/** 그날 대표 — 고른 것이 그날 영상에 있으면 그것, 아니면 처음 영상 */
export const repOf = (paths: string[], pick: string | undefined) => (pick && paths.includes(pick) ? pick : (paths[0] ?? null));
