'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { summarizeSets } from '@/lib/workout/summarize';

/**
 * 며칠 전 것까지 고칠 수 있는가.
 *
 * 일주일이면 무엇을 했는지는 기억한다. 그보다 오래되면 기억이 아니라 짐작이
 * 되고, 짐작으로 채운 기록은 부하 지수를 흐린다.
 */
const BACKFILL_DAYS = 7;

/** 0보다 큰 수만 받는다. 빈칸이나 이상한 값은 '안 적음'으로 본다. */
function positiveNumber(value: unknown, max: number, step = 1): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return null;
  const snapped = Math.round(n / step) * step;
  // 0.1 + 0.2 같은 자리 오차를 없앤다
  const clean = Math.round(snapped * 100) / 100;
  return clean >= step && clean <= max ? clean : null;
}

/**
 * 그 운동을 했는지 표시한다. '했다/안 했다'만이다.
 *
 * 세트·횟수·무게는 여기서 안 받는다. 실시간 운동(/workout/run)에서 세트를
 * 남길 때마다 들어가고, 운동을 마치면 그 값이 이 줄에 그대로 쓰인다
 * (app/actions/workout.ts 의 finishWorkout). 이 표시는 앱 없이 한 운동이나
 * 체크를 깜빡한 날을 나중에 채우는 자리다 — 그때 몇 kg 들었는지를 지금 적게
 * 하면 그 숫자를 믿을 수가 없으니 아예 묻지 않는다.
 *
 * 날짜는 서버에서 정한다 — 기기 시계를 믿으면 어제 칸에 오늘 기록이
 * 들어가거나 같은 운동이 두 번 저장될 수 있다.
 */
export async function setExerciseDone(
  exerciseId: string,
  done: boolean,
  /**
   * 어느 날 것인가 (YYYY-MM-DD). 안 주면 오늘.
   *
   * 지난 날짜를 받는 이유는 하나다 — 운동은 했는데 체크를 깜빡하는 일이
   * 흔하고, 그러면 그 기록이 영영 안 들어간다. 부하 지수도 낮게 나오고,
   * '오래 안 한 것부터' 고르는 규칙도 그 운동을 안 한 것으로 본다.
   */
  dateKey?: string
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

  const todayKey = toDateKey(new Date());
  const target = dateKey ?? todayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
    return { error: '날짜가 올바르지 않습니다.' };
  }
  if (target > todayKey) {
    return { error: '아직 오지 않은 날짜에는 남길 수 없습니다.' };
  }
  if (target < shiftDateKey(todayKey, -BACKFILL_DAYS)) {
    return {
      error: `${BACKFILL_DAYS}일이 지난 기록은 고칠 수 없습니다. 그쯤이면 무엇을 했는지 정확히 기억하기 어렵습니다.`,
    };
  }
  const date = new Date(`${target}T00:00:00.000Z`);
  const key = { userId: user.id, exerciseId, date };

  if (done) {
    /*
     * 숫자는 그날 실시간 운동에서 남긴 세트에서 다시 셈한다.
     *
     * 체크를 끄면 줄이 통째로 지워진다(아래). 운동을 마친 뒤 체크를 잘못 눌러
     * 껐다 켜면, 줄이 빈 채로 다시 생겨 그날 남긴 세트·횟수·무게가 기록에서
     * 사라졌다. 세트 줄(UserExerciseSet)은 체크와 상관없이 남아 있으므로
     * 거기서 운동을 마칠 때와 같은 함수로 다시 접는다 — 세트가 진실이고,
     * 요약은 거기서 계산한다 (lib/workout/summarize.ts).
     *
     * 세트가 없으면(앱 없이 한 운동) '했다'만 남기고, 이미 있는 숫자는
     * 건드리지 않는다.
     */
    const session = await prisma.trainingSession.findUnique({
      where: { userId_date: { userId: user.id, date } },
      select: { id: true },
    });
    const rows = session
      ? await prisma.userExerciseSet.findMany({
          where: { sessionId: session.id, exerciseId },
          select: { exerciseId: true, weightKg: true, reps: true, holdSeconds: true },
        })
      : [];
    const [summary] = summarizeSets(rows);
    const amounts = summary
      ? {
          setsDone: summary.setsDone,
          repsDone: summary.repsDone,
          holdSecondsDone: summary.holdSecondsDone,
          weightKg: summary.weightKg,
        }
      : {};

    await prisma.userExerciseLog.upsert({
      where: { userId_exerciseId_date: key },
      create: { ...key, completed: true, ...amounts },
      update: { completed: true, ...amounts },
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
  memo: unknown,
  /**
   * 어느 날의 강도인가. 안 주면 오늘.
   *
   * 운동 세션이 이 값을 넘긴다. 세션은 시작할 때 날짜를 얼려 두고 세트도 그
   * 날짜로 남기는데, 강도만 '지금 날짜'로 넣으면 자정을 넘긴 운동에서 세트는
   * 어제, 강도는 오늘로 갈린다. 부하 계산은 둘을 날짜로 짝지으므로
   * (lib/training-load.ts), 그러면 실제로 운동한 날의 강도가 비어 '추정'으로
   * 빠진다.
   */
  dateKey?: string
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();

  const value = positiveNumber(intensity, 10);
  if (value == null) return { error: '운동 강도를 1~10 중에서 골라주세요.' };

  const text = typeof memo === 'string' ? memo.trim().slice(0, 1000) : '';
  const key = dateKey ?? toDateKey(new Date());
  const date = new Date(`${key}T00:00:00.000Z`);

  await prisma.dailyTrainingNote.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, intensity: value, memo: text || null },
    update: { intensity: value, memo: text || null },
  });

  revalidatePath('/today');
  revalidatePath('/training');
  return { ok: true };
}
