import 'server-only';
import { prisma } from '@/lib/prisma';
import { buildTrainingLoad, type TrainingLoad } from '@/lib/training-load';
import { estimateTrainingDailyLoad } from '@/lib/baseline';

export type { TrainingLoad };

/**
 * 운동 부하 지수.
 *
 * 투구 지수와 같은 계산기(computeAcwr)를 쓰되 재료가 다르다 —
 * 투구는 '투구수 × 강도', 운동은 '시간(분) × 강도'.
 *
 * 두 지수를 합치지 않는다. 합치려면 투구수를 분으로 바꿔야 하는데 구당 몇
 * 초인지를 재본 적이 없다. 재보지 않은 숫자로 섞으면 나온 값이 무엇을 뜻하는지
 * 아무도 설명할 수 없다. 지수는 '평소 대비 몇 배'라 단위가 없으므로, 둘을
 * 나란히 두고 읽으면 된다.
 *
 * 시작 기준선은 가입 문진의 '평소 웨이트 빈도'에서 나온다. 투구와 같은 방식이라,
 * 답한 사람은 첫날부터 지수를 본다. 안 답했으면 28일이 쌓여야 나온다.
 */

/** 부하 계산에 필요한 기간. 4주 만성 부하에 여유를 둔다. */
const LOOKBACK_DAYS = 45;

/** 화면·리포트가 부르는 입구. 읽어서 buildTrainingLoad 에 넘긴다. */
export async function trainingLoad(
  userId: string,
  today = new Date()
): Promise<TrainingLoad> {
  const since = new Date(today);
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  const [user, logs, notes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { baselineWorkoutFreq: true, dailyWorkoutMinutes: true },
    }),
    prisma.userExerciseLog.findMany({
      where: { userId, completed: true, date: { gte: since } },
      select: {
        date: true,
        setsDone: true,
        exercise: {
          select: {
            category: true,
            intensity: true,
            bodyParts: true,
            sets: true,
            reps: true,
            holdSeconds: true,
            restSeconds: true,
            perSide: true,
          },
        },
      },
    }),
    prisma.dailyTrainingNote.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, intensity: true },
    }),
  ]);

  /*
   * 가입 문진으로 평소 운동량을 추정해 첫날부터 지수를 낸다.
   * 안 답했으면 null 이고, 그때는 28일이 쌓여야 나온다.
   */
  const seed = user
    ? estimateTrainingDailyLoad({
        baselineWorkoutFreq: user.baselineWorkoutFreq,
        dailyWorkoutMinutes: user.dailyWorkoutMinutes,
      })
    : null;

  return buildTrainingLoad(logs, notes, today, seed);
}
