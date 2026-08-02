import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { TrainingClient, type ExerciseItem } from './training-client';

export default async function TrainingPage() {
  const user = await requireUser();

  const exercises = await prisma.exerciseVideo.findMany({
    orderBy: { createdAt: 'desc' },
  });

  // 미리보기 이미지 주소는 한 번의 요청으로 모아서 받는다.
  const thumbUrls = await createPlaybackUrls(
    exercises.map((ex) => ex.thumbPath).filter((p): p is string => !!p)
  );

  const items: ExerciseItem[] = exercises.map((ex) => ({
    id: ex.id,
    title: ex.title,
    category: ex.category,
    description: ex.description,
    bodyParts: ex.bodyParts,
    intensity: ex.intensity,
    difficulty: ex.difficulty,
    equipment: ex.equipment,
    videoPath: ex.videoPath,
    thumbUrl: ex.thumbPath ? (thumbUrls[ex.thumbPath] ?? null) : null,
  }));

  // 제목과 탭은 라이브러리 레이아웃이 그린다.
  return <TrainingClient exercises={items} isAdmin={user.role === 'ADMIN'} />;
}
