/** 실제 서버 동작을 메모리 DB에서 실행한다. 운영 DB·계정에는 접근하지 않는다. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';

const test = {
  row: null,
  pitches: new Map(),
  done: new Set(),
  blocked: null,
  writes: 0,
  guide: { id: 'reviewed-guide', category: '스로잉 드릴', title: '텐 토즈 스로우' },
  guides: null,
  failDrill: false,
  today: '2026-10-25',
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
  if (kind === 'drill') { if (test.failDrill) throw new Error('injected write failure'); test.done.add(args.create.guideId); }
};
let lockTail = Promise.resolve();
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
    findUnique: async () => structuredClone(test.row),
    update: async (args) => apply(operation('program', args)),
  },
  pitchLog: {
    aggregate: async () => ({ _sum: { pitchCount: 80 } }),
    upsert: async (args) => apply(operation('pitch', args)),
    deleteMany: async (args) => apply(operation('delete-pitch', args)),
  },
  userDrillLog: { upsert: async (args) => apply(operation('drill', args)) },
  $transaction: async (work) => {
    let release;
    let snapshot;
    const tx = { ...test.prisma, $executeRaw: async (sql, key) => {
      assert.match(sql.join('?'), /pg_advisory_xact_lock/);
      assert.equal(key, 'mechanics:test-user');
      const previous = lockTail;
      lockTail = new Promise((resolve) => { release = resolve; });
      await previous;
      snapshot = structuredClone({ row: test.row, pitches: test.pitches, done: test.done, writes: test.writes });
      return 1;
    } };
    try { return await work(tx); }
    catch (e) { if (snapshot) Object.assign(test, snapshot); throw e; }
    finally { release?.(); }
  },
};
const mocks = new Map([
  ['/lib/prisma.ts', 'export const prisma = globalThis.__mechanicsRecordTest.prisma;'],
  [
    '/lib/dal.ts',
    "export async function requireUser() { return { id: 'test-user' }; }",
  ],
  ['/lib/clock.ts', "export const appNow = () => new Date(globalThis.__mechanicsRecordTest.today+'T03:00:00Z');"],
  [
    '/lib/library-cache.ts',
    'export async function visibleGuides() { return globalThis.__mechanicsRecordTest.guides ?? [globalThis.__mechanicsRecordTest.guide]; }',
  ],
  [
    '/lib/mechanics/focus-load.ts',
    "export async function loadFocusOffer() { return { error: 'test' }; }",
  ],
  [
    '/lib/mechanics/load.ts',
    `
    export async function loadDrillThrowNote() { return null; }
    import { mechanicsFoldOf } from '@/lib/mechanics/fold';
    import { readProgramState } from '@/lib/mechanics/program';
    import { mechanicsPlanKey } from '@/lib/mechanics/store';
    export async function loadCurrentMechanicsFold() {
      const t = globalThis.__mechanicsRecordTest;
      return t.blocked ?? mechanicsFoldOf({ todayKey: t.today, age: 25, checkins: [],
        logsToday: [...t.pitches.values()].map((p) => ({ ...p, intensity: p.intensity ?? 5 })) });
    }
    export async function loadMechanicsProgram() {
      const t = globalThis.__mechanicsRecordTest;
      const state = readProgramState(t.row.progress);
      return { program: { level: state.level, index: state.index, week: 1, sessionsDone: t.row.sessionsDone,
        finishedToday: false, planKey: mechanicsPlanKey(t.row.id, t.row.sessionsDone, state), focus: null },
        throwNote: null, painFold: t.blocked, session: state.attempt?.items ?? [], doneToday: [...t.done] };

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
const { recordMechanicsDrill, finishMechanicsSession, recordMechanicsFilm, closeDrillThrowNote } = await import('../app/actions/mechanics.ts');
const { mechanicsPlanKey, openMechanicsAttempt } = await import('../lib/mechanics/store.ts');
const reset = () => {
  test.row = { id: 'program-1', progress: programStateJson(freshState('beginner')), sessionsDone: 0 };
  const state = readProgramState(test.row.progress);
  const guides = test.guides ?? [test.guide];
  state.attempt = { id: 'attempt-1', on: '2026-10-25', session: 1,
    planKey: mechanicsPlanKey(test.row.id, 0, state), completed: false, doneIds: [],
    items: guides.map((g) => ({ guideId: g.id, category: g.category, variant: g, alternatives: [{ variants: [{ ...g, owned: true }] }] })) };
  test.row.progress = programStateJson(state);
  test.today = '2026-10-25';
  test.failDrill = false;
  test.pitches.clear();
  test.done.clear();
  test.blocked = null;
  test.writes = 0;
};
const input = (practice = {}) => ({
  attemptId: 'attempt-1',
  requestId: createHash('sha256').update(JSON.stringify([test.guide.id, practice])).digest('hex'),
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
  { ok: true, stopReason: '투구 제한' },
  '응답 손실 뒤 재시도는 제한 상태에서도 중복 저장하지 않는다'
);
assert.equal(test.writes, writes);
test.blocked = null;
assert.deepEqual(await recordMechanicsDrill(input({ throws: 9 })), { ok: true });
assert.equal(test.pitches.size, 1, '오늘 합계 수정은 새 투구 기록을 만들지 않는다');
assert.equal([...test.pitches.values()][0].pitchCount, 9);
await recordMechanicsDrill(input());
assert.equal([...test.pitches.values()][0].pitchCount, 9, '수정 뒤 도착한 옛 요청의 재전송은 합계를 되돌리지 않는다');
assert.ok('error' in await recordMechanicsDrill({ ...input({ throws: 12 }), requestId: input().requestId }));
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

// Non-throwing categories never create or alter a pitch row, including old-client payloads.
const throwingGuide = test.guide;
for (const category of ['무브먼트 패턴 드릴', '근력 · 안정 드릴', '메디신볼 드릴']) {
  test.guide = { ...throwingGuide, category };
  reset();
  const sentinel = { pitchCount: 42 };
  test.pitches.set('manual', sentinel);
  assert.deepEqual(await recordMechanicsDrill(input({ throws: 10 })), { ok: true });
  assert.equal(test.pitches.size, 1, category);
  assert.deepEqual(test.pitches.get('manual'), sentinel);
  const practice = readProgramState(test.row.progress).practice[0];
  assert.equal(practice.kind, 'repetitions');
  assert.equal(practice.throws, 0);
  assert.equal(practice.reps, 10);
}
test.guide = { ...throwingGuide, category: '메디신볼 드릴' };
reset();
test.blocked = { reason: '통증으로 쉬어요' };
assert.ok('error' in await recordMechanicsDrill(input()));
assert.equal(test.writes, 0);
test.guide = { ...throwingGuide, category: '무브먼트 패턴 드릴' };
reset();
test.blocked = { reason: '오늘 투구 쉬기' };
assert.deepEqual(await recordMechanicsDrill(input({ reps: 10 })), { ok: true });
const finish = () => finishMechanicsSession({ session: 1, attemptId: 'attempt-1' });
assert.equal((await finish()).status, 'completed', '비투구 세션은 투구 제한 중에도 정상 완료');

// Reaching the daily load after the last drill must not revoke its completion.
test.guide = throwingGuide;
reset();
const atLimit = await recordMechanicsDrill(input({ throws: 50, effortPct: 60 }));
assert.ok(atLimit.ok && atLimit.stopReason, '저장 직후 다음 드릴 전에 제한을 알린다');
assert.ok('error' in await recordMechanicsDrill(input({ throws: 51, effortPct: 60 })), '기록된 실제 양으로 다음 투구를 제한한다');
assert.equal((await finish()).status, 'completed');
assert.equal(test.row.sessionsDone, 1);
await Promise.all([finish(), finish()]);
assert.equal(test.row.sessionsDone, 1, '완료 응답 재전송은 한 번만 센다');

// Old daily checkmarks cannot finish a new attempt.
reset();
test.done.add(test.guide.id);
assert.equal((await finish()).status, 'partial');
assert.equal(test.row.sessionsDone, 0);
assert.ok('error' in await finishMechanicsSession({ session: 1 }));
assert.ok('error' in await recordMechanicsDrill({ ...input(), attemptId: 'stale' }));
assert.ok('error' in await recordMechanicsDrill({ ...input(), attemptId: undefined }));
assert.equal(test.writes, 0);

// Two different drills share a program JSON. Read/merge/write must be serialized.
const other = { ...throwingGuide, id: 'second-guide' };
test.guides = [throwingGuide, other];
reset();
const a = input();
const b = { ...input(), guideId: other.id, requestId: 'second-request' };
assert.deepEqual(await Promise.all([recordMechanicsDrill(a), recordMechanicsDrill(b)]), [{ ok: true }, { ok: true }]);
assert.equal(test.pitches.size, 2);
assert.equal(test.done.size, 2);
assert.equal(readProgramState(test.row.progress).practice.length, 2);
assert.equal(readProgramState(test.row.progress).attempt.doneIds.length, 2);
const beforeRetry = test.writes;
await Promise.all([recordMechanicsDrill(a), recordMechanicsDrill(a)]);
assert.equal(test.writes, beforeRetry, '동일 요청 동시 재전송도 저장은 한 번');
await Promise.all([finish(), finish()]);
assert.equal(test.row.sessionsDone, 1, '최초 완료 요청 동시 실행도 한 번');

// A skipped slot stays incomplete even if the current day's load later hides it.
reset();
await recordMechanicsDrill(a);
test.blocked = { reason: '팔 부하 제한' };
assert.equal((await finish()).status, 'partial');
assert.equal(test.row.sessionsDone, 0);

// All writes roll back together when the final write fails.
reset();
test.failDrill = true;
await assert.rejects(recordMechanicsDrill(a), /injected/);
assert.equal(test.pitches.size, 0);
assert.equal(test.done.size, 0);
assert.equal(readProgramState(test.row.progress).practice.length, 0);
test.failDrill = false;

// Opening/reopening the player fixes its original assignment and resumes this attempt only.
reset();
const original = readProgramState(test.row.progress).attempt;
assert.equal((await openMechanicsAttempt('test-user', original.planKey, [original.items[0]])).items.length, 2);
await recordMechanicsDrill(a);
assert.equal((await openMechanicsAttempt('test-user', original.planKey, original.items)).doneIds.length, 1);
await recordMechanicsDrill(b);
await finish();
const nextState = readProgramState(test.row.progress);
const nextKey = mechanicsPlanKey(test.row.id, test.row.sessionsDone, nextState);
const nextAttempt = await openMechanicsAttempt('test-user', nextKey, original.items);
assert.notEqual(nextAttempt.id, original.id);
assert.equal(nextAttempt.session, 2);
assert.deepEqual(nextAttempt.doneIds, [], '같은 날 앞 세션의 체크는 다음 세션으로 넘어가지 않는다');
assert.equal((await finishMechanicsSession({ session: 2, attemptId: nextAttempt.id })).status, 'partial');

// Film feedback and drill writes also share the program lock.
reset();
test.row.sessionsDone = 1;
let concurrentState = readProgramState(test.row.progress);
concurrentState.attempt.session = 2;
concurrentState.attempt.planKey = mechanicsPlanKey(test.row.id, 1, concurrentState);
test.row.progress = programStateJson(concurrentState);
await Promise.all([recordMechanicsDrill(a), recordMechanicsFilm('better', { comparable: true, transferred: true, response: 'clear' })]);
concurrentState = readProgramState(test.row.progress);
assert.equal(concurrentState.practice.length, 1);
assert.equal(concurrentState.films.length, 1);
await Promise.all([recordMechanicsDrill(b), closeDrillThrowNote()]);
concurrentState = readProgramState(test.row.progress);
assert.equal(concurrentState.practice.length, 2);
assert.equal(concurrentState.throwLog.closed, true);

// A session opened yesterday cannot silently record today's drills.
reset();
test.today = '2026-10-26';
assert.ok('error' in await recordMechanicsDrill(a));
assert.ok('error' in await finish());
assert.equal(test.writes, 0);
const { loadMechanicsPlay } = await import('../lib/mechanics/play-load.ts');
reset();
await recordMechanicsDrill(a);
let play = await loadMechanicsPlay({ id: 'test-user', role: 'USER' }, null);
assert.ok(play.ok);
assert.equal(play.attemptId, 'attempt-1');
assert.equal(play.startAt, 1);
assert.ok(play.doneGuideIds.includes(throwingGuide.id));
await recordMechanicsDrill(b);
test.blocked = { reason: '부하 한도', because: 'armSpent', canUnfold: false };
const recover = await loadMechanicsPlay({ id: 'test-user', role: 'USER' }, null);
assert.ok(recover.ok, '부하 제한 중에도 저장을 마친 세션의 완료 확인을 다시 연다');
assert.ok(recover.items.every((item) => recover.doneGuideIds.includes(item.guideId)));
await finish();
test.blocked = null;
play = await loadMechanicsPlay({ id: 'test-user', role: 'USER' }, null);
assert.ok(play.ok);
assert.equal(play.sessionNumber, 2);
assert.equal(play.startAt, 0);
assert.deepEqual(play.doneGuideIds, [], '새 플레이어에 날짜별 옛 체크를 넘기지 않는다');

const { APP_API_LEVEL, MIN_APP_API, minAppApiForAction } = await import('../lib/app-api.ts');
assert.ok(APP_API_LEVEL >= 3);
for (const action of ['app-mechanics.loadAppMechanicsPlay', 'mechanics.recordMechanicsDrill', 'mechanics.finishMechanicsSession'])
  assert.equal(minAppApiForAction(action), 3);
assert.equal(minAppApiForAction('app-training-parts.loadAppMechanics'), MIN_APP_API, '다른 기능에는 업데이트를 강제하지 않는다');
reset();
assert.ok('error' in await recordMechanicsDrill(input({ throws: 0 })));
assert.equal(test.writes, 0, '0회 입력을 완료로 세지 않는다');
assert.equal(readProgramState({ ...test.row.progress, attempt: { ...readProgramState(test.row.progress).attempt, items: [null] } }).attempt, null);
console.log('메커니즘 기록 회귀 검사 통과: 운동 단위·통증 제한·완료·동시 저장·재전송·롤백·세션 구분 (운영 DB 접근 없음)');
process.exit(0);
