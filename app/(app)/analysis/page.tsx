import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { AnalysisClient } from './analysis-client';

export default async function AnalysisPage() {
  const user = await requireUser();

  const logs = await prisma.pitchLog.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
  });

  /*
   * 재생 주소는 여기서 만들지 않는다.
   * 기록이 많아지면 열 때마다 전부 발급하느라 느려지므로,
   * 실제로 보고 있는 영상만 /api/pitch-log/video-url 로 그때그때 받아온다.
   */
  const serialized = logs.map((log) => ({
    ...log,
    date: log.date.toISOString(),
  }));

  return <AnalysisClient logs={serialized} />;
}
