'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { claimLoginTicket } from '@/app/actions/login-ticket';

/** 코드 로그인의 PC 쪽(2026-10-21 개편 7단계 7-3) — 2초마다 묻고, 승인되면 내 싱커로. 2분이 지나면 '다시 만들기' */
export function TicketPoller({ code, expiresAt }: { code: string; expiresAt: string }) {
  const router = useRouter();
  const [state, setState] = useState<'waiting' | 'approved' | 'expired' | 'used'>('waiting');
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    if (state !== 'waiting') return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await claimLoginTicket({ code });
        if (stop) return;
        if (r.state === 'approved') {
          setState('approved');
          router.replace('/sinker');
          router.refresh();
          return;
        }
        if (r.state !== 'waiting') setState(r.state);
      } catch {
        /* 신호 끊김 — 다음 번에 */
      }
    };
    const poll = setInterval(tick, 2000);
    const clock = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [code, state, router]);

  if (state === 'approved') return <p className="text-sm font-semibold text-ok">로그인됐어요. 잠시만요…</p>;
  if (state === 'expired' || state === 'used' || left === 0)
    return (
      <button type="button" onClick={() => router.refresh()} className="min-h-10 rounded-xl border border-line px-4 text-sm font-semibold text-ink">
        시간이 지났어요 — 새 코드 만들기
      </button>
    );
  return (
    <p className="text-sm text-muted" aria-live="polite">
      폰에서 승인하면 바로 들어가요 · 남은 시간 {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </p>
  );
}
