/**
 * 팀 · 레슨장 마스터 셀프테스트 — 순수 규칙(lib/org/rules.ts) · 웹 가입 차례(lib/signup-check.ts) · 선수 차단이 코드에 박혀 있나(소스 읽기).
 *
 *   npm run org:test
 *
 * DB 는 안 쓴다. 선수 차단은 (master) 틀의 requireMaster · 마스터 동작마다의 requireMaster · (app) 틀의 /master 보내기 — 셋 가운데 하나가
 * 빠지면 선수 계정이 관리 화면을 열 수 있다(2026-10-20 사용자: "일반 선수 사용자는 절대 이 페이지를 들어갈 수가 없어야 돼").
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  CONSENT_SCOPES,
  INVITE_ALPHABET,
  INVITE_LEN,
  REPORT_TOKEN_RE,
  consentDefaults,
  consentFromForm,
  inviteUsable,
  isDateKey,
  isEventKind,
  isGuardianCode,
  makeGuardianCode,
  makeInviteCode,
  normalizeInviteCode,
  orgNameOk,
  parseTags,
  passLeft,
  passUsable,
  timeOk,
} from '@/lib/org/rules';
import {
  EMPTY_SIGNUP,
  checkWebSignupStep,
  signupFields,
  signupStepsOf,
  webStepOfField,
} from '@/lib/signup-check';

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${!ok && detail ? `  (${detail})` : ''}`);
}
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/* ─────────────────────── 1. 초대 코드 ─────────────────────── */
console.log('[1] 초대 코드 — 여섯 글자, 헷갈리는 0 · O · 1 · I 없음');
{
  check(
    '알파벳에 0 · O · 1 · I 가 없다',
    !/[0O1I]/.test(INVITE_ALPHABET) && INVITE_ALPHABET.length === 32
  );
  let ok = true;
  for (let i = 0; i < 500; i++) {
    const c = makeInviteCode();
    if (c.length !== INVITE_LEN || [...c].some((ch) => !INVITE_ALPHABET.includes(ch)))
      ok = false;
  }
  check('500개 모두 길이 6 · 알파벳 안', ok);
  check('난수 0 → 첫 글자만', makeInviteCode(() => 0) === 'AAAAAA');
  check(
    '난수 0.999… → 마지막 글자만(넘치지 않음)',
    makeInviteCode(() => 0.9999999) === '999999'
  );
  check(
    '소문자 · 띄어쓰기 · 줄표를 받아 준다',
    normalizeInviteCode('ab-cd ef') === 'ABCDEF'
  );
  check('알파벳 밖 글자(0)는 null', normalizeInviteCode('ABCDE0') === null);
  check(
    '길이가 다르면 null',
    normalizeInviteCode('ABCDEFG') === null && normalizeInviteCode('ABCDE') === null
  );
  check(
    '글이 아니면 null',
    normalizeInviteCode(123) === null && normalizeInviteCode(null) === null
  );

  const now = new Date('2026-10-20T12:00:00Z');
  const later = new Date('2026-10-21T00:00:00Z');
  const earlier = new Date('2026-10-20T11:59:00Z');
  check(
    '선수 코드는 기한 안이면 몇 번 썼어도 된다',
    inviteUsable({ role: 'PLAYER', expiresAt: later, usedAt: now }, now)
  );
  check(
    '기한이 지나면 안 된다',
    !inviteUsable({ role: 'PLAYER', expiresAt: earlier, usedAt: null }, now)
  );
  check(
    '기한 그 순간도 안 된다',
    !inviteUsable({ role: 'PLAYER', expiresAt: now, usedAt: null }, now)
  );
  check(
    '스태프 코드는 한 번만',
    inviteUsable({ role: 'STAFF', expiresAt: later, usedAt: null }, now) &&
      !inviteUsable({ role: 'STAFF', expiresAt: later, usedAt: now }, now)
  );
}

/* ─────────────────────── 2. 공유 동의 ─────────────────────── */
console.log(
  '\n[2] 공유 동의 — 기본값(투구 · 트레이닝 · 체크인 · 영상 켬, 영양 · 체중 끔) · 폼 읽기'
);
{
  const d = consentDefaults();
  check(
    '기본값 — 레슨장 · 팀 같다',
    d.pitch && d.training && d.checkin && d.video && !d.nutrition && !d.weight,
    JSON.stringify(d)
  );
  const c = consentFromForm((n) => (n === 'scope-pitch' ? 'on' : null));
  check(
    '폼에서 켠 칸만 true',
    c.pitch && !c.training && !c.checkin && !c.video && !c.nutrition && !c.weight
  );
  check(
    '동의 범위 여섯 · 키가 겹치지 않음',
    CONSENT_SCOPES.length === 6 && new Set(CONSENT_SCOPES.map((s) => s.key)).size === 6
  );
}

/* ─────────────────────── 3. 조직 이름 · 태그 ─────────────────────── */
console.log('\n[3] 조직 이름 · 태그');
{
  check(
    '이름 1자는 안 됨 · 2자는 됨',
    !orgNameOk('a') && orgNameOk('ab') && orgNameOk('  ab  ')
  );
  check(
    '41자는 안 됨 · 40자는 됨',
    !orgNameOk('x'.repeat(41)) && orgNameOk('x'.repeat(40))
  );
  const tags = parseTags('투수, 3학년,투수 , ,A조\n포수');
  check(
    '태그 — 쉼표 · 줄바꿈으로 나누고 중복 · 빈 것은 뺀다',
    JSON.stringify(tags) === JSON.stringify(['투수', '3학년', 'A조', '포수']),
    JSON.stringify(tags)
  );
  check(
    '태그는 12개까지',
    parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(',')).length === 12
  );
}

/* ─────────────────────── 4. 웹 가입 차례 ─────────────────────── */
console.log('\n[4] 웹 가입 — 종류 화면이 앞에, 레슨장 · 팀은 조직 화면');
{
  const today = '2026-10-20';
  check(
    '종류를 안 골랐으면 선수 차례(5)',
    signupStepsOf(EMPTY_SIGNUP).join() === 'kind,name,birth,body,terms'
  );
  check(
    '선수 — 5화면',
    signupStepsOf({ ...EMPTY_SIGNUP, kind: 'player' }).join() ===
      'kind,name,birth,body,terms'
  );
  check(
    '레슨장 — 4화면(선수 칸 없음)',
    signupStepsOf({ ...EMPTY_SIGNUP, kind: 'lesson' }).join() === 'kind,name,org,terms'
  );
  check(
    '팀 — 4화면',
    signupStepsOf({ ...EMPTY_SIGNUP, kind: 'team' }).join() === 'kind,name,org,terms'
  );
  check(
    '종류 안 고르면 막힘',
    checkWebSignupStep('kind', EMPTY_SIGNUP, today)?.field === 'kind'
  );
  check(
    '조직 이름 1자는 막힘',
    checkWebSignupStep('org', { ...EMPTY_SIGNUP, kind: 'lesson', orgName: 'a' }, today)
      ?.field === 'orgName'
  );
  check(
    '조직 이름 2자는 통과',
    checkWebSignupStep(
      'org',
      { ...EMPTY_SIGNUP, kind: 'lesson', orgName: '피칭랩' },
      today
    ) === null
  );
  check(
    '선수 화면 검사는 그대로(이름 비면 막힘)',
    checkWebSignupStep('name', EMPTY_SIGNUP, today)?.field === 'nickname'
  );
  check(
    '칸 → 화면',
    webStepOfField('orgName') === 'org' &&
      webStepOfField('kind') === 'kind' &&
      webStepOfField('email') === 'name'
  );
  const player = signupFields({ ...EMPTY_SIGNUP, kind: 'player' });
  check(
    '선수 · 앱(종류 없음)은 accountType 을 안 보낸다',
    !('accountType' in player) && !('accountType' in signupFields(EMPTY_SIGNUP))
  );
  const master = signupFields({ ...EMPTY_SIGNUP, kind: 'team', orgName: ' 우리 팀 ' });
  check(
    '팀은 accountType MASTER · orgKind TEAM · 이름 다듬음',
    master.accountType === 'MASTER' &&
      master.orgKind === 'TEAM' &&
      master.orgName === '우리 팀'
  );
}

/* ─────────────────────── 5. 선수 차단 — 소스 읽기 ─────────────────────── */
console.log('\n[5] 선수 계정이 관리 화면에 못 들어가는가 — 코드에 박힌 방어선');
{
  const layout = src('app/(master)/layout.tsx');
  check(
    '(master) 틀이 requireMaster 를 기다린다',
    /await requireMaster\(\)/.test(layout)
  );
  check(
    '(master) 틀은 선수 껍데기(components/app-shell)를 안 쓴다',
    !/components\/app-shell/.test(layout)
  );
  const dal = src('lib/dal.ts');
  check(
    'requireMaster 는 선수를 /today 로 보낸다',
    /export async function requireMaster\(\)[\s\S]*?redirect\('\/today'\)/.test(dal)
  );
  check('getCurrentUser 가 accountType 을 읽는다', /accountType: true/.test(dal));
  const app = src('app/(app)/layout.tsx');
  check(
    '(app) 틀이 마스터 계정을 /master 로 보낸다',
    /accountType === 'MASTER'[^\n]*redirect\('\/master'\)/.test(app)
  );
  const auth = src('app/actions/auth.ts');
  check(
    '가입이 accountType MASTER 를 만들고 /master 로 보낸다',
    /accountType: 'MASTER'/.test(auth) && /redirect\('\/master'\)/.test(auth)
  );
  check(
    '로그인이 accountType 으로 갈 곳을 고른다',
    /accountType === 'MASTER'[^\n]*'\/master'/.test(auth)
  );

  /* 마스터 동작 — export 마다 requireMaster. 함수 몸통 = 다음 최상위 function 앞까지 */
  const FN = /^export async function (\w+)/gm;
  const org = src('app/actions/org.ts');
  const heads = [...org.matchAll(FN)];
  const open = heads
    .map((m, i) => ({
      name: m[1],
      body: org.slice(m.index, heads[i + 1]?.index ?? org.length),
    }))
    .filter((f) => !/requireMaster\(|requireAdmin\(/.test(f.body))
    .map((f) => f.name);
  check(
    `app/actions/org.ts 의 동작 ${heads.length}개가 모두 requireMaster(관리자 칸은 requireAdmin)를 거친다`,
    heads.length >= 5 && open.length === 0,
    open.join(', ')
  );
  const joinSrc = src('app/actions/org-join.ts');
  check('선수 참여 동작은 requireUser 를 거친다', /requireUser\(/.test(joinSrc));

  /* 마스터 화면 — 모두 (master) 틀 아래, 관리자 화면은 requireAdmin */
  const pages = walk(join(ROOT, 'app', '(master)')).filter((p) => /page\.tsx$/.test(p));
  check(`(master) 화면이 있다(${pages.length}개)`, pages.length >= 4);
  const shellUse = pages.filter((p) =>
    /components\/app-shell/.test(readFileSync(p, 'utf8'))
  );
  check(
    '(master) 화면은 선수 껍데기를 안 쓴다',
    shellUse.length === 0,
    shellUse.join(', ')
  );
  const orgsPage = pages.find((p) => /orgs[\\/]page\.tsx$/.test(p));
  check(
    '조직 목록(관리자)은 requireAdmin',
    !!orgsPage && /requireAdmin\(/.test(readFileSync(orgsPage, 'utf8'))
  );
  const registry = src('app/api/rpc/registry.ts');
  check(
    'rpc 허용 목록에 org · org-join',
    /'@\/app\/actions\/org'/.test(registry) &&
      /'@\/app\/actions\/org-join'/.test(registry)
  );
  check(
    '마이그레이션이 있다',
    existsSync(join(ROOT, 'prisma/migrations/20261020120000_org_master/migration.sql'))
  );
}

/* ─────────────────────── 6. 2~6단계 규칙 ─────────────────────── */
console.log('\n[6] 일정 · 수강권 · 보호자 코드 — 순수 규칙');
{
  check(
    '시각 꼴',
    timeOk('09:30') &&
      timeOk('23:59') &&
      !timeOk('24:00') &&
      !timeOk('9:30') &&
      !timeOk('')
  );
  check(
    '날짜 꼴 — 없는 날은 막는다',
    isDateKey('2026-10-20') &&
      !isDateKey('2026-02-31') &&
      !isDateKey('20261020') &&
      !isDateKey(null)
  );
  check(
    '일정 종류',
    isEventKind('lesson') && isEventKind('game') && !isEventKind('party')
  );
  check(
    '수강권 — 남은 회',
    passLeft({ total: 10, used: 3 }) === 7 && passLeft({ total: 10, used: 12 }) === 0
  );
  check(
    '수강권 — 기한 그날까지 쓸 수 있고 다음 날은 안 됨',
    passUsable(
      { total: 10, used: 3, expiresAt: new Date('2026-10-20T00:00:00Z') },
      '2026-10-20'
    ) &&
      !passUsable(
        { total: 10, used: 3, expiresAt: new Date('2026-10-20T00:00:00Z') },
        '2026-10-21'
      ) &&
      passUsable({ total: 10, used: 3, expiresAt: null }, '2030-01-01') &&
      !passUsable({ total: 10, used: 10, expiresAt: null }, '2026-10-20')
  );
  let ok = true;
  for (let i = 0; i < 300; i++) if (!isGuardianCode(makeGuardianCode())) ok = false;
  check(
    '보호자 코드 — 늘 네 자리 숫자',
    ok &&
      makeGuardianCode(() => 0) === '0000' &&
      makeGuardianCode(() => 0.99999) === '9999'
  );
  check(
    '리포트 토큰 꼴 — uuid 에서 줄표 뺀 32자',
    REPORT_TOKEN_RE.test('0123456789abcdef0123456789abcdef') &&
      !REPORT_TOKEN_RE.test('0123456789abcdef-0123456789abcde')
  );
}

/* ─────────────────────── 7. 2~6단계 방어선 — 소스 읽기 ─────────────────────── */
console.log(
  '\n[7] 마스터 동작 파일마다 requireMaster — 선수 참여(org-join) · 보호자(org-report)만 예외'
);
{
  const FN = /^export async function (\w+)/gm;
  for (const f of ['org-notes', 'org-record', 'org-calendar', 'org-notices']) {
    const text = src(`app/actions/${f}.ts`);
    const heads = [...text.matchAll(FN)];
    const open = heads
      .map((m, i) => ({
        name: m[1],
        body: text.slice(m.index, heads[i + 1]?.index ?? text.length),
      }))
      .filter((x) => !/requireMaster\(/.test(x.body))
      .map((x) => x.name);
    check(
      `app/actions/${f}.ts 의 동작 ${heads.length}개가 모두 requireMaster 를 거친다`,
      heads.length >= 2 && open.length === 0,
      open.join(', ')
    );
  }
  const report = src('app/actions/org-report.ts');
  check(
    '보호자 코드 확인은 잠금(rate-limit)과 bcrypt 비교를 거친다',
    /blockedMinutes\(/.test(report) &&
      /bcrypt\.compare\(/.test(report) &&
      /noteFail\(/.test(report)
  );
  const reportPage = src('app/(report)/report/[token]/page.tsx');
  check(
    '보호자 리포트는 쿠키가 토큰과 같을 때만 내용을 그린다',
    /\.value === token/.test(reportPage)
  );
  check(
    '보호자 리포트는 체크인 · 체중 · 영상을 안 읽는다',
    !/checkinTodayOf|weightSeriesOf|recentClipsOf/.test(reportPage)
  );
  const data = src('lib/org/player-data.ts');
  check(
    '선수 카드는 동의한 범위만 읽는다(scope.* 가르기)',
    /scope\.pitch \?/.test(data) &&
      /scope\.checkin \?/.test(data) &&
      /scope\.video \?/.test(data) &&
      /scope\.weight \?/.test(data)
  );
  check(
    '팔 상태는 선수 화면과 같은 함수(gatherFactsAndPlan → armStatusOf)',
    /gatherFactsAndPlan\(/.test(data) && /armStatusOf\(/.test(data)
  );
  const record = src('app/actions/org-record.ts');
  check(
    '대신 기록은 투구 공유 동의 · 앞날 · 투구수 상한을 본다',
    /memberScope\(/.test(record) &&
      /isFutureDateKey\(/.test(record) &&
      /MAX_PITCH_COUNT/.test(record) &&
      /enteredById: user\.id/.test(record)
  );
  const registry = src('app/api/rpc/registry.ts');
  check(
    'rpc 허용 목록에 org 동작 파일 일곱',
    [
      'org',
      'org-calendar',
      'org-join',
      'org-notes',
      'org-notices',
      'org-record',
      'org-report',
    ].every((f) => registry.includes(`'@/app/actions/${f}'`))
  );
  const masterPages = walk(join(ROOT, 'app', '(master)')).filter((p) =>
    /page\.tsx$/.test(p)
  );
  check(
    `(master) 화면 8개(홈 · 회원 · 카드 · 달력 · 공지 · 기록 · 설정 · 조직)`,
    masterPages.length >= 8,
    String(masterPages.length)
  );
}

console.log(
  `\n${pass} 통과${fails.length ? `, ${fails.length} 실패:\n  - ${fails.join('\n  - ')}` : ''}`
);
if (fails.length) process.exit(1);
