import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { exercisesByIds } from '@/lib/library-cache';
import { recentAmounts } from '@/lib/report/exercise-recent';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { closeAbandonedSessions } from '@/lib/workout/close-stale';
import { SessionClient, type RunExercise, type RunSet } from './session-client';

/**
 * 본운동 화면.
 *
 * 세션이 시작할 때 찍어 둔 목록을 그대로 돌린다. 오늘 일정을 다시 읽지
 * 않는다 — 운동 중에 목록이 바뀌면 안 되기 때문이다 (lib/workout/session-plan.ts).
 */
export default async function RunPage() {
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

  /*
   * 워밍업 창을 아직 안 지났다.
   *
   * mainStartedAt 은 그 창을 나갈 때 찍힌다. 비어 있다는 것은 [운동 시작]만
   * 누르고 주소를 직접 쳐서 들어왔다는 뜻이라, 창으로 돌려보낸다.
   */
  if (!session.mainStartedAt) redirect('/workout/warmup');

  const plan = readFrozenPlan(session.plan);
  if (!plan || plan.exercises.length === 0) redirect('/training');

  /*
   * 설명과 영상은 찍어 둔 목록에 담지 않고 여기서 따로 읽는다.
   *
   * 얼려 두는 것은 '무엇을 할지'이지 '그 운동이 무엇인지'가 아니다. 설명은
   * 길어서 찍어 두면 세션 줄이 무거워지고, 영상 주소는 한 시간이면 죽는다.
   * 목록은 캐시에 통째로 올라와 있어(lib/library-cache.ts) DB 를 가지 않는다.
   */
  const details = await exercisesByIds(plan.exercises.map((e) => e.id));
  const byId = new Map(details.map((d) => [d.id, d]));

  const [sets, thumbUrls, past] = await Promise.all([
    prisma.userExerciseSet.findMany({
      where: { sessionId: session.id },
      orderBy: [{ exerciseId: 'asc' }, { setNo: 'asc' }],
      select: {
        setNo: true,
        exerciseId: true,
        weightKg: true,
        reps: true,
        holdSeconds: true,
        recordedAt: true,
      },
    }),
    /* 서명 주소는 한 시간이면 죽는다. 찍어 두지 않고 그릴 때마다 발급한다. */
    createPlaybackUrls(
      plan.exercises.map((e) => e.thumbPath).filter((p): p is string => !!p)
    ),
    /* '지난번 60kg × 8회' — 오늘 그릴 운동만 묻는다 */
    recentAmounts(
      user.id,
      plan.exercises.map((e) => e.id),
      session.date
    ),
  ]);

  const exercises: RunExercise[] = plan.exercises.map((e) => {
    const d = byId.get(e.id);
    return {
      id: e.id,
      title: e.title,
      category: e.category,
      slot: e.slot,
      prescription: e.prescription,
      plannedSets: e.plannedSets,
      perSide: e.perSide,
      needsWeight: e.needsWeight,
      isHold: e.isHold,
      /* 유산소는 분으로 받는다 — 10분을 '600초'로 치게 하지 않는다 */
      inMinutes: e.category === '유산소',
      equipment: e.equipment,
      /* 운동 중에 자세를 확인할 수 있게 — 설명과 영상 */
      description: d?.description ?? '',
      videoPath: d?.videoPath ?? null,
      referenceVideoId: d?.referenceVideoId ?? null,
      aspectRatio: d?.aspectRatio ?? null,
      thumbUrl: e.thumbPath ? (thumbUrls[e.thumbPath] ?? null) : null,
      /* 가장 최근 한 번만. 여러 개를 보여주면 무엇을 따라갈지 흐려진다. */
      last: past.get(e.id)?.[0] ?? null,
    };
  });

  const saved: RunSet[] = sets.map((s) => ({
    ...s,
    recordedAt: s.recordedAt.toISOString(),
  }));

  return (
    <SessionClient
      sessionId={session.id}
      themeLabel={plan.themeLabel}
      exercises={exercises}
      initialSets={saved}
      /*
       * 이 판을 연 시각.
       *
       * 휴식 시계는 이 시각 뒤에 남긴 세트만 센다. 한 번 종료한 판을 다시
       * 열면 이 값이 새로 찍히므로, 아까 남긴 세트부터 계속 세지 않는다.
       * 그러지 않으면 종료하고 다시 들어왔을 때 '47분째 쉬는 중'이 떠서
       * 종료가 안 된 것처럼 보인다.
       */
      openedAt={session.mainStartedAt.toISOString()}
      /* 다시 연 판이면 앞서 마친 구간의 시간. 종료 요약이 여기에 더해 보여준다. */
      priorSeconds={session.activeSeconds}
    />
  );
}
