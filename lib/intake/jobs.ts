/**
 * 지속 작업 — 화면이 닫혀도 돈다. 넣기(enqueueJob) → 임대(leaseJobs) → 처리(runDueJobs) → 끝(done) 또는 뒤로 미룸(재시도).
 * 처리 중 일꾼이 죽으면 임대 시간이 지나 다른 일꾼이 이어 받는다 — 그래서 처리기는 같은 일을 두 번 해도 괜찮게(멱등) 써야 한다.
 *
 * 어디서 도나: 라우트가 after() 로 곧바로 한 번, /api/cron/intake 가 5분마다(CRON_SECRET).
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export const INTAKE_JOB_KINDS = ['verify_asset', 'register_revision', 'poll_analysis', 'cleanup_uploads', 'purge_originals'] as const;
export type IntakeJobKind = (typeof INTAKE_JOB_KINDS)[number];

export type JobDb = Pick<PrismaClient, 'intakeJob'> | Prisma.TransactionClient;

export type LeasedJob = { id: string; kind: string; payload: Prisma.JsonValue; attempts: number };

/** 처리기 — 끝나면 돌아오고, 다시 해야 하면 던진다. { retryAfterMs } 를 돌려주면 실패로 안 세고 그만큼 뒤에 다시 돈다(분석 기다리기) */
export type JobHandler = (job: LeasedJob) => Promise<void | { retryAfterMs: number }>;
export type JobHandlers = Partial<Record<IntakeJobKind, JobHandler>>;

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
  input: { owner: string; limit?: number; leaseMs?: number; now?: Date; kinds?: readonly IntakeJobKind[] },
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
      ORDER BY "runAfter" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "kind", "payload", "attempts"`;
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
  const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
  const giveUp = job.attempts >= (row?.maxAttempts ?? 8);
  await db.intakeJob.updateMany({
    where: mine(job.id, owner),
    data: giveUp
      ? { status: 'failed', finishedAt: now, leaseOwner: null, leaseUntil: null, lastError: message }
      : { status: 'queued', runAfter: new Date(now.getTime() + backoffMs(job.attempts)), leaseOwner: null, leaseUntil: null, lastError: message },
  });
  return giveUp ? 'failed' : 'retry';
}

/** 실패로 세지 않고 다시 미룬다 */
export async function postponeJob(db: PrismaClient, job: LeasedJob, owner: string, delayMs: number, now: Date = new Date()): Promise<void> {
  await db.intakeJob.updateMany({
    where: mine(job.id, owner),
    data: { status: 'queued', runAfter: new Date(now.getTime() + delayMs), attempts: { decrement: 1 }, leaseOwner: null, leaseUntil: null },
  });
}

/**
 * 시도 횟수를 다 써 멈춘 일을 다시 건다 — 분석 상태 묻기 대사와 관리자의 다시 확인(service.ts requeueVerification)이 부른다.
 * 저절로 다시 거는 일은 job-handlers.ts 가 횟수를 세며 따로 한다.
 */
export async function requeueJob(db: JobDb, dedupeKey: string, now: Date = new Date()): Promise<boolean> {
  const r = await db.intakeJob.updateMany({
    where: { dedupeKey, status: 'failed' },
    data: { status: 'queued', attempts: 0, runAfter: now, finishedAt: null, lastError: null },
  });
  return r.count > 0;
}

export type RunSummary = { done: number; retried: number; failed: number; postponed: number };

/** 임대한 일을 차례로 처리한다. 처리기가 없는 종류는 배포 순서 때문일 수 있어 횟수를 안 쓰고 미룬다 */
export async function runDueJobs(
  db: PrismaClient,
  handlers: JobHandlers,
  input: { owner: string; limit?: number; leaseMs?: number; now?: () => Date; kinds?: readonly IntakeJobKind[] },
): Promise<RunSummary> {
  const clock = input.now ?? (() => new Date());
  const jobs = await leaseJobs(db, { owner: input.owner, limit: input.limit, leaseMs: input.leaseMs, now: clock(), kinds: input.kinds });
  const sum: RunSummary = { done: 0, retried: 0, failed: 0, postponed: 0 };
  for (const job of jobs) {
    const handler = handlers[job.kind as IntakeJobKind];
    if (!handler) {
      await postponeJob(db, job, input.owner, UNKNOWN_KIND_DELAY_MS, clock());
      sum.postponed++;
      continue;
    }
    try {
      const r = await handler(job);
      if (r && 'retryAfterMs' in r) {
        await postponeJob(db, job, input.owner, r.retryAfterMs, clock());
        sum.postponed++;
      } else {
        await completeJob(db, job, input.owner, clock());
        sum.done++;
      }
    } catch (e) {
      if ((await failJob(db, job, input.owner, e, clock())) === 'failed') sum.failed++;
      else sum.retried++;
    }
  }
  return sum;
}
