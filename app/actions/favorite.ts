'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';

/**
 * 즐겨찾기 — 운동과 드릴에 별을 달고 뗀다.
 *
 * 쓰이는 자리가 분명하다. 앱이 오늘 일정을 만들어 주지만 그대로 하는 사람은
 * 없다. 마음에 안 드는 것은 빼고 하고 싶은 것을 더하는데, 그때 운동 445개와
 * 드릴 116개 중에서 "그거"를 다시 찾는 것이 매번 일이었다. 별을 달아두면
 * 고르는 창에서 맨 위에 모여 있다.
 *
 * 여기서 하는 일은 그것뿐이다. 별을 달았다고 앱이 그 운동을 더 자주 내보내지
 * 않는다. 같은 운동만 반복하지 않도록 텀을 두고 돌리기로 한 결정이 있고,
 * 즐겨찾기가 추천에 끼면 그 결정을 되돌리는 셈이 된다. 이 표는 '찾기'에만 쓴다.
 */

/** 화면이 한 가지 방법으로 받도록, 켠 뒤의 상태를 돌려준다. */
type Result = { favorite: boolean } | { error: string };

export async function toggleExerciseFavorite(exerciseId: string): Promise<Result> {
  const user = await requireUser();
  if (!exerciseId) return { error: '운동을 찾을 수 없습니다.' };

  const where = { userId_exerciseId: { userId: user.id, exerciseId } };
  const existing = await prisma.userExerciseFavorite.findUnique({ where });

  if (existing) {
    await prisma.userExerciseFavorite.delete({ where });
  } else {
    /*
     * 숨긴 운동에는 별을 달 수 없다. 목록에 안 나오는 것에 별만 남으면,
     * 즐겨찾기만 걸러 봤을 때 "있다는데 안 보이는" 항목이 생긴다.
     */
    const exercise = await prisma.exerciseVideo.findFirst({
      where: { id: exerciseId, hiddenAt: null },
      select: { id: true },
    });
    if (!exercise) return { error: '운동을 찾을 수 없습니다.' };
    await prisma.userExerciseFavorite.create({ data: { userId: user.id, exerciseId } });
  }

  revalidatePath('/library/training');
  revalidatePath('/training');
  return { favorite: !existing };
}

export async function toggleDrillFavorite(guideId: string): Promise<Result> {
  const user = await requireUser();
  if (!guideId) return { error: '드릴을 찾을 수 없습니다.' };

  const where = { userId_guideId: { userId: user.id, guideId } };
  const existing = await prisma.userDrillFavorite.findUnique({ where });

  if (existing) {
    await prisma.userDrillFavorite.delete({ where });
  } else {
    const guide = await prisma.mechanicsGuide.findUnique({
      where: { id: guideId },
      select: { id: true },
    });
    if (!guide) return { error: '드릴을 찾을 수 없습니다.' };
    await prisma.userDrillFavorite.create({ data: { userId: user.id, guideId } });
  }

  revalidatePath('/library/mechanics');
  revalidatePath('/training');
  return { favorite: !existing };
}
