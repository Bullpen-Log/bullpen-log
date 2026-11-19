import 'server-only';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import type { CoachGoalState, GoalLog } from '@/lib/coach/goal';

/** 정한 목표 읽기(자비스 2단계) — 대화 · 목표 카드(app/actions/coach-chat.ts) · 먼저 말 걸기(lib/coach/nudge-send.ts)가 같이 쓴다 */
export type GoalRow = Awaited<ReturnType<typeof prisma.coachGoal.findUnique>>;

/** DB 줄 → 순수 상태(날짜는 한국 날짜) */
export function goalStateOf(row: GoalRow): CoachGoalState | null {
  if (!row) return null;
  return {
    what: row.what,
    trigger: row.trigger === '불펜' || row.trigger === '라이브' || row.trigger === '경기' ? row.trigger : null,
    checkOn: keyOfDbDate(row.checkOn),
    watchFrom: keyOfDbDate(row.watchFrom),
    status: row.status === 'done' || row.status === 'dropped' ? row.status : 'open',
    feel: row.feel === 'good' || row.feel === 'meh' || row.feel === 'bad' ? row.feel : null,
    result: row.result,
    setOn: toDateKey(row.setAt),
    laterOn: row.laterOn ? keyOfDbDate(row.laterOn) : null,
    answeredOn: row.answeredAt ? toDateKey(row.answeredAt) : null,
  };
}

/** 목표 카드가 보는 투구 기록 — 정한 종류만, 지켜보기 시작한 날 ~ 오늘(날짜만 정한 목표면 빈 목록) */
export async function goalLogsOf(userId: string, goal: CoachGoalState, today: string): Promise<GoalLog[]> {
  if (!goal.trigger) return [];
  const rows = await prisma.pitchLog.findMany({
    where: { userId, date: { gte: dbDate(goal.watchFrom), lte: dbDate(today) }, sessionType: goal.trigger },
    select: { date: true, sessionType: true, pitchCount: true },
  });
  return rows.map((l) => ({ ...l, date: keyOfDbDate(l.date) }));
}
