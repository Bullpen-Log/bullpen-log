import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import type { PitchMetric } from '@/lib/pose/measure';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import { AnalysisClient } from './analysis-client';

export default async function AnalysisPage() {
  const user = await requireUser();

  const [logs, analyses] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id },
      orderBy: { date: 'asc' },
    }),
    prisma.poseAnalysis.findMany({
      where: { userId: user.id },
    }),
  ]);

  /*
   * 재생 주소는 여기서 만들지 않는다.
   * 기록이 많아지면 열 때마다 전부 발급하느라 느려지므로,
   * 실제로 보고 있는 영상만 /api/pitch-log/video-url 로 그때그때 받아온다.
   */
  const serialized = logs.map((log) => ({
    ...log,
    date: log.date.toISOString(),
  }));

  // 저장된 분석에 기록 날짜를 붙인다 — 지난 세션과의 비교 기준이 된다.
  const dateByLogId = new Map(logs.map((l) => [l.id, l.date.toISOString().slice(0, 10)]));
  const saved: SavedAnalysisView[] = analyses
    .filter((a) => dateByLogId.has(a.pitchLogId))
    .map((a) => ({
      videoPath: a.videoPath,
      date: dateByLogId.get(a.pitchLogId)!,
      throwingSide: a.throwingSide as 'left' | 'right',
      wristSide: a.wristSide as 'left' | 'right',
      leadSide: a.leadSide as 'left' | 'right',
      direction: a.direction as 1 | -1,
      quality: a.quality,
      coverage: a.coverage,
      kneeUpT: a.kneeUpT,
      footPlantT: a.footPlantT,
      releaseT: a.releaseT,
      kneeUpManualT: a.kneeUpManualT,
      footPlantManualT: a.footPlantManualT,
      releaseManualT: a.releaseManualT,
      metrics: a.metrics as PitchMetric[],
      updatedAt: a.updatedAt.toISOString(),
    }));

  return <AnalysisClient logs={serialized} heightCm={user.heightCm} savedAnalyses={saved} />;
}
