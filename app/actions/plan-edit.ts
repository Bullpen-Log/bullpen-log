'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { readDailyPlan } from '@/lib/report/daily-plan';
import { slotForTheme } from '@/lib/report/theme';

/**
 * 오늘 일정에서 운동을 빼고 더한다.
 *
 * 만들어 준 목록을 그대로 하는 사람은 없다. 오늘은 어깨가 뻐근해서 벤치를
 * 빼고 싶고, 팀에서 하던 운동을 하나 넣고 싶다. 그때마다 일정을 통째로 다시
 * 만들게 하면 이미 체크해 둔 것까지 날아간다.
 *
 * 여기서는 저장해 둔 일정(DailyTrainingSetup.plan)의 picks 만 고친다. 테마도
 * 시간 배분도 그대로 둔다 — 사용자가 바꾸겠다고 한 것은 목록이지 그날의
 * 성격이 아니다.
 */

type Result = { ok: true } | { error: string };

/** 오늘 일정을 읽어 온다. 없으면 고칠 것도 없다. */
async function loadToday(userId: string) {
  const date = new Date(`${toDateKey(new Date())}T00:00:00.000Z`);
  const setup = await prisma.dailyTrainingSetup.findUnique({
    where: { userId_date: { userId, date } },
    select: { plan: true },
  });
  return { date, plan: readDailyPlan(setup?.plan) };
}

async function savePicks(
  userId: string,
  date: Date,
  plan: NonNullable<ReturnType<typeof readDailyPlan>>,
  picks: NonNullable<ReturnType<typeof readDailyPlan>>['picks']
) {
  await prisma.dailyTrainingSetup.update({
    where: { userId_date: { userId, date } },
    data: { plan: { ...plan, picks } as unknown as Prisma.InputJsonValue },
  });
  revalidatePath('/training');
  revalidatePath('/today');
}

/**
 * 오늘 목록에서 운동 하나를 뺀다.
 *
 * 이미 완료 표시를 해 둔 운동이면 그 표시도 함께 지운다. 목록에서 뺐다는 것은
 * "오늘 한 일이 아니다"라는 뜻인데, 완료 기록만 남으면 부하 계산에는 한 것으로
 * 잡히고 목록에는 없는 어긋난 상태가 된다. 다시 넣고 다시 체크하면 된다.
 */
export async function removeFromTodayPlan(exerciseId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { date, plan } = await loadToday(user.id);
  if (!plan) return { error: '오늘 만들어 둔 일정이 없습니다.' };

  const picks = plan.picks.filter((p) => p.exerciseId !== exerciseId);
  if (picks.length === plan.picks.length) {
    return { error: '오늘 목록에 없는 운동입니다.' };
  }

  await prisma.userExerciseLog.deleteMany({
    where: { userId: user.id, date, exerciseId },
  });
  await savePicks(user.id, date, plan, picks);
  return { ok: true };
}

/**
 * 오늘 목록에 운동 하나를 더한다.
 *
 * 안전 필터를 통과했는지 여기서 따지지 않는다. 통과하지 못한 운동을 넣으면
 * 화면이 그 사실을 표시하고, 하고 말고는 본인이 정한다. 통증이 있는 날에는
 * 애초에 목록 자체가 안 나오므로 여기까지 오지 않는다.
 */
export async function addToTodayPlan(exerciseId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { date, plan } = await loadToday(user.id);
  if (!plan) return { error: '오늘 만들어 둔 일정이 없습니다.' };
  if (plan.picks.some((p) => p.exerciseId === exerciseId)) {
    return { error: '이미 오늘 목록에 있습니다.' };
  }

  const exercise = await prisma.exerciseVideo.findUnique({
    where: { id: exerciseId },
    select: { id: true, category: true, intensity: true, bodyParts: true },
  });
  if (!exercise) return { error: '없는 운동입니다.' };

  /*
   * 자기 구간에 넣는다. 맨 뒤에 붙이면 워밍업을 더했는데 암케어 뒤에 오게
   * 되어, 위에서 아래로 따라 하는 순서가 뜻을 잃는다.
   */
  const slot = slotForTheme(exercise, plan.theme.key);
  await savePicks(user.id, date, plan, [
    ...plan.picks,
    { exerciseId, slot, manual: true },
  ]);
  return { ok: true };
}
