import 'server-only';
import { prisma } from '@/lib/prisma';
import { OLD_OWN_VIDEOS } from '@/lib/shoot/plan';
import { allExercises, visibleGuides } from '@/lib/library-cache';
import { favoriteDrillIds, favoriteExerciseIds } from '@/lib/favorites';
import { exerciseNotes } from '@/lib/exercise-notes';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import type { ExerciseItem, WarmupFolder } from '@/app/(app)/library/training/training-client';
import type { GuideItem } from '@/app/(app)/library/mechanics/mechanics-client';

/**
 * 라이브러리(운동 영상 · 투구 드릴) 목록 — 웹 /library/training · /library/mechanics 와 앱(native/src/app/library.tsx, app-library.ts)이 같이 쓴다.
 * 누가 보든 같은 목록은 캐시에서(lib/library-cache.ts), 별 · 내 메모만 사람마다 읽는다.
 */

export type LibraryExercise = Omit<ExerciseItem, 'usedCount'>;

export async function loadExerciseLibrary(
  userId: string,
  isAdmin: boolean
): Promise<{ exercises: LibraryExercise[]; warmupFolders: WarmupFolder[] }> {
  /* 숨긴 운동은 관리자에게만 — 숨김은 지우기 대신 쓰는 것이라 되돌릴 사람에게는 보여야 한다 */
  const all = await allExercises();
  const rows = isAdmin ? all : all.filter((ex) => ex.hiddenAt == null);
  /*
   * 새로 넣은 것이 위로 — 캐시 배열을 그대로 reverse 하면 캐시 자체가 뒤집혀 운동 고르기 로테이션이 엉뚱해진다. 반드시 복사해서 뒤집는다.
   */
  const exercises = [...rows].reverse();

  const [favoriteIds, notes, routines, thumbUrls] = await Promise.all([
    favoriteExerciseIds(userId),
    /* 메모는 운동 중에 쓴 것(app/(session)/workout/run/exercise-note.tsx) */
    exerciseNotes(userId),
    prisma.warmupRoutine.findMany({
      where: { hiddenAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        kind: true,
        name: true,
        description: true,
        items: { orderBy: { sortOrder: 'asc' }, select: { exerciseId: true } },
      },
    }),
    /* 미리보기 이미지 주소는 한 번의 요청으로 모아서 받는다 */
    createPlaybackUrls(exercises.map((ex) => ex.thumbPath).filter((p): p is string => !!p)),
  ]);

  /*
   * 워밍업 칸은 루틴 폴더로 — 그날 루틴마다 하나, 안에는 공통(몸 데우기 · 동적 가동) 뒤에 그날 것(2026-10-16 김민: "워밍업 영상 안에 폴더 넷").
   * 담긴 운동은 제 분류(모빌리티 · 파워 …)에 그대로 있고 여기서는 모아 보이기만 한다.
   */
  const common = routines.find((r) => r.kind === 'COMMON')?.items.map((i) => i.exerciseId) ?? [];
  const warmupFolders: WarmupFolder[] = routines
    .filter((r) => r.kind !== 'COMMON')
    .map((r) => ({
      kind: r.kind,
      name: r.name,
      description: r.description,
      /* 공통과 그날 루틴에 같은 운동이 담겨도 한 번만 — 두 번 나와 key 가 겹치고 펼친 카드가 둘 떴다(2026-10-18) */
      exerciseIds: [...new Set([...common, ...r.items.map((i) => i.exerciseId)])],
    }));

  return {
    warmupFolders,
    exercises: exercises.map((ex) => ({
      favorite: favoriteIds.has(ex.id),
      note: notes.get(ex.id) ?? null,
      id: ex.id,
      title: ex.title,
      category: ex.category,
      bodyParts: ex.bodyParts,
      intensity: ex.intensity,
      difficulty: ex.difficulty,
      equipment: ex.equipment,
      /* 마이그레이션 전에 캐시에 담긴 줄에는 이 칸이 없을 수 있다(lib/library-cache.ts) */
      targetMuscles: ex.targetMuscles ?? [],
      videoPath: ex.videoPath,
      /* 한 달 전에 찍어 다시 찍을 영상은 '촬영 전'으로 센다(lib/shoot/plan.ts OLD_OWN_VIDEOS) */
      source: ex.source === 'OWN' && ex.videoPath && OLD_OWN_VIDEOS.has(ex.videoPath) ? 'RETAKE' : ex.source,
      referenceVideoId: ex.referenceVideoId,
      /* 캐시가 이미 문자열로 바꿔 둔다 (lib/library-cache.ts) */
      hiddenAt: ex.hiddenAt,
      aspectRatio: ex.aspectRatio,
      sets: ex.sets,
      reps: ex.reps,
      holdSeconds: ex.holdSeconds,
      restSeconds: ex.restSeconds,
      perSide: ex.perSide,
      /* 참고 영상의 미리보기는 유튜브가 공개한 고정 주소 — 우리 저장소에 없어 발급받을 주소도 없다 */
      thumbUrl: ex.referenceVideoId
        ? referenceThumbUrl(ex.referenceVideoId)
        : ex.thumbPath
          ? (thumbUrls[ex.thumbPath] ?? null)
          : null,
    })),
  };
}

export async function loadDrillLibrary(userId: string): Promise<GuideItem[]> {
  const [guides, favoriteIds] = await Promise.all([
    /* 숨긴 드릴은 뺀다 */
    visibleGuides(),
    favoriteDrillIds(userId),
  ]);
  const thumbUrls = await createPlaybackUrls(guides.map((g) => g.thumbPath).filter((p): p is string => !!p));
  return guides.map((g) => ({
    id: g.id,
    title: g.title,
    category: g.category,
    description: g.description,
    focusPoints: g.focusPoints,
    equipment: g.equipment,
    stage: g.stage,
    videoPath: g.videoPath,
    source: g.source,
    referenceVideoId: g.referenceVideoId,
    aspectRatio: g.aspectRatio,
    thumbUrl: g.referenceVideoId ? referenceThumbUrl(g.referenceVideoId) : g.thumbPath ? (thumbUrls[g.thumbPath] ?? null) : null,
    sortOrder: g.sortOrder,
    favorite: favoriteIds.has(g.id),
  }));
}
