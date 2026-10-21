'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell, LayoutGrid, MessagesSquare, Search } from '@/components/icon';
import { Wordmark } from '@/components/logo';

/**
 * 덕아웃 첫 화면(2026-10-21 금윤호: "처음 접속하면 로고와 단어가 가운데 크게 뜨고, 위로 가면서 구글 같은 홈이 나오고, 조금만 내리면 로고가 작아지며
 * 위로 가고 지금의 덕아웃 홈이 나오게").
 *
 * 단계 셋 — html[data-hero] 로 적어 위 막대(components/dugout/dugout-topbar.tsx)가 같이 움직인다(globals.css '덕아웃 첫 화면').
 *   splash  로고 · 이름만 가운데 크게(한 세션에 한 번, sessionStorage) → 0.9초 뒤 hero
 *   hero    구글식 홈 — 작은 링크 · 큰 로고 · 검색창 · 단추 둘. 위 막대는 숨는다. 바퀴 · 손가락 · 키로 조금만 내리면 home
 *   home    로고가 작아지며 위로(위 막대가 떠오름) · 이 판이 접히며 밑의 덕아웃 홈이 올라온다. 맨 위에서 다시 올리면 hero 로
 */
type Stage = 'splash' | 'hero' | 'home';
const SPLASH_KEY = 'dugout-splash-seen';
const SPLASH_MS = 900;
const COLLAPSE_MS = 620;

export function DugoutHero({
  user,
  unread = 0,
  alerts = 0,
}: {
  user: { nickname: string } | null;
  unread?: number;
  alerts?: number;
}) {
  /* 서버 그림부터 splash(로고 크게) — 첫 칠에 위 막대가 비쳤다 사라지는 일이 없다. 이미 본 세션이면 수화 뒤 바로 hero 로 줄어든다 */
  const [stage, setStage] = useState<Stage>('splash');
  const stageRef = useRef<Stage>('splash');
  const busy = useRef(false);
  const touchY = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  function go(next: Stage) {
    stageRef.current = next;
    setStage(next);
  }

  /* 첫 그림: 한 세션에 한 번은 splash 부터. 움직임 줄이기면 바로 hero. 서버 그림과 어긋나지 않게 다음 프레임에 정한다 */
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let seen = true;
      try {
        seen = sessionStorage.getItem(SPLASH_KEY) === '1';
        if (!seen) sessionStorage.setItem(SPLASH_KEY, '1');
      } catch {
        /* 저장소 없음 */
      }
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (seen || reduce) go('hero');
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  /* splash 는 0.9초 뒤 hero 로 */
  useEffect(() => {
    if (stage !== 'splash') return;
    const t = window.setTimeout(() => go('hero'), SPLASH_MS);
    return () => window.clearTimeout(t);
  }, [stage]);

  /* 위 막대 · 틀에 알린다 */
  useEffect(() => {
    const html = document.documentElement;
    if (stage === 'home') delete html.dataset.hero;
    else html.dataset.hero = stage;
    return () => {
      delete html.dataset.hero;
    };
  }, [stage]);

  /* 조금만 내려도 홈 · 맨 위에서 올리면 다시 첫 화면 */
  useEffect(() => {
    const collapse = () => {
      if (busy.current || stageRef.current !== 'hero') return;
      busy.current = true;
      go('home');
      window.setTimeout(() => (busy.current = false), COLLAPSE_MS);
    };
    const expand = () => {
      if (busy.current || stageRef.current !== 'home' || window.scrollY > 0) return;
      busy.current = true;
      go('hero');
      window.scrollTo({ top: 0 });
      window.setTimeout(() => (busy.current = false), COLLAPSE_MS);
    };
    const onWheel = (e: WheelEvent) => {
      if (stageRef.current === 'splash') return;
      if (e.deltaY > 6) {
        if (stageRef.current === 'hero') {
          e.preventDefault();
          collapse();
        }
      } else if (e.deltaY < -24) expand();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY.current = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchY.current == null) return;
      const dy = touchY.current - (e.touches[0]?.clientY ?? touchY.current);
      if (dy > 18 && stageRef.current === 'hero') {
        touchY.current = null;
        collapse();
      } else if (dy < -40) {
        touchY.current = null;
        expand();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (
        ['ArrowDown', 'PageDown', ' '].includes(e.key) &&
        stageRef.current === 'hero'
      ) {
        e.preventDefault();
        collapse();
      }
    };
    const onScroll = () => {
      if (stageRef.current === 'hero' && window.scrollY > 24) collapse();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const splash = stage === 'splash';
  const home = stage === 'home';
  const [gridOpen, setGridOpen] = useState(false);
  const apps = [
    { href: '/market', label: '장터' },
    { href: '/community', label: '커뮤니티' },
    { href: '/lessons', label: '레슨' },
    { href: '/venues', label: '연습장' },
    { href: '/gear', label: '장비' },
    { href: user ? '/me' : '/login', label: user ? '내 것' : '로그인' },
  ];

  return (
    <div
      ref={box}
      data-dugout-hero
      data-stage={stage}
      aria-hidden={home}
      /* 틀의 본문 여백을 덮고 화면 전체를 쓴다 — 접히면 높이 0 */
      className="relative -mx-4 -mt-5 overflow-hidden md:-mx-6 md:-mt-8"
      style={{
        height: home ? 0 : 'calc(var(--vvh, 100dvh))',
        marginBottom: home ? 0 : undefined,
        transition: `height ${COLLAPSE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
      }}
    >
      {/* 구글식 작은 링크 — 왼쪽 위 · 오른쪽 위. splash · home 에서는 숨는다 */}
      <div
        className={`absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 text-sm transition-opacity duration-500 md:px-6 ${
          splash || home ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <nav className="flex items-center gap-4 text-muted">
          <Link href="/intro" className="hover:text-ink">
            덕아웃 소개
          </Link>
          <Link href="/market" className="hover:text-ink">
            장터
          </Link>
        </nav>
        <div className="relative flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/chat"
                className="relative grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                aria-label="채팅"
              >
                <MessagesSquare className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-danger" />
                )}
              </Link>
              <Link
                href="/notifications"
                className="relative grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                aria-label="알림"
              >
                <Bell className="h-5 w-5" />
                {alerts > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-danger" />
                )}
              </Link>
            </>
          ) : (
            <Link href="/login" className="px-2 text-muted hover:text-ink">
              로그인
            </Link>
          )}
          <button
            type="button"
            aria-label="덕아웃 메뉴"
            aria-expanded={gridOpen}
            onClick={() => setGridOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
          >
            <LayoutGrid className="h-5 w-5" />
          </button>
          {user ? (
            <Link
              href="/me"
              aria-label="내 것"
              className="grid h-9 w-9 place-items-center rounded-full bg-sky text-sm font-bold text-white"
            >
              {user.nickname.slice(0, 1)}
            </Link>
          ) : (
            <Link
              href="/login?signup=1"
              className="min-h-9 rounded-full bg-sky px-4 text-sm font-semibold leading-9 text-white"
            >
              시작하기
            </Link>
          )}
          {gridOpen && (
            <div className="absolute top-12 right-0 z-10 grid w-64 grid-cols-3 gap-1 rounded-2xl border border-line bg-surface p-2 shadow-lg">
              {apps.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  onClick={() => setGridOpen(false)}
                  className="rounded-xl px-2 py-3 text-center text-sm font-semibold text-ink hover:bg-sky/10"
                >
                  {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 가운데 — 로고 · 검색 · 단추 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        <div
          className="flex flex-col items-center transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            transform: splash
              ? 'translateY(48px) scale(1.35)'
              : home
                ? 'translateY(-40vh) scale(0.35)'
                : 'translateY(-16px) scale(1)',
          }}
        >
          <Wordmark brand="dugout" className="text-6xl text-ink md:text-8xl" />
        </div>
        <form
          method="get"
          action="/market"
          className={`mt-8 w-full max-w-xl transition-all duration-500 ${splash || home ? 'pointer-events-none translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
        >
          <label className="flex min-h-14 items-center gap-3 rounded-full border border-line bg-surface px-5 shadow-sm transition-shadow focus-within:border-sky-soft focus-within:shadow-md">
            <Search className="h-5 w-5 shrink-0 text-muted" />
            <input
              name="q"
              type="search"
              autoComplete="off"
              placeholder="글러브, 배트, 레슨장, 연습장…"
              className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/60"
            />
            <Link
              href="/gear"
              className="hidden shrink-0 rounded-full bg-sky/12 px-3 py-1.5 text-xs font-semibold text-sky-strong sm:inline-flex"
            >
              장비 고르기
            </Link>
          </label>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="submit"
              className="min-h-11 rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink hover:border-sky-soft"
            >
              덕아웃 검색
            </button>
            <Link
              href="/lessons"
              className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink hover:border-sky-soft"
            >
              레슨 찾기
            </Link>
          </div>
        </form>
      </div>

      {/* 아래 안내 — 내리면 홈 */}
      <button
        type="button"
        onClick={() => stage === 'hero' && go('home')}
        className={`absolute inset-x-0 bottom-6 mx-auto flex w-fit flex-col items-center gap-1 text-xs text-muted transition-opacity duration-500 ${splash || home ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      >
        <span>아래로 내리면 장터 · 소통 · 레슨</span>
        <span aria-hidden className="motion-safe:animate-bounce">
          ↓
        </span>
      </button>
    </div>
  );
}
