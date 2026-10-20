'use client';

import { Children, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from '@/components/icon';
import {
  backTooSoon,
  clearBarBack,
  markBackPressed,
  previousUrl,
  sameScreen,
  setBarBack,
  setNavDirection,
} from '@/lib/nav-state';

type Router = ReturnType<typeof useRouter>;

/**
 * 뒤로 가기 — 바로 앞 화면이 목적지면 진짜 뒤로(router.back), 아니면 목적지로 바꿔 간다(router.replace).
 *
 * 예전 '‹ 트레이닝'은 그 주소로 앞으로 갔다(Link). 기록이 A → B → A 로 쌓여 목록의 스크롤 자리를 잃고, 밀어서 뒤로
 * 가면 방금 본 화면이 다시 나왔다(2026-10-04 점검). 앞 화면이 목적지가 아니면(알림 · 다른 탭에서 곧장 들어옴) 지금
 * 화면을 목적지로 갈아 끼운다 — 아이폰의 '위로 가기'처럼 기록이 쌓이지 않는다. 어느 쪽이든 밀려 나가며 바뀐다(pop).
 */
export function goBack(router: Router, href: string) {
  if (backTooSoon()) return;
  const prev = previousUrl();
  setNavDirection('pop');
  if (prev && sameScreen(prev, href)) {
    markBackPressed();
    router.back();
  } else {
    router.replace(href);
  }
}

/** 단추 글자 — 문자열 조각만 잇는다('10월' + ' 달력') */
function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('')
    .trim();
}

/**
 * '‹ 이전' — 하위 화면의 돌아가기(2026-10-01 '애플처럼').
 *
 * 휴대폰에서는 위 막대 왼쪽에 선다(components/app-shell.tsx MobileTopBar — 이 단추가 적어 둔 것을 읽는다). 본문 안의
 * 줄은 숨긴다 — 예전에는 본문 맨 위에 있어 스크롤하면 사라졌다. PC 는 막대가 다르므로 본문 줄 그대로.
 *
 * 판 넘기기(components/tab-pager.tsx)의 숨은 판(data-active 없음) 안에서는 막대에 쓰지 않고, 판이 숨으면 걷는다 —
 * 트레이닝 하위 화면(암케어)에서 하단 탭으로 옮기면 투구 · 홈 막대에 '‹ 트레이닝'이 남았다(2026-10-16, NavTitle 과 같은 까닭).
 */
export function BackLink({
  href,
  children,
  toBar = true,
}: {
  href: string;
  children: ReactNode;
  /**
   * 휴대폰 위 막대에 '‹ 뒤로'를 세우나 — 트레이닝 앱 머리(training-page.tsx AppHead)는 PC 줄에만 쓴다(2026-10-20).
   * 휴대폰은 투구 · 타격 종목 하단바의 ‹ 가 돌아가는 길이라 막대에 또 세우면 길이 둘이 된다.
   */
  toBar?: boolean;
}) {
  const router = useRouter();
  const label = textOf(children);
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!toBar) return;
    const panel = ref.current?.closest('[data-panel]');
    const shown = () => !panel || panel.hasAttribute('data-active');
    if (shown()) setBarBack({ href, label });
    const mo = new MutationObserver(() =>
      shown() ? setBarBack({ href, label }) : clearBarBack(href)
    );
    if (panel)
      mo.observe(panel, { attributes: true, attributeFilter: ['data-active'] });
    return () => {
      mo.disconnect();
      clearBarBack(href);
    };
  }, [href, label, toBar]);

  return (
    <Link
      ref={ref}
      href={href}
      data-nav="pop"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        goBack(router, href);
      }}
      className="-ml-1.5 hidden min-h-11 items-center gap-0.5 text-base text-sky transition-opacity active:opacity-60 desk:inline-flex desk:min-h-0 desk:text-sm"
    >
      <ChevronLeft aria-hidden className="h-6 w-6 desk:h-4 desk:w-4" />
      {children}
    </Link>
  );
}
