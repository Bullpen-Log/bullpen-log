import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/dal';
import { reportOn } from '@/lib/report/history';
import { ReportBody } from '../../ai-report-card';

/**
 * 지난 리포트 한 편 — 한 페이지.
 *
 * 목록에서 접었다 펴게 하지 않는다. 리포트는 해석·할 일·지켜볼 점·투구 계획·
 * 근거까지 들어 있어 한 편이 화면 한 판을 넘는다. 목록 안에서 펼치면 어디까지
 * 봤는지 놓친다 — 투구 일지와 트레이닝 기록을 페이지로 옮긴 것과 같은 이유다.
 *
 * 만들 때의 수치와 계획이 함께 저장돼 있어, 그때 모습 그대로 다시 나온다.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-03 → 2026년 8월 3일 (월) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

export default async function PastReportPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();

  // 없는 날짜(2026-02-31 같은 것)는 Date 가 조용히 다음 달로 넘긴다. 되돌려 찍어 본다.
  const at = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) {
    notFound();
  }

  const user = await requireUser();
  const report = await reportOn(user.id, date);
  if (!report) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/coach?view=report"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-sky"
      >
        <ArrowLeft className="h-4 w-4" />
        리포트
      </Link>

      <div className="border-b border-line pb-6">
        <h1 className="text-heading text-[1.75rem] leading-[1.15] text-ink sm:text-[2.25rem]">
          {spokenDate(date)}
        </h1>
        <p className="mt-2 text-sm text-muted">
          이 날 기록으로 만든 리포트입니다. 그때 수치와 계획을 그대로 보여줍니다.
        </p>
      </div>

      <ReportBody report={report} />
    </div>
  );
}
