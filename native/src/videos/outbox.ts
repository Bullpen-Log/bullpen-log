import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { MyVideoItem, NewVideo } from '@/lib/my-videos';
import { isPhoneVideoPath } from '@/lib/phone-video-path';
import { rpc, RpcError } from '~/lib/rpc';
import { outboxOwner } from '~/workout/outbox';
import { createDraftStore, createVideoQueue, type KV, type QueueRow, type VideoDraft } from './queue-core';
import { refreshMyVideos } from './store';

/**
 * 영상 추가의 폰 쪽 — 저장 전 초안 · 보낼 줄(규칙은 ./queue-core.ts, 셀프테스트가 본다). 여기는 AsyncStorage · rpc 를 꽂을 뿐.
 *   - 초안: 계정마다 하나, 고칠 때마다 남긴다. 앱을 다시 켜도 저절로 등록하지 않는다 — 목록의 '작성 중인 영상 이어서'로 돌아온다.
 *   - 줄: [저장]이 폰에 먼저 적고 → 초안을 지우고 → 보낸다. 신호가 없으면 '동기화 대기', 서버가 거절 · 여러 번 못 받으면 '저장 실패'로 남긴다(지우지 않음).
 *   - 계정이 바뀌면 앞사람 줄 · 초안은 보내지도 보이지도 않는다(주인이 다르면 건너뜀). 로그아웃해도 폰에 남아 그 사람이 다시 들어오면 이어진다.
 */
const kv: KV = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
  remove: (k) => AsyncStorage.removeItem(k),
};

const queue = createVideoQueue({
  kv,
  key: 'bullpen-my-videos:outbox:v1',
  owner: outboxOwner,
  send: (input) => rpc<{ ok: true } | { ok: false; error: string; retry?: false }>('my-videos.createMyVideo', input),
  /* 서버에 못 닿음(응답을 잃었을 수도) = offline — 그 밖(서버 오류 · 앱 판 · 다시 로그인)은 셈한다 */
  fault: (e) => (e instanceof RpcError && e.code === 'offline' ? 'offline' : 'server'),
  onSent: () => void refreshMyVideos(true),
});
const drafts = createDraftStore(kv, 'bullpen-my-videos:drafts:v2', 'bullpen-my-videos:draft:v1');

/** 담긴 영상을 보낸다 — 앱을 켤 때 · 로그인 뒤 · 앱이 앞에 올 때(index.tsx drainQueues) · 저장할 때 */
export const drainVideos = () => queue.drain();
export const enqueueVideo = (owner: string, input: NewVideo) => queue.enqueue(owner, input);
export const sendVideoNow = (clientId: string, waitMs?: number) => queue.sendNow(clientId, waitMs);
export const videoStatusOf = (clientId: string) => queue.statusOf(clientId);
export const retryVideo = (clientId: string) => queue.retry(clientId);
export const removeQueuedVideo = (clientId: string) => queue.remove(clientId);
export const sendStopped = () => queue.stopped();
export const subscribeQueue = queue.subscribe;

export type QueueState = 'queued' | 'failed';
let cache: { owner: string | null; src: readonly QueueRow[]; out: MyVideoItem[]; state: Map<string, { state: QueueState; error: string | null; clientId: string }> } = {
  owner: null,
  src: [],
  out: [],
  state: new Map(),
};
function snap() {
  const owner = outboxOwner();
  const src = queue.rows();
  if (cache.owner !== owner || cache.src !== src) {
    const mine = src.filter((r) => r.owner === owner);
    cache = {
      owner,
      src,
      out: mine.map((r) => itemOf(r.input)),
      state: new Map(mine.map((r) => [r.input.path, { state: r.state, error: r.error, clientId: r.input.clientId }])),
    };
  }
  return cache;
}
export const videoOutbox = {
  subscribe: queue.subscribe,
  /** 지금 계정의 아직 서버에 없는 영상 — 갤러리 카드 꼴로(같은 값이면 같은 배열) */
  snapshot: (): MyVideoItem[] => snap().out,
  /** 경로 → 대기 · 실패(까닭) */
  stateOf: (path: string) => snap().state.get(path) ?? null,
};
/** 화면이 줄 상태를 들을 때 — 바뀌면 다시 그린다 */
export const useQueueVersion = () => useSyncExternalStore(queue.subscribe, queue.rows);

const itemOf = (v: NewVideo): MyVideoItem => ({
  path: v.path,
  storage: isPhoneVideoPath(v.path) ? 'phone' : 'server',
  sport: v.sport,
  date: v.capturedDate,
  dateSource: v.capturedDate ? v.capturedSource : 'unknown',
  origin: v.origin,
  note: v.feelNote,
  revisit: false,
  saved: false,
  createdAt: v.capturedAt,
  durationSec: v.durationSec,
  logs: [],
  clip: null,
});

/* ── 저장 전(초안) ── 화면이 고칠 때마다 남기고, 목록이 '이어서 작성'을 보인다 */
const draftListeners = new Set<() => void>();
const draftChanged = () => draftListeners.forEach((l) => l());
export const loadVideoDraft = (owner: string) => drafts.load(owner);
/** 남긴다 — 실패하면 던진다 */
export async function keepVideoDraft(d: VideoDraft): Promise<void> {
  await drafts.save(d);
  draftChanged();
}
/** 그 번호의 초안만 지운다 */
export async function clearVideoDraft(owner: string, clientId: string): Promise<boolean> {
  const done = await drafts.clear(owner, clientId);
  draftChanged();
  return done;
}
/** 목록의 '작성 중인 영상 이어서' — 지금 계정 초안(대기열에 이미 있는 번호면 없는 것으로) */
export function useVideoDraft(): VideoDraft | null {
  const owner = outboxOwner();
  const [d, setD] = useState<{ owner: string | null; v: VideoDraft | null }>({ owner: null, v: null });
  useEffect(() => {
    let alive = true;
    const read = () => {
      if (!owner) return setD({ owner, v: null });
      void drafts.load(owner).then(
        (v) => alive && setD({ owner, v: v && !queue.rows().some((r) => r.input.clientId === v.input.clientId) ? v : null }),
        () => alive && setD({ owner, v: null })
      );
    };
    read();
    draftListeners.add(read);
    const off = queue.subscribe(read);
    return () => {
      alive = false;
      draftListeners.delete(read);
      off();
    };
  }, [owner]);
  return d.owner === owner ? d.v : null;
}

/* 방금 저장한 영상 — 목록으로 돌아갔을 때 지금 조건에 안 보이면 알린다(목록의 조건 · 위치는 그대로 둔다) */
let lastAdded: string | null = null;
export const markAdded = (path: string) => {
  lastAdded = path;
};
export function takeAdded(): string | null {
  const p = lastAdded;
  lastAdded = null;
  return p;
}
