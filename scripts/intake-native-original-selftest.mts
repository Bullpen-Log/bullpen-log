/** Real disk-bridge protocol -> File reader -> existing metadata, SHA256 and actual TUS library.
 * Synthetic MOV + fake Photos disk and HTTP only. No DB, Photos device or production upload.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { HttpStack } from 'tus-js-client';
import {
  OriginalBridge,
  READ_BYTES,
  intakeDocument,
  intakeToken,
} from '../native/src/intake/bridge.ts';
import {
  NATIVE_INTAKE_MARKER,
  ORIGINAL_CHUNK_BYTES,
  nativeOriginalAvailable,
  originalRequest,
  pickNativeOriginal,
  isNativeOriginal,
} from '../components/intake/native-original.ts';
import {
  preparationOf,
  safePreparation,
} from '../components/intake/preparation-state.ts';
import { hashFileSha256, startIntakeUpload } from '@/lib/intake/upload-client';
import { readIntakeMediaFacts, captureRateCode } from '@/lib/intake/media';
import { inspectPick } from '../components/intake/pick.ts';
import { intakeLimits } from '@/lib/intake/limits';
import { buildMov } from './intake-fixtures.mts';

let n = 0;
function eq(actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected);
  n++;
}
const token = 'T'.repeat(43),
  source = `https://intake.test/submit#${token}`;
for (const scheme of ['sinker', 'bullpenlog', 'dugout'])
  eq(intakeToken(`${scheme}://intake#${token}`), token);
for (const bad of [
  `https://evil/intake#${token}`,
  `sinker://intake?token=x#${token}`,
  `sinker://intake#short`,
  `sinker://login#${token}`,
])
  eq(intakeToken(bad), null);
eq(intakeDocument(source, source), true);
for (const bad of [
  `https://evil/submit#${token}`,
  `https://intake.test/admin#${token}`,
  `${source}x`,
  `https://intake.test/submit?next=/admin#${token}`,
])
  eq(intakeDocument(bad, source), false);
eq(READ_BYTES, ORIGINAL_CHUNK_BYTES);
const prep = {
  view: 'side',
  stage: 'method',
  route: 'gallery',
  returnTo: 'side',
} as const;
eq(preparationOf(prep), prep);
eq(safePreparation({ ...prep, stage: 'confirm' }, false).stage, 'select');

let bytes = buildMov({
  timescale: 240,
  stts: [[480, 1]],
  mdatBytes: 7 * 1024 * 1024 + 19,
  mdatSeed: 15,
});
const uri = 'file:///private/tmp/intake-original/1234-ABCD.mov';
const removed: string[] = [],
  reads: number[] = [];
const bridge = new OriginalBridge(source, {
  authorize: async () => true,
  pick: async () => ({ uri, name: 'IMG_original.MOV' }),
  size: async () => bytes.length,
  read: async (path, start, length) => {
    eq(path, uri);
    reads.push(length);
    return bytes.subarray(start, start + length).toString('base64');
  },
  remove: async (path) => {
    removed.push(path);
  },
  id: randomUUID,
});
const request = (op: string, args = {}) =>
  JSON.stringify({ t: 'intake-original', id: randomUUID(), op, ...args });
eq(await bridge.dispatch('https://evil/submit', request('pick')), null);
eq(await bridge.dispatch(source, 'malformed'), null);
eq(await bridge.dispatch(source, 'x'.repeat(1025)), null);
eq(
  (await bridge.dispatch(source, request('read', { handle: uri, start: 0, end: 1 })))
    ?.error != null,
  true
);
const win = new EventTarget() as EventTarget & {
  ReactNativeWebView: { postMessage(data: string): void };
};
Object.assign(globalThis, { window: win });
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: NATIVE_INTAKE_MARKER },
  configurable: true,
});
let pickedHandle = '';
win.ReactNativeWebView = {
  postMessage: (data) => {
    void bridge.dispatch(source, data).then((reply) => {
      if (reply?.result && typeof reply.result === 'object' && 'handle' in reply.result)
        pickedHandle = String(reply.result.handle);
      if (reply)
        win.dispatchEvent(new CustomEvent('intake-original-reply', { detail: reply }));
    });
  },
};
eq(nativeOriginalAvailable(), true);
eq((await bridge.dispatch(source, request('authorize')))?.result, true);
const file = (await pickNativeOriginal())!;
for (const range of [
  { start: -1, end: 5 },
  { start: 0, end: READ_BYTES + 1 },
  { start: 0.5, end: 1 },
  { start: 5, end: 4 },
  { start: 0, end: file.size + 1 },
])
  eq(
    (await bridge.dispatch(source, request('read', { handle: pickedHandle, ...range })))
      ?.error != null,
    true
  );
eq((await bridge.dispatch(source, request('deleteEverything')))?.error != null, true);
eq(file.name, 'IMG_original.MOV');
eq(file.size, bytes.length);
eq(isNativeOriginal(file), true);
eq(await hashFileSha256(file), createHash('sha256').update(bytes).digest('hex'));
eq([...new Uint8Array(await file.slice(-7).arrayBuffer())], [...bytes.subarray(-7)]);
const facts = await readIntakeMediaFacts({
  size: file.size,
  read: async (s, e) => new Uint8Array(await file.slice(s, e).arrayBuffer()),
});
eq(facts.nominalFps, 240);
eq(captureRateCode(facts), null);
const inspected = await inspectPick(file, intakeLimits(null, {}), {
  picked: null,
  asset: null,
});
eq(inspected.ok, true);
if (inspected.ok) eq(inspected.picked.url, '');

// Feed the remote File through the production TUS reader and compare received bytes.
const chunks: Buffer[] = [];
let offset = 0;
const stack: HttpStack = {
  getName: () => 'native-original-test',
  createRequest(method, url) {
    const headers: Record<string, string> = {};
    return {
      getMethod: () => method,
      getURL: () => url,
      setHeader: (k, v) => {
        headers[k] = v;
      },
      getHeader: (k) => headers[k],
      setProgressHandler: () => {},
      abort: async () => {},
      getUnderlyingObject: () => null,
      send: async (body) => {
        eq(headers['x-signature'], 'test-token');
        if (method === 'PATCH') {
          const chunk = Buffer.from(body as Uint8Array);
          chunks.push(chunk);
          offset += chunk.length;
        }
        return {
          getStatus: () => (method === 'POST' ? 201 : method === 'HEAD' ? 200 : 204),
          getHeader: (k) =>
            ({
              Location: 'https://storage.test/upload/one',
              'Upload-Offset': String(offset),
              'Upload-Length': String(file.size),
            })[k] ?? '',
          getBody: () => '',
          getUnderlyingObject: () => null,
        };
      },
    };
  },
};
await startIntakeUpload({
  file,
  fileName: file.name,
  sha256: await hashFileSha256(file),
  grant: {
    endpoint: 'https://storage.test/upload',
    token: 'test-token',
    tokenTtlMs: 600_000,
    apikey: null,
    bucket: 'test',
    objectName: 'original.mov',
    contentType: file.type,
    chunkSize: 6 * 1024 * 1024,
    uploadUrl: null,
    transportExpiresAt: null,
  },
  store: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  storeKey: 'test',
  refreshGrant: async () => {
    throw new Error('Unexpected refresh');
  },
  retryDelays: [],
  httpStack: stack,
}).done;
eq(offset, bytes.length);
eq(Buffer.concat(chunks), bytes);
eq(Math.max(...reads) <= READ_BYTES, true);
// The exact same path must still reject actual low-frame originals.
bytes = buildMov({ timescale: 600, stts: [[600, 10]] });
const low = (await pickNativeOriginal())!;
const rejected = await inspectPick(low, intakeLimits(null, {}), {
  picked: null,
  asset: null,
});
eq(rejected.ok, false);
if (!rejected.ok) eq(rejected.code, 'capture_rate_low');
const jitter: [number, number][] = Array.from({ length: 630 }, (_, i) => [
  1,
  i % 2 ? 251 : 249,
]);
bytes = buildMov({ timescale: 60000, stts: [[100, 1000], ...jitter] });
const variable = (await pickNativeOriginal())!;
eq(
  (await inspectPick(variable, intakeLimits(null, {}), { picked: null, asset: null }))
    .ok,
  true
);
await bridge.close();
eq(removed.length, 3);
eq(await bridge.dispatch(source, request('pick')), null);

const cancel = new OriginalBridge(source, {
  authorize: async () => true,
  pick: async () => null,
  size: async () => 0,
  read: async () => '',
  remove: async () => {},
  id: randomUUID,
});
eq((await cancel.dispatch(source, request('pick')))?.result, null);
const denied = new OriginalBridge(source, {
  authorize: async () => false,
  pick: async () => {
    throw new Error('사진 접근을 허용합니다.');
  },
  size: async () => 0,
  read: async () => '',
  remove: async () => {},
  id: randomUUID,
});
eq((await denied.dispatch(source, request('authorize')))?.result, false);
eq((await denied.dispatch(source, request('pick')))?.error, '사진 접근을 허용합니다.');
// Leaving while iCloud finishes must discard the late private copy.
let finish!: (v: { uri: string; name: string }) => void;
const lateDeleted: string[] = [];
const late = new OriginalBridge(source, {
  authorize: async () => true,
  pick: () =>
    new Promise((r) => {
      finish = r;
    }),
  size: async () => 10,
  read: async () => '',
  remove: async (p) => {
    lateDeleted.push(p);
  },
  id: randomUUID,
});
const pending = late.dispatch(source, request('pick'));
await late.close();
finish({ uri, name: 'late.mov' });
await pending;
eq(lateDeleted, [uri]);
// R15-R2: manually fire the production timeout callback; never sleep for ten minutes.
{
  const realSet = globalThis.setTimeout,
    realClear = globalThis.clearTimeout;
  const transport = win.ReactNativeWebView;
  let firePick!: () => void;
  globalThis.setTimeout = ((fn: () => void, ms: number) => {
    if (ms === 10 * 60_000) firePick = fn;
    return 1;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
  const previousURI = 'file:///private/tmp/intake-original/AAAA.mov';
  const expiredURI = 'file:///private/tmp/intake-original/BBBB.mov';
  const retryURI = 'file:///private/tmp/intake-original/CCCC.mov';
  let oldFinish!: (v: { uri: string; name: string }) => void;
  let newFinish!: (v: { uri: string; name: string }) => void;
  let cancelFinish!: () => void;
  let starts = 0,
    cancelCalls = 0;
  const deleted: string[] = [];
  const messages: { id: string; op: string; pickId?: string }[] = [];
  const dispatches = new Map<string, ReturnType<OriginalBridge['dispatch']>>();
  const session = new OriginalBridge(source, {
    authorize: async () => true,
    pick: async () => {
      starts++;
      if (starts === 1) return { uri: previousURI, name: 'previous.mov' };
      return new Promise<{ uri: string; name: string }>((r) => {
        if (starts === 2) oldFinish = r;
        else newFinish = r;
      });
    },
    size: async () => 4,
    read: async () => Buffer.from([1, 2, 3, 4]).toString('base64'),
    remove: async (p) => {
      deleted.push(p);
    },
    id: randomUUID,
    cancel: async () => {
      cancelCalls++;
      await new Promise<void>((r) => {
        cancelFinish = r;
      });
    },
  });
  try {
    const previous = (await session.dispatch(source, request('pick')))!.result as {
      handle: string;
    };
    win.ReactNativeWebView = {
      postMessage: (data) => {
        const message = JSON.parse(data);
        messages.push(message);
        const work = session.dispatch(source, data);
        dispatches.set(message.id, work);
        void work.then((reply) => {
          if (reply)
            win.dispatchEvent(
              new CustomEvent('intake-original-reply', { detail: reply })
            );
        });
      },
    };
    let timedOut = false;
    const first = originalRequest('pick').catch((e) => {
      timedOut = true;
      return String(e.message);
    });
    const firstId = messages[0].id;
    firePick();
    await Promise.resolve();
    await Promise.resolve();
    eq(
      messages.map((m) => m.op),
      ['pick', 'cancel']
    );
    eq(messages[1].pickId, firstId);
    eq(cancelCalls, 1);
    eq(timedOut, false);
    eq(
      (await session.dispatch(source, request('pick')))?.error,
      '이미 원본을 선택하고 있습니다.'
    );
    cancelFinish();
    eq(String(await first).includes('시간이 길어졌습니다'), true);
    let retrySettled = false;
    const retry = originalRequest('pick').then((v) => {
      retrySettled = true;
      return v as { handle: string; name: string };
    });
    eq(starts, 3);
    oldFinish({ uri: expiredURI, name: 'expired.mov' });
    const oldReply = await dispatches.get(firstId)!;
    eq(oldReply?.error, '원본 선택이 취소되었습니다.');
    eq(deleted, [expiredURI]);
    eq(retrySettled, false);
    // An expired operation's finally must not clear the new active pick.
    eq(
      (await session.dispatch(source, request('pick')))?.error,
      '이미 원본을 선택하고 있습니다.'
    );
    await originalRequest('cancel', { pickId: firstId });
    eq(cancelCalls, 1); // Delayed cancellation for the old ID cannot cancel the retry.
    newFinish({ uri: retryURI, name: 'retry.mov' });
    const selected = await retry;
    eq(selected.name, 'retry.mov');
    eq(
      (
        await session.dispatch(
          source,
          request('read', { handle: previous.handle, start: 0, end: 4 })
        )
      )?.result,
      'AQIDBA=='
    );
    eq(
      (
        await session.dispatch(
          source,
          request('read', { handle: selected.handle, start: 0, end: 4 })
        )
      )?.result,
      'AQIDBA=='
    );
    eq(deleted.includes(previousURI), false);
    await session.close();
    eq([...deleted].sort(), [expiredURI, previousURI, retryURI].sort());
  } finally {
    win.ReactNativeWebView = transport;
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
}
// The native reply can be queued before the deadline, but delivered after the browser times out.
{
  const realSet = globalThis.setTimeout,
    realClear = globalThis.clearTimeout,
    transport = win.ReactNativeWebView;
  let firePick!: () => void;
  globalThis.setTimeout = ((fn: () => void, ms: number) => {
    if (ms === 10 * 60_000) firePick = fn;
    return 1;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
  let starts = 0;
  const deleted: string[] = [];
  let queued!: Awaited<ReturnType<OriginalBridge['dispatch']>>;
  let queuedWork!: ReturnType<OriginalBridge['dispatch']>;
  const session = new OriginalBridge(source, {
    authorize: async () => true,
    pick: async () => ({
      uri: `file:///private/tmp/intake-original/${++starts === 1 ? 'AAAA' : starts === 2 ? 'BBBB' : 'CCCC'}.mov`,
      name: `pick${starts}.mov`,
    }),
    size: async () => 4,
    read: async () => 'AQIDBA==',
    remove: async (p) => {
      deleted.push(p);
    },
    id: randomUUID,
    cancel: async () => {
      throw new Error('A completed pick must not cancel another native operation');
    },
  });
  try {
    const previous = (await session.dispatch(source, request('pick')))!.result as {
      handle: string;
    };
    win.ReactNativeWebView = {
      postMessage: (data) => {
        const m = JSON.parse(data);
        const work = session.dispatch(source, data);
        if (m.op === 'pick' && starts === 2) {
          queuedWork = work;
          void work.then((reply) => {
            queued = reply;
          });
        } else
          void work.then((reply) => {
            if (reply)
              win.dispatchEvent(
                new CustomEvent('intake-original-reply', { detail: reply })
              );
          });
      },
    };
    const first = originalRequest('pick').catch((e) => String(e.message));
    await queuedWork;
    const expired = queued!.result as { handle: string };
    firePick();
    eq(String(await first).includes('시간이 길어졌습니다'), true);
    eq(deleted, ['file:///private/tmp/intake-original/BBBB.mov']);
    eq(
      (
        await session.dispatch(
          source,
          request('read', { handle: expired.handle, start: 0, end: 4 })
        )
      )?.error != null,
      true
    );
    win.dispatchEvent(new CustomEvent('intake-original-reply', { detail: queued }));
    const retry = (await originalRequest('pick')) as { name: string };
    eq(retry.name, 'pick3.mov');
    eq(
      (
        await session.dispatch(
          source,
          request('read', { handle: previous.handle, start: 0, end: 4 })
        )
      )?.result,
      'AQIDBA=='
    );
    await session.close();
  } finally {
    win.ReactNativeWebView = transport;
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
}
console.log(
  `PASS ${n}: native-original protocol, 240/170fps accept/60fps reject, byte-identical SHA256/TUS, boundaries, timeout/retry/correlated cancel/queued and late cleanup`
);
