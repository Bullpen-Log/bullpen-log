/**
 * 외부 영상 접수 권한 표 시험(2026-11-09) — 누가 접수함 · 관리 동작에 들어갈 수 있나, 앱 입구(관리자 화면 · 위 메뉴 · 3D 개발 관리자)가 같은 표를 보나.
 * DB 없이 순수 판정과 소스 글을 본다. 서버의 실제 막기(requirePermission · asAdmin · assertIntakeAdmin)는 메뉴를 숨기는 것과 따로 늘 있어야 한다.
 *
 *   node --import ./scripts/alias-register.mjs scripts/intake-access-selftest.mts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { can, isOwner, type Permission } from '../lib/permissions.ts';
import { accessAllowsPath, capabilityOfPath, decidePath, releaseAccessOf } from '../lib/release-access.ts';
import { RPC_MODULE_CAPABILITY, rpcAccessOf } from '../lib/release-ops.ts';
import { visibleGroups } from '../lib/nav.ts';
import { assertIntakeAdmin } from '../lib/intake/admin.ts';
import { isIntakeError } from '../lib/intake/errors.ts';
import { INTAKE_WEB_PATH, intakePathMove, intakeWebMove, isIntakePath } from '../native/src/admin/intake-nav.ts';

let n = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  n++;
};
const eq = <T,>(a: T, b: T, msg: string) => {
  assert.deepEqual(a, b, msg);
  n++;
};
const read = (p: string) => readFileSync(p, 'utf8');

const ROLES = ['ADMIN', 'MANAGER', 'USER'] as const;
const STAGES = ['released', 'restricted_beta'] as const;
const DETAIL = '/admin/intake/00000000-0000-4000-8000-000000000000';

/* ── 1. 권한 표(lib/permissions.ts) ── */
eq(ROLES.map((r) => can(r, 'intake')), [true, false, false], "intake 는 대표관리자만(MANAGER_PERMISSIONS 에 없다)");
for (const r of [null, undefined, '', 'admin', 'OWNER']) ok(!can(r, 'intake'), `모르는 역할 ${JSON.stringify(r)} 은 intake 없음`);
ok(isOwner('ADMIN') && !isOwner('MANAGER'), '대표관리자 판정');
/* 준관리자가 쓰는 다른 관리 기능은 그대로 — intake 만 닫혀 있다 */
for (const p of ['adminHome', 'shoot', 'velocityAdmin', 'recording', 'abs'] as Permission[]) ok(can('MANAGER', p), `준관리자 ${p} 는 그대로 열림`);

/* ── 2. 경로 표(lib/release-access.ts) — 웹 · 앱 같은 규칙 ── */
for (const href of [INTAKE_WEB_PATH, DETAIL, `${INTAKE_WEB_PATH}?status=received`]) {
  for (const surface of ['web', 'native'] as const)
    eq(capabilityOfPath(href, surface), { capability: 'admin', perm: 'intake' }, `${href} (${surface}) 는 intake 권한 관리 업무`);
}
/* 세그먼트 경계 — 비슷한 이름이 intake 권한을 빌리지 않는다(표에 없는 /admin 화면 = 대표관리자만) */
eq(capabilityOfPath('/admin/intakes'), { capability: 'admin' }, '/admin/intakes 는 intake 규칙이 아니다');
for (const stage of STAGES) {
  for (const r of ROLES) {
    const want = r === 'ADMIN';
    for (const href of [INTAKE_WEB_PATH, DETAIL])
      eq(decidePath({ role: r }, href, { stage }).allowed, want, `${stage} · ${r} · ${href} 서버 판정`);
  }
}
eq(decidePath({ role: 'MANAGER' }, INTAKE_WEB_PATH, { stage: 'released' }).reason, 'permission_denied', '정식 출시 준관리자는 권한 없음으로 막힘');
eq(decidePath({ role: 'MANAGER' }, INTAKE_WEB_PATH, { stage: 'restricted_beta' }).reason, 'locked_beta', '베타 준관리자는 베타 잠금으로 막힘');
eq(decidePath(null, INTAKE_WEB_PATH, { stage: 'released' }).allowed, false, '로그인 안 함은 막힘');

/* 앱 그리기 요약(accessAllowsPath) — 그리기용일 뿐, 정식 출시면 모두 true 다(막기는 서버). 베타 · 모름에서는 대표관리자만 */
for (const r of ROLES) {
  const beta = releaseAccessOf({ role: r }, 'restricted_beta');
  eq(accessAllowsPath(beta, INTAKE_WEB_PATH, 'native'), r === 'ADMIN', `베타 앱 요약 · ${r} 은 접수 화면 ${r === 'ADMIN' ? '열림' : '닫힘'}`);
  eq(releaseAccessOf({ role: r }, 'released').adminPerms.includes('intake'), r === 'ADMIN', `정식 출시 앱 요약 adminPerms 의 intake · ${r}`);
}
eq(accessAllowsPath(null, INTAKE_WEB_PATH, 'native'), false, '앱이 아직 계정을 모르면 접수 화면은 닫힌 쪽');

/* ── 3. 서버 동작 표(lib/release-ops.ts) ── */
eq(RPC_MODULE_CAPABILITY['intake-admin'], { cap: 'admin', perm: 'intake' }, "'intake-admin' 모듈은 admin · intake");
for (const a of ['createIntakeInvitation', 'getIntakeOriginalLink', 'publishIntakeRun', 'unpublishIntake', 'withdrawIntakeConsent'])
  eq(rpcAccessOf(`intake-admin.${a}`), { cap: 'admin', perm: 'intake' }, `intake-admin.${a} 는 intake 권한`);
ok(!/['"]?intake-admin['"]?\s*:/.test(read('app/api/rpc/registry.ts')), '접수 관리 동작은 앱 RPC 입구(registry)에 없다');

/* ── 4. 접수 계층의 마지막 막기(lib/intake/admin.ts assertIntakeAdmin) ── */
const refuses = (actor: Parameters<typeof assertIntakeAdmin>[0]) => {
  try {
    assertIntakeAdmin(actor);
    return false;
  } catch (e) {
    return isIntakeError(e) && e.code === 'admin_forbidden';
  }
};
ok(!refuses({ id: 'u1', role: 'ADMIN' }), '대표관리자는 통과');
for (const actor of [{ id: 'u2', role: 'MANAGER' }, { id: 'u3', role: 'USER' }, { id: 'u4', role: null }, { id: '', role: 'ADMIN' }, null, undefined])
  ok(refuses(actor), `assertIntakeAdmin 이 ${JSON.stringify(actor)} 를 admin_forbidden 으로 거절`);

/* ── 5. 서버의 실제 막기가 늘 있다(소스 글) — 메뉴 숨김에 기대지 않는다 ── */
const dal = read('lib/dal.ts');
const reqPerm = dal.slice(dal.indexOf('export async function requirePermission'), dal.indexOf('export function isMasterUser'));
ok(/can\(user\.role, perm\)/.test(reqPerm) && /redirect\('\/today'\)/.test(reqPerm) && /requireUser\(\)/.test(reqPerm), 'requirePermission 은 로그인 · can() 을 보고 못 쓰면 /today 로');
for (const page of ['app/(app)/admin/intake/page.tsx', 'app/(app)/admin/intake/[id]/page.tsx'])
  ok(read(page).includes("requirePermission('intake')"), `${page} 가 requirePermission('intake')`);
const actions = read('app/actions/intake-admin.ts');
ok(/async function asAdmin[\s\S]{0,200}allowAdmin\('intake'\)[\s\S]{0,80}requirePermission\('intake'\)/.test(actions), 'asAdmin 이 allowAdmin · requirePermission(intake) 를 먼저');
const exported = [...actions.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]);
ok(exported.length >= 15, `접수 관리 동작 ${exported.length}개를 찾음`);
for (const name of exported) {
  const start = actions.indexOf(`export async function ${name}(`);
  const next = actions.indexOf('\nexport ', start + 1);
  const body = actions.slice(start, next < 0 ? undefined : next);
  ok(body.includes('asAdmin(') || body.includes("requirePermission('intake')"), `${name} 은 asAdmin 또는 requirePermission('intake') 을 거친다`);
}

/* ── 6. 메뉴(lib/nav.ts) — 사이트가 보내는 '관리' 목록. 앱 위 메뉴 · 3D 개발 관리자 링크가 이것을 본다 ── */
for (const native of [false, true]) {
  for (const r of ROLES) {
    const has = visibleGroups(r, native).some((g) => g.items.some((i) => i.href === INTAKE_WEB_PATH));
    eq(has, r === 'ADMIN', `메뉴(${native ? '앱' : '웹'}) · ${r} 에게 '외부 영상 접수' ${r === 'ADMIN' ? '보임' : '숨김'}`);
  }
}

/* ── 7. 앱 입구 ── */
const appAdmin = read('app/actions/app-admin.ts');
ok(/intake: can\(a\.role, 'intake'\)/.test(appAdmin), "loadAppAdmin 의 perms 에 intake: can(role, 'intake')");
const adminScreen = read('native/src/app/admin/index.tsx');
ok(/data\.perms\.intake \? <MenuRow[^\n]*label="외부 영상 접수"[^\n]*detail="받은 영상 · 초대 만들기"[^\n]*router\.push\('\/admin\/intake'/.test(adminScreen), '앱 관리자 화면은 perms.intake 일 때만 접수 줄');
const menu = read('native/src/shell/menu-button.tsx');
ok(menu.includes("['/admin/dev3d', '/swing/samples']"), '위 메뉴의 3D 개발 관리자는 그대로 앱 화면 /swing/samples(6b829da4)');
ok(menu.includes("['/admin/intake', '/admin/intake']"), '위 메뉴의 외부 영상 접수는 앱 화면 /admin/intake');
ok(/manage\.map[\s\S]{0,400}close\(manageGo\(it\.href\)\)/.test(menu), '관리 줄은 manageGo 로(나머지는 껍데기 웹)');
const samples = read('native/src/app/swing/samples.tsx');
ok(/intake \? <LinkRow label="외부 영상 접수"/.test(samples) && samples.includes('INTAKE_WEB_PATH'), '3D 개발 관리자의 접수 링크는 사이트 관리 메뉴에 있을 때만');
const screen = read('native/src/app/admin/intake.tsx');
ok(screen.includes('applicationNameForUserAgent={APP_UA}'), '접수 웹뷰는 APP_UA 를 단다(휴대폰 막기 /phone 을 피함)');
ok(screen.includes('sharedCookiesEnabled'), '접수 웹뷰는 앱 로그인 쿠키를 같이 쓴다');
ok(/onShouldStartLoadWithRequest=\{onShouldStart\}/.test(screen) && screen.includes('다시 불러오기'), '접수 웹뷰는 이동을 거르고 실패하면 다시 불러오기');

/* ── 8. 접수 웹뷰가 어디로 가나(native/src/admin/intake-nav.ts) ── */
const HOST = 'bullpen-log.vercel.app';
const S = `https://${HOST}`;
ok(isIntakePath('/admin/intake') && isIntakePath('/admin/intake/abc') && !isIntakePath('/admin/intakes') && !isIntakePath('/admin'), 'isIntakePath 경계');
eq(intakeWebMove(`${S}/admin/intake`, HOST), { kind: 'stay' }, '접수함은 머문다');
eq(intakeWebMove(`${S}${DETAIL}?tab=files`, HOST), { kind: 'stay' }, '접수 하나는 머문다');
eq(intakeWebMove(`${S}/admin`, HOST), { kind: 'back' }, '관리자 첫 화면은 앱 관리자로 돌아감');
eq(intakeWebMove(`${S}/login?next=%2Fadmin%2Fintake`, HOST), { kind: 'shell', href: '/login?next=%2Fadmin%2Fintake' }, '로그인이 풀리면 껍데기 웹 로그인으로');
eq(intakeWebMove(`${S}/today`, HOST), { kind: 'shell', href: '/today' }, '권한이 없어 돌려보내면 껍데기 웹으로');
eq(intakeWebMove(`${S}/admin/intakes`, HOST), { kind: 'shell', href: '/admin/intakes' }, '비슷한 이름은 접수함이 아니다');
eq(intakeWebMove(`https://evil.example/${HOST}/admin/intake`, HOST), { kind: 'outside', url: `https://evil.example/${HOST}/admin/intake` }, '다른 사이트는 웹뷰에서 안 연다');
eq(intakeWebMove(`https://x.supabase.co/storage/v1/object/sign/a.mov?token=t`, HOST).kind, 'outside', '원본 서명 주소는 사파리로');
eq(intakeWebMove(`http://${HOST}.evil.example/admin/intake`, HOST).kind, 'outside', '주소 이름 앞부분만 같은 사이트는 남의 사이트');
eq(intakeWebMove('javascript:alert(1)', HOST), { kind: 'block' }, '자바스크립트 주소는 막음');
eq(intakeWebMove('not a url', HOST), { kind: 'block' }, '못 읽는 주소는 막음');
for (const u of ['about:blank', 'blob:https://x/1', 'data:text/plain,a']) eq(intakeWebMove(u, HOST), { kind: 'stay' }, `${u.slice(0, 5)} 는 그대로`);
eq(intakePathMove('/admin/intake', '?page=2'), { kind: 'stay' }, "사이트 알림 'path' — 접수함");
eq(intakePathMove('/admin', ''), { kind: 'back' }, "사이트 알림 'path' — 관리자 첫 화면");
eq(intakePathMove('/videos', 'view=log'), { kind: 'shell', href: '/videos?view=log' }, "사이트 알림 'path' — 물음표 없는 쿼리도 붙인다");

console.log(`intake-access: ${n}개 통과`);
