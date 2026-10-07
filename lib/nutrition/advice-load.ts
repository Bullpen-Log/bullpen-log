import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { loadDayDetailCached, type DayDetailUser } from '@/lib/day-detail';
import { shiftDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { buildAdvice, type Advice } from '@/lib/nutrition/advice';
import { assembleAdviceInput } from '@/lib/nutrition/advice-input';

/**
 * 오늘의 영양 조언을 읽어 셈한다 — 홈 카드(홈 맨 위 링 · 그 밑 카드)와 영양 탭 맨 위가 같이 부른다.
 *
 * 그날 요약(lib/day-detail.ts)은 홈 링도 읽는 것이라 React cache 로 한 요청 안에서 한 번만 돈다. 나머지(체크인 둘 · 투구 ·
 * 세션 시간)는 한꺼번에 보낸다. 셈은 순수(advice-input.ts → advice.ts). 시각은 숫자(hour)로 받는다 — Date 객체면 부를 때마다 달라
 * cache 가 못 맞춘다.
 */
export const loadAdvice = cache(
  async (
    user: DayDetailUser,
    date: string,
    today: string,
    hour: number
  ): Promise<Advice> => {
    const prevDay = shiftDateKey(date, -1);
    const [detail, checkins, pitches, sessions] = await Promise.all([
      loadDayDetailCached(user, date),
      prisma.dailyCheckin.findMany({
        where: { userId: user.id, date: { in: [dbDate(date), dbDate(prevDay)] } },
        select: {
          date: true,
          nutrition: true,
          skippedMeals: true,
          appetite: true,
          soreness: true,
          throwPlan: true,
        },
      }),
      prisma.pitchLog.findMany({
        where: { userId: user.id, date: dbDate(date) },
        select: { sessionType: true, pitchCount: true, createdAt: true },
      }),
      prisma.trainingSession.findMany({
        where: { userId: user.id, date: dbDate(date) },
        select: { activeSeconds: true },
      }),
    ]);
    const rowOf = (day: string) => checkins.find((c) => keyOfDbDate(c.date) === day);
    const todayRow = rowOf(date);
    return buildAdvice(
      assembleAdviceInput({
        date,
        today,
        hour,
        detail,
        checkinToday: todayRow
          ? {
              nutrition: todayRow.nutrition,
              skippedMeals: todayRow.skippedMeals,
              appetite: todayRow.appetite,
              soreness: todayRow.soreness,
              throwPlan: todayRow.throwPlan,
            }
          : null,
        throwPlanYesterday: rowOf(prevDay)?.throwPlan ?? null,
        pitches: pitches.map((p) => ({
          sessionType: p.sessionType,
          pitchCount: p.pitchCount,
          loggedAt: p.createdAt.toISOString(),
        })),
        activeSeconds: sessions.reduce((a, s) => a + s.activeSeconds, 0),
      })
    );
  }
);
