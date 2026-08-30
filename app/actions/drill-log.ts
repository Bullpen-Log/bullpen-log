'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';

/**
 * 오늘 할 드릴을 담고, 빼고, 했다고 표시한다.
 *
 * 운동과 다른 점이 하나 있다. 운동은 앱이 골라서 목록을 만들어 주지만, 드릴은
 * 선수가 직접 고른다. 어떤 드릴이 필요한지는 자기 폼을 보는 사람이 정할 일이고,
 * 우리가 가진 것으로는 "이 사람은 스트라이드가 짧으니 이 드릴"이라고 말할 수
 * 없다. 그래서 여기에는 추천하는 코드가 없다 — 담기·빼기·체크뿐이다.
 *
 * 세트나 횟수도 받지 않는다. 같은 이유다.
 */

/** 담기·빼기·체크가 모두 같은 모양으로 답한다. 화면이 한 가지 방법으로 받는다. */
type Result = { ok: true } | { error: string };

/** 하루에 담을 수 있는 드릴 수. 목록이 훈련이 아니라 숙제처럼 보이지 않게. */
const MAX_PER_DAY = 8;

function today() {
  return new Date(`${toDateKey(new Date())}T00:00:00.000Z`);
}

export async function addDrillToToday(guideId: string): Promise<Result> {
  const user = await requireUser();
  if (!guideId) return { error: '드릴을 찾을 수 없습니다.' };

  const guide = await prisma.mechanicsGuide.findUnique({
    where: { id: guideId },
    select: { id: true },
  });
  if (!guide) return { error: '드릴을 찾을 수 없습니다.' };

  const date = today();
  const count = await prisma.userDrillLog.count({ where: { userId: user.id, date } });
  if (count >= MAX_PER_DAY) {
    return { error: `오늘 담을 수 있는 드릴은 ${MAX_PER_DAY}개까지입니다.` };
  }

  await prisma.userDrillLog.upsert({
    where: { userId_guideId_date: { userId: user.id, guideId, date } },
    // 이미 담겨 있으면 그대로 둔다. 체크해 둔 것을 풀어버리면 안 된다.
    update: {},
    create: { userId: user.id, guideId, date, done: false },
  });

  revalidatePath('/training');
  return { ok: true };
}

export async function removeDrillFromToday(guideId: string): Promise<Result> {
  const user = await requireUser();
  await prisma.userDrillLog.deleteMany({
    where: { userId: user.id, guideId, date: today() },
  });
  revalidatePath('/training');
  return { ok: true };
}

export async function setDrillDone(guideId: string, done: boolean): Promise<Result> {
  const user = await requireUser();
  const date = today();

  /*
   * 담지 않고 바로 체크하는 길도 열어 둔다. 라이브러리에서 보다가 그 자리에서
   * 했다고 표시하는 것이 자연스러운 날이 있다.
   */
  await prisma.userDrillLog.upsert({
    where: { userId_guideId_date: { userId: user.id, guideId, date } },
    update: { done },
    create: { userId: user.id, guideId, date, done },
  });

  revalidatePath('/training');
  return { ok: true };
}
