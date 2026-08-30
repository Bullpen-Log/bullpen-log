'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { AMOUNT_LIMITS } from '@/lib/exercise-meta';

/** 0보다 큰 정수만 받는다. 빈칸이나 이상한 값은 '안 적음'으로 본다. */
function positiveInt(value: unknown, max: number): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= max ? rounded : null;
}

/*
 * 범위는 lib/exercise-meta.ts 에 있다. 화면도 같은 값을 봐야 한다 —
 * 화면이 더 큰 값을 받아주면 여기서 조용히 버려지고, 사용자는 저장된 줄 안다.
 */

/**
 * 오늘 그 운동을 했는지 표시하고, 실제로 한 만큼을 남긴다.
 *
 * 날짜는 서버에서 정한다 — 기기 시계를 믿으면 어제 칸에 오늘 기록이
 * 들어가거나 같은 운동이 두 번 저장될 수 있다.
 *
 * 세트·횟수는 안 적어도 된다. 적으면 운동 부하 계산에 실제 값이 쓰이고,
 * 안 적으면 '한 것은 맞지만 얼마나 했는지는 모름'으로 남는다. 계획값을 미리
 * 채워 주지 않는 것과 같은 이유다 — 안 한 것을 한 것처럼 세면 안 된다.
 */
export async function setExerciseDone(
  exerciseId: string,
  done: boolean,
  amount?: {
    sets?: unknown;
    reps?: unknown;
    holdSeconds?: unknown;
    weightKg?: unknown;
  }
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
    const value = {
      completed: true,
      setsDone: positiveInt(amount?.sets, AMOUNT_LIMITS.sets),
      repsDone: positiveInt(amount?.reps, AMOUNT_LIMITS.reps),
      holdSecondsDone: positiveInt(amount?.holdSeconds, AMOUNT_LIMITS.holdSeconds),
      weightKg: positiveInt(amount?.weightKg, AMOUNT_LIMITS.weightKg),
    };
    await prisma.userExerciseLog.upsert({
      where: { userId_exerciseId_date: key },
      create: { ...key, ...value },
      update: value,
    });
  } else {
    // 취소는 흔적을 남기지 않는다 — "안 했다"와 "표시를 지웠다"를 구분할 필요가 없다.
    await prisma.userExerciseLog.deleteMany({ where: key });
  }

  revalidatePath('/today');
  revalidatePath('/training');
  revalidatePath('/dashboard');
  return { ok: true };
}

/**
 * 오늘 운동이 어땠는지 — 하루에 하나.
 *
 * 세트·횟수는 운동마다 다르지만 "얼마나 힘들었나"는 하루에 하나면 된다.
 * 운동 열 개에 강도를 열 번 적게 하면 아무도 안 적는다.
 */
export async function saveTrainingNote(
  intensity: unknown,
  memo: unknown
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();

  const value = positiveInt(intensity, 10);
  if (value == null) return { error: '운동 강도를 1~10 중에서 골라주세요.' };

  const text = typeof memo === 'string' ? memo.trim().slice(0, 1000) : '';
  const date = new Date(`${toDateKey(new Date())}T00:00:00.000Z`);

  await prisma.dailyTrainingNote.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, intensity: value, memo: text || null },
    update: { intensity: value, memo: text || null },
  });

  revalidatePath('/today');
  revalidatePath('/training');
  return { ok: true };
}
