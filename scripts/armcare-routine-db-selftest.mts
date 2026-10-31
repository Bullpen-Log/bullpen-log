/**
 * 내 암케어 루틴 저장 DB 시험 — 운영 DB 를 건드리지 않고, 메모리 안 PostgreSQL(PGlite)에 지금 스키마를 깔아 lib/armcare/my-routines-save.ts 를 돌린다.
 * `npm run armcare-routine:db-test`
 *
 * 보는 것: 같은 key 다시 보냄 · 겹쳐 보냄 · 답을 잃은 뒤 확인이 루틴 하나로 모이는가, 남의 key · 남의 루틴, 9개에서 따로 둘 만들기(10개 상한),
 * 입력 · 담을 수 없는 운동 거절(줄이 안 생김), 고치기가 지운 루틴을 다시 만들지 않는가.
 * 한계: PGlite 는 연결이 하나라 겹친 요청이 실제로는 하나씩 돈다. 운영 PostgreSQL 의 진짜 경합(같은 key 의 고유 충돌)은 가짜 트랜잭션으로
 * 그 순간을 만들어 본다(다른 요청이 먼저 넣고, 이쪽은 못 본 채 넣다가 부딪힘 — 충돌 오류는 지어 던진다. PGlite 소켓이 오류 뒤 연결을 닫아서).
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createRoutineOnce, updateRoutine } from '@/lib/armcare/my-routines-save';
import { MY_ROUTINE_MAX } from '@/lib/armcare/my-routines';

let passed = 0;
const ok = (cond: unknown, label: string) => {
  assert.ok(cond, label);
  if (process.env.V) console.log('ok', label);
  passed++;
};

const sql = execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const pg = await PGlite.create();
await pg.exec(sql);
const server = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await server.start();
const addr = (server as unknown as { server: { address(): { port: number } } }).server.address();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${addr.port}/postgres?sslmode=disable`, max: 1 }),
});

const mkUser = (n: string) => db.user.create({ data: { email: `${n}@t.test`, password: 'x', nickname: n } });
const [A, B, C] = await Promise.all([mkUser('a'), mkUser('b'), mkUser('c')]);
const known = new Set(['ex1', 'ex2', 'ex3']);
const input = { name: '  투구  전 루틴 ', items: [{ exerciseId: 'ex1', sets: 2 }, { exerciseId: 'ex2', sets: 9 }] };
const count = (userId: string) => db.userArmcareRoutine.count({ where: { userId } });

/* 1. 새로 만들기 — key 가 그 루틴 id, 이름 · 세트는 서버 규칙으로 다듬는다 */
const k1 = randomUUID();
const r1 = await createRoutineOnce(db, A.id, k1, input, known);
ok('ok' in r1 && r1.id === k1, '새 루틴 id = key');
ok('ok' in r1 && r1.name === '투구 전 루틴' && r1.items[1].sets === 5, '이름 공백 · 세트 1~5 다듬음');
ok((await count(A.id)) === 1, '루틴 1개');

/* 2. 답을 잃은 뒤 같은 key 로 결과 확인 · 연타 — 같은 루틴, 수는 그대로 */
const again = await createRoutineOnce(db, A.id, k1, input, known);
ok('ok' in again && again.id === k1 && again.name === '투구 전 루틴', '같은 key 다시 → 같은 루틴');
const burst = await Promise.all(Array.from({ length: 5 }, () => createRoutineOnce(db, A.id, k1, input, known)));
ok(burst.every((r) => 'ok' in r && r.id === k1), '겹쳐 보낸 5번 모두 같은 id');
ok((await count(A.id)) === 1, '여러 번 보내도 루틴 1개');

/* 3. 처음부터 겹쳐 보냄(아직 없는 key) — 하나만 생긴다 */
const k2 = randomUUID();
const first = await Promise.all(Array.from({ length: 4 }, () => createRoutineOnce(db, A.id, k2, input, known)));
ok(first.every((r) => 'ok' in r && r.id === k2), '새 key 겹침 — 모두 같은 id');
ok((await count(A.id)) === 2, '새 key 겹침 — 하나만 더 생김');

/* 4. 진짜 경합 — 다른 요청이 같은 key 를 먼저 넣었는데 이쪽 트랜잭션은 못 보고 넣다가 부딪힘(P2002) → 다시 읽어 같은 루틴 */
const k3 = randomUUID();
const raced = {
  userArmcareRoutine: db.userArmcareRoutine,
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    await db.userArmcareRoutine.create({ data: { id: k3, userId: A.id, name: '투구 전 루틴', items: [{ exerciseId: 'ex1', sets: 2 }] } });
    return fn({
      userArmcareRoutine: {
        findUnique: async () => null,
        count: (a: Prisma.UserArmcareRoutineCountArgs) => db.userArmcareRoutine.count(a),
        /* 운영 PostgreSQL 이면 여기서 고유 충돌(23505 → P2002)이 난다. PGlite 소켓은 오류 뒤 연결을 닫아 같은 오류를 지어 던진다 */
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`id`)', { code: 'P2002', clientVersion: 'test' });
        },
      },
    });
  },
} as unknown as PrismaClient;
const r3 = await createRoutineOnce(raced, A.id, k3, input, known);
ok('ok' in r3 && r3.id === k3, '고유 충돌 뒤 다시 읽어 같은 id');
ok((await count(A.id)) === 3, '경합 — 루틴 하나만 늘어남');

/* 5. 겹침이 계속(P2034)이고 줄이 끝내 없으면 쓰지 않은 거절 */
const always = {
  userArmcareRoutine: db.userArmcareRoutine,
  $transaction: async () => {
    throw new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: 'test' });
  },
} as unknown as PrismaClient;
const r5 = await createRoutineOnce(always, A.id, randomUUID(), input, known);
ok('error' in r5 && r5.code === 'conflict', '계속 겹침 → conflict 거절');
ok((await count(A.id)) === 3, '거절은 줄을 남기지 않음');

/* 6. 남의 key — 거절하고 그 루틴을 알려 주지 않는다. 남의 루틴 고치기도 */
const rb = await createRoutineOnce(db, B.id, k1, { name: '남', items: [{ exerciseId: 'ex3', sets: 1 }] }, known);
ok('error' in rb && rb.code === 'invalid' && !('items' in rb), '남의 key → invalid, 내용 없음');
const still = await db.userArmcareRoutine.findUnique({ where: { id: k1 } });
ok(still?.userId === A.id && still.name === '투구 전 루틴', '남의 시도가 루틴을 바꾸지 않음');
const ub = await updateRoutine(db, B.id, k1, { name: '빼앗기', items: [{ exerciseId: 'ex1', sets: 1 }] }, known);
ok('error' in ub && ub.code === 'notFound', '남의 루틴 고치기 → notFound');

/* 7. 입력 · 운동 거절 — 줄이 생기지 않는다. key 모양이 틀리면 거절 */
const before = await count(C.id);
const empty = await createRoutineOnce(db, C.id, randomUUID(), { name: '   ', items: [{ exerciseId: 'ex1', sets: 1 }] }, known);
ok('error' in empty && empty.code === 'invalid', '빈 이름 → invalid');
const long = await createRoutineOnce(db, C.id, randomUUID(), { name: '가'.repeat(21), items: [{ exerciseId: 'ex1', sets: 1 }] }, known);
ok('error' in long && long.code === 'invalid', '21자 → invalid');
const none = await createRoutineOnce(db, C.id, randomUUID(), { name: '빈', items: [] }, known);
ok('error' in none && none.code === 'invalid', '운동 0개 → invalid');
const many = await createRoutineOnce(db, C.id, randomUUID(), { name: '많음', items: Array.from({ length: 16 }, (_, i) => ({ exerciseId: `x${i}`, sets: 1 })) }, new Set(Array.from({ length: 16 }, (_, i) => `x${i}`)));
ok('error' in many && many.code === 'invalid', '16개 → invalid');
const hidden = await createRoutineOnce(db, C.id, randomUUID(), { name: '숨김', items: [{ exerciseId: 'gone', sets: 1 }] }, known);
ok('error' in hidden && hidden.code === 'unavailable', '담을 수 없는 운동 → unavailable');
const badKey = await createRoutineOnce(db, C.id, 'not-a-uuid', input, known);
ok('error' in badKey && badKey.code === 'invalid', 'key 모양이 틀림 → invalid');
ok((await count(C.id)) === before, '거절은 줄을 남기지 않음(C)');

/* 8. 이미 만든 key 는 그새 운동이 숨겨져도 그 루틴을 돌려준다(된 저장을 실패로 답하지 않는다) */
const later = await createRoutineOnce(db, A.id, k1, input, new Set());
ok('ok' in later && later.id === k1, '만든 뒤 운동이 숨겨져도 같은 결과');

/* 9. 9개에서 따로 둘을 겹쳐 만들면 10개에서 멈춘다 — 넘친 쪽은 limit(쓰지 않음) */
for (let i = 0; i < MY_ROUTINE_MAX - 1; i++) await createRoutineOnce(db, C.id, randomUUID(), { name: `r${i}`, items: [{ exerciseId: 'ex1', sets: 1 }] }, known);
ok((await count(C.id)) === MY_ROUTINE_MAX - 1, '9개 준비');
const pair = await Promise.all([randomUUID(), randomUUID()].map((k) => createRoutineOnce(db, C.id, k, { name: '열 번째', items: [{ exerciseId: 'ex2', sets: 2 }] }, known)));
ok(pair.filter((r) => 'ok' in r).length === 1 && pair.filter((r) => 'error' in r && r.code === 'limit').length === 1, '따로 둘 → 하나 ok · 하나 limit');
ok((await count(C.id)) === MY_ROUTINE_MAX, '10개에서 멈춤');
/* 같은 이름 · 같은 구성이라도 다른 key 는 다른 시도다(합치지 않는다) — 한도에서 거절될 뿐 */
const sameShape = pair.find((r) => 'ok' in r)!;
const madeKey = 'ok' in sameShape ? sameShape.id : '';
const retryMade = await createRoutineOnce(db, C.id, madeKey, { name: '열 번째', items: [{ exerciseId: 'ex2', sets: 2 }] }, known);
ok('ok' in retryMade && retryMade.id === madeKey, '한도에서도 이미 만든 key 결과 확인은 같은 루틴');

/* 10. 고치기 — 같은 내용 다시 보내도 같은 결과, 지운 루틴은 다시 만들지 않음 */
const u1 = await updateRoutine(db, A.id, k2, { name: ' 고친 루틴 ', items: [{ exerciseId: 'ex3', sets: 4 }, { exerciseId: 'ex1', sets: 1 }] }, known);
const u2 = await updateRoutine(db, A.id, k2, { name: ' 고친 루틴 ', items: [{ exerciseId: 'ex3', sets: 4 }, { exerciseId: 'ex1', sets: 1 }] }, known);
ok('ok' in u1 && 'ok' in u2 && u1.name === '고친 루틴' && JSON.stringify(u1.items) === JSON.stringify(u2.items), '고치기 다시 보냄 → 같은 결과');
ok(u1 && 'ok' in u1 && u1.items[0].exerciseId === 'ex3', '고친 차례대로');
await db.userArmcareRoutine.delete({ where: { id: k2 } });
const gone = await updateRoutine(db, A.id, k2, { name: '되살리기', items: [{ exerciseId: 'ex1', sets: 1 }] }, known);
ok('error' in gone && gone.code === 'notFound', '지운 루틴 고치기 → notFound');
ok((await db.userArmcareRoutine.findUnique({ where: { id: k2 } })) == null, '지운 루틴을 다시 만들지 않음');

await db.$disconnect();
await server.stop();
await pg.close();
console.log(`armcare-routine-db: ${passed}개 통과`);
