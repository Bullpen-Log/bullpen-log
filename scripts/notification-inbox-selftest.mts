import assert from 'node:assert/strict';
import { createInboxCache } from '../native/src/notifications/cache.ts';
import { inboxDay, inboxSections, inboxTime, inboxIcon, inboxKind, safeInboxPath } from '../native/src/notifications/model.ts';
import { inboxPageRequest, inboxRead, type InboxItem, type InboxPage, type InboxRead, type InboxResult, type InboxVerification } from '@/lib/notification-inbox';
let passed = 0;
const check = (v: unknown, label: string) => { assert.ok(v, label);passed++; };
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const before = '2026-11-02T12:00:00.000Z';
const item = (i: number): InboxItem => ({ id: id(i), kind: 'team', title: '팀 훈련', body: '구장 안내', link: null, at: '2026-11-01T10:00:00.000Z', read: false });
const page: InboxPage = { items: Array.from({ length: 20 }, (_, i) => item(i)), unread: 24, before, next: { at: item(19).at, id: id(19) } };
const command: InboxRead = { scope: 'all', before };
const defer = <T,>() => { let resolve!: (v: T) => void;const promise = new Promise<T>(r => { resolve = r; });return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));
function setup() {
  let epoch = 0, owner = 'a', writes = 0, queries = 0, completedCount = 0, storeFail = false, clearFail = false, unreadable = false;
  const memory = new Map<string, unknown>();
  let fetchPage: (req: unknown) => Promise<({ ok: true } & InboxPage) | { ok: false; error: string }> = async req => req ? { ok: true, items: [item(20), item(21), item(22), item(23)], unread: 24, before, next: null } : { ok: true, ...page };
  let write: (c: InboxRead) => Promise<InboxResult> = async () => ({ ok: true, unread: 0 });
  let verify: () => Promise<InboxVerification> = async () => ({ ok: true, state: 'applied', unread: 0 });
  let count: () => Promise<number> = async () => 24;
  const cache = createInboxCache({ epoch: () => epoch, owner: async () => owner, read: async k => unreadable ? { ok: false } : { ok: true, value: memory.get(k) }, store: async (k, v) => { if (storeFail || (v == null && clearFail)) return false;memory.set(k, v);return true; }, page: req => fetchPage(req), count: () => count(), write: async c => { writes++;assert.deepEqual(memory.get(`sinker:notification-read:${owner}`), c, 'journal precedes RPC');return write(c); }, verify: async () => { queries++;return verify(); }, rejected: () => false });
  const unsubscribe = cache.subscribe(() => { completedCount++; });
  return { cache, memory, stats: () => ({ writes, queries, completedCount }), switch: (to: string) => { owner = to;epoch++;cache.reset(); }, page: (f: typeof fetchPage) => { fetchPage = f; }, write: (f: typeof write) => { write = f; }, verify: (f: typeof verify) => { verify = f; }, count: (f: typeof count) => { count = f; }, failStore: () => { storeFail = true; }, failClear: () => { clearFail = true; }, unreadable: () => { unreadable = true; }, unsubscribe };
}
{
  check(inboxRead({ scope: 'one', id: id(1) })?.scope === 'one', 'single valid');
  check(!inboxRead({ scope: 'all', before: 'NaN' }), 'invalid cutoff');
  check(!inboxRead({ scope: 'one', id: '../../user' }), 'invalid id');
  check(!inboxPageRequest({ before, cursor: { at: before, id: id(1) } }), 'cursor cannot include cutoff boundary');
  check(inboxPageRequest(null)?.cursor === null, 'initial page request');
  check(safeInboxPath('/community/1?tab=replies', 'https://bullpen-log.vercel.app') === '/community/1?tab=replies', 'internal link');
  check(safeInboxPath('https://bullpen-log.vercel.app/coach', 'https://bullpen-log.vercel.app') === '/coach', 'same origin absolute');
  for (const link of ['//evil.test', '/\\evil.test', 'https://evil.test/x', 'javascript:alert(1)', '/x\n']) check(!safeInboxPath(link, 'https://bullpen-log.vercel.app'), `unsafe link ${JSON.stringify(link)}`);
  const now = new Date('2026-11-02T12:00:00Z').getTime();
  check(inboxSections([item(1), item(2)], now)[0].data.length === 2, 'date grouping');
  check(inboxDay('bad', now) === '날짜 확인 필요', 'malformed date safe');
  check(inboxTime('2026-11-02T11:59:50Z', now) === '방금', 'relative time');
}
{
  const t = setup();await t.cache.load();check(t.cache.snapshot().items?.length === 20 && t.cache.snapshot().unread === 24, 'global count independent of first page');check(t.stats().writes === 0, 'load never writes read status');await t.cache.more();check(t.cache.snapshot().items?.length === 24 && !t.cache.snapshot().next, '20 plus 4 pagination');
  await t.cache.mark(command);check(t.cache.snapshot().unread === 0 && t.cache.snapshot().items?.every(n => n.read), 'confirmed read updates shared list/count');check(t.memory.get('sinker:notification-read:a') === null, 'successful journal cleared');
}
{
  const t = setup();await t.cache.load();t.failStore();await t.cache.mark(command);check(t.stats().writes === 0 && t.cache.snapshot().items?.every(n => !n.read), 'failed durable storage prevents write');
}
{
  const t = setup();await t.cache.load();t.write(async () => ({ ok: false, error: '거절' }));await t.cache.mark(command);check(!t.cache.snapshot().pending && t.cache.snapshot().retry?.scope === 'all' && t.cache.snapshot().unread === 24, 'known rejection retains previous state');
}
{
  const t = setup();await t.cache.load();t.write(async () => { throw Error('ack lost'); });await t.cache.mark(command);check(!!t.cache.snapshot().pending && t.cache.snapshot().unread === 24, 'lost acknowledgment retains pending/old state');await t.cache.mark(command);check(t.stats().writes === 1, 'pending blocks blind resend');await t.cache.verify();check(t.stats().writes === 1 && t.stats().queries === 1 && t.cache.snapshot().unread === 0, 'verification reads only');
}
{
  const t = setup();await t.cache.load();t.write(async () => { throw Error(); });await t.cache.mark(command);t.verify(async () => ({ ok: true, state: 'not-applied', unread: 24 }));await t.cache.verify();check(!t.cache.snapshot().pending && !!t.cache.snapshot().retry, 'not-applied offers explicit retry');t.write(async c => { assert.deepEqual(c, command);return { ok: true, unread: 1 }; });await t.cache.retry();check(t.stats().writes === 2 && t.cache.snapshot().newer && t.cache.snapshot().unread === 1, 'same boundary retry preserves newly arrived unread');
}
{
  const t = setup();await t.cache.load();t.write(async () => { throw Error(); });await t.cache.mark(command);t.verify(async () => { throw Error(); });await t.cache.verify();check(!!t.cache.snapshot().pending && t.stats().writes === 1, 'failed verification keeps recoverable pending');t.cache.reset();await t.cache.load();check(t.cache.snapshot().pending?.scope === 'all', 're-entry restores per-account command');t.switch('b');await t.cache.load();check(!t.cache.snapshot().pending, 'other account cannot see journal');t.switch('a');await t.cache.load();check(!!t.cache.snapshot().pending, 'returning account restores own journal');
}
{
  const t = setup();await t.cache.load();t.failClear();await t.cache.mark(command);check(!!t.cache.snapshot().pending && t.stats().writes === 1, 'cleanup failure keeps pending, no duplicate');
}
{
  const t = setup();t.unreadable();await t.cache.load();await t.cache.mark(command);check(t.cache.snapshot().items?.length === 20 && !t.cache.snapshot().ready && t.stats().writes === 0, 'unreadable journal blocks writes but allows reads');
}
{
  const t = setup();t.memory.set('sinker:notification-read:a', { scope: 'all', before: 'broken' });await t.cache.load();await t.cache.mark(command);check(t.stats().writes === 0 && !t.cache.snapshot().ready, 'corrupt journal never overwritten');
}
{
  const t = setup();await t.cache.load();const gate = defer<InboxResult>();t.write(() => gate.promise);const first = t.cache.mark(command);await tick();const second = t.cache.mark(command);gate.resolve({ ok: true, unread: 0 });await Promise.all([first, second]);check(t.stats().writes === 1, 'double click serialized');
}
{
  const t = setup();await t.cache.load();const gate = defer<number>();t.count(() => gate.promise);const counting = t.cache.count();await t.cache.mark(command);gate.resolve(24);await counting;check(t.cache.snapshot().unread === 0, 'late count cannot undo read result');
}
{
  const t = setup();await t.cache.load();const gate = defer<({ ok: true } & InboxPage)>();t.page(() => gate.promise);const refresh = t.cache.load(true);await tick();await t.cache.mark(command);gate.resolve({ ok: true, ...page });await refresh;check(t.cache.snapshot().unread === 0 && t.cache.snapshot().items?.every(n => n.read), 'pre-write page cannot restore unread');
}
{
  const t = setup();await t.cache.load();const gate = defer<InboxResult>();t.write(() => gate.promise);const writing = t.cache.mark(command);await tick();t.switch('b');await t.cache.load();gate.resolve({ ok: true, unread: 0 });await writing;check(t.cache.snapshot().unread === 24, 'old account write response ignored');
}
{
  const t = setup();await t.cache.load();t.page(async () => { throw Error(); });await t.cache.load(true);check(t.cache.snapshot().items?.length === 20 && !!t.cache.snapshot().error, 'refresh failure retains list');await t.cache.more();check(t.cache.snapshot().items?.length === 20 && !!t.cache.snapshot().next && !!t.cache.snapshot().moreError, 'more failure retains list/cursor');
}
{
  const t = setup();t.memory.set('sinker:notification-read:a', command);const old = defer<({ ok: true } & InboxPage)>();let calls = 0;
  t.page(async () => ++calls === 1 ? old.promise : { ok: true, ...page, items: page.items.map(n => ({ ...n, read: true })), unread: 0 });
  const loading = t.cache.load();await tick();await t.cache.verify();await tick();old.resolve({ ok: true, ...page });await loading;await tick();
  check(t.cache.snapshot().items?.every(n => n.read) && t.cache.snapshot().unread === 0, 'verification before initial page triggers fresh read, no empty loop');
}
{
  const t = setup();t.page(async () => ({ ok: true, items: [], unread: 1, before, next: null }));await t.cache.load();
  check(t.cache.snapshot().newer && t.cache.snapshot().unread === 1, 'arrival after empty snapshot offers refresh instead of claiming empty inbox');
}
check(inboxIcon('__proto__') === 'bell' && inboxKind('constructor') === '알림', 'unknown notification kinds always use safe fallback');
console.log(`notification inbox: ${passed} checks passed`);
