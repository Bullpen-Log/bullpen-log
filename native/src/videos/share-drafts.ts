import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { restoreShareDraft, type ShareDraft } from '@/lib/video-share';
import { outboxOwner } from '~/workout/outbox';
import { createShareStore } from './queue-core';

/**
 * 덕아웃 공유 초안(2026-10-29) — 계정 + 영상마다 폰에 둔다. 글을 고칠 때마다 · 단계가 바뀔 때마다 남겨, 나갔다 와도(앱을 다시 켜도) 이어진다.
 * 로그아웃에 지우지 않는다 — 같은 사람이 다시 들어오면 이어 쓰고, 다른 계정에는 주인이 달라 안 보인다.
 */
const store = createShareStore<ShareDraft>(
  {
    get: (k) => AsyncStorage.getItem(k),
    set: (k, v) => AsyncStorage.setItem(k, v),
    remove: (k) => AsyncStorage.removeItem(k),
  },
  'bullpen-my-videos:share-drafts:v1'
);
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export async function loadShareDraft(
  owner: string,
  path: string
): Promise<ShareDraft | null> {
  return restoreShareDraft(await store.load(owner, path), owner, path);
}
/** 남긴다 — 실패하면 던진다 */
export async function keepShareDraft(d: ShareDraft): Promise<void> {
  await store.save({ ...d, updatedAt: Date.now() });
  changed();
}
export async function clearShareDraft(owner: string, path: string): Promise<void> {
  await store.clear(owner, path);
  changed();
}

/** 영상 화면의 ⋯ 메뉴 글 — 이 영상에 쓰던 공유가 있나 · 결과 확인이 남았나 */
export function useShareDraftStage(
  path: string | null
): ShareDraft['attempt']['stage'] | 'draft' | null {
  const owner = outboxOwner();
  const [v, setV] = useState<{
    key: string;
    stage: ShareDraft['attempt']['stage'] | 'draft' | null;
  }>({ key: '', stage: null });
  const key = owner && path ? `${owner}|${path}` : '';
  useEffect(() => {
    if (!owner || !path) return;
    let alive = true;
    const read = () =>
      void loadShareDraft(owner, path).then(
        (d) =>
          alive &&
          setV({
            key: `${owner}|${path}`,
            stage: !d
              ? null
              : d.attempt.stage === 'idle'
                ? d.title || d.body
                  ? 'draft'
                  : null
                : d.attempt.stage,
          }),
        () => undefined
      );
    read();
    listeners.add(read);
    return () => {
      alive = false;
      listeners.delete(read);
    };
  }, [owner, path]);
  return v.key === key ? v.stage : null;
}
