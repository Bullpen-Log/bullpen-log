/**
 * 보유 기간이 끝난 원본을 지운다 — 언제 지우는지는 lib/intake/retention.ts, 판에 오르지 못한 임시 파일은 service.ts cleanupStaleUploads 몫이다.
 *
 * 흐름: 크론이 지울 날이 된 접수와 지우다 멈춘 접수를 찾아 일감을 넣고(enqueueDuePurges), 일감이 접수 하나를 지운다(purgeSubmissionOriginals).
 *
 * ── 약속 ──────────────────────────────
 * - 지우는 것: 그 접수의 판에 오른 원본 전부(지금 판 · 옛 판)와, 그 원본을 입력으로 쓴 실행의 미리보기 영상이다. 미리보기도 같은 사람의 영상이라서다.
 *   판에 오른 적 없는 파일은 건드리지 않는다. 철회 유예와 전송 여유를 지키는 cleanupStaleUploads 만 다룬다.
 * - 남기는 것: 분석 결과 JSON, DB 줄, SHA-256, 감사 기록. 그래서 공개 결과는 원본 없이 그대로 열린다.
 * - 순서: 접수를 잠근 트랜잭션에서 자산을 'purging' 으로 적고, 그것이 커밋된 뒤에야 저장소를 부른다. 지우는 것은 'purging' 자산뿐이다.
 *   표시는 되돌리지 않는 결정이다. 일부 바이트가 이미 없을 수 있어서, 이 상태의 파일은 새 판 · 새 실행 · 공개 · 주소에 못 들어간다(lib/intake/state.ts ASSET_GONE).
 * - 'purging' 은 'purged' 로만 간다. 표시가 걸린 파일은 철회로 날짜가 밀려도, 고침이 열려도 지울 날 · 기다림을 다시 안 보고 끝까지 지운다.
 * - 끝내기: 저장소에서 없어진 것을 자산별로 확인한다. 원본과 그 자산을 입력으로 쓴 실행의 미리보기가 다 없어진 자산만 'purged' 로 적는다.
 *   파일 하나가 남아도 끝낼 수 있는 자산은 적고 던진다. 연결이 실패하면 지워졌는지 모르니 아무것도 안 적고 그대로 던진다. 던지면 일꾼이 다시 한다(없는 객체를 지워도 괜찮다).
 * - 기다리는 때: 분석이 도는 동안(대기 · 실행 · 시작 응답 모름), 끝난 지 한 시간이 안 됐을 때, 검증 일감이 살아 있을 때, 받는 사람이 고칠 수 있는 고침이 열려 있을 때.
 *   기다린 일감은 횟수를 안 쓰고 미룬다. 지울 날이 지나면 새 분석은 막혀서(analysis.ts) 기다리는 동안 새 실행이 끼어들지 못한다.
 *   기다림은 아직 표시하지 않은 파일에만 걸린다. 옛 표시가 멈춘 채 새 판의 지울 날이 되면 새 판 파일도 표시해 같이 지운다 — 옛 파일 하나가 새 파일의 90일을 끝없이 미루지 않게.
 * - 고침이 열린 채 기다림이 끝나면(INTAKE_CORRECTION_HOLD_DAYS) 얼린 원본만 지우고, 새로 고른 파일은 남긴다. 지울 칸은 표시와 같은 트랜잭션에서 고침 요청에 넣어 받는 사람이 새 파일을 낼 수 있게 한다.
 * - 감사 기록: 시작은 표시할 때마다 한 줄(판단 근거를 적는다), 끝은 자산을 'purged' 로 적은 번마다 한 줄(수만 적는다)이다.
 *   previewPaths 는 지우라고 부른 미리보기 경로 수다. 분석 서버가 안 만든 파일도 세고, 자산이 나뉘어 끝나면 같은 경로를 또 센다. 실제로 지운 파일 수가 아니다.
 * - 경로는 isPurgeablePath 를 지나야 한다. 이 접수 폴더 밖이나 다른 모양의 경로가 끼면 표시도 삭제도 안 하고 던진다.
 *
 * 이 파일은 server-only 를 머리에 달지 않는다. 시험이 rt 를 넘겨 그대로 부른다.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { runPreviewPath, type IntakeRuntime } from '@/lib/intake/analysis';
import { writeAudit } from '@/lib/intake/audit';
import { enqueueJob } from '@/lib/intake/jobs';
import { assetObjectPath, isPurgeablePath } from '@/lib/intake/paths';
import { removeAndFindLeft, removeLeftObject } from '@/lib/intake/remove';
import { ORIGINAL_RETENTION_MS, correctionHoldUntil, originalRetention, retentionDue, type OriginalRetention } from '@/lib/intake/retention';
import { purgedViews, verifyJobKey } from '@/lib/intake/service';
import { canMoveAsset, readCorrection, type AssetStatus } from '@/lib/intake/state';
import type { IntakeStorage } from '@/lib/intake/storage-core';

/** 기다린 뒤 다시 보는 간격 */
export const PURGE_RETRY_AFTER_MS = 15 * 60_000;
/** 실행이 끝나도 분석 서버가 파일을 더 쓸 수 있어 기다리는 시간 — 분석 서버용 읽기 주소 수명과 같다 */
export const PURGE_RUN_SETTLE_MS = 60 * 60_000;
/** 한 번에 찾는 접수 수 */
const PURGE_SCAN_PER_RUN = 50;
/** 시도를 다 쓴 일감을 다시 거는 간격 — 지워야 하는 파일이라 횟수 제한 없이 느리게 되풀이한다 */
const PURGE_REQUEUE_EVERY_MS = 6 * 3_600_000;

export const purgeJobKey = (submissionId: string, purgeAt: Date) => `purge_originals:${submissionId}:${purgeAt.getTime()}`;

type PurgeRuntime = Pick<IntakeRuntime, 'db' | 'now'> & { storage: IntakeStorage };

export type PurgeHoldReason = 'analysis' | 'run_settling' | 'verify' | 'correction';
export type PurgeResult =
  | { outcome: 'purged'; assets: number; previewPaths: number }
  /** 판 파일을 아직 표시할 수 없다 — 지우던 파일을 이번에 끝냈어도 이렇게 답해 일감이 다시 돈다 */
  | { outcome: 'held'; reason: PurgeHoldReason }
  /** 지울 날이 아직이거나(시계가 다시 돈 경우) 지울 파일이 없다 */
  | { outcome: 'not_due' | 'nothing' };

/** 일감을 다시 거는 값 — 횟수를 새로 준다 */
const rearm = (now: Date) => ({ status: 'queued', attempts: 0, runAfter: now, finishedAt: null });

/**
 * 지울 접수를 찾아 일감을 넣는다. 판단의 근거는 originalRetention 이고, 이 조회는 후보를 좁힐 뿐이다. 멈춘 일감은 느리게 다시 건다.
 * 앞 단계는 지우다 멈춘 접수를 잇는다. 'purging' 자산이 있으면 지울 날을 안 본다 — 철회가 날짜를 밀어도 끝까지 지운다.
 * 뒤 단계는 표시 안 된 판 자산이 있는 접수의 지울 날을 본다. 옛 표시가 멈춘 접수도 새 판의 지울 날이 되면 여기서 일감이 생긴다.
 */
export async function enqueueDuePurges(db: PrismaClient, now: Date, limit = PURGE_SCAN_PER_RUN): Promise<number> {
  const cutoff = new Date(now.getTime() - ORIGINAL_RETENTION_MS);
  const recent = new Date(now.getTime() - PURGE_REQUEUE_EVERY_MS);
  /* 도는 일감이나 다시 걸 때가 안 된 실패 일감이 있는 접수는 뺀다 — 기다리거나 멈춘 접수가 줄 앞을 차지해 뒤의 접수가 밀리지 않게 */
  const jobBusy = (id: Prisma.Sql) => Prisma.sql`EXISTS (
    SELECT 1 FROM "IntakeJob" j
    WHERE j."kind" = 'purge_originals' AND j."payload"->>'submissionId' = ${id}
      AND (j."status" IN ('queued', 'running') OR (j."status" = 'failed' AND j."finishedAt" >= ${recent})))`;
  let queued = 0;

  const stuck = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT DISTINCT a."submissionId" AS "id" FROM "IntakeAsset" a
    WHERE a."status" = 'purging' AND NOT ${jobBusy(Prisma.sql`a."submissionId"`)}
    LIMIT ${limit}`);
  for (const { id } of stuck) {
    /* 있던 실패 줄을 다시 쓴다 — 날짜가 밀려 열쇠가 달라져도 그 줄이 상세의 '멈춘 일감'에 그대로 남지 않게. 줄이 없으면 시간 칸 열쇠로 새로 넣는다 */
    const last = await db.intakeJob.findFirst({ where: { kind: 'purge_originals', status: 'failed', payload: { path: ['submissionId'], equals: id } }, orderBy: { finishedAt: 'desc' }, select: { id: true } });
    if (last) queued += (await db.intakeJob.updateMany({ where: { id: last.id, status: 'failed' }, data: rearm(now) })).count;
    else if (await enqueueJob(db, { kind: 'purge_originals', dedupeKey: `purge_originals:${id}:resume:${Math.floor(now.getTime() / PURGE_REQUEUE_EVERY_MS)}`, payload: { submissionId: id }, runAfter: now })) queued++;
  }

  const rows = await db.$queryRaw<{ id: string; withdrawnAt: Date | null; lastFinalizedAt: Date; publishedAts: Date[] | null }[]>(Prisma.sql`
    SELECT s."id", s."withdrawnAt", s."lastFinalizedAt",
      (SELECT array_agg(p."publishedAt") FROM "IntakePublication" p WHERE p."submissionId" = s."id") AS "publishedAts"
    FROM "IntakeSubmission" s
    WHERE s."lastFinalizedAt" <= ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM "IntakePublication" p WHERE p."submissionId" = s."id" AND p."publishedAt" > ${cutoff})
      AND (s."withdrawnAt" IS NULL OR s."withdrawnAt" <= ${cutoff} OR EXISTS (SELECT 1 FROM "IntakePublication" p WHERE p."submissionId" = s."id"))
      AND EXISTS (
        SELECT 1 FROM "IntakeAsset" a JOIN "IntakeRevision" r ON r."sideAssetId" = a."id" OR r."rearAssetId" = a."id"
        WHERE a."submissionId" = s."id" AND a."purgedAt" IS NULL AND a."status" <> 'purging'
      )
      AND NOT ${jobBusy(Prisma.sql`s."id"`)}
    ORDER BY s."lastFinalizedAt" ASC
    LIMIT ${limit}`);
  for (const row of rows) {
    const retention = originalRetention({ publishedAts: (row.publishedAts ?? []).map((d) => new Date(d)), lastFrozenAt: new Date(row.lastFinalizedAt), withdrawnAt: row.withdrawnAt ? new Date(row.withdrawnAt) : null });
    if (!retention || !retentionDue(retention, now)) continue;
    const dedupeKey = purgeJobKey(row.id, retention.purgeAt);
    if (await enqueueJob(db, { kind: 'purge_originals', dedupeKey, payload: { submissionId: row.id }, runAfter: now })) {
      queued++;
      continue;
    }
    const again = await db.intakeJob.updateMany({ where: { dedupeKey, status: 'failed', finishedAt: { lt: recent } }, data: rearm(now) });
    queued += again.count;
  }
  return queued;
}

/** 자산 하나와 그것이 없어져야 끝나는 경로들 */
type PurgeTarget = { assetId: string; original: string; previews: string[] };

type PurgePlan =
  | { go: false; result: PurgeResult }
  /** waiting: 지우는 중인 파일과 따로, 아직 표시하지 못한 판 파일이 기다리는 까닭 — 끝낸 뒤 일감을 미뤄 다시 본다 */
  | { go: true; targets: PurgeTarget[]; waiting: PurgeHoldReason | null };

type PlanRun = { id: string; status: string; finishedAt: Date | null; revision: { sideAssetId: string; rearAssetId: string } };

/** 자산마다 지울 경로 — 미리보기는 그 자산을 입력으로 쓴 실행 것뿐이라, 멈춘 동안 새 판에서 돈 실행의 미리보기는 안 지운다. 어긋난 경로가 끼면 던진다 */
function targetsOf(submissionId: string, runs: readonly PlanRun[], assets: readonly { id: string; objectPath: string }[]): PurgeTarget[] {
  const targets = assets.map((a) => ({
    assetId: a.id,
    original: a.objectPath,
    previews: runs.filter((r) => r.revision.sideAssetId === a.id || r.revision.rearAssetId === a.id).flatMap((r) => [runPreviewPath(submissionId, r.id, 'side'), runPreviewPath(submissionId, r.id, 'rear')]),
  }));
  if (assets.some((a) => a.objectPath !== assetObjectPath(submissionId, a.id))) throw new Error('원본 경로가 이 접수의 자리가 아니에요');
  if (!targets.every((t) => [t.original, ...t.previews].every((p) => isPurgeablePath(p, submissionId)))) throw new Error('지울 수 없는 경로가 끼어 있어요');
  return targets;
}

/** 아직 표시 안 한 파일을 지금 표시하면 안 되는 까닭 — 없으면 null */
async function holdReasonOf(
  tx: Prisma.TransactionClient,
  sub: { status: string; invitation: { status: string; uploadExpiresAt: Date }; assets: { id: string }[]; runs: PlanRun[] },
  retention: OriginalRetention,
  now: Date,
): Promise<PurgeHoldReason | null> {
  /* 'requested' 에는 시작 응답을 못 받은 실행도 든다 — 분석 서버가 원본을 읽고 있을 수 있다 */
  if (sub.runs.some((r) => r.status === 'requested' || r.status === 'running')) return 'analysis';
  if (sub.runs.some((r) => r.finishedAt != null && now.getTime() - r.finishedAt.getTime() < PURGE_RUN_SETTLE_MS)) return 'run_settling';
  const verifying = await tx.intakeJob.count({ where: { dedupeKey: { in: sub.assets.map((a) => verifyJobKey(a.id)) }, status: { in: ['queued', 'running'] } } });
  if (verifying > 0) return 'verify';
  if (correctionHoldUntil(retention, { status: sub.status, invitationStatus: sub.invitation.status, uploadExpiresAt: sub.invitation.uploadExpiresAt }, now)) return 'correction';
  return null;
}

/**
 * 접수를 잠근 채 지울 파일을 정하고 새 대상을 'purging' 으로 적는다 — 이 트랜잭션이 커밋돼야 저장소를 부른다.
 * 이미 'purging' 인 파일은 날짜 · 기다림을 안 보고 계속 지운다. 지울 날이 됐고 기다림이 없으면 판에 오른 새 대상을 더 표시한다.
 * 둘 다 없을 때만 지금 안 지우는 까닭을 돌려준다.
 */
function planPurge(db: PrismaClient, submissionId: string, now: Date): Promise<PurgePlan> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${submissionId} FOR UPDATE`;
    const sub = await tx.intakeSubmission.findUnique({
      where: { id: submissionId },
      include: {
        invitation: { select: { status: true, uploadExpiresAt: true } },
        assets: true,
        revisions: { select: { sideAssetId: true, rearAssetId: true } },
        publications: { select: { publishedAt: true } },
        runs: { select: { id: true, status: true, finishedAt: true, revision: { select: { sideAssetId: true, rearAssetId: true } } } },
      },
    });
    if (!sub) return { go: false, result: { outcome: 'nothing' } };

    const decided = sub.assets.filter((a) => a.status === 'purging');
    const retention = originalRetention({ publishedAts: sub.publications.map((p) => p.publishedAt), lastFrozenAt: sub.lastFinalizedAt, withdrawnAt: sub.withdrawnAt });
    const due = retentionDue(retention, now);
    /* 판에 오른 파일만 고른다 — 고침 중 새로 고른 파일은 내면 시계가 새로 돌고, 안 내면 cleanupStaleUploads 가 유예를 지켜 지운다 */
    const frozen = new Set(sub.revisions.flatMap((r) => [r.sideAssetId, r.rearAssetId]));
    const fresh = due ? sub.assets.filter((a) => frozen.has(a.id) && a.purgedAt == null && canMoveAsset(a.status as AssetStatus, 'purging')) : [];
    const waiting = fresh.length > 0 ? await holdReasonOf(tx, sub, retention!, now) : null;
    const marking = waiting ? [] : fresh;

    if (decided.length === 0 && marking.length === 0) {
      if (!due) return { go: false, result: { outcome: 'not_due' } };
      return { go: false, result: waiting ? { outcome: 'held', reason: waiting } : { outcome: 'nothing' } };
    }

    const targets = targetsOf(sub.id, sub.runs, [...decided, ...marking]);
    if (marking.length > 0) {
      await tx.intakeAsset.updateMany({ where: { id: { in: marking.map((a) => a.id) }, submissionId: sub.id }, data: { status: 'purging', updatedAt: now } });
      /* 고침이 열린 채 기다림이 끝났으면, 지울 칸을 요청에 넣어 받는 사람이 새 파일을 낼 수 있게 한다. 판 번호가 같이 올라 낡은 화면은 다시 내지 못한다 */
      const open = sub.status === 'correction_requested' ? readCorrection(sub.correction) : null;
      if (open) {
        const rev = sub.currentRevisionId ? await tx.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } }) : null;
        const views = [...new Set([...open.views, ...(await purgedViews(tx, sub, rev))])];
        if (views.length > open.views.length) await tx.intakeSubmission.update({ where: { id: sub.id }, data: { correction: { ...open, views }, version: { increment: 1 } } });
      }
      const started = targets.filter((t) => marking.some((a) => a.id === t.assetId));
      await writeAudit(
        tx,
        { actor: { kind: 'system' }, action: 'originals.purge_started', submissionId: sub.id, detail: { assets: marking.length, previewPaths: new Set(started.flatMap((t) => t.previews)).size, basis: retention!.basis, anchorAt: retention!.anchorAt, purgeAt: retention!.purgeAt } },
        now,
      );
    }
    return { go: true, targets, waiting };
  });
}

/** 없어진 것을 확인한 자산을 'purged' 로 적는다. 임대가 끝난 일꾼이 먼저 끝냈으면 null */
function finishPurge(db: PrismaClient, submissionId: string, finished: readonly PurgeTarget[], now: Date): Promise<{ assets: number; previewPaths: number } | null> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${submissionId} FOR UPDATE`;
    const { count } = await tx.intakeAsset.updateMany({ where: { id: { in: finished.map((t) => t.assetId) }, submissionId, status: 'purging' }, data: { status: 'purged', purgedAt: now } });
    if (count === 0) return null;
    /* 지우는 파일이 더 없으면 앞서 멈춘 일감을 닫는다 — 끝난 삭제가 상세의 '멈춘 일감'으로 남지 않게 */
    if ((await tx.intakeAsset.count({ where: { submissionId, status: 'purging' } })) === 0) {
      await tx.intakeJob.updateMany({ where: { kind: 'purge_originals', status: 'failed', payload: { path: ['submissionId'], equals: submissionId } }, data: { status: 'done', finishedAt: now, lastError: null } });
    }
    const previewPaths = new Set(finished.flatMap((t) => t.previews)).size;
    await writeAudit(tx, { actor: { kind: 'system' }, action: 'originals.purged', submissionId, detail: { assets: count, previewPaths } }, now);
    return { assets: count, previewPaths };
  });
}

/** 접수 하나의 원본을 지운다. 저장소가 실패하거나 객체가 남으면 던진다 — 일꾼이 다시 한다 */
export async function purgeSubmissionOriginals(rt: PurgeRuntime, submissionId: string): Promise<PurgeResult> {
  const { db, storage } = rt;
  const now = rt.now?.() ?? new Date();
  const plan = await planPurge(db, submissionId, now);
  if (!plan.go) return plan.result;

  const left = new Set(await removeAndFindLeft(storage, [...new Set(plan.targets.flatMap((t) => t.previews)), ...plan.targets.map((t) => t.original)]));
  const finished = plan.targets.filter((t) => !left.has(t.original) && !t.previews.some((p) => left.has(p)));
  const wrote = finished.length > 0 ? await finishPurge(db, submissionId, finished, now) : null;
  if (left.size > 0) throw removeLeftObject();
  /* 지우던 파일은 끝났고 새 파일이 기다린다 — 일감을 끝내면 같은 열쇠로 다시 못 건다 */
  if (plan.waiting) return { outcome: 'held', reason: plan.waiting };
  return wrote ? { outcome: 'purged', ...wrote } : { outcome: 'nothing' };
}
