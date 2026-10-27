'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoundBack, RoundChat, RoundPlus, RoundSearch } from '@/components/round-icon';
import { goBack } from '@/components/back-link';
import { barSnapshot, serverBarSnapshot, subscribeBar } from '@/lib/nav-state';
import { SinkerMark, Wordmark } from '@/components/logo';
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
  slim = false,
  brand = 'dugout',
  avatarUrl = null,
}: {
  /** 맨 오른쪽 프로필 사진(서명 주소) — 없으면 이름 첫 글자 */
  avatarUrl?: string | null;
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
  /**
   * 싱커 앱의 덕아웃 탭(2026-10-24 김민: "싱커와 이어진 느낌 · 덕아웃 정체성은 그대로") — DUGOUT 로고 · 채팅 · 알림만. 싱커로 가는 S · 관리 · 설정 · 프로필은
   * 싱커 앱이 이미 가진 길이라 뺀다.
   */
  slim?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  /* 덕아웃 홈 — 가운데 통합검색이 있는 화면(싱커 앱 웹뷰의 /?dugout=1 도 같은 주소) */
  const onHome = pathname === '/';
  /*
   * 싱커 앱 안(slim)의 하위 화면 — 왼쪽에 '‹ 뒤로'(2026-10-27). 화면의 BackLink 가 적어 둔 목적지가 있으면 그것, 없으면 주소로 정한 윗 화면(sinkerBackOf).
   * 덕아웃 화면의 BackLink 는 휴대폰에서 본문 줄을 숨기고 위 막대에 서게 돼 있는데(components/back-link.tsx) 덕아웃 막대가 안 읽어, 앱에서는 뒤로 단추가 아예 없었다.
   */
  const bar = useSyncExternalStore(subscribeBar, barSnapshot, serverBarSnapshot);
  const back = slim && !onHome ? (bar.back ?? sinkerBackOf(pathname)) : null;
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
        { href: '/baseball', label: '경기' },
      ];
  const active = (href: string, exact?: boolean) =>
    inDugout &&
    (exact
      ? pathname === href.split('?')[0]
      : pathname === href || pathname.startsWith(`${href}/`));
  /* 둥근 알약 한 줄(2026-10-24 금윤호 "둥글둥글하고 심플하게") — 칸은 모두 높이 40px 둥근 단추, 지금 보는 곳은 뒤에서 미끄러지는 옅은 알약 */
  const item = (on: boolean) =>
    `relative z-10 flex h-9 items-center rounded-lg px-3 text-sm whitespace-nowrap transition-colors ${
      on ? 'font-bold text-ink' : 'font-semibold text-ink/65 hover:text-ink'
    }`;
  const ghost = 'flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-ink transition-colors hover:bg-ink/6';
  /* 가운데 검색 — 덕아웃 통합검색(물건 · 글 · 코치 · 연습장 · 기능을 한 번에, app/(dugout)/search). 누르면 넓어진다 */
  const search = (
    <form method="get" action="/search" role="search" className="relative hidden shrink-0 xl:block">
      <RoundSearch className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        name="q"
        type="search"
        placeholder="통합검색"
        aria-label="통합검색"
        className="h-9 w-60 appearance-none rounded-lg bg-ink/6 pr-4 pl-10 text-sm text-ink transition-[width,background-color] duration-200 ease-out placeholder:text-muted/70 focus:w-80 focus:bg-surface focus:ring-2 focus:ring-sky focus:outline-none"
      />
    </form>
  );

  return (
    <header
      data-brand={isSinkerBar ? undefined : 'dugout'}
      data-morph-bar
      /*
       * 조용한 한 줄(2026-10-25 덕아웃 PC 개편, docs/designs/dugout-desktop-information-design.md) — 떠 있는 알약 대신 면 하나에 밑선.
       * 홈 · 안쪽 화면 어디서나 같은 자리 · 같은 높이(PC 64px)라 화면을 옮겨도 머리가 뛰지 않는다. 앱 웹뷰는 화면 끝(시계 자리)까지 그려 그만큼 비운다.
       */
      className={`${sticky ? 'sticky top-0' : ''} z-20 border-b border-line ${isSinkerBar ? 'bg-page' : slim ? 'bg-page/92 backdrop-blur-md' : 'bg-surface'} ${native ? 'pt-[env(safe-area-inset-top)]' : ''} ${className}`}
    >
      {/* 본문과 같은 바깥 틀(.dugout-frame — 폭 1160 · 거터) — 로고와 본문 첫 글자가 같은 x 에 선다(2026-10-26 v2) */}
      <div className="dugout-frame">
        <div className="flex h-14 items-center gap-1 desk:h-15">
          {back ? (
            <a
              href={back.href}
              data-bar-tool
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                goBack(router, back.href);
              }}
              aria-label={`뒤로 · ${back.label}`}
              className="-ml-2.5 flex w-auto! shrink-0 items-center gap-0.5 rounded-full pr-2 pl-1 text-[17px] text-sky transition-opacity active:opacity-60"
            >
              <RoundBack aria-hidden className="h-6 w-6" />
              <span className="max-w-[12rem] truncate">{back.label}</span>
            </a>
          ) : (
          <Link
            href={homeHref}
            aria-label={isSinkerBar ? undefined : '덕아웃 첫 화면'}
            data-dugout-logo={isSinkerBar ? undefined : ''}
            data-morph-side
            className="-ml-2 flex h-10 shrink-0 items-center rounded-lg px-2 transition-colors hover:bg-ink/5"
          >
            <Wordmark brand={brand} className="text-xl text-ink" />
          </Link>
          )}
          {nav.length > 0 && !slim && <NavPills nav={nav} active={active} item={item} />}
          <div className="ml-auto flex min-w-0 items-center gap-1">
            {/* 홈(/)은 가운데 큰 통합검색이 첫째라 막대의 찾기 칸은 작은 단추로 접는다 — 누르면 가운데 찾기 칸으로(2026-10-26, 같은 크기 찾기 칸 둘을 두지 않게) */}
            {!isSinkerBar && !slim && !onHome && search}
            {!isSinkerBar && !slim && onHome && (
              <button
                type="button"
                aria-label="통합검색"
                title="통합검색"
                onClick={() => {
                  const input = document.getElementById('dugout-home-search');
                  if (!(input instanceof HTMLInputElement) || input.getClientRects().length === 0) return router.push('/search');
                  input.focus({ preventScroll: true });
                  input.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
                }}
                className={`${ICON} hidden md:grid`}
              >
                <RoundSearch className="h-5 w-5" />
              </button>
            )}
            {!isSinkerBar && !slim && !onHome && (
              <Link href="/search" aria-label="통합검색" title="통합검색" className={`${ICON} hidden md:grid xl:hidden`}>
                <RoundSearch className="h-5 w-5" />
              </Link>
            )}
            <div data-morph-chrome className="flex shrink-0 items-center gap-1">
              {user ? (
                <>
                  {inDugout && !isSinkerBar && !slim && (
                    <Link href="/market/new" aria-label="물건 올리기" title="물건 올리기" className={`${ICON} hidden lg:grid`}>
                      <RoundPlus className="h-5 w-5" />
                    </Link>
                  )}
                  {sinker && !isSinkerBar && !slim && <SinkerButton native={native} />}
                  {manage && !slim && (
                    <Link
                      href="/manage"
                      aria-current={current === 'manage' ? 'page' : undefined}
                      className={current === 'manage' ? `${ghost} bg-ink text-page hover:bg-ink` : ghost}
                    >
                      관리
                    </Link>
                  )}
                  {/* 싱커 앱 안에서는 장터 거래 채팅을 선수 활동처럼 막대에 두지 않는다(2026-10-27) — 거래 대화는 알림 · 마이에서 그대로 열린다 */}
                  {!slim && <ChatButton unread={unread} />}
                  <DugoutBell initial={alerts} />
                </>
              ) : (
                <>
                  <Link href="/login" className={`${ghost} text-muted hover:text-ink`}>
                    로그인
                  </Link>
                  <Link
                    href="/login?signup=1"
                    className="flex h-9 items-center rounded-lg bg-sky px-3.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
                  >
                    시작하기
                  </Link>
                </>
              )}
              {!slim && <DugoutSettings />}
              {user && !isSinkerBar && !slim && <ProfileButton nickname={user.nickname} avatarUrl={avatarUrl} />}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * 싱커 앱 안 하위 화면의 윗 화면 — 화면이 BackLink 로 적지 않았을 때(목록 첫 화면 · 알림 · 프로필 …). 덕아웃 탭의 첫 화면은 /?dugout=1.
 */
const SINKER_SECTIONS: [string, string][] = [
  ['/community', '커뮤니티'],
  ['/lessons', '레슨'],
  ['/venues', '연습장'],
  ['/chat', '채팅'],
  ['/me', '마이'],
];
export function sinkerBackOf(path: string): { href: string; label: string } {
  for (const [root, label] of SINKER_SECTIONS) if (path.startsWith(`${root}/`)) return { href: root, label };
  return { href: '/?dugout=1', label: '덕아웃' };
}

/** 위 막대의 동그란 아이콘 단추 — 모두 같은 40px 원, 테두리 없이 올리면 옅게 */
const ICON = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-ink/6';

/**
 * 메뉴 알약 줄 — 지금 보는 곳 뒤에 옅은 알약 하나가 깔리고, 다른 곳으로 가면 그 알약이 미끄러져 간다(첫 칠은 그 자리에 바로, 움직임 줄이기면 안 미끄러짐).
 * 자리는 그려진 뒤 재서 transform · width 로만 옮긴다.
 */
function NavPills({
  nav,
  active,
  item,
}: {
  nav: { href: string; label: string; exact?: boolean }[];
  active: (href: string, exact?: boolean) => boolean;
  item: (on: boolean) => string;
}) {
  const box = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number; ready: boolean; move: boolean } | null>(null);
  const onIndex = nav.findIndex((t) => active(t.href, t.exact));

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = (move: boolean) => {
      const on = el.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!on) return setPill((p) => (p ? { ...p, ready: false } : null));
      setPill((p) => ({ x: on.offsetLeft, w: on.offsetWidth, ready: true, move: move && !!p?.ready }));
    };
    place(true);
    const ro = new ResizeObserver(() => place(false));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onIndex]);

  return (
    <nav ref={box} aria-label="덕아웃" data-morph-chrome className="relative ml-1 hidden items-center md:flex">
      <span
        aria-hidden
        className={`absolute top-0 left-0 h-9 rounded-lg bg-ink/7 ${pill?.move ? 'transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]' : ''}`}
        style={{
          width: pill?.w ?? 0,
          transform: `translateX(${pill?.x ?? 0}px)`,
          opacity: pill?.ready ? 1 : 0,
        }}
      />
      {nav.map((t) => {
        const on = active(t.href, t.exact);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined} className={item(on)}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * '싱커'로 넘어가는 단추(2026-10-24 금윤호: "우측 상단 싱커를 S 로고만 · 누르는 순간 빠르게 화면 정중앙으로 오면서 싱커로") — 둥근 칸에 싱커 S 표시 하나.
 * 웹은 싱커로 변형하며 넘어가고(MorphLink — 시작 판의 S 가 이 단추 자리에서 가운데로 날아온다, components/shell-morph.tsx), 앱 웹뷰는 그냥 이동.
 * 덕아웃 틀 안이라 brand 가 초록인데 S 는 싱커 파랑 그대로(globals.css [data-brand='sinker']).
 */
export function SinkerButton({ native = false, className = '' }: { native?: boolean; className?: string }) {
  const box = `grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-ink/6 ${className}`;
  const mark = (
    <span data-brand="sinker" data-intro-from className="inline-flex">
      <SinkerMark className="h-5 w-5" />
    </span>
  );
  return native ? (
    <Link href="/today" aria-label="싱커" title="싱커" className={box}>
      {mark}
    </Link>
  ) : (
    <MorphLink href="/today" dir="to-sinker" fromMark aria-label="싱커" title="싱커" className={box}>
      {mark}
    </MorphLink>
  );
}

/** 맨 오른쪽 내 프로필(2026-10-24 금윤호 "우측 맨 끝에는 개인의 프로필") — 사진이 없으면 이름 첫 글자 원. 누르면 내 것(/me) */
export function ProfileButton({ nickname, avatarUrl }: { nickname: string; avatarUrl?: string | null }) {
  return (
    <Link href="/me" aria-label={`내 프로필 · ${nickname}`} title={nickname} className="grid h-10 w-10 shrink-0 place-items-center rounded-full">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 서명 주소(저장소)
        <img src={avatarUrl} alt="" className="h-[34px] w-[34px] rounded-full object-cover ring-1 ring-line" />
      ) : (
        <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-sky text-sm font-bold text-white">
          {nickname.slice(0, 1)}
        </span>
      )}
    </Link>
  );
}

/** 오른쪽 위 채팅 아이콘(2026-10-24 금윤호 "채팅은 우측 상단에 채팅 아이콘을 따로") — 안 읽은 말이 있으면 빨간 수. 누르면 채팅(인스타 DM 같은 두 칸) */
export function ChatButton({ unread = 0 }: { unread?: number }) {
  return (
    <Link
      href="/chat"
      aria-label={unread ? `채팅 · 안 읽은 ${unread}개` : '채팅'}
      title="채팅"
      data-bar-tool
      className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-ink/6"
    >
      <RoundChat className="h-5.5 w-5.5" />
      {unread > 0 && (
        <span className="absolute top-1 right-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
