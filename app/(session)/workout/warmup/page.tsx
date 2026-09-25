import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { formatPrescription } from '@/lib/exercise-meta';
import { exercisesByIds } from '@/lib/library-cache';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { closeAbandonedSessions } from '@/lib/workout/close-stale';
import { COMMON_WARMUP_KIND, warmupKindFor } from '@/lib/workout/warmup-kind';
import { WarmupClient, type WarmupCard, type WarmupItem } from './warmup-client';

/**
 * 워밍업 창.
 *
 * [운동 시작]과 본운동 사이에 한 번 지나는 화면이다. 오늘 목적에 맞는 루틴과
 * 전신 루틴 둘을 띄우고, [본운동 시작]이나 [건너뛰기]를 누르면 넘어간다.
 *
 * 여기 있는 동안은 아직 본운동 시간이 아니다. 세션의 mainStartedAt 은 이
 * 화면을 나갈 때 찍히고, 종료 요약의 '운동 시간'은 그때부터 센다 — 워밍업에
 * 쓴 시간은 빼기로 했기 때문이다.
 *
 * 루틴에 담긴 운동은 관리자가 /library/warmup 에서 미리 채워 둔다. 아직 비어
 * 있어도 막지 않는다 — 영상이 올라오기 전에도 흐름은 돌아가야 한다.
 */
export default async function WarmupPage() {
  const user = await requireUser();

  /*
   * 종료를 안 누르고 떠난 지난 판은 먼저 닫는다(lib/workout/close-stale.ts).
   *
   * 홈 화면에 추가한 앱은 마지막으로 보던 이 화면으로 다시 켜지기도 한다. 그때
   * 어젯밤 판을 그대로 열면 오늘 세트가 어제 날짜에 붙는다. 닫고 나서 열린 판이
   * 없으면 트레이닝으로 돌아가 오늘 판을 새로 연다.
   */
  await closeAbandonedSessions(user.id);

  const session = await prisma.trainingSession.findFirst({
    where: { userId: user.id, status: 'ACTIVE' },
    orderBy: { date: 'desc' },
  });
  if (!session) redirect('/training');

  /* 이미 지난 창이다. 뒤로가기로 들어와도 본운동으로 돌려보낸다. */
  if (session.mainStartedAt) redirect('/workout/run');

  const plan = readFrozenPlan(session.plan);
  if (!plan || plan.exercises.length === 0) redirect('/training');

  /*
   * 오늘 목적을 정하려면 본운동의 동작 계열이 필요한데, 찍어 둔 목록에는
   * 그 칸이 없다. 목록은 캐시에 통째로 올라와 있어(lib/library-cache.ts)
   * DB 를 가지 않는다.
   */
  const details = await exercisesByIds(plan.exercises.map((e) => e.id));
  const patternOf = new Map(details.map((d) => [d.id, d.movementPattern ?? null]));

  const todayKind = warmupKindFor(
    plan.themeKey,
    plan.exercises.map((e) => ({
      slot: e.slot,
      movementPattern: patternOf.get(e.id) ?? null,
    }))
  );

  /* 전신 루틴은 언제나 함께 뜬다. 목적 루틴이 앞이다 — 그쪽이 오늘의 본론이다. */
  const kinds = todayKind ? [todayKind, COMMON_WARMUP_KIND] : [COMMON_WARMUP_KIND];

  const routines = await prisma.warmupRoutine.findMany({
    where: { kind: { in: kinds }, hiddenAt: null },
    include: {
      items: { orderBy: { sortOrder: 'asc' }, include: { exercise: true } },
    },
  });

  /* 미리보기 주소는 한 번에 몰아서 받는다 (lib/storage.ts 가 잠시 돌려쓴다) */
  const thumbUrls = await createPlaybackUrls([
    ...new Set(
      routines
        .flatMap((r) => r.items.map((i) => i.exercise.thumbPath))
        .filter((p): p is string => !!p)
    ),
  ]);

  /* 찾은 것을 kinds 순서대로 다시 세운다 — DB 는 순서를 지켜 주지 않는다 */
  const byKind = new Map(routines.map((r) => [r.kind, r]));
  const cards: WarmupCard[] = kinds.flatMap((kind) => {
    const r = byKind.get(kind);
    if (!r) return [];
    const items: WarmupItem[] = r.items.map((i) => ({
      id: i.exercise.id,
      title: i.exercise.title,
      /* 루틴에만 적어 둔 안내가 있으면 그것이 먼저다 */
      note: i.note?.trim() || formatPrescription(i.exercise),
      description: i.exercise.description ?? '',
      videoPath: i.exercise.videoPath,
      referenceVideoId: i.exercise.referenceVideoId,
      aspectRatio: i.exercise.aspectRatio,
      thumbUrl: i.exercise.referenceVideoId
        ? referenceThumbUrl(i.exercise.referenceVideoId)
        : i.exercise.thumbPath
          ? (thumbUrls[i.exercise.thumbPath] ?? null)
          : null,
    }));
    return [
      {
        id: r.id,
        name: r.name,
        description: r.description,
        /* 오늘 목적에 맞춰 붙은 쪽인지 — 화면에서 표를 달아 준다 */
        forToday: kind !== COMMON_WARMUP_KIND,
        items,
      },
    ];
  });

  return <WarmupClient themeLabel={plan.themeLabel} cards={cards} />;
}
