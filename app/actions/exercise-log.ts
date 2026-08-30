'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { AMOUNT_LIMITS, WEIGHT_PRECISION } from '@/lib/exercise-meta';

/**
 * 며칠 전 것까지 고칠 수 있는가.
 *
 * 일주일이면 무엇을 했는지는 기억한다. 그보다 오래되면 기억이 아니라 짐작이
 * 되고, 짐작으로 채운 기록은 부하 지수를 흐린다.
 */
const BACKFILL_DAYS = 7;

/**
 * 0보다 큰 수만 받는다. 빈칸이나 이상한 값은 '안 적음'으로 본다.
 *
 * step 은 값을 어디에 맞춰 자를지다. 세트·횟수는 1(정수), 무게는 0.5 —
 * 원판이 2.5kg 단위로 늘어나므로 62.5 를 담아야 한다.
 */
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
  },
  /**
   * 어느 날 것인가 (YYYY-MM-DD). 안 주면 오늘.
   *
   * 지난 날짜를 받는 이유는 하나다 — 운동은 했는데 체크를 깜빡하는 일이
   * 흔하고, 그러면 그 기록이 영영 안 들어간다. 부하 지수도 낮게 나오고,
   * '오래 안 한 것부터' 고르는 규칙도 그 운동을 안 한 것으로 본다.
   *
   * 다만 수치(세트·횟수·무게)는 오늘 것만 받는다. 사흘 전에 몇 kg 들었는지를
   * 지금 적으면 그 숫자를 믿을 수가 없다. 지난 날짜는 '했다/안 했다'만 남기고,
   * 부하는 계획 세트로 셈한다(그리고 추정으로 표시된다).
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
  const past = target !== todayKey;

  const date = new Date(`${target}T00:00:00.000Z`);
  const key = { userId: user.id, exerciseId, date };

  if (done) {
    /* 지난 날짜는 수치를 안 받는다 — 위 dateKey 설명 참고. */
    const value = past
      ? {
          completed: true,
          setsDone: null,
          repsDone: null,
          holdSecondsDone: null,
          weightKg: null,
        }
      : {
          completed: true,
          setsDone: positiveNumber(amount?.sets, AMOUNT_LIMITS.sets),
          repsDone: positiveNumber(amount?.reps, AMOUNT_LIMITS.reps),
          holdSecondsDone: positiveNumber(amount?.holdSeconds, AMOUNT_LIMITS.holdSeconds),
          weightKg: positiveNumber(amount?.weightKg, AMOUNT_LIMITS.weightKg, WEIGHT_PRECISION),
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

  const value = positiveNumber(intensity, 10);
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
