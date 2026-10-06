import 'server-only';
import { prisma } from '@/lib/prisma';
import { dbDate } from '@/lib/nutrition/days';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { RATED_SESSION_TYPES } from '@/lib/pitch-satisfaction';
import {
  GOOD_DAYS_NEEDED,
  buildGoodDays,
  findGoodDayPatterns,
  type GoodDayResult,
} from '@/lib/report/good-days';

/** 최근 이만큼의 매긴 날을 본다 */
const WINDOW_DAYS = 180;

/**
 * 잘 던진 날 찾기에 쓸 기록을 읽는다 — 계산은 good-days.ts(순수).
 *
 * 처음 몇 주는 거의 모두 매긴 날이 8일 미만이다. 그때는 날짜만 세고 나머지(체크인 · 운동 · 끼니)는 읽지 않는다.
 * 투구 기록은 '앞 7일 투구수'를 위해 7일, 운동 · 끼니는 '전날'을 위해 하루 더 앞에서부터 읽는다.
 */
export async function loadGoodDays(
  userId: string,
  today: string
): Promise<GoodDayResult> {
  const from = shiftDateKey(today, -(WINDOW_DAYS - 1));
  const ratedDays = await prisma.pitchLog.findMany({
    where: {
      userId,
      date: { gte: dbDate(from) },
      sessionType: { in: [...RATED_SESSION_TYPES] },
      satisfaction: { not: null },
    },
    select: { date: true },
    distinct: ['date'],
  });
  if (ratedDays.length < GOOD_DAYS_NEEDED) {
    return { rated: ratedDays.length, needed: GOOD_DAYS_NEEDED, patterns: [], all: [] };
  }

  const [logs, checkins, workouts, meals] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId, date: { gte: dbDate(shiftDateKey(from, -7)) } },
      select: {
        date: true,
        sessionType: true,
        pitchCount: true,
        satisfaction: true,
        cuesGood: true,
        cuesBad: true,
      },
    }),
    prisma.dailyCheckin.findMany({
      where: { userId, date: { gte: dbDate(from) } },
      select: {
        date: true,
        sleep: true,
        sleepHours: true,
        condition: true,
        soreness: true,
        shoulder: true,
        elbow: true,
      },
    }),
    prisma.userExerciseLog.findMany({
      where: { userId, completed: true, date: { gte: dbDate(shiftDateKey(from, -1)) } },
      select: {
        date: true,
        exercise: { select: { category: true, bodyParts: true } },
      },
    }),
    prisma.mealEntry.findMany({
      where: { userId, date: { gte: dbDate(shiftDateKey(from, -1)) } },
      select: { date: true, protein: true, amount: true },
    }),
  ]);

  const days = buildGoodDays(
    {
      logs: logs.map((l) => ({ ...l, date: toDateKey(l.date) })),
      checkins: checkins.map((c) => ({ ...c, date: toDateKey(c.date) })),
      workouts: workouts.map((w) => ({
        date: toDateKey(w.date),
        category: w.exercise.category,
        bodyParts: w.exercise.bodyParts,
      })),
      meals: meals.map((m) => ({
        date: toDateKey(m.date),
        protein: m.protein == null ? null : m.protein * m.amount,
      })),
    },
    from
  );
  return findGoodDayPatterns(days);
}
