import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * 덕아웃 묶음 제목(홈의 '방금 올라온 물건' 머리를 꺼낸 것, 2026-10-24 UI 통일) — 윗글(13 회색) · 제목 20 굵게 · 수 · 오른쪽 '더보기 ›' 또는 다른 단추.
 * 화면 안의 모든 묶음이 이것으로 시작한다.
 */
export function SectionHead({
  title,
  kicker,
  count,
  href,
  more = '더보기 ›',
  action,
  as: Tag = 'h2',
}: {
  title: ReactNode;
  kicker?: ReactNode;
  count?: number;
  href?: string;
  more?: string;
  action?: ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker && <p className="text-[13px] text-muted">{kicker}</p>}
        <Tag className="mt-0.5 text-xl font-bold text-ink">
          {title}
          {count != null && <span className="ml-1.5 text-base font-semibold text-muted tabular-nums">{count}</span>}
        </Tag>
      </div>
      {action ??
        (href && (
          <Link href={href} className="shrink-0 text-sm text-muted hover:text-ink">
            {more}
          </Link>
        ))}
    </div>
  );
}
