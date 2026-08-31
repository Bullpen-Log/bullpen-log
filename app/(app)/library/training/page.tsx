import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { favoriteExerciseIds } from '@/lib/favorites';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { TrainingClient, type ExerciseItem } from './training-client';

export default async function TrainingPage() {
  const user = await requireUser();

  const isAdmin = user.role === 'ADMIN';

  /*
   * 숨긴 운동은 관리자에게만 보인다. 숨김은 지우기 대신 쓰는 것이라, 되돌릴
   * 사람에게는 보여야 하고 나머지에게는 안 보여야 한다.
   */
  const exercises = await prisma.exerciseVideo.findMany({
    where: isAdmin ? {} : { hiddenAt: null },
    orderBy: { createdAt: 'desc' },
    /*
     * 이 운동을 한 기록이 몇 건인지 함께 센다. 지우기 전에 무엇이 함께
     * 사라지는지 숫자로 보여주기 위해서다 — 지우면 그 기록이 전부 딸려 간다.
     */
    include: { _count: { select: { userLogs: true } } },
  });

  const favoriteIds = await favoriteExerciseIds(user.id);

  // 미리보기 이미지 주소는 한 번의 요청으로 모아서 받는다.
  const thumbUrls = await createPlaybackUrls(
    exercises.map((ex) => ex.thumbPath).filter((p): p is string => !!p)
  );

  const items: ExerciseItem[] = exercises.map((ex) => ({
    favorite: favoriteIds.has(ex.id),
    id: ex.id,
    title: ex.title,
    category: ex.category,
    description: ex.description,
    bodyParts: ex.bodyParts,
    intensity: ex.intensity,
    difficulty: ex.difficulty,
    equipment: ex.equipment,
    videoPath: ex.videoPath,
    source: ex.source,
    referenceVideoId: ex.referenceVideoId,
    hiddenAt: ex.hiddenAt ? ex.hiddenAt.toISOString() : null,
    aspectRatio: ex.aspectRatio,
    // 지우기 전에 보여줄 숫자. 관리자만 지울 수 있어 다른 사람에게는 안 쓴다.
    usedCount: ex._count.userLogs,
    sets: ex.sets,
    reps: ex.reps,
    holdSeconds: ex.holdSeconds,
    restSeconds: ex.restSeconds,
    perSide: ex.perSide,
    /*
     * 참고 영상의 미리보기는 유튜브가 공개한 고정 주소를 그대로 쓴다.
     * 우리 저장소에 담아 두지 않으므로 발급받을 주소도 없다.
     */
    thumbUrl: ex.referenceVideoId
      ? referenceThumbUrl(ex.referenceVideoId)
      : ex.thumbPath
        ? (thumbUrls[ex.thumbPath] ?? null)
        : null,
  }));

  // 제목과 탭은 라이브러리 레이아웃이 그린다.
  return <TrainingClient exercises={items} isAdmin={isAdmin} />;
}
