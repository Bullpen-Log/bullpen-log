import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { ReportClient } from './report-client';

export default async function ReportPage() {
  const user = await requireUser();

  const logs = await prisma.pitchLog.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
  });

  const serialized = logs.map((log) => ({
    ...log,
    date: log.date.toISOString(),
  }));

  return <ReportClient logs={serialized} nickname={user.nickname} />;
}
