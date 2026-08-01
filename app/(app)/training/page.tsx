import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { getYouTubeEmbedUrl, getYouTubeThumbnail } from '@/lib/youtube';
import { PageHeading } from '@/components/ui';
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

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Training"
        title="트레이닝"
        description="투수에게 필요한 훈련을 5개 파트로 나눠 정리합니다. 보고 싶은 파트를 눌러 영상을 확인하세요."
      />

      <TrainingClient exercises={items} isAdmin={user.role === 'ADMIN'} />
    </div>
  );
}
