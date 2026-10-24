'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RoundIcon, RoundSearch } from '@/components/round-icon';
import { Wordmark } from '@/components/logo';
import { DugoutBell, DugoutSettings } from '@/components/dugout/dugout-header-tools';
import { ProfileButton, SinkerButton } from '@/components/dugout/dugout-topbar';
import { FEATURES } from '@/lib/dugout-features';

/**
 * 2026-10-24 금윤호(둘째): "'전국 에서 무엇이 필요하세요?' 글을 지우고 덕아웃 로고를 · 검색창은 '통합검색'만 · 우측 상단 싱커는 S 로고만 · 맨 끝엔 프로필".
 *   그래서 가운데 큰 덕아웃 로고([data-dugout-logo] — 싱커에서 돌아올 때 가운데 로고가 여기로 내려앉는다) → 통합검색 → 아이콘 줄.
 *   모서리 줄은 오른쪽만(싱커 S · 알림 · 설정 · 프로필).
 *
 * 덕아웃 첫 화면(2026-10-24 금윤호: "메인 화면을 그냥 이거로 — 덕아웃의 처음 시작화면은 이거") — 예전 큰 로고 화면(dugout-hero) 대신 이것.
 *   '[지역 ∨] 에서 무엇이 필요하세요?' + 통합검색(→ /search) · [덕아웃 | 싱커] 탭과 우리 기능으로 가는 아이콘 줄(lib/dugout-features.ts).
 *   이 판이 화면에 보이는 동안 위 막대는 숨고(data-top), 내려서 판이 다 지나가면 위에서 스르륵 내려온다(globals.css '덕아웃 첫 화면').
 *   위 막대 대신 판 맨 위에 작은 모서리 줄 — 왼쪽 DUGOUT, 오른쪽 싱커(S 로고) · 알림 · 설정 · 로그인.
 */
const TABS = [
  { key: 'dugout', label: '덕아웃' },
  { key: 'sinker', label: '싱커' },
] as const;

export function DugoutMain({
  user,
  avatarUrl = null,
  alerts = 0,
  sinker = false,
  native = false,
}: {
  user: { nickname: string } | null;
  avatarUrl?: string | null;
  alerts?: number;
  sinker?: boolean;
  native?: boolean;
}) {
  const box = useRef<HTMLElement>(null);
  /* 서버 그림부터 '판이 보임' — 첫 칠에 위 막대가 비쳤다 사라지지 않게 */
  const [top, setTop] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('dugout');

  /*
   * 다른 화면 · 싱커에서 넘어와 붙을 때 — 앞 화면의 위 막대가 보이는 채로 넘어와 0.5초 동안 옅어지며 남았다(2026-10-24 금윤호 "기본 홈에서 이게 안 보이게").
   * 붙는 순간(그리기 전)에 숨김을 html 에 적고 그 한 번은 transition 없이 — 나타날 때(내려서 판이 지나갈 때)만 스르륵.
   */
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.dugoutTop = '';
    html.dataset.dugoutInstant = '';
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => delete html.dataset.dugoutInstant);
    });
    return () => {
      cancelAnimationFrame(id);
      delete html.dataset.dugoutTop;
      delete html.dataset.dugoutInstant;
    };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setTop(e.isIntersecting);
        if (e.isIntersecting) document.documentElement.dataset.dugoutTop = '';
        else delete document.documentElement.dataset.dugoutTop;
      },
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* 알림은 모서리 종이 있어 아이콘 줄에서는 뺀다(10칸) */
  const items = FEATURES.filter((f) => f.group === tab && f.href !== '/notifications');

  return (
    <section
      ref={box}
      data-dugout-main
      data-top={top ? '' : undefined}
      aria-label="덕아웃 시작"
      className="relative -mx-4 -mt-5 px-4 pb-14 md:-mx-6 md:-mt-8 md:px-6 md:pb-20"
    >
      {/* 모서리 줄 — 위 막대가 숨은 동안의 길 */}
      <div className="flex items-center justify-end pt-[max(1rem,env(safe-area-inset-top))] pb-2 md:pt-6">
        <div className="flex items-center gap-2">
          {sinker && <SinkerButton native={native} />}
          {user ? (
            <DugoutBell initial={alerts} />
          ) : (
            <>
              <Link href="/login" className="flex min-h-10 items-center px-2 text-sm font-semibold text-muted hover:text-ink">
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
          {user && <ProfileButton nickname={user.nickname} avatarUrl={avatarUrl} />}
        </div>
      </div>

      <div className="mx-auto max-w-5xl pt-10 md:pt-16">
        <form action="/search" method="get" role="search" className="space-y-8">
          <h1 className="flex justify-center">
            <Link
              href={native ? '/?dugout=1' : '/'}
              aria-label="덕아웃"
              data-dugout-logo
              className="inline-flex"
            >
              <Wordmark brand="dugout" className="text-6xl text-ink md:text-8xl" />
            </Link>
          </h1>
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <RoundSearch className="pointer-events-none absolute top-1/2 left-4 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
              <input
                name="q"
                type="search"
                placeholder="통합검색"
                aria-label="덕아웃 통합검색"
                className="min-h-12 w-full appearance-none rounded-xl bg-ink/6 pr-4 pl-11 text-[15px] text-ink placeholder:text-muted/70 focus:bg-surface focus:ring-2 focus:ring-sky focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-5 text-sm font-bold text-page"
            >
              찾기
            </button>
          </div>
        </form>

        {/* [덕아웃 | 싱커] — 우리 탭 · 사이트로 가는 아이콘 줄 */}
        <div className="mt-10">
          <div role="tablist" aria-label="이동할 곳" className="flex justify-center border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === tab}
                onClick={() => setTab(t.key)}
                className={`relative min-h-12 w-40 text-[15px] font-bold transition-colors md:w-44 ${
                  t.key === tab
                    ? 'text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-ink'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <ul
            key={tab}
            role="tabpanel"
            className="mt-6 grid grid-cols-5 gap-y-5 motion-safe:animate-[launcher-in_240ms_ease-out] md:flex md:justify-between"
          >
            {items.map((it) => (
              <li key={it.href} className="min-w-0">
                <Link href={it.href} className="group flex flex-col items-center gap-2 rounded-xl px-1 py-1 md:w-20">
                  <span className="grid h-11 w-11 place-items-center text-sky transition-transform group-hover:-translate-y-0.5">
                    <RoundIcon name={it.icon} filled className="h-9 w-9" />
                  </span>
                  <span className="truncate text-center text-[13px] text-ink">{it.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
