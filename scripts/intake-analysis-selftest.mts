/**
 * 외부 접수의 분석 · 공개 시험 — 운영 DB 를 건드리지 않고 메모리 안 PostgreSQL(PGlite)에 마이그레이션 SQL 을 깐다. 저장소 · GPU 는 가짜다.
 * `npm run intake:analysis-test`
 *
 * 결과 파일은 합성 투수를 진짜 맞추기 엔진(fitPitch3dV2)으로 돌린 것이라 읽기 검사 · 진단 요약 · 3D 자세 계산을 그대로 지난다.
 * 한계: PGlite 는 연결이 하나라 동시 호출이 줄을 서서 돈다 — 같은 키의 결과는 확인하지만 두 연결이 같은 순간에 잠금을 다투는 모습은 재현되지 않는다.
 * 진짜 분석 서버 · 진짜 저장소에 대해서는 이 시험으로 말할 수 없다.
 */
/* 맨 앞 — 다른 모듈보다 먼저 시험 시계를 건다 */
import './intake-test-clock.mts';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { analysisConsentReady } from '@/lib/analysis-consent';
import { openIntakeScope, type IntakeScope } from '@/lib/intake/access';
import {
  analysisInputNotes,
  analysisReadiness,
  carryAnalysisForward,
  listRuns,
  loadRunResult,
  loadRunReview,
  pollIntakeRun,
  runResultPath,
  setAnalysisHand,
  START_UNKNOWN_WINDOW_MS,
  startIntakeAnalysis,
  type AnalysisErrorCode,
  type IntakeGpu,
  type IntakeRuntime,
  runPreviewPath,
} from '@/lib/intake/analysis';
import { adminWithdrawConsent, issueOriginalLinks, issueRunPreviewLink } from '@/lib/intake/admin';
import { consentDocOf, type ConsentAnswer } from '@/lib/intake/consent';
import { IntakeError, type IntakeErrorCode } from '@/lib/intake/errors';
import { cronAuthorized, handleCronRequest, intakeJobHandlers, registerRevision, runIntakeCron } from '@/lib/intake/job-handlers';
import { enqueueJob, runDueJobs } from '@/lib/intake/jobs';
import { TUS_URL_TTL_MS } from '@/lib/intake/limits';
import { assetObjectPath, runObjectPrefix } from '@/lib/intake/paths';
import { handlePublicResultRequest, loadPublicResult, publishRun, unpublish } from '@/lib/intake/publication';
import { purgeSubmissionOriginals } from '@/lib/intake/purge';
import { body3dResultOf, toPublicView } from '@/lib/intake/public-result';
import {
  cleanupStaleUploads,
  cancelCorrection,
  confirmUpload,
  createInvitation,
  finalizeSubmission,
  issueUploadToken,
  loadPublicState,
  recordConsents,
  requestCorrection,
  reserveAsset,
  resetAccessCodeLock,
  saveDraft,
  withdrawConsent,
} from '@/lib/intake/service';
import type { IntakeRunStorage } from '@/lib/intake/storage-core';
import { displayTrack } from '@/lib/pitch-3d/v2/display';
import { readPitch3dV2Result, v2Fail, type GpuStatus, type Pitch3dV2Ok, type V2FailCode } from '@/lib/pitch-3d/v2/contract';
import type { GpuJobRequest } from '@/lib/pitch-3d/v2/gpu-client';
import { fitPitch3dV2 } from '@/lib/pitch-3d/v2/fit';
import { mov120, mov240 } from './intake-fixtures.mts';
import { base, cameras, EV } from './pitch-lab/synth.mts';
import { makeV2Track } from './pitch-lab/synth-v2.mts';

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
async function fails(p: Promise<unknown>, code: IntakeErrorCode | AnalysisErrorCode, label: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof IntakeError, `${label}: IntakeError 가 아니에요 — ${String(e)}`);
    assert.equal(e.code, code, label);
    return true;
  });
  if (process.env.V) console.log('ok', label);
  passed++;
}

/* ── DB ── */
/* 공유 DB 에 적용하기 전에는 prisma/pending-migrations 에 둔다(그 폴더 README) */
const MIGRATION_ROOT = readdirSync('prisma').includes('pending-migrations') ? 'prisma/pending-migrations' : 'prisma/migrations';
const dirs = readdirSync(MIGRATION_ROOT).filter((d) => d.endsWith('_external_intake')).sort();
const pg = await PGlite.create();
await pg.exec(readFileSync(`${MIGRATION_ROOT}/${dirs[0]}/migration.sql`, 'utf8'));
const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await socket.start();
const addr = (socket as unknown as { server: { address(): { port: number } } }).server.address();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${addr.port}/postgres?sslmode=disable`, max: 1 }),
});

/* ── 가짜 저장소 — 올리기 주소는 경로를 그대로 담아, 가짜 GPU 가 그 자리에 결과를 놓는다 ── */
const objects = new Map<string, Buffer>();
const PUT = 'https://put.example/';
const READ = 'https://read.example/';
const fault: { resultUrl: boolean; onSign: (() => Promise<void>) | null; removePartial: boolean } = { resultUrl: false, onSign: null, removePartial: false };
const storage: IntakeRunStorage = {
  uploadOrigin: 'https://proj.storage.supabase.co',
  async issueUpload(objectPath) {
    return { endpoint: `${this.uploadOrigin}/storage/v1/upload/resumable/sign`, token: `tok-${randomBytes(4).toString('hex')}`, tokenTtlMs: 3_600_000, apikey: 'pk', bucket: 'external-intake', objectName: objectPath };
  },
  async stat(p) {
    const b = objects.get(p);
    return b ? { size: b.length, contentType: 'video/quicktime' } : null;
  },
  async reader(p) {
    const b = objects.get(p);
    return b ? { size: b.length, read: async (s, e) => new Uint8Array(b.subarray(s, e)) } : null;
  },
  async hash(p) {
    const b = objects.get(p)!;
    return { sha256: createHash('sha256').update(b).digest('hex'), size: b.length };
  },
  async readUrl(p) {
    return `${READ}${p}`;
  },
  async list(prefix) {
    return [...objects.keys()].filter((k) => k.startsWith(prefix));
  },
  async remove(paths) {
    if (fault.removePartial) {
      fault.removePartial = false;
      objects.delete(paths[paths.length - 1]);
      throw new IntakeError('storage_unavailable', { cause: 'remove' });
    }
    for (const p of paths) objects.delete(p);
  },
  async resultUploadUrl(p) {
    if (fault.resultUrl) throw new IntakeError('storage_unavailable', { cause: 'sign_result' });
    await fault.onSign?.();
    return `${PUT}${p}`;
  },
};

/* ── 가짜 GPU ── */
const gpuCalls: GpuJobRequest[] = [];
const gpuStatus = new Map<string, GpuStatus>();
/* lostResponse — 서버는 받아서 도는데 답만 끊긴 경우. startError 'gpu' 는 서버가 받았는지 모르는 실패다 */
const gpuState: { configured: boolean; build: string | null; startError: 'gpu' | 'gpu-auth' | null; lostResponse: 'throw' | 'error' | null } = { configured: true, build: 'build-a', startError: null, lostResponse: null };
const gpu: IntakeGpu = {
  configured: () => gpuState.configured,
  async start(req) {
    if (gpuState.startError) return { error: gpuState.startError };
    gpuCalls.push(req);
    if (gpuState.lostResponse === 'throw') throw new Error('The operation was aborted due to timeout');
    if (gpuState.lostResponse === 'error') return { error: 'gpu' };
    return { callId: `call-${gpuCalls.length}` };
  },
  async status(callId) {
    return gpuStatus.get(callId) ?? { kind: 'pending' };
  },
  async engineBuild() {
    return gpuState.build;
  },
};

let nowMs = Date.parse('2026-11-06T03:00:00Z');
const env: Record<string, string | undefined> = { INTAKE_ALLOW_DRAFT_ANALYSIS: '1' };
const rt: IntakeRuntime = { db, storage, gpu, env, now: () => new Date(nowMs) };
const ADMIN = '6f1d1b7e-0c1a-4c7e-9a44-111111111111';
const ADMIN2 = '6f1d1b7e-0c1a-4c7e-9a44-222222222222';
const ACTOR = { id: ADMIN, role: 'ADMIN' };
const start = (submissionId: string, extra: { adminId?: string; confirm?: boolean } = {}) =>
  startIntakeAnalysis({ submissionId, adminId: extra.adminId ?? ADMIN, confirmDraftConsent: extra.confirm ?? true }, rt);
/* 화면처럼 지금 공개를 읽어 보낸다 — 낡은 화면은 아래 시험이 일부러 옛 값을 넘겨 만든다 */
const activePublicationOf = async (submissionId: string) => (await db.intakePublication.findUnique({ where: { activeFor: submissionId } }))?.id ?? null;
const publish = async (input: { runId: string; adminId: string; explanation?: string | null; allowOlderRevision?: boolean }) => {
  const run = await db.intakeAnalysisRun.findUniqueOrThrow({ where: { id: input.runId } });
  return publishRun({ ...input, expectedActivePublicationId: await activePublicationOf(run.submissionId) }, rt);
};
const takedown = async (submissionId: string) => unpublish({ submissionId, adminId: ADMIN, expectedActivePublicationId: await activePublicationOf(submissionId) }, rt);

/* ── 진짜 엔진으로 만든 결과 하나를 실행 번호만 바꿔 쓴다 ── */
const sc = base;
const { side: camS, back: camB } = cameras(sc);
const trackS = makeV2Track(sc, camS, sc.side, 'side', 11);
const trackB = makeV2Track(sc, camB, sc.back, 'back', 12);
const fitted = fitPitch3dV2({
  side: trackS.track,
  back: trackB.track,
  hand: sc.hand,
  heightCm: 183,
  jobId: '2b0c7c1e-8f7a-4d1e-9a51-0c9d2f3e4a5b',
  poseModel: 'synth',
  screenRecorded: true,
  slowmoFps: 240,
  events: { kneeUp: trackS.toMedia(EV.kneeUp), footPlant: trackS.toMedia(EV.footPlant), release: trackS.toMedia(EV.release) },
}).result;
ok(fitted.ok, '합성 투수 결과가 나온다');
const realResult = fitted as Pitch3dV2Ok;
/* 내부 칸에 찾기 쉬운 값을 심어, 공개 응답에 새지 않는지 본다 */
const POSE_MARK = 'pose-internal-mark';
const BUILD_MARK = 'build-internal-mark';
const resultFor = (runId: string, frames?: number) => {
  const r: Pitch3dV2Ok = {
    ...realResult,
    jobId: runId,
    engine: { v1: 'v1-internal-mark', pose: POSE_MARK, build: BUILD_MARK },
    experimental: { sam3d: { model: 'sam-internal-mark', joints: realResult.joints } },
  };
  if (!frames) return r;
  const cut = <T,>(a: T[]) => a.slice(0, frames);
  return { ...r, t: cut(r.t), tBack: cut(r.tBack), joints: cut(r.joints), conf: cut(r.conf), lowConf: [], experimental: undefined, events: { kneeUp: 1, footPlant: 2, release: 3 } };
};
const putResult = (req: GpuJobRequest, value: unknown) => {
  assert.ok(req.result.uploadUrl.startsWith(PUT));
  objects.set(req.result.uploadUrl.slice(PUT.length), Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
};
const finishGpu = async (req: GpuJobRequest, value: unknown = resultFor(req.jobId)) => {
  putResult(req, value);
  gpuStatus.set(`call-${gpuCalls.indexOf(req) + 1}`, { kind: 'done', stages: { fit: 3 } });
  return pollIntakeRun(req.jobId, rt);
};
const lastCall = () => gpuCalls[gpuCalls.length - 1];

/* ── 접수 하나 만들기 ── */
const consents = (): ConsentAnswer[] =>
  (['submission', 'overseas'] as const).map((k) => ({ kind: k, version: consentDocOf(k).version, textHash: consentDocOf(k).textHash, granted: true }));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const put = (path: string, b: Buffer) => objects.set(path, b);

/** 검증 → 등록 차례로 — 등록 일감은 검증이 끝나야 생긴다. 검증 처리기는 프로세스 시계(시험 시계, intake-test-clock.mts)로 일감을 넣어서 하루 앞으로 돌린다 */
async function settleJobs() {
  for (const kind of ['verify_asset', 'register_revision'] as const) {
    await runDueJobs(db, intakeJobHandlers(rt), { owner: 'test', kinds: [kind], limit: 10, now: () => new Date(Date.now() + 86_400_000) });
  }
}

type Made = { token: string; scope: IntakeScope; submissionId: string; invitationId: string; side: Buffer; rear: Buffer };
async function makeVerified(opts: { hand?: 'R' | 'L' | null; accessCode?: string; name?: string; resultExpiresAt?: Date } = {}): Promise<Made> {
  const inv = await createInvitation(db, { adminId: ADMIN, accessCode: opts.accessCode, resultExpiresAt: opts.resultExpiresAt }, new Date(nowMs));
  const scope = await openIntakeScope(db, `Intake ${inv.token}`, 'read', new Date(nowMs));
  const hand = opts.hand === undefined ? 'R' : opts.hand;
  await saveDraft(db, scope, { expectedVersion: 0, athleteName: opts.name ?? '김선수', athleteAgeBand: '14_or_over', throwingHand: hand, submitterName: '보호자-내부-표시', submitterRelation: 'parent', samePitchConfirmed: true }, new Date(nowMs));
  await recordConsents(db, scope, { answers: consents() }, new Date(nowMs));
  const side = mov120(4096, { appleFocal: '26' });
  const rear = mov240(4096, { appleFocal: '26' });
  let version = 1;
  for (const [view, file] of [['side', side], ['rear', rear]] as const) {
    const { asset, version: v } = await reserveAsset(db, scope, { view, expectedAssetId: null, fileName: `비공개-원본-${view}.mov`, sizeBytes: file.length, sha256: sha(file), pairConfirmed: true }, new Date(nowMs));
    version = v;
    await issueUploadToken(db, storage, scope, { assetId: asset.id }, new Date(nowMs));
    put(assetObjectPath(scope.submissionId, asset.id), file);
    await confirmUpload(db, storage, scope, { assetId: asset.id }, new Date(nowMs));
  }
  await finalizeSubmission(db, scope, { expectedVersion: version, idempotencyKey: randomBytes(16).toString('hex') }, new Date(nowMs));
  await settleJobs();
  return { token: inv.token, scope, submissionId: scope.submissionId, invitationId: scope.invitationId, side, rear };
}

const subOf = (id: string) => db.intakeSubmission.findUniqueOrThrow({ where: { id } });
const runOf = (id: string) => db.intakeAnalysisRun.findUniqueOrThrow({ where: { id } });
const readPublishable = async (id: string) => (await loadRunResult(id, rt)).jobId === id;
const originalsOf = async (id: string) => (await db.intakeAsset.findMany({ where: { submissionId: id } })).map((a) => a.objectPath);

/* ───────────────── 1. 검증된 접수는 등록되지만 GPU 는 저절로 안 돈다 ───────────────── */
{
  const m = await makeVerified();
  const sub = await subOf(m.submissionId);
  eq([sub.status, sub.analysisStatus], ['verified', 'ready'], '검증이 끝나면 분석 가능 상태가 된다');
  const audit = await db.intakeAudit.count({ where: { submissionId: m.submissionId, action: 'revision.registered' } });
  eq(audit, 1, '판 등록이 기록된다');
  eq(gpuCalls.length, 0, '등록만으로 GPU 는 안 돈다');
  await runIntakeCron(rt, { owner: 'cron-1' });
  eq(gpuCalls.length, 0, '크론도 GPU 를 걸지 않는다');
  const rev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: m.submissionId } });
  /* 저장소에서 원본이 사라지면 등록이 실패로 드러난다 */
  const asset = await db.intakeAsset.findUniqueOrThrow({ where: { id: rev.sideAssetId } });
  const held = objects.get(asset.objectPath)!;
  objects.delete(asset.objectPath);
  await assert.rejects(registerRevision(rt, rev.id));
  passed++;
  objects.set(asset.objectPath, held);
  eq(await registerRevision(rt, rev.id), 'registered', '원본이 있으면 다시 등록된다');
  eq(await registerRevision(rt, '6f1d1b7e-0c1a-4c7e-9a44-333333333333'), 'skipped', '없는 판은 건너뛴다');
}

/* ───────────────── 2. 돌려도 되는 조건 ───────────────── */
{
  const draftInv = await createInvitation(db, { adminId: ADMIN }, new Date(nowMs));
  await fails(start(draftInv.submissionId), 'analysis_not_ready', '접수 전에는 못 돌린다');

  const m = await makeVerified({ hand: null });
  await fails(start(m.submissionId), 'analysis_hand_required', '던지는 손을 모르면 못 돌린다');
  eq((await analysisReadiness(m.submissionId, rt)).hand, null, '준비 상태에 손이 비어 있다');
  ok((await analysisReadiness(m.submissionId, rt)).blockers.some((b) => b.code === 'analysis_hand_required'), '준비 상태가 까닭을 말한다');
  await setAnalysisHand({ submissionId: m.submissionId, adminId: ADMIN, hand: 'L' }, rt);
  eq((await analysisReadiness(m.submissionId, rt)).hand, 'L', '관리자가 손을 정할 수 있다');
  const rev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: m.submissionId } });
  eq(rev.throwingHand, null, '얼린 판은 안 바뀐다');

  gpuState.configured = false;
  await fails(start(m.submissionId), 'analysis_not_configured', '분석 서버 설정이 없으면 못 돌린다');
  gpuState.configured = true;

  if (!analysisConsentReady()) {
    env.INTAKE_ALLOW_DRAFT_ANALYSIS = undefined;
    await fails(start(m.submissionId), 'analysis_doc_draft', '국외 이전 문서가 확정 전이면 막는다');
    env.INTAKE_ALLOW_DRAFT_ANALYSIS = '1';
    await fails(start(m.submissionId, { confirm: false }), 'analysis_confirm_required', '허용 설정이어도 관리자 확인이 있어야 한다');
    ok((await analysisReadiness(m.submissionId, rt)).needsDraftConfirm, '확인이 필요하다고 알린다');
  }
  eq(gpuCalls.length, 0, '막힌 시도는 GPU 를 안 부른다');
  eq(await db.intakeAnalysisRun.count({ where: { submissionId: m.submissionId } }), 0, '막힌 시도는 실행 줄도 안 만든다');

  const w = await makeVerified();
  await withdrawConsent(db, w.scope, { kind: 'overseas' }, new Date(nowMs));
  await fails(start(w.submissionId), 'analysis_consent_missing', '동의를 철회한 접수는 못 돌린다');
  ok((await analysisReadiness(w.submissionId, rt)).blockers.some((b) => b.code === 'analysis_consent_missing'), '철회를 까닭으로 보인다');

  const opt = await makeVerified();
  await withdrawConsent(db, opt.scope, { kind: 'model' }, new Date(nowMs));
  const r = await start(opt.submissionId);
  ok(r.created, '선택 동의를 거둬도 분석은 된다');
  await finishGpu(lastCall());
}

/* ───────────────── 3. 어댑터 · 중복 막기 ───────────────── */
{
  const m = await makeVerified();
  const before = gpuCalls.length;
  const [a, b] = await Promise.all([start(m.submissionId), start(m.submissionId, { adminId: ADMIN2 })]);
  eq(gpuCalls.length - before, 1, '두 관리자가 같이 눌러도 GPU 는 한 번');
  eq(a.run.id, b.run.id, '같은 실행을 돌려준다');
  eq([a.created, b.created].filter(Boolean).length, 1, '새로 만든 쪽은 하나뿐이다');
  eq(await db.intakeAnalysisRun.count({ where: { submissionId: m.submissionId } }), 1, '실행 줄도 하나다');

  const req = lastCall();
  const rev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: m.submissionId } });
  const sideAsset = await db.intakeAsset.findUniqueOrThrow({ where: { id: rev.sideAssetId } });
  const rearAsset = await db.intakeAsset.findUniqueOrThrow({ where: { id: rev.rearAssetId } });
  eq(req.side.url, `${READ}${sideAsset.objectPath}`, '얼린 옆 원본을 넘긴다');
  eq(req.back.url, `${READ}${rearAsset.objectPath}`, '얼린 뒤 원본을 넘긴다');
  eq(req.result.uploadUrl, `${PUT}${runResultPath(m.submissionId, req.jobId)}`, '결과는 접수 버킷의 실행 폴더로 받는다');
  ok(req.previews && req.previews.side.startsWith(`${PUT}${runObjectPrefix(m.submissionId, req.jobId)}/`), '가벼운 영상도 실행 폴더로만 받는다');
  ok(!JSON.stringify(req).includes('pitch-lab'), '실험실 폴더를 쓰지 않는다');
  eq(req.meta, { hand: 'R', slowmoFps: 120, screenRecorded: false, heightCm: null }, '손과 파일에서 읽은 값을 넘긴다');
  eq((await subOf(m.submissionId)).analysisStatus, 'queued', '분석 상태가 대기로 간다');

  const audit = await db.intakeAudit.findFirstOrThrow({ where: { submissionId: m.submissionId, action: 'analysis.requested' } });
  eq(audit.actorId, ADMIN, '누가 걸었는지 남는다');
  ok(!JSON.stringify(audit.detail).includes('http'), '감사 기록에 주소가 없다');

  await fails(
    (async () => {
      gpuState.build = 'build-b';
      try {
        await start(m.submissionId);
      } finally {
        gpuState.build = 'build-a';
      }
    })(),
    'analysis_busy',
    '엔진이 달라도 도는 중이면 또 안 건다',
  );

  /* 처리 중에는 공개할 수 없다 */
  await fails(publish({ runId: req.jobId, adminId: ADMIN }), 'run_not_publishable', '끝나지 않은 실행은 공개 못 한다');

  await finishGpu(req);
  const again = await start(m.submissionId);
  eq([again.created, again.run.id, gpuCalls.length - before], [false, req.jobId, 1], '성공한 같은 입력은 다시 안 돌린다');

  gpuState.build = 'build-b';
  const next = await start(m.submissionId);
  ok(next.created && next.run.id !== req.jobId, '엔진이 바뀌면 재분석할 수 있다');
  await finishGpu(lastCall());
  gpuState.build = 'build-a';

  await setAnalysisHand({ submissionId: m.submissionId, adminId: ADMIN, hand: 'L' }, rt);
  const swapped = await start(m.submissionId);
  ok(swapped.created, '손이 바뀌면 다른 입력이다');
  eq(lastCall().meta.hand, 'L', '정한 손을 넘긴다');
  await finishGpu(lastCall());
}

/* ───────────────── 4. 상태 묻기 ───────────────── */
{
  const m = await makeVerified();
  const { run } = await start(m.submissionId);
  const req = lastCall();
  const callId = `call-${gpuCalls.length}`;

  eq((await pollIntakeRun(run.id, rt)).finished, false, '기다리는 중이면 안 끝난다');
  gpuStatus.set(callId, { kind: 'running', stage: 'pose', stages: { download: 2 } });
  await pollIntakeRun(run.id, rt);
  eq([(await runOf(run.id)).status, (await subOf(m.submissionId)).analysisStatus], ['running', 'running'], '돌기 시작하면 상태가 옮겨 간다');

  gpuStatus.set(callId, { kind: 'done', stages: { fit: 4 } });
  eq((await pollIntakeRun(run.id, rt)).finished, false, '파일이 아직 없으면 끝내지 않는다');

  putResult(req, resultFor(run.id));
  eq(await pollIntakeRun(run.id, rt), { finished: true, status: 'succeeded' }, '결과를 검사하고 끝낸다');
  eq(await pollIntakeRun(run.id, rt), { finished: true, status: 'succeeded' }, '다시 물어도 같다');
  eq(await db.intakeAudit.count({ where: { submissionId: m.submissionId, action: 'analysis.succeeded' } }), 1, '끝은 한 번만 적힌다');
  const row = await runOf(run.id);
  const views = await listRuns(m.submissionId, rt);
  eq([views[0].stages.download, views[0].stages.fit], [2, 4], '단계 시간이 쌓인다');
  ok(views[0].frames === realResult.t.length && views[0].hasResult && views[0].report, '결과 요약과 진단 꼬리표가 남는다');
  ok(row.resultPath === runResultPath(m.submissionId, run.id), '결과 경로가 남는다');
  eq((await loadRunResult(run.id, rt)).jobId, run.id, '관리자는 공개 전 결과를 읽는다');
  /* 공개 전 3D 검토 — 받는 사람이 볼 허용 칸만, 그 접수의 실행만, 연 사실은 감사 기록에 */
  const review = await loadRunReview({ submissionId: m.submissionId, runId: run.id, adminId: 'admin-1' }, rt);
  eq([review.view.joints.length, review.view.hand, review.revisionNumber, review.isCurrentRevision], [realResult.joints.length, realResult.hand, 1, true], '검토는 이 실행의 3D 를 공개 모양으로 준다');
  ok(!('engine' in review.view) && !('quality' in review.view) && !('jobId' in review.view), '검토도 공개 허용 칸만 준다');
  eq(await db.intakeAudit.count({ where: { submissionId: m.submissionId, action: 'run.reviewed' } }), 1, '검토한 사실을 남긴다');
  const other = await makeVerified();
  await fails(loadRunReview({ submissionId: other.submissionId, runId: run.id, adminId: 'admin-1' }, rt), 'run_not_found', '다른 접수의 실행은 안 연다');
  await fails(loadRunReview({ submissionId: m.submissionId, runId: 'not-an-id', adminId: 'admin-1' }, rt), 'run_not_found', '틀린 번호는 안 연다');

  /* 일감으로 도는 길 — 임대 · 재시도 */
  const m2 = await makeVerified();
  const { run: run2 } = await start(m2.submissionId);
  const req2 = lastCall();
  nowMs += 60_000;
  const s1 = await runDueJobs(db, intakeJobHandlers(rt), { owner: 'w1', kinds: ['poll_analysis'], limit: 50, now: () => new Date(nowMs) });
  eq(s1.postponed, 1, '기다리는 동안은 시도 횟수를 안 쓰고 미룬다');
  eq((await db.intakeJob.findFirstOrThrow({ where: { dedupeKey: `poll_analysis:${run2.id}` } })).attempts, 0, '시도 횟수가 그대로다');
  putResult(req2, resultFor(run2.id));
  gpuStatus.set(`call-${gpuCalls.length}`, { kind: 'done' });
  nowMs += 60_000;
  const s2 = await runDueJobs(db, intakeJobHandlers(rt), { owner: 'w2', kinds: ['poll_analysis'], limit: 50, now: () => new Date(nowMs) });
  ok(s2.done >= 1, '일감이 끝난다');
  eq((await runOf(run2.id)).status, 'succeeded', '화면이 없어도 일꾼이 끝낸다');
}

/* ───────────────── 5. 실패 — 원본 · 까닭이 남고 다시 돌릴 수 있다 ───────────────── */
{
  const check = async (label: string, finish: (req: GpuJobRequest, callId: string) => Promise<unknown>, code: V2FailCode) => {
    const m = await makeVerified();
    const paths = await originalsOf(m.submissionId);
    const { run } = await start(m.submissionId);
    await finish(lastCall(), `call-${gpuCalls.length}`);
    const row = await runOf(run.id);
    eq([row.status, row.failureCode, row.dedupeKey], ['failed', code, null], `${label}: 실패로 남고 키를 비운다`);
    eq((await subOf(m.submissionId)).analysisStatus, 'failed', `${label}: 접수 상태도 실패다`);
    ok(paths.every((p) => objects.has(p)), `${label}: 원본이 그대로다`);
    await fails(publish({ runId: run.id, adminId: ADMIN }), 'run_not_publishable', `${label}: 공개할 수 없다`);
    const retry = await start(m.submissionId);
    ok(retry.created && retry.run.id !== run.id, `${label}: 다시 돌릴 수 있다`);
    eq((await db.intakeAnalysisRun.count({ where: { submissionId: m.submissionId } })), 2, `${label}: 실패 기록이 지워지지 않는다`);
    await finishGpu(lastCall());
  };

  await check('모양이 틀린 결과', (req) => finishGpu(req, { ok: true, nonsense: 1 }), 'internal');
  await check('깨진 JSON', (req) => finishGpu(req, '{nope'), 'internal');
  await check('다른 실행의 결과', (req) => finishGpu(req, resultFor('2b0c7c1e-8f7a-4d1e-9a51-0c9d2f3e4a5b')), 'internal');
  await check(
    '영상 탓 실패',
    async (req, callId) => {
      putResult(req, v2Fail(req.jobId, 'pair', 'fit'));
      gpuStatus.set(callId, { kind: 'failed', code: 'pair' });
      await pollIntakeRun(req.jobId, rt);
    },
    'pair',
  );
  await check('GPU 인증 실패', async (req, callId) => {
    gpuStatus.set(callId, { kind: 'failed', code: 'gpu-auth' });
    await pollIntakeRun(req.jobId, rt);
  }, 'gpu-auth');

  /* 까닭이 관리자에게 보인다 */
  const m = await makeVerified();
  const { run } = await start(m.submissionId);
  putResult(lastCall(), v2Fail(run.id, 'framing', 'pose'));
  gpuStatus.set(`call-${gpuCalls.length}`, { kind: 'failed', code: 'framing' });
  await pollIntakeRun(run.id, rt);
  const failure = (await listRuns(m.submissionId, rt))[0].failure!;
  eq([failure.code, failure.stage, failure.videoFault], ['framing', 'pose', true], '실패 까닭 · 단계 · 영상 탓 여부가 보인다');

  /* 걸기 실패 — 던지지 않고 실패한 실행을 돌려준다 */
  const g = await makeVerified();
  gpuState.startError = 'gpu-auth';
  const failed = await start(g.submissionId);
  gpuState.startError = null;
  eq([failed.created, failed.run.status, failed.run.failure?.code], [true, 'failed', 'gpu-auth'], 'GPU 를 못 걸면 실패한 실행을 돌려준다');
  const retried = await start(g.submissionId);
  ok(retried.created, '서버가 돌아오면 다시 걸 수 있다');
  await finishGpu(lastCall());

  /* 서명 주소를 못 만들면 GPU 를 부르지 않는다 */
  const s = await makeVerified();
  fault.resultUrl = true;
  const calls = gpuCalls.length;
  const noUrl = await start(s.submissionId);
  fault.resultUrl = false;
  eq([noUrl.run.failure?.code, gpuCalls.length], ['upload', calls], '주소를 못 만들면 GPU 를 안 부르고 실패로 남긴다');

  /* 걸다 끊김 — 번호 없이 남은 실행은 결과를 기다리는 창이 지나면 닫힌다 */
  const c = await makeVerified();
  const { run: stuck } = await start(c.submissionId);
  await finishGpu(lastCall());
  const rev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: c.submissionId } });
  const orphan = await db.intakeAnalysisRun.create({ data: { submissionId: c.submissionId, revisionId: rev.id, engineKey: 'crashed', dedupeKey: 'crashed-key', requestedAt: new Date(nowMs), status: 'requested' } });
  await db.intakeSubmission.update({ where: { id: c.submissionId }, data: { analysisStatus: 'queued' } });
  eq((await pollIntakeRun(orphan.id, rt)).finished, false, '막 만든 줄은 기다린다');
  nowMs += 4 * 60_000;
  eq((await pollIntakeRun(orphan.id, rt)).finished, false, '창 안에서는 돌고 있을 수 있어 안 닫는다');
  nowMs += START_UNKNOWN_WINDOW_MS;
  eq((await pollIntakeRun(orphan.id, rt)).status, 'failed', '번호 없이 오래 남으면 닫는다');
  ok(stuck.id !== orphan.id && (await subOf(c.submissionId)).analysisStatus === 'failed', '접수가 멈춰 있지 않는다');

  /* 15분 — 대기 중이면 붐빔, 돌던 중이면 시간 초과 */
  const t1 = await makeVerified();
  const { run: q } = await start(t1.submissionId);
  nowMs += 16 * 60_000;
  await pollIntakeRun(q.id, rt);
  eq((await runOf(q.id)).failureCode, 'gpu', '대기만 하다 지나면 서버가 붐빈 것으로 본다');
  const t2 = await makeVerified();
  const { run: q2 } = await start(t2.submissionId);
  gpuStatus.set(`call-${gpuCalls.length}`, { kind: 'running' });
  await pollIntakeRun(q2.id, rt);
  nowMs += 16 * 60_000;
  await pollIntakeRun(q2.id, rt);
  eq((await runOf(q2.id)).failureCode, 'timeout', '돌던 중 지나면 시간 초과다');
}

/* ───────────────── 6. 공개 · 재분석 · 내리기 ───────────────── */
{
  const m = await makeVerified({ name: '공개선수' });
  const first = await start(m.submissionId);
  await fails(loadPublicResult(m.scope, {}, rt), 'result_not_published', '공개 전에는 결과가 안 나간다');
  await finishGpu(lastCall());
  await fails(loadPublicResult(m.scope, {}, rt), 'result_not_published', '성공해도 승인 전에는 안 나간다');
  eq((await loadPublicState(db, m.scope, { now: new Date(nowMs) })).screen, 'admin_review', '돌아온 사람은 검토 중 화면을 본다');

  const p1 = await publish({ runId: first.run.id, adminId: ADMIN, explanation: '  첫 설명\r\n둘째 줄\u0007 ' });
  eq([p1.number, p1.created, p1.replacedRunId], [1, true, null], '첫 공개');
  const r1 = await loadPublicResult(m.scope, {}, rt);
  eq([r1.version, r1.athleteName, r1.explanation, r1.view.t.length], [1, '공개선수', '첫 설명\n둘째 줄', realResult.t.length], '승인된 판이 나간다');
  eq((await subOf(m.submissionId)).publicationStatus, 'published', '공개 상태가 옮겨 간다');
  eq((await loadPublicState(db, m.scope, { now: new Date(nowMs) })).screen, 'published', '돌아온 사람은 결과 화면을 본다');
  eq((await publish({ runId: first.run.id, adminId: ADMIN2, explanation: '첫 설명\n둘째 줄' })).created, false, '같은 공개를 다시 눌러도 판이 안 는다');

  /* 재분석은 공개를 안 바꾼다 */
  gpuState.build = 'build-next';
  const second = await start(m.submissionId);
  await fails(publish({ runId: second.run.id, adminId: ADMIN }), 'run_not_publishable', '돌고 있는 재분석은 공개 못 한다');
  await finishGpu(lastCall(), resultFor(second.run.id, 20));
  gpuState.build = 'build-a';
  const stillOld = await loadPublicResult(m.scope, {}, rt);
  eq([stillOld.version, stillOld.view.t.length], [1, realResult.t.length], '재분석이 끝나도 공개 판은 그대로다');
  const runs = await listRuns(m.submissionId, rt);
  eq([runs.find((x) => x.id === first.run.id)?.published, runs.find((x) => x.id === second.run.id)?.published], [true, false], '어느 실행이 공개 중인지 보인다');

  /* 승인하면 그 실행으로 바뀐다. 옛 줄은 남는다 */
  const p2 = await publish({ runId: second.run.id, adminId: ADMIN2, explanation: '둘째 설명' });
  eq([p2.number, p2.replacedRunId], [2, first.run.id], '다른 실행을 승인하면 새 판이 된다');
  const r2 = await loadPublicResult(m.scope, {}, rt);
  eq([r2.version, r2.explanation, r2.view.t.length], [2, '둘째 설명', 20], '새 판이 나간다');
  const rows = await db.intakePublication.findMany({ where: { submissionId: m.submissionId }, orderBy: { number: 'asc' } });
  eq(rows.map((x) => [x.number, x.activeFor != null, x.unpublishedAt != null]), [[1, false, true], [2, true, false]], '공개 기록이 쌓인다');

  /* 설명만 고쳐도 새 판 — 승인 내용이 말없이 바뀌지 않는다 */
  eq((await publish({ runId: second.run.id, adminId: ADMIN, explanation: '고친 설명' })).number, 3, '설명을 고치면 새 판이다');

  /* 파일이 바뀌면 내보내지 않는다 */
  const path = runResultPath(m.submissionId, second.run.id);
  const held = objects.get(path)!;
  objects.set(path, Buffer.from(JSON.stringify(resultFor(second.run.id, 10))));
  await fails(loadPublicResult(m.scope, {}, rt), 'result_unavailable', '끝난 뒤 바뀐 파일은 안 나간다');
  await fails(publish({ runId: second.run.id, adminId: ADMIN, explanation: '다시' }), 'run_not_publishable', '바뀐 파일은 공개도 못 한다');
  objects.set(path, held);

  /* 내리기 */
  eq(await takedown(m.submissionId), { unpublished: true }, '공개를 내린다');
  await fails(loadPublicResult(m.scope, {}, rt), 'result_not_published', '내리면 바로 안 보인다');
  eq(await takedown(m.submissionId), { unpublished: false }, '다시 내려도 괜찮다');
  eq((await subOf(m.submissionId)).publicationStatus, 'unpublished', '상태도 내려간다');
  eq((await listRuns(m.submissionId, rt)).filter((x) => x.hasResult).length, 2, '실행과 결과는 남는다');
  eq((await publish({ runId: first.run.id, adminId: ADMIN })).number, 4, '내린 뒤 옛 실행도 다시 승인할 수 있다');
  eq((await db.intakeAudit.count({ where: { submissionId: m.submissionId, action: 'publication.unpublished' } })), 1, '내린 기록이 남는다');
}

/* ───────────────── 7. 고침 — 새 판이 공개를 바꾸지 않는다 ───────────────── */
{
  const m = await makeVerified({ name: '옛이름' });
  const old = await start(m.submissionId);
  await finishGpu(lastCall());
  await publish({ runId: old.run.id, adminId: ADMIN, explanation: '옛 판 설명' });

  await requestCorrection(db, { adminId: ADMIN, submissionId: m.submissionId, fields: ['athleteName'], views: ['rear'] }, new Date(nowMs));
  await fails(start(m.submissionId), 'analysis_not_ready', '고침 요청 중에는 못 돌린다');
  eq((await loadPublicResult(m.scope, {}, rt)).athleteName, '옛이름', '고침 중에도 공개 판은 그대로다');

  /* 옛 판에서 돌던 실행은 새 판의 상태를 안 덮는다 */
  const stale = await db.intakeAnalysisRun.create({
    data: { submissionId: m.submissionId, revisionId: old.run.revisionId, engineKey: 'stale', dedupeKey: 'stale-key', status: 'running', gpuCallId: 'call-stale', requestedAt: new Date(nowMs) },
  });

  const state = await loadPublicState(db, m.scope, { now: new Date(nowMs) });
  const saved = await saveDraft(db, m.scope, { expectedVersion: state.version, athleteName: '새이름' }, new Date(nowMs));
  const rear2 = mov240(5000);
  const { asset, version } = await reserveAsset(db, m.scope, { view: 'rear', expectedAssetId: state.assets.rear!.id, fileName: 'new.mov', sizeBytes: rear2.length, sha256: sha(rear2) }, new Date(nowMs));
  ok(version > saved.version, '새 뒤 영상을 고른다');
  await issueUploadToken(db, storage, m.scope, { assetId: asset.id }, new Date(nowMs));
  put(assetObjectPath(m.submissionId, asset.id), rear2);
  await confirmUpload(db, storage, m.scope, { assetId: asset.id }, new Date(nowMs));
  await finalizeSubmission(db, m.scope, { expectedVersion: version, idempotencyKey: randomBytes(16).toString('hex'), samePitchConfirmed: true }, new Date(nowMs));
  await settleJobs();

  const sub = await subOf(m.submissionId);
  eq([sub.status, sub.analysisStatus, sub.publicationStatus], ['verified', 'ready', 'published'], '새 판이 검증돼도 공개는 그대로다');
  ok(sub.currentRevisionId !== old.run.revisionId, '판이 새로 얼었다');
  const kept = await loadPublicResult(m.scope, {}, rt);
  eq([kept.version, kept.athleteName, kept.explanation], [1, '새이름', '옛 판 설명'], '결과 · 설명은 승인한 판 그대로이고, 이름만 지금 판을 따른다');

  gpuStatus.set('call-stale', { kind: 'failed', code: 'internal' });
  await pollIntakeRun(stale.id, rt);
  eq((await subOf(m.submissionId)).analysisStatus, 'ready', '옛 판의 소식이 새 판을 안 덮는다');

  const fresh = await start(m.submissionId);
  eq(fresh.run.revisionNumber, 2, '새 판으로 돌린다');
  await finishGpu(lastCall());
  eq((await loadPublicResult(m.scope, {}, rt)).explanation, '옛 판 설명', '새 판이 끝나도 승인 전에는 그대로다');
  await publish({ runId: fresh.run.id, adminId: ADMIN, explanation: '새 판 설명' });
  eq((await loadPublicResult(m.scope, {}, rt)).explanation, '새 판 설명', '승인하면 새 판이 나간다');
  const flags = await listRuns(m.submissionId, rt);
  eq(flags.find((x) => x.id === old.run.id)?.isCurrentRevision, false, '옛 판 실행을 알아볼 수 있다');
}

/* ───────────────── 8. 공개 경계 — 진짜 요청으로 ───────────────── */
{
  const call = (token: string | null, body?: unknown, address = '198.51.100.7') =>
    handlePublicResultRequest(
      new Request('https://x.test/api/intake/public/result', {
        method: 'POST',
        headers: { 'x-forwarded-for': address, 'content-type': 'application/json', ...(token ? { authorization: `Intake ${token}` } : {}) },
        body: JSON.stringify(body ?? {}),
      }),
      rt,
    );
  const codeOf = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

  const m = await makeVerified({ name: '경계선수' });
  const other = await makeVerified({ name: '남의선수' });
  const { run } = await start(m.submissionId);
  const { run: otherRun } = { run: (await start(other.submissionId)).run };
  /* 둘이 다른 결과를 가진다 */
  await finishGpu(gpuCalls[gpuCalls.length - 2]);
  await finishGpu(lastCall(), resultFor(otherRun.id, 15));
  const NOTE = '내부-메모-새면-안됨';
  await db.intakeAdminNote.create({ data: { submissionId: m.submissionId, adminId: ADMIN, body: NOTE } });
  await db.intakeSubmission.update({ where: { id: m.submissionId }, data: { assigneeAdminId: ADMIN2 } });
  await publish({ runId: run.id, adminId: ADMIN, explanation: '승인된 설명' });

  const res = await call(m.token);
  eq(res.status, 200, '자기 토큰으로 결과를 받는다');
  const cc = res.headers.get('cache-control') ?? '';
  ok(cc.includes('no-store') && (res.headers.get('x-robots-tag') ?? '').includes('noindex') && res.headers.get('referrer-policy') === 'no-referrer', '저장 금지 · 색인 금지 · Referer 없음');
  const text = await res.text();
  const body = JSON.parse(text) as { result: Record<string, unknown> & { view: Record<string, unknown> } };

  eq(Object.keys(body).sort(), ['result'], '응답 맨 위 칸');
  eq(Object.keys(body.result).sort(), ['athleteName', 'explanation', 'resultDate', 'version', 'view'], '결과 칸이 허용 목록과 같다');
  eq(Object.keys(body.result.view).sort(), ['cameras', 'conf', 'contacts', 'events', 'hand', 'joints', 'lowConf', 'metrics', 't'], '보기 칸이 허용 목록과 같다');
  eq(Object.keys((body.result.view.metrics as object[])[0]).sort(), ['key', 'pm', 'trust', 'unit', 'value'], '지표 칸이 허용 목록과 같다');
  eq(Object.keys((body.result.view.cameras as { side: object }).side).sort(), ['R', 't'], '카메라는 방향만 나간다');

  const asset = await db.intakeAsset.findFirstOrThrow({ where: { submissionId: m.submissionId } });
  const rowRun = await runOf(run.id);
  const inv = await db.intakeInvitation.findUniqueOrThrow({ where: { id: m.invitationId } });
  const secrets: [string, string][] = [
    ['내부 메모', NOTE],
    ['보내는 사람', '보호자-내부-표시'],
    ['원본 파일 이름', '비공개-원본'],
    ['원본 경로', asset.objectPath],
    ['경로 앞머리', 'sub/'],
    ['결과 경로', rowRun.resultPath!],
    ['서명 주소', READ],
    ['올리기 주소', PUT],
    ['접수 번호', m.submissionId],
    ['실행 번호', run.id],
    ['GPU 번호', rowRun.gpuCallId!],
    ['엔진', rowRun.engineKey],
    ['엔진 지문', BUILD_MARK],
    ['모델', POSE_MARK],
    ['AI 값', 'sam-internal-mark'],
    ['관리자', ADMIN],
    ['담당자', ADMIN2],
    ['토큰', m.token],
    ['토큰 해시', inv.tokenHash],
    ['해시', asset.clientSha256],
    ['남의 이름', '남의선수'],
    ['남의 접수', other.submissionId],
    ['품질', 'reprojPct'],
    ['경고', 'warnings'],
    ['뼈 길이', 'boneLen'],
    ['작업 번호 칸', 'jobId'],
  ];
  for (const [label, s] of secrets) ok(!text.includes(s), `공개 응답에 없다: ${label}`);

  /* 다른 접수의 토큰은 자기 것만 본다 */
  eq(await codeOf(await call(other.token)), 'result_not_published', '남의 접수의 공개 판을 못 본다');
  const otherScope = await openIntakeScope(db, `Intake ${other.token}`, 'view_result', new Date(nowMs));
  await fails(loadPublicResult({ ...otherScope, submissionId: m.submissionId }, {}, rt), 'submission_not_found', '범위를 섞어도 남의 접수를 못 읽는다');

  /* 토큰 없음 · 틀림 — 같은 답이고 횟수를 센다 */
  const noToken = await call(null, {}, '203.0.113.1');
  eq([noToken.status, await codeOf(noToken)], [404, 'invitation_invalid'], '토큰이 없으면 없는 것과 같다');
  const wrong = await call('A'.repeat(43), {}, '203.0.113.1');
  eq([wrong.status, await codeOf(wrong)], [404, 'invitation_invalid'], '틀린 토큰도 같은 답이다');
  let limited = 0;
  for (let i = 0; i < 25; i++) if ((await call('B'.repeat(43), {}, '203.0.113.9')).status === 429) limited++;
  ok(limited > 0, '틀린 토큰을 두드리면 막힌다');

  /* 올리기 기간이 끝나도 결과는 보인다 */
  await db.intakeInvitation.update({ where: { id: m.invitationId }, data: { uploadExpiresAt: new Date(nowMs - 1000) } });
  eq((await call(m.token)).status, 200, '올리기 기간과 결과 보기는 따로다');

  /* 결과 기간 */
  await db.intakeInvitation.update({ where: { id: m.invitationId }, data: { resultExpiresAt: new Date(nowMs - 1000) } });
  const expired = await call(m.token);
  eq([expired.status, await codeOf(expired)], [403, 'result_expired'], '결과 기간이 끝나면 막힌다');
  await db.intakeInvitation.update({ where: { id: m.invitationId }, data: { resultExpiresAt: null } });

  /* 폐기 */
  await db.intakeInvitation.update({ where: { id: m.invitationId }, data: { status: 'revoked', revokedAt: new Date(nowMs) } });
  const revoked = await call(m.token);
  eq([revoked.status, await codeOf(revoked)], [403, 'invitation_revoked'], '폐기하면 막힌다');
  await fails(publish({ runId: run.id, adminId: ADMIN, explanation: '다른 설명' }), 'invitation_revoked', '폐기된 초대에는 새로 공개 못 한다');
  await db.intakeInvitation.update({ where: { id: m.invitationId }, data: { status: 'active', revokedAt: null } });

  /* 철회 */
  await withdrawConsent(db, m.scope, { kind: 'submission' }, new Date(nowMs));
  const gone = await call(m.token);
  eq([gone.status, await codeOf(gone)], [403, 'result_unavailable'], '필수 동의를 거두면 공개 판도 안 나간다');
  await fails(publish({ runId: run.id, adminId: ADMIN, explanation: '또 다른 설명' }), 'result_unavailable', '철회된 접수는 공개 못 한다');

  /* 접근 코드 */
  const c = await makeVerified({ accessCode: 'bullpen-7' });
  const { run: cRun } = await start(c.submissionId);
  await finishGpu(lastCall());
  await publish({ runId: cRun.id, adminId: ADMIN });
  eq((await loadPublicState(db, c.scope, { now: new Date(nowMs) })).screen, 'access_code', '코드가 걸리면 코드 화면부터다');
  const need = await call(c.token);
  const needText = await need.text();
  eq([need.status, (JSON.parse(needText) as { error: { code: string } }).error.code], [401, 'access_code_required'], '코드 없이는 못 본다');
  ok(!needText.includes('joints') && !needText.includes('athleteName'), '코드 없는 응답에는 결과가 없다');
  eq(await codeOf(await call(c.token, { accessCode: 'wrong-code' })), 'access_code_wrong', '틀린 코드는 막힌다');
  const invOf = () => db.intakeInvitation.findUniqueOrThrow({ where: { id: c.invitationId } });
  const wrongAudit = () => db.intakeAudit.count({ where: { invitationId: c.invitationId, action: 'access_code.wrong' } });
  eq([(await invOf()).accessCodeFailures, await wrongAudit()], [1, 1], '라우트로 온 틀린 시도를 쌓고 감사 기록을 남긴다');
  /* 맞는 코드는 몇 번을 내도 창을 안 쓴다 — 페이지를 열 때마다 코드를 다시 내는 사람이 스스로 막히지 않게 */
  for (let i = 0; i < 12; i++) eq((await call(c.token, { accessCode: 'bullpen-7' })).status, 200, '맞는 코드로 본다');
  eq((await invOf()).accessCodeFailures, 1, '맞는 코드는 안 센다');
  let last: Response | null = null;
  for (let i = 0; i < 8; i++) last = await call(c.token, { accessCode: `wrong-${i}` });
  eq(last!.status, 429, '코드를 계속 틀리면 막힌다');
  ok(Number(last!.headers.get('retry-after')) > 0, '언제 다시 할지 알려 준다');
  eq((await invOf()).accessCodeFailures, 8, '창 한도를 넘은 시도는 코드를 안 맞춰 본다');
  eq((await call(c.token, { accessCode: 'bullpen-7' })).status, 429, '막힌 동안은 맞는 코드도 기다린다');
  nowMs += 16 * 60_000;
  eq((await call(c.token, { accessCode: 'bullpen-7' })).status, 200, '시간이 지나면 풀린다');
  /* 창이 바뀌어도 누적은 이어진다 — 짧은 코드를 날마다 조금씩 맞혀 보지 못하게 */
  eq(await codeOf(await call(c.token, { accessCode: 'wrong-a' })), 'access_code_wrong', '다음 창의 틀린 시도');
  eq(await codeOf(await call(c.token, { accessCode: 'wrong-b' })), 'access_code_locked', '누적 한도에서 잠근다');
  ok((await invOf()).accessCodeLockedAt != null, '라우트로 잠긴다');
  eq(await db.intakeAudit.count({ where: { invitationId: c.invitationId, action: 'access_code.locked' } }), 1, '잠근 일을 남긴다');
  nowMs += 16 * 60_000;
  eq(await codeOf(await call(c.token, { accessCode: 'bullpen-7' })), 'access_code_locked', '시간이 지나도 맞는 코드도 막힌다');
  ok((await loadPublicState(db, c.scope, { now: new Date(nowMs) })).accessCodeLocked, '화면이 잠긴 줄 안다');
  ok((await resetAccessCodeLock(db, { adminId: ADMIN, submissionId: c.submissionId }, new Date(nowMs))).reset, '관리자가 푼다');
  eq((await call(c.token, { accessCode: 'bullpen-7' })).status, 200, '풀리면 다시 본다');

  /* 라우트는 POST 만 내보낸다 — 링크 미리보기의 GET 은 아무 일도 안 한다 */
  const route = readFileSync('app/api/intake/public/result/route.ts', 'utf8');
  ok(/export function POST/.test(route) && !/export (async )?function GET/.test(route), '결과 라우트에 GET 이 없다');
}

/* ───────────────── 9. 공개 칸만으로 같은 3D 가 그려진다 ───────────────── */
{
  const r = resultFor('2b0c7c1e-8f7a-4d1e-9a51-0c9d2f3e4a5b');
  const plain: Pitch3dV2Ok = { ...r, experimental: undefined };
  const view = JSON.parse(JSON.stringify(toPublicView(plain)));
  const shim = body3dResultOf(view);
  const opts = { ground: 'mound', heightM: 1.83 } as const;
  eq(JSON.stringify(displayTrack(shim, opts).frames), JSON.stringify(displayTrack(plain, opts).frames), '공개 칸으로 만든 자세가 원 결과와 글자까지 같다');
  ok(displayTrack(shim, opts).frames.length === realResult.t.length, '장면 수가 같다');
  eq(readPitch3dV2Result({ ...shim, jobId: r.jobId, quality: r.quality })?.ok, true, '채운 칸이 결과 모양을 안 깬다');
}

/* ───────────────── 10. 크론 · 정리 ───────────────── */
{
  ok(!cronAuthorized('Bearer x', undefined) && !cronAuthorized(null, 's') && !cronAuthorized('Bearer no', 's') && cronAuthorized('Bearer s', 's'), '크론 머리를 본다');
  const unauth = await handleCronRequest(new Request('https://x.test/api/cron/intake'), 'secret', rt);
  eq(unauth.status, 401, '비밀이 없으면 안 돈다');
  const noSecret = await handleCronRequest(new Request('https://x.test/api/cron/intake', { headers: { authorization: 'Bearer ' } }), undefined, rt);
  eq(noSecret.status, 401, '서버에 비밀이 없으면 늘 막는다');
  const calls = gpuCalls.length;
  const authed = await handleCronRequest(new Request('https://x.test/api/cron/intake', { headers: { authorization: 'Bearer secret' } }), 'secret', rt);
  eq(authed.status, 200, '비밀이 맞으면 돈다');
  eq(gpuCalls.length, calls, '크론이 GPU 를 안 건다');

  /* 일감이 멈춘 실행을 되살린다 */
  const m = await makeVerified();
  const { run } = await start(m.submissionId);
  await db.intakeJob.updateMany({ where: { dedupeKey: `poll_analysis:${run.id}` }, data: { status: 'failed', attempts: 8, lastError: 'x' } });
  putResult(lastCall(), resultFor(run.id));
  gpuStatus.set(`call-${gpuCalls.length}`, { kind: 'done' });
  nowMs += 60_000;
  const s = await runIntakeCron(rt, { owner: 'cron-2' });
  ok(s.repaired >= 1, '멈춘 일감을 다시 건다');
  eq((await runOf(run.id)).status, 'succeeded', '다시 건 일감이 끝낸다');

  /* 일감 줄이 없어져도 */
  const m2 = await makeVerified();
  const { run: r2 } = await start(m2.submissionId);
  await db.intakeJob.deleteMany({ where: { dedupeKey: `poll_analysis:${r2.id}` } });
  putResult(lastCall(), resultFor(r2.id));
  gpuStatus.set(`call-${gpuCalls.length}`, { kind: 'done' });
  nowMs += 60_000;
  await runIntakeCron(rt, { owner: 'cron-3' });
  eq((await runOf(r2.id)).status, 'succeeded', '없어진 일감도 다시 넣는다');

  /* 정리 일감은 15분 칸마다 하나 */
  const before = await db.intakeJob.count({ where: { kind: 'cleanup_uploads' } });
  await runIntakeCron(rt, { owner: 'cron-4' });
  eq(await db.intakeJob.count({ where: { kind: 'cleanup_uploads' } }), before, '같은 칸에서는 정리를 또 안 넣는다');
  nowMs += 16 * 60_000;
  await runIntakeCron(rt, { owner: 'cron-5' });
  eq(await db.intakeJob.count({ where: { kind: 'cleanup_uploads' } }), before + 1, '다음 칸에는 넣는다');

  /* 끝난 전송을 잇는다 — 화면이 확인 전에 닫힌 경우 */
  const inv = await createInvitation(db, { adminId: ADMIN }, new Date(nowMs));
  const scope = await openIntakeScope(db, `Intake ${inv.token}`, 'read', new Date(nowMs));
  await saveDraft(db, scope, { expectedVersion: 0, athleteName: '이어받기', athleteAgeBand: '14_or_over' }, new Date(nowMs));
  await recordConsents(db, scope, { answers: consents() }, new Date(nowMs));
  const file = mov120(2048);
  const { asset } = await reserveAsset(db, scope, { view: 'side', expectedAssetId: null, fileName: 'a.mov', sizeBytes: file.length, sha256: sha(file) }, new Date(nowMs));
  /*
   * 대사 처리기는 이 프로세스의 시계로 '10분 지난 토큰'을 찾는다(reconcileUploads 의 기본값). 그 시계는 시험 시계에서 출발하지만(intake-test-clock.mts)
   * nowMs 는 앞에서 앞당겨 놓아 그보다 뒤다. 그래서 토큰은 프로세스 시계로 10분 전에 낸다. 날짜와 상관없이 초대 기간(nowMs 부터 14일) 안이다.
   */
  await issueUploadToken(db, storage, scope, { assetId: asset.id }, new Date(Date.now() - 10 * 60_000));
  put(assetObjectPath(scope.submissionId, asset.id), file);
  await enqueueJob(db, { kind: 'cleanup_uploads', dedupeKey: 'cleanup_uploads:manual', payload: {}, runAfter: new Date(nowMs) });
  await runDueJobs(db, intakeJobHandlers(rt), { owner: 'cron-6', kinds: ['cleanup_uploads'], now: () => new Date(nowMs) });
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: asset.id } })).status, 'uploaded', '끝난 전송을 저장소에서 찾아 잇는다');

  /* 파일 검증 — 저장소 탓은 다시, 파일 탓은 막는다 */
  const realHash = storage.hash;
  let failures = 2;
  storage.hash = async (p) => {
    if (failures-- > 0) throw new IntakeError('storage_unavailable', { cause: 'hash_read' });
    return realHash(p);
  };
  const jobNow = () => new Date(Date.now() + 86_400_000 * 2);
  const s1 = await runDueJobs(db, intakeJobHandlers(rt), { owner: 'v1', kinds: ['verify_asset'], now: jobNow });
  eq(s1.retried, 1, '저장소가 안 되면 다시 하려고 미룬다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: asset.id } })).status, 'verifying', '실패로 안 굳는다');
  await runDueJobs(db, intakeJobHandlers(rt), { owner: 'v2', kinds: ['verify_asset'], now: () => new Date(Date.now() + 86_400_000 * 3) });
  await runDueJobs(db, intakeJobHandlers(rt), { owner: 'v3', kinds: ['verify_asset'], now: () => new Date(Date.now() + 86_400_000 * 4) });
  const verified = await db.intakeAsset.findUniqueOrThrow({ where: { id: asset.id } });
  eq([verified.status, verified.serverSha256], ['verified', sha(file)], '다시 재서 맞으면 검증된다');
  storage.hash = realHash;

  /* 어떤 정리도 접수된 원본 · 진행 중 전송을 안 지운다 */
  const c = await makeVerified();
  const frozen = await originalsOf(c.submissionId);
  const { run: failedRun } = await start(c.submissionId);
  gpuStatus.set(`call-${gpuCalls.length}`, { kind: 'failed', code: 'internal' });
  await pollIntakeRun(failedRun.id, rt);
  await requestCorrection(db, { adminId: ADMIN, submissionId: c.submissionId, views: ['side'] }, new Date(nowMs));
  const st = await loadPublicState(db, c.scope, { now: new Date(nowMs) });
  const newer = mov120(3000);
  const { asset: newAsset, version } = await reserveAsset(db, c.scope, { view: 'side', expectedAssetId: st.assets.side!.id, fileName: 'b.mov', sizeBytes: newer.length, sha256: sha(newer) }, new Date(nowMs));
  await issueUploadToken(db, storage, c.scope, { assetId: newAsset.id }, new Date(nowMs));
  put(assetObjectPath(c.submissionId, newAsset.id), newer);
  /* 또 바꿔서 앞 새 파일은 어떤 판에도 안 묶인 '바뀜'이 된다 */
  const newest = mov120(3200);
  const { asset: finalAsset } = await reserveAsset(db, c.scope, { view: 'side', expectedAssetId: newAsset.id, fileName: 'c.mov', sizeBytes: newest.length, sha256: sha(newest) }, new Date(nowMs));
  await issueUploadToken(db, storage, c.scope, { assetId: finalAsset.id }, new Date(nowMs));
  ok(version > 0, '고침 칸을 두 번 바꾼다');

  /* 정리 시각은 시험 시계로 센다 — 초대 기간을 nowMs 에서 셌다. 실제 시계로 정리하면 날짜가 지나며 기간이 끝난 것처럼 된다 */
  const soon = await cleanupStaleUploads(db, storage, new Date(nowMs + 60_000));
  eq(soon.purged, 0, '막 바뀐 전송은 아직 안 지운다');
  ok(objects.has(assetObjectPath(c.submissionId, newAsset.id)), '진행 중일 수 있는 파일이 남는다');

  const later = new Date(nowMs + TUS_URL_TTL_MS + 4 * 3_600_000);
  const swept = await cleanupStaleUploads(db, storage, later);
  ok(swept.purged >= 1, '어디서도 안 쓰는 전송은 지운다');
  ok(!objects.has(assetObjectPath(c.submissionId, newAsset.id)), '바뀐 전송 파일이 사라진다');
  ok(frozen.every((p) => objects.has(p)), '얼린 판의 원본은 실패 · 고침 뒤에도 그대로다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: finalAsset.id } })).status, 'uploading', '칸이 가리키는 전송은 안 건드린다');
}

/* ───────────────── 11. 폐기 · 철회 — 새로 보내지 않고, 돌던 실행은 공개되지 않는다 ───────────────── */
{
  /* 폐기 — 원본을 국외 분석 서버로 새로 보내지 않는다 */
  const rv = await makeVerified();
  await db.intakeInvitation.update({ where: { id: rv.invitationId }, data: { status: 'revoked', revokedAt: new Date(nowMs) } });
  const calls = gpuCalls.length;
  await fails(start(rv.submissionId), 'invitation_revoked', '폐기된 초대는 새 분석을 못 건다');
  const blocked = await analysisReadiness(rv.submissionId, rt);
  ok(!blocked.runnable && blocked.blockers.some((b) => b.code === 'invitation_revoked' && b.text.includes('폐기')), '준비 상태가 폐기를 까닭으로 말한다');
  eq([gpuCalls.length, await db.intakeAnalysisRun.count({ where: { submissionId: rv.submissionId } })], [calls, 0], '폐기되면 GPU 도 실행 줄도 없다');

  /* 철회 때 이미 돌던 실행 — 멈출 수 없어서 결과를 안 읽고 닫는다. 담당자가 받은 철회를 남기는 길로 */
  const w = await makeVerified();
  const { run } = await start(w.submissionId);
  const req = lastCall();
  eq(await adminWithdrawConsent(db, ACTOR, { submissionId: w.submissionId, note: '본인 요청' }, new Date(nowMs)), { withdrawn: true, unpublished: false }, '담당자가 철회를 남긴다');
  putResult(req, resultFor(run.id));
  gpuStatus.set(`call-${gpuCalls.length}`, { kind: 'done' });
  eq(await pollIntakeRun(run.id, rt), { finished: true, status: 'failed' }, '철회 뒤 끝난 실행은 성공으로 안 받는다');
  const closed = await runOf(run.id);
  eq([closed.failureCode, closed.resultPath], ['withdrawn', null], '결과를 읽지 않고 닫는다');
  eq((await listRuns(w.submissionId, rt))[0].failure?.text.includes('철회'), true, '관리자는 까닭을 본다');
  await fails(publish({ runId: run.id, adminId: ADMIN }), 'run_not_publishable', '철회 전에 돌던 실행은 공개 못 한다');
  await fails(start(w.submissionId), 'analysis_consent_missing', '철회 뒤 다시 못 건다');
  ok(objects.has(runResultPath(w.submissionId, run.id)), '뒤늦게 온 결과 파일은 지우지 않고 그대로 둔다(분석 결과 보유 기간은 안 정했다)');

  /* 철회 전에 끝난 실행의 결과도 닫힌다 */
  const w2 = await makeVerified();
  const { run: done } = await start(w2.submissionId);
  await finishGpu(lastCall());
  eq((await loadRunResult(done.id, rt)).jobId, done.id, '철회 전에는 읽힌다');
  await publish({ runId: done.id, adminId: ADMIN, explanation: '철회 전 공개' });
  eq((await loadPublicResult(w2.scope, {}, rt)).explanation, '철회 전 공개', '철회 전에는 공개돼 있다');
  eq(await adminWithdrawConsent(db, ACTOR, { submissionId: w2.submissionId }, new Date(nowMs)), { withdrawn: true, unpublished: true }, '철회가 공개를 닫는다');
  await fails(loadPublicResult(w2.scope, {}, rt), 'result_unavailable', '철회 뒤 공개 경계가 막는다');
  await fails(loadRunResult(done.id, rt), 'original_locked', '철회 뒤에는 관리자도 결과를 안 연다');
  await fails(publish({ runId: done.id, adminId: ADMIN }), 'result_unavailable', '철회 뒤에는 끝난 실행도 공개 못 한다');

  /* 주소를 만드는 사이에 철회 · 폐기 — GPU 로 보내기 바로 앞에서 다시 본다 */
  for (const [label, code, cut] of [
    ['철회', 'withdrawn', (m: Made) => withdrawConsent(db, m.scope, { kind: 'submission' }, new Date(nowMs)).then(() => undefined)],
    ['폐기', 'revoked', (m: Made) => db.intakeInvitation.update({ where: { id: m.invitationId }, data: { status: 'revoked', revokedAt: new Date(nowMs) } }).then(() => undefined)],
  ] as const) {
    const m = await makeVerified();
    const before = gpuCalls.length;
    let once = true;
    fault.onSign = async () => {
      if (!once) return;
      once = false;
      await cut(m);
    };
    const r = await start(m.submissionId);
    fault.onSign = null;
    eq([r.run.status, r.run.failure?.code, gpuCalls.length], ['failed', code, before], `${label}: 도중에 막히면 GPU 로 안 보낸다`);
  }
}

/* ───────────────── 12. 낡은 화면 — 공개를 말없이 바꾸지 못한다 ───────────────── */
{
  const m = await makeVerified();
  const first = await start(m.submissionId);
  await finishGpu(lastCall());
  gpuState.build = 'build-c';
  const second = await start(m.submissionId);
  await finishGpu(lastCall());
  gpuState.build = 'build-a';

  /* A 는 공개가 없는 화면을 열어 두었고 그사이 B 가 공개했다 */
  const pubB = await publishRun({ runId: second.run.id, adminId: ADMIN2, explanation: 'B 설명', expectedActivePublicationId: null }, rt);
  await assert.rejects(publishRun({ runId: first.run.id, adminId: ADMIN, explanation: 'A 설명', expectedActivePublicationId: null }, rt), (e: unknown) => {
    assert.ok(e instanceof IntakeError);
    eq([e.code, e.httpStatus, e.detail?.currentPublicationId], ['stale_publication', 409, pubB.publicationId], '낡은 화면의 공개는 막히고 지금 공개를 알려 준다');
    ok(e.message.includes('최신'), '무엇을 하면 되는지 말한다');
    return true;
  });
  eq((await loadPublicResult(m.scope, {}, rt)).explanation, 'B 설명', 'B 의 공개가 그대로다');
  eq((await publishRun({ runId: second.run.id, adminId: ADMIN2, explanation: 'B 설명', expectedActivePublicationId: null }, rt)).created, false, '같은 공개를 다시 눌렀을 뿐이면 낡은 값이어도 그대로 돌려준다');

  /* 옛 판을 보고 내리기 */
  const pub2 = await publishRun({ runId: second.run.id, adminId: ADMIN2, explanation: 'B 새 설명', expectedActivePublicationId: pubB.publicationId }, rt);
  await fails(unpublish({ submissionId: m.submissionId, adminId: ADMIN, expectedActivePublicationId: pubB.publicationId }, rt), 'stale_publication', '옛 판을 보고 내리면 새 판이 안 내려간다');
  await fails(unpublish({ submissionId: m.submissionId, adminId: ADMIN, expectedActivePublicationId: null }, rt), 'stale_publication', '공개가 없는 화면도 못 내린다');
  eq((await subOf(m.submissionId)).publicationStatus, 'published', '공개가 그대로다');
  eq(await unpublish({ submissionId: m.submissionId, adminId: ADMIN, expectedActivePublicationId: pub2.publicationId }, rt), { unpublished: true }, '맞는 값이면 내린다');
  eq(await unpublish({ submissionId: m.submissionId, adminId: ADMIN, expectedActivePublicationId: pub2.publicationId }, rt), { unpublished: false }, '이미 내려갔으면 이미 된 일이다');

  /* 옛 화면 코드가 값을 안 보내면 맞춰 볼 수 없어 받지 않는다 */
  await fails(publishRun({ runId: first.run.id, adminId: ADMIN } as never, rt), 'invalid_input', '알던 공개가 없는 요청은 안 받는다');
  await fails(unpublish({ submissionId: m.submissionId, adminId: ADMIN } as never, rt), 'invalid_input', '내리기도 같다');
  await fails(publishRun({ runId: first.run.id, submissionId: (await makeVerified()).submissionId, adminId: ADMIN, expectedActivePublicationId: null }, rt), 'run_not_found', '다른 접수의 화면에서는 이 실행이 없는 것');

  /* 고침으로 영상이 바뀌면 앞 실행은 일부러 넘겨야만 공개된다 */
  const c = await makeVerified({ name: '옛판' });
  const old = await start(c.submissionId);
  await finishGpu(lastCall());
  await requestCorrection(db, { adminId: ADMIN, submissionId: c.submissionId, views: ['rear'] }, new Date(nowMs));
  const st = await loadPublicState(db, c.scope, { now: new Date(nowMs) });
  const rear2 = mov240(5000);
  const { asset, version } = await reserveAsset(db, c.scope, { view: 'rear', expectedAssetId: st.assets.rear!.id, fileName: 'new.mov', sizeBytes: rear2.length, sha256: sha(rear2) }, new Date(nowMs));
  await issueUploadToken(db, storage, c.scope, { assetId: asset.id }, new Date(nowMs));
  put(assetObjectPath(c.submissionId, asset.id), rear2);
  await confirmUpload(db, storage, c.scope, { assetId: asset.id }, new Date(nowMs));
  await finalizeSubmission(db, c.scope, { expectedVersion: version, idempotencyKey: randomBytes(16).toString('hex'), samePitchConfirmed: true }, new Date(nowMs));
  await settleJobs();
  await fails(publish({ runId: old.run.id, adminId: ADMIN }), 'run_not_current', '낡은 화면이 대체된 영상의 결과를 공개하지 못한다');
  eq((await listRuns(c.submissionId, rt))[0].isCurrentRevision, false, '화면도 옛 영상의 실행으로 본다');
  const forced = await publish({ runId: old.run.id, adminId: ADMIN, allowOlderRevision: true });
  eq(forced.created, true, '일부러 넘기면 옛 판도 공개된다');
  const trail = await db.intakeAudit.findFirstOrThrow({ where: { submissionId: c.submissionId, action: 'publication.published' } });
  eq((trail.detail as { olderRevision?: boolean }).olderRevision, true, '옛 판 공개는 기록에 남는다');
}

/* ───────────────── 13. 엔진 판을 모르면 새로 안 돈다 ───────────────── */
{
  const m = await makeVerified();
  gpuState.build = null;
  const calls = gpuCalls.length;
  await fails(start(m.submissionId), 'analysis_engine_unknown', '판을 못 읽으면 막는다');
  eq([gpuCalls.length, await db.intakeAnalysisRun.count({ where: { submissionId: m.submissionId } })], [calls, 0], '실행 줄도 GPU 도 없다');
  gpuState.build = 'build-a';
  const { run } = await start(m.submissionId);
  await finishGpu(lastCall());
  gpuState.build = null;
  await fails(start(m.submissionId), 'analysis_engine_unknown', '성공한 뒤에 시간 초과가 나도 다른 키로 또 안 돈다');
  gpuState.build = 'build-a';
  const again = await start(m.submissionId);
  eq([again.created, again.run.id, gpuCalls.length], [false, run.id, calls + 1], '돌아오면 같은 실행을 돌려주고 GPU 는 한 번뿐이다');
}

/* ───────────────── 14. 글만 고친 새 판 — 같은 원본은 다시 안 돌린다 ───────────────── */
{
  const fixName = async (m: Made, name: string) => {
    await requestCorrection(db, { adminId: ADMIN, submissionId: m.submissionId, fields: ['athleteName'] }, new Date(nowMs));
    const state = await loadPublicState(db, m.scope, { now: new Date(nowMs) });
    const saved = await saveDraft(db, m.scope, { expectedVersion: state.version, athleteName: name }, new Date(nowMs));
    await finalizeSubmission(db, m.scope, { expectedVersion: saved.version, idempotencyKey: randomBytes(16).toString('hex') }, new Date(nowMs));
    await settleJobs();
    return db.intakeRevision.findFirstOrThrow({ where: { submissionId: m.submissionId }, orderBy: { number: 'desc' } });
  };

  const m = await makeVerified({ name: '오타이름' });
  const { run } = await start(m.submissionId);
  await finishGpu(lastCall());
  await publish({ runId: run.id, adminId: ADMIN, explanation: '승인' });
  const calls = gpuCalls.length;
  const rev2 = await fixName(m, '바른이름');
  eq(rev2.number, 2, '이름만 고쳐도 새 판이다');
  eq((await loadPublicResult(m.scope, {}, rt)).athleteName, '바른이름', '재공개 없이 공개 이름이 바로잡힌다');
  eq((await subOf(m.submissionId)).analysisStatus, 'succeeded', '등록 일감이 같은 입력의 분석 상태를 잇는다');
  eq(await carryAnalysisForward(rt, rev2.id), null, '또 불러도 괜찮다');
  const again = await start(m.submissionId);
  eq([again.created, again.run.id, gpuCalls.length], [false, run.id, calls], '같은 바이트 · 손 · 엔진은 GPU 를 안 부른다');
  eq((await listRuns(m.submissionId, rt))[0].isCurrentRevision, true, '앞 판의 실행이 지금 판의 실행으로 보인다');

  /* 등록 일감이 잇기 전에 관리자가 눌러도 같다 */
  const n = await makeVerified({ name: '둘째' });
  const { run: nRun } = await start(n.submissionId);
  await finishGpu(lastCall());
  const nCalls = gpuCalls.length;
  await fixName(n, '둘째고침');
  eq((await subOf(n.submissionId)).analysisStatus === 'ready' || (await subOf(n.submissionId)).analysisStatus === 'succeeded', true, '새 판이 검증됐다');
  eq((await start(n.submissionId)).created, false, '누르면 있던 실행을 돌려준다');
  eq([(await subOf(n.submissionId)).analysisStatus, gpuCalls.length], ['succeeded', nCalls], 'GPU 없이 이어 받는다');
  eq((await publish({ runId: nRun.id, adminId: ADMIN })).created, true, '앞 판의 실행을 그대로 공개한다');

  /* 돌고 있는 동안 글만 고쳐도 하나만 돈다 */
  const p = await makeVerified({ name: '셋째' });
  const { run: pRun } = await start(p.submissionId);
  const pReq = lastCall();
  gpuStatus.set(`call-${gpuCalls.length}`, { kind: 'running' });
  await pollIntakeRun(pRun.id, rt);
  const pCalls = gpuCalls.length;
  const rev = await fixName(p, '셋째고침');
  await carryAnalysisForward(rt, rev.id);
  eq((await subOf(p.submissionId)).analysisStatus, 'running', '돌던 상태를 잇는다');
  gpuState.build = 'build-d';
  await fails(start(p.submissionId), 'analysis_busy', '엔진이 달라도 같은 두 원본이면 또 안 건다');
  gpuState.build = 'build-a';
  eq(gpuCalls.length, pCalls, 'GPU 는 한 번뿐이다');
  await finishGpu(pReq);
  eq((await subOf(p.submissionId)).analysisStatus, 'succeeded', '앞 판의 실행이 끝나면 지금 판의 상태가 끝난다');

  /* 손이 다르면 다른 입력이다 — 같은 두 원본이어도 돌릴 수 있다 */
  await setAnalysisHand({ submissionId: p.submissionId, adminId: ADMIN, hand: 'L' }, rt);
  ok((await start(p.submissionId)).created, '손이 다르면 새로 돈다');
  await finishGpu(lastCall());
}

/* ───────────────── 15. 걸기 답을 잃어도 다시 돌리지 않는다 ───────────────── */
{
  for (const mode of ['throw', 'error'] as const) {
    const m = await makeVerified();
    gpuState.lostResponse = mode;
    const first = await start(m.submissionId);
    gpuState.lostResponse = null;
    const req = lastCall();
    const row = await runOf(first.run.id);
    ok(row.status === 'requested' && row.dedupeKey != null && row.gpuCallId == null, `${mode}: 실패로 닫지 않고 키를 쥔다`);
    eq((await subOf(m.submissionId)).analysisStatus, 'queued', `${mode}: 접수는 대기 중이다`);
    ok(first.run.startUnknown && (await listRuns(m.submissionId, rt))[0].startUnknown, `${mode}: 화면이 답을 못 받았음을 안다`);

    const calls = gpuCalls.length;
    const retry = await start(m.submissionId);
    eq([retry.created, retry.run.id, gpuCalls.length], [false, first.run.id, calls], `${mode}: 창 안에서는 다시 안 건다`);
    gpuState.build = 'build-z';
    await fails(start(m.submissionId), 'analysis_busy', `${mode}: 엔진이 바뀌어도 안 건다`);
    gpuState.build = 'build-a';
    eq((await pollIntakeRun(first.run.id, rt)).finished, false, `${mode}: 결과가 없으면 기다린다`);

    /* 서버는 돌고 있었다 — 결과 파일이 나타나면 그 실행을 성공으로 받는다 */
    putResult(req, resultFor(first.run.id));
    eq(await pollIntakeRun(first.run.id, rt), { finished: true, status: 'succeeded' }, `${mode}: 번호 없이도 결과를 받는다`);
    eq((await subOf(m.submissionId)).analysisStatus, 'succeeded', `${mode}: 접수도 끝난다`);
    ok((await readPublishable(first.run.id)) === true, `${mode}: 공개할 수 있다`);
  }

  /* 실패 결과가 놓여도 그 까닭을 받는다 */
  const f = await makeVerified();
  gpuState.lostResponse = 'throw';
  const failedStart = await start(f.submissionId);
  gpuState.lostResponse = null;
  putResult(lastCall(), v2Fail(failedStart.run.id, 'framing', 'pose'));
  await pollIntakeRun(failedStart.run.id, rt);
  eq((await runOf(failedStart.run.id)).failureCode, 'framing', '번호 없이도 실패 까닭을 받는다');

  /* 다른 실행의 파일이면 받지 않는다 */
  const x = await makeVerified();
  gpuState.lostResponse = 'throw';
  const wrong = await start(x.submissionId);
  gpuState.lostResponse = null;
  putResult(lastCall(), resultFor('2b0c7c1e-8f7a-4d1e-9a51-0c9d2f3e4a5b'));
  await pollIntakeRun(wrong.run.id, rt);
  eq((await runOf(wrong.run.id)).status, 'failed', '실행 번호가 다른 결과는 안 받는다');

  /* 창이 지나도 결과가 없으면 닫고, 그때부터 다시 걸 수 있다 */
  const g = await makeVerified();
  gpuState.lostResponse = 'error';
  const lost = await start(g.submissionId);
  gpuState.lostResponse = null;
  nowMs += START_UNKNOWN_WINDOW_MS - 60_000;
  eq((await pollIntakeRun(lost.run.id, rt)).finished, false, '창 끝까지 기다린다');
  nowMs += 2 * 60_000;
  eq((await pollIntakeRun(lost.run.id, rt)).status, 'failed', '창이 지나면 닫는다');
  const closed = await runOf(lost.run.id);
  eq([closed.failureCode, closed.dedupeKey], ['gpu', null], '키를 비운다');
  ok(closed.failureDetail?.includes('응답'), '까닭을 분명히 남긴다');
  ok((await start(g.submissionId)).created, '닫힌 뒤에는 다시 걸 수 있다');
  await finishGpu(lastCall());
}

/* ───────────────── 15-2. 손을 고친 판은 다른 입력이다 ───────────────── */
{
  const fixHand = async (m: Made, hand: 'R' | 'L') => {
    await requestCorrection(db, { adminId: ADMIN, submissionId: m.submissionId, fields: ['throwingHand'] }, new Date(nowMs));
    const state = await loadPublicState(db, m.scope, { now: new Date(nowMs) });
    const saved = await saveDraft(db, m.scope, { expectedVersion: state.version, throwingHand: hand }, new Date(nowMs));
    await finalizeSubmission(db, m.scope, { expectedVersion: saved.version, idempotencyKey: randomBytes(16).toString('hex') }, new Date(nowMs));
    await settleJobs();
  };

  const m = await makeVerified({ name: '왼손', hand: 'R' });
  const { run } = await start(m.submissionId);
  await finishGpu(lastCall());
  await fixHand(m, 'L');
  eq((await subOf(m.submissionId)).analysisStatus, 'ready', '옛 손의 성공을 잇지 않는다');
  eq((await listRuns(m.submissionId, rt))[0].isCurrentRevision, false, '옛 손의 실행은 지금 것으로 안 보인다');
  await fails(publish({ runId: run.id, adminId: ADMIN }), 'run_not_current', '옛 손의 실행은 그냥 공개되지 않는다');
  ok((await publish({ runId: run.id, adminId: ADMIN, allowOlderRevision: true })).created, '일부러 넘기면 공개된다');
  eq((await subOf(m.submissionId)).analysisStatus, 'ready', '옛 입력을 공개해도 분석 상태는 안 잇는다');
  const calls = gpuCalls.length;
  const next = await start(m.submissionId);
  eq([next.created, gpuCalls.length, lastCall().meta.hand], [true, calls + 1, 'L'], '새 손은 새 입력이라 돌릴 수 있다');
  eq(next.run.isCurrentRevision, true, '새 실행은 지금 입력이다');
  await finishGpu(lastCall());

  /* 고침이 열린 동안 관리자가 정한 손은 고침을 거둬도 남는다 */
  const h = await makeVerified({ name: '정한손', hand: null });
  await requestCorrection(db, { adminId: ADMIN, submissionId: h.submissionId, fields: ['athleteName'] }, new Date(nowMs));
  await setAnalysisHand({ submissionId: h.submissionId, adminId: ADMIN, hand: 'L' }, rt);
  await cancelCorrection(db, { adminId: ADMIN, submissionId: h.submissionId, expectedVersion: (await subOf(h.submissionId)).version }, new Date(nowMs));
  eq((await subOf(h.submissionId)).throwingHand, 'L', '정한 손이 남는다');

  /* 돌던 실행이 손을 고친 뒤 끝나도 지금 판의 상태를 안 옮긴다 */
  const n = await makeVerified({ name: '돌던', hand: 'R' });
  await start(n.submissionId);
  const nReq = lastCall();
  await fixHand(n, 'L');
  await finishGpu(nReq);
  eq((await subOf(n.submissionId)).analysisStatus, 'ready', '옛 손의 끝이 새 판을 덮지 않는다');
}

/* ───────────────── 15-3. 글만 고친 판은 크론만으로 분석 상태를 잇는다 ───────────────── */
{
  const fixName = async (m: Made, name: string) => {
    await requestCorrection(db, { adminId: ADMIN, submissionId: m.submissionId, fields: ['athleteName'] }, new Date(nowMs));
    const state = await loadPublicState(db, m.scope, { now: new Date(nowMs) });
    const saved = await saveDraft(db, m.scope, { expectedVersion: state.version, athleteName: name }, new Date(nowMs));
    await finalizeSubmission(db, m.scope, { expectedVersion: saved.version, idempotencyKey: randomBytes(16).toString('hex') }, new Date(nowMs));
  };
  const cron = async () => {
    const realNow = rt.now;
    rt.now = () => new Date(Math.max(Date.now(), nowMs) + 86_400_000);
    try {
      await runIntakeCron(rt);
      await runIntakeCron(rt);
    } finally {
      rt.now = realNow;
    }
  };

  const m = await makeVerified({ name: '크론' });
  await start(m.submissionId);
  await finishGpu(lastCall());
  await fixName(m, '크론고침');
  await cron();
  const s = await loadPublicState(db, m.scope, { now: new Date(nowMs) });
  eq([(await subOf(m.submissionId)).analysisStatus, s.screen], ['succeeded', 'admin_review'], '크론 두 번이면 받는 사람 화면이 검토 중이 된다');

  /* 글을 고치는 사이 실행이 끝났다 — 등록 뒤 '분석 가능'이어도 이 성공을 잇는다 */
  const p = await makeVerified({ name: '겹침' });
  await start(p.submissionId);
  const pReq = lastCall();
  await fixName(p, '겹침고침');
  await settleJobs();
  await db.intakeSubmission.update({ where: { id: p.submissionId }, data: { analysisStatus: 'ready' } });
  await finishGpu(pReq);
  eq((await subOf(p.submissionId)).analysisStatus, 'succeeded', '같은 입력의 성공은 ready 에서도 받는다');

  /* 실패는 잇지 않는다 — 사람이 다시 누른다 */
  const q = await makeVerified({ name: '겹침실패' });
  await start(q.submissionId);
  const qReq = lastCall();
  await fixName(q, '겹침실패고침');
  await settleJobs();
  await db.intakeSubmission.update({ where: { id: q.submissionId }, data: { analysisStatus: 'ready' } });
  gpuStatus.set(`call-${gpuCalls.indexOf(qReq) + 1}`, { kind: 'failed', code: 'internal' });
  await pollIntakeRun(qReq.jobId, rt);
  eq((await subOf(q.submissionId)).analysisStatus, 'ready', '실패는 그대로 분석 가능이다');
}

/* ───────────────── 15-4. 줌으로 찍은 파일은 1배 초점 사전을 끈다 ───────────────── */
{
  const m = await makeVerified({ name: '줌' });
  const rev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: m.submissionId } });
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: rev.sideAssetId } });
  await db.intakeAsset.update({ where: { id: row.id }, data: { mediaFacts: { ...(row.mediaFacts as object), focal35mm: 77 } } });
  const notes = (await analysisReadiness(m.submissionId, rt)).inputNotes.map((n) => n.code);
  ok(notes.includes('lab_guard'), '누르기 전에 알린다');
  await start(m.submissionId);
  eq((lastCall().meta as { lens?: string }).lens, 'zoom', '분석 서버에 줌이라고 넘긴다');
  await finishGpu(lastCall());

  const n = await makeVerified({ name: '1배' });
  await start(n.submissionId);
  eq((lastCall().meta as { lens?: string }).lens, undefined, '1배면 줌이라고 하지 않는다');
  await finishGpu(lastCall());
}

/* ───────────────── 16. 올라온 파일을 원본으로 치지 않는다 ───────────────── */
{
  const facts = { container: 'mov', hasVideo: true, width: 1920, height: 1080, nominalFps: 120, averageFps: 119.88, frameTiming: 'constant', sampleDurationSec: 5, hasLensInfo: true, focal35mm: 26, editList: { present: false, segments: 0, retimed: false, trimmed: false, shiftSec: 0 } };
  const note = (over: object, name = 'IMG_0001.MOV') => analysisInputNotes([{ view: 'side', originalName: name, mediaFacts: { ...facts, ...over } }]);
  eq(note({}), [], '일정한 고속 원본은 주의가 없다');
  eq(note({}, 'ScreenRecording_11-06.MOV').map((n) => [n.code, n.dropsTiming]), [['screen_like', true]], '이름이 화면 녹화면 알린다');
  eq(note({ width: 1170, height: 2532, nominalFps: 60, averageFps: 60, hasLensInfo: false }).map((n) => n.code), ['screen_like'], '렌즈 정보 없는 화면 모양 60fps 도 화면 녹화로 본다');
  eq(note({ nominalFps: 30, averageFps: 30 }).map((n) => [n.code, n.dropsTiming]), [['low_fps', true]], '30fps 는 슬로 모션을 내보낸 파일일 수 있다');
  eq(note({ frameTiming: 'variable' }).map((n) => n.code), ['timing_variable'], '장면 간격이 고르지 않다');
  eq(note({ frameTiming: 'unknown' }).map((n) => n.code), ['timing_unknown'], '장면 간격을 못 읽었다');
  eq(note({ editList: { present: true, segments: 3, retimed: true, trimmed: false, shiftSec: 0 } }).map((n) => n.code), ['retimed'], '재생 속도를 바꿨다');
  eq(note({ editList: { present: true, segments: 1, retimed: false, trimmed: true, shiftSec: 0.2 } }), [], '앞뒤만 자른 파일은 영상 시간을 그대로 믿는다');
  eq(note({ width: 960, height: 540 }).map((n) => [n.code, n.dropsTiming]), [['lab_guard', false]], '화질이 낮으면 알리되 시간은 믿는다');
  eq(analysisInputNotes([{ view: 'rear', originalName: 'a.mov', mediaFacts: null }]).map((n) => [n.code, n.view]), [['facts_missing', 'rear']], '파일 사실이 없으면 믿지 않는다');
  ok(note({ frameTiming: 'variable' })[0].text.startsWith('옆 영상: '), '어느 칸인지 말한다');
  eq(note({ focal35mm: 48 }).map((n) => [n.code, n.dropsTiming]), [['lab_guard', false]], '줌으로 찍은 파일을 알린다');
  eq(note({ focal35mm: null }).map((n) => n.code), ['zoom_unknown'], '초점거리를 못 읽으면 못 봤다고 말한다');
  eq(note({ focal35mm: undefined }).map((n) => n.code), ['zoom_unknown'], '이 칸이 생기기 전의 사실도 같다');
  /* 파일 사실로 못 가르는 60fps — 렌즈가 있어도, 16:9 여도 시간은 그대로 두고 한계를 말한다 */
  eq(note({ nominalFps: 60, averageFps: 60 }).map((n) => [n.code, n.dropsTiming]), [['fps_unproven', false]], '60fps 는 내보낸 파일일 수 있다고 말한다');
  eq(note({ nominalFps: 60, averageFps: 60, hasLensInfo: false, focal35mm: null }).map((n) => n.code), ['fps_unproven', 'zoom_unknown'], '렌즈 정보 없는 16:9 60fps 도 말없이 지나가지 않는다');

  const m = await makeVerified();
  const rev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: m.submissionId } });
  eq((await analysisReadiness(m.submissionId, rt)).inputNotes.length, 0, '문제없으면 주의가 없다');
  await db.intakeAsset.update({ where: { id: rev.rearAssetId }, data: { mediaFacts: { ...facts, frameTiming: 'variable' } } });
  const readiness = await analysisReadiness(m.submissionId, rt);
  eq([readiness.blockers.filter((x) => x.code !== 'analysis_confirm_required'), readiness.inputNotes.map((n) => [n.view, n.code])], [[], [['rear', 'timing_variable']]], 'GPU 를 누르기 전에 관리자가 본다(막지는 않는다)');
  const { run } = await start(m.submissionId);
  eq(lastCall().meta, { hand: 'R', slowmoFps: null, screenRecorded: true, heightCm: null }, '시간을 믿을 수 없으면 엔진이 시간 지표를 뺀다');
  ok((await listRuns(m.submissionId, rt))[0].timingDropped, '화면에서 뺀 실행을 알아본다');
  await finishGpu(lastCall());
  eq((await runOf(run.id)).status, 'succeeded', '분석은 그대로 끝난다');

  /* 이 값이 엔진에서 실제로 시간을 뺀다 — 진짜 맞추기 엔진으로 */
  const noTime = fitPitch3dV2({
    side: trackS.track,
    back: trackB.track,
    hand: sc.hand,
    heightCm: 183,
    jobId: run.id,
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: null,
    events: { kneeUp: trackS.toMedia(EV.kneeUp), footPlant: trackS.toMedia(EV.footPlant), release: trackS.toMedia(EV.release) },
  }).result as Pitch3dV2Ok;
  ok(noTime.ok && !noTime.metrics.some((x) => x.key === 'plantToRelease'), '착지 → 릴리스 시간이 안 나온다');
  ok(noTime.warnings.includes('screen'), '엔진이 경고를 단다');
  ok(!toPublicView(noTime).metrics.some((x) => x.key === 'plantToRelease'), '공개 칸에도 안 나간다');
}

/* ───────────────── 고침이 끼어든 실행 · 잇기 · 공개 안내 ───────────────── */
{
  const at = () => new Date(nowMs);
  const stateOf = (m: Made) => loadPublicState(db, m.scope, { now: at() });
  const cancel = async (m: Made) => cancelCorrection(db, { adminId: ADMIN, submissionId: m.submissionId, expectedVersion: (await subOf(m.submissionId)).version }, at());
  const draft = async (m: Made, patch: { athleteName?: string; throwingHand?: 'R' | 'L'; submitterRelation?: string }) =>
    saveDraft(db, m.scope, { expectedVersion: (await stateOf(m)).version, ...patch }, at());
  const finish = async (m: Made) => {
    await finalizeSubmission(db, m.scope, { expectedVersion: (await stateOf(m)).version, idempotencyKey: randomBytes(16).toString('hex') }, at());
    await settleJobs();
  };
  const reopen = (m: Made, fields: ('athleteName' | 'throwingHand' | 'submitterRelation')[]) => requestCorrection(db, { adminId: ADMIN, submissionId: m.submissionId, fields }, at());
  const failGpu = async (runId: string) => {
    gpuStatus.set(`call-${gpuCalls.length}`, { kind: 'failed', code: 'framing' });
    await pollIntakeRun(runId, rt);
  };
  const modelAnswer = (granted: boolean): ConsentAnswer => ({ kind: 'model', version: consentDocOf('model').version, textHash: consentDocOf('model').textHash, granted });

  /* 실행이 도는 중에 받는 사람이 손을 저장했고, 끝난 뒤 고침을 거둔다 — 상태가 '대기'에 남으면 안 된다 */
  const a = await makeVerified();
  const { run: aRun } = await start(a.submissionId);
  const aReq = lastCall();
  await reopen(a, ['throwingHand']);
  await draft(a, { throwingHand: 'L' });
  await finishGpu(aReq);
  eq((await subOf(a.submissionId)).analysisStatus, 'succeeded', '내지 않은 손은 끝난 실행을 지우지 않는다');
  await cancel(a);
  const aSub = await subOf(a.submissionId);
  eq([aSub.throwingHand, aSub.status, aSub.analysisStatus], ['R', 'verified', 'succeeded'], '거두면 낸 손의 결과로 돌아간다');
  eq((await stateOf(a)).screen, 'admin_review', '공개 화면이 분석 중에 머물지 않는다');
  eq((await publish({ runId: aRun.id, adminId: ADMIN })).created, true, '그대로 공개할 수 있다');
  eq((await subOf(a.submissionId)).analysisStatus, 'succeeded', '공개 뒤에도 상태가 맞다');

  /* 요청에서 손 칸을 빼는 길도 같다 */
  const b = await makeVerified();
  const { run: bRun } = await start(b.submissionId);
  const bReq = lastCall();
  await reopen(b, ['throwingHand']);
  await draft(b, { throwingHand: 'L' });
  await reopen(b, ['athleteName']);
  await finishGpu(bReq);
  eq([(await subOf(b.submissionId)).throwingHand, (await subOf(b.submissionId)).analysisStatus], ['R', 'succeeded'], '손이 돌아가고 결과가 적힌다');
  await cancel(b);
  eq((await listRuns(b.submissionId, rt)).find((x) => x.id === bRun.id)?.isCurrentRevision, true, '지금 입력의 실행이다');

  /* 실패로 끝나도 다시 누를 수 있다 */
  const c = await makeVerified();
  const { run: cRun } = await start(c.submissionId);
  await reopen(c, ['throwingHand']);
  await draft(c, { throwingHand: 'L' });
  await failGpu(cRun.id);
  await cancel(c);
  eq((await subOf(c.submissionId)).analysisStatus, 'failed', '실패로 적힌다');
  eq((await analysisReadiness(c.submissionId, rt)).blockers.filter((x) => x.code === 'analysis_not_ready'), [], '막힘이 없다');
  const cAgain = await start(c.submissionId);
  ok(cAgain.created && cAgain.run.id !== cRun.id, '단추가 거절되지 않고 새로 돈다');
  await finishGpu(lastCall());

  /* 고쳐 낸 손은 다른 입력이다 — 도중에 끝난 옛 손의 실행을 잇지 않는다 */
  const d = await makeVerified();
  const { run: dRun } = await start(d.submissionId);
  const dReq = lastCall();
  await reopen(d, ['throwingHand']);
  await draft(d, { throwingHand: 'L' });
  await finishGpu(dReq);
  await finish(d);
  eq((await subOf(d.submissionId)).analysisStatus, 'ready', '새 손은 분석 가능으로 돌아간다');
  eq((await listRuns(d.submissionId, rt)).find((x) => x.id === dRun.id)?.isCurrentRevision, false, '옛 손의 실행은 지금 것이 아니다');

  /* 도는 동안 관리자가 손을 바꿨다 — 상태를 옮겨 줄 실행이 없으면 다시 누를 수 있어야 한다 */
  const e = await makeVerified();
  const { run: eRun } = await start(e.submissionId);
  const eReq = lastCall();
  await setAnalysisHand({ submissionId: e.submissionId, adminId: ADMIN, hand: 'L' }, rt);
  await finishGpu(eReq);
  eq((await subOf(e.submissionId)).analysisStatus, 'ready', '끝난 뒤 분석 가능으로 돌아간다');
  const eAgain = await start(e.submissionId);
  ok(eAgain.created && eAgain.run.id !== eRun.id, '정한 손으로 새로 돈다');
  await finishGpu(lastCall());

  /* 등록 일감이 고침 중에 지나갔다 — 고침을 거둘 때 잇는다 */
  const f = await makeVerified({ name: '오타' });
  const { run: fRun } = await start(f.submissionId);
  await finishGpu(lastCall());
  const fCalls = gpuCalls.length;
  await reopen(f, ['athleteName']);
  await draft(f, { athleteName: '바른이름' });
  await finalizeSubmission(db, f.scope, { expectedVersion: (await stateOf(f)).version, idempotencyKey: randomBytes(16).toString('hex') }, at());
  eq((await subOf(f.submissionId)).analysisStatus, 'ready', '새 판은 잇기 전이다');
  await reopen(f, ['athleteName']);
  await settleJobs();
  eq((await subOf(f.submissionId)).analysisStatus, 'ready', '고침이 열려 있어 일감이 못 잇는다');
  await cancel(f);
  eq((await subOf(f.submissionId)).analysisStatus, 'succeeded', '고침을 거두면 같은 입력의 실행을 잇는다');
  eq((await stateOf(f)).screen, 'admin_review', '공개 화면이 영수증에 머물지 않는다');
  eq(gpuCalls.length, fCalls, 'GPU 는 안 돈다');
  eq((await listRuns(f.submissionId, rt))[0].id, fRun.id, '새 실행도 없다');

  /* 공개 뒤 이름만 고치면 안내가 남지 않는다. 영상 · 손을 고쳐야 '확인하고 있어요'다 */
  const g = await makeVerified({ name: '오타' });
  const { run: gRun } = await start(g.submissionId);
  await finishGpu(lastCall());
  await publish({ runId: gRun.id, adminId: ADMIN });
  await reopen(g, ['athleteName']);
  await draft(g, { athleteName: '바른이름' });
  await finish(g);
  const gState = await stateOf(g);
  eq([gState.screen, gState.correctionStatusLine], ['published', null], '이미 반영된 이름에 안내가 안 붙는다');
  await reopen(g, ['throwingHand']);
  await draft(g, { throwingHand: 'L' });
  await finish(g);
  eq((await stateOf(g)).correctionStatusLine, '고친 내용이 접수됐어요. 담당자가 확인하고 있어요', '손을 고친 판은 공개가 옛 입력이라 안내한다');

  /* 고침을 거두면 관계가 돌아간다 — 그 관계의 동의는 살아 있다. 다시 동의하라고 하면 사실이 아니다 */
  const h = await makeVerified();
  await reopen(h, ['submitterRelation']);
  await draft(h, { submitterRelation: 'coach' });
  ok(!(await stateOf(h)).consent.requiredOk, '새 관계로는 다시 받는다');
  await recordConsents(db, h.scope, { answers: consents() }, at());
  await cancel(h);
  const hState = await stateOf(h);
  eq([hState.draft.submitterRelation, hState.consent.requiredOk, hState.needsReconsent], ['parent', true, false], '앞서 낸 동의가 그대로다');
  ok(!hState.statusText.includes('동의 내용이 바뀌었어요'), '다시 동의하라고 안 한다');
  eq((await analysisReadiness(h.submissionId, rt)).blockers.filter((x) => x.code === 'analysis_consent_missing'), [], '분석이 막히지 않는다');

  /* 요청에서 관계 칸을 빼도 같다 — 끝낼 수 있다 */
  const i = await makeVerified();
  await reopen(i, ['submitterRelation']);
  await draft(i, { submitterRelation: 'coach' });
  await recordConsents(db, i.scope, { answers: consents() }, at());
  await reopen(i, ['athleteName']);
  await draft(i, { athleteName: '고친이름' });
  await finish(i);
  eq((await subOf(i.submissionId)).status, 'verified', '동의를 다시 묻지 않고 끝난다');

  /* 다른 관계로 낸 거부는 고침을 거둬도 남는다 */
  const j = await makeVerified();
  await reopen(j, ['submitterRelation']);
  await recordConsents(db, j.scope, { answers: [...consents(), modelAnswer(true)] }, at());
  await draft(j, { submitterRelation: 'coach' });
  nowMs += 1000;
  await recordConsents(db, j.scope, { answers: [...consents(), modelAnswer(false)] }, at());
  nowMs += 1000;
  await cancel(j);
  eq((await stateOf(j)).consent.granted.model, false, '마지막 거부를 옛 동의가 되살리지 않는다');

  /* 판에 얼리는 동의는 지금 보내는 사람의 답뿐이다 */
  const k = await makeVerified();
  await reopen(k, ['submitterRelation']);
  await recordConsents(db, k.scope, { answers: [...consents(), modelAnswer(true)] }, at());
  await draft(k, { submitterRelation: 'coach' });
  await recordConsents(db, k.scope, { answers: consents() }, at());
  await finish(k);
  const kRev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: k.submissionId }, orderBy: { number: 'desc' } });
  const snapshot = kRev.consentSnapshot as { kind: string; granted: boolean; relation: string }[];
  eq(snapshot.map((x) => [x.kind, x.granted, x.relation]).sort(), [['overseas', true, 'coach'], ['submission', true, 'coach']], '옛 관계의 모델 동의는 안 얼린다');
  eq((await stateOf(k)).consent.granted.model, false, '앱의 판단과 같다');
}

/* ─────────────────────── 원본 보유 기간 뒤의 분석 · 공개 ─────────────────────── */
{
  const DAY = 86_400_000;
  const startedAt = nowMs;
  const m = await makeVerified();
  const { run } = await start(m.submissionId);
  const req = lastCall();
  /* 분석 서버가 미리보기를 구운 것처럼 놓는다 */
  const previews = { side: runPreviewPath(m.submissionId, run.id, 'side'), rear: runPreviewPath(m.submissionId, run.id, 'rear') };
  objects.set(previews.side, Buffer.from('side'));
  objects.set(previews.rear, Buffer.from('rear'));
  await finishGpu(req);
  await publish({ runId: run.id, adminId: ADMIN, explanation: '보유 시험' });
  const publishedAt = nowMs;

  /* 지울 날이 지나면 지우기 전이어도 새 분석을 안 받는다 */
  nowMs = publishedAt + 90 * DAY;
  await fails(start(m.submissionId), 'original_purged', '지울 날이 지난 원본은 분석 서버로 안 보낸다');
  const ready = await analysisReadiness(m.submissionId, rt);
  ok(!ready.runnable && ready.blockers[0].code === 'original_purged', '준비 상태가 까닭을 먼저 말한다');
  nowMs = publishedAt + 90 * DAY - 1;
  ok(!(await analysisReadiness(m.submissionId, rt)).blockers.some((b) => b.code === 'original_purged'), '지울 날 앞에서는 막지 않는다');

  /* 끝난 지 한 시간이 지나 지운다 */
  nowMs = publishedAt + 90 * DAY;
  eq((await purgeSubmissionOriginals(rt, m.submissionId)).outcome, 'purged', '지운다');
  const assets = await db.intakeAsset.findMany({ where: { submissionId: m.submissionId } });
  ok(assets.every((a) => a.status === 'purged' && !objects.has(a.objectPath)), '원본이 없다');
  ok(!objects.has(previews.side) && !objects.has(previews.rear), '미리보기도 없다');
  ok(objects.has(runResultPath(m.submissionId, run.id)), '결과 JSON 은 남는다');

  const calls = gpuCalls.length;
  await fails(start(m.submissionId), 'original_purged', '지운 뒤에는 새 분석을 분명한 까닭으로 막는다');
  eq(gpuCalls.length, calls, 'GPU 를 안 부른다');
  eq((await loadPublicResult(m.scope, {}, rt)).explanation, '보유 시험', '공개 결과는 원본 없이 그대로 열린다');
  eq((await loadRunResult(run.id, rt)).jobId, run.id, '관리자도 결과를 본다');
  eq((await listRuns(m.submissionId, rt))[0].previewPaths, null, '지운 미리보기는 없는 것으로 보인다');
  ok((await listRuns(m.submissionId, rt))[0].hasResult, '결과는 있다고 보인다');

  /* 검증 지적: 초대를 폐기한 뒤 지운 접수 — 고침을 요청할 수 없으니 막힘 글이 고침을 권하지 않는다 */
  ok((await analysisReadiness(m.submissionId, rt)).blockers.find((b) => b.code === 'original_purged')?.text.includes('고침'), '초대가 살아 있으면 고침을 권한다');
  await db.intakeInvitation.update({ where: { id: m.invitationId }, data: { status: 'revoked', revokedAt: new Date(nowMs) } });
  const revokedText = (await analysisReadiness(m.submissionId, rt)).blockers.find((b) => b.code === 'original_purged')?.text ?? '';
  ok(revokedText.includes('보유 기간') && !revokedText.includes('고침'), '폐기한 접수에는 할 수 없는 고침을 권하지 않는다');
  await db.intakeInvitation.update({ where: { id: m.invitationId }, data: { status: 'active', revokedAt: null } });
  nowMs = startedAt;
}

/* ─────────────────────── 지우기 시작한 원본 — 시계를 다시 돌리는 일과 바이트를 쓰는 일을 막는다 ─────────────────────── */
{
  const DAY = 86_400_000;
  const startedAt = nowMs;
  const at = () => new Date(nowMs);
  const purge = (id: string) => purgeSubmissionOriginals(rt, id);
  const auditCount = (submissionId: string, action: string) => db.intakeAudit.count({ where: { submissionId, action } });
  const publicationCount = (submissionId: string) => db.intakePublication.count({ where: { submissionId } });
  /** 표시가 커밋된 뒤, 저장소를 지우기 전의 틈에 끼어든다 — 다음 remove 한 번 앞에서 돈다 */
  const inRemoveGap = (work: () => Promise<void>) => {
    const real = storage.remove;
    storage.remove = async (paths) => {
      storage.remove = real;
      await work();
      await real.call(storage, paths);
    };
  };
  /** 지금 시각에 고침을 열고 두 파일을 새로 받아 낸다 */
  async function resend(m: Made) {
    await requestCorrection(db, { adminId: ADMIN, submissionId: m.submissionId, views: ['side', 'rear'], extendUploadUntil: new Date(nowMs + 14 * DAY) }, at());
    let version = 0;
    for (const [view, file] of [['side', mov120(4096, { appleFocal: '26' })], ['rear', mov240(4096, { appleFocal: '26' })]] as const) {
      const sub = await subOf(m.submissionId);
      const r = await reserveAsset(db, m.scope, { view, expectedAssetId: view === 'side' ? sub.sideAssetId : sub.rearAssetId, fileName: `다시-${view}.mov`, sizeBytes: file.length, sha256: sha(file), pairConfirmed: true }, at());
      version = r.version;
      await issueUploadToken(db, storage, m.scope, { assetId: r.asset.id }, at());
      put(assetObjectPath(m.submissionId, r.asset.id), file);
      await confirmUpload(db, storage, m.scope, { assetId: r.asset.id }, at());
    }
    await finalizeSubmission(db, m.scope, { expectedVersion: version, idempotencyKey: randomBytes(16).toString('hex') }, at());
    for (const kind of ['verify_asset', 'register_revision'] as const) await runDueJobs(db, intakeJobHandlers(rt), { owner: 'test', kinds: [kind], limit: 10, now: at });
    eq((await subOf(m.submissionId)).status, 'verified', '새로 낸 판이 검증됐다');
  }

  /* 지적 2(1): 90일째 지우기로 정한 뒤 저장소를 부르기 전에 공개가 끼어든다 — 공개는 시계를 90일 밀어서, 끼어들면 공개가 약속한 날 전에 원본이 사라진다 */
  const a = await makeVerified();
  const { run: aRun } = await start(a.submissionId);
  await finishGpu(lastCall());
  nowMs = startedAt + 90 * DAY;
  inRemoveGap(async () => {
    await fails(publish({ runId: aRun.id, adminId: ADMIN }), 'purge_in_progress', '지우기로 정한 원본의 실행은 공개하지 못한다');
  });
  eq((await purge(a.submissionId)).outcome, 'purged', '지운다');
  eq(await publicationCount(a.submissionId), 0, '공개가 안 생긴다');
  const aAssets = await db.intakeAsset.findMany({ where: { submissionId: a.submissionId } });
  ok(aAssets.every((x) => x.status === 'purged' && !objects.has(x.objectPath)), '원본이 없고 지운 것으로 적혔다');
  const aPub = await publish({ runId: aRun.id, adminId: ADMIN });
  ok(aPub.created, '다 지운 뒤에는 결과 JSON 으로 공개한다');
  await takedown(a.submissionId);

  /* 지적 2(3): 원본 하나를 지우고 끊긴 틈 — 몇 시간 벌어져도 공개 · 주소 · 분석이 막히고, 다음 크론이 끝까지 지운다 */
  nowMs = startedAt;
  const b = await makeVerified();
  const { run: bRun } = await start(b.submissionId);
  await finishGpu(lastCall());
  ok((await listRuns(b.submissionId, rt))[0].previewPaths != null, '지우기 전에는 미리보기가 보인다');
  nowMs = startedAt + 90 * DAY;
  const bKey = `purge_originals:${b.submissionId}:시험`;
  await enqueueJob(db, { kind: 'purge_originals', dedupeKey: bKey, payload: { submissionId: b.submissionId }, runAfter: at() });
  const runPurgeJobs = () => runDueJobs(db, intakeJobHandlers(rt), { owner: 'test', kinds: ['purge_originals'], now: at });
  fault.removePartial = true;
  eq((await runPurgeJobs()).retried, 1, '크론이 원본 하나를 지우고 끊겨 일감이 다시 돌 차례가 된다');
  const left = await db.intakeAsset.findMany({ where: { submissionId: b.submissionId } });
  ok(left.every((x) => x.status === 'purging') && left.some((x) => !objects.has(x.objectPath)) && left.some((x) => objects.has(x.objectPath)), '한쪽이 없고 둘 다 지우는 중이다');
  await fails(publish({ runId: bRun.id, adminId: ADMIN }), 'purge_in_progress', '틈에 공개로 시계를 다시 돌리지 못한다');
  await fails(issueOriginalLinks(db, storage, ACTOR, { submissionId: b.submissionId, purpose: 'download' }, at()), 'original_purged', '틈에 원본 주소를 안 준다');
  await fails(issueRunPreviewLink(db, storage, ACTOR, { submissionId: b.submissionId, runId: bRun.id, view: 'side' }, at()), 'original_purged', '틈에 미리보기 주소도 안 준다');
  eq((await analysisReadiness(b.submissionId, rt)).blockers[0].code, 'original_purged', '준비 상태가 까닭을 먼저 말한다');
  await fails(start(b.submissionId), 'original_purged', '틈에 새 분석을 안 건다');
  eq((await listRuns(b.submissionId, rt))[0].previewPaths, null, '지우는 미리보기는 없는 것으로 보인다');
  const gap = await loadPublicState(db, b.scope, { now: at() });
  eq([gap.originalDeletedDate, gap.originalDeleting, gap.assets.side?.integrity], [null, 'current', '보유 기간이 지나 원본을 지우고 있어요'], '공개 상태가 지우는 중이라고 말한다');
  nowMs += 3_600_000;
  eq((await runPurgeJobs()).done, 1, '다음 크론이 끝까지 지운다');
  ok((await db.intakeAsset.findMany({ where: { submissionId: b.submissionId } })).every((x) => x.status === 'purged' && !objects.has(x.objectPath)), 'not_due 로 끝나지 않고 둘 다 지웠다');
  eq((await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: bKey } })).status, 'done', '일감도 끝났다');
  const done = await loadPublicState(db, b.scope, { now: at() });
  ok(done.originalDeletedDate != null && done.originalDeleting === null, '끝나면 지운 날을 말한다');
  eq([await auditCount(b.submissionId, 'originals.purge_started'), await auditCount(b.submissionId, 'originals.purged')], [1, 1], '시작 · 끝 기록이 한 줄씩이다');

  /* 옛 실행의 입력은 다 지웠어도 지금 판을 지우는 중이면 막는다 — 공개가 지금 판의 시계까지 돌리기 때문이다 */
  nowMs = startedAt;
  const c = await makeVerified();
  const { run: cRun } = await start(c.submissionId);
  await finishGpu(lastCall());
  nowMs = startedAt + 90 * DAY;
  eq((await purge(c.submissionId)).outcome, 'purged', '1판을 지운다');
  nowMs = startedAt + 100 * DAY;
  await resend(c);
  nowMs = startedAt + 190 * DAY;
  inRemoveGap(async () => {
    await fails(publish({ runId: cRun.id, adminId: ADMIN, allowOlderRevision: true }), 'purge_in_progress', '옛 실행을 공개해도 지우는 지금 판의 시계를 못 돌린다');
  });
  eq((await purge(c.submissionId)).outcome, 'purged', '2판을 지운다');
  eq(await publicationCount(c.submissionId), 0, '공개가 안 생긴다');
  ok((await publish({ runId: cRun.id, adminId: ADMIN, allowOlderRevision: true })).created, '다 지운 뒤에는 옛 결과도 공개한다');
  await takedown(c.submissionId);

  /* 옛 판을 지우다 멈춰도 새 판의 분석 · 공개는 막지 않는다 */
  nowMs = startedAt;
  const d = await makeVerified();
  nowMs = startedAt + 90 * DAY;
  fault.removePartial = true;
  await fails(purge(d.submissionId), 'storage_unavailable', '옛 판을 지우다 끊긴다');
  nowMs = startedAt + 91 * DAY;
  await resend(d);
  const { run: dRun } = await start(d.submissionId);
  await finishGpu(lastCall());
  ok((await publish({ runId: dRun.id, adminId: ADMIN })).created, '새 판의 결과는 공개한다');
  eq((await purge(d.submissionId)).outcome, 'purged', '옛 파일은 계속 지운다');
  await takedown(d.submissionId);

  /* 지울 날 앞이어도 지금 판을 지우는 중이면 새 분석을 안 건다 — 날짜가 밀려도 표시는 안 풀린다 */
  nowMs = startedAt;
  const e = await makeVerified();
  await db.intakeAsset.updateMany({ where: { submissionId: e.submissionId }, data: { status: 'purging' } });
  await fails(start(e.submissionId), 'original_purged', '표시가 걸린 판은 지울 날을 안 보고 막는다');
  await db.intakeAsset.updateMany({ where: { submissionId: e.submissionId }, data: { status: 'verified' } });
}

await db.$disconnect();
await socket.stop();
await pg.close();
console.log(`intake analysis: ${passed} 통과`);
