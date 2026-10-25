import 'server-only';
import { prisma } from '@/lib/prisma';
import { shiftDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';

export type ArmcareHistoryItem = { on: string; title: string; amount: string };

/** 과거에 수행한 보류 운동도 기록으로는 보존한다. 다시 하기 링크나 건강 점수로 바꾸지 않는다. */
export async function loadArmcareHistory(
  userId: string,
  todayKey: string
): Promise<ArmcareHistoryItem[]> {
  const rows = await prisma.userExerciseLog.findMany({
    where: {
      userId,
      completed: true,
      date: { gte: dbDate(shiftDateKey(todayKey, -13)), lte: dbDate(todayKey) },
      exercise: { category: '암케어' },
    },
    select: {
      date: true,
      setsDone: true,
      repsDone: true,
      holdSecondsDone: true,
      exercise: { select: { title: true } },
    },
    orderBy: [{ date: 'desc' }, { exerciseId: 'asc' }],
    take: 20,
  });
  return rows.map((r) => ({
    on: keyOfDbDate(r.date),
    title: r.exercise.title,
    amount:
      r.setsDone != null && (r.repsDone != null || r.holdSecondsDone != null)
        ? `${r.setsDone}세트 × ${r.repsDone != null ? `${r.repsDone}회` : `${r.holdSecondsDone}초`}`
        : '수행 체크 · 실제 양 미기록',
  }));
}
