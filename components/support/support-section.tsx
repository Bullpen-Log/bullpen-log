import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from '@/components/icon';

/**
 * 고객센터 첫 화면의 카드 머리 — 왼쪽에 그림 + 제목, 오른쪽에 '모두 보기'(아이폰 설정 묶음의 머리처럼).
 * 카드마다 머리를 손으로 그리면 그림 크기 · 글자 굵기가 조금씩 어긋나서 한 곳에 둔다.
 */
export function SupportSectionHead({
  icon: Icon,
  title,
  count,
  moreHref,
  moreLabel = '모두 보기',
  action,
}: {
  icon: LucideIcon;
  title: string;
  /** 제목 옆 작은 수 — 문의 몇 건처럼 */
  count?: number;
  /** 오른쪽 '모두 보기' 링크 — 없으면 action 만 */
  moreHref?: string;
  moreLabel?: string;
  /** 링크 대신 둘 단추(문의하기) */
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <Icon aria-hidden className="h-4.5 w-4.5 text-sky" />
        {title}
        {count !== undefined && count > 0 && (
          <span className="text-numeric text-sm font-medium text-muted">{count}</span>
        )}
      </h2>
      <div className="flex shrink-0 items-center gap-2">
        {moreHref && (
          <Link
            href={moreHref}
            className="flex min-h-10 items-center gap-0.5 rounded-full px-2 text-sm font-semibold text-sky transition-colors active:bg-ink/6 desk:hover:bg-surface-2"
          >
            {moreLabel}
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        )}
        {action}
      </div>
    </div>
  );
}
