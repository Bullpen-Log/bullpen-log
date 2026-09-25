'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { cleanExerciseNote } from '@/lib/exercise-meta';

/**
 * 운동별 내 메모를 저장한다 — 운동 하나에 하나, 고치면 덮어쓴다.
 *
 * 비우고 저장하면 지운다. 빈 메모를 남겨 두면 운동 화면과 라이브러리에 빈
 * '내 메모' 칸이 뜬다.
 *
 * revalidatePath 를 부르지 않는다. 메모는 운동 화면에서 쓰는데, 부르면 서버가
 * 그 화면을 통째로 다시 그려 보낸다 — 세트 저장이 일부러 피하는 일이다
 * (app/actions/workout.ts 맨 위). 라이브러리는 열 때마다 새로 그리는
 * 화면이라(로그인한 사람마다 다른 화면은 이동할 때 캐시를 쓰지 않는다),
 * 다음에 열면 바뀐 메모가 보인다.
 */
export async function saveExerciseNote(input: {
  exerciseId: string;
  body: string;
}): Promise<{ note: string | null } | { error: string }> {
  const user = await requireUser();
  const exerciseId = typeof input?.exerciseId === 'string' ? input.exerciseId : '';
  if (!exerciseId) return { error: '운동을 찾을 수 없습니다.' };

  const body = cleanExerciseNote(input.body);

  if (!body) {
    await prisma.userExerciseNote.deleteMany({
      where: { userId: user.id, exerciseId },
    });
    return { note: null };
  }

  /*
   * 없는 운동에는 달지 않는다. 외래 키가 없어서(relationMode = "prisma") DB 가
   * 막아 주지 않는다.
   *
   * 숨긴 운동은 받는다. 숨기기 전에 시작한 운동 판에는 그대로 들어 있고,
   * 메모는 지난 기록처럼 그 사람의 것이다.
   */
  const exercise = await prisma.exerciseVideo.findUnique({
    where: { id: exerciseId },
    select: { id: true },
  });
  if (!exercise) return { error: '운동을 찾을 수 없습니다.' };

  await prisma.userExerciseNote.upsert({
    where: { userId_exerciseId: { userId: user.id, exerciseId } },
    create: { userId: user.id, exerciseId, body },
    update: { body },
  });
  return { note: body };
}
