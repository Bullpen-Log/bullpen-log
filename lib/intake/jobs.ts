/**
 * 지속 작업 — 화면이 닫혀도 돈다. 넣기(enqueueJob) → 임대(leaseJobs) → 처리(runDueJobs) → 끝(done) 또는 뒤로 미룸(재시도).
 * 처리 중 일꾼이 죽으면 임대 시간이 지나 다른 일꾼이 이어 받는다 — 그래서 처리기는 같은 일을 두 번 해도 괜찮게(멱등) 써야 한다.
 *
 * 어디서 도나: 라우트가 after() 로 곧바로 한 번, /api/cron/intake 가 5분마다(CRON_SECRET).
 *
 * 실행 예산(JobBudget): 함수 시간이 정해진 곳(크론)은 끝낼 시각을 넘긴다. 그러면
 *   - 무거운 일(estimateMs 를 준 종류)은 임대하기 전에 걸릴 시간을 어림해, 남은 시간이 모자라면 아예 안 빌린다. 시도 횟수를 안 쓰고 줄에 그대로 둔다.
 *   - 가벼운 일은 빌린 뒤 차례가 오기 전에 시각이 지나면 시도 횟수를 돌려주고 줄에 되돌린다.
 *   - 처리 중에 시각이 오면 signal 이 끊긴다. 처리기가 JobDeferred 를 던지면 실패로 안 세고 줄에 되돌린다(같은 일을 다음에 처음부터 다시 한다).
 * 예산이 없으면 예전 그대로 돈다(공개 라우트의 after() · 검증 작업자).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { VERIFY_BUDGET_NOTE_PREFIX } from '@/lib/intake/limits';

export const INTAKE_JOB_KINDS = ['verify_asset', 'register_revision', 'poll_analysis', 'cleanup_uploads', 'purge_originals'] as const;
export type IntakeJobKind = (typeof INTAKE_JOB_KINDS)[number];

export type JobDb = Pick<PrismaClient, 'intakeJob'> | Prisma.TransactionClient;

export type LeasedJob = { id: string; kind: string; payload: Prisma.JsonValue; attempts: number };

/** 처리기가 받는 실행 맥락 — signal 은 예산 시각에 끊긴다. 예산이 없으면 끊기지 않는다 */
export type JobContext = { signal: AbortSignal; deadlineMs: number | null };

/** 처리기 — 끝나면 돌아오고, 다시 해야 하면 던진다. { retryAfterMs } 를 돌려주면 실패로 안 세고 그만큼 뒤에 다시 돈다(분석 기다리기) */
export type JobHandler = (job: LeasedJob, ctx: JobContext) => Promise<void | { retryAfterMs: number }>;
export type JobHandlers = Partial<Record<IntakeJobKind, JobHandler>>;

/**
 * 처리기가 '이번에는 시간이 모자라 그만둔다'고 알린다 — 실패가 아니다. 시도 횟수를 돌려주고 줄에 되돌린다.
 * note 는 관리자가 보는 일감 글(lastError 칸)에 남는다. payload 를 주면 일감의 payload 를 그것으로 바꾼다(끊긴 횟수 · 잰 속도 같은 것).
 * retryAfterMs 를 주면 차례를 그만큼 뒤로 민다(쉬게 둔 큰 파일). 안 주면 차례가 그대로라 다음 실행에서 먼저 집힌다.
 */
export class JobDeferred extends Error {
  readonly deferred = true;
  readonly note: string;
  readonly payload: Prisma.InputJsonValue | undefined;
  readonly retryAfterMs: number | undefined;
  /* 매개변수 속성은 쓰지 않는다 — 시험이 node 의 타입 지우기로 이 파일을 바로 부른다 */
  constructor(note: string, payload?: Prisma.InputJsonValue, retryAfterMs?: number) {
    super(note);
    this.name = 'JobDeferred';
    this.note = note;
    this.payload = payload;
    this.retryAfterMs = retryAfterMs;
  }
}

export const isJobDeferred = (e: unknown): e is JobDeferred => e instanceof JobDeferred || (e as { deferred?: unknown } | null)?.deferred === true;

/**
 * 실행 예산 — deadlineMs 는 nowMs 와 같은 시계의 값이다(벽시계). 일감의 업무 시각(now)과는 따로다 — 시험은 업무 시각을 며칠씩 옮기기 때문이다.
 * estimateMs 를 주면 그 종류는 '어림 → 빌림' 차례로 돈다. skipNote 는 남은 시간이 모자라 안 빌린 일감에 남길 글이다.
 */
export type JobBudget = {
  deadlineMs: number;
  nowMs: () => number;
  signal: AbortSignal;
  /** 이 일을 끝내는 데 걸릴 시간(ms) 어림 — Infinity 면 이 실행에서는 안 한다 */
  estimateMs?: (job: LeasedJob) => number | Promise<number>;
  skipNote?: (job: LeasedJob, needMs: number) => string | null;
  /**
   * 건너뛴 일감의 차례를 언제로 미룰지 — null 이면 그대로 둬서 다음 실행에서 먼저 집힌다(이번만 모자란 일).
   * 오래 못 할 일(쉬게 둔 큰 파일)은 미뤄야 줄 앞을 막지 않는다 — 막으면 그 뒤의 작은 파일이 영영 안 보인다.
   */
  skipUntil?: (job: LeasedJob, needMs: number) => Date | null;
};

/** 지금부터 windowMs 동안의 예산 — 시각이 오면 signal 이 끊긴다. 끝나면 stop() 으로 타이머를 걷는다 */
export function budgetFor(windowMs: number, nowMs: () => number = Date.now): JobBudget & { stop: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('job_budget_exceeded')), Math.max(0, windowMs));
  (timer as { unref?: () => void }).unref?.();
  return { deadlineMs: nowMs() + windowMs, nowMs, signal: ctrl.signal, stop: () => clearTimeout(timer) };
}

const timeLeft = (b: JobBudget) => (b.signal.aborted ? 0 : b.deadlineMs - b.nowMs());

export const DEFAULT_LEASE_MS = 10 * 60_000;
const UNKNOWN_KIND_DELAY_MS = 5 * 60_000;
const MAX_ERROR_LENGTH = 500;

/** 실패 뒤 기다림 — 30초부터 두 배씩, 한 시간까지 */
export const backoffMs = (attempts: number) => Math.min(3_600_000, 30_000 * 2 ** Math.max(0, attempts - 1));

/** 넣는다. dedupeKey 가 같은 일이 이미 있으면 새로 안 넣고 false */
export async function enqueueJob(
  db: JobDb,
  input: { kind: IntakeJobKind; payload: Prisma.InputJsonValue; dedupeKey?: string; runAfter?: Date; maxAttempts?: number },
): Promise<boolean> {
  const r = await db.intakeJob.createMany({
    data: [
      {
        kind: input.kind,
        payload: input.payload,
        dedupeKey: input.dedupeKey ?? null,
        runAfter: input.runAfter ?? new Date(),
        maxAttempts: input.maxAttempts ?? 8,
      },
    ],
    skipDuplicates: true,
  });
  return r.count > 0;
}

/** 할 일을 빌린다 — 다른 일꾼이 쥔 줄은 건너뛴다 */
export async function leaseJobs(
  db: PrismaClient,
  input: { owner: string; limit?: number; leaseMs?: number; now?: Date; kinds?: readonly IntakeJobKind[]; ids?: readonly string[] },
): Promise<LeasedJob[]> {
  const now = input.now ?? new Date();
  const until = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS));
  const limit = input.limit ?? 5;
  const kinds = [...(input.kinds ?? INTAKE_JOB_KINDS)];
  /* 임대가 끝났는데 횟수도 다 쓴 줄은 실패로 닫는다 */
  await db.intakeJob.updateMany({
    where: { status: 'running', leaseUntil: { lt: now }, attempts: { gte: db.intakeJob.fields.maxAttempts } },
    data: { status: 'failed', finishedAt: now, leaseOwner: null, leaseUntil: null, lastError: '임대가 끝났고 시도 횟수를 다 썼어요' },
  });
  return db.$queryRaw<LeasedJob[]>`
    UPDATE "IntakeJob" SET "status" = 'running', "leaseOwner" = ${input.owner}, "leaseUntil" = ${until}, "attempts" = "attempts" + 1, "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "IntakeJob"
      WHERE "kind" = ANY(${kinds})
        AND "attempts" < "maxAttempts"
        AND (("status" = 'queued' AND "runAfter" <= ${now}) OR ("status" = 'running' AND "leaseUntil" < ${now}))
        ${input.ids ? Prisma.sql`AND "id" = ANY(${[...input.ids]})` : Prisma.empty}
      ORDER BY "runAfter" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "kind", "payload", "attempts"`;
}

/** 빌릴 수 있는 일을 빌리지 않고 본다 — 예산 차례가 무게를 어림하는 데 쓴다. 본 뒤 다른 일꾼이 먼저 빌릴 수 있어 빌릴 때 다시 본다 */
export async function peekDueJobs(
  db: PrismaClient,
  input: { limit: number; now: Date; kinds: readonly IntakeJobKind[]; excludeIds?: readonly string[] },
): Promise<LeasedJob[]> {
  const skip = input.excludeIds?.length ? Prisma.sql`AND NOT ("id" = ANY(${[...input.excludeIds]}))` : Prisma.empty;
  return db.$queryRaw<LeasedJob[]>`
    SELECT "id", "kind", "payload", "attempts" FROM "IntakeJob"
    WHERE "kind" = ANY(${[...input.kinds]})
      AND "attempts" < "maxAttempts"
      AND (("status" = 'queued' AND "runAfter" <= ${input.now}) OR ("status" = 'running' AND "leaseUntil" < ${input.now}))
      ${skip}
    ORDER BY "runAfter" ASC
    LIMIT ${input.limit}`;
}

const mine = (id: string, owner: string) => ({ id, status: 'running', leaseOwner: owner });

export async function completeJob(db: PrismaClient, job: LeasedJob, owner: string, now: Date = new Date()): Promise<void> {
  await db.intakeJob.updateMany({
    where: mine(job.id, owner),
    data: { status: 'done', finishedAt: now, leaseOwner: null, leaseUntil: null, lastError: null },
  });
}

/** 실패 — 횟수가 남았으면 미룬다 */
export async function failJob(
  db: PrismaClient,
  job: LeasedJob,
  owner: string,
  error: unknown,
  now: Date = new Date(),
): Promise<'retry' | 'failed'> {
  const row = await db.intakeJob.findUnique({ where: { id: job.id }, select: { maxAttempts: true } });
  /* 같은 글로 뭉뚱그려지는 저장소 실패가 무엇이었는지 남긴다 — 멈춘 일감의 까닭이 '연결 실패'인지 '지웠는데 남음'인지 가른다 */
  const cause = (error as { detail?: { cause?: unknown } } | null)?.detail?.cause;
  const message = `${error instanceof Error ? error.message : String(error)}${typeof cause === 'string' ? ` (${cause})` : ''}`.slice(0, MAX_ERROR_LENGTH);
  const giveUp = job.attempts >= (row?.maxAttempts ?? 8);
  await db.intakeJob.updateMany({
    where: mine(job.id, owner),
    data: giveUp
      ? { status: 'failed', finishedAt: now, leaseOwner: null, leaseUntil: null, lastError: message }
      : { status: 'queued', runAfter: new Date(now.getTime() + backoffMs(job.attempts)), leaseOwner: null, leaseUntil: null, lastError: message },
  });
  return giveUp ? 'failed' : 'retry';
}

/** 실패로 세지 않고 다시 미룬다. 이번 시도는 실패가 아니라서 앞 시도의 까닭을 지운다 — 남기면 상세가 기다리는 일감을 '다시 시도하는 중'으로 보인다 */
export async function postponeJob(db: PrismaClient, job: LeasedJob, owner: string, delayMs: number, now: Date = new Date()): Promise<void> {
  await db.intakeJob.updateMany({
    where: mine(job.id, owner),
    data: { status: 'queued', runAfter: new Date(now.getTime() + delayMs), attempts: { decrement: 1 }, leaseOwner: null, leaseUntil: null, lastError: null },
  });
}

/**
 * 빌린 일을 줄에 되돌리고 시도 횟수를 돌려준다 — 예산이 모자라 손대지 않았거나 처리기가 JobDeferred 로 그만둔 때다.
 * 차례(runAfter)는 runAfter 를 안 주면 그대로라 다음 실행에서 먼저 집힌다. note 를 주면 관리자에게 보일 글로 남기고, 안 주면 앞 글을 그대로 둔다.
 */
export async function deferJob(
  db: PrismaClient,
  job: LeasedJob,
  owner: string,
  opts: { note?: string | null; payload?: Prisma.InputJsonValue; runAfter?: Date } = {},
): Promise<boolean> {
  const r = await db.intakeJob.updateMany({
    where: mine(job.id, owner),
    data: {
      status: 'queued',
      attempts: { decrement: 1 },
      leaseOwner: null,
      leaseUntil: null,
      ...(opts.note !== undefined ? { lastError: opts.note?.slice(0, MAX_ERROR_LENGTH) ?? null } : {}),
      ...(opts.payload !== undefined ? { payload: opts.payload } : {}),
      ...(opts.runAfter ? { runAfter: opts.runAfter } : {}),
    },
  });
  return r.count > 0;
}

/**
 * 안 빌린 채 줄에 있는 일에 글을 남긴다 — 예산 때문에 이번에 건너뛴 까닭을 관리자가 보게. runAfter 를 주면 차례도 그만큼 민다.
 * 임대가 늙은 채 'running' 에 남은 일(함수가 잘린 앞 일꾼)도 줄로 되돌리며 같은 글을 남긴다 — 'running' 으로 두면 관리자에게 기다림이 안 보인다.
 * 그 일꾼이 쓴 시도는 돌려주지 않는다(왜 끊겼는지 모른다).
 */
async function noteSkippedJob(db: PrismaClient, jobId: string, note: string | null, now: Date, runAfter: Date | null): Promise<void> {
  if (!note && !runAfter) return;
  const data = { ...(note ? { lastError: note.slice(0, MAX_ERROR_LENGTH) } : {}), ...(runAfter ? { runAfter } : {}) };
  await db.intakeJob.updateMany({ where: { id: jobId, status: 'queued' }, data });
  await db.intakeJob.updateMany({ where: { id: jobId, status: 'running', leaseUntil: { lt: now } }, data: { ...data, status: 'queued', leaseOwner: null, leaseUntil: null } });
}

/** 예산 끊김 때 검증 일감 payload 에 쌓이는 칸 — 다시 걸면 지운다(옛 속도로 계속 어림하지 않게). 쓰는 곳은 job-handlers.ts */
export const VERIFY_BUDGET_PAYLOAD_KEYS = ['budgetAborts', 'lastBudgetAbortAt', 'observedBytesPerSec'] as const;

/**
 * 시도 횟수를 다 써 멈춘 일을 다시 건다 — 분석 상태 묻기 대사와 관리자의 다시 확인(service.ts requeueVerification)이 부른다.
 * 예산 때문에 줄에서 기다리는 검증(글이 '검증 대기:')도 다시 건다 — 끊긴 횟수 · 잰 속도를 지우고 곧바로 차례에 세운다. 그래야 관리자의 '다시 확인'이 헛돌지 않는다.
 * 저절로 다시 거는 일은 job-handlers.ts 가 횟수를 세며 따로 한다.
 */
export async function requeueJob(db: JobDb, dedupeKey: string, now: Date = new Date()): Promise<boolean> {
  const row = await db.intakeJob.findUnique({ where: { dedupeKey }, select: { id: true, status: true, lastError: true, payload: true } });
  if (!row) return false;
  const waiting = row.status === 'queued' && row.lastError?.startsWith(VERIFY_BUDGET_NOTE_PREFIX) === true;
  if (row.status !== 'failed' && !waiting) return false;
  const p = row.payload;
  const stale = p && typeof p === 'object' && !Array.isArray(p) && VERIFY_BUDGET_PAYLOAD_KEYS.some((k) => k in p);
  const payload = stale ? (Object.fromEntries(Object.entries(p).filter(([k]) => !(VERIFY_BUDGET_PAYLOAD_KEYS as readonly string[]).includes(k))) as Prisma.InputJsonValue) : undefined;
  const r = await db.intakeJob.updateMany({
    /* 읽은 뒤 다른 일꾼이 빌렸거나 상태가 바뀌었으면 손대지 않는다 */
    where: { id: row.id, status: row.status, lastError: row.lastError },
    data: { status: 'queued', attempts: 0, runAfter: now, finishedAt: null, lastError: null, ...(payload !== undefined ? { payload } : {}) },
  });
  return r.count > 0;
}

/** deferred — 예산 때문에 안 빌렸거나, 빌렸다가 시도 횟수를 돌려주고 되돌린 일 */
export type RunSummary = { done: number; retried: number; failed: number; postponed: number; deferred: number };

const NO_SIGNAL = new AbortController().signal;
/** 예산 차례에서 한 번에 들여다볼 일감 수 — 큰 파일 하나가 막아도 그 뒤의 작은 파일을 해 볼 수 있게 몇 개 더 본다 */
const PEEK_FACTOR = 5;
/** 한 실행에서 어림해 볼 일감 수의 상한 — 본 줄은 빼고 다음 쪽을 보므로, 건너뛴 큰 파일이 많아도 그 뒤의 작은 파일까지 닿는다 */
const MAX_PEEK = 100;

/**
 * 임대한 일을 차례로 처리한다. 처리기가 없는 종류는 배포 순서 때문일 수 있어 횟수를 안 쓰고 미룬다.
 * budget 을 주면 끝낼 시각을 지킨다(파일 머리의 '실행 예산'). 주지 않으면 예전과 같다.
 */
export async function runDueJobs(
  db: PrismaClient,
  handlers: JobHandlers,
  input: { owner: string; limit?: number; leaseMs?: number; now?: () => Date; kinds?: readonly IntakeJobKind[]; budget?: JobBudget },
): Promise<RunSummary> {
  const clock = input.now ?? (() => new Date());
  const budget = input.budget;
  const limit = input.limit ?? 5;
  const kinds = input.kinds ?? INTAKE_JOB_KINDS;
  const sum: RunSummary = { done: 0, retried: 0, failed: 0, postponed: 0, deferred: 0 };
  const ctx: JobContext = { signal: budget?.signal ?? NO_SIGNAL, deadlineMs: budget?.deadlineMs ?? null };

  const runOne = async (job: LeasedJob) => {
    const handler = handlers[job.kind as IntakeJobKind];
    if (!handler) {
      await postponeJob(db, job, input.owner, UNKNOWN_KIND_DELAY_MS, clock());
      sum.postponed++;
      return;
    }
    try {
      const r = await handler(job, ctx);
      if (r && 'retryAfterMs' in r) {
        await postponeJob(db, job, input.owner, r.retryAfterMs, clock());
        sum.postponed++;
      } else {
        await completeJob(db, job, input.owner, clock());
        sum.done++;
      }
    } catch (e) {
      if (isJobDeferred(e)) {
        const runAfter = e.retryAfterMs != null && e.retryAfterMs > 0 ? new Date(clock().getTime() + e.retryAfterMs) : undefined;
        await deferJob(db, job, input.owner, { note: e.note, payload: e.payload, runAfter });
        sum.deferred++;
      } else if ((await failJob(db, job, input.owner, e, clock())) === 'failed') sum.failed++;
      else sum.retried++;
    }
  };

  /* 무거운 일 — 빌리기 전에 어림한다. 모자라면 안 빌려서 시도 횟수가 그대로다 */
  if (budget?.estimateMs) {
    const page = Math.min(MAX_PEEK, limit * PEEK_FACTOR);
    const seen = new Set<string>();
    let taken = 0;
    /* 한 쪽씩 본다 — 본 줄은 빼므로 앞에서 건너뛴 큰 파일이 많아도 그 뒤로 넘어간다. 어림은 실행마다 MAX_PEEK 개까지 */
    while (taken < limit && timeLeft(budget) > 0 && seen.size < MAX_PEEK) {
      const candidates = await peekDueJobs(db, { limit: Math.min(page, MAX_PEEK - seen.size), now: clock(), kinds, excludeIds: [...seen] });
      if (candidates.length === 0) break;
      for (const cand of candidates) {
        seen.add(cand.id);
        if (taken >= limit || timeLeft(budget) <= 0) break;
        const need = await budget.estimateMs(cand);
        if (need > timeLeft(budget)) {
          await noteSkippedJob(db, cand.id, budget.skipNote?.(cand, need) ?? null, clock(), budget.skipUntil?.(cand, need) ?? null);
          sum.deferred++;
          continue;
        }
        const [job] = await leaseJobs(db, { owner: input.owner, limit: 1, leaseMs: input.leaseMs, now: clock(), kinds, ids: [cand.id] });
        /* 그사이 다른 일꾼이 빌렸다 — 그쪽이 한다 */
        if (!job) continue;
        taken++;
        await runOne(job);
      }
      if (candidates.length < page) break;
    }
    return sum;
  }

  const jobs = budget && timeLeft(budget) <= 0 ? [] : await leaseJobs(db, { owner: input.owner, limit, leaseMs: input.leaseMs, now: clock(), kinds });
  for (const job of jobs) {
    /* 가벼운 일 — 차례가 오기 전에 시각이 지나면 손대지 않고 돌려준다 */
    if (budget && timeLeft(budget) <= 0) {
      await deferJob(db, job, input.owner);
      sum.deferred++;
      continue;
    }
    await runOne(job);
  }
  return sum;
}
