import 'server-only';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import type { DoneAmount } from '@/lib/exercise-meta';

/**
 * 이 운동을 지난번에 얼마나 했는가.
 *
 * 무게를 올릴지 횟수를 늘릴지는 지난번 숫자를 봐야 정할 수 있다. 매번
 * 기록 화면으로 넘어가 찾아보게 하면 아무도 안 본다 — 오늘 할 운동 옆에
 * 바로 붙여 둔다.
 */

/** 얼마나 옛날 것까지 볼 것인가. 반년 전 무게는 지금 기준이 되기 어렵다. */
const WINDOW_DAYS = 180;

/**
 * 한 운동에 몇 개까지 보여줄 것인가.
 *
 * 첫 줄에는 지난번 하나만 낸다. 펼치면 그 아래로 더 나오는데, 흐름을 보는
 * 것이 목적이라 다섯이면 충분하다. 스무 개를 늘어놓으면 읽지 않는다.
 */
const KEEP = 5;

export type PastAmount = DoneAmount & {
  /** 'YYYY-MM-DD' */
  date: string;
};

/**
 * 운동별 지난 기록. 오래된 것이 아니라 최근 것이 앞에 온다.
 *
 * 숫자를 하나도 안 적은 날은 빼고 읽는다. 체크만 하고 넘어간 날은 "했다"는
 * 것만 알 뿐 얼마나 했는지 모르는데, 그것을 '지난번 기록'이라고 보여주면
 * 증량을 정하는 데 쓸 수가 없다. 그런 날은 없는 것과 같다.
 */
export async function recentAmounts(
  userId: string,
  exerciseIds: string[],
  today: Date
): Promise<Map<string, PastAmount[]>> {
  const result = new Map<string, PastAmount[]>();
  if (exerciseIds.length === 0) return result;

  const todayKey = toDateKey(today);
  const midnight = new Date(`${todayKey}T00:00:00.000Z`);
  const from = new Date(midnight);
  from.setUTCDate(from.getUTCDate() - WINDOW_DAYS);

  const logs = await prisma.userExerciseLog.findMany({
    where: {
      userId,
      exerciseId: { in: exerciseIds },
      completed: true,
      // 오늘 것은 뺀다. 지금 적고 있는 숫자를 '지난번'이라고 보여줄 수는 없다.
      date: { gte: from, lt: midnight },
      OR: [
        { setsDone: { not: null } },
        { repsDone: { not: null } },
        { holdSecondsDone: { not: null } },
        { weightKg: { not: null } },
      ],
    },
    orderBy: { date: 'desc' },
    select: {
      exerciseId: true,
      date: true,
      setsDone: true,
      repsDone: true,
      holdSecondsDone: true,
      weightKg: true,
    },
  });

  /*
   * 운동별로 최근 몇 개만 남긴다.
   *
   * 조회를 운동마다 따로 하면 열다섯 번을 왕복하게 되므로 한 번에 읽고
   * 여기서 나눈다. 이미 최근 순으로 정렬돼 와서 앞에서부터 채우면 된다.
   */
  for (const log of logs) {
    const kept = result.get(log.exerciseId);
    if (kept == null) {
      result.set(log.exerciseId, [{ ...log, date: toDateKey(log.date) }]);
    } else if (kept.length < KEEP) {
      kept.push({ ...log, date: toDateKey(log.date) });
    }
  }

  return result;
}
