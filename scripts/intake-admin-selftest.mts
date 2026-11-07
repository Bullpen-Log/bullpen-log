/**
 * 외부 접수 관리자 시험 — 운영 DB 를 건드리지 않고 메모리 안 PostgreSQL(PGlite)에 지금 스키마를 깔아 돌린다. `npm run intake:admin-test`
 *
 * 두 층을 본다.
 *   1) lib/intake/admin.ts — 목록 거름 · 읽음 · 담당 · 메모 · 고침 · 원본 주소(PGlite 진짜 쿼리)
 *   2) app/actions/intake-admin.ts — 진짜 서버 동작 + 진짜 lib/dal + 진짜 베타 관문. 세션 · next/* · 저장소 · 분석 모듈만 바꿔 끼운다
 *
 * lib/prisma 는 이 PGlite 클라이언트로 바꿔 끼운다 — DATABASE_URL 을 읽지 않는다. 저장소 · GPU 도 가짜다.
 * 한계: PGlite 는 연결이 하나라 동시 요청이 줄을 서서 돈다. 두 번 눌림의 결과(비교 후 교체)는 확인하지만, 운영에서 두 연결이 같은 순간에 다투는 모습은 재현되지 않는다.
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import nodeModule from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/* 저장소의 @types/node 가 registerHooks 를 아직 모른다 — 여기서 쓰는 모양만 적어 둔다 */
type ModuleHooks = {
  resolve(specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => unknown): unknown;
  load(url: string, context: unknown, nextLoad: (url: string, context: unknown) => unknown): unknown;
};
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: ModuleHooks): void };

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

/* ── 바꿔 끼우기 — 진짜 동작 파일을 부르기 전에 건다 ── */
type Gate = { session: { userId: string; pw: string } | null; headers: Record<string, string>; calls: string[]; db?: PrismaClient; storage?: unknown };
const g: Gate = { session: null, headers: {}, calls: [] };
(globalThis as unknown as { __intakeTest: Gate }).__intakeTest = g;

const NEXT: Record<string, string> = {
  'next/headers': `const g = globalThis.__intakeTest;
export async function headers() { return new Headers(g.headers); }
export async function cookies() { return { get: () => undefined, getAll: () => [], has: () => false, set() {}, delete() {} }; }`,
  'next/navigation': `const fail = (digest) => { const e = new Error(digest); e.digest = digest; throw e; };
export function redirect(url) { fail('NEXT_REDIRECT;replace;' + url + ';307;'); }
export function notFound() { fail('NEXT_HTTP_ERROR_FALLBACK;404'); }`,
  'next/cache': `export function revalidatePath() {} export function revalidateTag() {} export function refresh() {}`,
  'server-only': 'export {};',
};
const MOCKS: [string, string][] = [
  ['/lib/prisma.ts', 'export const prisma = globalThis.__intakeTest.db;'],
  [
    '/lib/session.ts',
    `const g = globalThis.__intakeTest;
export async function readSession() { return g.session; }
export function passwordFingerprint() { return 'fp'; }`,
  ],
  ['/lib/clock-server.ts', 'export async function ensureSim() {}'],
  ['/lib/intake/storage.ts', 'export const getIntakeStorage = () => globalThis.__intakeTest.storage;'],
  [
    '/lib/intake/analysis.ts',
    `const g = globalThis.__intakeTest;
export async function startIntakeAnalysis(i) { g.calls.push('start:' + i.submissionId + ':' + i.adminId + ':' + i.confirmDraftConsent); return { run: { status: 'requested' }, created: true }; }
export async function setAnalysisHand(i) { g.calls.push('hand:' + i.hand); }
export async function carryInTx() { return null; }
export const runMatchesCurrent = () => false;`,
  ],
  [
    '/lib/intake/publication.ts',
    `const g = globalThis.__intakeTest;
export async function publishRun(i) { g.calls.push(['publish', i.runId, i.submissionId, i.explanation, i.expectedActivePublicationId, i.allowOlderRevision].join(':')); return { replacedRunId: null }; }
export async function unpublish(i) { g.calls.push(['unpublish', i.submissionId, i.expectedActivePublicationId].join(':')); return { unpublished: true }; }`,
  ],
];
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(NEXT, specifier)) return { url: `data:text/javascript,${encodeURIComponent(NEXT[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    for (const [suffix, source] of MOCKS) if (url.endsWith(suffix)) return { format: 'module', source, shortCircuit: true };
    return nextLoad(url, context);
  },
});

/* ── PGlite — 지금 스키마 그대로(운영 DB 에 닿지 않는 diff) ── */
const sql = execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const pg = await PGlite.create();
await pg.exec(sql);
const server = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await server.start();
const addr = (server as unknown as { server: { address(): { port: number } } }).server.address();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${addr.port}/postgres?sslmode=disable`, max: 1 }) });
g.db = db;

const admin = await import('@/lib/intake/admin');
const { assetObjectPath } = await import('@/lib/intake/paths');
const { openIntakeScope } = await import('@/lib/intake/access');
const { IntakeError } = await import('@/lib/intake/errors');
const { hashInvitationToken } = await import('@/lib/intake/token');
const { ASSET_STATUS_TEXT, AUDIT_ACTION_TEXT, retentionCellText, retentionLineText, sampleDurationLabel, seoulDateText } = await import('@/lib/intake/admin-labels');

const {
  addIntakeNote,
  adminCancelCorrection,
  adminCreateInvitation,
  adminExtendUploadWindow,
  adminRequestCorrection,
  adminRequeueVerification,
  adminResetAccessCodeLock,
  adminRevokeInvitation,
  adminWithdrawConsent,
  assignSubmission,
  deleteIntakeNote,
  issueOriginalLinks,
  issueRunPreviewLink,
  jobErrorText,
  loadIntakeDetail,
  loadIntakeList,
  markIntakeRead,
  markIntakeUnread,
  parseIntakeFilters,
  INTAKE_PAGE_SIZE,
} = admin;

async function fails(p: Promise<unknown>, code: string, label: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof IntakeError, `${label}: IntakeError 가 아니에요 — ${String(e)}`);
    assert.equal(e.code, code, label);
    return true;
  });
  if (process.env.V) console.log('ok', label);
  passed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── 사람 ── */
const mkUser = (name: string, role: 'USER' | 'MANAGER' | 'ADMIN') => db.user.create({ data: { email: `${name}@t.test`, password: 'x', nickname: name, role } });
const [uA, uB, uM, uU] = [await mkUser('대표A', 'ADMIN'), await mkUser('대표B', 'ADMIN'), await mkUser('준관리', 'MANAGER'), await mkUser('일반', 'USER')];
const A = { id: uA.id, role: uA.role };
const B = { id: uB.id, role: uB.role };
const M = { id: uM.id, role: uM.role };
const U = { id: uU.id, role: uU.role };

/* ── 가짜 저장소 ── */
const issued: string[] = [];
const missingObjects = new Set<string>();
const storage = {
  uploadOrigin: 'https://proj.storage.supabase.co',
  async stat(path: string) {
    return missingObjects.has(path) ? null : { size: 1000, contentType: 'video/mp4' };
  },
  async readUrl(path: string, opts?: { ttlSec?: number; download?: string }) {
    issued.push(path);
    return `https://proj.storage.supabase.co/object/sign/${path}?token=sig${opts?.download ? `&download=${encodeURIComponent(opts.download)}` : ''}`;
  },
} as unknown as import('@/lib/intake/storage-core').IntakeStorage;
g.storage = storage;

/* ── 접수 만들기 ── */
const NOW = new Date('2026-11-06T03:00:00Z');
type Fix = Partial<{ name: string | null; status: string; analysis: string; publication: string; receivedAt: Date | null; assignee: string | null; note: string; receipt: string; hours: number }>;
let serial = 0;
async function mk(f: Fix = {}) {
  serial++;
  const inv = await adminCreateInvitation(db, A, { note: f.note ?? null }, NOW);
  const receivedAt = f.receivedAt === undefined ? new Date(NOW.getTime() - (f.hours ?? serial) * 3_600_000) : f.receivedAt;
  await db.intakeSubmission.update({
    where: { id: inv.submissionId },
    data: {
      athleteName: f.name === undefined ? `선수${serial}` : f.name,
      status: f.status ?? 'verified',
      analysisStatus: f.analysis ?? 'none',
      publicationStatus: f.publication ?? 'unpublished',
      receivedAt,
      receiptCode: receivedAt ? (f.receipt ?? `IN-261106-T${String(serial).padStart(5, '0')}`) : null,
      assigneeAdminId: f.assignee ?? null,
    },
  });
  return inv;
}

async function mkAsset(submissionId: string, view: 'side' | 'rear', status = 'verified', extra: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  await db.intakeAsset.create({
    data: {
      id,
      submissionId,
      view,
      objectPath: assetObjectPath(submissionId, id),
      status,
      originalName: `IMG_${view}.MOV`,
      declaredType: 'video/quicktime',
      declaredSize: BigInt(1000),
      clientSha256: `${view === 'side' ? 'a' : 'b'}`.repeat(64),
      serverSha256: status === 'verified' ? `${view === 'side' ? 'a' : 'b'}`.repeat(64) : null,
      storedBytes: status === 'verified' ? BigInt(1000) : null,
      uploadedAt: status === 'verified' ? NOW : null,
      mediaFacts: { container: 'mov', nominalFps: 240, averageFps: 239.76, frameTiming: 'constant', editList: { present: true, segments: 3, retimed: true, shiftSec: 0 } },
      ...extra,
    },
  });
  await db.intakeSubmission.update({ where: { id: submissionId }, data: { [view === 'side' ? 'sideAssetId' : 'rearAssetId']: id } });
  return id;
}

const noFilter = parseIntakeFilters({});
const auditCount = () => db.intakeAudit.count();

/* ═══════════ 1. 권한 ═══════════ */
{
  const sub = await mk({ name: '권한시험' });
  const before = await auditCount();
  const id = sub.submissionId;
  const calls: [string, (actor: typeof U | null) => Promise<unknown>][] = [
    ['loadIntakeList', (a) => loadIntakeList(db, a!, noFilter)],
    ['loadIntakeDetail', (a) => loadIntakeDetail(db, a!, id)],
    ['adminCreateInvitation', (a) => adminCreateInvitation(db, a!, {})],
    ['adminRevokeInvitation', (a) => adminRevokeInvitation(db, a!, { submissionId: id })],
    ['assignSubmission', (a) => assignSubmission(db, a!, { submissionId: id, assigneeId: A.id, expectedAssigneeId: null })],
    ['markIntakeRead', (a) => markIntakeRead(db, a!, id)],
    ['markIntakeUnread', (a) => markIntakeUnread(db, a!, id)],
    ['addIntakeNote', (a) => addIntakeNote(db, a!, { submissionId: id, body: '메모' })],
    ['deleteIntakeNote', (a) => deleteIntakeNote(db, a!, { submissionId: id, noteId: id })],
    ['adminRequestCorrection', (a) => adminRequestCorrection(db, a!, { submissionId: id, expectedVersion: 0, views: ['side'] })],
    ['adminCancelCorrection', (a) => adminCancelCorrection(db, a!, { submissionId: id, expectedVersion: 0 })],
    ['adminExtendUploadWindow', (a) => adminExtendUploadWindow(db, a!, { submissionId: id, days: 3 })],
    ['adminResetAccessCodeLock', (a) => adminResetAccessCodeLock(db, a!, { submissionId: id })],
    ['adminWithdrawConsent', (a) => adminWithdrawConsent(db, a!, { submissionId: id })],
    ['adminRequeueVerification', (a) => adminRequeueVerification(db, a!, { submissionId: id })],
    ['issueOriginalLinks', (a) => issueOriginalLinks(db, storage, a!, { submissionId: id, purpose: 'download' })],
    ['issueRunPreviewLink', (a) => issueRunPreviewLink(db, storage, a!, { submissionId: id, runId: id, view: 'side' })],
  ];
  for (const [name, call] of calls) {
    await fails(call(U), 'admin_forbidden', `일반 사용자는 ${name} 불가`);
    await fails(call(M), 'admin_forbidden', `준관리자는 ${name} 불가`);
    await fails(call(null), 'admin_forbidden', `비로그인은 ${name} 불가`);
  }
  eq(await auditCount(), before, '막힌 호출은 기록을 남기지 않는다');
  eq((await db.intakeSubmission.findUniqueOrThrow({ where: { id } })).assigneeAdminId, null, '막힌 호출은 담당자를 안 바꾼다');
  eq(await db.intakeAdminRead.count({ where: { submissionId: id } }), 0, '막힌 호출은 읽음을 안 남긴다');
  /* 권한은 만든 사람이 아니라 역할로 — 대표B 도 대표A 가 만든 접수를 본다 */
  eq((await loadIntakeDetail(db, B, id)).id, id, '다른 대표관리자도 같은 접수를 본다');
}

/* ═══════════ 2. 진짜 서버 동작 — 세션 · 베타 관문까지 ═══════════ */
{
  const sub = await mk({ name: '동작시험' });
  const asset = await mkAsset(sub.submissionId, 'side');
  await mkAsset(sub.submissionId, 'rear');
  const id = sub.submissionId;
  const actions = await import('@/app/actions/intake-admin');
  const src = readFileSync('app/actions/intake-admin.ts', 'utf8');
  const names = [...src.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
  ok(names.length >= 15, `서버 동작 ${names.length}개`);
  ok(src.includes("allowAdmin('intake')") && src.includes("requirePermission('intake')"), '동작이 베타 밝힘 줄과 권한을 함께 본다');
  for (const n of names) {
    const body = src.slice(src.indexOf(`export async function ${n}(`)).split('\nexport ')[0];
    ok(body.includes('asAdmin('), `${n} 은 권한 헬퍼를 지난다`);
  }

  const A_ = actions as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const CALLS: Record<string, unknown[]> = {
    createIntakeInvitation: [{}],
    revokeIntakeInvitation: [id],
    assignIntake: [id, A.id, null],
    markIntakeSeen: [id],
    markIntakeUnseen: [id],
    addIntakeAdminNote: [id, '메모'],
    deleteIntakeAdminNote: [id, id],
    requestIntakeCorrection: [{ submissionId: id, expectedVersion: 0, views: ['side'] }],
    cancelIntakeCorrection: [id, 0],
    extendIntakeUploadWindow: [id, 3],
    resetIntakeAccessCodeLock: [id],
    withdrawIntakeConsent: [id, '메모'],
    withdrawIntakeModelConsent: [id, '메모'],
    requeueIntakeVerification: [id],
    getIntakeOriginalLink: [id, asset, 'download'],
    getIntakePairLinks: [id],
    getIntakeRunPreview: [id, id, 'side'],
    setIntakeHand: [id, 'R'],
    runIntakeAnalysis: [id],
    publishIntakeRun: [id, id, '설명', null],
    unpublishIntake: [id, null],
  };
  eq(Object.keys(CALLS).sort(), [...names].sort(), '시험 표가 모든 동작을 덮는다');

  const counts = async () => [await db.intakeInvitation.count(), await auditCount(), await db.intakeAdminNote.count(), await db.intakeAdminRead.count()];
  const denied = async (who: { id: string } | null, stage: string, expect: (e: { message: string; digest?: string; code?: string }) => boolean, label: string) => {
    process.env.RELEASE_STAGE = stage;
    g.session = who ? { userId: who.id, pw: 'fp' } : null;
    g.headers = { 'x-bp-entry': 'action', 'x-bp-path': '/admin/intake' };
    for (const n of names) {
      const before = await counts();
      issued.length = 0;
      g.calls.length = 0;
      await assert.rejects(A_[n](...CALLS[n]), (e: { message: string; digest?: string; code?: string }) => expect(e), `${label}: ${n}`);
      eq(await counts(), before, `${label}: ${n} 은 아무것도 안 쓴다`);
      eq([issued.length, g.calls.length], [0, 0], `${label}: ${n} 은 주소를 내지 않고 분석을 안 건다`);
    }
  };
  const redirectTo = (to: string) => (e: { digest?: string }) => (e.digest ?? '').includes(`;${to};`);
  const locked = (e: { code?: string }) => e.code === 'FEATURE_LOCKED_BETA';
  await denied(null, 'released', redirectTo('/login'), '비로그인(정식)');
  await denied(uU, 'released', redirectTo('/today'), '일반(정식)');
  await denied(uM, 'released', redirectTo('/today'), '준관리자(정식)');
  await denied(uU, 'restricted_beta', locked, '일반(베타)');
  await denied(uM, 'restricted_beta', locked, '준관리자(베타)');

  /* 대표관리자는 베타에도 지나간다 */
  process.env.RELEASE_STAGE = 'restricted_beta';
  g.session = { userId: A.id, pw: 'fp' };
  const made = (await actions.createIntakeInvitation({ note: '동작으로 만듦' })) as { ok: true; token: string; submissionId: string };
  ok(made.ok && /^[A-Za-z0-9_-]{40,}$/.test(made.token), '대표관리자는 초대를 만든다');
  const stored = await db.intakeInvitation.findFirstOrThrow({ where: { submission: { id: made.submissionId } } });
  eq(stored.tokenHash, hashInvitationToken(made.token), '토큰은 해시만 저장한다');
  const trail = JSON.stringify(await db.intakeAudit.findMany({ where: { submissionId: made.submissionId } }));
  ok(!trail.includes(made.token), '토큰은 감사 기록에 없다');

  const links = (await actions.getIntakePairLinks(id)) as { ok: true; links: { url: string }[] };
  eq([links.ok, links.links.length], [true, 2], '대표관리자는 짝 주소를 받는다');
  const stale = await actions.assignIntake(id, A.id, B.id);
  ok(!stale.ok && stale.code === 'stale_assignee', '아는 실패는 답으로 돌아온다');

  g.calls.length = 0;
  await actions.runIntakeAnalysis(id, true);
  await actions.publishIntakeRun(id, id, '승인한 설명', null);
  await actions.publishIntakeRun(id, id, '옛 판', id, { allowOlderRevision: true });
  await actions.unpublishIntake(id, id);
  await actions.setIntakeHand(id, 'L');
  eq(
    g.calls,
    [`start:${id}:${A.id}:true`, `publish:${id}:${id}:승인한 설명::false`, `publish:${id}:${id}:옛 판:${id}:true`, `unpublish:${id}:${id}`, 'hand:L'],
    '분석 · 공개는 약속한 함수로 넘기고, 화면이 알던 공개를 그대로 전한다',
  );

  /* 동의 철회 — 동의 글이 약속한 길. 서버 동작부터 진짜 lib/dal · admin · service 를 지난다 */
  const w = await mk({ name: '철회동작' });
  const wSide = await mkAsset(w.submissionId, 'side');
  const wRear = await mkAsset(w.submissionId, 'rear');
  const wRev = await db.intakeRevision.create({
    data: { submissionId: w.submissionId, number: 1, sideAssetId: wSide, rearAssetId: wRear, athleteName: '철회동작', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'w'.repeat(16), finalizedAt: NOW, status: 'verified' },
  });
  await db.intakeSubmission.update({ where: { id: w.submissionId }, data: { currentRevisionId: wRev.id, publicationStatus: 'published' } });
  const wRun = await db.intakeAnalysisRun.create({ data: { submissionId: w.submissionId, revisionId: wRev.id, engineKey: 'e', status: 'succeeded' } });
  await db.intakePublication.create({ data: { submissionId: w.submissionId, runId: wRun.id, number: 1, activeFor: w.submissionId, publishedByAdminId: A.id, publishedAt: NOW } });
  for (const kind of ['submission', 'overseas', 'model']) {
    await db.intakeConsent.create({ data: { submissionId: w.submissionId, kind, docVersion: 'v1', textHash: 'h', granted: true, relation: 'self', agreedAt: NOW } });
  }
  const before = (await actions.getIntakePairLinks(w.submissionId)) as { ok: boolean };
  ok(before.ok, '철회 전에는 원본 주소를 받는다');
  const done = (await actions.withdrawIntakeConsent(w.submissionId, '보호자가 전화로 요청')) as { ok: true; withdrawn: boolean; unpublished: boolean };
  eq([done.ok, done.withdrawn, done.unpublished], [true, true, true], '대표관리자가 철회를 남기면 공개도 닫힌다');
  const wSub = await db.intakeSubmission.findUniqueOrThrow({ where: { id: w.submissionId } });
  eq([wSub.status, wSub.publicationStatus], ['withdrawn', 'unpublished'], '접수가 철회 상태가 된다');
  const rows = await db.intakeConsent.findMany({ where: { submissionId: w.submissionId } });
  eq(rows.filter((c) => c.withdrawnAt != null).map((c) => c.kind).sort(), ['overseas', 'submission'], '필수 동의 줄에 철회 시각이 남고 선택 동의는 그대로다');
  const record = await db.intakeAudit.findFirstOrThrow({ where: { submissionId: w.submissionId, action: 'consent.withdrawn_by_admin' } });
  eq([record.actorKind, record.actorId, (record.detail as { note?: string }).note], ['admin', A.id, '보호자가 전화로 요청'], '누가 무엇을 남겼는지 기록한다');
  const lockedPair = await actions.getIntakePairLinks(w.submissionId);
  ok(!lockedPair.ok && lockedPair.code === 'original_locked', '철회 뒤에는 동작으로도 원본 주소가 안 나온다');
  const lockedOne = await actions.getIntakeOriginalLink(w.submissionId, wSide, 'preview');
  ok(!lockedOne.ok && lockedOne.code === 'original_locked', '미리보기 주소도 안 나온다');
  const lockedRequeue = await actions.requeueIntakeVerification(w.submissionId);
  ok(!lockedRequeue.ok && lockedRequeue.code === 'original_locked', '철회된 접수는 다시 확인도 안 건다');
  const detail = await loadIntakeDetail(db, A, w.submissionId, NOW);
  eq([detail.status, detail.consentRequiredOk, detail.activePublicationId], ['withdrawn', false, null], '상세가 철회를 보인다');
  const twice = (await actions.withdrawIntakeConsent(w.submissionId)) as { ok: true; withdrawn: boolean };
  eq(twice.withdrawn, false, '두 번 눌러도 처음 기록이 남는다');
  eq(await db.intakeAudit.count({ where: { submissionId: w.submissionId, action: 'consent.withdrawn_by_admin' } }), 1, '철회 기록은 한 줄');
  await markIntakeRead(db, B, w.submissionId);

  /* 화면 글이 없는 감사 기록이 없다 — 관리자가 코드를 읽지 않게 */
  const code = ['admin', 'analysis', 'access', 'publication', 'service'].map((f) => readFileSync(`lib/intake/${f}.ts`, 'utf8')).join('\n');
  for (const [, a, b] of code.matchAll(/action: (?:\w+ \? )?'([a-z_]+\.[a-z_]+)'(?: : '([a-z_]+\.[a-z_]+)')?/g)) {
    for (const action of [a, b].filter(Boolean)) ok(action in AUDIT_ACTION_TEXT, `감사 기록 글이 있다: ${action}`);
  }

  g.session = null;
  process.env.RELEASE_STAGE = 'released';
}

/* ═══════════ 3. 담당자 — 두 관리자가 동시에 ═══════════ */
{
  const { submissionId: id } = await mk({ name: '담당시험' });
  const before = await db.intakeAudit.count({ where: { submissionId: id, action: 'assignee.changed' } });
  const r = await Promise.allSettled([
    assignSubmission(db, A, { submissionId: id, assigneeId: A.id, expectedAssigneeId: null }),
    assignSubmission(db, B, { submissionId: id, assigneeId: B.id, expectedAssigneeId: null }),
  ]);
  const won = r.filter((x) => x.status === 'fulfilled');
  const lost = r.filter((x): x is PromiseRejectedResult => x.status === 'rejected');
  eq([won.length, lost.length], [1, 1], '둘 중 하나만 된다');
  eq((lost[0].reason as InstanceType<typeof IntakeError>).code, 'stale_assignee', '진 쪽은 stale_assignee');
  const now = await db.intakeSubmission.findUniqueOrThrow({ where: { id } });
  eq((lost[0].reason as InstanceType<typeof IntakeError>).detail?.currentAssigneeId, now.assigneeAdminId, '진 쪽에게 지금 담당자를 알린다');
  eq(await db.intakeAudit.count({ where: { submissionId: id, action: 'assignee.changed' } }), before + 1, '기록은 한 줄');
  const winner = now.assigneeAdminId!;

  const again = await assignSubmission(db, A, { submissionId: id, assigneeId: winner, expectedAssigneeId: null });
  eq(again, { assigneeId: winner, changed: false }, '같은 사람을 또 누르면 이미 된 일이다');
  await fails(assignSubmission(db, A, { submissionId: id, assigneeId: uU.id, expectedAssigneeId: winner }), 'invalid_input', '권한 없는 사람에게 못 맡긴다');
  await fails(assignSubmission(db, A, { submissionId: id, assigneeId: uM.id, expectedAssigneeId: winner }), 'invalid_input', '준관리자에게 못 맡긴다');
  const cleared = await assignSubmission(db, B, { submissionId: id, assigneeId: null, expectedAssigneeId: winner });
  eq(cleared, { assigneeId: null, changed: true }, '담당을 비울 수 있다');
  eq((await db.intakeSubmission.findUniqueOrThrow({ where: { id } })).version, now.version, '담당자는 받는 사람의 판 번호를 안 올린다');
  await fails(assignSubmission(db, A, { submissionId: crypto.randomUUID(), assigneeId: null, expectedAssigneeId: A.id }), 'submission_not_found', '없는 접수');
}

/* ═══════════ 4. 읽음 — 관리자마다 따로 ═══════════ */
{
  const { submissionId: id } = await mk({ name: '읽음시험' });
  const rowOf = async (actor: typeof A) => (await loadIntakeList(db, actor, parseIntakeFilters({ q: '읽음시험' }))).rows[0];
  eq([(await rowOf(A)).unread, (await rowOf(B)).unread], [true, true], '처음에는 둘 다 안 읽음');

  await markIntakeRead(db, A, id);
  eq([(await rowOf(A)).unread, (await rowOf(B)).unread], [false, true], 'A 가 읽어도 B 는 그대로');
  const aCount = (await loadIntakeList(db, A, noFilter)).unreadCount;
  const bCount = (await loadIntakeList(db, B, noFilter)).unreadCount;
  ok(bCount === aCount + 1, 'A 의 안 읽음 수만 줄었다');
  const onlyUnreadB = await loadIntakeList(db, B, parseIntakeFilters({ unread: '1', q: '읽음시험' }));
  const onlyUnreadA = await loadIntakeList(db, A, parseIntakeFilters({ unread: '1', q: '읽음시험' }));
  eq([onlyUnreadB.total, onlyUnreadA.total], [1, 0], '안 읽음 거름도 사람마다 다르다');

  await markIntakeRead(db, B, id);
  await markIntakeUnread(db, A, id);
  eq([(await rowOf(A)).unread, (await rowOf(B)).unread], [true, false], 'A 를 안 읽음으로 되돌려도 B 는 그대로');

  await markIntakeRead(db, A, id);
  await sleep(5);
  await db.intakeSubmission.update({ where: { id }, data: { analysisStatus: 'succeeded' } });
  eq([(await rowOf(A)).unread, (await rowOf(B)).unread], [true, true], '읽은 뒤 접수가 바뀌면 다시 안 읽음');

  await sleep(5);
  await assignSubmission(db, A, { submissionId: id, assigneeId: A.id, expectedAssigneeId: null });
  eq([(await rowOf(A)).unread, (await rowOf(B)).unread], [false, true], '내가 맡은 일은 내게 안 읽음이 되지 않는다');

  const draft = await mk({ name: '초안', status: 'draft', receivedAt: null });
  ok(!(await loadIntakeList(db, A, parseIntakeFilters({ q: '초안' }))).rows[0].unread, '받는 사람이 쓰는 중인 초안은 안 읽음으로 안 센다');
  await fails(markIntakeRead(db, A, crypto.randomUUID()), 'submission_not_found', '없는 접수는 읽음을 안 남긴다');
  eq(await db.intakeAdminRead.count({ where: { submissionId: draft.submissionId } }), 0, '초안에 읽음 줄이 없다');
}

/* ═══════════ 5. 목록 거름 · 쪽 ═══════════ */
{
  const tag = 'LIST';
  const a = await mk({ name: `${tag}김민수`, status: 'verified', analysis: 'ready', assignee: A.id, hours: 1 });
  const b = await mk({ name: `${tag}Kim Min-su`, status: 'needs_attention', analysis: 'none', assignee: B.id, hours: 2 });
  const c = await mk({ name: `${tag}오브라이언`, status: 'correction_requested', analysis: 'failed', hours: 3 });
  const d = await mk({ name: `${tag}공개`, status: 'verified', analysis: 'succeeded', publication: 'published', hours: 4, receipt: 'IN-261106-FINDME' });
  const e = await mk({ name: null, status: 'draft', receivedAt: null, note: `${tag}코치 김에게 보낸 링크` });
  const f = await mk({ name: `${tag}철회`, status: 'withdrawn', hours: 5 });
  await adminRevokeInvitation(db, A, { submissionId: f.submissionId }, NOW);
  await db.intakeSubmission.update({ where: { id: f.submissionId }, data: { submitterName: `${tag}보호자` } });

  const ids = async (raw: Record<string, string>, who = A) => (await loadIntakeList(db, who, parseIntakeFilters(raw), NOW)).rows.map((r) => r.id);
  eq(await ids({ q: `${tag}김민수` }), [a.submissionId], '이름으로 찾기');
  eq(await ids({ q: `${tag.toLowerCase()}kim min` }), [b.submissionId], '영문 이름은 대소문자를 안 가린다');
  eq(await ids({ q: 'findme' }), [d.submissionId], '접수 번호로 찾기');
  eq(await ids({ q: `${tag}보호자` }), [f.submissionId], '보낸 분으로 찾기');
  eq(await ids({ q: `${tag}코치 김` }), [e.submissionId], '초대 메모로 찾기');
  eq(await ids({ q: `${tag}없는이름` }), [], '없는 이름');
  eq(await ids({ q: tag, status: 'needs_attention' }), [b.submissionId], '검증 거름');
  eq(await ids({ q: tag, analysis: 'failed' }), [c.submissionId], '분석 거름');
  eq(await ids({ q: tag, publication: 'published' }), [d.submissionId], '공개 거름');
  eq(await ids({ q: tag, invitation: 'revoked' }), [f.submissionId], '초대 거름');
  eq(await ids({ q: tag, assignee: 'me' }), [a.submissionId], '내 담당(A)');
  eq(await ids({ q: tag, assignee: 'me' }, B), [b.submissionId], '내 담당(B)');
  eq(await ids({ q: tag, assignee: B.id }), [b.submissionId], '담당자 번호로');
  eq((await ids({ q: tag, assignee: 'none' })).sort(), [c.submissionId, d.submissionId, e.submissionId, f.submissionId].sort(), '담당 없음');
  eq(await ids({ q: tag, status: 'verified', analysis: 'ready', assignee: 'me' }), [a.submissionId], '조건을 겹친다');
  eq((await ids({ q: tag })).at(-1), e.submissionId, '접수 전은 뒤로');

  const row = (await loadIntakeList(db, A, parseIntakeFilters({ q: 'FINDME' }), NOW)).rows[0];
  eq([row.receiptCode, row.side, row.rear, row.publicationStatus, row.assigneeName], ['IN-261106-FINDME', 'empty', 'empty', 'published', null], '목록 칸');

  await mkAsset(a.submissionId, 'side');
  await mkAsset(a.submissionId, 'rear', 'uploading');
  const aRow = (await loadIntakeList(db, A, parseIntakeFilters({ q: `${tag}김민수` }), NOW)).rows[0];
  eq([aRow.side, aRow.rear, aRow.assigneeName], ['verified', 'transit', '대표A'], '옆 · 뒤 완료 · 담당 이름');

  /* 모르는 값은 조건에서 빠진다 — SQL 로 들어가지 않는다 */
  const parsed = parseIntakeFilters({ status: "verified' OR 1=1 --", analysis: 'x', publication: 'y', invitation: 'z', assignee: '../etc', page: '-3', q: `  a\u0000b  ${'가'.repeat(99)}`, unread: 'yes' });
  eq([parsed.status, parsed.analysis, parsed.publication, parsed.invitation, parsed.assignee, parsed.page, parsed.unread], [null, null, null, null, null, 1, false], '모르는 거름 값은 버린다');
  eq([...parsed.q!].length, 60, '찾는 글은 60자까지');
  ok(!parsed.q!.includes('\u0000'), '제어 글자는 뺀다');
  eq(parseIntakeFilters({ status: ['verified', 'draft'] }).status, 'verified', '같은 칸이 둘이면 첫째만');

  /* 쪽 */
  const page = 'PAGE';
  for (let i = 0; i < INTAKE_PAGE_SIZE + 3; i++) await mk({ name: `${page}${i}`, hours: 100 + i });
  const p1 = await loadIntakeList(db, A, parseIntakeFilters({ q: page }), NOW);
  const p2 = await loadIntakeList(db, A, parseIntakeFilters({ q: page, page: '2' }), NOW);
  const p9 = await loadIntakeList(db, A, parseIntakeFilters({ q: page, page: '9' }), NOW);
  eq([p1.rows.length, p1.total, p1.pageCount, p2.rows.length, p2.page, p9.page], [INTAKE_PAGE_SIZE, INTAKE_PAGE_SIZE + 3, 2, 3, 2, 2], '쪽 나누기 · 넘친 쪽은 끝쪽으로');
  eq(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size, INTAKE_PAGE_SIZE + 3, '쪽 사이에 겹침이 없다');
  eq(p1.rows[0].athleteName, `${page}0`, '최근 접수부터');
  eq((await loadIntakeList(db, A, noFilter, NOW)).admins.map((x) => x.name).sort(), ['대표A', '대표B'], '담당 후보는 권한 있는 사람만');
}

/* ═══════════ 6. 상세 — 비밀이 안 나간다 ═══════════ */
{
  const inv = await adminCreateInvitation(db, A, { note: '상세', accessCode: 'code-1234' }, NOW);
  const id = inv.submissionId;
  await db.intakeSubmission.update({ where: { id }, data: { athleteName: '상세시험', status: 'verified', receivedAt: NOW, receiptCode: 'IN-261106-DETAIL' } });
  const side = await mkAsset(id, 'side', 'verified', { uploadUrl: 'https://proj.storage.supabase.co/storage/v1/upload/resumable/secret-upload-id', captureAt: new Date('2026-11-01T01:00:00Z'), captureAtSource: 'apple' });
  await mkAsset(id, 'rear');
  await addIntakeNote(db, B, { submissionId: id, body: '내부에서만 볼 메모' }, NOW);
  const d = await loadIntakeDetail(db, A, id, NOW);
  const row = await db.intakeInvitation.findUniqueOrThrow({ where: { id: inv.invitationId } });
  const json = JSON.stringify(d);
  ok(!json.includes(row.tokenHash) && !json.includes(row.accessCodeHash!), '토큰 · 코드 해시가 안 나간다');
  ok(!json.includes('secret-upload-id') && !json.includes(`sub/${id}/`), '저장 경로 · 전송 주소가 안 나간다');
  ok(!json.includes(inv.token), '토큰 원문이 안 나간다');
  const a = d.assets.find((x) => x.id === side)!;
  eq([a.fps, a.integrity, a.hashMatched, a.available, a.captureAtSource], ['240fps 감지', '선택한 파일 그대로 전송됨', true, true, 'apple'], '파일 사실');
  ok(a.timing?.startsWith('재생 속도를 바꾼 구간이 있어요'), '슬로 모션 안내');
  eq([d.invitation.hasAccessCode, d.notes[0].body, d.notes[0].mine, d.notes[0].author], [true, '내부에서만 볼 메모', false, '대표B'], '코드 유무 · 메모');
  eq(a.durationLabel, '표본 시간', '재생 속도를 바꾼 파일의 표본 시간을 촬영 길이라고 안 부른다');
  const steady = { frameTiming: 'constant', nominalFps: 240, editList: { present: false, segments: 0, retimed: false, trimmed: false, shiftSec: 0 } } as const;
  eq(sampleDurationLabel(steady), '촬영 길이', '일정한 고속 영상만 촬영 길이다');
  eq(sampleDurationLabel({ ...steady, nominalFps: 30 }), '표본 시간', '내보낸 슬로 모션은 표본 시간이 늘어나 있다');
  eq(sampleDurationLabel({ ...steady, frameTiming: 'variable' }), '표본 시간', '장면 간격이 고르지 않으면 표본 시간이다');
  eq(sampleDurationLabel(null), '표본 시간', '사실이 없으면 표본 시간이다');
  eq(d.activePublicationId, null, '공개가 없으면 알던 공개도 없다');
  ok(d.audit.some((x) => x.action === 'invitation.created' && x.actor === '대표A'), '감사 기록에 사람 이름');
  await fails(loadIntakeDetail(db, A, 'not-a-uuid'), 'submission_not_found', '번호 모양이 틀리면 없는 접수');

  /* 메모 */
  const note = await addIntakeNote(db, A, { submissionId: id, body: `  줄바꿈\n그대로\u0007  ` }, NOW);
  eq((await db.intakeAdminNote.findUniqueOrThrow({ where: { id: note.id } })).body, '줄바꿈\n그대로', '메모 다듬기');
  ok(!JSON.stringify(await db.intakeAudit.findMany({ where: { submissionId: id } })).includes('줄바꿈'), '메모 내용은 감사 기록에 없다');
  await fails(addIntakeNote(db, A, { submissionId: id, body: '   ' }), 'invalid_input', '빈 메모');
  await fails(addIntakeNote(db, A, { submissionId: id, body: '가'.repeat(2001) }), 'invalid_input', '긴 메모');
  await fails(deleteIntakeNote(db, B, { submissionId: id, noteId: note.id }), 'note_not_found', '남의 메모는 못 지운다');
  await deleteIntakeNote(db, A, { submissionId: id, noteId: note.id }, NOW);
  await fails(deleteIntakeNote(db, A, { submissionId: id, noteId: note.id }), 'note_not_found', '두 번 못 지운다');
  eq((await loadIntakeDetail(db, A, id, NOW)).notes.length, 1, '지운 메모는 안 보인다');
}

/* ═══════════ 6-1. 멈춘 일감 — 관리자가 까닭을 본다 ═══════════ */
{
  const inv = await adminCreateInvitation(db, A, { note: '일감' }, NOW);
  const id = inv.submissionId;
  await db.intakeSubmission.update({ where: { id }, data: { athleteName: '일감시험', status: 'submitted', receivedAt: NOW, receiptCode: 'IN-261106-JOBS01' } });
  const side = await mkAsset(id, 'side', 'verifying');
  const rear = await mkAsset(id, 'rear', 'verifying');
  const rev = await db.intakeRevision.create({
    data: { submissionId: id, number: 1, sideAssetId: side, rearAssetId: rear, athleteName: '일감시험', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'j'.repeat(16), finalizedAt: NOW },
  });
  await db.intakeSubmission.update({ where: { id }, data: { currentRevisionId: rev.id } });
  const other = await mk({ name: '남의 일감' });
  const foreign = await mkAsset(other.submissionId, 'side', 'verifying');
  const secret = `https://proj.storage.supabase.co/object/sign/sub/${id}/${side}/original?token=abc 저장소 응답 실패 sub/${id}/${side}/original`;
  const job = (over: Record<string, unknown>) => db.intakeJob.create({ data: { kind: 'verify_asset', payload: {}, runAfter: NOW, ...over } as never });
  await job({ payload: { assetId: side }, status: 'failed', attempts: 8, lastError: secret, finishedAt: NOW });
  await job({ payload: { assetId: rear }, status: 'queued', attempts: 2, lastError: '저장소 응답 실패', runAfter: new Date(NOW.getTime() + 60_000) });
  await job({ kind: 'register_revision', payload: { revisionId: rev.id }, status: 'running', attempts: 1, leaseOwner: 'w', leaseUntil: new Date(NOW.getTime() - 60_000) });
  await job({ payload: { assetId: side }, status: 'queued', runAfter: NOW });
  await job({ payload: { assetId: side }, status: 'done', attempts: 1, finishedAt: NOW });
  await job({ payload: { assetId: foreign }, status: 'failed', attempts: 8, lastError: '남의 오류' });

  const d = await loadIntakeDetail(db, A, id, NOW);
  const view = d.jobIssues.map((j) => [j.kind, j.state, j.view, j.revisionNumber, j.canRequeue]).sort();
  eq(
    view,
    [
      ['register_revision', 'stalled', null, 1, false],
      ['verify_asset', 'failed', 'side', null, true],
      ['verify_asset', 'retrying', 'rear', null, false],
    ],
    '시도를 다 쓴 일감 · 재시도 · 멈춘 일감이 보이고, 정상 대기 · 끝난 일 · 남의 일은 안 보인다',
  );
  const failed = d.jobIssues.find((j) => j.state === 'failed')!;
  eq([failed.attempts, failed.maxAttempts], [8, 8], '몇 번 시도했는지 보인다');
  ok(failed.lastError!.includes('저장소 응답 실패'), '까닭이 보인다');
  ok(!JSON.stringify(d.jobIssues).includes('token=') && !JSON.stringify(d.jobIssues).includes(`sub/${id}`), '오류 글의 주소 · 경로는 지운다');
  eq(jobErrorText(null), null, '오류가 없으면 비어 있다');

  /* 고침으로 넘어간 대상의 일감은 풀 수 없는 경고로 남지 않는다 */
  const gone = await mk({ name: '옛 일감' });
  const goneSide = await mkAsset(gone.submissionId, 'side', 'replaced');
  const goneNew = await mkAsset(gone.submissionId, 'side', 'verifying');
  const goneRear = await mkAsset(gone.submissionId, 'rear', 'verified');
  const oldRev = await db.intakeRevision.create({
    data: { submissionId: gone.submissionId, number: 1, sideAssetId: goneSide, rearAssetId: goneRear, athleteName: '옛 일감', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'o'.repeat(16), finalizedAt: NOW },
  });
  const newRev = await db.intakeRevision.create({
    data: { submissionId: gone.submissionId, number: 2, sideAssetId: goneNew, rearAssetId: goneRear, athleteName: '옛 일감', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'p'.repeat(16), finalizedAt: NOW },
  });
  await db.intakeSubmission.update({ where: { id: gone.submissionId }, data: { currentRevisionId: newRev.id } });
  const doneRun = await db.intakeAnalysisRun.create({ data: { submissionId: gone.submissionId, revisionId: newRev.id, engineKey: 'e', status: 'failed' } });
  await job({ payload: { assetId: goneSide }, status: 'failed', attempts: 8, lastError: '옛 파일' });
  await job({ kind: 'register_revision', payload: { revisionId: oldRev.id }, status: 'failed', attempts: 8, lastError: '옛 판' });
  await job({ kind: 'poll_analysis', payload: { runId: doneRun.id }, status: 'failed', attempts: 8, lastError: '끝난 실행' });
  await job({ payload: { assetId: goneNew }, status: 'failed', attempts: 8, lastError: '지금 파일' });
  eq((await loadIntakeDetail(db, A, gone.submissionId, NOW)).jobIssues.map((j) => j.lastError), ['지금 파일'], '지금 대상의 일감만 남는다');
  const later = await loadIntakeDetail(db, A, id, new Date(NOW.getTime() + 20 * 60_000));
  eq(later.jobIssues.filter((j) => j.state === 'stalled').length, 3, '차례가 지나도 안 돌면 멈춘 것으로 본다');
  eq((await loadIntakeDetail(db, A, other.submissionId, NOW)).jobIssues.map((j) => j.lastError), ['남의 오류'], '자기 접수의 일감만 본다');
  eq((await adminCreateInvitation(db, A, {}, NOW).then((x) => loadIntakeDetail(db, A, x.submissionId, NOW))).jobIssues, [], '자산이 없는 접수는 일감도 없다');
}

/* ═══════════ 7. 원본 주소 ═══════════ */
{
  const inv = await adminCreateInvitation(db, A, {}, NOW);
  const id = inv.submissionId;
  await db.intakeSubmission.update({ where: { id }, data: { athleteName: "O'Brien 김/민", status: 'verified', receivedAt: new Date('2026-11-05T16:00:00Z'), receiptCode: 'IN-261106-PAIR01' } });
  const side = await mkAsset(id, 'side');
  const rear = await mkAsset(id, 'rear');
  const other = await mk({ name: '남의 접수' });
  const foreign = await mkAsset(other.submissionId, 'side');

  const before = await db.intakeAudit.count({ where: { submissionId: id } });
  const links = await issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'download' }, NOW);
  eq(links.map((l) => l.view), ['side', 'rear'], '짝은 원본 둘이다(묶음 파일이 아니다)');
  eq(links[0].fileName, 'OBrien-김민_2026-11-06_IN-261106-PAIR01_side_original.mov', '안전한 이름 · 한국 날짜');
  eq(links[1].fileName, 'OBrien-김민_2026-11-06_IN-261106-PAIR01_rear_original.mov', '뒤 이름');
  ok(links[0].url.includes(`download=${encodeURIComponent(links[0].fileName)}`), '내려받기 이름이 주소에 실린다');
  eq(links[0].expiresInSec, 300, '주소는 5분');
  const trail = await db.intakeAudit.findMany({ where: { submissionId: id, action: 'original.download_issued' } });
  eq([trail.length, (await db.intakeAudit.count({ where: { submissionId: id } })) - before], [2, 2], '주소마다 기록을 남긴다');
  ok(!JSON.stringify(trail).includes('token=sig') && !JSON.stringify(trail).includes(`sub/${id}`), '기록에 주소가 없다');

  const preview = await issueOriginalLinks(db, storage, B, { submissionId: id, purpose: 'preview', assetId: side }, NOW);
  ok(preview.length === 1 && !preview[0].url.includes('download='), '미리보기는 내려받기 머리가 없다');
  await fails(issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'download', assetId: foreign }), 'asset_not_found', '다른 접수의 자산은 없는 것');
  await fails(issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'download', assetId: '../x' }), 'asset_not_found', '번호 모양 검사');
  await fails(issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'nope' as 'preview' }), 'invalid_input', '모르는 용도');

  /* 고른 뒤 교체돼도 얼린 판의 짝을 준다 */
  const rev = await db.intakeRevision.create({
    data: { submissionId: id, number: 1, sideAssetId: side, rearAssetId: rear, athleteName: '얼린이름', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'k'.repeat(16), finalizedAt: NOW },
  });
  await db.intakeSubmission.update({ where: { id }, data: { currentRevisionId: rev.id } });
  const newer = await mkAsset(id, 'side', 'uploading');
  const frozen = await issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'download' }, NOW);
  eq(frozen.map((l) => l.assetId), [side, rear], '짝은 얼린 판을 따른다');
  ok(frozen[0].fileName.startsWith('얼린이름_'), '이름도 얼린 판');
  await fails(issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'download', assetId: newer }), 'original_unavailable', '도착 전 파일은 못 받는다');

  await db.intakeAsset.update({ where: { id: side }, data: { status: 'purged' } });
  await fails(issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'download' }), 'original_purged', '지운 파일은 못 받는다');
  await fails(issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'preview', assetId: side }), 'original_purged', '지운 파일은 미리보기도 없다');
  await db.intakeAsset.update({ where: { id: side }, data: { status: 'verified' } });

  const empty = await mk({ name: '빈칸' });
  await fails(issueOriginalLinks(db, storage, A, { submissionId: empty.submissionId, purpose: 'download' }), 'assets_incomplete', '짝이 없으면 막는다');

  /* 분석 미리보기 — 경로는 실행 줄에서만 */
  const run = await db.intakeAnalysisRun.create({
    data: { submissionId: id, revisionId: rev.id, engineKey: 'e', status: 'succeeded', resultMeta: { previews: { side: `sub/${id}/runs/x/preview-side.mp4`, rear: `sub/${other.submissionId}/runs/x/preview-rear.mp4` } } },
  });
  const p = await issueRunPreviewLink(db, storage, A, { submissionId: id, runId: run.id, view: 'side' }, NOW);
  ok(p.url.includes('preview-side.mp4'), '분석 미리보기 주소');
  await fails(issueRunPreviewLink(db, storage, A, { submissionId: id, runId: run.id, view: 'rear' }), 'original_unavailable', '이 접수 밖 경로는 안 준다');
  await fails(issueRunPreviewLink(db, storage, A, { submissionId: other.submissionId, runId: run.id, view: 'side' }), 'original_unavailable', '다른 접수의 실행은 없는 것');

  /* 실패한 실행도 굽다 만 영상은 본다. 만들어지기 전에 끝났으면 없다고 말한다 */
  const failedRun = await db.intakeAnalysisRun.create({
    data: { submissionId: id, revisionId: rev.id, engineKey: 'e2', status: 'failed', failureCode: 'pair', resultMeta: { previews: { side: `sub/${id}/runs/y/preview-side.mp4`, rear: `sub/${id}/runs/y/preview-rear.mp4` } } },
  });
  ok((await issueRunPreviewLink(db, storage, A, { submissionId: id, runId: failedRun.id, view: 'side' }, NOW)).url.includes('runs/y/preview-side.mp4'), '실패한 실행의 미리보기도 준다');
  missingObjects.add(`sub/${id}/runs/y/preview-rear.mp4`);
  await fails(issueRunPreviewLink(db, storage, A, { submissionId: id, runId: failedRun.id, view: 'rear' }), 'original_unavailable', '파일이 없으면 죽은 주소를 안 준다');

  await db.intakeSubmission.update({ where: { id }, data: { status: 'withdrawn' } });
  await fails(issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'download' }), 'original_locked', '철회된 접수의 원본은 안 연다');
  await fails(issueRunPreviewLink(db, storage, A, { submissionId: id, runId: run.id, view: 'side' }), 'original_locked', '철회된 접수의 미리보기도 안 연다');
}

/* ═══════════ 8. 초대 · 폐기 · 고침 ═══════════ */
{
  await fails(adminCreateInvitation(db, A, { uploadDays: 0 }), 'invalid_input', '올리기 기간 0일');
  await fails(adminCreateInvitation(db, A, { uploadDays: 61 }), 'invalid_input', '올리기 기간 초과');
  await fails(adminCreateInvitation(db, A, { uploadDays: Number.NaN }), 'invalid_input', '숫자가 아닌 기간');
  await fails(adminCreateInvitation(db, A, { uploadDays: 30, resultDays: 7 }), 'invalid_input', '결과 기간이 올리기보다 짧다');
  await fails(adminCreateInvitation(db, A, { accessCode: 'abc' }), 'invalid_input', '짧은 접근 코드');
  await fails(adminCreateInvitation(db, A, { maxFileBytes: 2 * 1024 ** 3 }), 'invalid_input', '파일 한도는 버킷 한도를 못 넘는다');
  await fails(adminCreateInvitation(db, A, { maxFileBytes: 500 * 1024 ** 2, maxTotalBytes: 100 * 1024 ** 2 }), 'invalid_input', '합계가 파일 한도보다 작다');

  const inv = await adminCreateInvitation(db, A, { uploadDays: 3, resultDays: 30, maxFileBytes: 100 * 1024 ** 2, note: '  메모 ' }, NOW);
  const row = await db.intakeInvitation.findUniqueOrThrow({ where: { id: inv.invitationId } });
  eq([row.uploadExpiresAt.getTime() - NOW.getTime(), row.resultExpiresAt!.getTime() - NOW.getTime(), Number(row.maxFileBytes), row.note, row.createdByAdminId], [3 * 86_400_000, 30 * 86_400_000, 100 * 1024 ** 2, '메모', A.id], '초대 칸');
  ok((await openIntakeScope(db, `Intake ${inv.token}`, 'read', NOW)).submissionId === inv.submissionId, '새 초대는 쓸 수 있다');

  /* B 가 A 의 초대를 폐기한다 — 만든 사람에 묶이지 않는다 */
  eq(await adminRevokeInvitation(db, B, { submissionId: inv.submissionId }, NOW), { revoked: true }, '폐기');
  eq(await adminRevokeInvitation(db, A, { submissionId: inv.submissionId }, new Date(NOW.getTime() + 1000)), { revoked: false }, '두 번 눌러도 처음 것이 남는다');
  const revoked = await db.intakeInvitation.findUniqueOrThrow({ where: { id: inv.invitationId } });
  eq([revoked.status, revoked.revokedByAdminId, revoked.revokedAt], ['revoked', B.id, NOW], '폐기 칸');
  eq(await db.intakeAudit.count({ where: { invitationId: inv.invitationId, action: 'invitation.revoked' } }), 1, '폐기 기록은 한 줄');
  await fails(openIntakeScope(db, `Intake ${inv.token}`, 'read', NOW), 'invitation_revoked', '폐기 뒤 링크가 막힌다');

  /* 고침 요청 — 두 관리자가 같은 판을 보고 있었다 */
  const c = await mk({ name: '고침시험' });
  const version = (await loadIntakeDetail(db, A, c.submissionId, NOW)).version;
  const both = await Promise.allSettled([
    adminRequestCorrection(db, A, { submissionId: c.submissionId, expectedVersion: version, views: ['side'], fields: ['athleteName'], message: '옆 영상을 다시 보내 주세요' }, NOW),
    adminRequestCorrection(db, B, { submissionId: c.submissionId, expectedVersion: version, views: ['rear'] }, NOW),
  ]);
  eq(both.filter((x) => x.status === 'fulfilled').length, 1, '고침 요청은 하나만 된다');
  const loser = both.find((x): x is PromiseRejectedResult => x.status === 'rejected')!;
  eq((loser.reason as InstanceType<typeof IntakeError>).code, 'stale_version', '진 쪽은 stale_version');
  const after = await loadIntakeDetail(db, A, c.submissionId, NOW);
  eq([after.status, after.correction?.views, after.correction?.fields, after.correction?.message], ['correction_requested', ['side'], ['athleteName'], '옆 영상을 다시 보내 주세요'], '고침 내용');

  const v = await mk({ name: '고침검사' });
  await fails(adminRequestCorrection(db, A, { submissionId: v.submissionId, expectedVersion: 0, fields: ['receiptCode'] }), 'invalid_input', '모르는 칸');
  await fails(adminRequestCorrection(db, A, { submissionId: v.submissionId, expectedVersion: 0, views: ['top'] }), 'invalid_input', '모르는 시점');
  await fails(adminRequestCorrection(db, A, { submissionId: v.submissionId, expectedVersion: 0 }), 'invalid_input', '고를 칸이 없다');
  await fails(adminRequestCorrection(db, A, { submissionId: v.submissionId, expectedVersion: 0, views: ['side'], extendDays: 99 }), 'invalid_input', '늘릴 기간 초과');
  const later = new Date(NOW.getTime() + 30 * 86_400_000);
  await fails(adminRequestCorrection(db, A, { submissionId: v.submissionId, expectedVersion: 0, views: ['side'] }, later), 'invalid_input', '기간이 끝났으면 늘려야 한다');
  await adminRequestCorrection(db, A, { submissionId: v.submissionId, expectedVersion: 0, views: ['side'], extendDays: 7 }, later);
  const ext = await db.intakeInvitation.findUniqueOrThrow({ where: { id: v.invitationId } });
  eq(ext.uploadExpiresAt.getTime(), later.getTime() + 7 * 86_400_000, '올리기 기간을 늘린다');
  ok(!(await loadIntakeList(db, A, parseIntakeFilters({ q: '고침검사' }), later)).rows[0].unread, '내가 낸 고침은 내게 안 읽음이 아니다');

  /* 고침 요청 거두기 */
  const cc = await mk({ name: '고침거두기' });
  const ccSide = await mkAsset(cc.submissionId, 'side');
  const ccRear = await mkAsset(cc.submissionId, 'rear');
  const ccRev = await db.intakeRevision.create({
    data: { submissionId: cc.submissionId, number: 1, sideAssetId: ccSide, rearAssetId: ccRear, athleteName: '고침거두기', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'c'.repeat(16), finalizedAt: NOW, status: 'verified' },
  });
  await db.intakeSubmission.update({ where: { id: cc.submissionId }, data: { currentRevisionId: ccRev.id } });
  const asked = await adminRequestCorrection(db, A, { submissionId: cc.submissionId, expectedVersion: 0, fields: ['athleteName'] }, NOW);
  await fails(adminCancelCorrection(db, B, { submissionId: cc.submissionId, expectedVersion: asked.version - 1 }, NOW), 'stale_version', '낡은 화면은 고침을 못 거둔다');
  const cancelled = await adminCancelCorrection(db, B, { submissionId: cc.submissionId, expectedVersion: asked.version }, NOW);
  eq(cancelled.status, 'verified', '접수가 지금 판의 상태로 돌아간다');
  const backSub = await loadIntakeDetail(db, A, cc.submissionId, NOW);
  eq([backSub.status, backSub.correction], ['verified', null], '고침 요청이 사라진다');
  ok(backSub.audit.some((x) => x.action === 'correction.cancelled' && x.actor === '대표B'), '누가 거뒀는지 남는다');
  await fails(adminCancelCorrection(db, A, { submissionId: cc.submissionId, expectedVersion: cancelled.version }, NOW), 'invalid_state', '요청이 없으면 거둘 수 없다');

  /* 올리기 기간 늘리기 */
  const ex = await adminCreateInvitation(db, A, { uploadDays: 2 }, NOW);
  await fails(adminExtendUploadWindow(db, A, { submissionId: ex.submissionId, days: 0 }, NOW), 'invalid_input', '0일은 안 된다');
  await fails(adminExtendUploadWindow(db, A, { submissionId: ex.submissionId, days: 61 }, NOW), 'invalid_input', '상한을 넘을 수 없다');
  await fails(adminExtendUploadWindow(db, A, { submissionId: ex.submissionId, days: 1 }, NOW), 'invalid_input', '지금 기간보다 줄일 수 없다');
  const longer = await adminExtendUploadWindow(db, B, { submissionId: ex.submissionId, days: 10 }, NOW);
  eq(longer.uploadExpiresAt, new Date(NOW.getTime() + 10 * 86_400_000).toISOString(), '오늘부터 며칠로 늘린다');
  await fails(adminExtendUploadWindow(db, A, { submissionId: backSub.id, days: 30 }, NOW), 'invalid_state', '접수가 끝난 뒤에는 늘릴 일이 없다');

  /* 접근 코드 막힘 풀기 */
  const lk = await adminCreateInvitation(db, A, { accessCode: 'code-1234' }, NOW);
  await db.intakeInvitation.update({ where: { id: lk.invitationId }, data: { accessCodeFailures: 10, accessCodeLockedAt: NOW } });
  const lockedView = (await loadIntakeDetail(db, A, lk.submissionId, NOW)).invitation;
  eq([lockedView.accessCodeLocked, lockedView.accessCodeFailures], [true, 10], '상세가 막힘을 보인다');
  eq(await adminResetAccessCodeLock(db, B, { submissionId: lk.submissionId }, NOW), { reset: true }, '막힘을 푼다');
  const unlocked = await db.intakeInvitation.findUniqueOrThrow({ where: { id: lk.invitationId } });
  eq([unlocked.accessCodeFailures, unlocked.accessCodeLockedAt, unlocked.accessCodeHash != null], [0, null, true], '횟수만 풀고 코드는 그대로다');
  eq(await adminResetAccessCodeLock(db, B, { submissionId: lk.submissionId }, NOW), { reset: false }, '풀 것이 없으면 아무것도 안 한다');

  /* 다시 확인 — 시도를 다 쓴 일감을 깨운다 */
  const rq = await mk({ name: '다시확인', status: 'submitted' });
  const rqSide = await mkAsset(rq.submissionId, 'side', 'verifying');
  const rqRear = await mkAsset(rq.submissionId, 'rear');
  const rqRev = await db.intakeRevision.create({
    data: { submissionId: rq.submissionId, number: 1, sideAssetId: rqSide, rearAssetId: rqRear, athleteName: '다시확인', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'r'.repeat(16), finalizedAt: NOW },
  });
  await db.intakeSubmission.update({ where: { id: rq.submissionId }, data: { currentRevisionId: rqRev.id } });
  await db.intakeJob.create({ data: { kind: 'verify_asset', dedupeKey: `verify_asset:${rqSide}`, payload: { assetId: rqSide }, status: 'failed', attempts: 8, lastError: '저장소 응답 실패', runAfter: NOW, finishedAt: NOW } });
  await db.intakeJob.create({ data: { kind: 'register_revision', dedupeKey: `register_revision:${rqRev.id}`, payload: { revisionId: rqRev.id }, status: 'failed', attempts: 8, lastError: '원본 크기가 달라졌어요', runAfter: NOW, finishedAt: NOW } });
  const stuck = await loadIntakeDetail(db, A, rq.submissionId, NOW);
  eq(stuck.jobIssues.map((j) => [j.kind, j.state, j.canRequeue]).sort(), [['register_revision', 'failed', true], ['verify_asset', 'failed', true]], '다시 걸 수 있는 일감으로 보인다');
  const foreignAsset = await mkAsset((await mk({ name: '남의다시확인' })).submissionId, 'side', 'verifying');
  await fails(adminRequeueVerification(db, A, { submissionId: rq.submissionId, assetId: foreignAsset }, NOW), 'asset_not_found', '다른 접수의 자산은 없는 것');
  await fails(adminRequeueVerification(db, A, { submissionId: rq.submissionId, assetId: '../x' }, NOW), 'asset_not_found', '번호 모양 검사');
  eq(await adminRequeueVerification(db, A, { submissionId: rq.submissionId }, NOW), { requeued: 2 }, '끝난 파일은 빼고 멈춘 일감만 다시 건다');
  const jobs = await db.intakeJob.findMany({ where: { dedupeKey: { in: [`verify_asset:${rqSide}`, `register_revision:${rqRev.id}`] } } });
  eq(jobs.map((j) => [j.status, j.attempts, j.lastError]), [['queued', 0, null], ['queued', 0, null]], '처음부터 다시 돈다');
  eq((await loadIntakeDetail(db, A, rq.submissionId, NOW)).jobIssues, [], '다시 걸면 멈춘 일감이 사라진다');
  eq(await adminRequeueVerification(db, A, { submissionId: rq.submissionId }, NOW), { requeued: 0 }, '또 눌러도 겹치지 않는다');
  await fails(adminRequeueVerification(db, A, { submissionId: rq.submissionId, assetId: rqRear }, NOW), 'invalid_state', '끝난 파일은 다시 재지 않는다');
}

/* ─────────────────────── 고침 중 새로 고른 파일의 다시 확인 ─────────────────────── */
{
  const c = await mk({ status: 'correction_requested' });
  const side = await mkAsset(c.submissionId, 'side', 'verified');
  const rear = await mkAsset(c.submissionId, 'rear', 'verified');
  const rev = await db.intakeRevision.create({
    data: { submissionId: c.submissionId, number: 1, sideAssetId: side, rearAssetId: rear, athleteName: 'x', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'k-slot-asset-0000', finalizedAt: NOW, status: 'verified' },
  });
  const fresh = await mkAsset(c.submissionId, 'rear', 'verifying');
  await db.intakeSubmission.update({ where: { id: c.submissionId }, data: { currentRevisionId: rev.id, sideAssetId: side, rearAssetId: fresh } });
  await db.intakeJob.create({ data: { kind: 'verify_asset', dedupeKey: `verify_asset:${fresh}`, payload: { assetId: fresh }, status: 'failed', attempts: 8, maxAttempts: 8, runAfter: NOW, finishedAt: NOW } });
  eq(await adminRequeueVerification(db, A, { submissionId: c.submissionId }, NOW), { requeued: 1 }, '칸의 파일도 다시 건다');
  eq((await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: `verify_asset:${fresh}` } })).status, 'queued', '일감이 다시 돈다');
}

/* ─────────────────────── 모델 개발 동의를 담당자가 받아 기록 ─────────────────────── */
{
  const m = await mk({ status: 'verified' });
  await db.intakeConsent.create({ data: { submissionId: m.submissionId, kind: 'model', docVersion: 'v1', textHash: 'h', granted: true, relation: 'self', agreedAt: NOW } });
  /* 링크를 폐기해 받는 사람의 화면이 없다 */
  await db.intakeInvitation.update({ where: { id: m.invitationId }, data: { status: 'revoked', revokedAt: NOW } });
  ok((await loadIntakeDetail(db, A, m.submissionId, NOW)).modelConsentOpen, '거둘 줄이 있다');
  eq(await admin.adminWithdrawModelConsent(db, A, { submissionId: m.submissionId, note: '전화로 요청' }, NOW), { withdrawn: true }, '폐기된 링크도 기록한다');
  const d = await loadIntakeDetail(db, A, m.submissionId, NOW);
  ok(!d.modelUseAllowed && !d.modelConsentOpen, '동의가 거둬진다');
  eq(d.status, 'verified', '접수는 그대로다');
  eq(await admin.adminWithdrawModelConsent(db, A, { submissionId: m.submissionId }, NOW), { withdrawn: false }, '거둘 것이 없으면 안 바꾼다');
  eq(await db.intakeAudit.count({ where: { submissionId: m.submissionId, action: 'consent.model_withdrawn_by_admin' } }), 1, '기록은 한 줄이다');
  await fails(admin.adminWithdrawModelConsent(db, M, { submissionId: m.submissionId }, NOW), 'admin_forbidden', '대표관리자만');
}

/* ─────────────────────── 동의한 적 없는 사람의 철회는 없다 ─────────────────────── */
{
  const { consentDocOf } = await import('@/lib/intake/consent');
  const { withdrawConsent } = await import('@/lib/intake/service');
  const { modelWithdrawalRecordable } = await import('../app/(app)/admin/intake/[id]/detail-rules.ts');
  const d = consentDocOf('model');
  const answer = (submissionId: string, granted: boolean, ms: number) =>
    db.intakeConsent.create({ data: { submissionId, kind: 'model', docVersion: d.version, textHash: d.textHash, granted, relation: 'self', agreedAt: new Date(NOW.getTime() + ms) } });
  const recorded = (submissionId: string) => db.intakeAudit.count({ where: { submissionId, action: { in: ['consent.model_withdrawn_by_admin', 'consent.withdrawn'] } } });

  const r = await mk({ status: 'verified' });
  await answer(r.submissionId, false, 0);
  const refused = await loadIntakeDetail(db, A, r.submissionId, NOW);
  ok(!refused.modelConsentOpen && !modelWithdrawalRecordable(refused), '거부 줄만 있으면 철회 단추가 없다');
  eq(await admin.adminWithdrawModelConsent(db, A, { submissionId: r.submissionId }, NOW), { withdrawn: false }, '불러도 안 바꾼다');
  const scope = await openIntakeScope(db, `Intake ${r.token}`, 'read', NOW);
  await withdrawConsent(db, scope, { kind: 'model' }, NOW);
  eq(await recorded(r.submissionId), 0, '받는 사람 길로도 철회가 남지 않는다');
  eq(await db.intakeConsent.count({ where: { submissionId: r.submissionId, withdrawnAt: { not: null } } }), 0, '거부 줄은 그대로다');

  const flip = await mk({ status: 'verified' });
  await answer(flip.submissionId, true, 0);
  await answer(flip.submissionId, false, 1000);
  ok(!(await loadIntakeDetail(db, A, flip.submissionId, NOW)).modelConsentOpen, '동의했다가 거부했으면 마지막 답이 거부다');
  eq(await admin.adminWithdrawModelConsent(db, A, { submissionId: flip.submissionId }, NOW), { withdrawn: false }, '거둘 동의가 없다');

  const back = await mk({ status: 'verified' });
  const no = await answer(back.submissionId, false, 0);
  await answer(back.submissionId, true, 1000);
  ok((await loadIntakeDetail(db, A, back.submissionId, NOW)).modelConsentOpen, '다시 동의하면 거둘 수 있다');
  eq(await admin.adminWithdrawModelConsent(db, A, { submissionId: back.submissionId }, NOW), { withdrawn: true }, '동의를 거둔다');
  eq((await db.intakeConsent.findUniqueOrThrow({ where: { id: no.id } })).withdrawnAt, null, '거부 줄은 철회로 안 적는다');
  ok(!(await loadIntakeDetail(db, A, back.submissionId, NOW)).modelConsentOpen, '거둔 뒤에는 없다');
}

/* ─────────────────────── 동의 줄이 쌓여도 상세 · 공개 상태가 커지지 않는다 ─────────────────────── */
{
  const { consentDocOf } = await import('@/lib/intake/consent');
  const { loadPublicState } = await import('@/lib/intake/service');
  const { withdrawalRecordable } = await import('../app/(app)/admin/intake/[id]/detail-rules.ts');
  const f = await mk({ status: 'verified' });
  const row = (kind: 'submission' | 'overseas' | 'model', granted: boolean, ms: number) => ({
    submissionId: f.submissionId,
    kind,
    docVersion: consentDocOf(kind).version,
    textHash: consentDocOf(kind).textHash,
    granted,
    relation: 'self',
    agreedAt: new Date(NOW.getTime() + ms),
  });
  await db.intakeConsent.createMany({ data: [row('submission', true, 0), row('overseas', true, 0), ...Array.from({ length: 300 }, (_, i) => row('model', i % 2 === 0, 1000 + i))] });
  const d = await loadIntakeDetail(db, A, f.submissionId, NOW);
  ok(d.consents.length <= 104, '화면에 싣는 줄이 묶인다');
  eq(d.consentsHidden, 302 - d.consents.length, '못 실은 줄 수를 알린다');
  ok(d.consents[0].agreedAt > d.consents[1].agreedAt, '최근 것부터다');
  ok(d.consents.some((c) => c.kind === 'submission') && d.consents.some((c) => c.kind === 'overseas'), '판단에 드는 오래된 줄은 빠지지 않는다');
  ok(d.consentRequiredOk && withdrawalRecordable(d), '필수 동의 판단 · 철회 단추가 그대로다');
  eq([d.modelUseAllowed, d.modelConsentOpen], [false, false], '마지막 답이 거부다');
  const state = await loadPublicState(db, await openIntakeScope(db, `Intake ${f.token}`, 'read', NOW), { now: NOW });
  eq([state.consent.requiredOk, state.consent.granted.model], [true, false], '공개 상태도 같은 판단이다');
  const few = await mk({ status: 'verified' });
  eq((await loadIntakeDetail(db, A, few.submissionId, NOW)).consentsHidden, 0, '줄이 적으면 다 보인다');
}

/* ─────────────────────── 끝을 못 적어 막힌 접근 코드 ─────────────────────── */
{
  const { ACCESS_CODE_MAX_FAILURES } = await import('@/lib/intake/access');
  const c = await adminCreateInvitation(db, A, { accessCode: 'right-code-1' }, NOW);
  await db.intakeInvitation.update({ where: { id: c.invitationId }, data: { accessCodeFailures: ACCESS_CODE_MAX_FAILURES - 1 } });
  ok(!(await loadIntakeDetail(db, A, c.submissionId, NOW)).invitation.accessCodeNeedsReset, '자리가 남아 있으면 풀 것이 없다');
  await db.intakeInvitation.update({ where: { id: c.invitationId }, data: { accessCodeFailures: ACCESS_CODE_MAX_FAILURES } });
  const { invitation } = await loadIntakeDetail(db, A, c.submissionId, NOW);
  eq([invitation.accessCodeLocked, invitation.accessCodeNeedsReset], [false, true], '잠기기 전에 막혀도 관리자가 풀 수 있다');
  eq(await adminResetAccessCodeLock(db, A, { submissionId: c.submissionId }, NOW), { reset: true }, '푼다');
  ok(!(await loadIntakeDetail(db, A, c.submissionId, NOW)).invitation.accessCodeNeedsReset, '풀렸다');
}

/* ─────────────────────── 옛 판에만 남은 파일의 멈춘 검증 ─────────────────────── */
{
  const o = await mk({ name: '옛 판 파일', status: 'verified', analysis: 'ready' });
  const oldSide = await mkAsset(o.submissionId, 'side', 'verifying');
  const rear = await mkAsset(o.submissionId, 'rear', 'verified');
  const freshSide = await mkAsset(o.submissionId, 'side', 'verified');
  const frozen = (number: number, side: string) =>
    db.intakeRevision.create({ data: { submissionId: o.submissionId, number, sideAssetId: side, rearAssetId: rear, athleteName: 'x', submitterRelation: 'self', consentSnapshot: [], finalizeKey: `${number}`.repeat(16), finalizedAt: NOW, status: number === 2 ? 'verified' : 'pending' } });
  await frozen(1, oldSide);
  const rev2 = await frozen(2, freshSide);
  await db.intakeSubmission.update({ where: { id: o.submissionId }, data: { currentRevisionId: rev2.id } });
  await db.intakeJob.create({ data: { kind: 'verify_asset', dedupeKey: `verify_asset:${oldSide}`, payload: { assetId: oldSide }, status: 'failed', attempts: 8, lastError: '저장소 응답 실패', runAfter: NOW, finishedAt: NOW } });
  eq((await loadIntakeDetail(db, A, o.submissionId, NOW)).jobIssues, [], '풀 수 없는 경고로 안 남는다');
  eq(await adminRequeueVerification(db, A, { submissionId: o.submissionId }, NOW), { requeued: 0 }, '다시 걸 것도 없다');
}

/* ─────────────────────── 받는 사람 기록이 관리자 기록을 못 밀어낸다 ─────────────────────── */
{
  const f = await mk({ status: 'verified' });
  await db.intakeAudit.create({ data: { submissionId: f.submissionId, actorKind: 'admin', actorId: A.id, action: 'original.download', createdAt: NOW } });
  await db.intakeAudit.create({ data: { submissionId: f.submissionId, actorKind: 'admin', actorId: A.id, action: 'correction.requested', createdAt: new Date(NOW.getTime() + 1) } });
  await db.intakeAudit.createMany({
    data: Array.from({ length: 400 }, (_, i) => ({ submissionId: f.submissionId, actorKind: 'invitee', action: 'consent.recorded', createdAt: new Date(NOW.getTime() + 1000 + i) })),
  });
  const { audit } = await loadIntakeDetail(db, A, f.submissionId, new Date(NOW.getTime() + 10_000));
  ok(audit.some((a) => a.action === 'original.download') && audit.some((a) => a.action === 'correction.requested'), '관리자 기록이 화면에 남는다');
  ok(audit.filter((a) => a.actorKind === 'invitee').length <= 60, '받는 사람 기록은 잘린다');
  ok(audit[0].action === 'consent.recorded' && audit[audit.length - 1].action === 'original.download', '최근 것부터다');
}

/* ─────────────────────── 원본 보유 기간 — 목록 · 상세 · 주소 ─────────────────────── */
{
  const DAY = 86_400_000;
  const r = await mk({ status: 'verified', name: '보유시험' });
  const id = r.submissionId;
  const side = await mkAsset(id, 'side');
  const rear = await mkAsset(id, 'rear');
  const rev = await db.intakeRevision.create({
    data: { submissionId: id, number: 1, sideAssetId: side, rearAssetId: rear, athleteName: '보유시험', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'r'.repeat(16), finalizedAt: NOW },
  });
  await db.intakeSubmission.update({ where: { id }, data: { sideAssetId: side, rearAssetId: rear, currentRevisionId: rev.id, lastFinalizedAt: NOW } });
  const purgeAt = new Date(NOW.getTime() + 90 * DAY).toISOString();
  const rowOf = async () => (await loadIntakeList(db, A, parseIntakeFilters({ q: '보유시험' }), NOW)).rows[0];

  const before = await loadIntakeDetail(db, A, id, NOW);
  eq([before.retention?.purgeAt, before.retention?.basis, before.retention?.purgedAt, before.retention?.heldUntil], [purgeAt, 'submitted', null, null], '상세가 지울 날과 기준을 준다');
  eq([(await rowOf()).originalPurgeAt, (await rowOf()).originalsPurgedAt], [purgeAt, null], '목록도 같은 날을 준다');
  const empty = await mk({ status: 'draft', receivedAt: null, name: null });
  eq((await loadIntakeDetail(db, A, empty.submissionId, NOW)).retention, null, '끝내지 않은 초안에는 지울 날이 없다');

  /* 지적 9: 파일 없이 철회한 초안은 지울 것이 없어 날짜를 안 보인다 — 보이면 지난 뒤에도 끝내 안 바뀐다. 파일이 있으면 유예 끝날이 보인다 */
  const noFile = await mk({ status: 'withdrawn', receivedAt: null, name: '철회초안시험' });
  await db.intakeSubmission.update({ where: { id: noFile.submissionId }, data: { withdrawnAt: NOW } });
  const draftRow = async () => (await loadIntakeList(db, A, parseIntakeFilters({ q: '철회초안시험' }), NOW)).rows[0];
  eq((await loadIntakeDetail(db, A, noFile.submissionId, NOW)).retention, null, '상세에 지울 날이 없다');
  eq([(await draftRow()).originalPurgeAt, (await draftRow()).originalsPurgedAt], [null, null], '목록에도 없다');
  await mkAsset(noFile.submissionId, 'side', 'uploaded');
  const grace = new Date(NOW.getTime() + 7 * DAY).toISOString();
  const withFile = (await loadIntakeDetail(db, A, noFile.submissionId, NOW)).retention;
  eq([withFile?.purgeAt, withFile?.basis, withFile?.purgedAt], [grace, 'withdrawn_draft', null], '파일이 있으면 유예 끝날을 보인다');
  eq((await draftRow()).originalPurgeAt, grace, '목록도 같은 날이다');
  /* 검증 지적: 판에 안 오른 철회 초안의 파일을 목록 줄이 '원본'이라고 불렀다 — 상세 · 칩은 '영상'이라고 한다 */
  const graceRow = await draftRow();
  eq([graceRow.hasRevision, retentionLineText(graceRow)], [false, `영상 삭제 예정일 ${seoulDateText(grace)}`], '휴대폰 줄이 판에 안 오른 파일을 영상이라고 부른다');
  ok(!retentionLineText({ ...graceRow, hasRevision: true }).startsWith('영상'), '판이 있으면 원본이라고 부른다');
  /* 판이 없으면 지우는 파일이 다 받은 영상이다(상세 purgingFiles · 칩 'received_deleting' 과 같다) — 지울 날을 말하지 않는다 */
  await db.intakeAsset.updateMany({ where: { submissionId: noFile.submissionId }, data: { status: 'purging' } });
  const purgingRow = await draftRow();
  eq([purgingRow.originalsPurging, purgingRow.analysisBlock], ['older', 'received_deleting'], '판이 없는 철회 초안의 지우는 중');
  eq([retentionCellText(purgingRow), retentionLineText(purgingRow)], ['지우는 중', '지우는 중'], '목록 칸과 휴대폰 줄이 지우는 중을 말한다');

  /* 고침이 열려 있으면 기다리는 끝을 보인다 */
  const inv = await db.intakeSubmission.findUniqueOrThrow({ where: { id } });
  await db.intakeInvitation.update({ where: { id: inv.invitationId }, data: { uploadExpiresAt: new Date(NOW.getTime() + 95 * DAY) } });
  await db.intakeSubmission.update({ where: { id }, data: { status: 'correction_requested', correction: { fields: ['athleteName'], views: [], message: null } } });
  eq((await loadIntakeDetail(db, A, id, new Date(NOW.getTime() + 91 * DAY))).retention?.heldUntil, new Date(NOW.getTime() + 95 * DAY).toISOString(), '언제까지 기다리는지 보인다');
  await db.intakeSubmission.update({ where: { id }, data: { status: 'verified', correction: Prisma.DbNull } });

  /* 지운 뒤 */
  const run = await db.intakeAnalysisRun.create({ data: { submissionId: id, revisionId: rev.id, engineKey: 'keep', status: 'succeeded', resultMeta: { previews: { side: `sub/${id}/runs/z/preview-side.mp4`, rear: `sub/${id}/runs/z/preview-rear.mp4` } } } });
  const gone = new Date(NOW.getTime() + 90 * DAY);
  await db.intakeAsset.updateMany({ where: { id: { in: [side, rear] } }, data: { status: 'purged', purgedAt: gone } });
  const after = await loadIntakeDetail(db, A, id, gone);
  eq(after.retention?.purgedAt, gone.toISOString(), '지운 시각을 보인다');
  ok(after.assets.every((a) => !a.available && a.purgedAt === gone.toISOString() && a.status === 'purged'), '자산마다 지워짐으로 보인다');
  ok(after.assets.every((a) => a.clientSha256.length === 64), '해시는 남는다');
  eq((await rowOf()).originalsPurgedAt, gone.toISOString(), '목록도 지운 날을 준다');
  await fails(issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'download' }, gone), 'original_purged', '짝 내려받기가 막힌다');
  await fails(issueRunPreviewLink(db, storage, A, { submissionId: id, runId: run.id, view: 'side' }, gone), 'original_purged', '분석 미리보기도 까닭을 말한다');
  ok(AUDIT_ACTION_TEXT['originals.purged'], '감사 기록의 글이 있다');

  /* 다 지운 접수의 실패 줄은 풀 수 없는 경고다 — 마지막 시도에서 일꾼이 죽으면 임대가 끝나 이렇게 닫힌다 */
  await db.intakeJob.create({ data: { kind: 'purge_originals', dedupeKey: `purge_originals:${id}:dead`, payload: { submissionId: id }, status: 'failed', attempts: 8, lastError: '임대가 끝났고 시도 횟수를 다 썼어요', runAfter: NOW, finishedAt: gone } });
  eq((await loadIntakeDetail(db, A, id, new Date(gone.getTime() + 300 * DAY))).jobIssues.filter((j) => j.kind === 'purge_originals'), [], '다 지운 접수에는 삭제 일감 경고가 없다');
}

/* ─────────────────────── 삭제 일감의 경고 — 지울 일이 남았을 때만 보인다 ─────────────────────── */
{
  const DAY = 86_400_000;
  async function frozenPair(name: string, side = 'verified', rear = 'verified') {
    const r = await mk({ status: 'verified', name });
    const sideId = await mkAsset(r.submissionId, 'side', side);
    const rearId = await mkAsset(r.submissionId, 'rear', rear);
    const rev = await db.intakeRevision.create({
      data: { submissionId: r.submissionId, number: 1, sideAssetId: sideId, rearAssetId: rearId, athleteName: name, submitterRelation: 'self', consentSnapshot: [], finalizeKey: name.padEnd(16, 'k'), finalizedAt: NOW },
    });
    await db.intakeSubmission.update({ where: { id: r.submissionId }, data: { sideAssetId: sideId, rearAssetId: rearId, currentRevisionId: rev.id, lastFinalizedAt: NOW } });
    await db.intakeJob.create({ data: { kind: 'purge_originals', dedupeKey: `purge_originals:${r.submissionId}:1`, payload: { submissionId: r.submissionId }, status: 'failed', attempts: 8, lastError: `https://x.example/sub/${r.submissionId}/a/original 실패`, runAfter: NOW, finishedAt: NOW } });
    return { id: r.submissionId, sideId, rearId, rev };
  }
  const purgeIssues = async (id: string, at: Date) => (await loadIntakeDetail(db, A, id, at)).jobIssues.filter((j) => j.kind === 'purge_originals');

  /* 지우다 멈춘 파일이 있으면 보인다 */
  const stuck = await frozenPair('경고지우는중', 'purging', 'purged');
  const issue = (await purgeIssues(stuck.id, new Date(NOW.getTime() + 91 * DAY)))[0];
  ok(issue && issue.state === 'failed' && !issue.canRequeue, '삭제 일감의 실패가 보이고 크론이 다시 건다');
  ok(!issue?.lastError?.includes('sub/'), '오류 글에 경로가 없다');

  /* 표시도 못 하고 멈췄어도 지울 날이 지났으면 보인다 — 경로가 어긋난 경우다 */
  const due = await frozenPair('경고지울날');
  eq((await purgeIssues(due.id, new Date(NOW.getTime() + 90 * DAY))).length, 1, '지울 날이 지난 판 파일이 남아 있으면 보인다');
  eq((await purgeIssues(due.id, new Date(NOW.getTime() + 89 * DAY))).length, 0, '지울 날 전에는 지울 일이 없다');

  /* 옛 판을 다 지웠고 새 판의 지울 날은 멀다 — 옛 삭제의 실패 줄이 남아도 지금 할 일이 없다 */
  const moved = await frozenPair('경고새판', 'purged', 'purged');
  const side2 = await mkAsset(moved.id, 'side');
  const rear2 = await mkAsset(moved.id, 'rear');
  const later = new Date(NOW.getTime() + 95 * DAY);
  const rev2 = await db.intakeRevision.create({
    data: { submissionId: moved.id, number: 2, sideAssetId: side2, rearAssetId: rear2, athleteName: '경고새판', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'moved'.padEnd(16, 'm'), finalizedAt: later },
  });
  await db.intakeSubmission.update({ where: { id: moved.id }, data: { sideAssetId: side2, rearAssetId: rear2, currentRevisionId: rev2.id, lastFinalizedAt: later } });
  eq(await purgeIssues(moved.id, new Date(later.getTime() + DAY)), [], '새 판이 살아 있으면 옛 실패 줄을 안 보인다');
}

/* ─────────────────────── 지우는 중 — 표시가 걸린 파일은 없는 것으로 보이고, 상세 · 목록이 그 사실을 준다 ─────────────────────── */
{
  const DAY = 86_400_000;
  const r = await mk({ status: 'verified', name: '지우는시험' });
  const id = r.submissionId;
  const side = await mkAsset(id, 'side');
  const rear = await mkAsset(id, 'rear');
  const rev = await db.intakeRevision.create({
    data: { submissionId: id, number: 1, sideAssetId: side, rearAssetId: rear, athleteName: '지우는시험', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'p'.repeat(16), finalizedAt: NOW },
  });
  await db.intakeSubmission.update({ where: { id }, data: { sideAssetId: side, rearAssetId: rear, currentRevisionId: rev.id, lastFinalizedAt: NOW } });
  const run = await db.intakeAnalysisRun.create({ data: { submissionId: id, revisionId: rev.id, engineKey: 'purging', status: 'succeeded', resultMeta: { previews: { side: `sub/${id}/runs/y/preview-side.mp4`, rear: `sub/${id}/runs/y/preview-rear.mp4` } } } });
  const rowOf = async () => (await loadIntakeList(db, A, parseIntakeFilters({ q: '지우는시험' }), NOW)).rows[0];
  eq([(await loadIntakeDetail(db, A, id, NOW)).retention?.purging, (await rowOf()).originalsPurging], [null, null], '지우는 파일이 없으면 칸이 비어 있다');

  const since = new Date(NOW.getTime() + 90 * DAY);
  await db.intakeAsset.update({ where: { id: side }, data: { status: 'purging', updatedAt: since } });
  await db.intakeAsset.update({ where: { id: rear }, data: { status: 'purging', updatedAt: new Date(since.getTime() + 1000) } });
  const later = new Date(since.getTime() + DAY);
  const during = await loadIntakeDetail(db, A, id, later);
  eq(during.retention?.purging, { since: since.toISOString(), files: 2, scope: 'current' }, '언제부터 몇 개를 어느 판에서 지우는지 준다');
  eq(during.retention?.purgedAt, null, '끝나기 전에는 지운 시각이 없다');
  ok(during.assets.every((a) => !a.available && a.purgedAt === null), '바이트가 있다고 보이지 않는다');
  eq(during.assets.map((a) => a.integrity), ['보유 기간이 지나 원본을 지우고 있어요', '보유 기간이 지나 원본을 지우고 있어요'], '자산 칸이 사실대로 말한다');
  eq((await rowOf()).originalsPurging, 'current', '목록도 지금 판을 지우는 중이라고 준다');
  await fails(issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'preview', assetId: side }, later), 'original_purged', '지우는 파일의 주소를 안 준다');
  await fails(issueOriginalLinks(db, storage, A, { submissionId: id, purpose: 'download' }, later), 'original_purged', '짝 내려받기도 막는다');
  await fails(issueRunPreviewLink(db, storage, A, { submissionId: id, runId: run.id, view: 'side' }, later), 'original_purged', '미리보기 주소도 막는다');
  await fails(adminRequeueVerification(db, A, { submissionId: id, assetId: side }, later), 'invalid_state', '지우는 파일을 다시 재지 않는다');
  eq(await adminRequeueVerification(db, A, { submissionId: id }, later), { requeued: 0 }, '짝 다시 확인도 건너뛴다');
  eq([ASSET_STATUS_TEXT.purging, typeof AUDIT_ACTION_TEXT['originals.purge_started']], ['지우는 중', 'string'], '이름표가 있다');

  /* 옛 판의 파일만 지우는 중이면 지금 판은 살아 있다고 가른다 */
  const side2 = await mkAsset(id, 'side');
  const rear2 = await mkAsset(id, 'rear');
  const rev2 = await db.intakeRevision.create({
    data: { submissionId: id, number: 2, sideAssetId: side2, rearAssetId: rear2, athleteName: '지우는시험', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'q'.repeat(16), finalizedAt: later },
  });
  await db.intakeSubmission.update({ where: { id }, data: { sideAssetId: side2, rearAssetId: rear2, currentRevisionId: rev2.id, lastFinalizedAt: later } });
  const older = await loadIntakeDetail(db, A, id, later);
  eq([older.retention?.purging?.scope, older.retention?.purging?.files, (await rowOf()).originalsPurging], ['older', 2, 'older'], '옛 판의 파일뿐이라고 가른다');
  ok(older.assets.filter((a) => a.current).every((a) => a.available), '지금 판의 파일은 그대로 있다고 보인다');

  /* 옛 판이 멈춘 채 지금 판도 지우기 시작했다 — 시작일 · 수는 지금 판 것이다. 옛 판 줄의 시각은 지금 판 파일이 생기기도 전이다 */
  const { retentionText } = await import('../app/(app)/admin/intake/[id]/detail-rules.ts');
  const since2 = new Date(later.getTime() + 90 * DAY);
  await db.intakeAsset.update({ where: { id: side2 }, data: { status: 'purging', updatedAt: since2 } });
  const mixed = await loadIntakeDetail(db, A, id, since2);
  eq(mixed.retention?.purging, { since: since2.toISOString(), files: 1, scope: 'current' }, '옛 판이 함께 멈춰도 지금 판의 시작일과 수를 준다');
  eq(retentionText(mixed.retention!, since2).date, since2.toISOString(), '화면도 지금 판을 지우기 시작한 때를 말한다');
  await db.intakeAsset.update({ where: { id: rear2 }, data: { status: 'purging', updatedAt: new Date(since2.getTime() + 1000) } });
  eq((await loadIntakeDetail(db, A, id, since2)).retention?.purging, { since: since2.toISOString(), files: 2, scope: 'current' }, '지금 판 안에서는 가장 이른 시각이다');

  /* 옛 판 파일이 멈춘 채 지금 판을 다 지웠다 — 'older' 는 지금 판이 살아 있다는 뜻이 아니다. 지운 날이 말한다 */
  const purgedAt = new Date(later.getTime() + 90 * DAY);
  await db.intakeAsset.updateMany({ where: { id: { in: [side2, rear2] } }, data: { status: 'purged', purgedAt } });
  const both = await loadIntakeDetail(db, A, id, purgedAt);
  eq([both.retention?.purgedAt, both.retention?.purging?.scope], [purgedAt.toISOString(), 'older'], '지금 판을 지운 날과 옛 판을 지우는 중을 같이 준다');
  const row = await rowOf();
  eq([row.originalsPurgedAt, row.originalsPurging], [purgedAt.toISOString(), 'older'], '목록도 같은 말을 한다');
  eq(retentionCellText(row), `지워짐 · ${seoulDateText(purgedAt.toISOString())}`, '목록 칸이 지운 날을 말한다');
}

/* ─────────────────────── 지우기 시작한 뒤의 고침 — 삭제는 고침을 안 기다린다 ─────────────────────── */
{
  const DAY = 86_400_000;
  const r = await mk({ status: 'verified', name: '지운뒤고침' });
  const id = r.submissionId;
  const side = await mkAsset(id, 'side', 'purging');
  const rear = await mkAsset(id, 'rear', 'purged', { purgedAt: new Date(NOW.getTime() + 90 * DAY) });
  const rev = await db.intakeRevision.create({
    data: { submissionId: id, number: 1, sideAssetId: side, rearAssetId: rear, athleteName: '지운뒤고침', submitterRelation: 'self', consentSnapshot: [], finalizeKey: 'h'.repeat(16), finalizedAt: NOW },
  });
  const inv = await db.intakeSubmission.update({ where: { id }, data: { sideAssetId: side, rearAssetId: rear, currentRevisionId: rev.id, lastFinalizedAt: NOW, status: 'correction_requested', correction: { fields: ['athleteName'], views: ['side', 'rear'], message: null } } });
  await db.intakeInvitation.update({ where: { id: inv.invitationId }, data: { uploadExpiresAt: new Date(NOW.getTime() + 95 * DAY) } });
  const at = new Date(NOW.getTime() + 91 * DAY);
  const during = await loadIntakeDetail(db, A, id, at);
  eq([during.retention?.purging?.scope, during.retention?.heldUntil], ['current', null], '지금 판을 지우는 중이면 기다린다고 안 말한다');
  const row = (await loadIntakeList(db, A, parseIntakeFilters({ q: '지운뒤고침' }), at)).rows[0];
  eq([retentionCellText(row), retentionLineText(row)], ['지우는 중', '지우는 중'], '목록 칸과 휴대폰 줄이 예정일이라고 안 말한다');

  /* 표시가 끝난 뒤도 기다릴 삭제가 없다 */
  await db.intakeAsset.update({ where: { id: side }, data: { status: 'purged', purgedAt: at } });
  const gone = await loadIntakeDetail(db, A, id, at);
  eq([gone.retention?.purgedAt, gone.retention?.heldUntil], [at.toISOString(), null], '다 지운 뒤에도 기다린다고 안 말한다');
  const goneRow = (await loadIntakeList(db, A, parseIntakeFilters({ q: '지운뒤고침' }), at)).rows[0];
  eq(retentionLineText(goneRow), `지워짐 · ${seoulDateText(at.toISOString())}`, '휴대폰 줄이 지운 날에 예정일 이름을 안 붙인다');
  eq(retentionLineText({ originalPurgeAt: at.toISOString(), originalsPurgedAt: null, originalsPurging: 'older', hasRevision: true }), `원본 삭제 예정일 ${seoulDateText(at.toISOString())}`, '옛 판만 지우면 지금 판의 예정일을 말한다');
}

/* 필수 동의 철회는 모델 동의를 함께 거두지 않는다 */
{
  const r = await mk({ status: 'verified' });
  const stamp = { docVersion: 'v', textHash: 'h', relation: 'self', agreedAt: NOW };
  await db.intakeConsent.createMany({ data: [{ submissionId: r.submissionId, kind: 'submission', granted: true, ...stamp }, { submissionId: r.submissionId, kind: 'overseas', granted: true, ...stamp }, { submissionId: r.submissionId, kind: 'model', granted: true, ...stamp }] });
  await adminWithdrawConsent(db, A, { submissionId: r.submissionId }, NOW);
  const rows = await db.intakeConsent.findMany({ where: { submissionId: r.submissionId } });
  eq(rows.filter((c) => c.withdrawnAt != null).map((c) => c.kind).sort(), ['overseas', 'submission'], '필수 둘만 거둔다');
  eq((await db.intakeSubmission.findUniqueOrThrow({ where: { id: r.submissionId } })).withdrawnAt, NOW, '철회 시각을 접수에 남긴다');
  eq((await loadIntakeDetail(db, A, r.submissionId, NOW)).modelConsentOpen, true, '모델 동의는 거둘 수 있게 남아 있다');
}

/* ─────────────── 검증 지적: '분석 가능'은 돌릴 수 있는 접수만 — 목록 거름 · 칩 · 상세가 같은 판단이다 ─────────────── */
{
  const DAY = 86_400_000;
  const tag = 'READYGATE';
  const { ANALYSIS_STATUS_TEXT, analysisChipText } = await import('@/lib/intake/admin-labels');
  let n = 0;
  const mkReady = async (name: string, extra: Record<string, unknown> = {}) => {
    const r = await mk({ name: `${tag}${name}`, status: 'verified', analysis: 'ready' });
    const side = await mkAsset(r.submissionId, 'side');
    const rear = await mkAsset(r.submissionId, 'rear');
    const rev = await db.intakeRevision.create({
      data: { submissionId: r.submissionId, number: 1, sideAssetId: side, rearAssetId: rear, athleteName: name, submitterRelation: 'self', consentSnapshot: [], finalizeKey: `g${String(++n).padStart(15, '0')}`, finalizedAt: NOW },
    });
    await db.intakeSubmission.update({ where: { id: r.submissionId }, data: { currentRevisionId: rev.id, lastFinalizedAt: NOW, ...extra } });
    return { id: r.submissionId, side, rear };
  };
  const alive = await mkReady('살아있음');
  const purged = await mkReady('지움');
  await db.intakeAsset.updateMany({ where: { id: { in: [purged.side, purged.rear] } }, data: { status: 'purged', purgedAt: NOW } });
  const purging = await mkReady('지우는중');
  await db.intakeAsset.update({ where: { id: purging.side }, data: { status: 'purging' } });
  await mkReady('철회', { status: 'withdrawn', withdrawnAt: NOW });
  const revoked = await mkReady('폐기');
  await adminRevokeInvitation(db, A, { submissionId: revoked.id }, NOW);
  await mkReady('지날날', { lastFinalizedAt: new Date(NOW.getTime() - 91 * DAY) });
  const late = await mkReady('공개뒤', { lastFinalizedAt: new Date(NOW.getTime() - 120 * DAY) });
  const run = await db.intakeAnalysisRun.create({ data: { submissionId: late.id, revisionId: (await db.intakeRevision.findFirstOrThrow({ where: { submissionId: late.id } })).id, engineKey: 'e-late', status: 'succeeded', requestedAt: NOW, finishedAt: NOW } });
  await db.intakePublication.create({ data: { submissionId: late.id, runId: run.id, number: 1, activeFor: null, publishedByAdminId: A.id, publishedAt: new Date(NOW.getTime() - 10 * DAY), unpublishedAt: NOW } });

  const ready = (await loadIntakeList(db, A, parseIntakeFilters({ q: tag, analysis: 'ready' }), NOW)).rows.map((r) => r.id).sort();
  eq(ready, [alive.id, late.id].sort(), "'분석 가능' 거름은 돌릴 수 있는 접수만 준다(공개로 시계가 다시 돈 접수는 든다)");
  const all = (await loadIntakeList(db, A, parseIntakeFilters({ q: tag }), NOW)).rows;
  eq(all.length, 7, '거름 없이 다 보인다');
  const chip = (r: { analysisStatus: string; analysisBlock: Parameters<typeof analysisChipText>[1] }) => analysisChipText(r.analysisStatus, r.analysisBlock) ?? ANALYSIS_STATUS_TEXT[r.analysisStatus];
  eq(all.filter((r) => chip(r) === '분석 가능').map((r) => r.id).sort(), ready, "'분석 가능' 칩도 거름과 같은 접수뿐이다");
  for (const r of all) eq((await loadIntakeDetail(db, A, r.id, NOW)).analysisBlock, r.analysisBlock, `상세와 목록이 같은 판단이다: ${r.athleteName}`);

  /* 끝내지 않은 초안의 임시 파일을 정리가 지웠다 — 칸은 비어도 받은 적 없는 접수처럼 읽히면 안 된다 */
  const { emptyVideosText } = await import('../app/(app)/admin/intake/[id]/detail-rules.ts');
  for (const kind of ['draft', 'withdrawn'] as const) {
    const dr = await mk({ name: `${tag}${kind}초안`, status: kind, receivedAt: null });
    if (kind === 'withdrawn') await db.intakeSubmission.update({ where: { id: dr.submissionId }, data: { withdrawnAt: new Date(NOW.getTime() - 10 * DAY) } });
    await mkAsset(dr.submissionId, 'side', 'purged', { purgedAt: NOW });
    await mkAsset(dr.submissionId, 'rear', 'purged', { purgedAt: NOW });
    await db.intakeSubmission.update({ where: { id: dr.submissionId }, data: { sideAssetId: null, rearAssetId: null } });
    const row = (await loadIntakeList(db, A, parseIntakeFilters({ q: `${tag}${kind}초안` }), NOW)).rows[0];
    eq([row.side, row.rear], ['deleted', 'deleted'], `비운 칸도 지운 영상이라고 말한다: ${kind}`);
    const d = await loadIntakeDetail(db, A, dr.submissionId, NOW);
    eq([d.filesPurgedAt, d.analysisBlock], [row.originalsPurgedAt, row.analysisBlock], `상세가 목록과 같은 지운 날 · 판단을 준다: ${kind}`);
    ok(d.filesPurgedAt != null, `지운 날이 있다: ${kind}`);
    eq(emptyVideosText(d.assets), '받은 영상을 지웠어요.', `받은 적 없는 접수처럼 안 읽힌다: ${kind}`);
    /* 검증 지적: 철회 유예가 끝나 지운 파일을 '쓰이지 않은 임시 파일'이라고 했다. 철회 뒤에 지웠으면 까닭은 철회다 */
    const why = kind === 'withdrawn' ? '접수를 철회해서 지웠어요' : '접수에 쓰이지 않은 임시 파일이라 지웠어요';
    eq(d.assets.map((a) => a.integrity), [why, why], `정리가 지운 파일의 까닭을 사실대로 말하고 보유 기간 때문이라고 안 한다: ${kind}`);
    /* 검증 지적: 판에 오른 적 없는 파일을 칩이 '원본 지워짐'이라고 했다 */
    eq([row.analysisBlock, analysisChipText(row.analysisStatus, row.analysisBlock)], ['received_deleted', '영상 지워짐'], `판이 없는 접수의 칩은 원본이라고 안 한다: ${kind}`);
    eq(d.analysisBlock, row.analysisBlock, `상세 칩도 같다: ${kind}`);
  }
  eq(emptyVideosText([]), '아직 고른 영상이 없어요.', '받은 적 없으면 그대로다');

  /* 검증 지적: 철회하기 전에 정리가 지운 임시 파일은 철회가 까닭이 아니다 */
  {
    const early = await mk({ name: `${tag}철회전정리`, status: 'withdrawn', receivedAt: null });
    await db.intakeSubmission.update({ where: { id: early.submissionId }, data: { withdrawnAt: new Date(NOW.getTime() - 10 * DAY) } });
    await mkAsset(early.submissionId, 'side', 'purged', { purgedAt: new Date(NOW.getTime() - 12 * DAY) });
    await mkAsset(early.submissionId, 'rear', 'purged', { purgedAt: NOW });
    await db.intakeSubmission.update({ where: { id: early.submissionId }, data: { sideAssetId: null, rearAssetId: null } });
    const ed = await loadIntakeDetail(db, A, early.submissionId, NOW);
    eq(Object.fromEntries(ed.assets.map((a) => [a.view, a.integrity])), { side: '접수에 쓰이지 않은 임시 파일이라 지웠어요', rear: '접수를 철회해서 지웠어요' }, '철회 전에 지운 파일 · 철회 뒤에 지운 파일을 가른다');
    eq(ed.retention?.basis, 'withdrawn_draft', '판에 안 오른 철회 초안이다');
  }

  /*
   * 검증 지적: 옆 파일은 지웠고 뒤 파일은 버렸지만 아직 안 지운 초안 — 목록은 [지워짐, 없음]인데 상세는 '아직 고른 영상이 없어요'라고 했다.
   * 상세 글은 목록 칸과 같은 칸별 판단(slotProgressOf)으로 만든다.
   */
  for (const [kind, sideStatus, want, wantRow] of [
    ['옆만지움', 'purged', '옆 영상은 지웠어요. 뒤 영상은 없어요.', ['deleted', 'empty']],
    ['옆만지우는중', 'purging', '옆 영상은 지우고 있어요. 뒤 영상은 없어요.', ['deleting', 'empty']],
  ] as const) {
    const half = await mk({ name: `${tag}${kind}`, status: 'draft', receivedAt: null });
    await mkAsset(half.submissionId, 'side', sideStatus, sideStatus === 'purged' ? { purgedAt: NOW } : {});
    await mkAsset(half.submissionId, 'rear', 'abandoned');
    await db.intakeSubmission.update({ where: { id: half.submissionId }, data: { sideAssetId: null, rearAssetId: null } });
    const row = (await loadIntakeList(db, A, parseIntakeFilters({ q: `${tag}${kind}` }), NOW)).rows[0];
    eq([row.side, row.rear], wantRow, `목록 칸: ${kind}`);
    eq(emptyVideosText((await loadIntakeDetail(db, A, half.submissionId, NOW)).assets), want, `상세 글이 목록 칸과 같은 판단이다: ${kind}`);
  }

  /*
   * 검증 지적: 고침 중 두 칸을 요청했고, 받는 사람이 새로 고른 두 파일을 정리가 버려 칸을 비웠다. 판 1에 얼린 원본은 살아 있다.
   * 칸이 비었다고 '받은 영상을 지웠어요'라고 하면 바로 아래 살아 있는 원본과 어긋나고, 목록('없음')과도 어긋난다.
   */
  const FROZEN_ALIVE = '새로 받은 영상이 없어요. 판에 얼린 원본은 아래 이전에 고른 영상에 있어요.';
  for (const [kind, newStatus, frozenStatus, want] of [
    ['고침새파일지움', 'purged', 'verified', FROZEN_ALIVE],
    ['고침새파일버림', 'abandoned', 'verified', FROZEN_ALIVE],
    ['고침다지움', 'purged', 'purged', '받은 영상을 지웠어요.'],
    ['고침원본지움', 'abandoned', 'purged', '새로 받은 영상이 없어요. 판에 얼린 원본은 지웠어요.'],
  ] as const) {
    const fx = await mkReady(kind, { status: 'correction_requested' });
    if (frozenStatus === 'purged') await db.intakeAsset.updateMany({ where: { id: { in: [fx.side, fx.rear] } }, data: { status: 'purged', purgedAt: NOW } });
    const gone = newStatus === 'purged' ? { purgedAt: NOW } : {};
    const newSide = await mkAsset(fx.id, 'side', newStatus, gone);
    await mkAsset(fx.id, 'rear', newStatus, gone);
    await db.intakeSubmission.update({ where: { id: fx.id }, data: { sideAssetId: null, rearAssetId: null } });
    const d = await loadIntakeDetail(db, A, fx.id, NOW);
    eq([d.assets.filter((a) => a.current).length, d.assets.filter((a) => a.revisions.length > 0).map((a) => a.status)], [0, [frozenStatus, frozenStatus]], `칸은 비었고 판 1의 두 파일이 있다: ${kind}`);
    eq(emptyVideosText(d.assets), want, `빈 영상 칸이 살아 있는 원본 · 지운 원본을 사실대로 말한다: ${kind}`);
    const row = (await loadIntakeList(db, A, parseIntakeFilters({ q: `${tag}${kind}` }), NOW)).rows[0];
    eq([row.side, row.rear], frozenStatus === 'purged' && newStatus === 'purged' ? ['deleted', 'deleted'] : ['empty', 'empty'], `목록 칸과 같은 판단이다: ${kind}`);
    /* 판에 오른 적 없는 파일을 정리가 지웠으면 보유 기간 때문이 아니다 */
    const fresh = d.assets.find((a) => a.id === newSide)!;
    if (newStatus === 'purged') eq(fresh.integrity, '접수에 쓰이지 않은 임시 파일이라 지웠어요', `판에 안 오른 지운 파일은 보유 기간이 까닭이 아니다: ${kind}`);
    if (frozenStatus === 'purged') eq(d.assets.find((a) => a.id === fx.side)!.integrity, '보유 기간이 지나 원본을 지웠어요', `판에 얼린 원본은 보유 기간이 까닭이다: ${kind}`);
  }

  /* 철회 유예가 지났는데 저장소가 안 지운 임시 파일 — 정리 일감은 접수에 안 묶여 있어도 상세가 멈춘 일감으로 보인다 */
  const stuck = async (name: string, withdrawnDaysAgo: number) => {
    const st = await mk({ name: `${tag}${name}`, status: 'withdrawn', receivedAt: null });
    await db.intakeSubmission.update({ where: { id: st.submissionId }, data: { withdrawnAt: new Date(NOW.getTime() - withdrawnDaysAgo * DAY) } });
    await mkAsset(st.submissionId, 'side', 'abandoned', { updatedAt: new Date(NOW.getTime() - (withdrawnDaysAgo - 1) * DAY) });
    await db.intakeSubmission.update({ where: { id: st.submissionId }, data: { sideAssetId: null } });
    return (await loadIntakeDetail(db, A, st.submissionId, NOW)).jobIssues.filter((j) => j.kind === 'cleanup_uploads');
  };
  await db.intakeJob.create({ data: { kind: 'cleanup_uploads', dedupeKey: `cleanup_uploads:test-${tag}`, payload: {}, status: 'failed', attempts: 3, maxAttempts: 3, lastError: 'IntakeError: storage_unavailable (remove_left_object)', runAfter: NOW, finishedAt: NOW } });
  const left = await stuck('남은파일', 10);
  eq(left.map((j) => [j.view, j.canRequeue, j.lastError]), [['side', false, 'IntakeError: storage_unavailable (remove_left_object)']], '지울 때가 지났는데 남은 임시 파일을 보인다');
  eq(await stuck('유예안', 3), [], '유예 안의 파일은 멈춘 것으로 안 본다');
}

await db.$disconnect();
await server.stop();
await pg.close();
console.log(`intake admin: ${passed}개 통과`);
