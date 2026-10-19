import 'server-only';
import { prisma } from '@/lib/prisma';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { visibleExercises } from '@/lib/library-cache';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';

/**
 * 이번 주(월요일부터) 앱마다 한 날 수 — 트레이닝 첫 화면의 '이번 주 운동 N일 · 암케어 N일 · 메커니즘 N일' 한 줄.
 * 웹 트레이닝 홈(app/(app)/training/training-home.tsx WeekStrip)과 앱 트레이닝 탭(app.loadAppTraining)이 같이 쓴다 — 예전엔 셈이
 * 웹 화면 안에만 있어 앱에는 이 줄이 없었다(2026-10-18 앱 · 웹 같게).
 */
export type TrainingWeekCounts = { today: number; armcare: number; mechanics: number };

export async function loadTrainingWeekCounts(userId: string, today: Date): Promise<TrainingWeekCounts> {
  const todayKey = toDateKey(today);
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const monday = dbDate(shiftDateKey(todayKey, -((dow + 6) % 7)));

  const armcareIds = (await visibleExercises())
    .filter((ex) => ex.category === ARMCARE_CATEGORY)
    .map((ex) => ex.id);
  const [workouts, armcareLogs, drillLogs] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { userId, status: 'FINISHED', date: { gte: monday } },
      select: { date: true },
    }),
    prisma.userExerciseLog.findMany({
      where: { userId, completed: true, date: { gte: monday }, exerciseId: { in: armcareIds } },
      select: { date: true },
    }),
    prisma.userDrillLog.findMany({
      where: { userId, done: true, date: { gte: monday } },
      select: { date: true },
    }),
  ]);
  const days = (rows: { date: Date }[]) => new Set(rows.map((r) => keyOfDbDate(r.date))).size;
  return { today: days(workouts), armcare: days(armcareLogs), mechanics: days(drillLogs) };
}
