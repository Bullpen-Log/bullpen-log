import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const q = (globalThis.__videoStoreTest = {
  epoch: 0,
  effects: false,
  rpc: async () => ({ ok: true, items: [] }),
  cache: async () => null,
  writes: [],
});
const code = `const q=globalThis.__videoStoreTest; export const useEffect=f=>{if(q.effects)f()},useSyncExternalStore=(s,g)=>g(),cacheEpoch=()=>q.epoch,cacheGet=()=>q.cache(),cacheSet=async(k,v)=>q.writes.push(v),rpc=(...a)=>q.rpc(...a),removePhoneOrphans=async()=>{},monthOf=()=>'',refreshMonth=()=>{},toast=()=>{};`;
const stub = 'data:text/javascript,' + encodeURIComponent(code);
const hooks = registerHooks({
  resolve(name, ctx, next) {
    if (
      [
        'react',
        '~/lib/store',
        '~/lib/rpc',
        '~/pitch/api',
        '~/pitch/store',
        '~/shell/toast',
      ].includes(name)
    )
      return { url: stub, shortCircuit: true };
    const file = name.startsWith('@/')
      ? path.join(root, name.slice(2))
      : name.startsWith('./') && ctx.parentURL?.startsWith('file:')
        ? path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), name)
        : null;
    if (file && existsSync(file + '.ts'))
      return next(pathToFileURL(file + '.ts').href, ctx);
    return next(name, ctx);
  },
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
let count = 0;
const check = (name, value) => {
  assert.ok(value, name);
  count++;
};
try {
  const s = await import('../native/src/videos/store.ts');
  const state = () => s.useMyVideos();
  for (const outcome of ['success', 'failure'])
    for (const changeEpoch of [true, false]) {
      s.resetMyVideos();
      const old = deferred(),
        fresh = deferred();
      q.rpc = () => old.promise;
      const a = s.refreshMyVideos();
      const queued = s.refreshMyVideos(true);
      if (changeEpoch) q.epoch++;
      s.resetMyVideos();
      q.rpc = () => fresh.promise;
      const b = s.refreshMyVideos();
      if (outcome === 'success') old.resolve({ ok: true, items: [{ path: 'A' }] });
      else old.reject(Error('old offline'));
      await a;
      await queued;
      check(
        'late A does not end B loading ' + outcome + changeEpoch,
        state().loading && state().items === null
      );
      check(
        'late A does not clear B in-flight ' + outcome + changeEpoch,
        s.refreshMyVideos() === b
      );
      fresh.resolve({ ok: true, items: [{ path: 'B', note: null, revisit: false }] });
      await b;
      check(
        'only B visible ' + outcome + changeEpoch,
        state().items[0].path === 'B' && !state().loading && !state().error
      );
    }
  s.resetMyVideos();
  q.rpc = async () => ({ ok: true, items: [{ path: 'kept' }] });
  await s.refreshMyVideos();
  q.rpc = async () => {
    throw Error('offline');
  };
  await s.refreshMyVideos();
  check(
    'failed refresh preserves previous list',
    state().items[0].path === 'kept' && state().error && !state().loading
  );
  s.resetMyVideos();
  const warm = deferred(),
    response = deferred();
  q.cache = () => warm.promise;
  q.rpc = () => response.promise;
  const p = s.refreshMyVideos();
  s.resetMyVideos();
  warm.resolve([{ path: 'old-cache' }]);
  response.resolve({ ok: true, items: [{ path: 'old-network' }] });
  await p;
  check('reset discards late cache too', state().items === null);
  console.log(`video store races: ${count} checks passed`);
} finally {
  hooks.deregister();
  delete globalThis.__videoStoreTest;
}
