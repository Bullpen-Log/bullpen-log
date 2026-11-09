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
import { createHash } from 'node:crypto';
import { hashOnce } from '@/components/intake/pick';
import { SEND_CANCELLED_TEXT, createSendController, type SendControllerInput, type SendState } from '@/components/intake/use-send';
import {
  CONTROL_TIMEOUT_MS,
  FINALIZE_TIMEOUT_MS,
  IntakeRequestError,
  TIMEOUT_TEXT,
  createIntakeClient,
  requestJson,
  type IntakeClient,
  type IntakeReceipt,
  type PublicAsset,
  type PublicIntakeState,
  type PublicStateResponse,
  type UploadGrant,
} from '@/lib/intake/public-client';
import { IntakeUploadError, browserRecoveryStore, recoveryKey, startIntakeUpload, type RecoveryStore, type StartUploadOptions, type UploadHandle } from '@/lib/intake/upload-client';
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
  const count = { reserve: 0, start: 0, done: 0, reserved: 0, publishAfterDispose: 0, makeKey: 0 };
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

console.log(`intake client selftest: ${passed} 통과`);
process.exit(0);
