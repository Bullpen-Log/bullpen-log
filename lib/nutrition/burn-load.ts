import 'server-only';
import { prisma } from '@/lib/prisma';
import { allExercises } from '@/lib/library-cache';
import type { BurnMixItem } from '@/lib/nutrition/burn';

/**
 * 트레이닝 판마다 남긴 세트를 운동 분류 · 강도로 묶는다 — 운동 소모 칼로리(trainingBurn)가 쓴다.
 * 라이브러리에서 지운 운동은 모르는 강도라 빠진다(그 판은 남은 세트로만, 하나도 없으면 예전 고정값).
 *
 * 날짜 범위로 읽는다 — 판 목록을 기다리지 않고 판 조회와 같이 돌린다(2026-10-15 탭 전환 속도: 예전엔 판을 읽은 뒤에야 세트를
 * 읽어 왕복이 하나 더 쌓였다). 세트 표의 userId · date 색인을 탄다. 자정을 넘긴 판의 세트도 잡게 앞뒤 하루를 더 읽는다 —
 * 결과는 판 번호로 찾으니 범위 밖 판의 줄은 쓰이지 않는다.
 */
export async function burnMixesInRange(
  userId: string,
  from: Date,
  to: Date
): Promise<Map<string, BurnMixItem[]>> {
  const day = 86_400_000;
  const [rows, library] = await Promise.all([
    prisma.userExerciseSet.groupBy({
      by: ['sessionId', 'exerciseId'],
      where: {
        userId,
        date: { gte: new Date(from.getTime() - day), lte: new Date(to.getTime() + day) },
      },
      _count: { _all: true },
    }),
    allExercises(),
  ]);
  return mixesOf(rows, library);
}

function mixesOf(
  rows: { sessionId: string; exerciseId: string; _count: { _all: number } }[],
  library: Awaited<ReturnType<typeof allExercises>>
): Map<string, BurnMixItem[]> {
  const out = new Map<string, BurnMixItem[]>();
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
