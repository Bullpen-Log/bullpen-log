import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * 덕아웃 칩(장터의 거르기 칩, 2026-10-24 UI 통일) — 고르면 검은 알약(어두운 테마에서도 읽히게 text-page), 안 고르면 테두리.
 * 초록은 고른 칩에 쓰지 않는다(주요 단추 · 상태 · 링크만). 주소로 거르는 칩은 ChipLink — 같은 화면에서 값만 바뀌니 굴린 자리를 지킨다.
 */
export function chipClass(on: boolean, size: 'sm' | 'md' = 'sm'): string {
  return `inline-flex ${size === 'md' ? 'min-h-9 px-3.5' : 'min-h-8 px-3'} shrink-0 items-center justify-center gap-1 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
    on ? 'bg-ink text-page' : 'border border-line text-ink hover:border-ink/40'
  }`;
}

export function ChipLink({
  href,
  on,
  children,
  size,
  keepScroll = true,
}: {
  href: string;
  on: boolean;
  children: ReactNode;
  size?: 'sm' | 'md';
  /** 같은 화면에서 값만 바뀌는 칩이면 true(굴린 자리 지킴 · 밀기 연출 없음) */
  keepScroll?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      {...(keepScroll ? { scroll: false, 'data-nav': 'none' } : {})}
      className={chipClass(on, size)}
    >
      {children}
    </Link>
  );
}

/** 칩 한 줄 — 휴대폰은 옆으로 밀고, PC 는 줄을 넘긴다 */
export function ChipRow({ children, label, className = '' }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={`no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 ${className}`}
    >
      {children}
    </div>
  );
}
