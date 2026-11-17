/** Real production modules with local cookie/network fixtures; no server, DB or credentials. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createSessionLifecycle } from '../native/src/lib/session-lifecycle.ts';
import { createReadShare } from '../native/src/lib/read-share.ts';
import { readDeadline } from '../native/src/lib/read-deadline.ts';

let checks = 0;
const eq = (actual: unknown, expected: unknown) => { assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected); checks++; };
const rejects = async (p: Promise<unknown>, code?: string) => {
  if (code) await assert.rejects(p, (e: unknown) => (e as { code?: string }).code === code);
  else await assert.rejects(p);
  checks++;
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const response = (result: unknown, status = 200) => ({ status, json: async () => result });
function evaluate(path: string, deps: Record<string, unknown>, extras: Record<string, unknown> = {}) {
  const box = { exports: {} as Record<string, (...args: any[]) => any> };
  const source = ts.transpile(readFileSync(path, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  vm.runInNewContext(source, {
    module: box, exports: box.exports, URL, FormData, Date, AbortController,
    require: (key: string) => { assert.ok(key in deps, key); return deps[key]; }, ...extras,
  });
  return box.exports;
}
function fixture(options: { sync?: () => Promise<unknown>; fetch?: (action: string, opts: RequestInit) => Promise<unknown> } = {}) {
  const events: string[] = [];
  let app = 'account-A', web = 'account-A', epoch = 0;
  const native = {
    sync: async () => { events.push('sync'); await options.sync?.(); },
    mirror: async () => { events.push('mirror'); web = app; },
    clearSession: async () => { events.push('clear'); app = ''; web = ''; },
  };
  const rpc = evaluate('native/src/lib/rpc.ts', {
    '@/lib/app-api': { APP_API_HEADER: 'x-test', APP_API_LEVEL: 8 },
    '@/lib/time-zone': { deviceTimeZone: () => null },
    '@/lib/release-access': {}, '~/lib/site': { SITE_URL: 'https://example.invalid' },
    '../../modules/bullpen-native': { BullpenNative: native },
    './store': { cacheEpoch: () => epoch }, './read-share': { createReadShare },
    './session-lifecycle': { createSessionLifecycle },
    './read-deadline': { readDeadline: (run: any, _ms: number, error: any, timeout: any) => readDeadline(run, 60, error, timeout) },
  }, { fetch: async (url: string, opts: RequestInit) => {
    const action = url.split('/').at(-1)!;
    events.push(action);
    if (options.fetch) return options.fetch(action, opts);
    if (action === 'auth.login') { app = 'account-B'; return response({ ok: true, redirect: '/today' }); }
    if (action === 'auth.logout') { app = ''; return response({ ok: true, redirect: '/login' }); }
    return response({ ok: true, result: { ok: true, userId: app } });
  } });
  const account = evaluate('native/src/account/session.ts', {
    '~/lib/rpc': rpc, '~/lib/site': { SITE_URL: 'https://example.invalid' },
    '../../modules/bullpen-native': { BullpenNative: native },
    '~/shell/push': { unregisterPush: async () => rpc.rpc('push.unregisterPushDevice').catch(() => undefined) },
    '~/lib/store': { cacheClear: async () => { epoch++; events.push('cache-clear'); } },
  });
  return { rpc, account, events, jars: () => [app, web] };
}
function pitchClient(rpc: Record<string, (...args: any[]) => any>, fetcher: () => Promise<unknown> = async () => response({})) {
  return evaluate('native/src/pitch/api.ts', {
    '~/lib/rpc': rpc, '~/lib/site': { SITE_URL: 'https://example.invalid' },
    '~/shell/release': { setReleaseFromMe: () => undefined },
    '@/lib/app-api': { APP_API_HEADER: 'x-test', APP_API_LEVEL: 8 },
    '@/lib/country': { countryOf: () => 'KR' }, '@/lib/time-zone': { deviceTimeZone: () => null },
    '~/lib/country-store': { setCountryNow: () => undefined },
    '~/lib/prefs': { applyCountryUnits: async () => undefined },
    '@/lib/phone-video-path': {}, '../../modules/local-video': {},
  }, { fetch: fetcher, setTimeout, clearTimeout });
}

// Cold reopen shares one hydration across concurrent consumers, then mirrors BEFORE network.
{
  const hold = deferred<void>();
  const f = fixture({ sync: () => hold.promise });
  const a = f.rpc.rpc('app.loadAppMe');
  const b = f.rpc.rpc('app.loadAppMe');
  eq(a === b, true);
  await tick(); eq(f.events, ['sync']);
  hold.resolve(); await a;
  eq(f.events, ['sync', 'mirror', 'app.loadAppMe']);
  eq(f.jars(), ['account-A', 'account-A']);
}
// Hydration errors are retryable, never swallowed as signed-out or cached forever.
{
  let attempts = 0;
  const f = fixture({ sync: async () => { if (++attempts === 1) throw new Error('locked jar'); } });
  await rejects(f.account.restoreAccount());
  eq(f.events.includes('clear'), false);
  await f.account.restoreAccount(); eq(attempts, 2);
}
// Expiry, revocation and deleted-account denial use the existing server contract.
{
  const f = fixture({ fetch: async () => response({ ok: true, result: { ok: false, error: '로그인이 필요해요.' } }) });
  await f.account.restoreAccount(); eq(f.jars(), ['', '']);
  eq(f.events.filter((e) => e === 'clear').length, 1);
}
// Offline, malformed/500, policy and non-auth domain errors preserve credentials.
for (const fetcher of [
  async () => { throw new Error('offline'); },
  async () => response({ ok: false, error: 'server' }, 500),
  async () => response(null, 500),
  async () => response({ ok: false, error: 'forbidden' }, 403),
  async () => response({ ok: true, result: { ok: false, error: 'temporary error' } }),
]) {
  const f = fixture({ fetch: fetcher });
  await rejects(f.account.restoreAccount());
  eq(f.jars(), ['account-A', 'account-A']);
  eq(f.events.includes('clear'), false);
}
// Timeout includes secure hydration, and retry may recover without deleting the session.
{
  const first = deferred<void>(); let attempts = 0;
  const f = fixture({ sync: () => ++attempts === 1 ? first.promise : Promise.resolve() });
  await rejects(f.account.restoreAccount(), 'timeout'); eq(f.events.includes('clear'), false);
  await f.account.restoreAccount(); eq(attempts, 2);
  first.resolve(); await tick();
  eq(f.events.filter((e) => e === 'app.loadAppMe').length, 1);
}
// A late read/redirect from A cannot populate B, including response-body waiting.
for (const body of [{ ok: true, result: { userId: 'account-A' } }, { ok: true, redirect: '/login' }]) {
  const hold = deferred<unknown>();
  const f = fixture({ fetch: async (a) => a === 'app.loadThing' ? { status: 200, json: () => hold.promise } : response({ ok: true, result: null }) });
  const old = f.rpc.rpc('app.loadThing'); await tick();
  const cleared = f.account.clearSession(); await cleared;
  hold.resolve(body); await rejects(old, 'offline');
}
// Logout queued behind login waits for the cookie writer and clears it last.
{
  const login = deferred<unknown>();
  const f = fixture({ fetch: async (a) => a === 'auth.login' ? login.promise : response({ ok: true, redirect: '/login' }) });
  const signingIn = f.account.accountForm('auth.login', { email: 'fixture', password: 'fixture' });
  await tick(); const leaving = f.account.logoutNow(); await tick();
  eq(f.events.includes('auth.logout'), false);
  login.resolve(response({ ok: true, redirect: '/today' }));
  const result = await signingIn; eq('moved' in result, false);
  eq(await leaving, { moved: '/login' });
  eq(f.jars(), ['', '']); eq(f.events.at(-2), 'clear');
}
// Offline logout is final locally, even when unregister/logout requests fail.
{
  const f = fixture({ fetch: async () => { throw new Error('offline'); } });
  eq(await f.account.logoutNow(), { moved: '/login' }); eq(f.jars(), ['', '']);
}
// Work arriving during an account transition never sends under a different cookie.
{
  const login = deferred<unknown>();
  const f = fixture({ fetch: async () => login.promise });
  const signingIn = f.account.accountForm('auth.login', {}); await tick();
  await rejects(f.rpc.rpc('app.loadThing'), 'offline');
  eq(f.events.includes('app.loadThing'), false);
  login.resolve(response({ ok: true, redirect: '/today' })); await signingIn;
}
// Read sharing is separated by account generation; failed login retains manual errors.
{
  const f = fixture();
  await f.account.restoreAccount();
  eq(await f.account.accountForm('auth.login', {}), { moved: '/today' });
  eq(f.rpc.sessionChanging(), false);
  eq((await f.rpc.rpc('app.loadAppMe')).userId, 'account-B');
  eq(f.jars(), ['account-B', 'account-B']);
  const g = fixture({ fetch: async () => response({ ok: true, result: { error: 'wrong password' } }) });
  eq(await g.account.accountForm('auth.login', {}), { state: { error: 'wrong password' } });
}
// Account timeout aborts transport and never reports a late successful login.
{
  const hold = deferred<unknown>(); let aborted = false;
  const f = fixture({ fetch: async (_action, opts) => {
    opts.signal?.addEventListener('abort', () => { aborted = true; });
    return hold.promise;
  } });
  const login = f.account.accountForm('auth.login', {});
  const result = await login;
  eq('moved' in result, false); eq(aborted, true); eq(f.rpc.sessionChanging(), false);
  hold.resolve(response({ ok: true, redirect: '/today' })); await tick();
  eq(f.events.filter((e) => e === 'mirror').length, 1);
}
// Source integration assertions only: native cookie logic is NOT executed on a device here.
{
  const f = fixture(); const p = pitchClient(f.rpc);
  eq((await p.loadMe()).userId, 'account-A');
  await f.account.accountForm('auth.login', {});
  eq((await p.loadMe()).userId, 'account-B');
}
{
  const hold = deferred<unknown>(); const f = fixture();
  const p = pitchClient(f.rpc, () => hold.promise);
  const old = p.call('/api/pitch-log', { method: 'GET' }); await tick();
  await f.account.clearSession();
  hold.resolve({ status: 200, ok: true, json: async () => [{ userId: 'account-A' }] });
  await rejects(old);
}
for (const file of ['native/src/app/_layout.tsx', 'native/src/dugout/app/_layout.tsx']) {
  assert.match(readFileSync(file, 'utf8'), /<SessionGate><Stack/); checks++;
}
const swift = readFileSync('native/modules/bullpen-native/ios/BullpenNativeModule.swift', 'utf8');
assert.match(swift, /!Self\.isSession\(\$0, host\) \|\| appSessions\.isEmpty/); checks++;
assert.match(swift, /Self\.sessionGeneration \+= 1/); checks++;
assert.match(swift, /Self\.matches\(\$0, host\) && Self\.unexpired\(\$0\)/); checks++;
console.log(`APP-AUTOLOGIN01: ${checks} assertions passed (mock transport; no device/native execution)`);
