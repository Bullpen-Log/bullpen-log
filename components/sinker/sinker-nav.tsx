'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** 내 싱커(PC)의 작은 메뉴(2026-10-21 개편 4단계, docs/designs/sinker-dugout.md 5-3) — 대시보드 · 기록 표 · 영상 · 리포트 · 연결 */
const ITEMS = [
  { href: '/sinker', label: '대시보드', exact: true },
  { href: '/sinker/log', label: '기록 표' },
  { href: '/videos', label: '영상' },
  { href: '/coach', label: '리포트' },
  { href: '/sinker/sharing', label: '연결' },
];

export function SinkerNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="내 싱커"
      className="flex flex-wrap items-center gap-1 border-b border-line pb-2"
    >
      {ITEMS.map((it) => {
        const on = it.exact
          ? pathname === it.href
          : pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? 'page' : undefined}
            className={`min-h-9 rounded-lg px-3 text-sm font-semibold leading-9 transition-colors ${
              on
                ? 'bg-sky/12 text-sky-strong'
                : 'text-muted hover:bg-ink/5 hover:text-ink'
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
