import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { trainingLoad } from '@/lib/report/training-acwr';
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
        canGenerate={logs.length > 0}
        aiReady={isAiConfigured()}
      />
      <ReportClient logs={serialized} nickname={user.nickname} />
    </div>
  );
}
