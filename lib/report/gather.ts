import 'server-only';
import { prisma } from '@/lib/prisma';
import { ageFromBirthDate } from '@/lib/profile';
import { estimateDailyLoad } from '@/lib/baseline';
import { buildFacts, type CheckinLike, type MemoNote } from '@/lib/report/facts';
import { buildPitchPlan } from '@/lib/report/plan';
import { pickCheckinParts } from '@/lib/checkin';
import { RECENT_DAYS } from '@/lib/report/today-pick';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';

/** 부하 계산에 필요한 기간. 4주 만성 부하에 여유를 둔다. */
export const LOOKBACK_DAYS = 45;

type UserForFacts = {
  id: string;
  nickname: string;
  birthDate: Date | null;
  heightCm: number | null;
  baselineFreq: string | null;
  baselineVolume: string | null;
  baselineIntensity: string | null;
};

/**
 * 리포트·운동 처방이 공통으로 쓰는 자료를 한 번에 모은다.
 *
 * AI 리포트와 오늘의 운동이 서로 다른 근거로 말하면 안 되므로
 * 같은 함수에서 같은 수치와 같은 계획을 만든다.
 */
export async function gatherFactsAndPlan(user: UserForFacts, today: Date) {
  const since = new Date(today);
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  const [logs, checkins] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: 'asc' },
    }),
    prisma.dailyCheckin.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: 'desc' },
    }),
  ]);

  const facts = buildFacts({
    nickname: user.nickname,
    age: user.birthDate ? ageFromBirthDate(user.birthDate, today) : null,
    heightCm: user.heightCm,
    baselineDailyLoad: estimateDailyLoad(user),
    logs: logs.map((l) => ({
      date: l.date.toISOString(),
      pitchCount: l.pitchCount,
      intensity: l.intensity,
      maxVelocity: l.maxVelocity,
      avgVelocity: l.avgVelocity,
    })),
    checkins: checkins.map<CheckinLike>((c) => ({
      date: c.date.toISOString().slice(0, 10),
      ...pickCheckinParts(c),
      condition: c.condition,
      sleep: c.sleep,
      preferredParts: c.preferredParts,
    })),
    memos: logs
      .filter((l) => l.memo?.trim())
      .slice(-5)
      .map<MemoNote>((l) => ({
        date: l.date.toISOString().slice(0, 10),
        text: l.memo!.trim(),
      })),
    today,
  });

  return { facts, plan: buildPitchPlan(facts), hasLogs: logs.length > 0 };
}

/**
 * 최근 며칠 안에 마친 운동의 id.
 *
 * 오늘 것은 넣지 않는다. 오늘 한 운동은 목록에 그대로 남아 있어야
 * 완료 표시를 켜고 끌 수 있는데, 여기 섞이면 뒤로 밀려버린다.
 *
 * 오늘의 운동 화면과 리포트가 같은 목록을 내야 하므로 두 곳이 이 함수를
 * 함께 쓴다. 각자 조회하면 기간이 어긋나도 아무도 눈치채지 못한다.
 */
export async function recentExerciseIds(
  userId: string,
  today: Date
): Promise<Set<string>> {
  const todayKey = toDateKey(today);
  const logs = await prisma.userExerciseLog.findMany({
    where: {
      userId,
      completed: true,
      date: {
        gte: new Date(`${shiftDateKey(todayKey, -RECENT_DAYS)}T00:00:00.000Z`),
        lt: new Date(`${todayKey}T00:00:00.000Z`),
      },
    },
    select: { exerciseId: true },
  });
  return new Set(logs.map((l) => l.exerciseId));
}
