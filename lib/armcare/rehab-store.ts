import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import type { CachedExercise } from '@/lib/library-cache';
import {
  REHAB_CONDITIONS,
  REHAB_ENABLED,
  buildRehabSession,
  isRehabArea,
  isRehabCondition,
  rehabExerciseNames,
  type RehabPeriod,
  readRehabActivities,
  readRehabProgram,
  readRehabWeekly,
  rehabFacts,
  type RehabCheckinLike,
  type RehabFacts,
  type RehabLibraryExercise,
  type RehabProgramLike,
  type RehabResult,
  type RehabSessionLike,
  type RehabWeeklyLike,
  THROW_TAG,
  parseThrowMemo,
  type ThrowRecord,
} from '@/lib/armcare/rehab';

/**
 * 재활(재활 2편)을 읽는다 — 진행 중인 재활 · 세션 · 매주 확인. 규칙은 lib/armcare/rehab.ts(DB 를 모른다).
 *
 * 진행 중인 것은 한 사람에 하나(endedAt 이 빈 줄)다. 웨이트 · 투구 계획(lib/report/gather.ts) · 암케어(lib/armcare/today.ts) ·
 * 저장(app/actions/rehab.ts)이 같은 줄을 보므로 한 요청 안에서는 한 번만 읽는다(cache). 스위치(REHAB_ENABLED)를 끄면
 * 읽지 않는다 — 그러면 카드 · 웨이트 · 투구 계획 연결이 함께 꺼진다.
 */

/** 'YYYY-MM-DD' 의 그날 0시(UTC) — @db.Date 칸과 견주는 값 */
export function dayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

const activeRow = cache(async (userId: string) => {
  if (!REHAB_ENABLED) return null;
  return prisma.userRehabProgram.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
});

export type ActiveRehab = {
  id: string;
  program: RehabProgramLike;
  activities: string[];
};

/** 진행 중인 재활 — 없거나 모르는 값이면 null */
export async function loadActiveRehab(userId: string): Promise<ActiveRehab | null> {
  const row = await activeRow(userId);
  if (!row) return null;
  const program = readRehabProgram({
    area: row.area,
    condition: row.condition,
    severity: row.severity,
    stage: row.stage,
    stageStartedOn: row.stageStartedAt.toISOString().slice(0, 10),
    stageShortenDays: row.stageShortenDays,
    startedOn: toDateKey(row.startedAt),
  });
  return program
    ? { id: row.id, program, activities: readRehabActivities(row.activities) }
    : null;
}

/** 웨이트 · 투구 계획이 보는 재활(facts.condition.rehab) — 없으면 null */
export async function loadRehabFacts(
  userId: string,
  today: Date
): Promise<RehabFacts | null> {
  const active = await loadActiveRehab(userId);
  return active ? rehabFacts(active.program, toDateKey(today)) : null;
}

const RESULTS: readonly RehabResult[] = ['green', 'yellow', 'red', 'refer'];

/**
 * 상태 계산에 쓰는 기록 — 이 재활의 세션 · 매주 확인 전부와 최근 7일(그날 포함) 체크인.
 * 세션은 몇 주치라 다 읽는다(빨강 셋 · 낮춤 · 깨끗한 세션을 세는 데 이 단계 것 전부가 필요하다). 매주 확인은 일주일에
 * 한 줄이라 다 읽어도 몇 줄이다(이어진 수 · 2주째 · 6주째를 첫 확인부터 본다).
 */
export async function loadRehabRecords(
  userId: string,
  programId: string,
  todayKey: string
): Promise<{
  sessions: RehabSessionLike[];
  checkins: RehabCheckinLike[];
  weeklies: RehabWeeklyLike[];
}> {
  const [sessions, checkins, weeklies] = await Promise.all([
    prisma.userRehabSession.findMany({
      where: { programId, userId },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        stage: true,
        leftover: true,
        pain: true,
        feel: true,
        result: true,
        lowered: true,
      },
    }),
    prisma.dailyCheckin.findMany({
      where: {
        userId,
        date: { gte: dayStart(shiftDateKey(todayKey, -6)), lte: dayStart(todayKey) },
      },
      select: { date: true, shoulder: true, elbow: true, armPainLevel: true },
    }),
    loadRehabWeeklies(userId, programId),
  ]);
  return {
    sessions: sessions
      .filter((s) => (RESULTS as readonly string[]).includes(s.result))
      .map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        stage: s.stage,
        leftover: s.leftover,
        pain: s.pain,
        feel: s.feel,
        result: s.result as RehabResult,
        lowered: s.lowered,
      })),
    checkins: checkins.map((c) => ({
      date: c.date.toISOString().slice(0, 10),
      shoulder: c.shoulder,
      elbow: c.elbow,
      armPainLevel: c.armPainLevel,
    })),
    weeklies,
  };
}

/** 매주 확인 줄 — 오래된 것부터, test 칸(Json)은 읽어 맞춘 모양으로 */
export async function loadRehabWeeklies(
  userId: string,
  programId: string
): Promise<RehabWeeklyLike[]> {
  const rows = await prisma.userRehabWeekly.findMany({
    where: { programId, userId },
    orderBy: { date: 'asc' },
    select: {
      date: true,
      stage: true,
      normalPct: true,
      worstPain: true,
      nightPain: true,
      activities: true,
      confidence: true,
      test: true,
    },
  });
  return rows.map((w) =>
    readRehabWeekly({ ...w, date: w.date.toISOString().slice(0, 10) })
  );
}

/**
 * 이날 뒤로 걸친 재활 기간들(진행 중 + 끝낸 것) — 트레이닝 회전 · 운동 부하가 재활 체크를 뺀다(isRehabCheck).
 * 스위치(REHAB_ENABLED)를 끄면 빈 목록이다(그러면 예전처럼 다 센다).
 */
export const loadRehabPeriods = cache(
  async (userId: string, sinceKey: string): Promise<RehabPeriod[]> => {
    if (!REHAB_ENABLED) return [];
    const rows = await prisma.userRehabProgram.findMany({
      where: {
        userId,
        OR: [{ endedAt: null }, { endedAt: { gte: dayStart(sinceKey) } }],
      },
      select: { area: true, condition: true, startedAt: true, endedAt: true },
    });
    return rows.flatMap((r) => {
      if (!isRehabArea(r.area)) return [];
      const condition =
        isRehabCondition(r.condition) && REHAB_CONDITIONS[r.condition].area === r.area
          ? r.condition
          : null;
      return [
        {
          from: toDateKey(r.startedAt),
          to: r.endedAt ? toDateKey(r.endedAt) : null,
          names: rehabExerciseNames(r.area, condition),
        },
      ];
    });
  }
);

/**
 * 오늘 재활 세션에 들 수 있는 운동 id — 낮춘 날 · 아닌 날 둘 다(가진 장비로 바꿔 넣은 암케어 운동까지). 재활 중이 아니면 빈 집합.
 * 트레이닝 '오늘 운동'이 재활에서 한 체크를 '직접 넣음'으로 도로 끼우지 않게 한다(lib/report/today-data.ts 의 strays).
 */
export async function loadRehabExerciseIds(
  userId: string,
  library: readonly CachedExercise[],
  ownedEquipment: readonly string[]
): Promise<Set<string>> {
  const active = await loadActiveRehab(userId);
  if (!active) return new Set();
  const lib = toRehabLibrary(library);
  return new Set(
    [false, true].flatMap((lowered) =>
      buildRehabSession({
        ...active.program,
        lowered,
        library: lib,
        ownedEquipment,
      }).items.map((it) => it.exerciseId)
    )
  );
}

/** 라이브러리 줄 → 재활 세션이 보는 모양(근육 칸이 생기기 전에 캐시에 담긴 줄도 받는다) */
export function toRehabLibrary(
  library: readonly CachedExercise[]
): RehabLibraryExercise[] {
  return library.map((ex) => ({
    id: ex.id,
    title: ex.title,
    category: ex.category,
    intensity: ex.intensity,
    equipment: ex.equipment,
    targetMuscles: ex.targetMuscles ?? [],
    sets: ex.sets,
    reps: ex.reps,
    holdSeconds: ex.holdSeconds,
    restSeconds: ex.restSeconds,
    perSide: ex.perSide,
  }));
}

/** 그날 체크한 운동 — 재활 운동은 카테고리가 여럿이라 암케어 기록(today.ts)과 따로 읽는다 */
export async function loadDoneOn(
  userId: string,
  dateKey: string,
  exerciseIds: readonly string[]
): Promise<Set<string>> {
  if (exerciseIds.length === 0) return new Set();
  const rows = await prisma.userExerciseLog.findMany({
    where: {
      userId,
      completed: true,
      date: dayStart(dateKey),
      exerciseId: { in: [...exerciseIds] },
    },
    select: { exerciseId: true },
  });
  return new Set(rows.map((r) => r.exerciseId));
}

/**
 * 투구 복귀표에 던진 날 — 이 재활 동안의 투구 기록 가운데 꼬리표(THROW_TAG)가 붙은 것(lib/armcare/rehab-progress.ts).
 * 날짜 순. 같은 날 두 줄이면 둘 다(두 번 던진 것).
 */
export async function loadRehabThrows(userId: string, startedOn: string): Promise<ThrowRecord[]> {
  const rows = await prisma.pitchLog.findMany({
    where: { userId, date: { gte: dayStart(startedOn) }, memo: { startsWith: THROW_TAG } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: { date: true, pitchCount: true, memo: true },
  });
  return rows.flatMap((r) => {
    const parsed = parseThrowMemo(r.memo);
    return parsed ? [{ date: toDateKey(r.date), pitches: r.pitchCount, ...parsed }] : [];
  });
}
