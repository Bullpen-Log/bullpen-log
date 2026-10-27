/** 새 기록 서버 동작을 메모리 DB로 검증한다. 실제 DB에는 접근하지 않는다. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const test = { user: 'user-a', rows: new Map() };
globalThis.__hittingSessionTest = test;
test.prisma = { hittingSession: {
  createMany: async ({ data }) => { const r = data[0]; if (test.rows.has(r.id)) return { count: 0 }; test.rows.set(r.id, { ...r }); return { count: 1 }; },
  findFirst: async ({ where }) => { const r = test.rows.get(where.id); return r?.userId === where.userId ? { ...r } : null; },
  updateMany: async ({ where, data }) => { const r = test.rows.get(where.id); if (!r || r.userId !== where.userId) return { count: 0 }; Object.assign(r, data); return { count: 1 }; },
  deleteMany: async ({ where }) => { const r = test.rows.get(where.id); if (!r || r.userId !== where.userId) return { count: 0 }; test.rows.delete(where.id); return { count: 1 }; },
} };
const mocks = new Map([
  ['/lib/prisma.ts', 'export const prisma=globalThis.__hittingSessionTest.prisma;'],
  ['/lib/dal.ts', 'export async function getCurrentUser(){const id=globalThis.__hittingSessionTest.user;return id?{id}:null;}'],
  ['/lib/clock.ts', "export const appNow=()=>new Date('2026-10-27T12:00:00Z'); export const appNowMs=()=>appNow().getTime();"],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/cache') return { url: 'data:text/javascript,export const revalidatePath=()=>{}', shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    for (const [suffix, source] of mocks) if (url.endsWith(suffix)) return { format: 'module', source, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { saveHittingSession, deleteHittingSession } = await import('../app/actions/hitting-log.ts');
const { validateHittingSession, hittingLine } = await import('../lib/hitting-log.ts');
const id = 'a1111111-1111-4111-8111-111111111111';
const second = 'b2222222-2222-4222-8222-222222222222';
const data = { id, editing: false, date: '2026-10-27', sessionType: '티배팅', swings: '', effortPct: null, memo: '연습', satisfaction: 4 };
assert.equal((await saveHittingSession(data)).ok, true);
assert.equal(test.rows.get(id).swings, null);
assert.equal(test.rows.get(id).satisfaction, 4);
assert.equal((await saveHittingSession(data)).ok, true);
assert.equal(test.rows.size, 1, '같은 요청 재시도는 한 번만 저장');
assert.equal((await saveHittingSession({ ...data, memo: '응답을 기다리다 바꾼 내용' })).ok, false, '이미 저장된 내용과 다른 재전송은 성공으로 처리하지 않는다');
assert.equal((await saveHittingSession({ ...data, id: second, swings: 0 })).ok, true);
assert.equal(test.rows.get(second).swings, 0, '명시적 0은 미입력과 구별');
assert.equal((await saveHittingSession({ ...data, editing: true, swings: 42 })).ok, true);
assert.equal(test.rows.get(id).swings, 42);
assert.equal((await saveHittingSession({ ...data, editing: true, swings: '' })).ok, true);
assert.equal(test.rows.get(id).swings, null);
assert.equal(hittingLine({ sessionType: '토스', swings: null, effortPct: null }), '토스');
assert.equal(hittingLine({ sessionType: '토스', swings: 0, effortPct: null }), '토스 0회');
assert.equal(validateHittingSession({ ...data, swings: '   ' }, data.date).value.swings, null);
assert.equal(validateHittingSession({ ...data, swings: 1001 }, data.date).field, 'swings');
assert.equal(validateHittingSession({ ...data, date: '2026-10-28' }, data.date).field, 'date');
assert.equal(validateHittingSession({ ...data, date: '2026-02-30' }, data.date).field, 'date');
test.user = 'user-b';
assert.equal((await saveHittingSession({ ...data, editing: true })).ok, false);
assert.equal((await saveHittingSession(data)).ok, false);
assert.equal((await deleteHittingSession(id)).ok, false);
test.user = 'user-a';
assert.equal((await deleteHittingSession(id)).ok, true);
test.user = null;
assert.equal((await saveHittingSession(data)).ok, false);
console.log('hitting-session: 미입력·0·재시도·수정·다른 계정 차단 통과');
