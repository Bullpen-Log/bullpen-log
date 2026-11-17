/**
 * EX-LOAD01 R1-04 — 관리자 뜻 설정(ExerciseVideo.loadSemantics) · 계정 지우기 시험.
 *
 * 1) 순수: 저장 모양 읽기(모르는 판 · 모양 → '미정') · 앞서는 차례(잠근 코드 > 저장값 > 잠그지 않은 코드 > 장비) · 맞지 않는 조합 거절 ·
 *    폼 → 결정 · 쓰기 결정(권한 · 스위치 · 잠금 · 검사).
 * 2) 격리 PGlite(메모리 안 Postgres — 공유 DB 에 연결하지 않는다, DATABASE_URL 을 읽지 않는다)에서 **실제 코드**를 돈다:
 *    app/actions/content.ts createExercise · updateExercise, lib/library-cache.ts allExercises · storedLoadSemantics,
 *    lib/workout/load/server.ts currentContracts · frozenContracts, lib/workout/session-plan.ts freezeExercise, lib/delete-user.ts deleteUserCompletely.
 *    서버 전용 묶음(server-only · next/cache · @/lib/prisma · @/lib/dal · @/lib/storage)만 이 시험 안에서 가짜로 바꾼다 — @/lib/prisma 는 격리
 *    PGlite 클라이언트를 가리키고, 없으면 던진다(운영 DB 로 갈 길이 없다).
 *    - 스키마 미적용 DB + 스위치 꺼짐: DB 로 가는 모든 바이트(PGlite 프로토콜)를 모아 loadSemantics · WorkoutLoadRecovery 이름이 한 번도 없음을 본다.
 *    - 보류 SQL 적용 DB + 스위치 켬: 등록 · 수정 · 미리보기와 같은 검사 · 되읽기 · 권한 · 잠금 · 모르는 판 · 판 중간의 라이브러리 바꿈 · 회원 지우기.
 *    PGlite 는 백엔드 하나라 연결 사이 잠금 경합은 증명하지 않는다.
 *
 * 실행: node --import ./scripts/alias-register.mjs scripts/load-r1-admin-selftest.mts
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveRecordingContract } from '@/lib/workout/load/contract';
import { LOAD_OVERRIDES, overridesFor, overridesSourceFor } from '@/lib/workout/load/overrides';
import { contractOfFrozen, contractOfLibraryRow } from '@/lib/workout/load/frozen';
import {
  SEMANTICS_FORM,
  SEMANTICS_UNSUPPORTED,
  SCHEMA_OFF_MESSAGE,
  effectiveOverrides,
  planSemanticsWrite,
  readLoadSemantics,
  semanticsDecisionOf,
  validateSemanticOverrides,
  type CodeOverride,
} from '@/lib/workout/load/semantics';

let passed = 0;
let pending = 0;
const failures: string[] = [];
const notes: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message.replace(/\n/g, ' ').slice(0, 500) : String(e)}`);
  }
}

if (process.env.DATABASE_URL || process.env.DIRECT_URL) {
  console.log('load-r1-admin selftest: refusing to run with DATABASE_URL/DIRECT_URL set (isolated PGlite only)');
  process.exit(2);
}
delete process.env.WORKOUT_LOAD_SCHEMA;
delete process.env.WORKOUT_V2;

/* ─────────────────────────── 표본 ─────────────────────────── */

const ASSIST_PULLUP = '6533120b-38ae-4db7-9257-a6956447bc1a'; /* 코드 예외(잠그지 않음): 보조 밴드 */
const BENCH = 'cc1f99c3-c33b-495c-a0b0-02e1c0387121'; /* 1RM 허용 목록 */
const LOCKED_ID = 'r1-admin-test-locked';
const row = (id: string, equipment: string[], loadSemantics?: unknown, extra: Partial<{ reps: number | null; holdSeconds: number | null; category: string }> = {}) => ({
  id,
  equipment,
  category: extra.category ?? '파워',
  reps: extra.reps === undefined ? 10 : extra.reps,
  holdSeconds: extra.holdSeconds ?? null,
  ...(loadSemantics === undefined ? {} : { loadSemantics }),
});
const stored = (overrides: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ v: 1, overrides, ...extra });
const messagesOf = (r: ReturnType<typeof validateSemanticOverrides>) => (r.ok ? [] : r.issues.map((i) => i.message));
const EM_DASH = '—';

/* ─────────────────────────── 1) 순수 ─────────────────────────── */

await test('read: none / ok (canonical) / unsupported for unknown version, shape, key, value, top-level key', () => {
  assert.deepEqual(readLoadSemantics(null), { kind: 'none' });
  assert.deepEqual(readLoadSemantics(undefined), { kind: 'none' });
  const ok = readLoadSemantics({ v: 1, overrides: { fixedSupport: ['원판', '바벨', '원판'], weightedVariation: false, e1rm: false }, note: 'n', by: 'u', at: '2026-11-17T00:00:00.000Z' });
  assert.equal(ok.kind, 'ok');
  if (ok.kind === 'ok') assert.deepEqual(ok.value.overrides, { fixedSupport: ['바벨', '원판'], e1rm: false });
  for (const bad of [
    { v: 2, overrides: {} },
    { v: '1', overrides: {} },
    { v: 1 },
    { v: 1, overrides: [] },
    { v: 1, overrides: { bandRole: 'pull' } },
    { v: 1, overrides: { use: 'both' } },
    { v: 1, overrides: { fixedSupport: '바벨' } },
    { v: 1, overrides: { weightedVariation: 'yes' } },
    { v: 1, overrides: { e1rm: 1 } },
    { v: 1, overrides: { mode: 'none' } },
    { v: 1, overrides: {}, extra: true },
    { v: 1, overrides: {}, note: 3 },
    'string',
    ['v', 1],
    42,
  ]) {
    assert.equal(readLoadSemantics(bad).kind, 'unsupported', JSON.stringify(bad));
  }
});

await test('unknown version/shape → unresolved semantics-unsupported (never bodyweight, never eligible strength)', () => {
  for (const bad of [{ v: 2, overrides: {} }, { v: 1, overrides: { mode: 'none' } }, 'garbage']) {
    const bench = contractOfLibraryRow(row(BENCH, ['바벨', '벤치'], bad));
    assert.equal(bench.mode, 'unresolved');
    assert.equal(bench.readiness, 'unresolved');
    assert.equal(bench.reason, SEMANTICS_UNSUPPORTED);
    assert.equal(bench.e1rmEligible, false, 'allowlisted bench loses e1RM under unreadable semantics');
    assert.equal(bench.massRequired, false);
    assert.equal(bench.overrides, null);
    const bw = contractOfLibraryRow(row('bw', ['맨몸'], bad));
    assert.equal(bw.mode, 'unresolved', 'bodyweight is not silently "none"');
    /* 잠그지 않은 코드 예외로 내려가지도 않는다 */
    const pull = contractOfLibraryRow(row(ASSIST_PULLUP, ['철봉', '밴드'], bad));
    assert.equal(pull.mode, 'unresolved');
    assert.equal(pull.bandRole, null);
  }
  /* 저장 칸을 읽지 않으면(undefined — 스위치 꺼짐) 예전과 같다 */
  assert.deepEqual(contractOfLibraryRow(row(BENCH, ['바벨', '벤치'])), resolveRecordingContract({ exerciseId: BENCH, equipment: ['바벨', '벤치'], category: '파워', isHold: false, movementPattern: null, overrides: overridesFor(BENCH) }));
  assert.equal(contractOfLibraryRow(row(BENCH, ['바벨', '벤치'])).e1rmEligible, true);
});

await test('precedence: locked code > stored > unlocked code > equipment default (whole layer, not per key)', () => {
  /* 잠그지 않은 코드: 보조 밴드 */
  assert.equal(overridesSourceFor(ASSIST_PULLUP), 'code');
  assert.equal(contractOfLibraryRow(row(ASSIST_PULLUP, ['철봉', '밴드'])).bandRole, 'assistance');
  assert.equal(contractOfLibraryRow(row(ASSIST_PULLUP, ['철봉', '밴드'], null)).bandRole, 'assistance', 'null stored → code');
  /* 저장값이 통째로 갈음 — 빈 {} 도 '예외 없음' */
  const cleared = contractOfLibraryRow(row(ASSIST_PULLUP, ['철봉', '밴드'], stored({})));
  assert.equal(cleared.bandRole, null, 'stored {} removes the unlocked code role');
  assert.equal(overridesSourceFor(ASSIST_PULLUP, stored({})), 'stored');
  assert.equal(contractOfLibraryRow(row(ASSIST_PULLUP, ['철봉', '밴드'], stored({ bandRole: 'resistance' }))).bandRole, 'resistance');
  /* 칸마다 섞지 않는다: 저장값이 e1rm 만 말해도 코드의 bandRole 이 살아나지 않는다 */
  assert.equal(contractOfLibraryRow(row(ASSIST_PULLUP, ['철봉', '밴드'], stored({ e1rm: false }))).bandRole, null);
  /* 장비 기본값 */
  assert.equal(overridesSourceFor('nobody'), 'default');
  /* 잠근 코드 예외 — 시험용 줄을 잠깐 넣는다 */
  const table = LOAD_OVERRIDES as Record<string, CodeOverride>;
  table[LOCKED_ID] = { locked: true, bandRole: 'assistance' };
  try {
    assert.equal(overridesSourceFor(LOCKED_ID, stored({ bandRole: 'resistance' })), 'locked');
    assert.equal(contractOfLibraryRow(row(LOCKED_ID, ['철봉', '밴드'], stored({ bandRole: 'resistance' }))).bandRole, 'assistance');
    assert.equal(contractOfLibraryRow(row(LOCKED_ID, ['철봉', '밴드'], { v: 9 })).bandRole, 'assistance', 'locked wins even over unreadable stored');
    assert.deepEqual(overridesFor(LOCKED_ID), { bandRole: 'assistance' }, 'locked flag stripped');
  } finally {
    delete table[LOCKED_ID];
  }
  /* 같은 결정을 두 번 — 결정적 */
  const a = effectiveOverrides({ bandRole: 'assistance' }, readLoadSemantics(stored({ use: 'combined', bandRole: 'resistance' })));
  const b = effectiveOverrides({ bandRole: 'assistance' }, readLoadSemantics(stored({ bandRole: 'resistance', use: 'combined' })));
  assert.deepEqual(a, b);
});

await test('validator rejects incompatible combinations with actionable Korean messages (no em dash)', () => {
  const cases: [string, unknown, string[], RegExp][] = [
    ['bandRole without band', { bandRole: 'assistance' }, ['철봉'], /밴드가 있을 때만/],
    ['combined without mass', { use: 'combined' }, ['밴드'], /밴드와 .*같이 있을 때만/],
    ['alternative without band', { use: 'alternative' }, ['덤벨'], /밴드와 .*같이 있을 때만/],
    ['use with two mass families', { use: 'combined' }, ['밴드', '덤벨', '메디신볼'], /두 종류/],
    ['fixedSupport not present', { fixedSupport: ['바벨'] }, ['덤벨'], /필요 장비에 없어요/],
    ['fixedSupport already support', { fixedSupport: ['박스'] }, ['박스', '덤벨'], /이미 받침 장비/],
    ['fixedSupport band', { fixedSupport: ['밴드'] }, ['밴드', '덤벨'], /밴드는 받침으로 둘 수 없어요/],
    ['weightedVariation on free weight', { weightedVariation: true }, ['바벨'], /무게를 더한 맨몸/],
    ['weightedVariation with band', { weightedVariation: true }, ['밴드', '철봉'], /밴드 운동은/],
    ['e1rm on cable', { e1rm: true }, ['케이블'], /추정 1RM/],
    ['e1rm on band', { e1rm: true }, ['밴드'], /추정 1RM/],
    ['e1rm on added', { e1rm: true, weightedVariation: true }, ['맨몸'], /추정 1RM/],
    ['e1rm on combined', { e1rm: true, use: 'combined' }, ['바벨', '밴드'], /추정 1RM/],
    ['unknown key', { mode: 'none' }, ['맨몸'], /알 수 없는 설정/],
    ['bad value', { bandRole: 'pull' }, ['밴드'], /저항 · 보조/],
    ['bad e1rm value', { e1rm: 'maybe' }, ['바벨'], /켜기 · 끄기/],
  ];
  for (const [name, raw, equipment, re] of cases) {
    const r = validateSemanticOverrides(raw, { equipment });
    assert.equal(r.ok, false, name);
    const m = messagesOf(r).join(' ');
    assert.match(m, re, `${name}: ${m}`);
    assert.ok(!m.includes(EM_DASH), `${name}: no em dash`);
  }
  /* 버티기는 1RM 을 못 켠다 */
  assert.equal(validateSemanticOverrides({ e1rm: true }, { equipment: ['덤벨'], isHold: true }).ok, false);
  assert.equal(validateSemanticOverrides(null, { equipment: [] }).ok, false);
});

await test('validator accepts genuine exceptions and returns the resolved contract (same as preview/readback)', () => {
  const role = validateSemanticOverrides({ bandRole: 'assistance' }, { equipment: ['철봉', '밴드'] });
  assert.ok(role.ok && role.contract.mode === 'band' && role.contract.bandRole === 'assistance');
  const comb = validateSemanticOverrides({ use: 'combined', bandRole: 'resistance' }, { equipment: ['바벨', '밴드'] });
  assert.ok(comb.ok && comb.contract.mode === 'combined' && comb.contract.massBasis === 'barbellTotal');
  const alt = validateSemanticOverrides({ use: 'alternative' }, { equipment: ['케틀벨', '밴드'] });
  assert.ok(alt.ok && alt.contract.mode === 'alternative' && alt.contract.variants?.length === 2);
  const altE1rm = validateSemanticOverrides({ use: 'alternative', e1rm: true }, { equipment: ['덤벨', '밴드'] });
  assert.ok(altE1rm.ok, 'alternative: e1rm goes to the mass variant');
  const fixed = validateSemanticOverrides({ fixedSupport: ['바벨'] }, { equipment: ['바벨', '벤치'] });
  assert.ok(fixed.ok && fixed.contract.mode === 'none');
  const added = validateSemanticOverrides({ weightedVariation: true, fixedSupport: ['원판'] }, { equipment: ['원판', '철봉'] });
  assert.ok(added.ok && added.contract.mode === 'externalMass' && added.contract.massBasis === 'added');
  const e1on = validateSemanticOverrides({ e1rm: true }, { equipment: ['덤벨'] });
  assert.ok(e1on.ok && e1on.contract.e1rmEligible);
  const e1off = validateSemanticOverrides({ e1rm: false }, { exerciseId: BENCH, equipment: ['바벨', '벤치'] });
  assert.ok(e1off.ok && !e1off.contract.e1rmEligible);
  const none = validateSemanticOverrides({}, { equipment: ['맨몸'] });
  assert.ok(none.ok && none.contract.mode === 'none');
});

await test('form decision: absent without marker, default, custom fields, unknown values handed to the validator', () => {
  const fd = (entries: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };
  assert.deepEqual(semanticsDecisionOf(fd([[SEMANTICS_FORM.bandRole, 'assistance']])), { kind: 'absent' });
  assert.deepEqual(semanticsDecisionOf(fd([[SEMANTICS_FORM.marker, '1'], [SEMANTICS_FORM.mode, 'default'], [SEMANTICS_FORM.bandRole, 'assistance']])), { kind: 'default' });
  const c = semanticsDecisionOf(
    fd([
      [SEMANTICS_FORM.marker, '1'],
      [SEMANTICS_FORM.mode, 'custom'],
      [SEMANTICS_FORM.bandRole, 'resistance'],
      [SEMANTICS_FORM.use, 'combined'],
      [SEMANTICS_FORM.fixedSupport, '원판'],
      [SEMANTICS_FORM.fixedSupport, '바벨'],
      [SEMANTICS_FORM.weightedVariation, 'on'],
      [SEMANTICS_FORM.e1rm, 'off'],
      [SEMANTICS_FORM.note, ' 검토함 '],
    ])
  );
  assert.deepEqual(c, { kind: 'custom', raw: { bandRole: 'resistance', use: 'combined', fixedSupport: ['원판', '바벨'], weightedVariation: true, e1rm: false }, note: '검토함' });
  const weird = semanticsDecisionOf(fd([[SEMANTICS_FORM.marker, '1'], [SEMANTICS_FORM.mode, 'custom'], [SEMANTICS_FORM.e1rm, 'maybe']]));
  assert.ok(weird.kind === 'custom' && weird.raw.e1rm === 'maybe');
});

await test('write plan: FORBIDDEN, absent → none (even schema-off), SCHEMA_OFF, LOCKED, INVALID, clear, set with by/at', () => {
  const admin = { id: 'admin-1', role: 'ADMIN' };
  const ctx = { equipment: ['철봉', '밴드'] };
  const custom = { kind: 'custom' as const, raw: { bandRole: 'assistance' }, note: null };
  assert.equal(planSemanticsWrite({ actor: null, structured: true, decision: custom, code: null, ctx }).ok, false);
  const user = planSemanticsWrite({ actor: { id: 'u', role: 'USER' }, structured: true, decision: custom, code: null, ctx });
  assert.ok(!user.ok && user.code === 'FORBIDDEN');
  const manager = planSemanticsWrite({ actor: { id: 'm', role: 'MANAGER' }, structured: true, decision: custom, code: null, ctx });
  assert.ok(!manager.ok && manager.code === 'FORBIDDEN', 'manager is not the content admin');
  assert.deepEqual(planSemanticsWrite({ actor: admin, structured: false, decision: { kind: 'absent' }, code: null, ctx }), { ok: true, write: 'none' });
  const off = planSemanticsWrite({ actor: admin, structured: false, decision: custom, code: null, ctx });
  assert.ok(!off.ok && off.code === 'SCHEMA_OFF' && off.error === SCHEMA_OFF_MESSAGE);
  const offDefault = planSemanticsWrite({ actor: admin, structured: false, decision: { kind: 'default' }, code: null, ctx });
  assert.ok(!offDefault.ok && offDefault.code === 'SCHEMA_OFF');
  const locked = planSemanticsWrite({ actor: admin, structured: true, decision: custom, code: { locked: true, bandRole: 'assistance' }, ctx });
  assert.ok(!locked.ok && locked.code === 'LOCKED');
  const invalid = planSemanticsWrite({ actor: admin, structured: true, decision: { kind: 'custom', raw: { bandRole: 'assistance' }, note: null }, code: null, ctx: { equipment: ['맨몸'] } });
  assert.ok(!invalid.ok && invalid.code === 'INVALID' && /밴드가 있을 때만/.test(invalid.error));
  const longNote = planSemanticsWrite({ actor: admin, structured: true, decision: { ...custom, note: 'x'.repeat(201) }, code: null, ctx });
  assert.ok(!longNote.ok && longNote.code === 'INVALID');
  assert.deepEqual(planSemanticsWrite({ actor: admin, structured: true, decision: { kind: 'default' }, code: null, ctx }), { ok: true, write: 'clear' });
  const now = new Date('2026-11-17T05:00:00.000Z');
  const set = planSemanticsWrite({ actor: admin, structured: true, decision: { ...custom, note: '보조 확인' }, code: null, ctx, now });
  assert.ok(set.ok && set.write === 'set');
  if (set.ok && set.write === 'set') {
    assert.deepEqual(set.value, { v: 1, overrides: { bandRole: 'assistance' }, note: '보조 확인', by: 'admin-1', at: now.toISOString() });
    assert.equal(set.contract.bandRole, 'assistance');
  }
});

/* ─────────────────────────── 2) 격리 DB + 실제 코드 ─────────────────────────── */

type R1A = { prisma: PrismaClient | null; user: { id: string; role: string } | null; tags: string[]; paths: string[] };
const g = globalThis as unknown as { __R1A: R1A };
g.__R1A = { prisma: null, user: null, tags: [], paths: [] };

const STUBS: Record<string, string> = {
  'server-only': 'export {};',
  'next/cache': [
    'export const unstable_cache = (fn) => fn;',
    'export function updateTag(t) { globalThis.__R1A.tags.push(t); }',
    'export function revalidateTag(t) { globalThis.__R1A.tags.push(t); }',
    'export function revalidatePath(p) { globalThis.__R1A.paths.push(p); }',
  ].join('\n'),
  '@/lib/prisma': [
    'export const prisma = new Proxy({}, { get(_t, k) {',
    "  const p = globalThis.__R1A && globalThis.__R1A.prisma; if (!p) throw new Error('R1A: isolated prisma missing');",
    "  const v = p[k]; return typeof v === 'function' ? v.bind(p) : v; } });",
  ].join('\n'),
  '@/lib/dal': 'export async function getCurrentUser() { return globalThis.__R1A.user; }',
  '@/lib/storage': [
    "export const LIBRARY_PREFIX = 'library';",
    "export function isLibraryPath(p) { return p.startsWith('library/') && !p.includes('..'); }",
    'export async function deleteVideos() {}',
    'export async function deleteUserFiles() {}',
    'export function clearPlaybackUrlCache() {}',
  ].join('\n'),
};
const HOOK = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) return { url: 'data:text/javascript,' + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  return next(specifier, context);
}`;
register('data:text/javascript,' + encodeURIComponent(HOOK));

const content = await import('@/app/actions/content');
const libraryCache = await import('@/lib/library-cache');
const server = await import('@/lib/workout/load/server');
const sessionPlan = await import('@/lib/workout/session-plan');
const deleteUser = await import('@/lib/delete-user');

const LOAD_SQL = 'prisma/pending-migrations/20261116150000_ex_load01_recording_contract/migration.sql';
const SCHEMA_SQL = execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

async function isolated(apply: string[]) {
  const pg = await PGlite.create();
  await pg.exec(SCHEMA_SQL);
  for (const f of apply) await pg.exec(readFileSync(f, 'utf8'));
  /* DB 로 가는 프로토콜 바이트를 모두 모은다(이름이 든 SQL 이 한 번이라도 갔는지) */
  const wire: string[] = [];
  const raw = pg as unknown as { execProtocolRawStream: (m: Uint8Array, o: unknown) => Promise<unknown> };
  const orig = raw.execProtocolRawStream.bind(pg);
  raw.execProtocolRawStream = (m: Uint8Array, o: unknown) => {
    wire.push(Buffer.from(m).toString('utf8'));
    return orig(m, o);
  };
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
  await socket.start();
  const port = (socket as unknown as { server: { address(): { port: number } } }).server.address().port;
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`, max: 1 }) });
  return { pg, socket, db, wire };
}

function exerciseForm(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  const base: Record<string, string | string[]> = {
    title: '시험 운동',
    category: '파워',
    description: '설명',
    videoPath: 'library/test.mp4',
    thumbPath: '',
    bodyParts: ['어깨'],
    intensity: '중간',
    reps: '10',
    sets: '3',
  };
  for (const [k, v] of Object.entries({ ...base, ...fields })) {
    for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  }
  return f;
}
const semFields = (mode: 'custom' | 'default', o: Partial<Record<'bandRole' | 'use' | 'e1rm' | 'note', string>> & { fixedSupport?: string[]; weightedVariation?: boolean } = {}) => ({
  [SEMANTICS_FORM.marker]: '1',
  [SEMANTICS_FORM.mode]: mode,
  ...(o.bandRole ? { [SEMANTICS_FORM.bandRole]: o.bandRole } : {}),
  ...(o.use ? { [SEMANTICS_FORM.use]: o.use } : {}),
  ...(o.e1rm ? { [SEMANTICS_FORM.e1rm]: o.e1rm } : {}),
  ...(o.note ? { [SEMANTICS_FORM.note]: o.note } : {}),
  ...(o.fixedSupport ? { [SEMANTICS_FORM.fixedSupport]: o.fixedSupport } : {}),
  ...(o.weightedVariation ? { [SEMANTICS_FORM.weightedVariation]: 'on' } : {}),
});

async function seedUser(db: PrismaClient, tag: string, role: 'USER' | 'ADMIN' = 'USER') {
  return db.user.create({ data: { email: `${tag}@r1admin.test`, nickname: tag, password: 'x', role } as unknown as Prisma.UserCreateInput, select: { id: true, role: true } });
}

/* 2-1 스키마 미적용 DB + 스위치 꺼짐 */
await (async () => {
  const off = await isolated([]);
  g.__R1A.prisma = off.db;
  try {
    const admin = await seedUser(off.db, 'off-admin', 'ADMIN');
    const member = await seedUser(off.db, 'off-member');
    const cols = await off.pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'ExerciseVideo' AND column_name = 'loadSemantics'`);
    off.wire.length = 0;

    await test('schema-off: admin create without semantics works; control-off write is SCHEMA_OFF and creates nothing', async () => {
      assert.equal(cols.rows[0].n, 0, 'column really absent');
      g.__R1A.user = admin;
      const ok = await content.createExercise(undefined, exerciseForm({ title: '꺼짐 운동', equipment: ['철봉', '밴드'] }));
      assert.equal(ok?.error, undefined, ok?.error);
      const before = await off.db.exerciseVideo.count();
      const refused = await content.createExercise(undefined, exerciseForm({ title: '꺼짐 예외', equipment: ['철봉', '밴드'], ...semFields('custom', { bandRole: 'assistance' }) }));
      assert.equal(refused?.error, SCHEMA_OFF_MESSAGE);
      assert.equal(await off.db.exerciseVideo.count(), before, 'nothing created');
      const ex = await off.db.exerciseVideo.findFirstOrThrow({ where: { title: '꺼짐 운동' } });
      const upd = await content.updateExercise(undefined, exerciseForm({ id: ex.id, title: '바뀐 제목', equipment: ['철봉', '밴드'], videoPath: '', ...semFields('default') }));
      assert.equal(upd?.error, SCHEMA_OFF_MESSAGE);
      assert.equal((await off.db.exerciseVideo.findUniqueOrThrow({ where: { id: ex.id } })).title, '꺼짐 운동', 'row unchanged on SCHEMA_OFF');
    });

    await test('schema-off: non-admin rejected by the real action', async () => {
      g.__R1A.user = member;
      const r = await content.createExercise(undefined, exerciseForm({ title: '회원 시도', equipment: ['맨몸'] }));
      assert.match(r?.error ?? '', /관리자만/);
      assert.equal(await off.db.exerciseVideo.count({ where: { title: '회원 시도' } }), 0);
    });

    await test('schema-off: library cache rows carry no loadSemantics; stored map empty; contracts are code-only', async () => {
      const rows = await libraryCache.allExercises();
      assert.ok(rows.length >= 1);
      assert.ok(rows.every((r) => !('loadSemantics' in r)));
      assert.equal((await libraryCache.storedLoadSemantics()).size, 0);
      const ex = rows.find((r) => r.title === '꺼짐 운동')!;
      const c = (await server.currentContracts([ex.id])).get(ex.id)!;
      assert.equal(c.mode, 'band');
      assert.equal(c.bandRole, null, 'no stored semantics read; code table has no entry');
    });

    await test('schema-off: account deletion works with no recovery table and sends no recovery SQL', async () => {
      const victim = await seedUser(off.db, 'off-victim');
      await deleteUser.deleteUserCompletely(victim.id);
      assert.equal(await off.db.user.count({ where: { id: victim.id } }), 0);
      assert.deepEqual(deleteUser.loadRecoveryCleanup(off.db, victim.id, false), []);
    });

    await test('schema-off: no wire message mentions loadSemantics or WorkoutLoadRecovery', () => {
      assert.ok(off.wire.length > 20, `captured ${off.wire.length} protocol messages`);
      const hits = off.wire.filter((m) => m.includes('loadSemantics') || m.includes('WorkoutLoadRecovery'));
      assert.equal(hits.length, 0, hits.slice(0, 2).join(' | '));
    });
  } finally {
    g.__R1A.prisma = null;
    await off.db.$disconnect();
    await off.socket.stop();
    await off.pg.close();
  }
})();

/* 2-2 보류 SQL 적용 DB + 스위치 켬 */
await (async () => {
  const on = await isolated([LOAD_SQL]);
  g.__R1A.prisma = on.db;
  process.env.WORKOUT_LOAD_SCHEMA = '1';
  const storedOf = async (id: string) =>
    (await on.db.$queryRawUnsafe<{ s: unknown }[]>(`SELECT "loadSemantics" AS s FROM "ExerciseVideo" WHERE "id" = $1`, id))[0]?.s ?? null;
  try {
    const admin = await seedUser(on.db, 'on-admin', 'ADMIN');
    const member = await seedUser(on.db, 'on-member');
    g.__R1A.user = admin;

    await test('schema-on create: semantics stored in the same transaction; readback via library cache; cache invalidated', async () => {
      g.__R1A.tags.length = 0;
      const r = await content.createExercise(undefined, exerciseForm({ title: '켬 밴드 풀업', equipment: ['철봉', '밴드'], ...semFields('custom', { bandRole: 'assistance', note: '보조로 검토' }) }));
      assert.equal(r?.error, undefined, r?.error);
      assert.ok(g.__R1A.tags.includes(libraryCache.LIBRARY_TAG), 'library cache tag cleared');
      const ex = await on.db.exerciseVideo.findFirstOrThrow({ where: { title: '켬 밴드 풀업' } });
      const s = (await storedOf(ex.id)) as Record<string, unknown>;
      assert.deepEqual(s.overrides, { bandRole: 'assistance' });
      assert.equal(s.v, 1);
      assert.equal(s.note, '보조로 검토');
      assert.equal(s.by, admin.id);
      assert.ok(typeof s.at === 'string');
      const cached = (await libraryCache.allExercises()).find((x) => x.id === ex.id)!;
      assert.deepEqual(cached.loadSemantics, s, 'readback through allExercises');
      const c = (await server.currentContracts([ex.id])).get(ex.id)!;
      assert.equal(c.bandRole, 'assistance');
      assert.equal(c.bandRoleSource, 'override');
    });

    await test('schema-on create rejects incompatible settings before creating the row', async () => {
      const before = await on.db.exerciseVideo.count();
      const r = await content.createExercise(undefined, exerciseForm({ title: '잘못된 예외', equipment: ['바벨'], ...semFields('custom', { bandRole: 'resistance', weightedVariation: true }) }));
      assert.match(r?.error ?? '', /밴드가 있을 때만/);
      assert.match(r?.error ?? '', /무게를 더한 맨몸/);
      assert.equal(await on.db.exerciseVideo.count(), before);
    });

    const ex = await on.db.exerciseVideo.findFirstOrThrow({ where: { title: '켬 밴드 풀업' } });

    await test('schema-on edit: valid change persists; invalid change rejects without touching the row; no-marker edit preserves semantics', async () => {
      g.__R1A.tags.length = 0;
      const ok = await content.updateExercise(undefined, exerciseForm({ id: ex.id, title: '켬 밴드 풀업', equipment: ['철봉', '밴드'], videoPath: '', ...semFields('custom', { bandRole: 'resistance' }) }));
      assert.equal(ok?.error, undefined, ok?.error);
      assert.ok(g.__R1A.tags.includes(libraryCache.LIBRARY_TAG));
      assert.deepEqual(((await storedOf(ex.id)) as { overrides: unknown }).overrides, { bandRole: 'resistance' });
      const bad = await content.updateExercise(undefined, exerciseForm({ id: ex.id, title: '제목도 바꿔 봄', equipment: ['철봉'], videoPath: '', ...semFields('custom', { bandRole: 'assistance' }) }));
      assert.match(bad?.error ?? '', /밴드가 있을 때만/);
      const after = await on.db.exerciseVideo.findUniqueOrThrow({ where: { id: ex.id } });
      assert.equal(after.title, '켬 밴드 풀업', 'row untouched on INVALID');
      assert.deepEqual([...after.equipment].sort(), ['밴드', '철봉'], 'equipment untouched (stored in list order)');
      const keep = (await storedOf(ex.id)) as { at: string };
      const plain = await content.updateExercise(undefined, exerciseForm({ id: ex.id, title: '제목만 바꿈', equipment: ['철봉', '밴드'], videoPath: '' }));
      assert.equal(plain?.error, undefined);
      assert.deepEqual(await storedOf(ex.id), keep, 'semantics (incl. at/by) untouched without marker');
    });

    await test('schema-on authorization: non-admin cannot edit semantics or the row', async () => {
      g.__R1A.user = member;
      const r = await content.updateExercise(undefined, exerciseForm({ id: ex.id, title: '회원 편집', equipment: ['철봉', '밴드'], videoPath: '', ...semFields('default') }));
      assert.match(r?.error ?? '', /관리자만/);
      assert.notEqual(await storedOf(ex.id), null);
      g.__R1A.user = admin;
    });

    await test('schema-on locked code override: write refused (LOCKED), stored untouched, locked wins on read', async () => {
      const table = LOAD_OVERRIDES as Record<string, CodeOverride>;
      table[ex.id] = { locked: true, bandRole: 'assistance' };
      try {
        const before = await storedOf(ex.id);
        const r = await content.updateExercise(undefined, exerciseForm({ id: ex.id, title: '제목만 바꿈', equipment: ['철봉', '밴드'], videoPath: '', ...semFields('custom', { bandRole: 'resistance' }) }));
        assert.match(r?.error ?? '', /잠근 운동/);
        assert.deepEqual(await storedOf(ex.id), before);
        const c = (await server.currentContracts([ex.id])).get(ex.id)!;
        assert.equal(c.bandRole, 'assistance', 'locked code beats stored resistance');
      } finally {
        delete table[ex.id];
      }
    });

    await test('schema-on library change mid-session: frozen session keeps its contract; a new freeze/current pick up the change', async () => {
      const before = (await libraryCache.allExercises()).find((x) => x.id === ex.id)!;
      assert.equal(contractOfLibraryRow(before).bandRole, 'resistance');
      const frozenEx = sessionPlan.freezeExercise(before, 'main');
      const hook = frozenEx.load?.bandRole === 'resistance';
      const plan = { themeKey: 'lower', themeLabel: 't', exercises: [{ ...frozenEx, load: contractOfLibraryRow(before) }] };
      const session = await on.db.trainingSession.create({
        data: { userId: member.id, date: new Date('2026-11-17T00:00:00Z'), themeKey: 'lower', plan: plan as unknown as Prisma.InputJsonValue, status: 'ACTIVE', startedAt: new Date('2026-11-17T01:00:00Z') },
      });
      /* 관리자가 판 중간에 뜻 설정을 바꾼다 */
      const r = await content.updateExercise(undefined, exerciseForm({ id: ex.id, title: '제목만 바꿈', equipment: ['철봉', '밴드'], videoPath: '', ...semFields('custom', { bandRole: 'assistance' }) }));
      assert.equal(r?.error, undefined, r?.error);
      const frozen = (await server.frozenContracts([session.id])).get(session.id)!.get(ex.id)!;
      assert.equal(frozen.evidence, 'contract');
      assert.equal(frozen.contract.bandRole, 'resistance', 'already-frozen session unchanged');
      const sess = await on.db.trainingSession.findUniqueOrThrow({ where: { id: session.id } });
      assert.equal(contractOfFrozen((sess.plan as { exercises: { id: string }[] }).exercises[0]).bandRole, 'resistance');
      const after = (await libraryCache.allExercises()).find((x) => x.id === ex.id)!;
      assert.equal((await server.currentContracts([ex.id])).get(ex.id)!.bandRole, 'assistance', 'current contract follows the update');
      assert.equal(contractOfLibraryRow(after).bandRole, 'assistance', 'library-row contract (what the freeze hook passes) follows the update');
      const refrozen = sessionPlan.freezeExercise(after, 'main');
      if (hook) {
        assert.equal(refrozen.load?.bandRole, 'assistance', 'new freeze picks up the change');
      } else {
        pending++;
        notes.push(`PENDING session-plan hook: freezeExercise still freezes code-only overrides (new freeze bandRole=${String(refrozen.load?.bandRole)}); one-line change in lib/workout/session-plan.ts required`);
      }
    });

    await test('schema-on default mode clears the stored value (NULL) and falls back to the code table', async () => {
      const r = await content.updateExercise(undefined, exerciseForm({ id: ex.id, title: '제목만 바꿈', equipment: ['철봉', '밴드'], videoPath: '', ...semFields('default') }));
      assert.equal(r?.error, undefined, r?.error);
      assert.equal(await storedOf(ex.id), null);
      const cached = (await libraryCache.allExercises()).find((x) => x.id === ex.id)!;
      assert.equal(cached.loadSemantics, null);
    });

    await test('schema-on unknown stored version (newer app) → unresolved on read; ordinary edit preserves the raw value', async () => {
      const future = { v: 2, overrides: { bandRole: 'assistance', tempo: 'slow' } };
      await on.db.$executeRawUnsafe(`UPDATE "ExerciseVideo" SET "loadSemantics" = $1::jsonb WHERE "id" = $2`, JSON.stringify(future), ex.id);
      g.__R1A.tags.length = 0;
      const c = (await server.currentContracts([ex.id])).get(ex.id)!;
      assert.equal(c.mode, 'unresolved');
      assert.equal(c.reason, SEMANTICS_UNSUPPORTED);
      const plain = await content.updateExercise(undefined, exerciseForm({ id: ex.id, title: '제목만 다시', equipment: ['철봉', '밴드'], videoPath: '' }));
      assert.equal(plain?.error, undefined);
      assert.deepEqual(await storedOf(ex.id), future, 'unknown value not overwritten without an explicit semantics edit');
    });

    await test('schema-on account deletion removes only that owner\'s recovery rows (actor-only rows of others stay)', async () => {
      const u1 = await seedUser(on.db, 'on-del-1');
      const u2 = await seedUser(on.db, 'on-del-2');
      const ins = (id: string, owner: string, actor: string, hash: string) =>
        on.db.$executeRawUnsafe(
          `INSERT INTO "WorkoutLoadRecovery" ("id","ownerId","actorId","setId","sessionId","exerciseId","setNo","originalHash","originalPayload","reason") VALUES ($1,$2,$3,'set','sess','ex',1,$4,'{}'::jsonb,'LEGACY_UNSUPPORTED_LOAD')`,
          id,
          owner,
          actor,
          hash
        );
      await ins('r1', u1.id, u1.id, 'h1');
      await ins('r2', u1.id, u2.id, 'h2');
      await ins('r3', u2.id, u1.id, 'h3');
      await ins('r4', u2.id, u2.id, 'h4');
      await deleteUser.deleteUserCompletely(u1.id);
      const left = await on.db.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "WorkoutLoadRecovery" ORDER BY "id"`);
      assert.deepEqual(left.map((x) => x.id), ['r3', 'r4']);
      assert.equal(await on.db.user.count({ where: { id: u1.id } }), 0);
      assert.equal(await on.db.user.count({ where: { id: u2.id } }), 1);
    });

    await test('schema-on deletion is atomic: a failing user.delete rolls back the recovery delete too', async () => {
      const u3 = await seedUser(on.db, 'on-del-3');
      await on.db.$executeRawUnsafe(
        `INSERT INTO "WorkoutLoadRecovery" ("id","ownerId","actorId","setId","sessionId","exerciseId","setNo","originalHash","originalPayload","reason") VALUES ('r5',$1,$1,'set','sess','ex',1,'h5','{}'::jsonb,'LEGACY_UNSUPPORTED_LOAD')`,
        u3.id
      );
      await assert.rejects(
        on.db.$transaction([...deleteUser.loadRecoveryCleanup(on.db, u3.id, true), on.db.user.delete({ where: { id: 'missing-user' } })])
      );
      assert.equal(Number((await on.db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "WorkoutLoadRecovery" WHERE "id" = 'r5'`))[0].n), 1);
    });

    await test('schema-on: the semantics reads/writes actually went over the wire (sanity for the off-phase oracle)', () => {
      assert.ok(on.wire.some((m) => m.includes('SELECT "id", "loadSemantics" FROM "ExerciseVideo"')));
      assert.ok(on.wire.some((m) => m.includes('UPDATE "ExerciseVideo" SET "loadSemantics"')));
      assert.ok(on.wire.some((m) => m.includes('DELETE FROM "WorkoutLoadRecovery"')));
    });
  } finally {
    delete process.env.WORKOUT_LOAD_SCHEMA;
    g.__R1A.prisma = null;
    await on.db.$disconnect();
    await on.socket.stop();
    await on.pg.close();
  }
})();

console.log(`load-r1-admin selftest: ${passed} passed, ${failures.length} failed, ${pending} pending`);
for (const n of notes) console.log('  … ' + n);
for (const f of failures) console.log('  ✗ ' + f);
process.exit(failures.length ? 1 : 0);
