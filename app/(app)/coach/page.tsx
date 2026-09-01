import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { trainingLoad } from '@/lib/report/training-acwr';
import { reportReadiness } from '@/lib/report/cadence';
import { toDateKey } from '@/lib/pitch-stats';

/**
 * 이 화면이 읽어 오는 기간(일).
 *
 * 예전에는 기간을 안 걸고 투구 기록을 통째로 읽었다. 3년을 쓰면 천 건이 넘고,
 * 그 전부가 화면까지 따라온다. 정작 쓰는 것은 아래 셋뿐이다.
 *
 *   최근 7일·직전 7일 요약    14일
 *   28일 추이                28일
 *   기간별 돌아보기 30일 비교  60일
 *
 * 여기에 여유를 둬 70일로 자른다. 개인 최고 구속만 전체 기간이 필요한데,
 * 그건 줄 하나만 따로 물어보면 된다.
 */
const PAGE_LOOKBACK_DAYS = 70;
import { isAiConfigured } from '@/lib/ai/client';
import type { AiReportBody } from '@/lib/ai/report-prompt';
import { readPitchPlan } from '@/lib/report/plan';
import { PageHeading } from '@/components/ui';
import { AiReportCard, type StoredReport } from './ai-report-card';
import { ReportClient } from './report-client';
import { StatsOverview } from './overview';
import { CoachTabs, readCoachView } from './tabs';
import { recentReports } from '@/lib/report/history';
import { PastReports } from './past-reports';
import { trainingReview, REVIEW_WEEKS } from '@/lib/report/training-review';
import { TrainingReviewCards } from './training-review';

/** 칸마다 머리말을 바꾼다 — 무엇을 보는 화면인지 한 줄로 말해준다 */
const VIEW_TEXT = {
  pitch:
    '얼마나 던졌고 어떻게 달라지고 있는지 봅니다. 아래로 내려가면 기간별 기록이 이어집니다.',
  training: '무엇을 얼마나 했는지, 빠진 부위는 없는지 봅니다.',
  report: '그동안의 기록을 읽고 정리한 코멘트입니다.',
} as const;

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const view = readCoachView((await searchParams).view);

  const today = new Date();
  const since = new Date(today);
  since.setDate(since.getDate() - PAGE_LOOKBACK_DAYS);

  const [logs, latestReport, training, bestVelocityLog, review] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: 'asc' },
    }),
    prisma.aiReport.findFirst({
      where: { userId: user.id },
      orderBy: { asOf: 'desc' },
    }),
    /* 운동 부하. 투구와 합치지 않고 나란히 보여준다. */
    trainingLoad(user.id, today),
    /*
     * 개인 최고 구속 — 이것만 전체 기간이 필요하다.
     *
     * 기록 전부를 읽어 와서 훑는 대신 가장 빠른 줄 하나만 묻는다.
     * 세운 날짜도 같이 온다.
     */
    prisma.pitchLog.findFirst({
      where: { userId: user.id, maxVelocity: { not: null } },
      orderBy: { maxVelocity: 'desc' },
      select: { maxVelocity: true, date: true },
    }),
    /*
     * 트레이닝 칸의 돌아보기. 그 칸을 볼 때만 읽는다 — 투구나 리포트를 보러
     * 온 사람에게 4주치 운동 기록을 읽힐 이유가 없다.
     */
    view === 'training' ? trainingReview(user.id, today) : null,
  ]);

  const serialized = logs.map((log) => ({
    ...log,
    date: log.date.toISOString(),
  }));

  /* 하루에 한 번 — 오늘 몫을 이미 만들었는지만 본다 */
  const readiness = reportReadiness(
    toDateKey(today),
    latestReport
      ? {
          asOf: latestReport.asOf.toISOString().slice(0, 10),
          halted: latestReport.halted,
        }
      : null
  );

  /* 지난 리포트 목록 — 리포트 칸을 볼 때만 읽는다 */
  const past =
    view === 'report'
      ? await recentReports(
          user.id,
          latestReport ? latestReport.asOf.toISOString().slice(0, 10) : null
        )
      : [];

  // Json 컬럼은 타입이 없으므로 저장할 때의 모양대로 되돌린다.
  const report: StoredReport | null = latestReport
    ? {
        asOf: latestReport.asOf.toISOString().slice(0, 10),
        halted: latestReport.halted,
        haltReason: latestReport.haltReason,
        body: (latestReport.body as AiReportBody | null) ?? null,
        plan: readPitchPlan(latestReport.plan),
        createdAt: latestReport.createdAt.toISOString(),
      }
    : null;

  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Analysis" title="분석" description={VIEW_TEXT[view]} />

      {/*
        예전에는 홈(대시보드)에 있던 것들이다. 홈은 입력(체크인)과 출력(부하·추이)이
        섞여 있었고, 정작 매일 해야 하는 기록은 다른 화면에 있었다. 하는 일 기준으로
        나눠, 오늘 할 일은 트레이닝 화면에 두고 돌아보는 것은 여기로 모았다.

        부하 지수 둘은 어느 칸에서도 보이고, 그 아래가 칸마다 갈린다.
      */}
      <StatsOverview
        view={view}
        tabs={<CoachTabs current={view} />}
        bestVelocity={
          bestVelocityLog?.maxVelocity != null
            ? {
                value: bestVelocityLog.maxVelocity,
                date: toDateKey(bestVelocityLog.date),
              }
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
        today={today}
        totalRecords={logs.length}
      />

      {view === 'training' && review && (
        <TrainingReviewCards review={review} weeks={REVIEW_WEEKS} />
      )}

      {view === 'report' && (
        <>
          <AiReportCard
            report={report}
            readiness={readiness}
            aiReady={isAiConfigured()}
          />
          {/* 지난 리포트는 최근 셋만 — 목록이 아니라 '요즘 뭐라고 했더라'를 보는 곳이다 */}
          <PastReports reports={past} />
        </>
      )}
      {view === 'pitch' && <ReportClient logs={serialized} />}

      {/* 어느 칸에서든 맨 아래에 남긴다 — 부하 지수는 세 칸 모두에 보인다 */}
      <p className="pb-2 text-center text-[11px] leading-relaxed text-muted/60">
        부하 지수는 훈련량 관리를 돕는 참고 지표입니다. 통증이 있다면 수치와 관계없이
        전문의와 상담하세요.
      </p>
    </div>
  );
}
