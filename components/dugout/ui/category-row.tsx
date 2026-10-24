import Link from 'next/link';

/**
 * 목록 종류 줄(장터 품목 줄, 2026-10-24 UI 통일) — 굵은 큰 글 · 고른 칸 밑에 검은 줄 · 아래 가는 선. '목록의 종류 바꾸기'에 쓴다
 * (장터 품목 · 연습장 종류 · 경기 리그 · 레슨 종목). 휴대폰은 옆으로 민다. 같은 화면에서 값만 바뀌면 keepScroll.
 */
export type CategoryItem = { key: string; label: string; href: string; on: boolean };

export function CategoryRow({
  items,
  label,
  keepScroll = false,
  className = '',
}: {
  items: CategoryItem[];
  label: string;
  keepScroll?: boolean;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={`no-scrollbar -mx-4 flex items-center gap-7 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0 ${className}`}>
      {items.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          aria-current={c.on ? 'page' : undefined}
          {...(keepScroll ? { scroll: false, 'data-nav': 'none' } : {})}
          className={`relative flex min-h-12 shrink-0 items-center text-[17px] font-bold whitespace-nowrap transition-colors ${
            c.on ? 'text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink' : 'text-ink/70 hover:text-ink'
          }`}
        >
          {c.label}
        </Link>
      ))}
    </nav>
  );
}
