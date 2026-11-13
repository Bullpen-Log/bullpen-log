/**
 * 지속 작업의 처리기 다섯 — 화면을 닫아도 크론이 이어 간다. 넣기 · 임대 · 재시도는 lib/intake/jobs.ts 몫이다.
 *
 *   verify_asset      스트리밍 SHA-256 · 크기 · 파일 머리 · 브라우저 해시와 대조(service.ts verifyAsset). 저장소 탓이면 던져서 다시 하고, 파일 탓이면 자산을 닫는다.
 *                     크론은 실행 예산 안에서만 시작하고, 시각이 오면 해시를 끊어 시도 횟수를 돌려준다(아래 '큰 파일'). 근거는 docs/designs/external-intake-large-files.md.
 *   register_revision 검증된 판의 원본이 저장소에 그대로 있는지 보고 '분석 가능'으로 등록한다. 같은 입력의 실행이 있으면 분석 상태를 잇는다. GPU 는 걸지 않는다.
 *   poll_analysis     분석 서버에 묻고 결과를 readPitch3dV2Result 로 검사해 적는다(analysis.ts pollIntakeRun).
 *   cleanup_uploads   끝난 전송을 찾아 잇고(대사), 판에 오르지 못한 임시 파일만 지운다. 판에 얼린 원본은 건드리지 않는다. 파일이 안 지워지면 던져서 다시 돌고, 15분 칸마다 새 일감이 이어 받는다.
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
import {
  JobDeferred,
  budgetFor,
  enqueueJob,
  requeueJob,
  runDueJobs,
  type IntakeJobKind,
  type JobBudget,
  type JobHandler,
  type JobHandlers,
  type LeasedJob,
  type RunSummary,
} from '@/lib/intake/jobs';
import {
  INTAKE_CRON_BUDGET_MS,
  INTAKE_JOB_SAFETY_MARGIN_MS,
  INTAKE_PUBLIC_ROUTE_MAX_DURATION_SEC,
  VERIFY_BUDGET_NOTE_PREFIX,
  VERIFY_FIXED_OVERHEAD_MS,
  VERIFY_MAX_BUDGET_ABORTS,
  VERIFY_MIN_BYTES_PER_SEC,
  VERIFY_PARK_MS,
  VERIFY_PROBE_MIN_LEFT_FRACTION,
  VERIFY_WORKER_LEASE_MS,
  isVerifyBudgetNote,
} from '@/lib/intake/limits';
import { PURGE_RETRY_AFTER_MS, enqueueDuePurges, purgeSubmissionOriginals } from '@/lib/intake/purge';
import { intakeCoreJobHandlers, reconcilePendingRevisions, verifyAsset } from '@/lib/intake/service';
import { assetGone, verifyTargetIds } from '@/lib/intake/state';
import type { IntakeStorage } from '@/lib/intake/storage-core';

const QUARTER_HOUR_MS = 15 * 60_000;
const FINISHED_JOB_KEEP_MS = 30 * 86_400_000;
/** 한 번에 잴 파일 수의 상한 — 실제로 몇 개를 할지는 실행 예산이 정한다 */
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

/* ────────────────────────────── 큰 파일 — 검증의 실행 예산 ────────────────────────────── */

/** 관리자 상세의 일감 글(lastError 칸)에 남는 말 — 실패가 아니라 기다림이다. 화면이 가를 수 있게 같은 머리말로 시작한다(머리말 · 가르기는 limits.ts — 브라우저에서도 부른다) */
export { VERIFY_BUDGET_NOTE_PREFIX, isVerifyBudgetNote };
export const VERIFY_BUDGET_NOTES = {
  /** 이번 크론에 남은 시간이 모자라 시작하지 않았다 */
  wait: `${VERIFY_BUDGET_NOTE_PREFIX} 큰 파일이라 다음 실행에서 이어 확인해요.`,
  /** 빈 크론 한 번으로도 모자라다고 어림했다 */
  tooBig: `${VERIFY_BUDGET_NOTE_PREFIX} 크론 한 번에 확인하기엔 큰 파일이에요. 검증 작업자가 이어 확인해요.`,
  /** 시작했는데 시간 안에 다 못 읽었다 */
  aborted: `${VERIFY_BUDGET_NOTE_PREFIX} 시간 안에 다 읽지 못해 다음 실행에서 처음부터 다시 확인해요.`,
  /** 위가 거듭돼 크론이 하루 쉬고 검증 작업자를 기다린다 */
  parked: `${VERIFY_BUDGET_NOTE_PREFIX} 시간 안에 다 읽지 못한 일이 거듭돼 검증 작업자를 기다려요.`,
} as const;

/** verify_asset 일감의 payload — 끊긴 횟수 · 잰 속도는 예산 끊김 때 이 일감에만 쌓인다 */
type VerifyPayload = { assetId: string; budgetAborts?: number; lastBudgetAbortAt?: string; observedBytesPerSec?: number };

const verifyPayloadOf = (job: Pick<LeasedJob, 'payload'>): VerifyPayload => {
  const p = (job.payload ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  return {
    assetId: typeof p.assetId === 'string' ? p.assetId : '',
    budgetAborts: num(p.budgetAborts),
    lastBudgetAbortAt: typeof p.lastBudgetAbortAt === 'string' ? p.lastBudgetAbortAt : undefined,
    observedBytesPerSec: num(p.observedBytesPerSec),
  };
};

/** 검증 읽기 속도의 아래쪽 짐작 — 환경변수 INTAKE_VERIFY_MIN_BYTES_PER_SEC 로 실측에 맞춘다(양수만) */
export function verifyBytesPerSec(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.INTAKE_VERIFY_MIN_BYTES_PER_SEC);
  return Number.isFinite(v) && v > 0 ? v : VERIFY_MIN_BYTES_PER_SEC;
}

/** 파일 하나 검증에 걸릴 시간 어림(ms) — 고정 몫 + 전체 읽기 */
export const verifyCostMs = (bytes: number, bytesPerSec: number) => VERIFY_FIXED_OVERHEAD_MS + Math.ceil((Math.max(0, bytes) / bytesPerSec) * 1000);

/** 마지막 예산 끊김에서 하루(VERIFY_PARK_MS)가 안 지났으면 그 하루가 끝나는 시각, 지났거나 끊긴 적이 없으면 null */
function parkUntilOf(p: VerifyPayload, now: Date): Date | null {
  const lastAbort = p.lastBudgetAbortAt ? Date.parse(p.lastBudgetAbortAt) : NaN;
  if (!Number.isFinite(lastAbort)) return null;
  const until = lastAbort + VERIFY_PARK_MS;
  return now.getTime() < until ? new Date(until) : null;
}

/**
 * 이 검증 일감에 필요한 시간 — 벌써 끝난 자산은 정산만 남아 가볍다.
 * 앞에서 끊겼으면 그때 잰 속도(의 80%)가 짐작보다 느리면 그것을 쓴다. 단 하루(VERIFY_PARK_MS)까지만 — 저장소가 잠깐 느렸던 한 번이 그 파일을 영영 막지 않게.
 * 끊김이 상한만큼 거듭됐고 하루가 안 지났으면 Infinity — 크론은 시작하지 않고 검증 작업자를 기다린다.
 */
export async function estimateVerifyMs(db: PrismaClient, job: Pick<LeasedJob, 'payload'>, input: { bytesPerSec: number; now: Date }): Promise<number> {
  const p = verifyPayloadOf(job);
  const parked = parkUntilOf(p, input.now);
  if ((p.budgetAborts ?? 0) >= VERIFY_MAX_BUDGET_ABORTS && parked) return Infinity;
  if (!p.assetId) return VERIFY_FIXED_OVERHEAD_MS;
  const asset = await db.intakeAsset.findUnique({ where: { id: p.assetId }, select: { status: true, storedBytes: true, declaredSize: true } });
  if (asset?.status !== 'uploaded' && asset?.status !== 'verifying') return VERIFY_FIXED_OVERHEAD_MS;
  const bytes = Number(asset.storedBytes ?? asset.declaredSize);
  const rate = p.observedBytesPerSec && parked ? Math.min(input.bytesPerSec, p.observedBytesPerSec * 0.8) : input.bytesPerSec;
  return verifyCostMs(bytes, rate);
}

/** 예산이 모자라 시작하지 않은 일감에 남길 글 */
export function verifySkipNote(needMs: number, fullBudgetMs: number = INTAKE_CRON_BUDGET_MS): string {
  if (!Number.isFinite(needMs)) return VERIFY_BUDGET_NOTES.parked;
  return needMs > fullBudgetMs ? VERIFY_BUDGET_NOTES.tooBig : VERIFY_BUDGET_NOTES.wait;
}

/**
 * 예산 차례에서 검증 일감을 다루는 법 — 크론과 공개 라우트의 after() 가 같이 쓴다.
 * - 어림이 빈 크론 한 번(fullBudgetMs)보다 크면 보통은 건너뛰고 '작업자' 글을 남긴다. 다만 하루 안에 끊긴 적이 없고 이번 실행이 거의 비었으면
 *   한 번 읽어 본다 — 끊기면 그때 잰 속도가 남고, 다 읽으면 끝난다. 어림만으로 영영 안 읽는 파일이 생기지 않게.
 * - 쉬게 둔 파일 · 하루 안에 끊긴 큰 파일은 건너뛰며 차례를 그 하루 끝으로 민다 — 줄 앞을 막아 뒤의 작은 파일이 밀리지 않게.
 * - 이번만 모자란 일은 차례를 그대로 둬 다음 실행에서 먼저 집힌다.
 */
export function verifyBudgetPlan(
  db: PrismaClient,
  budget: Pick<JobBudget, 'deadlineMs' | 'nowMs' | 'signal'>,
  input: { bytesPerSec: number; now: () => Date; fullBudgetMs?: number },
): Pick<JobBudget, 'estimateMs' | 'skipNote' | 'skipUntil'> {
  const full = input.fullBudgetMs ?? INTAKE_CRON_BUDGET_MS;
  const left = () => (budget.signal.aborted ? 0 : budget.deadlineMs - budget.nowMs());
  return {
    estimateMs: async (job) => {
      const now = input.now();
      const need = await estimateVerifyMs(db, job, { bytesPerSec: input.bytesPerSec, now });
      const probe = Number.isFinite(need) && need > full && !parkUntilOf(verifyPayloadOf(job), now) && left() >= full * VERIFY_PROBE_MIN_LEFT_FRACTION;
      /* 한 번 읽어 보기 — 0 을 돌려줘 빌리게 한다. 끝낼 시각에 끊기면 처리기가 잰 속도를 남기고 하루를 쉰다 */
      return probe ? 0 : need;
    },
    skipNote: (_job, needMs) => verifySkipNote(needMs, full),
    skipUntil: (job, needMs) => (!Number.isFinite(needMs) || needMs > full ? parkUntilOf(verifyPayloadOf(job), input.now()) : null),
  };
}

/** 이 오류가 예산 끊김 그 자체인가 — signal 이 끊긴 뒤 난 진짜 실패(파일 없음 · 읽기 실패 · DB 오류)를 기다림으로 감추지 않게 */
function isBudgetAbort(e: unknown, signal: AbortSignal): boolean {
  if (!signal.aborted) return false;
  return e === signal.reason || (e as { name?: unknown } | null)?.name === 'AbortError';
}

/**
 * 검증 처리기 — 예산의 signal 을 해시 읽기에 잇는다. 시각이 와서 끊기면 실패로 안 세고(JobDeferred) 끊긴 횟수와 잰 속도를 일감에 남긴다.
 * 자산은 'verifying' 에 그대로다. 다음 시도가 처음부터 다시 읽는다(이어 읽기는 없다 — 해시 중간 상태를 저장하지 않는다).
 * 끊김이 상한만큼 쌓이면 차례를 하루 뒤로 민다 — 예산 없는 길(공개 라우트 after() 의 옛 호출)도 쉬는 파일을 집지 않게.
 */
function verifyHandler(rt: Pick<IntakeRuntime, 'db' | 'now'> & { storage: IntakeStorage }): JobHandler {
  return async (job, ctx) => {
    const p = verifyPayloadOf(job);
    const started = performance.now();
    let read = 0;
    try {
      await verifyAsset(rt.db, rt.storage, p.assetId, undefined, { signal: ctx.signal, onHashBytes: (n) => (read = n) });
    } catch (e) {
      if (!isBudgetAbort(e, ctx.signal)) throw e;
      const sec = (performance.now() - started) / 1000;
      const aborts = (p.budgetAborts ?? 0) + 1;
      const observed = read > 0 && sec > 0 ? Math.max(1, Math.round(read / sec)) : p.observedBytesPerSec;
      const payload = { ...p, budgetAborts: aborts, lastBudgetAbortAt: (rt.now?.() ?? new Date()).toISOString(), ...(observed ? { observedBytesPerSec: observed } : {}) };
      const park = aborts >= VERIFY_MAX_BUDGET_ABORTS;
      throw new JobDeferred(park ? VERIFY_BUDGET_NOTES.parked : VERIFY_BUDGET_NOTES.aborted, payload, park ? VERIFY_PARK_MS : undefined);
    }
  };
}

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
  /* 보유 기간이 끝나 지웠거나 지우는 중인 원본은 없는 것이 맞다 — 고침을 거둬 다시 등록해도 실패로 쌓이지 않게 */
  if (assets.some((a) => assetGone(a.status))) return 'skipped';
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
    verify_asset: verifyHandler(rt),
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
  deferred: a.deferred + b.deferred,
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

export type CronInput = {
  owner?: string;
  /** 실행 예산 — 안 주면 지금부터 INTAKE_CRON_BUDGET_MS(함수 시간 − 여유). 시험은 끝낼 시각 · signal 을 직접 쥔다 */
  budget?: JobBudget;
  /** 검증 읽기 속도 짐작(바이트/초) — 안 주면 verifyBytesPerSec() */
  verifyBytesPerSec?: number;
};

/**
 * 크론 한 번. 가벼운 일을 먼저 끝내고 큰 파일 재기는 남은 예산 안에서만 시작한다.
 * 예산이 모자라면 시작하지 않고(시도 횟수 그대로), 시작한 해시는 끝낼 시각에 끊어 시도 횟수를 돌려준다 — 함수가 시간 제한에 잘려 임대가 늙고 횟수만 쓰는 일이 없게.
 * 정리는 15분에 한 번만 건다(키가 15분 칸마다 달라 그사이 다시 안 들어간다).
 */
export async function runIntakeCron(rt: IntakeRuntime, input: CronInput = {}): Promise<CronSummary> {
  const own = input.budget ? null : budgetFor(INTAKE_CRON_BUDGET_MS);
  try {
    return await cronOnce(rt, input, input.budget ?? own!);
  } finally {
    own?.stop();
  }
}

async function cronOnce(rt: IntakeRuntime, input: CronInput, budget: JobBudget): Promise<CronSummary> {
  const { db } = rt;
  const owner = input.owner ?? `cron-${randomUUID()}`;
  const now = rt.now?.() ?? new Date();
  const handlers = intakeJobHandlers(rt);
  const bytesPerSec = input.verifyBytesPerSec ?? verifyBytesPerSec();
  const base: JobBudget = { deadlineMs: budget.deadlineMs, nowMs: budget.nowMs, signal: budget.signal };

  await enqueueJob(db, { kind: 'cleanup_uploads', dedupeKey: `cleanup_uploads:${Math.floor(now.getTime() / QUARTER_HOUR_MS)}`, payload: {}, runAfter: now, maxAttempts: 3 });
  const repaired = (await repairPollJobs(db, now)) + (await repairFailedJobs(db, now));
  const settled = await reconcilePendingRevisions(db, now);
  const purgesQueued = await enqueueDuePurges(db, now);

  const clockFn = rt.now;
  const light = await runDueJobs(db, handlers, { owner, limit: LIGHT_PER_RUN, kinds: LIGHT_KINDS, now: clockFn, budget: base });
  const purge = await runDueJobs(db, handlers, { owner, limit: PURGE_PER_RUN, kinds: ['purge_originals'], now: clockFn, budget: base });
  const heavy = await runDueJobs(db, handlers, {
    owner,
    limit: VERIFY_PER_RUN,
    kinds: ['verify_asset'],
    now: clockFn,
    budget: { ...base, ...verifyBudgetPlan(db, base, { bytesPerSec, now: () => rt.now?.() ?? new Date() }) },
  });

  /* 정리 일감은 열쇠가 15분 칸마다 달라, 안 지워지는 파일이 있으면 실패 줄이 칸마다 쌓인다. 까닭은 새 줄에 계속 남으니 옛 실패 줄도 같이 지운다 */
  const pruned = await db.intakeJob.deleteMany({ where: { finishedAt: { lt: new Date(now.getTime() - FINISHED_JOB_KEEP_MS) }, OR: [{ status: 'done' }, { status: 'failed', kind: 'cleanup_uploads' }] } });
  return { ...addSummary(addSummary(light, purge), heavy), repaired, settled, pruned: pruned.count, purgesQueued };
}

/**
 * 공개 라우트(올리기 확인 · 접수 완료)의 응답 뒤 검증 — 크론과 같은 예산 규칙으로 돈다. 그 함수의 남은 시간(라우트 시간 − 여유 − 이미 쓴 시간) 안에서만
 * 시작하고, 시각이 오면 해시를 끊어 시도 횟수를 돌려준다. 쉬게 둔 파일 · 크론 몫의 큰 파일은 건너뛴다. 못 한 것은 크론이 잇는다.
 * startedAtMs 는 요청을 받은 벽시계 시각이다.
 */
export async function runVerifySoon(
  deps: { db: PrismaClient; storage: IntakeStorage; now?: () => Date },
  input: { startedAtMs: number; owner?: string; limit?: number; routeMaxDurationSec?: number; verifyBytesPerSec?: number },
): Promise<RunSummary> {
  const windowMs = (input.routeMaxDurationSec ?? INTAKE_PUBLIC_ROUTE_MAX_DURATION_SEC) * 1000 - INTAKE_JOB_SAFETY_MARGIN_MS - (Date.now() - input.startedAtMs);
  const budget = budgetFor(Math.max(0, windowMs));
  const clock = () => deps.now?.() ?? new Date();
  try {
    return await runDueJobs(deps.db, { verify_asset: verifyHandler({ db: deps.db, storage: deps.storage, now: deps.now }) }, {
      owner: input.owner ?? `public-${randomUUID()}`,
      limit: input.limit ?? 2,
      kinds: ['verify_asset'],
      now: deps.now,
      budget: { ...budget, ...verifyBudgetPlan(deps.db, budget, { bytesPerSec: input.verifyBytesPerSec ?? verifyBytesPerSec(), now: clock }) },
    });
  } finally {
    budget.stop();
  }
}

/**
 * 검증 작업자 — 크론 함수 시간에 묶이지 않는 곳(맥 · 상주 서버 · Modal 같은 오래 도는 일꾼)에서 검증 일감만 돌린다. 예산이 없고 임대가 길다.
 * 크론이 '검증 작업자를 기다려요'로 쉬게 둔 큰 파일도 여기서 끝까지 읽는다 — 그래서 먼저 기다리는 검증의 차례를 지금으로 당긴다. 무결성 검증을 빼지 않는다 — 같은 verifyAsset 이다.
 * 당긴 뒤 빌리기 전에 크론이 같은 줄을 보면 다시 미룰 수 있다(드묾) — 그러면 다음 작업자 실행이 잇는다.
 * 실행 진입점(npm 스크립트 · Modal 함수)은 아직 없다. 붙이는 법은 docs/designs/external-intake-large-files.md.
 */
export async function runIntakeVerifyWorker(rt: IntakeRuntime, input: { owner?: string; limit?: number } = {}): Promise<RunSummary> {
  const now = rt.now?.() ?? new Date();
  await rt.db.intakeJob.updateMany({
    where: { kind: 'verify_asset', status: 'queued', runAfter: { gt: now }, lastError: { startsWith: VERIFY_BUDGET_NOTE_PREFIX } },
    data: { runAfter: now },
  });
  return runDueJobs(rt.db, intakeJobHandlers(rt), {
    owner: input.owner ?? `verify-worker-${randomUUID()}`,
    limit: input.limit ?? 1,
    kinds: ['verify_asset'],
    leaseMs: VERIFY_WORKER_LEASE_MS,
    now: rt.now,
  });
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
