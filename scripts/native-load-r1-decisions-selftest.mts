/**
 * EX-LOAD01-R1 — GPT 가 받아들인 목표 결정 둘을 실제 코드로 고정한다(순수 — DB · 네트워크 없음).
 *
 * (1) 계약이 역할을 정하지 않은 밴드 운동에서 '역할 모름' + 알려진 밴드 목표는 받는다. 목표 → 다음 세트 칸(웹 · 앱) → 남긴 세트까지
 *     '모름'으로 그대로 가고, 견줌 · 진행 열쇠를 만들지 않으며 저항 · 보조로 짐작하지 않는다. 밴드 정체를 모르는(빈) 목표는 여전히 거절.
 *     통증 · 프로그램 막기는 그대로.
 * (2) 옛 앱의 빈 kg(null · v2 follow)은 저장된 구조화 목표(섞임 · 양손 · 기구 이름)를 지우지 않는다. 지우는 것은 지원되는 명시적 지움
 *     (loadV 1)뿐. 비지 않은 kg 고침은 하나뿐인 무게 성분 규칙 · 충돌 검사를 지난다.
 *
 * 실행: node --import ./scripts/native-test-register.mjs scripts/native-load-r1-decisions-selftest.mts
 */
import assert from 'node:assert/strict';
import { resolveRecordingContract, type RecordingContract } from '@/lib/workout/load/contract';
import { BAND_CATALOG_REVISION, BAND_SERIES, bandComparisonKey, type BandComponent } from '@/lib/workout/load/band-catalog';
import { normalizeSetLoad, type RecordedLoad } from '@/lib/workout/load/recorded';
import { LOAD_PROTOCOL } from '@/lib/workout/load/protocol';
import { snapshotOf } from '@/lib/workout/load/snapshot';
import { viewSetLoad } from '@/lib/workout/load/gate';
import { normalizeLoadTarget, seedOfLoadTarget, type LoadTarget } from '@/lib/workout/load/target';
import { checkTargetInput, type TargetSubject, type TargetValues } from '@/lib/workout/target-override';
import { applyTargetPatch } from '@/lib/workout/v2/revision';
import type { FrozenExercise } from '@/lib/workout/session-plan';
import { buildSetLoad as buildWeb } from '@/components/load/set-load';
import { buildSetLoad as buildNative, loadDraftOfTarget } from '~/workout/load-model';

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${(e as Error).stack?.split('\n').slice(0, 4).join('\n      ')}`);
  }
}

const LATEX = BAND_SERIES.find((s) => s.id === 'theraband-professional-latex-band')!;
const band = (color: string): BandComponent => {
  const lv = LATEX.levels.find((l) => l.id.endsWith(':' + color))!;
  return { catalog: BAND_CATALOG_REVISION, seriesId: LATEX.id, levelId: lv.id, label: lv.label, swatch: lv.swatch };
};
const BAND = resolveRecordingContract({ equipment: ['밴드'] });
const CABLE = resolveRecordingContract({ equipment: ['케이블'] });
const DB = resolveRecordingContract({ equipment: ['덤벨'] });
const COMB = resolveRecordingContract({ equipment: ['바벨', '밴드'], overrides: { use: 'combined', bandRole: 'resistance' } });
const REC: TargetValues = { sets: 3, reps: 10, holdSeconds: null, restSeconds: 90, kg: null };
const subject = (c: RecordingContract, extra: Partial<TargetSubject> = {}): TargetSubject => ({
  category: '상체 스트렝스',
  isHold: false,
  perSide: false,
  needsWeight: false,
  equipment: c.sourceEquipment,
  load: c,
  ...extra,
});
const frozen = (c: RecordingContract, extra: Partial<FrozenExercise> = {}) =>
  ({ id: 'synthetic', title: 't', category: '상체 스트렝스', slot: 'main', prescription: null, plannedSets: 3, plannedReps: 10, plannedHoldSeconds: null, perSide: false, needsWeight: false, isHold: false, equipment: c.sourceEquipment, bodyParts: [], intensity: '보통', thumbPath: null, load: c, ...extra }) as unknown as FrozenExercise;
const ok = <T,>(r: { ok: boolean } & T) => {
  assert.ok(r.ok, JSON.stringify(r));
  return r;
};

console.log('EX-LOAD01-R1 accepted target decisions');

/* ── (1) 역할 모름 + 알려진 밴드 ── */
test('(1) contract does not fix the role; unknown role + known band target is accepted and stays unknown', () => {
  assert.equal(BAND.bandRole, null);
  const r = normalizeLoadTarget({ load: { kind: 'band', role: 'unknown', bands: [band('red')] } }, BAND);
  assert.ok(r.ok, JSON.stringify(r));
  const t = (r as { target: LoadTarget }).target;
  assert.equal(t.load.kind, 'band');
  assert.equal((t.load as Extract<RecordedLoad, { kind: 'band' }>).role, 'unknown', 'never inferred as resistance/assistance');
  assert.equal(r.kg, null, 'no invented kg for a band');
});

test('(1) unknown/empty band identity is still invalid (no target without a band)', () => {
  const r = normalizeLoadTarget({ load: { kind: 'band', role: 'unknown', bands: [] } }, BAND);
  assert.ok(!r.ok);
});

test('(1) unknown role flows target → web draft → actual set and target → native draft → actual set unchanged', () => {
  const t = (normalizeLoadTarget({ load: { kind: 'band', role: 'unknown', bands: [band('red')] } }, BAND) as { target: LoadTarget }).target;
  const seed = seedOfLoadTarget(t);
  assert.equal(seed.role, 'unknown');
  const web = ok(buildWeb({ contract: BAND, structured: true, weightKg: null, draft: { variant: seed.variant, role: seed.role, bands: seed.bands, setupLabel: seed.setupLabel, unequal: seed.unequal, leftKg: seed.leftKg, rightKg: seed.rightKg } as never }) as { ok: true; load?: unknown });
  const nd = loadDraftOfTarget(t, 'kg')!;
  assert.equal(nd.role, 'unknown');
  const nat = ok(buildNative({ contract: BAND, draft: nd, structured: true, kg: null, unit: 'kg' }) as { ok: true; load?: unknown });
  for (const built of [web, nat]) {
    const n = normalizeSetLoad({ hasProtocol: true, protocol: LOAD_PROTOCOL, resolver: 1, contract: BAND, weightKg: null, hasLoad: true, load: built.load, structured: true });
    assert.ok(n.ok, JSON.stringify(n));
    assert.equal(n.load?.kind, 'band');
    assert.equal((n.load as Extract<RecordedLoad, { kind: 'band' }>).role, 'unknown', 'actual keeps unknown');
    assert.equal(n.status, 'ok', 'a known band with unknown role is a recordable set');
  }
});

test('(1) unknown role makes no comparison/progression key (no pooling with resistance or assistance)', () => {
  assert.equal(bandComparisonKey('unknown', [band('red')]), null);
  assert.notEqual(bandComparisonKey('resistance', [band('red')]), null);
  const load: RecordedLoad = { kind: 'band', role: 'unknown', bands: [band('red')] };
  const snap = snapshotOf({ load, status: 'ok', contract: BAND, variant: null, provenance: 'r1-decision' });
  const v = viewSetLoad({ exerciseId: 'x', contract: BAND, evidence: 'contract' }, { weightKg: null, snapshot: snap });
  assert.equal(v.metricKg, null);
  assert.equal(v.key ?? null, null, 'no comparison key');
});

test('(1) pain gate still rejects a new band target (unorderable), unknown role included', () => {
  const r = checkTargetInput({ loadV: 1, load: { load: { kind: 'band', role: 'unknown', bands: [band('red')] } } }, subject(BAND), REC, { painToday: true });
  assert.ok(!r.ok, JSON.stringify(r));
});

test('(1) program lock still rejects a load target', () => {
  const r = checkTargetInput({ loadV: 1, load: { load: { kind: 'band', role: 'unknown', bands: [band('red')] } } }, subject(BAND, { programSlot: { slot: 'x' } }), REC, { painToday: false });
  assert.ok(!r.ok, JSON.stringify(r));
});

/* ── (2) 옛 앱의 빈 kg 은 구조화 목표를 지우지 않는다 ── */
const setupTarget = (normalizeLoadTarget({ load: { kind: 'mass', kg: 30, setup: { label: '2층 케이블 왼쪽' } } }, CABLE) as { target: LoadTarget }).target;
const partsTarget = (normalizeLoadTarget({ load: { kind: 'mass', parts: [{ kg: 12, count: 1, side: 'left' }, { kg: 10, count: 1, side: 'right' }] } }, DB) as { target: LoadTarget }).target;
const combTarget = (normalizeLoadTarget({ load: { kind: 'combined', mass: { kg: 40 }, band: { bands: [band('green')] } } }, COMB) as { target: LoadTarget }).target;

test('(2) fixtures are real structured targets (setup / unequal parts / combined)', () => {
  assert.ok(setupTarget && partsTarget && combTarget);
  assert.equal((setupTarget.load as { setup: { label: string } }).setup.label, '2층 케이블 왼쪽');
});

for (const [name, c, prev] of [
  ['setup', CABLE, setupTarget],
  ['unequal parts', DB, partsTarget],
  ['combined', COMB, combTarget],
] as const) {
  test(`(2) r1: old client blank kg (null, no loadV) keeps the ${name} target`, () => {
    const r = checkTargetInput({ sets: 4, kg: null }, subject(c, { needsWeight: true }), REC, { painToday: false, prevLoad: prev });
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepEqual((r as { target: { load?: unknown } | null }).target?.load, prev);
  });
  test(`(2) r1: whole old reset (null target) keeps the ${name} target`, () => {
    const r = checkTargetInput(null, subject(c, { needsWeight: true }), REC, { painToday: false, prevLoad: prev });
    assert.ok(r.ok, JSON.stringify(r));
    const load = (r as { target: { load?: unknown } | null }).target?.load;
    assert.deepEqual(load, prev);
  });
  test(`(2) r1: explicit supported clear (loadV 1, load null) removes the ${name} target`, () => {
    const r = checkTargetInput({ loadV: 1, load: null }, subject(c, { needsWeight: true }), REC, { painToday: false, prevLoad: prev });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((r as { target: { load?: unknown } | null }).target?.load ?? undefined, undefined);
  });
  test(`(2) v2: kg follow (old client) keeps the ${name} target; reset without loadV keeps; loadV clear removes`, () => {
    const prevO = { load: prev };
    const f = applyTargetPatch(prevO, { fields: { kg: { follow: true } } }, frozen(c, { needsWeight: true }), REC);
    assert.ok(f.ok, JSON.stringify(f));
    assert.deepEqual((f as { override: { load?: unknown } | null }).override?.load, prev);
    const rs = applyTargetPatch(prevO, { reset: true }, frozen(c, { needsWeight: true }), REC);
    assert.ok(rs.ok);
    assert.deepEqual((rs as { override: { load?: unknown } | null }).override?.load, prev);
    const cl = applyTargetPatch(prevO, { loadV: 1, fields: { load: { follow: true } } }, frozen(c, { needsWeight: true }), REC);
    assert.ok(cl.ok);
    assert.equal((cl as { override: { load?: unknown } | null }).override?.load ?? undefined, undefined);
  });
}

test('(2) nonempty kg edit: uniform setup mass updates canonically (setup kept); unequal parts → conflict', () => {
  const up = checkTargetInput({ kg: 35 }, subject(CABLE, { needsWeight: true }), REC, { painToday: false, prevLoad: setupTarget });
  assert.ok(up.ok, JSON.stringify(up));
  const l = (up as unknown as { target: { load: LoadTarget; kg?: number } }).target;
  assert.equal((l.load.load as { kg: number }).kg, 35);
  assert.equal((l.load.load as { setup: { label: string } }).setup.label, '2층 케이블 왼쪽');
  assert.equal(l.kg, 35, 'legacy kg is the projection of the one mass component');
  const conflict = checkTargetInput({ kg: 11 }, subject(DB, { needsWeight: true }), REC, { painToday: false, prevLoad: partsTarget });
  assert.ok(!conflict.ok, JSON.stringify(conflict));
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
