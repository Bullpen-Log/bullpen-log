/**
 * EX-LOAD01 — 세트 무게의 DB 쓰기 핵심. DB(거래)를 넘겨받으므로 실제 앱(lib/prisma)과 격리 시험(PGlite)이 **같은 코드**를 돈다.
 * 'server-only' 를 걸지 않은 까닭이 이것이다 — 앱 화면(브라우저 · 앱)은 이 파일을 부르지 않는다(서버 동작 · 서버 모듈만).
 *
 * 새 칸 · 표(UserExerciseSet.load · WorkoutLoadRecovery)는 structured 일 때만 SQL 에 나온다 — 스키마를 적용하지 않은 DB 에서
 * structured=false 길은 새 이름을 한 번도 보내지 않는다.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { canonicalJson } from '@/lib/workout/v2/operation';
import { normalizeSetLoad, type NormalizeOk } from '@/lib/workout/load/recorded';
import type { LoadErrorCode } from '@/lib/workout/load/protocol';
import { readSnapshot, snapshotOf, type LoadSnapshot } from '@/lib/workout/load/snapshot';

type Tx = Prisma.TransactionClient;

/** 원래 보낸 요청의 지문 — 정규화 전 그대로(없는 칸은 빼고 null 은 남긴다). 밴드 성분 · 역할 · 변형 · 약속 번호도 든다 */
export function originalPayloadHash(original: Record<string, unknown>): string {
  return createHash('sha256').update('ex-load01.set').update('\u0000').update(canonicalJson(original)).digest('hex');
}

export async function writeSetSnapshot(tx: Tx, setId: string, snap: LoadSnapshot): Promise<void> {
  await tx.$executeRaw`UPDATE "UserExerciseSet" SET "load" = ${JSON.stringify(snap)}::jsonb WHERE "id" = ${setId}`;
}

export async function readSnapshotsTx(tx: Tx, ids: readonly string[]): Promise<Map<string, LoadSnapshot>> {
  const out = new Map<string, LoadSnapshot>();
  if (ids.length === 0) return out;
  const rows = await tx.$queryRaw<{ id: string; load: unknown }[]>`SELECT "id", "load" FROM "UserExerciseSet" WHERE "id" = ANY(${[...new Set(ids)]}::text[]) AND "load" IS NOT NULL`;
  for (const r of rows) {
    const s = readSnapshot(r.load);
    if (s) out.set(r.id, s);
  }
  return out;
}

export type LoadRecoveryRow = {
  ownerId: string;
  actorId: string;
  setId: string;
  sessionId: string;
  exerciseId: string;
  setNo: number;
  clientSetId?: string | null;
  originalHash: string;
  original: Record<string, unknown>;
  reason: string;
  protocol: number | null;
};

/** 원래 요청 복구 — 같은 지문이면 한 줄(ON CONFLICT DO NOTHING) */
export async function insertLoadRecoveryTx(tx: Tx, r: LoadRecoveryRow): Promise<void> {
  await tx.$executeRaw`INSERT INTO "WorkoutLoadRecovery" ("id","ownerId","actorId","setId","sessionId","exerciseId","setNo","clientSetId","originalHash","originalPayload","reason","protocol")
    VALUES (${randomUUID()}, ${r.ownerId}, ${r.actorId}, ${r.setId}, ${r.sessionId}, ${r.exerciseId}, ${r.setNo}, ${r.clientSetId ?? null}, ${r.originalHash}, ${JSON.stringify(r.original)}::jsonb, ${r.reason}, ${r.protocol})
    ON CONFLICT ("ownerId","sessionId","exerciseId","setNo","originalHash") DO NOTHING`;
}

/** 시험만 — 거래의 단계 사이에 실패를 넣어 '하나의 결과'를 증명한다 */
export type PersistFaults = { afterLock?: () => void | Promise<void>; afterUpsert?: () => void; afterSnapshot?: () => void; afterRecovery?: () => void };

/**
 * 거래 안에서 지금 줄로 다시 정규화했더니 받을 수 없는 요청 — 거래를 되돌리고 던진다(아무것도 안 남음). 부르는 쪽이 받아 요청에 답한다.
 * 정규화의 거절은 기존 값과 상관없는 검사(필수 무게 · 판 · 값)라 실제로는 미리 본 결과와 같다 — 그래도 지금 줄이 권위다.
 */
export class LoadRejectedError extends Error {
  readonly rejection: { error: string; code: LoadErrorCode; actionRequired: boolean };
  constructor(rejection: { error: string; code: LoadErrorCode; actionRequired: boolean }) {
    super(rejection.error);
    this.name = 'LoadRejectedError';
    this.rejection = rejection;
  }
}

/** v2 명령 잠금과 같은 열쇠 — 한 사람의 세트 쓰기(옛 길 · v2 · 코치)가 차례로 지나간다(lib/workout/v2/store.ts withOwnerLock) */
export async function lockOwnerTx(tx: Tx, ownerId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`workout:${ownerId}`}, 0))`;
}

/**
 * 거래 밖에서 미리 본 정규화(prepared)를 지금 줄로 다시 계산한다. 요청에 없던 칸(load 생략)은 **지금 줄**을 그대로 두는 뜻이라,
 * 미리 읽은 옛 값(다른 밴드 · 기구 이름 · 양손 무게 · kg)을 되살리지 않는다. 요청(request)이 없는 결과(예전 쓰기 그대로)는 그대로.
 */
export function renormalize(prepared: NormalizeOk, current: { weightKg: number | null; load: unknown } | null): NormalizeOk {
  if (!prepared.request) return prepared;
  const r = normalizeSetLoad({
    ...prepared.request,
    existing: current ? { weightKg: current.weightKg, load: readSnapshot(current.load)?.value ?? null } : null,
  });
  if (!r.ok) throw new LoadRejectedError({ error: r.error, code: r.code, actionRequired: r.actionRequired });
  return r;
}

export type PersistSetArgs = {
  structured: boolean;
  upsert: Prisma.UserExerciseSetUpsertArgs & { select: { id: true } };
  norm: NormalizeOk;
  owner: { ownerId: string; actorId: string };
  ref: { sessionId: string; exerciseId: string; setNo: number };
  original: Record<string, unknown>;
  protocol: number | null;
  provenance: string;
  faults?: PersistFaults;
};

/**
 * 옛 길(v2 아닌 판)의 세트 쓰기 — logSet 이 부른다.
 *   - structured=false: 예전과 같은 한 줄 upsert(새 칸 없음).
 *   - structured=true : 정식 세트 · 스냅샷 · 원래 요청 복구를 **한 거래**로. 어느 단계든 실패하면 모두 되돌리고 던진다(가짜 성공 없음).
 */
export async function persistSet(
  db: Pick<PrismaClient, '$transaction' | 'userExerciseSet'>,
  a: PersistSetArgs
): Promise<{ id: string; norm: NormalizeOk }> {
  if (!a.structured) {
    const row = await db.userExerciseSet.upsert(a.upsert);
    return { id: row.id, norm: a.norm };
  }
  return db.$transaction(async (tx) => {
    /*
     * 같은 사람의 세트 쓰기를 차례로(잠금) → 이 세트의 지금 줄을 잠가 읽고 → 그 줄로 다시 정규화. 미리 본 결과(a.norm)는 거래 밖에서
     * 읽은 기존 값으로 만든 것이라, 그사이 다른 기기 · 다른 요청이 바꾼 값을 되돌릴 수 있다(오래된 읽기의 덮어쓰기). 옛 칸 kg(투영)도 여기서 정한다.
     */
    await lockOwnerTx(tx, a.owner.ownerId);
    await a.faults?.afterLock?.();
    const cur = await tx.$queryRaw<{ weightKg: number | null; load: unknown }[]>`
      SELECT "weightKg", "load" FROM "UserExerciseSet"
       WHERE "sessionId" = ${a.ref.sessionId} AND "exerciseId" = ${a.ref.exerciseId} AND "setNo" = ${a.ref.setNo} FOR UPDATE`;
    const norm = renormalize(a.norm, cur[0] ?? null);
    const upsert = {
      ...a.upsert,
      create: { ...a.upsert.create, weightKg: norm.weightKg },
      update: { ...a.upsert.update, weightKg: norm.weightKg },
    };
    const row = await tx.userExerciseSet.upsert(upsert);
    a.faults?.afterUpsert?.();
    if (norm.load) {
      await writeSetSnapshot(
        tx,
        row.id,
        snapshotOf({ load: norm.load, status: norm.status, contract: norm.contract, variant: norm.variant, provenance: a.provenance })
      );
    }
    a.faults?.afterSnapshot?.();
    if (norm.recover) {
      await insertLoadRecoveryTx(tx, {
        ownerId: a.owner.ownerId,
        actorId: a.owner.actorId,
        setId: row.id,
        sessionId: a.ref.sessionId,
        exerciseId: a.ref.exerciseId,
        setNo: a.ref.setNo,
        originalHash: originalPayloadHash(a.original),
        original: a.original,
        reason: norm.status === 'legacyIncompatible' ? 'LEGACY_UNSUPPORTED_LOAD' : 'LEGACY_INVALID_LOAD',
        protocol: a.protocol,
      });
    }
    a.faults?.afterRecovery?.();
    return { id: row.id, norm };
  });
}
