import 'server-only';
import { prisma } from '@/lib/prisma';

/** 운동 선호 — 덜 추천 · 다시 추천 안 함(UserExercisePref). '더 자주'는 즐겨찾기(lib/favorites.ts)다 */
export type ExercisePref = 'less' | 'never';

export const isExercisePref = (v: unknown): v is ExercisePref => v === 'less' || v === 'never';

/** 이 사람이 표시해 둔 운동 → 선호. 표시 안 한 운동은 지도에 없다(보통) */
export async function exercisePrefs(userId: string): Promise<Map<string, ExercisePref>> {
  const rows = await prisma.userExercisePref.findMany({
    where: { userId },
    select: { exerciseId: true, pref: true },
  });
  return new Map(rows.flatMap((r) => (isExercisePref(r.pref) ? [[r.exerciseId, r.pref] as const] : [])));
}
