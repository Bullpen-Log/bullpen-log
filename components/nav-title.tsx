'use client';

import { useEffect, useRef } from 'react';
import { clearBarTitle, setBarTitle } from '@/lib/nav-state';

/**
 * 큰 제목의 짝 — 휴대폰 위 막대에 이 화면의 제목을 적어 두고, 큰 제목이 스크롤로 막대 밑으로 가려지면 막대 가운데에
 * 작은 제목을 띄우게 한다(아이폰의 큰 제목 → 작은 제목, components/app-shell.tsx MobileTopBar). 2026-10-04 — 예전에는
 * 막대에 로고만 있고 큰 제목이 스크롤로 사라지면 지금 어느 화면인지 보이지 않았다.
 *
 * 큰 제목 바로 밑에 1px 표시를 두고, 그 표시가 막대 아래쪽보다 위로 올라가면 '접혔다'로 본다.
 */
export function NavTitle({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setBarTitle(title, false);
    /* 막대 아래쪽 — 시계 자리 + 막대(앱), 사파리는 막대만 */
    const bar = document.querySelector('[data-mobile-topbar]');
    const offset = Math.round(bar?.getBoundingClientRect().bottom ?? 56);
    const io = new IntersectionObserver(
      ([entry]) =>
        setBarTitle(title, !entry.isIntersecting && entry.boundingClientRect.top < offset + 1),
      { rootMargin: `-${offset}px 0px 0px 0px` }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearBarTitle(title);
    };
  }, [title]);

  return <span ref={ref} aria-hidden className="block h-px w-px desk:hidden" />;
}
