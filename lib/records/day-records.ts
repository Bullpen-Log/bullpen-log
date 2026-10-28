import 'server-only';
import { prisma } from '@/lib/prisma';
import { visibleExercises } from '@/lib/library-cache';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { isRestSession } from '@/lib/session-type';
import { readFrozenPlan } from '@/lib/workout/session-plan';

/**
 * 앱 기록 탭(2026-10-29 확정 디자인)의 날짜별 시간순 기록 — 이미 남은 기록을 읽기만 한다(같은 것을 두 곳에 따로 저장하지 않는다).
 * - 투구: 투구 기록 줄마다(쉰 날 줄 = 휴식). 시각은 남긴 때(createdAt). 최고 구속은 그 기록에 적힌 값만 — 없으면 null(0 · 예시로 채우지 않는다).
 * - 트레이닝: 운동 판(TrainingSession)마다. 시각은 마친 때(없으면 시작한 때), 분은 마친 판의 운동 시간(activeSeconds), 종목 수는 그날 체크한
 *   운동(암케어 빼고 — UserExerciseLog). 진행 중인 판은 '진행 중'.
 * - 암케어 · 메커니즘 드릴: 그날 체크한 수만 — 시각을 남기지 않아 시각은 null(화면이 '시각 모름'으로 맨 뒤에 둔다).
 * - 체크인: 그날 체크인(컨디션 · 수면의 질 · 메모 있음). 시각은 남긴 때.
 * 범위는 날짜 키(YYYY-MM-DD) 둘, 최대 400일.
 */
export type RecordItem =
  | {
      kind: 'pitch';
      id: string;
      date: string;
      at: string | null;
      title: string;
      pitches: number;
      rested: boolean;
      maxKmh: number | null;
      videos: number;
      memo: string | null;
    }
  | { kind: 'training'; id: string; date: string; at: string | null; title: string; count: number; minutes: number | null; active: boolean }
  | { kind: 'armcare'; id: string; date: string; at: null; count: number }
  | { kind: 'drill'; id: string; date: string; at: null; count: number }
  | { kind: 'checkin'; id: string; date: string; at: string | null; condition: number; sleepQuality: number | null; note: string | null };

export const RECORDS_MAX_DAYS = 400;

export async function loadRecordsRange(userId: string, from: string, to: string): Promise<RecordItem[]> {
  const range = { gte: dbDate(from), lte: dbDate(to) };
  const armcareIds = visibleExercises().then((all) => all.filter((ex) => ex.category === ARMCARE_CATEGORY).map((ex) => ex.id));
  const [pitches, sessions, checkins, drills, logs, armIds] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId, date: range },
      select: { id: true, date: true, sessionType: true, pitchCount: true, maxVelocity: true, memo: true, videoPaths: true, createdAt: true },
    }),
    prisma.trainingSession.findMany({
      where: { userId, date: range },
      select: { id: true, date: true, status: true, plan: true, startedAt: true, endedAt: true, activeSeconds: true },
    }),
    prisma.dailyCheckin.findMany({
      where: { userId, date: range },
      select: { id: true, date: true, condition: true, sleepQuality: true, note: true, createdAt: true },
    }),
    prisma.userDrillLog.groupBy({ by: ['date'], where: { userId, done: true, date: range }, _count: { _all: true } }),
    prisma.userExerciseLog.findMany({ where: { userId, completed: true, date: range }, select: { date: true, exerciseId: true } }),
    armcareIds,
  ]);
  const arm = new Set(armIds);
  const armByDay = new Map<string, number>();
  const workByDay = new Map<string, number>();
  for (const l of logs) {
    const d = keyOfDbDate(l.date);
    const m = arm.has(l.exerciseId) ? armByDay : workByDay;
    m.set(d, (m.get(d) ?? 0) + 1);
  }

  const items: RecordItem[] = [];
  for (const p of pitches) {
    items.push({
      kind: 'pitch',
      id: `pitch:${p.id}`,
      date: keyOfDbDate(p.date),
      at: p.createdAt.toISOString(),
      title: p.sessionType,
      pitches: p.pitchCount,
      rested: isRestSession(p.sessionType),
      maxKmh: p.maxVelocity,
      videos: p.videoPaths.length,
      memo: p.memo?.trim() || null,
    });
  }
  for (const s of sessions) {
    const date = keyOfDbDate(s.date);
    const done = s.status === 'FINISHED';
    items.push({
      kind: 'training',
      id: `training:${s.id}`,
      date,
      at: (s.endedAt ?? s.startedAt).toISOString(),
      title: readFrozenPlan(s.plan)?.themeLabel ?? '오늘의 운동',
      count: workByDay.get(date) ?? 0,
      minutes: done && s.activeSeconds > 0 ? Math.max(1, Math.round(s.activeSeconds / 60)) : null,
      active: s.status === 'ACTIVE',
    });
  }
  for (const [date, count] of armByDay) items.push({ kind: 'armcare', id: `armcare:${date}`, date, at: null, count });
  for (const g of drills) {
    const date = keyOfDbDate(g.date);
    items.push({ kind: 'drill', id: `drill:${date}`, date, at: null, count: g._count._all });
  }
  for (const c of checkins) {
    items.push({
      kind: 'checkin',
      id: `checkin:${c.id}`,
      date: keyOfDbDate(c.date),
      at: c.createdAt.toISOString(),
      condition: c.condition,
      sleepQuality: c.sleepQuality ?? null,
      note: c.note?.trim() || null,
    });
  }
  return items;
}
