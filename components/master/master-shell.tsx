'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, LogOut, Megaphone, X } from '@/components/icon';
import { RoundHome, RoundLesson, RoundLog, RoundMenu, RoundPeople, RoundSettings, RoundShield, RoundVenue } from '@/components/round-icon';
import { Wordmark } from '@/components/logo';
import { chooseOrg } from '@/app/actions/org';
import { logout } from '@/app/actions/auth';
import { ORG_KIND_LABEL, ORG_WORDS, type OrgKind } from '@/lib/org/rules';

/**
 * 팀 · 레슨장 마스터 화면의 껍데기(app/(master)/layout.tsx) — 선수 화면의 껍데기(components/app-shell)와 아예 별개다(2026-10-20 사용자:
 * "관리기능 초점으로 인터페이스를 아예 바꾸고"). PC 가 먼저: 왼쪽 메뉴 · 위 막대(조직 고르개 · 관리자는 '선수 화면으로') · 내용.
 * 휴대폰: 메뉴가 위 막대의 단추로 접힌다.
 *
 * 메뉴 항목은 조직 종류(레슨장 · 팀)에 따라 말이 다르다 — 회원 / 선수단. 아직 없는 화면(일정 · 공지 · 대신 기록)은 다음 단계에서 더한다.
 */
export type ShellOrg = { id: string; kind: OrgKind; name: string };

export function MasterShell({
  user,
  org,
  orgs,
  children,
}: {
  user: { nickname: string; isAdmin: boolean };
  org: ShellOrg | null;
  orgs: ShellOrg[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  /* 휴대폰 메뉴 — 항목을 누르면 접는다(아래 onClick). 화면이 바뀌어도 열려 있지 않게 */
  const [open, setOpen] = useState(false);

  const words = org ? ORG_WORDS[org.kind] : ORG_WORDS.TEAM;
  const items: { href: string; label: string; icon: typeof RoundHome; exact?: boolean }[] =
    [
      { href: '/manage', label: '홈', icon: RoundHome, exact: true },
      { href: '/manage/players', label: `${words.members} 관리`, icon: RoundPeople },
      {
        href: '/manage/calendar',
        label: org?.kind === 'LESSON' ? '레슨 시간표' : '팀 달력',
        icon: CalendarDays,
      },
      {
        href: '/manage/record',
        label: org?.kind === 'LESSON' ? '대신 기록' : '경기 투구수',
        icon: RoundLog,
      },
      ...(org?.kind === 'LESSON'
        ? [{ href: '/manage/bookings', label: '레슨 요청', icon: RoundLesson }]
        : []),
      { href: '/manage/venues', label: '장소 · 예약', icon: RoundVenue },
      { href: '/manage/notices', label: '공지', icon: Megaphone },
      { href: '/manage/payouts', label: '정산', icon: CalendarDays },
      { href: '/manage/settings', label: '설정 · 초대', icon: RoundSettings },
    ];
  if (user.isAdmin)
    items.push({ href: '/manage/orgs', label: '모든 조직(관리자)', icon: RoundShield });

  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <nav aria-label="관리 메뉴" className="flex flex-col gap-1">
      {items.map((it) => {
        const on = active(it.href, it.exact);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? 'page' : undefined}
            onClick={() => setOpen(false)}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
              on
                ? 'bg-sky/12 text-sky-strong'
                : 'text-muted hover:bg-ink/5 hover:text-ink'
            }`}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div data-safe-area data-brand="dugout" className="flex min-h-[var(--vvh,100dvh)] bg-page text-ink">
      {/* 왼쪽 메뉴 — PC 만 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 md:flex">
        <Link href="/manage" className="flex items-center gap-2 px-2">
          <Wordmark brand="dugout" className="text-lg text-ink" />
          <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[11px] font-semibold text-muted">
            관리
          </span>
        </Link>
        <div className="mt-6 flex-1">{nav}</div>
        <p className="px-2 text-xs text-muted/70">{user.nickname}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 위 막대 — 조직 고르개 · 선수 화면으로(관리자) · 로그아웃 */}
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-ink/5 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <RoundMenu className="h-5 w-5" />}
          </button>

          <OrgSwitcher org={org} orgs={orgs} />

          <div className="ml-auto flex items-center gap-1">
            {user.isAdmin && (
              <Link
                href="/today"
                className="hidden min-h-10 items-center rounded-xl px-3 text-sm font-medium text-muted hover:bg-ink/5 hover:text-ink sm:flex"
              >
                선수 화면으로
              </Link>
            )}
            <form action={logout}>
              <button
                type="submit"
                className="flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted hover:bg-ink/5 hover:text-ink"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            </form>
          </div>
        </header>

        {/* 휴대폰 메뉴 — 위 막대 아래로 펴진다 */}
        {open && (
          <div className="border-b border-line bg-surface px-4 py-3 md:hidden motion-safe:animate-fade-in">
            {nav}
            {user.isAdmin && (
              <Link
                href="/today"
                onClick={() => setOpen(false)}
                className="mt-2 flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted hover:bg-ink/5"
              >
                선수 화면으로
              </Link>
            )}
          </div>
        )}

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

/** 지금 보는 조직 — 둘 이상이면 눌러서 바꾼다(쿠키, app/actions/org.ts chooseOrg) */
function OrgSwitcher({ org, orgs }: { org: ShellOrg | null; orgs: ShellOrg[] }) {
  if (!org) return <p className="text-sm font-semibold text-muted">조직 없음</p>;
  const label = (
    <>
      <span className="rounded-md bg-sky/12 px-1.5 py-0.5 text-[11px] font-semibold text-sky-strong">
        {ORG_KIND_LABEL[org.kind]}
      </span>
      <span className="truncate text-sm font-bold text-ink">{org.name}</span>
    </>
  );
  if (orgs.length < 2)
    return <div className="flex min-w-0 items-center gap-2 px-1">{label}</div>;
  return (
    <details className="relative min-w-0">
      <summary className="flex min-h-10 min-w-0 cursor-pointer list-none items-center gap-2 rounded-xl px-2 hover:bg-ink/5 [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-lg motion-safe:animate-fade-in">
        {orgs.map((o) => (
          <form key={o.id} action={chooseOrg}>
            <input type="hidden" name="orgId" value={o.id} />
            <button
              type="submit"
              aria-current={o.id === org.id ? 'true' : undefined}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-ink/5 ${
                o.id === org.id ? 'font-bold text-sky-strong' : 'text-ink'
              }`}
            >
              <span className="rounded-md bg-ink/6 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                {ORG_KIND_LABEL[o.kind]}
              </span>
              <span className="truncate">{o.name}</span>
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}
