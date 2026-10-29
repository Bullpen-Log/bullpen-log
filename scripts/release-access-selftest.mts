/**
 * 출시 전 베타 정책 시험(2026-10-29) — 순수 판정(lib/release-access.ts) · RPC 동작 표(lib/release-ops.ts) · 서버 동작의 기능 밝힘 줄.
 * 실제 서버 관문 · RPC 입구 · 동작을 모의 DB 로 돌리는 시험은 scripts/release-gate-test.mjs.
 *
 *   node --import ./scripts/alias-register.mjs scripts/release-access-selftest.mts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  BETA_ALLOWED,
  BETA_LOCK_TITLE,
  accessAllowsPath,
  capabilityOfPath,
  decideAccess,
  decidePath,
  isBetaRestricted,
  releaseAccessOf,
  type Capability,
} from '../lib/release-access.ts';
import { RPC_ACTION_CAPABILITY, RPC_MODULE_CAPABILITY, rpcAccessOf } from '../lib/release-ops.ts';
import { applyBetaLocks, betaGroups, APP_TABS, MOBILE_TABS } from '../lib/nav.ts';
import { can } from '../lib/permissions.ts';

let n = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  n++;
};
const eq = <T,>(a: T, b: T, msg: string) => {
  assert.deepEqual(a, b, msg);
  n++;
};

const BETA = { stage: 'restricted_beta' as const };
const REL = { stage: 'released' as const };
const USER = { role: 'USER' };
const MANAGER = { role: 'MANAGER' };
const ADMIN = { role: 'ADMIN' };
/* 계정 종류 MASTER(팀 · 레슨장)는 판정에 끼지 않는다 — 역할만 본다 */
const USER_MASTER = { role: 'USER', accountType: 'MASTER' };
const MANAGER_MASTER = { role: 'MANAGER', accountType: 'MASTER' };

/* ── 1. 역할 × 기능 ── */
const LOCKED: Capability[] = [
  'support', 'pitchLog', 'velocity', 'abs', 'pitchReading', 'hitting', 'swing3d', 'training', 'armcare', 'mechanics', 'nutrition', 'records',
  'analysis', 'library', 'myVideos', 'checkin', 'calendar', 'notifications', 'board', 'dugout', 'chat', 'org', 'unclassified',
];
for (const who of [USER, USER_MASTER]) {
  for (const c of BETA_ALLOWED) ok(decideAccess(who, c, BETA).allowed, `일반(${JSON.stringify(who)}) 베타 허용: ${c}`);
  for (const c of LOCKED) {
    const d = decideAccess(who, c, BETA);
    ok(!d.allowed && d.reason === 'locked_beta', `일반 베타 잠금: ${c}`);
  }
}
ok(decideAccess(USER, 'pitch3d', BETA).allowed, '일반은 투구 3D');
ok(!decideAccess(USER, 'swing3d', BETA).allowed, '스윙 3D 는 잠김');
/* 준관리자 = 일반과 같다(2026-10-29 금윤호: "대표 관리자를 제외한 일반과 준관리자의 체험계정은 3D 분석만") — 관리 업무도 베타 동안 잠김 */
for (const who of [MANAGER, MANAGER_MASTER]) {
  for (const c of BETA_ALLOWED) ok(decideAccess(who, c, BETA).allowed, `준관리자 베타 허용: ${c}`);
  for (const c of LOCKED) {
    const d = decideAccess(who, c, BETA);
    ok(!d.allowed && d.reason === 'locked_beta', `준관리자 베타 잠금: ${c}`);
  }
  for (const perm of ['adminHome', 'shoot', 'velocityAdmin', 'recording', 'abs', 'dev3d'] as const) {
    const d = decideAccess(who, 'admin', { ...BETA, perm });
    ok(!d.allowed && d.reason === 'locked_beta', `준관리자 관리 업무 ${perm} 도 베타 잠금`);
  }
  ok(!decideAccess(who, 'admin', BETA).allowed, '준관리자 대표 전용 관리(회원 · 역할) 거부');
  ok(isBetaRestricted(who, 'restricted_beta'), '준관리자도 베타 제한을 받는다(MASTER 이어도)');
  /* 정식 출시면 예전 권한 그대로 — 역할 · 권한 표는 안 바꿨다 */
  for (const perm of ['adminHome', 'shoot', 'velocityAdmin', 'recording', 'abs'] as const)
    ok(decideAccess(who, 'admin', { ...REL, perm }).allowed, `출시 뒤 준관리자 관리 업무 ${perm}`);
}
ok(!BETA_ALLOWED.has('support'), '고객센터도 베타에 잠김(설정의 메일 문의는 그대로)');
eq(BETA_LOCK_TITLE, '준비 중인 기능입니다.', '잠긴 기능 안내 글');
for (const c of [...BETA_ALLOWED, ...LOCKED]) ok(decideAccess(ADMIN, c, BETA).allowed, `대표관리자 예외: ${c}`);
ok(!isBetaRestricted(ADMIN, 'restricted_beta'), '대표관리자는 제한 밖');
ok(isBetaRestricted(USER_MASTER, 'restricted_beta'), 'USER + MASTER 는 대표 예외가 아니다');
/* 일반 사용자에게 관리 업무는 베타면 베타 잠금, 출시 뒤면 권한 거부 */
for (const perm of ['adminHome', 'shoot', 'velocityAdmin', 'recording', 'abs', 'dev3d'] as const) {
  ok(decideAccess(USER, 'admin', { ...BETA, perm }).reason === 'locked_beta', `일반 관리 업무 베타 잠금 ${perm}`);
  ok(decideAccess(USER, 'admin', { ...REL, perm }).reason === 'permission_denied', `일반 관리 업무 출시 뒤 거부 ${perm}`);
}
/* 대표관리자는 베타에도 관리 업무 그대로 */
for (const perm of ['adminHome', 'shoot', 'velocityAdmin', 'recording', 'abs', 'dev3d'] as const)
  ok(decideAccess(ADMIN, 'admin', { ...BETA, perm }).allowed, `대표 관리 업무 ${perm}`);
ok(can('MANAGER', 'velocityAdmin') && can('MANAGER', 'abs'), '권한 표는 그대로(준관리자 구속 관리 · ABS) — 베타 판정만 막는다');

/* 정식 출시 — 베타 잠금 없음, 첫 설정은 'setup_required' 로 갈림, 권한은 그대로 */
for (const c of LOCKED) ok(decideAccess(USER, c, REL).allowed, `출시 뒤 열림: ${c}`);
eq(decideAccess(USER, 'pitchLog', { ...REL, setupLocked: true }).reason, 'setup_required', '출시 뒤 첫 설정 전은 setup_required');
eq(decideAccess(USER, 'pitchLog', { ...BETA, setupLocked: false }).reason, 'locked_beta', '첫 설정을 마쳐도 베타 잠금은 안 풀린다');
ok(!decideAccess(MANAGER, 'admin', { ...REL, perm: 'dev3d' }).allowed, '출시 뒤에도 dev3d 는 대표만');
ok(!decideAccess(null, 'admin', { ...REL, perm: 'adminHome' }).allowed, '비로그인 관리 업무 거부');

/* ── 2. 경로 → 기능(가장 구체적인 것 먼저 · 세그먼트 경계 · 쿼리) ── */
const cap = (href: string, surface: 'web' | 'native' = 'web') => capabilityOfPath(href, surface).capability;
eq(cap('/videos/lab'), 'pitch3d', '웹 투구 3D 목록');
eq(cap('/videos/lab/guide'), 'pitch3d', '웹 촬영 안내');
eq(cap('/videos/lab/0b7b1a4e-0000-4000-8000-000000000000'), 'pitch3d', '웹 결과');
eq(cap('/videos/labs'), 'pitchLog', '세그먼트 경계 — /videos/labs 는 투구 3D 가 아니다');
eq(cap('/videos'), 'pitchLog', '잠긴 부모 /videos(웹 — 투구 기록을 읽는다)');
eq(cap('/videos?view=log'), 'pitchLog', '/videos 쿼리 모드');
eq(cap('/videos', 'native'), 'home', '앱 투구 탭 첫 화면(도구 도크 — 3D 의 입구)은 열림');
eq(cap('/videos?view=log', 'native'), 'pitchLog', '앱 투구 기록(?view=log)은 잠김');
eq(cap('/videos/lab', 'native'), 'pitch3d', '앱 쪽 규칙이 /videos/lab 을 덮지 않는다');
eq(cap('/videos/setup'), 'pitchLog', '투구 첫 설정');
eq(cap('/embed/lab/abc?stop=3&dark=1'), 'pitch3d', '앱 3D 웹뷰');
eq(cap('/lab', 'native'), 'pitch3d', '앱 /lab');
eq(cap('/lab/new', 'native'), 'pitch3d', '앱 새 분석');
eq(cap('/lab/consent?from=new', 'native'), 'pitch3d', '앱 동의');
eq(cap('/lab/samples', 'native'), 'pitch3d', '앱 관리자 샘플(안에서 대표관리자만 — 서버 소유권 그대로)');
eq(cap('/labs', 'native'), 'unclassified', '앱 /labs 는 모름');
eq(cap('/hitting/lab'), 'swing3d', '웹 스윙 3D');
eq(cap('/swing/new', 'native'), 'swing3d', '앱 스윙 3D');
eq(cap('/hitting'), 'hitting', '타격');
eq(cap('/velocity?mode=abs', 'native'), 'abs', '쿼리로 ABS');
eq(cap('/velocity?mode=speed', 'native'), 'velocity', '구속');
eq(cap('/training?view=armcare'), 'armcare', '트레이닝 쿼리 — 암케어');
eq(cap('/training?view=mechanics&tab=elements&el=lead'), 'mechanics', '보고서의 드릴 링크는 메커니즘(잠김)');
eq(cap('/training-mechanics', 'native'), 'mechanics', '앱 메커니즘 화면(잠김)');
eq(cap('/analysis?view=pitch', 'native'), 'analysis', '투구량 통계는 투구 3D 가 아니다');
eq(cap('/coach?view=pitch'), 'analysis', '웹 투구 분석(통계)');
eq(cap('/records', 'native'), 'records', '기록 탭');
eq(cap('/today'), 'home', '홈');
eq(cap('/', 'native'), 'home', '앱 껍데기');
eq(cap('/?dugout=1', 'native'), 'dugout', '앱의 덕아웃 탭');
eq(cap('/'), 'dugout', '웹 / 는 덕아웃');
eq(cap('/support/inquiries'), 'support', '고객센터');
eq(cap('/settings', 'native'), 'account', '설정');
eq(cap('/profile', 'native'), 'account', '내 정보');
eq(cap('/privacy'), 'legal', '개인정보');
eq(cap('/admin'), 'admin', '관리 첫 화면');
eq(capabilityOfPath('/admin').perm, 'adminHome', '관리 첫 화면 권한');
eq(capabilityOfPath('/admin/velocity/recordings/x').perm, 'recording', '녹화는 recording(구속 관리자보다 먼저)');
eq(capabilityOfPath('/admin/velocity/2026-10-20').perm, 'velocityAdmin', '구속 관리');
eq(capabilityOfPath('/admin/shoot/3').perm, 'shoot', '촬영 관리');
eq(capabilityOfPath('/admin/dev3d').perm, 'dev3d', '3D 개발');
eq(capabilityOfPath('/admin/users').perm, undefined, '표에 없는 관리 화면은 대표만');
eq(cap('/manage/players'), 'org', '팀 · 레슨장 관리(MASTER)');
eq(cap('/some-new-thing'), 'unclassified', '모르는 주소');
ok(!decidePath(USER, '/some-new-thing', BETA).allowed, '모르는 주소는 베타에 막힘');
ok(!decidePath(MANAGER, '/admin/velocity', BETA).allowed, '준관리자 구속 관리 화면도 베타 잠금');
ok(!decidePath(MANAGER, '/abs', BETA).allowed && !decidePath(MANAGER, '/velocity', BETA).allowed, '준관리자 ABS · 구속 측정 화면 잠금');
ok(decidePath(MANAGER, '/admin/velocity', REL).allowed, '출시 뒤 준관리자 구속 관리 화면');
ok(!decidePath(MANAGER, '/admin/users', BETA).allowed, '준관리자 회원 관리 화면 거부');
ok(!decidePath(MANAGER, '/admin/dev3d', BETA).allowed, '준관리자 3D 개발 거부');
ok(!decidePath(USER, '/admin', BETA).allowed, '일반 관리 첫 화면 거부');

/* ── 3. 앱이 받는 요약(그리기용) ── */
const ua = releaseAccessOf(USER, 'restricted_beta');
ok(ua.restricted && ua.adminPerms.length === 0, '일반 요약');
ok(accessAllowsPath(ua, '/lab/new') && !accessAllowsPath(ua, '/training-today') && !accessAllowsPath(ua, '/swing'), '일반 앱 경로');
const ma = releaseAccessOf(MANAGER, 'restricted_beta');
ok(ma.restricted && ma.adminPerms.length === 0, '준관리자 요약 — 관리 업무 없음');
eq(ma.allowed, ua.allowed, '준관리자 = 일반(열린 기능이 같다)');
ok(!accessAllowsPath(ma, '/admin/velocity') && !accessAllowsPath(ma, '/velocity?mode=speed') && !accessAllowsPath(ma, '/velocity?mode=abs') && accessAllowsPath(ma, '/lab/new'), '준관리자 앱 경로');
eq(releaseAccessOf(MANAGER, 'released').adminPerms, ['adminHome', 'shoot', 'velocityAdmin', 'recording', 'abs'], '출시 뒤 준관리자 권한 그대로');
ok(!releaseAccessOf(ADMIN, 'restricted_beta').restricted, '대표 요약은 제한 없음');
ok(!releaseAccessOf(USER, 'released').restricted, '출시 요약은 제한 없음');
/* 요약이 없으면(아직 모름 · 꺼진 망에 저장 없음) 막힌 쪽 — 홈 · 계정만 */
ok(!accessAllowsPath(null, '/lab') && !accessAllowsPath(null, '/training-today') && accessAllowsPath(null, '/settings'), '모를 때는 덜 열린 쪽');

/*
 * 앱 껍데기가 판정하는 주소(native/src/app/index.tsx · more.tsx · lab/report.tsx · _layout.tsx) — 일반 · 준관리자 · 모름 · 대표 · 출시.
 * 탭 판(투구 · 트레이닝 첫 화면 · 기록 · 덕아웃 · 영양)은 붙이지 않고, 더보기 · 설정 · 내 정보 · 투구 3D 길만 연다
 */
const SHELL_LOCKED = [
  '/videos?view=log', '/training?view=home', '/records', '/?dugout=1', '/nutrition', '/org', '/training?view=mechanics', '/training-mechanics',
  '/pitch/2026-10-29', '/pitch/import', '/notice', '/velocity?mode=speed', '/velocity?mode=abs', '/velocity', '/support', '/support/new', '/admin',
  '/admin/velocity', '/admin/shoot/2', '/swing', '/pitch-reading', '/my-videos', '/analysis?view=pitch', '/calendar', '/library',
];
const SHELL_OPEN = ['/', '/today', '/videos', '/more', '/settings', '/profile', '/account', '/lab', '/lab/new', '/lab/guide?s=frame', '/lab/consent', '/lab/0f0c4e6a-1b2c-4d5e-8f90-123456789abc'];
for (const h of SHELL_LOCKED) ok(!accessAllowsPath(ua, h), `일반 앱: ${h} 잠김`);
for (const h of SHELL_OPEN) ok(accessAllowsPath(ua, h), `일반 앱: ${h} 열림`);
for (const h of SHELL_LOCKED) ok(!accessAllowsPath(ma, h), `준관리자 앱: ${h} 잠김`);
for (const h of SHELL_OPEN) ok(accessAllowsPath(ma, h), `준관리자 앱: ${h} 열림`);
for (const h of [...SHELL_LOCKED, '/lab/new', '/more']) ok(accessAllowsPath(null, h) === ['/more'].includes(h), `모름: ${h} ${['/more'].includes(h) ? '열림' : '잠김'}`);
/* 모를 때 투구 탭 첫 화면은 그린다 — 베타 판(BetaPitchTab)이라 투구 기록을 안 읽고, 안의 3D(/lab)는 정책이 오기 전엔 잠김 */
ok(accessAllowsPath(null, '/videos'), '모름: 앱 투구 첫 화면(베타 판)은 열림');
for (const h of SHELL_LOCKED) ok(accessAllowsPath(releaseAccessOf(ADMIN, 'restricted_beta'), h) && accessAllowsPath(releaseAccessOf(USER, 'released'), h), `대표 · 출시: ${h} 열림`);
/* 옛 서버(access 칸 없음)는 정식 출시로 본다 — native/src/shell/release.ts setReleaseFromMe 와 같은 값 */
ok(accessAllowsPath({ stage: 'released', policyVersion: 'x', restricted: false, allowed: [], adminPerms: [] }, '/videos'), '옛 서버 = 출시');

/* 탭 — 순서 · 모양 그대로, 홈만 열리고 잠김 까닭 'beta'. 앱에 보내는 탭은 주소 그대로 */
const appTabs = applyBetaLocks(APP_TABS, ua, { keepHref: true, surface: 'native' });
eq(appTabs.map((t) => t.href), APP_TABS.map((t) => t.href), '앱 탭 순서 · 주소 그대로');
eq(appTabs.map((t) => !!t.locked), [false, false, true, true, true], '홈 · 투구(첫 화면)만 열림(트레이닝 · 기록 · 덕아웃 잠김)');
eq(applyBetaLocks(APP_TABS, ma, { keepHref: true, surface: 'native' }).map((t) => !!t.locked), [false, false, true, true, true], '준관리자 앱 탭도 같다');
ok(appTabs.filter((t) => t.locked).every((t) => t.lockReason === 'beta'), '잠김 까닭은 beta(첫 설정과 섞지 않음)');
const webTabs = applyBetaLocks(MOBILE_TABS, ua);
ok(webTabs.filter((t) => t.locked).every((t) => t.href === '/today'), '웹의 잠긴 칸은 베타 홈을 가리킨다');
eq(applyBetaLocks(APP_TABS, releaseAccessOf(ADMIN, 'restricted_beta')), APP_TABS, '대표는 그대로');
const g = betaGroups([{ title: 'x', items: [{ href: '/videos/lab', label: '3D', icon: 'clapper' }, { href: '/nutrition', label: '영양', icon: 'utensils' }, { href: '/support', label: '고객센터', icon: 'support' }] }] as never, ua);
eq(g[0].items.map((i) => i.href), ['/videos/lab'], '웹 메뉴는 열린 항목만(고객센터도 잠김)');
/* 앱에 보내는 메뉴는 잠긴 항목도 남긴다 — 더보기가 회색 + 자물쇠로 그린다. 주소는 그대로(앱이 다시 판정) */
const appMenu = betaGroups(
  [{ title: 'x', items: [{ href: '/videos/lab', label: '3D', icon: 'clapper' }, { href: '/nutrition', label: '영양', icon: 'utensils' }, { href: '/admin/velocity', label: '구속 측정 관리자', icon: 'gauge' }] }] as never,
  ma,
  { showLocked: true }
);
eq(appMenu[0].items.map((i) => [i.href, !!(i as { locked?: boolean }).locked]), [['/videos/lab', false], ['/nutrition', true], ['/admin/velocity', true]], '앱 메뉴는 잠긴 것도 표시해서(준관리자 관리 업무 포함)');

/* ── 4. RPC 동작 표 — registry 의 모든 모듈이 분류됐나 · 열린 동작에 밝힘 줄이 있나 ── */
const registry = readFileSync('app/api/rpc/registry.ts', 'utf8');
const modules = [...registry.matchAll(/^\s+'?([a-z-]+)'?: [a-zA-Z]+,$/gm)].map((m) => m[1]);
ok(modules.length > 60, `registry 모듈 ${modules.length}`);
for (const m of modules) ok(Object.hasOwn(RPC_MODULE_CAPABILITY, m), `RPC 모듈 분류: ${m}`);
eq(rpcAccessOf('nope.fn').cap, 'unclassified', '모르는 모듈은 unclassified');
eq(rpcAccessOf('app.loadAppMe').cap, 'appInfra', 'loadAppMe 는 바탕');
eq(rpcAccessOf('app.loadAppHome').cap, 'records', '예전 홈 통계는 잠김');
eq(rpcAccessOf('app-analysis.loadAppAnalysis').cap, 'analysis', '투구량 통계는 투구 3D 가 아니다');
eq(rpcAccessOf('swing-lab.saveSwingSample').cap, 'swing3d', '스윙 저장 잠김');
eq(rpcAccessOf('app-admin.loadAppAdmin'), { cap: 'admin', perm: 'adminHome' }, '관리 첫 화면');
eq(rpcAccessOf('app-admin.setAppUserRole'), { cap: 'admin' }, '역할 바꾸기는 대표만');

/* 동작 파일의 밝힘 줄 — RPC 표가 연 함수는 함수 맨 위에 allowFeature/allowAdmin(또는 모듈 헬퍼)이 있어야 한다. 두 쪽이 모두 열어야 지나간다 */
const exportsOf = (file: string) => [...readFileSync(file, 'utf8').matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
const bodyOf = (src: string, name: string) => {
  const i = src.indexOf(`export async function ${name}(`);
  const j = src.indexOf('\nexport ', i + 10);
  return src.slice(i, j < 0 ? undefined : j);
};
const OPEN_MODULES: Record<string, string> = {
  'pitch-lab': "allowFeature('pitch3d')",
  'analysis-consent': "allowFeature('pitch3d')",
  auth: "allowFeature('account')",
  profile: "allowFeature('account')",
  'login-ticket': "allowFeature('account')",
  push: "allowFeature('appInfra')",
  support: "allowFeature('support')",
  velocity: "allowFeature('velocity')",
  abs: "allowFeature('abs')",
};
for (const [mod, line] of Object.entries(OPEN_MODULES)) {
  const file = `app/actions/${mod}.ts`;
  const src = readFileSync(file, 'utf8');
  for (const fn of exportsOf(file)) ok(bodyOf(src, fn).includes(line), `${mod}.${fn} 맨 위 밝힘 줄`);
}
for (const [mod, line] of Object.entries({
  'velocity-admin': "allowAdmin('velocityAdmin')",
  'velocity-recording': "allowAdmin('recording')",
  shoot: "allowAdmin('shoot')",
  'app-shoot': "allowAdmin('shoot')",
  'app-admin': 'allowAdmin(perm)',
}))
  ok(readFileSync(`app/actions/${mod}.ts`, 'utf8').includes(line), `${mod} 권한 헬퍼 밝힘 줄`);
for (const a of Object.keys(RPC_ACTION_CAPABILITY).filter((a) => a.startsWith('app.load') || a.startsWith('app.report')))
  ok(bodyOf(readFileSync('app/actions/app.ts', 'utf8'), a.split('.')[1]).includes("allowFeature('appInfra')"), `${a} 밝힘 줄`);
/* 반대로 — 잠긴 모듈의 함수에는 베타 밝힘 줄이 없어야 한다(잘못 열린 것 찾기) */
const OPEN_SET = new Set([...Object.keys(OPEN_MODULES), 'velocity-admin', 'velocity-recording', 'shoot', 'app-shoot', 'app-admin', 'app']);
for (const f of readdirSync('app/actions').filter((f) => f.endsWith('.ts'))) {
  const mod = f.replace(/\.ts$/, '');
  if (OPEN_SET.has(mod)) continue;
  ok(!/allowFeature\(|allowAdmin\(/.test(readFileSync(`app/actions/${f}`, 'utf8')), `잠긴 모듈 ${mod} 에 밝힘 줄 없음`);
}
/* 같은 업로드 주소가 투구 · 스윙을 같이 받는다 — sport 로 가르고, 모르는 값은 잠긴 쪽 */
const upload = readFileSync('app/api/pitch-lab/upload-url/route.ts', 'utf8');
ok(/allowFeature\(sportParam == null \|\| sportParam === 'pitch' \? 'pitch3d' : 'swing3d'\)/.test(upload), 'upload-url 은 sport 로 가름');
ok(upload.indexOf('allowFeature(') < upload.indexOf('await getCurrentUser()'), 'upload-url 은 사람을 읽기 전에 밝힘');

/* 판 넘기기 자리 — 베타면 맨 앞에서 빠진다(Next 가 병렬 경로를 따로 그려 보내므로 틀이 안 놓는 것만으로는 조회가 돈다) */
for (const file of [
  'app/(app)/@home/default.tsx',
  'app/(app)/@home/today/page.tsx',
  'app/(app)/@videos/default.tsx',
  'app/(app)/@videos/videos/page.tsx',
  'app/(app)/@hitting/default.tsx',
  'app/(app)/@hitting/hitting/page.tsx',
]) {
  const src = readFileSync(file, 'utf8');
  const body = src.slice(src.indexOf('export default async function'));
  const first = body.slice(body.indexOf('{') + 1).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  ok(first.startsWith('if (await betaPanelHidden()) return null;'), `${file} 맨 앞에서 베타면 빠짐`);
}

console.log(`release-access: ${n}개 통과`);
