import 'server-only';
import { prisma } from '@/lib/prisma';
import { allExercises } from '@/lib/library-cache';
import type { BurnMixItem } from '@/lib/nutrition/burn';

/**
 * 트레이닝 판마다 남긴 세트를 운동 분류 · 강도로 묶는다 — 운동 소모 칼로리(trainingBurn)가 쓴다.
 * 라이브러리에서 지운 운동은 모르는 강도라 빠진다(그 판은 남은 세트로만, 하나도 없으면 예전 고정값).
 */
export async function sessionBurnMixes(
  sessionIds: string[]
): Promise<Map<string, BurnMixItem[]>> {
  const out = new Map<string, BurnMixItem[]>();
  if (sessionIds.length === 0) return out;
  const [rows, library] = await Promise.all([
    prisma.userExerciseSet.groupBy({
      by: ['sessionId', 'exerciseId'],
      where: { sessionId: { in: sessionIds } },
      _count: { _all: true },
    }),
    allExercises(),
  ]);
  const byId = new Map(library.map((e) => [e.id, e]));
  for (const r of rows) {
    const ex = byId.get(r.exerciseId);
    if (!ex) continue;
    out.set(r.sessionId, [
      ...(out.get(r.sessionId) ?? []),
      { category: ex.category, intensity: ex.intensity, sets: r._count._all },
    ]);
  }
  return out;
}
