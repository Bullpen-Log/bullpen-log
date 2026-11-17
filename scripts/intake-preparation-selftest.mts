import assert from 'node:assert/strict';
import {
  preparationOf,
  preparationForState,
  parsePreparationBook,
  safePreparation,
  readPreparation,
  writePreparation,
  clearPreparation,
  preparationKey,
  PREPARATION_TTL,
  type Preparation,
} from '../components/intake/preparation-state.ts';
let passed = 0;
const eq = (a: unknown, b: unknown) => {
  assert.deepEqual(a, b);
  passed++;
};
const p: Preparation = {
  view: 'side',
  stage: 'share',
  route: 'apple',
  returnTo: 'side',
};
eq(preparationOf(p), p);
eq(preparationOf({ ...p, stage: 'method' }), p);
eq(preparationOf({ ...p, stage: 'method', route: 'other' }), {
  ...p,
  stage: 'select',
  route: 'other',
});
eq(preparationOf({ ...p, stage: 'method', route: 'gallery' }), p);
for (const stage of ['share', 'select', 'confirm'] as const)
  eq(preparationOf({ ...p, route: 'gallery', stage }), { ...p, route: 'apple', stage });
eq(
  safePreparation(preparationOf({ ...p, route: 'gallery', stage: 'confirm' })!, false)
    .stage,
  'select'
);
for (const stage of ['export', 'save']) eq(preparationOf({ ...p, stage }), p);
for (const patch of [
  { view: 'bad' },
  { stage: 'sent' },
  { route: 'bad' },
  { returnTo: 'send' },
])
  eq(preparationOf({ ...p, ...patch }), null);
eq(preparationOf(null), null);
eq(preparationOf({ ...p, token: 'must-not-survive', name: 'private' }), p);
eq(safePreparation({ ...p, stage: 'confirm' }, false).stage, 'select');
eq(safePreparation({ ...p, stage: 'confirm' }, true).stage, 'confirm');
const state = {
  screen: 'side',
  needsReconsent: false,
  draft: { athleteName: 'fixture' },
  correction: null,
};
eq(preparationForState(p, state, { side: false, rear: false }), p);
for (const screen of [
  'receipt',
  'send',
  'upload',
  'published',
  'withdrawn',
  'under_14',
  'upload_expired',
  'revoked',
])
  eq(preparationForState(p, { ...state, screen }, { side: true, rear: true }), null);
eq(
  preparationForState(
    p,
    { ...state, needsReconsent: true },
    { side: true, rear: true }
  ),
  null
);
eq(
  preparationForState(
    p,
    { ...state, draft: { athleteName: null } },
    { side: true, rear: true }
  ),
  null
);
eq(
  preparationForState(
    { ...p, view: 'rear', stage: 'confirm', returnTo: 'rear' },
    state,
    { side: false, rear: false }
  ),
  { ...p, stage: 'select' }
);
eq(
  preparationForState({ ...p, stage: 'confirm', returnTo: 'review' }, state, {
    side: false,
    rear: false,
  }),
  { ...p, stage: 'select' }
);
const correction = { ...state, screen: 'correction', correction: { views: ['rear'] } };
eq(
  preparationForState({ ...p, returnTo: 'correction' }, correction, {
    side: false,
    rear: false,
  }),
  null
);
eq(
  preparationForState({ ...p, view: 'rear', returnTo: 'correction' }, correction, {
    side: false,
    rear: false,
  })?.view,
  'rear'
);
eq(
  preparationForState(
    p,
    { ...state, screen: 'upload_recovery' },
    { side: false, rear: false }
  ),
  null
);
eq(
  preparationForState(
    { ...p, returnTo: 'recovery' },
    { ...state, screen: 'upload_recovery' },
    { side: false, rear: false }
  )?.returnTo,
  'recovery'
);
const now = Date.now();
const book = { version: 1, updatedAt: now, active: p, positions: { side: p } };
eq(parsePreparationBook(JSON.stringify(book), now)?.active, p);
const legacyBook = {
  ...book,
  active: { ...p, stage: 'method', route: 'gallery' },
  positions: {
    side: { ...p, stage: 'method', route: 'gallery' },
    rear: { ...p, view: 'rear', returnTo: 'rear', stage: 'confirm', route: 'gallery' },
  },
};
eq(parsePreparationBook(JSON.stringify(legacyBook), now)?.active, p);
eq(parsePreparationBook(JSON.stringify(legacyBook), now)?.positions.side, p);
eq(parsePreparationBook(JSON.stringify(legacyBook), now)?.positions.rear, {
  ...p,
  view: 'rear',
  returnTo: 'rear',
  stage: 'confirm',
});

for (const raw of [
  null,
  '{}',
  'not-json',
  JSON.stringify({ ...book, version: 0 }),
  JSON.stringify({ ...book, updatedAt: now - PREPARATION_TTL - 1 }),
  JSON.stringify({ ...book, updatedAt: now + 61_000 }),
])
  eq(parsePreparationBook(raw, now), null);
const values = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  },
});
writePreparation('submission-one', p);
writePreparation('submission-one', {
  ...p,
  view: 'rear',
  returnTo: 'rear',
  stage: 'select',
});
eq(readPreparation('submission-one')?.positions.side, p);
eq(readPreparation('submission-two'), null);
eq(values.has(preparationKey('submission-one')), true);
clearPreparation('submission-one');
eq(readPreparation('submission-one'), null);
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  get: () => {
    throw new Error('storage blocked');
  },
});
writePreparation('denied', p);
clearPreparation('denied');
eq(readPreparation('denied'), null);
console.log(`intake preparation: ${passed} passed`);
