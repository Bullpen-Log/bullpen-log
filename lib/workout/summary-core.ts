/**
 * EX-LOAD01 R1 — 판의 세트를 운동별 요약 줄(UserExerciseLog)로 접는 핵심. DB 를 넘겨받으므로 서버(close-stale summaryWrites — 마침 · 저절로 닫힘)와
 * 코치 기록(lib/org/team-work-core.ts — 세트 쓰기와 **같은 거래** 안)과 격리 시험(PGlite)이 같은 코드를 돈다. 'server-only' 를 걸지 않는다(화면은 부르지 않는다).
 *
 * 요약의 kg 은 읽기 관문의 '보일 무게'만(lib/workout/load/plan-gate.ts forSummary) — 맨몸 운동의 옛 kg 처럼 계약이 받지 않는 무게는 요약 · 부하 · '최근'으로
 * 올라가지 않고, 문맥이 갈린 무게(기구 A · 기구 B)는 한 숫자로 접지 않는다(lib/workout/summarize.ts summarizeSets). 세트 줄의 원래 값은 그대로 남는다.
 */
import type { Prisma } from '@prisma/client';
import type { RecordingContract } from '@/lib/workout/load/contract';
import type { FrozenLoadSource } from '@/lib/workout/load/frozen';
import { forSummary, gateRows, planContextOf } from '@/lib/workout/load/plan-gate';
import type { LoadSnapshot } from '@/lib/workout/load/snapshot';
import { summarizeSets, type ExerciseSummary } from '@/lib/workout/summarize';

export type SummarySetRow = { id: string; exerciseId: string; weightKg: number | null; reps: number | null; holdSeconds: number | null };

/**
 * 요약 계획 — 쓸 요약(운동마다 한 줄)과 지울 요약(판의 운동인데 세트가 하나도 안 남은 것 — 체크 목록이 남긴 줄은 부르는 쪽이 setsDone 으로 가린다).
 * planExercises 는 그 판에 얼린 운동(readFrozenPlan(plan)?.exercises), current 는 판에 없는 운동의 지금 계약(근거 'current' — kg 은 확인 전).
 */
export function summaryPlanOf(
  rows: readonly SummarySetRow[],
  planExercises: readonly FrozenLoadSource[] | null | undefined,
  snapshots: ReadonlyMap<string, LoadSnapshot> | null,
  current: ReadonlyMap<string, RecordingContract> | null
): { summaries: ExerciseSummary[]; emptied: string[] } {
  const summaryRows = forSummary(gateRows(rows, planContextOf(planExercises, current), snapshots));
  const withSets = new Set(rows.map((r) => r.exerciseId));
  const emptied = (planExercises ?? []).map((e) => e.id).filter((id) => typeof id === 'string' && !withSets.has(id));
  return { summaries: summarizeSets(summaryRows), emptied };
}

/** 요약 한 줄의 upsert 인자 — 서버(일괄 거래)와 같은 거래 실행이 같은 모양을 쓴다 */
export function summaryUpsertArgs(userId: string, date: Date, s: ExerciseSummary): Prisma.UserExerciseLogUpsertArgs {
  return {
    where: { userId_exerciseId_date: { userId, exerciseId: s.exerciseId, date } },
    create: {
      userId,
      exerciseId: s.exerciseId,
      date,
      completed: true,
      setsDone: s.setsDone,
      repsDone: s.repsDone,
      holdSecondsDone: s.holdSecondsDone,
      weightKg: s.weightKg,
    },
    update: {
      completed: true,
      setsDone: s.setsDone,
      repsDone: s.repsDone,
      holdSecondsDone: s.holdSecondsDone,
      weightKg: s.weightKg,
    },
  };
}

/** 지울 요약의 조건 — 세트 요약(setsDone)이 적힌 줄만(체크 목록이 남긴 줄은 setsDone 이 없어 그대로) */
export function emptiedWhere(userId: string, date: Date, emptied: readonly string[]): Prisma.UserExerciseLogWhereInput {
  return { userId, date, exerciseId: { in: [...emptied] }, setsDone: { not: null } };
}

export type SummaryReaders = {
  /** 세트 스냅샷(스키마 적용 뒤에만 — 꺼져 있으면 빈 지도) */
  snapshots: (setIds: readonly string[]) => Promise<ReadonlyMap<string, LoadSnapshot>>;
  /** 운동 번호들의 지금 계약(라이브러리) */
  current: (exerciseIds: readonly string[]) => Promise<ReadonlyMap<string, RecordingContract>>;
  /** 판 JSON → 얼린 운동(readFrozenPlan(plan)?.exercises) */
  planExercises: (plan: unknown) => readonly FrozenLoadSource[] | null | undefined;
};

/**
 * 같은 거래 안에서 요약을 다시 셈해 쓴다 — 코치 기록처럼 세트를 바꾼 그 거래에서 요약까지 함께(사이에 실패하면 둘 다 되돌아간다).
 * tx 로 읽으므로 거래 안에서 방금 쓴 세트가 보인다.
 */
export async function applySummaryTx(tx: Prisma.TransactionClient, readers: SummaryReaders, userId: string, session: { id: string; date: Date }): Promise<void> {
  const [rows, row] = await Promise.all([
    tx.userExerciseSet.findMany({ where: { sessionId: session.id }, select: { id: true, exerciseId: true, weightKg: true, reps: true, holdSeconds: true } }),
    tx.trainingSession.findUnique({ where: { id: session.id }, select: { plan: true } }),
  ]);
  const [snapshots, current] = await Promise.all([readers.snapshots(rows.map((r) => r.id)), readers.current(rows.map((r) => r.exerciseId))]);
  const plan = summaryPlanOf(rows, readers.planExercises(row?.plan), snapshots, current);
  if (plan.emptied.length) await tx.userExerciseLog.deleteMany({ where: emptiedWhere(userId, session.date, plan.emptied) });
  for (const s of plan.summaries) await tx.userExerciseLog.upsert(summaryUpsertArgs(userId, session.date, s));
}

/**
 * EX-LOAD01 R1-03 — 하루 요약 줄로 '평소보다 무겁게 들었나'(운동 부하 지수의 무게 배수, lib/training-load.ts referenceWeights)를 셀 때의 줄 — 순수.
 * 요약 줄에는 세트마다의 기구 열쇠 · 스냅샷이 없다(그날 판의 얼린 계약만). 그래서:
 *   - 견줄 값은 관문의 metricKg 이고 견줌 열쇠(key)가 있을 때만 — 기구 설정값(케이블 · 머신)은 요약 단계에서 늘 기구를 몰라 빠진다(잰 힘이 아니고
 *     기구가 같다는 증거가 없다), 맨몸의 옛 kg · 판이 없는 날의 kg · 섞인 무게 · 도구 무게도 빠진다.
 *   - '평소 무게'의 묶음 열쇠를 운동 번호 + 견줌 열쇠로 — 같은 운동이라도 장비를 바꾼 앞뒤 판(덤벨 한 손 ↔ 바벨 합계)을 한 평균에 섞지 않는다.
 *   - 빠진 줄은 weightKg null(배수 1) — 세트 수 · 시간 · 강도로 센 부하는 그대로다.
 * compared · withheld 는 부르는 쪽이 '무게 없이 셈'을 말할 수 있게 센 수.
 */
export function compatibleLoadRows<T extends { exerciseId: string; weightKg: number | null }>(
  rows: readonly T[],
  viewOf: (row: T) => { metricKg: number | null; key: string | null }
): { rows: (T & { exerciseId: string; weightKg: number | null })[]; compared: number; withheld: number } {
  let compared = 0;
  let withheld = 0;
  const out = rows.map((r) => {
    const v = viewOf(r);
    const kg = v.metricKg != null && v.key != null ? v.metricKg : null;
    if (kg != null) compared++;
    else if (r.weightKg != null && r.weightKg > 0) withheld++;
    return { ...r, exerciseId: kg != null ? `${r.exerciseId}\u0000${v.key}` : r.exerciseId, weightKg: kg };
  });
  return { rows: out, compared, withheld };
}
