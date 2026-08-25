'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { pickMany } from '@/lib/exercise-meta';
import { ALWAYS_OWNED, SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { readTrainingProfile } from '@/lib/report/personalize';
import { buildDailyPlan, isHalted } from '@/lib/report/daily-plan';
import {
  gatherFactsAndPlan,
  lastStrengthDates,
  recentExerciseIds,
} from '@/lib/report/gather';
import {
  DEFAULT_WORKOUT_MINUTES,
  WORKOUT_MINUTES_CHOICES,
} from '@/lib/report/theme';

/**
 * 트레이닝 화면의 설정과 일정 만들기.
 *
 * 예전에는 경력·목표·장비를 프로필에서 골랐는데, 정작 그 결과를 보는 곳은
 * 트레이닝 화면이라 "왜 이 운동이지?" 싶을 때마다 다른 화면으로 건너가야 했다.
 * 그래서 고르는 곳을 결과 옆으로 옮겼다.
 *
 * 세 가지를 나눠 둔다.
 *   오래 가는 것 — 경력·목표·가지고 있는 장비 (User)
 *   그날만인 것 — 오늘 쓸 수 있는 장비        (DailyTrainingSetup)
 *   눌러야 생기는 것 — 오늘의 운동 일정        (DailyTrainingSetup.plan)
 */

/** 날짜 하나를 DB에 넣을 형태로. 시간대는 서비스 기준(한국)으로 센다. */
function dateOnly(today: Date) {
  return new Date(`${toDateKey(today)}T00:00:00.000Z`);
}

/**
 * 경력·목표·가지고 있는 장비를 저장한다.
 *
 * 값이 목록에 없으면 readTrainingProfile 이 버린다. 여기서 걸러진 값은
 * 그대로 DB에 남아 운동을 고르는 데 쓰이므로, 걸러내는 일이 중요하다.
 *
 * 이미 만들어 둔 오늘 일정은 건드리지 않는다. 설정을 고쳤다고 눈앞의 일정이
 * 말없이 바뀌면, 하던 운동이 어디 갔는지 알 수 없다. 새 설정으로 받고 싶으면
 * '다시 만들기'를 누르면 된다.
 */
export async function saveTrainingSettings(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  await prisma.user.update({
    where: { id: user.id },
    data: readTrainingProfile(formData),
  });

  revalidatePath('/today');
  redirect('/today');
}

/**
 * 오늘의 운동 일정을 만든다.
 *
 * 폼에서 오늘 쓸 수 있는 장비와 운동 시간을 함께 받는다. 둘 다 일정을 만드는
 * 재료라 따로 저장했다가 따로 만들 이유가 없다.
 *
 * 통증 등으로 처방을 멈춰야 하는 날에는 아무것도 저장하지 않는다. 그런 날
 * 빈 일정을 남겨두면, 나중에 몸이 괜찮아졌을 때 '이미 만든 날'로 보여서
 * 다시 만들 수가 없다.
 */
export async function generateTodayPlan(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  /*
   * 오늘 쓸 수 있는 장비. 가지고 있는 것 중에서만 고를 수 있다 — 설정에서
   * 장비를 뺐는데 폼에는 남아 있는 경우가 생긴다.
   */
  const owned = new Set(user.ownedEquipment);
  const chosen = pickMany(
    formData.getAll('availableEquipment').map(String),
    SELECTABLE_EQUIPMENT
  ).filter((name) => owned.has(name));
  /*
   * 하나도 안 고르면 빈 목록으로 둔다. 그러면 '아직 안 고른 날'과 같은 뜻이
   * 되어 가진 것을 다 쓴다. 실수로 다 껐을 때 맨몸 운동만 나오는 것보다 낫다.
   */
  const availableEquipment = chosen.length > 0 ? [ALWAYS_OWNED, ...chosen] : [];

  const rawMinutes = Number.parseInt(String(formData.get('minutes') ?? ''), 10);
  const requestedMinutes = (WORKOUT_MINUTES_CHOICES as readonly number[]).includes(
    rawMinutes
  )
    ? rawMinutes
    : (user.dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES);

  const today = new Date();
  const { facts, plan } = await gatherFactsAndPlan(user, today);
  const [library, recentIds, strengthDates] = await Promise.all([
    prisma.exerciseVideo.findMany({ orderBy: { createdAt: 'asc' } }),
    recentExerciseIds(user.id, today),
    lastStrengthDates(user.id, today),
  ]);

  const built = buildDailyPlan({
    user,
    facts,
    plan,
    library,
    availableToday: availableEquipment.length > 0 ? availableEquipment : null,
    requestedMinutes,
    recentIds,
    lastLowerKey: strengthDates.lower,
    lastUpperKey: strengthDates.upper,
  });

  const date = dateOnly(today);

  if (isHalted(built)) {
    // 만들 수 없는 날. 고른 장비만 남기고 일정은 비워 둔다.
    await prisma.dailyTrainingSetup.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { availableEquipment, plan: Prisma.DbNull, generatedAt: null },
      create: { userId: user.id, date, availableEquipment },
    });
  } else {
    const saved = {
      availableEquipment,
      plan: built as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(),
    };
    await prisma.dailyTrainingSetup.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: saved,
      create: { userId: user.id, date, ...saved },
    });
  }

  // 이 시간을 앞으로도 쓰겠다고 했으면 기본값으로 굳힌다.
  if (formData.get('saveMinutes') === 'on') {
    await prisma.user.update({
      where: { id: user.id },
      data: { dailyWorkoutMinutes: requestedMinutes },
    });
  }

  revalidatePath('/today');
  redirect('/today');
}
