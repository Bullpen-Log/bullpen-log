import 'server-only';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import type { PriorBest } from '@/lib/workout/bests';

/**
 * 운동마다 오늘 앞의 최고 기록 — '새 최고'를 가르는 기준(lib/workout/bests.ts).
 *
 * 세트(실시간 운동)와 하루 요약(체크로 남긴 날) 둘 다 본다. 운동을 마친 날의 요약은 그날
 * 세트에서 접은 것이라 같은 값이 겹칠 뿐 틀리지 않는다. 오늘 것은 뺀다 — 지금 하는 판을
 * 넘을 기록으로 삼을 수는 없다. 기간은 자르지 않는다 — 최고 기록은 언제 것이든 최고다.
 *
 * 운동별로 가장 큰 값만 DB 가 접어 돌려준다(groupBy) — 세트를 다 읽지 않는다.
 */
export async function priorBests(
  userId: string,
  exerciseIds: readonly string[],
  /** 이날 앞의 기록만 — 세션 날짜 */
  before: Date
): Promise<Map<string, PriorBest>> {
  const result = new Map<string, PriorBest>();
  if (exerciseIds.length === 0) return result;

  const midnight = new Date(`${toDateKey(before)}T00:00:00.000Z`);
  const ids = [...exerciseIds];

  /*
   * 횟수 최고는 맨몸 세트(무게 없음 · 0)끼리만 — 무게 세트까지 섞으면 가벼운 무게로 많이 한 횟수가 맨몸 '새 최고'의
   * 기준이 돼 진짜 최고를 놓쳤다(2026-10-16 점검 A5, bests.ts 의 맨몸 비교와 같은 기준). 기록 줄도 무게 없는 줄만.
   */
  const bodyweight = { OR: [{ weightKg: null }, { weightKg: 0 }] };
  const [sets, bwSets, logs, bwLogs] = await Promise.all([
    prisma.userExerciseSet.groupBy({
      by: ['exerciseId'],
      where: { userId, exerciseId: { in: ids }, date: { lt: midnight } },
      _max: { weightKg: true, holdSeconds: true },
    }),
    prisma.userExerciseSet.groupBy({
      by: ['exerciseId'],
      where: { userId, exerciseId: { in: ids }, date: { lt: midnight }, ...bodyweight },
      _max: { reps: true },
    }),
    prisma.userExerciseLog.groupBy({
      by: ['exerciseId'],
      where: {
        userId,
        exerciseId: { in: ids },
        completed: true,
        date: { lt: midnight },
      },
      _max: { weightKg: true, holdSecondsDone: true },
    }),
    prisma.userExerciseLog.groupBy({
      by: ['exerciseId'],
      where: {
        userId,
        exerciseId: { in: ids },
        completed: true,
        date: { lt: midnight },
        ...bodyweight,
      },
      _max: { repsDone: true },
    }),
  ]);
  const bwReps = new Map(bwSets.map((s) => [s.exerciseId, s._max.reps]));
  const bwRepsDone = new Map(bwLogs.map((l) => [l.exerciseId, l._max.repsDone]));

  const larger = (a: number | null | undefined, b: number | null | undefined) =>
    a == null ? (b ?? null) : b == null ? a : Math.max(a, b);

  for (const s of sets) {
    result.set(s.exerciseId, {
      weightKg: s._max.weightKg,
      reps: bwReps.get(s.exerciseId) ?? null,
      holdSeconds: s._max.holdSeconds,
    });
  }
  for (const l of logs) {
    const had = result.get(l.exerciseId);
    result.set(l.exerciseId, {
      weightKg: larger(had?.weightKg, l._max.weightKg),
      reps: larger(had?.reps, bwRepsDone.get(l.exerciseId)),
      holdSeconds: larger(had?.holdSeconds, l._max.holdSecondsDone),
    });
  }
  return result;
}
