'use client';

import { useEffect, useRef } from 'react';
import { clearBarTitle, setBarTitle } from '@/lib/nav-state';

/**
 * 큰 제목의 짝 — 휴대폰 위 막대에 이 화면의 제목을 적어 두고, 큰 제목이 스크롤로 막대 밑으로 가려지면 막대 가운데에
 * 작은 제목을 띄우게 한다(아이폰의 큰 제목 → 작은 제목, components/app-shell.tsx MobileTopBar). 2026-10-04 — 예전에는
 * 막대에 로고만 있고 큰 제목이 스크롤로 사라지면 지금 어느 화면인지 보이지 않았다.
 *
 * 큰 제목 바로 밑에 1px 표시를 두고, 그 표시가 막대 아래쪽보다 위로 올라가면 '접혔다'로 본다.
 *
 * 판 넘기기(components/tab-pager.tsx)의 숨은 판(data-active 없음) 안에서는 막대에 쓰지 않는다 — 탭 넷이 늘 붙어 있어,
 * 하위 화면에서 숨은(display: none) 판의 표시가 좌표 0 으로 '접혔다'를 알려 라이브러리 · 분석 막대에 엉뚱한 탭 이름이
 * 떴다(2026-10-16 통합 QA). 판이 다시 보이면 처음부터 다시 재고, 숨으면 제 제목을 걷는다.
 */
export function NavTitle({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const panel = el.closest('[data-panel]');
    const shown = () => !panel || panel.hasAttribute('data-active');
    if (shown()) setBarTitle(title, false);
    /* 막대 아래쪽 — 시계 자리 + 막대(앱), 사파리는 막대만 */
    const bar = document.querySelector('[data-mobile-topbar]');
    const offset = Math.round(bar?.getBoundingClientRect().bottom ?? 56);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (shown())
          setBarTitle(
            title,
            !entry.isIntersecting && entry.boundingClientRect.top < offset + 1
          );
      },
      { rootMargin: `-${offset}px 0px 0px 0px` }
    );
    io.observe(el);
    /* observe 는 지금 상태로 한 번 부른다 — 판이 다시 보일 때 다시 걸어 새로 잰다 */
    const mo = new MutationObserver(() => {
      if (!shown()) return clearBarTitle(title);
      io.unobserve(el);
      io.observe(el);
    });
    if (panel)
      mo.observe(panel, { attributes: true, attributeFilter: ['data-active'] });
    return () => {
      io.disconnect();
      mo.disconnect();
      clearBarTitle(title);
    };
  }, [title]);

  return <span ref={ref} aria-hidden className="block h-px w-px desk:hidden" />;
}
