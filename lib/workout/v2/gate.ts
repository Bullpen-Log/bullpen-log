import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { execute, type CommandOutcome, type CommandType } from '@/lib/workout/v2/command';
import { lockOwner, type Tx } from '@/lib/workout/v2/store';

/**
 * EX-RX01 R2A — v2 켜기 스위치와 옛 쓰기의 문.
 *
 * **기본은 꺼짐.** `WORKOUT_V2=1` 이 아니면 이 파일의 어느 함수도 DB 를 묻지 않는다 — 옛 요청은 지금과 똑같이 돈다(적용 안 한 칸을 고르지 않는다).
 * 켜는 것은 스키마(prisma/pending-migrations/20261113120000_workout_v2_foundation) · 울타리 · 읽기 · 화면이 다 맞은 뒤의 일이다(README).
 *
 * 켜져 있으면:
 * - 옛 쓰기는 v2 판(mutationProtocolVersion >= 2)을 만나면 v2 명령으로 넘기거나(목표 · 마치기 · 다시 열기) 알아듣게 거절한다.
 *   DB 울타리가 같은 쓰기를 어차피 막지만, 500 오류 대신 사람이 읽는 답을 주려고 먼저 본다.
 * - 코치 기록 · 일정 연결처럼 선수 기록을 바꾸는 옛 쓰기는 같은 선수 잠금 안에서 돈다.
 */

/** v2 를 쓰기 시작해도 되는가(판을 v2 로 올리는 일). 기본 꺼짐 */
export function workoutV2Enabled(): boolean {
  return process.env.WORKOUT_V2 === '1';
}

/**
 * v2 칸 · 울타리가 DB 에 있는가. 켜기(WORKOUT_V2)와 따로 둔다 — 켰다가 끄는(되돌리는) 동안에도 이미 v2 로 올린 판은
 * 옛 쓰기가 울타리에 부딪혀 500 이 나지 않게 v2 길로 보내야 한다(R2A 검토 #0). 적용 전에는 둘 다 없음 → DB 를 묻지 않는다.
 */
export function workoutV2SchemaApplied(): boolean {
  return workoutV2Enabled() || process.env.WORKOUT_V2_SCHEMA === '1';
}

/** 판의 쓰기 규약 번호 — 칸이 없으면(적용 전) 묻지 않고 1 */
export async function sessionProtocol(sessionId: string): Promise<number> {
  if (!workoutV2SchemaApplied()) return 1;
  const rows = await prisma.$queryRaw<{ v: number }[]>`SELECT "mutationProtocolVersion" AS v FROM "TrainingSession" WHERE "id" = ${sessionId}`;
  return rows[0]?.v ?? 1;
}

export async function isV2Session(sessionId: string | null | undefined): Promise<boolean> {
  if (!sessionId || !workoutV2SchemaApplied()) return false;
  return (await sessionProtocol(sessionId)) >= 2;
}

/** 옛 화면 · 옛 앱이 v2 판을 바꾸려 할 때의 답 */
export const V2_LEGACY_REFUSAL = '이 운동은 새 저장 방식으로 열려 있어요. 앱을 최신으로 업데이트한 뒤 다시 해 주세요.';

/** 서버가 만든 작업 번호 — 옛 클라이언트는 번호를 보내지 않으므로 그 요청은 다시 보내도 같은 영수증이 아니다(지금과 같은 수준) */
export function serverOperationId(): string {
  return `srv_${randomUUID().replace(/-/g, '')}`;
}

/** 자기 기록 명령(actor = owner) */
export function runOwn(userId: string, type: CommandType, sessionId: string, payload: unknown, operationId = serverOperationId(), runGeneration?: number | null): Promise<CommandOutcome> {
  return execute(prisma as unknown as Parameters<typeof execute>[0], {
    actorId: userId,
    ownerId: userId,
    operationId,
    type,
    sessionId,
    payload,
    runGeneration: runGeneration ?? null,
    now: appNow,
    /* EX-LOAD01 — 세트 무게 스냅샷 칸이 있는 서버만(lib/workout/load/server.ts loadStructured 와 같은 스위치) */
    loadStructured: process.env.WORKOUT_LOAD_SCHEMA === '1',
  });
}

/**
 * 선수 기록을 바꾸는 옛 쓰기(코치 기록 · 일정 연결)를 선수 잠금 안에서 돈다. 꺼져 있으면 지금처럼 그냥 돈다.
 * 켜져 있으면 v2 명령과 줄을 서고, 울타리 문맥을 걸어 v2 판의 세트도 바꿀 수 있다 — 그러니 부르는 쪽은 v2 세트의
 * 목표 연결(entryId · plannedSetKey · targetRevisionId)을 바꾸지 않는 쓰기만 넘긴다(메타 붙이기 · 떼기).
 */
export async function withOwnerLock<T>(ownerId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  /* 칸이 없으면(적용 전) 지금과 똑같이(거래로 감싸지도 않는다) */
  if (!workoutV2SchemaApplied()) return work(prisma as unknown as Prisma.TransactionClient);
  return prisma.$transaction(
    async (tx) => {
      await lockOwner(tx as unknown as Tx, ownerId);
      return work(tx);
    },
    { maxWait: 10_000, timeout: 30_000 }
  );
}

/**
 * 계정 지우기 — v2 줄을 purge 문맥(그 사람 잠금 + mode 'purge')으로 먼저 지운다. relationMode = prisma 라 DB 가 따라 지우지 않고,
 * 울타리가 문맥 없는 지우기를 막는다(R2A 검토 #13). 칸이 없으면(적용 전) 아무것도 안 한다.
 */
export async function purgeWorkoutV2(userId: string): Promise<void> {
  if (!workoutV2SchemaApplied()) return;
  await prisma.$transaction(
    async (tx) => {
      await lockOwner(tx as unknown as Tx, userId, 'purge');
      await tx.$executeRaw`DELETE FROM "WorkoutRecoveryItem" WHERE "ownerId" = ${userId}`;
      await tx.$executeRaw`DELETE FROM "WorkoutSetTombstone" WHERE "userId" = ${userId}`;
      await tx.$executeRaw`DELETE FROM "WorkoutMutationReceipt" WHERE "ownerId" = ${userId}`;
      await tx.$executeRaw`DELETE FROM "WorkoutTargetRevision" WHERE "userId" = ${userId}`;
      await tx.$executeRaw`DELETE FROM "UserExerciseSet" WHERE "sessionId" IN (SELECT "id" FROM "TrainingSession" WHERE "userId" = ${userId} AND "mutationProtocolVersion" >= 2)`;
      await tx.$executeRaw`DELETE FROM "TrainingSession" WHERE "userId" = ${userId} AND "mutationProtocolVersion" >= 2`;
    },
    { maxWait: 10_000, timeout: 60_000 }
  );
}

/** 운동 지우기 전에 — 그 운동의 세트가 v2 판에 있으면 지우지 않는다(지우면 기록 · 목표 연결이 사라지고, 울타리가 500 으로 막는다, #3) */
export async function exerciseHasV2History(exerciseId: string): Promise<boolean> {
  if (!workoutV2SchemaApplied()) return false;
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "UserExerciseSet" s JOIN "TrainingSession" t ON t."id" = s."sessionId"
     WHERE s."exerciseId" = ${exerciseId} AND t."mutationProtocolVersion" >= 2`;
  return (rows[0]?.n ?? 0) > 0;
}
