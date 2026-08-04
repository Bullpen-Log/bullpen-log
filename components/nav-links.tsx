'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string };

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** 데스크탑용 가로 내비게이션 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();

  return (
    <nav className="hidden items-center gap-0.5 lg:flex">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-colors ${
            isActive(item.href) ? 'text-sky' : 'text-muted hover:text-ink'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * 모바일용 하단 고정 내비게이션.
 * 항목이 6~7개라 화면을 넘칠 수 있어 가로 스크롤을 허용한다.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="flex overflow-x-auto">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-w-[4.5rem] flex-1 items-center justify-center whitespace-nowrap px-2 py-3.5 text-center text-xs transition-colors ${
              isActive(item.href) ? 'text-sky' : 'text-muted'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
