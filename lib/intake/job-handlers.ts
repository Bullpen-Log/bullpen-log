/**
 * 지속 작업의 처리기 다섯 — 화면을 닫아도 크론이 이어 간다. 넣기 · 임대 · 재시도는 lib/intake/jobs.ts 몫이다.
 *
 *   verify_asset      스트리밍 SHA-256 · 크기 · 파일 머리 · 브라우저 해시와 대조(service.ts verifyAsset). 저장소 탓이면 던져서 다시 하고, 파일 탓이면 자산을 닫는다.
 *   register_revision 검증된 판의 원본이 저장소에 그대로 있는지 보고 '분석 가능'으로 등록한다. 같은 입력의 실행이 있으면 분석 상태를 잇는다. GPU 는 걸지 않는다.
 *   poll_analysis     분석 서버에 묻고 결과를 readPitch3dV2Result 로 검사해 적는다(analysis.ts pollIntakeRun).
 *   cleanup_uploads   끝난 전송을 찾아 잇고(대사), 판에 오르지 못한 임시 파일만 지운다. 판에 얼린 원본은 건드리지 않는다.
 *   purge_originals   보유 기간이 끝난 접수의 원본 · 미리보기를 지운다(purge.ts). 분석이 돌거나 고침을 기다리면 횟수를 안 쓰고 미룬다.
 *
 * 처리기는 같은 일을 두 번 해도 괜찮아야 한다. 임대가 끝나면 다른 일꾼이 이어 받는다.
 * 크론은 일감 밖의 끊김도 잇는다: 정산이 안 된 판(reconcilePendingRevisions), 횟수를 다 써 멈춘 검증 · 등록(repairFailedJobs — 느리게, 상한까지).
 * 상한을 넘겨 멈춘 일감은 lastError 와 함께 표에 남는다. 관리자가 service.ts requeueVerification 으로 다시 건다.
 * 보유 삭제 일감은 시도를 다 써도 포기하지 않는다. 지워야 하는 파일이라 enqueueDuePurges 가 느리게 다시 건다.
 * 일감 · 크론에는 GPU 를 거는 길이 없다. startIntakeAnalysis 를 부르는 곳은 관리자 동작뿐이다.
 */
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { activeRunIds, appIntakeRuntime, carryAnalysisForward, pollIntakeRun, POLL_INTERVAL_MS, pollJobKey, type IntakeRuntime } from '@/lib/intake/analysis';
import { writeAudit } from '@/lib/intake/audit';
import { enqueueJob, requeueJob, runDueJobs, type IntakeJobKind, type JobHandlers, type RunSummary } from '@/lib/intake/jobs';
import { PURGE_RETRY_AFTER_MS, enqueueDuePurges, purgeSubmissionOriginals } from '@/lib/intake/purge';
import { intakeCoreJobHandlers, reconcilePendingRevisions } from '@/lib/intake/service';
import { verifyTargetIds } from '@/lib/intake/state';
import type { IntakeStorage } from '@/lib/intake/storage-core';

const QUARTER_HOUR_MS = 15 * 60_000;
const FINISHED_JOB_KEEP_MS = 30 * 86_400_000;
/** 한 번에 잴 파일 수 — 1GiB 해시가 함수 시간 안에 끝나도록 작게 잡는다 */
const VERIFY_PER_RUN = 3;
const LIGHT_PER_RUN = 20;
const LIGHT_KINDS: readonly IntakeJobKind[] = ['poll_analysis', 'register_revision', 'cleanup_uploads'];
/** 멈춘 일감을 저절로 다시 거는 간격 · 횟수 · 한 번에 줄 시도 — 저장소 장애가 지나간 뒤 풀리게 하되, 1GiB 전체 읽기를 끝없이 되풀이하지 않게 */
const AUTO_REQUEUE_EVERY_MS = 6 * 3_600_000;
const AUTO_REQUEUE_MAX = 8;
const AUTO_REQUEUE_TRIES = 2;
const REPAIR_PER_RUN = 20;
/** 한 번에 지우는 접수 수 — 저장소 호출이 몇 번뿐이라 가볍지만, 함수 시간 안에 끝나게 묶어 둔다 */
const PURGE_PER_RUN = 10;

/**
 * 판을 분석 가능으로 등록한다. 얼린 두 원본이 저장소에 그대로 있어야 한다. DB 와 저장소가 어긋나면 던지고, 재시도 뒤에는 일감이 lastError 와 함께 실패로 남는다.
 * 지금 판이 아니거나 검증이 안 끝났으면 할 일이 없다.
 */
export async function registerRevision(rt: Pick<IntakeRuntime, 'db' | 'now'> & { storage: IntakeStorage }, revisionId: string): Promise<'registered' | 'skipped'> {
  const { db, storage } = rt;
  const now = rt.now?.() ?? new Date();
  const rev = await db.intakeRevision.findUnique({ where: { id: revisionId } });
  if (!rev || rev.status !== 'verified') return 'skipped';
  const sub = await db.intakeSubmission.findUnique({ where: { id: rev.submissionId } });
  if (!sub || sub.currentRevisionId !== rev.id) return 'skipped';

  const assets = await db.intakeAsset.findMany({ where: { id: { in: [rev.sideAssetId, rev.rearAssetId] } } });
  if (assets.length !== 2) throw new Error('얼린 판의 자산이 없어요');
  /* 보유 기간이 끝나 지운 원본은 없는 것이 맞다 — 고침을 거둬 다시 등록해도 실패로 쌓이지 않게 */
  if (assets.some((a) => a.purgedAt != null)) return 'skipped';
  for (const a of assets) {
    const stat = await storage.stat(a.objectPath);
    if (!stat) throw new Error(`원본이 저장소에 없어요: ${a.id}`);
    if (a.storedBytes != null && stat.size !== Number(a.storedBytes)) throw new Error(`원본 크기가 달라졌어요: ${a.id}`);
  }
  await writeAudit(db, { actor: { kind: 'system' }, action: 'revision.registered', submissionId: rev.submissionId, detail: { revision: rev.number, revisionId: rev.id } }, now);
  return 'registered';
}

/** 처리기 다섯 */
export function intakeJobHandlers(rt: IntakeRuntime): JobHandlers {
  return {
    ...intakeCoreJobHandlers(rt.db, rt.storage),
    register_revision: async (job) => {
      const { revisionId } = job.payload as { revisionId: string };
      /* 글만 고친 판은 앞 판의 같은 입력 실행을 잇는다. 잇지 않으면 공개 화면이 '분석을 기다려요'에 머문다 */
      if ((await registerRevision(rt, revisionId)) === 'registered') await carryAnalysisForward(rt, revisionId);
    },
    poll_analysis: async (job) => {
      const r = await pollIntakeRun((job.payload as { runId: string }).runId, rt);
      return r.finished ? undefined : { retryAfterMs: POLL_INTERVAL_MS };
    },
    purge_originals: async (job) => {
      const r = await purgeSubmissionOriginals(rt, (job.payload as { submissionId: string }).submissionId);
      return r.outcome === 'held' ? { retryAfterMs: PURGE_RETRY_AFTER_MS } : undefined;
    },
  };
}

export type CronSummary = RunSummary & { repaired: number; settled: number; pruned: number; purgesQueued: number };

const addSummary = (a: RunSummary, b: RunSummary): RunSummary => ({
  done: a.done + b.done,
  retried: a.retried + b.retried,
  failed: a.failed + b.failed,
  postponed: a.postponed + b.postponed,
});

/** 일감이 끊긴 실행을 잇는다 — 없으면 넣고, 횟수를 다 써 멈췄으면 다시 건다 */
async function repairPollJobs(db: PrismaClient, now: Date): Promise<number> {
  let repaired = 0;
  for (const id of await activeRunIds(db)) {
    const key = pollJobKey(id);
    if (await enqueueJob(db, { kind: 'poll_analysis', dedupeKey: key, payload: { runId: id }, runAfter: now })) repaired++;
    else if (await requeueJob(db, key, now)) repaired++;
  }
  return repaired;
}

/** 이 멈춘 일감을 다시 걸 까닭이 아직 있나 — 지금 판이나 칸의 끝나지 못한 파일이거나, 지금 판의 등록이어야 한다 */
async function jobStillLive(db: PrismaClient, kind: string, payload: unknown): Promise<boolean> {
  const { assetId, revisionId } = (payload ?? {}) as { assetId?: unknown; revisionId?: unknown };
  if (kind === 'verify_asset') {
    if (typeof assetId !== 'string') return false;
    const asset = await db.intakeAsset.findUnique({ where: { id: assetId }, select: { status: true, submission: { select: { sideAssetId: true, rearAssetId: true, currentRevisionId: true } } } });
    if (asset?.status !== 'uploaded' && asset?.status !== 'verifying') return false;
    const { currentRevisionId } = asset.submission;
    const rev = currentRevisionId ? await db.intakeRevision.findUnique({ where: { id: currentRevisionId }, select: { sideAssetId: true, rearAssetId: true } }) : null;
    return verifyTargetIds(asset.submission, rev).includes(assetId);
  }
  if (typeof revisionId !== 'string') return false;
  const rev = await db.intakeRevision.findUnique({ where: { id: revisionId }, select: { id: true, status: true, submission: { select: { currentRevisionId: true } } } });
  return rev?.status === 'verified' && rev.submission.currentRevisionId === rev.id;
}

/**
 * 횟수를 다 써 멈춘 검증 · 등록을 느리게 다시 건다 — 저장소 장애가 재시도 간격보다 길었던 경우다. 시도는 두 번만 주고, 상한을 넘으면 사람 몫이다.
 * 다시 걸 까닭이 없어진 줄은 상한으로 밀어 다음부터 안 본다.
 */
async function repairFailedJobs(db: PrismaClient, now: Date): Promise<number> {
  const rows = await db.intakeJob.findMany({
    where: {
      kind: { in: ['verify_asset', 'register_revision'] },
      status: 'failed',
      autoRequeues: { lt: AUTO_REQUEUE_MAX },
      finishedAt: { lt: new Date(now.getTime() - AUTO_REQUEUE_EVERY_MS) },
    },
    orderBy: { finishedAt: 'asc' },
    take: REPAIR_PER_RUN,
  });
  let repaired = 0;
  for (const job of rows) {
    if (!(await jobStillLive(db, job.kind, job.payload))) {
      await db.intakeJob.updateMany({ where: { id: job.id, status: 'failed' }, data: { autoRequeues: AUTO_REQUEUE_MAX } });
      continue;
    }
    const moved = await db.intakeJob.updateMany({
      where: { id: job.id, status: 'failed' },
      data: { status: 'queued', attempts: Math.max(0, job.maxAttempts - AUTO_REQUEUE_TRIES), autoRequeues: { increment: 1 }, runAfter: now, finishedAt: null },
    });
    repaired += moved.count;
  }
  return repaired;
}

/**
 * 크론 한 번. 가벼운 일을 먼저 끝내고 큰 파일 재기는 몇 개만 한다 — 함수 시간이 끝나도 임대가 풀려 다음 크론이 이어 간다.
 * 정리는 15분에 한 번만 건다(키가 15분 칸마다 달라 그사이 다시 안 들어간다).
 */
export async function runIntakeCron(rt: IntakeRuntime, input: { owner?: string } = {}): Promise<CronSummary> {
  const { db } = rt;
  const owner = input.owner ?? `cron-${randomUUID()}`;
  const now = rt.now?.() ?? new Date();
  const handlers = intakeJobHandlers(rt);

  await enqueueJob(db, { kind: 'cleanup_uploads', dedupeKey: `cleanup_uploads:${Math.floor(now.getTime() / QUARTER_HOUR_MS)}`, payload: {}, runAfter: now, maxAttempts: 3 });
  const repaired = (await repairPollJobs(db, now)) + (await repairFailedJobs(db, now));
  const settled = await reconcilePendingRevisions(db, now);
  const purgesQueued = await enqueueDuePurges(db, now);

  const clockFn = rt.now;
  const light = await runDueJobs(db, handlers, { owner, limit: LIGHT_PER_RUN, kinds: LIGHT_KINDS, now: clockFn });
  const purge = await runDueJobs(db, handlers, { owner, limit: PURGE_PER_RUN, kinds: ['purge_originals'], now: clockFn });
  const heavy = await runDueJobs(db, handlers, { owner, limit: VERIFY_PER_RUN, kinds: ['verify_asset'], now: clockFn });

  const pruned = await db.intakeJob.deleteMany({ where: { status: 'done', finishedAt: { lt: new Date(now.getTime() - FINISHED_JOB_KEEP_MS) } } });
  return { ...addSummary(addSummary(light, purge), heavy), repaired, settled, pruned: pruned.count, purgesQueued };
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** Vercel 크론의 머리가 맞나 — 비밀이 없으면 늘 막는다 */
export function cronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  return timingSafeEqual(digest(authorization ?? ''), digest(`Bearer ${secret}`));
}

/** GET /api/cron/intake 의 몸체. 라우트와 시험이 같은 것을 부른다 */
export async function handleCronRequest(req: Request, secret: string | undefined, rt?: IntakeRuntime): Promise<Response> {
  if (!cronAuthorized(req.headers.get('authorization'), secret)) return new Response('unauthorized', { status: 401 });
  try {
    const summary = await runIntakeCron(rt ?? (await appIntakeRuntime()));
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[intake cron]', e instanceof Error ? e.message : 'unknown');
    return Response.json({ ok: false }, { status: 500 });
  }
}
