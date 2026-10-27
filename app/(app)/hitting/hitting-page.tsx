import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { HittingClient, type HittingRow } from './hitting-client';

/** 처음 그릴 때 읽는 기간 — 달력을 넘기면 그 달만 더 읽지 않고 이 안에서 본다(1단계) */
const READ_DAYS = 400;

/**
 * 타격 탭 — 타격 일지 + 달력(2026-10-20 타격 1단계 T5, docs/designs/hitting-restructure.md).
 * 판 넘기기 셋째 판(@hitting/default.tsx)과 /hitting 주소 둘 다 이것을 그린다. 잠금 없이 누구나 바로 쓴다(2026-10-20 시작 질문 뺌).
 */
export default async function HittingPage() {
  const user = await requireUser();
  const today = toDateKey(appNow());
  const since = new Date(`${today}T00:00:00.000Z`);
  since.setUTCDate(since.getUTCDate() - READ_DAYS);
  const select = {
    id: true,
    date: true,
    sessionType: true,
    swings: true,
    effortPct: true,
    memo: true,
    satisfaction: true,
    createdAt: true,
  } as const;
  const [logs, sessions] = await Promise.all([prisma.hittingLog.findMany({
    where: { userId: user.id, date: { gte: since } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    select,
  }), prisma.hittingSession.findMany({
    where: { userId: user.id, date: { gte: since } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    select,
  })]);
  const rows: HittingRow[] = [
    ...logs.map((l) => ({ ...l, source: 'legacy' as const })),
    ...sessions.map((l) => ({ ...l, source: 'session' as const })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime())
    .map((l) => ({ id: l.id, date: toDateKey(l.date), sessionType: l.sessionType, swings: l.swings, effortPct: l.effortPct, memo: l.memo, satisfaction: l.satisfaction, source: l.source }));
  return <HittingClient today={today} rows={rows} />;
}
