import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

/**
 * EX-RX01 R2A — v2 저장소(SQL). **반드시 명령 거래의 tx 클라이언트로만** 부른다(전역 prisma 를 쓰지 않는다).
 *
 * 새 칸 · 새 표는 아직 prisma/schema.prisma 에 없다(적용 전 — prisma/pending-migrations/20261113120000_workout_v2_foundation).
 * 생성된 Prisma 클라이언트가 옛 줄을 읽을 때 없는 칸을 고르지 않게 스키마 파일은 그대로 두고, v2 는 여기서 SQL 로만 다룬다.
 * 적용할 때 schema-additions.prisma 를 schema.prisma 에 합친다(README).
 */

export type Tx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

/** 거래 안에서 선수(데이터 주인) 잠금 + 울타리 문맥. 거래가 끝나면 둘 다 사라진다(set_config 의 셋째 인자 true) */
export async function lockOwner(tx: Tx, ownerId: string, mode: 'command' | 'purge' = 'command'): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`workout:${ownerId}`}, 0))`;
  await tx.$queryRaw`SELECT set_config('bullpen.workout_v2_owner', ${ownerId}, true), set_config('bullpen.workout_v2_mode', ${mode}, true)`;
}

export type SessionRow = {
  id: string;
  userId: string;
  date: Date;
  status: string;
  plan: unknown;
  stateVersion: number;
  runGeneration: number;
  mutationProtocolVersion: number;
  safetyEpoch: number;
  startedAt: Date;
  mainStartedAt: Date | null;
  endedAt: Date | null;
  activeSeconds: number;
};

/** 잠근 뒤 판을 새로 읽고 줄도 잠근다. 다른 사람의 판은 없는 판과 같게(null) */
export async function readSessionForUpdate(tx: Tx, sessionId: string, ownerId: string): Promise<SessionRow | null> {
  const rows = await tx.$queryRaw<SessionRow[]>`
    SELECT "id", "userId", "date", "status", "plan", "stateVersion", "runGeneration", "mutationProtocolVersion", "safetyEpoch",
           "startedAt", "mainStartedAt", "endedAt", "activeSeconds"
      FROM "TrainingSession" WHERE "id" = ${sessionId} AND "userId" = ${ownerId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** 판 쓰기 — 읽은 판 번호에서 하나 올린다. 그 사이 바뀌었으면 0 줄(울타리도 번호를 본다) */
export async function writeSession(
  tx: Tx,
  s: SessionRow,
  next: {
    plan?: unknown;
    status?: string;
    endedAt?: Date | null;
    activeSeconds?: number;
    runGeneration?: number;
    safetyEpoch?: number;
    mutationProtocolVersion?: number;
    mainStartedAt?: Date | null;
    warmup?: { outcome: string; doneIds: string[] };
  }
): Promise<number> {
  const plan = next.plan === undefined ? s.plan : next.plan;
  /* 워밍업 칸도 같은 한 번의 쓰기로(울타리는 쓰기마다 판 번호가 하나 오르기를 본다) */
  const hasWarmup = next.warmup != null;
  const n = await tx.$executeRaw`
    UPDATE "TrainingSession" SET
      "plan" = ${JSON.stringify(plan)}::jsonb,
      "status" = ${next.status ?? s.status},
      "endedAt" = ${next.endedAt === undefined ? s.endedAt : next.endedAt},
      "mainStartedAt" = ${next.mainStartedAt === undefined ? s.mainStartedAt : next.mainStartedAt},
      "activeSeconds" = ${next.activeSeconds ?? s.activeSeconds},
      "runGeneration" = ${next.runGeneration ?? s.runGeneration},
      "safetyEpoch" = ${next.safetyEpoch ?? s.safetyEpoch},
      "mutationProtocolVersion" = ${next.mutationProtocolVersion ?? s.mutationProtocolVersion},
      "warmupOutcome" = CASE WHEN ${hasWarmup} THEN ${next.warmup?.outcome ?? null} ELSE "warmupOutcome" END,
      "warmupDoneIds" = CASE WHEN ${hasWarmup} THEN ${next.warmup?.doneIds ?? []}::text[] ELSE "warmupDoneIds" END,
      "stateVersion" = "stateVersion" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${s.id} AND "userId" = ${s.userId} AND "stateVersion" = ${s.stateVersion}`;
  return n;
}

export type ReceiptRow = {
  id: string;
  ownerId: string;
  actorId: string;
  operationId: string;
  sessionId: string | null;
  commandType: string;
  payloadHash: string;
  resultCode: string;
  stateVersion: number | null;
  result: unknown;
  effectKey: string | null;
  effect: unknown;
};

export async function findReceipt(tx: Tx, ownerId: string, operationId: string): Promise<ReceiptRow | null> {
  const rows = await tx.$queryRaw<ReceiptRow[]>`
    SELECT "id", "ownerId", "actorId", "operationId", "sessionId", "commandType", "payloadHash", "resultCode", "stateVersion", "result", "effectKey", "effect"
      FROM "WorkoutMutationReceipt" WHERE "ownerId" = ${ownerId} AND "operationId" = ${operationId}`;
  return rows[0] ?? null;
}

export async function insertReceipt(
  tx: Tx,
  r: {
    ownerId: string;
    actorId: string;
    operationId: string;
    sessionId: string | null;
    runGeneration: number | null;
    commandType: string;
    payloadHash: string;
    resultCode: string;
    stateVersion: number | null;
    result: unknown;
    effectKey?: string | null;
    effect?: unknown;
  }
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "WorkoutMutationReceipt"
      ("id", "ownerId", "actorId", "operationId", "sessionId", "runGeneration", "commandType", "payloadHash", "resultCode", "stateVersion", "result", "effectKey", "effect")
    VALUES (${id}, ${r.ownerId}, ${r.actorId}, ${r.operationId}, ${r.sessionId}, ${r.runGeneration}, ${r.commandType}, ${r.payloadHash},
            ${r.resultCode}, ${r.stateVersion}, ${JSON.stringify(r.result ?? null)}::jsonb, ${r.effectKey ?? null},
            ${r.effect === undefined ? null : JSON.stringify(r.effect)}::jsonb)`;
  return id;
}

export async function findEffect(tx: Tx, effectKey: string): Promise<ReceiptRow | null> {
  const rows = await tx.$queryRaw<ReceiptRow[]>`
    SELECT "id", "ownerId", "actorId", "operationId", "sessionId", "commandType", "payloadHash", "resultCode", "stateVersion", "result", "effectKey", "effect"
      FROM "WorkoutMutationReceipt" WHERE "effectKey" = ${effectKey}`;
  return rows[0] ?? null;
}

export type RevisionRow = {
  id: string;
  userId: string;
  sessionId: string;
  entryId: string;
  exerciseId: string;
  runGeneration: number;
  seq: number;
  source: string;
  snapshot: unknown;
};

export async function insertRevision(
  tx: Tx,
  r: Omit<RevisionRow, 'id'> & { changedFields: string[]; policyVersion: number; operationId: string | null; actorId: string }
): Promise<string> {
  const id = `rev_${randomUUID().replace(/-/g, '')}`;
  await tx.$executeRaw`
    INSERT INTO "WorkoutTargetRevision"
      ("id", "userId", "sessionId", "entryId", "exerciseId", "runGeneration", "seq", "source", "snapshot", "changedFields", "policyVersion", "operationId", "actorId")
    VALUES (${id}, ${r.userId}, ${r.sessionId}, ${r.entryId}, ${r.exerciseId}, ${r.runGeneration}, ${r.seq}, ${r.source},
            ${JSON.stringify(r.snapshot)}::jsonb, ${r.changedFields}::text[], ${r.policyVersion}, ${r.operationId}, ${r.actorId})`;
  return id;
}

export async function readRevision(tx: Tx, id: string): Promise<RevisionRow | null> {
  const rows = await tx.$queryRaw<RevisionRow[]>`
    SELECT "id", "userId", "sessionId", "entryId", "exerciseId", "runGeneration", "seq", "source", "snapshot"
      FROM "WorkoutTargetRevision" WHERE "id" = ${id}`;
  return rows[0] ?? null;
}

export type SetRow = {
  id: string;
  sessionId: string;
  userId: string;
  exerciseId: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
  rir: number | null;
  recordedAt: Date;
  enteredById: string | null;
  orgEventId: string | null;
  entryId: string | null;
  plannedSetKey: string | null;
  targetRevisionId: string | null;
  clientSetId: string | null;
  recordVersion: number;
  runGeneration: number | null;
};

const SET_COLUMNS = Prisma.sql`"id", "sessionId", "userId", "exerciseId", "setNo", "weightKg", "reps", "holdSeconds", "rir", "recordedAt",
  "enteredById", "orgEventId", "entryId", "plannedSetKey", "targetRevisionId", "clientSetId", "recordVersion", "runGeneration"`;

export async function setsOfSession(tx: Tx, sessionId: string): Promise<SetRow[]> {
  return tx.$queryRaw<SetRow[]>`SELECT ${SET_COLUMNS} FROM "UserExerciseSet" WHERE "sessionId" = ${sessionId} ORDER BY "exerciseId", "setNo"`;
}

export async function setByClientId(tx: Tx, userId: string, clientSetId: string): Promise<SetRow | null> {
  const rows = await tx.$queryRaw<SetRow[]>`SELECT ${SET_COLUMNS} FROM "UserExerciseSet" WHERE "userId" = ${userId} AND "clientSetId" = ${clientSetId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** 번호 없는 옛 세트(v2 로 옮기기 전에 남긴 것)를 고치거나 지울 때 — 그 사람 · 그 판의 줄만 */
export async function setByIdForUpdate(tx: Tx, userId: string, sessionId: string, id: string): Promise<SetRow | null> {
  const rows = await tx.$queryRaw<SetRow[]>`SELECT ${SET_COLUMNS} FROM "UserExerciseSet" WHERE "id" = ${id} AND "userId" = ${userId} AND "sessionId" = ${sessionId} FOR UPDATE`;
  return rows[0] ?? null;
}

export async function tombstoneOf(
  tx: Tx,
  userId: string,
  clientSetId: string
): Promise<{ deletedByOperationId: string; values: { weightKg: number | null; reps: number | null; holdSeconds: number | null } | null } | null> {
  const rows = await tx.$queryRaw<{ deletedByOperationId: string; values: { weightKg: number | null; reps: number | null; holdSeconds: number | null } | null }[]>`
    SELECT "deletedByOperationId", "values" FROM "WorkoutSetTombstone" WHERE "userId" = ${userId} AND "clientSetId" = ${clientSetId}`;
  return rows[0] ?? null;
}

export async function insertSet(
  tx: Tx,
  s: Omit<SetRow, 'id' | 'recordVersion' | 'enteredById' | 'orgEventId'> & { date: Date; enteredById?: string | null }
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "UserExerciseSet"
      ("id", "sessionId", "userId", "exerciseId", "date", "setNo", "weightKg", "reps", "holdSeconds", "rir", "recordedAt",
       "enteredById", "entryId", "plannedSetKey", "targetRevisionId", "clientSetId", "recordVersion", "runGeneration")
    VALUES (${id}, ${s.sessionId}, ${s.userId}, ${s.exerciseId}, ${s.date}, ${s.setNo}, ${s.weightKg}, ${s.reps}, ${s.holdSeconds}, ${s.rir},
            ${s.recordedAt}, ${s.enteredById ?? null}, ${s.entryId}, ${s.plannedSetKey}, ${s.targetRevisionId}, ${s.clientSetId}, 0, ${s.runGeneration})`;
  return id;
}

/** 실제 값만 고친다 — 목표 연결(targetRevisionId · plannedSetKey · entryId)은 그대로(설계 4절) */
export async function correctSet(
  tx: Tx,
  row: SetRow,
  next: { weightKg: number | null; reps: number | null; holdSeconds: number | null; rir: number | null }
): Promise<number> {
  return tx.$executeRaw`
    UPDATE "UserExerciseSet" SET "weightKg" = ${next.weightKg}, "reps" = ${next.reps}, "holdSeconds" = ${next.holdSeconds}, "rir" = ${next.rir},
           "recordVersion" = "recordVersion" + 1
     WHERE "id" = ${row.id} AND "recordVersion" = ${row.recordVersion}`;
}

/** 지우고 표식을 남긴다. 번호 없는 옛 세트는 부르는 쪽이 준 번호(옛 앱이 그 세트를 가리키는 번호)로 표식을 남긴다 */
export async function deleteSetWithTombstone(tx: Tx, row: SetRow, operationId: string, tombstoneAs?: string | null): Promise<void> {
  await tx.$executeRaw`DELETE FROM "UserExerciseSet" WHERE "id" = ${row.id}`;
  const key = row.clientSetId ?? tombstoneAs ?? null;
  if (key)
    await tx.$executeRaw`
      INSERT INTO "WorkoutSetTombstone" ("id", "userId", "clientSetId", "sessionId", "entryId", "plannedSetKey", "targetRevisionId", "values", "deletedByOperationId")
      VALUES (${randomUUID()}, ${row.userId}, ${key}, ${row.sessionId}, ${row.entryId}, ${row.plannedSetKey}, ${row.targetRevisionId},
              ${JSON.stringify({ weightKg: row.weightKg, reps: row.reps, holdSeconds: row.holdSeconds })}::jsonb, ${operationId})
      ON CONFLICT ("userId", "clientSetId") DO NOTHING`;
}

export async function insertRecovery(
  tx: Tx,
  r: { ownerId: string; actorId: string; source: string; fingerprint: string; sessionId: string | null; exerciseId: string | null; conflictCode: string; payload: unknown }
): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "WorkoutRecoveryItem" ("id", "ownerId", "actorId", "source", "fingerprint", "sessionId", "exerciseId", "conflictCode", "payload")
    VALUES (${randomUUID()}, ${r.ownerId}, ${r.actorId}, ${r.source}, ${r.fingerprint}, ${r.sessionId}, ${r.exerciseId}, ${r.conflictCode}, ${JSON.stringify(r.payload)}::jsonb)
    ON CONFLICT ("ownerId", "fingerprint") DO UPDATE SET "fingerprint" = EXCLUDED."fingerprint"
    RETURNING "id"`;
  /* 지문은 내용까지 담는다(부르는 쪽이 값의 해시를 넣는다) — 같은 지문 = 같은 사실의 재전송이라 처음 줄 하나로 충분하다(검토 #2) */
  return rows[0].id;
}

/** 프로그램 회차를 잠그고 읽는다 */
export async function readEnrollmentForUpdate(tx: Tx, id: string, userId: string) {
  const rows = await tx.$queryRaw<{ id: string; userId: string; programKey: string; status: string; nextDay: number; mutationProtocolVersion: number }[]>`
    SELECT "id", "userId", "programKey", "status", "nextDay", "mutationProtocolVersion" FROM "UserTrainingProgram"
     WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
  return rows[0] ?? null;
}

export async function advanceEnrollment(tx: Tx, id: string, day: number, doneDate: Date, total: number | null, now: Date): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE "UserTrainingProgram" SET "nextDay" = "nextDay" + 1, "lastDoneDate" = ${doneDate}, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ${id} AND "status" = 'active' AND "nextDay" = ${day}`;
  if (n === 0) return false;
  if (total != null && day >= total)
    await tx.$executeRaw`
      UPDATE "UserTrainingProgram" SET "status" = 'done', "endedAt" = ${now}, "endReason" = 'done', "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ${id} AND "status" = 'active' AND "nextDay" > ${total}`;
  return true;
}
