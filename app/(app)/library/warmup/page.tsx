import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { formatPrescription } from '@/lib/exercise-meta';
import { WarmupClient, type RoutineCard, type PickableExercise } from './warmup-client';

/**
 * 고정 워밍업 루틴.
 *
 * 운동을 시작하면 본운동에 들어가기 전에 '오늘 목적에 맞는 루틴'과 '전신
 * 루틴' 둘이 뜬다. 날마다 새로 뽑는 것이 아니라 여기서 미리 짜 두고 그대로
 * 쓴다 — 그래서 '고정'이다.
 *
 * 루틴 넷은 마이그레이션에서 심어 두었고 여기서 지우거나 더할 수 없다.
 * 하는 일은 이름을 고치고 운동을 담고 순서를 바꾸는 것뿐이다.
 *
 * 담을 수 있는 것은 '워밍업' 카테고리 운동뿐이다. 이 카테고리는 어느 테마의
 * 구성에도 없어서 하루 일정에는 저절로 안 뽑힌다 (lib/categories.ts 참고).
 */
export default async function WarmupRoutinePage() {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';

  const [routines, pool] = await Promise.all([
    prisma.warmupRoutine.findMany({
      where: { hiddenAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { exercise: true },
        },
      },
    }),
    /*
     * 담을 수 있는 후보.
     *
     * 캐시(lib/library-cache.ts)를 안 쓴다. 이 화면은 관리자가 영상을 올린
     * 직후에 들어오는 자리라, 방금 올린 것이 바로 보여야 한다.
     */
    prisma.exerciseVideo.findMany({
      where: { category: '워밍업', hiddenAt: null },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  /* 미리보기 주소는 한 번에 몰아서 받는다 (lib/storage.ts 가 잠시 돌려쓴다) */
  const thumbPaths = [
    ...routines.flatMap((r) => r.items.map((i) => i.exercise.thumbPath)),
    ...pool.map((ex) => ex.thumbPath),
  ].filter((p): p is string => !!p);
  const thumbUrls = await createPlaybackUrls([...new Set(thumbPaths)]);

  const thumbOf = (ex: {
    referenceVideoId: string | null;
    thumbPath: string | null;
  }) =>
    ex.referenceVideoId
      ? referenceThumbUrl(ex.referenceVideoId)
      : ex.thumbPath
        ? (thumbUrls[ex.thumbPath] ?? null)
        : null;

  const cards: RoutineCard[] = routines.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    items: r.items.map((i) => ({
      exerciseId: i.exerciseId,
      title: i.exercise.title,
      prescription: formatPrescription(i.exercise),
      thumbUrl: thumbOf(i.exercise),
    })),
  }));

  const pickable: PickableExercise[] = pool.map((ex) => ({
    id: ex.id,
    title: ex.title,
    prescription: formatPrescription(ex),
    thumbUrl: thumbOf(ex),
  }));

  return <WarmupClient routines={cards} pickable={pickable} isAdmin={isAdmin} />;
}
