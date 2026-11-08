import { useCallback, useEffect, useReducer, useSyncExternalStore } from 'react';
import { isRestSession } from '@/lib/session-type';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { rpc } from '~/lib/rpc';
import { createVideoPlayer, type VideoThumbnail } from 'expo-video';
import { LocalVideo } from '../../modules/local-video';
import { isPhoneVideoPath, loadAll, loadMonth, phoneAssetId, serverThumbUrls, serverVideoUrls, type PitchLog } from './api';

/**
 * 달마다 받은 투구 기록을 앱이 쥐고 있다가 화면을 열면 바로 그린다(검토 D10 '받아 둔 값 먼저') — 그리고 뒤에서 새로 받는다.
 * 남기기 · 고치기 · 지우기 뒤에는 그 달을 다시 받는다(refreshMonth). 받은 달은 폰에도 남겨(cacheSet) 앱을 껐다 켜도 먼저 그린다.
 */
type Entry = { logs: PitchLog[] | null; error: string | null; loading: boolean };
const months = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const EMPTY: Entry = { logs: null, error: null, loading: false };
// 계정 전환·새 조회·저장 뒤에는 앞서 시작한 응답을 버린다.
const requests = new Map<string, object>();
const beginRead = (key: string) => {
  const token = { epoch: cacheEpoch() };
  requests.set(key, token);
  return () => token.epoch === cacheEpoch() && requests.get(key) === token;
};
let resetGeneration = 0;

/** 폰에 남긴 달을 먼저 — 서버 값이 먼저 오면 안 덮는다 */
function warm(key: string, current: () => boolean) {
  if (months.get(key)?.logs) return;
  const e = cacheEpoch();
  void cacheGet(`pitch:${key}`).then((v) => {
    /* 그새 로그아웃했으면 앞사람 달을 다시 넣지 않는다 */
    if (e !== cacheEpoch() || !current()) return;
    const now = months.get(key) ?? EMPTY;
    if (now.logs || !Array.isArray(v)) return;
    months.set(key, { ...now, logs: v as PitchLog[] });
    emit();
  });
}

/** 로그아웃 — 앞사람 기록을 지운다(폰 저장은 lib/store.ts cacheClear) */
export function resetPitchStore() {
  requests.clear();
  resetGeneration++;
  months.clear();
  emit();
  /* 날짜별 구속 · 대표 영상 · 메모 날 · 썸네일도 — 남으면 다음 사람 달력에 앞사람 표시가 뜬다 */
  thumbUrls.clear();
  velocityDays = null;
  velocityLoading = null;
  velocityListeners.forEach((l) => l());
  featured = null;
  confirmedFeatured = null;
  pendingFeatured.clear();
  featuredQueues.clear();
  featuredRevision++;
  featuredLoading = null;
  emitFeatured();
  noteDays = null;
  noteListeners.forEach((l) => l());
}

export async function refreshMonth(month: string): Promise<void> {
  if (months.has(ALL)) void refreshAll();
  const current = beginRead(month);
  warm(month, current);
  const prev = months.get(month) ?? EMPTY;
  /* 받은 달이어도 '받는 중'을 알린다 — 고치기 화면이 이것을 보고 그 달에 없는 기록을 '못 찾음' 대신 기다린다(2026-10-24 검토) */
  months.set(month, { ...prev, loading: true });
  emit();
  try {
    const logs = await loadMonth(month);
    if (!current()) return;
    months.set(month, { logs, error: null, loading: false });
    void cacheSet(`pitch:${month}`, logs);
  } catch (e) {
    if (!current()) return;
    months.set(month, { ...(months.get(month) ?? prev), error: e instanceof Error ? e.message : '불러오지 못했어요', loading: false });
  }
  emit();
}

/**
 * 서버가 확인해 준 기록 하나를 받아 둔 달에 바로 넣는다(새로 · 고침) — 저장 뒤 그날 화면 · 달력이 다시 받기를 기다리지 않고 보인다.
 * 다시 받기(refreshMonth)는 뒤에서 이어 간다 — 그게 실패해도 저장이 실패한 것은 아니다. 그새 로그아웃했으면(epoch) 넣지 않는다.
 */
export function applySavedLog(log: PitchLog, epoch: number) {
  if (epoch !== cacheEpoch()) return;
  const order = (a: PitchLog, b: PitchLog) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
  /* 서버 답에 붙은 측정 연결 결과는 기록에 남기지 않는다 */
  const clean = { ...log } as PitchLog & { velocityLink?: unknown };
  delete clean.velocityLink;
  for (const key of [monthOf(clean.date.slice(0, 10)), ALL]) {
    const now = months.get(key);
    if (!now?.logs) continue;
    requests.delete(key);
    const logs = [...now.logs.filter((l) => l.id !== clean.id), clean].sort(order);
    months.set(key, { logs, error: null, loading: false });
    if (key !== ALL) void cacheSet(`pitch:${key}`, logs);
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
  const current = beginRead(ALL);
  const prev = months.get(ALL) ?? EMPTY;
  months.set(ALL, { ...prev, loading: true });
  emit();
  try {
    const logs = await loadAll();
    if (!current()) return;
    months.set(ALL, { logs, error: null, loading: false });
  } catch (e) {
    if (!current()) return;
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
const thumbUrls = new Map<string, Thumb | null>();
/** 장면 그림 — 서버에 저장해 둔 그림 주소, 없으면 영상에서 뽑은 한 장면(expo-image 가 둘 다 받는다) */
export type Thumb = string | VideoThumbnail;
export const thumbSource = (t: Thumb) => (typeof t === 'string' ? { uri: t } : t);
/**
 * 그림이 없는 영상(웹: <video #t=0.5> 로 한 장면) — 재생 주소를 받아 0.5초 장면을 하나 뽑는다. 한 번에 하나씩(재생기를 여럿 띄우지 않게).
 */
async function frameThumbs(paths: string[], current: () => boolean): Promise<void> {
  const urls = await serverVideoUrls(paths).catch(() => ({}) as Record<string, string>);
  for (const p of paths) {
    if (!current()) return;
    /* 폰 영상은 앱 안 영상 폴더의 파일에서(이 폰에 없으면 필름 그림) */
    const url = isPhoneVideoPath(p) ? await LocalVideo.fileUrl({ id: phoneAssetId(p) }).then((r) => r.url, () => null) : urls[p];
    if (!current()) return;
    if (!url) continue;
    const player = createVideoPlayer(url);
    try {
      const [shot] = await player.generateThumbnailsAsync(0.5, { maxWidth: 320 });
      if (shot && current()) thumbUrls.set(p, shot);
    } catch {
      /* 못 뽑으면 필름 그림 그대로 */
    } finally {
      player.release();
    }
  }
}
/** 영상 경로 → 장면 그림(목록 줄 · 달력 칸이 같이 쓴다). 못 받은 영상은 빠진다 */
export function usePathThumbs(paths: string[]): Record<string, Thumb> {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const want = [...new Set(paths)].filter((p) => !thumbUrls.has(p));
  const key = want.join('|');
  useEffect(() => {
    if (!key) return;
    const ask = key.split('|');
    const epoch = cacheEpoch();
    const generation = resetGeneration;
    let alive = true;
    const current = () => alive && epoch === cacheEpoch() && generation === resetGeneration;
    /* 서버에 저장해 둔 그림 먼저(폰 영상은 서버에 없다) */
    void serverThumbUrls(ask.filter((p) => !isPhoneVideoPath(p)))
      .then(async (got) => {
        if (!current()) return;
        for (const p of ask) thumbUrls.set(p, got[p] ?? null);
        if (current()) bump();
        const none = ask.filter((p) => !got[p]);
        if (none.length) {
          await frameThumbs(none, current);
          if (current()) bump();
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  const out: Record<string, Thumb> = {};
  for (const p of paths) {
    const t = thumbUrls.get(p);
    if (t) out[p] = t;
  }
  return out;
}

export function useDayThumbs(logs: PitchLog[] | null): Record<string, Thumb> {
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
  const out: Record<string, Thumb> = {};
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
  const e = cacheEpoch();
  velocityLoading ??= rpc<{ ok: true; days: VelocityDays } | { ok: false; error: string }>('app.loadAppVelocityDays')
    .then((r) => {
      if (!r.ok || e !== cacheEpoch()) return;
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
let confirmedFeatured: Record<string, string> | null = null;
const pendingFeatured = new Map<string, { token: object; path: string }>();
const featuredQueues = new Map<string, Promise<boolean>>();
let featuredRevision = 0;
const featuredListeners = new Set<() => void>();
const emitFeatured = () => featuredListeners.forEach((l) => l());
const renderFeatured = () => {
  featured = confirmedFeatured || pendingFeatured.size ? { ...confirmedFeatured } : null;
  for (const [date, next] of pendingFeatured) featured![date] = next.path;
  emitFeatured();
};
let featuredLoading: Promise<void> | null = null;
const invalidateFeaturedRead = () => {
  featuredRevision++;
  featuredLoading = null;
};
export function reloadFeatured(): Promise<void> {
  // 선택 쓰기가 끝나면 다시 읽는다. 중간 스냅샷으로 선택을 되돌리지 않는다.
  if (pendingFeatured.size) return Promise.resolve();
  if (featuredLoading) return featuredLoading;
  const epoch = cacheEpoch();
  const generation = resetGeneration;
  const revision = featuredRevision;
  const task = rpc<{ ok: true; featured: Record<string, string> } | { ok: false; error: string }>('app.loadAppFeatured')
    .then((r) => {
      if (!r.ok || epoch !== cacheEpoch() || generation !== resetGeneration || revision !== featuredRevision) return;
      confirmedFeatured = r.featured;
      renderFeatured();
    })
    .catch(() => undefined)
    .finally(() => {
      if (featuredLoading === task) featuredLoading = null;
    });
  featuredLoading = task;
  return task;
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
export function setFeatured(date: string, path: string): Promise<boolean> {
  const epoch = cacheEpoch();
  const generation = resetGeneration;
  const current = () => epoch === cacheEpoch() && generation === resetGeneration;
  const token = {};
  pendingFeatured.set(date, { token, path });
  invalidateFeaturedRead();
  renderFeatured();
  // 같은 날의 쓰기는 입력 순서로 보낸다. 다른 날은 서로 막거나 복원하지 않는다.
  const previous = featuredQueues.get(date) ?? Promise.resolve(true);
  const task = previous.then(async () => {
    if (!current()) return false;
    try {
      const r = await rpc<{ videoPath: string } | { error: string }>('featured-video.setFeaturedVideo', date, path);
      if (!current()) return false;
      if ('error' in r) throw new Error(r.error);
      confirmedFeatured = { ...confirmedFeatured, [date]: r.videoPath };
      return true;
    } catch {
      return false;
    } finally {
      if (current()) {
        invalidateFeaturedRead();
        if (pendingFeatured.get(date)?.token === token) pendingFeatured.delete(date);
        if (featuredQueues.get(date) === task) featuredQueues.delete(date);
        renderFeatured();
        // 응답 유실로 저장된 경우도 조회로 확인한다. 쓰기를 다시 보내지는 않는다.
        if (!pendingFeatured.size) void reloadFeatured();
      }
    }
  });
  featuredQueues.set(date, task);
  return task;
}
/** 그날 대표 — 고른 것이 그날 영상에 있으면 그것, 아니면 처음 영상 */
export const repOf = (paths: string[], pick: string | undefined) => (pick && paths.includes(pick) ? pick : (paths[0] ?? null));

/** 체크인 메모를 남긴 날(app.loadAppNoteDays) — 투구 달력 칸의 쪽지. 탭을 다시 볼 때 reloadNoteDays */
let noteDays: Set<string> | null = null;
const noteListeners = new Set<() => void>();
export function reloadNoteDays(): Promise<void> {
  const e = cacheEpoch();
  return rpc<{ ok: true; days: string[] } | { ok: false; error: string }>('app.loadAppNoteDays')
    .then((r) => {
      if (!r.ok || e !== cacheEpoch()) return;
      noteDays = new Set(r.days);
      noteListeners.forEach((l) => l());
    })
    .catch(() => undefined);
}
export function useNoteDays(): Set<string> | null {
  const v = useSyncExternalStore(
    (l) => {
      noteListeners.add(l);
      return () => noteListeners.delete(l);
    },
    () => noteDays
  );
  useEffect(() => {
    if (!noteDays) void reloadNoteDays();
  }, []);
  return v;
}
