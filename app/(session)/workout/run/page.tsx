import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { recentAmounts } from '@/lib/report/exercise-recent';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { SessionClient, type RunExercise, type RunSet } from './session-client';

/**
 * 본운동 화면.
 *
 * 세션이 시작할 때 찍어 둔 목록을 그대로 돌린다. 오늘 일정을 다시 읽지
 * 않는다 — 운동 중에 목록이 바뀌면 안 되기 때문이다 (lib/workout/session-plan.ts).
 */
export default async function RunPage() {
  const user = await requireUser();

  const session = await prisma.trainingSession.findFirst({
    where: { userId: user.id, status: 'ACTIVE' },
    orderBy: { date: 'desc' },
  });
  if (!session) redirect('/training');

  const plan = readFrozenPlan(session.plan);
  if (!plan || plan.exercises.length === 0) redirect('/training');

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

  const exercises: RunExercise[] = plan.exercises.map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category,
    slot: e.slot,
    prescription: e.prescription,
    plannedSets: e.plannedSets,
    perSide: e.perSide,
    needsWeight: e.needsWeight,
    isHold: e.isHold,
    equipment: e.equipment,
    thumbUrl: e.thumbPath ? (thumbUrls[e.thumbPath] ?? null) : null,
    /* 가장 최근 한 번만. 여러 개를 보여주면 무엇을 따라갈지 흐려진다. */
    last: past.get(e.id)?.[0] ?? null,
  }));

  const saved: RunSet[] = sets.map((s) => ({
    ...s,
    recordedAt: s.recordedAt.toISOString(),
  }));

  return (
    <SessionClient
      themeLabel={plan.themeLabel}
      exercises={exercises}
      initialSets={saved}
    />
  );
}
