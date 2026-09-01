import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { ReportSummary } from '@/lib/report/history';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-03 → 8월 3일 (월) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

/**
 * 지난 리포트 — 날짜와 한 줄 요약만.
 *
 * 리포트 한 편은 길다. 목록에 내용까지 펼치면 무엇을 보러 온 화면인지
 * 흐려지므로, 그때 뭐라고 했는지 한 줄만 보이고 나머지는 눌러서 본다.
 * 투구 일지·트레이닝 기록과 같은 방식이다 — 목록에서 고르고 페이지로 간다.
 */
export function PastReports({ reports }: { reports: ReportSummary[] }) {
  if (reports.length === 0) return null;

  return (
    <section>
      <h2 className="px-1 text-xs font-semibold tracking-normal text-muted">
        지난 리포트
      </h2>

      <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
        {reports.map((r, i) => (
          <li key={r.asOf} className={i > 0 ? 'border-t border-line' : ''}>
            <Link
              href={`/coach/report/${r.asOf}`}
              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink">
                  {spokenDate(r.asOf)}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {r.halted ? (
                    <span className="inline-flex items-center gap-1 text-danger">
                      <AlertTriangle aria-hidden className="h-3 w-3" />
                      투구 계획을 내지 않은 날
                    </span>
                  ) : (
                    (r.headline ?? '내용을 읽을 수 없습니다')
                  )}
                </span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-line-strong" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
