'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SIM_DAY_EVENT } from '@/components/use-today-key';

/**
 * 시험 계정(User.simDate)의 화면 시계를 서버와 맞춘다 — 뿌리 레이아웃의 Date 바꿔치기는 window.__bpSimOffset 을 읽는다.
 *
 * 2026-10-12 사용자: '다음날로' 뒤 서버 화면은 8/2 인데 체크인이 8/1 에 머물렀다. 당겨서 새로고침(router.refresh)은 페이지를
 * 다시 열지 않아 처음 박아 둔 차이가 남았다. 그래서 ① 레이아웃이 새 차이를 주면 바로 바꾸고 ② 30초마다 · 앱을 다시 볼 때
 * 서버에 묻는다(/api/sim-offset). 날짜가 바뀌었으면 날짜를 보는 화면에 신호를 주고(SIM_DAY_EVENT) 서버 화면도 새로 받는다.
 * 시험 계정이 아니면 그리지 않는다(뿌리 레이아웃).
 */
type SimWindow = Window & { __bpSimOffset?: number };

export function SimClockSync({ offset }: { offset: number }) {
  const router = useRouter();

  useEffect(() => {
    const w = window as SimWindow;
    const apply = (next: number) => {
      if (w.__bpSimOffset === undefined || w.__bpSimOffset === next) return false;
      const before = new Date().toDateString();
      w.__bpSimOffset = next;
      if (new Date().toDateString() === before) return false;
      window.dispatchEvent(new Event(SIM_DAY_EVENT));
      return true;
    };
    apply(offset);

    let stop = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/sim-offset', { cache: 'no-store' });
        if (!res.ok || stop) return;
        const { offset: next } = (await res.json()) as { offset: number };
        if (typeof next === 'number' && apply(next)) router.refresh();
      } catch {
        /* 신호가 없으면 다음에 */
      }
    };
    const timer = window.setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [offset, router]);

  return null;
}
