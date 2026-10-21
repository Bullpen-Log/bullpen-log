'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { House, MessagesSquare, Plus, Tag, UserRound } from '@/components/icon';
import { DugoutTopBar } from '@/components/dugout/dugout-topbar';

/**
 * 덕아웃 껍데기(2026-10-20, docs/designs/baseball-hub.md) — 로그인 없이 보는 야구인의 공간. 선수 껍데기(components/app-shell)와 별개.
 * PC: 공용 위 막대(components/dugout/dugout-topbar.tsx — 2026-10-21 2단계부터 사이트 전체가 같은 막대). 휴대폰: 아래 탭 다섯(홈 · 장터 · 올리기 · 채팅 · 내 것).
 * 로그인한 사람에게는 '내 싱커'(/today) 로 가는 길이 늘 오른쪽 위에 있다 — 덕아웃은 밖, 싱커는 안(2026-10-21 이름, lib/brand.ts).
 */
export function DugoutShell({
  user,
  unread,
  sinker = false,
  manage = false,
  children,
}: {
  user: { nickname: string } | null;
  unread: number;
  sinker?: boolean;
  manage?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const tabs = [
    { href: '/', label: '홈', icon: House, exact: true },
    { href: '/market', label: '장터', icon: Tag },
    { href: '/market/new', label: '올리기', icon: Plus, plus: true },
    { href: '/chat', label: '채팅', icon: MessagesSquare, badge: unread },
    { href: '/me', label: '내 것', icon: UserRound },
  ];
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div
      data-safe-area
      data-brand="dugout"
      className="flex min-h-[var(--vvh,100dvh)] flex-col bg-page text-ink"
    >
      <DugoutTopBar user={user} unread={unread} sinker={sinker} manage={manage} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:px-6 md:pt-8 md:pb-16">
        {children}
      </main>

      {/* 휴대폰 아래 탭 */}
      <nav
        aria-label="덕아웃 탭"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {tabs.map((t) => {
            const on = active(t.href, t.exact);
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={on ? 'page' : undefined}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                    on ? 'text-sky-strong' : 'text-muted'
                  }`}
                >
                  {t.plus ? (
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-sky text-white shadow-md">
                      <Icon className="h-5 w-5" />
                    </span>
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                  {!t.plus && t.label}
                  {t.badge ? (
                    <span className="absolute top-2 right-[calc(50%-18px)] rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                      {t.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
