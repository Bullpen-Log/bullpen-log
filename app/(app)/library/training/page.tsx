import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { allExercises } from '@/lib/library-cache';
import { favoriteExerciseIds } from '@/lib/favorites';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { TrainingClient, type ExerciseItem } from './training-client';

export default async function TrainingPage() {
  const user = await requireUser();

  const isAdmin = user.role === 'ADMIN';

  /*
   * 누가 보든 같은 목록이라 캐시에서 꺼낸다 (lib/library-cache.ts).
   *
   * 숨긴 운동은 관리자에게만 보인다. 숨김은 지우기 대신 쓰는 것이라, 되돌릴
   * 사람에게는 보여야 하고 나머지에게는 안 보여야 한다.
   */
  const all = await allExercises();
  const rows = isAdmin ? all : all.filter((ex) => ex.hiddenAt == null);

  /*
   * 새로 넣은 것이 위로 오게 뒤집는다.
   *
   * 캐시가 들고 있는 배열을 그대로 reverse 하면 캐시 자체가 뒤집힌다 —
   * 운동을 고르는 규칙이 등록순을 기준으로 로테이션을 돌리므로, 그 순간
   * 일정 만들기가 엉뚱하게 바뀐다. 반드시 복사해서 뒤집는다.
   */
  const exercises = [...rows].reverse();

  /*
   * 지우기 전에 보여줄 '이 운동을 한 기록 수'.
   *
   * 예전에는 405줄마다 따로 세게 했다(include: { _count }). 관리자만 지울 수
   * 있는데 모든 사람의 화면에 그 값이 실려 나갔다. 관리자일 때만, 그것도
   * 한 번의 집계로 센다.
   */
  const usedCounts = new Map<string, number>();
  if (isAdmin) {
    const counted = await prisma.userExerciseLog.groupBy({
      by: ['exerciseId'],
      _count: { _all: true },
    });
    for (const row of counted) usedCounts.set(row.exerciseId, row._count._all);
  }

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
    bodyParts: ex.bodyParts,
    intensity: ex.intensity,
    difficulty: ex.difficulty,
    equipment: ex.equipment,
    videoPath: ex.videoPath,
    source: ex.source,
    referenceVideoId: ex.referenceVideoId,
    /* 캐시가 이미 문자열로 바꿔 둔다 (lib/library-cache.ts) */
    hiddenAt: ex.hiddenAt,
    aspectRatio: ex.aspectRatio,
    // 지우기 전에 보여줄 숫자. 관리자만 지울 수 있어 다른 사람에게는 안 쓴다.
    usedCount: usedCounts.get(ex.id) ?? 0,
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
