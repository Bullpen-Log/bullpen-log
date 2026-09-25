import 'server-only';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { basicFood } from '@/lib/nutrition/foods';
import type { Food, RankedFood } from '@/lib/nutrition/meta';

/**
 * 인기 음식 — 이 앱을 쓰는 사람들이 가장 많이 담은 20가지.
 *
 * 음식 담기 창의 '전체 음식 → 인기'에 순위대로 나온다. 같은 운동을 하는 사람들이
 * 실제로 무엇을 먹는지가 곧 가장 쓸모 있는 추천이다.
 *
 * 기본 목록과 식약처 음식만 센다. 직접 입력한 음식과 내 음식은 빼는데, 이름에
 * 사생활이 묻어날 수 있어서다('엄마표 제육볶음' 같은 것). 남의 기록은 음식별
 * 횟수로만 합쳐 보이고, 누가 무엇을 먹었는지는 드러나지 않는다.
 *
 * 순서: 담긴 횟수 → 같으면 담은 사람 수. 한 사람이 매일 같은 것을 담아 1위가 되는
 * 것보다 여럿이 담은 것이 앞서도록 사람 수를 함께 센다.
 *
 * 모든 사람의 기록을 훑는 일이라 10분 동안은 한 번 센 것을 다시 쓴다.
 */

export const POPULAR_MAX = 20;

async function countPopular(): Promise<RankedFood[]> {
  const rows = await prisma.mealEntry.groupBy({
    by: ['source', 'sourceId', 'userId'],
    where: { source: { in: ['basic', 'mfds'] }, sourceId: { not: null } },
    _count: { _all: true },
  });

  /* 음식마다 모은다 — 사람마다 한 줄씩 왔으므로 줄 수가 곧 사람 수다 */
  const byFood = new Map<
    string,
    { source: string; sourceId: string; picks: number; people: number }
  >();
  for (const r of rows) {
    if (!r.sourceId) continue;
    const key = `${r.source}:${r.sourceId}`;
    const acc = byFood.get(key) ?? {
      source: r.source,
      sourceId: r.sourceId,
      picks: 0,
      people: 0,
    };
    acc.picks += r._count._all;
    acc.people += 1;
    byFood.set(key, acc);
  }
  const top = [...byFood.values()]
    .sort((a, b) => b.picks - a.picks || b.people - a.people)
    .slice(0, POPULAR_MAX);

  /*
   * 식약처 음식은 앱에 목록이 없으니, 가장 최근에 담긴 줄에 적어 둔 값을 쓴다
   * (MealEntry 는 담을 때의 이름·1인분·영양소를 찍어 둔다).
   */
  const mfdsIds = top.filter((t) => t.source === 'mfds').map((t) => t.sourceId);
  const snapshots = mfdsIds.length
    ? await prisma.mealEntry.findMany({
        where: { source: 'mfds', sourceId: { in: mfdsIds } },
        orderBy: { createdAt: 'desc' },
        distinct: ['sourceId'],
        select: {
          sourceId: true,
          name: true,
          servingLabel: true,
          servingGrams: true,
          kcal: true,
          carbs: true,
          protein: true,
          fat: true,
        },
      })
    : [];
  const snapshotOf = new Map(snapshots.map((s) => [s.sourceId, s]));

  const out: RankedFood[] = [];
  for (const t of top) {
    let food: Food | null = null;
    if (t.source === 'basic') {
      food = basicFood(t.sourceId);
    } else {
      const s = snapshotOf.get(t.sourceId);
      if (s) {
        food = {
          source: 'mfds',
          id: t.sourceId,
          name: s.name,
          servingLabel: s.servingLabel ?? '1인분',
          servingGrams: s.servingGrams,
          kcal: s.kcal,
          carbs: s.carbs,
          protein: s.protein,
          fat: s.fat,
          note: '식약처',
        };
      }
    }
    /* 기본 목록에서 빠진 음식(열쇠가 바뀐 것)은 순위에서 건너뛴다 */
    if (food)
      out.push({ ...food, rank: out.length + 1, picks: t.picks, people: t.people });
  }
  return out;
}

export const popularFoods = unstable_cache(countPopular, ['nutrition-popular-v1'], {
  revalidate: 600,
  tags: ['nutrition-popular'],
});
