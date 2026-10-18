'use server';

import { requireUser } from '@/lib/dal';
import { appNow } from '@/lib/clock';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { loadTrainingMarkedDays } from '@/lib/training-week';
import { TRAINING_CALENDAR_BACK_DAYS } from '@/lib/training-part';

/**
 * 트레이닝 간이 달력의 점 — 지난 1년 동안 무엇이든 한 날. 달력을 처음 열 때 한 번 부른다(홈을 그릴 때 1년치를 읽으면
 * 탭이 그만큼 늦게 뜬다).
 */
export async function trainingMarkedDays(): Promise<string[]> {
  const user = await requireUser();
  const today = toDateKey(appNow());
  return loadTrainingMarkedDays(user.id, shiftDateKey(today, -TRAINING_CALENDAR_BACK_DAYS), today);
}
