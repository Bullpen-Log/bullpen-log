'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from '@/components/icon';
import { Wordmark } from '@/components/logo';

/**
 * 덕아웃 위 막대(2026-10-21 2단계, docs/designs/sinker-dugout.md 5-1) — 웹사이트 전체의 공용 머리. 덕아웃 바깥 공간(components/dugout/dugout-shell) ·
 * PC 브라우저의 선수 화면(app/(app)/layout.tsx, 싱커 앱 웹뷰에서는 안 그림) · 관리(app/(master)/layout.tsx) 모두 이것 하나를 맨 위에 둔다.
 * 오른쪽의 '내 싱커'(/today)는 싱커를 쓰는 사람에게, '관리'(/manage)는 팀 · 레슨장 계정 · 관리자에게. `current` 는 그 둘 중 지금 있는 곳.
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
}: {
  user: { nickname: string } | null;
  unread?: number;
  /** 안 읽은 알림(lib/notify.ts countUnreadNotifications) */
  alerts?: number;
  /** 싱커(선수 기록)를 쓰는 사람인가 — 아니면 '내 싱커' 대신 아무것도 */
  sinker?: boolean;
  /** 팀 · 레슨장 관리 계정 · 관리자인가 */
  manage?: boolean;
  current?: 'sinker' | 'manage' | null;
  sticky?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const inDugout = current === null;
  const nav = [
    { href: '/', label: '홈', exact: true },
    ...(user ? [{ href: '/#talk', label: '커뮤니티' }] : []),
    { href: '/market', label: '장터' },
    { href: '/lessons', label: '레슨' },
    { href: '/venues', label: '연습장' },
    { href: '/gear', label: '장비' },
    { href: '/chat', label: '채팅', badge: unread },
    ...(user ? [{ href: '/notifications', label: '알림', badge: alerts }] : []),
  ];
  const active = (href: string, exact?: boolean) =>
    inDugout &&
    (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const item = (on: boolean) =>
    `relative flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold transition-colors ${
      on ? 'bg-sky/12 text-sky-strong' : 'text-muted hover:bg-ink/5 hover:text-ink'
    }`;
  const side = (on: boolean) =>
    `flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition-colors ${
      on ? 'bg-ink text-white' : 'border border-line text-ink hover:border-sky-soft'
    }`;

  return (
    <header
      data-brand="dugout"
      className={`${sticky ? 'sticky top-0' : ''} z-20 border-b border-line bg-surface/90 backdrop-blur ${className}`}
    >
      <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center gap-3 px-4 md:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <Wordmark brand="dugout" className="text-2xl text-ink" />
        </Link>
        <nav aria-label="덕아웃" className="ml-4 hidden items-center gap-1 md:flex">
          {nav.map((t) => {
            const on = active(t.href, t.exact);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className={item(on)}
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
          {inDugout && (
            <Link
              href="/market/new"
              className="hidden min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink transition-colors hover:border-sky-soft md:flex"
            >
              <Plus className="h-4 w-4" /> 물건 올리기
            </Link>
          )}
          {user ? (
            <>
              {sinker && (
                <Link
                  href="/sinker"
                  aria-current={current === 'sinker' ? 'page' : undefined}
                  className={side(current === 'sinker')}
                >
                  내 싱커
                </Link>
              )}
              {manage && (
                <Link
                  href="/manage"
                  aria-current={current === 'manage' ? 'page' : undefined}
                  className={side(current === 'manage')}
                >
                  관리
                </Link>
              )}
              {!sinker && !manage && (
                <Link href="/me" className={side(false)}>
                  {user.nickname}
                </Link>
              )}
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
                className="flex min-h-10 items-center rounded-xl bg-sky px-3.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
              >
                시작하기
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
