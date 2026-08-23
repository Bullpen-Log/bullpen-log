'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { pickMany } from '@/lib/exercise-meta';
import { ALWAYS_OWNED, SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { readTrainingProfile } from '@/lib/report/personalize';

/**
 * AI 트레이닝 화면의 설정.
 *
 * 예전에는 경력·목표·장비를 프로필에서 골랐는데, 정작 그 결과를 보는 곳은
 * 트레이닝 화면이라 "왜 이 운동이지?" 싶을 때마다 다른 화면으로 건너가야 했다.
 * 그래서 고르는 곳을 결과 옆으로 옮겼다.
 *
 * 두 가지를 나눠 둔다.
 *   오래 가는 것 — 경력·목표·가지고 있는 장비 (User)
 *   그날만인 것 — 오늘 쓸 수 있는 장비       (DailyTrainingSetup)
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
 * 오늘 쓸 수 있는 장비를 저장한다.
 *
 * 가지고 있는 것 중에서만 고를 수 있다. 프로필에서 장비를 뺐는데 오늘 목록에는
 * 남아 있는 경우가 생기므로, 저장할 때 한 번 더 맞춰본다.
 *
 * 하나도 안 고르면 그 줄을 지운다. 빈 목록으로 남겨두면 "오늘은 아무것도 못
 * 쓴다"는 뜻이 되어 맨몸 운동만 나오는데, 그건 실수로 다 껐을 때 벌어지는 일이지
 * 사용자가 바란 것이 아니다. 지우면 '아직 안 골랐다'로 돌아가 가진 것을 다 쓴다.
 */
export async function saveTodayEquipment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const owned = new Set(user.ownedEquipment);
  const chosen = pickMany(
    formData.getAll('availableEquipment').map(String),
    SELECTABLE_EQUIPMENT
  ).filter((name) => owned.has(name));

  const date = dateOnly(new Date());

  if (chosen.length === 0) {
    await prisma.dailyTrainingSetup.deleteMany({ where: { userId: user.id, date } });
  } else {
    const availableEquipment = [ALWAYS_OWNED, ...chosen];
    await prisma.dailyTrainingSetup.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { availableEquipment },
      create: { userId: user.id, date, availableEquipment },
    });
  }

  revalidatePath('/today');
  redirect('/today');
}
