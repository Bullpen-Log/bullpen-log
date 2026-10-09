'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { isTutorialKey } from '@/lib/feature-locks';

/**
 * 튜토리얼을 봤다고 적는다(User.tutorialsDone). 기본 투어(tour:web · tour:app)와 탭 튜토리얼(pitch · training · nutrition)이
 * 닫힐 때 부른다. 같은 열쇠를 두 번 적지 않는다. 막대 · 홈이 같은 값을 보므로 레이아웃까지 새로 읽게 한다.
 */
export async function markTutorialDone(key: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !isTutorialKey(key)) return { ok: false };
  if (!user.tutorialsDone.includes(key)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { tutorialsDone: { push: key } },
    });
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * 튜토리얼을 다시 보려고 지운다(설정 › 정보 '사용 안내 다시 보기'). 열쇠 하나만.
 */
export async function resetTutorial(key: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !isTutorialKey(key)) return { ok: false };
  await prisma.user.update({
    where: { id: user.id },
    data: { tutorialsDone: { set: user.tutorialsDone.filter((k) => k !== key) } },
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}
