/**
 * EX-LOAD01-R1(R1-02 · 관문 D2) — 장비 목표(load target) 시험.
 *
 * 1) 순수: 장비 목표 정규화(밴드 · 여러 밴드 · 다른 상표 · 섞임 · 고르기 · 기구 이름 · 양손 다른 무게 · 순수 무게 접기 · 충돌 · 맨몸),
 *    다른 판 값(unsupported), 다음 세트 칸 채우기 차례(고치던 칸 > 목표 > 기기 기억 > 지난 세트), 칸 채우기 값.
 * 2) 격리 PGlite(메모리 안 Postgres — 공유 DB 에 연결하지 않는다, DATABASE_URL 을 읽지 않는다)에 지금 스키마 + 아직 적용 안 한 v2 · 무게 SQL:
 *    - r1 실제 저장 길(lib/workout/target-edit.ts editSessionTarget): 저장 · 다시 읽기 · 다시 열기(mergeReopened) · 고치기 · 지우기 ·
 *      옛 화면의 숫자 저장 · 되돌리기 · 다른 판 값 보존 · 프로그램 칸 · 통증 · 주인 · 남긴 세트 그대로
 *    - v2 실제 명령(lib/workout/v2/command.ts target.patch · session.promote · session.reopen): 같은 규칙 + 오래된 목표 판 충돌
 *    - 통합 점검: 밴드만 바뀐 세트 고치기는 기록 판을 올리고 APPLIED(오래된 기기가 덮지 못한다), 같은 세트 번호의 다른 밴드 재전송은 NO_CHANGE 가 아니다
 *    PGlite 는 백엔드가 하나라 연결 사이 잠금 경합은 여기서 증명하지 않는다.
 *
 * 실행: node --import ./scripts/alias-register.mjs scripts/load-r1-target-selftest.mts
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveRecordingContract, type RecordingContract, type SemanticOverrides } from '@/lib/workout/load/contract';
import { BAND_CATALOG_REVISION } from '@/lib/workout/load/band-catalog';
import {
  normalizeLoadTarget,
  pickLoadDraftSource,
  readLoadTarget,
  sameLoadTarget,
  seedOfLoadTarget,
  type LoadTarget,
} from '@/lib/workout/load/target';
import { checkTargetInput, editableOf, recommendedOf, targetView } from '@/lib/workout/target-override';
import { editSessionTarget, type TargetEditDb } from '@/lib/workout/target-edit';
import { mergeReopened, readFrozenPlan, type FrozenExercise, type FrozenPlan } from '@/lib/workout/session-plan';
import { execute, type CommandDb, type CommandType } from '@/lib/workout/v2/command';
import { activeOverride, patchOfTargetInput } from '@/lib/workout/v2/revision';
import { readPlanV2, type RawPlan } from '@/lib/workout/v2/plan-v2';
import { snapshotOf } from '@/lib/workout/load/snapshot';

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? (e.message + ' @ ' + (e.stack?.split('\n').find((l) => l.includes('selftest')) ?? '')).replace(/\n/g, ' ').slice(0, 600) : String(e)}`);
  }
}

/* ─────────────────────────── 표본 ─────────────────────────── */

const SERIES = 'theraband-professional-latex-band';
const band = (n: string) => ({ seriesId: SERIES, levelId: `${SERIES}:${n}` });
const custom = { custom: { brand: 'Rogue', series: 'Monster Band', level: '#2 초록' } };
const contractOf = (equipment: string[], overrides: SemanticOverrides | null = null): RecordingContract =>
  resolveRecordingContract({ equipment, overrides, category: '상체 스트렝스' });

function ex(over: Partial<FrozenExercise> & { id: string; equipment: string[] }, ov: SemanticOverrides | null = null): FrozenExercise {
  const load = contractOf(over.equipment, ov);
  return {
    title: over.id,
    category: '상체 스트렝스',
    slot: 'main' as FrozenExercise['slot'],
    prescription: '3세트 × 10회 · 세트 사이 1분 30초 휴식',
    plannedSets: 3,
    plannedReps: 10,
    plannedHoldSeconds: null,
    restSeconds: 90,
    perSide: false,
    needsWeight: load.massRequired,
    isHold: false,
    bodyParts: ['상체'],
    intensity: '중간',
    thumbPath: null,
    suggestedKg: null,
    load,
    ...over,
  };
}

const BANDX = ex({ id: 'ex-band-row', equipment: ['밴드'] });
const COMBO = ex({ id: 'ex-combo', equipment: ['바벨', '밴드'], suggestedKg: 40 }, { use: 'combined' });
const ALT = ex({ id: 'ex-alt', equipment: ['덤벨', '밴드'], suggestedKg: 10 }, { use: 'alternative' });
const CABLE = ex({ id: 'ex-cable', equipment: ['케이블'], suggestedKg: 20 });
const DUMB = ex({ id: 'ex-dumb', equipment: ['덤벨'], suggestedKg: 12 });
const BW = ex({ id: 'ex-bw', equipment: ['맨몸'] });
const PROG = ex({
  id: 'ex-prog',
  equipment: ['밴드'],
  programSlot: { slot: 'pushPull', variant: 'pull', reserve: 2, light: false } as unknown as FrozenExercise['programSlot'],
});
const ALL = [BANDX, COMBO, ALT, CABLE, DUMB, BW, PROG];

const loadOf = (ex: FrozenExercise) => ex.load!;
const ok = (r: ReturnType<typeof normalizeLoadTarget>) => {
  assert.ok(r.ok, JSON.stringify(r));
  return r;
};

/* ─────────────────────────── 1) 순수 ─────────────────────────── */

await test('normalize: band · multiple + custom bands · role kept · catalog relabelled · no kg', () => {
  const r = ok(normalizeLoadTarget({ load: { kind: 'band', role: 'resistance', bands: [band('yellow')] } }, loadOf(BANDX)));
  assert.equal(r.kg, null);
  assert.equal(r.target?.load.kind, 'band');
  assert.equal(r.target?.catalog, BAND_CATALOG_REVISION);
  const m = ok(normalizeLoadTarget({ load: { kind: 'band', role: 'assistance', bands: [band('red'), band('green'), custom] } }, loadOf(BANDX)));
  assert.equal(m.target?.load.kind === 'band' && m.target.load.bands.length, 3);
  assert.equal(m.target?.load.kind === 'band' && m.target.load.role, 'assistance');
  const bad = normalizeLoadTarget({ load: { kind: 'band', role: 'resistance', bands: [{ seriesId: SERIES, levelId: 'nope' }] } }, loadOf(BANDX));
  assert.ok(!bad.ok && bad.code === 'TARGET_LOAD_INVALID');
  const none = normalizeLoadTarget({ load: { kind: 'band', role: 'resistance', bands: [] } }, loadOf(BANDX));
  assert.ok(!none.ok && none.code === 'TARGET_LOAD_INVALID', 'empty band list is not a target');
  const kg = normalizeLoadTarget({ load: { kind: 'band', role: 'resistance', bands: [band('red')] } }, loadOf(BANDX), 10);
  assert.ok(!kg.ok && kg.code === 'TARGET_LOAD_CONFLICT', 'band target with kg alongside');
  const ver = normalizeLoadTarget({ load: { kind: 'band', role: 'resistance', bands: [{ ...band('red'), catalog: 'other-rev' }] } }, loadOf(BANDX));
  assert.ok(!ver.ok && ver.code === 'TARGET_LOAD_VERSION');
});

await test('normalize: combined keeps mass + band separately; kg is the mass projection; contradictory kg rejected', () => {
  const r = ok(normalizeLoadTarget({ load: { kind: 'combined', mass: { kg: 50 }, band: { role: 'resistance', bands: [band('yellow')] } } }, loadOf(COMBO), 50));
  assert.equal(r.kg, 50);
  assert.equal(r.target?.load.kind, 'combined');
  const c = normalizeLoadTarget({ load: { kind: 'combined', mass: { kg: 50 }, band: { role: 'resistance', bands: [band('yellow')] } } }, loadOf(COMBO), 45);
  assert.ok(!c.ok && c.code === 'TARGET_LOAD_CONFLICT');
  const noMass = normalizeLoadTarget({ load: { kind: 'combined', mass: null, band: { role: 'resistance', bands: [band('yellow')] } } }, loadOf(COMBO));
  assert.ok(!noMass.ok && noMass.code === 'TARGET_LOAD_REQUIRED', 'barbell part is required for this combined contract');
});

await test('normalize: alternative needs a variant; band variant and mass variant', () => {
  const nov = normalizeLoadTarget({ load: { kind: 'band', role: 'resistance', bands: [band('red')] } }, loadOf(ALT));
  assert.ok(!nov.ok && nov.code === 'TARGET_LOAD_REQUIRED');
  const b = ok(normalizeLoadTarget({ variant: 'band', load: { kind: 'band', role: 'resistance', bands: [band('red')] } }, loadOf(ALT)));
  assert.equal(b.target?.variant, 'band');
  /* 무게 변형의 순수 무게는 kg 하나로 접힌다(장비 목표 없음) */
  const m = ok(normalizeLoadTarget({ variant: 'mass', load: { kind: 'mass', kg: 12 } }, loadOf(ALT)));
  assert.equal(m.target, null);
  assert.equal(m.kg, 12);
});

await test('normalize: cable setup kept; dumbbell unequal parts (kg null); pure mass collapses; setup on dumbbell invalid; bodyweight not allowed', () => {
  const s = ok(normalizeLoadTarget({ load: { kind: 'mass', kg: 25, setup: { label: '2층 케이블 왼쪽' } } }, loadOf(CABLE), 25));
  assert.equal(s.target?.load.kind === 'mass' && s.target.load.setup?.key, '2층 케이블 왼쪽');
  const u = ok(normalizeLoadTarget({ load: { kind: 'mass', parts: [{ kg: 12, count: 1, side: 'left' }, { kg: 10, count: 1, side: 'right' }] } }, loadOf(DUMB)));
  assert.equal(u.kg, null);
  assert.equal(u.target?.load.kind === 'mass' && u.target.load.parts?.length, 2);
  const p = ok(normalizeLoadTarget({ load: { kind: 'mass', kg: 14 } }, loadOf(DUMB)));
  assert.equal(p.target, null);
  const su = normalizeLoadTarget({ load: { kind: 'mass', kg: 14, setup: { label: 'x' } } }, loadOf(DUMB));
  assert.ok(!su.ok && su.code === 'TARGET_LOAD_INVALID');
  const bw = normalizeLoadTarget({ load: { kind: 'band', role: 'resistance', bands: [band('red')] } }, loadOf(BW));
  assert.ok(!bw.ok && bw.code === 'TARGET_LOAD_NOT_ALLOWED');
});

await test('read: unknown v / catalog / resolver / shape is unsupported; editable flags follow the frozen contract', () => {
  const t = ok(normalizeLoadTarget({ load: { kind: 'band', role: 'resistance', bands: [band('red')] } }, loadOf(BANDX))).target!;
  assert.deepEqual(readLoadTarget(t), t);
  assert.equal(readLoadTarget({ ...t, v: 2 }), 'unsupported');
  assert.equal(readLoadTarget({ ...t, catalog: 'x' }), 'unsupported');
  assert.equal(readLoadTarget({ ...t, resolver: 99 }), 'unsupported');
  assert.equal(readLoadTarget('band'), 'unsupported');
  assert.equal(readLoadTarget(null), null);
  assert.equal(editableOf(BANDX).load, true);
  assert.equal(editableOf(COMBO).load, true);
  assert.equal(editableOf(CABLE).load, true);
  assert.equal(editableOf(DUMB).load, true);
  assert.equal(editableOf(BW).load ?? false, false);
  assert.equal(editableOf(PROG).load ?? false, false, 'program slot locks the load target');
  assert.equal(editableOf(ex({ id: 'ex-bar', equipment: ['바벨'] })).load ?? false, false, 'plain barbell: numeric kg only');
});

await test('draft precedence: in-progress draft > explicit target > device memory > previous set', () => {
  assert.equal(pickLoadDraftSource({ touched: true, target: true, memory: true, previous: true }), 'draft');
  assert.equal(pickLoadDraftSource({ touched: false, target: true, memory: true, previous: true }), 'target');
  assert.equal(pickLoadDraftSource({ touched: false, target: false, memory: true, previous: true }), 'memory');
  assert.equal(pickLoadDraftSource({ touched: false, target: false, memory: false, previous: true }), 'previous');
  assert.equal(pickLoadDraftSource({ touched: false, target: false, memory: false, previous: false }), 'empty');
  const t = ok(normalizeLoadTarget({ load: { kind: 'combined', mass: { kg: 50 }, band: { role: 'resistance', bands: [band('yellow'), band('red')] } } }, loadOf(COMBO))).target!;
  const s = seedOfLoadTarget(t);
  assert.equal(s.role, 'resistance');
  assert.equal(s.bands.length, 2);
  assert.equal(s.kg, 50);
  const u = ok(normalizeLoadTarget({ load: { kind: 'mass', parts: [{ kg: 12, count: 1, side: 'left' }, { kg: 10, count: 1, side: 'right' }] } }, loadOf(DUMB))).target!;
  const su = seedOfLoadTarget(u);
  assert.ok(su.unequal && su.leftKg === 12 && su.rightKg === 10 && su.kg === null);
});

await test('pure check (client preview == server rule): absent keeps, null without loadV rejected, pain rejects any band change', () => {
  const rec = recommendedOf(BANDX, 90);
  const t = ok(normalizeLoadTarget({ load: { kind: 'band', role: 'resistance', bands: [band('red')] } }, loadOf(BANDX))).target!;
  const keep = checkTargetInput({ sets: 2 }, BANDX, rec, { painToday: false, prevLoad: t });
  assert.ok(keep.ok && sameLoadTarget(keep.target?.load, t), 'absent load keeps');
  const bad = checkTargetInput({ load: null }, BANDX, rec, { painToday: false, prevLoad: t });
  assert.ok(!bad.ok && bad.code === 'TARGET_LOAD_VERSION');
  const pain = checkTargetInput({ loadV: 1, load: { load: { kind: 'band', role: 'resistance', bands: [band('tan')] } } }, BANDX, rec, { painToday: true, prevLoad: t });
  assert.ok(!pain.ok && pain.code === 'PAIN_NO_INCREASE', 'tan is not inferred to be easier than red');
  const clearPain = checkTargetInput({ loadV: 1, load: null }, BANDX, rec, { painToday: true, prevLoad: t });
  assert.ok(clearPain.ok && clearPain.target === null, 'clearing is allowed under pain');
});

await test('v2 patch builder: old numeric-only reset keeps load; modern clear is reset+loadV; load set rides with numerics', () => {
  assert.deepEqual(patchOfTargetInput(null), { reset: true });
  assert.deepEqual(patchOfTargetInput({ sets: null, reps: null, kg: null }), { reset: true });
  assert.deepEqual(patchOfTargetInput({ sets: null, loadV: 1, load: null }), { reset: true, loadV: 1 });
  const p = patchOfTargetInput({ sets: 2, kg: null, loadV: 1, load: { load: { kind: 'band' } } });
  assert.deepEqual(p.fields?.sets, { set: 2 });
  assert.deepEqual(p.fields?.kg, { follow: true });
  assert.ok(p.fields?.load && 'set' in p.fields.load);
  assert.equal(p.loadV, 1);
});

/* ─────────────────────────── 2) 격리 DB ─────────────────────────── */

const pg = await PGlite.create();
await pg.exec(execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
await pg.exec(readFileSync('prisma/pending-migrations/20261113120000_workout_v2_foundation/migration.sql', 'utf8'));
await pg.exec(readFileSync('prisma/pending-migrations/20261116150000_ex_load01_recording_contract/migration.sql', 'utf8'));
const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await socket.start();
const port = (socket as unknown as { server: { address(): { port: number } } }).server.address().port;
const url = `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
assert.ok(url.includes('127.0.0.1'), 'isolated local socket only');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
const tdb = db as unknown as TargetEditDb;
const cdb = db as unknown as CommandDb;
const deps = { libraryRestOf: async () => 90, now: () => new Date('2026-11-12T02:00:00Z') };

let opn = 0;
const op = () => `op_ldtg_${String(++opn).padStart(10, '0')}`;

function plan(exercises: FrozenExercise[]): FrozenPlan & Record<string, unknown> {
  return { themeKey: 'upper', themeLabel: '상체', goal: null, exercises, keepTop: 'yes' } as unknown as FrozenPlan & Record<string, unknown>;
}

async function rawPlan(sessionId: string): Promise<RawPlan> {
  const r = await db.trainingSession.findUnique({ where: { id: sessionId }, select: { plan: true } });
  return r!.plan as RawPlan;
}
async function exOf(sessionId: string, id: string): Promise<FrozenExercise> {
  return readFrozenPlan(await rawPlan(sessionId))!.exercises.find((e) => e.id === id)!;
}
const viewOf = (e: FrozenExercise, pain = false) => targetView(e, e.restSeconds ?? null, null, [], { painToday: pain });
async function setRows(sessionId: string) {
  return db.$queryRaw<unknown[]>`SELECT "id","weightKg","reps","holdSeconds","rir","recordVersion","targetRevisionId","load" FROM "UserExerciseSet" WHERE "sessionId" = ${sessionId} ORDER BY "id"`;
}

try {
  const A = await db.user.create({ data: { email: 'a@ldtg.test', nickname: 'A', password: 'x' } });
  const B = await db.user.create({ data: { email: 'b@ldtg.test', nickname: 'B', password: 'x' } });
  const mk = (userId: string, day: string, exercises: FrozenExercise[]) =>
    db.trainingSession.create({
      data: { userId, date: new Date(`${day}T00:00:00.000Z`), themeKey: 'upper', plan: plan(exercises) as object, status: 'ACTIVE', startedAt: new Date(`${day}T01:00:00Z`) },
    });

  /* ── r1 ── */
  const S = await mk(A.id, '2026-11-12', ALL);
  /* 이미 남긴 세트(한 것) — 목표를 바꿔도 그대로여야 한다 */
  await db.userExerciseSet.create({ data: { sessionId: S.id, userId: A.id, exerciseId: COMBO.id, date: S.date, setNo: 1, weightKg: 40, reps: 8 } });
  await db.userExerciseSet.create({ data: { sessionId: S.id, userId: A.id, exerciseId: BANDX.id, date: S.date, setNo: 1, reps: 12 } });
  const setsBefore = JSON.stringify(await setRows(S.id));
  const save = (exerciseId: string, target: unknown, userId = A.id, sessionId = S.id) => editSessionTarget(tdb, userId, { sessionId, exerciseId, target: target as never }, deps);

  const yellow = { load: { kind: 'band', role: 'resistance', bands: [band('yellow')] } };
  await test('r1 save → reload → view: band target persisted in plan JSON, no kg, target load shown', async () => {
    const r = await save(BANDX.id, { sets: 4, loadV: 1, load: yellow });
    assert.ok(r.ok, JSON.stringify(r));
    const e = await exOf(S.id, BANDX.id);
    const stored = readLoadTarget(e.userTarget?.load);
    assert.ok(stored && stored !== 'unsupported' && stored.load.kind === 'band');
    assert.equal(e.userTarget?.kg, undefined);
    assert.equal(e.userTarget?.sets, 4);
    const v = viewOf(e);
    assert.equal(v.view.override?.load?.load.kind, 'band');
    assert.ok(sameLoadTarget(v.targetLoad, stored));
    assert.equal(v.view.effective.load?.load.kind, 'band');
    assert.equal(v.view.recommended.load ?? null, null, 'no band recommendation exists');
    assert.equal((await rawPlan(S.id)).keepTop, 'yes', 'unknown top-level plan keys preserved');
  });

  await test('r1 reopen (mergeReopened) keeps the load target with the exercise', async () => {
    const kept = readFrozenPlan(await rawPlan(S.id))!;
    const merged = mergeReopened(kept, plan([{ ...BANDX }]));
    const e = merged.exercises.find((x) => x.id === BANDX.id)!;
    assert.ok(readLoadTarget(e.userTarget?.load) !== null);
  });

  await test('r1 correct: role/series change, multiple + custom bands', async () => {
    const r = await save(BANDX.id, { sets: 4, loadV: 1, load: { load: { kind: 'band', role: 'assistance', bands: [band('red'), band('green'), custom] } } });
    assert.ok(r.ok, JSON.stringify(r));
    const t = readLoadTarget((await exOf(S.id, BANDX.id)).userTarget?.load) as LoadTarget;
    assert.ok(t.load.kind === 'band' && t.load.role === 'assistance' && t.load.bands.length === 3);
    assert.ok(t.load.kind === 'band' && 'custom' in t.load.bands[2]);
  });

  await test('r1 old client: numeric-only save and whole reset keep the band target verbatim', async () => {
    const before = (await exOf(S.id, BANDX.id)).userTarget?.load;
    const r = await save(BANDX.id, { sets: 2, reps: null, holdSeconds: null, restSeconds: null, kg: null });
    assert.ok(r.ok, JSON.stringify(r));
    let e = await exOf(S.id, BANDX.id);
    assert.ok(sameLoadTarget(e.userTarget?.load, before), 'numeric-only save keeps load');
    assert.equal(e.userTarget?.sets, 2);
    const reset = await save(BANDX.id, null);
    assert.ok(reset.ok);
    e = await exOf(S.id, BANDX.id);
    assert.ok(sameLoadTarget(e.userTarget?.load, before), 'old reset keeps load');
    assert.equal(e.userTarget?.sets, undefined, 'old reset still clears numeric fields');
  });

  await test('r1 clear: null without loadV rejected without a write; loadV:1 + null clears', async () => {
    const at = (await db.trainingSession.findUnique({ where: { id: S.id } }))!.updatedAt.getTime();
    const bad = await save(BANDX.id, { load: null });
    assert.ok(!bad.ok && bad.code === 'TARGET_LOAD_VERSION');
    assert.equal((await db.trainingSession.findUnique({ where: { id: S.id } }))!.updatedAt.getTime(), at, 'no write');
    const v2 = await save(BANDX.id, { loadV: 2, load: yellow });
    assert.ok(!v2.ok && v2.code === 'TARGET_LOAD_VERSION', 'unknown target protocol version');
    const cl = await save(BANDX.id, { loadV: 1, load: null });
    assert.ok(cl.ok);
    assert.equal((await exOf(S.id, BANDX.id)).userTarget, undefined);
  });

  await test('r1 combined: save with projected kg; contradictory kg rejected; old-client kg patch updates mass, keeps band', async () => {
    const combo = { load: { kind: 'combined', mass: { kg: 50 }, band: { role: 'resistance', bands: [band('yellow')] } } };
    const conflict = await save(COMBO.id, { kg: 45, loadV: 1, load: combo });
    assert.ok(!conflict.ok && conflict.code === 'TARGET_LOAD_CONFLICT');
    const r = await save(COMBO.id, { kg: 50, loadV: 1, load: combo });
    assert.ok(r.ok, JSON.stringify(r));
    let e = await exOf(S.id, COMBO.id);
    assert.equal(e.userTarget?.kg, 50, 'legacy kg = mass projection');
    const old = await save(COMBO.id, { kg: 55 });
    assert.ok(old.ok, JSON.stringify(old));
    e = await exOf(S.id, COMBO.id);
    const t = readLoadTarget(e.userTarget?.load) as LoadTarget;
    assert.ok(t.load.kind === 'combined' && t.load.mass?.kg === 55 && t.load.band.bands.length === 1);
    assert.equal(e.userTarget?.kg, 55);
    /* 옛 화면이 빈 kg(따름)를 보내도 섞인 목표의 무게는 그대로(모호한 신호로 현대 목표를 바꾸지 않는다) */
    const empty = await save(COMBO.id, { sets: 3, kg: null });
    assert.ok(empty.ok);
    e = await exOf(S.id, COMBO.id);
    assert.equal((readLoadTarget(e.userTarget?.load) as LoadTarget).load.kind, 'combined');
    assert.equal(e.userTarget?.kg, 55);
  });

  await test('r1 unequal parts: saved with no kg; old-client kg patch over unequal parts → conflict', async () => {
    const r = await save(DUMB.id, { loadV: 1, load: { load: { kind: 'mass', parts: [{ kg: 12, count: 1, side: 'left' }, { kg: 10, count: 1, side: 'right' }] } } });
    assert.ok(r.ok, JSON.stringify(r));
    const e = await exOf(S.id, DUMB.id);
    assert.equal(e.userTarget?.kg, undefined);
    const k = await save(DUMB.id, { kg: 14 });
    assert.ok(!k.ok && k.code === 'TARGET_LOAD_CONFLICT');
  });

  await test('r1 cable setup; then a pure-mass load target collapses to numeric kg only', async () => {
    const r = await save(CABLE.id, { kg: 25, loadV: 1, load: { load: { kind: 'mass', kg: 25, setup: { label: '2층 케이블 왼쪽' } } } });
    assert.ok(r.ok, JSON.stringify(r));
    let e = await exOf(S.id, CABLE.id);
    assert.equal((readLoadTarget(e.userTarget?.load) as LoadTarget).load.kind, 'mass');
    const c = await save(CABLE.id, { kg: 22, loadV: 1, load: { load: { kind: 'mass', kg: 22 } } });
    assert.ok(c.ok);
    e = await exOf(S.id, CABLE.id);
    assert.equal(e.userTarget?.load, undefined);
    assert.equal(e.userTarget?.kg, 22);
  });

  await test('r1 alternative variant; bodyweight and program-locked load targets refused without a write', async () => {
    const r = await save(ALT.id, { loadV: 1, load: { variant: 'band', load: { kind: 'band', role: 'resistance', bands: [band('blue')] } } });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((readLoadTarget((await exOf(S.id, ALT.id)).userTarget?.load) as LoadTarget).variant, 'band');
    /* 밴드 변형 목표 위의 옛 kg — 조용히 무게 변형으로 바꾸지 않는다 */
    const k = await save(ALT.id, { kg: 14 });
    assert.ok(!k.ok && k.code === 'TARGET_LOAD_CONFLICT');
    const bw = await save(BW.id, { loadV: 1, load: yellow });
    assert.ok(!bw.ok && bw.code === 'TARGET_LOAD_NOT_ALLOWED');
    const pr = await save(PROG.id, { loadV: 1, load: yellow });
    assert.ok(!pr.ok && /프로그램/.test(pr.error));
    assert.equal((await exOf(S.id, PROG.id)).userTarget, undefined);
  });

  await test('r1 unsupported stored version: preserved on numeric saves, not applied, shown as unsupported; explicit clear removes', async () => {
    const raw = await rawPlan(S.id);
    const foreign = { v: 2, resolver: 1, catalog: 'future', variant: null, load: { kind: 'band', role: 'resistance', bands: [{ future: true }] } };
    const exs = (raw.exercises as Record<string, unknown>[]).map((e) => (e.id === BANDX.id ? { ...e, userTarget: { load: foreign, at: 'x' } } : e));
    await db.trainingSession.update({ where: { id: S.id }, data: { plan: { ...raw, exercises: exs } as object } });
    const r = await save(BANDX.id, { sets: 5 });
    assert.ok(r.ok, JSON.stringify(r));
    const e = await exOf(S.id, BANDX.id);
    assert.deepEqual(e.userTarget?.load, foreign, 'verbatim');
    const v = viewOf(e);
    assert.equal(v.view.loadUnsupported, true);
    assert.equal(v.view.override?.load, undefined);
    assert.equal(v.targetLoad, null);
    const old = await save(BANDX.id, null);
    assert.ok(old.ok);
    assert.deepEqual((await exOf(S.id, BANDX.id)).userTarget?.load, foreign, 'old reset keeps it too');
    const cl = await save(BANDX.id, { loadV: 1, load: null });
    assert.ok(cl.ok);
    assert.equal((await exOf(S.id, BANDX.id)).userTarget, undefined);
  });

  await test('r1 ownership: another user cannot read or write the target', async () => {
    const r = await save(BANDX.id, { loadV: 1, load: yellow }, B.id);
    assert.ok(!r.ok);
    assert.equal((await exOf(S.id, BANDX.id)).userTarget, undefined);
  });

  await test('r1 pain: band change rejected (no colour ordering), clear allowed, stored band paused on read and kept on save', async () => {
    const r = await save(BANDX.id, { loadV: 1, load: { load: { kind: 'band', role: 'resistance', bands: [band('red')] } } });
    assert.ok(r.ok);
    await db.dailyCheckin.create({ data: { userId: A.id, date: S.date, shoulder: '통증', elbow: '정상', condition: 5, sleep: '보통' } as never });
    const tan = await save(BANDX.id, { loadV: 1, load: { load: { kind: 'band', role: 'resistance', bands: [band('tan')] } } });
    assert.ok(!tan.ok && tan.code === 'PAIN_NO_INCREASE');
    const e = await exOf(S.id, BANDX.id);
    const v = viewOf(e, true);
    assert.equal(v.view.painPaused?.load?.load.kind, 'band', 'paused, not deleted');
    assert.equal(v.targetLoad, null, 'paused target does not initialize the next set');
    const rest = await save(BANDX.id, { restSeconds: 60 });
    assert.ok(rest.ok, JSON.stringify(rest));
    assert.equal((readLoadTarget((await exOf(S.id, BANDX.id)).userTarget?.load) as LoadTarget).load.kind, 'band', 'kept across a pain-day save');
    /* 섞인 목표(밴드)는 kg 투영이 추천보다 커도 바꾸지 않은 채 저장된다 */
    const combo = await save(COMBO.id, { sets: 2 });
    assert.ok(combo.ok, JSON.stringify(combo));
    /* 무게 목표는 추천 이하만 */
    const up = await save(CABLE.id, { kg: 30, loadV: 1, load: { load: { kind: 'mass', kg: 30, setup: { label: '2층' } } } });
    assert.ok(!up.ok);
    const down = await save(CABLE.id, { kg: 15, loadV: 1, load: { load: { kind: 'mass', kg: 15, setup: { label: '2층' } } } });
    assert.ok(down.ok, JSON.stringify(down));
    const clear = await save(BANDX.id, { loadV: 1, load: null });
    assert.ok(clear.ok);
    await db.dailyCheckin.deleteMany({ where: { userId: A.id } });
  });

  await test('r1 completed actual sets never change through any target edit', async () => {
    assert.equal(JSON.stringify(await setRows(S.id)), setsBefore);
  });

  /* ── v2 ── */
  const legacyCombo = { ...COMBO, userTarget: { kg: 50, load: ok(normalizeLoadTarget({ load: { kind: 'combined', mass: { kg: 50 }, band: { role: 'resistance', bands: [band('yellow')] } } }, loadOf(COMBO))).target, at: 'old' } };
  const foreign = { v: 9, resolver: 1, catalog: 'later', variant: null, load: { kind: 'band' } };
  const legacyBand = { ...BANDX, userTarget: { load: foreign, at: 'old' } };
  const V = await mk(A.id, '2026-11-13', [legacyCombo as unknown as FrozenExercise, legacyBand as unknown as FrozenExercise, DUMB, PROG]);
  const run = (type: CommandType, payload: unknown, extra: { operationId?: string; ownerId?: string } = {}) =>
    execute(cdb, { actorId: extra.ownerId ?? A.id, ownerId: extra.ownerId ?? A.id, operationId: extra.operationId ?? op(), type, sessionId: V.id, payload, runGeneration: null, loadStructured: true });
  let entries: string[] = [];
  const rev = async (entryId: string) => readPlanV2(await rawPlan(V.id))!.entries[entryId].currentRevisionId!;
  const snap = async (entryId: string) => {
    const r = await db.$queryRaw<{ snapshot: { override: Record<string, unknown> | null }; changedFields: string[] }[]>`SELECT "snapshot", "changedFields" FROM "WorkoutTargetRevision" WHERE "id" = ${await rev(entryId)}`;
    return r[0];
  };
  const userTargetOf = async (exerciseId: string) => ((await rawPlan(V.id)).exercises as Record<string, unknown>[]).find((e) => e.id === exerciseId)!.userTarget as Record<string, unknown> | undefined;

  await test('v2 promote carries r1 load targets (supported and unsupported) into the baseline revision', async () => {
    const r = await run('session.promote', {});
    assert.equal(r.code, 'APPLIED', JSON.stringify(r));
    entries = ((await rawPlan(V.id)).exercises as { entryId: string }[]).map((e) => e.entryId);
    const c = await snap(entries[0]);
    assert.ok(sameLoadTarget(c.snapshot.override?.load, legacyCombo.userTarget.load));
    assert.deepEqual((await snap(entries[1])).snapshot.override?.load, foreign);
    assert.deepEqual((await userTargetOf(BANDX.id))?.load, foreign, 'mirror keeps the raw value');
  });

  let recorded = '';
  await test('v2 set.record before target edits (actual set to compare later)', async () => {
    const r = await run('set.record', {
      clientSetId: 'cs_ldtg_aaaaaaaaaaa1',
      entryId: entries[0],
      plannedSetKey: null,
      targetRevisionId: null,
      values: { weightKg: 40, reps: 8, holdSeconds: null },
      performedAt: '2026-11-13T01:10:00Z',
      loadSnapshot: snapshotOf({ load: { kind: 'combined', mass: { basis: 'barbellTotal', apparatusFamily: null, setup: null, kg: 40, parts: null }, band: { role: 'resistance', bands: [{ catalog: BAND_CATALOG_REVISION, seriesId: SERIES, levelId: `${SERIES}:yellow`, label: { ko: '노랑', en: 'Yellow', ja: '黄' }, swatch: null }] } }, status: 'ok', contract: loadOf(COMBO), variant: null, provenance: 'test' }),
    });
    assert.equal(r.code, 'APPLIED', JSON.stringify(r));
    recorded = JSON.stringify(await setRows(V.id));
  });

  await test('v2 target.patch: load set needs loadV; band role change saved; mirror + changedFields; stale revision → CONFLICT', async () => {
    const base = await rev(entries[0]);
    const noV = await run('target.patch', { entryId: entries[0], expectedRevisionId: base, patch: { fields: { load: { set: { load: { kind: 'combined', mass: { kg: 50 }, band: { role: 'resistance', bands: [band('red')] } } } } } } });
    assert.equal(noV.code, 'INVALID');
    assert.equal(noV.conflict, 'TARGET_LOAD_VERSION');
    const r = await run('target.patch', {
      entryId: entries[0],
      expectedRevisionId: base,
      patch: { loadV: 1, fields: { load: { set: { load: { kind: 'combined', mass: { kg: 50 }, band: { role: 'resistance', bands: [band('red'), band('green')] } } } } } },
    });
    assert.equal(r.code, 'APPLIED', JSON.stringify(r));
    const s = await snap(entries[0]);
    assert.ok(s.changedFields.includes('load'));
    const t = readLoadTarget(s.snapshot.override?.load) as LoadTarget;
    assert.ok(t.load.kind === 'combined' && t.load.band.bands.length === 2);
    assert.ok(sameLoadTarget((await userTargetOf(COMBO.id))?.load, s.snapshot.override?.load), 'userTarget mirror in the same transaction');
    const stale = await run('target.patch', { entryId: entries[0], expectedRevisionId: base, patch: { loadV: 1, fields: { load: { follow: true } } } });
    assert.equal(stale.code, 'CONFLICT');
    assert.equal(stale.conflict, 'STALE_TARGET');
  });

  await test('v2 old-client kg over uniform combined mass keeps band; reset without loadV keeps load; reset+loadV clears', async () => {
    const k = await run('target.patch', { entryId: entries[0], expectedRevisionId: await rev(entries[0]), patch: { fields: { kg: { set: 60 } } } });
    assert.equal(k.code, 'APPLIED', JSON.stringify(k));
    let t = readLoadTarget((await snap(entries[0])).snapshot.override?.load) as LoadTarget;
    assert.ok(t.load.kind === 'combined' && t.load.mass?.kg === 60 && t.load.band.bands.length === 2);
    assert.equal((await snap(entries[0])).snapshot.override?.kg, 60);
    const reset = await run('target.patch', { entryId: entries[0], expectedRevisionId: await rev(entries[0]), patch: { reset: true } });
    assert.ok(reset.code === 'APPLIED' || reset.code === 'NO_CHANGE', JSON.stringify(reset));
    t = readLoadTarget((await snap(entries[0])).snapshot.override?.load) as LoadTarget;
    assert.equal(t.load.kind, 'combined', 'old reset keeps the load target');
    const clear = await run('target.patch', { entryId: entries[0], expectedRevisionId: await rev(entries[0]), patch: { reset: true, loadV: 1 } });
    assert.equal(clear.code, 'APPLIED', JSON.stringify(clear));
    assert.equal((await snap(entries[0])).snapshot.override, null);
    assert.equal(await userTargetOf(COMBO.id), undefined);
  });

  await test('v2 unequal + kg patch conflict; program slot refused; unsupported preserved through numeric patch', async () => {
    const dumb = entries[2];
    const u = await run('target.patch', { entryId: dumb, expectedRevisionId: await rev(dumb), patch: { loadV: 1, fields: { load: { set: { load: { kind: 'mass', parts: [{ kg: 12, count: 1, side: 'left' }, { kg: 10, count: 1, side: 'right' }] } } } } } });
    assert.equal(u.code, 'APPLIED', JSON.stringify(u));
    const k = await run('target.patch', { entryId: dumb, expectedRevisionId: await rev(dumb), patch: { fields: { kg: { set: 14 } } } });
    assert.equal(k.code, 'INVALID');
    assert.equal(k.conflict, 'TARGET_LOAD_CONFLICT');
    const prog = await run('target.patch', { entryId: entries[3], expectedRevisionId: await rev(entries[3]), patch: { loadV: 1, fields: { load: { set: yellow } } } });
    assert.equal(prog.code, 'INVALID');
    assert.equal(prog.conflict, 'TARGET_LOAD_NOT_ALLOWED');
    const n = await run('target.patch', { entryId: entries[1], expectedRevisionId: await rev(entries[1]), patch: { fields: { sets: { set: 2 } } } });
    assert.equal(n.code, 'APPLIED', JSON.stringify(n));
    assert.deepEqual((await snap(entries[1])).snapshot.override?.load, foreign, 'unsupported value preserved');
    assert.equal(activeOverride((await snap(entries[1])).snapshot.override as never, recommendedOf(BANDX, 90), 'clear').active?.load, undefined, 'not applied');
  });

  await test('v2 pain: band change rejected with field load; clear allowed; unchanged band re-saved with rest; active pauses band', async () => {
    const be = entries[1];
    const set = await run('target.patch', { entryId: be, expectedRevisionId: await rev(be), patch: { loadV: 1, fields: { load: { set: { load: { kind: 'band', role: 'resistance', bands: [band('red')] } } } } } });
    assert.equal(set.code, 'APPLIED', JSON.stringify(set));
    await db.dailyCheckin.create({ data: { userId: A.id, date: V.date, shoulder: '정상', elbow: '통증', condition: 5, sleep: '보통' } as never });
    const up = await run('target.patch', { entryId: be, expectedRevisionId: await rev(be), patch: { loadV: 1, fields: { load: { set: { load: { kind: 'band', role: 'resistance', bands: [band('tan')] } } } } } });
    assert.equal(up.conflict, 'PAIN_NO_INCREASE');
    assert.equal(up.field, 'load');
    const rest = await run('target.patch', { entryId: be, expectedRevisionId: await rev(be), patch: { fields: { restSeconds: { set: 60 } } } });
    assert.equal(rest.code, 'APPLIED', JSON.stringify(rest));
    const res = rest.result as { active: Record<string, unknown> | null; paused: Record<string, unknown> | null };
    assert.equal((res.paused?.load as { load: { kind: string } }).load.kind, 'band', 'paused, not deleted');
    assert.equal(res.active?.load, undefined);
    const cl = await run('target.patch', { entryId: be, expectedRevisionId: await rev(be), patch: { loadV: 1, fields: { load: { follow: true } } } });
    assert.equal(cl.code, 'APPLIED', JSON.stringify(cl));
    await db.dailyCheckin.deleteMany({ where: { userId: A.id } });
  });

  await test('v2 reopen carries the load target into the continuation revision; other owner cannot patch', async () => {
    const dumb = entries[2];
    const before = (await snap(dumb)).snapshot.override?.load;
    assert.equal((await run('session.abandon', {})).code, 'APPLIED');
    const re = await run('session.reopen', {});
    assert.equal(re.code, 'APPLIED', JSON.stringify(re));
    assert.ok(sameLoadTarget((await snap(dumb)).snapshot.override?.load, before));
    const other = await run('target.patch', { entryId: dumb, expectedRevisionId: await rev(dumb), patch: { loadV: 1, fields: { load: { follow: true } } } }, { ownerId: B.id });
    assert.equal(other.code, 'NOT_FOUND');
  });

  await test('v2 target edits never changed the completed actual set', async () => {
    assert.equal(JSON.stringify(await setRows(V.id)), recorded);
  });

  await test('integration: band-only correction bumps recordVersion (APPLIED); stale same-version correction then conflicts', async () => {
    const red = snapshotOf({ load: { kind: 'combined', mass: { basis: 'barbellTotal', apparatusFamily: null, setup: null, kg: 40, parts: null }, band: { role: 'resistance', bands: [{ catalog: BAND_CATALOG_REVISION, seriesId: SERIES, levelId: `${SERIES}:red`, label: { ko: '빨강', en: 'Red', ja: '赤' }, swatch: null }] } }, status: 'ok', contract: loadOf(COMBO), variant: null, provenance: 'device-a' });
    const a = await run('set.correct', { clientSetId: 'cs_ldtg_aaaaaaaaaaa1', expectedRecordVersion: 0, fields: {}, loadSnapshot: red });
    assert.equal(a.code, 'APPLIED', JSON.stringify(a));
    assert.equal((a.result as { recordVersion: number }).recordVersion, 1);
    const same = await run('set.correct', { clientSetId: 'cs_ldtg_aaaaaaaaaaa1', expectedRecordVersion: 1, fields: {}, loadSnapshot: { ...red, provenance: 'device-a-resend' } });
    assert.equal(same.code, 'NO_CHANGE', 'same meaning (provenance differs) is not a change');
    const green = { ...red, value: { ...red.value, band: { role: 'resistance', bands: [] } } };
    const stale = await run('set.correct', { clientSetId: 'cs_ldtg_aaaaaaaaaaa1', expectedRecordVersion: 0, fields: {}, loadSnapshot: green });
    assert.equal(stale.code, 'CONFLICT');
    const resend = await run('set.record', {
      clientSetId: 'cs_ldtg_aaaaaaaaaaa1',
      entryId: entries[0],
      plannedSetKey: null,
      targetRevisionId: null,
      values: { weightKg: 40, reps: 8, holdSeconds: null },
      performedAt: '2026-11-13T01:10:00Z',
      loadSnapshot: green,
    });
    assert.notEqual(resend.code, 'NO_CHANGE', 'a different band under the same set id is not a silent resend');
  });
} finally {
  await db.$disconnect();
  await socket.stop();
  await pg.close();
}

if (failures.length) {
  console.error(`load-r1-target: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log(`load-r1-target: ${passed} passed (pure + isolated PGlite; multi-connection lock races NOT covered)`);
