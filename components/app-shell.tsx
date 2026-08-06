'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavGroup, NavItem } from '@/lib/nav';
import { BaseballMark } from '@/components/logo';

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
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
      <Link
        href="/dashboard"
        className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5"
      >
        <BaseballMark className="h-9 w-9" />
        <span className="text-display text-lg leading-none text-ink">
          BULLPEN LOG
        </span>
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group, gi) => (
          <div key={group.title ?? `g${gi}`} className="space-y-1">
            {group.title && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {group.title}
              </p>
            )}
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-sky text-white font-semibold'
                    : 'text-ink hover:bg-surface-2'
                }`}
              >
                <span aria-hidden className="text-base leading-none">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <Link
        href="/profile"
        className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-4 transition-colors hover:bg-surface-2"
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
export function Avatar({
  nickname,
  size = 'md',
}: {
  nickname: string;
  size?: 'md' | 'lg';
}) {
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
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-xl lg:hidden">
      <Link href="/dashboard" className="flex items-center gap-2">
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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="flex">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                active ? 'font-semibold text-sky' : 'text-muted'
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
