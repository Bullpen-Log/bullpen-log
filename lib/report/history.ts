import { prisma } from '@/lib/prisma';
import type { AiReportBody } from '@/lib/ai/report-prompt';
import { readPitchPlan } from '@/lib/report/plan';
import type { StoredReport } from '@/app/(app)/coach/ai-report-card';

/**
 * 지난 리포트.
 *
 * 리포트는 만들 때의 수치와 계획을 통째로 안고 저장되므로, 지난 것도 그때
 * 모습 그대로 다시 보여줄 수 있다. 그런데 화면은 최신 하나만 보여주고 있어서
 * 나머지는 만들어 놓고 볼 방법이 없었다.
 *
 * 최근 세 개만 낸다. 기록 세 번이면 새로 만들 수 있으므로 한 해면 서른 개가
 * 넘게 쌓이는데, 그것을 다 늘어놓으면 무엇을 보러 온 화면인지 흐려진다.
 * 지난 리포트는 '요즘 뭐라고 했더라'를 확인하는 곳이지 기록 보관소가 아니다.
 */
export const RECENT_REPORTS = 3;

export type ReportSummary = {
  /** YYYY-MM-DD */
  asOf: string;
  /** 한 줄 요약. 계획이 멈춘 리포트에는 없다. */
  headline: string | null;
  halted: boolean;
};

/** 최신 리포트를 뺀 최근 것들 — 목록에 쓴다 */
export async function recentReports(
  userId: string,
  exceptAsOf: string | null
): Promise<ReportSummary[]> {
  const rows = await prisma.aiReport.findMany({
    where: { userId },
    orderBy: { asOf: 'desc' },
    take: RECENT_REPORTS + 1,
    select: { asOf: true, halted: true, body: true },
  });

  return rows
    .map((r) => ({
      asOf: r.asOf.toISOString().slice(0, 10),
      halted: r.halted,
      headline: (r.body as AiReportBody | null)?.headline ?? null,
    }))
    .filter((r) => r.asOf !== exceptAsOf)
    .slice(0, RECENT_REPORTS);
}

/** 그날 리포트 한 편 — 없으면 null */
export async function reportOn(
  userId: string,
  asOf: string
): Promise<StoredReport | null> {
  const row = await prisma.aiReport.findFirst({
    where: { userId, asOf: new Date(`${asOf}T00:00:00.000Z`) },
  });
  if (!row) return null;

  return {
    asOf: row.asOf.toISOString().slice(0, 10),
    halted: row.halted,
    haltReason: row.haltReason,
    body: (row.body as AiReportBody | null) ?? null,
    plan: readPitchPlan(row.plan),
    createdAt: row.createdAt.toISOString(),
  };
}
