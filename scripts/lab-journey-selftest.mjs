import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
const files = new Map();
const q = (globalThis.__labJourneyTest = {
  files,
  user: { id: 'owner', role: 'USER' },
  allowed: true,
  failRead: false,
  writes: 0,
  lostUpload: false,
});
const missing = { statusCode: '404', message: 'missing' };
q.bucket = {
  async list(prefix, { limit, offset = 0 }) {
    const rows = new Map();
    for (const key of files.keys()) {
      if (!key.startsWith(prefix + '/')) continue;
      const tail = key.slice(prefix.length + 1),
        name = tail.split('/')[0];
      rows.set(name, { name, id: tail.includes('/') ? null : 'file' });
    }
    return {
      data: [...rows.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(offset, offset + limit),
      error: null,
    };
  },
  async download(key) {
    if (q.failRead) return { data: null, error: { statusCode: '503' } };
    return files.has(key)
      ? { data: new Blob([files.get(key)]), error: null }
      : { data: null, error: missing };
  },
  async upload(key, value, opts) {
    if (files.has(key) && !opts.upsert) return { error: { statusCode: '409' } };
    files.set(key, await value.text());
    q.writes++;
    if (q.lostUpload) {
      q.lostUpload = false;
      return { error: { statusCode: '503' } };
    }
    return { error: null };
  },
  async remove(paths) {
    paths.forEach((p) => files.delete(p));
    return { error: null };
  },
};
const mocks = new Map([
  ['server-only', 'export {};'],
  [
    '@/lib/storage',
    `export const videoBucket=()=>globalThis.__labJourneyTest.bucket,createPlaybackUrls=async()=>({});`,
  ],
  [
    '@/lib/prisma',
    `export const prisma=new Proxy({}, {get(){throw Error('Unexpected DB access')}});`,
  ],
  ['next/cache', `export const revalidatePath=()=>{};`],
  [
    '@/lib/dal',
    `export const getCurrentUser=async()=>globalThis.__labJourneyTest.user, requireUser=async()=>{const u=globalThis.__labJourneyTest.user;if(!u)throw Error('Unauthorized');return u};`,
  ],
  [
    '@/lib/release-gate',
    `export const allowFeature=()=>{if(!globalThis.__labJourneyTest.allowed)throw Error('Feature locked')},isRestrictedNow=()=>false;`,
  ],
  [
    '@/lib/my-videos-load',
    `export const loadMyVideos=async id=>[{path:id+'/local-video',sport:'pitch'}];`,
  ],
  ['@/lib/pitch-lab-compare', `export const loadPreviousComparison=async()=>null;`],
  ['@/lib/library-cache', `export const trainingGuides=async()=>[];`],
]);
const hooks = registerHooks({
  resolve(name, context, next) {
    if (mocks.has(name))
      return {
        url: 'data:text/javascript,' + encodeURIComponent(mocks.get(name)),
        shortCircuit: true,
      };
    if (name.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const ts = new URL(name + '.ts', context.parentURL);
      if (existsSync(ts)) return { url: ts.href, shortCircuit: true };
    }
    return next(name, context);
  },
});
const beforeFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw Error('Network forbidden in this test');
};
let passed = 0;
const check = (name, value) => {
  assert.ok(value, name);
  passed++;
};
const id = '11111111-1111-4111-8111-111111111111';
const event = {
  id: '22222222-2222-4222-8222-222222222222',
  date: '2026-11-04',
  goal: '릴리스',
  note: '가볍게',
  savedAt: '2026-11-04T01:00:00Z',
};
try {
  const lib = await import('../lib/pitch-lab.ts');
  await lib.saveLabPracticeOnce('owner', id, event);
  await lib.saveLabPracticeOnce('owner', id, {
    ...event,
    savedAt: '2026-11-04T02:00:00Z',
  });
  check('retry is idempotent including a later server clock', q.writes === 1);
  await assert.rejects(() =>
    lib.saveLabPracticeOnce('owner', id, { ...event, goal: 'changed' })
  );
  check(
    'reads only owner practice files',
    (await lib.loadLabPractices('other', id)).length === 0
  );
  check(
    'practice intact',
    (await lib.loadLabPractices('owner', id))[0].goal === event.goal
  );
  q.lostUpload = true;
  await lib.saveLabPracticeOnce('owner', id, {
    ...event,
    id: '33333333-3333-4333-8333-333333333333',
  });
  check(
    'lost write response is verified',
    (await lib.loadLabPractices('owner', id)).length === 2
  );
  q.failRead = true;
  await assert.rejects(() => lib.loadLabPractices('owner', id));
  passed++;
  q.failRead = false;
  files.set(
    `owner/pitch-lab/${id}/meta.json`,
    JSON.stringify({ createdAt: event.savedAt, kind: 'sample' })
  );
  // Incomplete upload: folder exists, metadata does not. It must not hide the other reports.
  files.set('owner/pitch-lab/44444444-4444-4444-8444-444444444444/side.mp4', 'video');
  check(
    'incomplete uploads skipped without hiding complete report',
    (await lib.listOwnLabMeta('owner')).length === 1
  );
  for (let i = 0; i < 105; i++)
    files.set(
      `owner/pitch-lab/55555555-5555-4555-8555-${String(i).padStart(12, '0')}/meta.json`,
      JSON.stringify({ createdAt: event.savedAt, kind: 'sample' })
    );
  check(
    'metadata listing paginates beyond 100 folders',
    (await lib.listOwnLabMeta('owner')).length === 106
  );
  q.failRead = true;
  await assert.rejects(() => lib.listOwnLabMeta('owner'));
  passed++;
  q.failRead = false;
  await lib.deleteLabSample('owner', id);
  check(
    'deleting report also deletes linked practice files',
    ![...files.keys()].some((k) => k.startsWith(`owner/pitch-lab/${id}/`))
  );
  const actions = await import('../app/actions/pitch-lab.ts');
  files.set(
    `owner/pitch-lab/${id}/meta.json`,
    JSON.stringify({
      createdAt: event.savedAt,
      sourcePaths: { side: 'owner/local-video' },
    })
  );
  check(
    'own gallery path resolves own report',
    (await actions.loadMyVideoReports('owner/local-video')).length === 1
  );
  check(
    'foreign gallery path never resolves',
    (await actions.loadMyVideoReports('other/local-video')).length === 0
  );
  q.user = { id: 'other', role: 'ADMIN' };
  await assert.rejects(() => actions.loadLabJourney(id));
  passed++;
  check(
    'even admin cannot write practice to another owner',
    'error' in (await actions.recordLabPractice(id, event))
  );
  q.user = { id: 'owner', role: 'USER' };
  check(
    'owner can save practice',
    'ok' in (await actions.recordLabPractice(id, event))
  );
  check(
    'future practice rejected',
    'error' in (await actions.recordLabPractice(id, { ...event, date: '2099-01-01' }))
  );
  check(
    'journey returns saved practice',
    (await actions.loadLabJourney(id)).practices.length === 1
  );
  const retake = '66666666-6666-4666-8666-666666666666';
  files.set(
    `owner/pitch-lab/${retake}/meta.json`,
    JSON.stringify({ createdAt: '2099-01-01T00:00:00Z', previousReportId: id })
  );
  check(
    'explicit retake points back to its practice baseline',
    (await actions.loadLabJourney(retake)).previous?.id === id
  );
  check(
    'baseline includes saved practice before retake',
    (await actions.loadLabJourney(retake)).previous?.practices.length === 1
  );
  files.set(
    `owner/pitch-lab/${retake}/meta.json`,
    JSON.stringify({ createdAt: '2000-01-01T00:00:00Z', previousReportId: id })
  );
  check(
    'practice saved after retake excluded from baseline',
    (await actions.loadLabJourney(retake)).previous?.practices.length === 0
  );
  check(
    'baseline lists explicit retakes only',
    (await actions.loadLabJourney(id)).retakes[0]?.id === retake
  );
  q.allowed = false;
  await assert.rejects(() => actions.loadMyVideoReports('owner/local-video'));
  passed++;
  await assert.rejects(() => actions.recordLabPractice(id, event));
  passed++;
  q.allowed = true;
  q.user = null;
  await assert.rejects(() => actions.loadLabJourney(id));
  passed++;
  console.log(
    `lab journey storage: ${passed} checks passed (mock storage, network forbidden)`
  );
} finally {
  globalThis.fetch = beforeFetch;
  hooks.deregister();
  delete globalThis.__labJourneyTest;
}
