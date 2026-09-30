'use client';

import { useEffect } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { logSet } from '@/app/actions/workout';
import { drainAllSets } from '@/lib/workout/outbox';
import { quietRefresh } from '@/lib/quiet-refresh';

/**
 * 폰에 남은 운동 세트를 앱 어디서든 이어서 보낸다 — 그리는 것은 없다.
 *
 * 신호 없는 곳에서 남긴 세트는 폰에 담긴다(lib/workout/outbox.ts). 예전에는 그 운동 화면만 보내서, 신호 없이 운동을
 * 마치고 나가면 신호가 돌아와도 보내지 않았고, 다음 날 그 판이 저절로 닫히면 세트가 사라졌다(지금은 닫힌 판도 늦게 온
 * 세트를 받는다 — app/actions/workout.ts logSet). 화면을 열 때 · 신호가 돌아올 때 · 앱으로 돌아올 때 보내고, 하나라도
 * 남겼으면 화면을 새로 받는다. 담긴 것이 없으면 폰 저장소만 한 번 보고 끝나므로 헛되이 서버를 부르지 않는다.
 * 따라하기의 암케어 체크는 app/(app)/training/pending-checks.tsx 가 같은 일을 한다.
 */
export function SendPendingSets() {
  const router = useRouter();

  useEffect(() => {
    const kick = async () => {
      let sent = false;
      await drainAllSets(
        logSet,
        (_p, res) => {
          if (!('error' in res)) sent = true;
        },
        unstable_rethrow
      );
      if (sent) quietRefresh(router);
    };
    const onOnline = () => void kick();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void kick();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    void kick();
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  return null;
}
