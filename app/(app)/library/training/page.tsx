import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { getYouTubeEmbedUrl, getYouTubeThumbnail } from '@/lib/youtube';
import { TrainingClient, type ExerciseItem } from './training-client';

export default async function TrainingPage() {
  const user = await requireUser();

  const exercises = await prisma.exerciseVideo.findMany({
    orderBy: { createdAt: 'desc' },
  });

  // 유튜브 주소 변환은 서버에서 미리 해둔다.
  const items: ExerciseItem[] = exercises.map((ex) => ({
    id: ex.id,
    title: ex.title,
    category: ex.category,
    description: ex.description,
    bodyParts: ex.bodyParts,
    intensity: ex.intensity,
    difficulty: ex.difficulty,
    equipment: ex.equipment,
    embedUrl: getYouTubeEmbedUrl(ex.videoUrl),
    thumbnailUrl: getYouTubeThumbnail(ex.videoUrl),
  }));

  // 제목과 탭은 라이브러리 레이아웃이 그린다.
  return <TrainingClient exercises={items} isAdmin={user.role === 'ADMIN'} />;
}
