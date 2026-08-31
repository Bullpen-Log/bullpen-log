import { prisma } from '@/lib/prisma';

/**
 * 즐겨찾기 읽기.
 *
 * 켜고 끄는 것은 app/actions/favorite.ts 에 있고, 읽기만 여기 둔다.
 * 'use server' 파일에서 내보내면 그 함수는 전부 브라우저가 부를 수 있는
 * 액션이 된다 — userId 를 받는 읽기 함수를 그렇게 두면 남의 것도 부를 수 있다.
 * 게다가 Set 은 서버 액션 경계를 못 넘는다.
 */

/** 이 사람이 별을 달아 둔 운동 id. 화면에서 별을 채워 그리는 데 쓴다. */
export async function favoriteExerciseIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.userExerciseFavorite.findMany({
    where: { userId },
    select: { exerciseId: true },
  });
  return new Set(rows.map((r) => r.exerciseId));
}

/** 이 사람이 별을 달아 둔 드릴 id */
export async function favoriteDrillIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.userDrillFavorite.findMany({
    where: { userId },
    select: { guideId: true },
  });
  return new Set(rows.map((r) => r.guideId));
}
