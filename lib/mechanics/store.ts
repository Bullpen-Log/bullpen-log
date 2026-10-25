import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { programStateJson, readProgramState, type ProgramState, type MechanicsAttempt } from '@/lib/mechanics/program';
import type { SessionDrillView } from '@/lib/mechanics/load';

/** 모든 프로그램 변경이 같은 트랜잭션 잠금을 사용한다. 서버 인스턴스가 달라도 유효하다. */
export function withMechanicsTransaction<T>(userId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mechanics:${userId}`}, 0))`;
      return work(tx);
    },
    { maxWait: 10_000, timeout: 30_000 }
  );
}

export function mechanicsPlanKey(id: string, sessionsDone: number, state: ProgramState): string {
  const f = state.focus;
  const focus = f
    ? {
        reportId: f.reportId,
        jobId: f.jobId,
        criteria: f.criteria ?? null,
        rx: f.rx,
        ...(f.progression
          ? { runId: f.progression.id, elements: f.progression.elements }
          : { done: f.done, invalid: !!f.progressionInvalid }),
      }
    : null;
  // 다음 날 반응·자가 평가 저장은 연습 배정을 바꾸지 않는다. 객체 키 순서에도 영향받지 않는다.
  const payload = JSON.stringify([id, sessionsDone, state.level, state.index, focus], (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, value[k]])
        )
      : value
  );
  return createHash('sha256').update(payload).digest('hex');
}

/** 화면을 열 때 배정을 고정한다. 이후 부하·장비 변경으로 완료 기준이 바뀌지 않는다. */
export function openMechanicsAttempt(userId: string, planKey: string, items: SessionDrillView[]) {
  return withMechanicsTransaction(userId, async (tx) => {
    const row = await tx.mechanicsProgram.findUnique({ where: { userId } });
    if (!row) return null;
    const state = readProgramState(row.progress);
    if (mechanicsPlanKey(row.id, row.sessionsDone, state) !== planKey) return null;
    const on = toDateKey(appNow());
    if (
      state.attempt?.requirementsVersion === 1 &&
      !state.attempt.completed &&
      state.attempt.on === on &&
      state.attempt.planKey === planKey
    ) {
      const available = new Map(items.flatMap((i) => i.alternatives.flatMap((a) => a.variants.map((v) => [v.id, v.owned] as const))));
      return {
        ...state.attempt,
        items: state.attempt.items.map((i) => ({
          ...i,
          alternatives: i.alternatives.map((a) => ({
            ...a,
            variants: a.variants.map((v) => ({ ...v, owned: available.get(v.id) ?? false })),
          })),
        })),
      };
    }
    const attempt: MechanicsAttempt = {
      id: randomUUID(),
      requirementsVersion: 1,
      on,
      session: row.sessionsDone + 1,
      planKey,
      items,
      doneIds: [],
      completed: false,
    };
    await tx.mechanicsProgram.update({
      where: { userId },
      data: {
        progress: programStateJson({
          ...state,
          attempt,
        }) as unknown as Prisma.InputJsonValue,
      },
    });
    return attempt;
  });
}
