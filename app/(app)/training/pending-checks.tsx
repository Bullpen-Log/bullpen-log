'use client';

import { useEffect } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { markExerciseDone } from '@/app/actions/exercise-log';
import { checkOutbox } from '@/lib/armcare/check-outbox';
import { quietRefresh } from '@/lib/quiet-refresh';

/**
 * 따라하기에서 못 보낸 암케어 체크를 이어서 보낸다 — 그리는 것은 없다.
 *
 * 신호 없는 곳에서 따라하기를 끝내고 나오거나 앱을 닫으면, 못 보낸 체크가 폰에 남는다
 * (lib/armcare/check-outbox.ts). 암케어 목록을 열 때와 신호가 돌아올 때 보내고, 하나라도
 * 남겼으면 목록을 새로 받아 체크가 보이게 한다. 담긴 것이 없으면 폰 저장소만 한 번 보고
 * 끝나므로 헛되이 서버를 부르지 않는다.
 */
export function SendPendingChecks() {
  const router = useRouter();

  useEffect(() => {
    const kick = async () => {
      let sent = false;
      await checkOutbox.drain(
        () => true,
        (p) => markExerciseDone(p.exerciseId, p.dateKey),
        (_p, res) => {
          if (!('error' in res)) sent = true;
        },
        unstable_rethrow
      );
      if (sent) quietRefresh(router);
    };
    const onOnline = () => void kick();
    window.addEventListener('online', onOnline);
    void kick();
    return () => window.removeEventListener('online', onOnline);
  }, [router]);

  return null;
}
