'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RoundMenu, RoundPlus, RoundSearch } from '@/components/round-icon';
import { Wordmark } from '@/components/logo';
import { MorphLink } from '@/components/shell-morph';
import { DugoutBell, DugoutSettings } from '@/components/dugout/dugout-header-tools';

/**
 * 덕아웃 위 막대(2026-10-21 2단계, docs/designs/sinker-dugout.md 5-1) — 웹사이트 전체의 공용 머리. 덕아웃 바깥 공간(components/dugout/dugout-shell) ·
 * PC 브라우저의 선수 화면(app/(app)/layout.tsx, brand 'sinker') · 관리(app/(master)/layout.tsx) 모두 이것 하나를 맨 위에 둔다.
 *
 * 오른쪽의 '싱커'(2026-10-21 금윤호: "내 싱커가 아니라 싱커를 누르면 싱커의 홈으로")는 싱커 홈(/today)으로 변형하며 넘어간다(components/shell-morph.tsx).
 * '관리'(/manage)는 팀 · 레슨장 계정 · 관리자에게. 맨 오른쪽은 알림(종 밑 작은 창) · 설정(2026-10-22). brand 'sinker' 면 싱커 틀의 머리 — 덕아웃 메뉴 없이 SINKER 이름표 · 알림 · 관리만(덕아웃으로 돌아가는 길은
 * 홈 아이콘 왼쪽의 원형 뒤로가기, components/app-shell.tsx · mobile-tabs.tsx).
 */
export function DugoutTopBar({
  user,
  unread = 0,
  alerts = 0,
  sinker = false,
  manage = false,
  current = null,
  sticky = true,
  className = '',
  native = false,
  brand = 'dugout',
}: {
  user: { nickname: string } | null;
  unread?: number;
  /** 안 읽은 알림(lib/notify.ts countUnreadNotifications) */
  alerts?: number;
  /** 싱커(선수 기록)를 쓰는 사람인가 — 아니면 '싱커' 단추 대신 아무것도 */
  sinker?: boolean;
  /** 팀 · 레슨장 관리 계정 · 관리자인가 */
  manage?: boolean;
  current?: 'sinker' | 'manage' | null;
  sticky?: boolean;
  className?: string;
  /** 싱커 앱 웹뷰 안 — 홈은 /?dugout=1(앱의 / 는 싱커로 돌아간다), '싱커'는 그냥 이동 */
  native?: boolean;
  /** 어느 틀의 머리인가 — 덕아웃(초록, 메뉴 있음) · 싱커(파랑, 메뉴 없음) */
  brand?: 'dugout' | 'sinker';
}) {
  const pathname = usePathname();
  const inDugout = current === null;
  const isSinkerBar = brand === 'sinker';
  /* 로고 · '홈' = 덕아웃 첫 화면(2026-10-24 — 큰 로고 화면 없이 찾기 화면이 첫 화면) */
  const homeHref = isSinkerBar ? '/today' : native ? '/?dugout=1' : '/';
  const nav = isSinkerBar
    ? []
    : [
        { href: homeHref, label: '홈', exact: true },
        { href: '/community', label: '커뮤니티' },
        { href: '/market', label: '장터' },
        { href: '/lessons', label: '레슨' },
        { href: '/venues', label: '연습장' },
        { href: '/chat', label: '채팅', badge: unread },
      ];
  const active = (href: string, exact?: boolean) =>
    inDugout &&
    (exact
      ? pathname === href.split('?')[0]
      : pathname === href || pathname.startsWith(`${href}/`));
  /* 둘째 줄 메뉴 — 번개장터처럼 굵은 글, 지금 보는 곳만 초록 */
  const item = (on: boolean) =>
    `relative flex min-h-10 items-center rounded-full px-3 text-[15px] font-bold transition-colors ${
      on ? 'text-sky-strong' : 'text-ink hover:bg-ink/5'
    }`;
  const side = (on: boolean) =>
    `flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${
      on ? 'bg-ink text-white' : 'border border-line text-ink hover:border-sky-soft'
    }`;
  const badge = (n: number) =>
    n ? (
      <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
        {n}
      </span>
    ) : null;

  /* 가운데 검색 — 덕아웃 통합검색(2026-10-24 — 물건 · 글 · 코치 · 연습장 · 기능을 한 번에, app/(dugout)/search) */
  const search = (
    <form method="get" action="/search" role="search" className="relative hidden min-w-0 flex-1 md:block">
      <RoundSearch className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        name="q"
        type="search"
        placeholder="덕아웃 통합검색"
        aria-label="통합검색"
        className="min-h-11 w-full appearance-none rounded-full border border-transparent bg-ink/6 pr-4 pl-11 text-sm text-ink placeholder:text-muted/70 focus:border-sky focus:bg-surface focus:outline-none"
      />
    </form>
  );

  return (
    <header
      data-brand={isSinkerBar ? undefined : 'dugout'}
      data-morph-bar
      className={`${sticky ? 'sticky top-0' : ''} z-20 border-b border-line bg-surface/92 backdrop-blur ${className}`}
    >
      {/*
        번개장터식 두 줄(2026-10-23 금윤호: "숨고 · 번개장터 · 당근을 섞되 장터는 번개장터 느낌을 최대한") — 첫 줄은 로고 · 넓은 검색 · 내 것(싱커 · 관리 · 종 · 설정),
        둘째 줄은 '≡ 카테고리' 와 굵은 메뉴, 오른쪽 끝 '물건 올리기'. 휴대폰 · 싱커 틀은 한 줄 그대로.
      */}
      <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center gap-4 px-4 md:px-6">
        <Link
          href={homeHref}
          aria-label={isSinkerBar ? undefined : '덕아웃 첫 화면'}
          data-morph-side
          className="flex shrink-0 items-baseline gap-2"
        >
          <span data-wordmark className="inline-flex">
            <Wordmark brand={brand} className="text-2xl text-ink" />
          </span>
        </Link>
        {!isSinkerBar && search}
        <div data-morph-chrome className="ml-auto flex shrink-0 items-center gap-2">
          {user ? (
            <>
              {sinker && !isSinkerBar && <SinkerButton native={native} className={side(false)} />}
              {manage && (
                <Link
                  href="/manage"
                  aria-current={current === 'manage' ? 'page' : undefined}
                  className={side(current === 'manage')}
                >
                  관리
                </Link>
              )}
              {!sinker && !manage && !isSinkerBar && (
                <Link href="/me" className={side(false)}>
                  {user.nickname}
                </Link>
              )}
              {/* 알림은 종 밑 작은 창으로(2026-10-22 — 예전 '알림' 메뉴는 /notifications 로 옮겨 갔다), 설정은 맨 오른쪽 위 */}
              <DugoutBell initial={alerts} />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="flex min-h-10 items-center px-2 text-sm font-semibold text-muted hover:text-ink"
              >
                로그인
              </Link>
              <Link
                href="/login?signup=1"
                className="flex min-h-10 items-center rounded-full bg-sky px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
              >
                시작하기
              </Link>
            </>
          )}
          <DugoutSettings />
        </div>
      </div>
      {nav.length > 0 && (
        <div className="mx-auto hidden w-full max-w-6xl items-center gap-1 px-4 pb-1 md:flex md:px-6">
          <Link
            href="/market"
            className="mr-1 flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-ink hover:bg-ink/5"
          >
            <RoundMenu className="h-4 w-4" /> 카테고리
          </Link>
          <nav aria-label="덕아웃" data-morph-chrome className="flex items-center gap-1">
            {nav.map((t) => {
              const on = active(t.href, t.exact);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={on ? 'page' : undefined}
                  className={item(on)}
                >
                  {t.label}
                  {badge(t.badge ?? 0)}
                </Link>
              );
            })}
          </nav>
          {inDugout && (
            <Link
              href="/market/new"
              className="ml-auto flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold text-ink transition-colors hover:border-sky-soft"
            >
              <RoundPlus className="h-4 w-4" /> 물건 올리기
            </Link>
          )}
        </div>
      )}
    </header>
  );
}

/**
 * '싱커'로 넘어가는 단추(2026-10-24 금윤호: "우상단의 싱커를 우리 S 로고와 영어로 나머지가 써 있는 느낌으로") — 글자 대신 싱커 이름표(S 로고 + INKER).
 * 위 막대와 덕아웃 첫 화면의 모서리가 같이 쓴다. 웹은 싱커로 변형하며 넘어가고(MorphLink), 앱 웹뷰는 그냥 이동.
 */
export function SinkerButton({ native = false, className = '' }: { native?: boolean; className?: string }) {
  const mark = <Wordmark brand="sinker" className="text-[17px] leading-none text-ink" />;
  return native ? (
    <Link href="/today" aria-label="싱커" className={className}>
      {mark}
    </Link>
  ) : (
    <MorphLink href="/today" dir="to-sinker" aria-label="싱커" className={className}>
      {mark}
    </MorphLink>
  );
}
