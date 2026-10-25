/** 실제 서버 동작을 메모리 DB에서 실행한다. 운영 DB·계정에는 접근하지 않는다. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const test = {
  row: null,
  pitches: new Map(),
  done: new Set(),
  blocked: null,
  writes: 0,
  guide: { id: 'reviewed-guide', category: '스로잉 드릴', title: '텐 토즈 스로우' },
};
globalThis.__mechanicsRecordTest = test;
const operation = (kind, args) => ({ kind, args });
const apply = ({ kind, args }) => {
  test.writes++;
  if (kind === 'delete-pitch') test.pitches.delete(args.where.id);
  if (kind === 'pitch')
    test.pitches.set(args.where.id, {
      ...(test.pitches.get(args.where.id) ?? args.create),
      ...args.update,
    });
  if (kind === 'program') {
    if (args.data.progress) test.row.progress = args.data.progress;
    if (args.data.sessionsDone?.increment)
      test.row.sessionsDone += args.data.sessionsDone.increment;
  }
  if (kind === 'drill') test.done.add(args.create.guideId);
};
test.prisma = {
  userRehabProgram: {
    findFirst: async () => ({
      id: 'rehab-1',
      area: 'shoulder-back',
      condition: null,
      severity: 'mild',
      stage: 4,
      stageStartedAt: new Date('2026-10-01T00:00:00Z'),
      stageShortenDays: 0,
      startedAt: new Date('2026-09-01T00:00:00Z'),
      activities: [],
    }),
  },
  mechanicsProgram: {
    findUnique: async () => test.row,
    update: (args) => operation('program', args),
  },
  pitchLog: {
    aggregate: async () => ({ _sum: { pitchCount: 80 } }),
    upsert: (args) => operation('pitch', args),
    deleteMany: (args) => operation('delete-pitch', args),
  },
  userDrillLog: { upsert: (args) => operation('drill', args) },
  $transaction: async (ops) => ops.map(apply),
};
const mocks = new Map([
  ['/lib/prisma.ts', 'export const prisma = globalThis.__mechanicsRecordTest.prisma;'],
  [
    '/lib/dal.ts',
    "export async function requireUser() { return { id: 'test-user' }; }",
  ],
  ['/lib/clock.ts', "export const appNow = () => new Date('2026-10-25T03:00:00Z');"],
  [
    '/lib/library-cache.ts',
    'export async function visibleGuides() { return [globalThis.__mechanicsRecordTest.guide]; }',
  ],
  [
    '/lib/mechanics/focus-load.ts',
    "export async function loadFocusOffer() { return { error: 'test' }; }",
  ],
  [
    '/lib/mechanics/load.ts',
    `
    export async function loadDrillThrowNote() { return null; }
    export async function loadMechanicsProgram() {
      const t = globalThis.__mechanicsRecordTest;
      return { painFold: t.blocked, session: [{ guideId: t.guide.id }], doneToday: [...t.done] };
    }`,
  ],
  ['/next/cache.js', 'export const revalidatePath = () => {};'],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only')
      return { url: 'data:text/javascript,export {};', shortCircuit: true };
    if (specifier === 'next/cache')
      return {
        url: 'data:text/javascript,export const revalidatePath = () => {};',
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    for (const [suffix, source] of mocks)
      if (url.endsWith(suffix)) return { format: 'module', source, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const {
  freshState,
  programStateJson,
  readProgramState,
  practiceInput,
  mechanicsPainFold,
  playItemsFor,
  levelAdvice,
} = await import('../lib/mechanics/program.ts');
const { recordMechanicsDrill } = await import('../app/actions/mechanics.ts');
const reset = () => {
  test.row = { progress: programStateJson(freshState('beginner')), sessionsDone: 0 };
  test.pitches.clear();
  test.done.clear();
  test.blocked = null;
  test.writes = 0;
};
const input = (practice = {}) => ({
  guideId: test.guide.id,
  element: '스로잉',
  feel: 'ok',
  practice: {
    throws: 7,
    effortPct: 55,
    response: 'clear',
    alreadyLogged: false,
    ...practice,
  },
});
reset();
assert.deepEqual(await recordMechanicsDrill(input()), { ok: true });
assert.equal(test.pitches.size, 1);
assert.match(
  [...test.pitches.keys()][0],
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
);
assert.equal([...test.pitches.values()][0].pitchCount, 7, '실제 횟수를 저장한다');
assert.equal(
  [...test.pitches.values()][0].effortPct,
  55,
  '단계의 고정 강도를 추정하지 않는다'
);
const writes = test.writes;
test.blocked = { reason: '투구 제한' };
assert.deepEqual(
  await recordMechanicsDrill(input()),
  { ok: true },
  '응답 손실 뒤 재시도는 제한 상태에서도 중복 저장하지 않는다'
);
assert.equal(test.writes, writes);
test.blocked = null;
assert.deepEqual(await recordMechanicsDrill(input({ throws: 9 })), { ok: true });
assert.equal(test.pitches.size, 1, '오늘 합계 수정은 새 투구 기록을 만들지 않는다');
assert.equal([...test.pitches.values()][0].pitchCount, 9);
test.pitches.set('manual-row', { pitchCount: 9 });
await recordMechanicsDrill(input({ throws: 9, alreadyLogged: true }));
assert.equal(
  test.pitches.size,
  1,
  '다른 기록에 합쳤다고 수정하면 자동 생성했던 중복분만 제거한다'
);
assert.ok(test.pitches.has('manual-row'), '다른 투구 기록은 건드리지 않는다');

reset();
await recordMechanicsDrill(input({ alreadyLogged: true }));
assert.equal(test.pitches.size, 0, '다른 기록에 포함한 공을 다시 더하지 않는다');
assert.equal(readProgramState(test.row.progress).practice[0].throws, 7);

reset();
test.blocked = { reason: '통증으로 쉬어요' };
assert.ok('error' in (await recordMechanicsDrill(input())));
assert.equal(test.writes, 0, '예전 화면·직접 RPC도 서버의 제한을 넘지 못한다');
reset();
assert.ok('error' in (await recordMechanicsDrill({ ...input(), practice: undefined })));
assert.equal(test.writes, 0, '체크만으로 횟수를 만들지 않는다');
await recordMechanicsDrill(input({ response: 'pain' }));
assert.equal(
  readProgramState(test.row.progress).practice[0].response,
  'pain',
  '통증이 생긴 수행도 기록은 남긴다'
);

assert.equal(practiceInput(null), null);
assert.equal(practiceInput({}), null);
for (const invalid of [
  { throws: -1 },
  { throws: 1.5 },
  { throws: 1001 },
  { effortPct: NaN },
  { response: 'unknown' },
]) {
  assert.equal(practiceInput({ ...input().practice, ...invalid }), null);
}
for (const age of [13, 16, 22, null]) {
  const fold = mechanicsPainFold({ elbow: '통증' }, { age });
  const play = playItemsFor(
    [{ category: '스로잉 드릴', alternatives: [] }],
    fold,
    true
  );
  assert.equal(
    play.items.length,
    0,
    `나이 ${age}에서도 anyway로 던지기를 복원하지 않는다`
  );
}
const state = freshState('beginner');
for (const f of Object.values(state.feels)) f.easy = 3;
assert.equal(levelAdvice(state), null, '쉬움만으로 승급을 권하지 않는다');
state.films = [
  {
    session: 6,
    on: '2026-10-25',
    verdict: 'better',
    level: 'beginner',
    comparable: true,
    transferred: true,
    response: 'pain',
  },
];
assert.equal(
  levelAdvice(state),
  null,
  '영상이 좋아져도 통증 반응이 있으면 승급을 권하지 않는다'
);
state.films[0].response = 'clear';
assert.equal(levelAdvice(state).kind, 'up');
const { loadRehabFacts } = await import('../lib/armcare/rehab-store.ts');
const rehab = await loadRehabFacts('test-user', new Date('2026-10-25T03:00:00Z'));
assert.equal(
  rehab.throwing,
  'none',
  '자동 재활 보류로 기존 재활 사용자의 투구 제한이 사라지지 않는다'
);
assert.equal(rehab.stage, 2, '과거 4단계도 자동으로 무거운 운동을 허용하지 않는다');
console.log('서버 기록·중복 방지·통증 제한·전이 확인 검사 통과 (운영 DB 접근 없음)');

process.exit(0);
