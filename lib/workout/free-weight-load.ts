import 'server-only';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import type { FrozenExercise } from '@/lib/workout/session-plan';
import { suggestFreeWeight, type FreeLast } from '@/lib/workout/free-weight';

/** 지난 기록을 이만큼 앞까지 본다 — 그보다 오래된 무게는 기준이 못 된다(exercise-recent.ts 와 같은 값) */
const WINDOW_DAYS = 180;

/**
 * 프로그램이 아닌 운동의 무게 추천을 판에 얹는다(lib/workout/free-weight.ts) — 운동 시작 · 운동 중 바꾸기 · 더하기가
 * 같이 쓴다. 프로그램 칸의 운동과 무게 없는 운동은 건드리지 않는다. 이미 추천이 있는 운동(프로그램 칸)도 그대로.
 */
export async function withFreeWeights(
  userId: string,
  exercises: readonly FrozenExercise[],
  sessionDate: Date
): Promise<FrozenExercise[]> {
  const todayKey = toDateKey(sessionDate);
  const wanted = exercises.filter(
    (e) => !e.programSlot && e.suggestedKg == null && !e.isHold && e.needsWeight
  );
  if (wanted.length === 0) return [...exercises];

  const last = await lastSets(
    userId,
    wanted.map((e) => e.id),
    todayKey
  );
  return exercises.map((e) => {
    if (!wanted.includes(e)) return e;
    const s = suggestFreeWeight({
      equipment: e.equipment,
      bigLower: e.category === '하체 스트렝스',
      plannedSets: e.plannedSets,
      plannedReps: e.plannedReps,
      last: last.get(e.id) ?? null,
      todayKey,
    });
    return s ? { ...e, suggestedKg: s.kg, suggestNote: s.note } : e;
  });
}

/** 운동마다 가장 최근에 세트를 남긴 날의 세트들(오늘 앞) */
async function lastSets(
  userId: string,
  exerciseIds: string[],
  todayKey: string
): Promise<Map<string, FreeLast>> {
  const midnight = new Date(`${todayKey}T00:00:00.000Z`);
  const from = new Date(midnight);
  from.setUTCDate(from.getUTCDate() - WINDOW_DAYS);
  const rows = await prisma.userExerciseSet.findMany({
    where: { userId, exerciseId: { in: exerciseIds }, date: { gte: from, lt: midnight } },
    orderBy: [{ date: 'desc' }, { setNo: 'asc' }],
    select: { exerciseId: true, date: true, weightKg: true, reps: true },
    /* 운동 열다섯 × 세트 다섯 × 몇 날이면 넉넉하다 — 최근 날부터 오므로 운동마다 첫 날만 남긴다 */
    take: 600,
  });
  const out = new Map<string, FreeLast>();
  for (const r of rows) {
    const date = toDateKey(r.date);
    const cur = out.get(r.exerciseId);
    if (!cur) out.set(r.exerciseId, { date, sets: [{ weightKg: r.weightKg, reps: r.reps }] });
    else if (cur.date === date) (cur.sets as { weightKg: number | null; reps: number | null }[]).push({ weightKg: r.weightKg, reps: r.reps });
  }
  return out;
}
