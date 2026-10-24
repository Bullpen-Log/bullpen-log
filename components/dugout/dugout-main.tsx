'use client';

import Link from 'next/link';
import { useLayoutEffect, type ReactNode } from 'react';
import { RoundIcon, RoundSearch } from '@/components/round-icon';
import { Wordmark } from '@/components/logo';
import { DugoutBell, DugoutSettings } from '@/components/dugout/dugout-header-tools';
import {
  ChatButton,
  ProfileButton,
  SinkerButton,
} from '@/components/dugout/dugout-topbar';
import { FEATURES } from '@/lib/dugout-features';
import { MarketHero, type BannerSlide } from '@/components/dugout/market-hero';

/**
 * 2026-10-24 금윤호(둘째): "'전국 에서 무엇이 필요하세요?' 글을 지우고 덕아웃 로고를 · 검색창은 '통합검색'만 · 우측 상단 싱커는 S 로고만 · 맨 끝엔 프로필".
 *   그래서 가운데 큰 덕아웃 로고([data-dugout-logo] — 싱커에서 돌아올 때 가운데 로고가 여기로 내려앉는다) → 통합검색 → 아이콘 줄 → 덕아웃 소식 띠(나중에 광고 자리), 오른쪽에 오늘의 경기 세로 칸.
 *   모서리 줄은 오른쪽만(싱커 S · 알림 · 설정 · 프로필).
 *
 * 덕아웃 첫 화면(2026-10-24 금윤호: "메인 화면을 그냥 이거로 — 덕아웃의 처음 시작화면은 이거") — 예전 큰 로고 화면(dugout-hero) 대신 이것.
 *   '[지역 ∨] 에서 무엇이 필요하세요?' + 통합검색(→ /search) · [덕아웃 | 싱커] 탭과 우리 기능으로 가는 아이콘 줄(lib/dugout-features.ts).
 *   이 판이 첫 자리(A)인 동안 위 막대는 숨고, 한 번 굴리면 본문 자리(B)로 미끄러지며 막대가 내려앉는다(home-snap.tsx · globals.css '덕아웃 첫 화면').
 *   위 막대 대신 판 맨 위에 작은 모서리 줄 — 왼쪽 DUGOUT, 오른쪽 싱커(S 로고) · 알림 · 설정 · 로그인.
 */
/*
 * 아이콘 줄 — 덕아웃 기능 다섯만(2026-10-24 금윤호: "싱커 탭은 아예 빼고, 물건 올리기 · 맞춤 코치 · 채팅 · 장비 추천 · 내 것은 필요 없다").
 * 채팅은 모서리의 채팅 아이콘으로 간다.
 */
const HOME_ICONS = ['/community', '/market', '/lessons', '/venues', '/baseball'];
/** 싱커 앱의 덕아웃 탭 — 싱커와 이어진 넷만(2026-10-24 김민, lib/sinker-dugout.ts) */
const SINKER_APP_ICONS = ['/community', '/lessons', '/venues', '/chat'];

export function DugoutMain({
  user,
  avatarUrl = null,
  alerts = 0,
  unread = 0,
  sinker = false,
  native = false,
  sinkerApp = false,
  slides,
  aside,
}: {
  /** 첫 화면 오른쪽 칸(오늘의 경기) — PC · 패드만 */
  aside?: ReactNode;
  /** 덕아웃 소식 띠 — 로고 밑 · 통합검색 위(2026-10-24 금윤호). 싱커 앱은 없다 */
  slides?: readonly BannerSlide[];
  user: { nickname: string } | null;
  avatarUrl?: string | null;
  alerts?: number;
  /** 안 읽은 채팅 수 — 모서리 채팅 아이콘의 점 */
  unread?: number;
  sinker?: boolean;
  native?: boolean;
  /** 싱커 앱 안 — 통합검색(장터까지 찾는다) · 싱커 S · 설정 · 프로필은 빼고 아이콘은 넷(커뮤니티 · 레슨 · 연습장 · 채팅) */
  sinkerApp?: boolean;
}) {
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

  const items = (sinkerApp ? SINKER_APP_ICONS : HOME_ICONS)
    .map((h) => FEATURES.find((f) => f.href === h))
    .filter((f) => !!f);

  return (
    <section
      data-dugout-main
      /* 서버 그림부터 '판이 보임' — 첫 칠에 위 막대가 비치지 않게. 붙은 뒤에는 두 칸 스크롤(home-snap.tsx)이 html[data-dugout-top] 으로 맡는다 */
      data-top=""
      aria-label="덕아웃 시작"
      className="relative -mx-4 -mt-5 px-4 pb-14 md:-mx-6 md:-mt-8 md:px-6 md:pb-20"
    >
      {/* 모서리 줄 — 위 막대가 숨은 동안의 길 */}
      <div className="flex items-center justify-end pt-[max(1rem,env(safe-area-inset-top))] pb-2 md:pt-6">
        <div className="flex items-center gap-2">
          {sinker && !sinkerApp && <SinkerButton native={native} />}
          {user ? (
            <>
              <ChatButton unread={unread} />
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
          {!sinkerApp && <DugoutSettings />}
          {user && !sinkerApp && (
            <ProfileButton nickname={user.nickname} avatarUrl={avatarUrl} />
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl pt-10 md:pt-16">
        {/* 로고 · 통합검색 · 아이콘 줄은 화면 가운데 온 폭 그대로 — 경기 칸이 이 자리를 좁히지 않는다(2026-10-24 금윤호) */}
        <div className="min-w-0">
          <h1 className="flex justify-center">
            <Link
              href={native ? '/?dugout=1' : '/'}
              aria-label="덕아웃"
              data-dugout-logo
              className="inline-flex"
            >
              <Wordmark brand="dugout" className="text-5xl text-ink md:text-7xl" />
            </Link>
          </h1>
          <form action="/search" method="get" role="search" className="mt-6">
            <div
              className={`mx-auto max-w-3xl items-center gap-2 ${sinkerApp ? 'hidden' : 'flex'}`}
            >
              <label className="relative min-w-0 flex-1">
                <RoundSearch className="pointer-events-none absolute top-1/2 left-4 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
                <input
                  name="q"
                  type="search"
                  placeholder="통합검색"
                  aria-label="덕아웃 통합검색"
                  className="min-h-11 w-full appearance-none rounded-xl bg-ink/6 pr-4 pl-11 text-[15px] text-ink placeholder:text-muted/70 focus:bg-surface focus:ring-2 focus:ring-sky focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-5 text-sm font-bold text-page"
              >
                찾기
              </button>
            </div>
          </form>

          {/* 덕아웃 기능으로 가는 아이콘 줄 */}
          <ul className="mt-9 flex flex-wrap justify-center gap-x-5 gap-y-4 sm:gap-x-10 md:gap-x-12">
            {items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  className="group flex w-16 flex-col items-center gap-2 rounded-xl py-1 md:w-20"
                >
                  <span className="grid h-10 w-10 place-items-center text-sky transition-transform group-hover:-translate-y-0.5">
                    <RoundIcon name={it.icon} filled className="h-8 w-8" />
                  </span>
                  <span className="truncate text-center text-xs text-ink">
                    {it.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/*
          덕아웃 소식(나중에 광고 자리) + 오늘의 경기 — 아이콘 줄 밑 한 줄을 밑 본문과 같은 두 칸(왼쪽 · 오른쪽 240px)으로 나눠, 왼쪽은 띠 · 오른쪽은 경기 세로 카드.
          검색 ↔ 아이콘(첫 화면의 두 할 일)은 붙어 있고, 띠는 첫 화면 끝에서 보이며(네이버 첫 화면과 같은 차례), 경기 칸은 밑 본문의 경기 칸과 같은 줄이라
          한 번 굴려 본문으로 가도 같은 자리에 같은 칸이 이어진다. 휴대폰은 띠만(경기는 본문 쪽 카드).
        */}
        {(slides || aside) && (
          <div
            className={`mt-10 ${aside ? 'md:grid md:grid-cols-[minmax(0,1fr)_220px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-8' : ''}`}
          >
            {/* 띠는 옆 경기 카드와 같은 높이(2026-10-24 금윤호 '오늘의 경기랑 크기 맞춰') — 칸 높이를 띠 · 넘기는 줄까지 채운다 */}
            <div className="min-w-0 md:[&>section]:h-full md:[&>section>div]:h-full">
              {slides && <MarketHero slides={slides} slim label="덕아웃 소식" />}
            </div>
            {aside && <aside className="hidden md:block">{aside}</aside>}
          </div>
        )}
      </div>
    </section>
  );
}
