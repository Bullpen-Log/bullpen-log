import Link from 'next/link';
import { ChevronRight, Pencil, Pin } from '@/components/icon';
import { formatSupportDate } from './support-format';

export type SupportNoticeRow = {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: Date;
};

/**
 * 공지 줄 목록 — 고객센터 첫 화면(3개) · 공지 전체 · 관리자가 같은 줄을 쓴다.
 * 고정 공지는 핀 그림으로 가른다. 카드 안에 들어가면 bordered 를 끄고 카드의 테두리를 쓴다.
 */
export function SupportNoticeRows({
  rows,
  bordered = true,
  /** 관리자 목록 — 줄 끝에 '수정' 단추 */
  editable = false,
}: {
  rows: SupportNoticeRow[];
  bordered?: boolean;
  editable?: boolean;
}) {
  return (
    <ul
      className={`divide-y divide-line ${
        bordered ? 'overflow-hidden rounded-2xl border border-line bg-surface' : ''
      }`}
    >
      {rows.map((n) => (
        <li key={n.id} className="flex items-stretch">
          <Link
            href={`/support/notices/${n.id}`}
            className={`group flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3 transition-colors active:bg-ink/6 desk:hover:bg-surface-2 ${
              bordered ? 'px-5' : ''
            }`}
          >
            {n.pinned && <Pin aria-hidden className="h-4 w-4 shrink-0 text-sky" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink transition-colors group-hover:text-sky">
                {n.title}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {formatSupportDate(n.createdAt)}
              </span>
            </span>
            {!editable && (
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted/60" />
            )}
          </Link>
          {editable && (
            <Link
              href={`/admin/support/notices/${n.id}/edit`}
              aria-label={`${n.title} 수정`}
              className={`flex items-center gap-1 text-xs font-semibold text-sky transition-colors active:bg-ink/6 desk:hover:bg-surface-2 ${
                bordered ? 'px-5' : 'pl-3'
              }`}
            >
              <Pencil aria-hidden className="h-3.5 w-3.5" />
              수정
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
