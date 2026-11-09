/** 실제 rpc.ts를 격리 의존성으로 실행한다. 기기·서버·DB 호출 없음. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { readDeadline } from '../native/src/lib/read-deadline.ts';
import { createReadShare } from '../native/src/lib/read-share.ts';

const source = ts.transpile(readFileSync('native/src/lib/rpc.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
let checks = 0;
const eq = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
function client(sync: () => Promise<unknown>, fetcher: (url: string, opts: RequestInit) => Promise<unknown>) {
  const box = { exports: {} as { rpc: <T>(a: string) => Promise<T> } };
  const deps: Record<string, unknown> = {
    '@/lib/app-api': { APP_API_HEADER: 'x-test', APP_API_LEVEL: 1 },
    '@/lib/time-zone': { deviceTimeZone: () => null },
    '@/lib/release-access': {}, '~/lib/site': { SITE_URL: 'https://example.invalid' },
    '../../modules/bullpen-native': { BullpenNative: { sync } },
    './store': { cacheEpoch: () => 1 }, './read-share': { createReadShare },
    './read-deadline': { readDeadline: (run: (s: AbortSignal) => Promise<unknown>, ms: number, error: () => Error, onTimeout: () => void) => {
      eq(ms, 20_000);
      return readDeadline(run, 15, error, onTimeout);
    } },
  };
  vm.runInNewContext(source, { module: box, exports: box.exports, require: (key: string) => {
    assert.ok(key in deps, key); return deps[key];
  }, URL, FormData, fetch: fetcher, Date });
  return box.exports;
}
const never = () => new Promise<never>(() => {});
const ok = async () => ({ status: 200, json: async () => ({ ok: true, result: { ok: true, samples: [] } }) });
// 멈춘 인증: 제한 후 오류, 늦은 인증 완료 뒤에도 요청을 보내지 않음. 재시도는 새 인증.
let syncCalls = 0, fetchCalls = 0;
let release!: () => void;
const c = client(() => { syncCalls++; return syncCalls === 1 ? new Promise<void>((r) => { release = r; }) : Promise.resolve(1); }, async () => { fetchCalls++; return ok(); });
await assert.rejects(c.rpc('swing-lab.loadAppSwingList'), (e: unknown) => (e as { code: string }).code === 'timeout');checks++;
release(); await new Promise((r) => setTimeout(r, 0));eq(fetchCalls, 0);
eq(await c.rpc('swing-lab.loadAppSwingList'), { ok: true, samples: [] });eq(syncCalls, 2);eq(fetchCalls, 1);
// 같은 읽기 공유, 본문 대기에도 제한, 네트워크 취소.
let aborted = false, requests = 0;
const d = client(async () => 1, async (_url, opts) => {
  requests++; opts.signal?.addEventListener('abort', () => { aborted = true; });
  return { status: 200, json: never };
});
const a = d.rpc('swing-lab.loadAppSwingList'), b = d.rpc('swing-lab.loadAppSwingList');eq(a, b);
await assert.rejects(a, (e: unknown) => (e as { code: string }).code === 'timeout');checks++;
eq(aborted, true);eq(requests, 1);
// 정상 요청과 권한/업데이트 오류는 기존 의미를 보존.
for (const [status, body, code] of [[426, {}, 'update'], [200, { ok: true, redirect: '/login' }, 'redirect'], [403, { ok: false, error: 'forbidden' }, 'forbidden']] as const) {
  const x = client(async () => 1, async () => ({ status, json: async () => body }));
  await assert.rejects(x.rpc('swing-lab.loadAppSwingList'), (e: unknown) => (e as { code: string }).code === code);checks++;
}
console.log(`dev3d 실제 RPC 격리 검사: ${checks} 통과`);
