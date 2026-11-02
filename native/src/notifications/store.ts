import { useSyncExternalStore } from 'react';
import { FEATURE_LOCKED_BETA } from '@/lib/release-access';
import type {
  InboxPage,
  InboxResult,
  InboxVerification,
} from '@/lib/notification-inbox';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch, tryLoadJson, trySaveJson } from '~/lib/store';
import { loadMe } from '~/pitch/api';
import { createInboxCache } from './cache';
function limited<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('연결을 확인해주세요.')), 25_000);
    promise.then(
      (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
const cache = createInboxCache({
  epoch: cacheEpoch,
  owner: async () => (await loadMe()).userId,
  read: tryLoadJson,
  store: trySaveJson,
  page: (request) =>
    limited(
      rpc<({ ok: true } & InboxPage) | { ok: false; error: string }>(
        'notifications.loadAppInboxPage',
        request
      )
    ),
  count: () => limited(rpc<number>('notifications.countBellNotifications')),
  write: (command) =>
    limited(rpc<InboxResult>('notifications.setAppInboxRead', command)),
  verify: (command) =>
    limited(rpc<InboxVerification>('notifications.loadAppInboxReadResult', command)),
  rejected: (e) =>
    e instanceof RpcError &&
    ['redirect', 'update', FEATURE_LOCKED_BETA].includes(e.code),
});
export const inboxStore = cache;
export const useInbox = () => useSyncExternalStore(cache.subscribe, cache.snapshot);
