'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { CHECKIN_PARTS, validateCheckin, validateCheckinDate } from '@/lib/checkin';
import { availableParts } from '@/lib/report/today-pick';

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

  const parts = Object.fromEntries(
    CHECKIN_PARTS.map((p) => [p.key, String(formData.get(p.key) ?? '')])
  );
  /*
   * 고를 수 있는 부위는 라이브러리에서 그때그때 뽑는다.
   * 화면이 보여준 목록과 저장할 때 인정하는 목록이 같아야 하고,
   * 운동을 새로 올리면 코드를 고치지 않아도 따라온다.
   */
  const library = await prisma.exerciseVideo.findMany({
    select: { id: true, bodyParts: true },
  });

  const checked = validateCheckin(
    {
      ...parts,
      condition: String(formData.get('condition') ?? ''),
      sleep: String(formData.get('sleep') ?? ''),
    },
    {
      raw: formData.getAll('preferredParts').map(String),
      available: availableParts(library),
    }
  );
  if ('error' in checked) return checked;

  const date = new Date(`${dateKey}T00:00:00.000Z`);

  await prisma.dailyCheckin.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: checked.value,
    create: { userId: user.id, date, ...checked.value },
  });

  revalidatePath('/dashboard');
  // 통증·뻐근함은 오늘의 운동 후보를 바꾼다.
  revalidatePath('/today');
  return { success: '오늘 체크인을 저장했습니다.' };
}
