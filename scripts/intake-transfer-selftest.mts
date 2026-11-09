/**
 * 원본을 바이트 그대로 이어 올리는지 증명하는 시험. `npm run intake:transfer-test`
 *
 * 로컬에 가짜 Supabase Storage 를 띄운다 — 공식 문서 · 서버 소스로 확인한 TUS 약속을 그대로 흉내 낸다(docs/designs/external-intake.md 표):
 *   POST /storage/v1/upload/resumable/sign · x-signature 를 모든 요청에서 검사 · 토큰은 경로에만 묶임 · 마지막 빼고 조각은 6MB 정확히 ·
 *   같은 경로에 끝난 객체가 있으면 거절(덮어쓰기 없음) · 업로드 주소 만료는 404.
 * 그 위로 앱의 진짜 코드 lib/intake/upload-client.ts 와 storage-core.ts 를 돌린다.
 *
 * 말할 수 없는 것: 이 시험은 진짜 Supabase 가 아니다. 호스팅 서버의 토큰 수명 · apikey 요구 · 응답 글자는 실제 버킷을 만든 뒤에 한 번 봐야 한다.
 */
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { appendFileSync, createReadStream, mkdtempSync, openAsBlob, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  GONE_VIEW_TEXT,
  REPICK_VIEW_TEXT,
  SAME_AS_SENT_TEXT,
  correctionConsentDocs,
  correctionProblem,
  correctionStopViews,
  firstProblemTarget,
  goneViewsToPick,
  pickViewText,
  reviewProblems,
  sentAssetOf,
  slotNeedsRepick,
  staleRequiredDocs,
  type ReviewForm,
} from '@/components/intake/review-rules';
import { INTAKE_CONSENT_DOCS, PROXY_CONSENT_NOTE, agreedAfterDocs, changedConsentKinds, consentCheckLabel, consentDocOf, isProxyRelation } from '@/lib/intake/consent';
import { INTAKE_ERROR_TEXT, IntakeError } from '@/lib/intake/errors';
import { TUS_CHUNK_BYTES, TUS_URL_TTL_MS } from '@/lib/intake/limits';
import { readIntakeMediaFacts, fpsLabel } from '@/lib/intake/media';
import { IntakeRequestError, type IntakeReceipt, type PublicIntakeState, type PublicStateResponse } from '@/lib/intake/public-client';
import { INTAKE_BUCKET } from '@/lib/intake/paths';
import { removeAndFindLeft } from '@/lib/intake/remove';
import { receiptHead, receiptRetentionRows } from '@/lib/intake/state';
import { createIntakeStorage } from '@/lib/intake/storage-core';
import {
  HASH_SLICE_BYTES,
  IntakeUploadError,
  hashFileSha256,
  matchesRecovery,
  readRecovery,
  recoveryKey,
  startIntakeUpload,
  type RecoveryStore,
  type UploadGrantView,
} from '@/lib/intake/upload-client';
import { RunStop, finishRun, refreshQuietly, stateAfterReceipt } from '@/lib/intake/upload-run';
import { mov240 } from './intake-fixtures.mts';

let passed = 0;
const ok = (cond: unknown, label: string) => {
  assert.ok(cond, label);
  if (process.env.V) console.log('ok', label);
  passed++;
};

const dir = mkdtempSync(path.join(tmpdir(), 'intake-transfer-'));
const SECRET = randomBytes(16);
const SERVICE_KEY = 'test-service-role-key';
const PUBLISHABLE = 'test-publishable-key';

/* ────────────────────────── 가짜 저장소 ────────────────────────── */

type Tus = { id: string; object: string; length: number; offset: number; file: string };

const server = {
  uploads: new Map<string, Tus>(),
  objects: new Map<string, string>(),
  tokenTtlSec: 7200,
  /** 이 번호 앞에 낸 토큰은 끝난 것으로 본다 */
  tokenSerial: 0,
  minTokenSerial: 0,
  /** 다음 PATCH 를 이만큼 받고 끊는다 */
  cutPatchAfter: null as number | null,
  /** 다음 마지막 PATCH 는 저장한 뒤 응답 없이 끊는다 */
  dropFinalResponse: false,
  /** 객체가 끝나면 업로드 줄을 지운다 — 끝난 뒤 HEAD 는 404 */
  forgetFinished: false,
  /** 다음 HEAD 들이 이 상태로 답한다 — 잠깐 넘어진 저장소를 흉내 낸다 */
  headFail: [] as number[],
  /** 다음 서명 읽기 GET 들이 이 답을 한다 — body 가 글자면 그대로 보낸다 */
  readAnswer: null as { status: number; body: unknown } | null,
  /** 서명 주소를 만드는 POST 가 이 답을 한다 — body 가 글자면 그대로 보낸다 */
  signAnswer: null as { status: number; body: unknown } | null,
  /** 지웠다고 답하고 객체는 그대로 둔다 */
  removeNoop: false,
  log: { posts: 0, heads: 0, patchSizes: [] as number[], patchBytes: 0, firstPatchOffset: [] as number[], badAuth: 0, signedUploads: 0 },
};

function sign(url: string, ttlSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const b = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const head = `${b({ alg: 'HS256' })}.${b({ url, upsert: false, n: ++server.tokenSerial, exp: now + ttlSec, scope: 'upload' })}`;
  return `${head}.${createHmac('sha256', SECRET).update(head).digest('base64url')}`;
}

/** verifyObjectSignature 와 같은 차례: 서명 → 경로 일치 → 만료 */
function verify(token: unknown, objectName: string): string | null {
  if (typeof token !== 'string') return 'Missing x-signature header';
  const [h, p, s] = token.split('.');
  if (!s || createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return 'invalid signature';
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as { url: string; exp: number; n: number };
  if (payload.url !== `${INTAKE_BUCKET}/${objectName}`) return 'invalid signature';
  if (payload.exp * 1000 < Date.now() || payload.n < server.minTokenSerial) return 'jwt expired signature';
  return null;
}

const send = (res: ServerResponse, status: number, body: unknown = null, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'Tus-Resumable': '1.0.0', 'Content-Type': 'application/json', ...headers });
  res.end(body == null ? undefined : JSON.stringify(body));
};

const bodyOf = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => resolve(s));
  });

function metadata(header: string | string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header ?? '').split(',')) {
    const [k, v] = part.trim().split(' ');
    if (k) out[k] = Buffer.from(v ?? '', 'base64').toString('utf8');
  }
  return out;
}

async function tusRoute(req: IncomingMessage, res: ServerResponse, id: string | null) {
  /* 서명 업로드는 service role 키를 받을 일이 없다 */
  if (req.headers.authorization || req.headers.apikey !== PUBLISHABLE) server.log.badAuth++;

  if (req.method === 'POST') {
    server.log.posts++;
    const m = metadata(req.headers['upload-metadata']);
    if (m.bucketName !== INTAKE_BUCKET || !m.objectName || !m.contentType) return send(res, 400, { message: 'Metadata required' });
    const why = verify(req.headers['x-signature'], m.objectName);
    if (why) return send(res, 400, { message: why });
    if (server.objects.has(m.objectName)) return send(res, 409, { message: 'Asset Already Exists' });
    const uid = Buffer.from(`${INTAKE_BUCKET}/${m.objectName}/${randomBytes(6).toString('hex')}`).toString('base64url');
    const file = path.join(dir, `tus-${uid.slice(-12)}`);
    writeFileSync(file, '');
    server.uploads.set(uid, { id: uid, object: m.objectName, length: Number(req.headers['upload-length']), offset: 0, file });
    return send(res, 201, null, { Location: `http://127.0.0.1:${port}/storage/v1/upload/resumable/sign/${uid}` });
  }

  const up = id ? server.uploads.get(id) : null;
  if (req.method === 'HEAD' && server.headFail.length) {
    server.log.heads++;
    return send(res, server.headFail.shift()!);
  }
  if (!up) return send(res, 404, { message: 'Upload not found' });
  const why = verify(req.headers['x-signature'], up.object);
  if (why) return send(res, 400, { message: why });

  if (req.method === 'HEAD') {
    server.log.heads++;
    return send(res, 200, null, { 'Upload-Offset': String(up.offset), 'Upload-Length': String(up.length), 'Cache-Control': 'no-store' });
  }

  if (req.method === 'PATCH') {
    if (Number(req.headers['upload-offset']) !== up.offset) return send(res, 409, { message: 'offset conflict' });
    const final = up.offset + Number(req.headers['content-length']) >= up.length;
    const cut = server.cutPatchAfter;
    const chunks: Buffer[] = [];
    let got = 0;
    await new Promise<void>((resolve) => {
      req.on('data', (c: Buffer) => {
        chunks.push(c);
        got += c.length;
        if (cut != null && got >= cut) {
          server.cutPatchAfter = null;
          req.socket.destroy();
          resolve();
        }
      });
      req.on('end', () => resolve());
      req.on('close', () => resolve());
    });
    /* 끊긴 조각은 버린다 — 저장소에 일부만 남는 일이 없다고 믿지 않고, 가장 나쁜 쪽(조각째 다시)으로 시험한다 */
    if (req.socket.destroyed && !req.complete) return;
    const data = Buffer.concat(chunks);
    server.log.patchSizes.push(data.length);
    server.log.patchBytes += data.length;
    if (!final && data.length !== TUS_CHUNK_BYTES) return send(res, 400, { message: 'chunk must be 6MB' });
    appendFileSync(up.file, data);
    up.offset += data.length;
    if (up.offset === up.length) {
      if (server.objects.has(up.object)) return send(res, 409, { message: 'Asset Already Exists' });
      server.objects.set(up.object, up.file);
      if (server.forgetFinished) server.uploads.delete(up.id);
      if (server.dropFinalResponse) {
        server.dropFinalResponse = false;
        req.socket.destroy();
        return;
      }
    }
    return send(res, 204, null, { 'Upload-Offset': String(up.offset) });
  }
  send(res, 405);
}

async function restRoute(req: IncomingMessage, res: ServerResponse, url: URL) {
  const signUpload = /^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (signUpload && req.method === 'POST') {
    await bodyOf(req);
    if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return send(res, 401, { message: 'unauthorized' });
    const name = decodeURIComponent(signUpload[2]);
    if (server.objects.has(name)) return send(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    server.log.signedUploads++;
    const token = sign(`${signUpload[1]}/${name}`, server.tokenTtlSec);
    return send(res, 200, { url: `/object/upload/sign/${signUpload[1]}/${name}?token=${token}`, token });
  }
  const signRead = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (signRead && req.method === 'POST') {
    await bodyOf(req);
    if (server.signAnswer) {
      const { status, body } = server.signAnswer;
      if (typeof body === 'string') {
        res.writeHead(status, { 'Content-Type': 'text/html' });
        return void res.end(body);
      }
      return send(res, status, body);
    }
    const name = decodeURIComponent(signRead[2]);
    if (!server.objects.has(name)) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    return send(res, 200, { signedURL: `/object/sign/${signRead[1]}/${name}?token=read-${randomBytes(4).toString('hex')}` });
  }
  if (signRead && req.method === 'GET') {
    if (server.readAnswer) {
      const { status, body } = server.readAnswer;
      if (typeof body === 'string') {
        res.writeHead(status, { 'Content-Type': 'text/html' });
        return void res.end(body);
      }
      return send(res, status, body);
    }
    const file = server.objects.get(decodeURIComponent(signRead[2]));
    /* 호스팅 서버와 같이 없는 객체는 400 + 몸통 statusCode '404' 다(서명 단계와 같은 답) */
    if (!file) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    const size = statSync(file).size;
    const range = /^bytes=(\d+)-(\d+)?$/.exec(req.headers.range ?? '');
    const download = url.searchParams.get('download');
    const common: Record<string, string> = { 'Content-Type': 'video/quicktime', 'x-download-name': encodeURIComponent(download ?? '') };
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(size - 1, Number(range[2] ?? size - 1));
      res.writeHead(206, { ...common, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) });
      return void createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...common, 'Content-Length': String(size) });
    return void createReadStream(file).pipe(res);
  }
  const removeRoute = /^\/storage\/v1\/object\/([^/]+)$/.exec(url.pathname);
  if (removeRoute && req.method === 'DELETE') {
    const { prefixes } = JSON.parse(await bodyOf(req)) as { prefixes: string[] };
    if (!server.removeNoop) for (const name of prefixes) server.objects.delete(name);
    return send(res, 200, prefixes.map((name) => ({ name })));
  }
  send(res, 404, { message: 'no route' });
}

const http = createServer((req, res) => {
  const url = new URL(req.url!, 'http://127.0.0.1');
  const tus = /^\/storage\/v1\/upload\/resumable\/sign(?:\/([^/]+))?$/.exec(url.pathname);
  (tus ? tusRoute(req, res, tus[1] ?? null) : restRoute(req, res, url)).catch((e) => {
    console.error(e);
    if (!res.headersSent) send(res, 500, { message: 'fake server error' });
  });
});
await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
const port = (http.address() as { port: number }).port;

/* ────────────────────────── 재료 ────────────────────────── */

const storage = createIntakeStorage({ url: `http://127.0.0.1:${port}`, serviceKey: SERVICE_KEY, publishableKey: PUBLISHABLE });

/* 여러 조각 + 나누어떨어지지 않는 크기 */
const sourcePath = path.join(dir, 'source.mov');
const SOURCE = mov240(4 * TUS_CHUNK_BYTES + 777_123, { appleDate: '2026-10-15T14:03:22+0900' });
writeFileSync(sourcePath, SOURCE);
const sourceSha = createHash('sha256').update(SOURCE).digest('hex');
const SIZE = SOURCE.length;
const file = await openAsBlob(sourcePath, { type: 'video/quicktime' });
ok(SIZE > 4 * TUS_CHUNK_BYTES, '조각 다섯 개가 되는 파일');

/** 얼마나 크게 읽었나 재는 겉감 */
function watched(blob: Blob) {
  const seen = { max: 0, calls: 0 };
  const wrap = { size: blob.size, slice: (a: number, b: number) => ((seen.max = Math.max(seen.max, b - a)), seen.calls++, blob.slice(a, b)) };
  return { blob: wrap as unknown as Blob, seen };
}

const memoryStore = (): RecoveryStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

let serial = 0;
const SUB = '11111111-1111-4111-8111-111111111111';
const newPath = () => `sub/${SUB}/${String(++serial).padStart(8, '0')}-2222-4222-8222-222222222222/original`;

async function grantFor(objectPath: string): Promise<UploadGrantView> {
  const g = await storage.issueUpload(objectPath);
  return { ...g, contentType: 'video/quicktime', chunkSize: TUS_CHUNK_BYTES, uploadUrl: null, transportExpiresAt: null };
}
const refreshFor = (objectPath: string, counter?: { n: number }) => async () => {
  if (counter) counter.n++;
  const g = await storage.issueUpload(objectPath);
  return { token: g.token, tokenTtlMs: g.tokenTtlMs };
};
const hashOf = (p: string) =>
  new Promise<string>((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(p).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
const fast = [0, 10, 10, 10, 10];
const resetLog = () => {
  server.log = { posts: 0, heads: 0, patchSizes: [], patchBytes: 0, firstPatchOffset: [], badAuth: 0, signedUploads: 0 };
};

/* ────────────────────────── 1 해시 ────────────────────────── */
{
  const w = watched(file);
  const marks: number[] = [];
  const sha = await hashFileSha256(w.blob, { onProgress: (d) => marks.push(d) });
  ok(sha === sourceSha, '브라우저 쪽 점진 해시 = 원본 전체 SHA-256');
  ok(w.seen.max <= HASH_SLICE_BYTES && w.seen.calls >= 3, '해시는 8MiB 씩만 읽는다');
  ok(marks.at(-1) === SIZE, '해시 진행이 끝까지 간다');
  await assert.rejects(hashFileSha256({ size: 10, slice: () => ({ arrayBuffer: () => Promise.reject(new Error('gone')) }) } as unknown as Blob), (e: IntakeUploadError) => e.code === 'file_unreadable');
  passed++;
}

/* ────────────────────────── 2 끊김 없는 전송 ────────────────────────── */
{
  resetLog();
  const objectPath = newPath();
  const grant = await grantFor(objectPath);
  ok(grant.endpoint === `http://127.0.0.1:${port}/storage/v1/upload/resumable/sign`, '서명 업로드 끝점');
  ok(grant.apikey === PUBLISHABLE && !JSON.stringify(grant).includes(SERVICE_KEY), 'service role 키가 나가지 않는다');
  ok(grant.tokenTtlMs > 7_000_000, '토큰 수명을 토큰에서 읽는다');
  const store = memoryStore();
  const key = recoveryKey(SUB, 'a');
  const w = watched(file);
  const seen: number[] = [];
  const urls: string[] = [];
  const h = startIntakeUpload({ file: w.blob, fileName: 'IMG_1.MOV', sha256: sourceSha, grant, refreshGrant: refreshFor(objectPath), store, storeKey: key, onUploadUrl: (u) => urls.push(u), onProgress: (s) => seen.push(s), retryDelays: fast });
  await h.done;
  const stored = server.objects.get(objectPath)!;
  ok((await hashOf(stored)) === sourceSha, '받은 바이트의 SHA-256 = 원본');
  ok(statSync(stored).size === SIZE, '크기 그대로');
  ok(server.log.patchSizes.slice(0, -1).every((n) => n === TUS_CHUNK_BYTES), '마지막 빼고 조각은 6MB 정확히');
  ok(server.log.patchSizes.length === 5, '조각 다섯');
  ok(w.seen.max <= TUS_CHUNK_BYTES, '전송은 조각만큼만 읽는다');
  ok(server.log.badAuth === 0, 'TUS 요청에 service role 없이 공개 키만 간다');
  ok(seen.at(-1) === SIZE, '진행률이 끝까지 간다');
  ok(urls.length === 1 && urls[0].includes('/upload/resumable/sign/'), '업로드 주소를 한 번 알린다');
  ok(!store.map.has(key), '끝나면 이어 올리기 기록을 지운다');
  await assert.rejects(startIntakeUpload({ file, fileName: 'x', sha256: sourceSha, grant, refreshGrant: refreshFor(objectPath), store, storeKey: 'again', retryDelays: [] }).done, (e: IntakeUploadError) => e.code === 'conflict');
  passed++;
  ok((await hashOf(server.objects.get(objectPath)!)) === sourceSha, '같은 경로 재전송이 끝난 객체를 덮지 못한다');
  await assert.rejects(storage.issueUpload(objectPath), /저장소/);
  passed++;
}

/* ────────────────────────── 3 전송 도중 연결이 끊김 ────────────────────────── */
{
  resetLog();
  const objectPath = newPath();
  const grant = await grantFor(objectPath);
  let cuts = 0;
  const store = memoryStore();
  const h = startIntakeUpload({
    file,
    fileName: 'IMG.MOV',
    sha256: sourceSha,
    grant,
    refreshGrant: refreshFor(objectPath),
    store,
    storeKey: recoveryKey(SUB, 'b'),
    retryDelays: fast,
    onProgress: (sent) => {
      if (cuts === 0 && sent > 2 * TUS_CHUNK_BYTES) {
        cuts++;
        server.cutPatchAfter = 1_000_000;
      }
    },
  });
  await h.done;
  ok(cuts === 1 && server.log.heads >= 1, '끊긴 뒤 HEAD 로 자리를 다시 묻는다');
  ok(server.log.posts === 1, '새 업로드를 만들지 않고 같은 주소로 이어 간다');
  ok(server.log.patchBytes === SIZE, '받아 둔 조각은 다시 안 보낸다');
  ok((await hashOf(server.objects.get(objectPath)!)) === sourceSha, '끊겼다 이어도 바이트 그대로');
}

/* ────────────────────────── 4 화면을 닫고 다시 와서 이어 감 ────────────────────────── */
{
  resetLog();
  const objectPath = newPath();
  const store = memoryStore();
  const key = recoveryKey(SUB, 'c');
  const first = startIntakeUpload({
    file,
    fileName: 'IMG.MOV',
    sha256: sourceSha,
    grant: await grantFor(objectPath),
    refreshGrant: refreshFor(objectPath),
    store,
    storeKey: key,
    retryDelays: fast,
    onProgress: (sent) => {
      if (sent >= 2 * TUS_CHUNK_BYTES) void first.abort();
    },
  });
  await assert.rejects(first.done, (e: IntakeUploadError) => e.code === 'aborted');
  passed++;
  const record = readRecovery(store, key)!;
  ok(record && record.size === SIZE && record.sha256 === sourceSha, '기록에 주소 · 크기 · 해시가 남는다');
  ok(!JSON.stringify(record).includes('.ey') && !('token' in record), '기록에 토큰이 없다');
  const up = [...server.uploads.values()].find((u) => u.object === objectPath)!;
  const offset = up.offset;
  ok(offset > 0 && offset < SIZE, '반쯤 올라간 채 멈췄다');

  /* 새 페이지 — File 은 없고 기록만 있다. 같은 파일을 다시 골랐다고 친다 */
  ok((await matchesRecovery(file, record)).ok, '같은 파일을 다시 고르면 크기 + 해시가 맞는다');
  const other = Buffer.from(SOURCE);
  other[other.length - 5] ^= 0xff;
  const wrong = await matchesRecovery(new Blob([new Uint8Array(other)]), record);
  ok(!wrong.ok && wrong.reason === 'hash', '크기가 같아도 내용이 다르면 막는다');
  const short = await matchesRecovery(new Blob([new Uint8Array(SOURCE.subarray(0, 100))]), record);
  ok(!short.ok && short.reason === 'size', '크기가 다르면 해시도 안 잰다');

  /* 기록의 해시가 이 파일과 다르면 그 주소에 이어 붙이지 않는다 — 새 업로드를 만든다 */
  const mismatched = memoryStore();
  mismatched.setItem(key, JSON.stringify({ ...record, sha256: 'f'.repeat(64) }));
  let guardUrl: string | null = null;
  const guard = startIntakeUpload({
    file,
    fileName: 'IMG.MOV',
    sha256: sourceSha,
    grant: await grantFor(objectPath),
    refreshGrant: refreshFor(objectPath),
    store: mismatched,
    storeKey: key,
    retryDelays: fast,
    onUploadUrl: (u) => {
      guardUrl = u;
      void guard.abort();
    },
  });
  await guard.done.catch(() => {});
  ok(guardUrl != null && guardUrl !== record.uploadUrl, '기록의 해시가 파일과 다르면 그 주소를 안 쓴다');

  /* 서버가 이미 이 주소를 안다(grant.uploadUrl) — 이어 가도 다시 알리지 않는다 */
  const knownAnnounce: string[] = [];
  const knows = startIntakeUpload({
    file,
    fileName: 'IMG.MOV',
    sha256: sourceSha,
    grant: { ...(await grantFor(objectPath)), uploadUrl: record.uploadUrl, transportExpiresAt: record.transportExpiresAt },
    refreshGrant: refreshFor(objectPath),
    store,
    storeKey: key,
    retryDelays: fast,
    onUploadUrl: (u) => knownAnnounce.push(u),
    onProgress: (sent) => {
      if (sent > offset) void knows.abort();
    },
  });
  await knows.done.catch(() => {});
  ok(knownAnnounce.length === 0, '서버가 아는 주소로 이어 가면 다시 알리지 않는다');

  /*
   * 앞 시도의 알림이 끊겼다(멈춤 · 끊김) — 서버는 주소를 모르고(grant.uploadUrl null) 기기 기록만 있다.
   * 이어 갈 때 서버에 다시 알려야 다른 기기 · 지운 브라우저가 이어 간다. 기기 기록이 같다고 건너뛰면 안 된다.
   */
  const resumedFrom = up.offset;
  const postsBefore = server.log.posts;
  const before = server.log.patchBytes;
  const announced: string[] = [];
  const second = startIntakeUpload({ file, fileName: 'IMG.MOV', sha256: sourceSha, grant: await grantFor(objectPath), refreshGrant: refreshFor(objectPath), store, storeKey: key, retryDelays: fast, onUploadUrl: (u) => announced.push(u) });
  await second.done;
  ok(announced.length === 1 && announced[0] === record.uploadUrl, '서버가 모르는 주소로 이어 가면 그 주소를 한 번 다시 알린다');
  ok(server.log.posts === postsBefore, '이어 갈 때 새 업로드를 안 만든다');
  ok(server.log.patchBytes - before === SIZE - resumedFrom, '남은 바이트만 보낸다');
  ok((await hashOf(server.objects.get(objectPath)!)) === sourceSha, '다시 와서 이어도 바이트 그대로');
}

/* ────────────────────────── 5 토큰이 끝남 — 같은 주소에 새 토큰으로 ────────────────────────── */
{
  resetLog();
  const objectPath = newPath();
  const grant = await grantFor(objectPath);
  const refreshed = { n: 0 };
  /* 화면은 토큰이 오래 산다고 믿는데 저장소가 끝났다고 한다 */
  let expired = false;
  await startIntakeUpload({
    file,
    fileName: 'IMG.MOV',
    sha256: sourceSha,
    grant,
    refreshGrant: refreshFor(objectPath, refreshed),
    store: memoryStore(),
    storeKey: recoveryKey(SUB, 'd'),
    retryDelays: fast,
    onProgress: (sent) => {
      if (!expired && sent >= 2 * TUS_CHUNK_BYTES) {
        expired = true;
        server.minTokenSerial = server.tokenSerial + 1;
      }
    },
  }).done;
  ok(refreshed.n >= 1, '끝난 토큰을 새로 받는다');
  ok(server.log.posts === 1, '새 토큰으로 같은 업로드 주소에 이어 간다');
  ok((await hashOf(server.objects.get(objectPath)!)) === sourceSha, '토큰이 바뀌어도 바이트 그대로');
}
{
  /* 곧 끝날 토큰은 거절당하기 전에 미리 바꾼다 */
  resetLog();
  const objectPath = newPath();
  const grant = { ...(await grantFor(objectPath)), tokenTtlMs: 60_000 };
  const refreshed = { n: 0 };
  await startIntakeUpload({ file, fileName: 'x', sha256: sourceSha, grant, refreshGrant: async () => ({ ...(await refreshFor(objectPath, refreshed)()), tokenTtlMs: 7_000_000 }), store: memoryStore(), storeKey: 'p', retryDelays: fast }).done;
  ok(refreshed.n === 1, '남은 시간이 짧으면 미리 한 번만 새로 받는다');
}
{
  /* 폐기되어 새 토큰을 못 받으면 멈춘다 */
  resetLog();
  const objectPath = newPath();
  const grant = { ...(await grantFor(objectPath)), tokenTtlMs: 1000 };
  await assert.rejects(
    startIntakeUpload({ file, fileName: 'x', sha256: sourceSha, grant, refreshGrant: () => Promise.reject(new Error('invitation_revoked')), store: memoryStore(), storeKey: 'q', retryDelays: fast }).done,
    (e: IntakeUploadError) => e.code === 'token_refused',
  );
  passed++;
  ok(!server.objects.has(objectPath), '멈추면 객체가 생기지 않는다');
}

/* ────────────────────────── 6 업로드 주소 만료 ────────────────────────── */
{
  resetLog();
  const objectPath = newPath();
  const store = memoryStore();
  const key = recoveryKey(SUB, 'e');
  const first = startIntakeUpload({
    file,
    fileName: 'x',
    sha256: sourceSha,
    grant: await grantFor(objectPath),
    refreshGrant: refreshFor(objectPath),
    store,
    storeKey: key,
    retryDelays: fast,
    onProgress: (sent) => {
      if (sent >= TUS_CHUNK_BYTES) void first.abort();
    },
  });
  await first.done.catch(() => {});
  const oldUrl = readRecovery(store, key)!.uploadUrl;

  /* 저장소가 잊었다: HEAD 404 → 새 업로드 */
  server.uploads.clear();
  const fresh: string[] = [];
  await startIntakeUpload({ file, fileName: 'x', sha256: sourceSha, grant: await grantFor(objectPath), refreshGrant: refreshFor(objectPath), store, storeKey: key, onUploadUrl: (u) => fresh.push(u), retryDelays: fast }).done;
  ok(fresh.length === 1 && fresh[0] !== oldUrl, '주소가 끝나면 새 업로드를 만들고 새 주소를 알린다');
  ok((await hashOf(server.objects.get(objectPath)!)) === sourceSha, '처음부터 다시 보내도 바이트 그대로');

  /* 기록의 만료가 지났으면 묻지도 않고 버린다 */
  store.setItem(key, JSON.stringify({ uploadUrl: oldUrl, size: SIZE, sha256: sourceSha, fileName: 'x', transportExpiresAt: new Date(Date.now() - 1000).toISOString() }));
  ok(readRecovery(store, key) === null && !store.map.has(key), '끝난 주소 기록을 지운다');
  store.setItem(key, JSON.stringify({ uploadUrl: oldUrl, size: SIZE, sha256: sourceSha, fileName: 'x', transportExpiresAt: new Date(Date.now() + TUS_URL_TTL_MS).toISOString() }));
  ok(readRecovery(store, key)?.uploadUrl === oldUrl, '살아 있는 기록은 읽는다');
}

/* ────────────────────────── 7 마지막 응답을 잃음 ────────────────────────── */
{
  resetLog();
  const objectPath = newPath();
  server.dropFinalResponse = true;
  server.forgetFinished = true;
  const store = memoryStore();
  await assert.rejects(
    startIntakeUpload({ file, fileName: 'x', sha256: sourceSha, grant: await grantFor(objectPath), refreshGrant: refreshFor(objectPath), store, storeKey: 'lost', retryDelays: fast }).done,
    (e: IntakeUploadError) => e.code === 'conflict',
  );
  passed++;
  server.forgetFinished = false;
  ok((await storage.stat(objectPath))?.size === SIZE, "'conflict' 뒤 저장소를 물으면 다 도착해 있다");
  ok((await storage.hash(objectPath)).sha256 === sourceSha, '응답을 잃어도 바이트 그대로');
}

/* ────────────────────────── 8 파일을 못 읽게 됨 ────────────────────────── */
{
  resetLog();
  const objectPath = newPath();
  const flaky = {
    size: file.size,
    slice: (a: number, b: number) => (a >= 2 * TUS_CHUNK_BYTES ? { arrayBuffer: () => Promise.reject(new Error('NotReadableError')) } : file.slice(a, b)),
  } as unknown as Blob;
  const store = memoryStore();
  await assert.rejects(
    startIntakeUpload({ file: flaky, fileName: 'x', sha256: sourceSha, grant: await grantFor(objectPath), refreshGrant: refreshFor(objectPath), store, storeKey: 'flaky', retryDelays: fast }).done,
    (e: IntakeUploadError) => e.code === 'file_unreadable',
  );
  passed++;
  ok(readRecovery(store, 'flaky') != null, '파일을 잃어도 이어 올리기 기록은 남는다');
}

/* ────────────────────────── 9 서버 쪽 검증 ────────────────────────── */
{
  const objectPath = [...server.objects.keys()][0];
  const stat = await storage.stat(objectPath);
  ok(stat?.size === SIZE, '범위 읽기로 크기를 안다');
  ok((await storage.stat('sub/none/none/original')) === null, '없는 객체는 null');

  /*
   * 삭제 확인은 stat 하나에 기댄다. 호스팅 서버는 없는 객체를 HTTP 400 + 몸통 statusCode '404' 로 답한다.
   * 다른 까닭의 400 까지 없음으로 읽으면, 지웠다는 답만 오고 객체가 남은 파일을 'purged' 로 적는다. 그 줄은 다시 보는 곳이 없다.
   */
  const notFound = { status: 400, body: { statusCode: '404', error: 'not_found', message: 'Object not found' } };
  const noPermission = { status: 400, body: { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' } };
  const statUnavailable = (e: unknown) => e instanceof IntakeError && e.code === 'storage_unavailable' && e.detail?.cause === 'stat';
  server.readAnswer = notFound;
  ok((await storage.stat(objectPath)) === null, "400 + 몸통 '404' 는 없는 객체다");
  server.readAnswer = { status: 400, body: { statusCode: 404, error: 'not_found', message: 'Object not found' } };
  ok((await storage.stat(objectPath)) === null, '몸통의 숫자 404 도 없는 객체다');
  for (const answer of [noPermission, { status: 400, body: {} }, { status: 400, body: '<html>Bad Request</html>' }, { status: 400, body: 'null' }, { status: 400, body: { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' } }]) {
    server.readAnswer = answer;
    await assert.rejects(storage.stat(objectPath), statUnavailable, `없다는 말이 아닌 400 은 던진다: ${JSON.stringify(answer.body)}`);
    passed++;
  }
  server.readAnswer = null;

  const leftName = 'sub/x/left/original';
  const leftFile = path.join(dir, 'left');
  writeFileSync(leftFile, 'left');
  server.objects.set(leftName, leftFile);
  server.removeNoop = true;
  server.readAnswer = noPermission;
  await assert.rejects(removeAndFindLeft(storage, [leftName]), statUnavailable, '객체가 남고 다른 까닭의 400 이면 없어졌다고 안 말한다');
  passed++;
  server.readAnswer = null;
  ok((await removeAndFindLeft(storage, [leftName])).join() === leftName, '지웠다는 답만 오면 남은 경로를 돌려준다');
  /*
   * 검증 지적: 서명은 됐는데 원본 GET 이 몸통 없는 404 를 준다(게이트웨이 · 상태 글만) — 객체가 없다는 말이 아니다.
   * 없음으로 읽으면 지웠다는 답만 오고 남은 파일을 'purged' 로 적는다. 저장소가 낸 '객체 없음' 몸통일 때만 없음이다.
   */
  for (const body of ['<html><body>Not Found</body></html>', 'Not Found', '', { message: 'not found' }, {}, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }]) {
    server.readAnswer = { status: 404, body };
    await assert.rejects(removeAndFindLeft(storage, [leftName]), statUnavailable, `몸통 없는 404 는 지운 증거가 아니다: ${JSON.stringify(body)}`);
    passed++;
    ok(server.objects.has(leftName), `객체는 그대로 남아 있다: ${JSON.stringify(body)}`);
  }
  server.readAnswer = { status: 404, body: { statusCode: '404', error: 'not_found', message: 'Object not found' } };
  ok((await storage.stat(leftName)) === null, "저장소가 낸 '객체 없음' 몸통의 404 는 없음이다");
  server.readAnswer = null;

  /* 검증 지적: 서명 단계의 'not found' 도 객체가 없다는 말일 때만 없음이다. 버킷 · 테넌트가 없거나 몸통 없는 게이트웨이 404 면 객체는 남아 있을 수 있다 */
  const signUnavailable = (e: unknown) => e instanceof IntakeError && e.code === 'storage_unavailable' && e.detail?.cause === 'sign_read';
  for (const answer of [
    { status: 400, body: { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' } },
    { status: 404, body: '<html><body>Not Found</body></html>' },
    { status: 400, body: { statusCode: '400', error: 'Tenant config not found', message: 'Tenant config not found' } },
  ]) {
    server.signAnswer = answer;
    await assert.rejects(removeAndFindLeft(storage, [leftName]), signUnavailable, `객체 없음이 아닌 서명 답은 지운 증거가 아니다: ${JSON.stringify(answer.body)}`);
    passed++;
  }
  server.signAnswer = { status: 400, body: { statusCode: '404', error: 'not_found', message: 'Object not found' } };
  ok((await storage.stat(leftName)) === null, '서명 단계의 객체 없음 답은 그대로 없음이다');
  server.signAnswer = null;
  server.removeNoop = false;
  ok((await removeAndFindLeft(storage, [leftName])).length === 0, '실제로 없어지면 빈 목록이다');
  ok(!server.objects.has(leftName), '가짜 저장소에서도 없어졌다');
  const measured = await storage.hash(objectPath);
  ok(measured.sha256 === sourceSha && measured.size === SIZE, '서버 스트리밍 해시 = 원본');

  const reader = (await storage.reader(objectPath))!;
  let largest = 0;
  const facts = await readIntakeMediaFacts({ size: reader.size, read: (s, e) => ((largest = Math.max(largest, e - s)), reader.read(s, e)) });
  ok(facts.container === 'mov' && fpsLabel(facts) === '240fps 감지', '범위 읽기로 올라간 파일의 머리를 읽는다');
  ok(largest < 1_000_000, '머리를 읽는 데 파일 전체를 안 받는다');

  const name = '금윤호_2026-11-06_IN-261106-ABCDEF_side_original.mov';
  const url = await storage.readUrl(objectPath, { download: name, ttlSec: 120 });
  const res = await fetch(url, { headers: { Range: 'bytes=0-3' } });
  ok(decodeURIComponent(res.headers.get('x-download-name') ?? '') === name, '내려받기 이름이 서명 주소에 실린다');
  await res.body?.cancel();
  ok(await storage.remove([]).then(() => true), '빈 지우기는 조용하다');

  /*
   * Next 의 fetch 는 signal 없는 GET 응답을 둘로 가른다. 그러면 몸통 취소가 안 끝나 전송 확인이 멈추고(격리 브라우저 시험 119초),
   * 안 읽는 갈래에 파일 전체가 쌓인다. 보통 fetch 로는 안 드러나서 Next 의 그 함수를 그대로 끼워 본다.
   */
  const { createDedupeFetch } = createRequire(import.meta.url)('next/dist/server/lib/dedupe-fetch.js') as { createDedupeFetch(f: typeof fetch): typeof fetch };
  let tees = 0;
  const seenInit: RequestInit[] = [];
  const viaNext = createIntakeStorage({
    url: `http://127.0.0.1:${port}`,
    serviceKey: SERVICE_KEY,
    publishableKey: PUBLISHABLE,
    fetch: createDedupeFetch(((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        seenInit.push(init ?? {});
        if (!init?.signal) tees++;
      }
      return fetch(input, init);
    }) as typeof fetch),
  });
  const within = <T,>(work: Promise<T>, label: string) =>
    Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`멈춤: ${label}`)), 5_000))]);
  ok((await within(viaNext.stat(objectPath), '크기 확인'))?.size === SIZE, 'Next fetch 로도 크기 확인이 안 멈춘다');
  ok((await within(viaNext.hash(objectPath), '전체 해시')).sha256 === sourceSha, 'Next fetch 로도 전체 해시가 맞다');
  const viaReader = (await within(viaNext.reader(objectPath), '읽기 준비'))!;
  ok((await within(viaReader.read(0, 16), '범위 읽기')).length === 16, 'Next fetch 로도 범위 읽기가 안 멈춘다');
  ok(tees === 0 && seenInit.length > 0, '서버 안 GET 은 모두 signal 을 줘서 Next 가 응답을 안 가른다');
  ok(seenInit.every((i) => i.cache === 'no-store'), '서버 안 GET 은 모두 저장 안 함');
}

/* ────────────────────────── 10 이어 갈 자리를 물었는데 저장소가 넘어짐 ────────────────────────── */

/** 반쯤 올려 놓고 멈춘 전송 — 기록과 저장소에 남은 자리를 돌려준다 */
async function halfSent(tag: string) {
  const objectPath = newPath();
  const store = memoryStore();
  const key = recoveryKey(SUB, tag);
  const first = startIntakeUpload({
    file,
    fileName: 'x',
    sha256: sourceSha,
    grant: await grantFor(objectPath),
    refreshGrant: refreshFor(objectPath),
    store,
    storeKey: key,
    retryDelays: fast,
    onProgress: (sent) => {
      if (sent >= 2 * TUS_CHUNK_BYTES) void first.abort();
    },
  });
  await first.done.catch(() => {});
  const url = readRecovery(store, key)!.uploadUrl;
  const offset = [...server.uploads.values()].find((u) => u.object === objectPath)!.offset;
  ok(offset > 0 && offset < SIZE, `${tag}: 반쯤 올라간 채 멈췄다`);
  return { objectPath, store, key, url, offset };
}

{
  /* 5xx 는 주소가 끝났다는 말이 아니다 — 새 업로드를 만들면 올린 바이트를 다 잃는다 */
  for (const status of [502, 503]) {
    const h = await halfSent(`head-${status}`);
    resetLog();
    server.headFail = [status, status];
    await startIntakeUpload({ file, fileName: 'x', sha256: sourceSha, grant: await grantFor(h.objectPath), refreshGrant: refreshFor(h.objectPath), store: h.store, storeKey: h.key, retryDelays: fast }).done;
    ok(server.log.posts === 0, `HEAD ${status} 뒤 새 업로드를 안 만든다`);
    ok(server.log.heads === 3, `HEAD ${status} 뒤 같은 주소를 다시 묻는다`);
    ok(server.log.patchBytes === SIZE - h.offset, `HEAD ${status} 뒤 남은 바이트만 보낸다`);
    ok((await hashOf(server.objects.get(h.objectPath)!)) === sourceSha, `HEAD ${status} 뒤에도 바이트 그대로`);
  }

  /* 끝내 안 일어나면 멈추되 주소를 쥐고 있다 — 다음 시도가 이어 간다 */
  const h = await halfSent('head-down');
  resetLog();
  server.headFail = Array(fast.length + 1).fill(503);
  await assert.rejects(
    startIntakeUpload({ file, fileName: 'x', sha256: sourceSha, grant: await grantFor(h.objectPath), refreshGrant: refreshFor(h.objectPath), store: h.store, storeKey: h.key, retryDelays: fast }).done,
    (e: IntakeUploadError) => e.code === 'unknown',
  );
  passed++;
  ok(server.log.posts === 0, '저장소가 계속 넘어져도 새 업로드를 안 만든다');
  ok(readRecovery(h.store, h.key)?.uploadUrl === h.url, '멈춰도 이어 올리기 주소가 남는다');
  resetLog();
  server.headFail = [];
  await startIntakeUpload({ file, fileName: 'x', sha256: sourceSha, grant: await grantFor(h.objectPath), refreshGrant: refreshFor(h.objectPath), store: h.store, storeKey: h.key, retryDelays: fast }).done;
  ok(server.log.posts === 0 && server.log.patchBytes === SIZE - h.offset, '다시 시도하면 끊긴 곳부터 간다');
}
{
  /* 끝난 토큰으로 물어도 주소는 살아 있다 — HEAD 는 몸통이 없어 글자를 못 보니 새 토큰으로 다시 묻는다 */
  const h = await halfSent('head-token');
  const grant = await grantFor(h.objectPath);
  server.minTokenSerial = server.tokenSerial + 1;
  resetLog();
  const refreshed = { n: 0 };
  await startIntakeUpload({ file, fileName: 'x', sha256: sourceSha, grant, refreshGrant: refreshFor(h.objectPath, refreshed), store: h.store, storeKey: h.key, retryDelays: fast }).done;
  ok(refreshed.n === 1 && server.log.posts === 0, '끝난 토큰의 HEAD 는 새 토큰으로 같은 주소를 다시 묻는다');
  ok(server.log.patchBytes === SIZE - h.offset, '토큰이 끝나 물어도 남은 바이트만 보낸다');
}
{
  /* 410 은 404 처럼 '이 주소는 끝났다'는 뜻이다 */
  const h = await halfSent('head-410');
  resetLog();
  server.headFail = [410];
  const fresh: string[] = [];
  await startIntakeUpload({ file, fileName: 'x', sha256: sourceSha, grant: await grantFor(h.objectPath), refreshGrant: refreshFor(h.objectPath), store: h.store, storeKey: h.key, onUploadUrl: (u) => fresh.push(u), retryDelays: fast }).done;
  ok(server.log.posts === 1 && fresh[0] !== h.url, '끝난 주소면 새 업로드를 만든다');
  ok(server.log.patchBytes === SIZE, '끝난 주소면 처음부터 보낸다');
}

/* ────────────────────────── 11 화면이 보여 준 것만 얼린다 ────────────────────────── */

const noWait = async () => {};
const stateWith = (p: Partial<PublicIntakeState>) => ({ state: { version: 7, assets: { side: { id: 'S' }, rear: { id: 'R2' } }, ...p } }) as unknown as PublicStateResponse;
const RECEIPT: IntakeReceipt = { created: true, revision: 1, receiptCode: 'IN-1', receivedAt: '2026-11-06T03:00:00.000Z', receiptDate: '2026-11-06', athleteName: '금윤호', submissionStatus: 'submitted', version: 9 };
type FinalizeArg = Parameters<Parameters<typeof finishRun>[0]['finalize']>[0];
const fakeFinish = (answers: (IntakeReceipt | Error)[], state = stateWith({})) => {
  const calls: FinalizeArg[] = [];
  return {
    calls,
    api: {
      state: async () => state,
      finalize: async (a: FinalizeArg) => {
        calls.push(a);
        const r = answers.shift()!;
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
};
const stale = () => new IntakeRequestError('stale_version', '낡았어요', 409, { currentVersion: 8 });
{
  /* 읽은 판은 9 인데 화면이 그린 판은 7 이다 — 방금 읽은 판을 쓰면 낙관 잠금이 뜻이 없어진다 */
  const f = fakeFinish([RECEIPT], stateWith({ version: 9 }));
  await finishRun(f.api, { idempotencyKey: 'k', expected: { side: 'S', rear: 'R2' }, expectedVersion: 7 }, noWait);
  ok(f.calls[0].expectedVersion === 7, '화면이 그린 판을 그대로 보낸다');
  assert.deepEqual(f.calls[0].expectedAssets, { side: 'S', rear: 'R2' });
  passed++;

  /* 기기 A 가 S + R1 을 띄운 사이 기기 B 가 뒤 영상을 R2 로 바꿨다 — 말없이 S + R2 를 얼리면 안 된다 */
  const moved = fakeFinish([RECEIPT]);
  await assert.rejects(finishRun(moved.api, { idempotencyKey: 'k', expected: { side: 'S', rear: 'R1' }, expectedVersion: 6 }, noWait), (e: RunStop) => e.code === 'stale_selection' && e.view === 'rear');
  passed++;
  ok(moved.calls.length === 0, '칸이 바뀌었으면 완료를 안 부른다');

  /* 자산이 같아도 글이 바뀌었으면 판이 다르다. 새 판으로 다시 내면 사용자가 못 본 이름을 얼린다 */
  const named = fakeFinish([stale(), RECEIPT]);
  await assert.rejects(finishRun(named.api, { idempotencyKey: 'k', expected: { side: 'S', rear: 'R2' }, expectedVersion: 6 }, noWait), (e: RunStop) => e.code === 'stale_version');
  passed++;
  ok(named.calls.length === 1, '화면이 그린 판이 낡았으면 새 판으로 다시 내지 않는다');

  /* 판을 모르는 부름은 예전대로 다시 읽어 낸다 */
  const open = fakeFinish([stale(), RECEIPT]);
  ok((await finishRun(open.api, { idempotencyKey: 'k', expected: {} }, noWait)).receiptCode === 'IN-1', '판을 안 주면 다시 읽어 낸다');
  ok(open.calls.length === 2, '판을 안 주면 두 번 낸다');
}

/* ────────────────────────── 12 영수증 뒤의 끊김은 전송 실패가 아니다 ────────────────────────── */
{
  const before = {
    screen: 'upload',
    statusText: '아직 보내지 않았어요',
    version: 3,
    submissionStatus: 'draft',
    analysisStatus: 'none',
    draft: { athleteName: null, samePitchConfirmed: false },
    receipt: null,
    correction: { fields: [], views: ['rear'], message: null },
  } as unknown as PublicIntakeState;
  const after = stateAfterReceipt(before, RECEIPT);
  ok(after.screen === 'receipt' && after.receipt?.code === 'IN-1', '다시 읽지 못해도 영수증 화면을 그릴 수 있다');
  ok(after.submissionStatus === 'submitted' && after.version === 9 && after.correction === null, '영수증의 상태로 맞춘다');
  ok(after.statusText === '파일이 잘 도착했는지 확인하고 있어요', '지금 상태 글도 맞춘다');
  ok(after.draft.athleteName === '금윤호' && after.draft.samePitchConfirmed, '이름 · 확인을 영수증에서 채운다');

  /* 검증 지적: 지운 접수를 고쳐 다시 냈다 — 새 판이 얼었으니 지금 판의 원본은 살아 있다. 옛 판의 '지웠어요'를 머리 · 줄에 남기지 않는다 */
  const goneBefore = { ...before, screen: 'correction', submissionStatus: 'correction_requested', originalsGone: 'deleted', originalDeletedDate: '2026-04-01', originalDeleting: null, originalDeleteDate: '2026-04-01' } as unknown as PublicIntakeState;
  const refrozen = stateAfterReceipt(goneBefore, RECEIPT);
  ok(refrozen.originalsGone === null && refrozen.originalDeletedDate === null && refrozen.originalDeleting === null && refrozen.originalDeleteDate === null, '다시 낸 영수증은 옛 판의 지운 사실을 안 쥔다');
  ok(receiptHead(refrozen).title === '영상이 잘 도착했어요' && !receiptHead(refrozen).desc.includes('나오지 않아요'), '머리가 방금 보낸 영상을 지웠다고 말하지 않는다');
  ok(receiptRetentionRows(refrozen).length === 0, '옛 판의 지운 날 줄이 없다');
  const deletingBefore = { ...goneBefore, originalsGone: 'deleting', originalDeletedDate: null, originalDeleting: 'current' } as unknown as PublicIntakeState;
  const refrozen2 = stateAfterReceipt(deletingBefore, RECEIPT);
  ok(receiptHead(refrozen2).title === '영상이 잘 도착했어요' && receiptRetentionRows(refrozen2).length === 0, '지우는 중에 다시 내도 같다');
  /* 같은 키 재시도(created false)가 화면이 알던 그 판이면 서버가 아는 사실을 그대로 두고, 지금 상태 글도 그 사실과 맞춘다 */
  const knownReceipt = { code: 'IN-1', receivedAt: RECEIPT.receivedAt, receiptDate: RECEIPT.receiptDate, revision: 1 };
  const retry = stateAfterReceipt({ ...goneBefore, receipt: knownReceipt, submissionStatus: 'verified', analysisStatus: 'ready' } as PublicIntakeState, { ...RECEIPT, created: false, submissionStatus: 'verified' });
  ok(retry.originalsGone === 'deleted' && retry.statusText.includes('원본을 지웠어요'), '같은 판의 같은 키 재시도는 지운 사실과 그 글을 지킨다');
  /*
   * 검증 지적: 고쳐 다시 낸 뒤 완료 응답을 잃어 같은 키로 받은 영수증(created false)이다. 다른 기기가 먼저 낸 경우도 같다.
   * 영수증의 판(2)이 화면이 알던 판(1)과 다르니 새로 얼린 판이다 — 옛 판의 '지웠어요 · 지우는 중'과 분석 상태를 들고 있으면 방금 보낸 영상을 지웠다고 말한다.
   */
  const lostAnswer = { ...RECEIPT, created: false, revision: 2 };
  for (const [gone, fixBefore] of [
    ['deleted', { ...goneBefore, receipt: knownReceipt, analysisStatus: 'succeeded' }],
    ['deleting', { ...deletingBefore, receipt: knownReceipt, analysisStatus: 'none' }],
  ] as const) {
    const shown = stateAfterReceipt(fixBefore as unknown as PublicIntakeState, lostAnswer);
    ok(shown.originalsGone === null && shown.originalDeleting === null && shown.originalDeletedDate === null && shown.originalDeleteDate === null, `응답을 잃은 재시도도 새 판이면 옛 판의 원본 사실을 안 쥔다: ${gone}`);
    ok(shown.analysisStatus === 'none' && shown.receipt?.revision === 2, `새 판의 분석은 아직 없다: ${gone}`);
    assert.deepEqual([receiptHead(shown).title, receiptRetentionRows(shown), shown.statusText], ['영상이 잘 도착했어요', [], '파일이 잘 도착했는지 확인하고 있어요'], `머리 · 보유 줄 · 상태 글이 방금 보낸 영상을 지웠다고 안 한다: ${gone}`);
    passed++;
  }

  let tries = 0;
  const net = new IntakeRequestError('network', '끊겼어요');
  const flaky = await refreshQuietly(async () => {
    if (++tries < 3) throw net;
  }, noWait);
  ok(flaky === null && tries === 3, '끊기면 조용히 다시 묻는다');
  tries = 0;
  const down = await refreshQuietly(async () => {
    tries++;
    throw net;
  }, noWait);
  ok(down?.code === 'network' && tries === 4, '끝내 끊겨도 던지지 않는다');
  tries = 0;
  const gone = await refreshQuietly(async () => {
    tries++;
    throw new IntakeRequestError('invitation_revoked', '폐기');
  }, noWait);
  ok(gone?.code === 'invitation_revoked' && tries === 1, '서버 거절은 다시 묻지 않고 돌려준다');
}

/* ────────────────────────── 13 검토 화면 규칙 ────────────────────────── */
{
  const docs = INTAKE_CONSENT_DOCS;
  const full: ReviewForm = { name: '금윤호', ageBand: '14_or_over', samePitch: true, agreed: { submission: true, overseas: true }, hand: null, relation: 'self', submitterName: '' };
  assert.deepEqual(reviewProblems(full, docs), {});
  passed++;

  /* 만 14세 미만이면 체크를 다 하지 않아도 막힌 화면으로 간다 */
  assert.deepEqual(reviewProblems({ ...full, ageBand: 'under_14', name: '', samePitch: false, agreed: {}, relation: null }, docs), {});
  passed++;

  /* 누가 보내는지는 기본값이 없다 — 대리인이 칸을 지나쳐 본인 동의로 남지 않게 */
  ok(reviewProblems({ ...full, relation: null }, docs).relation != null, '보내는 사람을 안 고르면 막는다');

  /* 첫 칸은 화면 차례다 */
  const empty: ReviewForm = { ...full, name: '', ageBand: null, samePitch: false, agreed: {}, relation: null };
  const target = (f: ReviewForm) => firstProblemTarget(reviewProblems(f, docs), f, docs);
  ok(target(empty) === 'review-name', '이름이 먼저');
  ok(target({ ...empty, name: '금' }) === 'same-pitch', '다음은 같은 투구');
  ok(target({ ...empty, name: '금', samePitch: true }) === 'age-14_or_over', '나이가 동의보다 먼저');
  ok(target({ ...full, ageBand: null }) === 'age-14_or_over', '나이만 빠져도 갈 칸이 있다');
  ok(target({ ...empty, name: '금', samePitch: true, ageBand: '14_or_over' }) === 'relation-self', '보내는 사람이 동의보다 먼저');
  ok(target({ ...full, agreed: { submission: true } }) === 'consent-overseas', '빠진 동의 칸으로 간다');
  ok(firstProblemTarget({ form: '서버 오류' }, full, docs) === null, '칸이 없는 오류는 옮기지 않는다');

  /* 이미 지금 판인 글은 다시 묻지 않는다. 선택 동의도 안 묻는다 */
  const left = staleRequiredDocs({ consent: { requiredOk: false, granted: { submission: true, overseas: false, model: false } } }, docs);
  ok(left.length === 1 && left[0].kind === 'overseas', '바뀐 필수 글만 다시 묻는다');

  /* 지적 4: 지운 칸은 새 파일을 골라야 보낼 수 있다 */
  /* 칸의 자산 번호는 칸 이름 + 'new', 얼린 판의 번호는 칸 이름 + 'old' — 따로 주지 않으면 새로 고른 파일이다 */
  const fix = (side: string | null, rear: string | null, views: ('side' | 'rear')[], frozen: { side?: string; rear?: string } = {}) =>
    ({
      assets: { side: side ? { id: frozen.side ?? 'side-new', status: side } : null, rear: rear ? { id: frozen.rear ?? 'rear-new', status: rear } : null },
      correction: { fields: [], views, message: null },
      frozenAssetIds: { side: 'side-old', rear: 'rear-old' },
    }) as unknown as Parameters<typeof goneViewsToPick>[0];
  const nothing = { side: null, rear: null };
  ok(goneViewsToPick(fix('purged', 'purged', ['side', 'rear']), nothing).join() === 'side,rear', '안 고른 지운 칸을 다 말한다');
  ok(goneViewsToPick(fix('purged', 'purged', ['side', 'rear']), { side: {}, rear: null }).join() === 'rear', '고른 칸은 뺀다');
  ok(goneViewsToPick(fix('purging', 'verified', ['side', 'rear']), nothing).join() === 'side', '지우는 칸도 다시 골라야 한다');
  ok(goneViewsToPick(fix('purged', 'verified', []), nothing).length === 0, '요청받지 않은 칸은 안 본다');
  ok(goneViewsToPick({ assets: { side: null, rear: null }, correction: null, frozenAssetIds: { side: null, rear: null } } as never, nothing).length === 0, '고침이 없으면 말이 없다');
  /*
   * 검증 지적: 요청받은 칸을 새로 안 고르고 보내면 서버가 막는데 화면은 몰랐다. 막힌 파일('rejected')과 얼린 그 파일 그대로인 칸이다.
   * 막힌 칸은 서버가 '전송이 아직 끝나지 않았어요'라고 해서 거짓이었다. 둘 다 서버와 같은 판단으로 보내기 전에 말한다.
   */
  ok(goneViewsToPick(fix('rejected', 'verified', ['side']), nothing).join() === 'side', '막힌 칸은 다시 골라야 한다');
  ok(goneViewsToPick(fix('verified', 'verified', ['side'], { side: 'side-old' }), nothing).join() === 'side', '얼린 파일 그대로인 칸도 다시 골라야 한다');
  ok(goneViewsToPick(fix('verified', 'verified', ['side'], { side: 'side-old' }), { side: {}, rear: null }).length === 0, '새로 고르면 막지 않는다');
  ok(goneViewsToPick(fix('verified', 'verified', ['side']), nothing).length === 0, '이미 새로 받은 칸은 막지 않는다');
  ok(goneViewsToPick(fix('uploading', 'verified', ['side']), nothing).length === 0, '오는 중인 칸은 서버가 기다리라고 말한다');
  /* 요청받지 않은 막힌 칸은 서버가 요청에 넣는다(requestCorrection · 막힐 때 · 낼 때) — 화면은 요청받은 칸만 본다 */
  ok(goneViewsToPick(fix('verified', 'rejected', ['side'], { side: 'side-old', rear: 'rear-old' }), nothing).join() === 'side', '요청받지 않은 칸은 화면이 따로 보지 않는다');
  ok(pickViewText({ status: 'verified' } as never) === REPICK_VIEW_TEXT && pickViewText({ status: 'rejected' } as never) === REPICK_VIEW_TEXT, '살아 있는 칸은 새 영상을 골라 달라고 한다');
  ok(!REPICK_VIEW_TEXT.includes('지웠') && !REPICK_VIEW_TEXT.includes('지우') && !REPICK_VIEW_TEXT.includes('전송'), '살아 있는 칸을 지웠다거나 전송 중이라고 하지 않는다');

  /*
   * 검증 지적: 고침 중 새 파일이 이미 도착한 칸에도 '다시 골라 주세요'라고 했다. 칸 글도 막힘과 같은 판단으로 정한다.
   */
  ok(!slotNeedsRepick(fix('uploaded', 'verified', ['side']), 'side'), '새 파일이 도착한 칸은 다시 고르라고 하지 않는다');
  ok(slotNeedsRepick(fix('verified', 'verified', ['side'], { side: 'side-old' }), 'side'), '얼린 그 파일 그대로인 칸은 다시 고르라고 한다');
  ok(slotNeedsRepick(fix('purged', 'verified', ['side']), 'side'), '지운 칸은 다시 고르라고 한다');
  ok(!slotNeedsRepick(fix('verified', 'verified', ['rear'], { side: 'side-old' }), 'side'), '요청받지 않은 칸은 다시 고르라고 하지 않는다');

  /*
   * 검증 지적: 요청받은 칸에 얼린 파일과 같은 영상을 다시 고르면 화면이 막지 않았다. 서버는 얼린 자산을 그대로 돌려줘 같은 막힘이 되풀이됐다.
   * 고를 때 확인을 마친 얼린 파일과 견준다 — 서버의 same_as_sent 와 같은 판단이다.
   */
  const sentOf = (status: string, id = 'side-old', correction: unknown = { fields: [], views: ['side'], message: null }) =>
    sentAssetOf({ assets: { side: { id, status, sha256: 'f'.repeat(64) }, rear: null }, correction, frozenAssetIds: { side: 'side-old', rear: 'rear-old' } } as never, 'side');
  ok(sentOf('verified')?.sha256 === 'f'.repeat(64) && sentOf('unconfirmed') != null, '얼린 파일 그대로인 칸은 같은 영상인지 견준다');
  ok(sentOf('verified', 'side-new') == null, '새로 받은 칸은 견주지 않는다');
  ok([sentOf('rejected'), sentOf('purged'), sentOf('uploaded')].every((a) => a == null), '막혔거나 지웠거나 확인 전인 파일은 같은 영상을 다시 받는다');
  ok(sentOf('verified', 'side-old', null) == null, '고침이 아니면 견주지 않는다');
  ok(SAME_AS_SENT_TEXT === INTAKE_ERROR_TEXT.same_as_sent && !SAME_AS_SENT_TEXT.includes('—'), '고를 때와 서버가 같은 글이다');
  const flowSrc = readFileSync('components/intake/intake-flow.tsx', 'utf8');
  const repickSet = flowSrc.slice(flowSrc.indexOf('const REPICK'), flowSrc.indexOf('\n', flowSrc.indexOf('const REPICK')));
  ok(repickSet.includes("'same_as_sent'"), '서버가 같은 영상이라고 하면 그 칸을 다시 고르게 한다');
  ok(flowSrc.includes('sentAssetOf(data.state, view)') && flowSrc.includes('SAME_AS_SENT_TEXT'), '고를 때 얼린 파일과 견준다');
  /* 서버가 칸을 말한 'correction_incomplete' — 그 칸의 고른 파일을 비우고 칸 곁에 말한다 */
  ok(correctionStopViews({ code: 'correction_incomplete', detail: { views: ['rear', 'x'] } }).join() === 'rear', '서버가 말한 칸만 다시 고르게 한다');
  ok(correctionStopViews({ code: 'correction_incomplete', detail: { empty: ['side'] } }).length === 0, '칸이 없으면 비우지 않는다');
  ok(correctionStopViews({ code: 'stale_version', detail: { views: ['side'] } }).length === 0, '다른 까닭은 비우지 않는다');
  ok(flowSrc.includes('correctionStopViews(stop)'), '멈춤을 풀 때 그 칸을 비운다');

  /* 검증 지적: 끊긴 전송을 정리가 버려 칸이 비었다 — 요청받은 빈 칸도 새 파일을 골라야 낼 수 있다 */
  ok(goneViewsToPick(fix(null, 'purged', ['side', 'rear']), nothing).join() === 'side,rear', '정리가 비운 칸도 다시 골라야 한다');
  ok(goneViewsToPick(fix(null, 'purged', ['side', 'rear']), { side: {}, rear: {} }).length === 0, '둘 다 고르면 막지 않는다');
  ok(goneViewsToPick(fix(null, 'verified', ['rear']), nothing).length === 0, '요청받지 않은 빈 칸은 안 본다');
  ok(pickViewText(null) !== GONE_VIEW_TEXT && pickViewText({ status: 'purged' } as never) === GONE_VIEW_TEXT, '빈 칸은 지웠다고 안 하고 골라 달라고 한다');
  /* 검증 지적: 지우고 있는 칸도 '지웠어요'라고 했다 */
  ok(pickViewText({ status: 'purging' } as never) === '이 칸의 원본을 지우고 있어요. 영상을 다시 골라 주세요.', '지우고 있는 칸은 지우고 있다고 말한다');

  /* 검증 지적: 고침 화면의 막힘은 화면 차례(이름 → 영상 → 같은 투구 → 동의)로 고르고, 그 칸으로 초점을 옮긴다 */
  const fixCheck = { nameAsked: false, name: '', missing: [] as ('side' | 'rear')[], viewsAsked: true, same: false, needsConsent: true, docs, agreed: {} as Record<string, boolean> };
  assert.deepEqual(correctionProblem(fixCheck), { problem: 'same', target: 'fix-same-pitch' }, '같은 투구 칸이 동의 칸보다 위다');
  passed++;
  assert.deepEqual(correctionProblem({ ...fixCheck, same: true }), { problem: 'consent', target: 'consent-submission' }, '그다음 빠진 동의 칸');
  passed++;
  assert.deepEqual(correctionProblem({ ...fixCheck, missing: ['rear'] }), { problem: 'file', target: 'slot-rear' }, '영상 칸이 같은 투구보다 위다');
  passed++;
  assert.deepEqual(correctionProblem({ ...fixCheck, nameAsked: true, missing: ['rear'] }), { problem: 'name', target: 'fix-name' }, '이름이 맨 먼저');
  passed++;
  ok(correctionProblem({ ...fixCheck, same: true, agreed: { submission: true, overseas: true } }) === null, '다 채우면 막힘이 없다');
  ok(correctionProblem({ ...fixCheck, viewsAsked: false, needsConsent: false }) === null, '묻지 않은 칸으로는 안 막는다');

  /* 검증 지적: 고침 화면은 필수 동의만 보인다 — 보이지 않은 모델 동의를 '거부'로 적지 않는다 */
  const fixDocs = correctionConsentDocs(docs);
  ok(fixDocs.length === docs.filter((d) => d.required).length && fixDocs.every((d) => d.required), '고침은 필수 동의만 남긴다');
  const flow = readFileSync('components/intake/intake-flow.tsx', 'utf8');
  ok(flow.includes('consentAnswers(correctionConsentDocs(data.consentDocs), s.agreed)'), '고침 보내기가 그 목록으로 남긴다');
  ok(!readFileSync('components/intake/model-consent.tsx', 'utf8').includes('분석은 그대로 진행돼요'), '모델 동의 칸이 상태와 상관없는 말만 한다');
}

/* ────────────────────────── 14 동의 글 ────────────────────────── */
{
  const body = consentDocOf('submission').body;
  for (const word of ['나이대', '던지는 손', '보내는 분 이름', '영상 파일 이름', '촬영 시각', '기기', '위치', '그 관계']) ok(body.includes(word), `제출 글이 '${word}'을 말한다`);
  ok(/동의하지 않으면 영상을 접수할 수 없어요/.test(body), '거부의 효과를 말한다');
  ok(body.includes(consentDocOf('overseas').title) && !body.includes('관리자만'), '보는 사람 줄이 분석 서버 글을 가리킨다');
  ok(consentDocOf('overseas').body.includes('촬영 시각'), '국외 이전 글도 원본 안의 정보를 말한다');
  ok(consentDocOf('submission').version !== 'intake-submission-2026-11-06', '글을 고치면 판이 오른다');
  ok(consentDocOf('overseas').version.startsWith('intake-overseas-2026-11-06.2+'), '국외 이전 판도 오른다');

  /* 대리는 다른 글로 동의한다 */
  ok(isProxyRelation('coach') && isProxyRelation('parent') && !isProxyRelation('self') && !isProxyRelation(null), '대리 판정');
  ok(consentCheckLabel(true) !== consentCheckLabel(false) && consentCheckLabel(true).includes('대신'), '대리 동의 글이 다르다');
  ok(PROXY_CONSENT_NOTE.includes('기록'), '대리 안내가 기록된다고 말한다');

  /* 동의 글이 바뀌면 그 칸의 체크를 버린다 */
  const a = [{ kind: 'submission', version: '1', textHash: 'a' }, { kind: 'overseas', version: '1', textHash: 'b' }];
  const b = [{ kind: 'submission', version: '1', textHash: 'a' }, { kind: 'overseas', version: '2', textHash: 'c' }];
  const agreed = { submission: true, overseas: true };
  assert.deepEqual(agreedAfterDocs(agreed, a, b), { submission: true });
  passed++;
  ok(agreedAfterDocs(agreed, a, a) === agreed, '안 바뀌면 그대로');
  ok(agreedAfterDocs(agreed, null, b) === agreed, '처음 받을 때는 그대로');
  assert.deepEqual(changedConsentKinds(a, b), ['overseas']);
  passed++;
  ok(changedConsentKinds(null, b).length === 0, '처음 받을 때는 바뀐 것이 없다');
}

http.closeAllConnections();
http.close();
rmSync(dir, { recursive: true, force: true });
console.log(`intake transfer selftest: ${passed} 통과`);
