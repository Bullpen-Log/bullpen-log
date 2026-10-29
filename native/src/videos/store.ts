import { useEffect, useSyncExternalStore } from 'react';
import type { MyVideoItem } from '@/lib/my-videos';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { rpc } from '~/lib/rpc';
import { removePhoneOrphans } from '~/pitch/api';
import { monthOf, refreshMonth } from '~/pitch/store';
import { toast } from '~/shell/toast';
import { applyOverrides, createFavQueue, createNoteQueue, pruneOverrides, type NoteOutcome, type Override } from './edits';

/**
 * '내 영상' 목록을 앱이 쥐고 있다가 화면을 열면 바로 그린다 — 그리고 뒤에서 새로 받는다(투구 달 저장소 pitch/store.ts 와 같은 꼴).
 * 받은 목록은 폰에도 남겨(cacheSet — 로그아웃 때 cacheClear 가 비운다) 신호가 없을 때도 받아 둔 만큼은 찾는다.
 * fresh = 이번에 서버에서 받은 목록인가(아니면 폰에 받아 둔 것) — 화면이 '받아 둔 목록이에요'를 가른다.
 */
type State = { items: MyVideoItem[] | null; error: string | null; loading: boolean; fresh: boolean };
let state: State = { items: null, error: null, loading: false, fresh: false };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const KEY = 'my-videos';

type ListResult = { ok: true; items: MyVideoItem[] } | { ok: false; error: string };
type UpdateResult = { ok: true; note: string | null; revisit: boolean } | { ok: false; error: string };

/* 고친 값(메모 · 즐겨찾기)이 새로 받은 옛 목록에 덮이지 않게 — 규칙은 ./edits.ts(셀프테스트가 본다) */
const overrides = new Map<string, Override>();
const withOverrides = (items: MyVideoItem[]) => applyOverrides(items, overrides);
function setOverride(path: string, o: Partial<Override>) {
  const next = { done: null, ...overrides.get(path), ...o };
  overrides.set(path, next);
  if (state.items) set({ items: withOverrides(state.items) });
}

let inflight: Promise<void> | null = null;
/** after = 방금 바꾼 뒤 — 이미 받는 중이면 그 뒤에 한 번 더(바꾸기 전에 떠난 물음의 답이 옛 목록이라서) */
export function refreshMyVideos(after = false): Promise<void> {
  if (inflight) return after ? inflight.then(() => refreshMyVideos()) : inflight;
  const e = cacheEpoch();
  const startedAt = Date.now();
  if (!state.items)
    void cacheGet(KEY).then((v) => {
      if (e === cacheEpoch() && !state.items && Array.isArray(v)) set({ items: withOverrides(v as MyVideoItem[]), fresh: false });
    });
  set({ loading: true });
  inflight = rpc<ListResult>('my-videos.loadMyVideoList')
    .then((r) => {
      if (e !== cacheEpoch()) return;
      if (r.ok) {
        pruneOverrides(overrides, startedAt);
        set({ items: withOverrides(r.items), error: null, fresh: true });
        void cacheSet(KEY, r.items);
      } else set({ error: r.error });
    })
    .catch(() => {
      if (e === cacheEpoch()) set({ error: '신호가 약해 새로 받지 못했어요.' });
    })
    .finally(() => {
      inflight = null;
      set({ loading: false });
    });
  return inflight;
}

export function useMyVideos(): State {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
  useEffect(() => {
    void refreshMyVideos();
  }, []);
  return s;
}

export const findMyVideo = (path: string) => state.items?.find((v) => v.path === path) ?? null;

/*
 * 영상 메모 — 바로 고쳐 보이고, 한 영상에 한 번에 하나씩 보낸다(./edits.ts createNoteQueue — 늦게 온 앞 답이 새 글을 안 덮고, 실패는 메모만 되돌린다).
 * 결과의 note 는 서버가 다듬은 글(공백 · 줄바꿈을 한 칸으로 — lib/my-videos.ts cleanFeelNote) — 화면은 저장 뒤 이 글을 원본으로 쓴다.
 */
const noteQueue = createNoteQueue({
  send: (path, note) =>
    rpc<UpdateResult>('my-videos.updateMyVideo', path, { feelNote: note }).then(
      (r) => (r.ok ? { ok: true as const, note: r.note } : r),
      () => ({ ok: false as const, error: '신호가 약해 저장하지 못했어요.' })
    ),
  show: (path, note, done) => {
    setOverride(path, { note, done: done ? Date.now() : null });
    if (done && state.items) set({ items: state.items.map((v) => (v.path === path ? { ...v, saved: true } : v)) });
  },
});
export function saveMyVideo(path: string, patch: { feelNote: string | null }): Promise<NoteOutcome> {
  return noteQueue.save(path, patch.feelNote?.trim() || null, findMyVideo(path)?.note ?? null);
}

/* 즐겨찾기 — 누르면 곧바로 바뀌어 보이고, 한 영상에 한 번에 하나씩 보낸다(연타는 마지막 뜻만 · 실패는 되돌리고 알림, ./edits.ts) */
const favQueue = createFavQueue({
  send: (path, want) =>
    rpc<UpdateResult>('my-videos.updateMyVideo', path, { revisit: want }).catch(() => ({
      ok: false as const,
      error: '신호가 약해 즐겨찾기를 저장하지 못했어요.',
    })),
  show: (path, value, done) => {
    setOverride(path, { revisit: value, done: done ? Date.now() : null });
    if (done && state.items) set({ items: state.items.map((x) => (x.path === path ? { ...x, saved: true } : x)) });
  },
  fail: (_path, error) => toast(error, 'error'),
});
export function toggleFavorite(path: string): boolean | null {
  const v = findMyVideo(path);
  return v ? favQueue.toggle(path, v.revisit) : null;
}

/** 로그아웃 — 앞사람 목록을 지운다(폰 저장은 cacheClear) */
export function resetMyVideos() {
  inflight = null;
  overrides.clear();
  favQueue.reset();
  noteQueue.reset();
  set({ items: null, error: null, loading: false, fresh: false });
}

type Done = { ok: true } | { ok: false; error: string };
type Target = { kind: 'pitch' | 'hit'; id: string; date?: string };
const NET = { ok: false as const, error: '신호가 약해 서버에 닿지 못했어요.' };

/** 기록에 연결 · 연결 해제 — 실패 글(성공이면 null). 끝나면 목록과 그 달 투구 기록을 다시 받는다 */
export async function linkVideo(path: string, target: Target, on: boolean): Promise<string | null> {
  const r = await rpc<Done>(on ? 'my-videos.linkMyVideo' : 'my-videos.unlinkMyVideo', path, { kind: target.kind, id: target.id }).catch(() => NET);
  if (!r.ok) return r.error;
  await refreshMyVideos(true);
  if (target.kind === 'pitch' && target.date) void refreshMonth(monthOf(target.date));
  return null;
}

/**
 * 영상 지우기 — 서버가 기록에서 빼고 지운 표시를 한 뒤, 폰 파일은 아무 데도 안 쓸 때만 지운다.
 * 단계를 가른다(2026-10-29): 서버가 거절하면 error(영상 그대로), 서버는 지웠는데 폰 파일 정리만 못 했으면 deleted + cleanup 글 —
 * 지운 것을 실패로 보이거나 되살리지 않는다(파일은 다음 정리 때 다시 본다).
 */
export async function deleteVideo(path: string, dates: string[]): Promise<{ error: string } | { deleted: true; cleanup: string | null }> {
  const r = await rpc<Done>('my-videos.deleteMyVideo', path).catch(() => NET);
  if (!r.ok) return { error: r.error };
  overrides.delete(path);
  set({ items: state.items?.filter((v) => v.path !== path) ?? null });
  let cleanup: string | null = null;
  try {
    await removePhoneOrphans([path]);
  } catch {
    cleanup = '영상은 지웠어요. 폰에 남은 파일은 다음에 다시 정리해요.';
  }
  void refreshMyVideos(true);
  for (const m of new Set(dates.map(monthOf))) void refreshMonth(m);
  return { deleted: true, cleanup };
}
