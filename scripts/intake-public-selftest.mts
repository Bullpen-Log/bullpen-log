/**
 * 공개 접수 API 시험 — 라우트 처리기를 그대로 부른다. `npm run intake:public-test`
 *
 * 운영 DB · 저장소를 건드리지 않는다: PGlite 에 external_intake 마이그레이션을 깔고, 저장소는 메모리 가짜다.
 * 화면이 쓰는 길(lib/intake/public-client.ts → 라우트, lib/intake/upload-run.ts)을 같이 돌려, 응답 유실 · 끊김 · 두 번 눌림을 본다.
 * 진짜 전송(TUS)은 intake:transfer-test 가 본다. 여기의 전송은 바이트를 가짜 저장소에 넣기만 한다.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { ConsentAnswer } from '@/lib/intake/consent';
import { IntakeError } from '@/lib/intake/errors';
import { createPublicApi, type PublicApi } from '@/lib/intake/public-api';
import { IntakeRequestError, createIntakeClient, type IntakeClient, type PublicStateResponse } from '@/lib/intake/public-client';
import { handlePublicResultRequest } from '@/lib/intake/publication';
import { INTAKE_RATE_RULES } from '@/lib/intake/rate-limit';
import { createInvitation, reissueInvitationToken, requestCorrection } from '@/lib/intake/service';
import type { IntakeRunStorage, IntakeStorage } from '@/lib/intake/storage-core';
import { IntakeUploadError, type RecoveryStore, type StartUploadOptions, type UploadHandle } from '@/lib/intake/upload-client';
import { RunStop, finalizeKey, finishRun, runUpload, type RunEvent, type RunItem } from '@/lib/intake/upload-run';
import { createSessionJar, mov120, mov240 } from './intake-fixtures.mts';

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

/* 공유 DB 에 적용하기 전에는 prisma/pending-migrations 에 둔다(그 폴더 README) */
const MIGRATION_ROOT = readdirSync('prisma').includes('pending-migrations') ? 'prisma/pending-migrations' : 'prisma/migrations';
const dirs = readdirSync(MIGRATION_ROOT).filter((d) => d.endsWith('_external_intake'));
const pg = await PGlite.create();
await pg.exec(readFileSync(`${MIGRATION_ROOT}/${dirs[0]}/migration.sql`, 'utf8'));
const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await socket.start();
const addr = (socket as unknown as { server: { address(): { port: number } } }).server.address();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${addr.port}/postgres?sslmode=disable`, max: 1 }) });

/* ── 가짜 저장소 ── */
const objects = new Map<string, Buffer>();
const storage: IntakeStorage = {
  uploadOrigin: 'https://proj.storage.supabase.co',
  async issueUpload(objectPath) {
    if (objects.has(objectPath)) throw new IntakeError('storage_unavailable', { cause: 'sign_upload' });
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
    return `https://signed.example/${p}`;
  },
  async list(prefix) {
    return [...objects.keys()].filter((k) => k.startsWith(prefix));
  },
  async remove(paths) {
    for (const p of paths) objects.delete(p);
  },
};

/* ── 시계 · 처리기 ── */
let clock = new Date('2026-11-06T03:00:00Z');
const DAY = 86_400_000;
const after: (() => Promise<unknown>)[] = [];
const api: PublicApi = createPublicApi({ db, storage: () => storage, schedule: (t) => after.push(t), now: () => clock });
const flushAfter = async () => {
  for (const t of after.splice(0)) await t();
};

/* 주소마다 다른 사람처럼 — 전체 횟수 제한에 다른 시험이 안 걸리게 */
let address = '10.0.0.1';
const nextAddress = () => (address = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`);

const ROUTES: Record<string, keyof PublicApi> = {
  session: 'gate',
  'session/enroll': 'enroll',
  'session/unlock': 'unlock',
  'session/end': 'endSession',
  state: 'state',
  draft: 'draft',
  consents: 'consents',
  'consents/withdraw': 'withdraw',
  assets: 'reserve',
  'assets/token': 'uploadToken',
  'assets/upload-url': 'uploadUrl',
  'assets/confirm': 'confirm',
  finalize: 'finalize',
};

/* 이름 · PIN 세션(R03) — 이 시험은 세션이 있는 사람의 공개 API 동작을 본다. 세션 규칙 자체는 intake-invitee-selftest */
const session = createSessionJar(db, () => clock);

/** 화면과 같은 client 를 라우트 처리기에 바로 잇는다 — 브라우저처럼 세션 쿠키를 싣는다 */
const dispatch: typeof fetch = async (input, init) => {
  const path = String(input).replace('/api/intake/public/', '');
  const handler = api[ROUTES[path]];
  return session.send(() => {
    const headers = new Headers(init?.headers);
    headers.set('x-forwarded-for', address);
    return new Request(`http://local${String(input)}`, { method: init?.method, headers, body: init?.body });
  }, handler);
};

/** cookie: null 이면 세션 쿠키를 싣지 않는다(세션 없는 요청) */
const raw = (path: string, init: { auth?: string | null; body?: string; type?: string | null; headers?: Record<string, string>; cookie?: null } = {}) => {
  const make = () => {
    const headers = new Headers({ 'x-forwarded-for': address, ...init.headers });
    if (init.auth) headers.set('authorization', init.auth);
    if (init.body !== undefined && init.type !== null) headers.set('content-type', init.type ?? 'application/json');
    return new Request(`http://local/api/intake/public/${path}`, { method: init.body === undefined ? 'GET' : 'POST', headers, body: init.body });
  };
  if (init.cookie === null) return api[ROUTES[path]](make());
  return session.send(make, api[ROUTES[path]]);
};

async function failsWith(p: Promise<unknown>, code: string, label: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof IntakeRequestError, `${label}: ${String(e)}`);
    assert.equal(e.code, code, label);
    return true;
  });
  if (process.env.V) console.log('ok', label);
  passed++;
}

const answers = (docs: PublicStateResponse['consentDocs'], model = false): ConsentAnswer[] =>
  docs.map((d) => ({ kind: d.kind, version: d.version, textHash: d.textHash, granted: d.required || model }));

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const memoryStore = (): RecoveryStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const key = () => randomBytes(16).toString('hex');

async function invite(extra: Partial<Parameters<typeof createInvitation>[1]> = {}) {
  const created = await createInvitation(db, { adminId: 'admin-1', ...extra }, clock);
  await session.enroll(created.token);
  return { ...created, client: createIntakeClient(created.token, dispatch), auth: `Intake ${created.token}` };
}

async function drafted(client: IntakeClient, name = '금윤호') {
  const { state, consentDocs } = await client.state();
  await client.saveDraft({ expectedVersion: state.version, athleteName: name, athleteAgeBand: '14_or_over', samePitchConfirmed: true });
  await client.recordConsents(answers(consentDocs));
}

/** 바이트를 가짜 저장소에 곧바로 넣는 전송 — 재현할 일을 끼워 넣을 수 있다 */
function fakeStart(items: Map<string, Buffer>, opts: { failOnce?: IntakeUploadError['code'][]; onStart?: (o: StartUploadOptions) => void } = {}) {
  const fails = [...(opts.failOnce ?? [])];
  return (o: StartUploadOptions): UploadHandle => {
    opts.onStart?.(o);
    const done = (async () => {
      o.onUploadUrl?.(`${storage.uploadOrigin}/storage/v1/upload/resumable/sign/${o.grant.objectName.replaceAll('/', '_')}`);
      const code = fails.shift();
      if (code) throw new IntakeUploadError(code);
      const bytes = items.get(o.sha256);
      assert.ok(bytes, '고른 파일의 바이트');
      objects.set(o.grant.objectName, bytes);
      o.onProgress?.(bytes.length, bytes.length);
    })();
    return { done, abort: async () => {} };
  };
}

const blob = (b: Buffer) => new Blob([new Uint8Array(b)]);
const item = (view: 'side' | 'rear', b: Buffer): RunItem => ({ view, file: blob(b), fileName: `${view}.MOV`, type: 'video/quicktime' });
const hashOf = (bufs: Map<string, Buffer>) => {
  const bySize = new Map([...bufs.values()].map((b) => [b.length, sha(b)]));
  return async (file: Blob, onProgress: (d: number, t: number) => void) => {
    onProgress(file.size, file.size);
    return bySize.get(file.size)!;
  };
};
const instant = async () => {};

function runDeps(client: IntakeClient, bufs: Map<string, Buffer>, start: (o: StartUploadOptions) => UploadHandle, submissionId: string, store = memoryStore()) {
  return { api: client, submissionId, pairConfirmed: true, hash: hashOf(bufs), start, store, sleep: instant };
}

const pairOf = () => {
  const side = mov240(4096 + Math.floor(Math.random() * 1000));
  const rear = mov120(9000 + Math.floor(Math.random() * 1000));
  return { side, rear, bufs: new Map([[sha(side), side], [sha(rear), rear]]) };
};
const signal = () => new AbortController().signal;

async function sent(client: IntakeClient, submissionId: string) {
  const pair = pairOf();
  await drafted(client);
  await runUpload(runDeps(client, pair.bufs, fakeStart(pair.bufs), submissionId), [item('side', pair.side), item('rear', pair.rear)], { side: null, rear: null }, () => {}, signal());
  return pair;
}

/* ───────────── 머리 · 토큰 ───────────── */
{
  const r = await raw('state');
  eq(r.status, 404, '토큰 없음은 404');
  const body = (await r.json()) as { error: { code: string } };
  eq(body.error.code, 'invitation_invalid', '토큰 없음의 코드');
  ok(r.headers.get('cache-control')?.includes('no-store'), '오류도 저장 금지');
  eq(r.headers.get('referrer-policy'), 'no-referrer', '오류도 Referer 없음');
  eq(r.headers.get('x-robots-tag'), 'noindex, nofollow', '색인 금지');

  const i = await invite();
  nextAddress();
  const fine = await raw('state', { auth: i.auth });
  eq(fine.status, 200, '맞는 토큰');
  /* 토큰만으로는 안 된다 — 이름 · PIN 세션이 없으면 상태도 못 본다(R03) */
  nextAddress();
  const bare = await raw('state', { auth: i.auth, cookie: null });
  eq([bare.status, ((await bare.json()) as { error: { code: string } }).error.code], [401, 'session_required'], '세션 쿠키 없는 맞는 토큰은 막힌다');
  nextAddress();
  ok(fine.headers.get('cache-control')?.includes('no-store'), '상태는 저장 금지');
  eq(fine.headers.get('vary'), 'Authorization, Cookie', 'Vary — 세션 쿠키로도 갈린다');
  const text = await fine.text();
  ok(!text.includes(i.token), '응답에 토큰이 없다');
  ok(!/admin-1|tokenHash|assignee|internalNote|objectPath/.test(text), '응답에 관리자 칸 · 저장 경로가 없다');
  const parsed = JSON.parse(text) as PublicStateResponse;
  eq(parsed.state.screen, 'welcome', '처음은 환영');
  eq(parsed.consentDocs.map((d) => d.kind), ['submission', 'overseas', 'model'], '동의 문서 셋');
  eq(parsed.consentDocs.find((d) => d.kind === 'model')?.defaultGranted, false, '선택 동의 기본은 꺼짐');

  /* 주소의 물음표로는 안 된다 */
  nextAddress();
  const query = await api.state(new Request(`http://local/api/intake/public/state?token=${i.token}`, { headers: { 'x-forwarded-for': address } }));
  eq(query.status, 404, '토큰을 주소로 받지 않는다');
  nextAddress();
  eq((await raw('state', { auth: `Bearer ${i.token}` })).status, 404, '다른 방식의 머리');

  /* 읽기는 접수를 안 바꾼다 */
  const before = await db.intakeSubmission.findUniqueOrThrow({ where: { id: i.submissionId } });
  await i.client.state();
  await i.client.state();
  const later = await db.intakeSubmission.findUniqueOrThrow({ where: { id: i.submissionId } });
  eq([later.version, later.updatedAt], [before.version, before.updatedAt], '상태 보기는 아무것도 안 바꾼다');
}

/* ───────────── 링크를 바꾼 직후의 예전 토큰 요청(2026-11-09 재검토 — 재발급 경합) ───────────── */
/*
 * 예전 토큰으로 범위를 연 바로 뒤 관리자가 링크를 바꾼다 — 그 요청은 쓰기 · 전송 토큰 발급을 끝내지 못하고, 새 링크는 같은 접수를 끝까지 잇는다.
 * PGlite 는 연결이 하나라 두 요청이 겹치지 않는다. 범위를 여는 조회(토큰 해시로 찾기) 뒤 · 저장소 서명 뒤에 재발급을 끼워 같은 순서를 만든다.
 */
{
  nextAddress();
  let rotateAfterLookup: (() => Promise<void>) | null = null;
  let rotateAfterSign: (() => Promise<void>) | null = null;
  const bind = (target: object, prop: string | symbol) => {
    const v = Reflect.get(target, prop, target) as unknown;
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
  };
  /* 자산을 읽은 뒤(ownedAsset) · 저장소를 본 뒤(stat)에 바뀜 — 잠그지 않은 읽기와 쓰기 사이의 창 */
  let rotateAfterAssetRead: (() => Promise<void>) | null = null;
  let rotateAfterStat: (() => Promise<void>) | null = null;
  const racingDb = new Proxy(db, {
    get(target, prop) {
      if (prop === 'intakeAsset') {
        return new Proxy(target.intakeAsset, {
          get(t, p) {
            if (p !== 'findFirst') return bind(t, p);
            return async (...args: unknown[]) => {
              const found = await (t.findFirst as (...a: unknown[]) => Promise<unknown>)(...args);
              const hook = rotateAfterAssetRead;
              rotateAfterAssetRead = null;
              if (hook) await hook();
              return found;
            };
          },
        });
      }
      if (prop !== 'intakeInvitation') return bind(target, prop);
      const delegate = target.intakeInvitation;
      return new Proxy(delegate, {
        get(t, p) {
          if (p !== 'findUnique') return bind(t, p);
          return async (...args: unknown[]) => {
            const found = await (t.findUnique as (...a: unknown[]) => Promise<unknown>)(...args);
            const hook = rotateAfterLookup;
            if (hook && (args[0] as { where?: { tokenHash?: string } } | undefined)?.where?.tokenHash) {
              rotateAfterLookup = null;
              await hook();
            }
            return found;
          };
        },
      });
    },
  });
  let signed = 0;
  const racingStorage: IntakeStorage = {
    ...storage,
    async issueUpload(p) {
      signed++;
      const grant = await storage.issueUpload(p);
      const hook = rotateAfterSign;
      rotateAfterSign = null;
      if (hook) await hook();
      return grant;
    },
    async stat(p) {
      const found = await storage.stat(p);
      const hook = rotateAfterStat;
      rotateAfterStat = null;
      if (hook) await hook();
      return found;
    },
  };
  const racingApi = createPublicApi({ db: racingDb, storage: () => racingStorage, schedule: (t) => after.push(t), now: () => clock });
  /* 세션이 막히면 같은 이름 · PIN 으로 다시 들어가 본다 — 예전 링크로는 다시 들어갈 수 없어(범위가 안 열린다) 막힌 답이 그대로 간다 */
  const racingDispatch: typeof fetch = async (input, init) => {
    const path = String(input).replace('/api/intake/public/', '');
    return session.send(() => {
      const headers = new Headers(init?.headers);
      headers.set('x-forwarded-for', address);
      return new Request(`http://local${String(input)}`, { method: init?.method, headers, body: init?.body });
    }, racingApi[ROUTES[path]]);
  };

  /* 결과 보기의 코드 자리까지 보려고 접근 코드를 건다 — 앞의 쓰기 · 전송은 코드와 무관하다 */
  const RESULT_CODE = 'bullpen-7';
  const i = await invite({ accessCode: RESULT_CODE });
  let token = i.token;
  let rotations = 0;
  const rotate = async () => {
    const old = token;
    token = (await reissueInvitationToken(db, { adminId: 'admin-1', submissionId: i.submissionId, expectedReissueCount: rotations }, clock)).token;
    /* 같은 사람이 새 링크에서 같은 이름 · PIN 을 넣는다(링크를 바꾸면 예전 세션은 막힌다) */
    session.remember(token, old);
    rotations++;
  };
  /** 지금 링크의 화면 */
  const current = () => createIntakeClient(token, dispatch);
  /** 지금 링크로 범위를 연 바로 뒤에 링크가 바뀌는 요청 */
  const raced = () => {
    rotateAfterLookup = rotate;
    return createIntakeClient(token, racingDispatch);
  };
  const refusedAfterRotate = async (p: Promise<unknown>, label: string) => {
    const n = rotations;
    await failsWith(p, 'invitation_invalid', label);
    eq(rotations, n + 1, `${label} — 그사이 링크가 바뀌었다`);
  };

  const { state, consentDocs } = await current().state();
  await refusedAfterRotate(raced().saveDraft({ expectedVersion: state.version, athleteName: '예전 링크', athleteAgeBand: '14_or_over', samePitchConfirmed: true }), '예전 토큰의 초안 저장');
  await refusedAfterRotate(raced().recordConsents(answers(consentDocs)), '예전 토큰의 동의');
  await refusedAfterRotate(raced().withdrawModelConsent(), '예전 토큰의 선택 동의 철회');
  const untouched = await db.intakeSubmission.findUniqueOrThrow({ where: { id: i.submissionId } });
  eq([untouched.version, untouched.athleteName, await db.intakeConsent.count({ where: { submissionId: i.submissionId } })], [state.version, null, 0], '막힌 쓰기는 아무것도 안 남긴다');

  await drafted(current());
  const pair = pairOf();
  const reserveSide = (c: IntakeClient) => c.reserveAsset({ view: 'side', expectedAssetId: null, fileName: 'side.MOV', sizeBytes: pair.side.length, declaredType: 'video/quicktime', sha256: sha(pair.side), pairConfirmed: true });
  await refusedAfterRotate(reserveSide(raced()), '예전 토큰의 파일 고르기');
  eq(await db.intakeAsset.count({ where: { submissionId: i.submissionId } }), 0, '막힌 고르기는 자산을 안 만든다');
  const r = await reserveSide(current());

  await refusedAfterRotate(raced().issueToken(r.asset.id), '예전 토큰의 전송 토큰');
  eq(signed, 0, '범위를 연 뒤 바뀌면 서명을 받기 전에 막는다');
  /* 서명을 받는 사이에 바뀜 — 받은 서명을 버린다 */
  rotateAfterSign = rotate;
  const before = rotations;
  await failsWith(createIntakeClient(token, racingDispatch).issueToken(r.asset.id), 'invitation_invalid', '서명을 받는 사이 링크가 바뀌면 전송 토큰을 안 준다');
  eq([signed, rotations], [1, before + 1], '서명은 받았지만 내주지 않았다');
  const row = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.asset.id } });
  eq([row.status, row.tokenCount, row.tokenIssuedAt], ['reserved', 0, null], '버린 서명은 자산에 안 남는다');
  await refusedAfterRotate(raced().registerUploadUrl(r.asset.id, `${storage.uploadOrigin}/storage/v1/upload/resumable/sign/x`), '예전 토큰의 업로드 주소');
  await refusedAfterRotate(raced().confirmUpload(r.asset.id), '예전 토큰의 도착 확인');
  await refusedAfterRotate(raced().state(), '예전 토큰의 상태 보기 — 초안 · 이름이 바뀐 링크로 안 나간다');

  /* 범위를 본 뒤(잠그지 않은 읽기)에 바뀜 — 업로드 주소 · 도착 확인은 잠근 채 다시 보고 쓰지 않는다 */
  const lateBefore = rotations;
  rotateAfterAssetRead = rotate;
  await failsWith(
    createIntakeClient(token, racingDispatch).registerUploadUrl(r.asset.id, `${storage.uploadOrigin}/storage/v1/upload/resumable/sign/late`),
    'invitation_invalid',
    '자산을 읽은 뒤 링크가 바뀌면 업로드 주소를 안 남긴다',
  );
  eq([rotations, (await db.intakeAsset.findUniqueOrThrow({ where: { id: r.asset.id } })).uploadUrl], [lateBefore + 1, null], '바뀐 뒤의 업로드 주소는 자산에 없다');
  const arrivedPath = (await db.intakeAsset.findUniqueOrThrow({ where: { id: r.asset.id } })).objectPath;
  objects.set(arrivedPath, pair.side);
  rotateAfterStat = rotate;
  await failsWith(createIntakeClient(token, racingDispatch).confirmUpload(r.asset.id), 'invitation_invalid', '저장소를 본 뒤 링크가 바뀌면 도착을 안 적는다');
  const notArrived = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.asset.id } });
  eq(
    [rotations, notArrived.status, notArrived.uploadedAt, await db.intakeJob.count({ where: { dedupeKey: `verify_asset:${r.asset.id}` } })],
    [lateBefore + 2, 'reserved', null, 0],
    '예전 토큰의 확인은 도착 · 검증 일감을 안 남긴다',
  );
  objects.delete(arrivedPath);
  eq((await raw('state', { auth: `Intake ${i.token}` })).status, 404, '처음 링크는 막혀 있다');

  /* 새 링크는 같은 접수를 끝까지 잇는다 — 같은 키의 완료도 그대로 */
  await runUpload(runDeps(current(), pair.bufs, fakeStart(pair.bufs), i.submissionId), [item('side', pair.side), item('rear', pair.rear)], { side: r.asset.id, rear: null }, () => {}, signal());
  const k = key();
  const receipt = await finishRun(current(), { idempotencyKey: k, expected: {} }, instant);
  ok(receipt.receiptCode.startsWith('IN-'), '새 링크로 끝낸다');
  await refusedAfterRotate(raced().finalize({ expectedVersion: 0, idempotencyKey: k }), '예전 토큰의 같은 키 완료 재시도');
  const again = await current().finalize({ expectedVersion: 0, idempotencyKey: k });
  eq([again.created, again.receiptCode, again.revision], [false, receipt.receiptCode, receipt.revision], '새 링크의 같은 키 재시도는 같은 영수증');
  eq(await db.intakeRevision.count({ where: { submissionId: i.submissionId } }), 1, '판은 하나');
  await flushAfter();

  /*
   * 결과 보기(POST /api/intake/public/result) — 범위를 연 바로 뒤 링크를 바꾸면 코드 자리를 잡지도, 틀린 횟수를 쌓지도, 결과를 내주지도 않는다.
   * 공개 판은 줄만 깐다(결과 파일 없음) — 맞는 코드면 코드 관문을 지나 'result_unavailable' 에서 멈춰, 관문을 지났는지 가를 수 있다.
   */
  nextAddress();
  const rev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: i.submissionId } });
  const pubRun = await db.intakeAnalysisRun.create({ data: { submissionId: i.submissionId, revisionId: rev.id, engineKey: 'race-test', status: 'succeeded', finishedAt: clock } });
  await db.intakePublication.create({ data: { submissionId: i.submissionId, runId: pubRun.id, number: 1, activeFor: i.submissionId, publishedByAdminId: 'admin-1', publishedAt: clock } });
  const resultStorage: IntakeRunStorage = {
    ...racingStorage,
    async resultUploadUrl() {
      throw new Error('결과 올리기는 안 쓴다');
    },
  };
  const resultCall = (viaRacing: boolean, accessCode: string) =>
    session.send(
      () =>
        new Request('https://x.test/api/intake/public/result', {
          method: 'POST',
          headers: { 'x-forwarded-for': address, 'content-type': 'application/json', authorization: `Intake ${token}` },
          body: JSON.stringify({ accessCode }),
        }),
      (req) => handlePublicResultRequest(req, { db: viaRacing ? racingDb : db, storage: resultStorage, now: () => clock }),
    );
  const errorOf = async (res: Response) => ((await res.json()) as { error?: { code: string } }).error?.code ?? `status ${res.status}`;
  const codeFailures = async () => (await db.intakeInvitation.findUniqueOrThrow({ where: { id: i.invitationId } })).accessCodeFailures;
  const racedResult = async (accessCode: string, label: string) => {
    const n = rotations;
    rotateAfterLookup = rotate;
    eq(await errorOf(await resultCall(true, accessCode)), 'invitation_invalid', label);
    eq(rotations, n + 1, `${label} — 그사이 링크가 바뀌었다`);
  };
  await racedResult('wrong-code-1', '예전 토큰의 틀린 코드는 맞혀 보지 않는다');
  await racedResult(RESULT_CODE, '예전 토큰의 맞는 코드도 결과를 안 받는다');
  eq(await codeFailures(), 0, '예전 토큰의 시도는 틀린 횟수에 안 쌓인다');
  eq(await errorOf(await resultCall(false, RESULT_CODE)), 'result_unavailable', '지금 링크의 맞는 코드는 관문을 지난다');
  eq(await errorOf(await resultCall(false, 'wrong-code-2')), 'access_code_wrong', '지금 링크의 틀린 코드는 막힌다');
  eq(await codeFailures(), 1, '지금 링크의 틀린 코드만 센다 — 라우트가 실제로 세는 길이다');
}

/* ───────────── 틀린 토큰 두드리기 · 횟수 ───────────── */
{
  nextAddress();
  let last: Response | null = null;
  for (let n = 0; n < 21; n++) last = await raw('state', { auth: `Intake ${'a'.repeat(43)}` });
  eq(last!.status, 429, '틀린 토큰은 횟수로 막힌다');
  ok(Number(last!.headers.get('retry-after')) > 0, 'Retry-After');

  nextAddress();
  const i = await invite();
  let hit: Response | null = null;
  for (let n = 0; n < 121; n++) hit = await raw('state', { auth: i.auth });
  eq(hit!.status, 429, '한 주소의 요청 횟수 제한');
}

/* ───────────── 입력 ───────────── */
{
  nextAddress();
  const i = await invite();
  const { state } = await i.client.state();
  eq((await raw('draft', { auth: i.auth, body: 'not json' })).status, 400, '깨진 JSON');
  eq((await raw('draft', { auth: i.auth, body: '[]' })).status, 400, '배열 몸통');
  eq((await raw('draft', { auth: i.auth, body: '{}', type: 'text/plain' })).status, 400, 'JSON 이 아닌 종류');
  eq((await raw('draft', { auth: i.auth, body: JSON.stringify({ expectedVersion: 'x' }) })).status, 400, '판 번호가 숫자가 아님');
  eq((await raw('draft', { auth: i.auth, body: JSON.stringify({ expectedVersion: state.version, pad: 'x'.repeat(40_000) }) })).status, 400, '너무 큰 몸통');

  await failsWith(i.client.saveDraft({ expectedVersion: state.version, athleteName: '   ' }), 'athlete_name_required', '빈 이름');
  await failsWith(i.client.saveDraft({ expectedVersion: state.version, athleteName: 'ㄱ'.repeat(41) }), 'athlete_name_invalid', '긴 이름');
  const { version } = await i.client.saveDraft({ expectedVersion: state.version, athleteName: '  김 민수  ' });
  await failsWith(i.client.saveDraft({ expectedVersion: state.version, athleteName: '다른 이름' }), 'stale_version', '낡은 판으로 저장');
  const after1 = (await i.client.state()).state;
  eq(after1.draft.athleteName, '김 민수', '이름을 다듬어 저장');
  eq(after1.screen, 'side', '이름까지 적은 초안은 옆 영상에서 다시');
  await i.client.saveDraft({ expectedVersion: version, athleteName: "O'Neil-Smith Jr." });
  eq((await i.client.state()).state.draft.athleteName, "O'Neil-Smith Jr.", '외국 이름');
}

/* ───────────── 동의 전에는 바이트가 못 간다 ───────────── */
{
  nextAddress();
  const i = await invite();
  const { state, consentDocs } = await i.client.state();
  await i.client.saveDraft({ expectedVersion: state.version, athleteName: '금윤호', athleteAgeBand: '14_or_over' });
  const b = mov240(2000);
  const r = await i.client.reserveAsset({ view: 'side', expectedAssetId: null, fileName: 'a.MOV', sizeBytes: b.length, declaredType: 'video/quicktime', sha256: sha(b) });
  await failsWith(i.client.issueToken(r.asset.id), 'consent_required', '동의 전 전송 토큰 없음');
  const partial = consentDocs.filter((d) => d.kind === 'overseas').map((d) => ({ kind: d.kind, version: d.version, textHash: d.textHash, granted: true }));
  await i.client.recordConsents(partial);
  await failsWith(i.client.issueToken(r.asset.id), 'consent_required', '선택(국외 이전)만으로는 안 된다');
  await failsWith(i.client.recordConsents(answers(consentDocs).map((a) => (a.kind === 'submission' ? { ...a, granted: false } : a))), 'consent_required', '필수를 거절할 수 없다');
  await failsWith(i.client.recordConsents(answers(consentDocs).map((a) => ({ ...a, textHash: 'x' }))), 'consent_stale', '다른 글에 대한 동의');
  /* 수동 수집(R03 Q-R03-2): 국외 이전을 거부해도 접수는 된다 */
  ok((await i.client.recordConsents(answers(consentDocs).map((a) => (a.kind === 'overseas' ? { ...a, granted: false } : a)))).requiredOk, '국외 이전을 거부해도 필수는 찼다');
  eq((await i.client.state()).state.consent.granted.overseas, false, '국외 이전은 거부로 남는다');
  const grant = await i.client.issueToken(r.asset.id);
  ok(grant.objectName.startsWith(`sub/${i.submissionId}/`) && !JSON.stringify(grant).includes('금윤호'), '경로는 서버가 정하고 이름이 없다');
  ok(!JSON.stringify(grant).toLowerCase().includes('service'), 'service role 키가 안 나간다');

  /* 저장소 밖 주소는 안 받는다 */
  await failsWith(i.client.registerUploadUrl(r.asset.id, 'https://evil.example/storage/v1/upload/resumable/x'), 'upload_url_invalid', '다른 곳의 전송 주소');
  /* 선택 동의는 따로 */
  const rows = await db.intakeConsent.findMany({ where: { submissionId: i.submissionId, kind: 'model' } });
  ok(rows.every((c) => c.granted === false), '선택 동의는 켜지 않으면 꺼진 채로');
}

/* ───────────── 전체 흐름 ───────────── */
{
  nextAddress();
  const i = await invite();
  await drafted(i.client);
  const pair = pairOf();
  const events: RunEvent[] = [];
  const storeForRun = memoryStore();
  await runUpload(runDeps(i.client, pair.bufs, fakeStart(pair.bufs), i.submissionId, storeForRun), [item('side', pair.side), item('rear', pair.rear)], { side: null, rear: null }, (e) => events.push(e), signal());
  eq(events.filter((e) => e.type === 'stage').map((e) => (e as { stage: string }).stage), ['prepare', 'send', 'confirm'], '준비 → 보내기 → 확인');
  const reservedAt = events.findIndex((e) => e.type === 'reserved');
  ok(events.findIndex((e) => e.type === 'send') > events.findLastIndex((e) => e.type === 'reserved') && reservedAt > 0, '두 칸을 다 잡은 뒤에 보낸다');
  await flushAfter();

  const mid = (await i.client.state()).state;
  eq(mid.screen, 'upload', '둘 다 도착, 접수 전');
  eq(mid.assets.side?.integrity, '선택한 파일 그대로 전송됨', '서버 해시가 맞은 뒤에만 그대로 전송됨');
  eq(mid.assets.side?.fps, '240fps 감지', 'fps 는 감지로만 말한다');
  eq(mid.receipt, null, '완료 전 영수증 없음');

  const idem = finalizeKey(storeForRun, i.submissionId, 0, key);
  eq(finalizeKey(storeForRun, i.submissionId, 0, key), idem, '같은 판의 완료 키는 그대로');
  ok(finalizeKey(storeForRun, i.submissionId, 1, key) !== idem, '다음 판은 새 키');

  const first = await finishRun(i.client, { idempotencyKey: idem, expected: {} }, instant);
  eq(first.created, true, '영수증');
  await flushAfter();
  /* 두 번 눌림 · 응답 유실 */
  const again = await i.client.finalize({ expectedVersion: 0, idempotencyKey: idem });
  eq([again.created, again.receiptCode, again.revision], [false, first.receiptCode, first.revision], '같은 키는 같은 영수증');
  const other = await i.client.finalize({ expectedVersion: 0, idempotencyKey: key() });
  eq([other.created, other.receiptCode], [false, first.receiptCode], '다른 키로도 새 판이 안 생긴다');
  eq(await db.intakeRevision.count({ where: { submissionId: i.submissionId } }), 1, '판은 하나');

  const done = (await i.client.state()).state;
  eq([done.screen, done.submissionStatus, done.analysisStatus], ['receipt', 'verified', 'ready'], '검증 뒤 분석 대기');
  ok(done.receipt?.code === first.receiptCode, '영수증이 상태에 있다');
  await failsWith(i.client.saveDraft({ expectedVersion: done.version, athleteName: '바꿈' }), 'not_editable', '접수 뒤 글을 못 바꾼다');
  ok(!objects.get((await db.intakeAsset.findFirstOrThrow({ where: { submissionId: i.submissionId, view: 'side' } })).objectPath)!.compare(pair.side), '저장소의 바이트 = 고른 파일');

  /* 선택 동의 거두기 — 다른 것은 못 거둔다 */
  nextAddress();
  eq((await raw('consents/withdraw', { auth: i.auth, body: JSON.stringify({ kind: 'submission' }) })).status, 400, '필수 동의는 화면에서 못 거둔다');
}

/* ───────────── 선택 동의 켜고 거두기 ───────────── */
{
  nextAddress();
  const i = await invite();
  const { state, consentDocs } = await i.client.state();
  await i.client.saveDraft({ expectedVersion: state.version, athleteName: '금윤호', athleteAgeBand: '14_or_over' });
  await i.client.recordConsents(answers(consentDocs, true));
  ok((await i.client.state()).state.consent.granted.model, '선택 동의를 켰다');
  await i.client.withdrawModelConsent();
  const s = (await i.client.state()).state;
  eq([s.consent.granted.model, s.consent.requiredOk], [false, true], '선택 동의만 거뒀다');
}

/* ───────────── 같은 파일 · 뒤 실패에도 옆은 산다 ───────────── */
{
  nextAddress();
  const i = await invite();
  await drafted(i.client);
  const b = mov240(5000);
  const map = new Map([[sha(b), b]]);
  await assert.rejects(
    runUpload(runDeps(i.client, map, fakeStart(map), i.submissionId), [item('side', b), item('rear', b)], { side: null, rear: null }, () => {}, signal()),
    (e: RunStop) => e.code === 'same_file' && e.view === 'rear',
  );
  passed++;
  const s = (await i.client.state()).state;
  ok(s.assets.side != null && s.assets.rear == null, '뒤가 막혀도 옆 선택은 남는다');
  eq(s.screen, 'upload_recovery', '다시 왔을 때 이어서 보내기');
  ok(objects.size > 0 && ![...objects.keys()].some((k) => k.includes(i.submissionId)), '바이트를 보내기 전에 막았다');
}

/* ───────────── 끊김 · 이어 보내기 ───────────── */
{
  nextAddress();
  const i = await invite();
  await drafted(i.client);
  const pair = pairOf();
  const items = [item('side', pair.side), item('rear', pair.rear)];
  const urls: string[] = [];
  const start = fakeStart(pair.bufs, { failOnce: ['network'], onStart: (o) => urls.push(o.grant.objectName) });
  const deps = runDeps(i.client, pair.bufs, start, i.submissionId);
  const known = { side: null as string | null, rear: null as string | null };
  await assert.rejects(
    runUpload(deps, items, known, (e) => {
      if (e.type === 'reserved') known[e.view] = e.asset.id;
    }, signal()),
    (e: RunStop) => e.code === 'network' && e.view === 'side',
  );
  passed++;
  const before = await db.intakeAsset.count({ where: { submissionId: i.submissionId } });
  const s0 = (await i.client.state()).state;
  eq(s0.screen, 'upload_recovery', '끊기면 이어서 보내기');
  ok(s0.assets.side?.status === 'uploading', '옆은 전송 중');
  ok(s0.assets.side?.sha256 === sha(pair.side), '다시 고른 파일을 견줄 해시');

  await runUpload(deps, items, known, () => {}, signal());
  eq(await db.intakeAsset.count({ where: { submissionId: i.submissionId } }), before, '다시 보내도 자산이 안 늘어난다');
  eq(urls[0], urls[1], '같은 경로로 이어 간다');
  const row = await db.intakeAsset.findFirstOrThrow({ where: { id: s0.assets.side!.id } });
  ok(row.uploadUrl != null, '업로드 주소를 서버에 남겼다');

  /* 끝난 뒤 다시 눌러도 전송을 안 한다 */
  let startedAgain = 0;
  await runUpload(runDeps(i.client, pair.bufs, fakeStart(pair.bufs, { onStart: () => startedAgain++ }), i.submissionId), items, known, () => {}, signal());
  eq(startedAgain, 0, '도착한 영상은 다시 안 보낸다');
}

/* ───────────── 저장소에는 끝났는데 응답을 잃음 ───────────── */
{
  nextAddress();
  const i = await invite();
  await drafted(i.client);
  const pair = pairOf();
  /* 마지막 조각 뒤 'conflict' — 이미 끝난 것을 저장소에서 확인한다 */
  const conflictStart = (o: StartUploadOptions): UploadHandle => {
    objects.set(o.grant.objectName, pair.bufs.get(o.sha256)!);
    return { done: Promise.reject(new IntakeUploadError('conflict')), abort: async () => {} };
  };
  await runUpload(runDeps(i.client, pair.bufs, conflictStart, i.submissionId), [item('side', pair.side), item('rear', pair.rear)], { side: null, rear: null }, () => {}, signal());
  eq((await i.client.state()).state.screen, 'upload', 'conflict 뒤 저장소를 물어 도착으로 친다');

  /* 저장소에 없는 conflict 는 도착이 아니다 */
  nextAddress();
  const j = await invite();
  await drafted(j.client);
  const nothing = (): UploadHandle => ({ done: Promise.reject(new IntakeUploadError('conflict')), abort: async () => {} });
  await assert.rejects(
    runUpload(runDeps(j.client, pair.bufs, nothing, j.submissionId), [item('side', pair.side)], { side: null, rear: null }, () => {}, signal()),
    (e: RunStop) => e.code === 'conflict',
  );
  passed++;
}

/* ───────────── 완료 응답 유실 ───────────── */
{
  nextAddress();
  const i = await invite();
  await sent(i.client, i.submissionId);
  /* 서버는 처리했는데 응답을 못 받은 첫 번 */
  let calls = 0;
  const lossy: IntakeClient = {
    ...i.client,
    finalize: async (input) => {
      const r = await i.client.finalize(input);
      if (++calls === 1) throw new IntakeRequestError('network', '끊김');
      return r;
    },
  };
  const k = key();
  const receipt = await finishRun(lossy, { idempotencyKey: k, expected: {} }, instant);
  eq(calls, 2, '응답을 잃으면 같은 키로 다시 부른다');
  ok(receipt.receiptCode.startsWith('IN-'), '다시 불러 영수증을 받는다');
  eq(await db.intakeRevision.count({ where: { submissionId: i.submissionId } }), 1, '응답을 잃어도 판은 하나');
  await flushAfter();
}

/* ───────────── 다른 기기가 칸을 바꿈 ───────────── */
{
  nextAddress();
  const i = await invite();
  const pair = await sent(i.client, i.submissionId);
  const s = (await i.client.state()).state;
  const b = mov120(7777);
  const fresh = await i.client.reserveAsset({ view: 'rear', expectedAssetId: s.assets.rear!.id, fileName: 'other.MOV', sizeBytes: b.length, declaredType: null, sha256: sha(b) });
  await failsWith(
    i.client.reserveAsset({ view: 'rear', expectedAssetId: s.assets.rear!.id, fileName: 'x.MOV', sizeBytes: 123, declaredType: null, sha256: sha(Buffer.from('x')) }),
    'stale_selection',
    '낡은 칸 번호로 바꾸기',
  );
  await assert.rejects(
    finishRun(i.client, { idempotencyKey: key(), expected: { rear: s.assets.rear!.id } }, instant),
    (e: RunStop) => e.code === 'stale_selection' && e.view === 'rear',
  );
  passed++;
  eq(await db.intakeRevision.count({ where: { submissionId: i.submissionId } }), 0, '바뀐 칸을 몰래 얼리지 않는다');
  await failsWith(i.client.finalize({ expectedVersion: fresh.version - 1, idempotencyKey: key() }), 'stale_version', '낡은 판으로 완료');
  await failsWith(i.client.finalize({ expectedVersion: fresh.version, idempotencyKey: key() }), 'same_pitch_required', '칸이 바뀌면 같은 투구를 다시 확인한다');
  await failsWith(i.client.finalize({ expectedVersion: fresh.version, idempotencyKey: key(), samePitchConfirmed: true }), 'assets_incomplete', '도착 안 한 칸으로 완료');
  const stale = await raw('finalize', {
    auth: i.auth,
    body: JSON.stringify({ expectedVersion: fresh.version, idempotencyKey: key(), samePitchConfirmed: true, expectedAssets: { rear: s.assets.rear!.id } }),
  });
  eq([stale.status, ((await stale.json()) as { error: { code: string } }).error.code], [409, 'stale_selection'], '화면이 본 짝이 아니면 안 얼린다');
  eq((await raw('finalize', { auth: i.auth, body: JSON.stringify({ expectedVersion: fresh.version, idempotencyKey: key(), expectedAssets: 'x' }) })).status, 400, '짝 모양이 틀리면 막는다');
  ok(pair.side.length > 0, '옆은 그대로');
  await flushAfter();
}

/* ───────────── 남의 자산 ───────────── */
{
  nextAddress();
  const a = await invite();
  await drafted(a.client);
  const b = await invite();
  await drafted(b.client);
  const bytes = mov240(3000);
  const r = await a.client.reserveAsset({ view: 'side', expectedAssetId: null, fileName: 'a.MOV', sizeBytes: bytes.length, declaredType: null, sha256: sha(bytes) });
  await failsWith(b.client.issueToken(r.asset.id), 'asset_not_found', '남의 자산으로 전송 토큰');
  await failsWith(b.client.confirmUpload(r.asset.id), 'asset_not_found', '남의 자산 확인');
  await failsWith(b.client.registerUploadUrl(r.asset.id, `${storage.uploadOrigin}/storage/v1/upload/resumable/x`), 'asset_not_found', '남의 자산 주소');
  await failsWith(a.client.issueToken('../../etc/passwd'), 'asset_not_found', '경로 같은 번호');
}

/* ───────────── 만 14세 미만 ───────────── */
{
  nextAddress();
  const i = await invite();
  const { state, consentDocs } = await i.client.state();
  const { version } = await i.client.saveDraft({ expectedVersion: state.version, athleteName: '어린 선수', athleteAgeBand: 'under_14', submitterRelation: 'parent' });
  eq((await i.client.state()).state.screen, 'under_14', '만 14세 미만 화면');
  await failsWith(i.client.recordConsents(answers(consentDocs)), 'under_14', '보호자가 대신 동의해도 막는다');
  const b = mov240(100);
  await failsWith(i.client.reserveAsset({ view: 'side', expectedAssetId: null, fileName: 'a', sizeBytes: b.length, sha256: sha(b) }), 'under_14', '칸을 못 잡는다');
  await i.client.saveDraft({ expectedVersion: version, athleteAgeBand: '14_or_over' });
  eq((await i.client.state()).state.screen, 'welcome', '잘못 고른 나이는 고칠 수 있다 — 이름은 안 남겼으니 처음부터 적는다');
}

/* ───────────── 만료 · 폐기 ───────────── */
{
  nextAddress();
  const i = await invite({ uploadExpiresAt: new Date(clock.getTime() + DAY) });
  await drafted(i.client);
  const bytes = mov240(3000);
  const r = await i.client.reserveAsset({ view: 'side', expectedAssetId: null, fileName: 'a.MOV', sizeBytes: bytes.length, declaredType: null, sha256: sha(bytes) });
  await i.client.issueToken(r.asset.id);
  objects.set((await db.intakeAsset.findUniqueOrThrow({ where: { id: r.asset.id } })).objectPath, bytes);

  const real = clock;
  clock = new Date(clock.getTime() + 2 * DAY);
  eq((await i.client.state()).state.screen, 'upload_expired', '기간이 끝나면 그 화면');
  await failsWith(i.client.issueToken(r.asset.id), 'upload_expired', '새 전송 토큰 없음');
  await failsWith(i.client.saveDraft({ expectedVersion: 1, athleteName: '다른' }), 'upload_expired', '글도 못 바꾼다');
  const confirmed = await i.client.confirmUpload(r.asset.id);
  ok(confirmed.status === 'uploaded', '끝난 전송의 확인은 기간 뒤에도 된다');
  await flushAfter();
  clock = real;

  nextAddress();
  const v = await invite();
  await sent(v.client, v.submissionId);
  await db.intakeInvitation.update({ where: { id: v.invitationId }, data: { status: 'revoked', revokedAt: clock } });
  const res = await raw('state', { auth: v.auth });
  eq(res.status, 403, '폐기된 초대는 상태도 못 본다');
  eq(((await res.json()) as { error: { code: string } }).error.code, 'invitation_revoked', '폐기 코드');
  await failsWith(v.client.finalize({ expectedVersion: 1, idempotencyKey: key() }), 'invitation_revoked', '폐기 뒤 완료 없음');
  await flushAfter();
}

/* ───────────── 고침 요청 ───────────── */
{
  nextAddress();
  const i = await invite();
  await sent(i.client, i.submissionId);
  const store = memoryStore();
  const k0 = finalizeKey(store, i.submissionId, 0, key);
  await finishRun(i.client, { idempotencyKey: k0, expected: {} }, instant);
  await flushAfter();
  const s0 = (await i.client.state()).state;
  await requestCorrection(db, { adminId: 'admin-1', submissionId: i.submissionId, fields: ['athleteName'], views: ['rear'], message: '뒤 영상이 잘렸어요' }, clock);

  const s1 = (await i.client.state()).state;
  eq([s1.screen, s1.correction?.fields, s1.correction?.views, s1.correction?.message], ['correction', ['athleteName'], ['rear'], '뒤 영상이 잘렸어요'], '요청받은 칸만 다시 연다');
  await failsWith(i.client.saveDraft({ expectedVersion: s1.version, throwingHand: 'L' }), 'not_editable', '요청 안 한 칸은 못 고친다');
  const b = mov240(4000);
  await failsWith(i.client.reserveAsset({ view: 'side', expectedAssetId: s1.assets.side!.id, fileName: 'x', sizeBytes: b.length, sha256: sha(b) }), 'not_editable', '요청 안 한 영상은 못 바꾼다');
  await failsWith(i.client.finalize({ expectedVersion: s1.version, idempotencyKey: key() }), 'correction_incomplete', '안 고치고는 못 낸다');

  await i.client.saveDraft({ expectedVersion: s1.version, athleteName: '고친 이름' });
  const map = new Map([[sha(b), b]]);
  const round = s1.receipt?.revision ?? 0;
  await runUpload(runDeps(i.client, map, fakeStart(map), i.submissionId, store), [item('rear', b)], { side: s1.assets.side!.id, rear: s1.assets.rear!.id }, () => {}, signal());
  const k1 = finalizeKey(store, i.submissionId, round, key);
  ok(k1 !== k0, '고친 뒤에는 새 완료 키');
  const r = await finishRun(i.client, { idempotencyKey: k1, expected: {}, samePitchConfirmed: true }, instant);
  eq([r.revision, r.created, r.receiptCode], [2, true, s0.receipt?.code], '같은 접수 번호의 새 판');
  await flushAfter();
  const s2 = (await i.client.state()).state;
  eq([s2.screen, s2.submissionStatus], ['receipt', 'verified'], '고친 뒤 다시 접수');
  ok(s2.assets.rear!.id !== s1.assets.rear!.id, '새 자산이다');
  const old = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: i.submissionId, number: 1 } });
  eq(old.rearAssetId, s1.assets.rear!.id, '옛 판은 옛 자산을 그대로 가리킨다');
}

/* ───────────── 원본이 다르게 도착 ───────────── */
{
  nextAddress();
  const i = await invite();
  await drafted(i.client);
  const pair = pairOf();
  const wrong = (o: StartUploadOptions): UploadHandle => {
    const b = pair.bufs.get(o.sha256)!;
    const copy = Buffer.from(b);
    copy[copy.length - 1] ^= 0xff;
    objects.set(o.grant.objectName, copy);
    return { done: Promise.resolve(), abort: async () => {} };
  };
  await runUpload(runDeps(i.client, pair.bufs, wrong, i.submissionId), [item('side', pair.side)], { side: null, rear: null }, () => {}, signal());
  await flushAfter();
  const s = (await i.client.state()).state;
  eq([s.assets.side?.status, s.assets.side?.rejectCode, s.assets.side?.integrity], ['rejected', 'hash_mismatch', '영상 정보 확인 필요'], '바이트가 다르면 그대로 전송됨이라 안 한다');
  eq(s.screen, 'upload_recovery', '다시 고르게 한다');
  /* 같은 파일을 다시 골라도 막히지 않는다 */
  const again = await i.client.reserveAsset({ view: 'side', expectedAssetId: s.assets.side!.id, fileName: 'side.MOV', sizeBytes: pair.side.length, declaredType: null, sha256: sha(pair.side) });
  ok(again.created && again.asset.id !== s.assets.side!.id, '거절된 칸은 새 자산으로');
}

/* ───────────── 로그에 토큰이 없다 ───────────── */
{
  nextAddress();
  const i = await invite();
  const logged: string[] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => void logged.push(a.map(String).join(' '));
  const broken = createPublicApi({
    db: new Proxy(db, { get: (t, p) => (p === 'intakeSubmission' ? new Proxy({}, { get: () => () => Promise.reject(new Error(`boom ${i.token}`)) }) : Reflect.get(t, p)) }) as PrismaClient,
    storage: () => storage,
    now: () => clock,
  });
  const res = await broken.state(new Request('http://local/x', { headers: { authorization: i.auth, 'x-forwarded-for': address, cookie: session.header() } }));
  console.error = realError;
  eq(res.status, 500, '모르는 오류는 500');
  const out = await res.text();
  ok(!out.includes(i.token) && !out.includes('boom'), '응답에 내부 글이 없다');
  ok(logged.length === 1 && !logged[0].includes(i.token) && !logged[0].includes('boom'), '로그에 토큰 · 내부 글이 없다');
}

/* ───────────── 휴대폰 브라우저 길 ───────────── */
{
  /* proxy.ts 는 next/server 를 불러 node 로 바로 못 띄운다 — 열린 주소 규칙만 꺼내 견준다. 실제 동작은 production 서버로 따로 본다 */
  const src = readFileSync('proxy.ts', 'utf8');
  const open = new RegExp(/const OPEN =\s*\/(.*)\/;/.exec(src)![1]);
  ok(open.test('/submit'), '휴대폰 브라우저가 /submit 을 연다');
  ok(!open.test('/submit/x') && !open.test('/submitted'), '/submit 하나만 연다');
  ok(!open.test('/today') && !open.test('/admin'), '다른 싱커 화면은 그대로 막힌다');
}

/* ───────────── 빈 철회로 기록 밀어내기 ───────────── */
{
  nextAddress();
  const i = await invite();
  const { state, consentDocs } = await i.client.state();
  await i.client.saveDraft({ expectedVersion: state.version, athleteName: '금윤호', athleteAgeBand: '14_or_over' });
  await i.client.recordConsents(answers(consentDocs, true));
  const hit = () => raw('consents/withdraw', { auth: i.auth, body: JSON.stringify({ kind: 'model' }) });
  const seen: number[] = [];
  for (let n = 0; n < 12; n++) seen.push((await hit()).status);
  eq(seen.filter((s) => s === 200).length, 10, '초대마다 횟수를 묶는다');
  eq(seen.slice(-1)[0], 429, '넘으면 기다린다');
  eq(await db.intakeAudit.count({ where: { submissionId: i.submissionId, action: 'consent.withdrawn' } }), 1, '실제로 거둔 한 번만 남는다');
}

/* ───────────── 동의 글의 판이 바뀐 뒤 ───────────── */
{
  nextAddress();
  const i = await invite();
  await sent(i.client, i.submissionId);
  await flushAfter();
  await i.client.finalize({ expectedVersion: (await i.client.state()).state.version, idempotencyKey: key(), samePitchConfirmed: true });
  await flushAfter();
  await db.intakeConsent.updateMany({ where: { submissionId: i.submissionId, kind: 'overseas' }, data: { docVersion: 'old', textHash: 'old' } });
  eq((await i.client.state()).state.needsReconsent, false, '선택(국외 이전) 글만 낡으면 다시 묻지 않는다');
  await db.intakeConsent.updateMany({ where: { submissionId: i.submissionId, kind: 'submission' }, data: { docVersion: 'old', textHash: 'old' } });
  await db.intakeInvitation.update({ where: { id: i.invitationId }, data: { uploadExpiresAt: new Date(clock.getTime() - 1000) } });
  const { state, consentDocs } = await i.client.state();
  ok(state.needsReconsent, '다시 동의를 화면에 알린다');
  ok((await i.client.recordConsents(answers(consentDocs))).requiredOk, '기간이 끝나도 동의 라우트가 받는다');
  eq((await i.client.state()).state.needsReconsent, false, '받으면 꺼진다');

  const d = await invite();
  const first = await i.client.state();
  ok(first.state.uploadExpired, '기간이 끝난 접수');
  await db.intakeInvitation.update({ where: { id: d.invitationId }, data: { uploadExpiresAt: new Date(clock.getTime() - 1000) } });
  const docs = (await d.client.state()).consentDocs;
  await failsWith(d.client.recordConsents(answers(docs)), 'upload_expired', '초안의 동의 라우트는 기간을 본다');
}

/* ───────────── 고침 × 공개 상태 칸 ───────────── */
{
  nextAddress();
  const i = await invite();
  const s0 = (await i.client.state()).state;
  ok(!s0.resultAvailable && s0.correctionStatusLine === null && !s0.needsReconsent && !s0.assetsOnFile && !s0.accessCodeLocked, '처음에는 다 꺼져 있다');
}

/* ───────────── 메타 ───────────── */
{
  const layout = readFileSync('app/(intake)/layout.tsx', 'utf8');
  ok(/index: false/.test(layout) && /referrer: 'no-referrer'/.test(layout), '색인 금지 · Referer 없음');
  ok(/'\/submit'/.test(readFileSync('app/robots.ts', 'utf8')), 'robots 가 막는다');
  const page = readFileSync('app/(intake)/submit/page.tsx', 'utf8');
  ok(!/getCurrentUser|requireUser|prisma/.test(page + layout), '화면 틀은 로그인 · DB 를 안 읽는다');
}

/* ─────────────────────── 동의를 뒤집어 기록을 채우지 못한다 ─────────────────────── */
{
  clock = new Date(clock.getTime() + 86_400_000);
  const i = await invite();
  await drafted(i.client);
  const { consentDocs } = await i.client.state();
  let last = 200;
  const statuses: number[] = [];
  for (let n = 0; n < 40; n++) {
    /* 모델 동의 하나만 뒤집는다 — answers 의 model 인자는 선택 동의(국외 이전 포함)를 다 켠다 */
    const body = JSON.stringify({ answers: answers(consentDocs).map((x) => (x.kind === 'model' ? { ...x, granted: n % 2 === 0 } : x)) });
    /* 주소를 바꿔도 초대별로 센다 */
    last = (await raw('consents', { auth: i.auth, body, headers: { 'x-forwarded-for': `203.0.113.${n}` } })).status;
    statuses.push(last);
  }
  eq(last, 429, '한 초대의 동의 쓰기는 묶인다');
  ok(statuses.filter((s) => s === 200).length <= INTAKE_RATE_RULES.consent.limit, '창 안의 쓰기는 한도까지다');
  ok((await db.intakeAudit.count({ where: { submissionId: i.submissionId, action: 'consent.recorded' } })) <= INTAKE_RATE_RULES.consent.limit + 2, '감사 줄도 한도까지다');

  /* 나이 답을 뒤집어도 같다 */
  const j = await invite();
  let v = (await j.client.state()).state.version;
  let hit = 0;
  for (let n = 0; n < INTAKE_RATE_RULES.draft.limit + 5; n++) {
    const r = await raw('draft', { auth: j.auth, body: JSON.stringify({ expectedVersion: v, athleteAgeBand: n % 2 ? '14_or_over' : 'under_14' }), headers: { 'x-forwarded-for': `198.51.100.${n % 200}` } });
    if (r.status === 429) hit++;
    else v = ((await r.json()) as { version: number }).version;
  }
  ok(hit > 0, '한 초대의 초안 쓰기도 묶인다');
}

await db.$disconnect();
await socket.stop();
await pg.close();
console.log(`intake public: ${passed} 통과`);
process.exit(0);
