import 'server-only';
import { prisma } from '@/lib/prisma';
import { visibleExercises } from '@/lib/library-cache';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { shiftDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';

/** 날짜 띠의 한 칸 — 그날 무엇을 했나(앱마다 점 하나) */
export type TrainingStripDay = {
  date: string;
  /** 운동을 마친 판이 있다 */
  workout: boolean;
  /** 암케어 운동을 하나라도 했다 */
  armcare: boolean;
  /** 메커니즘 드릴을 하나라도 했다 */
  drill: boolean;
};

/** 날짜마다 무엇을 했나 — 띠 · 간이 달력이 같이 쓴다. 조회 셋을 같이 낸다(암케어 기록은 운동 목록을 받은 뒤) */
async function doneByDate(userId: string, from: string, to: string) {
  const range = { gte: dbDate(from), lte: dbDate(to) };
  const [sessions, armcareIds, drills] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { userId, status: 'FINISHED', date: range },
      select: { date: true },
    }),
    visibleExercises().then((all) =>
      all.filter((ex) => ex.category === ARMCARE_CATEGORY).map((ex) => ex.id)
    ),
    prisma.userDrillLog.findMany({
      where: { userId, done: true, date: range },
      select: { date: true },
    }),
  ]);
  const armcare = await prisma.userExerciseLog.findMany({
    where: { userId, completed: true, date: range, exerciseId: { in: armcareIds } },
    select: { date: true },
  });
  const daysOf = (rows: { date: Date }[]) => new Set(rows.map((r) => keyOfDbDate(r.date)));
  return { workout: daysOf(sessions), armcare: daysOf(armcare), drill: daysOf(drills) };
}

/**
 * 트레이닝 날짜 띠 — 고른 날이 든 한 주(일~토, 영양 탭의 날짜 띠와 같은 칸).
 *
 * 2026-10-15 사용자: "영양 위에 있던 최근 날짜 보기를 트레이닝에도". 칸마다 운동 · 암케어 · 메커니즘을 한 날을 점으로 —
 * 어느 날 쉬었는지가 한눈에 보이고, 누르면 그날 기록(/training/day/날짜)으로 간다.
 */
export async function loadTrainingWeek(
  userId: string,
  dateKey: string
): Promise<TrainingStripDay[]> {
  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const first = shiftDateKey(dateKey, -dow);
  const keys = Array.from({ length: 7 }, (_, i) => shiftDateKey(first, i));
  const done = await doneByDate(userId, first, keys[6]);
  return keys.map((date) => ({
    date,
    workout: done.workout.has(date),
    armcare: done.armcare.has(date),
    drill: done.drill.has(date),
  }));
}

/** 간이 달력의 점 — from ~ to 사이에 무엇이든 한 날(트레이닝 제목 옆 달력, training/date-nav.tsx) */
export async function loadTrainingMarkedDays(
  userId: string,
  from: string,
  to: string
): Promise<string[]> {
  const done = await doneByDate(userId, from, to);
  return [...new Set([...done.workout, ...done.armcare, ...done.drill])].sort();
}
