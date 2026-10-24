import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

/**
 * 기능 바로가기 줄(장터의 '찜 · 내 물건 팔기 …' 줄, 2026-10-24 UI 통일) — 72px 둥근 네모(rounded-[22px]) 안에 채운 아이콘 · 밑에 13 굵은 이름.
 * '기능으로 가기'에 쓴다. 휴대폰은 옆으로 밀고, PC 는 가운데 정렬. 이름 밑 작은 수(count)는 있을 때만.
 */
export type Shortcut = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** 이름 밑 작은 글(코치 3명 같은 것) */
  sub?: string;
  scroll?: boolean;
};

export function ShortcutTiles({ items, label = '바로가기', className = '' }: { items: Shortcut[]; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={`no-scrollbar -mx-4 flex justify-start gap-4 overflow-x-auto px-4 md:mx-0 md:justify-center md:gap-8 md:px-0 ${className}`}>
      {items.map((s) => {
        const I = s.icon;
        return (
          <Link key={s.label} href={s.href} scroll={s.scroll} className="group flex w-20 shrink-0 flex-col items-center gap-2">
            <span className="grid h-[72px] w-[72px] place-items-center rounded-[22px] bg-surface-2 text-sky transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none">
              <I className="h-9 w-9" {...({ filled: true } as object)} />
            </span>
            <span className="text-[13px] font-semibold whitespace-nowrap text-ink">{s.label}</span>
            {s.sub && <span className="-mt-1.5 text-[11px] text-muted">{s.sub}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
