/** Isolated HTTP and native reader checks. No service credentials or database. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import vm from 'node:vm';
import ts from 'typescript';
import { decidePath, type ReleaseStage } from '@/lib/release-access';
import { validateWikiContent } from '@/lib/wiki/validate';
import type { WikiSnapshot } from '@/lib/wiki/snapshot';
import { createSessionLifecycle } from '../native/src/lib/session-lifecycle.ts';

function evaluate<T>(path: string, deps: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const exports = {};
  const js = ts.transpile(readFileSync(path, 'utf8'), {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  });
  vm.runInNewContext(js, {
    exports, Buffer, Response, AbortController, setTimeout, clearTimeout, ...globals,
    require(id: string) { assert.ok(id in deps, id); return deps[id]; },
  }, { filename: path });
  return exports as T;
}

const marker = 'R2-fixture-only-marker';
const section = { heading: 'Fixture section', paragraphs: [marker] };
const fixture: WikiSnapshot = {
  format: 1,
  articles: [{
    id: 'wk-test-fixture', slug: 'test-fixture', category: 'basic-terms',
    title: 'Fixture article', english: 'Fixture article', aliases: ['fixtureword'],
    autoLink: ['fixtureword'], summary: marker,
    reading: { card: 'Unit test fixture', example: 'This sentence exists only in a fixture.', keyPoints: ['Fixture only.'] },
    encounter: section, explain: section, notEstablished: section,
    related: [], prerequisites: [], confusable: [],
    claims: [{ id: 'fixture', text: marker, editorial: true, sources: [] }],
    status: 'published', publicRelease: false,
    revisions: [{ version: 1, date: '2026-01-01', author: 'Fixture', reason: 'Local test', review: { by: 'Fixture', at: '2026-01-01', kind: 'self' } }],
  }],
  assets: [], sources: [], tombstones: [], backlog: [],
  firstTerms: ['wk-test-fixture'], photoGear: [], photoData: {},
};
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const fixtureBytes = Buffer.from(JSON.stringify(fixture));
const digest = hash(fixtureBytes);
const env: { SINKER_WIKI_SHA256?: string } = { SINKER_WIKI_SHA256: digest };
const manifest = evaluate<{ wikiReleaseDigest: (value?: string) => string | null }>('lib/wiki/release-manifest.ts', { 'server-only': {} });
const defaultDigest = manifest.wikiReleaseDigest();
assert.match(defaultDigest ?? '', /^[a-f0-9]{64}$/);
assert.equal(manifest.wikiReleaseDigest(digest), digest);
for (const invalid of ['off', '', 'Q'.repeat(64), 'f'.repeat(63)]) assert.equal(manifest.wikiReleaseDigest(invalid), null);
const files = new Map<string, Buffer>([[`v1/${digest}.json`, fixtureBytes]]);
let privateReads = 0;
const privateStore = evaluate<{
  parseWikiSnapshot: (bytes: Buffer, digest: string) => WikiSnapshot | null;
  readWikiSnapshot: () => Promise<WikiSnapshot | null>;
}>('lib/wiki/private-store.ts', {
  'server-only': {},
  'node:crypto': { createHash },
  './validate': { validateWikiContent },
  './release-manifest': manifest,
  '@/lib/storage': { storageBucket(bucket: string) {
    assert.equal(bucket, 'sinker-wiki-private');
    return { async download(path: string) {
      privateReads++;
      const value = files.get(path);
      return value ? { data: new Blob([new Uint8Array(value)]) } : { error: true, data: null };
    } };
  } },
}, { process: { env } });

assert.equal(privateStore.parseWikiSnapshot(fixtureBytes, digest)?.articles[0]?.id, 'wk-test-fixture');
assert.equal(privateStore.parseWikiSnapshot(fixtureBytes, '0'.repeat(64)), null);
const injected = Buffer.from(JSON.stringify({
  ...fixture, draftAudit: 'private-root-marker',
  articles: fixture.articles.map((article) => ({ ...article, editorMemo: 'private-article-marker' })),
  sources: fixture.sources.map((source) => ({ ...source, editorMemo: 'private-source-marker' })),
}));
const projected = privateStore.parseWikiSnapshot(injected, hash(injected));
assert.ok(projected);
assert.doesNotMatch(JSON.stringify(projected), /private-(root|article|source)-marker/);
for (const invalid of ['{', 'null', JSON.stringify({ ...fixture, articles: [] }), JSON.stringify({ ...fixture, firstTerms: ['unknown'] })]) {
  const bytes = Buffer.from(invalid);
  assert.equal(privateStore.parseWikiSnapshot(bytes, hash(bytes)), null);
}
if (process.env.SINKER_WIKI_LOCAL_FIXTURE) {
  const bytes = readFileSync(process.env.SINKER_WIKI_LOCAL_FIXTURE);
  const reviewed = privateStore.parseWikiSnapshot(bytes, hash(bytes));
  assert.equal(reviewed?.articles.length, 16);
  assert.equal(reviewed?.sources.length, 17);
  assert.equal(reviewed?.assets.length, 3);
  assert.equal(hash(bytes), defaultDigest);
  assert.deepEqual(Array.from(reviewed.backlog), []);
  assert.deepEqual(Array.from(reviewed.tombstones), []);
  assert.ok(reviewed.articles.every((a) => a.revisions.length === 1 && !a.revisions[0].review?.note && !a.revisions[0].reason));
  assert.ok(reviewed.sources.every((source) => source.checks.every((check) => !check.note)));
  files.set(`v1/${defaultDigest}.json`, bytes);
  delete env.SINKER_WIKI_SHA256;
  assert.equal((await privateStore.readWikiSnapshot())?.articles.length, 16);
  files.delete(`v1/${defaultDigest}.json`);
  env.SINKER_WIKI_SHA256 = digest;
  console.log('Reviewed private snapshot: 16 articles, 17 sources and 3 photos validated');
}

type User = { id: string; role: string; pilot?: boolean };
const viewers: Record<string, User> = {
  ordinary: { id: 'ordinary', role: 'USER' },
  staff: { id: 'staff', role: 'MANAGER' },
  pilot: { id: 'pilot', role: 'USER', pilot: true },
  admin: { id: 'admin', role: 'ADMIN' },
};
const cookie = new AsyncLocalStorage<string>();
const { GET } = evaluate<{GET: () => Promise<Response>}>('app/api/board/wiki/route.ts', {
  '@/lib/dal': { loadSessionUserUnchecked: () => viewers[cookie.getStore() ?? ''] ?? null },
  '@/lib/wiki/private-store': privateStore,
});
const server = createServer((req, res) => {
  void cookie.run(req.headers.cookie ?? '', async () => {
    const response = await GET();
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(await response.text());
  });
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const visit = async (viewer: string, code: number) => {
    const before = privateReads;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/board/wiki`, {
      headers: { Cookie: viewer, 'If-None-Match': 'previous', 'If-Modified-Since': 'Sun, 22 Nov 2026 00:00:00 GMT' },
    });
    assert.equal(response.status, code);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('vary'), 'Cookie');
    const body = await response.text();
    assert.equal(body.includes(marker), code === 200);
    if (code === 200) assert.equal(JSON.parse(body).viewerId, viewer);
    if (code === 401 || code === 403) assert.equal(privateReads, before);
  };
  await visit('', 401);
  await visit('pilot', 200);
  await visit('ordinary', 200);
  await visit('admin', 200);
  await visit('staff', 200);
  await visit('expired', 401);
  await visit('ordinary', 200);
  viewers.pilot.pilot = false;
  await visit('pilot', 200);
  files.delete(`v1/${digest}.json`);
  await visit('admin', 503);
  files.set(`v1/${digest}.json`, Buffer.from('corrupt'));
  await visit('admin', 503);
  const priorReads = privateReads;
  for (const invalid of ['off', '', 'wrong']) {
    env.SINKER_WIKI_SHA256 = invalid;
    await visit('ordinary', 503);
  }
  assert.equal(privateReads, priorReads);
  if (defaultDigest) files.set(`v1/${defaultDigest}.json`, fixtureBytes);
  delete env.SINKER_WIKI_SHA256;
  await visit('ordinary', 503); // The default object's digest does not match these fixture bytes.
  assert.equal(privateReads, priorReads + 1);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
console.log('HTTP: member/guest, no-store, override, disable and integrity checks passed');

type Read = { status: 'ready' | 'denied' | 'unavailable'; snapshot?: WikiSnapshot } | null;

function nativeHarness(options: {
  me?: () => Promise<{ ok: true; userId: string; isAdmin: boolean } | { ok: false }>; fetch?: (options: RequestInit) => Promise<Response>;
} = {}) {
  const lifecycle = createSessionLifecycle(async () => {});
  let state: Read = null;
  let focused = true;
  let pendingCallback: (() => (() => void) | undefined) | undefined;
  let cleanup: (() => void) | undefined;
  let lastDependencies: readonly unknown[] = [];
  let requests = 0;
  let appStatus = 'active';
  let appChange: ((status: string) => void) | undefined;
  let attempt = 0;
  const { useNativeWikiRead: readFromHarness } = evaluate<{useNativeWikiRead: (retry: number) => Read}>('native/src/wiki/use-wiki-read.ts', {
    'expo-router': {
      useIsFocused: () => focused,
      useFocusEffect: (run: () => (() => void) | undefined) => { pendingCallback = run; },
    },
    react: {
      useState: () => [state, (next: Read) => { state = next; }],
      useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
      useCallback: (run: () => (() => void) | undefined, deps: readonly unknown[]) => {
        if (deps.some((val, i) => val !== lastDependencies[i]) || deps.length !== lastDependencies.length) {
          cleanup?.();
          lastDependencies = deps;
          return run;
        }
        return undefined;
      },
    },
    'react-native': { AppState: {
      get currentState() { return appStatus; },
      addEventListener: (_event: string, run: (status: string) => void) => {
        appChange = run;
        return { remove() { appChange = undefined; } };
      },
    } },
    '@/lib/wiki/snapshot': { WIKI_READ_PATH: '/api/board/wiki' },
    '~/lib/rpc': {
      sessionChanging: lifecycle.pending, sessionEpoch: lifecycle.epoch,
      sessionRevision: lifecycle.revision, subscribeToSession: lifecycle.subscribe,
      rpc: options.me ?? (async () => ({ ok: true, userId: 'admin', isAdmin: true })),
    },
    '~/lib/site': { SITE_URL: 'https://example.invalid' },
  }, {
    fetch: async (url: string, opts: RequestInit) => {
      requests++;
      assert.equal(url, 'https://example.invalid/api/board/wiki');
      assert.equal(opts.cache, 'no-store');
      assert.equal(opts.credentials, 'include');
      return options.fetch?.(opts) ?? Response.json({ viewerId: 'admin', snapshot: fixture });
    },
  });
  return {
    render() {
      const read = readFromHarness(attempt);
      if (pendingCallback) cleanup = pendingCallback();
      return read?.status ?? null;
    },
    setAppState: (value: string) => { appStatus = value; appChange?.(value); },
    blur: () => { focused = false; cleanup?.(); },
    close: () => cleanup?.(),
    requests: () => requests,
    retry: () => { attempt++; },
    lifecycle,
  };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
{
  const h = nativeHarness({ me: async () => ({ ok: false }) });
  assert.equal(h.render(), null);
  await tick();
  assert.equal(h.render(), 'denied');
  assert.equal(h.requests(), 0);
  h.close();
}
{
  const h = nativeHarness({
    me: async () => ({ ok: true, userId: 'ordinary', isAdmin: false }),
    fetch: async () => Response.json({ viewerId: 'ordinary', snapshot: fixture }),
  });
  assert.equal(h.render(), null);
  await tick();
  assert.equal(h.render(), 'ready');
  h.close();
}
{
  let open!: (value: { ok: true; userId: string; isAdmin: boolean }) => void;
  const lookup = new Promise<{ ok: true; userId: string; isAdmin: boolean }>((resolve) => { open = resolve; });
  const h = nativeHarness({ me: () => lookup });
  assert.equal(h.render(), null);
  assert.equal(h.requests(), 0);
  open({ ok: true, userId: 'admin', isAdmin: true });
  assert.equal(h.render(), null);
  await tick();
  assert.equal(h.render(), 'ready');
  assert.equal(h.requests(), 1);
  h.setAppState('background');
  assert.equal(h.render(), null);
  h.setAppState('active');
  assert.equal(h.render(), null);
  await tick();
  assert.equal(h.render(), 'ready');
  h.blur();
  assert.equal(h.render(), null);
  h.close();
}
{
  let owner = true;
  let finish!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => { finish = resolve; });
  const h = nativeHarness({ me: async () => ({ ok: true, userId: owner ? 'admin' : 'pilot', isAdmin: owner }), fetch: () => response });
  assert.equal(h.render(), null);
  await tick();
  assert.equal(h.requests(), 1);
  await h.lifecycle.change(async () => { owner = false; });
  finish(Response.json({ viewerId: 'admin', snapshot: fixture }));
  assert.equal(h.render(), null);
  await tick();
  assert.equal(h.render(), 'denied');
  h.close();
}
for (const reply of [
  () => Response.json({ viewerId: 'different-admin', snapshot: fixture }),
  () => Response.json({ error: 'admin-required' }, { status: 403 }),
]) {
  const h = nativeHarness({ fetch: async () => reply() });
  assert.equal(h.render(), null);
  await tick();
  assert.equal(h.render(), 'denied');
  h.close();
}
{
  let online = false;
  const h = nativeHarness({ fetch: async () => {
    if (!online) throw Error('offline');
    return Response.json({ viewerId: 'admin', snapshot: fixture });
  } });
  assert.equal(h.render(), null);
  await tick();
  assert.equal(h.render(), 'unavailable');
  online = true;
  h.retry();
  assert.equal(h.render(), null);
  await tick();
  assert.equal(h.render(), 'ready');
  h.close();
}
type Element = { type: string | ((props: { slug: string }) => null); props: { slug: string; children?: Element | Element[] } };
const jsx = (type: Element['type'], props: Element['props']) => ({ type, props });
let routeRead: Read = null;
let openedSlug = '';
const route = evaluate<{default: () => Element}>('native/src/app/training/wiki/index.tsx', {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'expo-router': { useLocalSearchParams: () => ({ slug: 'test-fixture' }), router: {} },
  'react-native': { View: 'View', Text: 'Text' },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
  react: { useCallback: (run: unknown) => run, useState: () => [0], useEffect: (run: () => void) => { if (routeRead?.status !== 'denied') run(); } },
  '@/lib/wiki/categories': { WIKI_NAME: 'Wiki' },
  '@/lib/wiki/context': { WikiDataProvider: 'data', useWiki: () => ({ wikiBySlug: (slug: string) => {
    assert.equal(slug, 'test-fixture');
    return { kind: 'article', article: fixture.articles[0] };
  } }) },
  '~/community/parts': { Bar: 'Bar' }, '~/shell/press': { Press: 'Press' },
  '~/lib/ui': { TYPE: {}, usePalette: () => ({}) },
  '~/shell/release': { noticeLocked: () => {} },
  '~/wiki/home': { WikiHome: 'home' },
  '~/wiki/reader': { WikiReaderProvider: 'reader', useWikiReader: () => ({
    openFull: (id: string) => { openedSlug = id; },
  }) },
  '~/wiki/use-wiki-read': { useNativeWikiRead: () => routeRead },
});
for (const read of [null, { status: 'denied' } as const, { status: 'unavailable' } as const]) {
  routeRead = read;
  assert.notEqual((route.default().props.children as Element[])[1].type, 'data');
}
routeRead = { status: 'ready', snapshot: fixture };
const data = (route.default().props.children as Element[])[1];
assert.equal(data.type, 'data');
const reader = data.props.children as Element;
assert.equal(reader.type, 'reader');
const slug = (reader.props.children as Element[])[0];
assert.equal(typeof slug.type, 'function');
if (typeof slug.type === 'function') slug.type(slug.props);
assert.equal(openedSlug, 'wk-test-fixture');
console.log('Native: entry policy, cold slug, inactive screen, late old-account response and offline retry passed');

// Direct pages require the real route's session guard before building the client reader.
const blocked = new Error('authentication required');
for (const [file, props] of [
  ['app/(app)/training/wiki/page.tsx', { searchParams: Promise.resolve({}) }],
  ['app/(app)/training/wiki/[slug]/page.tsx', { params: Promise.resolve({ slug: 'test-fixture' }) }],
] as const) {
  let admin = false;
  const page = evaluate<{ default: (props: object) => Promise<Element> }>(file, {
    '@/lib/dal': { requireUser: async () => { if (!admin) throw blocked; return { id: 'admin' }; } },
    '@/components/wiki/wiki-page': { WikiPage: 'private-reader' },
    '@/lib/wiki': { WIKI_CATEGORIES: [] },
    'react/jsx-runtime': { jsx },
  });
  await assert.rejects(page.default(props), blocked);
  admin = true;
  assert.equal((await page.default(props)).type, 'private-reader');
}
console.log('Web: home and article enforce the session guard before rendering the reader');

for (const stage of ['restricted_beta', 'released'] satisfies ReleaseStage[]) {
  for (const user of Object.values(viewers)) {
    for (const path of ['/training/wiki', '/training/wiki/test-fixture', '/board/wiki/test-fixture']) {
      assert.equal(decidePath(user, path, { stage }).allowed, true);
    }
  }
}
assert.equal(decidePath(viewers.ordinary, '/board', { stage: 'restricted_beta' }).allowed, false);
assert.equal(decidePath(viewers.pilot, '/admin/wiki', { stage: 'released' }).allowed, false);
console.log('Menu routing: member access in both release stages, unchanged ordinary Board/Admin policy');
