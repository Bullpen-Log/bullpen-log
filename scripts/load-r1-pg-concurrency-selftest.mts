/**
 * EX-LOAD01-R1 — 실제 PostgreSQL(서로 다른 연결)에서 세트 쓰기 잠금 · 끼어듦 · 영수증을 본다.
 *
 * ■ 어디에 붙는가 — 개인 임시 클러스터만
 *   R1_PG_URL 로 받은 주소만 쓴다. 127.0.0.1 루프백, 사용자 r1test, 데이터베이스 r1_isolated 가 아니면 시작하지 않는다(공유 · 운영 DB 를
 *   절대 건드리지 않는다 — DATABASE_URL · DIRECT_URL 은 읽지 않는다). 실행마다 새 데이터베이스(r1_run_<번호>)를 만들어 스키마 + 보류 SQL 을
 *   넣고, 끝나면 지운다. 사람 자료는 없다(합성 사용자만).
 *
 * ■ 무엇을 증명하는가 — PGlite 로는 못 보던 것
 *   각 기기를 따로 된 PrismaClient(따로 된 연결 풀)로 흉내 낸다. 잠금을 쥔 거래가 열려 있는 동안 다른 연결의 같은 사람 쓰기가 실제로
 *   기다리는지(pg_locks 에서 granted=false 로 확인), 다른 사람 쓰기는 안 기다리는지, 되돌린 거래 뒤 기다리던 쪽이 옛 줄 위에서 도는지,
 *   v2 명령의 기록 판 · 명령 번호 · 목표 판 경쟁이 한 결과만 남기는지.
 *
 * 실행: R1_PG_URL='postgresql://r1test@127.0.0.1:<port>/r1_isolated' node --import ./scripts/alias-register.mjs scripts/load-r1-pg-concurrency-selftest.mts
 */
import assert from 'node:assert/strict';
import { V2_FIXTURE_SQL, fixtureSchemaSql } from './load-fixture-schema.mts';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveRecordingContract, type RecordingContract } from '@/lib/workout/load/contract';
import { BAND_CATALOG_REVISION, BAND_SERIES, type BandComponent } from '@/lib/workout/load/band-catalog';
import { overridesFor } from '@/lib/workout/load/overrides';
import { normalizeSetLoad, type NormalizeInput, type NormalizeOk, type RecordedLoad } from '@/lib/workout/load/recorded';
import { readSnapshot } from '@/lib/workout/load/snapshot';
import { LOAD_PROTOCOL } from '@/lib/workout/load/protocol';
import { originalPayloadHash, persistSet, readSnapshotsTx } from '@/lib/workout/load/store';
import { execute, type CommandDb, type CommandType } from '@/lib/workout/v2/command';

const raw = process.env.R1_PG_URL ?? '';
const u0 = (() => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
})();
if (!u0 || u0.hostname !== '127.0.0.1' || u0.username !== 'r1test' || u0.pathname !== '/r1_isolated') {
  console.log('R1_PG_URL must be postgresql://r1test@127.0.0.1:<port>/r1_isolated (private loopback cluster only). Not running.');
  process.exit(2);
}
const runDb = `r1_run_${process.pid}`;
const urlFor = (dbName: string) => {
  const u = new URL(raw);
  u.pathname = '/' + dbName;
  u.search = 'sslmode=disable';
  return u.toString();
};

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${(e as Error).stack?.split('\n').slice(0, 4).join('\n      ')}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function gate() {
  let open!: () => void;
  const p = new Promise<void>((r) => (open = r));
  return { p, open };
}

const BAND_DEADLIFT = '50298d2b-fd1f-4265-8b67-e95c7815335e';
const COMB = resolveRecordingContract({ exerciseId: BAND_DEADLIFT, equipment: ['바벨', '밴드'], overrides: overridesFor(BAND_DEADLIFT) });
const LATEX = BAND_SERIES.find((s) => s.id === 'theraband-professional-latex-band')!;
const band = (color: string): BandComponent => {
  const lv = LATEX.levels.find((l) => l.id.endsWith(':' + color))!;
  return { catalog: BAND_CATALOG_REVISION, seriesId: LATEX.id, levelId: lv.id, label: lv.label, swatch: lv.swatch };
};
const combLoad = (color: string, kg: number) => ({ kind: 'combined', mass: { kg }, band: { bands: [band(color)] } });
const levelOf = (l: RecordedLoad | null | undefined) => (l?.kind === 'combined' ? l.band.bands[0] : l?.kind === 'band' ? l.bands[0] : null) as { levelId?: string } | null;
function norm(over: Partial<NormalizeInput> & { contract: RecordingContract }): NormalizeOk {
  const r = normalizeSetLoad({ hasProtocol: true, protocol: LOAD_PROTOCOL, weightKg: undefined, hasLoad: false, load: undefined, structured: true, ...over });
  if (!r.ok) throw new Error(`expected ok, got ${r.code} ${r.error}`);
  return r;
}

/* ── 개인 클러스터에 실행용 데이터베이스를 만든다 ── */
const admin = new pg.Client({ connectionString: urlFor('r1_isolated') });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${runDb}`);
await admin.query(`CREATE DATABASE ${runDb}`);
const setup = new pg.Client({ connectionString: urlFor(runDb) });
await setup.connect();
await setup.query(fixtureSchemaSql());
for (const f of [V2_FIXTURE_SQL, 'prisma/migrations/20261116150000_ex_load01_recording_contract/migration.sql'])
  await setup.query(readFileSync(f, 'utf8'));
await setup.end();

const clients: PrismaClient[] = [];
const device = () => {
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlFor(runDb), max: 4 }) });
  clients.push(c);
  return c;
};
const A = device();
const B = device();
const OBS = device();
const waitingAdvisory = async () =>
  Number((await OBS.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`))[0].n);
const snapOf = async (id: string) => (await readSnapshotsTx(OBS as unknown as Prisma.TransactionClient, [id])).get(id);
const count = async (table: string, where = 'TRUE') => Number((await OBS.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}" WHERE ${where}`))[0].n);

let seedNo = 0;
async function seed(equipment: string[]) {
  const tag = `r1pg${++seedNo}`;
  const u = await OBS.user.create({ data: { email: `${tag}@isolated.test`, nickname: tag, password: 'x' } });
  const ex = await OBS.exerciseVideo.create({
    data: { title: `ex-${tag}`, description: '', category: '파워', equipment, bodyParts: [], intensity: '보통', reps: 5 } as unknown as Prisma.ExerciseVideoCreateInput,
  });
  const s = await OBS.trainingSession.create({
    data: { userId: u.id, date: new Date('2026-11-17T00:00:00Z'), themeKey: 'lower', plan: { themeKey: 'lower', themeLabel: 't', exercises: [] }, status: 'ACTIVE', startedAt: new Date('2026-11-17T01:00:00Z') },
  });
  return { u, ex, s };
}
type Seed = Awaited<ReturnType<typeof seed>>;
const write = (db: PrismaClient, sd: Seed, n: NormalizeOk, o: { rir?: number | null; original?: Record<string, unknown>; faults?: Parameters<typeof persistSet>[1]['faults'] } = {}) =>
  persistSet(db, {
    structured: true,
    upsert: {
      where: { sessionId_exerciseId_setNo: { sessionId: sd.s.id, exerciseId: sd.ex.id, setNo: 1 } },
      create: { sessionId: sd.s.id, userId: sd.u.id, exerciseId: sd.ex.id, date: new Date('2026-11-17T00:00:00Z'), setNo: 1, weightKg: n.weightKg, reps: 5, holdSeconds: null, rir: o.rir ?? null },
      update: { weightKg: n.weightKg, reps: 5, holdSeconds: null, ...(o.rir !== undefined ? { rir: o.rir } : {}) },
      select: { id: true },
    } as unknown as Prisma.UserExerciseSetUpsertArgs & { select: { id: true } },
    norm: n,
    owner: { ownerId: sd.u.id, actorId: sd.u.id },
    ref: { sessionId: sd.s.id, exerciseId: sd.ex.id, setNo: 1 },
    original: o.original ?? {},
    protocol: null,
    provenance: 'r1-pg',
    faults: o.faults,
  });

console.log(`EX-LOAD01-R1 real PostgreSQL concurrency (private loopback cluster, database ${runDb}, independent connection pools)`);
const version = (await OBS.$queryRawUnsafe<{ v: string }[]>(`SELECT version() AS v`))[0].v;
console.log(`  server: ${version.split(' on ')[0]}`);
try {
  await test('same owner: B blocks on the advisory lock while A holds it (pg_locks waiting), then re-normalizes on A\'s committed row', async () => {
    const sd = await seed(['바벨', '밴드']);
    const first = await write(A, sd, norm({ contract: COMB, weightKg: 20, hasLoad: true, load: combLoad('yellow', 20) }));
    /* B: 옛 앱의 RIR 만 고친 재전송 — A 가 바꾸기 전(노랑)에 미리 봤다 */
    const pre = await snapOf(first.id);
    const staleB = normalizeSetLoad({ hasProtocol: false, protocol: undefined, contract: COMB, weightKg: 20, hasLoad: false, load: undefined, structured: true, existing: { weightKg: 20, load: pre!.value } });
    assert.ok(staleB.ok);
    const held = gate();
    const go = gate();
    const pA = write(A, sd, norm({ contract: COMB, weightKg: 20, hasLoad: true, load: combLoad('red', 20) }), { faults: { afterLock: async () => { held.open(); await go.p; } } });
    await held.p;
    let bDone = false;
    const pB = write(B, sd, staleB as NormalizeOk, { rir: 2 }).then((r) => ((bDone = true), r));
    let waiting = 0;
    for (let i = 0; i < 40 && waiting === 0; i++) {
      await sleep(25);
      waiting = await waitingAdvisory();
    }
    assert.ok(waiting >= 1, 'B is a real waiter on the advisory lock');
    assert.equal(bDone, false, 'B did not complete while A held the lock');
    go.open();
    await pA;
    await pB;
    const now = await snapOf(first.id);
    assert.ok(levelOf(now?.value)?.levelId?.endsWith(':red'), 'B re-read A\'s committed red under the lock');
    assert.equal((await OBS.userExerciseSet.findUniqueOrThrow({ where: { id: first.id }, select: { rir: true } })).rir, 2);
  });

  await test('different owners do not wait for each other', async () => {
    const s1 = await seed(['바벨', '밴드']);
    const s2 = await seed(['바벨', '밴드']);
    const held = gate();
    const go = gate();
    const pA = write(A, s1, norm({ contract: COMB, weightKg: 20, hasLoad: true, load: combLoad('red', 20) }), { faults: { afterLock: async () => { held.open(); await go.p; } } });
    await held.p;
    const t0 = Date.now();
    await write(B, s2, norm({ contract: COMB, weightKg: 30, hasLoad: true, load: combLoad('green', 30) }));
    assert.ok(Date.now() - t0 < 5000, 'other owner completed while A still held its own lock');
    go.open();
    await pA;
  });

  await test('A rolls back after taking the lock; waiting B proceeds on the pre-A row (no phantom red, no orphan recovery)', async () => {
    const sd = await seed(['바벨', '밴드']);
    const first = await write(A, sd, norm({ contract: COMB, weightKg: 20, hasLoad: true, load: combLoad('yellow', 20) }));
    const held = gate();
    const go = gate();
    const pA = write(A, sd, norm({ contract: COMB, weightKg: 20, hasLoad: true, load: combLoad('red', 20) }), {
      faults: { afterLock: async () => { held.open(); await go.p; }, afterSnapshot: () => { throw new Error('inject-rollback'); } },
    });
    await held.p;
    const legacyKg = normalizeSetLoad({ hasProtocol: false, protocol: undefined, contract: COMB, weightKg: 25, hasLoad: false, load: undefined, structured: true, existing: { weightKg: 20, load: (await snapOf(first.id))!.value } });
    assert.ok(legacyKg.ok);
    const pB = write(B, sd, legacyKg as NormalizeOk, { original: { kind: 'r1pg', weightKg: 25 } });
    go.open();
    await assert.rejects(pA, /inject-rollback/);
    await pB;
    const now = await snapOf(first.id);
    assert.ok(levelOf(now?.value)?.levelId?.endsWith(':yellow'), 'A\'s red never committed');
    assert.equal((await OBS.userExerciseSet.findUniqueOrThrow({ where: { id: first.id }, select: { weightKg: true } })).weightKg, 20, 'old-app kg did not replace the modern mass');
    assert.equal(await count('WorkoutLoadRecovery', `"sessionId" = '${sd.s.id}'`), 1, 'exactly B\'s recovery, linked');
  });

  /* ── v2 명령 ── */
  const w = await seed(['바벨', '밴드']);
  const fz = { id: w.ex.id, title: 'band dl', category: '파워', slot: 'main', prescription: null, plannedSets: 3, plannedReps: 5, plannedHoldSeconds: null, perSide: false, needsWeight: true, isHold: false, equipment: ['바벨', '밴드'], bodyParts: [], intensity: '보통', thumbPath: null, load: COMB };
  await OBS.trainingSession.update({ where: { id: w.s.id }, data: { plan: { themeKey: 'lower', themeLabel: 't', exercises: [fz] } } });
  let opn = 0;
  const op = () => `op_r1pg_${String(++opn).padStart(10, '0')}`;
  const run = (db: PrismaClient, type: CommandType, payload: unknown, operationId = op()) =>
    execute(db as unknown as CommandDb, { actorId: w.u.id, ownerId: w.u.id, operationId, type, sessionId: w.s.id, payload, runGeneration: null, loadStructured: true });
  const modernReq = (color: string, kg: number) => ({ hasProtocol: true, protocol: 1, resolver: 1, contract: COMB, weightKg: kg, hasLoad: true, load: combLoad(color, kg), structured: true, variant: undefined });
  const prep = (request: object, o: Record<string, unknown>) => ({ request, provenance: 'modern', original: { originalHash: originalPayloadHash(o), original: o } });
  let entry = '';
  const cid = 'lg_' + 'p'.repeat(40);
  const rowOf = async (clientSetId = cid) => (await OBS.$queryRawUnsafe<{ recordVersion: number; reps: number | null; load: unknown }[]>(`SELECT "recordVersion", "reps", "load" FROM "UserExerciseSet" WHERE "clientSetId" = '${clientSetId}'`))[0];

  await test('v2: concurrent set.record with the same clientSetId from two connections → one row', async () => {
    assert.equal((await run(A, 'session.promote', {})).code, 'APPLIED');
    entry = ((await OBS.trainingSession.findUniqueOrThrow({ where: { id: w.s.id } })).plan as unknown as { exercises: { entryId: string }[] }).exercises[0].entryId;
    const payload = { clientSetId: cid, entryId: entry, plannedSetKey: null, targetRevisionId: null, values: { weightKg: 20, reps: 5, holdSeconds: null }, performedAt: '2026-11-17T01:20:00Z', preferredSetNo: 1, loadPrep: prep(modernReq('yellow', 20), { a: 1 }) };
    const [ra, rb] = await Promise.all([run(A, 'set.record', payload), run(B, 'set.record', payload)]);
    const codes = [ra.code, rb.code].sort();
    assert.ok(codes.includes('APPLIED'), JSON.stringify([ra, rb]));
    assert.equal(await count('UserExerciseSet', `"clientSetId" = '${cid}'`), 1);
  });

  await test('v2: concurrent set.correct with the same expectedRecordVersion (reps change) → exactly one APPLIED, the other CONFLICT', async () => {
    const v0 = (await rowOf()).recordVersion;
    const mk = (reps: number, color: string) => ({ clientSetId: cid, expectedRecordVersion: v0, fields: { weightKg: 20, reps, holdSeconds: null }, loadPrep: prep(modernReq(color, 20), { r: reps }) });
    const [ra, rb] = await Promise.all([run(A, 'set.correct', mk(6, 'red')), run(B, 'set.correct', mk(7, 'green'))]);
    const codes = [ra.code, rb.code].sort();
    assert.deepEqual(codes, ['APPLIED', 'CONFLICT'], JSON.stringify([ra, rb]));
    const now = await rowOf();
    const winner = ra.code === 'APPLIED' ? { reps: 6, color: ':red' } : { reps: 7, color: ':green' };
    assert.equal(now.reps, winner.reps);
    assert.ok(levelOf(readSnapshot(now.load)?.value)?.levelId?.endsWith(winner.color), 'load and values come from the same winner');
    assert.equal(now.recordVersion, v0 + 1);
  });

  await test('v2: concurrent load-only corrections (same kg/reps, different band) at the same version → one APPLIED, one CONFLICT', async () => {
    const before = await rowOf();
    const mk = (color: string) => ({ clientSetId: cid, expectedRecordVersion: before.recordVersion, fields: { weightKg: 20, reps: before.reps, holdSeconds: null }, loadPrep: prep(modernReq(color, 20), { c: color }) });
    const [ra, rb] = await Promise.all([run(A, 'set.correct', mk('blue')), run(B, 'set.correct', mk('black'))]);
    const codes = [ra.code, rb.code].sort();
    assert.deepEqual(codes, ['APPLIED', 'CONFLICT'], JSON.stringify([ra, rb]));
    const now = await rowOf();
    assert.ok(levelOf(readSnapshot(now.load)?.value)?.levelId?.endsWith(ra.code === 'APPLIED' ? ':blue' : ':black'));
    assert.equal(now.recordVersion, before.recordVersion + 1, 'a load-only change is a recorded change (version bump)');
  });

  await test('v2: the same operationId sent concurrently on two connections → one effect, the other is a replay or retryable', async () => {
    const before = await rowOf();
    const opId = op();
    const payload = { clientSetId: cid, expectedRecordVersion: before.recordVersion, fields: { weightKg: 20, reps: (before.reps ?? 5) + 1, holdSeconds: null }, loadPrep: prep(modernReq('red', 20), { dup: 1 }) };
    const [ra, rb] = await Promise.all([run(A, 'set.correct', payload, opId), run(B, 'set.correct', payload, opId)]);
    const applied = [ra, rb].filter((r) => r.code === 'APPLIED' && !r.replay).length;
    assert.ok(applied <= 1, JSON.stringify([ra, rb]));
    assert.ok([ra, rb].every((r) => r.code === 'APPLIED' || r.code === 'RETRYABLE' || r.replay === true), JSON.stringify([ra, rb]));
    const after = await rowOf();
    assert.equal(after.recordVersion, before.recordVersion + 1, 'applied exactly once');
    assert.equal(await count('WorkoutMutationReceipt', `"operationId" = '${opId}'`), 1);
  });

  await test('v2: concurrent target.patch with the same expectedRevisionId → one APPLIED, one STALE_TARGET', async () => {
    const plan = (await OBS.trainingSession.findUniqueOrThrow({ where: { id: w.s.id } })).plan as unknown as { workoutV2?: { entries: Record<string, { currentRevisionId: string | null }> } };
    const v2key = Object.keys(plan).find((k) => (plan as Record<string, unknown>)[k] && typeof (plan as Record<string, unknown>)[k] === 'object' && 'entries' in ((plan as Record<string, unknown>)[k] as object));
    const expected = ((plan as Record<string, unknown>)[v2key!] as { entries: Record<string, { currentRevisionId: string | null }> }).entries[entry].currentRevisionId;
    const mk = (sets: number) => ({ entryId: entry, expectedRevisionId: expected, patch: { fields: { sets: { set: sets } } } });
    const [ra, rb] = await Promise.all([run(A, 'target.patch', mk(4)), run(B, 'target.patch', mk(2))]);
    const codes = [ra.code, rb.code].sort();
    assert.deepEqual(codes, ['APPLIED', 'CONFLICT'], JSON.stringify([ra, rb]));
    assert.equal((ra.code === 'CONFLICT' ? ra : rb).conflict, 'STALE_TARGET');
  });

  await test('mixed paths share one owner lock: a v2 command waits while the legacy persistSet of the same owner holds it', async () => {
    const legacyFor = { u: w.u, ex: w.ex, s: await OBS.trainingSession.create({ data: { userId: w.u.id, date: new Date('2026-11-18T00:00:00Z'), themeKey: 'lower', plan: { themeKey: 'lower', themeLabel: 't', exercises: [] }, status: 'ACTIVE' } }) };
    const held = gate();
    const go = gate();
    const pA = write(A, legacyFor, norm({ contract: COMB, weightKg: 20, hasLoad: true, load: combLoad('red', 20) }), { faults: { afterLock: async () => { held.open(); await go.p; } } });
    await held.p;
    const before = await rowOf();
    let bDone = false;
    const pB = run(B, 'set.correct', { clientSetId: cid, expectedRecordVersion: before.recordVersion, fields: { weightKg: 20, reps: (before.reps ?? 5) + 1, holdSeconds: null }, loadPrep: prep(modernReq('blue', 20), { mix: 1 }) }).then((r) => ((bDone = true), r));
    let waiting = 0;
    for (let i = 0; i < 40 && waiting === 0; i++) {
      await sleep(25);
      waiting = await waitingAdvisory();
    }
    assert.ok(waiting >= 1 && !bDone, 'v2 command waited on the shared workout:<owner> lock');
    go.open();
    await pA;
    assert.equal((await pB).code, 'APPLIED');
  });
} finally {
  for (const c of clients) await c.$disconnect();
  await admin.query(`DROP DATABASE IF EXISTS ${runDb} WITH (FORCE)`);
  await admin.end();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
