import 'server-only';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { dbDate } from '@/lib/nutrition/days';
import { outingOf } from '@/lib/engine/outing';
import type { ReportFacts } from '@/lib/report/facts';
import {
  buildHighlights,
  type HighlightInput,
  type HighlightPart,
} from '@/lib/report/highlights';

/**
 * 하이라이트 재료를 읽어 그 칸(홈 · 분석 › 투구 · 분석 › 트레이닝)의 것만 — 홈(app/(app)/today/page.tsx)과 분석(analysis-view.tsx)이 같이 쓴다.
 * 모두 하루 한 줄로 가볍게 읽는다: 투구 6주(구속 선 · 투구 막대), 체크인 두 달(연속 일수), 운동 2주(지난주와 견줌).
 * facts 는 오늘 셈(loadTodayCore 의 facts) — 부하 지수 · 어제 등판 기록 없음을 읽는다. 아직 셈하는 중이면 약속(Promise)으로 넘겨도 된다 — 재료를 다 읽은
 * 뒤에야 쓰므로, 무거운 오늘 셈을 기다리지 않고 같이 읽는다(2026-10-15 탭 전환 속도, 홈 요약 칸). part 를 안 주면 모든 몫(홈 요약 칸).
 */
export async function loadHighlights(
  userId: string,
  today: string,
  factsOrPending: ReportFacts | Promise<ReportFacts>,
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
      select: { date: true, pitchCount: true, sessionType: true },
    }),
  ]);
  const pitchesByDay: Record<string, number> = {};
  const velocityByDay: Record<string, number> = {};
  /* 날짜별 투구 기록(쉰 날 줄 포함) — 앱 홈 기록 보드(lib/report/home-board.ts)가 휴식도 기록으로 센다 */
  const pitchDays: Record<string, { pitches: number; rest: boolean }> = {};
  for (const l of logs) {
    const key = toDateKey(l.date);
    const rest = l.sessionType === REST_SESSION_TYPE;
    const day = (pitchDays[key] ??= { pitches: 0, rest: false });
    if (rest) day.rest = true;
    else day.pitches += l.pitchCount;
    if (!rest)
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
  const facts = await factsOrPending;
  /* 홈 요약 칸(lib/report/feed-items.ts)이 같은 재료로 여섯 장을 만든다 — 그대로 돌려준다 */
  const input: HighlightInput = {
    today,
    load: facts.load,
    pitchesByDay,
    lastLogDate,
    velocityByDay,
    bestBefore: before?.maxVelocity ?? null,
    conditionByDay,
    checkinDays: checkins.map((c) => toDateKey(c.date)),
    workoutDays: workouts.map((w) => toDateKey(w.date)),
    claimedYesterdayNoLog: outingOf(facts).claimedYesterdayNoLog,
  };
  const items = buildHighlights(input, part);
  /* 홈 요약 칸만 쓰는 재료 — 역대 최고를 낸 날 · 어젯밤 수면(체크인 3판 sleepQuality 1~5) */
  const extra = {
    bestBeforeDate: before ? toDateKey(before.date) : null,
    sleepByDay,
    pitchDays,
    /* 6주 밖의 마지막 기록 — 그 줄 하나로 어림한다(같은 날 줄이 여럿이면 하나만 — 6주 넘게 비운 사람에게만 보이는 값) */
    olderLastLog:
      lastLog && !pitchDays[toDateKey(lastLog.date)]
        ? {
            date: toDateKey(lastLog.date),
            pitches: lastLog.sessionType === REST_SESSION_TYPE ? 0 : lastLog.pitchCount,
            rest: lastLog.sessionType === REST_SESSION_TYPE,
          }
        : null,
  };
  return { items, lastLogDate, input, extra };
}
