import Link from 'next/link';
import { AlertTriangle, ArrowRight, Sparkles } from 'lucide-react';
import type { AiReportBody } from '@/lib/ai/report-prompt';

/**
 * 홈에 얹는 리포트 한 줄 요약.
 *
 * 리포트를 만들어놓고도 다른 화면에 있으면 잊어버린다. 결론 한 줄만
 * 여기에 띄우고, 더 보고 싶으면 리포트 화면으로 넘긴다.
 *
 * 본문은 새로 만들지 않는다 — 저장된 리포트를 그대로 보여줄 뿐이라
 * 홈을 열었다고 해서 AI를 부르는 일은 없다.
 */
export type ReportSummary = {
  asOf: string;
  halted: boolean;
  haltReason: string | null;
  headline: string | null;
  /** 오늘 기준으로 며칠 지난 리포트인가 */
  daysOld: number;
};

/** 이 일수를 넘기면 "다시 만들어보라"고 권한다. */
const STALE_DAYS = 3;

export function ReportSummaryCard({ report }: { report: ReportSummary | null }) {
  // 아직 한 번도 만든 적이 없을 때
  if (!report) {
    return (
      <Link
        href="/coach"
        className="flex items-center gap-3 rounded-2xl border border-dashed border-sky-soft bg-sky-tint px-5 py-4 transition-colors hover:bg-sky-tint/70"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-sky-strong" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-sky-strong">
            리포트를 아직 만들지 않았습니다
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            기록을 바탕으로 지금 상태와 앞으로 며칠 계획을 정리해드립니다.
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-sky-strong" />
      </Link>
    );
  }

  // 통증 등으로 계획을 내지 않은 리포트 — 결론이 안전 안내다.
  if (report.halted) {
    return (
      <Link
        href="/coach"
        className="flex items-start gap-3 rounded-2xl border border-warn-line bg-warn-bg px-5 py-4 transition-opacity hover:opacity-90"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-warn">
            투구 계획을 내지 않았습니다
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-warn">
            {report.haltReason ?? '몸 상태를 먼저 확인해주세요.'}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/coach"
      className="block rounded-2xl border border-line bg-surface px-5 py-4 transition-colors hover:border-sky-soft"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          <Sparkles className="h-3.5 w-3.5 text-sky" />
          리포트
        </span>
        <span className="text-xs text-muted">
          {report.daysOld === 0
            ? '오늘'
            : report.daysOld === 1
              ? '어제'
              : `${report.daysOld}일 전`}
        </span>
      </div>

      <p className="mt-2 text-base font-bold leading-snug text-ink">
        {report.headline ?? '리포트를 확인해보세요'}
      </p>

      {/* 오래된 리포트는 지금 몸 상태와 어긋날 수 있다. */}
      {report.daysOld >= STALE_DAYS && (
        <p className="mt-2 text-xs text-muted">
          {report.daysOld}일 전 기록 기준입니다. 다시 만들면 최근 기록이
          반영됩니다.
        </p>
      )}

      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-sky">
        자세히 보기 <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

/** 저장된 리포트 행에서 화면에 필요한 것만 뽑는다. */
export function toReportSummary(
  row: {
    asOf: Date;
    halted: boolean;
    haltReason: string | null;
    body: unknown;
  } | null,
  todayKey: string
): ReportSummary | null {
  if (!row) return null;

  const asOf = row.asOf.toISOString().slice(0, 10);
  const [ay, am, ad] = asOf.split('-').map(Number);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const daysOld = Math.max(
    0,
    Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
  );

  // 계획이 멈춘 리포트에는 본문이 없다(AI를 부르지 않는다).
  const body = row.body as AiReportBody | null;

  return {
    asOf,
    halted: row.halted,
    haltReason: row.haltReason,
    headline: body?.headline ?? null,
    daysOld,
  };
}
