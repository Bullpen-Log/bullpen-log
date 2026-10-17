import 'server-only';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { readFrozenPlan, type FrozenPlan } from '@/lib/workout/session-plan';
import { closeAbandoned, closeAbandonedSessions, lastSetAt } from '@/lib/workout/close-stale';
import { runExercises, type RunExercise } from '@/lib/workout/run-exercises';
import type { SavedSet } from '@/app/actions/workout';

/**
 * 본운동 화면을 열 판 — 웹 화면(app/(session)/workout/run/page.tsx)과 앱 화면(app/actions/app-workout.ts → native/src/app/workout.tsx)이
 * 같이 쓴다. 둘이 따로 고르면 한쪽만 지난 판을 닫거나 워밍업을 건너뛰어 같은 판이 두 화면에서 다르게 열린다.
 *
 * 열 수 없으면 갈 곳(to)을 돌려준다 — 웹은 그리로 redirect, 앱은 화면을 닫고 웹을 그리로 보낸다.
 */
type ActiveSession = NonNullable<Awaited<ReturnType<typeof prisma.trainingSession.findFirst>>>;

export async function openRunSession(
  userId: string
): Promise<
  | { ok: true; session: ActiveSession & { mainStartedAt: Date }; plan: FrozenPlan }
  | { ok: false; to: string; error: string }
> {
  /*
   * 종료를 안 누르고 떠난 지난 판은 먼저 닫는다(lib/workout/close-stale.ts).
   *
   * 홈 화면에 추가한 앱은 마지막으로 보던 이 화면으로 다시 켜지기도 한다. 그때
   * 어젯밤 판을 그대로 열면 오늘 세트가 어제 날짜에 붙는다. 닫고 나서 열린 판이
   * 없으면 트레이닝으로 돌아가 오늘 판을 새로 연다.
   */
  await closeAbandonedSessions(userId);

  const session = await prisma.trainingSession.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { date: 'desc' },
  });
  if (!session) return { ok: false, to: '/training', error: '열려 있는 운동이 없어요.' };

  /*
   * 찍어 둔 목록을 못 읽거나 비어 있는 판은 여기서 닫는다(ABANDONED — 세트가 있으면 기록으로 접는다, lib/workout/close-stale.ts).
   *
   * 예전에는 트레이닝으로만 돌려보냈는데, [운동 시작]은 ACTIVE 판이 있으면 이 화면으로 보내서 둘 사이를 맴돌았다
   * (2026-10-16 점검 12). 닫아 두면 다음 [운동 시작]이 새 목록으로 다시 연다. 워밍업 판정보다 먼저 본다 — 워밍업 화면도
   * 목록이 없으면 트레이닝으로 보내기 때문이다. 트레이닝 화면은 이 꼬리(?closed=1)를 읽지 않는다.
   */
  const plan = readFrozenPlan(session.plan);
  if (!plan || plan.exercises.length === 0) {
    await closeAbandoned(userId, session, await lastSetAt(session.id), appNow());
    return { ok: false, to: '/training?closed=1', error: '오늘 운동 목록을 읽지 못했어요.' };
  }

  /*
   * 워밍업 창을 아직 안 지났다.
   *
   * mainStartedAt 은 그 창을 나갈 때 찍힌다. 비어 있다는 것은 [운동 시작]만
   * 누르고 주소를 직접 쳐서 들어왔다는 뜻이라, 창으로 돌려보낸다.
   */
  const { mainStartedAt } = session;
  if (!mainStartedAt) return { ok: false, to: '/workout/warmup', error: '워밍업을 먼저 해요.' };

  return { ok: true, session: { ...session, mainStartedAt }, plan };
}

/** 운동 화면이 그리는 것 — 웹 SessionClient 의 props 와 같은 모양 */
export type RunPayload = {
  sessionId: string;
  themeLabel: string;
  /** 근력 · 파워 프로그램 날이면 그 일차 — 끝내기 창이 '다음 일차로 가려면'을 말한다 */
  programDay: number | null;
  exercises: RunExercise[];
  initialSets: SavedSet[];
  /**
   * 이 판을 연 시각.
   *
   * 휴식 시계는 이 시각 뒤에 남긴 세트만 센다. 한 번 종료한 판을 다시
   * 열면 이 값이 새로 찍히므로, 아까 남긴 세트부터 계속 세지 않는다.
   * 그러지 않으면 종료하고 다시 들어왔을 때 '47분째 쉬는 중'이 떠서
   * 종료가 안 된 것처럼 보인다.
   */
  openedAt: string;
  /** 다시 연 판이면 앞서 마친 구간의 시간. 종료 요약이 여기에 더해 보여준다. */
  priorSeconds: number;
};

export async function runPayload(
  userId: string,
  session: ActiveSession & { mainStartedAt: Date },
  plan: FrozenPlan
): Promise<RunPayload> {
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
        rir: true,
      },
    }),
    /*
     * 찍어 둔 목록에 설명·영상·지난번 기록·내 메모·별을 붙인다. 운동 중에
     * 바꿔 넣은 운동도 같은 곳에서 만든다(lib/workout/run-exercises.ts).
     */
    runExercises(userId, plan.exercises, session.date),
  ]);

  return {
    sessionId: session.id,
    themeLabel: plan.themeLabel,
    programDay: plan.program?.day ?? null,
    exercises,
    initialSets: sets.map((s) => ({ ...s, recordedAt: s.recordedAt.toISOString() })),
    openedAt: session.mainStartedAt.toISOString(),
    priorSeconds: session.activeSeconds,
  };
}
