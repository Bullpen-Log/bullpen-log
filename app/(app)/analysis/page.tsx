import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { AnalysisClient } from './analysis-client';

export default async function AnalysisPage() {
  const user = await requireUser();

  const logs = await prisma.pitchLog.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
  });

  const serialized = logs.map((log) => ({
    ...log,
    date: log.date.toISOString(),
  }));

  return <AnalysisClient logs={serialized} />;
}
