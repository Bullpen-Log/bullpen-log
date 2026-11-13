'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import type { IntakeActionFailure, IntakeActionResult } from '@/app/actions/intake-admin';
import { needsFreshView } from './detail-rules';

/**
 * 동작 하나의 진행 · 오류. 화면이 낡아서 막혔으면 최신 내용을 다시 받는다(다른 관리자가 먼저 바꿨을 때 옛 화면에 머물지 않게).
 * 까닭 글은 그대로 남겨 둬서, 왜 화면이 바뀌었는지 관리자가 본다. failed 는 창을 닫는 쪽이 쓴다 — 열린 창 뒤에 오류가 숨지 않게.
 */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = <T extends object>(call: () => Promise<IntakeActionResult<T>>, done?: (r: T) => void, failed?: (r: IntakeActionFailure) => void) => {
    setError(undefined);
    start(async () => {
      const r = await orOffline(call(), null);
      if (!r) return setError(OFFLINE_MESSAGE);
      if (!r.ok) {
        setError(r.message);
        if (needsFreshView(r.code)) quietRefresh(router);
        failed?.(r);
        return;
      }
      done?.(r);
    });
  };
  return { pending, error, setError, run, refresh: () => quietRefresh(router) };
}
