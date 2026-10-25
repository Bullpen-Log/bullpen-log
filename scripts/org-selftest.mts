/**
 * 팀 · 레슨장 마스터 셀프테스트 — 순수 규칙(lib/org/rules.ts) · 웹 가입 차례(lib/signup-check.ts) · 선수 차단이 코드에 박혀 있나(소스 읽기).
 *
 *   npm run org:test
 *
 * DB 는 안 쓴다. 선수 차단은 (master) 틀의 requireMaster · 마스터 동작마다의 requireMaster · (app) 틀의 /manage 보내기 — 셋 가운데 하나가
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
  memberScope,
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
import { armUnknown, coachArmStatusOf } from '@/lib/org/arm-view';
import { EVENT_STATUSES, isEventStatus, noteKey, planNotePitch } from '@/lib/org/lesson-pitch';
import { COACH_STATUSES, PLAYER_STATUSES, cleanHomeworkItems, homeworkDose, homeworkProgress } from '@/lib/org/homework';
import { cleanCommentBody, commentTarget, isOrgVideoPath, isOwnOrgVideoPath, isPlayerCommentKind, readAtSec } from '@/lib/org/comments';
import { ORG_SET_BASE, ORG_THEME_KEY, cleanOrgWork, isEmptyOrgPlan, orgPlan, withOrgExercises, withoutEmptyOrgExercises } from '@/lib/org/team-work';
import { mergeReopened, type FrozenExercise, type FrozenPlan } from '@/lib/workout/session-plan';
import type { ReportFacts } from '@/lib/report/facts';

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
    '(app) 틀이 마스터 계정을 /manage 로 보낸다',
    /accountType === 'MASTER'[^\n]*redirect\('\/manage'\)/.test(app)
  );
  const auth = src('app/actions/auth.ts');
  check(
    '가입이 accountType MASTER 를 만들고 /manage 로 보낸다',
    /accountType: 'MASTER'/.test(auth) && /redirect\('\/manage'\)/.test(auth)
  );
  check(
    '로그인이 accountType 으로 갈 곳을 고른다',
    /accountType === 'MASTER'[\s\S]{0,160}'\/manage'/.test(auth)
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
    existsSync(join(ROOT, 'prisma/migrations/20261020180000_org_master/migration.sql'))
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

/* ─────────────────────── 8. 1단계 공통 바닥(2026-10-25 0단계 계약 2-1) ─────────────────────── */

{
  const consent = { ...consentDefaults(), video: false };
  const none = memberScope(null, true);
  check('동의 줄 없는 계정 회원은 아무것도 안 보임(동의 대기)', CONSENT_SCOPES.every((c) => none[c.key] === false));
  const all = memberScope(null, false);
  check('코치가 만든 빈 자리는 모두 보임', CONSENT_SCOPES.every((c) => all[c.key] === true));
  check('동의 줄이 있으면 그대로', memberScope(consent, true) === consent);
}

{
  const TODAY = '2026-10-25';
  const facts = (o: { painToday?: boolean; rehab?: boolean; lastThrowDate?: string | null }) =>
    ({
      profile: { age: 25 },
      load: { zone: 'optimal', ratio: 1.05, estimated: false },
      patterns: { recentOutings: [], hardOutings: [], lastThrowDate: o.lastThrowDate === undefined ? '2026-10-24' : o.lastThrowDate },
      condition: {
        painToday: o.painToday ?? false,
        painRecently: false,
        painRecentParts: [],
        today: {},
        painWordsInMemo: [],
        throwPlanToday: null,
        throwPlanYesterday: null,
        rehab: o.rehab ? { area: 'elbow', label: '팔꿈치 안쪽', stage: 2, throwing: 'none', firstWeekNoThrow: true } : null,
      },
    }) as unknown as ReportFacts;
  const full = consentDefaults();
  const noCheckin = { ...full, checkin: false };
  const noTraining = { ...full, training: false };
  const a = coachArmStatusOf(facts({ painToday: true }), full, TODAY);
  check('체크인 공유 · 오늘 통증 → 위험', a.level === 'danger' && a.missing.length === 0);
  const b = coachArmStatusOf(facts({ painToday: true }), noCheckin, TODAY);
  check('체크인 비공유면 통증이 팔 상태에 안 섞임', b.level !== 'danger' && b.missing.includes('checkin'), b.headline);
  check('체크인 비공유 · 다른 신호 없음 → 정보 부족', armUnknown(b));
  const c = coachArmStatusOf(facts({ rehab: true }), noTraining, TODAY);
  check('트레이닝 비공유면 재활이 안 섞임', c.level !== 'danger' && c.missing.includes('training'));
  const d = coachArmStatusOf(facts({ lastThrowDate: null }), full, TODAY);
  check('투구 기록 없음 → records · 정보 부족', d.missing.includes('records') && armUnknown(d));
  const e = coachArmStatusOf(facts({ lastThrowDate: '2026-10-11' }), full, TODAY);
  check('15일 전 기록 → records', e.missing.includes('records'));
  const f = coachArmStatusOf(facts({ lastThrowDate: '2026-10-12' }), full, TODAY);
  check('14일 안 기록 → records 없음 · 안전', !f.missing.includes('records') && f.level === 'safe' && !armUnknown(f));
}

{
  const lessons = src('app/actions/lessons.ts');
  const confirm = lessons.slice(lessons.indexOf('export async function confirmBooking'), lessons.indexOf('export async function declineBooking'));
  check('예약 확정은 공유 동의를 만들지 않음', !confirm.includes('shareConsent'));
  const finish = lessons.slice(lessons.indexOf('export async function finishBooking'), lessons.indexOf('/* ── 선수 ── */'));
  check('수강권 차감은 예약 끝남에서', finish.includes('lessonPass.update'));
  const notes = src('app/actions/org-notes.ts');
  const create = notes.slice(notes.indexOf('export async function createLessonNote'), notes.indexOf('export async function deleteLessonNote'));
  check('레슨 노트 저장은 수강권을 안 바꿈', !create.includes('lessonPass') && !create.includes('countPass'));
  check('rpc 허용 목록에 app-org', src('app/api/rpc/registry.ts').includes("'@/app/actions/app-org'"));
  const card = src('lib/org/player-data.ts');
  check('떠난 회원 카드는 안 읽음', card.includes("member.status !== 'ACTIVE') return null"));
  check('코치 카드 · 부하판은 공유 범위로 팔 상태(coachArmStatusOf)', (card.match(/coachArmStatusOf\(/g) ?? []).length >= 2);
  const access = src('lib/org/app-access.ts');
  check('앱 코치 동작은 isMasterUser + orgsFor', access.includes('isMasterUser(user)') && access.includes('orgsFor(user)'));
  for (const f of ['app/actions/app-org.ts', 'app/actions/app-lesson.ts'])
    check(`${f} 코치 · 선수 권한은 app-access 로`, src(f).includes("from '@/lib/org/app-access'"));
}

/* ─────────────────────── 9. 1.5단계 — 앱에서 웹 폼 동작 부르기 · 가입 전 자리 코드 ─────────────────────── */

{
  const now = new Date('2026-10-25T03:00:00Z');
  const later = new Date('2026-11-08T03:00:00Z');
  const used = new Date('2026-10-25T04:00:00Z');
  check('회원 코드는 써도 다시 쓸 수 있음', inviteUsable({ role: 'PLAYER', expiresAt: later, usedAt: used }, now));
  check('가입 전 자리 코드는 한 번만', !inviteUsable({ role: 'PLAYER', expiresAt: later, usedAt: used, memberId: 'm1' }, now));
  check('가입 전 자리 코드도 안 썼으면 됨', inviteUsable({ role: 'PLAYER', expiresAt: later, usedAt: null, memberId: 'm1' }, now));
  check('가입 하면 자리 코드를 씀 처리', src('lib/org/join.ts').includes("invite.role !== 'PLAYER' || invite.memberId"));
  const rpc = src('native/src/lib/rpc.ts');
  check('앱 rpcForm 이 폼 하나만 받는 동작도 부름(lead)', rpc.includes('lead: unknown[] = [null]') && rpc.includes('JSON.stringify(lead)'));
  /* 앱이 웹 폼 동작을 부를 때 — (지난 상태, 폼) 꼴이면 기본, (폼) 꼴이면 single(lead []) 이어야 한다 */
  const forms: [string, string, boolean][] = [
    ['org-calendar', 'saveOrgEvent', false],
    ['org-calendar', 'deleteOrgEvent', true],
    ['org-notices', 'saveOrgNotice', false],
    ['org-notices', 'deleteOrgNotice', true],
    ['org', 'updateMember', false],
    ['org', 'addPlaceholderMember', false],
    ['org', 'removeMember', true],
    ['org-notes', 'createLessonNote', false],
    ['org-notes', 'deleteLessonNote', true],
    ['org-record', 'createPitchLogs', false],
    ['org-record', 'deleteProxyPitchLog', true],
  ];
  for (const [file, fn, single] of forms) {
    const sig = new RegExp(`export async function ${fn}\\(\\s*([^)]*)\\)`).exec(src(`app/actions/${file}.ts`))?.[1] ?? '';
    const formOnly = sig.trim().startsWith('formData');
    check(`${file}.${fn} 꼴이 앱 호출과 맞음(${single ? '폼 하나' : '지난 상태 + 폼'})`, formOnly === single, sig);
  }
}

/* ─────────────────────── 10. 2단계 — 일지 던진 공 → 선수 투구 기록 · 지도 활동 상태 ─────────────────────── */

{
  const plan = (o: Partial<Parameters<typeof planNotePitch>[0]>) => {
    const r = planNotePitch({ pitchCount: 30, canWrite: true, selfLogIds: [], link: '', ...o });
    return 'kind' in r ? r : { ...r, kind: 'error' as const };
  };
  check('공이 없으면 기록 안 함', plan({ pitchCount: null }).kind === 'none' && plan({ pitchCount: 0 }).kind === 'none');
  check('가입 전 · 공유 끔이면 일지에만', plan({ canWrite: false }).kind === 'none');
  check('선수 기록이 없으면 일지 줄', plan({}).kind === 'own');
  check('선수가 그날 남겼으면 고르기 전엔 막음(두 번 세지 않게)', plan({ selfLogIds: ['a'] }).kind === 'error');
  const linked = plan({ selfLogIds: ['a', 'b'], link: 'b' });
  check('고른 선수 기록에 잇기', linked.kind === 'link' && linked.logId === 'b');
  check('없는 기록에는 못 이음', plan({ selfLogIds: ['a'], link: 'zz' }).kind === 'error');
  check("'따로 던진 공'이면 일지 줄", plan({ selfLogIds: ['a'], link: 'new' }).kind === 'own');
  check('코치 줄 열쇠는 일지 하나에 하나', noteKey('n1') === 'note:n1');
  check('활동 상태 셋', EVENT_STATUSES.length === 3 && isEventStatus('done') && !isEventStatus('attended'));
  const notes = src('app/actions/org-notes.ts');
  check('일지 지우기는 그 일지 줄만 지움(clientKey)', notes.includes('deleteMany({ where: { userId, clientKey: noteKey(note.id) } })'));
  check('선수가 직접 남긴 줄은 지우지 않고 연결만 풂', notes.includes('enteredById: null }, data: { orgEventId: null }'));
  check('일지 저장이 수강권을 안 건드림', !/lessonPass\.(update|create)/.test(notes.slice(0, notes.indexOf('/* ── 수강권 ── */'))));
  const forms: [string, string, boolean][] = [
    ['org-notes', 'updateLessonNote', false],
    ['org-calendar', 'setOrgEventStatus', true],
  ];
  for (const [file, fn, single] of forms) {
    const sig = new RegExp(`export async function ${fn}\\(\\s*([^)]*)\\)`).exec(src(`app/actions/${file}.ts`))?.[1] ?? '';
    check(`${file}.${fn} 꼴이 앱 호출과 맞음`, sig.trim().startsWith('formData') === single, sig);
  }
}

/* ─────────────────────── 11. 2단계 — 숙제 ─────────────────────── */

{
  const known = { exercises: new Set(['e1', 'e2']), guides: new Set(['g1']) };
  const ok = cleanHomeworkItems([{ exerciseId: 'e1', sets: 3, reps: 15 }, { guideId: 'g1', note: '  천천히 ' }, { exerciseId: 'e1' }], known);
  check('숙제 줄 거르기 — 같은 것은 한 번', !('error' in ok) && ok.length === 2 && ok[1].note === '천천히');
  check('라이브러리에 없는 운동은 막음', 'error' in cleanHomeworkItems([{ exerciseId: 'zz' }], known));
  check('빈 숙제는 막음', 'error' in cleanHomeworkItems([], known));
  check('열 개 넘으면 막음', 'error' in cleanHomeworkItems(Array.from({ length: 11 }, () => ({ exerciseId: 'e1' })), known));
  const bad = cleanHomeworkItems([{ exerciseId: 'e2', sets: 99, reps: -1 }], known);
  check('범위 밖 세트 · 횟수는 버림', !('error' in bad) && bad[0].sets === undefined && bad[0].reps === undefined);
  const items = [{ exerciseId: 'e1' }, { guideId: 'g1' }];
  check('기록 없으면 안 함', homeworkProgress(items, new Set(), new Set()) === 'none');
  check('하나 했으면 하는 중', homeworkProgress(items, new Set(['e1']), new Set()) === 'some');
  check('다 했으면 완료', homeworkProgress(items, new Set(['e1']), new Set(['g1'])) === 'all');
  check('처방 한 줄', homeworkDose({ exerciseId: 'e1', sets: 3, reps: 15 }) === '3세트 · 15회' && homeworkDose({ guideId: 'g', holdSec: 30 }) === '30초');
  check('완료는 코치가 못 정함', !COACH_STATUSES.includes('done') && PLAYER_STATUSES.includes('done'));
  const reg = src('app/api/rpc/registry.ts');
  check('앱 숙제 동작이 허용 목록에', reg.includes("'app-lesson': appLesson"));
}

/* ─────────────────────── 12. 2단계 — 일지 · 숙제에 다는 말 · 받은 것 ─────────────────────── */

{
  check('말 자리 읽기', JSON.stringify(commentTarget('note', 'n1')) === '{"noteId":"n1"}' && JSON.stringify(commentTarget('homework', 'a1')) === '{"assignmentId":"a1"}');
  check('모르는 자리는 막음', commentTarget('x', 'n1') === null && commentTarget('note', '') === null);
  check('회원은 질문 · 정정 요청만', isPlayerCommentKind('question') && isPlayerCommentKind('fix') && !isPlayerCommentKind('comment'));
  check('빈 말은 막고 길면 자름', cleanCommentBody('   ') === null && (cleanCommentBody('가'.repeat(600)) ?? '').length === 500);
  /* 'use server' 파일의 내보낸 함수는 누구나 부를 수 있다 — 하나도 빠짐없이 코치(coachOrg) · 선수(myMember) 확인부터 */
  const lesson = src('app/actions/app-lesson.ts');
  const fns = [...lesson.matchAll(/export async function (\w+)\([^]*?\n\}/g)];
  check('app-lesson 동작이 있다', fns.length >= 10);
  for (const m of fns) check(`app-lesson.${m[1]} 이 권한부터 본다`, /coachOrg\(|myMember\(/.test(m[0]));
}

/* ─────────────────────── 13. 2단계 빈칸 — 조직 영상 · 영상 시점 말 ─────────────────────── */

{
  const u = '2803cf76-1111-2222-3333-444455556666';
  const v = `${u}/org-12345678-1234-1234-1234-123456789abc.mov`;
  check('내 조직 영상 경로', isOwnOrgVideoPath(v, u));
  check('남의 조직 영상은 내 것 아님', !isOwnOrgVideoPath(v, '2803cf76-1111-2222-3333-999999999999'));
  check('투구 영상 · 폰 안 영상 · 사진은 조직 영상 아님', !isOwnOrgVideoPath(`${u}/12345678-1234-1234-1234-123456789abc.mov`, u) && !isOwnOrgVideoPath(`${u}/local-abc`, u) && !isOwnOrgVideoPath(`${u}/avatar-x.jpg`, u));
  check('경로 넘기기 막음', !isOwnOrgVideoPath(`${u}/org-../x.mov`, u) && !isOrgVideoPath('../org-x.mov'));
  check('누가 올렸든 조직 영상', isOrgVideoPath(v) && !isOrgVideoPath(`${u}/12345678-1234-1234-1234-123456789abc.mov`));
  check('영상 시점 초', readAtSec(12.34) === 12.3 && readAtSec(-1) === null && readAtSec('x') === null && readAtSec(4000) === null);
  check('숙제 영상은 회원이 보냄', isPlayerCommentKind('submit'));
  const notes = src('app/actions/org-notes.ts');
  check('일지를 지우면 조직 영상만 지움', notes.includes('deleteVideos(note.videoPaths.filter(isOrgVideoPath))'));
}

/* ─────────────────────── 14. 3단계 준비 — 코치 운동을 선수 하루 운동 판에 ─────────────────────── */

{
  const ex = (id: string, extra: Record<string, unknown> = {}) =>
    ({ id, title: id, category: '하체 스트렝스', slot: 'main', prescription: null, plannedSets: 3, plannedReps: 10, plannedHoldSeconds: null, perSide: false, needsWeight: false, isHold: false, equipment: [], bodyParts: [], intensity: '보통', thumbPath: null, ...extra }) as FrozenExercise;
  const known = new Set(['sq', 'dl']);
  const work = cleanOrgWork(
    [
      { exerciseId: 'sq', sets: [{ weightKg: 60, reps: 8 }, { reps: 8 }, {}] },
      { exerciseId: 'sq', sets: [{ reps: 6 }] },
      { exerciseId: 'dl', sets: [{}] },
    ],
    known
  );
  check('같은 운동은 한 줄로 · 빈 세트 · 세트 없는 운동은 뺌', !('error' in work) && work.length === 1 && work[0].sets.length === 3);
  check('라이브러리에 없는 운동은 막음(세트는 운동 목록을 가리킨다)', 'error' in cleanOrgWork([{ exerciseId: 'zz', sets: [{ reps: 5 }] }], known));
  check('한 운동 세트 열 개 넘으면 막음', 'error' in cleanOrgWork([{ exerciseId: 'sq', sets: Array.from({ length: 11 }, () => ({ reps: 5 })) }], known));
  check('코치 세트 번호는 101 부터', ORG_SET_BASE === 100);
  const op = orgPlan([ex('sq')]);
  check("코치 운동만 있는 판은 'org' · 운동마다 fromOrg", op.themeKey === ORG_THEME_KEY && op.exercises.every((e) => e.fromOrg));
  const daily = { themeKey: 'lower', themeLabel: '하체', goal: null, exercises: [ex('sq'), ex('lunge')] } as FrozenPlan;
  const merged = withOrgExercises(daily, [ex('sq'), ex('dl')]);
  check('선수 판에 붙이면 없는 운동만 뒤에 fromOrg', merged.exercises.map((e) => e.id).join() === 'sq,lunge,dl' && merged.exercises[2].fromOrg === true && !merged.exercises[0].fromOrg);
  check('붙일 게 없으면 같은 판', withOrgExercises(daily, [ex('sq')]) === daily);
  const dropped = withoutEmptyOrgExercises(merged, new Set(['sq']));
  check('세트가 안 남은 코치 운동만 판에서 뺌(선수 운동은 그대로)', dropped.dropped.join() === 'dl' && dropped.plan.exercises.map((e) => e.id).join() === 'sq,lunge');
  check("코치 운동이 다 빠진 'org' 판은 비었다", isEmptyOrgPlan(withoutEmptyOrgExercises(op, new Set()).plan) && !isEmptyOrgPlan(daily));
  /* 선수가 나중에 운동을 시작하면 — 판 이름 · 프로그램 표시는 새 판 것, 코치 운동은 앞에 */
  const program = { themeKey: 'lower', themeLabel: '프로그램 · 2번 세션', goal: null, program: { key: '531', day: 2, week: 1, gapDays: 2 }, exercises: [ex('dl'), ex('sq')] } as unknown as FrozenPlan;
  const reopened = mergeReopened(op, program);
  check("'org' 판을 다시 열면 새 판의 이름 · 프로그램 표시", reopened.themeKey === 'lower' && reopened.program?.key === '531' && reopened.themeLabel === '프로그램 · 2번 세션');
  check('코치 운동은 앞에 · 같은 운동은 한 번', reopened.exercises.map((e) => e.id).join() === 'sq,dl');
  check('선수 판 다시 열기는 예전 그대로(앞 판 이름 유지)', mergeReopened(daily, program).themeKey === 'lower' && mergeReopened(daily, program).themeLabel === '하체');
  const store = src('lib/org/team-work-store.ts');
  check('한 활동의 코치 세트는 통째로 지우고 다시 넣음', store.includes('deleteMany({ where: { sessionId: id, orgEventId: a.orgEventId } })'));
  check('세트를 바꾼 뒤 요약은 세트에서 다시 셈(summaryWrites)', store.includes('summaryWrites(a.userId'));
  check('프로그램이 org 판을 다른 운동 시작으로 안 봄', src('lib/program/load.ts').includes('!session.org && session.program?.key !== row.programKey'));
  check("저절로 닫기는 진행 중인 판만(마친 'org' 판은 안 건드림)", src('lib/workout/close-stale.ts').includes("status: 'ACTIVE', date: { lt: dayStart(now) }"));
}

console.log(
  `\n${pass} 통과${fails.length ? `, ${fails.length} 실패:\n  - ${fails.join('\n  - ')}` : ''}`
);
if (fails.length) process.exit(1);
