import 'server-only';
import { allExercises } from '@/lib/library-cache';
import { toDateKey } from '@/lib/pitch-stats';
import { prisma } from '@/lib/prisma';
import {
  RECOVERY_WINDOW_DAYS,
  partRecovery,
  type RecoveryDay,
  type RecoveryItem,
} from '@/lib/report/recovery';

/**
 * 부위별 회복도를 읽는다(lib/report/recovery.ts) — 오늘까지 엿새 동안 남긴 세트를 날 · 운동으로 묶어 센다.
 * 운동의 부위 · 강도는 라이브러리 캐시에서(숨긴 운동의 지난 기록도 센다). 조회는 한 번.
 */
export async function loadPartRecovery(userId: string, today: Date): Promise<Map<string, number>> {
  const midnight = new Date(`${toDateKey(today)}T00:00:00.000Z`);
  const from = new Date(midnight);
  from.setUTCDate(from.getUTCDate() - RECOVERY_WINDOW_DAYS);
  const [rows, library] = await Promise.all([
    prisma.userExerciseSet.groupBy({
      by: ['exerciseId', 'date'],
      where: { userId, date: { gte: from, lte: midnight } },
      _count: { _all: true },
    }),
    allExercises(),
  ]);
  if (rows.length === 0) return new Map();
  const byId = new Map(library.map((ex) => [ex.id, ex]));
  const days = new Map<number, RecoveryItem[]>();
  for (const row of rows) {
    const ex = byId.get(row.exerciseId);
    if (!ex) continue;
    const daysAgo = Math.round((midnight.getTime() - row.date.getTime()) / 86_400_000);
    const list = days.get(daysAgo) ?? [];
    list.push({ bodyParts: ex.bodyParts, intensity: ex.intensity, sets: row._count._all });
    days.set(daysAgo, list);
  }
  const input: RecoveryDay[] = [...days].map(([daysAgo, items]) => ({ daysAgo, items }));
  return partRecovery(input);
}
