/**
 * 외부 접수 DB 시험 — 운영 DB 를 건드리지 않고 메모리 안 PostgreSQL(PGlite)에 prisma/migrations 의 external_intake SQL 을 그대로 깔아 service.ts 를 돌린다.
 * `npm run intake:db-test`
 *
 * 저장소는 메모리 가짜다(전송 자체는 intake:transfer-test 가 본다).
 * 한계: PGlite 는 연결이 하나라 동시 요청이 줄을 서서 돈다 — 두 번 눌림 · 같은 키의 결과는 확인하지만, 운영에서 두 연결이 같은 순간에 잠금을 다투는 모습은 재현되지 않는다.
 */
/* 맨 앞 — 다른 모듈보다 먼저 시험 시계를 건다 */
import './intake-test-clock.mts';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ACCESS_CODE_HOLD_STALE_MS, ACCESS_CODE_MAX_FAILURES, openIntakeScope, verifyResultAccess, type IntakeScope } from '@/lib/intake/access';
import { writeAudit } from '@/lib/intake/audit';
import { consentDecisionRows, consentDocOf, latestConsents, type ConsentAnswer } from '@/lib/intake/consent';
import { IntakeError, type IntakeErrorCode } from '@/lib/intake/errors';
import { intakeJobHandlers, registerRevision, runIntakeCron } from '@/lib/intake/job-handlers';
import { enqueueJob, leaseJobs, requeueJob, runDueJobs } from '@/lib/intake/jobs';
import { DEFAULT_MAX_TOTAL_BYTES, TUS_CHUNK_BYTES, TUS_URL_TTL_MS } from '@/lib/intake/limits';
import { seoulDateKey } from '@/lib/intake/paths';
import { PURGE_RUN_SETTLE_MS, enqueueDuePurges, purgeJobKey, purgeSubmissionOriginals } from '@/lib/intake/purge';
import { receiptHead, receiptRetentionRows } from '@/lib/intake/state';
import { stateAfterReceipt } from '@/lib/intake/upload-run';
import { goneViewsToPick } from '@/components/intake/review-rules';
import { enforceRateLimit, hitRateLimit, pruneRateLimits } from '@/lib/intake/rate-limit';
import { removeAndFindLeft, removeLeftObject } from '@/lib/intake/remove';
import { ORIGINAL_RETENTION_MS } from '@/lib/intake/retention';
import {
  cancelCorrection,
  cleanupStaleUploads,
  confirmUpload,
  createInvitation,
  extendUploadWindow,
  finalizeSubmission,
  intakeCoreJobHandlers,
  isContentWriteError,
  issueUploadToken,
  loadPublicState,
  normalizeAthleteName,
  recordConsents,
  reconcilePendingRevisions,
  reconcileUploads,
  registerUploadUrl,
  requestCorrection,
  requeueVerification,
  reserveAsset,
  resetAccessCodeLock,
  saveDraft,
  settleRevision,
  verifyAsset,
  withdrawConsent,
  withdrawRequiredConsent,
} from '@/lib/intake/service';
import type { IntakeStorage } from '@/lib/intake/storage-core';
import { buildMov, mov120, mov240 } from './intake-fixtures.mts';

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
async function fails(p: Promise<unknown>, code: IntakeErrorCode, label: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof IntakeError, `${label}: IntakeError 가 아니에요 — ${String(e)}`);
    assert.equal(e.code, code, label);
    return true;
  });
  if (process.env.V) console.log('ok', label);
  passed++;
}

/* ── 마이그레이션 파일을 그대로 깐다. 새 표는 기존 표에 기대지 않아 이 파일만으로 된다 ── */
/* 공유 DB 에 적용하기 전에는 prisma/pending-migrations 에 둔다(그 폴더 README) */
const MIGRATION_ROOT = readdirSync('prisma').includes('pending-migrations') ? 'prisma/pending-migrations' : 'prisma/migrations';
const dirs = readdirSync(MIGRATION_ROOT).filter((d) => d.endsWith('_external_intake')).sort();
ok(dirs.length === 1, '마이그레이션 파일이 있다');
const migration = readFileSync(`${MIGRATION_ROOT}/${dirs[0]}/migration.sql`, 'utf8');
ok(!/\b(ALTER|DROP)\b/.test(migration.replace(/--.*$/gm, '')), '기존 표를 바꾸지 않는다(CREATE 만)');

/* 스키마와 파일이 어긋나지 않았나 — 운영 DB 에는 닿지 않는 diff */
const fromSchema = execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const statements = (sql: string) => sql.split(/;\s*\n/).map((s) => s.replace(/--.*$/gm, '').trim()).filter((s) => /"Intake/.test(s)).sort();
eq(statements(migration), statements(fromSchema), '마이그레이션 SQL = 지금 스키마의 Intake 표');

const pg = await PGlite.create();
await pg.exec(migration);
const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await socket.start();
const addr = (socket as unknown as { server: { address(): { port: number } } }).server.address();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${addr.port}/postgres?sslmode=disable`, max: 1 }),
});

/* ── 가짜 저장소 ── */
const objects = new Map<string, Buffer>();
const fail = { hash: 0, issue: false, remove: 0, removePartial: 0, removeNoop: 0, leave: new Set<string>() };
/** 지우라고 받은 경로 — 다른 곳을 지우려 했는지 본다 */
const removed: string[] = [];
/** 전체 읽기 횟수 — 머리가 나쁜 파일이 큰 읽기를 안 쓰는지 본다 */
const reads = { hash: 0 };
const storage: IntakeStorage = {
  uploadOrigin: 'https://proj.storage.supabase.co',
  async issueUpload(objectPath) {
    if (fail.issue || objects.has(objectPath)) throw new IntakeError('storage_unavailable', { cause: 'sign_upload' });
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
    reads.hash++;
    if (fail.hash > 0) {
      fail.hash--;
      throw new IntakeError('storage_unavailable', { cause: 'hash_read' });
    }
    const b = objects.get(p)!;
    return { sha256: createHash('sha256').update(b).digest('hex'), size: b.length };
  },
  async readUrl(p) {
    return `https://signed.example/${p}`;
  },
  async list(prefix) {
    return [...objects.keys()].filter((k) => k.startsWith(prefix));
  },
  async remove(paths) {
    removed.push(...paths);
    if (fail.remove > 0) {
      fail.remove--;
      throw new IntakeError('storage_unavailable', { cause: 'remove' });
    }
    if (fail.removeNoop > 0) {
      fail.removeNoop--;
      return;
    }
    if (fail.removePartial > 0) {
      fail.removePartial--;
      objects.delete(paths[paths.length - 1]);
      throw new IntakeError('storage_unavailable', { cause: 'remove' });
    }
    for (const p of paths) if (!fail.leave.has(p)) objects.delete(p);
  },
};

/* ── 도우미 ── */
const NOW = new Date('2026-11-06T03:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW.getTime() + ms);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const answer = (kind: ConsentAnswer['kind'], granted = true): ConsentAnswer => {
  const d = consentDocOf(kind);
  return { kind, version: d.version, textHash: d.textHash, granted };
};
const REQUIRED = [answer('submission'), answer('overseas')];
const key = () => randomBytes(16).toString('hex');

async function invite(extra: Parameters<typeof createInvitation>[1] extends infer T ? Partial<T> : never = {}) {
  const created = await createInvitation(db, { adminId: 'admin-1', uploadExpiresAt: at(14 * DAY), ...extra }, NOW);
  const scope = await openIntakeScope(db, `Intake ${created.token}`, 'read', NOW);
  return { ...created, scope };
}

async function named(scope: IntakeScope, name = '금윤호') {
  const state = await loadPublicState(db, scope, { now: NOW });
  return saveDraft(db, scope, { expectedVersion: state.version, athleteName: name, athleteAgeBand: '14_or_over', samePitchConfirmed: true }, NOW);
}

/** 고르기 → 토큰 → (저장소에 도착) → 확인 */
async function sendFile(scope: IntakeScope, view: 'side' | 'rear', bytes: Buffer, expectedAssetId: string | null = null, name = `${view}.MOV`) {
  const r = await reserveAsset(db, scope, { view, expectedAssetId, fileName: name, sizeBytes: bytes.length, declaredType: 'video/quicktime', sha256: sha(bytes), pairConfirmed: true }, NOW);
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.asset.id } });
  await issueUploadToken(db, storage, scope, { assetId: r.asset.id }, NOW);
  objects.set(row.objectPath, bytes);
  await confirmUpload(db, storage, scope, { assetId: r.asset.id }, NOW);
  return r.asset.id;
}

/** 초안 → 동의 → 두 파일 도착까지 */
async function ready(extra = {}) {
  const i = await invite(extra);
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const side = mov240(4096);
  const rear = mov120(4096);
  /* 바이트가 서로 달라야 같은 파일로 안 걸린다 — mdat 는 무작위다 */
  const sideId = await sendFile(i.scope, 'side', side);
  const rearId = await sendFile(i.scope, 'rear', rear);
  const state = await loadPublicState(db, i.scope, { now: NOW });
  return { ...i, side, rear, sideId, rearId, state };
}

const finalize = (scope: IntakeScope, version: number, idempotencyKey = key(), extra = {}) =>
  finalizeSubmission(db, scope, { expectedVersion: version, idempotencyKey, ...extra }, NOW);

/* ─────────────────────── 초대 ─────────────────────── */
{
  const i = await invite();
  const row = await db.intakeInvitation.findUniqueOrThrow({ where: { id: i.invitationId } });
  ok(row.tokenHash !== i.token && !JSON.stringify(row, (_, v) => (typeof v === 'bigint' ? Number(v) : v)).includes(i.token), '토큰 원문을 저장하지 않는다');
  eq(i.scope, { invitationId: i.invitationId, submissionId: i.submissionId }, '머리 → 범위');
  await fails(openIntakeScope(db, null, 'read', NOW), 'invitation_invalid', '머리 없음');
  await fails(openIntakeScope(db, `Intake ${'a'.repeat(43)}`, 'read', NOW), 'invitation_invalid', '없는 토큰');
  await fails(openIntakeScope(db, `Bearer ${i.token}`, 'read', NOW), 'invitation_invalid', '다른 방식의 머리');

  /* 링크 미리보기(읽기)는 아무것도 안 바꾼다 */
  const before = await db.intakeSubmission.findUniqueOrThrow({ where: { id: i.submissionId } });
  const s = await loadPublicState(db, i.scope, { now: NOW });
  await loadPublicState(db, i.scope, { now: NOW });
  const after = await db.intakeSubmission.findUniqueOrThrow({ where: { id: i.submissionId } });
  eq(after.updatedAt, before.updatedAt, '읽기는 접수를 안 바꾼다');
  eq(s.screen, 'welcome', '처음 화면');
  ok(!JSON.stringify(s).includes('admin-1') && !('assigneeAdminId' in s), '공개 상태에 관리자 칸이 없다');
  ok((await db.intakeAudit.count({ where: { invitationId: i.invitationId, action: 'invitation.created' } })) === 1, '초대 감사 기록');

  const coded = await invite({ accessCode: '123456' });
  const inv = await db.intakeInvitation.findUniqueOrThrow({ where: { id: coded.invitationId } });
  ok(inv.accessCodeHash?.startsWith('scrypt$'), '접근 코드는 해시로');
  const codeTry = (code: string | null) => verifyResultAccess(db, { invitation: inv, submissionId: coded.submissionId, code }, NOW);
  await fails(codeTry(null), 'access_code_required', '코드 없음');
  await fails(codeTry('000000'), 'access_code_wrong', '코드 틀림');
  await codeTry('123456');
  passed++;
  await fails(createInvitation(db, { adminId: 'a', accessCode: '12345' }, NOW), 'invalid_input', '너무 짧은 코드');
}

/* ─────────────────────── 초안 ─────────────────────── */
{
  eq(normalizeAthleteName('  금   윤호 '), '금 윤호', '공백 정리');
  eq(normalizeAthleteName("Shōhei O'Brien-Lee"), "Shōhei O'Brien-Lee", '외국 이름');
  eq(normalizeAthleteName('금'), '금', '자모 분리형을 합친다');
  for (const bad of ['', '   ']) await fails(Promise.resolve().then(() => normalizeAthleteName(bad)), 'athlete_name_required', '빈 이름');
  await fails(Promise.resolve().then(() => normalizeAthleteName('가'.repeat(41))), 'athlete_name_invalid', '긴 이름');
  await fails(Promise.resolve().then(() => normalizeAthleteName('이름\u0000')), 'athlete_name_chars', '제어 글자는 길이가 아니라 글자 문제라고 말한다');
  await fails(Promise.resolve().then(() => normalizeAthleteName('abc\u202Edef')), 'athlete_name_chars', '글 방향을 뒤집는 문자');
  await fails(Promise.resolve().then(() => normalizeAthleteName('a\u2066b')), 'athlete_name_chars', '방향 격리 문자');
  eq(normalizeAthleteName('می\u200Cخواهم'), 'می\u200Cخواهم', '페르시아어 이름의 ZWNJ 는 정상 글자다');
  eq(normalizeAthleteName('ക്\u200Dക'), 'ക്\u200Dക', '인도계 이름의 ZWJ 도 받는다');

  const i = await invite();
  const a = await saveDraft(db, i.scope, { expectedVersion: 0, athleteName: '금윤호' }, NOW);
  eq(a.version, 1, '저장하면 판이 오른다');
  const same = await saveDraft(db, i.scope, { expectedVersion: 1, athleteName: ' 금윤호 ' }, NOW);
  eq(same.version, 1, '바뀐 것이 없으면 판이 그대로다');
  await fails(saveDraft(db, i.scope, { expectedVersion: 0, athleteName: '김민' }, NOW), 'stale_version', '옛 판으로 고치기 막음');
  await fails(saveDraft(db, i.scope, { expectedVersion: 1, submitterRelation: 'boss' }, NOW), 'invalid_input', '없는 관계');
  await fails(saveDraft(db, i.scope, { expectedVersion: 1, throwingHand: 'X' }, NOW), 'invalid_input', '없는 손');
  const proxy = await saveDraft(db, i.scope, { expectedVersion: 1, submitterRelation: 'coach', submitterName: '박코치' }, NOW);
  const sub = await db.intakeSubmission.findUniqueOrThrow({ where: { id: i.submissionId } });
  ok(sub.athleteName === '금윤호' && sub.submitterName === '박코치' && proxy.version === 2, '선수와 보내는 사람을 따로 둔다');

  /* 같은 이름을 합치지 않는다 */
  const j = await invite();
  await saveDraft(db, j.scope, { expectedVersion: 0, athleteName: '금윤호' }, NOW);
  ok((await db.intakeSubmission.count({ where: { athleteName: '금윤호', id: { in: [i.submissionId, j.submissionId] } } })) === 2, '같은 이름은 다른 접수다');
}

/* ─────────────────────── 만 14세 미만 ─────────────────────── */
{
  const i = await invite();
  await saveDraft(db, i.scope, { expectedVersion: 0, athleteName: '어린이', athleteAgeBand: 'under_14', samePitchConfirmed: true }, NOW);
  eq((await loadPublicState(db, i.scope, { now: NOW })).screen, 'under_14', '화면이 막는다');
  await fails(recordConsents(db, i.scope, { answers: REQUIRED }, NOW), 'under_14', '동의를 안 받는다');
  const b = mov240();
  await fails(reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: 'a', sizeBytes: b.length, sha256: sha(b) }, NOW), 'under_14', '파일을 안 받는다');
  await fails(finalize(i.scope, 1), 'under_14', '접수를 안 받는다');

  /* 부모가 대신 보내도 같다 */
  await saveDraft(db, i.scope, { expectedVersion: 1, submitterRelation: 'parent' }, NOW);
  await fails(recordConsents(db, i.scope, { answers: REQUIRED }, NOW), 'under_14', '대리인도 막는다');
  ok((await db.intakeConsent.count({ where: { submissionId: i.submissionId } })) === 0, '동의 줄이 안 남는다');
}

/* ─────────────────────── 동의 ─────────────────────── */
{
  const i = await invite();
  await named(i.scope);
  await fails(recordConsents(db, i.scope, { answers: [{ ...answer('submission'), textHash: 'old' }] }, NOW), 'consent_stale', '옛 글');
  await fails(recordConsents(db, i.scope, { answers: [{ ...answer('overseas'), version: 'old' }] }, NOW), 'consent_stale', '옛 판');
  await fails(recordConsents(db, i.scope, { answers: [answer('overseas', false)] }, NOW), 'consent_required', '필수 거부');

  const b = mov240();
  const r = await reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: 'a.mov', sizeBytes: b.length, sha256: sha(b) }, NOW);
  await fails(issueUploadToken(db, storage, i.scope, { assetId: r.asset.id }, NOW), 'consent_required', '동의 전에는 전송 토큰이 없다');

  const first = await recordConsents(db, i.scope, { answers: [...REQUIRED, answer('model', false)] }, NOW);
  ok(first.requiredOk, '필수 동의 끝');
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  eq(await db.intakeConsent.count({ where: { submissionId: i.submissionId } }), 3, '같은 답을 다시 보내도 줄이 안 는다');
  const rows = await db.intakeConsent.findMany({ where: { submissionId: i.submissionId, kind: 'overseas' } });
  ok(rows[0].textHash === consentDocOf('overseas').textHash && rows[0].proxy === false && rows[0].relation === 'self', '판 · 해시 · 대리 여부를 남긴다');
  const s = await loadPublicState(db, i.scope, { now: NOW });
  ok(s.consent.requiredOk && !s.consent.granted.model, '선택 동의는 따로다');

  const j = await invite();
  await saveDraft(db, j.scope, { expectedVersion: 0, athleteName: '김선수', athleteAgeBand: '14_or_over', submitterRelation: 'parent' }, NOW);
  await recordConsents(db, j.scope, { answers: REQUIRED }, NOW);
  const proxied = await db.intakeConsent.findFirstOrThrow({ where: { submissionId: j.submissionId } });
  ok(proxied.proxy === true && proxied.relation === 'parent', '대리 제출을 남긴다');
}

/* ─────────────────────── 고르기 · 바꾸기 ─────────────────────── */
{
  const i = await invite({ maxFileBytes: 10_000, maxTotalBytes: 12_000 });
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const big = mov240(20_000);
  await fails(reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: 'a', sizeBytes: big.length, sha256: sha(big) }, NOW), 'file_too_large', '파일 한도');
  await fails(reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: 'a', sizeBytes: 0, sha256: sha(big) }, NOW), 'file_empty', '빈 파일');
  await fails(reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: 'a', sizeBytes: 100, sha256: 'zz' }, NOW), 'invalid_input', '해시 모양');
  const a = mov240(7000);
  const b = mov120(7000);
  const first = await reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: '내 영상/../../x.MOV', sizeBytes: a.length, declaredType: 'video/quicktime', sha256: sha(a) }, NOW);
  ok(first.created && first.asset.status === 'reserved', '자산을 만든다');
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: first.asset.id } });
  eq(row.objectPath, `sub/${i.submissionId}/${first.asset.id}/original`, '경로는 서버가 번호로 만든다');
  ok(!row.objectPath.includes('영상') && !row.objectPath.includes('금윤호') && !row.objectPath.includes('.MOV'), '경로에 이름이 없다');
  await fails(reserveAsset(db, i.scope, { view: 'rear', expectedAssetId: null, fileName: 'b', sizeBytes: b.length, sha256: sha(b) }, NOW), 'total_too_large', '합계 한도');

  /* 응답을 잃고 같은 파일로 다시 불러도 하나 */
  const again = await reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: 'a', sizeBytes: a.length, sha256: sha(a) }, NOW);
  ok(!again.created && again.asset.id === first.asset.id, '같은 파일이면 있던 자산');

  /* 뒤 칸에 같은 파일 */
  const j = await invite();
  await named(j.scope);
  await recordConsents(db, j.scope, { answers: REQUIRED }, NOW);
  const f = mov240();
  const side = await reserveAsset(db, j.scope, { view: 'side', expectedAssetId: null, fileName: 'x.mov', sizeBytes: f.length, sha256: sha(f) }, NOW);
  await fails(reserveAsset(db, j.scope, { view: 'rear', expectedAssetId: null, fileName: 'x.mov', sizeBytes: f.length, sha256: sha(f) }, NOW), 'same_file', '옆과 뒤에 같은 파일');
  eq((await loadPublicState(db, j.scope, { now: NOW })).assets.side?.id, side.asset.id, '뒤가 실패해도 옆 선택은 그대로다');

  /* 바꾸기 — 새 자산 · 새 경로, 옛 바이트는 안 건드린다 */
  const oldRow = await db.intakeAsset.findUniqueOrThrow({ where: { id: side.asset.id } });
  objects.set(oldRow.objectPath, f);
  const f2 = mov240();
  const swap = await reserveAsset(db, j.scope, { view: 'side', expectedAssetId: side.asset.id, fileName: 'y.mov', sizeBytes: f2.length, sha256: sha(f2) }, NOW);
  const after = await db.intakeAsset.findUniqueOrThrow({ where: { id: side.asset.id } });
  ok(swap.created && swap.asset.id !== side.asset.id && after.status === 'replaced', '다시 고르면 새 자산');
  ok(objects.get(oldRow.objectPath) === f, '옛 객체를 덮지 않는다');
  await fails(issueUploadToken(db, storage, j.scope, { assetId: side.asset.id }, NOW), 'asset_not_selected', '바뀐 자산에는 토큰이 없다');

  /* 저장소를 채우지 못한다 */
  const k = await invite();
  await named(k.scope);
  let prev: string | null = null;
  for (let n = 0; n < 12; n++) {
    const x = mov240();
    prev = (await reserveAsset(db, k.scope, { view: 'side', expectedAssetId: prev, fileName: 'x', sizeBytes: x.length, sha256: sha(x) }, NOW)).asset.id;
  }
  const x = mov240();
  await fails(reserveAsset(db, k.scope, { view: 'side', expectedAssetId: prev, fileName: 'x', sizeBytes: x.length, sha256: sha(x) }, NOW), 'too_many_assets', '자산 수 한도');
}

/* ─────────────────────── 두 기기 ─────────────────────── */
{
  const i = await invite();
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const a = mov240();
  const b = mov120();

  /* 폰 둘이 각자 칸을 동시에 — 서로 다른 칸이라 판 번호로 부딪히지 않는다 */
  const [ra, rb] = await Promise.all([
    reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: 'a', sizeBytes: a.length, sha256: sha(a), pairConfirmed: true }, NOW),
    reserveAsset(db, i.scope, { view: 'rear', expectedAssetId: null, fileName: 'b', sizeBytes: b.length, sha256: sha(b), pairConfirmed: true }, NOW),
  ]);
  ok(ra.created && rb.created, '두 기기가 다른 칸을 같이 고른다');
  const versionAfterPick = (await loadPublicState(db, i.scope, { now: NOW })).version;

  const [ta, tb] = await Promise.all([
    issueUploadToken(db, storage, i.scope, { assetId: ra.asset.id }, NOW),
    issueUploadToken(db, storage, i.scope, { assetId: rb.asset.id }, NOW),
  ]);
  ok(ta.objectName !== tb.objectName && ta.objectName.includes(ra.asset.id), '토큰은 자기 경로 하나')
  objects.set(ta.objectName, a);
  await confirmUpload(db, storage, i.scope, { assetId: ra.asset.id }, NOW);
  await fails(finalize(i.scope, versionAfterPick), 'assets_incomplete', '한쪽만 도착하면 끝낼 수 없다');
  objects.set(tb.objectName, b);
  await confirmUpload(db, storage, i.scope, { assetId: rb.asset.id }, NOW);
  eq((await loadPublicState(db, i.scope, { now: NOW })).version, versionAfterPick, '전송 진행은 판을 안 올린다');
  ok((await finalize(i.scope, versionAfterPick)).created, '두 기기가 올린 짝을 끝낸다');

  /* 같은 칸을 두 기기가 바꾸면 늦은 쪽이 막힌다 */
  const j = await invite();
  await named(j.scope);
  const c = mov240();
  const d = mov240();
  const e = mov240();
  const base = await reserveAsset(db, j.scope, { view: 'rear', expectedAssetId: null, fileName: 'c', sizeBytes: c.length, sha256: sha(c) }, NOW);
  await reserveAsset(db, j.scope, { view: 'rear', expectedAssetId: base.asset.id, fileName: 'd', sizeBytes: d.length, sha256: sha(d) }, NOW);
  await fails(reserveAsset(db, j.scope, { view: 'rear', expectedAssetId: base.asset.id, fileName: 'e', sizeBytes: e.length, sha256: sha(e) }, NOW), 'stale_selection', '같은 칸의 늦은 교체');
}

/* ─────────────────────── 업로드 주소 ─────────────────────── */
{
  const i = await invite();
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const a = mov240();
  const r = await reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: 'a', sizeBytes: a.length, declaredType: 'application/x-evil', sha256: sha(a) }, NOW);
  const g = await issueUploadToken(db, storage, i.scope, { assetId: r.asset.id }, NOW);
  ok(g.chunkSize === TUS_CHUNK_BYTES && g.contentType === 'application/octet-stream', '조각 크기 · 영상이 아닌 종류는 그대로 안 넘긴다');
  ok(g.uploadUrl === null, '처음에는 이어 갈 주소가 없다');
  const url = `${storage.uploadOrigin}/storage/v1/upload/resumable/sign/abc`;
  for (const bad of ['https://evil.example/storage/v1/upload/resumable/sign/abc', `${url}?x=1`, 'javascript:alert(1)']) {
    await fails(registerUploadUrl(db, storage, i.scope, { assetId: r.asset.id, uploadUrl: bad }, NOW), 'upload_url_invalid', '저장소 주소가 아니면 막는다');
  }
  const reg = await registerUploadUrl(db, storage, i.scope, { assetId: r.asset.id, uploadUrl: url }, NOW);
  eq(reg.transportExpiresAt, at(TUS_URL_TTL_MS).toISOString(), '주소는 24시간');
  eq((await issueUploadToken(db, storage, i.scope, { assetId: r.asset.id }, at(HOUR))).uploadUrl, url, '살아 있으면 주소를 돌려준다');
  eq((await issueUploadToken(db, storage, i.scope, { assetId: r.asset.id }, at(TUS_URL_TTL_MS + HOUR))).uploadUrl, null, '주소가 끝나도 초대는 살아 있고 새로 시작한다');
  await fails(confirmUpload(db, storage, i.scope, { assetId: r.asset.id }, NOW), 'upload_missing', '아직 안 왔으면 막는다');

  /* 응답을 잃은 사이 끝났다: 서명이 막혀도 '끝남'으로 알려 준다 */
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.asset.id } });
  objects.set(row.objectPath, a);
  await fails(issueUploadToken(db, storage, i.scope, { assetId: r.asset.id }, NOW), 'asset_finished', '이미 도착한 전송');
  const c1 = await confirmUpload(db, storage, i.scope, { assetId: r.asset.id }, NOW);
  const c2 = await confirmUpload(db, storage, i.scope, { assetId: r.asset.id }, NOW);
  ok(c1.status === 'uploaded' && c2.status === 'uploaded', '확인은 다시 불러도 같다');
  eq(await db.intakeJob.count({ where: { dedupeKey: `verify_asset:${r.asset.id}` } }), 1, '검증 일감은 하나');

  /* 크기가 다르면 막는다 */
  const b = mov120();
  const r2 = await reserveAsset(db, i.scope, { view: 'rear', expectedAssetId: null, fileName: 'b', sizeBytes: b.length, sha256: sha(b) }, NOW);
  const g2 = await issueUploadToken(db, storage, i.scope, { assetId: r2.asset.id }, NOW);
  objects.set(g2.objectName, b.subarray(0, 100));
  await fails(confirmUpload(db, storage, i.scope, { assetId: r2.asset.id }, NOW), 'upload_size_mismatch', '신고한 크기와 다른 파일');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: r2.asset.id } })).rejectCode, 'size_mismatch', '까닭을 남긴다');

  fail.issue = true;
  const c = mov120();
  const r3 = await reserveAsset(db, i.scope, { view: 'rear', expectedAssetId: r2.asset.id, fileName: 'c', sizeBytes: c.length, sha256: sha(c) }, NOW);
  await fails(issueUploadToken(db, storage, i.scope, { assetId: r3.asset.id }, NOW), 'storage_unavailable', '저장소 실패는 그대로 알린다');
  fail.issue = false;
}

/* ─────────────────────── 완료 ─────────────────────── */
{
  const r = await ready();
  eq(r.state.screen, 'upload', '둘 다 도착하면 완료만 남는다');
  await fails(finalizeSubmission(db, r.scope, { expectedVersion: r.state.version, idempotencyKey: 'short' }, NOW), 'invalid_input', '요청 키 모양');
  await fails(finalize(r.scope, r.state.version - 1), 'stale_version', '옛 판으로 끝내기');

  const k = key();
  const first = await finalize(r.scope, r.state.version, k);
  ok(first.created && first.revision === 1 && /^IN-261106-/.test(first.receiptCode), '영수증');
  eq(first.receivedAt, NOW.toISOString(), '접수 시각은 서버 시각');
  eq(first.receiptDate, '2026-11-06', '접수일');

  /* 응답을 잃어 같은 키로 다시 */
  const lost = await finalize(r.scope, r.state.version, k);
  ok(!lost.created && lost.receiptCode === first.receiptCode && lost.revision === 1, '같은 키는 같은 영수증');
  /* 눌렀는데 또 눌렀다(새 키) */
  const dup = await finalize(r.scope, first.version, key());
  ok(!dup.created && dup.receiptCode === first.receiptCode, '다른 키도 새 판을 안 만든다');
  eq(await db.intakeRevision.count({ where: { submissionId: r.submissionId } }), 1, '판은 하나');
  eq(await db.intakeAudit.count({ where: { submissionId: r.submissionId, action: 'submission.finalized' } }), 1, '접수 감사 기록도 하나');

  /* 끝난 뒤에는 못 바꾼다 */
  const x = mov240();
  await fails(reserveAsset(db, r.scope, { view: 'side', expectedAssetId: r.sideId, fileName: 'x', sizeBytes: x.length, sha256: sha(x) }, NOW), 'not_editable', '얼린 뒤 교체 막음');
  await fails(saveDraft(db, r.scope, { expectedVersion: first.version, athleteName: '다른 이름' }, NOW), 'not_editable', '얼린 뒤 이름 막음');
  const rev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: r.submissionId } });
  ok(rev.sideAssetId === r.sideId && rev.rearAssetId === r.rearId && rev.athleteName === '금윤호', '짝을 얼린다');
  ok(Array.isArray(rev.consentSnapshot) && (rev.consentSnapshot as unknown[]).length === 2, '그때의 동의를 같이 남긴다');
  eq((await loadPublicState(db, r.scope, { now: NOW })).screen, 'receipt', '다시 오면 영수증');
}
{
  /* 여러 번 동시에 눌림 */
  const r = await ready();
  const k = key();
  const many = await Promise.all([finalize(r.scope, r.state.version, k), finalize(r.scope, r.state.version, k), finalize(r.scope, r.state.version, k), finalize(r.scope, r.state.version, key())]);
  eq(many.filter((m) => m.created).length, 1, '동시에 눌러도 하나만 만든다');
  eq(new Set(many.map((m) => m.receiptCode)).size, 1, '모두 같은 영수증');
  eq(await db.intakeRevision.count({ where: { submissionId: r.submissionId } }), 1, '판은 하나');
}
{
  /* 끝낼 조건 */
  const i = await invite();
  await fails(finalize(i.scope, 0), 'athlete_name_required', '이름 없이');
  const v1 = await saveDraft(db, i.scope, { expectedVersion: 0, athleteName: '가' }, NOW);
  await fails(finalize(i.scope, v1.version), 'age_band_required', '나이 확인 없이');
  const v2 = await saveDraft(db, i.scope, { expectedVersion: v1.version, athleteAgeBand: '14_or_over' }, NOW);
  await fails(finalize(i.scope, v2.version), 'same_pitch_required', '같은 투구 확인 없이');
  await fails(finalize(i.scope, v2.version, key(), { samePitchConfirmed: true }), 'consent_required', '동의 없이');
  await fails(finalize(i.scope, v2.version, key(), { samePitchConfirmed: true, consents: REQUIRED }), 'assets_incomplete', '영상 없이');
  ok((await db.intakeConsent.count({ where: { submissionId: i.submissionId } })) === 0, '실패한 완료는 동의를 안 남긴다');
  eq(await db.intakeRevision.count({ where: { submissionId: i.submissionId } }), 0, '판도 없다');
}
{
  /* 완료 때 동의를 같이 넘기면 남긴다 */
  const r = await ready();
  await db.intakeConsent.updateMany({ where: { submissionId: r.submissionId }, data: { withdrawnAt: at(-1) } });
  await fails(finalize(r.scope, r.state.version), 'consent_required', '철회된 동의로는 끝낼 수 없다');
  ok((await finalize(r.scope, r.state.version, key(), { consents: REQUIRED })).created, '완료 때 다시 동의하면 된다');
}

/* ─────────────────────── 검증 ─────────────────────── */
{
  const r = await ready();
  const f = await finalize(r.scope, r.state.version);
  eq(f.submissionStatus, 'submitted', '검증 전에는 접수까지');
  const before = await loadPublicState(db, r.scope, { now: NOW });
  eq(before.assets.side?.integrity, null, '검증 전에는 그대로라고 말하지 않는다');

  /* 일꾼이 돈다 — 화면을 닫아도 */
  const handlers = intakeCoreJobHandlers(db, storage);
  const first = await runDueJobs(db, handlers, { owner: 'w1', limit: 50, now: () => at(HOUR) });
  ok(first.done >= 2, '일꾼이 검증한다');
  const s = await loadPublicState(db, r.scope, { now: at(HOUR) });
  eq(s.submissionStatus, 'verified', '두 파일이 맞으면 검증됨');
  eq(s.analysisStatus, 'ready', '분석 준비까지만');
  eq(s.assets.side?.integrity, '선택한 파일 그대로 전송됨', '해시 대조 뒤의 이름표');
  eq(s.assets.side?.fps, '240fps 감지', '240 이름표');
  eq(s.assets.rear?.fps, '120fps 감지', '120 이름표');
  eq(s.assets.side?.codec, 'HEVC', '코덱');
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.sideId } });
  eq(row.serverSha256, sha(r.side), '서버가 잰 해시');
  ok(row.storedBytes === BigInt(r.side.length), '서버가 잰 크기');
  eq(await db.intakeAnalysisRun.count({ where: { submissionId: r.submissionId } }), 0, 'GPU 분석은 저절로 안 돈다');
  const rev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: r.submissionId } });
  eq(rev.status, 'verified', '판 검증');
  eq(await db.intakeJob.count({ where: { dedupeKey: `register_revision:${rev.id}` } }), 1, '등록 일감');
  eq(await verifyAsset(db, storage, r.sideId, at(HOUR)), 'verified', '다시 불러도 같다');
  eq(await settleRevision(db, rev.id, at(HOUR)), 'verified', '정산도 다시 불러도 같다');
}
{
  /* 바이트가 다르면 막는다 — 브라우저 해시와 안 맞음 */
  const r = await ready();
  await finalize(r.scope, r.state.version);
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.sideId } });
  const tampered = Buffer.from(r.side);
  tampered[tampered.length - 1] ^= 1;
  objects.set(row.objectPath, tampered);
  eq(await verifyAsset(db, storage, r.sideId, NOW), 'rejected', '해시가 다르면 막는다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: r.sideId } })).rejectCode, 'hash_mismatch', '까닭');
  await verifyAsset(db, storage, r.rearId, NOW);
  const s = await loadPublicState(db, r.scope, { now: NOW });
  eq(s.submissionStatus, 'needs_attention', '접수는 담당자 확인으로');
  ok(s.assets.side?.integrity !== '선택한 파일 그대로 전송됨', '그대로라고 말하지 않는다');
  eq(s.analysisStatus, 'none', '분석 준비가 안 된다');
}
{
  /*
   * 검증 지적: 고침 화면이 '요청받은 칸을 새로 안 고른 경우'를 못 잡았다. 화면은 막지 않고 보냈다.
   * (가) 얼린 파일이 살아 있는 칸 — 서버는 'correction_incomplete' 로 막는다. (나) 해시가 달라 막힌 칸 — 서버가 '전송이 아직 끝나지 않았어요'라고 했다.
   * 전송은 끝났고 파일이 막혔을 뿐이라 그 글은 거짓이다. 공개 상태로 화면이 같은 칸을 보내기 전에 막는다.
   */
  const none = { side: null, rear: null };
  const live = await ready();
  await finalize(live.scope, live.state.version);
  await verifyAsset(db, storage, live.sideId, NOW);
  await verifyAsset(db, storage, live.rearId, NOW);
  await requestCorrection(db, { adminId: 'a', submissionId: live.submissionId, views: ['side'] }, at(HOUR));
  const ls = await loadPublicState(db, live.scope, { now: at(HOUR) });
  eq([ls.submissionStatus, ls.assets.side?.status], ['correction_requested', 'verified'], '(가) 옆 원본은 살아 있다');
  eq(ls.frozenAssetIds, { side: live.sideId, rear: live.rearId }, '(가) 공개 상태가 지금 판의 짝을 안다');
  eq(goneViewsToPick(ls, none), ['side'], '(가) 얼린 파일 그대로인 칸은 다시 골라야 한다');
  await fails(finalize(live.scope, ls.version), 'correction_incomplete', '(가) 서버도 같은 칸으로 막는다');

  const bad = await ready();
  await finalize(bad.scope, bad.state.version);
  const badRow = await db.intakeAsset.findUniqueOrThrow({ where: { id: bad.sideId } });
  const tampered = Buffer.from(bad.side);
  tampered[tampered.length - 1] ^= 1;
  objects.set(badRow.objectPath, tampered);
  eq(await verifyAsset(db, storage, bad.sideId, NOW), 'rejected', '(나) 해시가 달라 막힌다');
  await verifyAsset(db, storage, bad.rearId, NOW);
  eq((await loadPublicState(db, bad.scope, { now: NOW })).submissionStatus, 'needs_attention', '(나) 담당자 확인');
  await requestCorrection(db, { adminId: 'a', submissionId: bad.submissionId, views: ['side'] }, at(HOUR));
  const bs = await loadPublicState(db, bad.scope, { now: at(HOUR) });
  eq(bs.assets.side?.status, 'rejected', '(나) 칸에는 막힌 파일이 있다');
  eq(goneViewsToPick(bs, none), ['side'], '(나) 막힌 칸은 다시 골라야 한다');
  ok(goneViewsToPick(bs, { side: {}, rear: null }).length === 0, '(나) 새 파일을 고르면 막지 않는다');
  await fails(finalize(bad.scope, bs.version), 'correction_incomplete', '(나) 전송이 안 끝났다고 하지 않고 고치라고 답한다');

  /* 새 파일을 받으면 같은 접수가 끝까지 간다 */
  await sendFile(bad.scope, 'side', mov240(4096), bad.sideId);
  const after = await loadPublicState(db, bad.scope, { now: at(HOUR) });
  eq(goneViewsToPick(after, none), [], '(나) 새 파일이 온 칸은 막지 않는다');
  const fixed = await finalize(bad.scope, after.version, key(), { samePitchConfirmed: true });
  ok(fixed.created && fixed.revision === 2, '(나) 새 판이 생긴다');
  /* 걸어 둔 확인 일감을 여기서 끝낸다 — 뒤 시험의 저장소 실패 주입이 이 일감에 걸리지 않게 */
  await runDueJobs(db, intakeCoreJobHandlers(db, storage), { owner: 'w-repick', limit: 50, now: () => at(HOUR) });
  eq((await db.intakeSubmission.findUniqueOrThrow({ where: { id: bad.submissionId } })).status, 'verified', '(나) 새 파일이 맞으면 검증된다');
}
{
  /*
   * 검증 지적: 요청받지 않은 칸의 판 파일이 막혀 있으면 받는 사람이 그 칸을 고칠 수 없었다. 내면 '두 영상의 전송이 아직 끝나지 않았어요'가 나왔다(거짓이다).
   * 막힌 파일로는 판을 얼릴 수 없다 — 지운 칸처럼 막힌 칸도 요청에 늘 넣는다. 요청한 뒤에 막혀도 넣는다.
   */
  const none = { side: null, rear: null };
  const tamper = async (assetId: string, bytes: Buffer) => {
    const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: assetId } });
    const t = Buffer.from(bytes);
    t[t.length - 1] ^= 1;
    objects.set(row.objectPath, t);
  };
  const stateAt = (scope: IntakeScope) => loadPublicState(db, scope, { now: at(HOUR) });

  /* (다) 관리자가 막힌 뒤 칸을 빼고 옆만 요청했다 */
  const a = await ready();
  await finalize(a.scope, a.state.version);
  await tamper(a.rearId, a.rear);
  eq(await verifyAsset(db, storage, a.rearId, NOW), 'rejected', '(다) 뒤 파일이 막힌다');
  await verifyAsset(db, storage, a.sideId, NOW);
  await requestCorrection(db, { adminId: 'a', submissionId: a.submissionId, views: ['side'] }, at(HOUR));
  const as = await stateAt(a.scope);
  eq(as.correction?.views, ['side', 'rear'], '(다) 막힌 칸은 요청에 늘 들어간다');
  eq(goneViewsToPick(as, none), ['side', 'rear'], '(다) 화면이 두 칸 다 새로 고르라고 한다');
  await fails(finalize(a.scope, as.version, key(), { samePitchConfirmed: true }), 'correction_incomplete', '(다) 안 고치고 내면 전송 중이라고 하지 않는다');
  await sendFile(a.scope, 'side', mov240(4096), a.sideId);
  await sendFile(a.scope, 'rear', mov120(4096), a.rearId);
  const aDone = await finalize(a.scope, (await stateAt(a.scope)).version, key(), { samePitchConfirmed: true });
  ok(aDone.created && aDone.revision === 2, '(다) 두 칸을 새로 받으면 낼 수 있다');

  /* (라) 글만 요청해도 막힌 칸이 들어간다 */
  const b = await ready();
  await finalize(b.scope, b.state.version);
  await tamper(b.sideId, b.side);
  await verifyAsset(db, storage, b.sideId, NOW);
  await verifyAsset(db, storage, b.rearId, NOW);
  await requestCorrection(db, { adminId: 'a', submissionId: b.submissionId, fields: ['athleteName'] }, at(HOUR));
  const bs = await stateAt(b.scope);
  eq([bs.correction?.fields, bs.correction?.views], [['athleteName'], ['side']], '(라) 글만 요청해도 막힌 칸이 요청에 들어간다');
  eq(goneViewsToPick(bs, none), ['side'], '(라) 화면이 그 칸을 고르라고 한다');

  /* (마) 요청한 뒤에 파일이 막혔다 — 요청할 때는 막힌 칸이 없어 관리자가 고를 수 없었다 */
  const c = await ready();
  await finalize(c.scope, c.state.version);
  await requestCorrection(db, { adminId: 'a', submissionId: c.submissionId, fields: ['athleteName'] }, at(HOUR));
  const cBefore = await stateAt(c.scope);
  eq(cBefore.correction?.views, [], '(마) 요청할 때는 영상 칸이 없다');
  await tamper(c.sideId, c.side);
  eq(await verifyAsset(db, storage, c.sideId, at(HOUR)), 'rejected', '(마) 요청 뒤에 옆 파일이 막힌다');
  await verifyAsset(db, storage, c.rearId, at(HOUR));
  const cs = await stateAt(c.scope);
  eq([cs.submissionStatus, cs.correction?.views], ['correction_requested', ['side']], '(마) 막힌 칸을 요청에 더한다');
  ok(cs.version > cBefore.version, '(마) 판이 올라 낡은 화면은 다시 읽는다');
  eq(await db.intakeAudit.count({ where: { submissionId: c.submissionId, action: 'correction.widened' } }), 1, '(마) 요청에 더한 기록이 남는다');
  eq(goneViewsToPick(cs, none), ['side'], '(마) 화면이 그 칸을 고르라고 한다');
  const cv = (await saveDraft(db, c.scope, { expectedVersion: cs.version, athleteName: '금윤호2' }, at(HOUR))).version;
  await fails(finalize(c.scope, cv), 'correction_incomplete', '(마) 이름만 고쳐 내면 그 칸을 고치라고 답한다');
  await verifyAsset(db, storage, c.sideId, at(HOUR));
  eq(await db.intakeAudit.count({ where: { submissionId: c.submissionId, action: 'correction.widened' } }), 1, '(마) 다시 불러도 한 번만 더한다');

  /* (바) 막힌 칸이 빠진 요청이 남아 있으면(앞선 판 · 손으로 고친 줄) 내기를 누를 때 서버가 그 칸을 넣고 고치라고 답한다 */
  const d = await ready();
  await finalize(d.scope, d.state.version);
  await tamper(d.rearId, d.rear);
  await verifyAsset(db, storage, d.rearId, NOW);
  await verifyAsset(db, storage, d.sideId, NOW);
  await requestCorrection(db, { adminId: 'a', submissionId: d.submissionId, views: ['side'] }, at(HOUR));
  await db.intakeSubmission.update({ where: { id: d.submissionId }, data: { correction: { fields: [], views: ['side'], message: null }, version: { increment: 1 } } });
  await sendFile(d.scope, 'side', mov240(4096), d.sideId);
  const dv = (await stateAt(d.scope)).version;
  await fails(finalize(d.scope, dv, key(), { samePitchConfirmed: true }), 'correction_incomplete', '(바) 전송 중이라고 하지 않고 고치라고 답한다');
  const ds = await stateAt(d.scope);
  eq(ds.correction?.views, ['side', 'rear'], '(바) 막힌 칸을 요청에 넣어 받는 사람이 고칠 수 있다');
  ok(ds.version > dv, '(바) 판이 올라 화면이 다시 읽는다');
  eq(goneViewsToPick(ds, none), ['rear'], '(바) 새로 받은 옆 칸은 막지 않고 뒤 칸만 고르라고 한다');
  await runDueJobs(db, intakeCoreJobHandlers(db, storage), { owner: 'w-blocked', limit: 50, now: () => at(HOUR) });
}
{
  /*
   * 검증 지적: 요청받은 칸에 얼린 파일과 같은 영상을 다시 고르면 서버가 얼린 자산을 그대로 돌려줬다. 칸이 안 바뀌어 '요청받은 내용을 먼저 고쳐 주세요'가 되풀이됐다.
   * 이미 보낸 영상이라고 고를 때 바로 답한다.
   */
  const stateAt = (scope: IntakeScope) => loadPublicState(db, scope, { now: at(HOUR) });
  const e = await ready();
  await finalize(e.scope, e.state.version);
  await verifyAsset(db, storage, e.sideId, NOW);
  await verifyAsset(db, storage, e.rearId, NOW);
  await requestCorrection(db, { adminId: 'a', submissionId: e.submissionId, views: ['side'] }, at(HOUR));
  const again = (expectedAssetId: string) => reserveAsset(db, e.scope, { view: 'side', expectedAssetId, fileName: 'side.MOV', sizeBytes: e.side.length, sha256: sha(e.side) }, at(HOUR));
  await fails(again(e.sideId), 'same_as_sent', '(사) 얼린 파일과 같은 영상이면 이미 보낸 영상이라고 답한다');
  eq((await stateAt(e.scope)).assets.side?.id, e.sideId, '(사) 칸은 그대로다');
  const newSide = await sendFile(e.scope, 'side', mov240(4096), e.sideId);
  await fails(again(newSide), 'same_as_sent', '(사) 새 파일을 고른 뒤 옛 파일로 돌아가도 같다');
  eq((await stateAt(e.scope)).assets.side?.id, newSide, '(사) 새로 고른 파일이 칸에 남는다');
  const eDone = await finalize(e.scope, (await stateAt(e.scope)).version, key(), { samePitchConfirmed: true });
  ok(eDone.created && eDone.revision === 2, '(사) 다른 영상을 보내면 낼 수 있다');

  /* (아) 확인이 끝나지 않은 얼린 파일 — 같은 영상을 다시 받아 새로 확인한다(막혀서 되돌아오지 않는다) */
  const f = await ready();
  await finalize(f.scope, f.state.version);
  await requestCorrection(db, { adminId: 'a', submissionId: f.submissionId, views: ['side'] }, at(HOUR));
  const re = await reserveAsset(db, f.scope, { view: 'side', expectedAssetId: f.sideId, fileName: 'side.MOV', sizeBytes: f.side.length, sha256: sha(f.side), pairConfirmed: true }, at(HOUR));
  ok(re.created && re.asset.id !== f.sideId, '(아) 확인이 안 끝난 파일은 같은 영상으로 다시 받는다');
  await runDueJobs(db, intakeCoreJobHandlers(db, storage), { owner: 'w-same-sent', limit: 50, now: () => at(HOUR) });
}
{
  /* 이름 · 종류를 영상처럼 꾸민 글 파일 */
  const i = await invite();
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const evil = Buffer.from('<?php echo 1; ?>'.repeat(100));
  const id = await sendFile(i.scope, 'side', evil, null, 'video.mov');
  eq(await verifyAsset(db, storage, id, NOW), 'rejected', '바이트가 영상이 아니면 막는다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id } })).rejectCode, 'not_video', '까닭');
}
{
  /* 브라우저가 해시를 거짓으로 말해 같은 바이트를 양쪽에 보냄 — 서버 해시로 잡는다 */
  const r = await ready();
  const rearRow = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.rearId } });
  objects.set(rearRow.objectPath, r.side);
  await db.intakeAsset.update({ where: { id: r.rearId }, data: { clientSha256: sha(r.side).replace(/.$/, '0'), declaredSize: BigInt(r.side.length) } });
  await db.intakeAsset.update({ where: { id: r.sideId }, data: { status: 'verified', serverSha256: sha(r.side) } });
  await db.intakeAsset.update({ where: { id: r.rearId }, data: { status: 'verified', serverSha256: sha(r.side) } });
  await fails(finalize(r.scope, r.state.version), 'same_file', '서버 해시가 같으면 끝낼 수 없다');
}
{
  /* 일시적 저장소 실패는 재시도 — 상태가 망가지지 않는다 */
  const r = await ready();
  await finalize(r.scope, r.state.version);
  fail.hash = 1;
  const handlers = intakeCoreJobHandlers(db, storage);
  const a = await runDueJobs(db, handlers, { owner: 'w2', limit: 50, now: () => at(2 * HOUR) });
  ok(a.retried === 1, '실패는 미룬다');
  eq((await db.intakeSubmission.findUniqueOrThrow({ where: { id: r.submissionId } })).status, 'submitted', '접수는 그대로');
  await runDueJobs(db, handlers, { owner: 'w2', limit: 50, now: () => at(3 * HOUR) });
  eq((await db.intakeSubmission.findUniqueOrThrow({ where: { id: r.submissionId } })).status, 'verified', '다음 차례에 끝난다');
}

/* ─────────────────────── 만료 · 폐기 ─────────────────────── */
{
  const r = await ready({ uploadExpiresAt: at(HOUR), resultExpiresAt: at(30 * DAY) });
  const late = at(2 * HOUR);
  await fails(openIntakeScope(db, `Intake ${r.token}`, 'upload', late), 'upload_expired', '기간이 끝나면 새 올리기 막음');
  await fails(saveDraft(db, r.scope, { expectedVersion: r.state.version, athleteName: '늦음' }, late), 'upload_expired', '초안도 막음');
  const x = mov240();
  await fails(reserveAsset(db, r.scope, { view: 'side', expectedAssetId: r.sideId, fileName: 'x', sizeBytes: x.length, sha256: sha(x) }, late), 'upload_expired', '고르기도 막음');
  ok((await openIntakeScope(db, `Intake ${r.token}`, 'view_result', late)).submissionId === r.submissionId, '결과 보기는 따로 살아 있다');
  eq((await loadPublicState(db, r.scope, { now: late })).uploadExpired, true, '읽기는 된다');
}
{
  /* 기간 끝에 끝난 전송의 확인은 받는다 */
  const i = await invite({ uploadExpiresAt: at(HOUR) });
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const a = mov240();
  const r = await reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: 'a', sizeBytes: a.length, sha256: sha(a) }, NOW);
  const g = await issueUploadToken(db, storage, i.scope, { assetId: r.asset.id }, NOW);
  objects.set(g.objectName, a);
  eq((await confirmUpload(db, storage, i.scope, { assetId: r.asset.id }, at(2 * HOUR))).status, 'uploaded', '끝난 전송의 확인');
  await fails(issueUploadToken(db, storage, i.scope, { assetId: r.asset.id }, at(2 * HOUR)), 'upload_expired', '새 토큰은 안 준다');
}
{
  const r = await ready();
  const k = key();
  await finalize(r.scope, r.state.version, k);
  await db.intakeInvitation.update({ where: { id: r.invitationId }, data: { status: 'revoked', revokedAt: NOW } });
  await fails(openIntakeScope(db, `Intake ${r.token}`, 'read', NOW), 'invitation_revoked', '폐기면 읽기도 막음');
  await fails(openIntakeScope(db, `Intake ${r.token}`, 'view_result', NOW), 'invitation_revoked', '폐기면 결과도 막음');
  await fails(finalize(r.scope, r.state.version, k), 'invitation_revoked', '같은 키의 재시도도 막음');
  await fails(loadPublicState(db, r.scope, { now: NOW }), 'invitation_revoked', '이미 연 범위로도 못 읽는다');
  await fails(requestCorrection(db, { adminId: 'a', submissionId: r.submissionId, views: ['side'] }, NOW), 'invitation_revoked', '폐기된 접수는 고침 요청 불가');
}
{
  /* 폐기는 그사이의 작업을 막는다 */
  const r = await ready();
  await db.intakeInvitation.update({ where: { id: r.invitationId }, data: { status: 'revoked' } });
  await fails(finalize(r.scope, r.state.version), 'invitation_revoked', '폐기 뒤 완료');
  await fails(issueUploadToken(db, storage, r.scope, { assetId: r.sideId }, NOW), 'invitation_revoked', '폐기 뒤 토큰');
  await fails(confirmUpload(db, storage, r.scope, { assetId: r.sideId }, NOW), 'invitation_revoked', '폐기 뒤 확인');
  await fails(recordConsents(db, r.scope, { answers: REQUIRED }, NOW), 'invitation_revoked', '폐기 뒤 동의');
}

/* ─────────────────────── 다른 초대의 것 ─────────────────────── */
{
  const a = await ready();
  const b = await ready();
  await fails(confirmUpload(db, storage, b.scope, { assetId: a.sideId }, NOW), 'asset_not_found', '남의 자산 확인');
  await fails(issueUploadToken(db, storage, b.scope, { assetId: a.sideId }, NOW), 'asset_not_found', '남의 자산 토큰');
  await fails(registerUploadUrl(db, storage, b.scope, { assetId: a.sideId, uploadUrl: `${storage.uploadOrigin}/storage/v1/upload/resumable/sign/x` }, NOW), 'asset_not_found', '남의 자산 주소');
  await fails(issueUploadToken(db, storage, b.scope, { assetId: '../../etc/passwd' }, NOW), 'asset_not_found', '경로 같은 번호');
  const forged = { invitationId: b.invitationId, submissionId: a.submissionId };
  await fails(loadPublicState(db, forged, { now: NOW }), 'submission_not_found', '범위를 섞어 읽기');
  await fails(saveDraft(db, forged, { expectedVersion: 0, athleteName: 'x' }, NOW), 'submission_not_found', '범위를 섞어 쓰기');
  await fails(finalize(forged, a.state.version), 'submission_not_found', '범위를 섞어 끝내기');
}

/* ─────────────────────── 고침 ─────────────────────── */
{
  const r = await ready();
  const receipt = await finalize(r.scope, r.state.version);
  await runDueJobs(db, intakeCoreJobHandlers(db, storage), { owner: 'w3', limit: 50, now: () => at(HOUR) });

  await fails(requestCorrection(db, { adminId: 'a', submissionId: r.submissionId }, NOW), 'invalid_input', '고칠 것이 없으면 막음');
  const draft = await invite();
  await fails(requestCorrection(db, { adminId: 'a', submissionId: draft.submissionId, views: ['side'] }, NOW), 'not_finalized', '접수 전에는 없다');

  await requestCorrection(db, { adminId: 'admin-2', submissionId: r.submissionId, views: ['rear'], fields: ['athleteName'], message: '뒤 영상이 잘렸어요' }, at(HOUR));
  const s = await loadPublicState(db, r.scope, { now: at(HOUR) });
  eq(s.screen, 'correction', '요청받은 것만 여는 화면');
  eq(s.correction, { fields: ['athleteName'], views: ['rear'], message: '뒤 영상이 잘렸어요' }, '요청 내용');

  await fails(saveDraft(db, r.scope, { expectedVersion: s.version, throwingHand: 'L' }, at(HOUR)), 'not_editable', '요청 밖 칸');
  const x = mov240();
  await fails(reserveAsset(db, r.scope, { view: 'side', expectedAssetId: r.sideId, fileName: 'x', sizeBytes: x.length, sha256: sha(x) }, at(HOUR)), 'not_editable', '요청 밖 영상');
  await fails(finalize(r.scope, s.version), 'correction_incomplete', '요청받은 칸을 안 바꾸고는 못 끝낸다');

  const v = await saveDraft(db, r.scope, { expectedVersion: s.version, athleteName: '금윤호 ' }, at(HOUR));
  eq(v.version, s.version, '같은 이름');
  const newRear = mov120(8192);
  const reserved = await reserveAsset(db, r.scope, { view: 'rear', expectedAssetId: r.rearId, fileName: '새 뒤.MOV', sizeBytes: newRear.length, declaredType: 'video/quicktime', sha256: sha(newRear) }, at(HOUR));
  const oldRear = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.rearId } });
  eq(oldRear.status, 'verified', '얼린 옛 자산의 상태는 그대로다');
  ok(objects.has(oldRear.objectPath), '옛 원본은 그대로 남는다');
  const g = await issueUploadToken(db, storage, r.scope, { assetId: reserved.asset.id }, at(HOUR));
  objects.set(g.objectName, newRear);
  await confirmUpload(db, storage, r.scope, { assetId: reserved.asset.id }, at(HOUR));

  await fails(finalize(r.scope, reserved.version), 'same_pitch_required', '영상을 바꿨으면 새 짝으로 다시 확인한다');
  const second = await finalize(r.scope, reserved.version, key(), { samePitchConfirmed: true });
  ok(second.created && second.revision === 2, '새 판이 생긴다');
  eq(second.receiptCode, receipt.receiptCode, '접수 번호는 그대로');
  eq(second.receivedAt, receipt.receivedAt, '접수 시각은 첫 접수 그대로');
  const revs = await db.intakeRevision.findMany({ where: { submissionId: r.submissionId }, orderBy: { number: 'asc' } });
  ok(revs[0].rearAssetId === r.rearId && revs[1].rearAssetId === reserved.asset.id && revs[0].sideAssetId === revs[1].sideAssetId, '옛 판은 안 바뀌고 옆은 이어 쓴다');
  const sub = await db.intakeSubmission.findUniqueOrThrow({ where: { id: r.submissionId } });
  ok(sub.currentRevisionId === revs[1].id && sub.correction === null && sub.analysisStatus === 'none', '새 판이 지금 판이고 분석은 다시 준비');
  await verifyAsset(db, storage, reserved.asset.id, at(HOUR));
  eq((await db.intakeSubmission.findUniqueOrThrow({ where: { id: r.submissionId } })).status, 'verified', '새 파일이 맞으면 다시 검증됨');

  /* 기간이 끝났으면 늘려야 고칠 수 있다 */
  const e = await ready({ uploadExpiresAt: at(HOUR) });
  await finalize(e.scope, e.state.version);
  await requestCorrection(db, { adminId: 'a', submissionId: e.submissionId, fields: ['athleteName'] }, at(2 * HOUR));
  const lapsed = await loadPublicState(db, e.scope, { now: at(2 * HOUR) });
  eq(lapsed.screen, 'receipt', '기간이 끝난 고침은 영수증으로 내려간다');
  ok(lapsed.statusText.includes('기간이 끝났어요'), '고칠 수 없다는 사실을 말한다');
  await requestCorrection(db, { adminId: 'a', submissionId: e.submissionId, fields: ['athleteName'], extendUploadUntil: at(DAY) }, at(2 * HOUR));
  const v2 = (await db.intakeSubmission.findUniqueOrThrow({ where: { id: e.submissionId } })).version;
  eq((await loadPublicState(db, e.scope, { now: at(2 * HOUR) })).screen, 'correction', '고침 중에 기간을 늘리면 다시 열린다');
  ok((await saveDraft(db, e.scope, { expectedVersion: v2, athleteName: '고친 이름' }, at(3 * HOUR))).version > v2, '기간을 늘리면 고친다');
}

/* ─────────────────────── 철회 ─────────────────────── */
{
  const r = await ready();
  await recordConsents(db, r.scope, { answers: [answer('model', true)] }, NOW);
  await finalize(r.scope, r.state.version);
  const a = await withdrawConsent(db, r.scope, { kind: 'model' }, at(HOUR));
  ok(!a.submissionWithdrawn && (await loadPublicState(db, r.scope, { now: at(HOUR) })).consent.granted.model === false, '선택 동의 철회는 접수를 안 멈춘다');
  const b = await withdrawConsent(db, r.scope, { kind: 'overseas' }, at(HOUR));
  ok(b.submissionWithdrawn, '필수 동의 철회');
  eq((await loadPublicState(db, r.scope, { now: at(HOUR) })).screen, 'withdrawn', '철회 화면');
  const side = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.sideId } });
  ok(objects.has(side.objectPath), '보유 기간이 정해지기 전이라 원본은 저절로 안 지운다');
  await fails(finalize(r.scope, 99), 'invalid_state', '철회 뒤에는 못 끝낸다');
}

/* ─────────────────────── 일감 ─────────────────────── */
{
  const t = at(10 * DAY);
  ok(await enqueueJob(db, { kind: 'cleanup_uploads', dedupeKey: 'dedupe-a', payload: {}, runAfter: t }), '넣는다');
  ok(!(await enqueueJob(db, { kind: 'cleanup_uploads', dedupeKey: 'dedupe-a', payload: {}, runAfter: t })), '같은 열쇠는 안 들어간다');
  const a = await leaseJobs(db, { owner: 'A', limit: 10, now: at(10 * DAY + 1000), kinds: ['cleanup_uploads'] });
  const b = await leaseJobs(db, { owner: 'B', limit: 10, now: at(10 * DAY + 2000), kinds: ['cleanup_uploads'] });
  ok(a.length >= 1 && b.length === 0, '빌린 일은 다른 일꾼이 안 가져간다');
  const c = await leaseJobs(db, { owner: 'B', limit: 10, now: at(10 * DAY + 11 * 60_000), kinds: ['cleanup_uploads'] });
  ok(c.length === a.length, '임대가 끝나면 이어 받는다');
  ok(c[0].attempts === 2, '시도 횟수를 센다');

  /* 처리기가 아직 없는 종류는 횟수를 안 쓴다 */
  await enqueueJob(db, { kind: 'poll_analysis', dedupeKey: 'no-handler', payload: {}, runAfter: t });
  const sum = await runDueJobs(db, {}, { owner: 'C', limit: 10, now: () => at(10 * DAY + 1000), kinds: ['poll_analysis'] });
  ok(sum.postponed === 1 && (await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: 'no-handler' } })).attempts === 0, '없는 처리기는 미룬다');

  /* 기다리는 일 */
  const wait = await runDueJobs(db, { poll_analysis: async () => ({ retryAfterMs: 60_000 }) }, { owner: 'C', limit: 10, now: () => at(10 * DAY + 10 * 60_000), kinds: ['poll_analysis'] });
  ok(wait.postponed === 1 && (await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: 'no-handler' } })).attempts === 0, '기다림은 실패로 안 센다');

  /* 한 번 실패한 뒤 다시 돌아 기다림으로 끝나면, 앞 실패 글을 안 들고 간다 — 상세가 일감을 '다시 시도하는 중'으로 잘못 보이지 않게 */
  let pollTries = 0;
  const flaky = { poll_analysis: async () => (pollTries++ === 0 ? Promise.reject(new Error('잠깐 안 돼요')) : { retryAfterMs: 60_000 }) };
  await runDueJobs(db, flaky, { owner: 'C', limit: 10, now: () => at(10 * DAY + 20 * 60_000), kinds: ['poll_analysis'] });
  eq((await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: 'no-handler' } })).lastError, '잠깐 안 돼요', '실패하면 까닭이 남는다');
  await runDueJobs(db, flaky, { owner: 'C', limit: 10, now: () => at(10 * DAY + 40 * 60_000), kinds: ['poll_analysis'] });
  eq((await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: 'no-handler' } })).lastError, null, '다시 돌아 기다림으로 끝나면 지난 까닭을 지운다');

  /* 끝까지 실패하면 멈추고, 다시 걸 수 있다 */
  await enqueueJob(db, { kind: 'register_revision', dedupeKey: 'always-fails', payload: {}, runAfter: t, maxAttempts: 2 });
  const boom = { register_revision: async () => Promise.reject(new Error('안 돼요')) };
  /* 앞 시험이 남긴 등록 일감이 먼저 나오지 않게 비운다 */
  await db.intakeJob.deleteMany({ where: { kind: 'register_revision', NOT: { dedupeKey: 'always-fails' } } });
  await runDueJobs(db, boom, { owner: 'D', limit: 10, now: () => at(10 * DAY + 1000), kinds: ['register_revision'] });
  const end = await runDueJobs(db, boom, { owner: 'D', limit: 10, now: () => at(11 * DAY), kinds: ['register_revision'] });
  ok(end.failed >= 1, '횟수를 다 쓰면 멈춘다');
  const stopped = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: 'always-fails' } });
  ok(stopped.status === 'failed' && stopped.lastError === '안 돼요', '까닭을 남긴다');
  ok(await requeueJob(db, 'always-fails', at(12 * DAY)), '다시 건다');
  ok((await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: 'always-fails' } })).status === 'queued', '다시 줄에 선다');
  await db.intakeJob.deleteMany({ where: { dedupeKey: { in: ['always-fails', 'no-handler', 'dedupe-a'] } } });
}

/* ─────────────────────── 대사 · 정리 ─────────────────────── */
{
  /* 화면이 확인 전에 닫힘: 저장소에는 있고 DB 는 모른다 */
  const i = await invite();
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const a = mov240();
  const r = await reserveAsset(db, i.scope, { view: 'side', expectedAssetId: null, fileName: 'a', sizeBytes: a.length, sha256: sha(a) }, NOW);
  const g = await issueUploadToken(db, storage, i.scope, { assetId: r.asset.id }, NOW);
  objects.set(g.objectName, a);
  eq(await reconcileUploads(db, storage, at(60_000)), 0, '방금 시작한 전송은 안 본다');
  ok((await reconcileUploads(db, storage, at(HOUR))) >= 1, '끝났는데 모르는 전송을 찾는다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: r.asset.id } })).status, 'uploaded', '도착으로 적는다');
  eq(await db.intakeJob.count({ where: { dedupeKey: `verify_asset:${r.asset.id}` } }), 1, '검증을 건다');
}
{
  const r = await ready();
  await finalize(r.scope, r.state.version);
  const side = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.sideId } });

  /* 버려진 교체본 하나, 진행 중인 교체본 하나 */
  const j = await invite();
  await named(j.scope);
  await recordConsents(db, j.scope, { answers: REQUIRED }, NOW);
  const f1 = mov240();
  const f2 = mov240();
  const oldId = await sendFile(j.scope, 'side', f1);
  const old = await db.intakeAsset.findUniqueOrThrow({ where: { id: oldId } });
  const swap = await reserveAsset(db, j.scope, { view: 'side', expectedAssetId: oldId, fileName: 'n', sizeBytes: f2.length, sha256: sha(f2) }, NOW);
  await issueUploadToken(db, storage, j.scope, { assetId: swap.asset.id }, NOW);

  /* 시각은 시험 시계(NOW)로 센다 — 초대 기간을 NOW 에서 셌다. 실제 시계로 정리하면 날짜가 지나며 기간이 끝난 것처럼 된다 */
  const soon = await cleanupStaleUploads(db, storage, NOW, 500);
  ok(objects.has(old.objectPath) && soon.purged === 0, '주소가 끝나기 전에는 안 지운다');

  const far = new Date(NOW.getTime() + 3 * DAY);
  const c = await cleanupStaleUploads(db, storage, far, 500);
  ok(c.purged >= 1 && !objects.has(old.objectPath), '교체된 자산을 지운다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: oldId } })).status, 'purged', '지운 것을 남긴다');
  ok(objects.has(side.objectPath), '접수된 원본은 안 지운다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: swap.asset.id } })).status, 'uploading', '기간이 남은 진행 중 전송은 안 건드린다');

  /* 기간이 끝나면 칸이 가리키는 미완료 전송도 정리한다 */
  await db.intakeInvitation.update({ where: { id: j.invitationId }, data: { uploadExpiresAt: new Date(NOW.getTime() - 1000) } });
  const d = await cleanupStaleUploads(db, storage, far, 500);
  ok(d.abandoned >= 1, '끝난 초대의 미완료 전송을 버린다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: swap.asset.id } })).status, 'purged', '버린 전송을 지운다');
  eq((await db.intakeSubmission.findUniqueOrThrow({ where: { id: j.submissionId } })).sideAssetId, null, '칸이 지워진 자산을 안 가리킨다');
  ok(objects.has(side.objectPath), '그래도 접수된 원본은 그대로다');
}

/* ─────────────────────── 횟수 제한 · 감사 ─────────────────────── */
{
  const rule = { limit: 3, windowSec: 60 };
  const hit = (now: Date) => hitRateLimit(db, { scope: 'code', subject: '1.2.3.4', rule, now, salt: 's' });
  await hit(NOW);
  await hit(NOW);
  ok((await hit(NOW)).allowed, '한도까지는 된다');
  const over = await hit(NOW);
  ok(!over.allowed && over.retryAfterSec > 0, '넘으면 막는다');
  ok((await hit(at(61_000))).allowed, '창이 바뀌면 다시');
  ok((await hitRateLimit(db, { scope: 'code', subject: '5.6.7.8', rule, now: NOW, salt: 's' })).allowed, '주소마다 따로');
  await fails(enforceRateLimit(db, { scope: 'code', subject: '1.2.3.4', rule, now: NOW, salt: 's' }), 'rate_limited', '던진다');
  const keys = await db.intakeRateLimit.findMany({ select: { key: true } });
  ok(!keys.some((k) => k.key.includes('1.2.3.4')), '주소 원문을 안 남긴다');
  ok((await pruneRateLimits(db, at(3 * DAY))) >= 1, '지난 창을 지운다');

  await writeAudit(db, { actor: { kind: 'system' }, action: 'test', detail: { token: 'SECRET-VALUE', uploadUrl: 'https://x', view: 'side' } }, NOW);
  const audit = await db.intakeAudit.findFirstOrThrow({ where: { action: 'test' } });
  ok(!JSON.stringify(audit.detail).includes('SECRET-VALUE') && (audit.detail as { view: string }).view === 'side', '감사 기록에 토큰이 안 남는다');
  const all = await db.intakeAudit.findMany();
  ok(!JSON.stringify(all).match(/tok-[0-9a-f]{8}/), '전체 감사 기록에 전송 토큰이 없다');
}

/* ─────────────────────── 끊긴 정산 잇기 ─────────────────────── */
/** 일꾼이 도는 모습을 흉내 낼 공용 크론 — 분석 서버는 쓰지 않는다 */
const cron = (t: Date) => runIntakeCron({ db, storage, gpu: {}, now: () => t } as never, { owner: 'cron-test' });
const subRow = (id: string) => db.intakeSubmission.findUniqueOrThrow({ where: { id } });
const revOf = (submissionId: string) => db.intakeRevision.findFirstOrThrow({ where: { submissionId }, orderBy: { number: 'desc' } });
/** 저장한 판이 정산 전에 끊긴 모습 — 자산은 끝났고 판은 'pending' */
async function cutBeforeSettle(r: Awaited<ReturnType<typeof ready>>) {
  const receipt = await finalize(r.scope, r.state.version);
  for (const id of [r.sideId, r.rearId]) {
    const a = await db.intakeAsset.findUniqueOrThrow({ where: { id } });
    await db.intakeAsset.update({ where: { id }, data: { status: 'verified', serverSha256: a.clientSha256, storedBytes: a.declaredSize, verifiedAt: NOW } });
  }
  await db.intakeJob.deleteMany({ where: { dedupeKey: { in: [`verify_asset:${r.sideId}`, `verify_asset:${r.rearId}`] } } });
  return receipt;
}
/** n 번째 트랜잭션에서 끊기는 db — 나머지는 그대로 지나간다 */
const flakyTx = (n: number) => {
  let calls = 0;
  return new Proxy(db, {
    get(target, prop) {
      if (prop === '$transaction') {
        return (...args: unknown[]) => {
          if (++calls === n) throw new Error('연결이 끊겼어요');
          return (target.$transaction as (...a: unknown[]) => unknown)(...args);
        };
      }
      const v = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  }) as typeof db;
};
{
  /* 자산을 적은 뒤 정산 전에 끊겼다: 일감을 다시 돌리면 끝난 자산이어도 정산한다 */
  const r = await ready();
  await cutBeforeSettle(r);
  eq((await revOf(r.submissionId)).status, 'pending', '끊긴 뒤에는 판이 pending 이다');
  eq(await verifyAsset(db, storage, r.sideId, NOW), 'verified', '끝난 자산은 다시 재지 않는다');
  eq((await revOf(r.submissionId)).status, 'verified', '끝난 자산의 재시도가 판을 닫는다');
  const sub = await subRow(r.submissionId);
  ok(sub.status === 'verified' && sub.analysisStatus === 'ready', '접수도 이어 간다');
  eq(await db.intakeAudit.count({ where: { submissionId: r.submissionId, action: 'revision.verified' } }), 1, '정산 기록은 하나');
}
{
  /* 두 파일이 먼저 검증된 흔한 경우에 완료 뒤 정산이 끊겼다: 영수증은 받고, 같은 키의 재시도가 정산한다 */
  const r = await ready();
  await verifyAsset(db, storage, r.sideId, NOW);
  await verifyAsset(db, storage, r.rearId, NOW);
  const k = key();
  const first = await finalizeSubmission(flakyTx(2), r.scope, { expectedVersion: r.state.version, idempotencyKey: k }, NOW);
  ok(first.created && first.submissionStatus === 'submitted', '정산이 끊겨도 영수증은 준다');
  eq((await revOf(r.submissionId)).status, 'pending', '판은 아직 pending');
  const again = await finalize(r.scope, first.version, k);
  ok(!again.created && again.receiptCode === first.receiptCode, '같은 키는 같은 영수증');
  eq(again.submissionStatus, 'verified', '재시도가 정산까지 한다');
  eq((await subRow(r.submissionId)).analysisStatus, 'ready', '분석 준비까지 간다');
}
{
  /* 다른 키로 다시 눌러도 같다 */
  const r = await ready();
  await verifyAsset(db, storage, r.sideId, NOW);
  await verifyAsset(db, storage, r.rearId, NOW);
  const first = await finalizeSubmission(flakyTx(2), r.scope, { expectedVersion: r.state.version, idempotencyKey: key() }, NOW);
  eq((await finalize(r.scope, first.version)).submissionStatus, 'verified', '다른 키의 재시도도 정산한다');
}
{
  /* 아무도 다시 안 와도 크론이 잇는다. 아직 안 끝난 판은 건드리지 않는다 */
  const r = await ready();
  await cutBeforeSettle(r);
  const waiting = await ready();
  await finalize(waiting.scope, waiting.state.version);
  await db.intakeJob.deleteMany({ where: { dedupeKey: { in: [`verify_asset:${waiting.sideId}`, `verify_asset:${waiting.rearId}`] } } });
  ok((await reconcilePendingRevisions(db, NOW)) >= 1, '끝난 자산의 pending 판을 찾는다');
  eq((await revOf(r.submissionId)).status, 'verified', '판이 닫힌다');
  eq((await revOf(waiting.submissionId)).status, 'pending', '검증이 안 끝난 판은 그대로다');

  const viaCron = await ready();
  await cutBeforeSettle(viaCron);
  const sum = await cron(at(HOUR));
  ok(sum.settled >= 1, '크론이 판을 닫는다');
  eq((await subRow(viaCron.submissionId)).status, 'verified', '크론 뒤 접수가 이어 간다');

  /* 한쪽이 막혔으면 다른 쪽을 안 기다린다 */
  const bad = await ready();
  await finalize(bad.scope, bad.state.version);
  await db.intakeAsset.update({ where: { id: bad.sideId }, data: { status: 'rejected', rejectCode: 'hash_mismatch' } });
  await reconcilePendingRevisions(db, NOW);
  eq((await subRow(bad.submissionId)).status, 'needs_attention', '막힌 자산이 있는 판도 닫는다');
}

/* ─────────────────────── 파일 탓의 고정 실패 ─────────────────────── */
{
  /* 코덱 칸에 NUL 이 든 영상 — 예전에는 쓰기에서 던져 'verifying' 에 멈췄다 */
  const i = await invite();
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const nul = buildMov({ stts: [[60, 10]], codec: 'a\0\0b', brand: 'q\0\0t', appleModel: 'iPhone\u0000 15' });
  const id = await sendFile(i.scope, 'side', nul);
  eq(await verifyAsset(db, storage, id, NOW), 'verified', 'NUL 이 든 머리도 검증이 끝난다');
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id } });
  eq((row.mediaFacts as { codec: string }).codec, 'ab', '다듬은 값을 저장한다');

  /* 말이 안 되는 촬영 시각 */
  const far = buildMov({ stts: [[60, 10]], mvhdCreated: BigInt(2) ** BigInt(62) });
  const farId = await sendFile(i.scope, 'rear', far);
  eq(await verifyAsset(db, storage, farId, NOW), 'verified', '범위 밖 시각도 검증이 끝난다');
  const farRow = await db.intakeAsset.findUniqueOrThrow({ where: { id: farId } });
  ok(farRow.captureAt === null && farRow.captureAtSource === null, '시각은 버린다');
}
{
  /* 다듬어도 DB 가 거절하는 값이 남으면: 전체 읽기 없이 닫고, 다시 돌지 않는다 */
  const i = await invite();
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const id = await sendFile(i.scope, 'side', mov240(1024));

  const badDate = await db.intakeAsset.updateMany({ where: { id }, data: { captureAt: new Date(NaN) } }).then(() => null, (e: unknown) => e);
  ok(isContentWriteError(badDate), 'Date 가 안 되는 값도 파일 탓이다');
  ok(!isContentWriteError(new Error('connection terminated')) && !isContentWriteError(new IntakeError('storage_unavailable')), '연결 · 저장소 실패는 파일 탓이 아니다');
  /* 실제 NUL 거절의 모양은 맨 끝에서 본다 — 그 오류 뒤 PGlite 소켓이 잠깐 끊겨 뒤 시험을 흔든다 */
  const real = new Prisma.PrismaClientKnownRequestError('NUL', { code: 'P2039', clientVersion: 'test' });

  const before = reads.hash;
  const rejecting = new Proxy(db, {
    get(target, prop) {
      if (prop !== 'intakeAsset') {
        const v = (target as unknown as Record<string | symbol, unknown>)[prop];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      }
      return new Proxy(target.intakeAsset, {
        get(model, method) {
          if (method === 'updateMany') {
            return (args: { data: { mediaFacts?: unknown } }) => (args.data.mediaFacts !== undefined ? Promise.reject(real) : model.updateMany(args as never));
          }
          const v = (model as unknown as Record<string | symbol, unknown>)[method];
          return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(model) : v;
        },
      });
    },
  }) as typeof db;
  eq(await verifyAsset(rejecting, storage, id, NOW), 'rejected', '저장이 파일 탓으로 막히면 닫는다');
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id } });
  eq(row.rejectCode, 'facts_unreadable', '까닭을 남긴다');
  eq(reads.hash, before, '전체 읽기를 쓰지 않는다');

  /* 저장소 실패는 그대로 던져 다시 돈다 */
  const j = await invite();
  await named(j.scope);
  await recordConsents(db, j.scope, { answers: REQUIRED }, NOW);
  const id2 = await sendFile(j.scope, 'side', mov240(1024));
  fail.hash = 1;
  await fails(verifyAsset(db, storage, id2, NOW), 'storage_unavailable', '저장소 실패는 파일 탓이 아니다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: id2 } })).status, 'verifying', '다시 돌 수 있게 그대로 둔다');
}

/* ─────────────────────── 그릇 · 머리 ─────────────────────── */
{
  /* EBML 네 바이트 + 아무 글 — 예전에는 'verified' 가 됐다 */
  const r = await ready();
  const fake = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('아무 내용이나 넣은 글이에요'.repeat(50))]);
  const before = reads.hash;
  await finalize(r.scope, r.state.version);
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.sideId } });
  objects.set(row.objectPath, fake);
  await db.intakeAsset.update({ where: { id: r.sideId }, data: { declaredSize: BigInt(fake.length), clientSha256: sha(fake) } });
  eq(await verifyAsset(db, storage, r.sideId, NOW), 'rejected', 'mkv 머리만 맞춘 파일은 막는다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: r.sideId } })).rejectCode, 'unsupported_container', '받지 않는 그릇이라고 남긴다');
  eq(reads.hash, before, '머리에서 막으면 전체를 안 읽는다');
  await verifyAsset(db, storage, r.rearId, NOW);
  const sub = await subRow(r.submissionId);
  ok(sub.status === 'needs_attention' && sub.analysisStatus === 'none', '분석 준비로 안 간다');
}
{
  /* 머리 한도로 못 읽은 mov: 영상 아님이 아니라 사람이 볼 일이다. 분석 가능으로는 안 간다 */
  const i = await invite();
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const side = mov240(4096, { fillerBoxes: 70 });
  const sideId = await sendFile(i.scope, 'side', side);
  const rearId = await sendFile(i.scope, 'rear', mov120(4096));
  const state = await loadPublicState(db, i.scope, { now: NOW });
  eq(await verifyAsset(db, storage, sideId, NOW), 'unconfirmed', '바이트는 맞고 영상 여부는 모른다');
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: sideId } });
  ok(row.rejectCode === null && row.serverSha256 === sha(side) && (row.mediaFacts as { hasVideo: unknown }).hasVideo === null, '막지 않고 해시까지 잰다');
  const receipt = await finalize(i.scope, state.version);
  ok(receipt.created, '확인 못 한 파일도 접수는 된다');
  await verifyAsset(db, storage, rearId, NOW);
  const rev = await revOf(i.submissionId);
  ok(rev.status === 'failed' && rev.failureCode === 'media_unconfirmed', '판은 사람이 볼 일로 닫는다');
  const sub = await subRow(i.submissionId);
  ok(sub.status === 'needs_attention' && sub.analysisStatus === 'none', '분석 가능으로 안 간다');
  eq(await db.intakeJob.count({ where: { dedupeKey: `register_revision:${rev.id}` } }), 0, '등록 일감도 없다');
  const s = await loadPublicState(db, i.scope, { now: NOW });
  eq(s.assets.side?.integrity, '영상 정보 확인 필요', '이름표');
  eq(s.assets.side?.fps, '영상 정보 확인 필요', '정보 이름표');
}

/* ─────────────────────── 접근 코드 잠금 ─────────────────────── */
{
  const i = await invite({ accessCode: 'right-code' });
  const inv = () => db.intakeInvitation.findUniqueOrThrow({ where: { id: i.invitationId } });
  const attempt = async (code: string | null, t: Date) => verifyResultAccess(db, { invitation: await inv(), submissionId: i.submissionId, code }, t);
  const WINDOW = 16 * 60_000;

  await fails(attempt(null, NOW), 'access_code_required', '코드 없이');
  for (let n = 0; n < 40; n++) await attempt('right-code', NOW);
  passed++;
  eq((await inv()).accessCodeFailures, 0, '맞게 낸 시도는 안 센다');

  await fails(attempt('wrong-code', NOW), 'access_code_wrong', '틀린 코드');
  eq((await inv()).accessCodeFailures, 1, '틀린 시도를 쌓는다');
  ok((await db.intakeAudit.count({ where: { invitationId: i.invitationId, action: 'access_code.wrong' } })) === 1, '틀린 시도를 감사 기록에 남긴다');
  await attempt('right-code', NOW);
  passed++;

  /* 창 안 제한 */
  for (let n = 0; n < 7; n++) await fails(attempt(`wrong-${n}`, NOW), 'access_code_wrong', '창 안의 틀린 시도');
  await fails(attempt('wrong-x', NOW), 'rate_limited', '창 한도를 넘으면 기다린다');
  await fails(attempt('right-code', NOW), 'rate_limited', '막힌 동안은 맞는 코드도 기다린다');
  eq((await inv()).accessCodeFailures, 8, '막힌 시도는 코드를 안 맞춰 보고 안 센다');

  /* 창이 바뀌어도 누적은 이어진다 */
  const later = at(WINDOW);
  await fails(attempt('wrong-9', later), 'access_code_wrong', '다음 창의 틀린 시도');
  await fails(attempt('wrong-10', later), 'access_code_locked', '누적 한도에서 잠근다');
  ok((await inv()).accessCodeLockedAt != null && (await inv()).accessCodeFailures === ACCESS_CODE_MAX_FAILURES, '잠근 시각을 남긴다');
  eq(await db.intakeAudit.count({ where: { invitationId: i.invitationId, action: 'access_code.locked' } }), 1, '잠근 일을 남긴다');
  await fails(attempt('right-code', at(10 * WINDOW)), 'access_code_locked', '맞는 코드도 막는다');
  ok((await loadPublicState(db, i.scope, { now: NOW })).accessCodeLocked, '화면이 잠긴 줄 안다');

  ok((await resetAccessCodeLock(db, { adminId: 'admin-2', submissionId: i.submissionId }, later)).reset, '관리자가 푼다');
  await attempt('right-code', at(10 * WINDOW));
  passed++;
  const audit = await db.intakeAudit.findFirstOrThrow({ where: { invitationId: i.invitationId, action: 'access_code.reset' } });
  ok(audit.actorKind === 'admin' && audit.actorId === 'admin-2', '누가 풀었는지 남긴다');
  ok(!(await resetAccessCodeLock(db, { adminId: 'admin-2', submissionId: i.submissionId }, later)).reset, '풀 것이 없으면 기록이 안 는다');
  ok(!JSON.stringify(await db.intakeAudit.findMany({ where: { invitationId: i.invitationId } })).includes('wrong-'), '틀린 코드 글은 안 남긴다');

  /* 한꺼번에 보내도 낡은 줄을 보고 지나가지 못한다 — 자리는 DB 가 한 번에 센다 */
  const burst = await invite({ accessCode: 'right-code' });
  const stale = await db.intakeInvitation.findUniqueOrThrow({ where: { id: burst.invitationId } });
  const results = await Promise.allSettled(Array.from({ length: 30 }, (_, n) => verifyResultAccess(db, { invitation: stale, submissionId: burst.submissionId, code: `burst-${n}` }, NOW)));
  const codes = results.map((r) => (r.status === 'rejected' ? (r.reason as IntakeError).code : 'ok'));
  eq(codes.filter((c) => c === 'access_code_wrong').length, 8, '창 한도만큼만 코드를 맞춰 본다');
  eq(codes.filter((c) => c === 'rate_limited').length, 22, '나머지는 기다린다');
  const after = await db.intakeInvitation.findUniqueOrThrow({ where: { id: burst.invitationId } });
  eq([after.accessCodeFailures, after.accessCodeLockedAt], [8, null], '세어진 틀린 횟수는 맞춰 본 수와 같다');

  /* 다음 창의 동시 시도도 누적 한도를 못 넘는다 */
  const next = at(WINDOW);
  const stale2 = await db.intakeInvitation.findUniqueOrThrow({ where: { id: burst.invitationId } });
  const results2 = await Promise.allSettled(Array.from({ length: 12 }, (_, n) => verifyResultAccess(db, { invitation: stale2, submissionId: burst.submissionId, code: `next-${n}` }, next)));
  const codes2 = results2.map((r) => (r.status === 'rejected' ? (r.reason as IntakeError).code : 'ok'));
  const final = await db.intakeInvitation.findUniqueOrThrow({ where: { id: burst.invitationId } });
  ok(final.accessCodeFailures === ACCESS_CODE_MAX_FAILURES && final.accessCodeLockedAt != null, '누적 한도에서 잠근다');
  eq(codes2.filter((c) => c === 'access_code_wrong' || c === 'access_code_locked').length >= 2, true, '남은 자리만 맞춰 본다');
  eq(await db.intakeAudit.count({ where: { invitationId: burst.invitationId, action: { in: ['access_code.wrong', 'access_code.locked'] } } }), ACCESS_CODE_MAX_FAILURES, '틀린 시도마다 감사 한 줄이다');
}

/* ─────────────────────── 빈 철회 ─────────────────────── */
{
  const r = await ready();
  await recordConsents(db, r.scope, { answers: [answer('model', true)] }, NOW);
  const count = () => db.intakeAudit.count({ where: { submissionId: r.submissionId, action: 'consent.withdrawn' } });
  await withdrawConsent(db, r.scope, { kind: 'model' }, at(HOUR));
  eq(await count(), 1, '실제 철회는 남긴다');
  for (let n = 0; n < 5; n++) await withdrawConsent(db, r.scope, { kind: 'model' }, at(HOUR));
  eq(await count(), 1, '빈 철회는 기록을 안 늘린다');
}

/* ─────────────────────── 고침 × 공개 ─────────────────────── */
/** 공개 중인 판을 만든다 — 분석 결과 자체는 이 시험의 일이 아니다 */
async function publish(submissionId: string) {
  const rev = await revOf(submissionId);
  const run = await db.intakeAnalysisRun.create({ data: { submissionId, revisionId: rev.id, engineKey: 'e', status: 'succeeded', finishedAt: NOW } });
  await db.intakePublication.create({ data: { submissionId, runId: run.id, number: 1, activeFor: submissionId, publishedByAdminId: 'admin-1', publishedAt: NOW } });
  await db.intakeSubmission.update({ where: { id: submissionId }, data: { publicationStatus: 'published', analysisStatus: 'succeeded' } });
}
const readViews = (s: { correction: unknown }) => (s.correction as { views: string[] }).views;
const verifyAll = async (...ids: string[]) => {
  for (const id of ids) await verifyAsset(db, storage, id, NOW);
};
{
  const r = await ready({ uploadExpiresAt: at(2 * DAY) });
  await finalize(r.scope, r.state.version);
  await verifyAll(r.sideId, r.rearId);
  await publish(r.submissionId);
  await requestCorrection(db, { adminId: 'a', submissionId: r.submissionId, views: ['rear'] }, at(HOUR));

  const open = await loadPublicState(db, r.scope, { now: at(HOUR) });
  ok(open.screen === 'correction' && open.resultAvailable && open.published, '고침 화면에서도 공개 결과로 갈 길을 준다');
  ok(open.correction != null, '요청 내용도 같이 준다');
  eq(open.statusText, '고쳐 주셔야 할 내용이 있어요', '상태 글은 고침을 말한다');

  const lapsed = await loadPublicState(db, r.scope, { now: at(3 * DAY) });
  ok(lapsed.screen === 'published' && lapsed.resultAvailable, '기간이 끝나도 공개 결과는 그대로 보인다');
  ok(lapsed.correction != null, '고침 요청이 열려 있던 것도 그대로 안다');

  /* 다시 내면 공개는 옛 판이고, 고침이 접수됐다는 줄이 따로 나온다 */
  const fresh = mov120(8192);
  const reserved = await reserveAsset(db, r.scope, { view: 'rear', expectedAssetId: r.rearId, fileName: '새 뒤.MOV', sizeBytes: fresh.length, sha256: sha(fresh) }, at(HOUR));
  const g = await issueUploadToken(db, storage, r.scope, { assetId: reserved.asset.id }, at(HOUR));
  objects.set(g.objectName, fresh);
  await confirmUpload(db, storage, r.scope, { assetId: reserved.asset.id }, at(HOUR));
  await finalize(r.scope, reserved.version, key(), { samePitchConfirmed: true });
  const after = await loadPublicState(db, r.scope, { now: at(HOUR) });
  eq(after.screen, 'published', '공개는 그대로다');
  ok(after.correctionStatusLine?.includes('고친 내용'), '고침이 접수됐다는 줄이 있다');

  /* 결과 기간이 끝나면 길이 없다 */
  const ended = await ready({ resultExpiresAt: at(DAY) });
  await finalize(ended.scope, ended.state.version);
  await verifyAll(ended.sideId, ended.rearId);
  await publish(ended.submissionId);
  await requestCorrection(db, { adminId: 'a', submissionId: ended.submissionId, views: ['rear'] }, at(HOUR));
  ok(!(await loadPublicState(db, ended.scope, { now: at(2 * DAY) })).resultAvailable, '결과 기간이 끝나면 길을 안 준다');
}

/* ─────────────────────── 만 14세 미만 뒤처리 ─────────────────────── */
{
  const i = await invite();
  await saveDraft(db, i.scope, { expectedVersion: 0, athleteName: '어린이', submitterName: '보호자', submitterRelation: 'parent' }, NOW);
  const before = await loadPublicState(db, i.scope, { now: NOW });
  const blocked = await saveDraft(db, i.scope, { expectedVersion: before.version, athleteAgeBand: 'under_14' }, NOW);
  const sub = await subRow(i.submissionId);
  ok(sub.athleteName === null && sub.submitterName === null, '막히면 이름을 남기지 않는다');
  const audit = await db.intakeAudit.findFirstOrThrow({ where: { submissionId: i.submissionId, action: 'draft.age_band_changed' } });
  eq(audit.detail, { from: null, to: 'under_14' }, '나이 답을 남긴다');
  ok(!(await loadPublicState(db, i.scope, { now: NOW })).assetsOnFile, '보낸 영상이 없으면 그렇게 말한다');

  /* 막힌 동안 이름을 다시 보내도 안 남는다 */
  eq((await saveDraft(db, i.scope, { expectedVersion: blocked.version, athleteName: '또 이름' }, NOW)).version, blocked.version, '이름을 안 받는다');
  eq((await subRow(i.submissionId)).athleteName, null, '여전히 비어 있다');

  /* 나이 답을 바꾸면 흔적이 남고, 이름은 다시 받는다 */
  const undo = await saveDraft(db, i.scope, { expectedVersion: blocked.version, athleteAgeBand: '14_or_over', athleteName: '김선수' }, NOW);
  ok(undo.version > blocked.version && (await subRow(i.submissionId)).athleteName === '김선수', '풀면 다시 적는다');
  const rows = await db.intakeAudit.findMany({ where: { submissionId: i.submissionId, action: 'draft.age_band_changed' }, orderBy: { createdAt: 'asc' } });
  eq(rows.length, 2, '두 번 다 남는다');

  /* 다른 기기가 이미 올린 뒤 막혔다: 화면이 거짓말하지 않게 안다 */
  const j = await invite();
  await named(j.scope);
  await recordConsents(db, j.scope, { answers: REQUIRED }, NOW);
  await sendFile(j.scope, 'side', mov240());
  const v = (await loadPublicState(db, j.scope, { now: NOW })).version;
  await saveDraft(db, j.scope, { expectedVersion: v, athleteAgeBand: 'under_14' }, NOW);
  const s = await loadPublicState(db, j.scope, { now: NOW });
  ok(s.screen === 'under_14' && s.assetsOnFile, '올라온 파일이 있다는 것을 안다');
}

/* ─────────────────────── 멈춘 일감 ─────────────────────── */
{
  const r = await ready();
  await finalize(r.scope, r.state.version);
  /* 횟수를 다 쓴 모습 */
  const jobKey = `verify_asset:${r.sideId}`;
  const stopped = at(DAY);
  await db.intakeJob.update({ where: { dedupeKey: jobKey }, data: { status: 'failed', attempts: 8, finishedAt: stopped, lastError: '저장소' } });
  await db.intakeAsset.update({ where: { id: r.sideId }, data: { status: 'verifying' } });

  await cron(at(DAY + HOUR));
  eq((await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: jobKey } })).status, 'failed', '곧바로는 안 건다');

  /* 앞 시험이 남긴 일감이 크론의 몇 칸을 차지하지 않게 비운다 */
  await db.intakeJob.deleteMany({ where: { kind: 'verify_asset', status: 'queued' } });
  const first = await cron(at(DAY + 7 * HOUR));
  ok(first.repaired >= 1, '시간이 지나면 다시 건다');
  const job = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: jobKey } });
  ok(job.status === 'done' && job.autoRequeues === 1, '다시 돌아 끝난다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: r.sideId } })).status, 'verified', '자산이 끝난다');

  /* 상한: 몇 번 넘게는 안 건다 */
  const s = await ready();
  const k2 = `verify_asset:${s.sideId}`;
  await db.intakeJob.update({ where: { dedupeKey: k2 }, data: { status: 'failed', attempts: 8, finishedAt: at(DAY), autoRequeues: 8 } });
  await cron(at(30 * DAY));
  eq((await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: k2 } })).status, 'failed', '상한을 넘으면 사람 몫이다');

  /* 관리자가 다시 건다 */
  ok((await requeueVerification(db, { adminId: 'admin-1', assetId: s.sideId }, at(30 * DAY))).requeued, '다시 확인');
  const queued = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: k2 } });
  ok(queued.status === 'queued' && queued.attempts === 0, '처음부터 다시 돈다');
  ok(!(await requeueVerification(db, { adminId: 'admin-1', assetId: s.sideId }, at(30 * DAY))).requeued, '이미 줄에 있으면 그대로');
  eq(await db.intakeAudit.count({ where: { submissionId: s.submissionId, action: 'asset.verify_requeued' } }), 1, '다시 건 일을 남긴다');
  await fails(requeueVerification(db, { adminId: 'a', assetId: 'nope' }, NOW), 'asset_not_found', '없는 자산');
  await verifyAsset(db, storage, s.sideId, NOW);
  await fails(requeueVerification(db, { adminId: 'a', assetId: s.sideId }, NOW), 'invalid_state', '끝난 자산은 다시 안 잰다');

  /* 바뀐 파일의 멈춘 일감은 다시 걸 까닭이 없다 */
  const t = await ready();
  const k3 = `verify_asset:${t.rearId}`;
  await db.intakeAsset.update({ where: { id: t.rearId }, data: { status: 'replaced' } });
  await db.intakeJob.update({ where: { dedupeKey: k3 }, data: { status: 'failed', attempts: 8, finishedAt: at(DAY) } });
  await cron(at(30 * DAY));
  const dead = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: k3 } });
  ok(dead.status === 'failed' && dead.autoRequeues === 8, '끝난 일은 다시 보지 않는다');

  /* 고침으로 옆 영상을 바꿔 새 판을 냈다 — 앞 판에만 남은 파일은 판은 그대로여도 다시 잴 까닭이 없다 */
  const o = await ready();
  await finalize(o.scope, o.state.version);
  await requestCorrection(db, { adminId: 'admin-1', submissionId: o.submissionId, views: ['side'] }, NOW);
  await sendFile(o.scope, 'side', mov240(4096), o.sideId);
  await finalize(o.scope, (await loadPublicState(db, o.scope, { now: NOW })).version);
  const k4 = `verify_asset:${o.sideId}`;
  await db.intakeAsset.update({ where: { id: o.sideId }, data: { status: 'verifying' } });
  await db.intakeJob.update({ where: { dedupeKey: k4 }, data: { status: 'failed', attempts: 8, finishedAt: at(DAY) } });
  await cron(at(30 * DAY));
  const old = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: k4 } });
  ok(old.status === 'failed' && old.autoRequeues === 8, '옛 판의 파일은 크론이 다시 안 건다');
}

/* ─────────────────────── 동의 판이 바뀌었을 때 ─────────────────────── */
{
  const r = await ready({ uploadExpiresAt: at(HOUR) });
  await finalize(r.scope, r.state.version);
  await verifyAll(r.sideId, r.rearId);
  await fails(recordConsents(db, r.scope, { answers: REQUIRED }, NOW), 'not_editable', '동의가 지금 판이면 접수 뒤에는 안 받는다');
  eq((await loadPublicState(db, r.scope, { now: NOW })).needsReconsent, false, '지금 판이면 켜지지 않는다');

  /* 판이 바뀐 모습 — 기간도 끝났다 */
  await db.intakeConsent.updateMany({ where: { submissionId: r.submissionId, kind: 'overseas' }, data: { docVersion: 'old', textHash: 'old' } });
  const late = at(2 * HOUR);
  const stale = await loadPublicState(db, r.scope, { now: late });
  ok(stale.needsReconsent && !stale.consent.requiredOk, '다시 받아야 한다고 알린다');
  ok(stale.statusText.includes('동의'), '상태 글도 말한다');
  ok((await recordConsents(db, r.scope, { answers: REQUIRED }, late)).requiredOk, '기간이 끝나도 다시 동의한다');
  eq((await loadPublicState(db, r.scope, { now: late })).needsReconsent, false, '받으면 꺼진다');
  eq((await subRow(r.submissionId)).status, 'verified', '접수 상태는 그대로다');

  /* 철회한 접수는 이 길로 되살리지 못한다 */
  await withdrawConsent(db, r.scope, { kind: 'overseas' }, late);
  await fails(recordConsents(db, r.scope, { answers: REQUIRED }, late), 'not_editable', '철회한 접수는 다시 못 연다');

  /* 초안은 기간이 끝나면 여전히 막힌다 */
  const d = await invite({ uploadExpiresAt: at(HOUR) });
  await named(d.scope);
  await fails(recordConsents(db, d.scope, { answers: REQUIRED }, late), 'upload_expired', '초안의 동의는 기간 안에');
}

/* ─────────────────────── 고침에서 빠져나오기 ─────────────────────── */
{
  /* 요청 내용 바꾸기 — 뺀 칸은 얼린 값으로 돌아간다 */
  const r = await ready();
  await finalize(r.scope, r.state.version);
  await verifyAll(r.sideId, r.rearId);
  await requestCorrection(db, { adminId: 'a', submissionId: r.submissionId, views: ['rear'], fields: ['athleteName'] }, at(HOUR));
  const v0 = (await loadPublicState(db, r.scope, { now: at(HOUR) })).version;
  const named2 = await saveDraft(db, r.scope, { expectedVersion: v0, athleteName: '다른 이름' }, at(HOUR));
  const fresh = mov120();
  const moved = await reserveAsset(db, r.scope, { view: 'rear', expectedAssetId: r.rearId, fileName: 'n', sizeBytes: fresh.length, sha256: sha(fresh) }, at(HOUR));
  ok(moved.version > named2.version, '고친 것이 칸에 있다');

  await fails(requestCorrection(db, { adminId: 'a', submissionId: r.submissionId, views: ['side'], expectedVersion: 0 }, at(HOUR)), 'stale_version', '낡은 화면의 수정은 막는다');
  await requestCorrection(db, { adminId: 'b', submissionId: r.submissionId, views: ['side'], message: '옆 영상만 다시' }, at(2 * HOUR));
  const edited = await subRow(r.submissionId);
  ok(edited.status === 'correction_requested' && edited.rearAssetId === r.rearId && edited.athleteName === '금윤호', '뺀 칸의 고침은 얼린 값으로 돌아간다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: moved.asset.id } })).status, 'replaced', '내려온 파일은 정리 대상이다');
  eq((await loadPublicState(db, r.scope, { now: at(2 * HOUR) })).correction, { fields: [], views: ['side'], message: '옆 영상만 다시' }, '새 요청 내용');
  eq(await db.intakeAudit.count({ where: { submissionId: r.submissionId, action: 'correction.updated' } }), 1, '바꾼 일을 남긴다');

  /* 취소 — 앞 판의 상태로 */
  await fails(cancelCorrection(db, { adminId: 'a', submissionId: r.submissionId, expectedVersion: 0 }, at(2 * HOUR)), 'stale_version', '낡은 화면의 취소는 막는다');
  const c = await cancelCorrection(db, { adminId: 'b', submissionId: r.submissionId, expectedVersion: edited.version }, at(2 * HOUR));
  eq(c.status, 'verified', '판이 검증됐으면 검증 상태로');
  const back = await subRow(r.submissionId);
  ok(back.correction === null && back.correctionRequestedAt === null && back.samePitchConfirmed, '요청을 지운다');
  ok(back.analysisStatus === 'ready', '분석 상태는 그대로다');
  eq(await db.intakeAudit.count({ where: { submissionId: r.submissionId, action: 'correction.cancelled' } }), 1, '취소를 남긴다');
  await fails(cancelCorrection(db, { adminId: 'a', submissionId: r.submissionId, expectedVersion: back.version }, at(2 * HOUR)), 'invalid_state', '고침 중이 아니면 취소할 것이 없다');
  eq((await loadPublicState(db, r.scope, { now: at(2 * HOUR) })).screen, 'receipt', '받는 사람 화면도 돌아간다');

  /* 받는 사람이 고치던 중에 취소: 고른 파일 · 고친 글이 얼린 값으로 돌아간다 */
  const midway = await ready();
  await finalize(midway.scope, midway.state.version);
  await verifyAll(midway.sideId, midway.rearId);
  await requestCorrection(db, { adminId: 'a', submissionId: midway.submissionId, views: ['rear'], fields: ['athleteName'] }, at(HOUR));
  const m0 = (await loadPublicState(db, midway.scope, { now: at(HOUR) })).version;
  await saveDraft(db, midway.scope, { expectedVersion: m0, athleteName: '고치던 이름' }, at(HOUR));
  const nb = mov120();
  const mr = await reserveAsset(db, midway.scope, { view: 'rear', expectedAssetId: midway.rearId, fileName: 'n', sizeBytes: nb.length, sha256: sha(nb) }, at(HOUR));
  await cancelCorrection(db, { adminId: 'a', submissionId: midway.submissionId, expectedVersion: mr.version }, at(HOUR));
  const undone = await subRow(midway.submissionId);
  ok(undone.rearAssetId === midway.rearId && undone.athleteName === '금윤호' && undone.samePitchConfirmed, '칸 · 글 · 같은 투구 확인이 얼린 판으로 돌아간다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: mr.asset.id } })).status, 'replaced', '내려온 파일은 정리 대상이다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: midway.rearId } })).status, 'verified', '얼린 파일은 그대로다');

  /* 막힌 파일 때문에 멈춘 접수: 글 칸만 고쳐 달랬다가 취소 */
  const bad = await ready();
  await finalize(bad.scope, bad.state.version);
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: bad.sideId } });
  objects.set(row.objectPath, Buffer.concat([bad.side.subarray(0, 100), Buffer.alloc(bad.side.length - 100)]));
  await verifyAll(bad.sideId, bad.rearId);
  eq((await subRow(bad.submissionId)).status, 'needs_attention', '막힌 접수');
  await requestCorrection(db, { adminId: 'a', submissionId: bad.submissionId, fields: ['athleteName'] }, NOW);
  const v1 = (await subRow(bad.submissionId)).version;
  eq((await cancelCorrection(db, { adminId: 'a', submissionId: bad.submissionId, expectedVersion: v1 }, NOW)).status, 'needs_attention', '확인 필요로 돌아간다');

  /* 검증 전에 고침을 걸었고, 그사이 판이 정산됐다 */
  const mid = await ready();
  await finalize(mid.scope, mid.state.version);
  await requestCorrection(db, { adminId: 'a', submissionId: mid.submissionId, fields: ['athleteName'] }, NOW);
  await verifyAll(mid.sideId, mid.rearId);
  const during = await subRow(mid.submissionId);
  ok(during.status === 'correction_requested' && during.analysisStatus === 'none', '고침 중에는 접수가 안 옮겨 간다');
  eq((await cancelCorrection(db, { adminId: 'a', submissionId: mid.submissionId, expectedVersion: during.version }, NOW)).status, 'verified', '취소하면 정산된 상태로');
  const done = await subRow(mid.submissionId);
  eq(done.analysisStatus, 'ready', '분석 준비까지 마저 간다');
  eq(await db.intakeJob.count({ where: { dedupeKey: `register_revision:${(await revOf(mid.submissionId)).id}` } }), 1, '등록 일감도 건다');

  /* 검증이 아직이면 접수 상태로 돌아가 일꾼을 기다린다 */
  const wait = await ready();
  await finalize(wait.scope, wait.state.version);
  await requestCorrection(db, { adminId: 'a', submissionId: wait.submissionId, fields: ['athleteName'] }, NOW);
  const v3 = (await subRow(wait.submissionId)).version;
  eq((await cancelCorrection(db, { adminId: 'a', submissionId: wait.submissionId, expectedVersion: v3 }, NOW)).status, 'submitted', '판이 pending 이면 접수 상태로');
  await verifyAll(wait.sideId, wait.rearId);
  eq((await subRow(wait.submissionId)).status, 'verified', '이어서 검증된다');
}
{
  /* 기간 늘리기 */
  const i = await invite({ uploadExpiresAt: at(HOUR) });
  await fails(extendUploadWindow(db, { adminId: 'a', submissionId: i.submissionId, until: at(-HOUR) }, NOW), 'invalid_input', '지난 시각');
  await fails(extendUploadWindow(db, { adminId: 'a', submissionId: i.submissionId, until: at(HOUR / 2) }, NOW), 'invalid_input', '지금 기간보다 앞');
  const e = await extendUploadWindow(db, { adminId: 'admin-2', submissionId: i.submissionId, until: at(3 * DAY) }, at(2 * HOUR));
  eq(e.uploadExpiresAt, at(3 * DAY).toISOString(), '초안의 기간을 늘린다');
  await saveDraft(db, i.scope, { expectedVersion: 0, athleteName: '늦은 이름' }, at(2 * HOUR));
  passed++;
  const audit = await db.intakeAudit.findFirstOrThrow({ where: { submissionId: i.submissionId, action: 'upload_window.extended' } });
  ok(audit.actorKind === 'admin' && audit.actorId === 'admin-2', '누가 늘렸는지 남긴다');

  const r = await ready();
  await finalize(r.scope, r.state.version);
  await fails(extendUploadWindow(db, { adminId: 'a', submissionId: r.submissionId, until: at(30 * DAY) }, NOW), 'invalid_state', '접수가 끝났으면 뜻이 없다');
  await db.intakeInvitation.update({ where: { id: i.invitationId }, data: { status: 'revoked' } });
  await fails(extendUploadWindow(db, { adminId: 'a', submissionId: i.submissionId, until: at(9 * DAY) }, NOW), 'invitation_revoked', '폐기된 초대');
}
{
  /* 담당자가 받은 필수 동의 철회 */
  const r = await ready();
  await finalize(r.scope, r.state.version);
  await verifyAll(r.sideId, r.rearId);
  await publish(r.submissionId);
  const w = await withdrawRequiredConsent(db, { adminId: 'admin-2', submissionId: r.submissionId, note: '전화로 요청' }, at(HOUR));
  ok(w.withdrawn && w.unpublished, '철회하고 공개를 닫는다');
  const sub = await subRow(r.submissionId);
  ok(sub.status === 'withdrawn' && sub.publicationStatus === 'unpublished', '접수 · 공개 상태');
  eq(await db.intakePublication.count({ where: { activeFor: r.submissionId } }), 0, '공개 줄을 닫는다');
  const pub = await db.intakePublication.findFirstOrThrow({ where: { submissionId: r.submissionId } });
  eq(pub.unpublishedByAdminId, 'admin-2', '누가 닫았는지 남긴다');
  const rows = await db.intakeConsent.findMany({ where: { submissionId: r.submissionId, kind: { in: ['submission', 'overseas'] } } });
  ok(rows.length === 2 && rows.every((c) => c.withdrawnAt != null), '필수 동의 줄에 철회를 적는다');
  const audit = await db.intakeAudit.findFirstOrThrow({ where: { submissionId: r.submissionId, action: 'consent.withdrawn_by_admin' } });
  ok(audit.actorKind === 'admin' && audit.actorId === 'admin-2', '관리자 몫으로 남긴다');
  const side = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.sideId } });
  ok(objects.has(side.objectPath), '원본은 지우지 않는다');
  eq((await loadPublicState(db, r.scope, { now: at(HOUR) })).screen, 'withdrawn', '받는 사람 화면');
  ok(!(await withdrawRequiredConsent(db, { adminId: 'admin-2', submissionId: r.submissionId }, at(HOUR))).withdrawn, '두 번 눌러도 그대로다');
  eq(await db.intakeAudit.count({ where: { submissionId: r.submissionId, action: 'consent.withdrawn_by_admin' } }), 1, '기록은 하나');
  await fails(withdrawRequiredConsent(db, { adminId: 'a', submissionId: '00000000-0000-4000-8000-000000000000' }, NOW), 'submission_not_found', '없는 접수');
}

/* ─────────────────────── 기간이 지난 뒤의 완료 ─────────────────────── */
{
  /* 기간 끝에 둘 다 도착: 끝낼 수 있다 */
  const r = await ready({ uploadExpiresAt: at(HOUR) });
  const late = at(2 * HOUR);
  const s = await loadPublicState(db, r.scope, { now: late });
  ok(s.screen === 'upload' && s.uploadExpired, '완료만 남은 화면');
  const receipt = await finalizeSubmission(db, r.scope, { expectedVersion: s.version, idempotencyKey: key() }, late);
  ok(receipt.created, '기간이 지나도 도착한 짝은 끝낸다');

  /* 뒤 영상이 토큰을 받고 가는 중: 막다른 길이 아니라 기다리라는 답 */
  const i = await invite({ uploadExpiresAt: at(HOUR) });
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const sideId = await sendFile(i.scope, 'side', mov240());
  const b = mov120();
  const rear = await reserveAsset(db, i.scope, { view: 'rear', expectedAssetId: null, fileName: 'b', sizeBytes: b.length, sha256: sha(b), pairConfirmed: true }, NOW);
  const g = await issueUploadToken(db, storage, i.scope, { assetId: rear.asset.id }, NOW);
  await fails(finalizeSubmission(db, i.scope, { expectedVersion: rear.version, idempotencyKey: key() }, late), 'assets_incomplete', '기간 안에 시작한 전송은 기다린다');
  objects.set(g.objectName, b);
  await confirmUpload(db, storage, i.scope, { assetId: rear.asset.id }, late);
  ok((await finalizeSubmission(db, i.scope, { expectedVersion: rear.version, idempotencyKey: key() }, late)).created, '도착하면 끝낸다');
  ok(sideId !== rear.asset.id, '두 자산');

  /* 뒤 영상 토큰을 기간 뒤에 청하다 막힌 경우: 관리자가 늘릴 때까지 막힌다 */
  const j = await invite({ uploadExpiresAt: at(HOUR) });
  await named(j.scope);
  await recordConsents(db, j.scope, { answers: REQUIRED }, NOW);
  await sendFile(j.scope, 'side', mov240());
  const c = mov120();
  const r2 = await reserveAsset(db, j.scope, { view: 'rear', expectedAssetId: null, fileName: 'c', sizeBytes: c.length, sha256: sha(c), pairConfirmed: true }, NOW);
  await fails(finalizeSubmission(db, j.scope, { expectedVersion: r2.version, idempotencyKey: key() }, late), 'upload_expired', '전송을 시작 못 했으면 막힌다');
  eq((await loadPublicState(db, j.scope, { now: late })).screen, 'upload_expired', '화면도 같다');
  await extendUploadWindow(db, { adminId: 'a', submissionId: j.submissionId, until: at(DAY) }, late);
  const g2 = await issueUploadToken(db, storage, j.scope, { assetId: r2.asset.id }, late);
  objects.set(g2.objectName, c);
  await confirmUpload(db, storage, j.scope, { assetId: r2.asset.id }, late);
  ok((await finalizeSubmission(db, j.scope, { expectedVersion: r2.version, idempotencyKey: key() }, late)).created, '늘리면 이어서 끝낸다');

  /* 한쪽도 없으면 막힌다 */
  const k = await invite({ uploadExpiresAt: at(HOUR) });
  await named(k.scope);
  await fails(finalizeSubmission(db, k.scope, { expectedVersion: 1, idempotencyKey: key() }, late), 'upload_expired', '보낸 것이 없으면 막힌다');

  /* 끝낸 접수의 다른 키는 기간이 지나도 영수증이다 */
  const again = await finalizeSubmission(db, r.scope, { expectedVersion: 0, idempotencyKey: key() }, late);
  ok(!again.created && again.receiptCode === receipt.receiptCode, '이미 끝난 접수');

  /* 글 칸 고침은 기간이 지나면 못 낸다 — 도착한 전송을 살리는 길이 아니다 */
  const f = await ready({ uploadExpiresAt: at(HOUR) });
  await finalize(f.scope, f.state.version);
  await requestCorrection(db, { adminId: 'a', submissionId: f.submissionId, fields: ['athleteName'] }, NOW);
  const fv = (await subRow(f.submissionId)).version;
  await fails(finalizeSubmission(db, f.scope, { expectedVersion: fv, idempotencyKey: key() }, late), 'upload_expired', '글 칸 고침');

  /* 영상 고침은 기간 안에 보낸 파일이면 낸다 */
  const h = await ready({ uploadExpiresAt: at(HOUR) });
  await finalize(h.scope, h.state.version);
  await requestCorrection(db, { adminId: 'a', submissionId: h.submissionId, views: ['rear'] }, NOW);
  const n = mov120();
  const hr = await reserveAsset(db, h.scope, { view: 'rear', expectedAssetId: h.rearId, fileName: 'n', sizeBytes: n.length, sha256: sha(n) }, NOW);
  const hg = await issueUploadToken(db, storage, h.scope, { assetId: hr.asset.id }, NOW);
  objects.set(hg.objectName, n);
  await confirmUpload(db, storage, h.scope, { assetId: hr.asset.id }, late);
  ok((await finalizeSubmission(db, h.scope, { expectedVersion: hr.version, idempotencyKey: key(), samePitchConfirmed: true }, late)).created, '영상 고침');
}

/* ─────────────────────── 짝이 바뀌었을 때 ─────────────────────── */
{
  /* 복구 화면에서 뒤 영상을 다른 파일로 바꿨다 */
  const r = await ready();
  const b = mov120();
  const swap = await reserveAsset(db, r.scope, { view: 'rear', expectedAssetId: r.rearId, fileName: 'n', sizeBytes: b.length, sha256: sha(b) }, NOW);
  eq((await subRow(r.submissionId)).samePitchConfirmed, false, '바꾸면 확인을 지운다');
  ok((await loadPublicState(db, r.scope, { now: NOW })).draft.samePitchConfirmed === false, '화면이 다시 묻게 안다');
  const g = await issueUploadToken(db, storage, r.scope, { assetId: swap.asset.id }, NOW);
  objects.set(g.objectName, b);
  await confirmUpload(db, storage, r.scope, { assetId: swap.asset.id }, NOW);
  await fails(finalize(r.scope, swap.version), 'same_pitch_required', '새 짝으로 다시 확인한다');

  /* 화면이 보여 준 짝이 아니면 안 얼린다 */
  await fails(finalize(r.scope, swap.version, key(), { samePitchConfirmed: true, expectedAssets: { side: r.sideId, rear: r.rearId } }), 'stale_selection', '옛 짝으로 끝내기');
  eq(await db.intakeRevision.count({ where: { submissionId: r.submissionId } }), 0, '판이 안 생긴다');
  const f = await finalize(r.scope, swap.version, key(), { samePitchConfirmed: true, expectedAssets: { side: r.sideId, rear: swap.asset.id } });
  ok(f.created, '맞는 짝은 끝낸다');
  eq((await revOf(r.submissionId)).rearAssetId, swap.asset.id, '화면이 본 짝을 얼린다');

  /* 같은 파일을 다시 고르면 확인을 안 지운다 */
  const s = await ready();
  await reserveAsset(db, s.scope, { view: 'side', expectedAssetId: s.sideId, fileName: 'same', sizeBytes: s.side.length, sha256: sha(s.side) }, NOW);
  eq((await subRow(s.submissionId)).samePitchConfirmed, true, '같은 파일이면 그대로다');

  /* 빈 칸을 처음 채워도 새 짝이다 — 옆이 있는데 뒤를 고르면 앞서 받은 확인은 이 짝의 것이 아니다 */
  const e = await invite();
  await named(e.scope);
  await recordConsents(db, e.scope, { answers: REQUIRED }, NOW);
  const onlySide = await sendFile(e.scope, 'side', mov240());
  const fill = mov120();
  const filled = await reserveAsset(db, e.scope, { view: 'rear', expectedAssetId: null, fileName: 'r', sizeBytes: fill.length, sha256: sha(fill) }, NOW);
  eq((await subRow(e.submissionId)).samePitchConfirmed, false, '빈 칸을 채우면 확인을 지운다');
  const fg = await issueUploadToken(db, storage, e.scope, { assetId: filled.asset.id }, NOW);
  objects.set(fg.objectName, fill);
  await confirmUpload(db, storage, e.scope, { assetId: filled.asset.id }, NOW);
  await fails(finalize(e.scope, filled.version), 'same_pitch_required', '확인 없이 못 끝낸다');
  ok(!!onlySide, '옆 칸은 그대로다');

  /* 방금 확인하고 보내는 전송은 지우지 않는다 */
  const c = await invite();
  await named(c.scope);
  await recordConsents(db, c.scope, { answers: REQUIRED }, NOW);
  await sendFile(c.scope, 'side', mov240());
  const cb = mov120();
  await reserveAsset(db, c.scope, { view: 'rear', expectedAssetId: null, fileName: 'r', sizeBytes: cb.length, sha256: sha(cb), pairConfirmed: true }, NOW);
  eq((await subRow(c.submissionId)).samePitchConfirmed, true, '방금 확인한 짝이면 그대로다');

  /* 정리가 칸을 비우면 짝이 깨진다 — 기간을 늘려 새 파일을 올려도 옛 확인으로 얼리지 않는다 */
  const q = await invite({ uploadExpiresAt: at(HOUR) });
  await named(q.scope);
  await recordConsents(db, q.scope, { answers: REQUIRED }, NOW);
  const qSide = await sendFile(q.scope, 'side', mov240());
  const qRear = await sendFile(q.scope, 'rear', mov120());
  ok((await subRow(q.submissionId)).samePitchConfirmed, '정리 전에는 확인이 있다');
  const after = at(HOUR + 8 * 24 * HOUR);
  await db.intakeAsset.updateMany({ where: { id: { in: [qSide, qRear] } }, data: { updatedAt: at(0) } });
  ok((await cleanupStaleUploads(db, storage, after)).abandoned >= 2, '끝내지 않은 파일을 버린다');
  eq((await subRow(q.submissionId)).samePitchConfirmed, false, '칸을 비우면 확인을 지운다');
}

/* ─────────────────────── 보내는 사람의 관계와 동의 ─────────────────────── */
{
  /* 본인으로 동의한 뒤 관계를 고치면 옛 줄은 그 사람의 동의가 아니다 */
  const i = await invite();
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const v = (await loadPublicState(db, i.scope, { now: NOW })).version;
  await saveDraft(db, i.scope, { expectedVersion: v, submitterRelation: 'coach' }, NOW);
  const s = await loadPublicState(db, i.scope, { now: NOW });
  ok(!s.consent.requiredOk && !s.consent.granted.submission, '관계가 바뀌면 필수 동의를 다시 받는다');
  const rec = await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  ok(rec.requiredOk, '같은 답이어도 새 관계로 남긴다');
  const rows = await db.intakeConsent.findMany({ where: { submissionId: i.submissionId, kind: 'submission' }, orderBy: { createdAt: 'desc' } });
  eq(rows.length, 2, '새 줄이 생긴다');
  ok(rows.some((c) => c.relation === 'coach' && c.proxy), '대리 관계가 동의 줄에 남는다');
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  eq(await db.intakeConsent.count({ where: { submissionId: i.submissionId, kind: 'submission' } }), 2, '같은 관계로 다시 보내면 줄이 안 는다');

  /* 고침에서 관계를 바꾸면 다시 받기 전에는 못 낸다 */
  const r = await ready();
  await finalize(r.scope, (await loadPublicState(db, r.scope, { now: NOW })).version, key(), { samePitchConfirmed: true });
  await requestCorrection(db, { adminId: 'admin-1', submissionId: r.submissionId, fields: ['submitterRelation'] }, NOW);
  const cv = (await loadPublicState(db, r.scope, { now: NOW })).version;
  const saved = await saveDraft(db, r.scope, { expectedVersion: cv, submitterRelation: 'parent' }, NOW);
  await fails(finalize(r.scope, saved.version, key()), 'consent_required', '새 관계의 동의 없이는 못 낸다');
  await recordConsents(db, r.scope, { answers: REQUIRED }, at(HOUR));
  ok((await finalize(r.scope, saved.version, key())).created, '다시 받으면 낸다');
  const latest = await db.intakeConsent.findFirstOrThrow({ where: { submissionId: r.submissionId, kind: 'submission' }, orderBy: { agreedAt: 'desc' } });
  const frozen = await revOf(r.submissionId);
  eq([latest.relation, latest.proxy, frozen.submitterRelation], ['parent', true, 'parent'], '판과 동의 줄의 관계가 같다');
}

/* ─────────────────────── 나이를 고쳐 이름이 지워진 뒤 ─────────────────────── */
{
  const r = await ready();
  const v = (await loadPublicState(db, r.scope, { now: NOW })).version;
  const under = await saveDraft(db, r.scope, { expectedVersion: v, athleteAgeBand: 'under_14' }, NOW);
  const back = await saveDraft(db, r.scope, { expectedVersion: under.version, athleteAgeBand: '14_or_over' }, NOW);
  const s = await loadPublicState(db, r.scope, { now: NOW });
  eq([s.screen, s.draft.athleteName], ['welcome', null], '두 파일이 와 있어도 이름을 다시 받는 화면이다');
  ok(s.assetsOnFile, '화면이 올라온 파일을 안다');
  const named2 = await saveDraft(db, r.scope, { expectedVersion: back.version, athleteName: '금윤호' }, NOW);
  eq((await loadPublicState(db, r.scope, { now: NOW })).screen, 'upload', '이름을 적으면 끝내기로 돌아온다');
  ok((await finalize(r.scope, named2.version, key(), { samePitchConfirmed: true })).created, '끝까지 간다');
}

/* ─────────────────────── 고침을 거둬도 관리자가 정한 손은 남는다 ─────────────────────── */
{
  const r = await ready();
  await finalize(r.scope, (await loadPublicState(db, r.scope, { now: NOW })).version, key(), { samePitchConfirmed: true });
  /* 판에는 손이 없고 관리자가 접수 칸에만 정했다 */
  await db.intakeSubmission.update({ where: { id: r.submissionId }, data: { throwingHand: 'L' } });
  const open = await requestCorrection(db, { adminId: 'admin-1', submissionId: r.submissionId, fields: ['throwingHand'] }, NOW);
  ok(!('handBefore' in (await loadPublicState(db, r.scope, { now: NOW })).correction!), '기억해 둔 값은 공개 상태로 안 나간다');
  const edited = await saveDraft(db, r.scope, { expectedVersion: open.version, throwingHand: 'R' }, NOW);
  await cancelCorrection(db, { adminId: 'admin-1', submissionId: r.submissionId, expectedVersion: edited.version }, NOW);
  eq((await subRow(r.submissionId)).throwingHand, 'L', '거두면 열 때의 손으로 돌아간다');

  /* 요청에서 그 칸을 빼도 같다 */
  const again = await requestCorrection(db, { adminId: 'admin-1', submissionId: r.submissionId, fields: ['throwingHand'] }, NOW);
  const edited2 = await saveDraft(db, r.scope, { expectedVersion: again.version, throwingHand: 'R' }, NOW);
  await requestCorrection(db, { adminId: 'admin-1', submissionId: r.submissionId, fields: ['athleteName'], expectedVersion: edited2.version }, NOW);
  eq((await subRow(r.submissionId)).throwingHand, 'L', '요청에서 빼도 열 때의 손이다');
}

/* ─────────────────────── 끝내지 않은 파일 정리 ─────────────────────── */
{
  const clock = Date.now();
  const FAR = new Date(clock + 40 * DAY);
  const graceOver = new Date(clock + 37 * DAY);

  /* 옆만 올리고 그만뒀다 */
  const i = await invite({ uploadExpiresAt: new Date(clock + 35 * DAY) });
  await named(i.scope);
  await recordConsents(db, i.scope, { answers: REQUIRED }, NOW);
  const sideBytes = mov240();
  const sideId = await sendFile(i.scope, 'side', sideBytes);
  await verifyAsset(db, storage, sideId, NOW);
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: sideId } });

  /* 막힌 채 칸에 남은 파일 */
  const j = await invite({ uploadExpiresAt: new Date(clock + 35 * DAY) });
  await named(j.scope);
  await recordConsents(db, j.scope, { answers: REQUIRED }, NOW);
  const junkId = await sendFile(j.scope, 'side', Buffer.from('<?php echo 1; ?>'.repeat(50)));
  await verifyAsset(db, storage, junkId, NOW);

  /* 끝낸 접수의 원본, 기간이 살아 있는 초안의 파일 */
  const done = await ready({ uploadExpiresAt: new Date(clock + 35 * DAY) });
  await finalize(done.scope, done.state.version);
  await verifyAll(done.sideId, done.rearId);
  const live = await ready({ uploadExpiresAt: new Date(clock + 90 * DAY) });
  /* 고침 중인 접수의 얼린 원본과, 올리다 만 새 파일 */
  const fix = await ready({ uploadExpiresAt: new Date(clock + 35 * DAY) });
  await finalize(fix.scope, fix.state.version);
  await verifyAll(fix.sideId, fix.rearId);
  await requestCorrection(db, { adminId: 'a', submissionId: fix.submissionId, views: ['rear'] }, NOW);
  const nb = mov120();
  const fixNew = await reserveAsset(db, fix.scope, { view: 'rear', expectedAssetId: fix.rearId, fileName: 'n', sizeBytes: nb.length, sha256: sha(nb) }, NOW);
  const fg = await issueUploadToken(db, storage, fix.scope, { assetId: fixNew.asset.id }, NOW);
  objects.set(fg.objectName, nb);
  await confirmUpload(db, storage, fix.scope, { assetId: fixNew.asset.id }, NOW);
  await verifyAsset(db, storage, fixNew.asset.id, NOW);

  /* 기간이 막 끝난 때는 끝내거나 기간을 늘릴 여유를 둔다 */
  await cleanupStaleUploads(db, storage, new Date(clock + 35 * DAY + HOUR), 500);
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: sideId } })).status, 'verified', '유예 안에서는 안 건드린다');

  const c = await cleanupStaleUploads(db, storage, graceOver, 500);
  ok(c.abandoned >= 3, '도착했지만 판에 오르지 못한 파일을 버린다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: sideId } })).status, 'purged', '지운다');
  ok(!objects.has(row.objectPath), '저장소에서도 지운다');
  eq((await subRow(i.submissionId)).sideAssetId, null, '칸이 지워진 자산을 안 가리킨다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: junkId } })).status, 'purged', '막힌 파일도 지운다');

  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: done.sideId } })).status, 'verified', '접수된 원본은 안 건드린다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: live.sideId } })).status, 'uploaded', '기간이 살아 있으면 안 건드린다');
  const frozen = await db.intakeAsset.findUniqueOrThrow({ where: { id: fix.rearId } });
  ok(frozen.status === 'verified' && objects.has(frozen.objectPath), '고침 중이어도 얼린 원본은 안 건드린다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: fixNew.asset.id } })).status, 'purged', '고침 중 올린 안 낸 파일은 지운다');

  /* 폐기된 초대의 파일도 유예 뒤에 — 시각을 모르는 줄은 폐기 시각이 없어도 간다 */
  const k = await invite({ uploadExpiresAt: new Date(clock + 200 * DAY) });
  await named(k.scope);
  await recordConsents(db, k.scope, { answers: REQUIRED }, NOW);
  const kid = await sendFile(k.scope, 'side', mov240());
  await db.intakeInvitation.update({ where: { id: k.invitationId }, data: { status: 'revoked', revokedAt: FAR } });
  await cleanupStaleUploads(db, storage, new Date(FAR.getTime() + HOUR), 500);
  ok((await db.intakeAsset.findUniqueOrThrow({ where: { id: kid } })).status !== 'abandoned', '폐기 직후에는 안 건드린다');
  await cleanupStaleUploads(db, storage, new Date(FAR.getTime() + 3 * DAY), 500);
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: kid } })).status, 'purged', '폐기 뒤 유예가 지나면 지운다');

  /* 철회한 초안은 7일 유예 뒤에 지운다 — 올리기 기간이 살아 있어도 끝낼 길이 없어서 기간과 상관없다 */
  const w = await invite({ uploadExpiresAt: new Date(clock + 300 * DAY) });
  await named(w.scope);
  await recordConsents(db, w.scope, { answers: REQUIRED }, NOW);
  const wid = await sendFile(w.scope, 'side', mov240());
  const wPath = (await db.intakeAsset.findUniqueOrThrow({ where: { id: wid } })).objectPath;
  const wReserved = mov120();
  const wTransit = await reserveAsset(db, w.scope, { view: 'rear', expectedAssetId: null, fileName: 'r', sizeBytes: wReserved.length, sha256: sha(wReserved) }, NOW);
  const wAt = new Date(clock + 50 * DAY);
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: w.submissionId }, wAt);
  eq((await subRow(w.submissionId)).withdrawnAt, wAt, '철회 시각을 접수에 남긴다');
  await cleanupStaleUploads(db, storage, new Date(wAt.getTime() + 7 * DAY - 1), 500);
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: wid } })).status, 'uploaded', '유예 안에서는 안 건드린다');
  ok(objects.has(wPath), '바이트도 그대로다');
  const wDone = await cleanupStaleUploads(db, storage, new Date(wAt.getTime() + 7 * DAY), 500);
  ok(wDone.abandoned >= 2 && wDone.purged >= 2, '7일이 되면 버리고 같은 번에 지운다');
  const wRow = await db.intakeAsset.findUniqueOrThrow({ where: { id: wid } });
  eq([wRow.status, wRow.purgedAt != null, objects.has(wPath)], ['purged', true, false], '판에 오른 적 없는 파일을 지운다');
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: wTransit.asset.id } })).status, 'purged', '전송 중이던 자리도 정리한다');
  eq(await db.intakeAudit.count({ where: { submissionId: w.submissionId, action: 'asset.purged' } }), 2, '파일마다 기록한다');

  /* 철회해도 판에 얼린 원본은 이 길로 안 지운다. 판에 있는 자산이면 '버림' 상태로 잘못 적혀 있어도 다시 보고 안 지운다 */
  const wf = await ready({ uploadExpiresAt: new Date(clock + 300 * DAY) });
  await finalize(wf.scope, wf.state.version);
  const wfPath = (await db.intakeAsset.findUniqueOrThrow({ where: { id: wf.sideId } })).objectPath;
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: wf.submissionId }, wAt);
  await db.intakeAsset.update({ where: { id: wf.sideId }, data: { status: 'abandoned' } });
  await cleanupStaleUploads(db, storage, new Date(wAt.getTime() + 8 * DAY), 500);
  eq((await db.intakeAsset.findUniqueOrThrow({ where: { id: wf.sideId } })).status, 'abandoned', '판에 얼린 자산은 안 지운다');
  ok(objects.has(wfPath), '얼린 원본의 바이트는 남는다');
  await db.intakeAsset.update({ where: { id: wf.sideId }, data: { status: 'verified' } });
}

/* 마지막 자리의 시도가 끝을 못 적었다 — 잠기지도 풀리지도 않은 채 맞는 코드까지 영영 막히면 안 된다 */
{
  const i = await invite({ accessCode: 'right-code' });
  const inv = () => db.intakeInvitation.findUniqueOrThrow({ where: { id: i.invitationId } });
  const attempt = async (code: string, t: Date) => verifyResultAccess(db, { invitation: await inv(), submissionId: i.submissionId, code }, t);
  await db.intakeInvitation.update({ where: { id: i.invitationId }, data: { accessCodeFailures: ACCESS_CODE_MAX_FAILURES - 1 } });

  const realTx = db.$transaction;
  (db as unknown as { $transaction: unknown }).$transaction = () => {
    (db as unknown as { $transaction: unknown }).$transaction = realTx;
    throw new Error('감사 쓰기 실패');
  };
  await assert.rejects(attempt('wrong-code', NOW), /감사 쓰기 실패/, '마지막 자리의 쓰기가 끊긴다');
  let row = await inv();
  eq([row.accessCodeFailures, row.accessCodeLockedAt], [ACCESS_CODE_MAX_FAILURES, null], '잠기지 못한 채 자리만 찬다');

  await fails(attempt('right-code', new Date(NOW.getTime() + 5_000)), 'rate_limited', '살아 있는 시도일 수 있는 동안은 기다리게 한다');
  ok((await inv()).accessCodeLockedAt == null, '방금 잡은 자리는 앞질러 잠그지 않는다');

  const after = new Date(NOW.getTime() + ACCESS_CODE_HOLD_STALE_MS + 1_000);
  await fails(attempt('right-code', after), 'access_code_locked', '시간이 지나면 잠금으로 마무리한다');
  row = await inv();
  ok(row.accessCodeLockedAt != null, '잠근 시각이 남는다');
  eq(await db.intakeAudit.count({ where: { invitationId: i.invitationId, action: 'access_code.locked' } }), 1, '잠근 일을 남긴다');
  await fails(attempt('right-code', after), 'access_code_locked', '또 해도 같다');
  eq(await db.intakeAudit.count({ where: { invitationId: i.invitationId, action: 'access_code.locked' } }), 1, '기록은 한 줄이다');

  eq(await resetAccessCodeLock(db, { adminId: 'a', submissionId: i.submissionId }, after), { reset: true }, '관리자가 푼다');
  await attempt('right-code', new Date(after.getTime() + 16 * 60_000));
  passed++;
}

/* 판단에 드는 줄 — 쌓인 줄을 다 읽은 답과 같아야 한다. 답을 뒤집어 수백 줄이 쌓여도 몇십 줄이다 */
{
  const i = await invite();
  const relations = ['self', 'parent', 'coach', 'other'];
  let seed = 7;
  const pick = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const data = Array.from({ length: 400 }, (_, n) => {
    const kind = ['submission', 'overseas', 'model'][pick(3)];
    const agreedAt = new Date(NOW.getTime() + n * 1000);
    return {
      submissionId: i.submissionId,
      kind,
      docVersion: consentDocOf(kind as 'model').version,
      textHash: consentDocOf(kind as 'model').textHash,
      granted: pick(3) !== 0,
      relation: relations[pick(4)],
      agreedAt,
      withdrawnAt: pick(5) === 0 ? agreedAt : null,
    };
  });
  await db.intakeConsent.createMany({ data });
  const all = await db.intakeConsent.findMany({ where: { submissionId: i.submissionId } });
  const few = await consentDecisionRows(db, i.submissionId);
  ok(few.length <= 3 * 4 * 2 * 2 && few.length < all.length, '쌓인 줄 수와 상관없이 몇십 줄이다');
  ok(few[0].agreedAt instanceof Date, '시각은 Date 로 온다');
  for (const relation of [undefined, ...relations]) {
    const pickOf = (rows: typeof few | typeof all) => [...latestConsents(rows, relation).entries()].map(([k, r]) => [k, r.agreedAt.getTime(), r.granted]).sort();
    eq(pickOf(few), pickOf(all), `같은 답이다(${relation ?? '관계 없이'})`);
  }
}

/* ─────────────────────── 원본 보유 기간 ─────────────────────── */
{
  /* 앞 시험의 접수들과 섞이지 않게 아주 옛날에 낸 접수로 본다 — 크론 시험도 이 접수들만 지울 날이 된다 */
  const T0 = at(-1000 * DAY);
  const D = (n: number, ms = 0) => new Date(T0.getTime() + n * DAY + ms);
  const purge = (id: string, t: Date) => purgeSubmissionOriginals({ db, storage, now: () => t }, id);
  const pathOf = async (id: string) => (await db.intakeAsset.findUniqueOrThrow({ where: { id } })).objectPath;
  const statusOf = async (id: string) => (await db.intakeAsset.findUniqueOrThrow({ where: { id } })).status;
  const audits = (submissionId: string) => db.intakeAudit.findMany({ where: { submissionId, action: 'originals.purged' } });
  const starts = (submissionId: string) => db.intakeAudit.findMany({ where: { submissionId, action: 'originals.purge_started' } });
  /** 표시가 커밋된 뒤, 저장소를 지우기 전의 틈에 끼어든다 — 다음 remove 한 번 앞에서 돈다 */
  const inRemoveGap = (work: () => Promise<void>) => {
    const real = storage.remove;
    storage.remove = async (paths) => {
      storage.remove = real;
      await work();
      await real.call(storage, paths);
    };
  };
  /* 낸 뒤 검증까지 끝낸 접수 — 일꾼이 끝낸 것처럼 검증 일감도 닫는다 */
  async function sent(t: Date = T0, extra = {}) {
    const r = await ready({ uploadExpiresAt: at(14 * DAY), ...extra });
    await finalizeSubmission(db, r.scope, { expectedVersion: r.state.version, idempotencyKey: key() }, t);
    await verifyAll(r.sideId, r.rearId);
    await db.intakeJob.updateMany({ where: { dedupeKey: { in: [`verify_asset:${r.sideId}`, `verify_asset:${r.rearId}`] } }, data: { status: 'done' } });
    return { ...r, sidePath: await pathOf(r.sideId), rearPath: await pathOf(r.rearId) };
  }
  const revisionOf = (submissionId: string) => db.intakeRevision.findFirstOrThrow({ where: { submissionId }, orderBy: { number: 'desc' } });
  async function mkRun(submissionId: string, status: string, finishedAt: Date | null = null) {
    const rev = await revisionOf(submissionId);
    return db.intakeAnalysisRun.create({ data: { submissionId, revisionId: rev.id, engineKey: `e-${key()}`, status, finishedAt, requestedAt: T0 } });
  }
  async function mkPublication(submissionId: string, publishedAt: Date, active = true) {
    const run = await mkRun(submissionId, 'succeeded', T0);
    const number = (await db.intakePublication.count({ where: { submissionId } })) + 1;
    if (active) await db.intakePublication.updateMany({ where: { submissionId, activeFor: { not: null } }, data: { activeFor: null, unpublishedAt: publishedAt } });
    return db.intakePublication.create({ data: { submissionId, runId: run.id, number, activeFor: active ? submissionId : null, publishedByAdminId: 'a', publishedAt } });
  }

  /* 경계 · 지우는 것 · 남기는 것 */
  const a = await sent();
  eq(await purge(a.submissionId, D(90, -1)), { outcome: 'not_due' }, '90일 되기 1ms 전에는 안 지운다');
  ok(objects.has(a.sidePath) && objects.has(a.rearPath), '바이트가 그대로다');
  const before = await db.intakeAsset.findUniqueOrThrow({ where: { id: a.sideId } });
  const r1 = await purge(a.submissionId, D(90));
  eq(r1, { outcome: 'purged', assets: 2, previewPaths: 0 }, '90일이 되면 지운다');
  ok(!objects.has(a.sidePath) && !objects.has(a.rearPath), '저장소에서 지운다');
  const after = await db.intakeAsset.findUniqueOrThrow({ where: { id: a.sideId } });
  eq([after.status, after.purgedAt], ['purged', D(90)], '지운 뒤에야 적는다');
  eq([after.serverSha256, after.clientSha256, after.mediaFacts], [before.serverSha256, before.clientSha256, before.mediaFacts], '해시 · 파일 사실은 남는다');
  eq((await subRow(a.submissionId)).status, 'verified', '접수 상태는 그대로다');
  const trail = await audits(a.submissionId);
  eq([trail.length, trail[0].actorKind, trail[0].actorId], [1, 'system', null], '접수마다 시스템 기록 한 줄');
  ok(!JSON.stringify(trail[0].detail).includes('sub/'), '기록에 경로가 없다');
  eq(await purge(a.submissionId, D(91)), { outcome: 'nothing' }, '다시 돌아도 할 일이 없다');
  eq((await audits(a.submissionId)).length, 1, '기록이 안 는다');
  const pubState = await loadPublicState(db, a.scope, { now: D(91) });
  eq([pubState.originalDeleteDate, pubState.originalDeletedDate], [seoulDateKey(D(90)), seoulDateKey(D(90))], '지울 날과 지운 날을 말한다');
  eq((await loadPublicState(db, (await sent()).scope, { now: D(1) })).originalDeletedDate, null, '지우기 전에는 지운 날이 없다');
  eq(pubState.assets.side?.integrity, '보유 기간이 지나 원본을 지웠어요', '받는 사람에게 사실대로 말한다');
  eq(await registerRevision({ db, storage }, (await revisionOf(a.submissionId)).id), 'skipped', '지운 판을 다시 등록해도 실패로 안 쌓인다');

  /* 지적 1 · 3: 지운 접수는 분석을 약속하지 않고, 동의 판이 바뀌어도 다시 묻지 않는다 */
  eq(pubState.originalsGone, 'deleted', '지운 사실을 준다');
  eq(pubState.screen, 'receipt', '영수증을 보인다');
  ok(pubState.statusText.includes('원본을 지웠어요') && !pubState.statusText.includes('기다리고'), '지금 상태가 분석을 약속하지 않는다');
  const goneHead = receiptHead(pubState);
  ok(goneHead.title.includes('지웠어요') && !goneHead.desc.includes('공개되면'), '머리도 약속하지 않는다');
  const gc = await sent();
  await db.intakeConsent.updateMany({ where: { submissionId: gc.submissionId, kind: 'overseas' }, data: { docVersion: 'old', textHash: 'old' } });
  ok((await loadPublicState(db, gc.scope, { now: D(1) })).needsReconsent, '지우기 전에는 다시 받는다');
  fail.remove = 1;
  await fails(purge(gc.submissionId, D(90)), 'storage_unavailable', '표시만 걸린 채 멈춘다');
  const goneMid = await loadPublicState(db, gc.scope, { now: D(90) });
  eq([goneMid.originalsGone, goneMid.needsReconsent], ['deleting', false], '지우는 중에도 안 받는다');
  ok(goneMid.statusText.includes('지우고 있어요'), '지우는 중이라고 말한다');
  await fails(recordConsents(db, gc.scope, { answers: REQUIRED }, D(90)), 'not_editable', '지우는 중에는 동의를 안 받는다');
  await purge(gc.submissionId, D(90));
  const goneDone = await loadPublicState(db, gc.scope, { now: D(91) });
  eq([goneDone.originalsGone, goneDone.needsReconsent, goneDone.screen], ['deleted', false, 'receipt'], '지운 뒤에도 영수증이다');
  await fails(recordConsents(db, gc.scope, { answers: REQUIRED }, D(91)), 'not_editable', '지운 뒤에는 동의를 안 받는다');

  /* 옛 판의 파일 · 미리보기 · 분석 결과 */
  const b = await sent();
  await requestCorrection(db, { adminId: 'a', submissionId: b.submissionId, views: ['rear'] }, D(10));
  const rear2 = await sendFile(b.scope, 'rear', mov120(4096), b.rearId, 'rear2.MOV');
  await finalizeSubmission(db, b.scope, { expectedVersion: (await subRow(b.submissionId)).version, idempotencyKey: key() }, D(20));
  await verifyAll(rear2);
  await db.intakeJob.updateMany({ where: { dedupeKey: `verify_asset:${rear2}` }, data: { status: 'done' } });
  eq(await db.intakeRevision.count({ where: { submissionId: b.submissionId } }), 2, '판이 둘이다');
  const rear2Path = await pathOf(rear2);
  const run = await mkRun(b.submissionId, 'succeeded', D(20));
  const prefix = `sub/${b.submissionId}/runs/${run.id}`;
  for (const f of ['analysis.json', 'preview-side.mp4', 'preview-rear.mp4']) objects.set(`${prefix}/${f}`, Buffer.from(f));
  const stranger = await sent();
  eq(await purge(b.submissionId, D(109)), { outcome: 'not_due' }, '마지막으로 낸 날부터 센다');
  eq(await purge(b.submissionId, D(110)), { outcome: 'purged', assets: 3, previewPaths: 2 }, '지금 판 · 옛 판 원본 셋과 미리보기를 지운다');
  ok(![b.sidePath, b.rearPath, rear2Path].some((p) => objects.has(p)), '옛 판의 원본도 지운다');
  ok(!objects.has(`${prefix}/preview-side.mp4`) && !objects.has(`${prefix}/preview-rear.mp4`), '미리보기도 지운다');
  ok(objects.has(`${prefix}/analysis.json`), '분석 결과는 남는다');
  eq(Object.keys((await audits(b.submissionId))[0].detail as object).sort(), ['assets', 'previewPaths'], '끝 기록은 지운 파일 수라고 안 말하고 부른 경로 수를 적는다');
  ok(objects.has(stranger.sidePath), '다른 접수의 파일은 그대로다');
  eq(await statusOf(b.rearId), 'purged', '옛 판의 자산도 지운 것으로 적는다');

  /* 모델 개발 동의는 예외가 아니다 */
  const m = await ready({ uploadExpiresAt: at(14 * DAY) });
  await recordConsents(db, m.scope, { answers: [answer('model', true)] }, NOW);
  await finalizeSubmission(db, m.scope, { expectedVersion: (await subRow(m.submissionId)).version, idempotencyKey: key() }, T0);
  await verifyAll(m.sideId, m.rearId);
  await db.intakeJob.updateMany({ where: { dedupeKey: { in: [`verify_asset:${m.sideId}`, `verify_asset:${m.rearId}`] } }, data: { status: 'done' } });
  ok((await loadPublicState(db, m.scope, { now: D(1) })).consent.granted.model, '모델 개발에 동의한 접수다');
  eq((await purge(m.submissionId, D(90))).outcome, 'purged', '같은 날에 지운다');

  /* 저장소 실패 — 지운 것으로 적지 않고 다시 돈다 */
  const f = await sent();
  fail.remove = 1;
  await fails(purge(f.submissionId, D(90)), 'storage_unavailable', '저장소가 실패하면 던진다');
  eq([await statusOf(f.sideId), objects.has(f.sidePath), (await audits(f.submissionId)).length], ['purging', true, 0], '지운 것으로 안 적는다');
  fail.removePartial = 1;
  await fails(purge(f.submissionId, D(90)), 'storage_unavailable', '일부만 지우고 끊겨도 던진다');
  eq([await statusOf(f.sideId), await statusOf(f.rearId), (await audits(f.submissionId)).length], ['purging', 'purging', 0], '연결이 끊기면 지워졌는지 모르니 아무것도 안 적는다');
  ok(objects.has(f.sidePath) !== objects.has(f.rearPath), '한쪽은 이미 없다');
  fail.removeNoop = 1;
  await fails(purge(f.submissionId, D(90)), 'storage_unavailable', '지웠다는 답뿐이고 파일이 남았으면 던진다');
  const [goneId, leftId] = objects.has(f.sidePath) ? [f.rearId, f.sideId] : [f.sideId, f.rearId];
  eq([await statusOf(goneId), await statusOf(leftId)], ['purged', 'purging'], '없어진 자산은 끝내고 남은 파일은 지운 것으로 안 적는다');
  eq(await purge(f.submissionId, D(91)), { outcome: 'purged', assets: 1, previewPaths: 0 }, '다시 돌면 남은 자산을 끝낸다');
  eq([await statusOf(f.sideId), await statusOf(f.rearId), (await audits(f.submissionId)).map((a) => (a.detail as { assets: number }).assets).sort()], ['purged', 'purged', [1, 1]], '끝낸 번마다 한 줄, 합이 자산 수다');
  eq((await starts(f.submissionId)).length, 1, '시작 기록은 표시한 번마다 한 줄이다');

  /* 분석이 도는 동안 · 끝난 직후 */
  const h = await sent();
  const reqRun = await mkRun(h.submissionId, 'requested');
  eq(await purge(h.submissionId, D(91)), { outcome: 'held', reason: 'analysis' }, '시작 응답을 못 받은 실행도 기다린다');
  ok(objects.has(h.sidePath), '기다리는 동안 바이트가 있다');
  await db.intakeAnalysisRun.update({ where: { id: reqRun.id }, data: { status: 'running', gpuCallId: 'c' } });
  eq(await purge(h.submissionId, D(91)), { outcome: 'held', reason: 'analysis' }, '도는 실행을 기다린다');
  await db.intakeAnalysisRun.update({ where: { id: reqRun.id }, data: { status: 'failed', finishedAt: D(91) } });
  eq(await purge(h.submissionId, new Date(D(91).getTime() + PURGE_RUN_SETTLE_MS - 1)), { outcome: 'held', reason: 'run_settling' }, '끝난 직후에는 분석 서버가 파일을 더 쓸 수 있어 기다린다');
  eq((await purge(h.submissionId, new Date(D(91).getTime() + PURGE_RUN_SETTLE_MS))).outcome, 'purged', '시간이 지나면 지운다');

  /* 검증 일감이 살아 있으면 */
  const v = await sent();
  await db.intakeJob.updateMany({ where: { dedupeKey: `verify_asset:${v.sideId}` }, data: { status: 'queued' } });
  eq(await purge(v.submissionId, D(91)), { outcome: 'held', reason: 'verify' }, '검증이 파일을 읽고 있을 수 있다');
  await db.intakeJob.updateMany({ where: { dedupeKey: `verify_asset:${v.sideId}` }, data: { status: 'failed' } });
  eq((await purge(v.submissionId, D(91))).outcome, 'purged', '멈춘 일감은 삭제를 못 막는다');

  /* 열린 고침 — 기다리되 끝없이는 아니다 */
  const windowEnds = (invitationId: string, at95: Date) => db.intakeInvitation.update({ where: { id: invitationId }, data: { uploadExpiresAt: at95 } });
  const c = await sent();
  await windowEnds(c.invitationId, D(95));
  await requestCorrection(db, { adminId: 'a', submissionId: c.submissionId, fields: ['athleteName'] }, D(85));
  eq(await purge(c.submissionId, D(91)), { outcome: 'held', reason: 'correction' }, '고칠 수 있는 동안 기다린다');
  await cancelCorrection(db, { adminId: 'a', submissionId: c.submissionId, expectedVersion: (await subRow(c.submissionId)).version }, D(92));
  eq((await purge(c.submissionId, D(92))).outcome, 'purged', '고침을 거두면 바로 지운다');

  const ce = await sent();
  await windowEnds(ce.invitationId, D(95));
  await requestCorrection(db, { adminId: 'a', submissionId: ce.submissionId, fields: ['athleteName'] }, D(85));
  eq((await purge(ce.submissionId, D(95))).outcome, 'purged', '올리기 기간이 끝나면 안 기다린다');
  eq(readViews(await subRow(ce.submissionId)), ['side', 'rear'], '지운 칸은 요청에 들어간다');

  const cc = await sent();
  await requestCorrection(db, { adminId: 'a', submissionId: cc.submissionId, views: ['rear'] }, D(85));
  const fresh = await sendFile(cc.scope, 'rear', mov120(4096), cc.rearId, 'fresh.MOV');
  const freshPath = await pathOf(fresh);
  await db.intakeJob.updateMany({ where: { dedupeKey: `verify_asset:${fresh}` }, data: { status: 'done' } });
  eq(await purge(cc.submissionId, D(103)), { outcome: 'held', reason: 'correction' }, '상한 앞에서는 기다린다');
  const vBefore = (await subRow(cc.submissionId)).version;
  eq(await purge(cc.submissionId, D(104)), { outcome: 'purged', assets: 2, previewPaths: 0 }, '상한이 되면 얼린 원본만 지운다');
  ok(!objects.has(cc.sidePath) && !objects.has(cc.rearPath), '얼린 원본은 없다');
  ok(objects.has(freshPath), '받는 사람이 방금 고른 파일은 남긴다');
  eq(await statusOf(fresh), 'uploaded', '판에 안 오른 파일은 안 건드린다');
  const opened = await subRow(cc.submissionId);
  eq([readViews(opened), opened.version], [['rear', 'side'], vBefore + 1], '지운 칸을 요청에 넣어 새 파일을 받는다');

  /* 공개 시계 — 내리기는 안 건드리고, 고친 뒤 공개하면 다시 돈다 */
  const p = await sent();
  await mkPublication(p.submissionId, D(10));
  await db.intakePublication.updateMany({ where: { submissionId: p.submissionId }, data: { activeFor: null, unpublishedAt: D(60) } });
  eq(await purge(p.submissionId, D(100, -1)), { outcome: 'not_due' }, '공개한 날부터 센다');
  eq((await purge(p.submissionId, D(100))).outcome, 'purged', '내려도 공개한 날부터다');

  const q = await sent();
  await mkPublication(q.submissionId, D(10));
  await requestCorrection(db, { adminId: 'a', submissionId: q.submissionId, fields: ['athleteName'] }, D(20));
  await saveDraft(db, q.scope, { expectedVersion: (await subRow(q.submissionId)).version, athleteName: '고친 이름' }, D(21));
  await finalizeSubmission(db, q.scope, { expectedVersion: (await subRow(q.submissionId)).version, idempotencyKey: key() }, D(30));
  eq(await purge(q.submissionId, D(100)), { outcome: 'not_due' }, '공개 뒤에 다시 내면 그날부터다');
  await mkPublication(q.submissionId, D(50));
  eq(await purge(q.submissionId, D(130)), { outcome: 'not_due' }, '고친 뒤 공개하면 시계가 새로 돈다');
  eq((await purge(q.submissionId, D(140))).outcome, 'purged', '새 공개일부터 90일');

  /* 철회 시계 */
  const w = await sent();
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: w.submissionId }, D(50));
  eq(await purge(w.submissionId, D(100)), { outcome: 'not_due' }, '공개한 적 없으면 철회한 날부터다');
  eq((await purge(w.submissionId, D(140))).outcome, 'purged', '철회한 날부터 90일');
  const wp = await sent();
  await mkPublication(wp.submissionId, D(10));
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: wp.submissionId }, D(80));
  eq((await purge(wp.submissionId, D(100))).outcome, 'purged', '철회가 공개한 접수의 시계를 늦추지 않는다');

  /* 끝내지 않은 초안은 이 길로 안 지운다 */
  const dft = await ready({ uploadExpiresAt: at(14 * DAY) });
  eq(await purge(dft.submissionId, at(5000 * DAY)), { outcome: 'not_due' }, '판이 없으면 시계가 없다');

  /* 접수 폴더 밖의 경로 — 저장소를 안 부른다 */
  const o = await sent();
  const foreign = await sent();
  await db.intakeAsset.update({ where: { id: o.sideId }, data: { objectPath: `${foreign.sidePath}-x` } });
  objects.set(`${foreign.sidePath}-x`, Buffer.from('x'));
  const calls = removed.length;
  await assert.rejects(purge(o.submissionId, D(90)), /이 접수의 자리가 아니에요/);
  passed++;
  eq(removed.length, calls, '폴더 밖 경로가 끼면 아무것도 안 지운다');
  ok(objects.has(`${foreign.sidePath}-x`) && objects.has(o.rearPath), '바이트가 그대로다');
  eq([await statusOf(o.sideId), await statusOf(o.rearId), (await starts(o.submissionId)).length], ['verified', 'verified', 0], '표시도 기록도 안 걸린다');
  await db.intakeAsset.update({ where: { id: o.sideId }, data: { objectPath: o.sidePath } });
  await purge(o.submissionId, D(90));
  await purge(foreign.submissionId, D(90));

  /* 고침 뒤 새 영상 — 지운 뒤에도 다시 받을 수 있다. 같은 파일이어도 새 자산이고 시계가 새로 돈다 */
  const n = await sent();
  await purge(n.submissionId, D(90));
  await requestCorrection(db, { adminId: 'a', submissionId: n.submissionId, fields: ['athleteName'], extendUploadUntil: at(14 * DAY) }, D(100));
  eq(readViews(await subRow(n.submissionId)), ['side', 'rear'], '글만 요청해도 지운 칸은 새 파일을 받는다');
  const side2 = await sendFile(n.scope, 'side', n.side, n.sideId, 'again.MOV');
  ok(side2 !== n.sideId, '지운 원본과 같은 파일이어도 새 자산이다');
  const rearB = await sendFile(n.scope, 'rear', mov120(4096), n.rearId, 'again2.MOV');
  await finalizeSubmission(db, n.scope, { expectedVersion: (await subRow(n.submissionId)).version, idempotencyKey: key() }, D(101));
  await verifyAll(side2, rearB);
  await db.intakeJob.updateMany({ where: { dedupeKey: { in: [`verify_asset:${side2}`, `verify_asset:${rearB}`] } }, data: { status: 'done' } });
  eq((await loadPublicState(db, n.scope, { now: D(102) })).originalDeletedDate, null, '새 파일이 있으면 아직 안 지웠다');
  eq(await purge(n.submissionId, D(190)), { outcome: 'not_due' }, '새로 낸 날부터 센다');
  eq(await purge(n.submissionId, D(191)), { outcome: 'purged', assets: 2, previewPaths: 0 }, '새 파일만 지운다');
  eq((await audits(n.submissionId)).length, 2, '지운 번마다 한 줄');

  /* 고침을 거둬도 지운 판을 등록하다 실패로 쌓이지 않는다 */
  const g = await sent();
  await purge(g.submissionId, D(90));
  await requestCorrection(db, { adminId: 'a', submissionId: g.submissionId, views: ['side', 'rear'], extendUploadUntil: at(14 * DAY) }, D(100));
  await cancelCorrection(db, { adminId: 'a', submissionId: g.submissionId, expectedVersion: (await subRow(g.submissionId)).version }, D(101));
  eq(await registerRevision({ db, storage }, (await revisionOf(g.submissionId)).id), 'skipped', '지운 판의 등록은 넘어간다');

  /* 크론 — 찾기 · 일감 · 재시도. 앞 묶음이 지운 접수는 다시 안 잡힌다 */
  const j1 = await sent();
  const j2 = await sent();
  const j3 = await sent(D(30));
  const t = D(90);
  const jobsOf = (id: string) => db.$queryRaw<{ dedupeKey: string; status: string; attempts: number; lastError: string | null }[]>(Prisma.sql`SELECT "dedupeKey", "status", "attempts", "lastError" FROM "IntakeJob" WHERE "kind" = 'purge_originals' AND "payload"->>'submissionId' = ${id}`);
  const pending = await db.intakeJob.count({ where: { kind: 'purge_originals', status: 'queued' } });
  eq(pending, 0, '시험 전에 남은 일감이 없다');
  fail.remove = 1;
  const first = await cron(t);
  ok(first.purgesQueued >= 2 && first.retried >= 1, '지울 날이 된 접수에 일감을 넣고, 실패한 일감은 다시 건다');
  eq((await jobsOf(j3.submissionId)).length, 0, '아직인 접수는 일감이 없다');
  eq(await db.intakeJob.count({ where: { kind: 'purge_originals', status: 'queued', lastError: { not: null } } }), 1, '실패 까닭이 일감에 남는다');
  eq((await cron(new Date(t.getTime() + 5 * 60_000))).purgesQueued, 0, '도는 일감이 있으면 또 안 넣는다');
  await cron(new Date(t.getTime() + 10 * 60_000));
  eq([await statusOf(j1.sideId), await statusOf(j2.sideId), await statusOf(j3.sideId)], ['purged', 'purged', 'verified'], '크론이 끝까지 지운다');
  eq((await audits(j1.submissionId)).length, 1, '재시도가 있어도 기록은 한 줄');

  /* 기다리는 일감은 횟수를 안 쓰고, 시계가 다시 돌면 새 열쇠로 다시 들어간다 */
  const k = await sent();
  const kRun = await mkRun(k.submissionId, 'requested');
  const handlers = intakeJobHandlers({ db, storage: storage as never, gpu: {} as never, now: () => t });
  eq(await enqueueDuePurges(db, t), 1, '기다릴 접수에도 일감을 넣는다');
  const heldRun = await runDueJobs(db, handlers, { owner: 'p', kinds: ['purge_originals'], now: () => t });
  eq([heldRun.postponed, heldRun.failed], [1, 0], '기다리면 미룬다');
  const kKey = purgeJobKey(k.submissionId, D(90));
  const kJob = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: kKey } });
  eq([kJob.status, kJob.attempts], ['queued', 0], '횟수를 안 쓴다');
  await db.intakeAnalysisRun.update({ where: { id: kRun.id }, data: { status: 'failed', finishedAt: D(89) } });
  await mkPublication(k.submissionId, D(80));
  const later = new Date(t.getTime() + 20 * 60_000);
  await runDueJobs(db, intakeJobHandlers({ db, storage: storage as never, gpu: {} as never, now: () => later }), { owner: 'p', kinds: ['purge_originals'], now: () => later });
  eq((await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: kKey } })).status, 'done', '시계가 다시 돌면 일감은 끝난다');
  eq(await statusOf(k.sideId), 'verified', '안 지운다');
  const newDue = D(170);
  eq(await enqueueDuePurges(db, newDue), 2, '새 지울 날에 새 일감이 들어간다(앞서 아직이던 접수도 이제 지울 날이다)');
  ok(await db.intakeJob.findUnique({ where: { dedupeKey: purgeJobKey(k.submissionId, newDue) } }), '열쇠가 지울 날마다 다르다');

  /* 횟수를 다 써도 포기하지 않는다 — 느리게 다시 건다 */
  await db.intakeJob.update({ where: { dedupeKey: purgeJobKey(k.submissionId, newDue) }, data: { status: 'failed', attempts: 8, finishedAt: newDue, lastError: '저장소 실패' } });
  eq(await enqueueDuePurges(db, new Date(newDue.getTime() + HOUR)), 0, '바로는 안 건다');
  eq(await enqueueDuePurges(db, new Date(newDue.getTime() + 7 * HOUR)), 1, '느리게 다시 건다');
  eq((await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: purgeJobKey(k.submissionId, newDue) } })).attempts, 0, '횟수를 새로 준다');
  await db.intakeJob.deleteMany({ where: { kind: 'purge_originals', status: { in: ['queued', 'running'] } } });
  ok(ORIGINAL_RETENTION_MS === 90 * DAY, '시험의 날짜 셈과 규칙이 같다');

  /* ── 삭제 시작 표시 — 저장소를 부르기 전에 'purging' 을 적고, 그 뒤로는 되돌리지 않는다 ── */

  /* 지적 2(2) · 10: 고침 상한에서 지우는 틈에 이름만 고쳐 다시 낸다 — 새 판이 지우는 원본을 얼리거나 시계가 다시 돌면 안 된다 */
  const fin = await sent();
  await requestCorrection(db, { adminId: 'a', submissionId: fin.submissionId, fields: ['athleteName'] }, D(85));
  const seenVersion = (await subRow(fin.submissionId)).version;
  eq(await purge(fin.submissionId, D(103)), { outcome: 'held', reason: 'correction' }, '상한 앞에서는 기다린다');
  eq(await statusOf(fin.sideId), 'verified', '기다리는 동안은 표시가 안 걸린다');
  inRemoveGap(async () => {
    eq([await statusOf(fin.sideId), await statusOf(fin.rearId)], ['purging', 'purging'], '저장소를 부르기 전에 표시가 커밋됐다');
    ok(objects.has(fin.sidePath) && objects.has(fin.rearPath), '틈에는 바이트가 아직 있다');
    eq(readViews(await subRow(fin.submissionId)), ['side', 'rear'], '표시와 함께 지울 칸이 요청에 들어간다');
    eq(await registerRevision({ db, storage }, (await revisionOf(fin.submissionId)).id), 'skipped', '지우는 판의 등록은 넘어간다');
    await saveDraft(db, fin.scope, { expectedVersion: (await subRow(fin.submissionId)).version, athleteName: '고친 이름' }, D(104));
    await fails(finalizeSubmission(db, fin.scope, { expectedVersion: (await subRow(fin.submissionId)).version, idempotencyKey: key() }, D(104)), 'correction_incomplete', '최신 판 번호로 내도 지우는 칸은 다시 받아야 한다');
    await fails(finalizeSubmission(db, fin.scope, { expectedVersion: seenVersion, idempotencyKey: key() }, D(104)), 'stale_version', '낡은 화면의 판 번호는 막힌다');
  });
  eq(await purge(fin.submissionId, D(104)), { outcome: 'purged', assets: 2, previewPaths: 0 }, '다시 내려 해도 지운다');
  const finRow = await subRow(fin.submissionId);
  eq([await db.intakeRevision.count({ where: { submissionId: fin.submissionId } }), finRow.lastFinalizedAt, finRow.status], [1, T0, 'correction_requested'], '새 판이 없고 시계도 그대로다');
  eq(readViews(finRow), ['side', 'rear'], '받는 사람은 두 칸을 새로 낸다');
  ok(!objects.has(fin.sidePath) && !objects.has(fin.rearPath), '원본이 없다');

  /* 지적 4 서버 쪽: 지운 칸을 안 고르고 내면 전송을 기다리라고 말하지 않는다 */
  const onlySide = await sendFile(fin.scope, 'side', mov120(4096), fin.sideId, 'side3.MOV');
  await db.intakeJob.updateMany({ where: { dedupeKey: `verify_asset:${onlySide}` }, data: { status: 'done' } });
  await fails(finalizeSubmission(db, fin.scope, { expectedVersion: (await subRow(fin.submissionId)).version, idempotencyKey: key() }, D(105)), 'correction_incomplete', '지운 칸이 남았으면 요청을 고치라고 답한다');
  eq(await db.intakeRevision.count({ where: { submissionId: fin.submissionId } }), 1, '판이 안 생긴다');

  /* 검증 지적: 끊긴 전송을 정리가 버려 요청받은 칸이 비었다 — 오는 중인 전송이 없으니 기다리라고 하지 않고 그 칸을 고치라고 답한다 */
  const freshRear = await sendFile(fin.scope, 'rear', mov240(4096), fin.rearId, 'rear3.MOV');
  await db.intakeJob.updateMany({ where: { dedupeKey: `verify_asset:${freshRear}` }, data: { status: 'done' } });
  await db.intakeSubmission.update({ where: { id: fin.submissionId }, data: { sideAssetId: null, samePitchConfirmed: false, version: { increment: 1 } } });
  await fails(
    finalizeSubmission(db, fin.scope, { expectedVersion: (await subRow(fin.submissionId)).version, idempotencyKey: key(), samePitchConfirmed: true }, D(105)),
    'correction_incomplete',
    '요청받은 칸이 비었으면 전송을 기다리라고 안 한다',
  );
  eq(await db.intakeRevision.count({ where: { submissionId: fin.submissionId } }), 1, '빈 칸으로는 판이 안 생긴다');

  /* 철회는 막지 않고, 철회로 날짜가 밀려도 끝까지 지운다 */
  const wd = await sent();
  fail.removePartial = 1;
  await fails(purge(wd.submissionId, D(90)), 'storage_unavailable', '일부만 지우고 끊긴다');
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: wd.submissionId }, D(95));
  eq((await loadPublicState(db, wd.scope, { now: D(95) })).originalDeleteDate, seoulDateKey(D(185)), '철회가 지울 날을 민다');
  eq(await purge(wd.submissionId, D(96)), { outcome: 'purged', assets: 2, previewPaths: 0 }, 'not_due 로 끝나지 않고 끝까지 지운다');
  ok(!objects.has(wd.sidePath) && !objects.has(wd.rearPath), '철회한 사람의 영상이 90일 더 남지 않는다');

  /* 지우는 틈에 글만 고치라는 요청이 와도 칸을 강제로 넣고, 같은 파일을 골라도 새 자산으로 받는다 */
  const cg = await sent();
  fail.removePartial = 1;
  await fails(purge(cg.submissionId, D(90)), 'storage_unavailable', '일부만 지우고 끊긴다');
  await requestCorrection(db, { adminId: 'a', submissionId: cg.submissionId, fields: ['athleteName'] }, D(91));
  eq(readViews(await subRow(cg.submissionId)), ['side', 'rear'], '글만 요청해도 지우는 칸이 들어간다');
  const sameFile = await reserveAsset(db, cg.scope, { view: 'side', expectedAssetId: cg.sideId, fileName: 'same.MOV', sizeBytes: cg.side.length, declaredType: 'video/quicktime', sha256: sha(cg.side), pairConfirmed: true }, D(91));
  ok(sameFile.created && sameFile.asset.id !== cg.sideId, '지우는 원본과 같은 파일이어도 새 자산이다');
  eq(await statusOf(cg.sideId), 'purging', '판에 얼린 자산의 표시는 그대로다');
  eq(await purge(cg.submissionId, D(92)), { outcome: 'purged', assets: 2, previewPaths: 0 }, '열린 고침을 기다리지 않고 끝까지 지운다');
  eq(await statusOf(sameFile.asset.id), 'reserved', '새로 고른 파일은 안 건드린다');

  /* 멈춘 채 새 판 — 옛 파일을 계속 지우고, 새 원본 · 새 판의 미리보기는 남긴다. 시계는 새로 낸 날이다 */
  const nv = await sent();
  fail.remove = 1;
  await fails(purge(nv.submissionId, D(90)), 'storage_unavailable', '저장소가 실패한다');
  await requestCorrection(db, { adminId: 'a', submissionId: nv.submissionId, views: ['side', 'rear'] }, D(91));
  const nvSide = await sendFile(nv.scope, 'side', mov120(4096), nv.sideId, 'nv-side.MOV');
  const nvRear = await sendFile(nv.scope, 'rear', mov240(4096), nv.rearId, 'nv-rear.MOV');
  /* 검증 지적: 지우는 중에 고쳐 다시 낸 직후 — 화면이 쥔 상태로 그린 영수증이 방금 보낸 영상을 지웠다고 말하지 않는다 */
  const nvBefore = await loadPublicState(db, nv.scope, { now: D(92) });
  eq(nvBefore.originalsGone, 'deleting', '다시 내기 전에는 지우는 중이다');
  const nvKey = key();
  const nvReceipt = await finalizeSubmission(db, nv.scope, { expectedVersion: nvBefore.version, idempotencyKey: nvKey }, D(92));
  const nvShown = stateAfterReceipt(nvBefore, nvReceipt);
  eq([receiptHead(nvShown).title, receiptRetentionRows(nvShown)], ['영상이 잘 도착했어요', []], '영수증 머리 · 줄이 옛 판의 지우는 중을 말하지 않는다');
  /* 검증 지적: 완료 응답을 잃고 같은 키로 다시 낸다(finishRun 의 retryNetwork) — 서버는 created false 로 같은 판을 준다. 화면은 아직 다시 내기 전 상태를 쥐고 있다 */
  const nvRetry = await finalizeSubmission(db, nv.scope, { expectedVersion: nvBefore.version, idempotencyKey: nvKey }, D(92));
  eq([nvRetry.created, nvRetry.revision], [false, nvReceipt.revision], '같은 키 재시도는 같은 판의 영수증이다');
  const nvRetryShown = stateAfterReceipt(nvBefore, nvRetry);
  eq(
    [receiptHead(nvRetryShown).title, receiptRetentionRows(nvRetryShown), nvRetryShown.statusText, nvRetryShown.originalsGone],
    ['영상이 잘 도착했어요', [], '파일이 잘 도착했는지 확인하고 있어요', null],
    '응답을 잃은 재시도의 영수증도 방금 보낸 영상을 지우고 있다고 말하지 않는다',
  );
  eq((await loadPublicState(db, nv.scope, { now: D(92) })).originalsGone, null, '서버도 지금 판은 살아 있다고 말한다');
  await verifyAll(nvSide, nvRear);
  await db.intakeJob.updateMany({ where: { dedupeKey: { in: [`verify_asset:${nvSide}`, `verify_asset:${nvRear}`] } }, data: { status: 'done' } });
  eq((await subRow(nv.submissionId)).status, 'verified', '두 파일을 새로 받으면 낼 수 있다');
  eq((await loadPublicState(db, nv.scope, { now: D(92) })).originalDeleting, 'older', '옛 판의 파일만 지우는 중이라고 가른다');
  const nvRun = await mkRun(nv.submissionId, 'succeeded', D(92));
  const nvPreview = `sub/${nv.submissionId}/runs/${nvRun.id}/preview-side.mp4`;
  objects.set(nvPreview, Buffer.from('preview'));
  const [nvSidePath, nvRearPath] = [await pathOf(nvSide), await pathOf(nvRear)];
  eq(await purge(nv.submissionId, D(93)), { outcome: 'purged', assets: 2, previewPaths: 0 }, '지울 날이 밀렸어도 옛 파일을 끝낸다');
  ok(!objects.has(nv.sidePath) && !objects.has(nv.rearPath), '옛 원본이 없다');
  ok(objects.has(nvSidePath) && objects.has(nvRearPath) && objects.has(nvPreview), '새 원본과 새 판의 미리보기는 남는다');
  const nvState = await loadPublicState(db, nv.scope, { now: D(93) });
  eq([nvState.originalDeleteDate, nvState.originalDeletedDate, nvState.originalDeleting], [seoulDateKey(D(182)), null, null], '시계는 새로 낸 날이고 지금 판은 살아 있다');

  /* 일꾼 둘 — 끝 기록은 한 줄이다 */
  const two = await sent();
  const both = await Promise.all([purge(two.submissionId, D(90)), purge(two.submissionId, D(90))]);
  eq(both.map((r) => r.outcome).sort(), ['nothing', 'purged'], '한쪽만 끝낸다');
  eq([(await starts(two.submissionId)).length, (await audits(two.submissionId)).length], [1, 1], '시작 · 끝이 한 줄씩이다');

  /* 끝내기는 자산별이다 — 그 자산을 입력으로 쓴 실행의 미리보기가 남으면 그 자산도 안 끝난다 */
  const pv = await sent();
  const pvRun = await mkRun(pv.submissionId, 'succeeded', D(1));
  const pvPath = `sub/${pv.submissionId}/runs/${pvRun.id}/preview-rear.mp4`;
  objects.set(pvPath, Buffer.from('preview'));
  fail.leave.add(pvPath);
  await assert.rejects(purge(pv.submissionId, D(90)), (e: unknown) => e instanceof IntakeError && e.code === 'storage_unavailable' && e.detail?.cause === 'remove_left_object');
  passed++;
  eq([await statusOf(pv.sideId), await statusOf(pv.rearId), (await audits(pv.submissionId)).length], ['purging', 'purging', 0], '미리보기가 남은 두 자산은 안 끝난다');
  ok(!objects.has(pv.sidePath) && !objects.has(pv.rearPath), '원본은 없어졌다');
  fail.leave.clear();
  eq(await purge(pv.submissionId, D(91)), { outcome: 'purged', assets: 2, previewPaths: 2 }, '미리보기가 없어지면 끝난다');

  /* stat 의 연결 실패는 아무것도 안 적는다 — 없어졌는지 모른다 */
  const st = await sent();
  const realStat = storage.stat;
  storage.stat = async () => {
    throw new IntakeError('storage_unavailable', { cause: 'sign_read' });
  };
  await assert.rejects(purge(st.submissionId, D(90)), (e: unknown) => e instanceof IntakeError && e.detail?.cause === 'sign_read');
  passed++;
  storage.stat = realStat;
  eq([await statusOf(st.sideId), await statusOf(st.rearId), (await audits(st.submissionId)).length], ['purging', 'purging', 0], '확인 못 한 파일은 안 끝낸다');
  eq(await purge(st.submissionId, D(91)), { outcome: 'purged', assets: 2, previewPaths: 0 }, '다시 돌면 끝난다');

  /* 공용 확인 함수 */
  objects.set('sub/x/left', Buffer.from('x'));
  fail.leave.add('sub/x/left');
  eq(await removeAndFindLeft(storage, ['sub/x/left', 'sub/x/none']), ['sub/x/left'], '남은 경로를 돌려준다');
  eq([removeLeftObject().code, removeLeftObject().detail?.cause], ['storage_unavailable', 'remove_left_object'], '남았다는 오류는 저장소 실패로 던진다');
  fail.leave.clear();
  eq(await removeAndFindLeft(storage, ['sub/x/left']), [], '없어지면 빈 목록이다');
  ok(!objects.has('sub/x/left'), '지운다');

  /* 지적 6(1): 판에 오른 적 없는 파일은 보유 삭제가 안 건드린다 — 공개 0일, 85일에 고침을 열어 새 파일, 89일에 철회, 90일에 삭제 */
  const lo = await sent();
  await mkPublication(lo.submissionId, D(0));
  await requestCorrection(db, { adminId: 'a', submissionId: lo.submissionId, views: ['side'] }, D(85));
  const loose = await sendFile(lo.scope, 'side', mov120(4096), lo.sideId, 'loose.MOV');
  await db.intakeJob.updateMany({ where: { dedupeKey: `verify_asset:${loose}` }, data: { status: 'done' } });
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: lo.submissionId }, D(89));
  eq((await purge(lo.submissionId, D(90))).outcome, 'purged', '얼린 원본은 지운다');
  ok(objects.has(await pathOf(loose)), '철회 1일 뒤의 판 밖 파일은 남는다');
  eq(await statusOf(loose), 'uploaded', '판 밖 파일의 상태도 그대로다');
  /* 판 밖 파일은 철회한 날부터 7일 유예를 정리가 지킨다 */
  const sweep = (t: Date) => cleanupStaleUploads(db, storage, t, 5000);
  await sweep(D(96, -1));
  ok(objects.has(await pathOf(loose)) && (await statusOf(loose)) === 'uploaded', '유예 끝 1ms 앞까지 남는다');
  await sweep(D(96));
  eq([await statusOf(loose), objects.has(await pathOf(loose))], ['purged', false], '철회한 날부터 7일이 되면 지운다');

  /* 지적 6(2): 전송 중 다른 파일로 바뀌어 'replaced' 가 된 자리 — 26시간 여유는 정리 몫이다 */
  const rp = await sent();
  await requestCorrection(db, { adminId: 'a', submissionId: rp.submissionId, views: ['rear'] }, D(85));
  const fileA = mov120(4096);
  const fileB = mov120(4096);
  const moving = await reserveAsset(db, rp.scope, { view: 'rear', expectedAssetId: rp.rearId, fileName: 'a.MOV', sizeBytes: fileA.length, declaredType: 'video/quicktime', sha256: sha(fileA), pairConfirmed: true }, NOW);
  await issueUploadToken(db, storage, rp.scope, { assetId: moving.asset.id }, NOW);
  await reserveAsset(db, rp.scope, { view: 'rear', expectedAssetId: moving.asset.id, fileName: 'b.MOV', sizeBytes: fileB.length, declaredType: 'video/quicktime', sha256: sha(fileB), pairConfirmed: true }, NOW);
  eq(await statusOf(moving.asset.id), 'replaced', '바뀐 파일이다');
  eq(await purge(rp.submissionId, D(104)), { outcome: 'purged', assets: 2, previewPaths: 0 }, '얼린 원본 둘만 지운다');
  eq(await statusOf(moving.asset.id), 'replaced', '살아 있는 전송 주소의 자리를 지운 것으로 안 적는다');
  /* 살아 있는 주소로 전송이 끝나 바이트가 생겨도, 여유가 지나면 정리가 지운다. @updatedAt 은 실제 시각이라 시험 시계에 맞춰 직접 적는다 */
  const movingPath = await pathOf(moving.asset.id);
  objects.set(movingPath, fileA);
  await db.intakeAsset.update({ where: { id: moving.asset.id }, data: { updatedAt: D(104) } });
  const SLACK = TUS_URL_TTL_MS + 2 * HOUR;
  await sweep(new Date(D(104).getTime() + SLACK));
  eq([await statusOf(moving.asset.id), objects.has(movingPath)], ['replaced', true], '26시간 여유 안에서는 안 지운다');
  await sweep(new Date(D(104).getTime() + SLACK + 1));
  eq([await statusOf(moving.asset.id), objects.has(movingPath)], ['purged', false], '여유가 지나면 늦게 도착한 바이트까지 지운다');

  /* 일감 시험은 앞 묶음이 남긴 접수와 섞이지 않게 더 옛날 시계로 본다 */
  eq(await db.intakeAsset.count({ where: { status: 'purging' } }), 0, '앞 시험에 지우다 만 접수가 안 남았다');
  const T1 = at(-3000 * DAY);
  const E = (n: number, ms = 0) => new Date(T1.getTime() + n * DAY + ms);
  const runPurges = (t: Date) => runDueJobs(db, intakeJobHandlers({ db, storage: storage as never, gpu: {} as never, now: () => t }), { owner: 'p', kinds: ['purge_originals'], now: () => t });
  const failedOf = async (id: string) => (await jobsOf(id)).filter((j) => j.status === 'failed').length;

  /* 시도를 다 쓴 뒤 철회로 날짜가 밀려도 같은 줄을 느리게 다시 걸어 끝낸다 */
  const st1 = await sent(E(0));
  eq(await enqueueDuePurges(db, E(90)), 1, '지울 날에 일감이 생긴다');
  fail.remove = 1;
  eq((await runPurges(E(90))).retried, 1, '저장소가 실패하면 다시 돈다');
  eq(await statusOf(st1.sideId), 'purging', '표시는 남는다');
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: st1.submissionId }, E(95));
  const st1Key = purgeJobKey(st1.submissionId, E(90));
  await db.intakeJob.update({ where: { dedupeKey: st1Key }, data: { status: 'failed', attempts: 8, finishedAt: E(95) } });
  eq(await enqueueDuePurges(db, E(95, HOUR)), 0, '바로는 안 건다');
  eq(await enqueueDuePurges(db, E(95, 7 * HOUR)), 1, '지울 날이 밀렸어도 느리게 다시 건다');
  const st1Job = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: st1Key } });
  eq([st1Job.status, st1Job.attempts, (await jobsOf(st1.submissionId)).length], ['queued', 0, 1], '있던 줄을 다시 쓴다');
  await runPurges(E(95, 7 * HOUR));
  eq([await statusOf(st1.sideId), await statusOf(st1.rearId), await failedOf(st1.submissionId)], ['purged', 'purged', 0], '끝까지 지우고 멈춘 일감이 안 남는다');

  /* 줄이 없어도 잇는다 */
  const st2 = await sent(E(0));
  fail.remove = 1;
  await fails(purge(st2.submissionId, E(90)), 'storage_unavailable', '표시만 걸린 채 끊긴다');
  eq(await enqueueDuePurges(db, E(91)), 1, '일감 없이 멈춘 접수도 찾는다');
  ok((await jobsOf(st2.submissionId))[0].dedupeKey.includes(':resume:'), '날짜와 상관없는 열쇠로 새 줄을 넣는다');
  await runPurges(E(91));
  eq(await statusOf(st2.sideId), 'purged', '끝까지 지운다');

  /* 끝나면 날짜가 다른 옛 실패 줄도 닫는다 */
  const st3 = await sent(E(0));
  fail.remove = 1;
  await fails(purge(st3.submissionId, E(90)), 'storage_unavailable', '표시만 걸린 채 끊긴다');
  await enqueueJob(db, { kind: 'purge_originals', dedupeKey: `purge_originals:${st3.submissionId}:old`, payload: { submissionId: st3.submissionId }, runAfter: E(90) });
  await db.intakeJob.update({ where: { dedupeKey: `purge_originals:${st3.submissionId}:old` }, data: { status: 'failed', attempts: 8, finishedAt: E(90), lastError: '옛 실패' } });
  eq(await purge(st3.submissionId, E(91)), { outcome: 'purged', assets: 2, previewPaths: 0 }, '일감 없이도 끝난다');
  eq(await failedOf(st3.submissionId), 0, '옛 실패 줄이 닫힌다');

  /* 옛 표시가 멈춰도 새 판의 지울 날에는 새 파일을 지운다 — 옛 파일 하나가 새 파일의 90일을 끝없이 미루지 않게 */
  async function stuckWithNewRevision() {
    const r = await sent(E(0));
    fail.leave.add(r.sidePath);
    await fails(purge(r.submissionId, E(90)), 'storage_unavailable', '옛 파일 하나가 안 지워진다');
    eq([await statusOf(r.sideId), await statusOf(r.rearId)], ['purging', 'purged'], '끝낼 수 있는 자산은 끝낸다');
    await requestCorrection(db, { adminId: 'a', submissionId: r.submissionId, views: ['side', 'rear'] }, E(95));
    const newSide = await sendFile(r.scope, 'side', mov120(4096), r.sideId, 'new-side.MOV');
    const newRear = await sendFile(r.scope, 'rear', mov240(4096), r.rearId, 'new-rear.MOV');
    await finalizeSubmission(db, r.scope, { expectedVersion: (await subRow(r.submissionId)).version, idempotencyKey: key() }, E(100));
    await verifyAll(newSide, newRear);
    await db.intakeJob.updateMany({ where: { dedupeKey: { in: [`verify_asset:${newSide}`, `verify_asset:${newRear}`] } }, data: { status: 'done' } });
    return { ...r, newSide, newRear };
  }
  const ns = await stuckWithNewRevision();
  const ns2 = await stuckWithNewRevision();
  await fails(purge(ns.submissionId, E(189)), 'storage_unavailable', '지울 날 앞에서는 옛 파일만 다시 지운다');
  eq(await statusOf(ns.newSide), 'verified', '새 판 파일은 지울 날 앞에서 안 건드린다');
  const nsDue = E(190);
  eq(await enqueueDuePurges(db, nsDue, 1), 2, '재개 한도에 걸린 접수도 새 판의 지울 날에 일감이 생긴다');
  eq((await runPurges(nsDue)).retried, 2, '옛 파일이 남아 다시 돈다');
  for (const r of [ns, ns2]) eq([await statusOf(r.sideId), await statusOf(r.newSide), await statusOf(r.newRear)], ['purging', 'purged', 'purged'], '옛 파일이 멈춰도 새 파일은 지운다');
  ok((await jobsOf(ns.submissionId))[0].lastError?.includes('(remove_left_object)'), '일감에 지웠는데 남았다고 적는다');
  /* 지금 판은 지웠고 옛 파일 하나가 남았다 — 지운 날을 안 말하면 지운 판을 살아 있다고 말하게 된다 */
  const nsState = await loadPublicState(db, ns.scope, { now: nsDue });
  eq([nsState.originalDeletedDate, nsState.originalDeleting], [seoulDateKey(nsDue), 'older'], '옛 파일이 멈춰도 지금 판을 지운 날을 말한다');
  fail.leave.clear();
  await runPurges(new Date(nsDue.getTime() + HOUR));
  for (const r of [ns, ns2]) eq([await statusOf(r.sideId), await failedOf(r.submissionId)], ['purged', 0], '남은 파일을 마저 지운다');

  /* 기다림은 새 대상에만 걸린다 — 지우는 파일은 끝내고, 새 파일은 일감을 미뤄 다시 본다 */
  const hs = await stuckWithNewRevision();
  const hsRun = await mkRun(hs.submissionId, 'requested');
  fail.leave.clear();
  eq(await purge(hs.submissionId, E(190)), { outcome: 'held', reason: 'analysis' }, '지우던 파일을 끝낸 뒤에도 기다린다고 답해 일감이 다시 돈다');
  eq([await statusOf(hs.sideId), await statusOf(hs.newSide), await statusOf(hs.newRear)], ['purged', 'verified', 'verified'], '도는 실행의 입력은 표시하지 않는다');
  await db.intakeAnalysisRun.update({ where: { id: hsRun.id }, data: { status: 'failed', finishedAt: E(190) } });
  eq(await purge(hs.submissionId, E(191)), { outcome: 'purged', assets: 2, previewPaths: 2 }, '기다림이 끝나면 새 파일을 지운다');

  /* 일감으로 돌 때 — 지우던 파일을 끝내고 기다림으로 넘어가면 앞의 '지웠는데 남음' 글이 안 남는다. 파일은 이미 없고 고침 · 분석을 기다릴 뿐이다 */
  const he = await stuckWithNewRevision();
  const heRun = await mkRun(he.submissionId, 'requested');
  eq(await enqueueDuePurges(db, E(190)), 1, '멈춘 접수에 일감을 건다');
  eq((await runPurges(E(190))).retried, 1, '옛 파일이 남아 다시 돈다');
  ok((await jobsOf(he.submissionId))[0].lastError?.includes('(remove_left_object)'), '까닭이 일감에 남는다');
  fail.leave.clear();
  eq((await runPurges(E(191))).postponed, 1, '옛 파일을 끝내고 일감을 미룬다');
  eq(await statusOf(he.sideId), 'purged', '옛 파일은 끝났다');
  eq([(await jobsOf(he.submissionId))[0].status, (await jobsOf(he.submissionId))[0].lastError], ['queued', null], '미룬 일감에 지난 실패 글이 안 남는다');
  await db.intakeAnalysisRun.update({ where: { id: heRun.id }, data: { status: 'failed', finishedAt: E(190) } });
  await runPurges(E(192));

  /* 지적 12: 시도를 다 쓴 일감이 스캔 자리를 막지 않는다 */
  const qs = [await sent(E(0)), await sent(E(0, 1000)), await sent(E(0, 2000))];
  eq(await enqueueDuePurges(db, E(91), 2), 2, '한도만큼 일감이 생긴다');
  eq((await jobsOf(qs[2].submissionId)).length, 0, '뒤 접수는 아직이다');
  await db.intakeJob.updateMany({ where: { kind: 'purge_originals', status: 'queued' }, data: { status: 'failed', attempts: 8, finishedAt: E(91) } });
  eq(await enqueueDuePurges(db, E(91, HOUR), 2), 1, '멈춘 둘을 건너뛰어 뒤 접수를 찾는다');
  eq((await jobsOf(qs[2].submissionId)).length, 1, '뒤 접수에 일감이 생긴다');
  eq(await enqueueDuePurges(db, E(91, 7 * HOUR), 2), 2, '때가 되면 앞 접수도 다시 건다');
  await runPurges(E(91, 7 * HOUR));
  for (const q of qs) eq([await statusOf(q.sideId), await failedOf(q.submissionId)], ['purged', 0], '셋 다 끝난다');

  /* ── 임시 파일 정리 — 철회 유예 · 없어진 것 확인 · 겹침 ── */
  const assetRow = (id: string) => db.intakeAsset.findUniqueOrThrow({ where: { id } });
  const purgedAudits = (submissionId: string) => db.intakeAudit.findMany({ where: { submissionId, action: 'asset.purged' } });
  const leftOver = (e: unknown) => e instanceof IntakeError && e.code === 'storage_unavailable' && e.detail?.cause === 'remove_left_object';
  /** 낸 적 없는 초안에 파일을 고쳐 올려, 옛 파일 하나를 'replaced' 로 만든다 */
  async function draftWithReplaced() {
    const r = await ready();
    const swapped = await sendFile(r.scope, 'side', mov240(4096), r.sideId, 'swap.MOV');
    eq(await statusOf(r.sideId), 'replaced', '바뀐 파일이 생긴다');
    return { ...r, swapped, oldPath: await pathOf(r.sideId) };
  }

  /* 지적 6(3): 버린 지 오래된 파일이어도 철회한 접수는 철회한 날부터 7일을 지킨다 */
  const rw = await draftWithReplaced();
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: rw.submissionId }, D(300));
  await db.intakeAsset.update({ where: { id: rw.sideId }, data: { updatedAt: D(100) } });
  await sweep(D(302));
  eq([await statusOf(rw.sideId), objects.has(rw.oldPath)], ['replaced', true], '철회 2일째에는 버린 파일도 남는다');
  await sweep(D(307, -1));
  eq(await statusOf(rw.sideId), 'replaced', '유예 끝 1ms 앞까지 남는다');
  await sweep(D(307));
  eq([await statusOf(rw.sideId), objects.has(rw.oldPath)], ['purged', false], '철회 7일째에 지운다');

  /* 지적 7: 지웠다는 답뿐이고 객체가 남은 파일은 지운 것으로 안 적는다. 다른 파일은 지운다 */
  const lf = await ready();
  const [lfSide, lfRear] = [await pathOf(lf.sideId), await pathOf(lf.rearId)];
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: lf.submissionId }, D(400));
  fail.leave.add(lfSide);
  await assert.rejects(sweep(D(407)), leftOver, '남은 파일이 있으면 던진다');
  passed++;
  const lfRow = await assetRow(lf.sideId);
  eq([lfRow.status, lfRow.purgedAt, objects.has(lfSide)], ['abandoned', null, true], '남은 파일은 지운 것으로 안 적는다');
  eq([await statusOf(lf.rearId), objects.has(lfRear)], ['purged', false], '다른 파일은 끝까지 지운다');
  eq((await purgedAudits(lf.submissionId)).length, 1, '지운 파일만 기록한다');
  await assert.rejects(sweep(D(408)), leftOver, '하루 뒤에도 조용히 넘어가지 않는다');
  passed++;
  fail.leave.clear();
  eq((await sweep(D(408))).purged, 1, '없어지면 마저 끝낸다');
  eq([await statusOf(lf.sideId), objects.has(lfSide), (await purgedAudits(lf.submissionId)).length], ['purged', false, 2], '기록은 파일마다 한 줄이다');

  /* 철회 안 한 접수 — 여유 조건이 updatedAt 이라, 밀면 다음 시도에 안 보이고 일감이 성공으로 끝난다 */
  const nw = await draftWithReplaced();
  const nwStale = D(500);
  await db.intakeAsset.update({ where: { id: nw.sideId }, data: { updatedAt: nwStale } });
  fail.leave.add(nw.oldPath);
  await assert.rejects(sweep(D(502)), leftOver, '철회 안 한 접수의 파일도 남으면 던진다');
  passed++;
  const nwRow = await assetRow(nw.sideId);
  eq([nwRow.status, nwRow.updatedAt, objects.has(nw.oldPath), (await purgedAudits(nw.submissionId)).length], ['replaced', nwStale, true, 0], '여유 시각을 안 밀고 기록도 안 남긴다');
  await assert.rejects(sweep(new Date(D(502).getTime() + 30_000)), leftOver, '30초 뒤 재시도에도 그대로 보인다');
  passed++;
  fail.leave.clear();
  eq((await sweep(D(503))).purged, 1, '풀리면 끝낸다');
  eq([await statusOf(nw.sideId), objects.has(nw.oldPath), await statusOf(nw.swapped)], ['purged', false, 'uploaded'], '칸의 파일은 안 건드린다');

  /* 일감으로 돌 때 — 처리기는 실제 시각을 쓴다. 남은 파일이 있는 동안 일감은 성공으로 안 끝나고 까닭이 남는다 */
  const nj = await draftWithReplaced();
  await db.intakeAsset.update({ where: { id: nj.sideId }, data: { updatedAt: new Date(Date.now() - 3 * DAY) } });
  fail.leave.add(nj.oldPath);
  const cleanJob = `cleanup_uploads:test:${key()}`;
  await enqueueJob(db, { kind: 'cleanup_uploads', dedupeKey: cleanJob, payload: {}, runAfter: new Date(Date.now() - 1000), maxAttempts: 3 });
  const runClean = (t: Date) => runDueJobs(db, intakeCoreJobHandlers(db, storage), { owner: 'clean', kinds: ['cleanup_uploads'], now: () => t });
  eq((await runClean(new Date())).retried, 1, '일감이 실패로 다시 돈다');
  const cleanRow = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: cleanJob } });
  eq(cleanRow.status, 'queued', '성공으로 안 끝난다');
  ok(cleanRow.lastError?.includes('(remove_left_object)'), '지웠는데 남았다는 까닭이 일감에 남는다');
  fail.leave.clear();
  eq((await runClean(new Date(Date.now() + 2 * 60_000))).done, 1, '풀리면 일감이 끝난다');
  const cleanDone = await db.intakeJob.findUniqueOrThrow({ where: { dedupeKey: cleanJob } });
  eq([cleanDone.status, cleanDone.lastError, await statusOf(nj.sideId)], ['done', null, 'purged'], '까닭이 지워지고 파일도 지운다');

  /* 연결이 실패하면 지워졌는지 모른다 — 바로 던지고 다음 파일로 안 간다. 다시 돌면 끝난다 */
  const c1 = await draftWithReplaced();
  const c2 = await draftWithReplaced();
  await db.intakeAsset.updateMany({ where: { id: { in: [c1.sideId, c2.sideId] } }, data: { updatedAt: D(600) } });
  const calls2 = removed.length;
  fail.remove = 1;
  await assert.rejects(sweep(D(602)), (e: unknown) => e instanceof IntakeError && e.detail?.cause === 'remove');
  passed++;
  eq(removed.length, calls2 + 1, '다음 파일로 안 간다');
  eq([await statusOf(c1.sideId), await statusOf(c2.sideId)], ['replaced', 'replaced'], '아무것도 안 적는다');
  storage.stat = async () => {
    throw new IntakeError('storage_unavailable', { cause: 'sign_read' });
  };
  await assert.rejects(sweep(D(602)), (e: unknown) => e instanceof IntakeError && e.detail?.cause === 'sign_read');
  passed++;
  storage.stat = realStat;
  eq([await statusOf(c1.sideId), await statusOf(c2.sideId), (await purgedAudits(c1.submissionId)).length], ['replaced', 'replaced', 0], '없어졌는지 못 보면 안 적는다');
  /* 오래된 파일부터 지운다 — 한도가 차도 가장 오래 남은 바이트가 먼저 빠진다 */
  await db.intakeAsset.update({ where: { id: c2.sideId }, data: { updatedAt: D(599) } });
  eq((await cleanupStaleUploads(db, storage, D(602), 1)).purged, 1, '한도만큼 지운다');
  eq([await statusOf(c2.sideId), await statusOf(c1.sideId)], ['purged', 'replaced'], '오래된 파일이 먼저다');
  eq((await sweep(D(602))).purged, 1, '다음 번에 마저 지운다');

  /* 줄을 읽은 뒤 철회가 끼어들면, 아직 안 지운 파일은 철회한 날부터 7일을 지킨다 */
  const wr = await ready();
  await sendFile(wr.scope, 'side', mov240(4096), wr.sideId, 'wr-side.MOV');
  await sendFile(wr.scope, 'rear', mov120(4096), wr.rearId, 'wr-rear.MOV');
  const wrOld = [wr.sideId, wr.rearId];
  await db.intakeAsset.updateMany({ where: { id: { in: wrOld } }, data: { updatedAt: D(100) } });
  const wrStatus = async () => (await Promise.all(wrOld.map(statusOf))).sort();
  inRemoveGap(async () => {
    await withdrawRequiredConsent(db, { adminId: 'a', submissionId: wr.submissionId }, D(702));
  });
  await sweep(D(702));
  eq(await wrStatus(), ['purged', 'replaced'], '철회 앞에 정한 파일만 지우고 나머지는 남긴다');
  await sweep(D(709, -1));
  eq(await wrStatus(), ['purged', 'replaced'], '유예 끝 1ms 앞까지 남는다');
  await sweep(D(709));
  eq(await wrStatus(), ['purged', 'purged'], '철회 7일째에 지운다');

  /* 안 지워지는 파일이 한도를 채워도 뒤 파일은 지운다 — 남은 파일의 시각을 안 밀어서 늘 줄 맨 앞에 있다 */
  const hl = [await draftWithReplaced(), await draftWithReplaced(), await draftWithReplaced()];
  for (const [i, r] of hl.entries()) await db.intakeAsset.update({ where: { id: r.sideId }, data: { updatedAt: D(800, i * 1000) } });
  fail.leave.add(hl[0].oldPath).add(hl[1].oldPath);
  await assert.rejects(cleanupStaleUploads(db, storage, D(802), 2), leftOver, '남은 파일이 있으면 던진다');
  passed++;
  eq([await statusOf(hl[0].sideId), await statusOf(hl[1].sideId), await statusOf(hl[2].sideId)], ['replaced', 'replaced', 'purged'], '한도를 넘어 뒤 파일까지 닿는다');
  ok(!objects.has(hl[2].oldPath), '뒤 파일의 바이트가 없다');
  fail.leave.clear();
  eq((await sweep(D(802))).purged, 2, '풀리면 앞 파일도 끝낸다');

  /* 한 번에 훑는 줄에는 끝이 있다 — 안 지워지는 파일이 아주 많아도 함수 시간 안에 끝나게 */
  const cap = [await draftWithReplaced(), await draftWithReplaced(), await draftWithReplaced()];
  for (const r of cap) fail.leave.add(r.oldPath);
  for (const [i, r] of cap.entries()) await db.intakeAsset.update({ where: { id: r.sideId }, data: { updatedAt: D(810, i * 1000) } });
  const capCalls = removed.length;
  await assert.rejects(cleanupStaleUploads(db, storage, D(812), 1, 2), leftOver, '끝까지 못 가도 던진다');
  passed++;
  eq(removed.length - capCalls, 2, '훑는 줄 상한에서 멈춘다');
  fail.leave.clear();
  eq((await sweep(D(812))).purged, 3, '다음 번에 마저 지운다');

  /* 지적 11: 겹쳐 돌아도 파일마다 기록 한 줄, 지운 수도 파일 수다 */
  await sweep(D(707));
  const ov = await ready();
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: ov.submissionId }, D(700));
  const overlap = await Promise.all([sweep(D(707)), sweep(D(707))]);
  eq(overlap[0].purged + overlap[1].purged, 2, '겹쳐도 지운 수가 안 부푼다');
  eq((await purgedAudits(ov.submissionId)).length, 2, '겹쳐도 기록은 파일마다 한 줄이다');
  eq([await statusOf(ov.sideId), await statusOf(ov.rearId)], ['purged', 'purged'], '둘 다 지운다');

  /*
   * 줄을 읽은 뒤에 사정이 바뀌면 안 버린다 — 정리가 줄을 읽고 잠그기 전의 틈에 관리자가 기간을 늘리거나 철회가 들어온다.
   * 버린 파일은 칸에서 내려가 26시간 뒤 지워진다. 화면은 '아직 보내지 않았어요'로 돌아가 받는 사람이 다시 보내야 한다.
   */
  const afterScan = (work: () => Promise<unknown>) => {
    let done = false;
    return new Proxy(db, {
      get(target, prop) {
        const v = (target as unknown as Record<string | symbol, unknown>)[prop];
        if (prop !== '$transaction') return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
        return async (...args: unknown[]) => {
          if (!done) {
            done = true;
            await work();
          }
          return (v as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as typeof db;
  };
  const closeWindow = (invitationId: string, t: Date) => db.intakeInvitation.update({ where: { id: invitationId }, data: { uploadExpiresAt: t } });
  const slotsOf = async (id: string) => {
    const s = await subRow(id);
    return [s.sideAssetId, s.rearAssetId, s.samePitchConfirmed, s.version];
  };
  /* 빈 시험이 아니다 — 끼어들지 않으면 같은 조건의 파일을 버린다 */
  const plain = await ready();
  await closeWindow(plain.invitationId, D(900));
  eq((await sweep(D(901, 26 * HOUR + 1))).abandoned, 2, '기간이 끝나고 여유가 지나면 버린다');
  eq([await statusOf(plain.sideId), await statusOf(plain.rearId)], ['abandoned', 'abandoned'], '끼어들지 않으면 그대로다');

  /* 도착한 파일 — 기간을 늘렸으면 받는 사람이 낼 수 있어 그대로 둔다 */
  const ex = await ready();
  await closeWindow(ex.invitationId, D(902));
  const exSlots = await slotsOf(ex.submissionId);
  const exAt = D(904);
  const exDone = await cleanupStaleUploads(afterScan(() => extendUploadWindow(db, { adminId: 'a', submissionId: ex.submissionId, until: D(950) }, exAt)), storage, exAt, 5000);
  eq(exDone.abandoned, 0, '기간을 늘렸으면 안 버린다');
  eq([await statusOf(ex.sideId), await statusOf(ex.rearId)], ['uploaded', 'uploaded'], '도착한 파일이 그대로다');
  eq(await slotsOf(ex.submissionId), exSlots, '칸 · 같은 투구 확인 · 판 번호도 그대로다');
  eq((await loadPublicState(db, ex.scope, { now: exAt })).assets.side?.id, ex.sideId, '화면이 고른 파일을 그대로 보인다');

  /* 전송 중인 파일 — 고침 중인 접수에서 같은 틈을 본다 */
  const tr = await sent();
  await requestCorrection(db, { adminId: 'a', submissionId: tr.submissionId, views: ['side'] }, D(905));
  const trBytes = mov240(4096);
  const trNew = await reserveAsset(db, tr.scope, { view: 'side', expectedAssetId: tr.sideId, fileName: 'n', sizeBytes: trBytes.length, sha256: sha(trBytes) }, D(905));
  await issueUploadToken(db, storage, tr.scope, { assetId: trNew.asset.id }, D(905));
  await db.intakeAsset.update({ where: { id: trNew.asset.id }, data: { updatedAt: D(905) } });
  await closeWindow(tr.invitationId, D(906));
  const trSlots = await slotsOf(tr.submissionId);
  const trAt = D(908);
  eq((await cleanupStaleUploads(afterScan(() => extendUploadWindow(db, { adminId: 'a', submissionId: tr.submissionId, until: D(950) }, trAt)), storage, trAt, 5000)).abandoned, 0, '전송 중인 파일도 안 버린다');
  eq(await statusOf(trNew.asset.id), 'uploading', '전송을 이어 갈 수 있다');
  eq(await slotsOf(tr.submissionId), trSlots, '칸도 그대로다');

  /* 기간을 늘려 토큰을 다시 받은 직후 폐기됐다 — 업로드 주소가 살아 있는 동안은 전송 여유를 지킨다 */
  await closeWindow(tr.invitationId, D(909));
  const tr2At = D(910);
  const reissueThenRevoke = async () => {
    await extendUploadWindow(db, { adminId: 'a', submissionId: tr.submissionId, until: D(950) }, tr2At);
    await issueUploadToken(db, storage, tr.scope, { assetId: trNew.asset.id }, tr2At);
    await db.intakeInvitation.update({ where: { id: tr.invitationId }, data: { status: 'revoked', revokedAt: tr2At } });
  };
  eq((await cleanupStaleUploads(afterScan(reissueThenRevoke), storage, tr2At, 5000)).abandoned, 0, '토큰을 막 받은 파일은 폐기돼도 바로 안 버린다');
  eq(await statusOf(trNew.asset.id), 'uploading', '전송 여유 안이다');

  /* 도착한 파일도 같다 — 기간을 늘린 뒤 폐기됐으면 폐기한 때부터 여유를 센다 */
  const rv = await ready();
  await closeWindow(rv.invitationId, D(902));
  const rvAt = D(904);
  const extendThenRevoke = async () => {
    await extendUploadWindow(db, { adminId: 'a', submissionId: rv.submissionId, until: D(950) }, rvAt);
    await db.intakeInvitation.update({ where: { id: rv.invitationId }, data: { status: 'revoked', revokedAt: rvAt } });
  };
  eq((await cleanupStaleUploads(afterScan(extendThenRevoke), storage, rvAt, 5000)).abandoned, 0, '폐기 뒤 여유 안에서는 안 버린다');
  eq(await statusOf(rv.sideId), 'uploaded', '폐기 직후에는 그대로다');
  ok((await sweep(new Date(rvAt.getTime() + 26 * HOUR + 1))).abandoned >= 2, '폐기 뒤 여유가 지나면 버린다');
  eq([await statusOf(rv.sideId), await statusOf(rv.rearId)], ['abandoned', 'abandoned'], '두 파일 다 내려간다');

  /* 철회가 끼어들었으면 철회한 날부터 7일을 지킨다 — 기간이 끝나 버릴 뻔한 파일이어도 그렇다 */
  const late = await ready();
  await closeWindow(late.invitationId, D(910));
  const lateAt = D(912);
  eq((await cleanupStaleUploads(afterScan(() => withdrawRequiredConsent(db, { adminId: 'a', submissionId: late.submissionId }, lateAt)), storage, lateAt, 5000)).abandoned, 0, '철회가 끼어들면 안 버린다');
  eq([await statusOf(late.sideId), await statusOf(late.rearId)], ['uploaded', 'uploaded'], '7일 유예 안에서는 그대로다');
  await sweep(D(919, -1));
  eq([await statusOf(late.sideId), await statusOf(late.rearId)], ['uploaded', 'uploaded'], '유예 끝 1ms 앞까지 남는다');
  await sweep(D(919));
  eq([await statusOf(late.sideId), await statusOf(late.rearId)], ['purged', 'purged'], '7일이 되면 버리고 지운다');

  /*
   * 지운 파일은 없는 것으로 친다 — 바이트를 믿을 수 없으니 같은 파일 판정 · 합계 한도 · 자산 개수 어디에도 안 잡는다. 'purging' 과 'purged' 둘 다다.
   * 얼린 원본이 지워진 접수만 있는 일이라, 고침이 열린 접수로 본다.
   */
  const inCorrection = async () => {
    const r = await sent();
    await requestCorrection(db, { adminId: 'a', submissionId: r.submissionId, views: ['side', 'rear'] }, D(85));
    return r;
  };
  for (const gone of ['purging', 'purged'] as const) {
    /* 다른 칸의 파일과 같은 해시 */
    const sf = await inCorrection();
    const sameAs = (await db.intakeAsset.findUniqueOrThrow({ where: { id: sf.rearId } })).clientSha256;
    const pickSame = () => reserveAsset(db, sf.scope, { view: 'side', expectedAssetId: sf.sideId, fileName: 'n', sizeBytes: sf.rear.length, sha256: sameAs }, NOW);
    await fails(pickSame(), 'same_file', '살아 있는 다른 칸과 같은 파일은 막는다');
    await db.intakeAsset.update({ where: { id: sf.rearId }, data: { status: gone } });
    eq((await pickSame()).created, true, `다른 칸이 ${gone} 이면 그 파일을 다시 고를 수 있다`);

    /* 합계 한도 */
    const tl = await inCorrection();
    await db.intakeAsset.update({ where: { id: tl.rearId }, data: { declaredSize: BigInt(DEFAULT_MAX_TOTAL_BYTES) } });
    const tlBytes = mov240(4096);
    const pickSized = () => reserveAsset(db, tl.scope, { view: 'side', expectedAssetId: tl.sideId, fileName: 'n', sizeBytes: tlBytes.length, sha256: sha(tlBytes) }, NOW);
    await fails(pickSized(), 'total_too_large', '살아 있는 다른 칸은 합계에 든다');
    await db.intakeAsset.update({ where: { id: tl.rearId }, data: { status: gone } });
    eq((await pickSized()).created, true, `다른 칸이 ${gone} 이면 합계에서 빠진다`);
  }
  /* 자산 개수 — 지운 파일 둘이 있어도 살아 있는 자산을 한도까지 받는다. 둘 가운데 어느 쪽이 세이면 12개째에서 막힌다 */
  const ct = await inCorrection();
  await db.intakeAsset.update({ where: { id: ct.sideId }, data: { status: 'purging' } });
  await db.intakeAsset.update({ where: { id: ct.rearId }, data: { status: 'purged' } });
  let ctPrev = ct.sideId;
  const pickNext = () => {
    const b = mov240();
    return reserveAsset(db, ct.scope, { view: 'side', expectedAssetId: ctPrev, fileName: 'n', sizeBytes: b.length, sha256: sha(b) }, NOW);
  };
  for (let n = 0; n < 12; n++) ctPrev = (await pickNext()).asset.id;
  eq(await db.intakeAsset.count({ where: { submissionId: ct.submissionId } }), 14, '지운 파일 둘 말고 열두 개를 받는다');
  await fails(pickNext(), 'too_many_assets', '살아 있는 자산이 한도에 닿으면 막는다');

  /* 정리 일감의 실패 줄은 칸마다 쌓이니 끝난 줄처럼 30일 뒤 지운다. 다른 일감의 실패 줄은 상세에 보여야 해서 남긴다 */
  const pruneAt = at(5 * DAY);
  const failedJob = async (kind: 'cleanup_uploads' | 'purge_originals', dedupeKey: string, daysAgo: number) => {
    await enqueueJob(db, { kind, dedupeKey, payload: { submissionId: 'none' }, runAfter: pruneAt });
    await db.intakeJob.update({ where: { dedupeKey }, data: { status: 'failed', attempts: 3, lastError: '저장소 실패', finishedAt: new Date(pruneAt.getTime() - daysAgo * DAY) } });
  };
  await failedJob('cleanup_uploads', 'prune:old', 31);
  await failedJob('cleanup_uploads', 'prune:new', 29);
  await failedJob('purge_originals', 'prune:purge', 31);
  await cron(pruneAt);
  eq((await db.intakeJob.findMany({ where: { dedupeKey: { startsWith: 'prune:' } }, orderBy: { dedupeKey: 'asc' } })).map((j) => j.dedupeKey), ['prune:new', 'prune:purge'], '30일 지난 정리 실패 줄만 지운다');
  await db.intakeJob.deleteMany({ where: { dedupeKey: { startsWith: 'prune:' } } });

  /* 지적 9: 파일 없이 철회한 초안 — 받는 사람에게도 날짜를 안 말한다. 지울 일이 없는 것도 그대로다 */
  const nf = await invite();
  await named(nf.scope);
  await recordConsents(db, nf.scope, { answers: REQUIRED }, NOW);
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: nf.submissionId }, NOW);
  const nfState = await loadPublicState(db, nf.scope, { now: at(30 * DAY) });
  eq([nfState.originalDeleteDate, nfState.originalDeletedDate], [null, null], '파일이 없으면 지울 날도 지운 날도 없다');
  eq(await purge(nf.submissionId, at(30 * DAY)), { outcome: 'nothing' }, '삭제 판단은 그대로다');
  const wf2 = await ready();
  await withdrawRequiredConsent(db, { adminId: 'a', submissionId: wf2.submissionId }, NOW);
  eq((await loadPublicState(db, wf2.scope, { now: NOW })).originalDeleteDate, seoulDateKey(at(7 * DAY)), '파일이 있으면 유예 끝날을 말한다');

  /* 불변식 — 낸 접수의 판 밖 파일은 모두 정리 대상이어야 한다. 보유 삭제는 판 밖 파일을 안 보고, 정리는 그 둘과 끝내지 않은 접수만 보니 다른 상태면 영영 남는다 */
  const outside = await db.$queryRaw<{ id: string; status: string }[]>`
    SELECT a."id", a."status" FROM "IntakeAsset" a
    JOIN "IntakeSubmission" s ON s."id" = a."submissionId"
    WHERE s."status" IN ('submitted', 'verified', 'needs_attention')
      AND NOT EXISTS (SELECT 1 FROM "IntakeRevision" r WHERE r."sideAssetId" = a."id" OR r."rearAssetId" = a."id")`;
  ok(outside.length > 0, '고쳐 낸 접수가 판 밖 파일을 남겼다 — 빈 시험이 아니다');
  eq(outside.filter((a) => !['replaced', 'abandoned', 'purged'].includes(a.status)), [], '낸 접수에 판 밖의 도착 · 전송 자산이 없다');
}

/* 파일 탓의 쓰기 거절 — 진짜 Postgres 오류 모양으로 본다. 이 뒤에는 DB 를 안 쓴다 */
{
  const row = await db.intakeAsset.findFirstOrThrow();
  const real = await db.intakeAsset.updateMany({ where: { id: row.id }, data: { mediaFacts: { x: 'a\u0000b' } } }).then(() => null, (e: unknown) => e);
  ok(isContentWriteError(real), 'NUL 쓰기 거절은 파일 탓이다');
}

await db.$disconnect();
await socket.stop();
await pg.close();
console.log(`intake db selftest: ${passed} 통과`);
