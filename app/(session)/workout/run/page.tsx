import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { closeAbandonedSessions } from '@/lib/workout/close-stale';
import { runExercises } from '@/lib/workout/run-exercises';
import { SessionClient, type RunSet } from './session-client';

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

  const [sets, exercises] = await Promise.all([
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
    /*
     * 찍어 둔 목록에 설명·영상·지난번 기록·내 메모·별을 붙인다. 운동 중에
     * 바꿔 넣은 운동도 같은 곳에서 만든다(lib/workout/run-exercises.ts).
     */
    runExercises(user.id, plan.exercises, session.date),
  ]);

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
