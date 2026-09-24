'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';

/**
 * 그날의 대표 영상을 고른다 — 영상 탭에서.
 *
 * 홈 캘린더에서 날짜를 누르면 그날 영상 하나를 그 자리에서 틀어 준다. 영상이 여럿인
 * 날에는 무엇을 띄울지 사람이 정한다. 고르지 않은 날은 그날 처음 올린 영상이 뜬다.
 *
 * 하루에 하나라 고르면 바뀐다(upsert). 고른 것을 되돌리는 단추는 두지 않는다 —
 * 되돌린다는 것은 결국 처음 올린 것을 고르는 것이라, 그것을 누르면 된다.
 */

type Result = { videoPath: string } | { error: string };

export async function setFeaturedVideo(
  dateKey: string,
  videoPath: string
): Promise<Result> {
  const user = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !videoPath) {
    return { error: '영상을 찾을 수 없습니다.' };
  }
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  /*
   * 그날 본인 기록에 실제로 붙어 있는 영상인지 본다. 경로는 화면에서 오는 값이라,
   * 확인하지 않으면 남의 영상이나 다른 날 영상을 대표로 끼워 넣을 수 있다.
   */
  const owned = await prisma.pitchLog.findFirst({
    where: { userId: user.id, date, videoPaths: { has: videoPath } },
    select: { id: true },
  });
  if (!owned) return { error: '이 날 올린 영상이 아닙니다.' };

  await prisma.dailyFeaturedVideo.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, videoPath },
    update: { videoPath },
  });

  /* 캘린더(홈)와 영상 탭 둘 다 이 값을 읽는다 */
  revalidatePath('/today');
  revalidatePath('/videos');
  return { videoPath };
}
