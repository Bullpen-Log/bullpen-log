import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { HittingClient, type HittingRow } from './hitting-client';

/** 처음 그릴 때 읽는 기간 — 달력을 넘기면 그 달만 더 읽지 않고 이 안에서 본다(1단계) */
const READ_DAYS = 400;

/**
 * 타격 탭 — 타격 일지 + 달력(2026-10-20 타격 1단계 T5, docs/designs/hitting-restructure.md).
 * 판 넘기기 셋째 판(@hitting/default.tsx)과 /hitting 주소 둘 다 이것을 그린다. 잠겨 있으면 '타격 시작하기'로.
 */
export default async function HittingPage() {
  const user = await requireUser();
  if (featureLocks(user).hit) redirect(SETUP_PATH.hit);
  const today = toDateKey(appNow());
  const since = new Date(`${today}T00:00:00.000Z`);
  since.setUTCDate(since.getUTCDate() - READ_DAYS);
  const logs = await prisma.hittingLog.findMany({
    where: { userId: user.id, date: { gte: since } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      date: true,
      sessionType: true,
      swings: true,
      effortPct: true,
      memo: true,
      satisfaction: true,
    },
  });
  const rows: HittingRow[] = logs.map((l) => ({ ...l, date: toDateKey(l.date) }));
  return <HittingClient today={today} rows={rows} />;
}
