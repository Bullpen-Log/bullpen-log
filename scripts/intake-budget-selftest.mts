/**
 * 외부 접수 큰 파일 검증의 실행 예산 시험 — 운영 DB 를 건드리지 않고 메모리 안 PostgreSQL(PGlite)에 접수 마이그레이션 SQL 을 깐다. 저장소는 가짜다.
 * node --import ./scripts/alias-register.mjs scripts/intake-budget-selftest.mts
 *
 * 보는 것:
 *   1) 남은 시간이 모자라면 큰 검증을 빌리지도 시작하지도 않는다 — 시도 횟수 그대로, 관리자에게 '검증 대기' 글
 *   2) 해시 도중 끝낼 시각이 오면 끊고 줄에 되돌린다 — 판정을 적지 않고 시도 횟수도 안 쓴다
 *   3) 다음 실행이 끝까지 해서 검증을 마친다 · 다시 불러도 같다(멱등) · 두 일꾼이 붙어도 한 번만 판정한다
 *   4) 거듭 끊긴 파일은 크론이 쉬고 검증 작업자를 기다린다 — 끝없이 같은 읽기를 되풀이하지 않는다
 *   5) storage-core 의 해시 읽기가 signal 에 멈추고 몸통을 놓는다
 *   6) 2차 검토 고침: 잠깐 느렸던 속도가 하루 뒤엔 안 막는다 · 빈 크론은 '너무 큰' 파일도 한 번 읽어 본다 · 쉬는 큰 파일이 줄 앞을 막지 않는다 ·
 *      끊긴 뒤 난 진짜 실패는 기다림으로 감추지 않는다 · 관리자 '다시 확인'이 기다리는 검증을 다시 건다 · 공개 라우트 after() 검증도 같은 예산을 쓴다
 *
 * 벽시계(예산)는 가짜 숫자로 쥔다. 실제 1GiB 전송 · Vercel 함수 시간은 이 시험으로 말할 수 없다(docs/designs/external-intake-large-files.md).
 * 한계: PGlite 는 연결이 하나라 두 일꾼의 쿼리가 줄을 서서 돈다 — 임대 · 조건부 쓰기의 결과는 보지만, 두 연결이 같은 순간에 잠금을 다투는 모습은 아니다.
 */
import './intake-test-clock.mts';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { openIntakeScope, type IntakeScope } from '@/lib/intake/access';
import { consentDocOf, type ConsentAnswer } from '@/lib/intake/consent';
import {
  VERIFY_BUDGET_NOTES,
  estimateVerifyMs,
  intakeJobHandlers,
  isVerifyBudgetNote,
  runIntakeCron,
  runIntakeVerifyWorker,
  runVerifySoon,
  verifyBytesPerSec,
  verifyCostMs,
  verifySkipNote,
} from '@/lib/intake/job-handlers';
import { enqueueJob, runDueJobs, type JobBudget } from '@/lib/intake/jobs';
import {
  GIB,
  INTAKE_BUCKET_MAX_BYTES,
  INTAKE_CRON_BUDGET_MS,
  INTAKE_CRON_MAX_DURATION_SEC,
  INTAKE_JOB_SAFETY_MARGIN_MS,
  INTAKE_PUBLIC_ROUTE_MAX_DURATION_SEC,
  VERIFY_FIXED_OVERHEAD_MS,
  VERIFY_MAX_BUDGET_ABORTS,
  VERIFY_MIN_BYTES_PER_SEC,
  VERIFY_PARK_MS,
  VERIFY_PROBE_MIN_LEFT_FRACTION,
} from '@/lib/intake/limits';
import { IntakeError } from '@/lib/intake/errors';
import {
  confirmUpload,
  createInvitation,
  issueUploadToken,
  loadPublicState,
  recordConsents,
  requeueVerification,
  reserveAsset,
  saveDraft,
  verifyAsset,
  verifyJobKey,
} from '@/lib/intake/service';
import { createIntakeStorage, hashStream, type HashOptions, type IntakeRunStorage } from '@/lib/intake/storage-core';
import { createPublicApi } from '@/lib/intake/public-api';
import { JOB_STATE_TEXT, jobWaitNoteText } from '@/lib/intake/admin-labels';
import { mov240 } from './intake-fixtures.mts';

let passed = 0;
const ok = (cond: unknown, label: string) => {
  assert.ok(cond, label);
  if (process.env.V) console.log('ok', label);
  passed++;
};
const eq = (a: unknown, b: unknown, label: string) => {
  assert.deepEqual(a, b, label);
  if (process.env.V) console.log('ok', label);
  passed++;
};

/* ── 상수: 라우트 설정 · 예산 · 1GiB 한 파일 ── */
{
  const route = readFileSync('app/api/cron/intake/route.ts', 'utf8');
  ok(new RegExp(`export const maxDuration = ${INTAKE_CRON_MAX_DURATION_SEC};`).test(route), '크론 라우트 maxDuration 이 예산 상수와 같다');
  eq(INTAKE_CRON_BUDGET_MS, INTAKE_CRON_MAX_DURATION_SEC * 1000 - INTAKE_JOB_SAFETY_MARGIN_MS, '예산 = 함수 시간 − 여유');
  ok(verifyCostMs(INTAKE_BUCKET_MAX_BYTES, VERIFY_MIN_BYTES_PER_SEC) < INTAKE_CRON_BUDGET_MS, '가장 큰 파일 하나는 빈 크론 한 번에 들어간다(짐작 속도 기준)');
  eq(verifyCostMs(GIB, VERIFY_MIN_BYTES_PER_SEC), VERIFY_FIXED_OVERHEAD_MS + 128_000, '1GiB 를 8MiB/초로 128초 + 고정 몫');
  eq(verifyBytesPerSec({}), VERIFY_MIN_BYTES_PER_SEC, '환경변수가 없으면 짐작 값');
  eq(verifyBytesPerSec({ INTAKE_VERIFY_MIN_BYTES_PER_SEC: '31457280' }), 31_457_280, '환경변수로 실측에 맞춘다');
  eq(verifyBytesPerSec({ INTAKE_VERIFY_MIN_BYTES_PER_SEC: '-1' }), VERIFY_MIN_BYTES_PER_SEC, '말이 안 되는 값은 버린다');
  eq(verifySkipNote(60_000), VERIFY_BUDGET_NOTES.wait, '이번에 모자라면 다음 실행');
  eq(verifySkipNote(INTAKE_CRON_BUDGET_MS + 1), VERIFY_BUDGET_NOTES.tooBig, '빈 크론으로도 모자라면 작업자');
  eq(verifySkipNote(Infinity), VERIFY_BUDGET_NOTES.parked, '쉬게 둔 파일');
  ok(Object.values(VERIFY_BUDGET_NOTES).every((t) => isVerifyBudgetNote(t) && !t.includes('—') && /요\.$/.test(t)), '관리자 글은 같은 머리말 · 줄표 없음 · 해요체');
  /* 공개 라우트의 after() 검증은 라우트 함수 시간 안에서 돈다 — 예산 상수와 라우트 설정이 같아야 한다 */
  for (const file of ['app/api/intake/public/assets/confirm/route.ts', 'app/api/intake/public/finalize/route.ts']) {
    ok(new RegExp(`export const maxDuration = ${INTAKE_PUBLIC_ROUTE_MAX_DURATION_SEC};`).test(readFileSync(file, 'utf8')), `${file} maxDuration 이 공개 예산 상수와 같다`);
  }
  ok(INTAKE_PUBLIC_ROUTE_MAX_DURATION_SEC * 1000 - INTAKE_JOB_SAFETY_MARGIN_MS > VERIFY_FIXED_OVERHEAD_MS, '공개 라우트에도 검증 하나를 시작할 시간이 남는다');
  /* 관리자 상세의 기다림 글 — 모습 글과 같은 말은 빼고 덧붙일 사정만 남긴다 */
  eq(jobWaitNoteText(VERIFY_BUDGET_NOTES.wait), null, '다음 실행 기다림은 모습 글이 이미 말한다');
  for (const k of ['tooBig', 'aborted', 'parked'] as const) {
    const t = jobWaitNoteText(VERIFY_BUDGET_NOTES[k]);
    ok(t && !isVerifyBudgetNote(t) && !JOB_STATE_TEXT.waiting.includes(t.replace(/\.$/, '')), `${k} 는 머리말 없이 덧붙인다`);
  }
}

/* ── storage-core: 해시 읽기가 signal 에 멈춘다 ── */
{
  const chunk = randomBytes(64 * 1024);
  let cancelled = 0;
  const endless = (onPull?: (n: number) => void) => {
    let n = 0;
    return new ReadableStream<Uint8Array>({
      pull(c) {
        n++;
        onPull?.(n);
        c.enqueue(new Uint8Array(chunk));
      },
      cancel() {
        cancelled++;
      },
    });
  };
  const ctrl = new AbortController();
  let seen = 0;
  const why = new Error('job_budget_exceeded');
  await assert.rejects(
    hashStream(
      endless((n) => n === 5 && ctrl.abort(why)),
      { signal: ctrl.signal, onBytes: (b) => (seen = b) },
    ),
    (e) => e === why,
  );
  passed++;
  ok(cancelled === 1, '끊기면 몸통 읽기를 놓는다');
  ok(seen > 0 && seen < 10 * chunk.length, '읽은 만큼만 알리고 멈췄다');

  const finite = randomBytes(300_000);
  const full = await hashStream(new Blob([finite]).stream(), {});
  eq(full, { sha256: createHash('sha256').update(finite).digest('hex'), size: finite.length }, '끝까지 읽으면 같은 해시');

  /* 진짜 storage-core 의 hash — 가짜 fetch 가 signal 을 몸통까지 안 이어도 멈춘다 */
  const SUPA = 'http://127.0.0.1:9';
  let bodyCancelled = 0;
  const fakeFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (init?.method === 'POST' && url.pathname.startsWith('/storage/v1/object/sign/')) {
      const rest = url.pathname.slice('/storage/v1/object/sign/'.length);
      return Response.json({ signedURL: `/object/sign/${rest}?token=t` });
    }
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        i++;
        if (i === 4) ctrl2.abort(new Error('job_budget_exceeded'));
        c.enqueue(new Uint8Array(chunk));
      },
      cancel() {
        bodyCancelled++;
      },
    });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  const ctrl2 = new AbortController();
  const s = createIntakeStorage({ url: SUPA, serviceKey: 'service', fetch: fakeFetch });
  await assert.rejects(s.hash('sub/x/side.mov', { signal: ctrl2.signal }), (e: unknown) => (e as Error).message === 'job_budget_exceeded');
  passed++;
  ok(bodyCancelled === 1, 'storage-core hash 가 끊기면 연결을 놓는다');
}

/* ── PGlite ── */
const MIGRATION_ROOT = readdirSync('prisma').includes('pending-migrations') ? 'prisma/pending-migrations' : 'prisma/migrations';
const dirs = readdirSync(MIGRATION_ROOT).filter((d) => d.endsWith('_external_intake')).sort();
ok(dirs.length === 1, '마이그레이션 파일이 있다');
const pg = await PGlite.create();
await pg.exec(readFileSync(`${MIGRATION_ROOT}/${dirs[0]}/migration.sql`, 'utf8'));
const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await socket.start();
const addr = (socket as unknown as { server: { address(): { port: number } } }).server.address();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${addr.port}/postgres?sslmode=disable`, max: 1 }) });

/* ── 가짜 저장소 — 해시를 붙잡아 두었다가 놓을 수 있다 ── */
const objects = new Map<string, Buffer>();
const reads = { hash: 0 };
type HashHook = (p: string, opts: HashOptions | undefined, bytes: Buffer) => Promise<void>;
let hashHook: HashHook | null = null;
const storage = {
  uploadOrigin: 'https://proj.storage.supabase.co',
  async issueUpload(objectPath: string) {
    return { endpoint: `${this.uploadOrigin}/storage/v1/upload/resumable/sign`, token: `tok-${randomBytes(4).toString('hex')}`, tokenTtlMs: 3_600_000, apikey: 'pk', bucket: 'external-intake', objectName: objectPath };
  },
  async stat(p: string) {
    const b = objects.get(p);
    return b ? { size: b.length, contentType: 'video/quicktime' } : null;
  },
  async reader(p: string) {
    const b = objects.get(p);
    return b ? { size: b.length, read: async (s: number, e: number) => new Uint8Array(b.subarray(s, e)) } : null;
  },
  async hash(p: string, opts?: HashOptions) {
    reads.hash++;
    const b = objects.get(p)!;
    if (hashHook) await hashHook(p, opts, b);
    if (opts?.signal?.aborted) throw opts.signal.reason;
    opts?.onBytes?.(b.length);
    return { sha256: createHash('sha256').update(b).digest('hex'), size: b.length };
  },
  async readUrl(p: string) {
    return `https://signed.example/${p}`;
  },
  async list(prefix: string) {
    return [...objects.keys()].filter((k) => k.startsWith(prefix));
  },
  async remove(paths: string[]) {
    for (const p of paths) objects.delete(p);
  },
  async resultUploadUrl(p: string) {
    return `https://signed.example/put/${p}`;
  },
} satisfies IntakeRunStorage;

/** 해시 도중에 멈추는 고리 — 절반을 알린 뒤 signal 이나 gate 를 기다린다 */
function holdHash() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const begun = new Promise<void>((r) => (started = r));
  hashHook = async (_p, opts, b) => {
    opts?.onBytes?.(Math.floor(b.length / 2));
    started();
    await new Promise<void>((resolve) => {
      if (opts?.signal?.aborted) return resolve();
      opts?.signal?.addEventListener('abort', () => resolve(), { once: true });
      void gate.then(resolve);
    });
  };
  return { release, begun };
}

/* ── 도우미 ── */
const NOW = new Date('2026-11-06T03:00:00Z');
const DAY = 86_400_000;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const answer = (kind: ConsentAnswer['kind']): ConsentAnswer => {
  const d = consentDocOf(kind);
  return { kind, version: d.version, textHash: d.textHash, granted: true };
};
const rt = { db, storage, gpu: {}, now: () => NOW } as never;

/** 초대 → 동의 → 옆 파일 하나 도착(검증 일감이 줄에 선다) */
async function arrived(bytes = mov240(8192)) {
  const created = await createInvitation(db, { adminId: 'admin-1', uploadExpiresAt: new Date(NOW.getTime() + 14 * DAY) }, NOW);
  const scope: IntakeScope = await openIntakeScope(db, `Intake ${created.token}`, 'read', NOW);
  const state = await loadPublicState(db, scope, { now: NOW });
  await saveDraft(db, scope, { expectedVersion: state.version, athleteName: '예산시험', athleteAgeBand: '14_or_over', samePitchConfirmed: true }, NOW);
  await recordConsents(db, scope, { answers: [answer('submission'), answer('overseas')] }, NOW);
  const r = await reserveAsset(db, scope, { view: 'side', expectedAssetId: null, fileName: 'side.MOV', sizeBytes: bytes.length, declaredType: 'video/quicktime', sha256: sha(bytes), pairConfirmed: true }, NOW);
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.asset.id } });
  await issueUploadToken(db, storage, scope, { assetId: r.asset.id }, NOW);
  objects.set(row.objectPath, bytes);
  await confirmUpload(db, storage, scope, { assetId: r.asset.id }, NOW);
  return { assetId: r.asset.id, bytes };
}
const jobOf = (assetId: string) => db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: verifyJobKey(assetId) } });
const assetOf = (assetId: string) => db.intakeAsset.findUniqueOrThrow({ where: { id: assetId } });
const verifiedAudits = (assetId: string) => db.intakeAudit.count({ where: { action: { in: ['asset.verified', 'asset.rejected', 'asset.unconfirmed'] }, detail: { path: ['assetId'], equals: assetId } } });

/** 가짜 벽시계의 예산 — leftMs 만큼 남았다 */
let wall = 1_000_000;
const fakeBudget = (leftMs: number, signal: AbortSignal = new AbortController().signal): JobBudget => ({ deadlineMs: wall + leftMs, nowMs: () => wall, signal });
/** 이 시험의 일감만 남기고 나머지 검증 일감은 끝난 것으로 치운다 — 크론이 다른 줄을 집지 않게 */
const isolate = (assetId: string) => db.intakeJob.updateMany({ where: { kind: 'verify_asset', NOT: { dedupeKey: verifyJobKey(assetId) }, status: { in: ['queued', 'running'] } }, data: { status: 'done', finishedAt: NOW } });

/* ─────────── 1) 남은 시간이 모자라면 시작하지 않는다 ─────────── */
{
  const { assetId, bytes } = await arrived();
  await isolate(assetId);
  const before = reads.hash;
  /* 8KB 를 초당 100바이트로 읽는다고 짐작하면 약 92초 — 남은 1초로는 안 된다 */
  const s = await runIntakeCron(rt, { owner: 'cron-short', budget: fakeBudget(1_000), verifyBytesPerSec: 100 });
  eq(reads.hash, before, '큰 검증의 전체 읽기를 시작하지 않았다');
  const job = await jobOf(assetId);
  eq([job.status, job.attempts, job.lastError], ['queued', 0, VERIFY_BUDGET_NOTES.wait], '빌리지 않아 시도 횟수 그대로 · 관리자에게 다음 실행을 알린다');
  eq((await assetOf(assetId)).status, 'uploaded', '검증 중으로도 안 옮긴다');
  ok(s.deferred >= 1 && s.failed === 0 && s.retried === 0, '요약에 미룬 일로 센다');
  const cleanup = await db.intakeJob.findFirstOrThrow({ where: { kind: 'cleanup_uploads' }, orderBy: { createdAt: 'desc' } });
  eq(cleanup.status, 'done', '가벼운 일(정리)은 같은 크론에서 돈다');

  /* 빈 크론으로도 모자란 짐작이면 작업자를 기다린다고 알린다 — 이번 실행이 비지 않아(남은 시간이 예산의 70%) 한 번 읽어 보기도 안 한다 */
  await runIntakeCron(rt, { owner: 'cron-tiny-rate', budget: fakeBudget(INTAKE_CRON_BUDGET_MS * 0.7), verifyBytesPerSec: 10 });
  const tooBig = await jobOf(assetId);
  eq([tooBig.status, tooBig.attempts, tooBig.lastError], ['queued', 0, VERIFY_BUDGET_NOTES.tooBig], '한 번에 못 끝낼 파일은 작업자 안내');
  eq(reads.hash, before, '그때도 읽지 않는다');
  eq((await jobOf(assetId)).runAfter.getTime() <= NOW.getTime(), true, '끊긴 적 없는 큰 파일은 차례를 안 민다 — 다음 빈 크론이 읽어 본다');

  /* 같은 일감을 열 번 건너뛰어도 시도 횟수는 그대로다 */
  for (let i = 0; i < 10; i++) await runIntakeCron(rt, { owner: `cron-loop-${i}`, budget: fakeBudget(1_000), verifyBytesPerSec: 100 });
  eq((await jobOf(assetId)).attempts, 0, '건너뛰기를 거듭해도 횟수를 안 쓴다');

  /* 크론이 건너뛸 때마다 손길(updatedAt)을 새로 찍는다 — 관리자 화면은 이것으로 '살아 있는 기다림'과 '크론이 죽은 멈춤'을 가른다(admin.ts jobStateOf) */
  const { jobStateOf } = await import('@/lib/intake/admin');
  const old = new Date(Date.now() - 3 * 3_600_000);
  await db.intakeJob.update({ where: { dedupeKey: verifyJobKey(assetId) }, data: { updatedAt: old, runAfter: old } });
  eq(jobStateOf(await jobOf(assetId), new Date()), 'stalled', '차례 · 손길이 세 시간 지난 기다림은 멈춤');
  await runIntakeCron(rt, { owner: 'cron-touch', budget: fakeBudget(1_000), verifyBytesPerSec: 100 });
  const touched = await jobOf(assetId);
  ok(touched.updatedAt.getTime() > old.getTime() + 2 * 3_600_000, '건너뛰기가 updatedAt 을 새로 찍는다');
  eq(jobStateOf(touched, new Date()), 'waiting', '크론이 다시 만진 일은 기다림');

  /* 시간이 넉넉하면 한다 */
  const done = await runIntakeCron(rt, { owner: 'cron-long', budget: fakeBudget(INTAKE_CRON_BUDGET_MS), verifyBytesPerSec: 100 });
  ok(done.done >= 1, '넉넉하면 검증한다');
  const asset = await assetOf(assetId);
  eq([asset.status, asset.serverSha256], ['verified', sha(bytes)], '검증 끝 · 해시가 맞다');
  const finished = await jobOf(assetId);
  eq([finished.status, finished.attempts, finished.lastError], ['done', 1, null], '끝나면 기다림 글을 지운다');
}

/* ─────────── 끝낼 시각이 이미 지났으면 가벼운 일도 안 빌린다 · 차례 사이에 지나면 돌려준다 ─────────── */
{
  await enqueueJob(db, { kind: 'poll_analysis', dedupeKey: 'budget-light-1', payload: { runId: 'x1' }, runAfter: new Date(NOW.getTime() - 2) });
  await enqueueJob(db, { kind: 'poll_analysis', dedupeKey: 'budget-light-2', payload: { runId: 'x2' }, runAfter: new Date(NOW.getTime() - 1) });
  for (const k of ['budget-light-1', 'budget-light-2']) await db.intakeJob.updateMany({ where: { dedupeKey: k }, data: { lastError: `앞 시도의 까닭 ${k}` } });
  const spent = await runDueJobs(db, { poll_analysis: async () => undefined }, { owner: 'light-0', kinds: ['poll_analysis'], now: () => NOW, budget: fakeBudget(0) });
  eq([spent.done, spent.deferred], [0, 0], '시간이 없으면 빌리지 않는다');
  eq((await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: 'budget-light-1' } })).attempts, 0, '그래서 횟수도 그대로');

  let calls = 0;
  const light = await runDueJobs(
    db,
    {
      poll_analysis: async () => {
        calls++;
        wall += 5_000; // 첫 일이 남은 시간을 다 쓴다
      },
    },
    { owner: 'light-1', kinds: ['poll_analysis'], now: () => NOW, budget: fakeBudget(3_000) },
  );
  eq([calls, light.done, light.deferred], [1, 1, 1], '첫 일은 하고 둘째는 돌려준다');
  /* 빌린 줄이 돌아오는 차례는 정해져 있지 않다 — 어느 쪽이든 하나는 끝나고 하나는 되돌아와야 한다 */
  const pair = await db.intakeJob.findMany({ where: { dedupeKey: { in: ['budget-light-1', 'budget-light-2'] } } });
  const back = pair.find((j) => j.status === 'queued');
  eq(pair.map((j) => j.status).sort(), ['done', 'queued'], '하나는 끝나고 하나는 줄로');
  eq([back?.attempts, back?.lastError, back?.leaseOwner], [0, `앞 시도의 까닭 ${back?.dedupeKey}`, null], '돌려준 일은 횟수 · 앞 까닭을 그대로 둔다');
  await db.intakeJob.updateMany({ where: { dedupeKey: { in: ['budget-light-1', 'budget-light-2'] } }, data: { status: 'done', finishedAt: NOW } });
}

/* ─────────── 2) 해시 도중 끝낼 시각 → 끊고, 판정 없이, 횟수 안 쓰고 되돌린다 · 3) 다음 실행이 끝낸다 ─────────── */
{
  const { assetId, bytes } = await arrived(mov240(16_384));
  await isolate(assetId);
  /* 시도 횟수가 한 번 남은 일감 — 끊김이 실패로 세면 여기서 멈춘다 */
  await db.intakeJob.updateMany({ where: { dedupeKey: verifyJobKey(assetId) }, data: { attempts: 7, maxAttempts: 8 } });

  const ctrl = new AbortController();
  const held = holdHash();
  const run = runIntakeCron(rt, { owner: 'cron-abort', budget: fakeBudget(INTAKE_CRON_BUDGET_MS, ctrl.signal), verifyBytesPerSec: 1_000_000 });
  await held.begun;
  ok((await assetOf(assetId)).status === 'verifying', '읽는 동안은 검증 중');
  ctrl.abort(new Error('job_budget_exceeded'));
  const s = await run;
  hashHook = null;

  eq([s.deferred >= 1, s.failed, s.retried], [true, 0, 0], '끊김은 실패도 재시도도 아니다');
  const job = await jobOf(assetId);
  eq([job.status, job.attempts, job.leaseOwner, job.lastError], ['queued', 7, null, VERIFY_BUDGET_NOTES.aborted], '줄에 되돌리고 횟수를 돌려준다');
  const payload = job.payload as { assetId: string; budgetAborts: number; observedBytesPerSec?: number; lastBudgetAbortAt?: string };
  ok(payload.assetId === assetId && payload.budgetAborts === 1 && (payload.observedBytesPerSec ?? 0) > 0 && payload.lastBudgetAbortAt === NOW.toISOString(), '끊긴 횟수 · 잰 속도를 일감에 남긴다');
  const asset = await assetOf(assetId);
  eq([asset.status, asset.serverSha256, asset.verifiedAt, asset.rejectCode], ['verifying', null, null, null], '판정을 적지 않는다');
  eq(await verifiedAudits(assetId), 0, '판정 감사 기록도 없다');

  /* 잰 속도가 짐작보다 느리면 다음 어림이 그것을 쓴다 */
  const slow = { assetId, budgetAborts: 1, lastBudgetAbortAt: NOW.toISOString(), observedBytesPerSec: 100 };
  eq(await estimateVerifyMs(db, { payload: slow }, { bytesPerSec: 1_000_000, now: NOW }), verifyCostMs(bytes.length, 80), '앞에서 잰 속도의 80% 로 어림');

  /* 다음 실행이 처음부터 다시 읽어 끝낸다 */
  const before = reads.hash;
  const next = await runIntakeCron(rt, { owner: 'cron-next', budget: fakeBudget(INTAKE_CRON_BUDGET_MS), verifyBytesPerSec: 1_000_000 });
  ok(next.done >= 1 && reads.hash === before + 1, '다음 실행이 한 번 읽어 끝낸다');
  const done = await assetOf(assetId);
  eq([done.status, done.serverSha256], ['verified', sha(bytes)], '검증 끝');
  const finished = await jobOf(assetId);
  eq([finished.status, finished.attempts, finished.lastError], ['done', 8, null], '이번 한 번만 횟수로 셌다');
  eq(await verifiedAudits(assetId), 1, '판정 기록은 하나');

  /* 멱등 — 끝난 자산을 다시 불러도 읽지도 적지도 않는다 */
  const again = await verifyAsset(db, storage, assetId);
  eq([again, reads.hash, await verifiedAudits(assetId)], ['verified', before + 1, 1], '끝난 자산의 재검증은 아무것도 안 한다');
  const aborted = new AbortController();
  aborted.abort(new Error('job_budget_exceeded'));
  eq(await verifyAsset(db, storage, assetId, undefined, { signal: aborted.signal }), 'verified', '끝난 자산은 끊긴 signal 이어도 그대로 답한다');
}

/* ─────────── 두 일꾼이 붙어도 한 번만 판정한다 ─────────── */
{
  const { assetId, bytes } = await arrived(mov240(12_000));
  await isolate(assetId);
  const held = holdHash();
  const before = reads.hash;
  const a = runDueJobs(db, intakeJobHandlers(rt), { owner: 'worker-A', kinds: ['verify_asset'], now: () => NOW, budget: { ...fakeBudget(INTAKE_CRON_BUDGET_MS), estimateMs: () => 0 } });
  await held.begun;
  /* A 가 읽는 중 — B 는 같은 일감을 빌리지 못한다 */
  const b = await runDueJobs(db, intakeJobHandlers(rt), { owner: 'worker-B', kinds: ['verify_asset'], now: () => NOW, budget: { ...fakeBudget(INTAKE_CRON_BUDGET_MS), estimateMs: () => 0 } });
  eq([b.done, b.deferred, b.failed], [0, 0, 0], 'B 는 빌린 일이 없다');
  const c = await runDueJobs(db, intakeJobHandlers(rt), { owner: 'worker-C', kinds: ['verify_asset'], now: () => NOW });
  eq(c.done, 0, '예산 없는 일꾼도 못 빌린다');
  held.release();
  const sa = await a;
  hashHook = null;
  eq([sa.done, reads.hash - before], [1, 1], 'A 하나만 읽고 끝냈다');
  eq([(await assetOf(assetId)).status, await verifiedAudits(assetId)], ['verified', 1], '판정 하나');

  /* 임대 밖에서 두 verifyAsset 이 겹쳐도(임대가 늙어 다른 일꾼이 이어 받은 경우) 판정 기록은 하나다 */
  const { assetId: twin, bytes: twinBytes } = await arrived(mov240(10_000));
  await isolate(twin);
  const [r1, r2] = await Promise.all([verifyAsset(db, storage, twin), verifyAsset(db, storage, twin)]);
  eq([r1, r2], ['verified', 'verified'], '둘 다 같은 답');
  eq([(await assetOf(twin)).serverSha256, await verifiedAudits(twin)], [sha(twinBytes), 1], '조건부 쓰기라 판정 · 감사가 한 번');
  void bytes;
}

/* ─────────── 4) 거듭 끊긴 파일은 쉬고 검증 작업자를 기다린다 ─────────── */
{
  const { assetId, bytes } = await arrived(mov240(9_000));
  await isolate(assetId);
  for (let i = 1; i <= VERIFY_MAX_BUDGET_ABORTS; i++) {
    const ctrl = new AbortController();
    const held = holdHash();
    const run = runIntakeCron(rt, { owner: `cron-park-${i}`, budget: fakeBudget(INTAKE_CRON_BUDGET_MS, ctrl.signal), verifyBytesPerSec: 1_000_000 });
    await held.begun;
    ctrl.abort(new Error('job_budget_exceeded'));
    await run;
    hashHook = null;
  }
  const parked = await jobOf(assetId);
  eq([parked.status, parked.attempts, parked.lastError, (parked.payload as { budgetAborts: number }).budgetAborts], ['queued', 0, VERIFY_BUDGET_NOTES.parked, VERIFY_MAX_BUDGET_ABORTS], '상한만큼 끊기면 쉰다 · 횟수는 그대로');

  const before = reads.hash;
  await runIntakeCron(rt, { owner: 'cron-parked', budget: fakeBudget(INTAKE_CRON_BUDGET_MS), verifyBytesPerSec: 1_000_000 });
  eq(reads.hash, before, '쉬는 동안 크론은 같은 읽기를 되풀이하지 않는다');
  eq((await jobOf(assetId)).lastError, VERIFY_BUDGET_NOTES.parked, '관리자는 작업자를 기다린다는 글을 본다');
  ok((await estimateVerifyMs(db, parked, { bytesPerSec: 1_000_000, now: new Date(NOW.getTime() + VERIFY_PARK_MS + 1) })) < INTAKE_CRON_BUDGET_MS, '하루가 지나면 크론이 다시 해 본다');

  /* 검증 작업자 — 예산 없이 끝까지 읽는다. 무결성 검사는 그대로다 */
  const w = await runIntakeVerifyWorker(rt, { owner: 'verify-worker' });
  eq([w.done, reads.hash], [1, before + 1], '작업자가 한 번 읽어 끝낸다');
  eq([(await assetOf(assetId)).status, (await assetOf(assetId)).serverSha256], ['verified', sha(bytes)], '같은 해시 검사로 검증');
  eq([(await jobOf(assetId)).status, (await jobOf(assetId)).lastError], ['done', null], '기다림 글이 걷힌다');
}

/* ─────────── 6-1) 빈 크론은 '너무 큰' 어림의 파일도 한 번 읽어 본다 — 어림만으로 영영 안 읽는 파일이 없게 ─────────── */
{
  ok(VERIFY_PROBE_MIN_LEFT_FRACTION > 0.7 && VERIFY_PROBE_MIN_LEFT_FRACTION <= 1, '읽어 보기 문턱은 70% 실행에서는 안 걸리는 값이다');
  const { assetId, bytes } = await arrived(mov240(8_500));
  await isolate(assetId);
  const before = reads.hash;
  /* 8.5KB 를 초당 10바이트로 짐작하면 빈 크론으로도 모자라다 — 그래도 실행이 비었으니 한 번 읽는다(가짜 저장소는 곧바로 끝난다) */
  const s = await runIntakeCron(rt, { owner: 'cron-probe', budget: fakeBudget(INTAKE_CRON_BUDGET_MS), verifyBytesPerSec: 10 });
  eq([reads.hash - before, s.done >= 1], [1, true], '한 번 읽어 끝냈다');
  eq([(await assetOf(assetId)).status, (await assetOf(assetId)).serverSha256], ['verified', sha(bytes)], '무결성 검사 그대로 검증');
}

/* ─────────── 6-2) 잠깐 느렸던 한 번의 속도가 그 파일을 영영 막지 않는다 ─────────── */
{
  const { assetId, bytes } = await arrived(mov240(9_500));
  await isolate(assetId);
  /* 끊기기 전에 1바이트만 읽었다 — 잰 속도가 아주 느리다(초당 수십 바이트) */
  const ctrl = new AbortController();
  let begun!: () => void;
  const started = new Promise<void>((r) => (begun = r));
  hashHook = async (_p, opts) => {
    opts?.onBytes?.(1);
    begun();
    await new Promise<void>((resolve) => {
      if (opts?.signal?.aborted) return resolve();
      opts?.signal?.addEventListener('abort', () => resolve(), { once: true });
    });
  };
  const run = runIntakeCron(rt, { owner: 'cron-slow', budget: fakeBudget(INTAKE_CRON_BUDGET_MS, ctrl.signal), verifyBytesPerSec: 1_000_000 });
  await started;
  await new Promise((r) => setTimeout(r, 40));
  ctrl.abort(new Error('job_budget_exceeded'));
  await run;
  hashHook = null;
  const slow = await jobOf(assetId);
  const slowPayload = slow.payload as { budgetAborts: number; observedBytesPerSec: number };
  ok(slowPayload.budgetAborts === 1 && slowPayload.observedBytesPerSec < 100, '아주 느린 속도가 남았다');
  ok((await estimateVerifyMs(db, slow, { bytesPerSec: 1_000_000, now: NOW })) > INTAKE_CRON_BUDGET_MS, '하루 안에는 그 속도로 어림해 너무 크다');

  /* 같은 날 크론 — 읽지 않고, 차례를 하루 끝으로 민다(줄 앞을 막지 않게) */
  const before = reads.hash;
  await runIntakeCron(rt, { owner: 'cron-slow-same-day', budget: fakeBudget(INTAKE_CRON_BUDGET_MS), verifyBytesPerSec: 1_000_000 });
  const waiting = await jobOf(assetId);
  eq([reads.hash, waiting.attempts, waiting.lastError, waiting.runAfter.getTime()], [before, 0, VERIFY_BUDGET_NOTES.tooBig, NOW.getTime() + VERIFY_PARK_MS], '같은 날에는 안 읽고 하루 뒤로 민다');
  ok(isVerifyBudgetNote(waiting.lastError), '관리자에게 기다림 글');

  /* 하루가 지나면 잰 속도를 버리고 짐작 속도로 — 크론이 다시 빌려 끝낸다 */
  const later = new Date(NOW.getTime() + VERIFY_PARK_MS + 60_000);
  ok((await estimateVerifyMs(db, waiting, { bytesPerSec: 1_000_000, now: later })) < INTAKE_CRON_BUDGET_MS, '하루 뒤에는 잰 속도를 안 쓴다');
  const rtLater = { db, storage, gpu: {}, now: () => later } as never;
  const s = await runIntakeCron(rtLater, { owner: 'cron-slow-next-day', budget: fakeBudget(INTAKE_CRON_BUDGET_MS), verifyBytesPerSec: 1_000_000 });
  eq([s.done >= 1, reads.hash - before], [true, 1], '하루 뒤 크론이 다시 빌려 읽는다');
  eq([(await assetOf(assetId)).status, (await assetOf(assetId)).serverSha256], ['verified', sha(bytes)], '검증 끝');
}

/* ─────────── 6-3) 쉬는 큰 파일이 줄 앞을 막아도 뒤의 작은 파일은 검증된다 ─────────── */
{
  const { assetId, bytes } = await arrived(mov240(8_800));
  await isolate(assetId);
  const PARKED = 16;
  const lastAbort = new Date(NOW.getTime() - 3_600_000).toISOString();
  for (let i = 0; i < PARKED; i++) {
    await enqueueJob(db, {
      kind: 'verify_asset',
      dedupeKey: `budget-parked-${i}`,
      payload: { assetId: `parked-asset-${i}`, budgetAborts: VERIFY_MAX_BUDGET_ABORTS, lastBudgetAbortAt: lastAbort, observedBytesPerSec: 10 },
      runAfter: new Date(NOW.getTime() - 7_200_000 + i),
    });
  }
  const before = reads.hash;
  const s = await runIntakeCron(rt, { owner: 'cron-starve', budget: fakeBudget(INTAKE_CRON_BUDGET_MS), verifyBytesPerSec: 1_000_000 });
  eq([reads.hash - before, s.done >= 1], [1, true], '쉬는 파일 16개 뒤의 작은 파일을 읽었다');
  eq([(await assetOf(assetId)).status, (await assetOf(assetId)).serverSha256], ['verified', sha(bytes)], '작은 파일 검증 끝');
  const parked = await db.intakeJob.findMany({ where: { dedupeKey: { startsWith: 'budget-parked-' } } });
  const parkEnd = Date.parse(lastAbort) + VERIFY_PARK_MS;
  ok(parked.length === PARKED && parked.every((j) => j.status === 'queued' && j.attempts === 0 && j.runAfter.getTime() === parkEnd && j.lastError === VERIFY_BUDGET_NOTES.parked), '쉬는 파일은 횟수 그대로 · 차례를 쉼 끝으로 밀고 기다림 글');
  /* 다음 크론은 그 줄을 보지도 않는다 */
  const peeked = await runDueJobs(db, intakeJobHandlers(rt), { owner: 'peek-again', kinds: ['verify_asset'], now: () => NOW, budget: { ...fakeBudget(INTAKE_CRON_BUDGET_MS), estimateMs: () => Infinity } });
  eq(peeked.deferred, 0, '밀린 줄은 다음 실행의 어림 대상도 아니다');
  await db.intakeJob.updateMany({ where: { dedupeKey: { startsWith: 'budget-parked-' } }, data: { status: 'done', finishedAt: NOW } });
}

/* ─────────── 6-4) 임대가 늙은 채 남은 큰 파일도 관리자에게 기다림으로 보인다 ─────────── */
{
  await enqueueJob(db, {
    kind: 'verify_asset',
    dedupeKey: 'budget-stale-lease',
    payload: { assetId: 'stale-asset', budgetAborts: VERIFY_MAX_BUDGET_ABORTS, lastBudgetAbortAt: NOW.toISOString() },
    runAfter: new Date(NOW.getTime() - 60_000),
  });
  await db.intakeJob.updateMany({ where: { dedupeKey: 'budget-stale-lease' }, data: { status: 'running', attempts: 2, leaseOwner: 'dead-worker', leaseUntil: new Date(NOW.getTime() - 1_000) } });
  await runDueJobs(db, intakeJobHandlers(rt), {
    owner: 'cron-stale',
    kinds: ['verify_asset'],
    now: () => NOW,
    budget: { ...fakeBudget(INTAKE_CRON_BUDGET_MS), estimateMs: () => Infinity, skipNote: () => VERIFY_BUDGET_NOTES.parked, skipUntil: () => new Date(NOW.getTime() + VERIFY_PARK_MS) },
  });
  const j = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: 'budget-stale-lease' } });
  eq([j.status, j.leaseOwner, j.lastError, j.attempts, j.runAfter.getTime()], ['queued', null, VERIFY_BUDGET_NOTES.parked, 2, NOW.getTime() + VERIFY_PARK_MS], '줄로 되돌리고 기다림 글 · 차례를 민다');
  await db.intakeJob.updateMany({ where: { dedupeKey: 'budget-stale-lease' }, data: { status: 'done', finishedAt: NOW } });
}

/* ─────────── 6-5) 끊긴 뒤 난 진짜 실패는 기다림으로 감추지 않는다 ─────────── */
{
  const { assetId } = await arrived(mov240(7_700));
  await isolate(assetId);
  const ctrl = new AbortController();
  hashHook = async () => {
    ctrl.abort(new Error('job_budget_exceeded'));
    throw new IntakeError('storage_unavailable', { cause: 'hash_read' });
  };
  const s = await runIntakeCron(rt, { owner: 'cron-real-fail', budget: fakeBudget(INTAKE_CRON_BUDGET_MS, ctrl.signal), verifyBytesPerSec: 1_000_000 });
  hashHook = null;
  const j = await jobOf(assetId);
  eq([s.retried, s.deferred, j.attempts, isVerifyBudgetNote(j.lastError), (j.payload as { budgetAborts?: number }).budgetAborts], [1, 0, 1, false, undefined], '실패로 세고 진짜 까닭을 남긴다');
  ok(j.lastError?.includes('hash_read'), '저장소 까닭이 글에 있다');
  eq((await assetOf(assetId)).status, 'verifying', '판정은 없다');
}

/* ─────────── 6-6) 관리자 '다시 확인'이 기다리는 검증을 다시 건다 — 잰 속도 · 끊긴 횟수를 지운다 ─────────── */
{
  const { assetId } = await arrived(mov240(7_900));
  await isolate(assetId);
  await db.intakeJob.updateMany({
    where: { dedupeKey: verifyJobKey(assetId) },
    data: { attempts: 3, lastError: VERIFY_BUDGET_NOTES.parked, runAfter: new Date(NOW.getTime() + VERIFY_PARK_MS), payload: { assetId, budgetAborts: 3, lastBudgetAbortAt: NOW.toISOString(), observedBytesPerSec: 7 } },
  });
  const r = await requeueVerification(db, { adminId: 'admin-1', assetId }, NOW);
  eq(r.requeued, true, '기다리는 검증도 다시 걸린다');
  const j = await jobOf(assetId);
  eq([j.status, j.attempts, j.lastError, j.runAfter.getTime(), j.payload], ['queued', 0, null, NOW.getTime(), { assetId }], '곧바로 차례 · 끊김 기록을 지운다');
  eq((await requeueVerification(db, { adminId: 'admin-1', assetId }, NOW)).requeued, false, '그냥 줄에 있는 일은 다시 걸지 않는다');
  await runIntakeCron(rt, { owner: 'cron-after-requeue', budget: fakeBudget(INTAKE_CRON_BUDGET_MS), verifyBytesPerSec: 1_000_000 });
  eq((await assetOf(assetId)).status, 'verified', '다음 크론이 끝낸다');
}

/* ─────────── 6-7) 공개 라우트 after() 검증 — 같은 예산 · 쉬는 파일은 안 읽는다 ─────────── */
{
  const { assetId, bytes } = await arrived(mov240(8_100));
  await isolate(assetId);
  await enqueueJob(db, {
    kind: 'verify_asset',
    dedupeKey: 'budget-public-parked',
    payload: { assetId: 'public-parked-asset', budgetAborts: VERIFY_MAX_BUDGET_ABORTS, lastBudgetAbortAt: NOW.toISOString() },
    runAfter: new Date(NOW.getTime() - 3_600_000),
  });
  /* 라우트 시간이 거의 다 갔다 — 고정 몫(10초)도 안 남아 아무것도 시작하지 않는다 */
  const before = reads.hash;
  const short = await runVerifySoon({ db, storage, now: () => NOW }, { startedAtMs: Date.now(), routeMaxDurationSec: 31, verifyBytesPerSec: 1_000_000 });
  eq([reads.hash, short.done], [before, 0], '남은 시간이 없으면 읽지 않는다');
  eq([(await jobOf(assetId)).attempts, (await jobOf(assetId)).lastError], [0, VERIFY_BUDGET_NOTES.wait], '횟수 그대로 · 크론이 잇는다는 글');

  const full = await runVerifySoon({ db, storage, now: () => NOW }, { startedAtMs: Date.now(), verifyBytesPerSec: 1_000_000 });
  eq([full.done, reads.hash - before], [1, 1], '시간이 있으면 이 파일만 읽어 끝낸다');
  eq([(await assetOf(assetId)).status, (await assetOf(assetId)).serverSha256], ['verified', sha(bytes)], '검증 끝');
  const parked = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: 'budget-public-parked' } });
  eq([parked.status, parked.attempts], ['queued', 0], '쉬는 파일은 빌리지 않았다');
  await db.intakeJob.updateMany({ where: { dedupeKey: 'budget-public-parked' }, data: { status: 'done', finishedAt: NOW } });
}

/* ─────────── 6-8) 공개 API 의 올리기 확인이 응답 뒤 검증을 예산 규칙(runVerifySoon)으로 건다 ─────────── */
{
  const scheduled: (() => Promise<unknown>)[] = [];
  const api = createPublicApi({ db, storage: () => storage, schedule: (t) => scheduled.push(t), now: () => NOW });
  const bytes = mov240(8_300);
  const created = await createInvitation(db, { adminId: 'admin-1', uploadExpiresAt: new Date(NOW.getTime() + 14 * DAY) }, NOW);
  const scope: IntakeScope = await openIntakeScope(db, `Intake ${created.token}`, 'read', NOW);
  const state = await loadPublicState(db, scope, { now: NOW });
  await saveDraft(db, scope, { expectedVersion: state.version, athleteName: '공개예산', athleteAgeBand: '14_or_over', samePitchConfirmed: true }, NOW);
  await recordConsents(db, scope, { answers: [answer('submission'), answer('overseas')] }, NOW);
  const r = await reserveAsset(db, scope, { view: 'side', expectedAssetId: null, fileName: 'side.MOV', sizeBytes: bytes.length, declaredType: 'video/quicktime', sha256: sha(bytes), pairConfirmed: true }, NOW);
  await issueUploadToken(db, storage, scope, { assetId: r.asset.id }, NOW);
  objects.set((await assetOf(r.asset.id)).objectPath, bytes);
  /* 쉬게 둔 파일 — 예전 길(예산 없는 runDueJobs)이면 빌려서 시도 횟수를 썼다 */
  await db.intakeJob.updateMany({ where: { kind: 'verify_asset', status: { in: ['queued', 'running'] } }, data: { status: 'done', finishedAt: NOW } });
  await enqueueJob(db, {
    kind: 'verify_asset',
    dedupeKey: 'budget-public-api-parked',
    payload: { assetId: 'public-api-parked-asset', budgetAborts: VERIFY_MAX_BUDGET_ABORTS, lastBudgetAbortAt: NOW.toISOString() },
    runAfter: new Date(NOW.getTime() - 3_600_000),
  });

  let seenSignal: AbortSignal | undefined;
  hashHook = async (_p, opts) => {
    seenSignal = opts?.signal;
  };
  const res = await api.confirm(
    new Request('https://example.test/api/intake/public/assets/confirm', {
      method: 'POST',
      headers: { authorization: `Intake ${created.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ assetId: r.asset.id }),
    }),
  );
  eq([res.status, scheduled.length], [200, 1], '확인은 곧바로 답하고 검증을 응답 뒤로 미룬다');
  for (const t of scheduled.splice(0)) await t();
  hashHook = null;
  eq([(await assetOf(r.asset.id)).status, (await assetOf(r.asset.id)).serverSha256], ['verified', sha(bytes)], '응답 뒤 검증이 이 파일을 끝낸다');
  ok(seenSignal instanceof AbortSignal && !seenSignal.aborted, '해시 읽기에 예산 signal 이 이어진다');
  const parked = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: 'budget-public-api-parked' } });
  eq([parked.status, parked.attempts], ['queued', 0], '쉬는 파일은 공개 라우트가 빌리지 않는다');
  await db.intakeJob.updateMany({ where: { dedupeKey: 'budget-public-api-parked' }, data: { status: 'done', finishedAt: NOW } });
}

/* ─────────── 해시가 틀린 파일은 예산과 상관없이 막는다(무결성 검사를 빼지 않는다) ─────────── */
{
  const { assetId } = await arrived(mov240(7_000));
  await isolate(assetId);
  const row = await assetOf(assetId);
  const tampered = Buffer.from(objects.get(row.objectPath)!);
  tampered[tampered.length - 1] ^= 0xff;
  objects.set(row.objectPath, tampered);
  await runIntakeCron(rt, { owner: 'cron-tampered', budget: fakeBudget(INTAKE_CRON_BUDGET_MS), verifyBytesPerSec: 1_000_000 });
  eq([(await assetOf(assetId)).status, (await assetOf(assetId)).rejectCode], ['rejected', 'hash_mismatch'], '바뀐 파일은 막힌다');
}

await db.$disconnect();
await socket.stop();
await pg.close();
console.log(`intake budget selftest: ${passed} passed`);
