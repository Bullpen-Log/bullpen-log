'use client';

import { useEffect } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { logSet } from '@/app/actions/workout';
import { drainSets } from '@/components/load/set-outbox';
import { RecoveryNotice } from '@/components/load/recovery-notice';
import { quietRefresh } from '@/lib/quiet-refresh';

/**
 * 폰에 남은 운동 세트를 앱 어디서든 이어서 보낸다 — 그리는 것은 못 보낸 세트 알림 한 줄뿐이다(아래 EX-LOAD01-R1).
 *
 * 신호 없는 곳에서 남긴 세트는 폰에 담긴다(lib/workout/outbox.ts). 예전에는 그 운동 화면만 보내서, 신호 없이 운동을
 * 마치고 나가면 신호가 돌아와도 보내지 않았고, 다음 날 그 판이 저절로 닫히면 세트가 사라졌다(지금은 닫힌 판도 늦게 온
 * 세트를 받는다 — app/actions/workout.ts logSet). 화면을 열 때 · 신호가 돌아올 때 · 앱으로 돌아올 때 보내고, 하나라도
 * 남겼으면 화면을 새로 받는다. 담긴 것이 없으면 폰 저장소만 한 번 보고 끝나므로 헛되이 서버를 부르지 않는다.
 * 따라하기의 암케어 체크는 app/(app)/training/pending-checks.tsx 가 같은 일을 한다.
 *
 * EX-LOAD01 — 운동 화면과 같은 보내기(components/load/set-outbox.ts): 붙들린 세트(고쳐야 하는 거절 · 옛 서버가 밴드를 모르고 지나침)는
 * 보내지 않고 지우지도 않는다(운동 화면이 보인다). ownerId(지금 계정)를 주면 그 계정이 담은 세트만 보내고, 안 주면 아무것도 보내지 않는다 —
 * 다른 계정의 세트를 그 계정 몰래 보내거나 지우지 않는다. EX-LOAD01-R1 — 계정 표시가 없는 옛 세트도 보내지 않는다(복구 화면에서 확인한 뒤에만).
 *
 * EX-LOAD01-R1 — 그리는 것이 하나 생겼다: 내 세트가 붙들렸거나 오래 못 보냈으면 '못 보낸 세트 N개 · 확인하기' 한 줄
 * (components/load/recovery-notice.tsx) — 운동 화면 밖에서도 복구 화면(/training/recovery)으로 갈 수 있다.
 */
export function SendPendingSets({ ownerId = null }: { ownerId?: string | null } = {}) {
  const router = useRouter();

  useEffect(() => {
    const kick = async () => {
      let sent = false;
      await drainSets({
        owner: ownerId,
        send: logSet,
        /* 붙들기 · 빼기는 drainSets(outcomeOf)가 정한다 — 저장이 증명된 답만 뺀다. 여기서는 새로 받을지만 */
        handle: (_p, res) => {
          if (res && typeof res === 'object' && !('error' in res)) sent = true;
        },
        rethrow: unstable_rethrow,
      });
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
  }, [router, ownerId]);

  return <RecoveryNotice ownerId={ownerId} />;
}
