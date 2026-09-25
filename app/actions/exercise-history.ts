'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { buildExerciseHistory, type ExerciseHistory } from '@/lib/workout/history';

/**
 * 운동 하나의 지난 기록 — 운동별 기록 화면(components/exercise-history.tsx)이
 * 열릴 때 부른다.
 *
 * 운동 화면·라이브러리·트레이닝의 날짜별 기록, 세 곳에서 같은 것을 연다.
 * 화면을 열 때 미리 싣지 않고 누를 때 받는다 — 운동 화면에 열 개 운동의 1년치
 * 기록을 미리 실으면 화면이 무거워지는데, 보는 것은 그중 한두 개다.
 *
 * 읽기만 하고, 로그인한 사람 자기 기록만 읽는다.
 */

/** 얼마나 옛날 것까지 볼 것인가. 1년 전 무게는 지금 기준이 되기 어렵다. */
const WINDOW_DAYS = 365;

export async function exerciseHistory(input: {
  exerciseId: string;
  /**
   * 운동 화면에서 열었으면 지금 하는 판의 번호. 그 판의 세트와 그날 요약은
   * 뺀다 — 지금 적고 있는 것을 '지난 기록'이라고 보여줄 수는 없다.
   */
  excludeSessionId?: string;
}): Promise<{ history: ExerciseHistory; note: string | null } | { error: string }> {
  const user = await requireUser();
  const exerciseId = typeof input?.exerciseId === 'string' ? input.exerciseId : '';
  if (!exerciseId) return { error: '운동을 찾을 수 없습니다.' };

  const todayKey = toDateKey(new Date());
  const from = new Date(`${todayKey}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - WINDOW_DAYS);

  const session =
    typeof input.excludeSessionId === 'string' && input.excludeSessionId
      ? await prisma.trainingSession.findFirst({
          where: { id: input.excludeSessionId, userId: user.id },
          select: { id: true, date: true },
        })
      : null;

  const [sets, logs, note] = await Promise.all([
    prisma.userExerciseSet.findMany({
      where: {
        userId: user.id,
        exerciseId,
        date: { gte: from },
        ...(session && { sessionId: { not: session.id } }),
      },
      orderBy: [{ date: 'desc' }, { setNo: 'asc' }],
      select: {
        date: true,
        setNo: true,
        weightKg: true,
        reps: true,
        holdSeconds: true,
      },
      /* 하루 열 세트를 1년 내내 해도 넘지 않는다. 끝없이 읽지 않게 막아 둔다 */
      take: 4000,
    }),
    prisma.userExerciseLog.findMany({
      where: {
        userId: user.id,
        exerciseId,
        completed: true,
        date: session ? { gte: from, not: session.date } : { gte: from },
      },
      orderBy: { date: 'desc' },
      select: {
        date: true,
        setsDone: true,
        repsDone: true,
        holdSecondsDone: true,
        weightKg: true,
      },
    }),
    prisma.userExerciseNote.findUnique({
      where: { userId_exerciseId: { userId: user.id, exerciseId } },
      select: { body: true },
    }),
  ]);

  return {
    history: buildExerciseHistory(
      sets.map((s) => ({ ...s, date: toDateKey(s.date) })),
      logs.map((l) => ({ ...l, date: toDateKey(l.date) })),
      todayKey
    ),
    note: note?.body ?? null,
  };
}
