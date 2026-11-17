/**
 * EX-LOAD01 R1-03 — 코치 기록(writeOrgWork) · 숙제 · 코치 화면 계약 · 요약 · 부하 분석 시험.
 *
 * 1) 순수: 쓰기 전 검사(prepareOrgWork — 맨몸 kg · 꼭 적는 무게 없음 · 수량 · 모르는 운동 · 밴드 · 섞인 무게 · 변형), 처방 줄 계약 요약 · kg 글 ·
 *    받을 때의 kg 검사, 숙제 증거, 권한(업무 권한 · 공유 동의 · 가리기), 요약 · 총량(기구 열쇠 둘 · 기구 모름 · 밴드/맨몸 · 시간/횟수), 부하 배수 묶음.
 * 2) 격리 PGlite(메모리 안 Postgres — 공유 DB 에 연결하지 않는다, DATABASE_URL 을 읽지 않는다): 실제 writeOrgWorkCore(서버 writeOrgWork 가 부르는 그 코드).
 *    - 스키마 미적용 DB: 옛 쓰기 그대로(새 칸 이름을 한 번도 보내지 않음 — 보냈으면 Postgres 가 거절) · 거절이면 아무것도 안 바뀜 · 거래 중 실패 되돌림
 *    - 보류 SQL 적용 DB: 맨몸 kg → 정식 세트 비움 + 복구 기록 · 밴드 · 섞인 무게 스냅샷 · 판에 얼린 옛 계약이 이김 · 선수 세트(서로 다른 무게) 그대로 ·
 *      기구 열쇠 둘의 요약 · 거래 중 실패 되돌림 · v2 판 복구함(검사 먼저)
 *    PGlite 는 백엔드 하나라 연결 사이 잠금 경합은 증명하지 않는다.
 *
 * 실행: node --import ./scripts/alias-register.mjs scripts/load-r1-org-selftest.mts
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { resolveRecordingContract, type RecordingContract } from '@/lib/workout/load/contract';
import { overridesFor } from '@/lib/workout/load/overrides';
import { contractOfLibraryRow } from '@/lib/workout/load/frozen';
import { readSnapshot, snapshotOf } from '@/lib/workout/load/snapshot';
import { readSnapshotsTx, writeSetSnapshot } from '@/lib/workout/load/store';
import { gateRows, forSummary, forTonnage, planContextOf } from '@/lib/workout/load/plan-gate';
import { viewSetLoad } from '@/lib/workout/load/gate';
import { summarizeSets, totalVolumeKg, volumeOf, formatSummary } from '@/lib/workout/summarize';
import { applySummaryTx, compatibleLoadRows } from '@/lib/workout/summary-core';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { lockOwner } from '@/lib/workout/v2/store';
import { prepareOrgWork, writeOrgWorkCore, type OrgLibraryRow, type OrgWorkDeps, type OrgWorkDone, type OrgWorkRejection } from '@/lib/org/team-work-core';
import { cleanException, cleanLines, lineLoadHint, lineLoadOf, lineWeightText, memberWork, type MemberWorkInput } from '@/lib/org/team-session';
import { setMeets } from '@/lib/org/homework';
import { hasCapability } from '@/lib/org/capabilities';
import { redactEventDetail, type ScopeLens } from '@/lib/org/dto-scope';
import { cleanOrgWork, type OrgWorkItem } from '@/lib/org/team-work';
import { linesToWork } from '@/lib/org/team-session';
import { BAND_CATALOG_REVISION, BAND_SERIES, cleanBandComponent, type BandComponent } from '@/lib/workout/load/band-catalog';
import { LOAD_PROTOCOL } from '@/lib/workout/load/protocol';
import { RESOLVER_VERSION } from '@/lib/workout/load/contract';
import { EMPTY_LOAD_DRAFT, buildSetLoad as buildWebSetLoad } from '@/components/load/set-load';

let passed = 0;
const failures: string[] = [];
const outerTest = (name: string, fn: () => void | Promise<void>) => test(name, fn);
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message.replace(/\n/g, ' ').slice(0, 500) : String(e)}`);
  }
}

/* ─────────────────────────── 표본 ─────────────────────────── */

const POGO = '258c0eee-85fe-46dd-b6a1-d2639bb58345'; /* 맨몸 */
const BENCH = 'cc1f99c3-c33b-495c-a0b0-02e1c0387121'; /* 바벨 · 허용 목록 */
const BAND_DEADLIFT = '50298d2b-fd1f-4265-8b67-e95c7815335e'; /* 바벨 + 밴드(검토한 combined) */
const INVERTED_ROW = '92ec03d2-93e6-4d86-ae50-4ae590552a1b'; /* 봉은 받침 → 무게 없음 */
const C = (equipment: string[], exerciseId?: string) => resolveRecordingContract({ equipment, exerciseId: exerciseId ?? null, overrides: exerciseId ? overridesFor(exerciseId) : null });
const NONE = C(['맨몸'], POGO);
const BAR = C(['바벨', '벤치'], BENCH);
const DB = C(['덤벨']);
const CABLE = C(['케이블']);
const BAND = C(['밴드']);
const COMB = C(['바벨', '밴드'], BAND_DEADLIFT);
const ALT = resolveRecordingContract({ equipment: ['덤벨', '밴드'], overrides: { use: 'alternative' } });


const LATEX = BAND_SERIES.find((x) => x.id === 'theraband-professional-latex-band')!;
const bandOf = (color: string): BandComponent => cleanBandComponent({ catalog: BAND_CATALOG_REVISION, seriesId: LATEX.id, levelId: LATEX.levels.find((l) => l.id.endsWith(':' + color))!.id })!;
const RED = bandOf('red');
const BLUE = bandOf('blue');
/** 새 화면(코치 예외 줄)이 싣는 무게 기록 칸 — 운동 화면 세트와 같은 약속 */
const modern = (load: unknown, extra: Record<string, unknown> = {}) => ({ loadProtocol: LOAD_PROTOCOL, loadResolver: RESOLVER_VERSION, load, ...extra });

const contractsOf = (m: Record<string, RecordingContract>) => (id: string) => m[id] ?? null;
const titles = (id: string) => ({ bar: '벤치 프레스', pogo: '포고 홉', db: '덤벨 로우', band: '밴드 풀어파트', comb: '밴드 데드리프트', alt: '밴드 또는 덤벨', cable: '케이블 로우' })[id] ?? null;
const PURE = { bar: BAR, pogo: NONE, db: DB, band: BAND, comb: COMB, alt: ALT, cable: CABLE };
const prep = (items: { exerciseId: string; sets: unknown[] }[], structured = false) =>
  prepareOrgWork(items as never, contractsOf(PURE), titles, structured);
const rej = (r: ReturnType<typeof prep>): OrgWorkRejection => {
  if (r.ok) throw new Error('expected rejection');
  return r;
};

/* ─────────────────────────── 1) 쓰기 전 검사(순수) ─────────────────────────── */

await test('prepare: required mass missing is rejected (no raw fallback), with exercise + set index', () => {
  const r = rej(prep([{ exerciseId: 'bar', sets: [{ weightKg: 60, reps: 5, holdSeconds: null }, { weightKg: null, reps: 5, holdSeconds: null }] }]));
  assert.equal(r.code, 'LOAD_REQUIRED');
  assert.equal(r.exerciseId, 'bar');
  assert.equal(r.setIndex, 1);
  assert.match(r.error, /벤치 프레스 2세트/);
  assert.equal(rej(prep([{ exerciseId: 'bar', sets: [{ weightKg: null, reps: 5, holdSeconds: null }] }], true)).code, 'LOAD_REQUIRED', 'schema-on too');
});

await test('prepare: invalid quantity (string / negative / out of range / fractional reps / zero) is rejected', () => {
  const ok = { weightKg: 20, reps: 5, holdSeconds: null };
  const cases: unknown[] = [
    { ...ok, weightKg: 'x' },
    { ...ok, weightKg: -5 },
    { ...ok, weightKg: 9999 },
    { ...ok, weightKg: 0 },
    { ...ok, weightKg: Number.NaN },
    { ...ok, reps: 1.5 },
    { ...ok, reps: 0 },
    { ...ok, holdSeconds: 99999 },
    null,
    'set',
  ];
  for (const bad of cases) {
    const r = rej(prep([{ exerciseId: 'db', sets: [ok, bad] }]));
    assert.equal(r.code, 'ORG_INVALID_QUANTITY', JSON.stringify(bad));
    assert.equal(r.setIndex, 1);
  }
});

await test('prepare: unknown exercise is rejected (no silent filtering)', () => {
  const r = rej(prep([{ exerciseId: 'bar', sets: [{ weightKg: 60, reps: 5, holdSeconds: null }] }, { exerciseId: 'ghost', sets: [{ weightKg: null, reps: 5, holdSeconds: null }] }]));
  assert.equal(r.code, 'ORG_UNKNOWN_EXERCISE');
  assert.equal(r.exerciseId, 'ghost');
});

await test('prepare: bodyweight bogus kg — schema-off legacy unchanged (raw kept, not claimed), schema-on canonical quantity + recovery', () => {
  const off = prep([{ exerciseId: 'pogo', sets: [{ weightKg: 20, reps: 10, holdSeconds: null }] }]);
  assert.ok(off.ok);
  assert.equal(off.rows[0].norm.legacyUnchanged, true);
  assert.equal(off.rows[0].norm.incompatibleKept, true);
  assert.equal(off.rows[0].norm.weightKg, 20, 'exactly the old write');
  assert.equal(off.rows[0].norm.load, undefined, 'no structured value claimed');
  const on = prep([{ exerciseId: 'pogo', sets: [{ weightKg: 20, reps: 10, holdSeconds: null }] }], true);
  assert.ok(on.ok);
  assert.equal(on.rows[0].norm.weightKg, null);
  assert.equal(on.rows[0].norm.recover, true);
  assert.deepEqual(on.rows[0].norm.load, { kind: 'none' });
});

await test('prepare: band / combined / alternative follow the shared normalizer', () => {
  const b = prep([{ exerciseId: 'band', sets: [{ weightKg: null, reps: 15, holdSeconds: null }] }], true);
  assert.ok(b.ok && b.rows[0].norm.load?.kind === 'band' && b.rows[0].norm.status === 'unknownBand', 'band without identity stays unknown band');
  const bk = prep([{ exerciseId: 'band', sets: [{ weightKg: 5, reps: 15, holdSeconds: null }] }], true);
  assert.ok(bk.ok && bk.rows[0].norm.weightKg === null && bk.rows[0].norm.recover, 'band kg is never ordinary kg');
  const cm = prep([{ exerciseId: 'comb', sets: [{ weightKg: 60, reps: 5, holdSeconds: null }] }], true);
  assert.ok(cm.ok && cm.rows[0].norm.load?.kind === 'combined' && cm.rows[0].norm.weightKg === 60, 'combined keeps its mass component only');
  const alt = prep([{ exerciseId: 'alt', sets: [{ weightKg: 20, reps: 8, holdSeconds: null }, { weightKg: null, reps: 8, holdSeconds: null }] }], true);
  assert.ok(alt.ok && alt.rows[0].norm.variant === 'mass' && alt.rows[1].norm.variant === 'band');
});

await test('semantic DTO: cleanOrgWork keeps protocol/resolver/load/variant verbatim; absence stays legacy absence', () => {
  const raw = [{ exerciseId: 'band', sets: [{ weightKg: null, reps: 5, holdSeconds: null, ...modern({ kind: 'band', role: 'resistance', bands: [RED] }) }, { reps: 8 }] }];
  const c = cleanOrgWork(raw, new Set(['band']));
  assert.ok(Array.isArray(c));
  assert.equal(c[0].sets[0].loadProtocol, LOAD_PROTOCOL);
  assert.deepEqual(c[0].sets[0].load, { kind: 'band', role: 'resistance', bands: [RED] });
  assert.equal('loadProtocol' in c[0].sets[1], false, 'legacy set gets no protocol field');
  assert.equal('load' in c[0].sets[1], false);
  const bad = cleanOrgWork([{ exerciseId: 'band', sets: [{ reps: 5, loadProtocol: '1' }] }], new Set(['band']));
  assert.ok(!Array.isArray(bad) && /무게 기록 형식/.test(bad.error), 'malformed shape is an error, not stripped');
  assert.ok(!Array.isArray(cleanOrgWork([{ exerciseId: 'band', sets: [{ reps: 5, load: [1, 2] }] }], new Set(['band']))));
});

await test('semantic prepare: modern band keeps its component (no downgrade to unknown); schema-off rejects before replacement', () => {
  const on = prep([{ exerciseId: 'band', sets: [{ weightKg: null, reps: 15, holdSeconds: null, ...modern({ kind: 'band', role: 'resistance', bands: [RED, BLUE] }) }] }], true);
  assert.ok(on.ok);
  assert.equal(on.rows[0].norm.status, 'ok');
  assert.deepEqual(on.rows[0].norm.load, { kind: 'band', role: 'resistance', bands: [RED, BLUE] });
  const off = rej(prep([{ exerciseId: 'band', sets: [{ weightKg: null, reps: 15, holdSeconds: null, ...modern({ kind: 'band', role: 'resistance', bands: [RED] }) }] }], false));
  assert.equal(off.code, 'LOAD_UNSUPPORTED', 'schema-off modern band is not silently stored as a legacy unknown band');
  assert.equal(rej(prep([{ exerciseId: 'comb', sets: [{ weightKg: 60, reps: 5, holdSeconds: null, ...modern({ kind: 'combined', mass: { kg: 60 }, band: { role: 'resistance', bands: [RED] } }) }] }], false)).code, 'LOAD_UNSUPPORTED');
  assert.equal(rej(prep([{ exerciseId: 'band', sets: [{ weightKg: null, reps: 15, holdSeconds: null, ...modern({ kind: 'band', role: 'resistance', bands: [RED] }, { loadProtocol: 2 }) }] }], true)).code, 'LOAD_VERSION', 'unknown protocol');
  assert.equal(rej(prep([{ exerciseId: 'band', sets: [{ weightKg: null, reps: 15, holdSeconds: null, ...modern({ kind: 'band', role: 'resistance', bands: [RED] }, { loadResolver: 99 }) }] }], true)).code, 'LOAD_VERSION', 'unknown resolver');
  for (const structured of [true, false])
    assert.equal(rej(prep([{ exerciseId: 'band', sets: [{ weightKg: null, reps: 15, holdSeconds: null, load: { kind: 'band', role: 'resistance', bands: [RED] } }] }], structured)).code, 'LOAD_INVALID', `a load without protocol is never read as a legacy item (structured ${structured})`);
  assert.equal(rej(prep([{ exerciseId: 'band', sets: [{ weightKg: null, reps: 15, holdSeconds: null, ...modern({ kind: 'band', role: 'resistance', bands: [{ seriesId: 'nope', levelId: 'nope:red' }] }) }] }], true)).code, 'LOAD_INVALID', 'unknown band component');
});

await test('semantic prepare: contradictory kg, unequal implements, setup, alternative variant', () => {
  assert.equal(rej(prep([{ exerciseId: 'db', sets: [{ weightKg: 70, reps: 5, holdSeconds: null, ...modern({ kind: 'mass', kg: 60 }) }] }], true)).code, 'LOAD_CONFLICT', 'kg alongside differs from the structured mass');
  const parts = [{ kg: 20, count: 1, side: 'left' }, { kg: 22, count: 1, side: 'right' }];
  const un = prep([{ exerciseId: 'db', sets: [{ weightKg: null, reps: 8, holdSeconds: null, ...modern({ kind: 'mass', parts }) }] }], true);
  assert.ok(un.ok && un.rows[0].norm.load?.kind === 'mass' && un.rows[0].norm.load.parts?.length === 2 && un.rows[0].norm.weightKg === null, 'unequal implements kept, no invented single kg');
  assert.equal(rej(prep([{ exerciseId: 'db', sets: [{ weightKg: null, reps: 8, holdSeconds: null, ...modern({ kind: 'mass', parts }) }] }], false)).code, 'LOAD_UNSUPPORTED');
  const st = prep([{ exerciseId: 'cable', sets: [{ weightKg: 40, reps: 10, holdSeconds: null, ...modern({ kind: 'mass', kg: 40, setup: { label: '2번 케이블' } }) }] }], true);
  assert.ok(st.ok && st.rows[0].norm.load?.kind === 'mass' && st.rows[0].norm.load.setup?.label === '2번 케이블');
  assert.equal(rej(prep([{ exerciseId: 'alt', sets: [{ weightKg: null, reps: 8, holdSeconds: null, ...modern({ kind: 'band', role: 'resistance', bands: [RED] }) }] }], true)).code, 'LOAD_REQUIRED', 'modern alternative must name its variant');
  const alt = prep([{ exerciseId: 'alt', sets: [{ weightKg: null, reps: 8, holdSeconds: null, ...modern({ kind: 'band', role: 'resistance', bands: [RED] }, { variant: 'band' }) }] }], true);
  assert.ok(alt.ok && alt.rows[0].norm.variant === 'band' && alt.rows[0].norm.load?.kind === 'band');
  const legacy = prep([{ exerciseId: 'band', sets: [{ weightKg: null, reps: 15, holdSeconds: null }] }], true);
  assert.ok(legacy.ok && legacy.rows[0].norm.status === 'unknownBand', 'legacy item keeps the legacy behaviour');
});

await test('semantic WorkLine path (real production chain): web builder → cleanLines (request check) → linesToWork → prepare', () => {
  const built = buildWebSetLoad({ contract: COMB, structured: true, weightKg: 60, draft: { ...EMPTY_LOAD_DRAFT, role: 'resistance', bands: [RED] }, editing: true });
  assert.ok(built.ok && built.load?.kind === 'combined');
  const line = { exerciseId: 'comb', sets: 3, reps: 5, weightKg: built.weightKg, loadProtocol: LOAD_PROTOCOL, load: built.load, loadResolver: built.loadResolver };
  const known = { exercises: new Set(['comb', 'band']), guides: new Set<string>() };
  const check = { massOf: () => true, nameOf: titles, contractOf: contractsOf(PURE), structured: true };
  const lines = cleanLines([line], known, true, check);
  assert.ok(Array.isArray(lines));
  assert.deepEqual(lines[0].load, built.load, 'request-time cleaner keeps the semantic load');
  const off = cleanLines([line], known, true, { ...check, structured: false });
  assert.ok(!Array.isArray(off) && /업데이트/.test(off.error), 'schema-off request is rejected with the shared message');
  assert.ok(Array.isArray(cleanLines([line], known, false)) && !('load' in (cleanLines([line], known, false) as { load?: unknown }[])[0]), 'group-wide lines never carry load');
  const work = linesToWork(lines, new Map([['comb', { sets: 3, reps: 5, holdSeconds: null }]]));
  assert.equal(work[0].sets.length, 3);
  assert.deepEqual(work[0].sets[0].load, built.load);
  const p = prepareOrgWork(work, contractsOf(PURE), titles, true);
  assert.ok(p.ok && p.rows.every((r) => r.norm.load?.kind === 'combined' && (r.norm.load as { band: { bands: unknown[] } }).band.bands.length === 1));
  const said = lineWeightText(lines[0], lineLoadOf(COMB), COMB);
  assert.match(said.text ?? '', /빨강/, 'coach display uses the shared describer with the actual band');
});

/* ─────────────────────────── 2) 처방 줄 계약 · 받을 때 검사(순수) ─────────────────────────── */

await test('line contract: kg only when the contract accepts mass; raw kg kept as context otherwise', () => {
  const pogo = lineLoadOf(NONE);
  assert.equal(pogo.mass, false);
  assert.deepEqual(lineWeightText({ weightKg: 20 }, pogo), { text: null, rawKg: 20 }, 'bodyweight kg never shown as ordinary kg');
  assert.deepEqual(lineWeightText({ weightKg: 20 }, null), { text: null, rawKg: 20 }, 'unknown contract (deleted exercise) is not ordinary kg');
  const db = lineLoadOf(DB);
  assert.deepEqual(lineWeightText({ weightKg: 20 }, db), { text: '20kg(한 손)', rawKg: null });
  assert.equal(lineWeightText({ weightKg: 40 }, lineLoadOf(CABLE)).text, '40kg(기구 설정값)');
  assert.equal(lineWeightText({ weightKg: 20 }, db, DB).text, '20kg(한 손 · 한 개)', 'server path speaks through the shared describer');
  assert.deepEqual(lineWeightText({ weightKg: 20 }, pogo, NONE), { text: null, rawKg: 20 });
  assert.equal(lineLoadHint(lineLoadOf(BAND)), '밴드 · 선수가 고름');
  assert.equal(lineLoadHint(lineLoadOf(COMB)), '무게(봉 포함) + 밴드');
  assert.equal(lineLoadOf(COMB).band, true);
  assert.deepEqual(lineLoadOf(ALT).variants, ['band', 'mass']);
  assert.equal(lineLoadOf(C(['바벨'], INVERTED_ROW)).mass, false, 'reviewed fixed support');
});

await test('cleanLines / cleanException reject new kg on non-mass exercises; unknown stays permissive', () => {
  const known = { exercises: new Set(['pogo', 'db', 'gone']), guides: new Set<string>() };
  const check = { massOf: (id: string) => (id === 'pogo' ? false : id === 'db' ? true : null), nameOf: (id: string) => titles(id) };
  const bad = cleanLines([{ exerciseId: 'pogo', sets: 3, reps: 10, weightKg: 20 }], known, true, check);
  assert.ok('error' in bad && /포고 홉: 이 운동은 무게 없이/.test(bad.error));
  const ok = cleanLines([{ exerciseId: 'db', sets: 3, reps: 10, weightKg: 20 }, { exerciseId: 'pogo', reps: 10 }, { exerciseId: 'gone', weightKg: 5 }], known, true, check);
  assert.ok(Array.isArray(ok) && ok.length === 3);
  const ex = cleanException({ items: [{ planId: 'p1', kind: 'reduced', items: [{ exerciseId: 'pogo', weightKg: 10 }] }] }, ['p1'], known, check);
  assert.ok(ex && 'error' in ex, 'exception path uses the same check');
  assert.ok(Array.isArray(cleanLines([{ exerciseId: 'pogo', weightKg: 20 }], known, true)), 'no check given → old behaviour');
});

/* ─────────────────────────── 3) 숙제 증거 · 권한(순수) ─────────────────────────── */

await test('homework evidence: an unaccepted legacy kg alone does not satisfy a free-form item', () => {
  const s = { exerciseId: 'pogo', reps: null, holdSeconds: null, weightKg: 20, sessionId: 's', at: 1 };
  assert.equal(setMeets({ exerciseId: 'pogo' }, { ...s, loadRecorded: false }), false);
  assert.equal(setMeets({ exerciseId: 'pogo' }, { ...s, loadRecorded: true }), true);
  assert.equal(setMeets({ exerciseId: 'pogo' }, s), true, 'old callers unchanged');
  assert.equal(setMeets({ exerciseId: 'pogo', reps: 10 }, { ...s, reps: 12, loadRecorded: false }), true, 'count evidence intact');
});

await test('permissions: org capability and athlete consent gate the coach writer', () => {
  assert.equal(hasCapability({ role: 'PLAYER' }, 'training.recordForAthlete'), false);
  assert.equal(hasCapability({ role: 'STAFF' }, 'training.recordForAthlete'), true);
  assert.equal(hasCapability({ role: 'STAFF', status: 'LEFT' } as never, 'training.recordForAthlete'), false);
  const base: MemberWorkInput = {
    memberId: 'm1',
    roster: ['m1'],
    plans: [{ id: 'p1', title: 't', scope: 'all', groupName: null, memberIds: [], replacesPlanId: null, valueMode: 'shared', position: 0, items: [{ exerciseId: 'db', sets: 2, reps: 5 }], actualItems: null }],
    exception: { items: [{ planId: 'p1', kind: 'reduced', items: [{ exerciseId: 'db', sets: 1, reps: 5, weightKg: 20 }] }], extra: [], separate: [] },
    values: [],
    defaults: new Map([['db', { sets: 3, reps: 8, holdSeconds: null }]]),
    linked: new Set(),
    sameDay: new Set(),
    hasUser: true,
    active: true,
    canTrain: true,
    canPitch: true,
  };
  const ok = memberWork(base);
  assert.equal(ok.writeTraining, true);
  assert.deepEqual(ok.work, [{ exerciseId: 'db', sets: [{ weightKg: 20, reps: 5, holdSeconds: null }] }]);
  const priv = memberWork({ ...base, canTrain: false });
  assert.equal(priv.writeTraining, false, 'training consent off → coach writer is not called');
  assert.deepEqual(priv.work, []);
  assert.equal(memberWork({ ...base, active: false }).writeTraining, false, 'left member');
  assert.equal(memberWork({ ...base, hasUser: false }).writeTraining, false, 'unlinked member');
});

await test('redaction: loadIssue is a training field (hidden without training scope)', () => {
  const member = { memberId: 'm1', nickname: 'a', reasons: ['load_rejected'], loadIssue: { code: 'LOAD_REQUIRED', error: 'x', exerciseId: 'bar', setIndex: 0 } };
  const d = { members: [member], plans: [], others: [] };
  const seeAll: ScopeLens = { members: null, training: true, trainingTargets: null, checkin: true, checkinTargets: null };
  const noTraining: ScopeLens = { ...seeAll, training: false };
  assert.deepEqual((redactEventDetail(d, seeAll).members[0] as typeof member).loadIssue, member.loadIssue);
  assert.equal((redactEventDetail(d, noTraining).members[0] as typeof member).loadIssue, null);
});

/* ─────────────────────────── 4) 요약 · 총량 · 부하(순수) ─────────────────────────── */

const sid = (n: number) => `set-${n}`;
const cableSnap = (setup: string, kg: number) =>
  snapshotOf({ load: { kind: 'mass', basis: 'stackSetting', apparatusFamily: '케이블', setup: { key: setup, label: setup.toUpperCase() }, kg, parts: null }, status: 'ok', contract: CABLE, variant: null, provenance: 'test' });
const planEx = [
  { id: 'cable', equipment: ['케이블'], category: '상체 스트렝스', isHold: false, load: CABLE },
  { id: 'bar', equipment: ['바벨', '벤치'], category: '상체 스트렝스', isHold: false, load: BAR },
  { id: 'band', equipment: ['밴드'], category: '암케어', isHold: false, load: BAND },
  { id: 'pogo', equipment: ['맨몸'], category: '파워', isHold: false, load: NONE },
  { id: 'plank', equipment: ['맨몸'], category: '코어', isHold: true, load: C(['맨몸']) },
];

await test('analytics: two setups are never pooled (summary withheld, stack tonnage per setup, not in kg total)', () => {
  const rows = [
    { id: sid(1), exerciseId: 'cable', weightKg: 100, reps: 10, holdSeconds: null },
    { id: sid(2), exerciseId: 'cable', weightKg: 20, reps: 10, holdSeconds: null },
    { id: sid(3), exerciseId: 'bar', weightKg: 60, reps: 5, holdSeconds: null },
  ];
  const snaps = new Map([
    [sid(1), cableSnap('a', 100)],
    [sid(2), cableSnap('b', 20)],
  ]);
  const gated = gateRows(rows, planContextOf(planEx), snaps);
  const sum = summarizeSets(forSummary(gated));
  const cable = sum.find((s) => s.exerciseId === 'cable')!;
  assert.equal(cable.weightKg, null, 'not max(100, 20) across machines');
  assert.equal(cable.weightWithheld, true);
  assert.equal(cable.setsDone, 2, 'sets kept');
  assert.equal(cable.repsDone, 10, 'reps kept');
  assert.match(formatSummary(cable), /무게는 기구마다 따로/);
  assert.equal(sum.find((s) => s.exerciseId === 'bar')!.weightKg, 60);
  const t = forTonnage(gated);
  assert.equal(totalVolumeKg(t), 300, 'kg total = measured mass only');
  const v = volumeOf(t);
  assert.equal(v.measuredKg, 300);
  assert.deepEqual(v.stacks.map((s) => [s.setupKey, s.settingTotal]).sort(), [['a', 1000], ['b', 200]]);
  const same = summarizeSets(forSummary(gateRows(rows.slice(0, 2), planContextOf(planEx), new Map([[sid(1), cableSnap('a', 100)], [sid(2), cableSnap('a', 20)]]))));
  assert.equal(same[0].weightKg, 100, 'one setup → heaviest within that setup');
  assert.equal(same[0].weightWithheld, undefined);
});

await test('analytics: indicated load without setup is withheld from tonnage; band/none never contribute kg; time/count intact', () => {
  const rows = [
    { id: sid(11), exerciseId: 'cable', weightKg: 40, reps: 10, holdSeconds: null },
    { id: sid(12), exerciseId: 'band', weightKg: 5, reps: 15, holdSeconds: null },
    { id: sid(13), exerciseId: 'pogo', weightKg: 20, reps: 20, holdSeconds: null },
    { id: sid(14), exerciseId: 'plank', weightKg: null, reps: null, holdSeconds: 45 },
  ];
  const gated = gateRows(rows, planContextOf(planEx), null);
  const t = forTonnage(gated);
  assert.equal(totalVolumeKg(t), 0);
  const v = volumeOf(t);
  assert.equal(v.stacks.length, 0);
  assert.equal(v.withheldSets, 1, 'the no-setup cable setting is explicitly withheld');
  const sum = summarizeSets(forSummary(gated));
  assert.equal(sum.find((s) => s.exerciseId === 'band')!.weightKg, null);
  assert.equal(sum.find((s) => s.exerciseId === 'pogo')!.weightKg, null);
  assert.equal(sum.find((s) => s.exerciseId === 'pogo')!.repsDone, 20);
  assert.equal(sum.find((s) => s.exerciseId === 'plank')!.holdSecondsDone, 45);
  assert.equal(sum.find((s) => s.exerciseId === 'cable')!.weightKg, 40, 'single no-setup display summary stays a display value');
  assert.equal(totalVolumeKg(rows), 40 * 10 + 5 * 15 + 20 * 20, 'callers without view keep the old total');
});

await test('ACWR weight factor rows: only keyed metric kg, grouped by exercise + comparison key', () => {
  const dumbbellDay = viewSetLoad({ exerciseId: 'x', contract: DB, evidence: 'contract' }, { weightKg: 20 });
  const barbellDay = viewSetLoad({ exerciseId: 'x', contract: C(['바벨']), evidence: 'contract' }, { weightKg: 60 });
  const cableDay = viewSetLoad({ exerciseId: 'c', contract: CABLE, evidence: 'contract' }, { weightKg: 50 });
  const pogoDay = viewSetLoad({ exerciseId: 'p', contract: NONE, evidence: 'contract' }, { weightKg: 20 });
  const views = [dumbbellDay, barbellDay, cableDay, pogoDay];
  const input = [
    { exerciseId: 'x', weightKg: 20, i: 0 },
    { exerciseId: 'x', weightKg: 60, i: 1 },
    { exerciseId: 'c', weightKg: 50, i: 2 },
    { exerciseId: 'p', weightKg: 20, i: 3 },
    { exerciseId: 'q', weightKg: null, i: 4 },
  ];
  const r = compatibleLoadRows(input, (row) => views[row.i] ?? { metricKg: null, key: null });
  assert.notEqual(r.rows[0].exerciseId, r.rows[1].exerciseId, 'dumbbell per-hand and barbell total never share a reference');
  assert.equal(r.rows[2].weightKg, null, 'summary-level stack setting has no setup → withheld');
  assert.equal(r.rows[3].weightKg, null, 'bodyweight legacy kg withheld');
  assert.equal(r.compared, 2);
  assert.equal(r.withheld, 2);
  assert.equal(r.rows[4].exerciseId, 'q', 'no kg row unchanged (time/count path)');
});

await test('record detail totals: gate-viewed rows only, stack settings and context-less gate rows withheld, legacy rows unchanged', async () => {
  const { recordTotals, recordLoadView, applyRecordSets } = await import('@/lib/workout/record-model');
  const bar = viewSetLoad({ exerciseId: 'bar', contract: BAR, evidence: 'contract' }, { weightKg: 60 });
  const cabA = viewSetLoad({ exerciseId: 'cable', contract: CABLE, evidence: 'contract' }, { weightKg: 100, snapshot: cableSnap('a', 100) });
  const cabB = viewSetLoad({ exerciseId: 'cable', contract: CABLE, evidence: 'contract' }, { weightKg: 20, snapshot: cableSnap('b', 20) });
  const set = (setNo: number, v: ReturnType<typeof viewSetLoad>, reps: number, view = true) => ({ setNo, weightKg: v.displayKg, reps, holdSeconds: null, rir: null, metricKg: v.metricKg, loadStatus: v.status, rawKg: v.rawKg, ...(view ? { loadView: recordLoadView(v) } : {}) });
  const meta = { perHand: false, perSide: false, inMinutes: false };
  const base = { title: 't', category: 'c', planned: null, done: true, setsDone: null, repsDone: null, holdSecondsDone: null, weightKg: null, meta, method: 'exercise' as const };
  const barEx = applyRecordSets({ ...base, id: 'bar' }, [set(1, bar, 5)], true, false);
  const cabEx = applyRecordSets({ ...base, id: 'cable' }, [set(1, cabA, 10), set(2, cabB, 10)], true, false);
  assert.equal(cabEx.weightKg, null, 'record summary does not pool machine A and B');
  const t = recordTotals([barEx, cabEx], true);
  assert.equal(t.volumeKg, 300, 'kg total = measured mass only');
  assert.equal(t.volumeWithheldSets, 2, 'both stack-setting sets explicitly withheld');
  const noView = recordTotals([applyRecordSets({ ...base, id: 'bar' }, [set(1, bar, 5, false)], true, false)], true);
  assert.equal(noView.volumeKg, 0);
  assert.equal(noView.volumeWithheldSets, 1, 'a gate row without context is withheld, not guessed');
  const legacy = recordTotals([applyRecordSets({ ...base, id: 'x' }, [{ setNo: 1, weightKg: 40, reps: 10, holdSeconds: null, rir: null }], true, false)], true);
  assert.equal(legacy.volumeKg, 400, 'rows without gate fields keep the old total');
  assert.equal(legacy.volumeWithheldSets, undefined);
});

/* ─────────────────────────── 5) 격리 DB ─────────────────────────── */

async function isolated(apply: string[]) {
  const pg = await PGlite.create();
  await pg.exec(execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  for (const f of apply) await pg.exec(readFileSync(f, 'utf8'));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
  await socket.start();
  const port = (socket as unknown as { server: { address(): { port: number } } }).server.address().port;
  const url = `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
  assert.ok(url.includes('127.0.0.1'));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
  return { pg, socket, db };
}

const LOAD_SQL = 'prisma/pending-migrations/20261116150000_ex_load01_recording_contract/migration.sql';
const V2_SQL = 'prisma/pending-migrations/20261113120000_workout_v2_foundation/migration.sql';
const DATE = '2026-11-16';
const DAY = new Date(`${DATE}T00:00:00Z`);

type Lib = { id: string; equipment: string[]; category?: string; reps?: number | null; holdSeconds?: number | null; title?: string };
async function seed(db: PrismaClient, tag: string, lib: Lib[]) {
  const player = await db.user.create({ data: { email: `${tag}-p@org.test`, nickname: `${tag}p`, password: 'x' } });
  const coach = await db.user.create({ data: { email: `${tag}-c@org.test`, nickname: `${tag}c`, password: 'x' } });
  for (const l of lib)
    await db.exerciseVideo.create({
      data: { id: l.id, title: l.title ?? `ex-${l.id.slice(0, 4)}`, description: '', category: l.category ?? '상체 스트렝스', equipment: l.equipment, bodyParts: [], intensity: '보통', reps: l.reps === undefined ? 10 : l.reps, holdSeconds: l.holdSeconds ?? null } as unknown as Prisma.ExerciseVideoCreateInput,
    });
  return { player, coach };
}

/**
 * 서버의 라이브러리 캐시를 흉내 — 라이브러리 줄은 거래 밖에서 한 번 읽어 둔다(서버도 캐시라 거래 안에서 DB 를 다시 묻지 않는다).
 * PGlite 연결은 하나라 거래 안에서 db 로 다시 물으면 거래가 끝날 때까지 기다리게 된다.
 */
async function depsOf(db: PrismaClient, structured: boolean, over: Partial<OrgWorkDeps> = {}): Promise<OrgWorkDeps> {
  const all = await db.exerciseVideo.findMany();
  const rows = (ids: readonly string[]) => all.filter((r) => ids.includes(r.id));
  return {
    db,
    exercisesByIds: async (ids) => rows(ids) as unknown as OrgLibraryRow[],
    currentContracts: async (ids) => new Map(rows(ids).map((r) => [r.id, contractOfLibraryRow(r)])),
    structured,
    v2Applied: false,
    now: () => new Date('2026-11-16T03:00:00Z'),
    ...over,
  };
}

const done = (r: Awaited<ReturnType<typeof writeOrgWorkCore>>): OrgWorkDone => {
  if (!r.ok) throw new Error(`expected saved, got ${r.code} ${r.error}`);
  return r;
};
const rejected = (r: Awaited<ReturnType<typeof writeOrgWorkCore>>): OrgWorkRejection => {
  if (r.ok) throw new Error(`expected rejection, got ${r.outcome}`);
  return r;
};

/** 바뀌면 안 되는 것 — 세트 · 판 · 요약 줄 전부의 모양 */
async function stateOf(db: PrismaClient, userId: string) {
  const [sets, sessions, logs] = await Promise.all([
    db.userExerciseSet.findMany({ where: { userId }, orderBy: [{ exerciseId: 'asc' }, { setNo: 'asc' }], select: { exerciseId: true, setNo: true, weightKg: true, reps: true, holdSeconds: true, orgEventId: true, enteredById: true } }),
    db.trainingSession.findMany({ where: { userId }, select: { id: true, themeKey: true, plan: true } }),
    db.userExerciseLog.findMany({ where: { userId }, orderBy: { exerciseId: 'asc' }, select: { exerciseId: true, setsDone: true, repsDone: true, weightKg: true } }),
  ]);
  return JSON.stringify({ sets, sessions, logs });
}

await (async () => {
  /* 5-1 스키마 미적용 DB — 꺼짐 길(새 칸 이름이 SQL 에 나오면 이 DB 는 '없는 칸'으로 거절한다) */
  const off = await isolated([]);
  try {
    const BAND_OFF = 'bbbbbbbb-0000-4000-8000-00000000band';
    const { player, coach } = await seed(off.db, 'off', [
      { id: BENCH, equipment: ['바벨', '벤치'], title: '벤치 프레스' },
      { id: POGO, equipment: ['맨몸'], title: '포고 홉', category: '파워' },
      { id: BAND_OFF, equipment: ['밴드'], title: '밴드 풀어파트', category: '암케어' },
    ]);
    const deps = await depsOf(off.db, false);
    const base = { userId: player.id, dateKey: DATE, orgEventId: 'ev-1', enteredById: coach.id };

    await test('DB off: org transaction writes sets + org session + summary in one go; bodyweight kg legacy-unchanged (not claimed)', async () => {
      const r = done(await writeOrgWorkCore(deps, { ...base, items: [{ exerciseId: BENCH, sets: [{ weightKg: 60, reps: 5, holdSeconds: null }, { weightKg: 62.5, reps: 5, holdSeconds: null }] }, { exerciseId: POGO, sets: [{ weightKg: 20, reps: 10, holdSeconds: null }] }] }));
      assert.equal(r.outcome, 'saved');
      assert.equal(r.sets, 3);
      assert.equal(r.legacyUnchanged, 3, 'schema-off: every coach set is the unchanged legacy write');
      assert.equal(r.incompatibleKept, 1);
      assert.equal(r.recovered, 0, 'no recovery is claimed when the schema is off');
      const sets = await off.db.userExerciseSet.findMany({ where: { userId: player.id } });
      const got = sets.map((s) => `${s.exerciseId === BENCH ? 'bench' : 'pogo'}:${s.setNo}:${s.weightKg}`).sort();
      assert.deepEqual(got, ['bench:101:60', 'bench:102:62.5', 'pogo:101:20']);
      const s = await off.db.trainingSession.findFirstOrThrow({ where: { userId: player.id } });
      assert.equal(s.themeKey, 'org');
      const logs = await off.db.userExerciseLog.findMany({ where: { userId: player.id } });
      assert.equal(logs.find((l) => l.exerciseId === BENCH)?.weightKg, 62.5, 'summary written in the same transaction');
      assert.equal(logs.find((l) => l.exerciseId === POGO)?.weightKg, null, 'bodyweight legacy kg never reaches the summary');
      const cols = await off.pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'UserExerciseSet' AND column_name = 'load'`);
      assert.equal(cols.rows[0].n, 0, 'column really absent in this DB');
    });

    await test('DB off: required missing mass rejects BEFORE the destructive replace — previous coach rows, session and summary untouched', async () => {
      const before = await stateOf(off.db, player.id);
      const r = rejected(await writeOrgWorkCore(deps, { ...base, items: [{ exerciseId: BENCH, sets: [{ weightKg: 70, reps: 3, holdSeconds: null }, { weightKg: null, reps: 3, holdSeconds: null }] }] }));
      assert.equal(r.code, 'LOAD_REQUIRED');
      assert.equal(r.setIndex, 1);
      assert.equal(await stateOf(off.db, player.id), before, 'nothing deleted or inserted');
    });

    await test('DB off: invalid quantity / unknown exercise / unknown owner write nothing', async () => {
      const before = await stateOf(off.db, player.id);
      assert.equal(rejected(await writeOrgWorkCore(deps, { ...base, items: [{ exerciseId: BENCH, sets: [{ weightKg: 'abc' as never, reps: 5, holdSeconds: null }] }] })).code, 'ORG_INVALID_QUANTITY');
      assert.equal(rejected(await writeOrgWorkCore(deps, { ...base, items: [{ exerciseId: BENCH, sets: [{ weightKg: 60, reps: 5, holdSeconds: null }] }, { exerciseId: 'no-such-exercise', sets: [{ weightKg: null, reps: 5, holdSeconds: null }] }] })).code, 'ORG_UNKNOWN_EXERCISE');
      assert.equal(await stateOf(off.db, player.id), before);
      const ghost = rejected(await writeOrgWorkCore(deps, { ...base, userId: 'no-such-user', items: [{ exerciseId: BENCH, sets: [{ weightKg: 60, reps: 5, holdSeconds: null }] }] }));
      assert.equal(ghost.code, 'ORG_UNKNOWN_OWNER');
      assert.equal(await off.db.trainingSession.count({ where: { userId: 'no-such-user' } }), 0, 'no orphan session');
    });

    await test('DB off: a modern band payload is rejected (LOAD_UNSUPPORTED) before replacement — never stored as a legacy unknown band', async () => {
      const before = await stateOf(off.db, player.id);
      const cleaned = cleanOrgWork([{ exerciseId: BAND_OFF, sets: [{ reps: 15, ...modern({ kind: 'band', role: 'resistance', bands: [RED] }) }] }, { exerciseId: BENCH, sets: [{ weightKg: 70, reps: 3 }] }], new Set([BAND_OFF, BENCH]));
      assert.ok(Array.isArray(cleaned));
      const r = rejected(await writeOrgWorkCore(deps, { ...base, items: cleaned }));
      assert.equal(r.code, 'LOAD_UNSUPPORTED');
      assert.equal(r.exerciseId, BAND_OFF);
      assert.equal(await stateOf(off.db, player.id), before, 'existing coach rows for this event are untouched');
    });

    await test('DB off: a throw inside the transaction (after delete + insert) rolls everything back', async () => {
      const before = await stateOf(off.db, player.id);
      const boom = await depsOf(off.db, false, { currentContracts: async () => { throw new Error('inject-summary'); } });
      await assert.rejects(writeOrgWorkCore(boom, { ...base, items: [{ exerciseId: BENCH, sets: [{ weightKg: 80, reps: 1, holdSeconds: null }] }] }), /inject-summary/);
      assert.equal(await stateOf(off.db, player.id), before, 'deleteMany/createMany/plan/summary all rolled back');
    });

    await test('DB off: player own set at the same event is never replaced; empty items clears coach rows and the org session', async () => {
      const s = await off.db.trainingSession.findFirstOrThrow({ where: { userId: player.id } });
      await off.db.userExerciseSet.create({ data: { sessionId: s.id, userId: player.id, exerciseId: BENCH, date: DAY, setNo: 1, weightKg: 50, reps: 8, orgEventId: 'ev-1' } });
      done(await writeOrgWorkCore(deps, { ...base, items: [{ exerciseId: BENCH, sets: [{ weightKg: 65, reps: 5, holdSeconds: null }] }] }));
      const own = await off.db.userExerciseSet.findMany({ where: { userId: player.id, enteredById: null } });
      assert.deepEqual(own.map((x) => [x.setNo, x.weightKg]), [[1, 50]]);
      done(await writeOrgWorkCore(deps, { ...base, items: [] }));
      assert.equal(await off.db.userExerciseSet.count({ where: { userId: player.id, enteredById: { not: null } } }), 0);
      assert.equal(await off.db.userExerciseSet.count({ where: { userId: player.id, enteredById: null } }), 1, 'own set kept → session kept');
    });
  } finally {
    await off.db.$disconnect();
    await off.socket.stop();
    await off.pg.close();
  }

})();

/**
 * 5-2 보류 SQL 적용 DB — 구조화 저장 켬. PGlite 에서 돌고, R1_PG_URL(개인 루프백 클러스터)이 있으면 실제 PostgreSQL 에서 같은 시험을 한 번 더 돈다
 * (realPg — 실행마다 새 데이터베이스를 만들고 끝나면 지운다).
 */
async function onSuite(on: { db: PrismaClient; close: () => Promise<void> }, tag: string) {
  const test = (name: string, fn: () => void | Promise<void>) => outerTest(tag ? `[${tag}] ${name}` : name, fn);
  const count = async (table: string, where = 'TRUE') => Number((await on.db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}" WHERE ${where}`))[0].n);
  const snapOf = async (id: string) => (await on.db.$queryRawUnsafe<{ load: unknown }[]>(`SELECT "load" FROM "UserExerciseSet" WHERE "id" = $1`, id))[0]?.load as Record<string, unknown> | null;
  try {
    const BANDX = 'aaaaaaaa-0000-4000-8000-00000000band';
    const DBX = 'aaaaaaaa-0000-4000-8000-0000000000db';
    const CABX = 'aaaaaaaa-0000-4000-8000-00000000cab1';
    const DUMB = 'aaaaaaaa-0000-4000-8000-0000000dumb1';
    const { player, coach } = await seed(on.db, 'on', [
      { id: DUMB, equipment: ['덤벨'], title: '덤벨 로우' },
      { id: BENCH, equipment: ['바벨', '벤치'], title: '벤치 프레스' },
      { id: POGO, equipment: ['맨몸'], title: '포고 홉', category: '파워' },
      { id: BAND_DEADLIFT, equipment: ['바벨', '밴드'], title: '밴드 데드리프트', category: '하체 스트렝스' },
      { id: BANDX, equipment: ['밴드'], title: '밴드 풀어파트', category: '암케어' },
      { id: DBX, equipment: ['바벨'], title: '덤벨 로우(라이브러리는 바벨로 바뀜)' },
      { id: CABX, equipment: ['케이블'], title: '케이블 로우' },
    ]);
    const deps = await depsOf(on.db, true);
    const base = { userId: player.id, dateKey: DATE, orgEventId: 'ev-on', enteredById: coach.id };

    await test('DB on: bodyweight kg → canonical set without kg + snapshot + original in recovery (same transaction)', async () => {
      const r = done(await writeOrgWorkCore(deps, { ...base, items: [{ exerciseId: POGO, sets: [{ weightKg: 20, reps: 10, holdSeconds: null }] }] }));
      assert.equal(r.recovered, 1);
      assert.equal(r.legacyUnchanged, 0);
      const set = await on.db.userExerciseSet.findFirstOrThrow({ where: { userId: player.id, exerciseId: POGO } });
      assert.equal(set.weightKg, null, 'no bogus kg in the canonical row');
      assert.equal(set.reps, 10);
      const snap = await snapOf(set.id);
      assert.equal((snap?.value as { kind: string }).kind, 'none');
      assert.equal(snap?.status, 'legacyIncompatible');
      const rec = await on.db.$queryRawUnsafe<{ originalPayload: { weightKg: number }; reason: string; actorId: string }[]>(`SELECT "originalPayload", "reason", "actorId" FROM "WorkoutLoadRecovery" WHERE "setId" = $1`, set.id);
      assert.equal(rec.length, 1);
      assert.equal(rec[0].originalPayload.weightKg, 20, 'original kept for recovery');
      assert.equal(rec[0].reason, 'ORG_UNSUPPORTED_LOAD');
      assert.equal(rec[0].actorId, coach.id);
    });

    await test('DB on: band and combined exercises store semantic snapshots, never ordinary kg for the band', async () => {
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: 'ev-band', items: [{ exerciseId: BANDX, sets: [{ weightKg: 5, reps: 15, holdSeconds: null }] }, { exerciseId: BAND_DEADLIFT, sets: [{ weightKg: 60, reps: 5, holdSeconds: null }] }] }));
      const b = await on.db.userExerciseSet.findFirstOrThrow({ where: { userId: player.id, exerciseId: BANDX } });
      assert.equal(b.weightKg, null);
      const bs = await snapOf(b.id);
      assert.deepEqual(bs?.value, { kind: 'band', role: 'unknown', bands: [] });
      const c = await on.db.userExerciseSet.findFirstOrThrow({ where: { userId: player.id, exerciseId: BAND_DEADLIFT } });
      assert.equal(c.weightKg, 60, 'combined: mass component only');
      const cs = await snapOf(c.id);
      assert.equal((cs?.value as { kind: string }).kind, 'combined');
      assert.equal(cs?.status, 'unknownBand');
      const log = await on.db.userExerciseLog.findFirst({ where: { userId: player.id, exerciseId: BANDX } });
      assert.equal(log?.weightKg ?? null, null, 'band summary has no kg');
    });

    await test('DB on: modern band / combined / unequal / setup survive clean → prepare → write → read-back snapshot', async () => {
      const parts = [{ kg: 20, count: 1, side: 'left' }, { kg: 22, count: 1, side: 'right' }];
      const cleaned = cleanOrgWork(
        [
          { exerciseId: BANDX, sets: [{ reps: 15, ...modern({ kind: 'band', role: 'resistance', bands: [RED, BLUE] }) }] },
          { exerciseId: BAND_DEADLIFT, sets: [{ weightKg: 60, reps: 5, ...modern({ kind: 'combined', mass: { kg: 60 }, band: { role: 'resistance', bands: [RED] } }) }] },
          { exerciseId: DUMB, sets: [{ reps: 8, ...modern({ kind: 'mass', parts }) }] },
          { exerciseId: CABX, sets: [{ weightKg: 40, reps: 10, ...modern({ kind: 'mass', kg: 40, setup: { label: '2번 케이블' } }) }] },
        ],
        new Set([BANDX, BAND_DEADLIFT, DUMB, CABX])
      );
      assert.ok(Array.isArray(cleaned));
      const r = done(await writeOrgWorkCore(deps, { ...base, orgEventId: 'ev-semantic', items: cleaned }));
      assert.equal(r.sets, 4);
      assert.equal(r.recovered, 0, 'valid modern payloads need no recovery');
      const rows = await on.db.userExerciseSet.findMany({ where: { userId: player.id, orgEventId: 'ev-semantic' } });
      const snap = async (exerciseId: string) => {
        const row = rows.find((x) => x.exerciseId === exerciseId)!;
        return { row, s: readSnapshot(await snapOf(row.id)) };
      };
      const b = await snap(BANDX);
      assert.equal(b.row.weightKg, null);
      assert.equal(b.s?.status, 'ok');
      assert.deepEqual(b.s?.value, { kind: 'band', role: 'resistance', bands: [RED, BLUE] }, 'both actual bands kept, never unknown');
      assert.equal(b.s?.provenance, 'org');
      const c = await snap(BAND_DEADLIFT);
      assert.equal(c.row.weightKg, 60);
      assert.ok(c.s?.value.kind === 'combined' && c.s.value.mass?.kg === 60 && (c.s.value.band.bands[0] as { levelId?: string }).levelId === (RED as { levelId?: string }).levelId);
      const u = await snap(DUMB);
      assert.equal(u.row.weightKg, null, 'no invented single kg for unequal implements');
      assert.ok(u.s?.value.kind === 'mass' && u.s.value.parts?.length === 2 && u.s.value.parts[1].kg === 22);
      const k = await snap(CABX);
      assert.ok(k.s?.value.kind === 'mass' && k.s.value.setup?.label === '2번 케이블');
      const v = viewSetLoad({ exerciseId: CABX, contract: CABLE, evidence: 'contract' }, { weightKg: k.row.weightKg, snapshot: k.s });
      assert.ok(v.key?.endsWith(':2번 케이블'), 'setup-keyed comparison context');
    });

    await test('DB on: contradictory kg and unknown band reject before replacement; a re-send replaces only that event', async () => {
      const before = await stateOf(on.db, player.id);
      const conflict = cleanOrgWork([{ exerciseId: DUMB, sets: [{ weightKg: 70, reps: 5, ...modern({ kind: 'mass', kg: 60 }) }] }], new Set([DUMB]));
      assert.ok(Array.isArray(conflict));
      assert.equal(rejected(await writeOrgWorkCore(deps, { ...base, orgEventId: 'ev-semantic', items: conflict })).code, 'LOAD_CONFLICT');
      const unknownBand = cleanOrgWork([{ exerciseId: BANDX, sets: [{ reps: 5, ...modern({ kind: 'band', role: 'resistance', bands: [{ seriesId: 'x', levelId: 'x:red' }] }) }] }], new Set([BANDX]));
      assert.ok(Array.isArray(unknownBand));
      assert.equal(rejected(await writeOrgWorkCore(deps, { ...base, orgEventId: 'ev-semantic', items: unknownBand })).code, 'LOAD_INVALID');
      assert.equal(await stateOf(on.db, player.id), before, 'the earlier semantic rows are still there');
    });

    await test('DB on: required missing mass and invalid quantity reject with nothing written (no snapshot, no recovery)', async () => {
      const before = await stateOf(on.db, player.id);
      const rec = await count('WorkoutLoadRecovery');
      assert.equal(rejected(await writeOrgWorkCore(deps, { ...base, items: [{ exerciseId: BENCH, sets: [{ weightKg: null, reps: 5, holdSeconds: null }] }] })).code, 'LOAD_REQUIRED');
      assert.equal(rejected(await writeOrgWorkCore(deps, { ...base, items: [{ exerciseId: POGO, sets: [{ weightKg: -1, reps: 5, holdSeconds: null }] }] })).code, 'ORG_INVALID_QUANTITY');
      assert.equal(await stateOf(on.db, player.id), before);
      assert.equal(await count('WorkoutLoadRecovery'), rec);
    });

    await test('DB on: injected failure after snapshot/recovery rolls back sets, snapshots and recovery', async () => {
      const before = await stateOf(on.db, player.id);
      const rec = await count('WorkoutLoadRecovery');
      const snaps = await count('UserExerciseSet', `"load" IS NOT NULL`);
      const boom = await depsOf(on.db, true, { currentContracts: async () => { throw new Error('inject-after-recovery'); } });
      await assert.rejects(writeOrgWorkCore(boom, { ...base, items: [{ exerciseId: POGO, sets: [{ weightKg: 30, reps: 12, holdSeconds: null }] }] }), /inject-after-recovery/);
      assert.equal(await stateOf(on.db, player.id), before);
      assert.equal(await count('WorkoutLoadRecovery'), rec);
      assert.equal(await count('UserExerciseSet', `"load" IS NOT NULL`), snaps);
    });

    await test('DB on: the frozen contract already in the player plan wins over the current library (historical meaning kept)', async () => {
      /* 다른 날 — 판에 옛 장비(덤벨)로 얼린 운동. 라이브러리는 지금 바벨이다 */
      const day = new Date('2026-11-17T00:00:00Z');
      const s = await on.db.trainingSession.create({
        data: {
          userId: player.id,
          date: day,
          themeKey: 'lower',
          status: 'FINISHED',
          startedAt: day,
          plan: { themeKey: 'lower', themeLabel: 't', goal: null, exercises: [{ id: DBX, title: 'old', category: '상체 스트렝스', slot: 'main', equipment: ['덤벨'], bodyParts: [], intensity: '보통', isHold: false, needsWeight: true, perSide: false, prescription: null, plannedSets: 3, plannedReps: 10, plannedHoldSeconds: null, thumbPath: null }] },
        },
      });
      /* 선수가 직접 남긴 서로 다른 무게(왼 20 · 오른 22) 세트 — 코치 기록이 건드리지 않는다 */
      const own = await on.db.userExerciseSet.create({ data: { sessionId: s.id, userId: player.id, exerciseId: DBX, date: day, setNo: 1, weightKg: null, reps: 8 } });
      const dbContract = C(['덤벨']);
      await writeSetSnapshot(on.db as unknown as Prisma.TransactionClient, own.id, snapshotOf({ load: { kind: 'mass', basis: 'perImplement', apparatusFamily: null, setup: null, kg: null, parts: [{ kg: 20, count: 1, side: 'left' }, { kg: 22, count: 1, side: 'right' }] }, status: 'ok', contract: dbContract, variant: null, provenance: 'modern' }));
      done(await writeOrgWorkCore(deps, { ...base, dateKey: '2026-11-17', orgEventId: 'ev-hist', items: [{ exerciseId: DBX, sets: [{ weightKg: 20, reps: 10, holdSeconds: null }] }] }));
      const coachSet = await on.db.userExerciseSet.findFirstOrThrow({ where: { sessionId: s.id, exerciseId: DBX, enteredById: { not: null } } });
      const cs = await snapOf(coachSet.id);
      assert.equal((cs?.contract as { basis: string }).basis, 'perImplement', 'plan-frozen dumbbell contract, not the current barbell library');
      const ownSnap = await snapOf(own.id);
      assert.deepEqual((ownSnap?.value as { parts: unknown }).parts, [{ kg: 20, count: 1, side: 'left' }, { kg: 22, count: 1, side: 'right' }], 'unequal implements preserved');
      const view = viewSetLoad({ exerciseId: DBX, contract: dbContract, evidence: 'contract' }, { weightKg: null, snapshot: readSnapshot(ownSnap) });
      assert.equal(view.displayKg, null);
      assert.equal(view.parts?.length, 2, 'historical display keeps both hands');
      const log = await on.db.userExerciseLog.findFirstOrThrow({ where: { userId: player.id, exerciseId: DBX, date: day } });
      assert.equal(log.setsDone, 2);
      assert.equal(log.weightKg, 20, 'summary = coach mass; the unequal set has no single kg');
      const plan = readFrozenPlan((await on.db.trainingSession.findUniqueOrThrow({ where: { id: s.id } })).plan);
      assert.equal(plan?.exercises.filter((e) => e.id === DBX).length, 1, 'plan entry not duplicated');
    });

    await test('DB on: summary over two cable setups (real applySummaryTx) withholds the pooled max', async () => {
      const day = new Date('2026-11-18T00:00:00Z');
      const s = await on.db.trainingSession.create({
        data: { userId: player.id, date: day, themeKey: 'upper', status: 'FINISHED', startedAt: day, plan: { themeKey: 'upper', themeLabel: 't', goal: null, exercises: [{ id: CABX, title: 'c', category: '상체 스트렝스', slot: 'main', equipment: ['케이블'], bodyParts: [], intensity: '보통', isHold: false, needsWeight: false, perSide: false, prescription: null, plannedSets: 2, plannedReps: 10, plannedHoldSeconds: null, thumbPath: null, load: CABLE }] } },
      });
      const a = await on.db.userExerciseSet.create({ data: { sessionId: s.id, userId: player.id, exerciseId: CABX, date: day, setNo: 1, weightKg: 100, reps: 10 } });
      const b = await on.db.userExerciseSet.create({ data: { sessionId: s.id, userId: player.id, exerciseId: CABX, date: day, setNo: 2, weightKg: 20, reps: 10 } });
      await writeSetSnapshot(on.db as unknown as Prisma.TransactionClient, a.id, cableSnap('machine-a', 100));
      await writeSetSnapshot(on.db as unknown as Prisma.TransactionClient, b.id, cableSnap('machine-b', 20));
      await on.db.$transaction(async (tx) =>
        applySummaryTx(tx, { snapshots: (ids) => readSnapshotsTx(tx, ids), current: async () => new Map(), planExercises: (p) => readFrozenPlan(p)?.exercises }, player.id, { id: s.id, date: day })
      );
      const log = await on.db.userExerciseLog.findFirstOrThrow({ where: { userId: player.id, exerciseId: CABX, date: day } });
      assert.equal(log.setsDone, 2);
      assert.equal(log.repsDone, 10);
      assert.equal(log.weightKg, null, 'machine A 100 and machine B 20 are not pooled');
    });

    /* ── R1-03 3차: 같은 활동을 무게 칸 없이 다시 써도 저장된 무게 기록을 잃지 않는다(GPT 실제 PostgreSQL 검사의 재현) ── */
    const loadsOf = async (ev: string) =>
      (
        await on.db.$queryRawUnsafe<{ exerciseId: string; setNo: number; reps: number | null; weightKg: number | null; load: unknown }[]>(
          `SELECT "exerciseId", "setNo", "reps", "weightKg", "load" FROM "UserExerciseSet" WHERE "userId" = $1 AND "orgEventId" = $2 ORDER BY "exerciseId", "setNo"`,
          player.id,
          ev
        )
      ).map((r) => ({ ...r, snap: readSnapshot(r.load) }));
    const valueOf = (rows: Awaited<ReturnType<typeof loadsOf>>, exerciseId: string, i = 0) => rows.filter((r) => r.exerciseId === exerciseId)[i]?.snap?.value;
    const levels = (v: unknown) => ((v as { bands?: { levelId?: string }[] } | undefined)?.bands ?? []).map((b) => b.levelId);
    const KEEP_PARTS = [{ kg: 20, count: 1, side: 'left' }, { kg: 22, count: 1, side: 'right' }];
    const keepItems = () =>
      cleanOrgWork(
        [
          { exerciseId: BANDX, sets: [{ reps: 15, ...modern({ kind: 'band', role: 'resistance', bands: [RED, BLUE] }) }] },
          { exerciseId: BAND_DEADLIFT, sets: [{ weightKg: 60, reps: 5, ...modern({ kind: 'combined', mass: { kg: 60 }, band: { role: 'resistance', bands: [RED] } }) }] },
          { exerciseId: DUMB, sets: [{ reps: 8, ...modern({ kind: 'mass', parts: KEEP_PARTS }) }] },
          { exerciseId: CABX, sets: [{ weightKg: 40, reps: 10, ...modern({ kind: 'mass', kg: 40, setup: { label: '2번 케이블' } }) }] },
        ],
        new Set([BANDX, BAND_DEADLIFT, DUMB, CABX])
      ) as OrgWorkItem[];
    /* 옛 앱이 같은 활동을 다시 보냄 — 무게 칸 없이 횟수만 바꿈(GPT 검사: 밴드 5 → 8회) */
    const legacyItems = (bandKg: number | null = null): OrgWorkItem[] => [
      { exerciseId: BANDX, sets: [{ weightKg: bandKg, reps: 12, holdSeconds: null }] },
      { exerciseId: BAND_DEADLIFT, sets: [{ weightKg: 60, reps: 6, holdSeconds: null }] },
      { exerciseId: DUMB, sets: [{ weightKg: null, reps: 9, holdSeconds: null }] },
      { exerciseId: CABX, sets: [{ weightKg: 40, reps: 12, holdSeconds: null }] },
    ];

    await test('DB on (R1-03 r3): band / combined / setup / unequal parts survive an omitted-load replacement (legacy and modern-without-load)', async () => {
      const ev = 'ev-keep';
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: keepItems() }));
      const first = await loadsOf(ev);
      const rec0 = await count('WorkoutLoadRecovery');
      const r = done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: legacyItems() }));
      assert.equal(r.sets, 4);
      assert.equal(r.recovered, 0, 'an omitted load is "keep", not a recovery');
      const after = await loadsOf(ev);
      assert.deepEqual(after.map((x) => x.reps).sort(), [12, 12, 6, 9].sort(), 'quantities were replaced');
      for (const id of [BANDX, BAND_DEADLIFT, DUMB, CABX]) assert.deepEqual(valueOf(after, id), valueOf(first, id), `stored load kept for ${id}`);
      assert.deepEqual(levels(valueOf(after, BANDX)), levels({ bands: [RED, BLUE] }), 'both bands, never unknown');
      assert.equal(after.find((x) => x.exerciseId === BANDX)!.snap?.status, 'ok');
      assert.equal(after.find((x) => x.exerciseId === BAND_DEADLIFT)!.weightKg, 60);
      assert.equal(after.find((x) => x.exerciseId === DUMB)!.weightKg, null, 'no invented single kg for unequal parts');
      assert.equal(after.find((x) => x.exerciseId === CABX)!.weightKg, 40);
      assert.equal(await count('WorkoutLoadRecovery'), rec0);
      /* 새 앱이 무게 칸 없이(약속 번호만) 보내도 같다 */
      const modernNoLoad = cleanOrgWork([{ exerciseId: BANDX, sets: [{ reps: 14, loadProtocol: LOAD_PROTOCOL, loadResolver: RESOLVER_VERSION }] }, ...legacyItems().slice(1)], new Set([BANDX, BAND_DEADLIFT, DUMB, CABX]));
      assert.ok(Array.isArray(modernNoLoad));
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: modernNoLoad }));
      const again = await loadsOf(ev);
      assert.deepEqual(valueOf(again, BANDX), valueOf(first, BANDX));
      assert.equal(again.find((x) => x.exerciseId === BANDX)!.reps, 14);
    });

    await test('DB on (R1-03 r3): retry is idempotent — same rows, same snapshots, one recovery for a legacy kg on a band', async () => {
      const ev = 'ev-keep';
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: legacyItems() }));
      const a1 = JSON.stringify(await loadsOf(ev));
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: legacyItems() }));
      assert.equal(JSON.stringify(await loadsOf(ev)), a1, 'second identical send changes nothing');
      const rec0 = await count('WorkoutLoadRecovery');
      const r = done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: legacyItems(5) }));
      assert.equal(r.recovered, 1, 'old-client kg on a band goes to recovery');
      const b1 = await loadsOf(ev);
      assert.deepEqual(levels(valueOf(b1, BANDX)), levels({ bands: [RED, BLUE] }), 'the kg never replaces the chosen bands');
      assert.equal(b1.find((x) => x.exerciseId === BANDX)!.weightKg, null);
      assert.equal(await count('WorkoutLoadRecovery'), rec0 + 1);
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: legacyItems(5) }));
      assert.equal(JSON.stringify(await loadsOf(ev)), JSON.stringify(b1));
      assert.equal(await count('WorkoutLoadRecovery'), rec0 + 1, 'same original, same recovery row');
    });

    await test('DB on (R1-03 r3): explicit modern clear removes the load; a later omitted-load send keeps the clear', async () => {
      const ev = 'ev-keep';
      const cleared = cleanOrgWork([{ exerciseId: BANDX, sets: [{ reps: 12, ...modern(null) }] }, ...legacyItems().slice(1)], new Set([BANDX, BAND_DEADLIFT, DUMB, CABX]));
      assert.ok(Array.isArray(cleared));
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: cleared }));
      assert.deepEqual(valueOf(await loadsOf(ev), BANDX), { kind: 'none' }, 'cleared, not carried');
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: legacyItems() }));
      assert.deepEqual(valueOf(await loadsOf(ev), BANDX), { kind: 'none' }, 'an omission does not turn the clear into an unknown band');
    });

    await test('DB on (R1-03 r3): removing a set or a whole exercise removes it; an added set of a uniform line inherits the line value', async () => {
      const ev = 'ev-rm';
      const three = cleanOrgWork(
        [
          { exerciseId: BANDX, sets: [1, 2, 3].map(() => ({ reps: 10, ...modern({ kind: 'band', role: 'resistance', bands: [RED] }) })) },
          { exerciseId: CABX, sets: [{ weightKg: 40, reps: 10, ...modern({ kind: 'mass', kg: 40, setup: { label: '1번 케이블' } }) }] },
        ],
        new Set([BANDX, CABX])
      );
      assert.ok(Array.isArray(three));
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: three }));
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: [{ exerciseId: BANDX, sets: [1, 2].map(() => ({ weightKg: null, reps: 11, holdSeconds: null })) }] }));
      let rows = await loadsOf(ev);
      assert.equal(rows.filter((x) => x.exerciseId === BANDX).length, 2, 'one set removed');
      assert.equal(rows.filter((x) => x.exerciseId === CABX).length, 0, 'whole exercise removed');
      assert.ok(rows.every((x) => levels(x.snap?.value).join() === levels({ bands: [RED] }).join()), 'remaining sets keep red');
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: [{ exerciseId: BANDX, sets: [1, 2, 3].map(() => ({ weightKg: null, reps: 11, holdSeconds: null })) }] }));
      rows = await loadsOf(ev);
      assert.equal(rows.length, 3);
      assert.ok(rows.every((x) => levels(x.snap?.value).join() === levels({ bands: [RED] }).join()), 'the added set of the same line is red too');
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: [] }));
      assert.equal((await loadsOf(ev)).length, 0, 'empty items removes the event rows');
    });

    await test('DB on (R1-03 r3): ambiguous correspondence (count changed, different stored loads) is refused before deletion; equal count matches by position', async () => {
      const ev = 'ev-amb';
      const two = cleanOrgWork([{ exerciseId: BANDX, sets: [RED, BLUE].map((b) => ({ reps: 10, ...modern({ kind: 'band', role: 'resistance', bands: [b] }) })) }], new Set([BANDX]));
      assert.ok(Array.isArray(two));
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: two }));
      const before = JSON.stringify(await loadsOf(ev));
      const st = await stateOf(on.db, player.id);
      const r = rejected(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: [{ exerciseId: BANDX, sets: [{ weightKg: null, reps: 12, holdSeconds: null }] }] }));
      assert.equal(r.code, 'ORG_LOAD_AMBIGUOUS');
      assert.equal(r.exerciseId, BANDX);
      assert.equal(r.setIndex, 0);
      assert.ok(r.error.includes('다시 골라'), 'actionable');
      assert.equal(JSON.stringify(await loadsOf(ev)), before, 'nothing deleted');
      assert.equal(await stateOf(on.db, player.id), st);
      /* 같은 세트 수 — 차례대로 */
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: [{ exerciseId: BANDX, sets: [12, 13].map((reps) => ({ weightKg: null, reps, holdSeconds: null })) }] }));
      const rows = await loadsOf(ev);
      assert.deepEqual(rows.map((x) => [x.reps, levels(x.snap?.value)[0]]), [[12, levels({ bands: [RED] })[0]], [13, levels({ bands: [BLUE] })[0]]]);
      /* 무게 칸을 실으면 맞출 필요가 없다 — 세트 수가 바뀌어도 그대로 받는다 */
      const one = cleanOrgWork([{ exerciseId: BANDX, sets: [{ reps: 9, ...modern({ kind: 'band', role: 'resistance', bands: [BLUE] }) }] }], new Set([BANDX]));
      assert.ok(Array.isArray(one));
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: one }));
      assert.deepEqual((await loadsOf(ev)).map((x) => levels(x.snap?.value)[0]), [levels({ bands: [BLUE] })[0]]);
    });

    await test('DB on (R1-03 r3): an unreadable stored snapshot is refused before deletion (no guessing)', async () => {
      const ev = 'ev-amb';
      const row = (await loadsOf(ev))[0];
      const id = (await on.db.userExerciseSet.findFirstOrThrow({ where: { userId: player.id, orgEventId: ev, exerciseId: row.exerciseId, setNo: row.setNo } })).id;
      await on.db.$executeRawUnsafe(`UPDATE "UserExerciseSet" SET "load" = '{"v":999,"value":{"kind":"future"}}'::jsonb WHERE "id" = $1`, id);
      const before = JSON.stringify(await loadsOf(ev));
      const r = rejected(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: [{ exerciseId: BANDX, sets: [{ weightKg: null, reps: 10, holdSeconds: null }] }] }));
      assert.equal(r.code, 'ORG_LOAD_UNREADABLE');
      assert.equal(r.setIndex, 0);
      assert.equal(JSON.stringify(await loadsOf(ev)), before, 'the unknown future value is still stored');
    });

    await test('DB on (R1-03 r3): required-mass rejection leaves the earlier semantic rows and snapshots intact', async () => {
      const ev = 'ev-keep';
      done(await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: keepItems() }));
      const before = JSON.stringify(await loadsOf(ev));
      const st = await stateOf(on.db, player.id);
      const rec0 = await count('WorkoutLoadRecovery');
      const r = rejected(
        await writeOrgWorkCore(deps, { ...base, orgEventId: ev, items: [...legacyItems(), { exerciseId: BENCH, sets: [{ weightKg: 60, reps: 3, holdSeconds: null }, { weightKg: null, reps: 3, holdSeconds: null }] }] })
      );
      assert.equal(r.code, 'LOAD_REQUIRED');
      assert.equal(r.setIndex, 1);
      assert.equal(JSON.stringify(await loadsOf(ev)), before);
      assert.equal(await stateOf(on.db, player.id), st);
      assert.equal(await count('WorkoutLoadRecovery'), rec0);
    });

    await test('DB on + v2: a v2 session defers to the recovery box, but only after validation', async () => {
      const day = new Date('2026-11-19T00:00:00Z');
      const v2deps = await depsOf(on.db, true, { v2Applied: true });
      const s = await on.db.$transaction(async (tx) => {
        await lockOwner(tx, player.id);
        const made = await tx.trainingSession.create({ data: { userId: player.id, date: day, themeKey: 'lower', status: 'ACTIVE', startedAt: day, plan: { themeKey: 'lower', themeLabel: 't', goal: null, exercises: [] } } });
        await tx.$executeRawUnsafe(`UPDATE "TrainingSession" SET "mutationProtocolVersion" = 2 WHERE "id" = $1`, made.id);
        return made;
      });
      const items0 = await count('WorkoutRecoveryItem');
      assert.equal(rejected(await writeOrgWorkCore(v2deps, { ...base, dateKey: '2026-11-19', items: [{ exerciseId: BENCH, sets: [{ weightKg: null, reps: 5, holdSeconds: null }] }] })).code, 'LOAD_REQUIRED');
      assert.equal(await count('WorkoutRecoveryItem'), items0, 'invalid input does not reach the recovery box');
      const r = done(await writeOrgWorkCore(v2deps, { ...base, dateKey: '2026-11-19', items: [{ exerciseId: BENCH, sets: [{ weightKg: 60, reps: 5, holdSeconds: null }] }] }));
      assert.equal(r.outcome, 'deferred');
      assert.equal(r.sessionId, s.id);
      assert.equal(await count('WorkoutRecoveryItem'), items0 + 1);
      assert.equal(await on.db.userExerciseSet.count({ where: { sessionId: s.id } }), 0, 'v2 session sets untouched');
    });
  } finally {
    await on.close();
  }
}

/** 개인 실제 PostgreSQL — 127.0.0.1 · 사용자 r1test · 데이터베이스 r1_isolated 가 아니면 쓰지 않는다(공유 · 운영 DB 는 절대 아님) */
async function realPg(): Promise<{ db: PrismaClient; close: () => Promise<void> } | null> {
  const raw = process.env.R1_PG_URL;
  if (!raw) return null;
  const u = new URL(raw);
  if (u.hostname !== '127.0.0.1' || u.username !== 'r1test' || u.pathname !== '/r1_isolated') throw new Error('R1_PG_URL must be postgresql://r1test@127.0.0.1:<port>/r1_isolated');
  const name = `r1_org_${process.pid}_${Date.now()}`;
  const admin = async (sql: string) => {
    const c = new pg.Client({ connectionString: raw });
    await c.connect();
    try {
      await c.query(sql);
    } finally {
      await c.end();
    }
  };
  await admin(`CREATE DATABASE ${name}`);
  const url = new URL(raw);
  url.pathname = `/${name}`;
  const setup = new pg.Client({ connectionString: url.toString() });
  await setup.connect();
  try {
    await setup.query(execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    for (const f of [V2_SQL, LOAD_SQL]) await setup.query(readFileSync(f, 'utf8'));
  } finally {
    await setup.end();
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 1 }) });
  return {
    db,
    close: async () => {
      await db.$disconnect();
      await admin(`DROP DATABASE IF EXISTS ${name}`);
    },
  };
}

{
  const pgl = await isolated([V2_SQL, LOAD_SQL]);
  await onSuite(
    {
      db: pgl.db,
      close: async () => {
        await pgl.db.$disconnect();
        await pgl.socket.stop();
        await pgl.pg.close();
      },
    },
    ''
  );
  const real = await realPg();
  if (real) await onSuite(real, 'real PG');
  else console.log('  (real PG pass skipped — set R1_PG_URL to a private loopback cluster)');
}

console.log(`\nload-r1-org-selftest: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
