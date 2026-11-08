import 'server-only';
import { prisma } from '@/lib/prisma';
import { coachPaid } from '@/lib/coach-access';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { appNow } from '@/lib/clock';
import { dbDate } from '@/lib/nutrition/days';
import { weekdayOf, type DaySlot } from '@/lib/coach/week';
import { coachMinutes } from '@/lib/coach/answers';
import { healthConsentFor } from '@/lib/analysis-consent-store';
import { movementKeyOf, type ClassifiableExercise } from '@/lib/engine/exercise-class';
import { SWAPPED_MIN } from '@/lib/report/score';

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
  return t?.kind === 'train' ? coachMinutes(t.fence.minutes) : null;
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

/** 불편 동작을 뒤로 미루는 기간(날) — 지난 7일 */
export const DISCOMFORT_DAYS = 7;

/**
 * 지난 7일 운동 끝에 고른 불편 동작(U36) — 그 운동과 같은 움직임 열쇠의 운동 id. 오늘 운동 만들기가 '오늘 뺀 운동'처럼 맨 뒤로 미룬다(빼지는 않음 —
 * 대신할 것이 없으면 나온다). 건강정보라 지금 동의가 있을 때만 읽는다. 코치 아닌 사람은 줄이 없어 빈 목록.
 */
async function discomfortIds(
  userId: string,
  todayKey: string,
  library: readonly (ClassifiableExercise & { id: string })[]
): Promise<Set<string>> {
  const rows = await prisma.dailyTrainingNote.findMany({
    where: { userId, date: { gte: dbDate(shiftDateKey(todayKey, -DISCOMFORT_DAYS)), lte: dbDate(todayKey) } },
    select: { discomfort: true },
  });
  const list = rows.flatMap((r) => (Array.isArray(r.discomfort) ? (r.discomfort as { id?: unknown; move?: unknown }[]) : []));
  if (!list.length || !(await healthConsentFor(userId)).valid) return new Set();
  const ids = new Set(list.map((x) => x.id).filter((x): x is string => typeof x === 'string'));
  const moves = new Set(list.map((x) => x.move).filter((x): x is string => typeof x === 'string'));
  for (const ex of library) {
    const m = movementKeyOf(ex);
    if (m && moves.has(m)) ids.add(ex.id);
  }
  return ids;
}

/** 일정 만들기의 '60일 바꿔서 뺀 횟수'(swappedOut)에 불편 동작을 얹는다 — 점수가 '여러 번 뺀 운동'으로 보고 뒤로 미룬다(lib/report/score.ts, 판정은 그대로) */
export async function pushBackDiscomfort(
  swappedOut: Map<string, number>,
  userId: string,
  todayKey: string,
  library: readonly (ClassifiableExercise & { id: string })[]
): Promise<void> {
  for (const id of await discomfortIds(userId, todayKey, library)) swappedOut.set(id, Math.max(swappedOut.get(id) ?? 0, SWAPPED_MIN));
}

/** 이번 주 틀 + 못 바꾸는 날(지난 날 · 오늘 운동을 이미 시작했으면 오늘) — 조정 단추 · AI 대화가 같이 쓴다 */
export async function coachWeekBase(userId: string) {
  const today = toDateKey(appNow());
  const weekStart = dbDate(shiftDateKey(today, -weekdayOf(today)));
  const [row, started] = await Promise.all([
    prisma.coachWeek.findUnique({ where: { userId_weekStart: { userId, weekStart } }, select: { slots: true } }),
    prisma.trainingSession.findFirst({ where: { userId, date: dbDate(today) }, select: { id: true } }),
  ]);
  const locked = (d: string) => d < today || (d === today && started != null);
  return { today, weekStart, slots: row ? (row.slots as unknown as DaySlot[]) : null, locked };
}
