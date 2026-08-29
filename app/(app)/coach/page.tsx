import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { trainingLoad } from '@/lib/report/training-acwr';
import { reportReadiness } from '@/lib/report/cadence';
import { isAiConfigured } from '@/lib/ai/client';
import type { AiReportBody } from '@/lib/ai/report-prompt';
import type { PitchPlan } from '@/lib/report/plan';
import { PageHeading } from '@/components/ui';
import { AiReportCard, type StoredReport } from './ai-report-card';
import { ReportClient } from './report-client';
import { StatsOverview } from './overview';

export default async function ReportPage() {
  const user = await requireUser();

  const today = new Date();
  const [logs, latestReport, training] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id },
      orderBy: { date: 'asc' },
    }),
    prisma.aiReport.findFirst({
      where: { userId: user.id },
      orderBy: { asOf: 'desc' },
    }),
    /* 운동 부하. 투구와 합치지 않고 나란히 보여준다. */
    trainingLoad(user.id, today),
  ]);

  const serialized = logs.map((log) => ({
    ...log,
    date: log.date.toISOString(),
  }));

  /*
   * 마지막 리포트 이후 새로 쌓인 투구 기록 수.
   *
   * 기록한 날짜(date)가 아니라 남긴 시각(createdAt)으로 센다. 지난 날짜를
   * 뒤늦게 채워 넣어도 '새로 알게 된 것'은 늘어난 셈이라 세는 것이 맞다.
   */
  const newRecords = latestReport
    ? await prisma.pitchLog.count({
        where: { userId: user.id, createdAt: { gt: latestReport.createdAt } },
      })
    : logs.length;
  const readiness = reportReadiness(newRecords, latestReport != null);

  // Json 컬럼은 타입이 없으므로 저장할 때의 모양대로 되돌린다.
  const report: StoredReport | null = latestReport
    ? {
        asOf: latestReport.asOf.toISOString().slice(0, 10),
        halted: latestReport.halted,
        haltReason: latestReport.haltReason,
        body: (latestReport.body as AiReportBody | null) ?? null,
        plan: latestReport.plan as unknown as PitchPlan,
        createdAt: latestReport.createdAt.toISOString(),
      }
    : null;

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Analysis"
        title="분석"
        description="지금 몸이 어떤 상태인지, 그동안 어떻게 던져왔는지 정리합니다. 아래로 내려가면 기간별 기록과 코멘트가 이어집니다."
      />

      {/*
        예전에는 홈(대시보드)에 있던 것들이다. 홈은 입력(체크인)과 출력(부하·추이)이
        섞여 있었고, 정작 매일 해야 하는 기록은 다른 화면에 있었다. 하는 일 기준으로
        나눠, 오늘 할 일은 트레이닝 화면에 두고 돌아보는 것은 여기로 모았다.
      */}
      <StatsOverview
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

      <AiReportCard
        report={report}
        readiness={readiness}
        aiReady={isAiConfigured()}
      />
      <ReportClient logs={serialized} />
    </div>
  );
}
