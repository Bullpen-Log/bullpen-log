import 'server-only';
import { allExercises } from '@/lib/library-cache';
import { dbDate } from '@/lib/nutrition/days';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { prisma } from '@/lib/prisma';
import { weekSetGroupOf, weekSetRows, type WeekSetKey, type WeekSetRow } from '@/lib/report/week-sets';

/** 이번 주(월요일부터) 동작 묶음마다 남긴 세트 수(lib/report/week-sets.ts) — 조회 한 번 */
export async function loadWeekSets(userId: string, today: Date): Promise<WeekSetRow[]> {
  const todayKey = toDateKey(today);
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const monday = dbDate(shiftDateKey(todayKey, -((dow + 6) % 7)));
  const [rows, library] = await Promise.all([
    prisma.userExerciseSet.groupBy({
      by: ['exerciseId'],
      where: { userId, date: { gte: monday } },
      _count: { _all: true },
    }),
    allExercises(),
  ]);
  const byId = new Map(library.map((ex) => [ex.id, ex]));
  const done = new Map<WeekSetKey, number>();
  for (const row of rows) {
    const ex = byId.get(row.exerciseId);
    const group = ex ? weekSetGroupOf(ex) : null;
    if (group) done.set(group, (done.get(group) ?? 0) + row._count._all);
  }
  return weekSetRows(done);
}
