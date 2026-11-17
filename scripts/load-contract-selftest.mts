/**
 * EX-LOAD01 — 장비 기록 계약 · 밴드 · 읽기 관문 · 옛 앱 호환 시험.
 *
 * 1) 순수: 계약 해석 · 호환 투영 · 밴드 카탈로그(계열별) · 정규화(새 앱 · 옛 앱 · 스키마 꺼짐/켜짐 · 엄격한 버전) · 읽기 관문(근거 · 스냅샷 권위 ·
 *    케이블 기구 열쇠) · 기록 모음 · 새 최고 · 대기열 판단.
 * 2) 격리 PGlite(메모리 안 Postgres — 공유 DB 에 연결하지 않는다, DATABASE_URL 을 읽지 않는다):
 *    - 스키마 미적용 DB 에서 꺼짐 길(새 칸 이름 없음)
 *    - 보류 SQL 적용 DB 에서 실제 세트 쓰기 핵심(lib/workout/load/store.ts persistSet — logSet 이 부르는 그 코드)의 한 거래:
 *      정식 세트 · 스냅샷 · 원래 요청 복구, 단계 사이 실패 주입 → 되돌림 · 다시 보내면 하나의 결과
 *    - v2 명령(set.record · set.correct)이 같은 거래에서 복구 · 스냅샷 · 영수증, 실패 주입
 *    - 되돌리기 SQL 리허설
 *    PGlite 는 백엔드 하나라 연결 사이 잠금 경합 · Supabase 거래 풀러는 증명하지 않는다(전달 문서에 '미검증').
 *
 * 실행: node --import ./scripts/alias-register.mjs scripts/load-contract-selftest.mts
 */
import assert from 'node:assert/strict';
import { V2_FIXTURE_SQL, fixtureSchemaSql, legacyLoadClientOptions, removeLoadSchemaFromFixture } from './load-fixture-schema.mts';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { needsWeight, usesWeight } from '@/lib/exercise-meta';
import { weightKindOf } from '@/lib/program/next-weight';
import {
  acceptsMass,
  contractForVariant,
  massFieldLabel,
  resolveRecordingContract,
  type RecordingContract,
} from '@/lib/workout/load/contract';
import { BAND_CATALOG_REVISION, BAND_SERIES, bandComparisonKey, cleanBandComponent, type BandComponent } from '@/lib/workout/load/band-catalog';
import { E1RM_ALLOWLIST } from '@/lib/workout/load/e1rm-allowlist';
import { overridesFor, REVIEWED_INCOMPATIBLE_LOAD } from '@/lib/workout/load/overrides';
import { knownTotalKg, normalizeSetLoad, projectWeightKg, type NormalizeInput, type NormalizeOk, type RecordedLoad } from '@/lib/workout/load/recorded';
import { isIncluded, viewSetLoad, type LoadReadContext } from '@/lib/workout/load/gate';
import { snapshotOf, readSnapshot } from '@/lib/workout/load/snapshot';
import { hasLoadAck, ackOf, LOAD_PROTOCOL, outcomeOf, protocolKind } from '@/lib/workout/load/protocol';
import { contractOfFrozen, contractOfLibraryRow } from '@/lib/workout/load/frozen';
import { checkTargetInput, editableOf, kgEditable, readUserTarget } from '@/lib/workout/target-override';
import { forSummary, forTonnage, gateRows, planContextOf } from '@/lib/workout/load/plan-gate';
import { originalPayloadHash, persistSet, readSnapshotsTx } from '@/lib/workout/load/store';
import { buildExerciseHistory } from '@/lib/workout/history';
import { newRecord } from '@/lib/workout/bests';
import { summarizeSets, totalVolumeKg } from '@/lib/workout/summarize';
import { execute, type CommandDb, type CommandType } from '@/lib/workout/v2/command';
import { readPlanV2, type RawPlan } from '@/lib/workout/v2/plan-v2';

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message.replace(/\n/g, ' ').slice(0, 400) : String(e)}`);
  }
}

/* ─────────────────────────── 표본 ─────────────────────────── */

const POGO = '258c0eee-85fe-46dd-b6a1-d2639bb58345';
const BENCH = 'cc1f99c3-c33b-495c-a0b0-02e1c0387121'; /* 허용 목록 */
const INVERTED_ROW = '92ec03d2-93e6-4d86-ae50-4ae590552a1b';
const WEIGHTED_PUSHUP = 'a2f81d6b-fc34-40b8-a82b-47fb9884c757';
const BAND_DEADLIFT = '50298d2b-fd1f-4265-8b67-e95c7815335e';
const ASSIST_PULLUP = '6533120b-38ae-4db7-9257-a6956447bc1a';
const WEIGHTED_CHINUP = 'dc0e488b-dea5-4a36-89e1-510bc57ca3a3';
const DEADLIFT = [...E1RM_ALLOWLIST].find((id) => id !== BENCH)!;

const C = (equipment: string[], extra: Partial<Parameters<typeof resolveRecordingContract>[0]> = {}) =>
  resolveRecordingContract({ equipment, ...extra });

const LATEX = BAND_SERIES.find((s) => s.id === 'theraband-professional-latex-band')!;
const TUBE = BAND_SERIES.find((s) => s.id === 'theraband-resistance-tubing')!;
const band = (seriesId: string, color: string): BandComponent => {
  const lv = BAND_SERIES.find((s) => s.id === seriesId)!.levels.find((l) => l.id.endsWith(':' + color))!;
  return { catalog: BAND_CATALOG_REVISION, seriesId, levelId: lv.id, label: lv.label, swatch: lv.swatch };
};

function norm(over: Partial<NormalizeInput> & { contract: RecordingContract }): ReturnType<typeof normalizeSetLoad> {
  return normalizeSetLoad({
    hasProtocol: true,
    protocol: LOAD_PROTOCOL,
    weightKg: undefined,
    hasLoad: false,
    load: undefined,
    structured: false,
    ...over,
  });
}
const okOf = (r: ReturnType<typeof normalizeSetLoad>): NormalizeOk => {
  if (!r.ok) throw new Error(`expected ok, got ${r.code} ${r.error}`);
  return r;
};

/* ─────────────────────────── 1) 계약 해석 ─────────────────────────── */

await test('AC01 pogo (bodyweight) and support-only equipment have no load', () => {
  assert.equal(C(['맨몸'], { exerciseId: POGO }).mode, 'none');
  for (const eq of [['맨몸'], ['박스'], ['벤치'], ['TRX'], ['철봉'], ['짐볼'], ['맨몸', '박스', '벤치']]) {
    const c = C(eq);
    assert.equal(c.mode, 'none', eq.join());
    assert.equal(acceptsMass(c), false);
    assert.equal(c.e1rmEligible, false);
  }
});

await test('AC03 bases: barbell total incl. bar, dumbbell/kettlebell per implement, plates held, implement, cable/machine family only', () => {
  assert.equal(C(['바벨']).massBasis, 'barbellTotal');
  assert.equal(C(['바벨', '원판', '벤치']).massBasis, 'barbellTotal');
  assert.equal(C(['덤벨', '벤치']).massBasis, 'perImplement');
  assert.equal(C(['케틀벨']).massBasis, 'perImplement');
  assert.equal(C(['원판']).massBasis, 'platesHeld');
  assert.equal(C(['메디신볼']).mode, 'implementMass');
  const cable = C(['케이블']);
  assert.equal(cable.mode, 'indicatedLoad');
  assert.equal(cable.apparatusFamily, '케이블');
  assert.equal(cable.e1rmEligible, false, 'no e1RM for machine settings');
  assert.equal(C(['머신']).apparatusFamily, '머신');
  assert.equal(massFieldLabel(C(['덤벨'])), '무게(한 손 · 한 개)');
  assert.equal(massFieldLabel(cable, (n) => (n === '케이블' ? '케이블 머신' : n)), '케이블 머신 설정값');
  assert.equal(C(['바벨']).massRequired && C(['덤벨']).massRequired, true);
  assert.equal(C(['케틀벨']).massRequired, false);
});

await test('band role: never defaulted; reviewed overrides only; support equipment does not change it', () => {
  const b = C(['밴드']);
  assert.equal(b.mode, 'band');
  assert.equal(b.bandRole, null);
  assert.equal(b.bandRoleSource, null);
  assert.equal(C(['밴드', '철봉']).bandRole, null, 'support equipment does not imply assistance');
  const assist = C(['철봉', '밴드'], { exerciseId: ASSIST_PULLUP, overrides: overridesFor(ASSIST_PULLUP) });
  assert.equal(assist.bandRole, 'assistance');
  assert.equal(assist.bandRoleSource, 'override');
});

await test('combined / alternative / unresolved band+mass', () => {
  assert.equal(C(['바벨', '밴드']).mode, 'unresolved', 'no override → unresolved, quantity only');
  const comb = C(['바벨', '밴드'], { exerciseId: BAND_DEADLIFT, overrides: overridesFor(BAND_DEADLIFT) });
  assert.equal(comb.mode, 'combined');
  assert.equal(comb.massBasis, 'barbellTotal');
  assert.equal(comb.bandRole, 'resistance');
  assert.equal(comb.e1rmEligible, false, 'mixed band/weight never e1RM');
  const alt = C(['덤벨', '밴드'], { overrides: { use: 'alternative' } });
  assert.equal(alt.mode, 'alternative');
  assert.equal(contractForVariant(alt, 'band')?.mode, 'band');
  assert.equal(contractForVariant(alt, 'mass')?.massBasis, 'perImplement');
  assert.equal(contractForVariant(alt, null), null);
  assert.equal(C(['덤벨', '메디신볼']).mode, 'unresolved');
  assert.equal(C(['바벨', '덤벨']).mode, 'unresolved');
  assert.equal(C(['로잉머신']).mode, 'unresolved', 'unknown equipment');
});

await test('fixed support and approved weighted bodyweight variation', () => {
  assert.equal(C(['바벨'], { exerciseId: INVERTED_ROW, overrides: overridesFor(INVERTED_ROW) }).mode, 'none', 'inverted row bar is support');
  const wp = C(['원판'], { exerciseId: WEIGHTED_PUSHUP, overrides: overridesFor(WEIGHTED_PUSHUP) });
  assert.equal(wp.mode, 'externalMass');
  assert.equal(wp.massBasis, 'added');
  assert.equal(wp.e1rmEligible, false);
});

await test('e1RM reviewed allowlist gate (independent of recordability)', () => {
  assert.equal(E1RM_ALLOWLIST.size, 20);
  assert.equal(C(['바벨', '벤치'], { exerciseId: BENCH }).e1rmEligible, true);
  assert.equal(C(['바벨', '벤치'], { exerciseId: 'not-reviewed' }).e1rmEligible, false, 'loaded but unreviewed → off');
  assert.equal(C(['바벨'], { exerciseId: BENCH, isHold: true }).e1rmEligible, false, 'hold off');
  assert.equal(C(['바벨', '벤치'], { exerciseId: BENCH, overrides: { e1rm: false } }).e1rmEligible, false, 'explicit opt-out');
  assert.equal(C(['메디신볼'], { overrides: { e1rm: true } }).e1rmEligible, false, 'opt-in cannot enable implements');
});

await test('compat projections come from the resolver (no competing logic)', () => {
  assert.equal(usesWeight(['케이블']), true, 'cable gap fixed');
  assert.equal(usesWeight(['머신']), true);
  assert.equal(usesWeight(['맨몸']), false);
  assert.equal(usesWeight(['밴드']), false);
  assert.equal(needsWeight(['덤벨', '벤치']), true);
  assert.equal(needsWeight(['원판']), false);
  assert.equal(weightKindOf(['바벨']), 'barbell');
  assert.equal(weightKindOf(['원판']), 'barbell');
  assert.equal(weightKindOf(['덤벨']), 'dumbbell');
  assert.equal(weightKindOf(['케이블']), 'machine');
  assert.equal(weightKindOf(['머신']), 'none');
  assert.equal(weightKindOf(['바벨', '밴드']), 'none', 'band never mixed into kg progression');
  assert.equal(weightKindOf(['맨몸']), 'none');
});

/* ─────────────────────────── 2) 밴드 카탈로그 ─────────────────────────── */

await test('AC04 exact-series catalog: latex 8 incl. gold, tubing 7 without gold, revision + source preserved', () => {
  assert.deepEqual(LATEX.levels.map((l) => l.label.en), ['Tan', 'Yellow', 'Red', 'Green', 'Blue', 'Black', 'Silver', 'Gold']);
  assert.deepEqual(TUBE.levels.map((l) => l.label.en), ['Tan', 'Yellow', 'Red', 'Green', 'Blue', 'Black', 'Silver']);
  assert.equal(cleanBandComponent({ seriesId: TUBE.id, levelId: `${TUBE.id}:gold` }), null, 'no copied gold tubing');
  assert.ok(LATEX.source.url.startsWith('https://support.performancehealth.com/'));
  assert.ok(TUBE.source.url.includes('69000741800'));
  for (const s of BAND_SERIES) for (const l of s.levels) assert.ok(l.label.ko && l.label.en && l.label.ja, 'text labels for color-blind access');
  const c = cleanBandComponent({ seriesId: LATEX.id, levelId: `${LATEX.id}:yellow`, label: { ko: '가짜', en: 'x', ja: 'x' } });
  assert.ok(c && !('custom' in c) && c.label.ko === '노랑', 'labels re-derived from catalog, client text not trusted');
});

await test('same color different series / custom / unknown role are never cross-compared', () => {
  const k1 = bandComparisonKey('resistance', [band(LATEX.id, 'red')]);
  const k2 = bandComparisonKey('resistance', [band(TUBE.id, 'red')]);
  assert.ok(k1 && k2 && k1 !== k2, 'same red, different series');
  assert.equal(bandComparisonKey('unknown', [band(LATEX.id, 'red')]), null);
  const custom = cleanBandComponent({ custom: { brand: '다른회사', level: '3' } })!;
  assert.ok('custom' in custom && custom.custom.series === null);
  assert.equal(bandComparisonKey('resistance', [custom]), null);
  assert.equal(cleanBandComponent({ custom: { brand: '노랑만' } }), null, 'brand alone insufficient');
  assert.ok(bandComparisonKey('assistance', [band(LATEX.id, 'red'), band(LATEX.id, 'blue')]) !== bandComparisonKey('resistance', [band(LATEX.id, 'red'), band(LATEX.id, 'blue')]), 'assistance and resistance never share a key');
});

/* ─────────────────────────── 3) 정규화 ─────────────────────────── */

const NONE = C(['맨몸'], { exerciseId: POGO });
const BAR = C(['바벨', '벤치'], { exerciseId: BENCH });
const DB = C(['덤벨']);
const CABLE = C(['케이블']);
const BAND = C(['밴드']);
const COMB = C(['바벨', '밴드'], { exerciseId: BAND_DEADLIFT, overrides: overridesFor(BAND_DEADLIFT) });

await test('AC07 modern invalid payload is blocked with actionRequired (queue keeps it)', () => {
  const r = norm({ contract: NONE, weightKg: 20 });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.code === 'LOAD_NOT_ALLOWED' && r.actionRequired === true);
  const b = norm({ contract: BAND, weightKg: 5 });
  assert.ok(!b.ok && b.code === 'LOAD_NOT_ALLOWED');
  const req = norm({ contract: BAR });
  assert.ok(!req.ok && req.code === 'LOAD_REQUIRED');
});

await test('schema-off legacy path is the unchanged old write (no normalization claimed)', () => {
  const r = okOf(norm({ hasProtocol: false, protocol: undefined, contract: NONE, weightKg: 20 }));
  assert.equal(r.legacyUnchanged, true);
  assert.equal(r.incompatibleKept, true);
  assert.equal(r.weightKg, 20, 'byte-identical old write keeps the raw kg in weightKg');
  assert.equal(r.load, undefined);
  const bad = okOf(norm({ hasProtocol: false, protocol: undefined, contract: C(['케틀벨']), weightKg: 9999 }));
  assert.ok(bad.legacyUnchanged && bad.weightKg === null, 'old behaviour: out-of-range kg treated as not entered');
  const badReq = norm({ hasProtocol: false, protocol: undefined, contract: DB, weightKg: 9999 });
  assert.ok(!badReq.ok && badReq.code === 'LOAD_REQUIRED', 'old behaviour: required dumbbell with out-of-range kg asks for weight');
  const req = norm({ hasProtocol: false, protocol: undefined, contract: BAR, weightKg: null });
  assert.ok(!req.ok && req.code === 'LOAD_REQUIRED' && req.actionRequired === false, 'old 무게를 적어 주세요 kept');
});

await test('schema-on legacy path: canonical quantity only + recovery flag', () => {
  const r = okOf(norm({ hasProtocol: false, protocol: undefined, contract: NONE, weightKg: 20, structured: true }));
  assert.equal(r.weightKg, null);
  assert.equal(r.recover, true);
  assert.equal(r.status, 'legacyIncompatible');
  assert.deepEqual(r.load, { kind: 'none' });
  const lb = okOf(norm({ hasProtocol: false, protocol: undefined, contract: BAND, weightKg: 5, structured: true }));
  assert.ok(lb.load?.kind === 'band' && lb.load.role === 'unknown' && lb.load.bands.length === 0, 'legacy band → unknown band, no invented identity');
});

await test('strict versions: only an absent protocol is legacy', () => {
  assert.equal(protocolKind(false, undefined), 'legacy');
  assert.equal(protocolKind(true, 1), 'modern');
  for (const v of [2, '1', null, 0, 1.5]) {
    assert.equal(protocolKind(true, v), 'unknown', String(v));
    const r = norm({ protocol: v, contract: BAR, weightKg: 60 });
    assert.ok(!r.ok && r.code === 'LOAD_VERSION' && r.actionRequired, `protocol ${String(v)} held, not deleted`);
  }
  const wrongResolver = norm({ contract: BAR, weightKg: 60, resolver: 2 });
  assert.ok(!wrongResolver.ok && wrongResolver.code === 'LOAD_VERSION');
  const wrongCatalog = norm({ contract: BAND, structured: true, hasLoad: true, load: { kind: 'band', role: 'resistance', bands: [{ ...band(LATEX.id, 'red'), catalog: '1999-01-01.1' }] } });
  assert.ok(!wrongCatalog.ok && wrongCatalog.code === 'LOAD_VERSION');
  assert.equal(hasLoadAck({ loadAck: ackOf(true) }), true);
  assert.equal(hasLoadAck({ loadAck: { ...ackOf(true), catalog: 'x' } }), false, 'mismatched catalog ack not accepted');
  assert.equal(hasLoadAck({ loadAck: { protocol: 1, structured: true } }), false, 'non-persisted ack shape not accepted');
});

await test('AC04 band resistance/assistance/unknown role; schema-off unsupported', () => {
  const off = norm({ contract: BAND, hasLoad: true, load: { kind: 'band', role: 'resistance', bands: [band(LATEX.id, 'red')] } });
  assert.ok(!off.ok && off.code === 'LOAD_UNSUPPORTED');
  const on = okOf(norm({ contract: BAND, structured: true, hasLoad: true, load: { kind: 'band', role: 'assistance', bands: [band(LATEX.id, 'red'), band(LATEX.id, 'blue')] } }));
  assert.ok(on.load?.kind === 'band' && on.load.role === 'assistance' && on.load.bands.length === 2);
  assert.equal(on.weightKg, null, 'no kg for bands');
  const unknown = okOf(norm({ contract: BAND, structured: true, hasLoad: true, load: { kind: 'band', bands: [band(TUBE.id, 'red')] } }));
  assert.ok(unknown.load?.kind === 'band' && unknown.load.role === 'unknown');
  const assist = C(['철봉', '밴드'], { exerciseId: ASSIST_PULLUP, overrides: overridesFor(ASSIST_PULLUP) });
  const mismatch = norm({ contract: assist, structured: true, hasLoad: true, load: { kind: 'band', role: 'resistance', bands: [] } });
  assert.ok(!mismatch.ok && mismatch.code === 'LOAD_CONFLICT');
  const tooMany = norm({ contract: BAND, structured: true, hasLoad: true, load: { kind: 'band', bands: [band(LATEX.id, 'red'), band(LATEX.id, 'red'), band(LATEX.id, 'red'), band(LATEX.id, 'red')] } });
  assert.ok(!tooMany.ok);
});

await test('AC05 combined barbell + band keeps both components, no invented kg; conflicting kg rejected', () => {
  const r = okOf(norm({ contract: COMB, structured: true, weightKg: 80, hasLoad: true, load: { kind: 'combined', mass: { kg: 80 }, band: { bands: [band(LATEX.id, 'green')] } } }));
  assert.ok(r.load?.kind === 'combined' && r.load.mass?.kg === 80 && r.load.band.bands.length === 1);
  assert.equal(projectWeightKg(r.load!), 80, 'legacy projection is the mass component only');
  const conflict = norm({ contract: COMB, structured: true, weightKg: 90, hasLoad: true, load: { kind: 'combined', mass: { kg: 80 }, band: { bands: [] } } });
  assert.ok(!conflict.ok && conflict.code === 'LOAD_CONFLICT', 'two disagreeing kg are not stored');
});

await test('unequal implements: lossless parts, no averaging/doubling; total only with known counts', () => {
  const r = okOf(norm({ contract: DB, structured: true, hasLoad: true, load: { kind: 'mass', parts: [{ kg: 12, count: 1, side: 'left' }, { kg: 14, count: 1, side: 'right' }] } }));
  assert.ok(r.load?.kind === 'mass' && r.load.kg === null && r.load.parts?.length === 2);
  assert.equal(r.weightKg, null, 'no single kg pretends to describe both');
  assert.equal(knownTotalKg(r.load as Extract<RecordedLoad, { kind: 'mass' }>), 26);
  const eq = okOf(norm({ contract: DB, structured: true, hasLoad: true, load: { kind: 'mass', parts: [{ kg: 12, count: 2, side: null }] } }));
  assert.equal(eq.weightKg, 12, 'equal implements keep per-hand value');
  assert.equal(knownTotalKg({ basis: 'perImplement', apparatusFamily: null, setup: null, kg: 12, parts: null }), null, 'per-hand without count has no total');
  const off = norm({ contract: DB, hasLoad: true, load: { kind: 'mass', parts: [{ kg: 12, count: 1, side: 'left' }] } });
  assert.ok(!off.ok && off.code === 'LOAD_UNSUPPORTED');
});

await test('apparatus setup key only on cable/machine; requires structured', () => {
  const on = okOf(norm({ contract: CABLE, structured: true, hasLoad: true, load: { kind: 'mass', kg: 25, setup: { label: ' A짐 케이블 1번 ' } } }));
  assert.ok(on.load?.kind === 'mass' && on.load.setup?.key === 'a짐 케이블 1번');
  const wrong = norm({ contract: DB, structured: true, hasLoad: true, load: { kind: 'mass', kg: 10, setup: { label: 'x' } } });
  assert.ok(!wrong.ok);
  const off = norm({ contract: CABLE, hasLoad: true, load: { kind: 'mass', kg: 25, setup: { label: 'x' } } });
  assert.ok(!off.ok && off.code === 'LOAD_UNSUPPORTED');
});

await test('absent vs clear; legacy RIR-only correction keeps a modern band; old kg edit cannot erase combined', () => {
  const modernBand: RecordedLoad = { kind: 'band', role: 'resistance', bands: [band(LATEX.id, 'red')] };
  const keep = okOf(norm({ hasProtocol: false, protocol: undefined, contract: BAND, structured: true, existing: { weightKg: null, load: modernBand } }));
  assert.equal(keep.load, undefined, 'absent load = keep existing band');
  const oldKg = okOf(norm({ hasProtocol: false, protocol: undefined, contract: BAND, weightKg: 7, structured: true, existing: { weightKg: null, load: modernBand } }));
  assert.ok(oldKg.load === undefined && oldKg.recover && oldKg.weightKg === null, 'legacy kg recovered, band kept');
  const comb: RecordedLoad = { kind: 'combined', mass: { basis: 'barbellTotal', apparatusFamily: null, setup: null, kg: 80, parts: null }, band: { role: 'resistance', bands: [band(LATEX.id, 'green')] } };
  const edit = okOf(norm({ hasProtocol: false, protocol: undefined, contract: COMB, weightKg: 100, structured: true, existing: { weightKg: 80, load: comb } }));
  assert.ok(edit.load === undefined && edit.weightKg === 80 && edit.recover, 'old kg edit of combined → recovered, modern load untouched');
  const clear = okOf(norm({ contract: C(['케틀벨']), structured: true, hasLoad: true, load: null }));
  assert.deepEqual(clear.load, { kind: 'none' }, 'explicit clear allowed when mass optional');
  const clearReq = norm({ contract: BAR, structured: true, hasLoad: true, load: null });
  assert.ok(!clearReq.ok && clearReq.code === 'LOAD_REQUIRED', 'explicit clear refused when mass required');
});

await test('omitted load keeps a saved unequal-hands / machine-name mass (RIR-only resend); legacy kg edit cannot erase parts', () => {
  const parts: RecordedLoad = { kind: 'mass', basis: 'perImplement', apparatusFamily: null, setup: null, kg: null, parts: [{ kg: 12, count: 1, side: 'left' }, { kg: 14, count: 1, side: 'right' }] };
  const rir = okOf(norm({ hasProtocol: false, protocol: undefined, contract: DB, weightKg: null, structured: true, existing: { weightKg: null, load: parts } }));
  assert.ok(rir.load === undefined && rir.weightKg === null && !rir.recover, 'kept; no LOAD_REQUIRED for a saved unequal set');
  const modernRir = okOf(norm({ contract: DB, weightKg: undefined, structured: true, existing: { weightKg: null, load: parts } }));
  assert.equal(modernRir.load, undefined, 'modern RIR-only answer keeps parts too');
  const oldKg = okOf(norm({ hasProtocol: false, protocol: undefined, contract: DB, weightKg: 20, structured: true, existing: { weightKg: null, load: parts } }));
  assert.ok(oldKg.load === undefined && oldKg.weightKg === null && oldKg.recover, 'old app cannot see parts — kept, original recovered');
  const cable: RecordedLoad = { kind: 'mass', basis: 'stackSetting', apparatusFamily: '케이블', setup: { key: 'a짐 1번', label: 'A짐 1번' }, kg: 30, parts: null };
  const same = okOf(norm({ hasProtocol: false, protocol: undefined, contract: CABLE, weightKg: 30, structured: true, existing: { weightKg: 30, load: cable } }));
  assert.ok(same.load === undefined && same.weightKg === 30, 'same kg resend keeps the machine name');
  const newKg = okOf(norm({ hasProtocol: false, protocol: undefined, contract: CABLE, weightKg: 35, structured: true, existing: { weightKg: 30, load: cable } }));
  assert.ok(newKg.load?.kind === 'mass' && newKg.load.kg === 35 && newKg.load.setup?.key === 'a짐 1번', 'old app new number on the same machine');
  assert.ok(rir.request && !('existing' in rir.request), 'result carries the request (without the pre-read row) for in-transaction re-normalization');
});

await test('alternative dumbbell/band: variant required for modern, inferred for legacy; resolves the used variant only', () => {
  const alt = C(['덤벨', '밴드'], { overrides: { use: 'alternative' } });
  const none = norm({ contract: alt, weightKg: 10 });
  assert.ok(!none.ok && none.code === 'LOAD_REQUIRED');
  const mass = okOf(norm({ contract: alt, weightKg: 10, variant: 'mass' }));
  assert.ok(mass.variant === 'mass' && mass.contract.mode === 'externalMass' && mass.weightKg === 10);
  const legacy = okOf(norm({ hasProtocol: false, protocol: undefined, contract: alt, weightKg: 10, structured: true }));
  assert.equal(legacy.variant, 'mass');
  const bandV = okOf(norm({ contract: alt, variant: 'band', structured: true, hasLoad: true, load: { kind: 'band', bands: [band(LATEX.id, 'red')] } }));
  assert.equal(bandV.contract.mode, 'band');
});

/* ─────────────────────── 3b) 실제 연결 경로(판 얼리기 · 옛 판 · 라이브러리 · 목표) ─────────────────────── */

const { freezeExercise } = await import('@/lib/workout/session-plan');
const src = (id: string, equipment: string[], category = '상체 스트렝스', o: { reps?: number | null; holdSeconds?: number | null } = {}) => ({
  id, title: 't', category, bodyParts: [], intensity: '높음', movementPattern: null, equipment, sets: 3, reps: o.reps === undefined ? 5 : o.reps,
  holdSeconds: o.holdSeconds ?? null, restSeconds: 120, perSide: false, thumbPath: null,
});

await test('integration paths pass the exercise id: freezeExercise / frozen fallback / library row keep the reviewed e1RM allowlist', () => {
  for (const id of [BENCH, DEADLIFT]) {
    const fz = freezeExercise(src(id, ['바벨', '벤치']), 'main');
    assert.equal(fz.load?.e1rmEligible, true, `frozen ${id}`);
    const { load: _l, ...old } = fz;
    void _l;
    assert.equal(contractOfFrozen(old).e1rmEligible, true, 'plan frozen before contracts → fallback keeps allowlist');
    assert.equal(contractOfLibraryRow({ id, equipment: ['바벨', '벤치'], category: '상체 스트렝스', reps: 5, holdSeconds: null }).e1rmEligible, true, 'library row');
    assert.equal(planContextOf([fz])(id).contract.e1rmEligible, true, 'plan-gate context (frozen contract)');
    assert.equal(planContextOf([old])(id).contract.e1rmEligible, true, 'plan-gate context (old equipment-only plan)');
  }
  assert.equal(freezeExercise(src('not-reviewed', ['바벨', '벤치']), 'main').load?.e1rmEligible, false, 'unreviewed stays off');
  assert.equal(freezeExercise(src(WEIGHTED_CHINUP, ['철봉']), 'main').load?.e1rmEligible, false, 'added-load variation off');
});

await test('target kg editability follows the frozen contract (support bar none · added-load chin-up yes · band none · alternative mass)', () => {
  const inv = freezeExercise(src(INVERTED_ROW, ['바벨']), 'main');
  assert.equal(inv.load?.mode, 'none');
  assert.equal(kgEditable(inv), false, 'inverted row: bar is support');
  assert.equal(editableOf(inv).kg, false);
  const chin = freezeExercise(src(WEIGHTED_CHINUP, ['철봉']), 'main');
  assert.ok(chin.load?.mode === 'externalMass' && chin.load.massBasis === 'added' && !chin.load.massRequired);
  assert.equal(chin.needsWeight, false);
  assert.equal(kgEditable(chin), true, 'weighted chin-up: added load target');
  const bandEx = freezeExercise(src('band-x', ['밴드']), 'main');
  assert.equal(kgEditable(bandEx), false, 'band: no kg target');
  assert.equal(kgEditable(freezeExercise(src(BAND_DEADLIFT, ['바벨', '밴드']), 'main')), true, 'combined: mass component target');
  const alt = { ...bandEx, id: 'alt-x', load: C(['덤벨', '밴드'], { overrides: { use: 'alternative' } }) };
  assert.equal(kgEditable(alt), true, 'alternative: mass variant target');
  const { load: _l, ...oldInv } = inv;
  void _l;
  assert.equal(kgEditable(oldInv), false, 'old plan without a contract re-resolves from its frozen equipment + review');
  const rec = { sets: 3, reps: 10, holdSeconds: null, restSeconds: 60, kg: null };
  const bad = checkTargetInput({ kg: 20 }, inv, rec, { painToday: false });
  assert.ok(!bad.ok, 'server/web/native check refuses a kg target on the support-bar row');
  const ok = checkTargetInput({ kg: 10 }, chin, rec, { painToday: false });
  assert.ok(ok.ok && ok.target?.kg === 10, 'added-load target accepted');
  assert.equal(readUserTarget({ kg: 20, reps: 12, at: 'x' }, inv)?.kg, undefined, 'a stored kg target on a no-mass contract is dropped on read');
});

/* ─────────────────────────── 4) 읽기 관문 ─────────────────────────── */

const ctx = (exerciseId: string, contract: RecordingContract, evidence: LoadReadContext['evidence']): LoadReadContext => ({ exerciseId, contract, evidence });

await test('AC02 historical evidence: current equipment is not proof; equipment snapshot mapping v1; reviewed pogo incompatible', () => {
  const cur = viewSetLoad(ctx('ex-x', BAR, 'current'), { weightKg: 100 });
  assert.equal(cur.status, 'unverified');
  assert.equal(cur.metricKg, null);
  assert.equal(cur.prefillKg, null, 'no prefill from unverified history');
  assert.equal(cur.rawKg, 100, 'raw kept');
  const eq = viewSetLoad(ctx('ex-x', BAR, 'equipment'), { weightKg: 100 });
  assert.equal(eq.status, 'historicalMapped');
  assert.equal(eq.metricKg, 100);
  assert.equal(isIncluded(eq.status), true);
  assert.equal(isIncluded(cur.status), false);
  const pogo = viewSetLoad(ctx(POGO, NONE, 'equipment'), { weightKg: 30 });
  assert.equal(pogo.status, 'incompatible');
  assert.equal(pogo.displayKg, null);
  assert.ok(REVIEWED_INCOMPATIBLE_LOAD.has(POGO));
  const bwOld = viewSetLoad(ctx('ex-bw', NONE, 'equipment'), { weightKg: 10 });
  assert.equal(bwOld.status, 'unverified', 'unreviewed bodyweight kg is uncertain, not invalid');
  const bwNew = viewSetLoad(ctx('ex-bw', NONE, 'contract'), { weightKg: 10 });
  assert.equal(bwNew.status, 'incompatible', 'kg against a frozen no-load contract is incompatible');
});

await test('GPT decision: cable/machine without setup key → no prefill, no metric, no key; with setup key comparable', () => {
  const v = viewSetLoad(ctx('ex-c', CABLE, 'contract'), { weightKg: 30 });
  assert.equal(v.displayKg, 30);
  assert.equal(v.prefillKg, null);
  assert.equal(v.metricKg, null);
  assert.equal(v.key, null);
  const h = viewSetLoad(ctx('ex-c', CABLE, 'equipment'), { weightKg: 30 });
  assert.ok(h.prefillKg === null && h.metricKg === null);
  const snap = snapshotOf({ load: { kind: 'mass', basis: 'stackSetting', apparatusFamily: '케이블', setup: { key: 'a1', label: 'A1' }, kg: 30, parts: null }, status: 'ok', contract: CABLE, variant: null, provenance: 'modern' });
  const s = viewSetLoad(ctx('ex-c', CABLE, 'contract'), { weightKg: 30, snapshot: snap });
  assert.ok(s.metricKg === 30 && s.key?.endsWith(':a1') && s.e1rmKg === null);
});

await test('per-set snapshot is authoritative over current/plan context (library change, alternative variant)', () => {
  const snapMass = snapshotOf({ load: { kind: 'mass', basis: 'barbellTotal', apparatusFamily: null, setup: null, kg: 60, parts: null }, status: 'ok', contract: BAR, variant: null, provenance: 'modern' });
  const reread = readSnapshot(JSON.parse(JSON.stringify(snapMass)))!;
  const v = viewSetLoad(ctx('ex-z', NONE, 'contract'), { weightKg: 60, snapshot: reread });
  assert.equal(v.status, 'ok', 'library later changed to bodyweight does not reinterpret');
  assert.equal(v.metricKg, 60);
  const alt = C(['덤벨', '밴드'], { overrides: { use: 'alternative' } });
  const bandSnap = snapshotOf({ load: { kind: 'band', role: 'resistance', bands: [band(LATEX.id, 'red')] }, status: 'ok', contract: contractForVariant(alt, 'band')!, variant: 'band', provenance: 'modern' });
  const vb = viewSetLoad(ctx('ex-alt', alt, 'contract'), { weightKg: null, snapshot: readSnapshot(JSON.parse(JSON.stringify(bandSnap))) });
  assert.ok(vb.band && vb.metricKg === null && vb.key?.startsWith('band:resistance:'));
  const legacySnap = snapshotOf({ load: { kind: 'none' }, status: 'legacyIncompatible', contract: NONE, variant: null, provenance: 'legacy' });
  assert.equal(viewSetLoad(ctx('ex-z', BAR, 'contract'), { weightKg: null, snapshot: legacySnap }).status, 'incompatible');
  assert.equal(readSnapshot({ v: 99 }), null, 'unknown snapshot version not trusted');
});

await test('history: same cable exercise, setup A 100kg + setup B 20kg → no pooled global best; per-setup context and unequal parts kept', () => {
  const snap = (load: RecordedLoad, c: RecordingContract = CABLE) => snapshotOf({ load, status: 'ok', contract: c, variant: null, provenance: 'modern' });
  const cab = (label: string, kg: number): RecordedLoad => ({ kind: 'mass', basis: 'stackSetting', apparatusFamily: '케이블', setup: { key: label.toLowerCase(), label }, kg, parts: null });
  /* the same projection as app/actions/exercise-history.ts */
  const project = (date: string, setNo: number, reps: number, l: RecordedLoad, c: RecordingContract = CABLE) => {
    const v = viewSetLoad(ctx('cable-x', c, 'contract'), { weightKg: projectWeightKg(l), snapshot: snap(l, c) });
    return { date, setNo, reps, holdSeconds: null, weightKg: v.displayKg, metricKg: v.metricKg, e1rmKg: v.e1rmKg, loadStatus: v.status, rawKg: v.rawKg, band: v.band, key: v.key, setup: v.setup, parts: v.parts };
  };
  const rows = [project('2026-11-01', 1, 10, cab('A짐 1번', 100)), project('2026-11-10', 1, 10, cab('B짐 2번', 20))];
  const h = buildExerciseHistory(rows, [], '2026-11-16', CABLE);
  assert.equal(h.bestWeight?.kg, 20, 'best is within the latest setup only — not the other machine 100kg');
  assert.deepEqual(h.comparison, { setupLabel: 'B짐 2번', otherSetupDays: 1 });
  const dayA = h.days.find((d) => d.date === '2026-11-01')!;
  assert.equal(dayA.volume, null, 'other setup day not in the comparable volume trend');
  assert.equal(dayA.sets?.[0]?.setupLabel, 'A짐 1번', 'apparatus identity kept for display');
  assert.equal(dayA.sets?.[0]?.weightKg, 100, 'value still shown');
  const dbRows = [project('2026-11-12', 1, 8, { kind: 'mass', basis: 'perImplement', apparatusFamily: null, setup: null, kg: null, parts: [{ kg: 12, count: 1, side: 'left' }, { kg: 14, count: 1, side: 'right' }] }, DB)];
  const hd = buildExerciseHistory(dbRows, [], '2026-11-16', DB);
  assert.equal(hd.days[0].sets?.[0]?.parts?.length, 2, 'unequal implements shown with their components');
  assert.equal(hd.bestWeight, null, 'no single number invented for unequal implements');
  const bar = [project('2026-11-01', 1, 5, { kind: 'mass', basis: 'barbellTotal', apparatusFamily: null, setup: null, kg: 100, parts: null }, BAR), project('2026-11-10', 1, 5, { kind: 'mass', basis: 'barbellTotal', apparatusFamily: null, setup: null, kg: 80, parts: null }, BAR)];
  const hb = buildExerciseHistory(bar, [], '2026-11-16', BAR);
  assert.equal(hb.bestWeight?.kg, 100, 'free weights of one contract stay comparable across days');
  assert.ok(hb.comparison && hb.comparison.setupLabel === null && hb.comparison.otherSetupDays === 0);
});

await test('AC02 pogo history: no kg kind, no kg card/volume/PR/e1RM, quantity kept, raw not deleted', () => {
  const rows = [
    { date: '2026-11-01', setNo: 1, weightKg: 40, reps: 20, holdSeconds: null },
    { date: '2026-11-03', setNo: 1, weightKg: null, reps: 25, holdSeconds: null },
  ].map((r) => {
    const v = viewSetLoad(ctx(POGO, NONE, 'equipment'), { weightKg: r.weightKg });
    return { ...r, weightKg: v.displayKg, metricKg: v.metricKg, e1rmKg: v.e1rmKg, loadStatus: v.status, rawKg: v.rawKg };
  });
  const h = buildExerciseHistory(rows, [], '2026-11-16', NONE);
  assert.equal(h.kind, 'reps');
  assert.equal(h.bestWeight, null);
  assert.equal(h.bestSet, null);
  assert.equal(h.days.every((d) => d.e1rm === null), true);
  assert.equal(h.bestReps?.reps, 25);
  assert.equal(h.excludedKgDays, 1);
  assert.equal(h.days.find((d) => d.date === '2026-11-01')?.sets?.[0].rawKg, 40, 'raw visible only as detail');
  const legacyShape = buildExerciseHistory([{ date: '2026-11-01', setNo: 1, weightKg: 40, reps: 20, holdSeconds: null }], [], '2026-11-16');
  assert.equal(legacyShape.kind, 'weight', 'ungated old behaviour unchanged for old tests');
});

await test('AC03 strength e1RM/PR stays for allowlisted barbell history', () => {
  const rows = [60, 70].map((kg, i) => {
    const v = viewSetLoad(ctx(BENCH, BAR, 'equipment'), { weightKg: kg });
    return { date: `2026-11-0${i + 1}`, setNo: 1, weightKg: v.displayKg, reps: 5, holdSeconds: null, metricKg: v.metricKg, e1rmKg: v.e1rmKg, loadStatus: v.status, rawKg: v.rawKg };
  });
  const h = buildExerciseHistory(rows, [], '2026-11-16', BAR);
  assert.equal(h.kind, 'weight');
  assert.equal(h.bestWeight?.kg, 70);
  assert.ok(h.bestSet && h.bestSet.e1rm > 70);
  const notListed = C(['바벨']);
  const rows2 = rows.map((r) => ({ ...r, e1rmKg: viewSetLoad(ctx('x', notListed, 'equipment'), { weightKg: r.weightKg }).e1rmKg }));
  assert.equal(buildExerciseHistory(rows2, [], '2026-11-16', notListed).bestSet, null, 'unreviewed lift has no e1RM');
});

await test('summary/tonnage helpers and done-screen style totals exclude incompatible kg', () => {
  const plan = [
    { id: POGO, equipment: ['맨몸'], category: '파워', isHold: false, load: NONE },
    { id: BENCH, equipment: ['바벨', '벤치'], category: '상체 스트렝스', isHold: false, load: BAR },
  ];
  const ctxOf = planContextOf(plan);
  const rows = gateRows(
    [
      { exerciseId: POGO, weightKg: 40, reps: 20, holdSeconds: null },
      { exerciseId: BENCH, weightKg: 60, reps: 5, holdSeconds: null },
    ],
    ctxOf
  );
  assert.equal(totalVolumeKg(forTonnage(rows)), 300);
  const sum = summarizeSets(forSummary(rows));
  assert.equal(sum.find((s) => s.exerciseId === POGO)?.weightKg, null);
  assert.equal(contractOfFrozen({ id: 'old', equipment: ['덤벨'], category: '상체 스트렝스' }).massBasis, 'perImplement', 'old plan resolves from frozen equipment');
});

await test('new record: bodyweight kg never makes a weight PR; band/implement/cable have none', () => {
  const prior = { weightKg: 10, reps: 20, holdSeconds: null };
  const pogo = newRecord({ isHold: false, needsWeight: false, load: NONE }, [{ setNo: 1, weightKg: 50, reps: 21, holdSeconds: null }], prior);
  assert.equal(pogo?.kind, 'reps');
  assert.equal(newRecord({ isHold: false, needsWeight: false, load: BAND }, [{ setNo: 1, weightKg: null, reps: 30, holdSeconds: null }], prior), null);
  assert.equal(newRecord({ isHold: false, needsWeight: false, load: CABLE }, [{ setNo: 1, weightKg: 50, reps: 5, holdSeconds: null }], prior), null);
  assert.equal(newRecord({ isHold: false, needsWeight: true, load: BAR }, [{ setNo: 1, weightKg: 12, reps: 5, holdSeconds: null }], prior)?.kind, 'weight');
});

await test('queue outcome: only proven saves are removable (GPT probes: generic error, false storage ack, malformed success)', () => {
  const validBand = { loadProtocol: 1, load: { kind: 'band', role: 'resistance', bands: [band(LATEX.id, 'red')] } };
  assert.equal(outcomeOf({}, { error: 'x', code: 'LOAD_NOT_ALLOWED', actionRequired: true }).kind, 'held');
  assert.equal(outcomeOf(validBand, { error: 'not saved' }).kind, 'held', 'generic error with a valid band payload is retained');
  assert.equal(outcomeOf({}, { error: '이미 마친 운동이라 이 세트는 저장하지 못했어요.' }).kind, 'held', 'generic error on a plain set is retained too');
  assert.equal(outcomeOf(validBand, { sets: [], loadAck: ackOf(false) }).kind, 'held', 'structured payload needs a structured-capable ack');
  assert.equal(outcomeOf(validBand, { sets: [] }).kind, 'held', 'old server ignoring fields is not a save');
  assert.equal(outcomeOf(validBand, { sets: [], loadAck: { ...ackOf(true), catalog: 'old' } }).kind, 'held', 'other catalog ack');
  assert.equal(outcomeOf(validBand, { sets: [], loadAck: ackOf(true) }).kind, 'saved');
  assert.equal(outcomeOf(validBand, { loadAck: ackOf(true) }).kind, 'held', 'malformed success (no sets) retained');
  assert.equal(outcomeOf({}, null).kind, 'held', 'empty answer retained');
  assert.equal(outcomeOf({}, { sets: 'x' }).kind, 'held', 'malformed sets retained');
  assert.equal(outcomeOf({}, { sets: [], loadAck: ackOf(false) }).kind, 'saved', 'mass-only on schema-off server: supported projection');
  assert.equal(outcomeOf({}, { sets: [] }).kind, 'saved', 'mass-only on an older server keeps its old supported meaning');
  assert.equal(outcomeOf({}, { sets: [], loadAck: { protocol: 2, persisted: true } }).kind, 'held', 'mismatched ack version on plain set');
  assert.equal(outcomeOf({ load: { kind: 'mass', parts: [{ kg: 10, count: 1, side: 'left' }] } }, { sets: [], loadAck: ackOf(false) }).kind, 'held', 'parts need structured storage');
  assert.equal(outcomeOf({}, { error: 'x', code: 'SESSION_UNAVAILABLE' }, false).kind, 'held');
  assert.equal((outcomeOf({}, { error: 'x', code: 'SESSION_UNAVAILABLE' }, false) as { code: string }).code, 'OWNER_UNKNOWN');
});

await test('original payload hash: presence vs null, different invalid kg differ, key order irrelevant', () => {
  const a = originalPayloadHash({ sessionId: 's', exerciseId: 'e', setNo: 1, weightKg: 20, reps: 5 });
  const b = originalPayloadHash({ sessionId: 's', exerciseId: 'e', setNo: 1, weightKg: 30, reps: 5 });
  const c = originalPayloadHash({ reps: 5, setNo: 1, exerciseId: 'e', sessionId: 's', weightKg: 20 });
  const d = originalPayloadHash({ sessionId: 's', exerciseId: 'e', setNo: 1, weightKg: null, reps: 5 });
  const e = originalPayloadHash({ sessionId: 's', exerciseId: 'e', setNo: 1, reps: 5 });
  assert.notEqual(a, b);
  assert.equal(a, c);
  assert.notEqual(d, e, 'explicit null differs from absent');
  const withBand = originalPayloadHash({ sessionId: 's', exerciseId: 'e', setNo: 1, load: { kind: 'band', role: 'resistance', bands: [band(LATEX.id, 'red')] } });
  const otherBand = originalPayloadHash({ sessionId: 's', exerciseId: 'e', setNo: 1, load: { kind: 'band', role: 'resistance', bands: [band(TUBE.id, 'red')] } });
  assert.notEqual(withBand, otherBand, 'band components participate');
});

/* ─────────────────────────── 5) 격리 DB ─────────────────────────── */

async function isolated(apply: string[]) {
  const pg = await PGlite.create();
  await pg.exec(fixtureSchemaSql());
  for (const f of apply) await pg.exec(readFileSync(f, 'utf8'));
  // Simulate pre-promotion DB and client selection, not the current generated client's full schema.
  const legacyFixture = !apply.includes(LOAD_SQL);
  if (legacyFixture) await removeLoadSchemaFromFixture(pg);
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
  await socket.start();
  const port = (socket as unknown as { server: { address(): { port: number } } }).server.address().port;
  const url = `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
  assert.ok(url.includes('127.0.0.1'));
  const db = new PrismaClient({ ...(legacyFixture ? legacyLoadClientOptions() : {}), adapter: new PrismaPg({ connectionString: url, max: 1 }) });
  return { pg, socket, db };
}

const LOAD_SQL = 'prisma/migrations/20261116150000_ex_load01_recording_contract/migration.sql';
const ROLLBACK_SQL = 'prisma/pending-migrations/20261116150000_ex_load01_recording_contract/rollback.sql';
const V2_SQL = V2_FIXTURE_SQL;

async function seed(db: PrismaClient, tag: string, equipment: string[], exId?: string) {
  const u = await db.user.create({ data: { email: `${tag}@load.test`, nickname: tag, password: 'x' } });
  const ex = await db.exerciseVideo.create({
    data: { ...(exId ? { id: exId } : {}), title: `ex-${tag}`, description: '', category: '파워', equipment, bodyParts: [], intensity: '보통', reps: 10 } as unknown as Prisma.ExerciseVideoCreateInput,
  });
  const s = await db.trainingSession.create({
    data: { userId: u.id, date: new Date('2026-11-16T00:00:00Z'), themeKey: 'lower', plan: { themeKey: 'lower', themeLabel: 't', exercises: [] }, status: 'ACTIVE', startedAt: new Date('2026-11-16T01:00:00Z') },
  });
  return { u, ex, s };
}

function upsertOf(sessionId: string, userId: string, exerciseId: string, setNo: number, w: number | null, reps: number) {
  return {
    where: { sessionId_exerciseId_setNo: { sessionId, exerciseId, setNo } },
    create: { sessionId, userId, exerciseId, date: new Date('2026-11-16T00:00:00Z'), setNo, weightKg: w, reps, holdSeconds: null, recordedAt: new Date('2026-11-16T01:10:00Z'), rir: null },
    update: { weightKg: w, reps, holdSeconds: null },
    select: { id: true },
  } as unknown as Prisma.UserExerciseSetUpsertArgs & { select: { id: true } };
}

await (async () => {
  /* 5-1 스키마 미적용 DB — 꺼짐 길은 새 칸 이름을 한 번도 보내지 않는다(Postgres 가 모르는 칸이면 오류를 낸다) */
  const off = await isolated([]);
  try {
    await test('schema-off DB: legacy unchanged write + gated reads work with zero new-column access', async () => {
      const { u, ex, s } = await seed(off.db, 'off', ['맨몸']);
      const r = okOf(normalizeSetLoad({ hasProtocol: false, protocol: undefined, contract: NONE, weightKg: 20, hasLoad: false, load: undefined, structured: false }));
      const row = await persistSet(off.db, { structured: false, upsert: upsertOf(s.id, u.id, ex.id, 1, r.weightKg, 20), norm: r, owner: { ownerId: u.id, actorId: u.id }, ref: { sessionId: s.id, exerciseId: ex.id, setNo: 1 }, original: { weightKg: 20, reps: 20 }, protocol: null, provenance: 'legacy' });
      const stored = await off.db.userExerciseSet.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(stored.weightKg, 20, 'unchanged legacy write');
      const cols = await off.pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'UserExerciseSet' AND column_name = 'load'`);
      assert.equal(cols.rows[0].n, 0, 'column really absent in this DB');
      const v = viewSetLoad(ctx(ex.id, NONE, 'contract'), { weightKg: stored.weightKg });
      assert.equal(v.status, 'incompatible', 'reader excludes it');
    });
  } finally {
    await off.db.$disconnect();
    await off.socket.stop();
    await off.pg.close();
  }

  /* 5-2 보류 SQL 적용 DB — 실제 쓰기 핵심의 한 거래 */
  const on = await isolated([V2_SQL, LOAD_SQL]);
  const count = async (table: string, where = 'TRUE') => Number((await on.db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}" WHERE ${where}`))[0].n);
  try {
    const { u, ex, s } = await seed(on.db, 'on', ['맨몸'], POGO);
    const original = { kind: 'workout.logSet', sessionId: s.id, exerciseId: ex.id, setNo: 1, weightKg: 20, reps: 20 };
    const r = okOf(normalizeSetLoad({ hasProtocol: false, protocol: undefined, contract: NONE, weightKg: 20, hasLoad: false, load: undefined, structured: true }));
    const args = (faults?: Parameters<typeof persistSet>[1]['faults'], o = original) => ({
      structured: true,
      upsert: upsertOf(s.id, u.id, ex.id, 1, r.weightKg, 20),
      norm: r,
      owner: { ownerId: u.id, actorId: u.id },
      ref: { sessionId: s.id, exerciseId: ex.id, setNo: 1 },
      original: o,
      protocol: null,
      provenance: 'legacy',
      faults,
    });

    await test('fault after canonical upsert → rollback, no set, no recovery, thrown (no fake ACK)', async () => {
      await assert.rejects(persistSet(on.db, args({ afterUpsert: () => { throw new Error('inject-after-upsert'); } })), /inject-after-upsert/);
      assert.equal(await count('UserExerciseSet', `"sessionId" = '${s.id}'`), 0);
      assert.equal(await count('WorkoutLoadRecovery'), 0);
    });
    await test('fault after snapshot / after recovery → rollback each time', async () => {
      await assert.rejects(persistSet(on.db, args({ afterSnapshot: () => { throw new Error('inject-after-snapshot'); } })));
      await assert.rejects(persistSet(on.db, args({ afterRecovery: () => { throw new Error('inject-after-recovery'); } })));
      assert.equal(await count('UserExerciseSet', `"sessionId" = '${s.id}'`), 0);
      assert.equal(await count('WorkoutLoadRecovery'), 0);
    });
    await test('retry succeeds once: canonical quantity (kg null) + snapshot + one recovery; replay adds nothing', async () => {
      const row = await persistSet(on.db, args());
      const again = await persistSet(on.db, args());
      assert.equal(row.id, again.id, 'same canonical set');
      assert.equal(await count('UserExerciseSet', `"sessionId" = '${s.id}'`), 1);
      assert.equal(await count('WorkoutLoadRecovery'), 1, 'same original → one recovery');
      const set = await on.db.userExerciseSet.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(set.weightKg, null);
      assert.equal(set.reps, 20);
      const snaps = await readSnapshotsTx(on.db as unknown as Prisma.TransactionClient, [row.id]);
      assert.equal(snaps.get(row.id)?.status, 'legacyIncompatible');
      const rec = await on.db.$queryRawUnsafe<{ originalPayload: { weightKg: number }; setId: string }[]>(`SELECT "originalPayload", "setId" FROM "WorkoutLoadRecovery"`);
      assert.equal(rec[0].originalPayload.weightKg, 20, 'original kg durable');
      assert.equal(rec[0].setId, row.id, 'linked to accepted set');
    });
    await test('different invalid legacy kg on the same set → second recovery row, still one canonical set', async () => {
      await persistSet(on.db, args(undefined, { ...original, weightKg: 35 }));
      assert.equal(await count('WorkoutLoadRecovery'), 2);
      assert.equal(await count('UserExerciseSet', `"sessionId" = '${s.id}'`), 1);
    });
    await test('modern band set persists full snapshot before ack; readers use it', async () => {
      const b = await seed(on.db, 'band', ['밴드']);
      const nb = okOf(normalizeSetLoad({ hasProtocol: true, protocol: 1, resolver: 1, contract: BAND, weightKg: undefined, hasLoad: true, load: { kind: 'band', role: 'resistance', bands: [band(LATEX.id, 'yellow')] }, structured: true }));
      const row = await persistSet(on.db, { structured: true, upsert: upsertOf(b.s.id, b.u.id, b.ex.id, 1, nb.weightKg, 15), norm: nb, owner: { ownerId: b.u.id, actorId: b.u.id }, ref: { sessionId: b.s.id, exerciseId: b.ex.id, setNo: 1 }, original: {}, protocol: 1, provenance: 'modern' });
      const snap = (await readSnapshotsTx(on.db as unknown as Prisma.TransactionClient, [row.id])).get(row.id)!;
      assert.ok(snap.value.kind === 'band' && snap.value.bands[0] && !('custom' in snap.value.bands[0]) && snap.value.bands[0].levelId.endsWith(':yellow'));
      assert.equal(snap.contract.mode, 'band');
      const v = viewSetLoad(ctx(b.ex.id, NONE, 'current'), { weightKg: null, snapshot: snap });
      assert.ok(v.band && v.key, 'snapshot wins over a later bodyweight context');
    });

    /*
     * GPT 서브1 사전 점검 — 거래 밖에서 읽은 옛 값으로 미리 본 결과(stale)를 거래 안에서 지금 줄로 다시 정규화한다.
     * 차례를 정해(결정적) 실제 persistSet 으로: 미리 보기 → 더 새 값 저장 → 미리 본 것 저장.
     */
    const combLoad = (color: string, kg: number) => ({ kind: 'combined', mass: { kg }, band: { bands: [band(LATEX.id, color)] } });
    const writeAs = (sd: { u: { id: string }; ex: { id: string }; s: { id: string } }, n: NormalizeOk, reps = 5, original: Record<string, unknown> = {}) =>
      persistSet(on.db, { structured: true, upsert: upsertOf(sd.s.id, sd.u.id, sd.ex.id, 1, n.weightKg, reps), norm: n, owner: { ownerId: sd.u.id, actorId: sd.u.id }, ref: { sessionId: sd.s.id, exerciseId: sd.ex.id, setNo: 1 }, original, protocol: null, provenance: 'test' });
    const levelOf = (l: RecordedLoad | undefined) => (l?.kind === 'combined' ? l.band.bands[0] : l?.kind === 'band' ? l.bands[0] : null) as { levelId?: string } | null;
    const snapOf = async (id: string) => (await readSnapshotsTx(on.db as unknown as Prisma.TransactionClient, [id])).get(id)!;

    await test('stale legacy RIR-only (combined barbell20+yellow) cannot restore yellow over a newer red at the same kg', async () => {
      const sd = await seed(on.db, 'stale1', ['바벨', '밴드']);
      const first = await writeAs(sd, okOf(norm({ contract: COMB, structured: true, weightKg: 20, hasLoad: true, load: combLoad('yellow', 20) })));
      const pre = await snapOf(first.id);
      const stale = okOf(norm({ hasProtocol: false, protocol: undefined, contract: COMB, weightKg: 20, structured: true, existing: { weightKg: 20, load: pre.value } }));
      assert.ok(levelOf(stale.load)?.levelId?.endsWith(':yellow'), 'precondition: the prepared result carries the pre-read yellow');
      await writeAs(sd, okOf(norm({ contract: COMB, structured: true, weightKg: 20, hasLoad: true, load: combLoad('red', 20) })));
      const out = await writeAs(sd, stale, 5, { rir: 2 });
      const snap = await snapOf(first.id);
      assert.ok(levelOf(snap.value)?.levelId?.endsWith(':red'), 'newer red kept');
      assert.equal(out.norm.load?.kind, 'combined');
      assert.equal((await on.db.userExerciseSet.findUniqueOrThrow({ where: { id: first.id } })).weightKg, 20);
    });
    await test('stale legacy kg edit: raw kg projection follows the current row (30), original 25 recovered, red kept', async () => {
      const sd = await seed(on.db, 'stale2', ['바벨', '밴드']);
      const first = await writeAs(sd, okOf(norm({ contract: COMB, structured: true, weightKg: 20, hasLoad: true, load: combLoad('yellow', 20) })));
      const pre = await snapOf(first.id);
      const stale = okOf(norm({ hasProtocol: false, protocol: undefined, contract: COMB, weightKg: 25, structured: true, existing: { weightKg: 20, load: pre.value } }));
      assert.ok(stale.weightKg === 20 && stale.recover, 'precondition: prepared projection is the pre-read 20');
      await writeAs(sd, okOf(norm({ contract: COMB, structured: true, weightKg: 30, hasLoad: true, load: combLoad('red', 30) })));
      const before = await count('WorkoutLoadRecovery');
      await writeAs(sd, stale, 5, { kind: 'stale2', weightKg: 25 });
      const row = await on.db.userExerciseSet.findUniqueOrThrow({ where: { id: first.id } });
      assert.equal(row.weightKg, 30, 'no stale 20 projection');
      const snap = await snapOf(first.id);
      assert.ok(snap.value.kind === 'combined' && snap.value.mass?.kg === 30 && levelOf(snap.value)?.levelId?.endsWith(':red'));
      assert.equal(await count('WorkoutLoadRecovery'), before + 1, 'old-app kg kept as recovery, not applied');
    });
    await test('stale omission on unequal hands / machine name: newer structured mass kept', async () => {
      const dbx = await seed(on.db, 'stale3', ['덤벨']);
      const p1 = { kind: 'mass', parts: [{ kg: 10, count: 1, side: 'left' }, { kg: 12, count: 1, side: 'right' }] };
      const first = await writeAs(dbx, okOf(norm({ contract: DB, structured: true, hasLoad: true, load: p1 })));
      const stale = okOf(norm({ hasProtocol: false, protocol: undefined, contract: DB, weightKg: null, structured: true, existing: { weightKg: null, load: (await snapOf(first.id)).value } }));
      await writeAs(dbx, okOf(norm({ contract: DB, structured: true, hasLoad: true, load: { kind: 'mass', parts: [{ kg: 12, count: 1, side: 'left' }, { kg: 14, count: 1, side: 'right' }] } })));
      await writeAs(dbx, stale);
      const v = (await snapOf(first.id)).value;
      assert.ok(v.kind === 'mass' && v.parts?.[0]?.kg === 12 && v.parts?.[1]?.kg === 14, 'newer 12/14 kept');
      const cb = await seed(on.db, 'stale4', ['케이블']);
      const c1 = await writeAs(cb, okOf(norm({ contract: CABLE, structured: true, hasLoad: true, load: { kind: 'mass', kg: 30, setup: { label: 'A짐 1번' } } })));
      const staleC = okOf(norm({ hasProtocol: false, protocol: undefined, contract: CABLE, weightKg: 30, structured: true, existing: { weightKg: 30, load: (await snapOf(c1.id)).value } }));
      await writeAs(cb, okOf(norm({ contract: CABLE, structured: true, hasLoad: true, load: { kind: 'mass', kg: 30, setup: { label: 'B짐 2번' } } })));
      await writeAs(cb, staleC);
      const vc = (await snapOf(c1.id)).value;
      assert.ok(vc.kind === 'mass' && vc.setup?.key === 'b짐 2번', 'newer machine name kept');
    });
    await test('lock: a concurrent writer that commits while the prepared write waits is honoured (afterLock hook)', async () => {
      const sd = await seed(on.db, 'stale5', ['바벨', '밴드']);
      const first = await writeAs(sd, okOf(norm({ contract: COMB, structured: true, weightKg: 20, hasLoad: true, load: combLoad('yellow', 20) })));
      const stale = okOf(norm({ hasProtocol: false, protocol: undefined, contract: COMB, weightKg: 20, structured: true, existing: { weightKg: 20, load: (await snapOf(first.id)).value } }));
      await writeAs(sd, okOf(norm({ contract: COMB, structured: true, weightKg: 20, hasLoad: true, load: combLoad('green', 20) })));
      const r = await persistSet(on.db, { structured: true, upsert: upsertOf(sd.s.id, sd.u.id, sd.ex.id, 1, stale.weightKg, 5), norm: stale, owner: { ownerId: sd.u.id, actorId: sd.u.id }, ref: { sessionId: sd.s.id, exerciseId: sd.ex.id, setNo: 1 }, original: {}, protocol: null, provenance: 'test', faults: { afterLock: () => undefined } });
      assert.ok(levelOf(r.norm.load)?.levelId?.endsWith(':green'), 'effective normalization returned to the caller is the current-row one');
    });

    /* v2 명령 — 같은 거래에서 세트 · 복구 · 영수증 · 스냅샷 */
    const v2 = await seed(on.db, 'v2', ['맨몸']);
    const frozen = { id: v2.ex.id, title: 'pogo', category: '파워', slot: 'main', prescription: null, plannedSets: 3, plannedReps: 20, plannedHoldSeconds: null, perSide: false, needsWeight: false, isHold: false, equipment: ['맨몸'], bodyParts: [], intensity: '보통', thumbPath: null, load: NONE };
    await on.db.trainingSession.update({ where: { id: v2.s.id }, data: { plan: { themeKey: 'lower', themeLabel: 't', exercises: [frozen] } } });
    let failNext = false;
    const faulty: CommandDb = {
      $transaction: ((fn: (tx: unknown) => Promise<unknown>, opts?: unknown) =>
        (on.db.$transaction as unknown as (f: (tx: unknown) => Promise<unknown>, o?: unknown) => Promise<unknown>)(async (tx) => {
          const proxy = new Proxy(tx as object, {
            get(t, k, r) {
              const val = Reflect.get(t, k, r);
              if ((k === '$queryRaw' || k === '$executeRaw') && typeof val === 'function')
                return (strings: TemplateStringsArray, ...vals: unknown[]) => {
                  if (failNext && strings.join('?').includes('WorkoutRecoveryItem')) throw new Error('inject-v2-recovery');
                  return (val as (...a: unknown[]) => unknown).call(t, strings, ...vals);
                };
              return val;
            },
          });
          return fn(proxy);
        }, opts)) as unknown as CommandDb['$transaction'],
    } as unknown as CommandDb;
    let opn = 0;
    const op = () => `op_load_${String(++opn).padStart(10, '0')}`;
    const runV2 = (type: CommandType, payload: unknown, operationId = op()) =>
      execute(faulty, { actorId: v2.u.id, ownerId: v2.u.id, operationId, type, sessionId: v2.s.id, payload, runGeneration: null, loadStructured: true });

    await test('v2: promote then legacy-normalized record with recovery+snapshot in ONE transaction; injected failure leaves nothing', async () => {
      const p = await runV2('session.promote', {});
      assert.equal(p.code, 'APPLIED', JSON.stringify(p));
      const row = await on.db.trainingSession.findUniqueOrThrow({ where: { id: v2.s.id } });
      const entry = (row.plan as unknown as { exercises: { entryId: string }[] }).exercises[0].entryId;
      assert.ok(readPlanV2(row.plan as unknown as RawPlan));
      const snap = snapshotOf({ load: { kind: 'none' }, status: 'legacyIncompatible', contract: NONE, variant: null, provenance: 'legacy' });
      const payload = { clientSetId: 'lg_' + 'a'.repeat(40), entryId: entry, plannedSetKey: null, targetRevisionId: null, values: { weightKg: null, reps: 20, holdSeconds: null }, performedAt: '2026-11-16T01:20:00Z', preferredSetNo: 1, legacyLoad: { originalHash: 'h'.repeat(64), original: { weightKg: 25 } }, loadSnapshot: snap };
      const receiptsBefore = await count('WorkoutMutationReceipt');
      failNext = true;
      await assert.rejects(runV2('set.record', payload), /inject-v2-recovery/);
      failNext = false;
      assert.equal(await count('UserExerciseSet', `"sessionId" = '${v2.s.id}'`), 0, 'no canonical set');
      assert.equal(await count('WorkoutRecoveryItem', `"fingerprint" LIKE 'legacy-load:%'`), 0, 'no recovery');
      assert.equal(await count('WorkoutMutationReceipt'), receiptsBefore, 'no receipt');
      const opId = op();
      const ok1 = await runV2('set.record', payload, opId);
      assert.equal(ok1.code, 'APPLIED', JSON.stringify(ok1));
      const replay = await runV2('set.record', payload, opId);
      assert.equal(replay.replay, true, 'same operation id replays the durable outcome');
      const again = await runV2('set.record', payload);
      assert.equal(again.code, 'NO_CHANGE', 'legacy resend of the same set');
      assert.equal(await count('UserExerciseSet', `"sessionId" = '${v2.s.id}'`), 1);
      assert.equal(await count('WorkoutRecoveryItem', `"fingerprint" LIKE 'legacy-load:%'`), 1);
      const setRow = await on.db.$queryRawUnsafe<{ load: unknown; weightKg: number | null }[]>(`SELECT "load", "weightKg" FROM "UserExerciseSet" WHERE "sessionId" = '${v2.s.id}'`);
      assert.equal(setRow[0].weightKg, null);
      assert.equal(readSnapshot(setRow[0].load)?.status, 'legacyIncompatible', 'snapshot persisted in the same transaction');
    });

    await test('v2 adapter path: legacy RIR-only / kg-edit corrections re-normalize against the locked row (red kept, projection 30, recovery)', async () => {
      const w = await seed(on.db, 'v2stale', ['바벨', '밴드']);
      const fz = { id: w.ex.id, title: 'band dl', category: '파워', slot: 'main', prescription: null, plannedSets: 3, plannedReps: 5, plannedHoldSeconds: null, perSide: false, needsWeight: true, isHold: false, equipment: ['바벨', '밴드'], bodyParts: [], intensity: '보통', thumbPath: null, load: COMB };
      await on.db.trainingSession.update({ where: { id: w.s.id }, data: { plan: { themeKey: 'lower', themeLabel: 't', exercises: [fz] } } });
      const run = (type: CommandType, payload: unknown) =>
        execute(faulty, { actorId: w.u.id, ownerId: w.u.id, operationId: op(), type, sessionId: w.s.id, payload, runGeneration: null, loadStructured: true });
      assert.equal((await run('session.promote', {})).code, 'APPLIED');
      const plan = (await on.db.trainingSession.findUniqueOrThrow({ where: { id: w.s.id } })).plan as unknown as { exercises: { entryId: string }[] };
      const entry = plan.exercises[0].entryId;
      const modernReq = (color: string, kg: number) => ({ hasProtocol: true, protocol: 1, resolver: 1, contract: COMB, weightKg: kg, hasLoad: true, load: combLoad(color, kg), structured: true, variant: undefined });
      const legacyReq = (kg: number) => ({ hasProtocol: false, protocol: undefined, contract: COMB, weightKg: kg, hasLoad: false, load: undefined, structured: true, variant: undefined });
      const orig = (o: unknown) => ({ originalHash: originalPayloadHash(o as Record<string, unknown>), original: o });
      const cid = 'lg_' + 'c'.repeat(40);
      const rec = await run('set.record', { clientSetId: cid, entryId: entry, plannedSetKey: null, targetRevisionId: null, values: { weightKg: 20, reps: 5, holdSeconds: null }, performedAt: '2026-11-16T01:20:00Z', preferredSetNo: 1, loadPrep: { request: modernReq('yellow', 20), provenance: 'modern', original: orig({ a: 1 }) } });
      assert.equal(rec.code, 'APPLIED', JSON.stringify(rec));
      const verOf = async () => (await on.db.$queryRawUnsafe<{ recordVersion: number; id: string; weightKg: number | null; rir: number | null; load: unknown }[]>(`SELECT "id", "recordVersion", "weightKg", "rir", "load" FROM "UserExerciseSet" WHERE "clientSetId" = '${cid}'`))[0];
      let row = await verOf();
      const fix = (fields: object, request: object, o: object) => run('set.correct', { clientSetId: cid, expectedRecordVersion: row.recordVersion, fields, loadPrep: { request, provenance: 'x', original: orig(o) } });
      assert.ok(['APPLIED', 'NO_CHANGE'].includes((await fix({ weightKg: 20, reps: 5, holdSeconds: null }, modernReq('red', 20), { b: 1 })).code));
      row = await verOf();
      assert.ok(levelOf(readSnapshot(row.load)?.value)?.levelId?.endsWith(':red'));
      const rirOnly = await fix({ weightKg: 20, reps: 5, holdSeconds: null, rir: 1 }, legacyReq(20), { rir: 1 });
      assert.equal(rirOnly.code, 'APPLIED', JSON.stringify(rirOnly));
      row = await verOf();
      assert.ok(row.rir === 1 && levelOf(readSnapshot(row.load)?.value)?.levelId?.endsWith(':red'), 'RIR applied, red kept (omitted load = current row)');
      assert.ok(['APPLIED', 'NO_CHANGE'].includes((await fix({ weightKg: 30, reps: 5, holdSeconds: null }, modernReq('red', 30), { c: 1 })).code));
      row = await verOf();
      const recBefore = await count('WorkoutRecoveryItem', `"fingerprint" LIKE 'legacy-load:%'`);
      const oldKg = await fix({ weightKg: 25, reps: 5, holdSeconds: null }, legacyReq(25), { weightKg: 25, kind: 'v2stale' });
      assert.ok(['APPLIED', 'NO_CHANGE'].includes(oldKg.code), JSON.stringify(oldKg));
      row = await verOf();
      assert.equal(row.weightKg, 30, 'projection from the locked row, not the old-app 25');
      assert.equal(await count('WorkoutRecoveryItem', `"fingerprint" LIKE 'legacy-load:%'`), recBefore + 1, 'old-app kg recovered in the same transaction');
    });
  } finally {
    await on.db.$disconnect();
    await on.socket.stop();
    await on.pg.close();
  }

  /* 5-3 되돌리기 리허설 — 새 칸 · 표만 사라지고 옛 줄은 그대로 */
  const rb = await isolated([LOAD_SQL]);
  try {
    await test('rollback rehearsal: drops only new objects; existing rows preserved', async () => {
      const { u, ex, s } = await seed(rb.db, 'rb', ['바벨']);
      await rb.db.userExerciseSet.create({ data: { sessionId: s.id, userId: u.id, exerciseId: ex.id, date: new Date('2026-11-16T00:00:00Z'), setNo: 1, weightKg: 60, reps: 5 } });
      await rb.pg.exec(`UPDATE "UserExerciseSet" SET "load" = '{"v":1}'::jsonb`);
      await rb.pg.exec(readFileSync(ROLLBACK_SQL, 'utf8'));
      const n = await rb.pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "UserExerciseSet" WHERE "weightKg" = 60 AND "reps" = 5`);
      assert.equal(n.rows[0].n, 1);
      const col = await rb.pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'UserExerciseSet' AND column_name = 'load'`);
      assert.equal(col.rows[0].n, 0);
      const t = await rb.pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'WorkoutLoadRecovery'`);
      assert.equal(t.rows[0].n, 0);
      await rb.pg.exec(readFileSync(LOAD_SQL, 'utf8'));
      await rb.pg.exec(readFileSync(LOAD_SQL, 'utf8'));
      const again = await rb.pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'UserExerciseSet' AND column_name = 'load'`);
      assert.equal(again.rows[0].n, 1, 're-apply idempotent (IF NOT EXISTS)');
    });
  } finally {
    await rb.db.$disconnect();
    await rb.socket.stop();
    await rb.pg.close();
  }
})();

console.log(`load-contract selftest: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('  ✗ ' + f);
process.exit(failures.length ? 1 : 0);
