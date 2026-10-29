/**
 * 출시 전 베타 서버 관문 통합 시험(2026-10-29) — 실제 RPC 입구 · 실제 서버 동작 · 실제 업로드 처리기를 모의 DB · 저장소 · GPU 로 돌린다.
 * 운영 DB · 저장소 · GPU 에는 닿지 않는다(lib/prisma · lib/storage · gpu-client · 세션을 통째로 바꿔 끼운다).
 * 막힌 요청은 DB 쓰기 · 서명 주소 · GPU 호출이 하나도 없어야 한다.
 *
 *   node --import ./scripts/alias-register.mjs scripts/release-gate-test.mjs
 */
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url);
const abs = (p) => new URL(p, root).href;

const g = {
  stage: 'restricted_beta',
  session: null,
  user: null,
  headers: {},
  db: [],
  writes: [],
  storage: [],
  gpu: [],
  lab: [],
  misc: [],
};
globalThis.__gate = g;

/* 진짜 모듈의 내보낸 이름(함수 · 값) — 바꿔 끼운 모듈이 같은 이름을 다시 내보내게 */
const exportNames = (file) =>
  [...readFileSync(new URL(file, root), 'utf8').matchAll(/^export (?:async )?(?:function|const|let|class) (\w+)/gm)].map((m) => m[1]);
/* 진짜 모듈을 그대로 두고 함수만 기록기로 — 값(상수)은 진짜 */
const recordingModule = (file, bucket, overrides = '') => {
  const names = exportNames(file);
  return `import * as real from '${abs(file)}?real';
const g = globalThis.__gate;
const ov = {${overrides}};
const wrap = (k, v) => typeof v === 'function' ? (...a) => { g.${bucket}.push(k); return k in ov ? ov[k](...a) : undefined; } : v;
${names.map((n) => `export const ${n} = wrap('${n}', real['${n}']);`).join('\n')}`;
};

const PRISMA = `const g = globalThis.__gate;
const WRITE = /^(create|update|upsert|delete)/;
const model = (name) => new Proxy({}, { get: (_, op) => async () => {
  const key = name + '.' + String(op);
  g.db.push(key);
  if (WRITE.test(String(op))) g.writes.push(key);
  if (name === 'user' && op === 'findUnique') return g.user;
  if (op === 'findMany') return [];
  if (op === 'count') return 0;
  if (String(op).startsWith('find') || op === 'aggregate') return null;
  return {};
} });
export const prisma = new Proxy({}, { get: (_, k) => {
  if (k === '$transaction') return async (x) => (typeof x === 'function' ? x(prisma) : Promise.all(x));
  if (k === '$executeRaw' || k === '$queryRaw' || k === '$executeRawUnsafe') return async () => { g.db.push(String(k)); g.writes.push(String(k)); return 0; };
  if (typeof k === 'symbol' || k === 'then') return undefined;
  return model(String(k));
} });`;

const mocks = new Map([
  ['/lib/prisma.ts', PRISMA],
  [
    '/lib/session.ts',
    `const g = globalThis.__gate;
export async function readSession() { return g.session; }
export async function getSession() { return g.session; }
export function passwordFingerprint() { return 'fp'; }
export async function createSession() { g.writes.push('session.create'); }
export async function deleteSession() { g.writes.push('session.delete'); }`,
  ],
  ['/lib/clock-server.ts', recordingModule('lib/clock-server.ts', 'misc', 'ensureSim: async () => {}, simOffsetMs: () => 0')],
  [
    '/lib/storage.ts',
    recordingModule(
      'lib/storage.ts',
      'storage',
      `isStorageConfigured: () => true, videoLimitOf: () => 50 * 1024 * 1024, isOwnedBy: (p, u) => String(p).startsWith(u + '/'),
       createAvatarUrl: async () => null, createPlaybackUrls: async () => ({}), smallLibraryPath: () => null, pitchThumbPath: () => null`
    ),
  ],
  [
    '/lib/pitch-3d/v2/gpu-client.ts',
    recordingModule('lib/pitch-3d/v2/gpu-client.ts', 'gpu', `isPitch3dV2Configured: () => true, getEngineBuild: async () => null`),
  ],
  [
    '/lib/pitch-lab.ts',
    recordingModule(
      'lib/pitch-lab.ts',
      'lab',
      `listLabSamples: async () => [], findLabOwner: async () => null, loadLabSample: async () => null,
       createLabUploadTarget: async () => { g.storage.push('createSignedUploadUrl'); return { path: 'p', signedUrl: 'https://signed', token: 't' }; }`
    ),
  ],
]);

const NEXT = {
  'next/headers': `const g = globalThis.__gate;
export async function headers() { return new Headers(g.headers); }
export async function cookies() { return { get: () => undefined, getAll: () => [], has: () => false, set() {}, delete() {} }; }`,
  'next/navigation': `const fail = (digest) => { const e = new Error(digest); e.digest = digest; throw e; };
export function redirect(url) { fail('NEXT_REDIRECT;replace;' + url + ';307;'); }
export function permanentRedirect(url) { fail('NEXT_REDIRECT;replace;' + url + ';308;'); }
export function notFound() { fail('NEXT_HTTP_ERROR_FALLBACK;404'); }
export function forbidden() { fail('NEXT_HTTP_ERROR_FALLBACK;403'); }
export function unauthorized() { fail('NEXT_HTTP_ERROR_FALLBACK;401'); }
export function unstable_rethrow(e) { if (e && typeof e.digest === 'string' && e.digest.startsWith('NEXT_')) throw e; }`,
  'next/cache': `export function revalidatePath() {} export function revalidateTag() {} export function updateTag() {} export function refresh() {}
export function unstable_noStore() {} export function unstable_cache(fn) { return fn; } export function cacheLife() {} export function cacheTag() {}`,
  'server-only': 'export {};',
};

/* 시험용 RPC 모듈 표 — 진짜 동작 몇 모듈 + 일부러 만든 둘(밝힘 없는 함수 · 막힘을 삼키는 함수 · 표에 없는 모듈) */
const REGISTRY = `import * as pitchLab from '${abs('app/actions/pitch-lab.ts')}';
import * as analysisConsent from '${abs('app/actions/analysis-consent.ts')}';
import * as app from '${abs('app/actions/app.ts')}';
import * as nutrition from '${abs('app/actions/nutrition.ts')}';
import * as swingLab from '${abs('app/actions/swing-lab.ts')}';
import * as velocity from '${abs('app/actions/velocity.ts')}';
import * as velocityAdmin from '${abs('app/actions/velocity-admin.ts')}';
import * as appAdmin from '${abs('app/actions/app-admin.ts')}';
import { getCurrentUser } from '${abs('lib/dal.ts')}';
const g = globalThis.__gate;
export const RPC_MODULES = {
  'pitch-lab': pitchLab,
  'analysis-consent': analysisConsent,
  app,
  nutrition,
  'swing-lab': swingLab,
  velocity,
  'velocity-admin': velocityAdmin,
  'app-admin': appAdmin,
  /* 표는 profile(계정 — 베타에 열림)을 열었지만 이 함수는 밝힘이 없다 — 동작 안의 관문이 막아야 한다 */
  profile: {
    async noGrant() { g.ran = 'profile.noGrant'; const u = await getCurrentUser(); g.writes.push('profile.noGrant.write'); return { ok: true, id: u?.id }; },
    async swallow() { try { await getCurrentUser(); } catch { return { ok: false, error: '처리 못 함' }; } g.writes.push('profile.swallow.write'); return { ok: true }; },
  },
  /* 고객센터 — 베타에 잠김(2026-10-29 금윤호: 3D · 설정 · 내 정보 · 홈 말고 전부). 표가 먼저 막아 함수가 안 돈다 */
  support: { async ask() { g.ran = 'support.ask'; await getCurrentUser(); g.writes.push('support.write'); return { ok: true }; } },
  /* 표에 없는 새 모듈 — 부르지도 않고 막혀야 한다 */
  'brand-new': { async go() { g.ran = 'brand-new.go'; await getCurrentUser(); g.writes.push('brand-new.write'); return { ok: true }; } },
};`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(NEXT, specifier)) return { url: `data:text/javascript,${encodeURIComponent(NEXT[specifier])}`, shortCircuit: true };
    /* next 는 package exports 가 없어 'next/server' 를 노드가 못 찾는다 — 파일 이름으로 */
    const fromApp = !!context.parentURL && !context.parentURL.includes('/node_modules/');
    if (fromApp && (/^next\/[a-z-]+$/.test(specifier) || (/^next\/dist\//.test(specifier) && !specifier.endsWith('.js'))))
      return nextResolve(`${specifier}.js`, context);
    /* 앱 코드의 확장자 없는 상대 경로('../registry') */
    if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/.test(specifier) && context.parentURL) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const u = new URL(specifier + ext, context.parentURL);
        if (existsSync(u)) return nextResolve(u.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('/app/api/rpc/registry.ts')) return { format: 'module', source: REGISTRY, shortCircuit: true };
    for (const [suffix, source] of mocks) if (url.endsWith(suffix)) return { format: 'module', source, shortCircuit: true };
    return nextLoad(url, context);
  },
});

const setStage = (s) => {
  if (s === 'restricted_beta') process.env.RELEASE_STAGE = 'restricted_beta';
  else delete process.env.RELEASE_STAGE;
};
setStage('restricted_beta');

const { POST: rpcPost } = await import(abs('app/api/rpc/[action]/route.ts'));
const { POST: uploadPost } = await import(abs('app/api/pitch-lab/upload-url/route.ts'));
const dal = await import(abs('lib/dal.ts'));
const pitchLab = await import(abs('app/actions/pitch-lab.ts'));
const nutrition = await import(abs('app/actions/nutrition.ts'));
const velocityAdmin = await import(abs('app/actions/velocity-admin.ts'));
const { FeatureLockedError, stageOf } = await import(abs('lib/release-gate.ts'));

const base = {
  email: 'x@example.com',
  nickname: '시험',
  avatarPath: null,
  accountType: 'PLAYER',
  sinkerStartedAt: null,
  country: null,
  publicSinker: false,
  birthDate: null,
  sex: null,
  heightCm: 180,
  weightKg: 80,
  wingspanCm: null,
  targetVelocity: null,
  baselineFreq: null,
  baselineVolume: null,
  baselineIntensity: null,
  baselineMix: null,
  baselineWorkoutFreq: null,
  throwingHand: '우투',
  battingHand: null,
  competitionLevel: null,
  dailyWorkoutMinutes: null,
  ownedEquipment: [],
  trainingLevel: null,
  trainingGoal: null,
  trainingFocus: null,
  pitchSetupAt: null,
  trainingSetupAt: null,
  tutorialsDone: [],
  nutritionProfile: null,
  createdAt: new Date('2026-10-28T00:00:00Z'),
  password: 'hash',
};
const as = (role, accountType = 'PLAYER') => {
  g.user = { ...base, id: `u-${role.toLowerCase()}`, role, accountType };
  g.session = { userId: g.user.id, pw: 'fp' };
};
const reset = () => {
  g.db = [];
  g.writes = [];
  g.storage = [];
  g.gpu = [];
  g.lab = [];
  g.misc = [];
  g.ran = null;
};

let n = 0;
const check = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};

/* 장면마다 깨끗한 실행 맥락 — 서버 동작의 밝힘(enterWith)이 다음 장면으로 새지 않게 */
const clean = AsyncLocalStorage.snapshot();
const scene = (fn) => clean(fn);

const rpc = async (action, args = [], level = 8) => {
  reset();
  g.headers = { 'x-bp-entry': 'api', 'x-bp-path': `/api/rpc/${action}` };
  const req = new Request(`http://t/api/rpc/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bullpen-app': String(level) },
    body: JSON.stringify({ args }),
  });
  const res = await scene(() => rpcPost(req, { params: Promise.resolve({ action }) }));
  return { status: res.status, body: await res.json() };
};
const locked = (r) => r.status === 403 && r.body.error === 'FEATURE_LOCKED_BETA';
const sideEffects = () => g.writes.length + g.storage.length + g.gpu.length;
/* 관문이 사람을 읽는 user.findUnique 말고는 DB 를 안 건드렸나 */
const onlyUserRead = () => g.db.every((k) => k === 'user.findUnique');

/* ───────── 1. 앱 RPC — 일반 사용자 ───────── */
as('USER');
let r = await rpc('nutrition.setWeight', ['2026-10-29', 80]);
check(locked(r), '일반: 영양 쓰기 RPC 는 403 FEATURE_LOCKED_BETA');
check(sideEffects() === 0 && onlyUserRead(), '일반: 막힌 영양 RPC 는 DB 쓰기 · 읽기 0');
check(r.body.policyVersion && r.body.capability === 'nutrition', '403 에 기능 · 정책 판');
r = await rpc('app.loadAppHome');
check(locked(r) && onlyUserRead(), '일반: 예전 홈 통계 RPC 막힘 · 통계 조회 0');
r = await rpc('swing-lab.saveSwingSample', [{ id: '0b7b1a4e-0000-4000-8000-000000000000', meta: {} }]);
check(locked(r) && sideEffects() === 0, '일반: 스윙 3D 저장 막힘 · 저장소 0');
r = await rpc('velocity.saveVelocitySession', [{}]);
check(locked(r) && sideEffects() === 0, '일반: 구속 측정 저장 막힘');
r = await rpc('app-admin.loadAppAdmin');
check(locked(r) && sideEffects() === 0, '일반: 관리 첫 화면은 베타 잠금');
r = await rpc('support.ask');
check(locked(r) && g.ran === null && sideEffects() === 0, '일반: 고객센터도 베타 잠금(함수를 부르지 않음)');
r = await rpc('brand-new.go');
check(locked(r) && g.ran === null && sideEffects() === 0, '표에 없는 모듈은 부르지도 않고 막힘(기본 거부)');
r = await rpc('profile.noGrant');
check(locked(r) && g.ran === 'profile.noGrant' && g.writes.length === 0, '표가 열어도 함수가 밝히지 않으면 동작 안에서 막힘(쓰기 전)');
r = await rpc('profile.swallow');
check(locked(r) && g.writes.length === 0, '동작이 막힘을 삼켜 { ok:false } 로 돌려줘도 입구는 403');
r = await rpc('pitch-lab.loadAppLabList', ['mine'], 7);
check(r.status === 426 && r.body.error === 'update', '베타를 모르는 옛 앱(판 7)은 426 업데이트');

/* 열린 것 — 투구 3D */
r = await rpc('pitch-lab.loadAppLabList', ['mine']);
check(r.status === 200 && r.body.ok && r.body.result.ok === true, '일반: 투구 3D 목록 열림');
check(!('to' in r.body.result), '일반: 베타에는 투구 첫 설정으로 안 보냄(pitchSetupAt 없음)');
r = await rpc('pitch-lab.requestPitch3dV2', [{ id: '0b7b1a4e-0000-4000-8000-000000000000', consent: true }]);
check(r.status === 200 && !locked(r), '일반: 투구 3D 분석 요청은 관문을 지난다');
check(g.gpu.filter((k) => k === 'startGpuJob').length === 0, '모의 — 샘플이 없으니 GPU 는 안 부름(유료 실행 없음)');
check(g.writes.length === 0, '찾을 수 없는 샘플에는 쓰기 없음(기존 소유권 검사 그대로)');
r = await rpc('analysis-consent.loadAppAnalysisConsent');
check(r.status === 200, '일반: 분석 동의 상태 열림');
r = await rpc('app.loadAppMe');
check(r.status === 200 && r.body.result.access?.restricted === true, '일반: 시작 정보에 베타 요약');
check(r.body.result.access.allowed.includes('pitch3d') && !r.body.result.access.allowed.includes('swing3d'), '요약: 투구 3D 열림 · 스윙 잠김');

/* ───────── 2. 계정 종류 MASTER — 대표 예외가 아니다 ───────── */
as('USER', 'MASTER');
check(locked(await rpc('nutrition.setWeight', ['2026-10-29', 80])), 'USER + MASTER: 영양 막힘');
check((await rpc('pitch-lab.loadAppLabList', ['mine'])).status === 200, 'USER + MASTER: 투구 3D 열림(계정 종류 그대로)');
check(g.user.accountType === 'MASTER' && g.writes.length === 0, '계정 종류를 바꾸지 않는다');

/* ───────── 3. 준관리자 — 일반과 같다(관리 업무 · 구속 측정 · ABS 도 베타 동안 잠김, 2026-10-29 금윤호) ───────── */
for (const acct of ['PLAYER', 'MASTER']) {
  as('MANAGER', acct);
  check(locked(await rpc('nutrition.setWeight', ['2026-10-29', 80])), `준관리자(${acct}): 영양 막힘`);
  check(locked(await rpc('swing-lab.saveSwingSample', [{}])), `준관리자(${acct}): 스윙 막힘`);
  check((await rpc('pitch-lab.loadAppLabList', ['mine'])).status === 200, `준관리자(${acct}): 투구 3D 열림`);
  r = await rpc('app-admin.loadAppAdmin');
  check(locked(r) && sideEffects() === 0, `준관리자(${acct}): 관리 첫 화면 베타 잠금`);
  r = await rpc('app-admin.loadAppVelocityAdmin');
  check(locked(r) && sideEffects() === 0, `준관리자(${acct}): 구속 관리자 베타 잠금`);
  r = await rpc('velocity-admin.adminUpdateVelocityPitch', ['p1', {}]);
  check(locked(r) && g.writes.length === 0, `준관리자(${acct}): 구속 관리 쓰기 베타 잠금 · 쓰기 0`);
  r = await rpc('velocity.loadVelocityStart');
  check(locked(r) && sideEffects() === 0, `준관리자(${acct}): 구속 측정 베타 잠금`);
  r = await rpc('velocity.saveVelocitySession', [{}]);
  check(locked(r) && g.writes.length === 0, `준관리자(${acct}): 구속 측정 저장(ABS 포함) 베타 잠금`);
  r = await rpc('app-admin.setAppUserRole', ['someone', 'ADMIN']);
  check(r.status === 403 && g.writes.length === 0, `준관리자(${acct}): 역할 바꾸기 거부 · 쓰기 0`);
  r = await rpc('app.setMyCountry', ['us']);
  check(r.status === 403 && g.writes.length === 0, `준관리자(${acct}): 대표 전용(나라 바꾸기) 거부`);
  r = await rpc('app.loadAppMe');
  check(r.status === 200 && r.body.result.access?.adminPerms.length === 0, `준관리자(${acct}): 시작 정보의 관리 업무 비어 있음`);
}

/* ───────── 4. 대표관리자 · 정식 출시 ───────── */
as('ADMIN');
for (const a of ['nutrition.setWeight', 'swing-lab.saveSwingSample', 'app.loadAppHome', 'velocity.loadVelocityStart'])
  check(!locked(await rpc(a, [])), `대표관리자: ${a} 는 베타 잠금 없음`);
r = await rpc('app.loadAppMe');
check(r.body.result.access.restricted === false, '대표 요약은 제한 없음');
setStage('released');
as('USER');
check(!locked(await rpc('nutrition.setWeight', ['2026-10-29', 80])), '정식 출시: 일반 영양 RPC 잠금 없음');
check(!locked(await rpc('brand-new.go')), '정식 출시: 관문은 아무것도 안 막는다');
check((await rpc('pitch-lab.loadAppLabList', ['mine'], 7)).status !== 426, '정식 출시: 옛 앱 426 없음');
r = await rpc('pitch-lab.loadAppLabList', ['mine']);
check(r.body.result.to === '/videos/setup', '정식 출시: 투구 첫 설정 요구는 그대로');
setStage('restricted_beta');

/* ───────── 5. 웹 서버 동작을 직접 부름(RPC 를 거치지 않음) ───────── */
const direct = async (headers, fn) => {
  reset();
  g.headers = headers;
  return scene(async () => {
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      return { ok: false, e };
    }
  });
};
const isLocked = (x) => !x.ok && x.e instanceof FeatureLockedError;
as('USER');
let x = await direct({ 'x-bp-entry': 'action', 'x-bp-path': '/nutrition' }, () => nutrition.setWeight('2026-10-29', 80));
check(isLocked(x) && g.writes.length === 0, '웹 동작 직접 호출: 영양 쓰기 막힘 · 쓰기 0');
x = await direct({ 'x-bp-entry': 'action', 'x-bp-path': '/videos/lab' }, () => nutrition.setWeight('2026-10-29', 80));
check(isLocked(x) && g.writes.length === 0, '열린 화면 주소로 잠긴 동작을 보내도 막힘');
x = await direct({ 'x-bp-entry': 'action', 'x-bp-path': '/videos/lab' }, () => pitchLab.loadAppLabList('mine'));
check(x.ok && x.value.ok === true, '열린 화면에서 투구 3D 동작');
x = await direct({ 'x-bp-entry': 'action', 'x-bp-path': '/training' }, () => pitchLab.loadAppLabList('mine'));
check(isLocked(x), '잠긴 화면 주소로 보낸 투구 3D 동작도 막힘(동작 뒤 다시 그리는 화면이 잠긴 것)');
x = await direct({}, () => nutrition.setWeight('2026-10-29', 80));
check(isLocked(x) && g.writes.length === 0, 'proxy 머리가 없으면 동작 취급 — 밝힘 없는 것은 막힘');
x = await direct({ 'x-bp-entry': 'action', 'x-bp-path': '/admin/velocity' }, () => velocityAdmin.adminDeleteVelocityPitch('p1'));
check(isLocked(x) || (x.ok && x.value.ok === false), '일반: 구속 관리 동작 거부');
as('MANAGER');
x = await direct({ 'x-bp-entry': 'action', 'x-bp-path': '/admin/velocity' }, () => velocityAdmin.adminDeleteVelocityPitch('p1'));
check(isLocked(x) && g.writes.length === 0, '준관리자: 웹 구속 관리 동작도 베타 잠금');
as('USER');

/* ───────── 6. 화면(page) ───────── */
x = await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/training' }, () => dal.getCurrentUser());
check(!x.ok && x.e.digest === 'NEXT_REDIRECT;replace;/today;307;', '잠긴 화면은 베타 홈으로');
x = await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/videos/lab/abc' }, () => dal.getCurrentUser());
check(x.ok && x.value?.id === 'u-user', '투구 3D 화면은 열림');
x = await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/videos' }, () => dal.getCurrentUser());
check(!x.ok, '잠긴 부모 /videos 는 막힘');
x = await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/today' }, () => dal.getCurrentUser());
check(x.ok, '홈 열림');
x = await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/brand-new-page' }, () => dal.getCurrentUser());
check(!x.ok, '모르는 화면은 막힘');
as('MANAGER');
check(!(await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/admin/velocity' }, () => dal.getCurrentUser())).ok, '준관리자 구속 관리 화면도 베타 잠금');
check(!(await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/admin' }, () => dal.getCurrentUser())).ok, '준관리자 관리 첫 화면 베타 잠금');
check(!(await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/support' }, () => dal.getCurrentUser())).ok, '준관리자 고객센터 베타 잠금');
check(!(await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/admin/dev3d' }, () => dal.getCurrentUser())).ok, '준관리자 3D 개발 화면 거부');
check(!(await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/admin/users' }, () => dal.getCurrentUser())).ok, '준관리자 대표 전용 화면 거부');
/* 비로그인 — 관문을 안 거친다(사람이 없음). 공개 읽기는 각 화면 그대로(2026-10-29 결정) */
g.session = null;
check((await direct({ 'x-bp-entry': 'page', 'x-bp-path': '/market' }, () => dal.getCurrentUser())).value === null, '비로그인은 사람 없음 — 관문이 막지 않는다');

/* 판 넘기기 자리(@home · @videos · @hitting) — 베타 틀이 화면에 놓지 않아도 Next 는 병렬 경로를 따로 그려 보낸다. 판이 스스로 빠지는지 */
const hidden = async () => {
  reset();
  g.headers = { 'x-bp-entry': 'page', 'x-bp-path': '/today' };
  const v = await scene(() => dal.betaPanelHidden());
  return { v, reads: g.db.length, onlyUser: onlyUserRead() };
};
as('USER');
let h = await hidden();
check(h.v === true && h.onlyUser, '일반: 판 넘기기 자리는 그리지 않음(사람 읽기만)');
as('USER', 'MASTER');
check((await hidden()).v === true, '일반 + 마스터 계정 종류: 판 그리지 않음');
as('MANAGER');
check((await hidden()).v === true, '준관리자: 판 그리지 않음(일반과 같은 화면)');
as('ADMIN');
check((await hidden()).v === false, '대표관리자: 판 그대로');
g.session = null;
check((await hidden()).v === false, '비로그인: 판 판정 없음(각 화면이 로그인으로 보냄)');
setStage('released');
as('USER');
check((await hidden()).v === false, '정식 출시: 판 그대로');
setStage('restricted_beta');

/* ───────── 7. 업로드 처리기 — 같은 주소가 투구 · 스윙을 받는다 ───────── */
as('USER');
const upload = async (q) => {
  reset();
  g.headers = { 'x-bp-entry': 'api', 'x-bp-path': `/api/pitch-lab/upload-url${q}` };
  const req = new Request(`http://t/api/pitch-lab/upload-url${q}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: 'a.mov', fileSize: 1000, fileType: 'video/quicktime' }),
  });
  return scene(async () => {
    try {
      return { res: await uploadPost(req) };
    } catch (e) {
      return { e };
    }
  });
};
const pair = '0b7b1a4e-0000-4000-8000-000000000000';
let u = await upload(`?pair=${pair}&view=side`);
check(u.res?.status === 200 && g.storage.includes('createSignedUploadUrl'), '투구 3D 업로드 주소 발급');
u = await upload(`?pair=${pair}&view=side&sport=hit`);
check(u.e instanceof FeatureLockedError && g.storage.length === 0 && g.lab.length === 0, 'sport=hit 은 막힘 · 서명 0');
u = await upload(`?pair=${pair}&view=side&sport=pitch%00hit`);
check(u.e instanceof FeatureLockedError && g.storage.length === 0, '이상한 sport 값은 잠긴 쪽(스윙)으로 · 서명 0');
as('ADMIN');
u = await upload(`?pair=${pair}&view=side&sport=hit`);
check(!u.e, '대표관리자는 스윙 업로드 그대로');

/* ───────── 환경변수 값 읽기 — 대시보드에 붙여 넣다 생긴 빈칸 · 따옴표 · 대문자도 베타로(2026-10-30) ───────── */
for (const v of ['restricted_beta', ' restricted_beta ', '"restricted_beta"', "'restricted_beta'", 'RESTRICTED_BETA', 'restricted-beta', 'restricted_beta\n', 'beta', 'BETA'])
  check(stageOf(v) === 'restricted_beta', `베타 값: ${JSON.stringify(v)}`);
for (const v of [undefined, '', 'released', 'off', 'restricted', 'false'])
  check(stageOf(v) === 'released', `정식 값: ${JSON.stringify(v)}`);

console.log(`release-gate: ${n}개 통과`);
void pathToFileURL;
