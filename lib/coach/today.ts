import 'server-only';
import { prisma } from '@/lib/prisma';
import { coachPaid } from '@/lib/coach-access';
import { shiftDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { weekdayOf, type DaySlot } from '@/lib/coach/week';

/**
 * 코치 진행 중인 사람의 그날 칸(docs/designs/ai-coach.md 10-5) — 트레이닝 쪽이 읽는다. 코치가 아니거나 · 유료가 아니거나 · 그 주 틀이 없으면 null.
 * 운동 목록은 여기서 짜지 않는다(R2) — 오늘 운동 만들기가 이 칸의 분을 기본 시간으로 받아 엔진이 그대로 판정한다(줄이기만, auto-setup).
 */
export async function coachSlotOf(user: { id: string; role: string | null | undefined }, dateKey: string): Promise<DaySlot | null> {
  const weekStart = dbDate(shiftDateKey(dateKey, -weekdayOf(dateKey)));
  const [profile, row] = await Promise.all([
    prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { status: true } }),
    prisma.coachWeek.findUnique({ where: { userId_weekStart: { userId: user.id, weekStart } }, select: { slots: true } }),
  ]);
  if (profile?.status !== 'active' || !row) return null;
  if (!(await coachPaid(user))) return null;
  return (row.slots as unknown as DaySlot[]).find((s) => s.date === dateKey) ?? null;
}

/** 오늘 운동 만들기에 넣을 코치 시간 — 코치 칸이 운동 날이고 사용자가 그날을 가져가지 않았을 때만 */
export function coachMinutesOf(slot: DaySlot | null): number | null {
  if (!slot || slot.owner === 'user') return null;
  const t = slot.items.find((x) => x.kind === 'train');
  return t?.kind === 'train' ? t.fence.minutes : null;
}

/**
 * 하루의 주인(U38) — 코치가 쉬라고 한 날(운동 · 프로그램 칸 없음)에 사용자가 오늘 운동을 만들면 그날은 사용자 것. 코치는 그날을 다시 맞추지 않는다.
 * 코치 칸이 운동 날이면 그대로 코치 것(만든 운동이 코치 시간을 따랐다).
 */
export async function takeDayFromCoach(userId: string, dateKey: string, slot: DaySlot | null): Promise<void> {
  if (!slot || slot.owner === 'user' || slot.items.some((x) => x.kind === 'train' || x.kind === 'program')) return;
  const weekStart = dbDate(shiftDateKey(dateKey, -weekdayOf(dateKey)));
  const row = await prisma.coachWeek.findUnique({ where: { userId_weekStart: { userId, weekStart } }, select: { slots: true } });
  if (!row) return;
  const slots = (row.slots as unknown as DaySlot[]).map((s) => (s.date === dateKey ? { ...s, owner: 'user' as const } : s));
  await prisma.coachWeek.update({ where: { userId_weekStart: { userId, weekStart } }, data: { slots: slots as unknown as object } });
}
