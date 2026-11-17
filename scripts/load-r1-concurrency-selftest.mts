/**
 * EX-LOAD01-R1 — 세트 쓰기의 끼어듦(interleaving) 시험. 실제 저장 코드(lib/workout/load/store.ts persistSet · lib/workout/v2/command.ts execute)를
 * 격리 PGlite(메모리 안 Postgres, 공유 DB 에 닿지 않는다 — DATABASE_URL 을 읽지 않는다)에서 정해진 차례로 돌린다.
 *
 * ■ 무엇을 증명하지 않는가
 *   PGlite 는 백엔드가 하나다. pglite-socket 은 연결 여러 개를 그 한 세션에 섞어 돌리므로(maxConnections · 질의 줄 세우기), 두 연결이
 *   서로를 기다리는 잠금 경합 · 거래 격리 · Supabase 거래 풀러는 여기서 증명되지 않는다. 이 시험은 '미리 읽은 값이 그사이 바뀐 경우'를
 *   정해진 차례로 재현해, 거래 안에서 지금 줄로 다시 계산하는 규칙과 영수증 · 되돌림 · 복구 연결을 본다. 실제 여러 연결 경합은 출시 관문으로 남는다.
 *
 * 실행: node --import ./scripts/alias-register.mjs scripts/load-r1-concurrency-selftest.mts
 */
import assert from 'node:assert/strict';
import { V2_FIXTURE_SQL, fixtureSchemaSql } from './load-fixture-schema.mts';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
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

const BAND_DEADLIFT = '50298d2b-fd1f-4265-8b67-e95c7815335e';
const COMB = resolveRecordingContract({ exerciseId: BAND_DEADLIFT, equipment: ['바벨', '밴드'], overrides: overridesFor(BAND_DEADLIFT) });
const BAND = resolveRecordingContract({ equipment: ['밴드'] });
const LATEX = BAND_SERIES.find((s) => s.id === 'theraband-professional-latex-band')!;
const band = (color: string): BandComponent => {
  const lv = LATEX.levels.find((l) => l.id.endsWith(':' + color))!;
  return { catalog: BAND_CATALOG_REVISION, seriesId: LATEX.id, levelId: lv.id, label: lv.label, swatch: lv.swatch };
};
const combLoad = (color: string, kg: number) => ({ kind: 'combined', mass: { kg }, band: { bands: [band(color)] } });
const bandLoad = (color: string) => ({ kind: 'band', role: 'resistance', bands: [band(color)] });
const levelOf = (l: RecordedLoad | null | undefined) => (l?.kind === 'combined' ? l.band.bands[0] : l?.kind === 'band' ? l.bands[0] : null) as { levelId?: string } | null;

function norm(over: Partial<NormalizeInput> & { contract: RecordingContract }): NormalizeOk {
  const r = normalizeSetLoad({ hasProtocol: true, protocol: LOAD_PROTOCOL, weightKg: undefined, hasLoad: false, load: undefined, structured: true, ...over });
  if (!r.ok) throw new Error(`expected ok, got ${r.code} ${r.error}`);
  return r;
}

const LOAD_SQL = 'prisma/migrations/20261116150000_ex_load01_recording_contract/migration.sql';
const V2_SQL = V2_FIXTURE_SQL;

const pg = await PGlite.create();
await pg.exec(fixtureSchemaSql());
for (const f of [V2_SQL, LOAD_SQL]) await pg.exec(readFileSync(f, 'utf8'));
const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await socket.start();
const port = (socket as unknown as { server: { address(): { port: number } } }).server.address().port;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`, max: 1 }) });
const count = async (table: string, where = 'TRUE') => Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}" WHERE ${where}`))[0].n);
const snapOf = async (id: string) => (await readSnapshotsTx(db as unknown as Prisma.TransactionClient, [id])).get(id);

let seedNo = 0;
async function seed(equipment: string[]) {
  const tag = `r1c${++seedNo}`;
  const u = await db.user.create({ data: { email: `${tag}@isolated.test`, nickname: tag, password: 'x' } });
  const ex = await db.exerciseVideo.create({
    data: { title: `ex-${tag}`, description: '', category: '파워', equipment, bodyParts: [], intensity: '보통', reps: 5 } as unknown as Prisma.ExerciseVideoCreateInput,
  });
  const s = await db.trainingSession.create({
    data: { userId: u.id, date: new Date('2026-11-17T00:00:00Z'), themeKey: 'lower', plan: { themeKey: 'lower', themeLabel: 't', exercises: [] }, status: 'ACTIVE', startedAt: new Date('2026-11-17T01:00:00Z') },
  });
  return { u, ex, s };
}
type Seed = Awaited<ReturnType<typeof seed>>;
const write = (sd: Seed, n: NormalizeOk, o: { reps?: number; rir?: number | null; original?: Record<string, unknown>; faults?: Parameters<typeof persistSet>[1]['faults'] } = {}) =>
  persistSet(db, {
    structured: true,
    upsert: {
      where: { sessionId_exerciseId_setNo: { sessionId: sd.s.id, exerciseId: sd.ex.id, setNo: 1 } },
      create: { sessionId: sd.s.id, userId: sd.u.id, exerciseId: sd.ex.id, date: new Date('2026-11-17T00:00:00Z'), setNo: 1, weightKg: n.weightKg, reps: o.reps ?? 5, holdSeconds: null, rir: o.rir ?? null },
      update: { weightKg: n.weightKg, reps: o.reps ?? 5, holdSeconds: null, ...(o.rir !== undefined ? { rir: o.rir } : {}) },
      select: { id: true },
    } as unknown as Prisma.UserExerciseSetUpsertArgs & { select: { id: true } },
    norm: n,
    owner: { ownerId: sd.u.id, actorId: sd.u.id },
    ref: { sessionId: sd.s.id, exerciseId: sd.ex.id, setNo: 1 },
    original: o.original ?? {},
    protocol: null,
    provenance: 'r1-concurrency',
    faults: o.faults,
  });

console.log('EX-LOAD01-R1 interleaving (isolated PGlite, deterministic order; NOT multi-connection proof)');
try {
  await test('stale omission (prepared before an explicit clear) keeps the clear, never restores the old band', async () => {
    const sd = await seed(['밴드']);
    const first = await write(sd, norm({ contract: BAND, hasLoad: true, load: bandLoad('yellow') }));
    const pre = await snapOf(first.id);
    /* 기기 A: 옛 앱의 RIR 만 고친 재전송을 거래 밖에서 미리 봤다(그때 줄은 노랑) */
    const stale = normalizeSetLoad({ hasProtocol: false, protocol: undefined, contract: BAND, weightKg: null, hasLoad: false, load: undefined, structured: true, existing: { weightKg: null, load: pre!.value } });
    assert.ok(stale.ok);
    /* 기기 B: 새 앱이 밴드를 명시적으로 지웠다(load: null) */
    await write(sd, norm({ contract: BAND, hasLoad: true, load: null }));
    assert.equal((await snapOf(first.id))?.value.kind, 'none');
    /* A 가 이제 쓴다 — 지금 줄(지움)이 이긴다 */
    await write(sd, stale as NormalizeOk, { rir: 2 });
    const now = await snapOf(first.id);
    assert.equal(now?.value.kind, 'none', 'explicit clear survives a stale omission');
    const row = await db.userExerciseSet.findUniqueOrThrow({ where: { id: first.id }, select: { rir: true, weightKg: true } });
    assert.equal(row.rir, 2, 'the stale request still applies its own field (RIR)');
    assert.equal(row.weightKg, null);
  });

  await test('load-only change vs RIR-only modern request prepared earlier: newer band kept, RIR applied', async () => {
    const sd = await seed(['바벨', '밴드']);
    const first = await write(sd, norm({ contract: COMB, weightKg: 20, hasLoad: true, load: combLoad('yellow', 20) }));
    const pre = await snapOf(first.id);
    const staleModern = normalizeSetLoad({ hasProtocol: true, protocol: LOAD_PROTOCOL, resolver: 1, contract: COMB, weightKg: 20, hasLoad: false, load: undefined, structured: true, existing: { weightKg: 20, load: pre!.value } });
    assert.ok(staleModern.ok);
    await write(sd, norm({ contract: COMB, weightKg: 20, hasLoad: true, load: combLoad('red', 20) }));
    await write(sd, staleModern as NormalizeOk, { rir: 1 });
    const now = await snapOf(first.id);
    assert.ok(levelOf(now?.value)?.levelId?.endsWith(':red'), 'newer red band kept');
    assert.equal((await db.userExerciseSet.findUniqueOrThrow({ where: { id: first.id }, select: { rir: true } })).rir, 1);
  });

  await test('two explicit modern corrections in sequence: the later explicit value wins (no merge of explicit loads)', async () => {
    const sd = await seed(['밴드']);
    const a = norm({ contract: BAND, hasLoad: true, load: bandLoad('green') });
    const b = norm({ contract: BAND, hasLoad: true, load: bandLoad('blue') });
    const first = await write(sd, a);
    await write(sd, b);
    await write(sd, a);
    assert.ok(levelOf((await snapOf(first.id))?.value)?.levelId?.endsWith(':green'));
  });

  await test('lost response + resend of the same legacy request: one set, one recovery row linked to that set', async () => {
    const sd = await seed(['맨몸']);
    const NONE = resolveRecordingContract({ equipment: ['맨몸'] });
    const original = { kind: 'workout.logSet', exerciseId: sd.ex.id, setNo: 1, weightKg: 25, reps: 10 };
    const legacy = normalizeSetLoad({ hasProtocol: false, protocol: undefined, contract: NONE, weightKg: 25, hasLoad: false, load: undefined, structured: true });
    assert.ok(legacy.ok && legacy.recover);
    const r1 = await write(sd, legacy as NormalizeOk, { reps: 10, original });
    const r2 = await write(sd, legacy as NormalizeOk, { reps: 10, original });
    assert.equal(r1.id, r2.id);
    assert.equal(await count('UserExerciseSet', `"sessionId" = '${sd.s.id}'`), 1);
    const rec = await db.$queryRawUnsafe<{ setId: string; originalHash: string }[]>(`SELECT "setId", "originalHash" FROM "WorkoutLoadRecovery" WHERE "sessionId" = '${sd.s.id}'`);
    assert.equal(rec.length, 1, 'idempotent recovery');
    assert.equal(rec[0].setId, r1.id, 'recovery linked to the canonical set');
    assert.equal(rec[0].originalHash, originalPayloadHash(original));
  });

  await test('fault after the recovery insert rolls back set + snapshot + recovery; the retry links them again', async () => {
    const sd = await seed(['바벨', '밴드']);
    const legacyKg = normalizeSetLoad({ hasProtocol: false, protocol: undefined, contract: COMB, weightKg: 25, hasLoad: false, load: undefined, structured: true });
    assert.ok(legacyKg.ok);
    await assert.rejects(write(sd, norm({ contract: COMB, weightKg: 20, hasLoad: true, load: combLoad('yellow', 20) }), { faults: { afterSnapshot: () => { throw new Error('inject'); } } }), /inject/);
    assert.equal(await count('UserExerciseSet', `"sessionId" = '${sd.s.id}'`), 0, 'nothing left after the fault');
    const ok = await write(sd, norm({ contract: COMB, weightKg: 20, hasLoad: true, load: combLoad('yellow', 20) }));
    assert.ok(levelOf((await snapOf(ok.id))?.value)?.levelId?.endsWith(':yellow'));
    const original = { kind: 'workout.logSet', weightKg: 25 };
    await assert.rejects(write(sd, legacyKg as NormalizeOk, { original, faults: { afterRecovery: () => { throw new Error('inject2'); } } }), /inject2/);
    assert.equal(await count('WorkoutLoadRecovery', `"sessionId" = '${sd.s.id}'`), 0, 'no orphan recovery');
    assert.equal((await db.userExerciseSet.findUniqueOrThrow({ where: { id: ok.id }, select: { weightKg: true } })).weightKg, 20, 'set untouched by the rolled-back write');
    await write(sd, legacyKg as NormalizeOk, { original });
    const rec = await db.$queryRawUnsafe<{ setId: string }[]>(`SELECT "setId" FROM "WorkoutLoadRecovery" WHERE "sessionId" = '${sd.s.id}'`);
    assert.deepEqual(rec.map((r) => r.setId), [ok.id]);
    assert.equal((await db.userExerciseSet.findUniqueOrThrow({ where: { id: ok.id }, select: { weightKg: true } })).weightKg, 20, 'old-app kg did not overwrite the modern mass');
  });

  /* v2 — 같은 기록 판(recordVersion)을 두 기기가 동시에 고침 · 같은 명령 번호 재전송 */
  const w = await seed(['바벨', '밴드']);
  const fz = { id: w.ex.id, title: 'band dl', category: '파워', slot: 'main', prescription: null, plannedSets: 3, plannedReps: 5, plannedHoldSeconds: null, perSide: false, needsWeight: true, isHold: false, equipment: ['바벨', '밴드'], bodyParts: [], intensity: '보통', thumbPath: null, load: COMB };
  await db.trainingSession.update({ where: { id: w.s.id }, data: { plan: { themeKey: 'lower', themeLabel: 't', exercises: [fz] } } });
  let opn = 0;
  const op = () => `op_r1c_${String(++opn).padStart(10, '0')}`;
  const run = (type: CommandType, payload: unknown, operationId = op()) =>
    execute(db as unknown as CommandDb, { actorId: w.u.id, ownerId: w.u.id, operationId, type, sessionId: w.s.id, payload, runGeneration: null, loadStructured: true });
  const modernReq = (color: string, kg: number) => ({ hasProtocol: true, protocol: 1, resolver: 1, contract: COMB, weightKg: kg, hasLoad: true, load: combLoad(color, kg), structured: true, variant: undefined });
  const prep = (request: object, o: Record<string, unknown>) => ({ request, provenance: 'modern', original: { originalHash: originalPayloadHash(o), original: o } });
  const cid = 'lg_' + 'r'.repeat(40);
  const verOf = async () => (await db.$queryRawUnsafe<{ recordVersion: number; load: unknown }[]>(`SELECT "recordVersion", "load" FROM "UserExerciseSet" WHERE "clientSetId" = '${cid}'`))[0];

  await test('v2: two devices correct the same record version — one applies, the stale one is a CONFLICT and changes nothing', async () => {
    assert.equal((await run('session.promote', {})).code, 'APPLIED');
    const entry = ((await db.trainingSession.findUniqueOrThrow({ where: { id: w.s.id } })).plan as unknown as { exercises: { entryId: string }[] }).exercises[0].entryId;
    const rec = await run('set.record', { clientSetId: cid, entryId: entry, plannedSetKey: null, targetRevisionId: null, values: { weightKg: 20, reps: 5, holdSeconds: null }, performedAt: '2026-11-17T01:20:00Z', preferredSetNo: 1, loadPrep: prep(modernReq('yellow', 20), { a: 1 }) });
    assert.equal(rec.code, 'APPLIED', JSON.stringify(rec));
    const v0 = (await verOf()).recordVersion;
    const devA = await run('set.correct', { clientSetId: cid, expectedRecordVersion: v0, fields: { weightKg: 20, reps: 5, holdSeconds: null }, loadPrep: prep(modernReq('red', 20), { b: 1 }) });
    assert.equal(devA.code, 'APPLIED', JSON.stringify(devA));
    const devB = await run('set.correct', { clientSetId: cid, expectedRecordVersion: v0, fields: { weightKg: 20, reps: 5, holdSeconds: null }, loadPrep: prep(modernReq('green', 20), { c: 1 }) });
    assert.equal(devB.code, 'CONFLICT', JSON.stringify(devB));
    const now = await verOf();
    assert.ok(levelOf(readSnapshot(now.load)?.value)?.levelId?.endsWith(':red'), 'stale device did not overwrite');
    assert.equal(now.recordVersion, v0 + 1);
  });

  await test('v2: lost response — same operation id replays the stored outcome; a new id with the same values is NO_CHANGE', async () => {
    const before = await verOf();
    const opId = op();
    const payload = { clientSetId: cid, expectedRecordVersion: before.recordVersion, fields: { weightKg: 20, reps: 6, holdSeconds: null }, loadPrep: prep(modernReq('red', 20), { d: 1 }) };
    const first = await run('set.correct', payload, opId);
    assert.equal(first.code, 'APPLIED', JSON.stringify(first));
    const replay = await run('set.correct', payload, opId);
    assert.equal(replay.replay, true, 'durable receipt replayed');
    const after = await verOf();
    assert.equal(after.recordVersion, before.recordVersion + 1, 'replay did not apply twice');
    const again = await run('set.correct', { ...payload, expectedRecordVersion: after.recordVersion });
    assert.equal(again.code, 'NO_CHANGE', JSON.stringify(again));
  });
} finally {
  await db.$disconnect();
  await socket.stop();
  await pg.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
