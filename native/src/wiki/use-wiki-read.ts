import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { WIKI_READ_PATH, type WikiRead } from '@/lib/wiki/snapshot';
import { sessionChanging, sessionEpoch, sessionRevision, subscribeToSession, rpc } from '~/lib/rpc';
import { SITE_URL } from '~/lib/site';
import type { Me } from '~/pitch/api';

type ReadState =
  | { readKey: string; status: 'ready'; snapshot: WikiRead['snapshot'] }
  | { readKey: string; status: 'denied' | 'unavailable' };

export function useNativeWikiRead(attempt = 0) {
  const revision = useSyncExternalStore(subscribeToSession, sessionRevision);
  const readKey = `${revision}:${attempt}`;
  const changing = sessionChanging();
  const focused = useIsFocused();
  const [state, setState] = useState<ReadState | null>(null);

  useFocusEffect(useCallback(() => {
    if (changing) return;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      controller?.abort();
      clearTimeout(timeout);
      controller = undefined;
      setState(null);
    };
    const read = () => {
      if (controller || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      const request = new AbortController();
      controller = request;
      const epoch = sessionEpoch();
      const isCurrent = () => controller === request && epoch === sessionEpoch() && !sessionChanging();
      timeout = setTimeout(() => {
        if (isCurrent()) setState({ readKey, status: 'unavailable' });
        request.abort();
        if (controller === request) controller = undefined;
      }, 12_000);

      void (async () => {
        try {
          // A cold direct route can mount before the main shell has learned the account policy.
          const me = await rpc<({ ok: true } & Me) | { ok: false }>('app.loadAppMe');
          if (!isCurrent() || request.signal.aborted) return;
          if (!me.ok || typeof me.userId !== 'string' || !me.userId) {
            setState({ readKey, status: 'denied' });
            return;
          }
          const response = await fetch(SITE_URL + WIKI_READ_PATH, {
            credentials: 'include', cache: 'no-store', redirect: 'error', signal: request.signal,
          });
          if (!isCurrent() || request.signal.aborted) return;
          if (response.status === 401 || response.status === 403) {
            setState({ readKey, status: 'denied' });
            return;
          }
          if (!response.ok) throw new Error('Wiki unavailable');

          const result = await response.json() as WikiRead;
          if (!isCurrent() || request.signal.aborted) return;
          if (result.viewerId !== me.userId) {
            setState({ readKey, status: 'denied' });
            return;
          }
          if (result.snapshot?.format !== 1) throw new Error('Wiki unavailable');
          setState({ readKey, status: 'ready', snapshot: result.snapshot });
        } catch {
          if (isCurrent() && !request.signal.aborted) setState({ readKey, status: 'unavailable' });
        } finally {
          if (controller === request) {
            clearTimeout(timeout);
            controller = undefined;
          }
        }
      })();
    };
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') read();
      else cancel();
    });
    read();
    return () => {
      subscription.remove();
      cancel();
    };
  }, [changing, readKey]));

  if (changing || !focused) return null;
  return state?.readKey === readKey ? state : null;
}
