'use client';

import Link from 'next/link';
import { NAV_ICONS } from '@/components/nav-icons';
import { usePathname } from 'next/navigation';
import type { NavGroup, NavItem } from '@/lib/nav';
import { BaseballMark } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * 현재 위치 판정. 하위 경로도 같은 메뉴로 본다.
 * 단 '/'로 시작하는 다른 메뉴를 잘못 물지 않게 정확히 비교한다.
 */
function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** PC 왼쪽 고정 사이드바 */
export function Sidebar({
  groups,
  nickname,
  isAdmin,
}: {
  groups: NavGroup[];
  nickname: string;
  isAdmin: boolean;
}) {
  const isActive = useIsActive();

  return (
    <aside
      /*
       * 화면이 바뀌어도 사이드바는 가만히 있는다.
       *
       * 이름을 달아 두면 전환에서 본문과 따로 다뤄진다(app/globals.css 의
       * ::view-transition-group). 이름이 없으면 사이드바까지 본문과 한 장에
       * 같이 찍혀서 틀 전체가 함께 깜빡인다.
       */
      style={{ viewTransitionName: 'shell-sidebar' }}
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface lg:flex"
    >
      <Link
        href="/today"
        className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5"
      >
        <BaseballMark className="h-9 w-9" />
        <span className="text-display text-lg leading-none text-ink">BULLPEN LOG</span>
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group, gi) => (
          <div key={group.title ?? `g${gi}`} className="space-y-1">
            {group.title && (
              <p className="px-3 pb-1 text-[11px] font-semibold tracking-normal text-muted">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  /*
                   * duration-75 는 강조가 옮겨가는 속도다. 기본값(150ms)으로는
                   * 누른 메뉴에 색이 천천히 번져서, 이미 옮겨갔는데도 아직
                   * 안 옮겨간 것처럼 보인다. 주소는 재보니 20ms 만에 바뀐다.
                   *
                   * 파란 알약을 따로 떼어내 메뉴 사이를 미끄러지게 해 봤는데
                   * 되돌렸다. 이름표를 단 요소는 전환 중에 딴 층으로 빠져 위에
                   * 그려지는데, 알약은 글자만 한 불투명한 면이라 지나가는 자리의
                   * 글자를 덮었다. 그보다 나쁜 것은 도착 전의 메뉴였다 — 흰 글자만
                   * 먼저 자리에 놓이고 배경이 아직 안 와서, 흰 바탕에 흰 글자가
                   * 되어 0.2초쯤 글자가 사라졌다.
                   *
                   * 하단 탭의 막대는 같은 방식이어도 괜찮다. 2px 짜리 선이라
                   * 덮을 글자가 없다.
                   */
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-75 ${
                    active
                      ? 'bg-sky text-white font-semibold'
                      : 'text-ink hover:bg-surface-2 active:bg-surface-2'
                  }`}
                >
                  <Icon
                    aria-hidden
                    className="h-[1.125rem] w-[1.125rem] shrink-0"
                    strokeWidth={active ? 2.4 : 1.9}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line px-3 py-3">
        <ThemeToggle />
      </div>

      <Link
        href="/profile"
        className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-4 transition-colors duration-75 hover:bg-surface-2 active:bg-surface-2"
      >
        <Avatar nickname={nickname} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">
            {nickname}
          </span>
          <span className="block text-xs text-muted">
            {isAdmin ? '관리자' : '내 정보'}
          </span>
        </span>
      </Link>
    </aside>
  );
}

/** 이름 첫 글자를 딴 동그란 아바타 */
function Avatar({ nickname, size = 'md' }: { nickname: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-sky font-bold text-white ${
        size === 'lg' ? 'h-14 w-14 text-xl' : 'h-9 w-9 text-sm'
      }`}
    >
      {nickname.slice(0, 1)}
    </span>
  );
}

/** 모바일 상단 바 — 로고와 내 정보만 둔다 (메뉴는 아래 탭에 있다) */
export function MobileTopBar({ nickname }: { nickname: string }) {
  return (
    <header
      /* 사이드바와 같은 이유로 전환에서 뺀다. */
      style={{ viewTransitionName: 'shell-topbar' }}
      className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-xl lg:hidden"
    >
      <Link href="/today" className="flex items-center gap-2">
        <BaseballMark className="h-8 w-8" />
        <span className="text-display text-base leading-none text-ink">
          BULLPEN LOG
        </span>
      </Link>
      <Link href="/profile" className="ml-auto" aria-label="내 정보">
        <Avatar nickname={nickname} />
      </Link>
    </header>
  );
}

/** 모바일 하단 탭바 */
export function MobileTabs({ tabs }: { tabs: NavItem[] }) {
  const isActive = useIsActive();

  return (
    <nav
      /* 본문이 바뀌는 동안 탭바는 움직이지 않는다. */
      style={{ viewTransitionName: 'shell-tabbar' }}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="flex">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          const Icon = NAV_ICONS[tab.icon];
          return (
            <Link
              key={tab.href}
              href={tab.href}
              /*
               * 휴대폰에서 가장 많이 눌리는 자리다. 눌렀을 때 살짝 작아지고
               * 색이 바뀌게 해서, 화면이 바뀌기 전에 먼저 대답하게 한다.
               * 움직임을 줄여 쓰는 사람에게는 크기 변화 없이 색만 바뀐다.
               */
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-[color,transform] duration-75 motion-safe:active:scale-90 ${
                active ? 'font-semibold text-sky' : 'text-muted active:text-sky'
              }`}
            >
              {/*
               * 지금 어느 탭인지 알려주는 짧은 막대.
               *
               * 화면에 한 번에 하나만 있고 이름이 같아서, 탭을 옮기면 브라우저가
               * 사라졌다 나타나는 대신 옛 자리에서 새 자리로 미끄러뜨린다.
               * 색만 바뀌던 때보다 '옮겨갔다'는 것이 훨씬 분명해진다.
               *
               * 색은 이미 글자와 아이콘이 알려주므로 이 막대는 장식이다.
               * 읽어 줄 필요가 없어 aria-hidden 을 단다.
               */}
              {active && (
                <span
                  aria-hidden
                  style={{ viewTransitionName: 'tab-indicator' }}
                  className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-sky"
                />
              )}
              <Icon aria-hidden className="h-5 w-5" strokeWidth={active ? 2.4 : 1.9} />
              {tab.short ?? tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
