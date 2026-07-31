import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls, isStorageConfigured } from '@/lib/storage';
import { AnalysisClient } from './analysis-client';

export default async function AnalysisPage() {
  const user = await requireUser();

  const logs = await prisma.pitchLog.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
  });

  // 비공개 저장소이므로 본인 영상에 대해서만 시간제한 재생 주소를 만들어 넘긴다.
  const allPaths = logs.flatMap((l) => l.videoPaths);
  const signed =
    allPaths.length > 0 && isStorageConfigured()
      ? await createPlaybackUrls(allPaths)
      : [];

  const urlByPath = Object.fromEntries(
    signed.filter((s) => s.url).map((s) => [s.path, s.url as string])
  );

  const serialized = logs.map((log) => ({
    ...log,
    date: log.date.toISOString(),
    videos: log.videoPaths.map((path) => ({ path, url: urlByPath[path] ?? null })),
  }));

  return <AnalysisClient logs={serialized} />;
}
