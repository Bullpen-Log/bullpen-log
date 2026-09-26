import { AlertTriangle, ChevronRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import type { requireUser } from '@/lib/dal';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { trainingLoad } from '@/lib/report/training-acwr';
import { reportReadiness } from '@/lib/report/cadence';
import { isAiConfigured } from '@/lib/ai/client';
import type { AiReportBody } from '@/lib/ai/report-prompt';
import { readPitchPlan } from '@/lib/report/plan';
import { recentReports, reportOn, type ReportSummary } from '@/lib/report/history';
import { REVIEW_WEEKS, trainingReview } from '@/lib/report/training-review';
import {
  AiReportCard,
  ReportBody,
  type StoredReport,
} from '@/app/(app)/coach/ai-report-card';
import { ReportClient } from '@/app/(app)/coach/report-client';
import { StatsOverview } from '@/app/(app)/coach/overview';
import { TrainingReviewCards } from '@/app/(app)/coach/training-review';
import { JumpToDate } from './analysis-block';
import type { AnalysisTab } from './analysis-tabs';

/**
 * 홈 분석 칸의 속 — 고른 날 기준의 분석. 서버에서 그린다.
 *
 * 분석 탭(app/(app)/coach)의 부품을 그대로 쓴다. 다른 것은 기준일이다. 분석 탭은 늘
 * 오늘로 셈했지만, 여기는 캘린더에서 고른 날로 셈한다 — 그날까지의 기록으로, 그날
 * 부하 지수·추이·돌아보기가 어땠는지를 본다.
 *
 * 홈 page.tsx 가 오늘 리포트를 함께 그려 보내고, 다른 날·칸은 분석 칸이 바꿀 때마다
 * app/actions/analysis.tsx 가 그려 돌려준다.
 */

type User = Awaited<ReturnType<typeof requireUser>>;

/**
 * 투구 칸이 읽어 오는 기간(일). 분석 탭과 같다 — 최근 7일·직전 7일(14일), 28일 추이,
 * 기간별 돌아보기 30일 비교(60일)에 여유를 둔 값.
 */
const LOOKBACK_DAYS = 70;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-03 → 8월 3일 (월) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

/** DB 의 날짜 칸(@db.Date)과 견줄 값 */
const dbDay = (key: string) => new Date(`${key}T00:00:00.000Z`);

/**
 * 그날 정오(서울). 부하·돌아보기 함수들이 받는 '오늘'이다 — toDateKey 가 그날로 읽고,
 * 시간대가 조금 어긋나도 날짜가 넘어가지 않는 한가운데.
 */
const noonOf = (key: string) => new Date(`${key}T12:00:00+09:00`);

export async function AnalysisView({
  user,
  date,
  today,
  tab,
}: {
  user: User;
  /** 기준일 (YYYY-MM-DD) */
  date: string;
  today: string;
  tab: AnalysisTab;
}) {
  if (tab === 'report') {
    return date === today ? (
      <TodayReport user={user} today={today} />
    ) : (
      <PastReport user={user} date={date} />
    );
  }
  return <LoadView user={user} date={date} tab={tab} />;
}

/* ─────────────────────────── 리포트 ─────────────────────────── */

/**
 * 오늘 — 가장 최근 리포트와 만들기 단추. 분석 탭의 리포트 칸 그대로다.
 * 오늘 몫을 아직 안 만들었으면 어제까지의 것을 보여 주며 만들 수 있다고 알린다.
 */
async function TodayReport({ user, today }: { user: User; today: string }) {
  const latest = await prisma.aiReport.findFirst({
    where: { userId: user.id },
    orderBy: { asOf: 'desc' },
  });
  // Json 칸은 타입이 없으므로 저장할 때의 모양대로 되돌린다.
  const report: StoredReport | null = latest
    ? {
        asOf: latest.asOf.toISOString().slice(0, 10),
        halted: latest.halted,
        haltReason: latest.haltReason,
        body: (latest.body as AiReportBody | null) ?? null,
        plan: readPitchPlan(latest.plan),
        createdAt: latest.createdAt.toISOString(),
      }
    : null;
  const readiness = reportReadiness(
    today,
    report ? { asOf: report.asOf, halted: report.halted } : null
  );
  const past = await recentReports(user.id, report?.asOf ?? null);

  return (
    <div className="space-y-4">
      <AiReportCard report={report} readiness={readiness} aiReady={isAiConfigured()} />
      <PastReports reports={past} />
    </div>
  );
}

/**
 * 지난 날 — 그날 만든 리포트 한 편. 만들 때의 수치와 계획이 함께 저장돼 있어 그때
 * 모습 그대로 다시 나온다. 없는 날은 가장 가까운 이전 리포트로 가는 길을 둔다.
 */
async function PastReport({ user, date }: { user: User; date: string }) {
  const [report, past, earlier] = await Promise.all([
    reportOn(user.id, date),
    recentReports(user.id, date),
    prisma.aiReport.findFirst({
      where: { userId: user.id, asOf: { lt: dbDay(date) } },
      orderBy: { asOf: 'desc' },
      select: { asOf: true },
    }),
  ]);

  if (report) {
    return (
      <div className="space-y-4">
        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <header className="border-b border-line px-5 py-4 sm:px-6">
            <h3 className="text-sm font-bold text-ink">{spokenDate(date)} 리포트</h3>
            <p className="mt-0.5 text-xs text-muted">
              이 날 기록으로 만든 리포트입니다. 그때 수치와 계획을 그대로 보여줍니다.
            </p>
          </header>
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <ReportBody report={report} />
          </div>
        </section>
        <PastReports reports={past} />
      </div>
    );
  }

  const earlierKey = earlier ? earlier.asOf.toISOString().slice(0, 10) : null;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
        <p className="text-sm text-ink">{spokenDate(date)}에는 만든 리포트가 없어요.</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          리포트가 있는 날은 캘린더 칸 왼쪽 위에 그래프 표시가 있어요. 투구·트레이닝
          칸에서는 이 날까지의 부하와 추이를 볼 수 있어요.
        </p>
        {earlierKey && (
          <JumpToDate
            date={earlierKey}
            className="mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-sky transition-colors hover:bg-sky-tint hover:text-sky-strong"
          >
            가장 가까운 이전 리포트 — {spokenDate(earlierKey)}
            <ChevronRight aria-hidden className="h-4 w-4" />
          </JumpToDate>
        )}
      </div>
      <PastReports reports={past} />
    </div>
  );
}

/**
 * 지난 리포트 — 날짜와 한 줄 요약. 누르면 캘린더가 그날을 고르고, 이 칸이 그날
 * 리포트로 바뀐다(예전에는 따로 한 페이지로 넘어갔다).
 */
function PastReports({ reports }: { reports: ReportSummary[] }) {
  if (reports.length === 0) return null;
  return (
    <section>
      <h3 className="px-1 text-xs font-semibold text-muted">지난 리포트</h3>
      <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
        {reports.map((r, i) => (
          <li key={r.asOf} className={i > 0 ? 'border-t border-line' : ''}>
            <JumpToDate
              date={r.asOf}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-2/60"
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
            </JumpToDate>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────── 투구 · 트레이닝 ─────────────────────────── */

/**
 * 부하와 추이 — 그날까지의 기록으로 셈한다.
 *
 * 투구: 부하 지수, 이번 주·마지막 투구·개인 최고 구속, 28일 추이, 기간별 기록.
 * 트레이닝: 운동 부하 지수와 4주 돌아보기(부위별 세트).
 */
async function LoadView({
  user,
  date,
  tab,
}: {
  user: User;
  date: string;
  tab: 'pitch' | 'training';
}) {
  const asOf = noonOf(date);
  const since = shiftDateKey(date, -LOOKBACK_DAYS);

  const [logs, training, best, review] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: { gte: dbDay(since), lte: dbDay(date) } },
      orderBy: { date: 'asc' },
    }),
    trainingLoad(user, asOf),
    /* 개인 최고 구속 — 그날까지의 것 중에서. 전체 기간에서 가장 빠른 줄 하나만 묻는다. */
    prisma.pitchLog.findFirst({
      where: {
        userId: user.id,
        maxVelocity: { not: null },
        date: { lte: dbDay(date) },
      },
      orderBy: { maxVelocity: 'desc' },
      select: { maxVelocity: true, date: true },
    }),
    /* 돌아보기는 트레이닝 칸에서만 — 4주치 운동 기록이라 가볍지 않다 */
    tab === 'training' ? trainingReview(user.id, asOf) : null,
  ]);

  const serialized = logs.map((log) => ({ ...log, date: log.date.toISOString() }));

  return (
    <div className="space-y-6">
      <StatsOverview
        view={tab}
        bestVelocity={
          best?.maxVelocity != null
            ? { value: best.maxVelocity, date: toDateKey(best.date) }
            : null
        }
        logs={serialized.map((l) => ({
          date: l.date,
          sessionType: l.sessionType,
          pitchCount: l.pitchCount,
          intensity: l.intensity,
          maxVelocity: l.maxVelocity,
          avgVelocity: l.avgVelocity,
        }))}
        training={training}
        user={user}
        today={asOf}
        totalRecords={logs.length}
      />

      {tab === 'training' && review && (
        <TrainingReviewCards review={review} weeks={REVIEW_WEEKS} />
      )}
      {tab === 'pitch' && <ReportClient logs={serialized} />}

      <p className="pb-2 text-center text-[11px] leading-relaxed text-muted/60">
        부하 지수는 훈련량 관리를 돕는 참고 지표입니다. 통증이 있다면 수치와 관계없이
        전문의와 상담하세요.
      </p>
    </div>
  );
}
