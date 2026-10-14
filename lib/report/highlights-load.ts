import 'server-only';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { dbDate } from '@/lib/nutrition/days';
import {
  buildHighlights,
  type HighlightInput,
  type HighlightPart,
} from '@/lib/report/highlights';

/**
 * 하이라이트 재료를 읽어 그 칸(홈 · 분석 › 투구 · 분석 › 트레이닝)의 것만 — 홈(app/(app)/today/page.tsx)과 분석(analysis-view.tsx)이 같이 쓴다.
 * 모두 하루 한 줄로 가볍게 읽는다: 투구 6주(구속 선 · 투구 막대), 체크인 두 달(연속 일수), 운동 2주(지난주와 견줌).
 * load 는 오늘의 투구 부하 지수(loadTodayCore 의 facts.load) — 부르는 쪽이 이미 가지고 있다. part 를 안 주면 모든 몫(홈 요약 칸).
 */
export async function loadHighlights(
  userId: string,
  today: string,
  load: HighlightInput['load'],
  part?: HighlightPart
) {
  const [logs, before, checkins, workouts, lastLog] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId, date: { gte: dbDate(shiftDateKey(today, -41)) } },
      select: { date: true, pitchCount: true, maxVelocity: true, sessionType: true },
    }),
    /* 최근 이레 앞의 역대 최고 구속(과 그 날) — '새 기록'을 가른다, 홈 요약 칸은 날도 보인다 */
    prisma.pitchLog.findFirst({
      where: {
        userId,
        date: { lt: dbDate(shiftDateKey(today, -6)) },
        maxVelocity: { not: null },
      },
      orderBy: [{ maxVelocity: 'desc' }, { date: 'desc' }],
      select: { date: true, maxVelocity: true },
    }),
    prisma.dailyCheckin.findMany({
      where: { userId, date: { gte: dbDate(shiftDateKey(today, -61)) } },
      select: { date: true, condition: true, sleepQuality: true },
    }),
    prisma.userExerciseLog.findMany({
      where: {
        userId,
        completed: true,
        date: { gte: dbDate(shiftDateKey(today, -13)) },
      },
      select: { date: true },
      distinct: ['date'],
    }),
    /* 마지막으로 남긴 투구 기록(쉬는 날 포함) — 기록이 며칠째 비었나 */
    prisma.pitchLog.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
  ]);
  const pitchesByDay: Record<string, number> = {};
  const velocityByDay: Record<string, number> = {};
  for (const l of logs) {
    const key = toDateKey(l.date);
    if (l.sessionType !== REST_SESSION_TYPE)
      pitchesByDay[key] = (pitchesByDay[key] ?? 0) + l.pitchCount;
    if (l.maxVelocity != null)
      velocityByDay[key] = Math.max(velocityByDay[key] ?? 0, l.maxVelocity);
  }
  const conditionByDay: Record<string, number> = {};
  const sleepByDay: Record<string, number> = {};
  for (const c of checkins) {
    const key = toDateKey(c.date);
    if (c.condition != null) conditionByDay[key] = c.condition;
    if (c.sleepQuality != null) sleepByDay[key] = c.sleepQuality;
  }
  const lastLogDate = lastLog ? toDateKey(lastLog.date) : null;
  /* 홈 요약 칸(lib/report/feed-items.ts)이 같은 재료로 여섯 장을 만든다 — 그대로 돌려준다 */
  const input: HighlightInput = {
    today,
    load,
    pitchesByDay,
    lastLogDate,
    velocityByDay,
    bestBefore: before?.maxVelocity ?? null,
    conditionByDay,
    checkinDays: checkins.map((c) => toDateKey(c.date)),
    workoutDays: workouts.map((w) => toDateKey(w.date)),
  };
  const items = buildHighlights(input, part);
  /* 홈 요약 칸만 쓰는 재료 — 역대 최고를 낸 날 · 어젯밤 수면(체크인 3판 sleepQuality 1~5) */
  const extra = {
    bestBeforeDate: before ? toDateKey(before.date) : null,
    sleepByDay,
  };
  return { items, lastLogDate, input, extra };
}
