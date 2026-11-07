/**
 * 보유 기간이 끝난 원본을 지운다 — 언제 지우는지는 lib/intake/retention.ts, 판에 오르지 못한 임시 파일은 service.ts cleanupStaleUploads 몫이다.
 *
 * 흐름: 크론이 지울 날이 된 접수를 찾아 일감을 넣고(enqueueDuePurges), 일감이 접수 하나를 지운다(purgeSubmissionOriginals).
 *
 * ── 약속 ──────────────────────────────
 * - 지우는 것: 그 접수의 원본 전부(지금 판 · 옛 판)와 실행의 미리보기 영상이다. 미리보기도 같은 사람의 영상이라서다.
 * - 남기는 것: 분석 결과 JSON, DB 줄, SHA-256, 감사 기록. 그래서 공개 결과는 원본 없이 그대로 열린다.
 * - 순서: 저장소에서 지우고, 없어진 것을 확인한 뒤에야 'purged' 로 적는다. 저장소가 실패하면 던져서 일꾼이 다시 하고, 'purged' 로 적지 않는다.
 *   앞 시도가 지우다 끊겼어도 다시 돌면 된다(없는 객체를 지워도 괜찮다). 감사 기록은 마지막에 접수마다 한 줄이다.
 * - 기다리는 때: 분석이 도는 동안(대기 · 실행 · 시작 응답 모름), 끝난 지 한 시간이 안 됐을 때, 검증 일감이 살아 있을 때, 받는 사람이 고칠 수 있는 고침이 열려 있을 때.
 *   기다린 일감은 횟수를 안 쓰고 미룬다. 지울 날이 지나면 새 분석은 막혀서(analysis.ts) 기다리는 동안 새 실행이 끼어들지 못한다.
 * - 고침이 열린 채 기다림이 끝나면(INTAKE_CORRECTION_HOLD_DAYS) 얼린 원본만 지우고, 새로 고른 파일은 남긴다. 지운 칸은 고침 요청에 넣어 받는 사람이 새 파일을 낼 수 있게 한다.
 * - 경로는 isPurgeablePath 를 지나야 한다. 이 접수 폴더 밖이나 다른 모양의 경로가 끼면 아무것도 안 지우고 던진다.
 *
 * 이 파일은 server-only 를 머리에 달지 않는다. 시험이 rt 를 넘겨 그대로 부른다.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { runPreviewPath, type IntakeRuntime } from '@/lib/intake/analysis';
import { writeAudit } from '@/lib/intake/audit';
import { IntakeError } from '@/lib/intake/errors';
import { enqueueJob } from '@/lib/intake/jobs';
import { assetObjectPath, isPurgeablePath } from '@/lib/intake/paths';
import { ORIGINAL_RETENTION_MS, correctionHoldUntil, originalRetention, retentionDue } from '@/lib/intake/retention';
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
  | { outcome: 'purged'; assets: number; previewFiles: number }
  | { outcome: 'held'; reason: PurgeHoldReason }
  /** 지울 날이 아직이거나(시계가 다시 돈 경우) 지울 파일이 없다 */
  | { outcome: 'not_due' | 'nothing' };

const REMOVABLE = (status: string) => canMoveAsset(status as AssetStatus, 'purged');

/** 지울 날이 된 접수를 찾아 일감을 넣는다. 판단의 근거는 originalRetention 이고, 이 조회는 후보를 좁힐 뿐이다. 멈춘 일감은 느리게 다시 건다 */
export async function enqueueDuePurges(db: PrismaClient, now: Date, limit = PURGE_SCAN_PER_RUN): Promise<number> {
  const cutoff = new Date(now.getTime() - ORIGINAL_RETENTION_MS);
  /* 도는 일감이 있는 접수는 뺀다 — 기다리는 접수가 줄 앞을 차지해 뒤의 접수가 밀리지 않게 */
  const rows = await db.$queryRaw<{ id: string; withdrawnAt: Date | null; lastFinalizedAt: Date; publishedAts: Date[] | null }[]>(Prisma.sql`
    SELECT s."id", s."withdrawnAt", s."lastFinalizedAt",
      (SELECT array_agg(p."publishedAt") FROM "IntakePublication" p WHERE p."submissionId" = s."id") AS "publishedAts"
    FROM "IntakeSubmission" s
    WHERE s."lastFinalizedAt" <= ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM "IntakePublication" p WHERE p."submissionId" = s."id" AND p."publishedAt" > ${cutoff})
      AND (s."withdrawnAt" IS NULL OR s."withdrawnAt" <= ${cutoff} OR EXISTS (SELECT 1 FROM "IntakePublication" p WHERE p."submissionId" = s."id"))
      AND EXISTS (
        SELECT 1 FROM "IntakeAsset" a JOIN "IntakeRevision" r ON r."sideAssetId" = a."id" OR r."rearAssetId" = a."id"
        WHERE a."submissionId" = s."id" AND a."purgedAt" IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM "IntakeJob" j
        WHERE j."kind" = 'purge_originals' AND j."status" IN ('queued', 'running') AND j."payload"->>'submissionId' = s."id"
      )
    ORDER BY s."lastFinalizedAt" ASC
    LIMIT ${limit}`);
  let queued = 0;
  for (const row of rows) {
    const retention = originalRetention({ publishedAts: (row.publishedAts ?? []).map((d) => new Date(d)), lastFrozenAt: new Date(row.lastFinalizedAt), withdrawnAt: row.withdrawnAt ? new Date(row.withdrawnAt) : null });
    if (!retention || !retentionDue(retention, now)) continue;
    const dedupeKey = purgeJobKey(row.id, retention.purgeAt);
    if (await enqueueJob(db, { kind: 'purge_originals', dedupeKey, payload: { submissionId: row.id }, runAfter: now })) {
      queued++;
      continue;
    }
    const again = await db.intakeJob.updateMany({
      where: { dedupeKey, status: 'failed', finishedAt: { lt: new Date(now.getTime() - PURGE_REQUEUE_EVERY_MS) } },
      data: { status: 'queued', attempts: 0, runAfter: now, finishedAt: null },
    });
    queued += again.count;
  }
  return queued;
}

type PurgePlan =
  | { go: false; result: PurgeResult }
  | { go: true; assetIds: string[]; originals: string[]; previews: string[]; basis: string; anchorAt: Date; purgeAt: Date };

/** 접수를 잠근 채 지워도 되는지 보고, 지울 경로를 정한다 */
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
        runs: { select: { id: true, status: true, finishedAt: true } },
      },
    });
    if (!sub) return { go: false, result: { outcome: 'nothing' } };
    const retention = originalRetention({ publishedAts: sub.publications.map((p) => p.publishedAt), lastFrozenAt: sub.lastFinalizedAt, withdrawnAt: sub.withdrawnAt });
    if (!retentionDue(retention, now)) return { go: false, result: { outcome: 'not_due' } };
    if (retention!.basis === 'withdrawn_draft') return { go: false, result: { outcome: 'nothing' } };

    /* 고침이 열려 있으면 칸에 새로 고른 파일은 이 판의 것이 아니다 — 내면 시계가 새로 돌고, 안 내면 cleanupStaleUploads 가 지운다 */
    const frozen = new Set(sub.revisions.flatMap((r) => [r.sideAssetId, r.rearAssetId]));
    const pending = sub.status === 'correction_requested' ? new Set([sub.sideAssetId, sub.rearAssetId]) : new Set<string | null>();
    const targets = sub.assets.filter((a) => a.purgedAt == null && REMOVABLE(a.status) && (frozen.has(a.id) || !pending.has(a.id)));
    if (targets.length === 0) return { go: false, result: { outcome: 'nothing' } };

    const hold = (reason: PurgeHoldReason): PurgePlan => ({ go: false, result: { outcome: 'held', reason } });
    /* 'requested' 에는 시작 응답을 못 받은 실행도 든다 — 분석 서버가 원본을 읽고 있을 수 있다 */
    if (sub.runs.some((r) => r.status === 'requested' || r.status === 'running')) return hold('analysis');
    if (sub.runs.some((r) => r.finishedAt != null && now.getTime() - r.finishedAt.getTime() < PURGE_RUN_SETTLE_MS)) return hold('run_settling');
    const verifying = await tx.intakeJob.count({ where: { dedupeKey: { in: sub.assets.map((a) => verifyJobKey(a.id)) }, status: { in: ['queued', 'running'] } } });
    if (verifying > 0) return hold('verify');
    if (correctionHoldUntil(retention, { status: sub.status, invitationStatus: sub.invitation.status, uploadExpiresAt: sub.invitation.uploadExpiresAt }, now)) return hold('correction');

    const originals = targets.map((a) => a.objectPath);
    if (targets.some((a) => a.objectPath !== assetObjectPath(sub.id, a.id))) throw new Error('원본 경로가 이 접수의 자리가 아니에요');
    const previews = sub.runs.flatMap((r) => [runPreviewPath(sub.id, r.id, 'side'), runPreviewPath(sub.id, r.id, 'rear')]);
    if (![...originals, ...previews].every((p) => isPurgeablePath(p, sub.id))) throw new Error('지울 수 없는 경로가 끼어 있어요');
    return { go: true, assetIds: targets.map((a) => a.id), originals, previews, basis: retention!.basis, anchorAt: retention!.anchorAt, purgeAt: retention!.purgeAt };
  });
}

/** 접수 하나의 원본을 지운다. 저장소가 실패하면 던진다 — 일꾼이 다시 한다 */
export async function purgeSubmissionOriginals(rt: PurgeRuntime, submissionId: string): Promise<PurgeResult> {
  const { db, storage } = rt;
  const now = rt.now?.() ?? new Date();
  const plan = await planPurge(db, submissionId, now);
  if (!plan.go) return plan.result;

  const paths = [...plan.previews, ...plan.originals];
  await storage.remove(paths);
  /* 지웠다는 답만 믿지 않는다 — 남아 있으면 'purged' 로 적지 않고 다시 돈다 */
  for (const path of paths) {
    if (await storage.stat(path)) throw new IntakeError('storage_unavailable', { cause: 'remove_left_object' });
  }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${submissionId} FOR UPDATE`;
    const rows = await tx.intakeAsset.findMany({ where: { id: { in: plan.assetIds }, submissionId, purgedAt: null } });
    let assets = 0;
    for (const row of rows) {
      if (!REMOVABLE(row.status)) continue;
      assets += (await tx.intakeAsset.updateMany({ where: { id: row.id, purgedAt: null }, data: { status: 'purged', purgedAt: now } })).count;
    }
    if (assets === 0) return { outcome: 'nothing' };

    /* 고침이 열린 채 기다림이 끝났으면, 지운 칸을 요청에 넣어 받는 사람이 새 파일을 낼 수 있게 한다 */
    const sub = await tx.intakeSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    const open = sub.status === 'correction_requested' ? readCorrection(sub.correction) : null;
    if (open) {
      const rev = sub.currentRevisionId ? await tx.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } }) : null;
      const views = [...new Set([...open.views, ...(await purgedViews(tx, sub, rev))])];
      if (views.length > open.views.length) await tx.intakeSubmission.update({ where: { id: sub.id }, data: { correction: { ...open, views }, version: { increment: 1 } } });
    }

    await writeAudit(
      tx,
      { actor: { kind: 'system' }, action: 'originals.purged', submissionId, detail: { assets, previewFiles: plan.previews.length, basis: plan.basis, anchorAt: plan.anchorAt, purgeAt: plan.purgeAt } },
      now,
    );
    return { outcome: 'purged', assets, previewFiles: plan.previews.length };
  });
}
