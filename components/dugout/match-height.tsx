'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * 옆 칸 높이에 맞추기(2026-10-24 금윤호 "홈 띠를 옆에 오늘의 경기랑 크기 맞춰줘") — `target` 이 가리키는 요소(오른쪽 경기 칸)의 높이를 재서
 * 안쪽에 `--match-h` 로 넘긴다. 받는 쪽(MarketHero slim)이 이 값을 최소 높이로 쓴다. 대상이 안 보이면(휴대폰 — 경기 칸이 밑으로 감) 넘기지 않는다.
 */
export function MatchHeight({ target, children }: { target: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(target);
    const me = box.current;
    if (!el || !me) return;
    const sync = () => {
      const h = el.offsetParent ? el.offsetHeight : 0;
      if (h > 0) me.style.setProperty('--match-h', `${h}px`);
      else me.style.removeProperty('--match-h');
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [target]);
  return <div ref={box}>{children}</div>;
}
