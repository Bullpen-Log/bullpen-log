/**
 * 공개 화면의 요청 시한 · 멈춤 시험. `node --import ./scripts/alias-register.mjs scripts/intake-client-selftest.mts`
 * DB · 저장소 · 네트워크에 닿지 않는다 — 가짜 fetch · 가짜 서버 · 가짜 전송으로 기다림마다 멈춤 · 시한을 끼워 넣는다.
 *
 * 지키는 것:
 *   - 응답 머리가 안 오거나 본문이 멈춰도 시한 뒤 'timeout' 으로 끝난다. 타이머 · 듣기는 늘 걷힌다.
 *   - 부르는 쪽이 멈추면 'cancelled'. 이미 멈췄으면 보내지도 않는다. 끊김은 'network', 서버 거절은 코드 · 상태를 그대로.
 *   - 보내기 준비 중 어느 기다림에서 멈춰도 그 뒤 새 전송 · 도착 확인 · 완료를 시작하지 않는다. 처리되지 않은 거절이 없다.
 *   - 완료 응답을 잃어도 같은 키로 다시 내 같은 영수증을 받고, 서버의 판은 하나다. 완료를 보낸 뒤 멈추면 결과를 되찾는다.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as nodeModule from 'node:module';
import { createDiagHashRun, hashOnce, inspectPick, type DiagHashState } from '@/components/intake/pick';
import { CAPTURE_RATE_TEXT } from '@/lib/intake/media';
import { buildMov, hugeMoovHeader, mov120, mov240 } from './intake-fixtures.mts';
import { SEND_CANCELLED_TEXT, createSendController, type SendControllerInput, type SendState } from '@/components/intake/use-send';
import {
  CONTROL_TIMEOUT_MS,
  FINALIZE_TIMEOUT_MS,
  IntakeRequestError,
  SESSION_CODES,
  TIMEOUT_TEXT,
  createIntakeClient,
  isSessionError,
  requestJson,
  type IntakeClient,
  type IntakeReceipt,
  type PublicAsset,
  type PublicIntakeState,
  type PublicStateResponse,
  type UploadGrant,
} from '@/lib/intake/public-client';
import { IntakeUploadError, browserRecoveryStore, recoveryKey, startIntakeUpload, type RecoveryStore, type StartUploadOptions, type UploadHandle } from '@/lib/intake/upload-client';
import type { HttpStack } from 'tus-js-client';
import { FINALIZE_UNKNOWN_TEXT, RunStop, TIMEOUT_RETRIES, finishRun, retryNetwork, runUpload, sleepOrCancel, type RunEvent, type RunItem } from '@/lib/intake/upload-run';

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

let unhandled = 0;
process.on('unhandledRejection', (e) => {
  unhandled++;
  console.error('처리되지 않은 거절:', e);
});

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));
const never = <T,>() => new Promise<T>(() => {});
const instant = async () => {};

/** 거절 값을 받는다 — 풀리면 실패다 */
async function rejection<E>(p: Promise<unknown>): Promise<E> {
  try {
    await p;
  } catch (e) {
    return e as E;
  }
  throw new Error('거절을 기대했는데 풀렸다');
}

/** 오류 코드를 받아 본다 */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    if (e instanceof IntakeRequestError || e instanceof RunStop || e instanceof IntakeUploadError) return e.code;
    return `other:${String(e)}`;
  }
}

/** 시한 타이머를 세는 가짜 setTimeout — 걷히지 않은 타이머가 남는지 본다 */
function timers() {
  const live = new Set<unknown>();
  const setTimer = ((fn: () => void, ms?: number) => {
    const id = setTimeout(() => {
      live.delete(id);
      fn();
    }, ms);
    live.add(id);
    return id;
  }) as unknown as typeof setTimeout;
  const clearTimer = ((id: ReturnType<typeof setTimeout>) => {
    live.delete(id);
    clearTimeout(id);
  }) as typeof clearTimeout;
  return { live, setTimer, clearTimer };
}

/** 듣기를 세는 멈춤 — 끝난 뒤 'abort' 듣기가 남는지 본다 */
function watchedController() {
  const ctrl = new AbortController();
  let listeners = 0;
  const add = ctrl.signal.addEventListener.bind(ctrl.signal);
  const remove = ctrl.signal.removeEventListener.bind(ctrl.signal);
  ctrl.signal.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: AddEventListenerOptions | boolean) => {
    if (type === 'abort') listeners++;
    add(type, fn, o);
  }) as typeof ctrl.signal.addEventListener;
  ctrl.signal.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: EventListenerOptions | boolean) => {
    if (type === 'abort') listeners--;
    remove(type, fn, o);
  }) as typeof ctrl.signal.removeEventListener;
  return { ctrl, listeners: () => listeners };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
/** 머리는 오는데 본문이 끝나지 않는 응답 */
const stuckBody = (status = 200) => new Response(new ReadableStream({ start() {} }), { status, headers: { 'Content-Type': 'application/json' } });

/* ────────────────────────── 1 요청 시한 ────────────────────────── */

ok(CONTROL_TIMEOUT_MS === 20_000 && FINALIZE_TIMEOUT_MS > CONTROL_TIMEOUT_MS, '조작 요청 20초 · 완료는 더 길게');

{
  /* 머리가 끝내 안 온다 — signal 도 안 따르는 fetch */
  const t = timers();
  const w = watchedController();
  let calls = 0;
  const client = createIntakeClient('t', () => (calls++, never<Response>()), { controlTimeoutMs: 40, setTimer: t.setTimer, clearTimer: t.clearTimer });
  const started = Date.now();
  eq(await codeOf(client.state({ signal: w.ctrl.signal })), 'timeout', '머리가 안 오면 시한에 timeout');
  const took = Date.now() - started;
  ok(took >= 35 && took < 1000, `시한 안에 끝난다(${took}ms)`);
  eq([t.live.size, w.listeners(), calls], [0, 0, 1], '타이머 · 듣기가 걷혔다');
}
{
  /* signal 을 따르는 fetch — 시한에 끊겨 AbortError 로 거절돼도 끊김이 아니라 timeout 이다 */
  const honest: typeof fetch = (_u, init) =>
    new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  const client = createIntakeClient('t', honest, { controlTimeoutMs: 30 });
  const e = await rejection<IntakeRequestError>(client.state());
  eq([e.code, e.message], ['timeout', TIMEOUT_TEXT], 'signal 을 따르는 fetch 도 timeout · 시한 글');
}
{
  /* 머리는 왔는데 본문이 멈춘다 */
  const t = timers();
  const client = createIntakeClient('t', async () => stuckBody(), { controlTimeoutMs: 40, setTimer: t.setTimer, clearTimer: t.clearTimer });
  eq(await codeOf(client.state()), 'timeout', '본문이 멈추면 timeout');
  eq(t.live.size, 0, '본문 시한도 타이머를 걷는다');
}
{
  /* 본문을 읽는 사이 부르는 쪽이 멈춘다 */
  const t = timers();
  const w = watchedController();
  const client = createIntakeClient(
    't',
    async () => {
      setTimeout(() => w.ctrl.abort(), 5);
      return stuckBody();
    },
    { controlTimeoutMs: 5_000, setTimer: t.setTimer, clearTimer: t.clearTimer },
  );
  const started = Date.now();
  eq(await codeOf(client.state({ signal: w.ctrl.signal })), 'cancelled', '본문 중 멈춤은 cancelled');
  ok(Date.now() - started < 1000, '멈추면 시한을 안 기다린다');
  eq([t.live.size, w.listeners()], [0, 0], '멈춤 뒤에도 타이머 · 듣기가 걷혔다');
}
{
  /* 머리를 기다리는 사이 멈춘다 */
  const w = watchedController();
  const client = createIntakeClient('t', () => {
    setTimeout(() => w.ctrl.abort(), 5);
    return never<Response>();
  });
  eq(await codeOf(client.state({ signal: w.ctrl.signal })), 'cancelled', '머리 전 멈춤도 cancelled');
  eq(w.listeners(), 0, '머리 전 멈춤도 듣기를 걷는다');
}
{
  /* 이미 멈춘 요청은 보내지도 않는다 */
  let calls = 0;
  const ctrl = new AbortController();
  ctrl.abort();
  const client = createIntakeClient('t', async () => (calls++, json({})));
  eq(await codeOf(client.saveDraft({ expectedVersion: 1 }, { signal: ctrl.signal })), 'cancelled', '이미 멈췄으면 cancelled');
  eq(calls, 0, '이미 멈췄으면 fetch 를 안 부른다');
}
{
  /* 서버 거절 · 끊김 · 읽을 수 없는 2xx */
  const client = createIntakeClient('t', async () => json({ error: { code: 'stale_version', message: '낡았어요', detail: { currentVersion: 8 } } }, 409));
  const e = await rejection<IntakeRequestError>(client.state());
  eq([e.code, e.status, e.detail], ['stale_version', 409, { currentVersion: 8 }], '서버 거절은 코드 · 상태 · 자세히를 그대로');

  const down = createIntakeClient('t', async () => {
    throw new TypeError('Failed to fetch');
  });
  eq(await codeOf(down.state()), 'network', '요청이 거절되면 network');

  const broken = createIntakeClient('t', async () => new Response('<html>', { status: 200 }));
  const b = await rejection<IntakeRequestError>(broken.state());
  eq([b.code, b.status], ['internal', 200], '2xx 라도 본문을 못 읽으면 internal');

  const empty = createIntakeClient('t', async () => new Response(null, { status: 502 }));
  eq(await codeOf(empty.state()), 'internal', '빈 오류 응답은 internal');

  const good = createIntakeClient('t', async () => json({ version: 4 }));
  eq((await good.saveDraft({ expectedVersion: 3 })).version, 4, '정상 응답은 그대로');
}
{
  /* 이름 · PIN 관문(R03) — 주소 · 방법 · 몸통 · 쿠키 싣기. PIN 은 글자 그대로('0042' 의 앞 0 을 지킨다) */
  const sent: { url: string; method?: string; body?: string; credentials?: RequestCredentials; auth: string | null }[] = [];
  const replies: Record<string, unknown> = {
    session: { enrolled: true, locked: false, session: false },
    'session/enroll': { name: '금윤호', idleExpiresAt: '2026-11-13T05:00:00.000Z', expiresAt: '2026-11-13T15:00:00.000Z' },
    'session/unlock': { name: '금윤호', idleExpiresAt: '2026-11-13T05:00:00.000Z', expiresAt: '2026-11-13T15:00:00.000Z' },
    'session/end': { ended: true },
  };
  const client = createIntakeClient('tok', async (input, init) => {
    sent.push({ url: String(input), method: init?.method, body: init?.body as string | undefined, credentials: init?.credentials, auth: new Headers(init?.headers).get('authorization') });
    return json(replies[String(input).replace('/api/intake/public/', '')]);
  });
  eq(await client.gate(), replies.session, '관문 답을 그대로');
  eq((await client.enroll({ name: '금윤호', pin: '0042', pinConfirm: '0042' })).name, '금윤호', '처음 정하기');
  eq((await client.unlock({ name: '금윤호', pin: '0042' })).name, '금윤호', '다시 들어가기');
  eq(await client.endSession(), { ended: true }, '세션 끝내기');
  eq(
    sent.map((x) => [x.url, x.method, x.body ?? null]),
    [
      ['/api/intake/public/session', 'GET', null],
      ['/api/intake/public/session/enroll', 'POST', JSON.stringify({ name: '금윤호', pin: '0042', pinConfirm: '0042' })],
      ['/api/intake/public/session/unlock', 'POST', JSON.stringify({ name: '금윤호', pin: '0042' })],
      ['/api/intake/public/session/end', 'POST', '{}'],
    ],
    '관문 주소 · 방법 · 몸통 — PIN 은 글자 그대로 간다',
  );
  ok(sent.every((x) => x.credentials === 'same-origin' && x.auth === 'Intake tok'), '모든 요청이 토큰 머리를 싣고 같은 출처 쿠키를 보낸다');
  await client.state().catch(() => {});
  eq(sent.at(-1)?.credentials, 'same-origin', '자료 요청도 세션 쿠키를 싣는다');

  /* 세션이 없거나 끝난 답만 '다시 이름 · PIN' 으로 가른다 */
  eq([...SESSION_CODES].sort(), ['session_expired', 'session_required'], '세션 코드 둘');
  const expired = createIntakeClient('t', async () => json({ error: { code: 'session_expired', message: '다시 들어와 주세요.', detail: null } }, 401));
  const e = await rejection<IntakeRequestError>(expired.state());
  ok(isSessionError(e) && e.status === 401, '끝난 세션은 세션 오류다');
  const wrong = createIntakeClient('t', async () => json({ error: { code: 'invitee_credentials_wrong', message: '맞지 않아요.', detail: null } }, 401));
  ok(!isSessionError(await rejection(wrong.unlock({ name: 'x', pin: '1234' }))), '틀린 이름 · PIN 은 세션 오류가 아니다');
  ok(!isSessionError(new Error('session_required')), '다른 오류는 세션 오류가 아니다');
}
{
  /* 완료는 따로 긴 시한, 조작 요청은 짧은 시한 — 서로 다른 값을 쓴다 */
  const seen: number[] = [];
  const t = {
    setTimer: ((fn: () => void, ms?: number) => {
      seen.push(ms ?? 0);
      return setTimeout(fn, ms);
    }) as unknown as typeof setTimeout,
  };
  const client = createIntakeClient('t', async () => json({ version: 1 }), { controlTimeoutMs: 111, finalizeTimeoutMs: 222, setTimer: t.setTimer });
  await client.saveDraft({ expectedVersion: 1 });
  await client.finalize({ expectedVersion: 1, idempotencyKey: 'k' }).catch(() => {});
  eq(seen, [111, 222], '완료만 완료 시한을 쓴다');
}
{
  /* 결과 화면이 같이 쓰는 길 — 상태와 본문을 돌려주고 같은 오류를 던진다 */
  const r = await requestJson(async () => json({ result: 1 }, 200), '/x', {}, { timeoutMs: 50 });
  eq([r.ok, r.status, r.data], [true, 200, { result: 1 }], 'requestJson 이 본문을 읽는다');
  eq(await codeOf(requestJson(async () => stuckBody(), '/x', {}, { timeoutMs: 20 })), 'timeout', 'requestJson 도 본문 시한');
}

/* ────────────────────────── 2 멈출 수 있는 쉼 · 재시도 ────────────────────────── */
{
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 5);
  const started = Date.now();
  eq(await codeOf(sleepOrCancel(() => never<void>(), 60_000, ctrl.signal)), 'cancelled', '쉬는 중 멈추면 cancelled');
  ok(Date.now() - started < 1000, '쉼을 끝까지 안 기다린다');

  /* 재시도 사이 쉬는 동안 멈춘다 — 더 묻지 않는다 */
  const c2 = new AbortController();
  let tries = 0;
  const p = retryNetwork(
    async () => {
      tries++;
      throw new IntakeRequestError('network', '끊김');
    },
    () => never<void>(),
    c2.signal,
  );
  await tick(5);
  c2.abort();
  eq(await codeOf(p), 'cancelled', '재시도 쉼 중 멈춤은 cancelled');
  eq(tries, 1, '멈춘 뒤 다시 안 묻는다');

  /* 시한은 한 번만 더 묻고(TIMEOUT_RETRIES), 끊김은 waits 만큼 묻는다. 멈춤 · 거절은 안 묻는다 */
  eq(TIMEOUT_RETRIES, 1, '시한은 한 번만 더 묻는다');
  let n = 0;
  eq(
    await retryNetwork(async () => {
      if (++n < 2) throw new IntakeRequestError('timeout', TIMEOUT_TEXT);
      return 'ok';
    }, instant),
    'ok',
    '시한 한 번은 다시 묻는다',
  );
  let t2 = 0;
  eq(
    await codeOf(
      retryNetwork(async () => {
        t2++;
        throw new IntakeRequestError('timeout', TIMEOUT_TEXT);
      }, instant),
    ),
    'timeout',
    '시한이 두 번이면 멈춰 다시 시도 단추로 간다',
  );
  eq(t2, 2, '시한은 두 번까지만 묻는다');
  let t0 = 0;
  await codeOf(
    retryNetwork(
      async () => {
        t0++;
        throw new IntakeRequestError('timeout', TIMEOUT_TEXT);
      },
      instant,
      undefined,
      undefined,
      0,
    ),
  );
  eq(t0, 1, '시한 재시도 0 이면 한 번만');
  let nets = 0;
  await codeOf(
    retryNetwork(async () => {
      nets++;
      throw new IntakeRequestError('network', '끊김');
    }, instant),
  );
  eq(nets, 4, '끊김은 waits 만큼(1 + 3) 다시 묻는다');
  let m = 0;
  eq(
    await codeOf(
      retryNetwork(async () => {
        m++;
        throw new IntakeRequestError('cancelled', '멈춤');
      }, instant),
    ),
    'cancelled',
    '멈춤은 다시 안 묻는다',
  );
  eq(m, 1, '멈춤은 한 번만');
}

/* ────────────────────────── 3 보내기 준비 중 멈춤 ────────────────────────── */

const SID = 'sub-1';
const memoryStore = (): RecoveryStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};
const asset = (view: 'side' | 'rear', status = 'reserved'): PublicAsset => ({ id: `A-${view}`, view, status, fileName: `${view}.MOV`, sizeBytes: 10, sha256: 'h'.repeat(64) }) as unknown as PublicAsset;
const grant = (id: string): UploadGrant => ({
  assetId: id,
  endpoint: 'http://127.0.0.1:1/storage/v1/upload/resumable/sign',
  token: 'tok',
  tokenTtlMs: 7_200_000,
  apikey: null,
  bucket: 'b',
  objectName: `o/${id}`,
  contentType: 'video/quicktime',
  chunkSize: 6 * 1024 * 1024,
  uploadUrl: null,
  transportExpiresAt: null,
});
const items: RunItem[] = [
  { view: 'side', file: new Blob([new Uint8Array(10)]), fileName: 'side.MOV', type: null },
  { view: 'rear', file: new Blob([new Uint8Array(10)]), fileName: 'rear.MOV', type: null },
];

type Hooks = {
  hash?: (ctrl: AbortController) => void;
  reserve?: (ctrl: AbortController) => Promise<void> | void;
  token?: (ctrl: AbortController) => Promise<void> | void;
  start?: (ctrl: AbortController) => void;
  /** 전송이 어떻게 끝나나 — 안 주면 곧바로 끝난다 */
  upload?: (ctrl: AbortController) => Promise<void>;
  abortRejects?: boolean;
};

function harness(hooks: Hooks) {
  const ctrl = new AbortController();
  const count = { hash: 0, reserve: 0, token: 0, start: 0, abort: 0, confirm: 0 };
  const signals: (AbortSignal | undefined)[] = [];
  const api: Pick<IntakeClient, 'reserveAsset' | 'issueToken' | 'registerUploadUrl' | 'confirmUpload'> = {
    reserveAsset: async (input, o) => {
      count.reserve++;
      signals.push(o?.signal);
      await hooks.reserve?.(ctrl);
      return { asset: asset(input.view), version: 2, created: true };
    },
    issueToken: async (id, o) => {
      count.token++;
      signals.push(o?.signal);
      await hooks.token?.(ctrl);
      return grant(id);
    },
    registerUploadUrl: async () => ({ transportExpiresAt: new Date(Date.now() + 1e6).toISOString() }),
    confirmUpload: async (id, o) => {
      count.confirm++;
      signals.push(o?.signal);
      return { ...asset('side', 'uploaded'), id };
    },
  };
  const start = (o: StartUploadOptions): UploadHandle => {
    count.start++;
    signals.push(o.signal);
    hooks.start?.(ctrl);
    const done = hooks.upload ? hooks.upload(ctrl) : Promise.resolve();
    return {
      done,
      abort: async () => {
        count.abort++;
        if (hooks.abortRejects) throw new Error('멈추기 실패');
      },
    };
  };
  const events: RunEvent[] = [];
  const run = () =>
    runUpload(
      {
        api,
        submissionId: SID,
        hash: async () => {
          count.hash++;
          hooks.hash?.(ctrl);
          return 'a'.repeat(64);
        },
        start,
        store: memoryStore(),
        sleep: instant,
      },
      items,
      { side: null, rear: null },
      (e) => events.push(e),
      ctrl.signal,
    );
  return { ctrl, count, run, events, signals };
}

async function cancelled(h: ReturnType<typeof harness>, label: string) {
  const e = await h.run().catch((x: unknown) => x);
  ok(e instanceof RunStop && e.code === 'cancelled', `${label}: RunStop cancelled (${String((e as Error)?.message ?? e)})`);
  ok(!h.events.some((x) => x.type === 'stage' && x.stage === 'confirm'), `${label}: 확인 단계까지 안 간다`);
  return e as RunStop;
}

{
  const h = harness({ hash: (c) => c.abort() });
  await cancelled(h, '해시 중 멈춤');
  eq([h.count.reserve, h.count.start, h.count.confirm], [0, 0, 0], '해시 중 멈추면 칸 잡기 · 전송 · 확인 0');
}
{
  /* 원래 재현: 칸 잡기 응답을 기다리는 사이 멈춘다 — 예전에는 전송 1 · 멈추기 0 · 확인 1 이고 성공했다 */
  const h = harness({ reserve: (c) => c.abort() });
  await cancelled(h, '칸 잡기 중 멈춤');
  eq([h.count.reserve, h.count.token, h.count.start, h.count.abort, h.count.confirm], [1, 0, 0, 0, 0], '칸 잡기 중 멈추면 새 전송 0 · 확인 0');
}
{
  /* 늦게 오는 칸 잡기 — 응답을 기다리는 사이 멈추고 그 뒤에 답이 온다 */
  /* 시간으로 재지 않는다(바쁜 기계에서 흔들린다) — 멈춤으로 끝났을 때 늦은 답이 아직 안 왔는지 본다 */
  let answered = false;
  const h = harness({
    reserve: async (c) => {
      setTimeout(() => c.abort(), 5);
      await tick(200);
      answered = true;
    },
  });
  await cancelled(h, '늦은 칸 잡기 중 멈춤');
  ok(!answered, '멈추면 늦은 답을 안 기다린다');
  await tick(250);
  ok(answered, '늦은 답은 그 뒤에 왔다');
  eq([h.count.start, h.count.confirm], [0, 0], '늦게 온 칸 잡기 답으로 전송을 시작하지 않는다');
}
{
  const h = harness({ token: (c) => c.abort() });
  await cancelled(h, '토큰 중 멈춤');
  eq([h.count.token, h.count.start, h.count.confirm], [1, 0, 0], '토큰 받는 중 멈추면 전송 0');
}
{
  /* 토큰이 풀리는 바로 그 사이(마이크로태스크)에 멈춘다 — 전송이 시작됐다면 반드시 멈춰야 한다 */
  const h = harness({
    token: (c) => {
      queueMicrotask(() => c.abort());
    },
  });
  await cancelled(h, '토큰 직후 멈춤');
  ok(h.count.start === 0 || h.count.abort >= h.count.start, '시작한 전송은 모두 멈췄다');
  eq(h.count.confirm, 0, '토큰 직후 멈추면 확인 0');
}
{
  /* 시작 함수 안에서(handle 을 돌려주기 전) 멈춘다 — 듣기가 handle 을 몰라도 놓치지 않는다 */
  const h = harness({ start: (c) => c.abort(), upload: () => never<void>() });
  await cancelled(h, '시작 중 멈춤');
  eq([h.count.start, h.count.abort, h.count.confirm], [1, 1, 0], '시작 중 멈추면 그 전송을 멈추고 확인 0');
}
{
  /* 보내는 중 멈춘다 — 멈추기가 거절해도 처리되지 않은 거절이 없다 */
  const h = harness({
    upload: (c) => {
      setTimeout(() => c.abort(), 5);
      return never<void>();
    },
    abortRejects: true,
  });
  await cancelled(h, '보내는 중 멈춤');
  eq([h.count.start, h.count.abort, h.count.confirm], [1, 1, 0], '보내는 중 멈추면 전송 1 · 멈추기 1 · 확인 0');
}
{
  /* 전송이 끝나는 그 순간 멈춘다 — 도착 확인으로 가지 않는다 */
  const h = harness({
    upload: async (c) => {
      c.abort();
    },
  });
  await cancelled(h, '확인 직전 멈춤');
  eq(h.count.confirm, 0, '확인 직전 멈추면 확인 0');
}
{
  /* 멈추지 않으면 끝까지 — 모든 요청에 signal 이 실려 간다 */
  const h = harness({});
  await h.run();
  eq([h.count.start, h.count.confirm], [2, 2], '멈추지 않으면 두 파일 다 보낸다');
  ok(h.signals.length > 0 && h.signals.every((s) => s === h.ctrl.signal), '칸 잡기 · 토큰 · 전송 · 확인에 같은 signal');
}
{
  /* 이미 멈춘 signal 로 시작하면 아무것도 안 한다 */
  const h = harness({});
  h.ctrl.abort();
  await cancelled(h, '멈춘 채 시작');
  eq([h.count.hash, h.count.reserve, h.count.start], [0, 0, 0], '멈춘 채 시작하면 해시도 안 한다');
}

/* ────────────────────────── 4 실제 전송 도우미의 멈춤 ────────────────────────── */
{
  /* 이미 멈췄으면 첫 요청도 안 보내고, 기록은 그대로 둔다 */
  const store = memoryStore();
  const key = recoveryKey(SID, 'A-side');
  /* 기록 자리는 접수 + 자산 둘로 묶는다 — 함수가 돌려준 값만 다시 읽으면 무엇으로 묶었는지 못 본다 */
  eq(key, `intake-upload:${SID}:A-side`, '이어 올리기 기록 자리는 접수 번호와 자산 번호를 둘 다 담는다');
  ok(recoveryKey('sub-a', 'X') !== recoveryKey('sub-b', 'X'), '다른 접수의 같은 자산 번호는 다른 자리');
  const record = JSON.stringify({ uploadUrl: 'http://127.0.0.1:1/x', size: 10, sha256: 'a'.repeat(64), fileName: 'side.MOV', transportExpiresAt: new Date(Date.now() + 1e7).toISOString() });
  store.setItem(key, record);
  const ctrl = new AbortController();
  ctrl.abort();
  let refreshed = 0;
  const h = startIntakeUpload({
    file: items[0].file,
    fileName: 'side.MOV',
    sha256: 'a'.repeat(64),
    grant: grant('A-side'),
    refreshGrant: async () => (refreshed++, { token: 't', tokenTtlMs: 1e6 }),
    store,
    storeKey: key,
    signal: ctrl.signal,
    retryDelays: [],
  });
  eq(await codeOf(h.done), 'aborted', '멈춘 채 시작한 전송은 aborted');
  await h.abort();
  eq([store.getItem(key), refreshed], [record, 0], '멈춰도 이어 올리기 기록은 남는다');
}
{
  /* 시작한 뒤 멈춘다 — 끝내 거절이 처리되고, 기록은 남는다 */
  const store = memoryStore();
  const key = recoveryKey(SID, 'A-rear');
  const ctrl = new AbortController();
  const h = startIntakeUpload({
    file: items[1].file,
    fileName: 'rear.MOV',
    sha256: 'b'.repeat(64),
    grant: grant('A-rear'),
    refreshGrant: async () => ({ token: 't', tokenTtlMs: 1e6 }),
    store,
    storeKey: key,
    signal: ctrl.signal,
    retryDelays: [5000],
  });
  await tick(5);
  ctrl.abort();
  eq(await codeOf(h.done), 'aborted', '시작한 뒤 멈추면 aborted');
  await h.abort();
  ok(true, '멈춘 뒤 다시 멈춰도 던지지 않는다');
}

/*
 * 4-1 F03 — 설치된 tus 는 onBeforeRequest 가 끝나면 멈춤을 다시 보지 않고 req.send 를 부른다.
 * 실제 tus Upload 에 가짜 요청 묶음(httpStack)만 끼워, 토큰을 새로 받는 사이 · 진행 알림(조각을 읽은 뒤 보내기 직전) 사이에
 * 멈추면 머리 · 토큰을 달거나 보내지 않는지 본다. 네트워크에 닿지 않는다. 실제 Supabase PATCH 를 본 것은 아니다.
 */
type FakeReq = { method: string; url: string; headers: Record<string, string>; sent: boolean; aborted: boolean };
function fakeStack(respond: (r: FakeReq) => { status: number; headers?: Record<string, string> }) {
  const log: FakeReq[] = [];
  const stack: HttpStack = {
    getName: () => 'fake',
    createRequest(method, url) {
      const r: FakeReq = { method, url, headers: {}, sent: false, aborted: false };
      log.push(r);
      return {
        getMethod: () => method,
        getURL: () => url,
        setHeader: (k, v) => void (r.headers[k] = v),
        getHeader: (k) => r.headers[k],
        setProgressHandler: () => {},
        send: async () => {
          r.sent = true;
          const a = respond(r);
          return { getStatus: () => a.status, getHeader: (k: string) => a.headers?.[k], getBody: () => '', getUnderlyingObject: () => null };
        },
        abort: async () => void (r.aborted = true),
        getUnderlyingObject: () => null,
      };
    },
  };
  return { stack, log };
}
const UP_URL = 'http://127.0.0.1:1/storage/v1/upload/resumable/sign/up-1';
/** 만들기 → 주소, 이어 묻기 → 0, 조각 → 끝까지 */
const tusServer = (r: FakeReq): { status: number; headers?: Record<string, string> } =>
  r.method === 'POST'
    ? { status: 201, headers: { Location: UP_URL } }
    : r.method === 'HEAD'
      ? { status: 200, headers: { 'Upload-Offset': '0', 'Upload-Length': '10' } }
      : { status: 204, headers: { 'Upload-Offset': '10' } };
const signed = (log: FakeReq[]) => log.filter((r) => 'x-signature' in r.headers).map((r) => `${r.method}:${r.headers['x-signature']}`);
{
  /* (가) 토큰을 새로 받는 동안 멈추고, 받기가 늦게 풀린다 — 이어 올리기(HEAD) 앞에서 */
  const store = memoryStore();
  const key = recoveryKey(SID, 'F03-a');
  const record = JSON.stringify({ uploadUrl: UP_URL, size: 10, sha256: 'a'.repeat(64), fileName: 'side.MOV', transportExpiresAt: new Date(Date.now() + 1e7).toISOString() });
  store.setItem(key, record);
  const { stack, log } = fakeStack(tusServer);
  let release!: (g: { token: string; tokenTtlMs: number }) => void;
  let refreshes = 0;
  const urls: string[] = [];
  const ctrl = new AbortController();
  const h = startIntakeUpload({
    file: items[0].file,
    fileName: 'side.MOV',
    sha256: 'a'.repeat(64),
    grant: { ...grant('F03-a'), tokenTtlMs: 1000 },
    refreshGrant: () => (refreshes++, new Promise((r) => (release = r))),
    store,
    storeKey: key,
    onUploadUrl: (u) => urls.push(u),
    signal: ctrl.signal,
    retryDelays: [0, 0],
    httpStack: stack,
  });
  await tick(5);
  eq([refreshes, log.map((r) => r.method), log[0]?.sent], [1, ['HEAD'], false], 'F03(가) 이어 묻기 요청을 열고 토큰을 새로 받는 중이다');
  ctrl.abort();
  await tick(5);
  release({ token: 'late-token', tokenTtlMs: 7_200_000 });
  await tick(20);
  eq(signed(log), [], 'F03(가) 늦게 풀린 토큰을 머리에 달지 않는다');
  eq(log.map((r) => [r.method, r.sent]), [['HEAD', false]], 'F03(가) 멈춘 뒤 아무 요청도 보내지 않는다(새 요청 · DELETE 없음)');
  eq([log[0].aborted, refreshes, urls], [true, 1, []], 'F03(가) 열린 요청은 abort(false)로 걷히고, 새로 받기 · 주소 알림을 다시 하지 않는다');
  eq(await codeOf(h.done), 'aborted', 'F03(가) 결과는 aborted');
  eq(store.getItem(key), record, 'F03(가) 이어 올리기 기록은 그대로');
}
{
  /* (나) 새로 받을 일 없이, 조각을 읽고 보내기 직전(진행 알림)에 멈춘다 — handle.abort() */
  const store = memoryStore();
  const key = recoveryKey(SID, 'F03-b');
  const { stack, log } = fakeStack(tusServer);
  const urls: string[] = [];
  let refreshes = 0;
  /* 진행 알림 안에서 자기 handle 을 멈춘다 — 알림은 start 뒤 비동기로 오므라 h 는 이미 있다 */
  const h: UploadHandle = startIntakeUpload({
    file: items[0].file,
    fileName: 'side.MOV',
    sha256: 'a'.repeat(64),
    grant: grant('F03-b'),
    refreshGrant: async () => (refreshes++, { token: 'x', tokenTtlMs: 7_200_000 }),
    store,
    storeKey: key,
    onUploadUrl: (u) => urls.push(u),
    onProgress: () => void h.abort(),
    retryDelays: [0, 0],
    httpStack: stack,
  });
  eq(await codeOf(h.done), 'aborted', 'F03(나) 결과는 aborted');
  await tick(20);
  eq(signed(log), ['POST:tok'], 'F03(나) 멈추기 전 만들기에만 토큰을 달았다');
  eq(log.map((r) => [r.method, r.sent]), [['POST', true], ['PATCH', false]], 'F03(나) 멈춘 뒤 열린 PATCH 는 보내지 않는다');
  eq([log[1].aborted, refreshes, urls], [true, 0, [UP_URL]], 'F03(나) 열린 PATCH 는 걷히고, 주소 알림은 멈추기 전 한 번');
  eq(JSON.parse(store.getItem(key) ?? '{}').uploadUrl, UP_URL, 'F03(나) 받은 업로드 주소 기록은 남는다(이어 가기)');
}
{
  /* (다) 대조 — 멈추지 않으면 토큰을 새로 받아 달고 끝까지 보낸다(고침이 전송을 막아 통과하는 것이 아님) */
  const store = memoryStore();
  const key = recoveryKey(SID, 'F03-c');
  const { stack, log } = fakeStack(tusServer);
  let refreshes = 0;
  const h = startIntakeUpload({
    file: items[0].file,
    fileName: 'side.MOV',
    sha256: 'a'.repeat(64),
    grant: { ...grant('F03-c'), tokenTtlMs: 1000 },
    refreshGrant: async () => (refreshes++, { token: 'fresh', tokenTtlMs: 7_200_000 }),
    store,
    storeKey: key,
    retryDelays: [0, 0],
    httpStack: stack,
  });
  eq(await codeOf(h.done), 'ok', 'F03(다) 멈추지 않으면 끝난다');
  eq([log.map((r) => [r.method, r.sent]), signed(log), refreshes], [[['POST', true], ['PATCH', true]], ['POST:fresh', 'PATCH:fresh'], 1], 'F03(다) 새 토큰을 달아 만들기 · 조각을 보낸다');
  eq(store.getItem(key), null, 'F03(다) 끝나면 기록을 지운다');
}
{
  /* (라) 대조 — 가짜 요청에서도 서버 거절 · 끊김의 구분은 그대로 */
  const refused = startIntakeUpload({
    file: items[0].file,
    fileName: 'x',
    sha256: 'a'.repeat(64),
    grant: { ...grant('F03-d'), tokenTtlMs: 1000 },
    refreshGrant: () => Promise.reject(new IntakeRequestError('invitation_revoked', '끝났어요', 403)),
    store: memoryStore(),
    storeKey: 'F03-d',
    retryDelays: [0, 0],
    httpStack: fakeStack(tusServer).stack,
  });
  eq(await codeOf(refused.done), 'token_refused', 'F03(라) 서버가 거절한 새로 받기는 그대로 token_refused');
  const net = fakeStack(() => ({ status: 0 }));
  const lost = startIntakeUpload({
    file: items[0].file,
    fileName: 'x',
    sha256: 'a'.repeat(64),
    grant: grant('F03-e'),
    refreshGrant: async () => ({ token: 't', tokenTtlMs: 7_200_000 }),
    store: memoryStore(),
    storeKey: 'F03-e',
    retryDelays: [0],
    httpStack: net.stack,
  });
  eq([await codeOf(lost.done), net.log.filter((r) => r.sent).length], ['network', 2], 'F03(라) 응답 없음(0)은 network, 재시도 한 번까지 보낸다');
}

/* ────────────────────────── 5 완료 응답 유실 · 완료 뒤 멈춤 ────────────────────────── */

/** 가짜 접수 서버 — 같은 키면 같은 영수증, 판은 키마다 하나 */
type ServerOpts = {
  loseFinalize?: number;
  hangFinalize?: 'all' | 'commit-then-hang' | 'hang-without-commit';
  stateHang?: boolean;
  /** 이 번째(0부터) 상태 읽기부터 멈춘다 */
  stateHangFrom?: number;
  version?: number;
  assets?: { side: string; rear: string };
};
function fakeServer(opts: ServerOpts = {}) {
  const s = {
    version: opts.version ?? 3,
    revisions: new Map<string, IntakeReceipt>(),
    finalizeCalls: [] as string[],
    /** 완료 요청 본문 전체 — 다시 낼 때 키뿐 아니라 기대한 자산 짝 · 판도 같은지 본다 */
    finalizeBodies: [] as Record<string, unknown>[],
    stateCalls: 0,
  };
  let lose = opts.loseFinalize ?? 0;
  const stateBody = (): PublicStateResponse => {
    const last = [...s.revisions.values()].at(-1);
    return {
      state: {
        submissionId: SID,
        version: s.version,
        submissionStatus: last ? 'submitted' : 'draft',
        draft: { athleteName: '금윤호' },
        assets: { side: { id: opts.assets?.side ?? 'S' }, rear: { id: opts.assets?.rear ?? 'R' } },
        receipt: last ? { code: last.receiptCode, receivedAt: last.receivedAt, receiptDate: last.receiptDate, revision: last.revision } : null,
      } as unknown as PublicIntakeState,
      consentDocs: [],
    } as unknown as PublicStateResponse;
  };
  const doFetch: typeof fetch = async (input, init) => {
    const path = String(input).replace('/api/intake/public/', '');
    if (path === 'state') {
      const nth = s.stateCalls++;
      if (opts.stateHang || (opts.stateHangFrom != null && nth >= opts.stateHangFrom)) return never<Response>();
      return json(stateBody());
    }
    if (path === 'finalize') {
      const body = JSON.parse(String(init?.body)) as { idempotencyKey: string; expectedVersion: number };
      s.finalizeCalls.push(body.idempotencyKey);
      s.finalizeBodies.push(body as unknown as Record<string, unknown>);
      if (opts.hangFinalize === 'hang-without-commit') return never<Response>();
      let r = s.revisions.get(body.idempotencyKey);
      if (r) r = { ...r, created: false };
      else {
        if (body.expectedVersion !== s.version) return json({ error: { code: 'stale_version', message: '낡았어요', detail: null } }, 409);
        r = { created: true, revision: s.revisions.size + 1, receiptCode: 'IN-1', receivedAt: '2026-11-09T03:00:00.000Z', receiptDate: '2026-11-09', athleteName: '금윤호', submissionStatus: 'submitted', version: ++s.version };
        s.revisions.set(body.idempotencyKey, r);
      }
      /* 서버는 얼렸다 — 그 응답만 잃는다 */
      if (opts.hangFinalize === 'all' || opts.hangFinalize === 'commit-then-hang' || lose-- > 0) return stuckBody();
      return json(r);
    }
    return json({ error: { code: 'internal', message: 'x', detail: null } }, 500);
  };
  /* opts 는 시험 도중에 바꿔 서버를 되살린다 */
  return { s, opts, client: createIntakeClient('t', doFetch, { controlTimeoutMs: 50, finalizeTimeoutMs: 30 }) };
}

const finishInput = (extra: Partial<Parameters<typeof finishRun>[1]> = {}) => ({ idempotencyKey: 'key-1', expected: { side: 'S', rear: 'R' }, expectedVersion: 3, round: 0, ...extra });

{
  /* 서버는 얼렸는데 첫 응답이 시한에 끊겼다 — 곧바로 다시 내지 않고 상태로 같은 영수증을 되찾는다. 판은 하나 */
  const f = fakeServer({ loseFinalize: 1 });
  let sentMarks = 0;
  const r = await finishRun(f.client, finishInput({ onSent: () => sentMarks++ }), instant);
  eq([r.receiptCode, r.revision, r.created], ['IN-1', 1, false], '응답을 잃은 완료의 영수증을 상태로 되찾는다');
  eq(f.s.revisions.size, 1, '응답을 잃어도 서버의 판은 하나');
  eq(f.s.finalizeCalls, ['key-1'], '시한 뒤에는 무거운 완료를 곧바로 다시 내지 않는다');
  eq(sentMarks, 1, '보냈다는 표시는 한 번');
}
{
  /* 서버는 얼렸는데 완료 응답도, 되찾을 상태 읽기도 끊겼다 — 'timeout' 으로 멈춘 뒤 다시 시도가 같은 키로 같은 영수증을 받는다 */
  const f = fakeServer({ hangFinalize: 'commit-then-hang', stateHangFrom: 1 });
  let marks = 0;
  const e = await rejection<RunStop>(finishRun(f.client, finishInput({ onSent: () => marks++ }), instant));
  eq([e.code, f.s.revisions.size, marks], ['timeout', 1, 1], '결과를 모르면 timeout 으로 멈춘다(서버는 이미 얼렸다)');
  /* 서버가 돌아왔다. 다시 시도는 같은 키 · '이미 보냄' — 상태를 보지 않게(round 없음) 해서 완료를 실제로 다시 내게 한다 */
  f.opts.hangFinalize = undefined;
  f.opts.stateHangFrom = undefined;
  const r = await finishRun(f.client, { ...finishInput({ onSent: () => marks++ }), round: undefined, alreadySent: true }, instant);
  eq([r.receiptCode, r.revision, r.created], ['IN-1', 1, false], '같은 키로 다시 낸 완료가 같은 영수증을 준다');
  eq(f.s.revisions.size, 1, '다시 내도 서버의 판은 하나');
  ok(f.s.finalizeCalls.length === 2 && f.s.finalizeCalls.every((k) => k === 'key-1'), '새 키를 만들지 않는다');
  eq(marks, 1, '이미 보낸 다시 시도는 보냈다는 표시를 다시 안 한다');
  /* round 를 주면 상태의 영수증으로 끝난다 — 완료를 또 내지 않는다 */
  const again = await finishRun(f.client, finishInput({ alreadySent: true }), instant);
  eq([again.revision, f.s.finalizeCalls.length], [1, 2], '이미 보낸 다시 시도는 상태에 영수증이 있으면 그것으로 끝낸다');
}
{
  /* 앞 시도가 완료를 보냈다. 이번 시도는 완료를 다시 내기 전(상태 읽는 중)에 멈춘다 — 'cancelled' 가 아니라 결과를 되찾는다 */
  const f = fakeServer({ stateHang: true });
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 5);
  const e = await rejection<RunStop>(finishRun(f.client, finishInput({ signal: ctrl.signal, alreadySent: true }), instant));
  eq([e.code, f.s.finalizeCalls.length], ['finalize_unknown', 0], '이미 보낸 뒤의 다시 시도를 멈추면 finalize_unknown(최신 내용 확인)');

  const g = fakeServer({ hangFinalize: 'commit-then-hang' });
  await finishRun(g.client, finishInput(), instant).catch(() => {});
  const c2 = new AbortController();
  c2.abort();
  const r = await finishRun(g.client, finishInput({ signal: c2.signal, alreadySent: true }), instant);
  eq([r.receiptCode, r.revision], ['IN-1', 1], '이미 보낸 뒤 멈춘 채 다시 시도해도 상태로 영수증을 되찾는다');
}
{
  /* 가장 나쁜 기다림 — 모든 조작 요청이 시한까지 멈춘다. 몇 번 묻고 멈추나(단추가 나오기까지) */
  const hangState = fakeServer({ stateHang: true });
  const e1 = await rejection<RunStop>(finishRun(hangState.client, finishInput(), instant));
  eq([e1.code, hangState.s.stateCalls, hangState.s.finalizeCalls.length], ['timeout', 2, 0], '상태가 멈추면 두 번(시한 둘)만 묻고 timeout');

  const hangFinal = fakeServer({ hangFinalize: 'hang-without-commit' });
  const e2 = await rejection<RunStop>(finishRun(hangFinal.client, finishInput(), instant));
  eq([e2.code, hangFinal.s.finalizeCalls.length, hangFinal.s.stateCalls], ['timeout', 1, 2], '완료가 멈추면 완료 한 번 + 되찾기 상태 한 번');

  /* 칸 잡기가 멈춘다 — 시한 두 번 뒤 다시 시도 단추로 */
  let fetches = 0;
  const stuck = createIntakeClient('t', () => (fetches++, never<Response>()), { controlTimeoutMs: 20 });
  const e3 = await rejection<RunStop>(
    runUpload(
      { api: stuck, submissionId: SID, hash: async () => 'a'.repeat(64), start: () => ({ done: Promise.resolve(), abort: async () => {} }), store: memoryStore(), sleep: instant },
      [items[0]],
      { side: null, rear: null },
      () => {},
      new AbortController().signal,
    ),
  );
  eq([e3.code, fetches], ['timeout', 2], '칸 잡기가 멈추면 두 번 묻고 timeout(이어서 보내기)');
  /*
   * 실제 시한으로 따진 가장 나쁜 단추까지의 시간 — 상태 읽기 2×20초 + 쉼 0.5초, 완료 30초 + 되찾기 20초.
   * 보내는 화면은 진행이 20초 멈추면 '멈추기' 단추를 따로 보인다(send-step STALL_MS).
   */
  const worstFinish = 2 * CONTROL_TIMEOUT_MS + 500 + FINALIZE_TIMEOUT_MS + CONTROL_TIMEOUT_MS;
  ok(worstFinish <= 95_000, `완료 쪽 가장 나쁜 기다림 ${worstFinish / 1000}초`);
}
{
  /* 완료 응답을 끝내 못 받았다 — 상태에 이번 판의 영수증이 있으면 그것이 결과다 */
  const f = fakeServer({ hangFinalize: 'all' });
  const r = await finishRun(f.client, finishInput(), instant);
  eq([r.receiptCode, r.revision], ['IN-1', 1], '응답을 다 잃어도 상태로 영수증을 되찾는다');
  eq(f.s.revisions.size, 1, '되찾아도 판은 하나');
  ok(new Set(f.s.finalizeCalls).size === 1, '모든 완료가 같은 키');
}
{
  /* 응답도 없고 서버도 안 얼렸다 — 시한으로 멈추고 다시 시도할 수 있다 */
  const f = fakeServer({ hangFinalize: 'hang-without-commit' });
  const e = await rejection<RunStop>(finishRun(f.client, finishInput(), instant));
  eq(e.code, 'timeout', '결과를 끝내 모르면 timeout 으로 멈춘다(이어서 보내기)');
  eq(f.s.revisions.size, 0, '얼리지 않았다');
}
{
  /* 완료를 보낸 뒤 멈춘다 — 서버가 얼렸으면 멈춤이 아니라 영수증이다 */
  const f = fakeServer({ hangFinalize: 'commit-then-hang' });
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 10);
  const r = await finishRun(f.client, finishInput({ signal: ctrl.signal }), () => never<void>());
  eq([r.receiptCode, r.revision], ['IN-1', 1], '완료 뒤 멈춰도 얼린 결과를 되찾는다');
}
{
  /* 완료를 보낸 뒤 멈췄는데 서버가 아직 안 얼렸다 — '멈췄다'고 단정하지 않고 최신 내용을 보게 한다 */
  const f = fakeServer({ hangFinalize: 'hang-without-commit' });
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 10);
  const e = await rejection<RunStop>(finishRun(f.client, finishInput({ signal: ctrl.signal }), () => never<void>()));
  eq([e.code, e.message], ['finalize_unknown', FINALIZE_UNKNOWN_TEXT], '완료 뒤 멈춤은 cancelled 가 아니라 finalize_unknown');
}
{
  /* 완료를 보내기 전에 멈춘다 — 완료를 안 보낸다 */
  const f = fakeServer({ stateHang: true });
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 5);
  let sentMarks = 0;
  const e = await rejection<RunStop>(finishRun(f.client, finishInput({ signal: ctrl.signal, onSent: () => sentMarks++ }), instant));
  eq([e.code, f.s.finalizeCalls.length, sentMarks], ['cancelled', 0, 0], '완료 전 멈춤은 cancelled · 완료 0');
}
{
  /* 이미 멈춘 채 끝내기 — 상태도 완료도 안 묻는다 */
  const f = fakeServer();
  const ctrl = new AbortController();
  ctrl.abort();
  eq(await codeOf(finishRun(f.client, finishInput({ signal: ctrl.signal }), instant)), 'cancelled', '멈춘 채 끝내기는 cancelled');
  eq([f.s.stateCalls, f.s.finalizeCalls.length], [0, 0], '멈춘 채 끝내기는 아무것도 안 묻는다');
}
/* ────────────────────────── 6 전송 중 토큰 새로 받기 ────────────────────────── */
{
  /* 새로 받기가 한 번 늦거나 끊겨도 다시 묻는다 — '권한이 끝났다'로 멈추지 않는다 */
  let tokenCalls = 0;
  let refreshed: { token: string } | null = null;
  const api: Pick<IntakeClient, 'reserveAsset' | 'issueToken' | 'registerUploadUrl' | 'confirmUpload'> = {
    reserveAsset: async (input) => ({ asset: asset(input.view), version: 2, created: true }),
    issueToken: async (id) => {
      tokenCalls++;
      if (tokenCalls === 2) throw new IntakeRequestError('timeout', TIMEOUT_TEXT);
      if (tokenCalls === 3) throw new IntakeRequestError('network', '끊김');
      return { ...grant(id), token: `tok-${tokenCalls}` };
    },
    registerUploadUrl: async () => ({ transportExpiresAt: new Date(Date.now() + 1e6).toISOString() }),
    confirmUpload: async (id) => ({ ...asset('side', 'uploaded'), id }),
  };
  await runUpload(
    {
      api,
      submissionId: SID,
      hash: async () => 'a'.repeat(64),
      start: (o) => ({
        done: o.refreshGrant().then((g) => {
          refreshed = g;
        }),
        abort: async () => {},
      }),
      store: memoryStore(),
      sleep: instant,
    },
    [items[0]],
    { side: null, rear: null },
    () => {},
    new AbortController().signal,
  );
  eq([tokenCalls, (refreshed as { token: string } | null)?.token], [4, 'tok-4'], '토큰 새로 받기도 시한 · 끊김이면 다시 묻는다');
}
{
  /* 전송 도우미 — 새로 받기가 응답을 잃으면 '권한이 끝났다'가 아니라 끊김이다(tus 가 다시 시도한다) */
  const lost = startIntakeUpload({
    file: items[0].file,
    fileName: 'x',
    sha256: 'a'.repeat(64),
    grant: { ...grant('A-side'), tokenTtlMs: 1000 },
    refreshGrant: () => Promise.reject(new IntakeRequestError('timeout', TIMEOUT_TEXT)),
    store: memoryStore(),
    storeKey: 'lost-refresh',
    retryDelays: [],
  });
  eq(await codeOf(lost.done), 'network', '새로 받기의 시한은 token_refused 가 아니다');
  const refused = startIntakeUpload({
    file: items[0].file,
    fileName: 'x',
    sha256: 'a'.repeat(64),
    grant: { ...grant('A-side'), tokenTtlMs: 1000 },
    refreshGrant: () => Promise.reject(new IntakeRequestError('invitation_revoked', '끝났어요', 403)),
    store: memoryStore(),
    storeKey: 'refused-refresh',
    retryDelays: [0, 0],
  });
  eq(await codeOf(refused.done), 'token_refused', '서버가 거절한 새로 받기는 token_refused');
}

/* ────────────────────────── 7 파일 해시의 멈춤 · 기기 저장소 ────────────────────────── */
{
  const bytes = new Uint8Array(9 * 1024 * 1024);
  for (let i = 0; i < bytes.length; i += 4096) bytes[i] = i % 251;
  const blob = new Blob([bytes]);
  const full = createHash('sha256').update(bytes).digest('hex');
  const ctrl = new AbortController();
  const first: number[] = [];
  const e = await rejection<IntakeUploadError>(
    hashOnce(
      blob,
      (done) => {
        first.push(done);
        if (done >= 4 * 1024 * 1024) ctrl.abort();
      },
      ctrl.signal,
    ),
  );
  eq([e.code, first.length], ['aborted', 1], '해시 중 멈추면 다음 조각 전에 aborted');
  const second: number[] = [];
  const sha = await hashOnce(blob, (done) => second.push(done));
  ok(second[0] < blob.size && second.length === 3, `멈춘 해시는 기억에 안 남아 처음부터 다시 잰다(${second.join(',')})`);
  eq(sha, full, '다시 잰 값은 전체 SHA-256');
  const third: number[] = [];
  eq(await hashOnce(blob, (done) => third.push(done)), full, '끝까지 잰 값은 기억한다');
  eq(third, [blob.size], '기억한 값은 다시 안 잰다');
  const pre = new AbortController();
  pre.abort();
  eq(await codeOf(hashOnce(blob, undefined, pre.signal)), 'aborted', '이미 멈췄으면 기억이 있어도 aborted');
}
{
  /* localStorage 가 없다(사생활 모드 · 막힘) — 부를 때마다 같은 메모리 자리라 다시 시도에도 기록이 남는다 */
  const a = browserRecoveryStore();
  a.setItem('intake-finalize:sub-x:0', 'k1');
  eq(browserRecoveryStore().getItem('intake-finalize:sub-x:0'), 'k1', '메모리 자리는 페이지에 하나다');
  a.removeItem('intake-finalize:sub-x:0');
}

/* ────────────────────────── 8 보내기 차례(useSend 의 몸통) ────────────────────────── */

/** 보내기 차례를 가짜로 돌린다 — 서버는 fakeServer, 칸 잡기 · 전송은 가짜 */
function sendRig(opts: { server?: ServerOpts; store?: RecoveryStore; reserve?: () => Promise<void>; upload?: () => Promise<void> } = {}) {
  const f = fakeServer({ version: 3, assets: { side: 'A-side', rear: 'A-rear' }, ...opts.server });
  const count = { reserve: 0, start: 0, done: 0, reserved: 0, reservedAfterDispose: 0, publishAfterDispose: 0, makeKey: 0 };
  let disposed = false;
  const client = {
    reserveAsset: async (input: { view: 'side' | 'rear' }) => {
      count.reserve++;
      await opts.reserve?.();
      return { asset: asset(input.view), version: 3, created: true };
    },
    issueToken: async (id: string) => grant(id),
    registerUploadUrl: async () => ({ transportExpiresAt: new Date(Date.now() + 1e6).toISOString() }),
    confirmUpload: async (id: string) => ({ ...asset('side', 'uploaded'), id }),
    state: f.client.state,
    finalize: f.client.finalize,
  } as unknown as SendControllerInput['client'];
  const receipts: IntakeReceipt[] = [];
  const states: SendState[] = [];
  const c = createSendController(
    () => ({
      client,
      submissionId: SID,
      onReserved: () => {
        count.reserved++;
        if (disposed) count.reservedAfterDispose++;
      },
      onDone: (r) => {
        count.done++;
        receipts.push(r);
      },
    }),
    {
      store: opts.store ?? memoryStore(),
      hash: async () => 'a'.repeat(64),
      start: () => {
        count.start++;
        return { done: opts.upload ? opts.upload() : Promise.resolve(), abort: async () => {} };
      },
      makeKey: () => `key-${++count.makeKey}`,
      publish: (s) => {
        if (disposed) count.publishAfterDispose++;
        states.push(s);
      },
      sleep: instant,
    },
  );
  const dispose = () => {
    disposed = true;
    c.dispose();
  };
  return { f, c, count, receipts, states, dispose };
}
const sendOptions = () => ({ known: { side: null, rear: null }, round: 0, version: 3, samePitchConfirmed: true });

{
  /* 정상 — 두 파일을 보내고 영수증을 받는다 */
  const r = sendRig();
  await r.c.start(items, sendOptions());
  eq([r.count.start, r.count.done, r.receipts[0]?.revision, r.f.s.finalizeCalls], [2, 1, 1, ['key-1']], '보내기 차례가 끝까지 간다');
  ok(r.c.state?.running === false && r.c.state.stop === null, '끝나면 멈춤 없이 쉰다');
}
{
  /* 화면이 떨어졌다(보내는 중) — 그 뒤 화면을 안 바꾸고 완료도 안 낸다 */
  let release!: () => void;
  const r = sendRig({ upload: () => new Promise<void>((res) => (release = res)) });
  const p = r.c.start(items, sendOptions());
  await tick(5);
  r.dispose();
  release();
  await p;
  await tick(5);
  eq([r.count.done, r.count.publishAfterDispose, r.f.s.finalizeCalls.length], [0, 0, 0], '떨어진 뒤에는 onDone · 그리기 · 완료가 없다');
}
{
  /* 칸 잡기 중 화면이 떨어졌다 — 늦게 온 칸 잡기 답으로 화면을 안 바꾸고 전송도 안 한다 */
  const r = sendRig({ reserve: () => tick(30) });
  const p = r.c.start(items, sendOptions());
  await tick(5);
  r.dispose();
  await p;
  await tick(40);
  eq([r.count.start, r.count.reserved, r.count.done, r.count.publishAfterDispose], [0, 0, 0, 0], '칸 잡기 중 떨어지면 전송 0 · onReserved 0 · onDone 0');
}
{
  /* 완료 응답을 잃고 되찾기도 못 했다 — 다시 시도는 전송을 되풀이하지 않고 같은 키로 완료만 낸다. 저장소가 기억 못 해도 같은 키 */
  const forgetful: RecoveryStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const r = sendRig({ store: forgetful, server: { hangFinalize: 'commit-then-hang', stateHangFrom: 1 } });
  await r.c.start(items, sendOptions());
  eq([r.c.state?.stop?.code, r.count.done, r.f.s.revisions.size], ['timeout', 0, 1], '결과를 모르면 timeout 으로 멈춘다(서버는 얼렸다)');
  const startsBefore = r.count.start;
  const reservesBefore = r.count.reserve;
  r.f.opts.hangFinalize = undefined;
  r.f.opts.stateHangFrom = undefined;
  await r.c.retry();
  eq([r.count.start - startsBefore, r.count.reserve - reservesBefore], [0, 0], '다시 시도는 칸 잡기 · 전송을 되풀이하지 않는다');
  eq([r.count.done, r.receipts[0]?.revision, r.f.s.revisions.size], [1, 1, 1], '다시 시도가 같은 판의 영수증으로 끝난다');
  eq(r.count.makeKey, 1, '저장소가 기억 못 해도 완료 키는 한 번만 만든다');
  ok(r.f.s.finalizeCalls.every((k) => k === 'key-1'), '모든 완료가 같은 키');
}
{
  /* 완료가 서버에 닿기 전에 끊겼다 — 다시 시도는 완료를 실제로 다시 내고, 키 · 기대한 자산 짝 · 판이 첫 요청과 같다 */
  const r = sendRig({ server: { hangFinalize: 'hang-without-commit' } });
  await r.c.start(items, sendOptions());
  ok(r.c.state?.stop != null && r.count.done === 0 && r.f.s.revisions.size === 0, '첫 완료는 답이 없어 멈춘다(서버는 아직 안 얼림)');
  r.f.opts.hangFinalize = undefined;
  await r.c.retry();
  eq([r.count.done, r.f.s.revisions.size], [1, 1], '다시 시도가 판 하나로 끝난다');
  ok(r.f.s.finalizeBodies.length >= 2, `완료를 실제로 다시 냈다(${r.f.s.finalizeBodies.length}번)`);
  const pick = (b: Record<string, unknown>) => JSON.stringify([b.idempotencyKey, b.expected ?? b.expectedAssets, b.expectedVersion, b.samePitchConfirmed]);
  ok(new Set(r.f.s.finalizeBodies.map(pick)).size === 1, '다시 낸 완료의 키 · 자산 짝 · 판이 모두 같다');
  ok(r.f.s.finalizeBodies[0].expected != null || r.f.s.finalizeBodies[0].expectedAssets != null, '완료 본문에 기대한 자산 짝이 실린다');
}
{
  /* 칸 잡기 답과 화면 떨어짐이 어떤 차례로 겹쳐도 — 떨어진 뒤에는 onReserved · 그리기 · onDone 을 안 부른다 */
  const reachedLate: number[] = [];
  for (let hops = 0; hops <= 16; hops++) {
    const later = (n: number, f: () => void): void => (n === 0 ? f() : queueMicrotask(() => later(n - 1, f)));
    const rig: ReturnType<typeof sendRig> = sendRig({
      /* 칸 잡기 답을 돌려주는 그때부터 hops 번째 마이크로태스크에 화면이 떨어진다 */
      reserve: async () => later(hops, () => rig.dispose()),
    });
    await rig.c.start(items, sendOptions());
    await tick(5);
    eq([rig.count.reservedAfterDispose, rig.count.publishAfterDispose, rig.count.done], [0, 0, 0], `떨어진 뒤 onReserved · 그리기 · onDone 0(마이크로태스크 ${hops})`);
    if (rig.count.reserve > 0 && rig.count.start === 0) reachedLate.push(hops);
  }
  /* 판별력: 적어도 한 차례는 칸 잡기 답이 '떨어진 뒤'에 도착해야 위 검사가 의미가 있다 */
  ok(reachedLate.length > 0, `칸 잡기 답과 떨어짐이 겹친 차례가 있다(${reachedLate.join(',')})`);
}
{
  /* 다시 시도 중(이미 완료를 보냄) 멈춘다 — 'cancelled' 가 아니라 결과를 되찾는다 */
  const r = sendRig({ server: { hangFinalize: 'commit-then-hang', stateHangFrom: 1 } });
  await r.c.start(items, sendOptions());
  eq(r.c.state?.stop?.code, 'timeout', '첫 시도는 timeout');
  r.f.opts.stateHangFrom = undefined;
  r.f.opts.stateHang = true;
  const p = r.c.retry();
  await tick(5);
  r.c.cancel();
  await p;
  eq([r.c.state?.stop?.code, r.count.done], ['finalize_unknown', 0], '보낸 뒤 다시 시도를 멈추면 finalize_unknown(최신 내용 확인)');
}
{
  /* 준비 중 멈춤 — 화면에는 '이어서 보낼 수 있다'는 멈춤, 다시 시도는 같은 일감으로 이어 간다 */
  const r = sendRig({ reserve: () => tick(30) });
  const p = r.c.start(items, sendOptions());
  await tick(5);
  r.c.cancel();
  await p;
  eq([r.c.state?.stop?.code, r.c.state?.stop?.message, r.count.start], ['cancelled', SEND_CANCELLED_TEXT, 0], '준비 중 멈추면 cancelled · 전송 0');
  const attemptBefore = r.c.state?.attempt ?? 0;
  await r.c.retry();
  eq([r.count.done, r.count.start], [1, 2], '멈춘 뒤 이어서 보내면 끝까지 간다');
  ok((r.c.state?.attempt ?? 0) > attemptBefore, '다시 시도는 새 시도 번호를 단다');
}

/* 늦게 끝나는 약속들의 거절이 처리됐는지 본다 */
await tick(50);
eq(unhandled, 0, '처리되지 않은 거절이 없다');

/* ── 관리자 3D 검토의 '준비' 판정(INTAKE-MAIN/R01) — 모듈을 불러온 것만으로는 준비가 아니다 ── */
{
  const { body3dReady } = await import('@/components/intake/body3d-ready');
  const node = (parts: { canvas?: boolean; play?: { disabled: boolean } | null }) =>
    ({
      querySelector: (sel: string) => {
        if (sel === 'canvas') return parts.canvas ? {} : null;
        if (sel.includes('aria-label')) return parts.play ?? null;
        return null;
      },
    }) as unknown as ParentNode;
  eq(body3dReady(null), false, '칸이 없으면 준비 아님');
  eq(body3dReady(node({})), false, '부품을 아직 못 불러왔으면(자리 글만) 준비 아님');
  eq(body3dReady(node({ canvas: true, play: { disabled: true } })), false, '불러오는 중 · 그릴 수 없음 · 실패(재생 단추 꺼짐)는 준비 아님');
  eq(body3dReady(node({ canvas: false, play: { disabled: false } })), false, '그림판이 없으면 준비 아님');
  eq(body3dReady(node({ canvas: true, play: { disabled: false } })), true, '그림판이 붙고 재생 단추가 켜지면 준비');
  /* 지켜보기 — 바뀔 때만 알리고, 실패 뒤 다시 불러오는 동안은 준비가 아니고, 떼면 준비였던 것을 거둔다 */
  const { watchBody3dReady } = await import('@/components/intake/body3d-ready');
  const parts: { canvas?: boolean; play?: { disabled: boolean } | null } = {};
  let fire: () => void = () => {};
  let observed: MutationObserverInit | null = null;
  let disconnected = false;
  class FakeObserver {
    constructor(cb: () => void) {
      fire = cb;
    }
    observe(_t: Node, o: MutationObserverInit) {
      observed = o;
    }
    disconnect() {
      disconnected = true;
    }
  }
  const el = node(parts) as unknown as ParentNode & Node;
  (el as unknown as { querySelector: (s: string) => unknown }).querySelector = (sel: string) => (sel === 'canvas' ? (parts.canvas ? {} : null) : sel.includes('aria-label') ? (parts.play ?? null) : null);
  const seen: boolean[] = [];
  const stop = watchBody3dReady(el, (r) => seen.push(r), FakeObserver as never);
  eq(seen, [false], '처음엔 준비 아님을 한 번 알린다');
  ok(observed != null && (observed as MutationObserverInit).subtree === true && ((observed as MutationObserverInit).attributeFilter ?? []).includes('disabled'), '칸 전체 · 단추의 켜짐을 지켜본다');
  parts.canvas = true;
  parts.play = { disabled: true };
  fire();
  eq(seen, [false], '불러오는 중(단추 꺼짐)은 알리지 않는다 — 바뀐 것이 없다');
  parts.play = { disabled: false };
  fire();
  eq(seen, [false, true], '단추가 켜지면 준비를 알린다');
  fire();
  eq(seen, [false, true], '같은 상태면 다시 알리지 않는다');
  parts.play = { disabled: true };
  fire();
  eq(seen, [false, true, false], '실패 뒤 다시 불러오면 준비가 거둬진다');
  parts.play = { disabled: false };
  fire();
  stop();
  eq([seen.at(-1), disconnected], [false, true], '떼면 지켜보기를 끝내고 준비였던 것을 거둔다');

  /* 판정이 기대는 공용 부품의 모양 — 바뀌면 여기서 먼저 알게(바뀌면 검토 완료 단추가 안 켜지는 쪽으로 틀린다) */
  const src = readFileSync('app/(app)/videos/lab/[id]/body-3d.tsx', 'utf8');
  ok(/disabled=\{status !== 'ready'\}\s*aria-label=\{playing \? '멈춤' : '재생'\}/.test(src), "Body3D 재생 단추는 status 가 'ready' 일 때만 켜지고 이름이 재생/멈춤이다");
  ok(/renderer\.domElement/.test(src), 'Body3D 는 그림판(canvas)을 칸에 붙인다');
}

/* ── R04: 고를 때 120fps 규칙을 먼저 알린다(서버와 같은 함수 — 막는 것은 서버다) ── */
{
  const limits = { maxFileBytes: 2 ** 30, maxTotalBytes: 2 ** 31, maxAssets: 12 };
  const none = { picked: null, asset: null };
  const asFile = (b: Buffer, name: string) => new File([new Uint8Array(b)], name, { type: 'video/quicktime' });
  const sixty = await inspectPick(asFile(buildMov({ timescale: 600, stts: [[600, 10]] }), 'IMG_240fps.MOV'), limits, none);
  ok(!sixty.ok && sixty.code === 'capture_rate_low' && sixty.message.includes('60fps가 확인됩니다'), 'R04: 60fps 는 고를 때 막고 까닭을 말한다(파일 이름은 안 본다)');
  /* R07: 막힘 글은 이 파일에서 잰 fps 만 말하고, 카메라가 그 속도로 찍었다고 단정하지 않는다. 막힌 파일 · 사실은 진단용으로 돌려준다 */
  ok(!sixty.ok && !/촬영된 영상입니다/.test(sixty.message) && sixty.message.includes('파일 앱'), 'R07: 낮은 fps 글은 파일 기준 · 원본을 파일 앱에서 다시 고르라고 말한다');
  ok(!sixty.ok && sixty.rejected?.facts?.stepFps === 60 && sixty.rejected.file.name === 'IMG_240fps.MOV', 'R07: 막힌 파일과 잰 사실을 진단용으로 돌려준다');
  const blind = await inspectPick(asFile(buildMov({ timescale: 600, stts: [] }), 'a.MOV'), limits, none);
  ok(!blind.ok && blind.message === CAPTURE_RATE_TEXT.capture_rate_unknown && blind.code === 'capture_rate_unknown', 'R04: fps 를 모르면 막는다');
  ok(!blind.ok && blind.message.includes('120fps 미만이라는 뜻은 아닙니다') && !/\d+fps가 확인/.test(blind.message), 'R07: 모름은 낮음과 다른 글이고 fps 를 지어내지 않는다');
  const ntscLow = await inspectPick(asFile(buildMov({ timescale: 30000, stts: [[300, 1001]] }), 'b.MOV'), limits, none);
  ok(!ntscLow.ok && ntscLow.message.includes('29.97fps가 확인됩니다'), 'R07: 29.97fps 는 잰 값 그대로 적는다');
  const unread = await inspectPick(asFile(hugeMoovHeader(64 * 1024 * 1024), 'big.MOV'), limits, none);
  ok(!unread.ok && unread.message === CAPTURE_RATE_TEXT.capture_rate_unknown, 'R04: 머리를 못 읽어 영상인지 모르는 파일도 고를 때 멈춘다');
  const fine = await inspectPick(asFile(mov240(4096), 'side.MOV'), limits, none);
  ok(fine.ok && fine.picked.facts?.stepFps != null, 'R04: 240fps 는 고를 수 있다');
  const ntsc = await inspectPick(asFile(mov120(4096), 'rear.MOV'), limits, none);
  ok(ntsc.ok, 'R04: 119.88fps 는 고를 수 있다');
  for (const t of [CAPTURE_RATE_TEXT.capture_rate_low, CAPTURE_RATE_TEXT.capture_rate_unknown, !sixty.ok ? sixty.message : '']) {
    ok(!t.includes('압축') && !/변환하|줄여|재생 속도를 바꾸/.test(t), 'R04: 막힘 글이 변환 · 압축을 해결책으로 권하지 않는다');
  }
}

/* ── R07 검수: 평균 기준 실패 글 · 진단 SHA 를 파일에 묶기 · 다시 고르기 단추 이름 ── */
{
  const limits = { maxFileBytes: 2 ** 30, maxTotalBytes: 2 ** 31, maxAssets: 12 };
  const none = { picked: null, asset: null };
  const asFile = (b: Buffer, name: string, lastModified = 1_700_000_000_000) => new File([new Uint8Array(b)], name, { type: 'video/quicktime', lastModified });

  /* 실제 간격이 고르지 않은 파일: 가장 많은 간격은 240fps(100장), 평균은 약 66fps — 판정은 평균 기준으로 막힌다 */
  const mixed = await inspectPick(asFile(buildMov({ timescale: 240000, stts: [[100, 1000], [60, 8000]] }), 'mixed.MOV'), limits, none);
  ok(!mixed.ok && mixed.code === 'capture_rate_low', 'R07 검수: 섞인 간격 파일은 평균으로 막힌다(판정 그대로)');
  ok(
    !mixed.ok && mixed.rejected?.facts?.frameTiming === 'variable' && /가장 많은 간격 기준으로는 240fps/.test(mixed.message) && /평균은 66(\.\d+)?fps/.test(mixed.message) && mixed.message.includes('평균도 120fps 이상'),
    'R07 검수: 막힘 글이 걸린 기준(평균)을 말하고 간격 · 평균 두 값을 다 적는다',
  );
  ok(!mixed.ok && !/^선택한 파일에서는 240fps가 확인됩니다/.test(mixed.message), 'R07 검수: 240fps 만 적고 120 이상을 요구하는 모순 글이 아니다');
  /* 간격 자체가 낮고 고르지 않은 파일 — 낮은 값과 평균을 함께 */
  const lowMixed = await inspectPick(asFile(buildMov({ timescale: 600, stts: [[300, 20], [10, 40]] }), 'lm.MOV'), limits, none);
  ok(!lowMixed.ok && lowMixed.message.startsWith('선택한 파일에서는 30fps가 확인됩니다') && /평균 \d/.test(lowMixed.message), 'R07 검수: 낮은 간격 + 고르지 않음은 두 값을 함께 적는다');

  /* 진단 SHA: 크기 · 날짜가 같고 내용이 다른 두 파일 */
  const a = new File([new Uint8Array(4096).fill(1)], 'same.MOV', { lastModified: 1 });
  const b = new File([new Uint8Array(4096).fill(2)], 'same.MOV', { lastModified: 1 });
  const want = (f: Uint8Array) => createHash('sha256').update(f).digest('hex');
  {
    /* 앞 재기가 늦게 끝나도 새 파일의 상태를 덮지 않는다 · 앞 재기는 멈춤 신호를 받는다 */
    const pending: { file: Blob; resolve: (v: string) => void; progress?: (d: number, t: number) => void; signal?: AbortSignal }[] = [];
    const run = createDiagHashRun((file, progress, signal) => new Promise<string>((resolve) => pending.push({ file, resolve, progress, signal })));
    const seen: DiagHashState[] = [];
    run.start(a, (s) => seen.push(s));
    run.start(b, (s) => seen.push(s));
    ok(pending[0].signal?.aborted === true && pending[1].signal?.aborted === false, 'R07 검수: 새 파일로 시작하면 앞 재기를 멈춘다');
    pending[0].progress?.(4096, 4096);
    pending[0].resolve('A-late');
    await Promise.resolve();
    await Promise.resolve();
    ok(!seen.some((s) => s.value === 'A-late' || (s.file === a && s.state !== 'busy')), 'R07 검수: 앞 파일의 늦은 결과 · 진행은 버린다');
    pending[1].resolve('B-hash');
    await Promise.resolve();
    await Promise.resolve();
    const last = seen[seen.length - 1];
    ok(last.file === b && last.state === 'done' && last.value === 'B-hash', 'R07 검수: 새 파일의 값만 그 파일에 묶여 온다');
    /* 화면에서 사라지면(cancel) 늦은 결과도 버린다 */
    const run2 = createDiagHashRun((file, _p, signal) => new Promise<string>((resolve) => pending.push({ file, resolve, signal })));
    const seen2: DiagHashState[] = [];
    run2.start(a, (s) => seen2.push(s));
    run2.cancel();
    pending[pending.length - 1].resolve('late');
    await Promise.resolve();
    await Promise.resolve();
    ok(pending[pending.length - 1].signal?.aborted === true && seen2.length === 1 && seen2[0].state === 'busy', 'R07 검수: 사라진 뒤 늦은 결과를 그리지 않는다');
  }
  {
    /* 실제 hashOnce 로: 같은 크기 · 날짜, 다른 내용 — 값이 각 파일 것이다 */
    const run = createDiagHashRun();
    const done = (f: File) => new Promise<DiagHashState>((res) => run.start(f, (s) => s.state !== 'busy' && res(s)));
    const ra = await done(a);
    const rb = await done(b);
    ok(ra.file === a && ra.value === want(new Uint8Array(4096).fill(1)) && rb.file === b && rb.value === want(new Uint8Array(4096).fill(2)) && ra.value !== rb.value, 'R07 검수: 같은 크기 · 날짜의 다른 파일은 다른 SHA-256 으로 각자 묶인다');
  }

  /* 화면: 고른 영상이 남은 채 다음 파일이 막히면, 안내가 실제로 있는 단추 이름(다른 영상 선택)을 말한다 */
  /* 실제 화면 부품을 서버 렌더로 그린다 — .tsx 는 TypeScript 로 옮기고 .css 모듈은 이름표만 돌려준다(pitch-report-render-test 와 같은 방식) */
  const ts = (await import('typescript')).default;
  /* 설치된 @types/node 에는 registerHooks 가 아직 없다 — 쓰는 모양만 적는다(node 26 에는 있다) */
  type Next<C> = (spec: string, ctx: C) => unknown;
  type ResolveCtx = { parentURL?: string };
  type LoadCtx = object;
  const { registerHooks } = nodeModule as unknown as {
    registerHooks: (h: {
      resolve: (spec: string, ctx: ResolveCtx, next: Next<ResolveCtx>) => unknown;
      load: (url: string, ctx: LoadCtx, next: Next<LoadCtx>) => unknown;
    }) => void;
  };
  registerHooks({
    /* next/link 같은 확장자 없는 next 하위 경로 — 서버 렌더에서만 필요한 보정 */
    resolve(spec, ctx, next) {
      /* next 내부는 서버 렌더 시험에 필요 없다 — 링크 · 이동만 단순한 대역으로 */
      if (spec === 'next/link')
        return { url: 'data:text/javascript,' + encodeURIComponent(`import {createElement as h} from '${import.meta.resolve('react')}';` + " export default ({href,children,prefetch,scroll,replace,transitionTypes,...p})=>h('a',{href:String(href),...p},children);"), shortCircuit: true };
      if (spec === 'next/navigation')
        return { url: 'data:text/javascript,' + encodeURIComponent("const r={push(){},replace(){},refresh(){},back(){},prefetch(){}}; export const useRouter=()=>r; export const usePathname=()=>'/'; export const useSearchParams=()=>new URLSearchParams(); export const redirect=()=>{}; export const notFound=()=>{};"), shortCircuit: true };
      if (/^next\/[\w-/]+$/.test(spec)) return next(`${spec}.js`, ctx);
      /* 앱 안 상대 경로는 확장자를 안 적는다 — .ts · .tsx 를 붙여 본다 */
      if (spec.startsWith('.') && ctx.parentURL?.startsWith('file:') && !/\.[cm]?[jt]sx?$|\.css$|\.json$/.test(spec)) {
        for (const ext of ['.ts', '.tsx']) {
          const u = new URL(spec + ext, ctx.parentURL);
          if (existsSync(u)) return next(u.href, ctx);
        }
      }
      return next(spec, ctx);
    },
    load(url, ctx, next) {
      if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default new Proxy({},{get:(_,k)=>String(k)})' };
      if (url.startsWith('file:') && url.endsWith('.tsx')) {
        const src = readFileSync(new URL(url), 'utf8');
        const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
        return { format: 'module', shortCircuit: true, source: out };
      }
      return next(url, ctx);
    },
  });
  const { VideoStep, REPICK_LABEL, PICK_LABEL } = await import('@/components/intake/guided-steps');
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const facts = !mixed.ok ? (mixed.rejected?.facts ?? null) : null;
  const okPick = await inspectPick(asFile(mov240(4096), 'side.MOV'), limits, none);
  const base = { view: 'side' as const, inspecting: false, limits, onPick() {}, onBack() {}, onNext() {}, onOriginal() {} };
  const err = !mixed.ok ? mixed.message : '';
  const withPicked = renderToStaticMarkup(
    React.createElement(VideoStep, { ...base, picked: okPick.ok ? okPick.picked : null, error: err, errorCode: 'capture_rate_low', rejected: { file: a, facts } }),
  );
  ok(withPicked.includes(`>${REPICK_LABEL}</button>`) && withPicked.includes(`‘${REPICK_LABEL}’을 누르고`) && !withPicked.includes(`>${PICK_LABEL}</button>`), 'R07 검수 · R08: 고른 영상이 남았으면 단추 · 안내가 모두 다른 원본 선택이다');
  const empty = renderToStaticMarkup(React.createElement(VideoStep, { ...base, picked: null, error: err, errorCode: 'capture_rate_low', rejected: { file: a, facts } }));
  ok(empty.includes(`>${PICK_LABEL}</button>`) && empty.includes(`‘${PICK_LABEL}’을 누르고`) && !empty.includes(`‘${REPICK_LABEL}’`), 'R07 검수 · R08: 고른 영상이 없으면 단추 · 안내가 모두 파일에서 원본 선택이다');
  ok(empty.includes('파일 진단') && empty.includes('파일 지문(SHA-256) 계산') && !/[0-9a-f]{64}/.test(empty), 'R07 검수: 진단은 처음에 SHA 를 재지 않는다(누를 때만)');
  /* ── R08: 파일 먼저 · 네 장 안내 ── */
  {
    const fp = await import('@/components/intake/file-picker');
    const UA = {
      iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
      kakaoIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 11.0.0',
      chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
      mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
      android: 'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
      windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
    };
    const touch = (userAgent: string) => fp.intakeAcceptFor({ userAgent, maxTouchPoints: 5 });
    ok([UA.iphone, UA.ipad, UA.ipadDesktop, UA.kakaoIphone, UA.chromeIos].every((u) => touch(u) === fp.IOS_DOCUMENT_ACCEPT), 'R08: 아이폰 · 아이패드(데스크톱 모드 포함) · 카카오톡 · 크롬 iOS 는 문서 선택 accept');
    ok(fp.IOS_DOCUMENT_ACCEPT === 'application/octet-stream' && !/video|image|\.mov|\.mp4|\.m4v|\*/i.test(fp.IOS_DOCUMENT_ACCEPT), 'R08: 아이폰 accept 에 영상 · 사진 MIME · 확장자 · 와일드카드가 없다(보관함 · 카메라 메뉴가 안 생긴다)');
    ok(fp.intakeAcceptFor({ userAgent: UA.mac, maxTouchPoints: 0 }) === fp.DEFAULT_ACCEPT && touch(UA.android) === fp.DEFAULT_ACCEPT && fp.intakeAcceptFor({ userAgent: UA.windows }) === fp.DEFAULT_ACCEPT, 'R08: Mac · 안드로이드 · 윈도는 예전 accept 그대로');
    ok(fp.DEFAULT_ACCEPT === 'video/*,.mov,.mp4,.m4v' && fp.currentIntakeAccept() === fp.DEFAULT_ACCEPT, 'R08: 서버 렌더(navigator 없음)는 예전 값');
    {
      const seen: string[] = [];
      const el = { accept: fp.DEFAULT_ACCEPT, click() { seen.push(this.accept); } };
      fp.openFilePicker(el, touch(UA.iphone));
      fp.openFilePicker(el, touch(UA.android));
      ok(seen[0] === fp.IOS_DOCUMENT_ACCEPT && seen[1] === fp.DEFAULT_ACCEPT, 'R08 검수: accept 는 click 이 불리기 전에 기기 값으로 바뀐다');
      const src = readFileSync(new URL('../components/intake/slots.tsx', import.meta.url), 'utf8');
      ok(/openFilePicker\(input\.current\)/.test(src) && !/input\.current\?\.click\(\)/.test(src), 'R08 검수: 고르기 단추는 늘 openFilePicker 로 연다');
    }

    ok(fp.GUIDE_CHAPTERS.length === 4 && fp.GUIDE_CHAPTERS.map((c) => c.id).join() === '01-open-share,02-export-original,03-save-files,04-pick-file', 'R08: 안내는 네 장, 차례대로');
    ok(fp.GUIDE_CHAPTERS.every((c) => c.video === `/intake-guides/original-file-v1/${c.id}.mp4` && c.poster === `/intake-guides/original-file-v1/${c.id}.jpg`), 'R08: 영상 · 포스터 주소는 GPT 가 가린 파일 자리만');
    const all = fp.GUIDE_CHAPTERS.map((c) => `${c.title} ${c.body} ${c.note ?? ''}`).join(' ');
    ok(all.includes('무수정 원본 내보내기') && all.includes('수정되지 않은 원본 내보내기') && all.includes(`‘${fp.PICK_LABEL}’`), 'R08: 메뉴 이름 둘 · 실제 단추 이름을 말한다');
    ok(!/AirDrop|모든 사진 데이터|‘현재’|사진 보관함|카메라로/.test(all + fp.FILE_FIRST_NOTE), 'R08: 다른 길(AirDrop · 모든 사진 데이터 · 현재 · 보관함 · 카메라)을 가르치지 않는다');
    ok(fp.GUIDE_CHAPTERS.every((c) => [...c.body].length <= 90), 'R08: 장마다 본문이 짧다');
    ok(fp.GUIDE_CHAPTERS.map((c) => c.shape).join() === 'tall,wide,tall,tall', 'R08 검수: 2장만 가로(590×328) 영상, 나머지는 세로(590×1278)');
    ok(fp.FILE_FIRST_NOTE === '사진 앱에서 ‘무수정 원본 내보내기’로 파일 앱에 저장한 뒤 선택해 주세요.' && !/만 고를|만 선택|확인합니다|보장/.test(fp.FILE_FIRST_NOTE), 'R08 검수: 고르기 전 한 줄은 할 일만 말하고, 출처를 막는다고 하지 않는다');

    const { GuideBody } = await import('@/components/intake/original-file-guide');
    const g0 = renderToStaticMarkup(React.createElement(GuideBody, { onClose() {} }));
    const vids = g0.match(/<video\b[^>]*>/g) ?? [];
    ok(vids.length === 1 && /preload="none"/.test(vids[0]) && vids[0].includes('poster="/intake-guides/original-file-v1/01-open-share.jpg"') && /playsinline/i.test(vids[0]) && /controls/.test(vids[0]) && !/autoplay/i.test(vids[0]), 'R08: 한 번에 영상 하나 · preload none · poster · 조작 · 저절로 안 틂');
    ok(!g0.includes('02-export-original.mp4') && !g0.includes('04-pick-file.mp4'), 'R08: 다른 장 영상은 붙이지 않는다');
    ok((g0.match(/aria-current="step"/g) ?? []).length === 1 && g0.includes('>이전</button>') && g0.includes('>다음</button>') && /disabled=""[^>]*>이전/.test(g0), 'R08: 번호 이동 · 이전(첫 장은 잠김) · 다음');
    ok(g0.includes(`‘${fp.PICK_LABEL}’`), 'R08: 준비된 사람은 창을 닫고 곧장 고를 수 있다고 말한다');
    const g3 = renderToStaticMarkup(React.createElement(GuideBody, { onClose() {}, initial: 3 }));
    ok(/aspect-\[590\/1278\]/.test(vids[0] ?? "") && !/aspect-\[590\/328\]/.test(vids[0] ?? ""), 'R08 검수: 세로 영상은 세로 비율 칸으로 글 옆에 선다');
    const g1 = renderToStaticMarkup(React.createElement(GuideBody, { onClose() {}, initial: 1 }));
    const v1 = (g1.match(/<video\b[^>]*>/g) ?? [])[0] ?? '';
    ok(/aspect-\[590\/328\]/.test(v1) && /w-full/.test(v1) && v1.includes('02-export-original.mp4'), 'R08 검수: 가로 영상(2장)은 폭을 다 쓴다');
    ok(g3.includes('>닫기</button>') && g3.includes('04-pick-file.mp4') && g3.includes('미리 보기가 나오지 않아도'), 'R08: 마지막 장은 닫기 · 미리 보기 안내');

    const { SlotCard } = await import('@/components/intake/slots');
    const slotEmpty = renderToStaticMarkup(React.createElement(SlotCard, { view: 'side', asset: null, picked: null, inspecting: false, error: null, onPick() {} }));
    const slotPicked = renderToStaticMarkup(React.createElement(SlotCard, { view: 'rear', asset: null, picked: okPick.ok ? okPick.picked : null, inspecting: false, error: null, onPick() {} }));
    ok(slotEmpty.includes(`>${fp.PICK_LABEL}</button>`) && slotPicked.includes(`>${fp.REPICK_LABEL}</button>`), 'R08: 교체 · 고침 · 이어 보내기 칸도 같은 단추 이름');
    ok(slotEmpty.includes(`accept="${fp.DEFAULT_ACCEPT}"`) && !slotEmpty.includes('capture='), 'R08: 서버 렌더 accept 는 예전 값 · capture 없음(누를 때 기기 값으로 바뀐다)');
    const noPick = renderToStaticMarkup(React.createElement(VideoStep, { ...base, picked: null, error: null }));
    ok(noPick.includes(fp.FILE_FIRST_NOTE) && noPick.includes(`>${fp.GUIDE_OPEN_LABEL}</button>`) && !/AirDrop|모든 사진 데이터|‘파일 선택’/.test(noPick), 'R08: 고르기 전 화면은 짧은 한 줄 + 안내 열기, 옛 길 글 없음');
  }
}

console.log(`intake client selftest: ${passed} 통과`);
process.exit(0);
