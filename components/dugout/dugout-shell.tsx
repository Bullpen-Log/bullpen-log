'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { House, MessagesSquare, Plus, Tag, UserRound } from '@/components/icon';
import { Wordmark } from '@/components/logo';

/**
 * 덕아웃 껍데기(2026-10-20, docs/designs/baseball-hub.md) — 로그인 없이 보는 야구인의 공간. 선수 껍데기(components/app-shell)와 별개.
 * PC: 위 막대(이름 · 홈 · 장터 · 채팅 · 내 것 · 로그인/내 불펜로그). 휴대폰: 위 막대는 이름만, 아래 탭 다섯(홈 · 장터 · 올리기 · 채팅 · 내 것).
 * 로그인한 사람에게는 '내 불펜로그'(/today) 로 가는 길이 늘 오른쪽 위에 있다 — 덕아웃은 밖, 불펜로그는 안.
 */
export function DugoutShell({
  user,
  unread,
  children,
}: {
  user: { nickname: string } | null;
  unread: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const tabs = [
    { href: '/dugout', label: '홈', icon: House, exact: true },
    { href: '/dugout/market', label: '장터', icon: Tag },
    { href: '/dugout/market/new', label: '올리기', icon: Plus, plus: true },
    { href: '/dugout/chat', label: '채팅', icon: MessagesSquare, badge: unread },
    { href: '/dugout/me', label: '내 것', icon: UserRound },
  ];
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div
      data-safe-area
      className="flex min-h-[var(--vvh,100dvh)] flex-col bg-page text-ink"
    >
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center gap-3 px-4 md:px-6">
          <Link href="/dugout" className="flex items-baseline gap-2">
            <span className="text-xl font-black tracking-tight text-ink">덕아웃</span>
            <span className="hidden items-baseline gap-1 text-[11px] text-muted sm:inline-flex">
              by <Wordmark className="text-xs text-muted" />
            </span>
          </Link>
          <nav aria-label="덕아웃" className="ml-4 hidden items-center gap-1 md:flex">
            {tabs
              .filter((t) => !t.plus)
              .map((t) => {
                const on = active(t.href, t.exact);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={on ? 'page' : undefined}
                    className={`relative flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold transition-colors ${
                      on
                        ? 'bg-sky/12 text-sky-strong'
                        : 'text-muted hover:bg-ink/5 hover:text-ink'
                    }`}
                  >
                    {t.label}
                    {t.badge ? (
                      <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                        {t.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/dugout/market/new"
              className="hidden min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink transition-colors hover:border-sky-soft md:flex"
            >
              <Plus className="h-4 w-4" /> 물건 올리기
            </Link>
            {user ? (
              <Link
                href="/today"
                className="flex min-h-10 items-center gap-1.5 rounded-xl bg-sky px-3.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
              >
                내 불펜로그
              </Link>
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
                  className="flex min-h-10 items-center rounded-xl bg-sky px-3.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
                >
                  시작하기
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

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
