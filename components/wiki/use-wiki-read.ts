'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { WIKI_READ_PATH, type WikiRead } from '@/lib/wiki/snapshot';

type ReadState =
  | { ownerId: string; snapshot: WikiRead['snapshot']; status: 'ready' }
  | { ownerId: string; status: 'denied' | 'unavailable' };

export function useWikiRead(ownerId: string | null, attempt = 0) {
  const [state, setState] = useState<ReadState | null>(null);

  useEffect(() => {
    if (!ownerId) return;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const cancel = () => {
      controller?.abort();
      clearTimeout(timeout);
      controller = undefined;
    };
    const clear = () => {
      cancel();
      // Clear the live DOM before a page can be frozen in the back-forward cache.
      flushSync(() => setState(null));
    };
    const read = () => {
      if (disposed || controller || document.visibilityState !== 'visible') return;
      const request = new AbortController();
      controller = request;
      timeout = setTimeout(() => {
        request.abort();
        if (!disposed && controller === request) setState({ ownerId, status: 'unavailable' });
      }, 10_000);
      void (async () => {
        try {
          const res = await fetch(WIKI_READ_PATH, { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: request.signal });
          if (request.signal.aborted || disposed) return;
          if (res.status === 401 || res.status === 403) {
            setState({ ownerId, status: 'denied' });
            return;
          }
          if (!res.ok) throw new Error('Wiki unavailable');
          const result = await res.json() as WikiRead;
          if (request.signal.aborted || disposed) return;
          if (result.viewerId !== ownerId) {
            setState({ ownerId, status: 'denied' });
            return;
          }
          if (result.snapshot?.format !== 1) throw new Error('Wiki unavailable');
          setState({ ownerId, snapshot: result.snapshot, status: 'ready' });
        } catch {
          if (!disposed && !request.signal.aborted) setState({ ownerId, status: 'unavailable' });
        } finally {
          if (controller === request) cancel();
        }
      })();
    };
    const onVisibility = () => document.visibilityState === 'visible' ? read() : clear();
    window.addEventListener('focus', read);
    window.addEventListener('blur', clear);
    window.addEventListener('pageshow', read);
    window.addEventListener('pagehide', clear);
    document.addEventListener('visibilitychange', onVisibility);
    read();

    return () => {
      disposed = true;
      cancel();
      window.removeEventListener('focus', read);
      window.removeEventListener('blur', clear);
      window.removeEventListener('pageshow', read);
      window.removeEventListener('pagehide', clear);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ownerId, attempt]);

  return ownerId && state?.ownerId === ownerId ? state : null;
}
