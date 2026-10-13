import 'server-only';
import { appNow, appNowMs } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { usualConditionOf } from '@/lib/report/facts';
import { prefillOf, type CheckinFlowContext } from '@/components/checkin-flow/types';

/** 관문이 보는 최근 체크인 — 사흘(서버 · 사용자의 오늘이 하루 어긋날 수 있어 넉넉히) */
export const CHECKIN_RECENT_MS = 3 * 86_400_000;
/** 'N일 연속' · 평소 컨디션(28일)을 셀 만큼 — 두 달 */
export const CHECKIN_STREAK_MS = 62 * 86_400_000;

/**
 * 체크인 3판 흐름의 둘레(components/checkin-flow/types.ts CheckinFlowContext) — 전체 화면(app/(session)/checkin)이 부른다.
 * 앱 틀(app/(app)/layout.tsx)은 이미 같은 두 줄을 읽고 있어 거기서는 contextFrom 으로 만든다(조회가 늘지 않게).
 */
export async function loadCheckinFlowContext(user: {
  id: string;
  nickname: string;
}): Promise<CheckinFlowContext> {
  const [recent, streak] = await Promise.all([
    prisma.dailyCheckin.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(appNowMs() - CHECKIN_RECENT_MS) },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.dailyCheckin.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(appNowMs() - CHECKIN_STREAK_MS) },
      },
      select: { date: true, condition: true },
    }),
  ]);
  return contextFrom(user.nickname, recent, streak);
}

export function contextFrom(
  nickname: string,
  recent: Parameters<typeof prefillOf>[0][],
  streak: { date: Date; condition: number }[]
): CheckinFlowContext {
  const days = streak.map((c) => ({
    date: c.date.toISOString().slice(0, 10),
    condition: c.condition,
  }));
  return {
    nickname,
    usualCondition: usualConditionOf(days, toDateKey(appNow()))?.median ?? null,
    recent: recent.map(prefillOf),
    streakDays: days.map((d) => d.date),
  };
}
