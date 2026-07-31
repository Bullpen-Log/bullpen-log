import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { PitchLogClient } from './pitch-log-client';

export default async function PitchLogPage() {
  const user = await requireUser();

  const logs = await prisma.pitchLog.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
  });

  // Date 객체는 클라이언트로 그대로 넘길 수 없어 문자열로 바꿔 전달한다.
  const initialLogs = logs.map((log) => ({
    ...log,
    date: log.date.toISOString(),
  }));

  return <PitchLogClient initialLogs={initialLogs} />;
}
