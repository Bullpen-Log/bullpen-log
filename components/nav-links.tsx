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
    <nav className="hidden items-center gap-1 md:flex">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive(item.href) ? 'text-gold' : 'text-muted hover:text-cream'
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
 * 헤더의 가로 메뉴가 md 미만에서 숨겨지므로 그 자리를 대신한다.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      {/* 관리자에게는 항목이 하나 더 늘어나므로 개수에 맞춰 나눈다. */}
      <div className="flex">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 items-center justify-center px-1 py-3.5 text-center text-xs transition-colors ${
              isActive(item.href) ? 'text-gold' : 'text-muted'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
