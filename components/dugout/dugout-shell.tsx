'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { RoundChat, RoundHome, RoundMarket, RoundPlus, RoundUser } from '@/components/round-icon';
import { DugoutTopBar } from '@/components/dugout/dugout-topbar';
import { MorphIn } from '@/components/shell-morph';
import { DugoutAppBridge } from '@/components/app-shell/expo-tabs';
import { inSinkerDugout } from '@/lib/sinker-dugout';

/**
 * 덕아웃 껍데기(2026-10-20, docs/designs/baseball-hub.md) — 로그인 없이 보는 야구인의 공간. 선수 껍데기(components/app-shell)와 별개.
 * PC: 공용 위 막대(components/dugout/dugout-topbar.tsx — 2026-10-21 2단계부터 사이트 전체가 같은 막대). 휴대폰: 아래 탭 다섯(홈 · 장터 · 올리기 · 채팅 · 내 것).
 * 로그인한 사람에게는 '내 싱커'(/today) 로 가는 길이 늘 오른쪽 위에 있다 — 덕아웃은 밖, 싱커는 안(2026-10-21 이름, lib/brand.ts).
 */
export function DugoutShell({
  user,
  unread,
  alerts = 0,
  sinker = false,
  manage = false,
  native = false,
  sinkerApp = false,
  avatarUrl = null,
  children,
}: {
  avatarUrl?: string | null;
  user: { nickname: string } | null;
  unread: number;
  alerts?: number;
  sinker?: boolean;
  manage?: boolean;
  /** 싱커 앱 웹뷰 안 — 아래 탭은 앱 것이 대신 선다 */
  native?: boolean;
  /**
   * 싱커 앱의 덕아웃 탭(2026-10-24 김민: "싱커와 연관 있는 것만 · 따로 노는 느낌 말고 이어진 느낌 · 덕아웃 정체성은 그대로") — 덕아웃 틀 · 초록 · 로고는 그대로 두고
   * 위 막대만 가볍게(slim), 싱커에 없어도 되는 화면(장터 · 경기 일정 · 검색 …)은 안내로 바꾼다(lib/sinker-dugout.ts). 덕아웃 앱은 native 만 켜고 이것은 끈다.
   */
  sinkerApp?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const tabs = [
    { href: native ? '/?dugout=1' : '/', label: '홈', icon: RoundHome, exact: true },
    { href: '/market', label: '장터', icon: RoundMarket },
    { href: '/market/new', label: '올리기', icon: RoundPlus, plus: true },
    { href: '/chat', label: '채팅', icon: RoundChat, badge: unread },
    { href: '/me', label: '내 것', icon: RoundUser },
  ];
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href.split('?')[0] : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div
      data-safe-area
      data-brand="dugout"
      className="flex min-h-[var(--vvh,100dvh)] flex-col bg-page text-ink"
    >
      <DugoutTopBar
        user={user}
        unread={unread}
        alerts={alerts}
        sinker={sinker}
        manage={manage}
        native={native}
        slim={sinkerApp}
        avatarUrl={avatarUrl}
      />

      <MorphIn />
      {native && (
        <Suspense fallback={null}>
          <DugoutAppBridge />
        </Suspense>
      )}
      <main
        data-morph-main
        className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 md:px-6 md:pt-8 md:pb-16"
      >
        {sinkerApp && !inSinkerDugout(pathname) ? <SinkerAway /> : children}
      </main>

      {/*
        휴대폰 아래 탭 — 싱커의 유리 알약과 같은 모양(2026-10-21 금윤호: "덕아웃의 세부 인터페이스는 싱커와 비슷하게"; 유리는 globals.css '[data-tab-bar]').
        싱커 앱 안에서는 앱의 탭 막대가 대신 선다(겹치지 않게).
      */}
      {!native && (
        <nav
          aria-label="덕아웃 탭"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-20 pb-(--tab-bar-gap) pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] md:hidden"
        >
          <ul
            data-tab-bar
            data-morph-chrome
            className="pointer-events-auto mx-auto flex max-w-md items-center rounded-full p-1 text-(--tab-fg)"
          >
            {tabs.map((t) => {
              const on = active(t.href, t.exact);
              const Icon = t.icon;
              return (
                <li key={t.href} className="min-w-0 flex-1">
                  <Link
                    href={t.href}
                    aria-current={on ? 'page' : undefined}
                    className={`relative flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-transform duration-100 motion-safe:active:scale-[0.94] ${
                      on ? 'bg-sky/14 text-(--tab-on)' : 'text-(--tab-off)'
                    }`}
                  >
                    {t.plus ? (
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-sky text-white">
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                    ) : (
                      <Icon className="h-[22px] w-[22px]" />
                    )}
                    {!t.plus && t.label}
                    {t.badge ? (
                      <span className="absolute top-1.5 right-[calc(50%-18px)] rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                        {t.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** 싱커 앱에서 뺀 덕아웃 화면(장터 · 경기 일정 · 검색 …)에 알림 · 링크로 왔을 때 */
function SinkerAway() {
  return (
    <div className="space-y-4 rounded-2xl bg-surface-2 px-(--block-pad) py-10 text-center">
      <p className="text-base font-semibold text-ink">이 화면은 덕아웃에서 볼 수 있어요</p>
      <p className="text-sm text-muted">장터 · 경기 일정은 PC 나 덕아웃 앱에서 열어 주세요.</p>
      <Link
        href="/?dugout=1"
        className="inline-flex min-h-10 items-center rounded-full bg-sky px-5 text-sm font-semibold text-white"
      >
        덕아웃 홈으로
      </Link>
    </div>
  );
}
