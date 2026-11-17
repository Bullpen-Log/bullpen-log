import 'server-only';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import type { PriorBest } from '@/lib/workout/bests';
import { readContextsFor, readSetLoads } from '@/lib/workout/load/server';
import { viewSetLoad } from '@/lib/workout/load/gate';

/**
 * 운동마다 오늘 앞의 최고 기록 — '새 최고'를 가르는 기준(lib/workout/bests.ts).
 *
 * 세트(실시간 운동)와 하루 요약(체크로 남긴 날) 둘 다 본다. 오늘 것은 뺀다 — 지금 하는 판을 넘을 기록으로 삼을 수는 없다. 기간은 자르지
 * 않는다 — 최고 기록은 언제 것이든 최고다.
 *
 * EX-LOAD01 — 예전에는 DB 가 raw kg 의 최댓값을 접었다(groupBy). 그러면 맨몸 운동에 옛 앱이 보낸 kg(포고 홉)이 '무게 최고'가 됐다.
 * 이제 줄마다 읽기 관문(lib/workout/load/gate.ts)을 지나:
 *   - 무게 최고 = 견줄 수 있는 무게(metricKg)만, 그리고 keys 를 주면 그 운동의 지금 견줌 열쇠와 같은 줄만(다른 뜻 · 다른 기구끼리 안 견줌)
 *   - 횟수 최고 = 무게가 견줌에 안 들어가는 줄(맨몸 · 확인 전 kg)의 횟수 — 예전처럼 무게를 든 세트의 횟수는 섞지 않는다
 *   - 버틴 시간 최고 = 모든 줄
 * 줄을 읽으므로 groupBy 보다 무겁지만, 한 사람의 몇 운동 기록이라 수백 줄 안이다.
 */
export async function priorBests(
  userId: string,
  exerciseIds: readonly string[],
  /** 이날 앞의 기록만 — 세션 날짜 */
  before: Date,
  /** 운동마다 지금(오늘 판) 견줌 열쇠 — 주면 같은 열쇠의 무게만 최고로 센다 */
  keys?: ReadonlyMap<string, string | null>
): Promise<Map<string, PriorBest>> {
  const result = new Map<string, PriorBest>();
  if (exerciseIds.length === 0) return result;

  const midnight = new Date(`${toDateKey(before)}T00:00:00.000Z`);
  const ids = [...exerciseIds];

  const [sets, logs] = await Promise.all([
    prisma.userExerciseSet.findMany({
      where: { userId, exerciseId: { in: ids }, date: { lt: midnight } },
      select: { id: true, sessionId: true, exerciseId: true, weightKg: true, reps: true, holdSeconds: true },
    }),
    prisma.userExerciseLog.findMany({
      where: { userId, exerciseId: { in: ids }, completed: true, date: { lt: midnight } },
      select: { exerciseId: true, date: true, weightKg: true, repsDone: true, holdSecondsDone: true },
    }),
  ]);
  /* 요약 줄의 근거는 그날 판 */
  const days = logs.length
    ? await prisma.trainingSession.findMany({
        where: { userId, date: { in: [...new Set(logs.map((l) => l.date.getTime()))].map((t) => new Date(t)) } },
        select: { id: true, date: true },
      })
    : [];
  const sessionOfDay = new Map(days.map((d) => [d.date.getTime(), d.id]));
  const [ctxOf, snapshots] = await Promise.all([
    readContextsFor([
      ...sets.map((s) => ({ exerciseId: s.exerciseId, sessionId: s.sessionId })),
      ...logs.map((l) => ({ exerciseId: l.exerciseId, sessionId: sessionOfDay.get(l.date.getTime()) ?? null })),
    ]),
    readSetLoads(sets.map((s) => s.id)),
  ]);

  const bump = (exerciseId: string, kind: keyof PriorBest, v: number | null | undefined) => {
    if (v == null || !(v > 0)) return;
    const had = result.get(exerciseId) ?? { weightKg: null, reps: null, holdSeconds: null };
    if (had[kind] == null || v > (had[kind] as number)) result.set(exerciseId, { ...had, [kind]: v });
    else if (!result.has(exerciseId)) result.set(exerciseId, had);
  };
  const touch = (exerciseId: string) => {
    if (!result.has(exerciseId)) result.set(exerciseId, { weightKg: null, reps: null, holdSeconds: null });
  };
  const keyOk = (exerciseId: string, key: string | null) => !keys || !keys.has(exerciseId) || (key != null && keys.get(exerciseId) === key);

  for (const s of sets) {
    touch(s.exerciseId);
    const v = viewSetLoad(ctxOf(s.exerciseId, s.sessionId), { weightKg: s.weightKg, snapshot: snapshots.get(s.id) ?? null });
    if (v.metricKg != null && keyOk(s.exerciseId, v.key)) bump(s.exerciseId, 'weightKg', v.metricKg);
    if (v.metricKg == null && v.displayKg == null) bump(s.exerciseId, 'reps', s.reps);
    bump(s.exerciseId, 'holdSeconds', s.holdSeconds);
  }
  for (const l of logs) {
    touch(l.exerciseId);
    const v = viewSetLoad(ctxOf(l.exerciseId, sessionOfDay.get(l.date.getTime()) ?? null), { weightKg: l.weightKg });
    if (v.metricKg != null && keyOk(l.exerciseId, v.key)) bump(l.exerciseId, 'weightKg', v.metricKg);
    if (v.metricKg == null && v.displayKg == null) bump(l.exerciseId, 'reps', l.repsDone);
    bump(l.exerciseId, 'holdSeconds', l.holdSecondsDone);
  }
  return result;
}
