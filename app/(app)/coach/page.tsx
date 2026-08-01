import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { isAiConfigured } from '@/lib/ai/client';
import type { AiReportBody } from '@/lib/ai/report-prompt';
import type { PitchPlan } from '@/lib/report/plan';
import { PageHeading } from '@/components/ui';
import { AiReportCard, type StoredReport } from './ai-report-card';
import { ReportClient } from './report-client';

export default async function ReportPage() {
  const user = await requireUser();

  const [logs, latestReport] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id },
      orderBy: { date: 'asc' },
    }),
    prisma.aiReport.findFirst({
      where: { userId: user.id },
      orderBy: { asOf: 'desc' },
    }),
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
        eyebrow="AI Coach"
        title="AI 코치"
        description="기록과 몸 상태를 바탕으로 앞으로의 투구 계획을 정리합니다. 아래에는 그 근거가 되는 기간별 기록이 이어집니다."
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
