'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';

/**
 * 오늘 그 운동을 했는지 표시한다.
 *
 * 날짜는 서버에서 정한다 — 기기 시계를 믿으면 어제 칸에 오늘 기록이
 * 들어가거나 같은 운동이 두 번 저장될 수 있다.
 */
export async function setExerciseDone(
  exerciseId: string,
  done: boolean
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();

  if (typeof exerciseId !== 'string' || !exerciseId) {
    return { error: '잘못된 요청입니다.' };
  }

  const exercise = await prisma.exerciseVideo.findUnique({
    where: { id: exerciseId },
    select: { id: true },
  });
  if (!exercise) return { error: '운동을 찾을 수 없습니다.' };

  const date = new Date(`${toDateKey(new Date())}T00:00:00.000Z`);
  const key = { userId: user.id, exerciseId, date };

  if (done) {
    await prisma.userExerciseLog.upsert({
      where: { userId_exerciseId_date: key },
      create: { ...key, completed: true },
      update: { completed: true },
    });
  } else {
    // 취소는 흔적을 남기지 않는다 — "안 했다"와 "표시를 지웠다"를 구분할 필요가 없다.
    await prisma.userExerciseLog.deleteMany({ where: key });
  }

  revalidatePath('/today');
  revalidatePath('/dashboard');
  return { ok: true };
}
