import 'server-only';
import { requestCache as cache } from '@/lib/request-cache';
import { prisma } from '@/lib/prisma';
import { isShortSleep } from '@/lib/checkin';
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
    const [detail, checkins, pitches, sessions, mealRow] = await Promise.all([
      loadDayDetailCached(user, date),
      prisma.dailyCheckin.findMany({
        where: { userId: user.id, date: { in: [dbDate(date), dbDate(prevDay)] } },
        select: {
          date: true,
          nutrition: true,
          skippedMeals: true,
          appetite: true,
          sleep: true,
          sleepHours: true,
          sleepQuality: true,
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
      /* 영양 탭 카드의 답(체크인 3판 — 식욕 · 끼니 양 · 걸른 끼니). 답했으면 체크인 줄의 옛 칸보다 앞선다 */
      prisma.dailyNutrition.findUnique({
        where: { userId_date: { userId: user.id, date: dbDate(date) } },
        select: {
          appetite: true,
          mealAmount: true,
          skippedMeals: true,
          answeredAt: true,
        },
      }),
    ]);
    const rowOf = (day: string) => checkins.find((c) => keyOfDbDate(c.date) === day);
    const todayRow = rowOf(date);
    const answered = mealRow?.answeredAt != null;
    return buildAdvice(
      assembleAdviceInput({
        date,
        today,
        hour,
        detail,
        /* 체크인 줄(수면 · 던지는 일정)과 영양 카드 답(식욕 · 끼니) 가운데 하나라도 있으면 읽는다 */
        checkinToday:
          todayRow || answered
            ? {
                nutrition: answered
                  ? mealRow.mealAmount
                  : (todayRow?.nutrition ?? null),
                skippedMeals: answered
                  ? mealRow.skippedMeals
                  : (todayRow?.skippedMeals ?? []),
                appetite: answered ? mealRow.appetite : (todayRow?.appetite ?? null),
                sleepShort: todayRow ? isShortSleep(todayRow) : false,
                throwPlan: todayRow?.throwPlan ?? null,
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
