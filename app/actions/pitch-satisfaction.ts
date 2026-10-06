'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { isRatedSession, readSatisfaction } from '@/lib/pitch-satisfaction';

/**
 * 홈 카드('오늘 불펜 어땠어요?')에서 투구 만족도만 매긴다. 칩 · 메모는 투구 기록 창에서 고친다.
 *
 * 투구 기록 API(PATCH)는 종류 · 투구수 · 강도까지 다 받아야 해서 한 번 누르기에 맞지 않다.
 */
export async function ratePitchLog(
  id: string,
  satisfaction: number
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const read = readSatisfaction(satisfaction);
  if ('error' in read) return read;
  if (read.value == null) return { error: '투구 만족도를 골라 주세요' };

  const log = await prisma.pitchLog.findFirst({
    where: { id, userId: user.id },
    select: { id: true, sessionType: true },
  });
  if (!log) return { error: '기록을 찾을 수 없어요' };
  if (!isRatedSession(log.sessionType)) {
    return { error: '이 투구 종류는 만족도를 받지 않아요' };
  }

  await prisma.pitchLog.update({ where: { id: log.id }, data: { satisfaction: read.value } });
  return { ok: true };
}
