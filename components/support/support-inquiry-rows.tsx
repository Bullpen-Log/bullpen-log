import Link from 'next/link';
import { MessageCircle } from '@/components/icon';
import { Badge } from '@/components/ui';
import { inquiryCategoryLabel, type InquiryStatusKey } from '@/lib/support';
import { SupportStatusBadge } from './support-status-badge';
import { formatSupportDate } from './support-format';

export type SupportInquiryRow = {
  id: string;
  title: string;
  category: string;
  status: InquiryStatusKey;
  createdAt: Date;
  replyCount: number;
  /** 관리자 목록만 — 누가 물었나 */
  nickname?: string;
};

/**
 * 1:1 문의 줄 목록 — 내 문의(첫 화면 5개 · 전체) · 관리자가 같은 줄을 쓴다. 상태 알약 · 종류 · 날짜 · 답글 수.
 * 카드 안에 들어가면 bordered 를 끄고 카드의 테두리를 쓴다.
 */
export function SupportInquiryRows({
  rows,
  bordered = true,
}: {
  rows: SupportInquiryRow[];
  bordered?: boolean;
}) {
  return (
    <ul
      className={`divide-y divide-line ${
        bordered ? 'overflow-hidden rounded-2xl border border-line bg-surface' : ''
      }`}
    >
      {rows.map((q) => (
        <li key={q.id}>
          <Link
            href={`/support/inquiries/${q.id}`}
            className={`group flex flex-col gap-2 py-4 transition-colors active:bg-ink/6 desk:hover:bg-surface-2 ${
              bordered ? 'px-5' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="line-clamp-2 text-sm font-semibold text-ink transition-colors group-hover:text-sky">
                {q.title}
              </span>
              <SupportStatusBadge status={q.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
              <Badge>{inquiryCategoryLabel(q.category)}</Badge>
              {q.nickname && <span className="text-ink">{q.nickname}</span>}
              <span>{formatSupportDate(q.createdAt)}</span>
              {q.replyCount > 0 && (
                <span className="flex items-center gap-1">
                  <MessageCircle aria-hidden className="h-3.5 w-3.5" />
                  {q.replyCount}
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
