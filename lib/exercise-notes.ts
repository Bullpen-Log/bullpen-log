import { prisma } from '@/lib/prisma';

/**
 * 운동별 내 메모 읽기.
 *
 * 저장은 app/actions/exercise-note.ts 에 있고, 읽기만 여기 둔다 — 즐겨찾기
 * (lib/favorites.ts)와 같은 까닭이다. 'use server' 파일에서 내보내면 그 함수는
 * 브라우저가 부를 수 있는 액션이 되는데, userId 를 받는 읽기를 그렇게 두면
 * 남의 메모도 읽을 수 있다.
 */

/**
 * 운동 id → 메모.
 *
 * ids 를 주면 그 운동들만 읽는다. 운동 화면은 오늘 목록에 든 것만 있으면 되고,
 * 라이브러리는 전부 필요하다.
 */
export async function exerciseNotes(
  userId: string,
  exerciseIds?: readonly string[]
): Promise<Map<string, string>> {
  const rows = await prisma.userExerciseNote.findMany({
    where: exerciseIds ? { userId, exerciseId: { in: [...exerciseIds] } } : { userId },
    select: { exerciseId: true, body: true },
  });
  return new Map(rows.map((r) => [r.exerciseId, r.body]));
}
