'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { validateCheckin, validateCheckinDate } from '@/lib/checkin';

export type CheckinState = { error?: string; success?: string } | undefined;

/** 오늘의 몸상태 체크인을 저장한다. 이미 있으면 덮어쓴다. */
export async function saveCheckin(
  _prev: CheckinState,
  formData: FormData
): Promise<CheckinState> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 날짜는 사용자 시간대 기준의 오늘을 폼에서 받는다.
  // 서버(UTC) 기준 자정 근처에 한국은 이미 다음 날이기 때문이다.
  const dateKey = String(formData.get('date') ?? '');
  if (!validateCheckinDate(dateKey)) {
    return { error: '체크인 날짜가 올바르지 않습니다. 새로고침 후 다시 시도해주세요.' };
  }

  const checked = validateCheckin({
    shoulder: String(formData.get('shoulder') ?? ''),
    elbow: String(formData.get('elbow') ?? ''),
    fatigue: String(formData.get('fatigue') ?? ''),
    sleep: String(formData.get('sleep') ?? ''),
    equipment: String(formData.get('equipment') ?? ''),
  });
  if ('error' in checked) return checked;

  const date = new Date(`${dateKey}T00:00:00.000Z`);

  await prisma.dailyCheckin.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: checked.value,
    create: { userId: user.id, date, ...checked.value },
  });

  revalidatePath('/dashboard');
  return { success: '오늘 체크인을 저장했습니다.' };
}
