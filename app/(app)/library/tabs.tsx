'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BookOpen } from 'lucide-react';

const TABS = [
  {
    href: '/library/training',
    label: '운동 영상',
    desc: '근력·모빌리티·회복 운동',
    icon: Activity,
  },
  {
    href: '/library/mechanics',
    label: '투구 드릴',
    desc: '투구 동작 교정 드릴',
    icon: BookOpen,
  },
] as const;

export function LibraryTabs() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
      {TABS.map(({ href, label, desc, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 px-5 py-4 transition-colors ${
              active ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2/60'
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                active
                  ? 'border-sky-soft/60 bg-sky/10 text-sky'
                  : 'border-line-strong text-muted'
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-bold ${active ? 'text-sky' : 'text-ink'}`}
              >
                {label}
              </span>
              <span className="mt-0.5 block text-xs text-muted">{desc}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
