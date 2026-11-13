/**
 * 받는 사람 이름 · PIN · 세션과 관리자가 가져오는 3D 결과 시험 (INTAKE-MAIN/R03). `npm run intake:invitee-test`
 *
 * 운영 DB · 저장소 · GPU 를 건드리지 않는다: PGlite 에 external_intake 마이그레이션을 깔고, 저장소는 메모리 가짜, GPU 는 설정 없음이다.
 * 공개 요청은 화면과 같은 client(lib/intake/public-client.ts)를 라우트 처리기에 바로 잇고, 쿠키 그릇이 브라우저처럼 Set-Cookie 를 받아 다음 요청에 싣는다.
 *
 * 보는 것:
 *   A 세션 관문 — 쿠키 없는 데이터 요청은 모두 session_required, 관문은 정했는지 · 잠겼는지 · 세션이 있는지만 말한다
 *   B 처음 정하기 · 다시 들어가기 · 잠금 · 횟수 제한 · 지우기 · 링크 바꾸기
 *   C 세션 끝(쓰지 않은 2시간 · 써도 12시간)
 *   D 다른 초대의 쿠키
 *   E 관리자 권한
 *   F 원본 해시가 처음부터 끝까지 같다 · 매니페스트에 비밀이 없다
 *   G 수동 결과 가져오기
 *   H 수동 결과의 검토 · 공개 · 받는 사람 보기
 *
 * 한계: PGlite 는 연결이 하나라 '동시' 호출은 줄을 서서 돈다. 조건부 갱신이 하나만 이기는 결과는 보지만, 두 연결이 같은 순간에 다투는 모습은 재현되지 않는다.
 */
/* 맨 앞 — 검증 처리기가 쓰는 프로세스 시계를 시험 날짜에 맞춘다 */
import { TEST_EPOCH } from './intake-test-clock.mts';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { openIntakeScope } from '@/lib/intake/access';
import {
  adminConfirmLocalCopy,
  adminImportManualResult,
  adminResetInvitee,
  adminUnlockInvitee,
  adminWithdrawOverseasConsent,
  buildIntakeManifest,
  issueOriginalLinks,
  loadIntakeDetail,
} from '@/lib/intake/admin';
import { analysisReadiness, listRuns, readSucceededResult, runResultPath, startIntakeAnalysis, type IntakeGpu, type IntakeRuntime } from '@/lib/intake/analysis';
import { consentDocOf, type ConsentAnswer } from '@/lib/intake/consent';
import { IntakeError } from '@/lib/intake/errors';
import {
  PIN_MAX_FAILURES,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  enrollInvitee,
  readSessionCookie,
  resetInviteeEnrollment,
  sessionCookieName,
  unlockInvitee,
  unlockInviteePin,
} from '@/lib/intake/invitee';
import { intakeJobHandlers } from '@/lib/intake/job-handlers';
import { runDueJobs } from '@/lib/intake/jobs';
import { MANUAL_ENGINE_KEY, MANUAL_RESULT_FORMAT } from '@/lib/intake/manual-result';
import { createPublicApi, type PublicApi } from '@/lib/intake/public-api';
import { IntakeRequestError, createIntakeClient, type IntakeClient } from '@/lib/intake/public-client';
import { handlePublicResultRequest, publishRun, unpublish } from '@/lib/intake/publication';
import { INTAKE_RATE_RULES } from '@/lib/intake/rate-limit';
import { acknowledgeRunReview, loadRunReview } from '@/lib/intake/review';
import { createInvitation, reissueInvitationToken, requestCorrection } from '@/lib/intake/service';
import type { IntakeRunStorage } from '@/lib/intake/storage-core';
import { fitPitch3dV2 } from '@/lib/pitch-3d/v2/fit';
import type { Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { mov120, mov240 } from './intake-fixtures.mts';
import { base, cameras, EV } from './pitch-lab/synth.mts';
import { makeV2Track } from './pitch-lab/synth-v2.mts';

const started = Date.now();
let passed = 0;
const counts: Record<string, number> = {};
let section = '-';
const tick = (label: string) => {
  if (process.env.V) console.log('ok', `[${section}]`, label);
  passed++;
  counts[section] = (counts[section] ?? 0) + 1;
};
const ok = (cond: unknown, label: string) => {
  assert.ok(cond, `[${section}] ${label}`);
  tick(label);
};
const eq = (a: unknown, b: unknown, label: string) => {
  assert.deepEqual(a, b, `[${section}] ${label}`);
  tick(label);
};
/** client 의 실패 — 코드(와 HTTP 상태)를 본다 */
async function failsWith(p: Promise<unknown>, code: string, label: string, status?: number): Promise<IntakeRequestError> {
  let caught: IntakeRequestError | null = null;
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof IntakeRequestError, `[${section}] ${label}: ${String(e)}`);
    assert.equal(e.code, code, `[${section}] ${label}`);
    if (status !== undefined) assert.equal(e.status, status, `[${section}] ${label} — 상태`);
    caught = e;
    return true;
  });
  tick(label);
  return caught!;
}
/** 서버 함수의 실패 */
async function fails(p: Promise<unknown>, code: string, label: string): Promise<IntakeError> {
  let caught: IntakeError | null = null;
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof IntakeError, `[${section}] ${label}: IntakeError 가 아니에요 — ${String(e)}`);
    assert.equal(e.code, code, `[${section}] ${label}`);
    caught = e;
    return true;
  });
  tick(label);
  return caught!;
}

/* ── DB ── */
/* 운영에 적용한 뒤(2026-11-13 df3306e0)에는 prisma/migrations 로 옮겨졌다 — 접수 마이그레이션이 든 쪽을 쓴다 */
const MIGRATION_ROOT = readdirSync('prisma/pending-migrations').some((d) => d.endsWith('_external_intake')) ? 'prisma/pending-migrations' : 'prisma/migrations';
const dirs = readdirSync(MIGRATION_ROOT).filter((d) => d.endsWith('_external_intake')).sort();
const pg = await PGlite.create();
await pg.exec(readFileSync(`${MIGRATION_ROOT}/${dirs[0]}/migration.sql`, 'utf8'));
/* 매니페스트가 로컬 사본을 확인한 관리자 이름을 읽는다 — 앱 스키마의 사용자 표 중 그 칸만 */
await pg.exec(`CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MANAGER'); CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "nickname" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'USER');`);
const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await socket.start();
const addr = (socket as unknown as { server: { address(): { port: number } } }).server.address();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${addr.port}/postgres?sslmode=disable`, max: 1 }) });

const ADMIN = '6f1d1b7e-0c1a-4c7e-9a44-aaaaaaaaaaaa';
const ACTOR = { id: ADMIN, role: 'ADMIN' };
await pg.exec(`INSERT INTO "User" ("id", "nickname", "role") VALUES ('${ADMIN}', '시험관리자', 'ADMIN')`);

/* ── 가짜 저장소 — 읽기 주소는 경로를 그대로 담아, 시험이 그 주소로 바이트를 '내려받는다' ── */
const objects = new Map<string, Buffer>();
const READ = 'https://signed.example/';
const removed: string[] = [];
const hooks: { afterPut: ((path: string) => Promise<void>) | null } = { afterPut: null };
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
  async readUrl(p, opts) {
    return `${READ}${p}${opts?.download ? `?download=${encodeURIComponent(opts.download)}` : ''}`;
  },
  async list(prefix) {
    return [...objects.keys()].filter((k) => k.startsWith(prefix));
  },
  async remove(paths) {
    for (const p of paths) {
      removed.push(p);
      objects.delete(p);
    }
  },
  async resultUploadUrl() {
    throw new Error('수동 결과는 올리기 주소를 쓰지 않는다');
  },
  /* 실제 저장소처럼 덮어쓰지 않는다(upsert:false) */
  async putRunFile(p, bytes) {
    if (objects.has(p)) throw new IntakeError('storage_unavailable', { cause: 'put_run_file' });
    objects.set(p, Buffer.from(bytes));
    const hook = hooks.afterPut;
    hooks.afterPut = null;
    if (hook) await hook(p);
  },
};
/** 저장소 읽기 주소 → 바이트(내려받기 흉내) */
const download = (url: string) => {
  assert.ok(url.startsWith(READ), '서명 주소 모양');
  const path = decodeURIComponent(new URL(url).pathname.slice(1));
  const b = objects.get(path);
  assert.ok(b, '주소의 파일이 저장소에 있다');
  return b;
};

/* ── GPU 없음 · 초안 동의 우회 없음 ── */
const gpu: IntakeGpu = {
  configured: () => false,
  async start() {
    throw new Error('GPU 를 부르면 안 된다');
  },
  async status() {
    throw new Error('GPU 를 부르면 안 된다');
  },
  async engineBuild() {
    return null;
  },
};
ok(process.env.INTAKE_ALLOW_DRAFT_ANALYSIS === undefined, '초안 동의 우회 플래그를 켜지 않은 채 돈다');

/* ── 시계 · 처리기 ── */
let clock = new Date(TEST_EPOCH);
const now = () => clock;
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};
const rt: IntakeRuntime = { db, storage, gpu, env: {}, now };
const api: PublicApi = createPublicApi({ db, storage: () => storage, schedule: () => {}, now });
const resultHandler = (req: Request) => handlePublicResultRequest(req, { db, storage, now });

let address = '10.1.0.1';
const nextAddress = () => (address = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`);

type Handler = (req: Request) => Promise<Response>;
const ROUTES: Record<string, Handler> = {
  session: api.gate,
  'session/enroll': api.enroll,
  'session/unlock': api.unlock,
  'session/end': api.endSession,
  state: api.state,
  draft: api.draft,
  consents: api.consents,
  'consents/withdraw': api.withdraw,
  assets: api.reserve,
  'assets/token': api.uploadToken,
  'assets/upload-url': api.uploadUrl,
  'assets/confirm': api.confirm,
  finalize: api.finalize,
  result: resultHandler,
};

/** 브라우저 하나의 쿠키 그릇 — Set-Cookie 를 받아 두었다가 Path 아래 요청에 싣는다 */
type Jar = Map<string, string>;
const newJar = (): Jar => new Map();
const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const setCookies: string[] = [];
function keep(jar: Jar, res: Response) {
  for (const set of res.headers.getSetCookie()) {
    setCookies.push(set);
    const [pair, ...attrs] = set.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (!value || attrs.some((a) => /^\s*max-age=0\s*$/i.test(a))) jar.delete(name);
    else jar.set(name, value);
  }
}

/** 라우트 처리기에 바로 잇는다 — 쿠키는 그릇에서 싣고 받는다 */
async function send(path: string, init: { method?: string; headers?: HeadersInit; body?: BodyInit | null } | undefined, jar: Jar | null): Promise<Response> {
  const handler = ROUTES[path];
  assert.ok(handler, `알려진 길 ${path}`);
  const headers = new Headers(init?.headers);
  headers.set('x-forwarded-for', address);
  if (jar && jar.size && !headers.has('cookie')) headers.set('cookie', cookieHeader(jar));
  const res = await handler(new Request(`http://local/api/intake/public/${path}`, { method: init?.method ?? 'GET', headers, body: init?.body }));
  if (jar) keep(jar, res);
  return res;
}
const dispatchFor =
  (jar: Jar): typeof fetch =>
  async (input, init) =>
    send(String(input).replace('/api/intake/public/', ''), init as never, jar);

type Browser = { token: string; jar: Jar; client: IntakeClient };
const browser = (token: string, jar: Jar = newJar()): Browser => ({ token, jar, client: createIntakeClient(token, dispatchFor(jar)) });

/** 토큰 · 쿠키를 그대로 실은 요청 하나 — 응답의 코드를 본다 */
async function rawCall(path: string, token: string, opts: { jar?: Jar | null; cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { authorization: `Intake ${token}` };
  if (opts.cookie !== undefined) headers.cookie = opts.cookie;
  const isPost = opts.body !== undefined || path !== 'state';
  if (isPost) headers['content-type'] = 'application/json';
  const res = await send(path, { method: isPost && path !== 'session' ? 'POST' : 'GET', headers, body: isPost && path !== 'session' ? JSON.stringify(opts.body ?? {}) : undefined }, opts.jar ?? null);
  const data = (await res.json()) as { error?: { code: string }; result?: { version: number; view: { t: number[] } } } & Record<string, unknown>;
  return { status: res.status, code: data.error?.code ?? null, data, res };
}

const sha = (b: Buffer | Uint8Array) => createHash('sha256').update(b).digest('hex');
const consentAnswers = (): ConsentAnswer[] =>
  (['submission', 'overseas'] as const).map((k) => ({ kind: k, version: consentDocOf(k).version, textHash: consentDocOf(k).textHash, granted: true }));

async function invite() {
  nextAddress();
  const created = await createInvitation(db, { adminId: ADMIN }, clock);
  return { ...created, b: browser(created.token) };
}

async function enrolled(name = '금윤호', pin = '0042') {
  const i = await invite();
  await i.b.client.enroll({ name, pin, pinConfirm: pin });
  return i;
}

/** 검증 → 등록 차례로. 처리기는 시험 시계(intake-test-clock)로 일감을 넣어서 하루 앞으로 돌린다 */
async function settleJobs() {
  for (const kind of ['verify_asset', 'register_revision'] as const) {
    await runDueJobs(db, intakeJobHandlers(rt), { owner: 'test', kinds: [kind], limit: 20, now: () => new Date(Math.max(Date.now(), clock.getTime()) + 86_400_000) });
  }
}

/** 세션을 가진 화면으로 처음부터 끝까지 올린다 — 모든 데이터 길이 쿠키로 열린다 */
async function uploadAll(b: Browser, opts: { hand?: 'R' | 'L' | null; settle?: boolean; name?: string; consents?: ConsentAnswer[] } = {}) {
  const side = mov120(4096 + Math.floor(Math.random() * 2000), { appleFocal: '26' });
  const rear = mov240(4096 + Math.floor(Math.random() * 2000), { appleFocal: '26' });
  const { state } = await b.client.state();
  await b.client.saveDraft({ expectedVersion: state.version, athleteName: opts.name ?? '김선수', athleteAgeBand: '14_or_over', samePitchConfirmed: true, ...(opts.hand !== undefined ? { throwingHand: opts.hand } : {}) });
  await b.client.recordConsents(opts.consents ?? consentAnswers());
  const ids: Record<'side' | 'rear', string> = { side: '', rear: '' };
  for (const [view, file] of [['side', side], ['rear', rear]] as const) {
    const r = await b.client.reserveAsset({ view, expectedAssetId: null, fileName: `${view}.MOV`, sizeBytes: file.length, declaredType: 'video/quicktime', sha256: sha(file), pairConfirmed: true });
    const grant = await b.client.issueToken(r.asset.id);
    await b.client.registerUploadUrl(r.asset.id, `${storage.uploadOrigin}/storage/v1/upload/resumable/sign/${grant.objectName.replaceAll('/', '_')}`);
    objects.set(grant.objectName, file);
    await b.client.confirmUpload(r.asset.id);
    ids[view] = r.asset.id;
  }
  const { state: before } = await b.client.state();
  const receipt = await b.client.finalize({ expectedVersion: before.version, idempotencyKey: randomBytes(16).toString('hex') });
  if (opts.settle !== false) await settleJobs();
  return { side, rear, ids, receipt };
}

/* ── 진짜 엔진으로 만든 결과 하나를 실행 번호 · 장면 수만 바꿔 쓴다(intake-analysis-selftest 와 같은 합성 투수) ── */
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
assert.ok(fitted.ok, '합성 투수 결과가 나온다');
const realResult = fitted as Pitch3dV2Ok;
const HAND = realResult.hand;
const OTHER_HAND: 'R' | 'L' = HAND === 'R' ? 'L' : 'R';
/** 장면 수로 서로 다른 결과를 가른다 */
const resultCut = (frames?: number): Pitch3dV2Ok => {
  if (!frames) return realResult;
  const cut = <T,>(a: T[]) => a.slice(0, frames);
  return { ...realResult, t: cut(realResult.t), tBack: cut(realResult.tBack), joints: cut(realResult.joints), conf: cut(realResult.conf), lowConf: [], experimental: undefined, events: { kneeUp: 1, footPlant: 2, release: 3 } };
};
const envelope = (sideSha: string, rearSha: string, result: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: MANUAL_RESULT_FORMAT, sideSha256: sideSha, rearSha256: rearSha, result, ...extra });
const serverShas = async (submissionId: string) => {
  const sub = await db.intakeSubmission.findUniqueOrThrow({ where: { id: submissionId } });
  const rev = await db.intakeRevision.findUniqueOrThrow({ where: { id: sub.currentRevisionId! } });
  const side = await db.intakeAsset.findUniqueOrThrow({ where: { id: rev.sideAssetId } });
  const rear = await db.intakeAsset.findUniqueOrThrow({ where: { id: rev.rearAssetId } });
  return { revisionId: rev.id, side: side.serverSha256!, rear: rear.serverSha256!, sideAsset: side, rearAsset: rear, sub };
};
const importManual = (submissionId: string, expectedRevisionId: string, text: string) => adminImportManualResult(db, storage, ACTOR, { submissionId, expectedRevisionId, text }, clock);

/** 화면처럼 검토를 열고 '검토 완료'를 누른다 */
async function ack(submissionId: string, runId: string): Promise<string> {
  const v = await loadRunReview({ submissionId, runId, adminId: ADMIN }, rt);
  return (await acknowledgeRunReview({ submissionId, runId, adminId: ADMIN, resultDigest: v.resultDigest, currentRevisionId: v.currentRevisionId }, rt)).acknowledgementId;
}
const activePub = async (submissionId: string) => (await db.intakePublication.findUnique({ where: { activeFor: submissionId } }))?.id ?? null;
const publish = async (submissionId: string, runId: string, acknowledgementId: string | null) =>
  publishRun({ runId, adminId: ADMIN, submissionId, acknowledgementId, expectedActivePublicationId: await activePub(submissionId) }, rt);

/* ═══════════════════ A. 세션 관문 ═══════════════════ */
section = 'A';
{
  const i = await invite();
  /* 데이터 길은 모두 쿠키를 먼저 본다 — 본문을 읽기 전에 막는다 */
  const dataRoutes = ['state', 'draft', 'consents', 'consents/withdraw', 'assets', 'assets/token', 'assets/upload-url', 'assets/confirm', 'finalize', 'result'];
  for (const path of dataRoutes) {
    const r = await rawCall(path, i.token);
    eq([r.status, r.code], [401, 'session_required'], `정하기 전 · 쿠키 없는 ${path} 는 session_required`);
  }
  const gate0 = await i.b.client.gate();
  eq(gate0, { enrolled: false, locked: false, session: false }, '관문은 쿠키 없이 열리고 세 칸만 말한다');

  await i.b.client.enroll({ name: '관문선수', pin: '1234', pinConfirm: '1234' });
  const set = setCookies[setCookies.length - 1];
  for (const path of dataRoutes) {
    const r = await rawCall(path, i.token);
    eq([r.status, r.code], [401, 'session_required'], `정한 뒤에도 쿠키 없는 ${path} 는 session_required`);
  }
  const noCookie = await rawCall('session', i.token);
  eq([noCookie.status, Object.keys(noCookie.data).sort()], [200, ['enrolled', 'locked', 'session']], '관문 응답은 enrolled · locked · session 셋뿐이다');
  eq(noCookie.data, { enrolled: true, locked: false, session: false }, '쿠키 없는 관문 — 정했고 세션은 없다');
  ok(!JSON.stringify(noCookie.data).includes('관문선수'), '관문은 이름을 주지 않는다');
  eq(await i.b.client.gate(), { enrolled: true, locked: false, session: true }, '쿠키를 실은 관문은 세션이 있다고 말한다');
  eq((await i.b.client.state()).state.submissionId, i.submissionId, '쿠키가 있으면 상태가 열린다');

  /* 쿠키 모양 · 속성 */
  ok(set.startsWith(`${sessionCookieName(i.invitationId)}=`), '쿠키 이름은 초대마다의 이름');
  ok(/^intake_s_[0-9a-f]{16}$/.test(sessionCookieName(i.invitationId)), '쿠키 이름 모양 intake_s_<16hex>');
  ok(/; Path=\/api\/intake\/public;/.test(set) && /HttpOnly/.test(set) && /Secure/.test(set) && /SameSite=Strict/.test(set), 'HttpOnly · Secure · SameSite=Strict · Path');
  const enrollRes = await rawCall('session/unlock', i.token, { body: { name: '관문선수', pin: '1234' } });
  const unlockValue = enrollRes.res.headers.getSetCookie()[0].split(';')[0].split('=')[1];
  ok(unlockValue.length === 43 && !JSON.stringify(enrollRes.data).includes(unlockValue), '세션 원문은 응답 본문에 없다');
  ok(!JSON.stringify(enrollRes.data).includes(i.b.jar.get(sessionCookieName(i.invitationId))!), '앞 세션 원문도 본문에 없다');
  eq(Object.keys(enrollRes.data).sort(), ['expiresAt', 'idleExpiresAt', 'name'], '다시 들어가기 응답 칸');

  /* 세션 끝내기 — 쿠키를 지우고 이후는 다시 막힌다 */
  eq(await i.b.client.endSession(), { ended: true }, '세션 끝내기');
  eq(i.b.jar.size, 0, '끝내기 응답이 쿠키를 지운다');
  await failsWith(i.b.client.state(), 'session_required', '끝낸 뒤 상태는 막힌다', 401);
  const fresh = await rawCall('session/unlock', i.token, { body: { name: '관문선수', pin: '1234' } });
  const stale = fresh.res.headers.getSetCookie()[0].split(';')[0];
  await rawCall('session/end', i.token, { cookie: stale });
  eq((await rawCall('state', i.token, { cookie: stale })).code, 'session_required', '끝낸 세션 원문을 다시 실어도 막힌다');
  eq((await rawCall('state', i.token, { cookie: `${sessionCookieName(i.invitationId)}=not-a-token` })).code, 'session_required', '모양이 틀린 쿠키');
  eq((await rawCall('state', i.token, { cookie: `${sessionCookieName(i.invitationId)}=${'A'.repeat(43)}` })).code, 'session_required', '지어낸 세션 원문');
}

/* ═══════════════════ D. 다른 초대의 쿠키 ═══════════════════ */
section = 'D';
{
  const a = await enrolled('에이', '1111');
  const bInv = await enrolled('비', '2222');
  const aName = sessionCookieName(a.invitationId);
  const bName = sessionCookieName(bInv.invitationId);
  ok(aName !== bName, '두 초대의 쿠키 이름이 다르다');
  const aValue = a.b.jar.get(aName)!;
  ok(readSessionCookie(`${aName}=${aValue}`, bInv.invitationId) === null, 'B 의 이름으로는 A 의 쿠키를 읽지 않는다');
  /* A 의 그릇을 B 의 토큰에 — 이름이 달라 없는 것과 같다 */
  await failsWith(createIntakeClient(bInv.token, dispatchFor(new Map(a.b.jar))).state(), 'session_required', 'A 의 쿠키를 B 의 링크로 보내면 session_required', 401);
  /* A 의 값을 B 의 이름에 실어도 — 세션 줄이 A 의 초대라 막힌다 */
  eq((await rawCall('state', bInv.token, { cookie: `${bName}=${aValue}` })).code, 'session_required', 'A 의 세션 원문을 B 의 쿠키 이름에 실어도 막힌다');
  eq((await rawCall('result', bInv.token, { cookie: `${bName}=${aValue}` })).code, 'session_required', '결과 길도 같다');
  /* 한 그릇에 두 초대 — 서로 덮지 않는다 */
  const shared = newJar();
  for (const [k, v] of a.b.jar) shared.set(k, v);
  for (const [k, v] of bInv.b.jar) shared.set(k, v);
  eq((await createIntakeClient(a.token, dispatchFor(shared)).state()).state.submissionId, a.submissionId, '한 브라우저의 A 링크');
  eq((await createIntakeClient(bInv.token, dispatchFor(shared)).state()).state.submissionId, bInv.submissionId, '한 브라우저의 B 링크');
}

/* ═══════════════════ F. 원본 해시가 처음부터 끝까지 같다 · 매니페스트 ═══════════════════ */
section = 'F';
let fMade: { submissionId: string; token: string; jarCookie: string; side: Buffer; rear: Buffer } | null = null;
{
  const i = await enrolled('원본선수', '0909');
  const up = await uploadAll(i.b, { hand: HAND });
  const sub = await db.intakeSubmission.findUniqueOrThrow({ where: { id: i.submissionId } });
  eq(sub.status, 'verified', '세션으로 올린 짝이 검증까지 끝난다');
  const facts = await serverShas(i.submissionId);
  eq([facts.side, facts.rear], [sha(up.side), sha(up.rear)], '서버가 다시 잰 해시 = 고른 원본 해시');
  eq([facts.sideAsset.clientSha256, facts.rearAsset.clientSha256], [sha(up.side), sha(up.rear)], '브라우저가 알린 해시도 같다');

  const links = await issueOriginalLinks(db, storage, ACTOR, { submissionId: i.submissionId, purpose: 'download' }, clock);
  eq(links.map((l) => l.view).sort(), ['rear', 'side'], '원본 내려받기 주소 둘');
  for (const l of links) {
    const got = download(l.url);
    const want = l.view === 'side' ? up.side : up.rear;
    const asset = l.view === 'side' ? facts.sideAsset : facts.rearAsset;
    eq(sha(got), sha(want), `${l.view}: 내려받은 바이트 해시 = 고른 원본 해시`);
    eq(sha(got), asset.serverSha256, `${l.view}: 내려받은 바이트 해시 = 서버 해시`);
    ok(Buffer.compare(got, want) === 0, `${l.view}: 바이트가 그대로다`);
  }

  await adminConfirmLocalCopy(db, ACTOR, { submissionId: i.submissionId, revisionId: facts.revisionId, place: '외장 디스크 A' }, clock);
  await fails(adminConfirmLocalCopy(db, ACTOR, { submissionId: i.submissionId, revisionId: randomUUID(), place: '외장 디스크 A' }, clock), 'manual_result_stale', '다른 판의 로컬 사본은 적지 않는다');
  const manifest = await buildIntakeManifest(db, ACTOR, { submissionIds: [i.submissionId] }, clock);
  eq([manifest.format, manifest.entries.length, manifest.truncated], ['intake-manifest/1', 1, false], '매니페스트 한 줄');
  const entry = manifest.entries[0];
  eq([entry.side?.sha256, entry.rear?.sha256], [sha(up.side), sha(up.rear)], '매니페스트 해시 = 원본 해시');
  eq([entry.side?.hashMatched, entry.rear?.hashMatched], [true, true], '매니페스트 해시 맞음 표시');
  eq(entry.inviteeName, '원본선수', '매니페스트에 받는 분 이름');
  eq([entry.localCopy?.place, entry.localCopy?.by, entry.localCopy?.revision], ['외장 디스크 A', '시험관리자', 1], '로컬 사본 확인이 실린다');
  eq([entry.manualTemplate?.sideSha256, entry.manualTemplate?.rearSha256, entry.manualTemplate?.revisionId], [facts.side, facts.rear, facts.revisionId], '수동 결과 틀이 지금 판 해시에 묶인다');

  const inv = await db.intakeInvitation.findUniqueOrThrow({ where: { id: i.invitationId } });
  const sessionValue = i.b.jar.get(sessionCookieName(i.invitationId))!;
  const text = JSON.stringify(manifest);
  const secrets: [string, string][] = [
    ['초대 토큰', i.token],
    ['토큰 해시', inv.tokenHash],
    ['PIN', '0909'],
    ['PIN 해시', inv.pinHash!],
    ['이름 비교 열쇠 칸', 'inviteeNameKey'],
    ['PIN 칸', 'pinHash'],
    ['세션 원문', sessionValue],
    ['서명 주소', READ],
    ['저장 경로(옆)', facts.sideAsset.objectPath],
    ['저장 경로(뒤)', facts.rearAsset.objectPath],
    ['경로 칸', 'objectPath'],
    ['전송 주소', 'resumable/sign'],
  ];
  for (const [label, s] of secrets) ok(!text.includes(s), `매니페스트에 ${label} 이(가) 없다`);
  ok((await db.intakeAudit.count({ where: { action: 'manifest.exported' } })) >= 1, '매니페스트 내보내기가 감사에 남는다');
  fMade = { submissionId: i.submissionId, token: i.token, jarCookie: cookieHeader(i.b.jar), side: up.side, rear: up.rear };
}

/* ═══════════════════ G. 수동 결과 가져오기 ═══════════════════ */
section = 'G';
let gMade: { submissionId: string; b: Browser; firstRunId: string } | null = null;
{
  /* 손을 모르는 접수 — 가져온 결과의 손으로 정해진다 */
  const i = await enrolled('수동선수', '4321');
  await uploadAll(i.b, { hand: null });
  const f = await serverShas(i.submissionId);
  const runsOf = () => db.intakeAnalysisRun.findMany({ where: { submissionId: i.submissionId }, orderBy: { requestedAt: 'asc' } });
  eq((await runsOf()).length, 0, '처음에는 실행이 없다');
  const good = envelope(f.side, f.rear, resultCut());

  const r1 = await importManual(i.submissionId, f.revisionId, good);
  const run1 = await db.intakeAnalysisRun.findUniqueOrThrow({ where: { id: r1.runId } });
  eq([run1.engineKey, run1.status, run1.gpuCallId], [MANUAL_ENGINE_KEY, 'succeeded', null], '새 성공 실행(manual-import/1) · GPU 없음');
  const meta1 = run1.resultMeta as { source?: string; sha256?: string; manual?: { format?: string; sourceSha256?: string } };
  eq([meta1.source, meta1.manual?.format, meta1.sha256], ['manual', MANUAL_RESULT_FORMAT, r1.sha256], '결과 메타가 가져온 결과라고 적는다');
  eq(meta1.manual?.sourceSha256, sha(Buffer.from(good, 'utf8')), '가져온 파일 그대로의 해시도 적는다');
  eq(run1.resultPath, runResultPath(i.submissionId, r1.runId), '결과 경로는 실행 폴더');
  const storedRaw = JSON.parse(objects.get(run1.resultPath!)!.toString('utf8')) as { jobId: string };
  eq(storedRaw.jobId, r1.runId, '저장한 파일의 작업 번호 = 실행 번호');
  eq(sha(objects.get(run1.resultPath!)!), r1.sha256, '저장한 바이트 해시 = 메타 해시');
  ok((await readSucceededResult(storage, run1)) !== null, 'readSucceededResult 로 다시 읽힌다');
  const sub1 = await db.intakeSubmission.findUniqueOrThrow({ where: { id: i.submissionId } });
  eq([sub1.analysisStatus, sub1.throwingHand, r1.hand, r1.handSet], ['succeeded', HAND, HAND, true], '분석 상태 성공 · 손을 결과로 정한다');
  const views = await listRuns(i.submissionId, rt);
  eq([views.length, views[0].source, views[0].manualSourceSha256], [1, 'manual', sha(Buffer.from(good, 'utf8'))], '실행 목록에 가져온 결과로 보인다');
  ok((await db.intakeAudit.count({ where: { submissionId: i.submissionId, action: 'analysis.manual_imported' } })) === 1, '가져오기 감사 한 줄');

  /* 틀린 묶음은 아무것도 안 바꾼다 */
  const snapshot = async () => {
    const runs = await runsOf();
    const s = await db.intakeSubmission.findUniqueOrThrow({ where: { id: i.submissionId } });
    return { runs: runs.map((r) => [r.id, r.status, JSON.stringify(r.resultMeta), r.resultPath]), analysis: s.analysisStatus, hand: s.throwingHand, files: [...objects.keys()].filter((k) => k.includes(i.submissionId)).sort() };
  };
  const before = await snapshot();
  const invalid = async (text: string, reason: string, label: string) => {
    const e = await fails(importManual(i.submissionId, f.revisionId, text), 'manual_result_invalid', label);
    eq(e.detail?.reason, reason, `${label} — 까닭 ${reason}`);
  };
  await invalid('{nope', 'json', '깨진 JSON');
  await invalid(JSON.stringify({ format: 'intake-manual-result/0', sideSha256: f.side, rearSha256: f.rear, result: realResult }), 'format', '틀린 형식 이름');
  await invalid(envelope(f.side, f.rear, { ok: true, version: realResult.version, jobId: realResult.jobId, joints: 'x' }), 'result', '결과 모양이 틀림');
  /* JSON 에는 NaN 이 없다 — 1e999 가 Infinity 로 읽힌다 */
  const nonFinite = good.replace(/"t":\[(-?[0-9.eE+-]+)/, '"t":[1e999');
  ok(nonFinite !== good, '유한하지 않은 숫자를 심었다');
  await invalid(nonFinite, 'result', '유한하지 않은 숫자');
  await invalid(envelope('zz', f.rear, realResult), 'sha256', '해시 모양이 틀림');
  await invalid(envelope(f.side, f.rear, realResult, { submissionId: 'not-an-id' }), 'submissionId', '접수 번호 모양이 틀림');
  await invalid('   ', 'empty', '빈 글');
  await fails(importManual(i.submissionId, f.revisionId, 'x'.repeat(960_001)), 'manual_result_too_large', '너무 큰 파일');

  const mm = await fails(importManual(i.submissionId, f.revisionId, envelope(sha(randomBytes(8)), f.rear, realResult)), 'manual_result_mismatch', '옆 해시가 다르다');
  eq(mm.detail?.field, 'sha256', '다른 해시 — field sha256');
  const sw = await fails(importManual(i.submissionId, f.revisionId, envelope(f.rear, f.side, realResult)), 'manual_result_mismatch', '옆 · 뒤를 바꿔 넣었다');
  eq(sw.detail?.field, 'swapped', '바꿔 넣음 — field swapped');
  await fails(importManual(i.submissionId, randomUUID(), good), 'manual_result_stale', '화면이 보던 판이 지금 판이 아니다');
  const decl = await fails(importManual(i.submissionId, f.revisionId, envelope(f.side, f.rear, realResult, { revisionId: randomUUID() })), 'manual_result_mismatch', '묶음의 판 번호가 다르다');
  eq(decl.detail?.field, 'revisionId', '판 번호 다름 — field revisionId');
  const rc = await fails(importManual(i.submissionId, f.revisionId, envelope(f.side, f.rear, realResult, { receiptCode: 'IN-000000-ABCDEF' })), 'manual_result_mismatch', '묶음의 영수증이 다르다');
  eq(rc.detail?.field, 'receiptCode', '영수증 다름 — field receiptCode');
  /* 손이 정해진 뒤 다른 손의 결과 */
  const otherHand = { ...realResult, hand: OTHER_HAND };
  await fails(importManual(i.submissionId, f.revisionId, envelope(f.side, f.rear, otherHand)), 'manual_result_hand', '정해진 손과 다른 결과');
  eq(await snapshot(), before, '틀린 묶음은 실행 · 상태 · 파일을 안 바꾼다');

  /* 다른 접수의 묶음 */
  const other = await enrolled('남의선수', '5555');
  await uploadAll(other.b, { hand: HAND });
  const o = await serverShas(other.submissionId);
  const cross = await fails(importManual(other.submissionId, o.revisionId, envelope(f.side, f.rear, realResult, { submissionId: i.submissionId })), 'manual_result_mismatch', 'A 의 묶음(접수 번호 있음)을 B 에 넣는다');
  eq(cross.detail?.field, 'submissionId', '접수 번호 다름 — field submissionId');
  const crossBare = await fails(importManual(other.submissionId, o.revisionId, good), 'manual_result_mismatch', 'A 의 묶음(번호 없음)을 B 에 넣는다');
  eq(crossBare.detail?.field, 'sha256', 'A 의 해시는 B 의 원본과 다르다');
  eq(await db.intakeAnalysisRun.count({ where: { submissionId: other.submissionId } }), 0, 'B 에 실행이 생기지 않는다');

  /* 검증이 안 끝난 판 */
  const pending = await enrolled('대기선수', '6666');
  const pu = await uploadAll(pending.b, { hand: HAND, settle: false });
  const ps = await db.intakeSubmission.findUniqueOrThrow({ where: { id: pending.submissionId } });
  ok(ps.currentRevisionId, '완료하면 판이 생긴다');
  await fails(importManual(pending.submissionId, ps.currentRevisionId!, envelope(sha(pu.side), sha(pu.rear), realResult)), 'manual_result_not_ready', '검증 전 판에는 넣지 못한다');
  await settleJobs();

  /* 손이 다른 접수 */
  const lefty = await enrolled('왼손선수', '7777');
  await uploadAll(lefty.b, { hand: OTHER_HAND });
  const l = await serverShas(lefty.submissionId);
  const he = await fails(importManual(lefty.submissionId, l.revisionId, envelope(l.side, l.rear, realResult)), 'manual_result_hand', '접수 손과 결과 손이 다르다');
  eq([he.detail?.expected, he.detail?.got], [OTHER_HAND, HAND], '손 다름의 내용');

  /* 파일을 올린 뒤 트랜잭션이 막히면 그 파일을 지운다 — 올린 직후 판을 비워 잠근 뒤 다시 보기에 걸리게 한다 */
  const beforeTx = await snapshot();
  const removedBefore = removed.length;
  let putPath = '';
  hooks.afterPut = async (p) => {
    putPath = p;
    await db.intakeSubmission.update({ where: { id: i.submissionId }, data: { currentRevisionId: null } });
  };
  await fails(importManual(i.submissionId, f.revisionId, envelope(f.side, f.rear, resultCut(20))), 'manual_result_stale', '올린 뒤 판이 바뀌면 트랜잭션이 막힌다');
  await db.intakeSubmission.update({ where: { id: i.submissionId }, data: { currentRevisionId: f.revisionId } });
  ok(putPath.endsWith('/analysis.json') && putPath !== run1.resultPath, '새 실행 결과 경로에 올렸었다');
  eq(removed.slice(removedBefore), [putPath], '막히면 올린 파일을 지운다');
  ok(!objects.has(putPath), '저장소에 그 파일이 없다');
  eq(await snapshot(), beforeTx, '막힌 가져오기는 실행을 안 남긴다');

  /* 손을 바꾸는 사이에 막히는 길 — 올린 직후 손을 바꾼다 */
  hooks.afterPut = async () => {
    await db.intakeSubmission.update({ where: { id: i.submissionId }, data: { throwingHand: OTHER_HAND } });
  };
  const removedMid = removed.length;
  await fails(importManual(i.submissionId, f.revisionId, envelope(f.side, f.rear, resultCut(20))), 'manual_result_hand', '올린 뒤 손이 바뀌면 막힌다');
  await db.intakeSubmission.update({ where: { id: i.submissionId }, data: { throwingHand: HAND } });
  eq(removed.length - removedMid, 1, '그 파일도 지운다');
  eq(await snapshot(), beforeTx, '실행은 그대로다');

  gMade = { submissionId: i.submissionId, b: i.b, firstRunId: r1.runId };
}

/* ═══════════════════ H. 수동 결과의 검토 · 공개 · 받는 사람 보기 ═══════════════════ */
section = 'H';
{
  const { submissionId, b, firstRunId } = gMade!;
  const f = await serverShas(submissionId);
  const resultOf = (br: Browser) => rawCall('result', br.token, { jar: br.jar });

  eq((await resultOf(b)).code, 'result_not_published', '공개 전에는 결과가 없다(초안이 안 샌다)');

  /* 첫 결과의 검토 완료 → 두 번째 결과를 가져오면 그 검토 완료로는 공개 못 한다 */
  const ack1 = await ack(submissionId, firstRunId);
  const r2 = await importManual(submissionId, f.revisionId, envelope(f.side, f.rear, resultCut(30)));
  await fails(publish(submissionId, firstRunId, ack1), 'stale_review', '새 결과를 가져온 뒤 앞 검토 완료로 공개하면 stale_review');
  eq(await activePub(submissionId), null, '막힌 공개는 아무것도 안 연다');
  eq((await resultOf(b)).code, 'result_not_published', '여전히 공개 없음');
  await fails(publish(submissionId, firstRunId, null), 'review_required', '검토 완료 없이는 공개 못 한다');

  /* 다시 검토해 첫 결과를 공개 — GPU · 문서 준비 · 우회 플래그 없이 */
  const pub1 = await publish(submissionId, firstRunId, await ack(submissionId, firstRunId));
  eq([pub1.created, pub1.number, pub1.runId], [true, 1, firstRunId], '첫 결과 공개');
  const seen1 = await resultOf(b);
  eq(seen1.status, 200, '받는 사람이 세션으로 공개 결과를 본다');
  eq([seen1.data.result?.version, seen1.data.result?.view.t.length], [1, realResult.t.length], '보이는 것은 공개한 첫 결과');
  const seenText = JSON.stringify(seen1.data);
  ok(!seenText.includes(f.sideAsset.objectPath) && !seenText.includes('manual') && !seenText.includes(firstRunId), '공개 응답에 경로 · 출처 · 실행 번호가 없다');

  /* 두 번째(초안)를 검토 완료 → 세 번째를 가져오면 그 검토 완료는 낡는다. 공개는 첫 결과 그대로 */
  const ack2 = await ack(submissionId, r2.runId);
  const r3 = await importManual(submissionId, f.revisionId, envelope(f.side, f.rear, resultCut(25)));
  await fails(publish(submissionId, r2.runId, ack2), 'stale_review', '세 번째를 가져온 뒤 두 번째의 앞 검토 완료는 낡았다');
  eq(await activePub(submissionId), pub1.publicationId, '공개는 첫 결과 그대로');
  eq((await resultOf(b)).data.result?.view.t.length, realResult.t.length, '받는 사람은 여전히 첫 결과만 본다(초안 둘이 안 샌다)');

  /* 두 번째를 다시 검토하고 일부러 공개 — 첫 공개 줄은 닫히되 남는다 */
  const pub2 = await publish(submissionId, r2.runId, await ack(submissionId, r2.runId));
  eq([pub2.created, pub2.number, pub2.replacedRunId], [true, 2, firstRunId], '두 번째 결과로 바꿔 공개');
  const old = await db.intakePublication.findUniqueOrThrow({ where: { id: pub1.publicationId } });
  eq([old.activeFor, old.runId, old.unpublishedAt != null], [null, firstRunId, true], '옛 공개 줄은 지우지 않고 닫는다');
  eq(await db.intakePublication.count({ where: { submissionId } }), 2, '공개 줄 둘');
  const seen2 = await resultOf(b);
  eq([seen2.data.result?.version, seen2.data.result?.view.t.length], [2, 30], '받는 사람은 새로 공개한 두 번째 결과를 본다');
  eq((await db.intakeAnalysisRun.findUniqueOrThrow({ where: { id: r3.runId } })).status, 'succeeded', '세 번째는 비공개 초안으로 남는다');

  /* 다른 초대의 세션 */
  const stranger = await enrolled('남', '8888');
  eq((await resultOf(stranger.b)).code, 'result_not_published', '다른 초대의 세션은 자기 접수(공개 없음)만 본다');
  const strangerCookie = stranger.b.jar.get(sessionCookieName(stranger.invitationId))!;
  eq((await rawCall('result', b.token, { cookie: `${sessionCookieName(f.sub.invitationId)}=${strangerCookie}` })).code, 'session_required', '남의 세션 원문으로는 이 결과를 못 읽는다');
  eq((await rawCall('result', b.token, { cookie: cookieHeader(stranger.b.jar) })).code, 'session_required', '남의 그릇 그대로도 못 읽는다');
  eq((await rawCall('result', b.token)).code, 'session_required', '쿠키 없이는 못 읽는다');

  /* 내리기 */
  eq(await unpublish({ submissionId, adminId: ADMIN, expectedActivePublicationId: pub2.publicationId }, rt), { unpublished: true }, '공개 내리기');
  eq((await resultOf(b)).code, 'result_not_published', '내린 뒤에는 결과가 없다');
  eq(await db.intakePublication.count({ where: { submissionId } }), 2, '내려도 공개 줄은 남는다');
}

/* ═══════════════════ E. 관리자 권한 ═══════════════════ */
section = 'E';
{
  const id = fMade!.submissionId;
  const f = await serverShas(id);
  for (const role of ['USER', 'MANAGER', null] as const) {
    const actor = { id: ADMIN, role };
    await fails(adminResetInvitee(db, actor, { submissionId: id }, clock), 'admin_forbidden', `${role}: 이름 · PIN 지우기`);
    await fails(adminUnlockInvitee(db, actor, { submissionId: id }, clock), 'admin_forbidden', `${role}: 잠금 풀기`);
    await fails(adminImportManualResult(db, storage, actor, { submissionId: id, expectedRevisionId: f.revisionId, text: envelope(f.side, f.rear, realResult) }, clock), 'admin_forbidden', `${role}: 수동 결과 가져오기`);
    await fails(buildIntakeManifest(db, actor, {}, clock), 'admin_forbidden', `${role}: 매니페스트`);
    await fails(adminConfirmLocalCopy(db, actor, { submissionId: id, revisionId: f.revisionId, place: 'x' }, clock), 'admin_forbidden', `${role}: 로컬 사본 확인`);
  }
  eq(await db.intakeAnalysisRun.count({ where: { submissionId: id } }), 0, '막힌 관리자는 실행을 안 만든다');
  eq((await db.intakeInvitation.findUniqueOrThrow({ where: { id: f.sub.invitationId } })).enrolledAt != null, true, '막힌 관리자는 이름 · PIN 을 안 지운다');
  /* 대표관리자의 상세에는 PIN 원문 · 해시가 없다 */
  const detail = await loadIntakeDetail(db, ACTOR, id);
  eq([detail.invitee.enrolled, detail.invitee.name], [true, '원본선수'], '상세의 받는 분 상태');
  const dt = JSON.stringify(detail);
  const inv = await db.intakeInvitation.findUniqueOrThrow({ where: { id: f.sub.invitationId } });
  ok(!dt.includes(inv.pinHash!) && !dt.includes('pinHash') && !dt.includes('inviteeNameKey'), '상세에 PIN 해시 · 비교 열쇠가 없다');
}

/* ═══════════════════ B. 처음 정하기 · 다시 들어가기 ═══════════════════ */
section = 'B';
{
  /* 모양 검사 — 정하기 전 */
  const i = await invite();
  await failsWith(i.b.client.enroll({ name: '선수', pin: '0042', pinConfirm: '0043' }), 'pin_mismatch', 'PIN 확인이 다르다');
  await failsWith(i.b.client.enroll({ name: '선수', pin: '12a4', pinConfirm: '12a4' }), 'pin_invalid', '숫자가 아닌 PIN');
  await failsWith(i.b.client.enroll({ name: '선수', pin: '12345', pinConfirm: '12345' }), 'pin_invalid', '다섯 자리 PIN');
  await failsWith(i.b.client.enroll({ name: '선수', pin: '123', pinConfirm: '123' }), 'pin_invalid', '세 자리 PIN');
  eq((await rawCall('session/enroll', i.token, { body: { name: '선수', pin: 42, pinConfirm: 42 } })).code, 'pin_invalid', '숫자 값 PIN 은 받지 않는다');
  await failsWith(i.b.client.enroll({ name: '   ', pin: '0042', pinConfirm: '0042' }), 'invitee_name_invalid', '빈 이름');
  await failsWith(i.b.client.enroll({ name: 'ㄱ'.repeat(41), pin: '0042', pinConfirm: '0042' }), 'invitee_name_invalid', '너무 긴 이름');
  await failsWith(i.b.client.enroll({ name: '선\u0000수', pin: '0042', pinConfirm: '0042' }), 'athlete_name_chars', '제어 글자가 든 이름');
  await failsWith(i.b.client.unlock({ name: '선수', pin: '0042' }), 'invitee_not_enrolled', '정하기 전 다시 들어가기');
  eq((await i.b.client.gate()).enrolled, false, '막힌 시도는 정하지 않는다');

  /* 앞 0 을 지키는 PIN · 이름 정리 */
  const r = await i.b.client.enroll({ name: '  Kim   Yunho ', pin: '0042', pinConfirm: '0042' });
  eq(r.name, 'Kim Yunho', '이름은 앞뒤 · 겹친 공백을 정리해 둔다');
  const inv = await db.intakeInvitation.findUniqueOrThrow({ where: { id: i.invitationId } });
  ok(inv.pinHash?.startsWith('scrypt$') && !inv.pinHash.includes('0042'), 'PIN 은 scrypt 해시로만 둔다');
  eq(inv.inviteeNameKey, 'kim yunho', '비교 열쇠');
  await failsWith(i.b.client.enroll({ name: '다른사람', pin: '1111', pinConfirm: '1111' }), 'invitee_already_enrolled', '두 번째 정하기는 막힌다', 409);

  const other = browser(i.token);
  /* '42' 는 글자라 시도로 센다(모양으로 무엇이 틀렸는지 알려 주지 않는다) — 같은 답 */
  await failsWith(other.client.unlock({ name: 'Kim Yunho', pin: '42' }), 'invitee_credentials_wrong', "앞 0 을 뺀 '42' 로는 못 들어간다", 401);
  const n42 = await rawCall('session/unlock', i.token, { body: { name: 'Kim Yunho', pin: 42 } });
  eq(n42.code, 'pin_invalid', '숫자 42 는 받지 않는다(앞 0 이 사라진 값)');
  const wrong0043 = await failsWith(other.client.unlock({ name: 'Kim Yunho', pin: '0043' }), 'invitee_credentials_wrong', '틀린 PIN', 401);
  const wrongName = await failsWith(other.client.unlock({ name: 'Kim Yunh0', pin: '0042' }), 'invitee_credentials_wrong', '틀린 이름', 401);
  eq(wrongName.message, wrong0043.message, '틀린 이름과 틀린 PIN 은 같은 글');
  await failsWith(other.client.unlock({ name: 'KimYunho', pin: '0042' }), 'invitee_credentials_wrong', '띄어쓰기를 지운 이름은 다른 이름');
  /* 호환 글자 · 대소문자 · 겹친 공백은 접는다 */
  const back = await other.client.unlock({ name: ' ｋｉｍ   YUNHO ', pin: '0042' });
  eq(back.name, 'Kim Yunho', '전각 · 대문자 · 공백이 달라도 같은 이름으로 들어간다');
  eq((await other.client.state()).state.submissionId, i.submissionId, '다시 들어간 기기의 세션이 열린다');
  eq((await i.b.client.state()).state.submissionId, i.submissionId, '처음 기기의 세션도 그대로다');

  /* 동시에 정하기 — 하나만 이기고 이긴 쪽 이름이 남는다 */
  const race = await invite();
  const scope = await openIntakeScope(db, `Intake ${race.token}`, 'read', clock);
  const settled = await Promise.allSettled([
    enrollInvitee(db, scope, { name: '첫째', pin: '1111', pinConfirm: '1111' }, clock),
    enrollInvitee(db, scope, { name: '둘째', pin: '2222', pinConfirm: '2222' }, clock),
  ]);
  const won = settled.filter((s) => s.status === 'fulfilled');
  const lost = settled.filter((s) => s.status === 'rejected');
  eq([won.length, lost.length], [1, 1], '동시 정하기는 하나만 이긴다');
  eq(((lost[0] as PromiseRejectedResult).reason as IntakeError).code, 'invitee_already_enrolled', '진 쪽은 invitee_already_enrolled');
  const winner = (won[0] as PromiseFulfilledResult<{ name: string }>).value.name;
  eq((await db.intakeInvitation.findUniqueOrThrow({ where: { id: race.invitationId } })).inviteeName, winner, '남은 이름은 이긴 쪽');
  eq(await db.intakeInviteeSession.count({ where: { invitationId: race.invitationId } }), 1, '세션도 이긴 쪽 하나');

  /* 횟수 제한(초대별 창) · 누적 잠금 */
  const lk = await enrolled('잠금선수', '0007');
  const atk = browser(lk.token);
  /* 창 경계에 걸리지 않게 창 맨 앞으로 */
  const pinWindowMs = INTAKE_RATE_RULES.pin.windowSec * 1000;
  clock = new Date(Math.ceil(clock.getTime() / pinWindowMs) * pinWindowMs + 1000);
  let failures = 0;
  for (let n = 0; n < INTAKE_RATE_RULES.pin.limit; n++) {
    await failsWith(atk.client.unlock({ name: n % 2 ? '잠금선수' : '남', pin: n % 2 ? '1234' : '0007' }), 'invitee_credentials_wrong', `창 안 틀린 시도 ${n + 1}`);
    failures++;
  }
  const limited = await failsWith(atk.client.unlock({ name: '잠금선수', pin: '0007' }), 'rate_limited', '창의 한도를 넘으면 맞는 값도 rate_limited', 429);
  ok(typeof limited.detail?.retryAfterSec === 'number' && (limited.detail.retryAfterSec as number) > 0 && (limited.detail.retryAfterSec as number) <= INTAKE_RATE_RULES.pin.windowSec, 'retryAfterSec 가 창 안의 남은 초');
  eq((await db.intakeInvitation.findUniqueOrThrow({ where: { id: lk.invitationId } })).pinFailures, failures, '횟수 제한에 걸린 시도는 누적에 안 쌓인다');
  /* 다음 창 — 누적 한도까지 */
  advance(pinWindowMs);
  while (failures < PIN_MAX_FAILURES - 1) {
    await failsWith(atk.client.unlock({ name: '잠금선수', pin: '9999' }), 'invitee_credentials_wrong', `누적 틀린 시도 ${failures + 1}`);
    failures++;
  }
  await failsWith(atk.client.unlock({ name: '잠금선수', pin: '9999' }), 'invitee_locked', `${PIN_MAX_FAILURES}번째 틀림에서 잠긴다`, 423);
  advance(pinWindowMs);
  await failsWith(atk.client.unlock({ name: '잠금선수', pin: '0007' }), 'invitee_locked', '잠기면 맞는 이름 · PIN 도 막힌다', 423);
  eq((await atk.client.gate()).locked, true, '관문이 잠겼다고 말한다');
  eq((await lk.b.client.state()).state.submissionId, lk.submissionId, '잠겨도 이미 연 세션은 그대로다');
  const facts = (await loadIntakeDetail(db, ACTOR, lk.submissionId)).invitee;
  eq([facts.locked, facts.failures, facts.enrolled], [true, PIN_MAX_FAILURES, true], '관리자 상세에 잠금이 보인다');
  eq(await unlockInviteePin(db, { adminId: ADMIN, submissionId: lk.submissionId }, clock), { unlocked: true }, '관리자가 잠금을 푼다');
  eq((await atk.client.unlock({ name: '잠금선수', pin: '0007' })).name, '잠금선수', '푼 뒤 맞는 이름 · PIN 으로 들어간다');
  eq([(await db.intakeInvitation.findUniqueOrThrow({ where: { id: lk.invitationId } })).pinFailures, (await atk.client.gate()).locked], [0, false], '누적이 0 으로 돌아간다');
  ok((await db.intakeAudit.count({ where: { invitationId: lk.invitationId, action: 'invitee.locked' } })) === 1, '잠금 감사 한 줄');

  /* 지우기 — 모든 세션이 끝나고 새로 정할 수 있다 */
  const rs = await enrolled('지울선수', '3333');
  const second = browser(rs.token);
  await second.client.unlock({ name: '지울선수', pin: '3333' });
  eq(await resetInviteeEnrollment(db, { adminId: ADMIN, submissionId: rs.submissionId }, clock), { reset: true }, '이름 · PIN 지우기');
  await failsWith(rs.b.client.state(), 'session_required', '지운 뒤 처음 기기 세션은 끝난다');
  await failsWith(second.client.state(), 'session_required', '지운 뒤 둘째 기기 세션도 끝난다');
  eq(await rs.b.client.gate(), { enrolled: false, locked: false, session: false }, '관문이 다시 정하기 전으로');
  await failsWith(second.client.unlock({ name: '지울선수', pin: '3333' }), 'invitee_not_enrolled', '지운 이름 · PIN 으로는 못 들어간다');
  const reEnroll = browser(rs.token);
  eq((await reEnroll.client.enroll({ name: '새사람', pin: '4444', pinConfirm: '4444' })).name, '새사람', '지운 뒤 새로 정할 수 있다');
  await failsWith(rs.b.client.state(), 'session_required', '예전 세션은 새로 정한 뒤에도 안 살아난다(세대)');
  eq((await reEnroll.client.state()).state.submissionId, rs.submissionId, '새 세션은 열린다');
  eq(await resetInviteeEnrollment(db, { adminId: ADMIN, submissionId: (await invite()).submissionId }, clock), { reset: false }, '정하기 전 초대를 지우면 아무것도 안 한다');
  const adminReset = await adminResetInvitee(db, ACTOR, { submissionId: rs.submissionId }, clock);
  eq(adminReset, { reset: true }, '관리자 동작으로도 지운다');
  await failsWith(reEnroll.client.state(), 'session_required', '관리자 지우기도 세션을 끝낸다');

  /* 링크 바꾸기 — 예전 링크 · 예전 세션은 끝나고, 새 링크에서 같은 이름 · PIN 으로 들어간다 */
  const re = await enrolled('바꿀선수', '0101');
  const reissued = await reissueInvitationToken(db, { adminId: ADMIN, submissionId: re.submissionId, expectedReissueCount: 0 }, clock);
  await failsWith(re.b.client.state(), 'invitation_invalid', '예전 링크는 막힌다', 404);
  const moved = browser(reissued.token, re.b.jar);
  await failsWith(moved.client.state(), 'session_required', '같은 브라우저의 예전 세션 쿠키는 새 링크에서 막힌다');
  eq(await moved.client.gate(), { enrolled: true, locked: false, session: false }, '새 링크의 관문 — 정했고 세션은 없다');
  await failsWith(moved.client.enroll({ name: '가로채기', pin: '9090', pinConfirm: '9090' }), 'invitee_already_enrolled', '새 링크에서 다시 정하지 못한다');
  eq((await moved.client.unlock({ name: '바꿀선수', pin: '0101' })).name, '바꿀선수', '새 링크 + 같은 이름 · PIN 으로 들어간다');
  eq((await moved.client.state()).state.submissionId, re.submissionId, '새 세션으로 같은 접수가 열린다');
}

/* ═══════════════════ C. 세션 끝 ═══════════════════ */
section = 'C';
{
  const i = await enrolled('시계선수', '2468');
  const MIN = 60_000;
  /* 쓰면서 이어 가기 — 2시간이 지나기 전마다 쓴다 */
  advance(SESSION_IDLE_MS - MIN);
  eq((await i.b.client.state()).state.submissionId, i.submissionId, '2시간 직전에 쓰면 이어진다');
  advance(SESSION_IDLE_MS - MIN);
  eq((await i.b.client.state()).state.submissionId, i.submissionId, '쓴 뒤 다시 2시간 직전에도 이어진다');
  eq((await i.b.client.gate()).session, true, '관문도 세션이 있다고 말한다');
  /* 쓰지 않고 2시간 */
  advance(SESSION_IDLE_MS + MIN);
  await failsWith(i.b.client.state(), 'session_expired', '쓰지 않고 2시간이 지나면 session_expired', 401);
  eq((await i.b.client.gate()).session, false, '끝난 세션은 관문에서 없다');
  await failsWith(i.b.client.saveDraft({ expectedVersion: 0, athleteName: 'x' }), 'session_expired', '쓰기 길도 같다');
  eq((await rawCall('result', i.token, { jar: i.b.jar })).code, 'session_expired', '결과 길도 같다');

  /* 써도 12시간 */
  const abs = await enrolled('열두시간', '1357');
  const t0 = clock.getTime();
  while (clock.getTime() - t0 < SESSION_ABSOLUTE_MS - 90 * MIN) {
    advance(90 * MIN);
    eq((await abs.b.client.state()).state.submissionId, abs.submissionId, `계속 쓰는 세션 +${Math.round((clock.getTime() - t0) / 3_600_000 * 10) / 10}시간`);
  }
  clock = new Date(t0 + SESSION_ABSOLUTE_MS - MIN);
  eq((await abs.b.client.state()).state.submissionId, abs.submissionId, '12시간 직전까지 쓴다');
  clock = new Date(t0 + SESSION_ABSOLUTE_MS + MIN);
  await failsWith(abs.b.client.state(), 'session_expired', '써도 12시간이 지나면 session_expired');
  const row = await db.intakeInviteeSession.findFirstOrThrow({ where: { invitationId: abs.invitationId } });
  ok(row.idleExpiresAt.getTime() <= row.expiresAt.getTime(), '쓰지 않는 끝은 전체 끝을 넘지 않는다');
  /* 다시 들어가면 새 세션 */
  eq((await abs.b.client.unlock({ name: '열두시간', pin: '1357' })).name, '열두시간', '끝난 뒤 같은 이름 · PIN 으로 다시 들어간다');
  eq((await abs.b.client.state()).state.submissionId, abs.submissionId, '새 세션이 열린다');
}

/* ═══════════════════ R. 독립 검토가 찾은 경우(2026-11-13) ═══════════════════ */
section = 'R';
{
  /* 지운 · 푼 직후 늦게 끝난 틀린 시도는 새 판을 잠그지 않는다 — 자리를 잡은 뒤(누적 10)에 관리자가 움직인다 */
  for (const adminMove of ['reset', 'unlock'] as const) {
    const i = await enrolled('잠금경합', '1111');
    const inv0 = await db.intakeInvitation.findUniqueOrThrow({ where: { id: i.invitationId } });
    await db.intakeInvitation.update({ where: { id: i.invitationId }, data: { pinFailures: PIN_MAX_FAILURES - 1 } });
    const scope = { invitationId: i.invitationId, submissionId: i.submissionId, tokenHash: inv0.tokenHash };
    const attempt = unlockInvitee(db, scope, { name: '잠금경합', pin: '2222' }, clock).then(
      () => 'ok',
      (e: unknown) => (e instanceof IntakeError ? e.code : String(e)),
    );
    for (let k = 0; k < 400; k++) {
      if ((await db.intakeInvitation.findUniqueOrThrow({ where: { id: i.invitationId } })).pinFailures >= PIN_MAX_FAILURES) break;
      await new Promise((r) => setTimeout(r, 1));
    }
    eq((await db.intakeInvitation.findUniqueOrThrow({ where: { id: i.invitationId } })).pinFailures, PIN_MAX_FAILURES, `${adminMove}: 틀린 시도가 마지막 자리를 잡았다`);
    if (adminMove === 'reset') await resetInviteeEnrollment(db, { adminId: ADMIN, submissionId: i.submissionId }, clock);
    else await unlockInviteePin(db, { adminId: ADMIN, submissionId: i.submissionId }, clock);
    eq(await attempt, 'invitee_credentials_wrong', `${adminMove}: 늦은 틀린 시도는 그냥 틀림으로 끝난다`);
    const after = await db.intakeInvitation.findUniqueOrThrow({ where: { id: i.invitationId } });
    eq(after.pinLockedAt, null, `${adminMove}: 관리자가 움직인 뒤 잠기지 않는다`);
    eq((await i.b.client.gate()).locked, false, `${adminMove}: 관문도 잠기지 않았다고 말한다`);
  }

  /* GPU 실행이 도는 중에는 가져오지 않는다 */
  {
    const i = await enrolled('도는중', '3131');
    await uploadAll(i.b, { hand: HAND });
    const f = await serverShas(i.submissionId);
    await db.intakeAnalysisRun.create({ data: { submissionId: i.submissionId, revisionId: f.revisionId, engineKey: 'gpu-test', status: 'running', resultMeta: {} } });
    await fails(importManual(i.submissionId, f.revisionId, envelope(f.side, f.rear, resultCut())), 'analysis_busy', 'GPU 실행 중이면 가져오기를 막는다');
    eq(await db.intakeAnalysisRun.count({ where: { submissionId: i.submissionId, engineKey: MANUAL_ENGINE_KEY } }), 0, '막힌 가져오기는 실행을 만들지 않는다');
  }

  /* 고침 중 받는 분이 저장만 한 다른 손을 덮지 않는다 — 매니페스트도 낸 손을 적는다 */
  {
    const i = await enrolled('손고침', '5151');
    await uploadAll(i.b, { hand: null });
    const f = await serverShas(i.submissionId);
    await requestCorrection(db, { adminId: ADMIN, submissionId: i.submissionId, fields: ['throwingHand'], views: [], message: '던지는 손을 알려 주세요.' }, clock);
    const { state } = await i.b.client.state();
    await i.b.client.saveDraft({ expectedVersion: state.version, throwingHand: OTHER_HAND });
    const e = await fails(importManual(i.submissionId, f.revisionId, envelope(f.side, f.rear, resultCut())), 'manual_result_hand', '고침 중 다른 손 초안이 있으면 막는다');
    eq(e.detail?.reason, 'correction_draft', '까닭은 고침 초안');
    const sub = await db.intakeSubmission.findUniqueOrThrow({ where: { id: i.submissionId } });
    eq(sub.throwingHand, OTHER_HAND, '받는 분이 저장한 손은 그대로다');
    const m = await buildIntakeManifest(db, ACTOR, { submissionIds: [i.submissionId] }, clock);
    eq(m.entries[0].throwingHand, null, '매니페스트는 아직 낸 손(없음)을 적는다');
  }
}

/* ═══════════════════ Q. 수동 수집은 국외 이전 없이 된다(R03 Q-R03-2) ═══════════════════ */
section = 'Q';
{
  const answer = (kind: 'submission' | 'overseas' | 'model', granted: boolean): ConsentAnswer => ({ kind, version: consentDocOf(kind).version, textHash: consentDocOf(kind).textHash, granted });
  const i = await enrolled('국외없음', '0707');
  /* 국외 이전 · 모델 개발 둘 다 거부 — 제출 · 처리 하나만 동의 */
  const up = await uploadAll(i.b, { hand: HAND, consents: [answer('submission', true), answer('overseas', false), answer('model', false)] });
  ok(up.receipt.receiptCode.length > 0, '국외 이전 없이 접수가 끝난다');
  const { state } = await i.b.client.state();
  eq([state.consent.requiredOk, state.consent.granted.overseas, state.consent.granted.model], [true, false, false], '필수만 찼고 선택 둘은 거부 그대로');
  const f = await serverShas(i.submissionId);
  eq([f.sideAsset.status, f.rearAsset.status, f.sub.status], ['verified', 'verified', 'verified'], '원본 검증까지 간다');

  /* 자동 분석은 국외 이전 문에서 막힌다 — 우회 플래그 · GPU 없이 */
  const ready = await analysisReadiness(i.submissionId, rt);
  ok(ready.blockers.some((b) => b.code === 'analysis_overseas_missing') && !ready.blockers.some((b) => b.code === 'analysis_consent_missing'), '자동 분석의 까닭은 국외 이전이다');
  const gpuOn: IntakeGpu = { ...gpu, configured: () => true, engineBuild: async () => 'q-build' };
  await fails(startIntakeAnalysis({ submissionId: i.submissionId, adminId: ADMIN, confirmDraftConsent: true }, { ...rt, gpu: gpuOn, env: { INTAKE_ALLOW_DRAFT_ANALYSIS: '1' } }), 'analysis_overseas_missing', 'GPU 를 켜고 문서 우회까지 켜도 자동 분석은 막힌다');
  eq(await db.intakeAnalysisRun.count({ where: { submissionId: i.submissionId } }), 0, '막힌 자동 분석은 실행 줄을 안 만든다');

  /* 원본 내려받기 · 매니페스트 · 수동 결과 · 검토 · 공개 · 받는 사람 보기 */
  const links = await issueOriginalLinks(db, storage, ACTOR, { submissionId: i.submissionId, purpose: 'download' }, clock);
  eq(links.length, 2, '국외 이전 없이도 원본 둘을 내려받는다');
  const m = await buildIntakeManifest(db, ACTOR, { submissionIds: [i.submissionId] }, clock);
  eq(m.entries[0].consents, { required: true, overseasAutoAnalysis: false, modelUse: false }, '매니페스트가 쓸 수 있는 범위를 적는다(모델 개발 자료 아님)');
  const run = await importManual(i.submissionId, f.revisionId, envelope(f.side, f.rear, resultCut()));
  const resultOf = (br: Browser) => rawCall('result', br.token, { jar: br.jar });
  eq((await resultOf(i.b)).code, 'result_not_published', '공개 전에는 결과가 없다');
  const pub = await publish(i.submissionId, run.runId, await ack(i.submissionId, run.runId));
  eq(pub.created, true, '국외 이전 없이 수동 결과를 공개한다');
  eq((await resultOf(i.b)).status, 200, '받는 사람이 같은 링크에서 본다');

  /* 동의를 지어내거나 선택 동의를 켜지 않았다 */
  const rows = await db.intakeConsent.findMany({ where: { submissionId: i.submissionId } });
  eq(rows.filter((c) => c.granted).map((c) => c.kind), ['submission'], '동의한 줄은 제출 · 처리 하나뿐 — 국외 이전 · 모델 개발을 저절로 켜지 않는다');
  const d = await loadIntakeDetail(db, ACTOR, i.submissionId, clock);
  eq([d.consentRequiredOk, d.overseasAllowed, d.modelUseAllowed, d.overseasConsentOpen], [true, false, false, false], '관리자 상세가 국외 이전을 따로 보인다');

  /* 국외 이전에 동의했던 분이 철회를 알리면 — 자동 분석만 막히고 수동 결과 길은 그대로다 */
  const j = await enrolled('국외철회', '0808');
  await uploadAll(j.b, { hand: HAND });
  ok((await loadIntakeDetail(db, ACTOR, j.submissionId, clock)).overseasConsentOpen, '거둘 국외 이전 동의가 있다');
  eq(await adminWithdrawOverseasConsent(db, ACTOR, { submissionId: j.submissionId, note: '전화로 알림' }, clock), { withdrawn: true }, '담당자가 국외 이전 철회를 남긴다');
  eq(await adminWithdrawOverseasConsent(db, ACTOR, { submissionId: j.submissionId }, clock), { withdrawn: false }, '두 번째는 거둘 것이 없다');
  const jd = await loadIntakeDetail(db, ACTOR, j.submissionId, clock);
  eq([jd.status, jd.consentRequiredOk, jd.overseasAllowed], ['verified', true, false], '접수는 그대로, 자동 분석만 막힌다');
  ok((await analysisReadiness(j.submissionId, rt)).blockers.some((b) => b.code === 'analysis_overseas_missing'), '철회 뒤 자동 분석의 까닭');
  eq(await db.intakeAudit.count({ where: { submissionId: j.submissionId, action: 'consent.overseas_withdrawn_by_admin' } }), 1, '감사 기록이 하나 남는다');
  const jf = await serverShas(j.submissionId);
  ok((await importManual(j.submissionId, jf.revisionId, envelope(jf.side, jf.rear, resultCut()))).runId, '철회 뒤에도 수동 결과는 가져온다');
}

await db.$disconnect();
await socket.stop();
await pg.close();
const ms = Date.now() - started;
console.log(`intake invitee selftest: ${passed} passed (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}) in ${(ms / 1000).toFixed(1)}s`);
