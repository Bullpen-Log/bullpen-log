'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { RoundChat, RoundHome, RoundMarket, RoundPlus, RoundUser } from '@/components/round-icon';
import { DugoutTopBar } from '@/components/dugout/dugout-topbar';
import { MorphIn } from '@/components/shell-morph';
import { DugoutAppBridge } from '@/components/app-shell/expo-tabs';
import { inSinkerDugout } from '@/lib/sinker-dugout';
import type { Surface } from '@/lib/app-env';

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
  surface = 'web',
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
   * 어느 얼굴 안인가(서버가 이름표로 가린 값, lib/app-env.ts surfaceOf) — 바깥 틀에 data-surface 로 단다.
   * 'sinker-app'(싱커 앱의 덕아웃 탭, 2026-10-24 김민: "싱커와 연관 있는 것만 · 따로 노는 느낌 말고 이어진 느낌 · 덕아웃 정체성은 그대로"):
   * 위 막대는 가볍게(slim — 첫 칠부터 서 있고 하위 화면은 '‹ 뒤로'), 싱커에 없어도 되는 화면(장터 · 경기 일정 · 검색 …)은 안내로 바꾼다(lib/sinker-dugout.ts).
   * 2026-10-27 김민 "같은 앱 안에서 활동 공간만 바뀐 느낌": 바탕 · 카드 · 행동색 · 조작 크기를 싱커(native/src/lib/design-tokens.ts)에 맞춘다 —
   * 회색 바탕 · 흰 카드 · 파란 행동, 덕아웃 초록은 로고에만(globals.css '싱커 앱 안의 덕아웃'). 덕아웃 웹 · 덕아웃 앱은 예전 그대로.
   */
  surface?: Surface;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const sinkerApp = surface === 'sinker-app';
  const tabs = [
    { href: native ? '/?dugout=1' : '/', label: '홈', icon: RoundHome, exact: true },
    { href: '/market', label: '장터', icon: RoundMarket },
    { href: '/market/new', label: '올리기', icon: RoundPlus, plus: true },
    { href: '/chat', label: '채팅', icon: RoundChat, badge: unread },
    { href: '/me', label: '마이', icon: RoundUser },
  ];
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href.split('?')[0] : pathname === href || pathname.startsWith(`${href}/`);

  return (
    /* 덕아웃은 흰 면 하나(2026-10-24 UI 통일 — 홈 · 장터만 흰 판을 덮던 것을 틀이 준다, docs/designs/dugout-ui-audit.md) */
    <div
      data-safe-area
      data-brand="dugout"
      data-surface={surface}
      className={`flex min-h-[var(--vvh,100dvh)] flex-col text-ink ${sinkerApp ? 'bg-page' : 'bg-surface'}`}
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
        /* 바깥 틀(.dugout-frame — 본문 1160 · 거터 48/32/24/16, globals.css) — 위 막대와 같은 축. 큰 화면은 막대 밑 24px 에서 바로 내용이 시작한다 */
        className={`dugout-frame flex-1 ${sinkerApp ? 'pt-4 pb-(--dugout-end)' : 'pt-5 pb-28 md:pt-8 md:pb-16 lg:pt-6'}`}
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
/**
 * 싱커 앱 안 덕아웃에서 열지 않는 화면(lib/sinker-dugout.ts 밖 — 장터 · 장비 · 경기 · 뉴스 · 통합검색 · 장터 결제). 알림 · 공유 링크로 들어와도
 * 무엇이 왜 안 열리는지와 돌아갈 길을 준다. 계정 · 자료는 같아 덕아웃 앱 · PC 에서 그대로 열린다(덕아웃 앱은 주소로 바로 열기를 아직 못 받는다).
 */
function SinkerAway() {
  const router = useRouter();
  return (
    <div className="space-y-4 rounded-2xl bg-surface px-(--block-pad) py-8 text-center">
      <p className="text-[17px] font-semibold text-ink">이 화면은 싱커에서 열지 않아요</p>
      <p className="text-[15px] text-muted">
        장터 · 장비 · 경기 일정 · 뉴스 · 통합검색은 덕아웃 앱이나 PC 의 덕아웃에서 같은 계정으로 열어 주세요. 장터 거래 대화는 알림 · 마이에서 그대로 볼 수 있어요.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => (history.length > 1 ? router.back() : router.replace('/?dugout=1'))}
          className="inline-flex min-h-11 items-center rounded-full bg-ink/6 px-5 text-[15px] font-semibold text-ink"
        >
          돌아가기
        </button>
        <Link href="/?dugout=1" className="inline-flex min-h-11 items-center rounded-full bg-sky px-5 text-[15px] font-semibold text-white">
          덕아웃 홈으로
        </Link>
      </div>
    </div>
  );
}
