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
import {
  COACH_STATUSES,
  PLAYER_STATUSES,
  cleanHomeworkItems,
  doneLabel,
  homeworkDose,
  homeworkProgress,
  homeworkWindow,
  isOpenHomework,
  isUnsettledHomework,
  setMeets,
  type HomeworkSet,
} from '@/lib/org/homework';
import { cleanCommentBody, commentTarget, isOrgVideoPath, isOwnOrgVideoPath, isPlayerCommentKind, readAtSec } from '@/lib/org/comments';
import { ORG_SET_BASE, ORG_THEME_KEY, cleanOrgWork, isEmptyOrgPlan, orgPlan, withOrgExercises, withoutEmptyOrgExercises } from '@/lib/org/team-work';
import { mergeReopened, type FrozenExercise, type FrozenPlan } from '@/lib/workout/session-plan';
import { OUTING_CALENDAR_TITLE, PITCHING_ROLES, eventMemberIds, isOutingRole, planMemberIds, copyPlanTargets, weekCopyKey } from '@/lib/org/team';
import {
  cleanException,
  cleanLines,
  cleanValues,
  confirmSummary,
  linesToWork,
  memberPlans,
  memberWork,
  planTargets,
  sameAsGroup,
  teamPitchKey,
  workHash,
  type MemberWorkInput,
  type SessionPlan,
} from '@/lib/org/team-session';
import { isOutingTitle } from '@/lib/calendar-event';
import { ORG_CAPABILITIES, RECORD_CAPABILITIES, canGrant, capabilityScope, capabilityTarget, hasCapability, scopeCovers } from '@/lib/org/capabilities';
import { cancelBookingTx, confirmBookingTx, declineBookingTx, finishBookingTx } from '@/lib/org/booking-transitions';
import { MembershipConflict, planMembership, redeemInviteTx } from '@/lib/org/membership-transitions';
import { invitePreview } from '@/lib/org/join-preview';
import { lensOf, redactEventDetail, redactMembers, redactToday, redactTrainingRows, visibleMembers } from '@/lib/org/dto-scope';
import { completeBookingTx } from '@/lib/org/booking-complete';
import {
  ME,
  NO_ORG,
  ORG_LOST,
  orgOpenHref,
  orgRecordHref,
  orgReturnParam,
  parseOrgOpen,
  parseOrgReturn,
  resolveSpace,
  spaceLabel,
  spaceRoleWord,
  spaceTabs,
  targetTab,
} from '@/lib/org/space-nav';
import type { ReportFacts } from '@/lib/report/facts';
import { conflictLine, outingConflicts, type TeamOuting } from '@/lib/org/outing-check';

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
    '(master) 틀이 requireOperator(조직 운영자 관문, 2026-11-01)를 기다린다',
    /await requireOperator\(\)/.test(layout)
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
    .filter((f) => !/requireOperator\(|requireAdmin\(/.test(f.body))
    .map((f) => f.name);
  check(
    `app/actions/org.ts 의 동작 ${heads.length}개가 모두 requireOperator(관리자 칸은 requireAdmin)를 거친다`,
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
      .filter((x) => !/requireOperator\(/.test(x.body))
      .map((x) => x.name);
    check(
      `app/actions/${f}.ts 의 동작 ${heads.length}개가 모두 requireOperator 를 거친다`,
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
  /* 2026-11-01: 차감은 조건부 갱신(lib/org/booking-complete.ts) — 끝냄 동작이 그 함수를 부르는지로 본다 */
  check('수강권 차감은 예약 끝남에서', finish.includes('finishBookingTx(tx'));
  const notes = src('app/actions/org-notes.ts');
  const create = notes.slice(notes.indexOf('export async function createLessonNote'), notes.indexOf('export async function deleteLessonNote'));
  check('레슨 노트 저장은 수강권을 안 바꿈', !create.includes('lessonPass') && !create.includes('countPass'));
  check('rpc 허용 목록에 app-org', src('app/api/rpc/registry.ts').includes("'@/app/actions/app-org'"));
  const card = src('lib/org/player-data.ts');
  check('떠난 회원 카드는 안 읽음', card.includes("member.status !== 'ACTIVE') return null"));
  check('코치 카드 · 부하판은 공유 범위로 팔 상태(coachArmStatusOf)', (card.match(/coachArmStatusOf\(/g) ?? []).length >= 2);
  const access = src('lib/org/app-access.ts');
  /* 2026-11-01 계약 바뀜(브리프 2절 1): 코치는 계정 종류가 아니라 조직 역할(orgsFor 의 소유자 · 스태프)로 — isMasterUser 는 안 쓴다 */
  check('앱 코치 동작은 orgsFor(조직 역할)로', !access.includes('isMasterUser') && access.includes('orgsFor(user)'));
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
  check('가입 하면 자리 코드를 씀 처리 — 한 번 쓰는 코드(STAFF · 자리)는 트랜잭션 안 조건부 차지(G03)', src('lib/org/membership-transitions.ts').includes("const singleUse = invite.role !== 'PLAYER' || !!invite.memberId;") && src('lib/org/membership-transitions.ts').includes("usedAt: null, expiresAt: { gt: a.now }"));
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
  /* 숙제 진행(계약 9-6 ①-2) — 처방량 · 낸 시각 · 창 */
  const T0 = Date.UTC(2026, 9, 26, 3, 0, 0); /* 한국 12시에 냄 */
  const win = homeworkWindow(new Date(T0), null);
  const set = (reps: number | null, at: number, sessionId = 's1', extra: Partial<HomeworkSet> = {}): HomeworkSet => ({ exerciseId: 'e1', reps, holdSeconds: null, weightKg: null, sessionId, at, ...extra });
  const items = [{ exerciseId: 'e1', sets: 3, reps: 10 }, { guideId: 'g1' }];
  check('기록 없으면 안 함', homeworkProgress(items, [], new Set(), win).progress === 'none');
  check('처방보다 적은 세트는 하는 중', homeworkProgress(items, [set(10, T0 + 1), set(10, T0 + 2)], new Set(['g1']), win).progress === 'some');
  check('횟수가 모자란 세트는 안 셈', homeworkProgress(items, [set(10, T0 + 1), set(10, T0 + 2), set(8, T0 + 3)], new Set(['g1']), win).progress === 'some');
  const all = homeworkProgress(items, [set(10, T0 + 1), set(12, T0 + 2), set(10, T0 + 3, 's9')], new Set(['g1']), win);
  check('처방대로 모두 하면 완료 · 증거는 셋째 세트의 운동 판', all.progress === 'all' && all.evidence === 's9');
  check('낸 시각 앞 세트는 안 셈(같은 날이어도)', homeworkProgress([items[0]], [set(10, T0 - 60_000), set(10, T0 - 30_000), set(10, T0 + 1)], new Set(), win).progress === 'some');
  check('창(기한 없으면 7일) 밖은 안 셈', homeworkProgress([items[0]], [set(10, win.to + 1), set(10, win.to + 2), set(10, win.to + 3)], new Set(), win).progress === 'none');
  check('기한 날 끝(한국 23:59:59)까지', homeworkWindow(new Date(T0), new Date(Date.UTC(2026, 9, 28))).to === Date.UTC(2026, 9, 28, 14, 59, 59, 999));
  check('초 처방', setMeets({ exerciseId: 'e1', holdSec: 30 }, set(null, 1, 's', { holdSeconds: 30 })) && !setMeets({ exerciseId: 'e1', holdSec: 30 }, set(null, 1, 's', { holdSeconds: 20 })));
  check('세트 수 없으면 한 세트로 · 처방 없으면 무엇이든 적은 세트', homeworkProgress([{ exerciseId: 'e1' }], [set(null, T0 + 1, 's2', { weightKg: 20 })], new Set(), win).progress === 'all');
  check('처방 한 줄', homeworkDose({ exerciseId: 'e1', sets: 3, reps: 15 }) === '3세트 · 15회' && homeworkDose({ guideId: 'g', holdSec: 30 }) === '30초');
  check('선수 했어요는 보고(완료 아님) · 코치는 확인으로 완료', PLAYER_STATUSES.includes('reported') && !PLAYER_STATUSES.includes('done') && COACH_STATUSES.includes('done'));
  check('보고 · 영상은 할 숙제 아님 · 기록으로는 여전히 맞춤', !isOpenHomework('reported') && isUnsettledHomework('submitted') && !isUnsettledHomework('done'));
  check('완료 근거 글', doneLabel(true) === '기록으로 완료' && doneLabel(false) === '코치가 확인');
  const lesson = src('app/actions/app-lesson.ts');
  check('기록으로 셀 때 코치 대신 세트는 뺌 · 세트 시각으로', lesson.includes('enteredById: null, recordedAt: { gte: new Date(from), lte: new Date(to) }'));
  check('숙제 영상은 영상 받음(완료 아님)', lesson.includes("data: { status: 'submitted' }") && !/status: 'done', doneAt: appNow\(\) \}\);\n  const \[org/.test(lesson));
  check('옛 앱의 했어요(done)는 보고로', lesson.includes("const next = status === 'done' ? 'reported' : status;"));
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
  for (const m of fns) check(`app-lesson.${m[1]} 이 권한부터 본다`, /coachOrg(Can)?\(|orgAuthz\(|myMember\(/.test(m[0]));
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
  check('한 활동의 코치 세트는 통째로 지우고 다시 넣음', store.includes('deleteMany({ where: { sessionId: id, orgEventId: a.orgEventId, enteredById: { not: null } } })'));
  check('세트를 바꾼 뒤 요약은 세트에서 다시 셈(summaryWrites)', store.includes('summaryWrites(a.userId'));
  check('프로그램이 org 판을 다른 운동 시작으로 안 봄', src('lib/program/load.ts').includes('!session.org && session.program?.key !== row.programKey'));
  check("저절로 닫기는 진행 중인 판만(마친 'org' 판은 안 건드림)", src('lib/workout/close-stale.ts').includes("status: 'ACTIVE', date: { lt: dayStart(now) }"));
}

/* ─────────────────────── 15. 3단계(팀) — 일정 대상 · 활동 · 실제 확인 · 등판 계획 · 공지 읽음 ─────────────────────── */

{
  const all = ['a', 'b', 'c'];
  check('팀 일정은 활동 선수 모두', eventMemberIds({ memberId: null }, all).join() === 'a,b,c');
  check('회원 일정은 그 회원만 · 떠났으면 아무도', eventMemberIds({ memberId: 'b' }, all).join() === 'b' && eventMemberIds({ memberId: 'z' }, all).length === 0);
  check('메뉴 대상이 비면 일정의 모두', planMemberIds([], all).join() === 'a,b,c');
  check('메뉴 대상은 아직 일정 대상인 사람만', planMemberIds(['b', 'z'], all).join() === 'b');
  /* 팀 훈련 — 전체 → 조 → 예외(계약 11절 · 11-7 예 · 11-9 받아들임) — 선수 한 명의 실제는 memberWork 하나 */
  const dS = new Map([
    ['band', { sets: 2, reps: 15, holdSeconds: null }],
    ['lunge', { sets: 2, reps: 10, holdSeconds: null }],
    ['goblet', { sets: 3, reps: 8, holdSeconds: null }],
    ['row', { sets: 3, reps: 10, holdSeconds: null }],
    ['band2', { sets: 3, reps: 12, holdSeconds: null }],
    ['bike', { sets: 1, reps: null, holdSeconds: 600 }],
  ]);
  const pitchers = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const fielders = ['f1', 'f2', 'f3', 'f4'];
  const roster = [...pitchers, ...fielders];
  const plan = (id: string, o: Partial<SessionPlan>): SessionPlan => ({
    id,
    title: id,
    scope: 'all',
    groupName: null,
    memberIds: [],
    replacesPlanId: null,
    valueMode: 'shared',
    position: 0,
    items: [],
    actualItems: null,
    ...o,
  });
  const plansS = [
    plan('A', { position: 0, items: [{ exerciseId: 'band', sets: 2, reps: 15 }, { exerciseId: 'lunge', sets: 2, reps: 10 }] }),
    plan('B1', { position: 1, scope: 'group', groupName: '투수', memberIds: pitchers, valueMode: 'individual' }),
    plan('B2', { position: 2, scope: 'group', groupName: '야수', memberIds: fielders, items: [{ guideId: 'fungo' }] }),
    plan('C', { position: 3, items: [{ exerciseId: 'goblet', sets: 3, reps: 8 }, { exerciseId: 'row', sets: 3, reps: 10 }] }),
    plan('R', { position: 4, scope: 'member', memberIds: ['p5'], replacesPlanId: 'C', items: [{ exerciseId: 'band2' }] }),
  ];
  const base = (memberId: string, o: Partial<MemberWorkInput> = {}): MemberWorkInput => ({
    memberId,
    roster,
    plans: plansS,
    exception: null,
    values: [],
    defaults: dS,
    linked: new Set(),
    sameDay: new Set(),
    hasUser: true,
    active: true,
    canTrain: true,
    canPitch: true,
    ...o,
  });
  const setsOf = (w: { work: { sets: unknown[] }[] }) => w.work.reduce((n, x) => n + x.sets.length, 0);
  const v = (planId: string, pitchCount: number) => ({ planId, pitchCount, effortPct: 80, maxVelocity: null });

  check('선수는 제 활동만 — 투수 A · B1 · C, 야수 A · B2 · C(다른 조 활동 없음)', memberPlans(plansS, roster, 'p1').map((p) => p.id).join() === 'A,B1,C' && memberPlans(plansS, roster, 'f4').map((p) => p.id).join() === 'A,B2,C');
  check("개인 '바꾸기'는 그 조 활동을 대신(둘 다 안 셈)", memberPlans(plansS, roster, 'p5').map((p) => p.id).join() === 'A,B1,R');
  check('명단 고정 — 대상은 담은 명단 안에서만(뒤에 들어온 사람 · 모르는 사람 없음)', planTargets({ memberIds: ['p1', 'new'] }, roster).join() === 'p1' && planTargets({ memberIds: [] }, roster).length === roster.length);
  const same = memberWork(base('f4'));
  check('같음 야수 — 워밍업 4 + 근력 6 = 코치 세트 10 · 무게 모름 · 기록함', setsOf(same) === 10 && same.status === 'recorded' && same.work.every((x) => x.sets.every((y) => y.weightKg == null)));
  check('드릴 활동은 함 표시만 — 세트 · 부하에 0', same.drills.join() === 'fungo' && !same.work.some((x) => x.exerciseId === 'fungo'));
  const p5 = memberWork(base('p5', { values: [v('B1', 30)] }));
  check('투수 — 적은 투구만 남음 · 바꾸기 활동 세트(밴드 루틴)', p5.pitch.length === 1 && p5.pitch[0].pitchCount === 30 && p5.work.some((x) => x.exerciseId === 'band2') && !p5.work.some((x) => x.exerciseId === 'goblet'));
  const p4 = memberWork(base('p4'));
  check("투구 수를 비운 투수 — 세트는 그대로 · 투구 없음 · '투구 수 안 적음'", setsOf(p4) === 10 && p4.pitch.length === 0 && p4.reasons.includes('no_pitch') && p4.status === 'recorded');
  check('조 전체에 같은 투구 수가 들어가는 길이 없음 — 값은 그 선수 것만', memberWork(base('p4', { values: [] })).pitch.length === 0 && memberWork(base('p2', { values: [v('B1', 25)] })).pitch[0].pitchCount === 25);
  const reduced = { items: [{ planId: 'C', kind: 'reduced' as const, items: [{ exerciseId: 'goblet', sets: 2, reps: 8 }, { exerciseId: 'row', sets: 2, reps: 10 }], note: '어깨 피로' }], extra: [], separate: [] };
  const p2 = memberWork(base('p2', { exception: reduced, values: [v('B1', 40)] }));
  check('줄임 — 워밍업 4 + 근력 4 = 8세트 + 불펜 투구', setsOf(p2) === 8 && p2.pitch.length === 1);
  const absent = { items: ['A', 'B1', 'C'].map((planId) => ({ planId, kind: 'absent' as const })), extra: [], separate: [] };
  const p1 = memberWork(base('p1', { exception: absent, values: [v('B1', 20)] }));
  check('빠짐 — 아무것도 안 생김 · 결과 빠짐', p1.status === 'absent' && p1.work.length === 0 && p1.pitch.length === 0 && p1.drills.length === 0);
  const partial = { items: ['B2', 'C'].map((planId) => ({ planId, kind: 'absent' as const })), extra: [], separate: [] };
  check('일부 참여(A 까지) — 워밍업 4세트만', setsOf(memberWork(base('f2', { exception: partial }))) === 4 && memberWork(base('f2', { exception: partial })).status === 'recorded');
  const linked = memberWork(base('p3', { linked: new Set(['goblet', 'row']), values: [v('B1', 30)] }));
  check('일정에 이은 선수 기록 — 그 운동은 맞춤(코치 세트 안 씀) · 결과 내 기록으로 맞춤', linked.status === 'reconciled' && linked.reconciled.join() === 'goblet,row' && setsOf(linked) === 4);
  const held = memberWork(base('f3', { sameDay: new Set(['goblet']) }));
  check('안 이은 같은 날 같은 운동 — 그 운동만 보류 · 확인 필요 · 나머지는 씀', held.status === 'needs_check' && held.held.join() === 'goblet' && setsOf(held) === 7);
  const sep = memberWork(base('f3', { sameDay: new Set(['goblet']), exception: { items: [], extra: [], separate: ['goblet'] } }));
  check("'따로 한 운동이에요' — 팀 기록도 남김(둘 다)", sep.status === 'recorded' && setsOf(sep) === 10);
  check('앱 연결 대기 — 남길 수 없음 · 쓰지 않음', memberWork(base('f4', { hasUser: false })).status === 'blocked' && !memberWork(base('f4', { hasUser: false })).writeTraining);
  check('팀을 떠남 — 남길 수 없음(떠남)', memberWork(base('f4', { active: false })).reasons.join() === 'left');
  const priv = memberWork(base('f4', { canTrain: false }));
  check('트레이닝 비공개 — 세트 안 씀 · 지금 기록 그대로 · 남길 수 없음', priv.status === 'blocked' && priv.work.length === 0 && !priv.writeTraining && priv.reasons.includes('training_private'));
  const pp = memberWork(base('p5', { canPitch: false, values: [v('B1', 30)] }));
  check('투구 비공개 — 투구 안 씀 · 세트는 씀', pp.pitch.length === 0 && !pp.writePitch && pp.reasons.includes('pitch_private') && pp.work.length > 0 && pp.status === 'recorded');
  check('다른 운동 — 그 활동 대신 적은 운동', memberWork(base('f4', { exception: { items: [{ planId: 'C', kind: 'substitute', items: [{ exerciseId: 'bike' }] }], extra: [], separate: [] } })).work.map((x) => x.exerciseId).join() === 'band,lunge,bike');
  check('더 함 — 덧붙인 운동', memberWork(base('f4', { exception: { items: [], extra: [{ items: [{ exerciseId: 'bike', sets: 1, holdSec: 300 }] }], separate: [] } })).work.some((x) => x.exerciseId === 'bike' && x.sets[0].holdSeconds === 300));
  check('서로 다른 활동의 같은 운동은 둘 다 셈(세트가 이어 붙음)', linesToWork([{ exerciseId: 'lunge', sets: 2 }, { exerciseId: 'lunge', sets: 3 }], dS)[0].sets.length === 5);
  check('예외 줄의 무게만 세트에 들어감', linesToWork([{ exerciseId: 'goblet', sets: 2, reps: 8, weightKg: 20 }], dS)[0].sets.every((x) => x.weightKg === 20));
  /* 조 실제를 고침 — 예외 없는 선수만 바뀌고 줄임 선수 값은 안 흔들림 */
  const rain = plansS.map((p) => (p.id === 'C' ? { ...p, actualItems: [{ exerciseId: 'goblet', sets: 2, reps: 8 }, { exerciseId: 'row', sets: 2, reps: 10 }] } : p));
  check('다시 보내도 같은 지문(몇 번 눌러도 한 벌)', workHash(memberWork(base('f4'))) === workHash(memberWork(base('f4'))));
  check('조 실제를 고치면 예외 없는 선수는 바뀜 · 8세트', workHash(memberWork(base('f4', { plans: rain }))) !== workHash(same) && setsOf(memberWork(base('f4', { plans: rain }))) === 8);
  check('줄임 선수는 제 값 그대로(지문 같음)', workHash(memberWork(base('p2', { plans: rain, exception: reduced, values: [v('B1', 40)] }))) === workHash(p2));
  check("줄임이 새 조 실제와 같아지면 '예외를 풀까요'", sameAsGroup(reduced.items[0], rain.find((p) => p.id === 'C')!, dS) && !sameAsGroup(reduced.items[0], plansS.find((p) => p.id === 'C')!, dS));
  check('투구 열쇠 — 같은 훈련 · 활동이면 한 줄', teamPitchKey('e1', 'B1') === 'team:e1:B1');
  const big = Array.from({ length: 25 }, (_, i) => `m${i}`);
  const exMap = new Map(big.map((id, i) => [id, i < 5 ? absent : null]));
  check("확인 단추 — '같음 20 · 예외 5'", JSON.stringify(confirmSummary(big, exMap)) === '{"same":20,"exceptions":5}');
  const known = { exercises: new Set(['goblet', 'row', 'bike']), guides: new Set(['fungo']) };
  check('조 실제는 무게를 안 받음', (cleanLines([{ exerciseId: 'goblet', sets: 2, weightKg: 40 }], known, false) as { weightKg?: number }[])[0].weightKg === undefined);
  check('처방 거르기 — 모르는 운동 막음 · 세트 1~10', 'error' in cleanLines([{ exerciseId: 'zz' }], known, false) && !('error' in cleanLines([{ exerciseId: 'goblet', sets: 99 }], known, false)) && (cleanLines([{ exerciseId: 'goblet', sets: 99 }], known, false) as { sets?: number }[])[0].sets === undefined);
  check('예외 거르기 — 남의 활동 · 한 활동에 둘 · 줄 없는 줄임 막음', 'error' in (cleanException({ items: [{ planId: 'X', kind: 'absent' }] }, ['A'], known) ?? {}) && 'error' in (cleanException({ items: [{ planId: 'A', kind: 'absent' }, { planId: 'A', kind: 'absent' }] }, ['A'], known) ?? {}) && 'error' in (cleanException({ items: [{ planId: 'A', kind: 'reduced', items: [] }] }, ['A'], known) ?? {}));
  check('예외가 비면 조와 같음(null)', cleanException({ items: [] }, ['A'], known) === null && cleanException(null, ['A'], known) === null);
  check('값 거르기 — 투구를 받는 활동만 · 강도 필수 · 빈 투구 수는 지움', 'error' in cleanValues([{ planId: 'A', pitchCount: 20, effortPct: 80 }], ['B1']) && 'error' in cleanValues([{ planId: 'B1', pitchCount: 20 }], ['B1']) && (cleanValues([{ planId: 'B1', pitchCount: '' }], ['B1']) as unknown[]).length === 0);
  check('값 거르기 — 투구 수 1~500 · 구속 30~200', 'error' in cleanValues([{ planId: 'B1', pitchCount: 501, effortPct: 80 }], ['B1']) && 'error' in cleanValues([{ planId: 'B1', pitchCount: 20, effortPct: 80, maxVelocity: 20 }], ['B1']));
  check('역할 거르기', isOutingRole('standby') && !isOutingRole('closer'));
  check('대기는 다음 등판 재료가 아님', PITCHING_ROLES.join() === 'starter,relief');
  check('엔진이 확정 등판 이름을 등판으로 읽음', isOutingTitle(OUTING_CALENDAR_TITLE));

  /* 'use server' 파일의 내보낸 함수는 누구나 부를 수 있다 — 하나도 빠짐없이 코치(coachOrg) · 선수(myMember) 확인부터 */
  const team = src('app/actions/app-team.ts');
  const fns = [...team.matchAll(/export async function (\w+)\([^]*?\n\}/g)];
  check('app-team 동작이 있다', fns.length >= 12);
  for (const m of fns) check(`app-team.${m[1]} 이 권한부터 본다`, /coachOrg(Can)?\(|orgAuthz\(|myMember\(/.test(m[0]));
  check('앱 팀 동작이 허용 목록에', src('app/api/rpc/registry.ts').includes("'app-team': appTeam"));
  const sessionStore = src('lib/org/team-session-store.ts');
  check('실제 확인은 선수 운동 판에 코치 세트로(writeOrgWork) · 선수마다 따로', sessionStore.includes('await writeOrgWork({ userId: m.userId, dateKey, orgEventId: event.id') && sessionStore.includes('for (const r of rows) {'));
  check('세트는 가입 · 트레이닝 공유 · 팀에 있는 선수만, 투구는 투구 공유만', sessionStore.includes('if (m?.userId && w.writeTraining)') && sessionStore.includes('if (m?.userId && w.writePitch)') && sessionStore.includes("active: m?.status === 'ACTIVE'"));
  check('오지 않은 · 취소된 훈련은 확인 못 함', team.includes("if (toDateKey(r.event.date) > toDateKey(appNow())) return { ok: false, error: '아직 오지 않은 훈련이에요.") && team.includes("if (r.event.status === 'canceled') return { ok: false, error: '취소된 훈련이에요.' };"));
  check('계획 · 명단만으로는 기록 없음 — 기록을 쓰는 길은 확인(applyTeamWork) 하나', !team.includes('writeOrgWork(') && (team.match(/applyTeamWork\(/g) ?? []).length >= 3);
  check('한 선수 실패는 그 선수만 · 실패만 다시(지문 비움)', sessionStore.includes("workStatus: 'failed', workReason: 'write_failed', workHash: null") && sessionStore.includes("r.prev.workStatus === 'failed'"));
  check('같은 확인을 다시 보내면 안 씀(지문) · 투구는 열쇠로 고침', sessionStore.includes('if (!needsWrite(r)) {') && sessionStore.includes('where: { userId_clientKey: { userId: a.userId, clientKey } }'));
  check('명단은 처음 한 번만 담음(그 뒤 들어오고 나간 선수와 무관)', sessionStore.includes("updateMany({ where: { id: event.id, rosterAt: null }, data: { rosterAt: appNow() } })") && sessionStore.includes('if (!event.rosterAt) return eventMemberIds(event, active);'));
  check('등판 고치면 다시 짜는 중', team.includes("update: { role, pitchLimit: n, status: 'draft'"));
  check('공지 읽음은 제 조직 공지만', team.includes('where: { id: { in: ids }, orgId: r.m.org.id }'));
  const load = src('lib/org/team-load.ts');
  check('엔진 재료는 확정 · 선발 · 불펜 · 취소 안 한 일정만', load.includes("status: 'confirmed', role: { in: [...PITCHING_ROLES] }") && load.includes("status: { not: 'canceled' }"));
  check('떠난 팀 등판은 안 읽음', load.includes("role: 'PLAYER', status: 'ACTIVE'"));
  check('엔진이 팀 등판을 달력 일정과 같이 읽음', src('lib/report/gather.ts').includes('confirmedOutingEvents(userId, calendarFrom, calendarTo)'));
  const cal = src('app/actions/org-calendar.ts');
  check('일정을 지우면 참석 · 메뉴 · 등판도 같이', ['orgEventAttendee', 'orgPlan', 'orgOuting'].every((t) => cal.includes(`prisma.${t}.deleteMany({ where: { eventId: ev.id } })`)));
  check('공지를 지우면 읽음도 같이', src('app/actions/org-notices.ts').includes('orgNoticeRead.deleteMany({ where: { noticeId: n.id } })'));
}

/* ─────────────────────── 16. S단계 — 공간 · 역할별 아래 탭 · 고르개 · 나가기 자리(계약 8절) ─────────────────────── */

{
  const keys = (k: 'TEAM' | 'LESSON', side: 'c' | 'p') => spaceTabs(k, side).map((t) => t.label).join(' · ');
  check('팀 코치 탭', keys('TEAM', 'c') === '오늘 · 일정 · 훈련 · 선수단 · 더보기');
  check('팀 선수 탭(성장은 4단계)', keys('TEAM', 'p') === '오늘 · 일정 · 내 훈련 · 더보기');
  check('레슨장 코치 탭', keys('LESSON', 'c') === '오늘 · 회원 · 레슨일지 · 받은 것 · 더보기');
  check('레슨장 회원 탭(성장은 4단계)', keys('LESSON', 'p') === '홈 · 레슨일지 · 숙제 · 더보기');
  const allLabels = (['TEAM', 'LESSON'] as const).flatMap((k) => (['c', 'p'] as const).flatMap((sd) => spaceTabs(k, sd).map((t) => t.label)));
  check('조직 아래 탭에 덕아웃 · 예약 · 수강권 · 결제 · 빈 성장 탭 없음', !allLabels.some((l) => /덕아웃|예약|수강권|결제|성장/.test(l)));
  check('고르개 이름', spaceLabel({ name: 'A팀', kind: 'TEAM', role: 'PLAYER' }) === 'A팀 · 선수' && spaceLabel({ name: 'B', kind: 'LESSON', role: 'PLAYER' }) === 'B · 회원' && spaceLabel({ name: 'B', kind: 'LESSON', role: 'MASTER' }) === 'B · 대표');
  const team = { orgId: 'o1', role: 'PLAYER' };
  const studio = { orgId: 'o2', role: 'PLAYER' };
  check('선수 — 저장한 공간이 있으면 그대로', JSON.stringify(resolveSpace('o1:p', true, [team, studio])) === '{"key":"o1:p","lost":false}');
  check('선수 — 저장한 공간이 사라지면 내 싱커 + 알림', JSON.stringify(resolveSpace('o9:p', true, [team])) === '{"key":"me","lost":true}');
  check('선수 — 떠난 소속은 고를 수 없음', resolveSpace('o1:p', true, [{ ...team, left: true }]).key === ME);
  check('선수 — 내 싱커 저장은 알림 없이 내 싱커', JSON.stringify(resolveSpace(ME, true, [team])) === '{"key":"me","lost":false}');
  const m1 = { orgId: 'm1', role: 'MASTER' };
  const m2 = { orgId: 'm2', role: 'STAFF' };
  check('마스터 — 잃으면 다른 관리 조직(내 싱커 아님)', JSON.stringify(resolveSpace('m1:c', false, [m2])) === '{"key":"m2:c","lost":true}');
  check('마스터 — 조직이 없으면 조직 없음', JSON.stringify(resolveSpace('m1:c', false, [])) === `{"key":"${NO_ORG}","lost":true}`);
  check('마스터 — 처음(내 싱커로 저장돼 있어도)은 첫 조직', JSON.stringify(resolveSpace(ME, false, [m1, m2])) === '{"key":"m1:c","lost":false}');
  check('마스터 — 저장 없음 · 조직 없음', resolveSpace(null, false, []).key === NO_ORG);
  const open = parseOrgOpen(orgOpenHref('o1', 'p', 'homework'));
  check('알림 주소 왕복', open?.orgId === 'o1' && open.side === 'p' && open.target === 'homework');
  check('모르는 대상은 오늘로 · 이상한 주소는 무시', parseOrgOpen('/org/open?org=o1&as=p&to=evil')?.target === 'today' && parseOrgOpen('/org/open?org=../x&as=p') === null && parseOrgOpen('/org/open?org=o1&as=x') === null && parseOrgOpen('/manage') === null);
  /* 기록 하나를 가리키는 알림(계약 9-6 ①-3 C) */
  const rec = parseOrgOpen(orgOpenHref('o1', 'c', 'inbox', { kind: 'homework', id: 'h1', member: 'm1' }));
  check('기록 알림 왕복 — 종류 · 번호 · 회원', JSON.stringify(rec?.rec) === '{"kind":"homework","id":"h1","member":"m1"}' && rec?.target === 'inbox');
  check(
    '기록 알림 — 이상한 번호 · 종류는 버리고 탭만',
    parseOrgOpen('/org/open?org=o1&as=p&to=notes&rec=note.../x')?.rec === undefined &&
      parseOrgOpen('/org/open?org=o1&as=p&to=notes&rec=comment.c1')?.rec === undefined &&
      parseOrgOpen('/org/open?org=o1&as=p&to=notes&rec=note.n1&m=../x')?.rec?.member === undefined
  );
  check('기록 화면 주소', orgRecordHref('o1', 'p', { kind: 'note', id: 'n1' }) === '/org/record?org=o1&as=p&kind=note&id=n1');
  {
    const lesson = src('app/actions/app-lesson.ts');
    const notes = src('app/actions/org-notes.ts');
    check(
      '기록 알림 — 숙제 · 답 · 질문 · 일지 · 일지 영상이 그 기록을 가리킴',
      lesson.includes("orgOpenHref(orgId, 'p', 'homework', { kind: 'homework', id: made.id })") &&
        lesson.includes("'noteId' in t ? 'notes' : 'homework', recordOf(t))") &&
        lesson.includes("orgOpenHref(owner.orgId, 'c', 'inbox', { ...recordOf(t), member: r.m.id })") &&
        lesson.includes("orgOpenHref(orgId, 'p', 'notes', { kind: 'note', id: note.id })") &&
        notes.includes("orgOpenHref(member.orgId, 'p', 'notes', { kind: 'note', id: noteId })")
    );
    check('기록 화면 — 선수 쪽 회원 id 는 공간 목록의 것', src('native/src/app/index.tsx').includes("(o.side === 'p' ? s.memberId : o.rec?.member) ?? undefined"));
  }
  {
    /* 같은 훈련 가리기 · 취소 일정의 코치 세트(계약 9-6 ①-6 F, 결정 3 · 4) */
    const team = src('app/actions/app-team.ts');
    const cal = src('app/actions/org-calendar.ts');
    const store = src('lib/org/team-work-store.ts');
    const sessionStore = src('lib/org/team-session-store.ts');
    check(
      '맞추기 — 일정에 이은 선수 세트 · 그날 안 이은 선수 세트를 가려 읽음(코치 세트 제외)',
      sessionStore.includes('enteredById: null, OR: [{ orgEventId: event.id }, { date: event.date, orgEventId: null }]')
    );
    check("'팀 훈련이었나요' — 잇기는 그날 안 이은 그 운동만 · 따로는 예외에 적고 다시 셈", team.includes('where: { userId: m.userId, date: event.date, enteredById: null, orgEventId: null, exerciseId }') && team.includes("separate: [...new Set([...e.separate, exerciseId])]"));
    check('선수 직접 기록 수는 트레이닝 공유를 켠 선수만 코치에게 보임', sessionStore.includes('linkedSets: scope?.training ? linked.length : 0'));
    check(
      '일정 지우기 · 취소는 고른 때만 코치 세트 · 팀 투구를 뺌(기본은 둠)',
      cal.includes("if (formData.get('work') === 'remove') await clearTeamWork(ev.id, user.id);") &&
        cal.includes("if (status === 'canceled' && formData.get('work') === 'remove') await clearTeamWork(ev.id, user.id);") &&
        store.includes("items: [] });") &&
        sessionStore.includes("await prisma.pitchLog.deleteMany({ where: { clientKey: { startsWith: `team:${eventId}:` } } });")
    );
    const ev = src('native/src/app/org/event.tsx');
    check("앱 일정 지우기 · 취소가 '수행일지도 뺄까요'를 묻고 답을 보냄", ev.includes("'app-team.loadEventWork'") && ev.includes('{ id: found?.id, work }') && ev.includes('{ id: found.id, status, work }'));
  }
  {
    /* 팀 등판 확인(계약 9-6 ①-5 E) — 날이 다르면 묻는다 */
    const T = '2026-10-26';
    const o = (date: string, orgId = 'a', role: TeamOuting['role'] = 'starter'): TeamOuting => ({ orgId, orgName: orgId === 'a' ? 'A팀' : 'B팀', eventId: `e-${orgId}-${date}`, date, role, pitchLimit: 60 });
    const run = (outings: TeamOuting[], plan: string | null, cal: string[] = []) => outingConflicts({ today: T, outings, throwPlanToday: plan, calendarOutings: cal });
    check('체크인 답과 같은 날이면 조용함', run([o(T)], '오늘 등판').length === 0 && run([o('2026-10-28')], '2~3일 뒤').length === 0 && run([o('2026-10-31')], '4일 이상 뒤').length === 0);
    check(
      '체크인 답과 날이 다르면 묻는다',
      run([o(T)], '내일 등판')[0]?.kind === 'checkin' && run([o('2026-10-27')], '없음')[0]?.kind === 'checkin' && run([o(T)], '오늘 불펜')[0]?.kind === 'checkin' && run([o('2026-10-31')], '내일 등판')[0]?.kind === 'checkin'
    );
    check("'없음'인데 팀 등판이 4일 넘게 뒤면 조용함 · 체크인 안 했으면 조용함", run([o('2026-10-31')], '없음').length === 0 && run([o(T)], null).length === 0);
    check('내 달력 등판이 팀 등판 날과 같으면 조용 · 다르면 묻기', run([o(T)], null, [T]).length === 0 && run([o(T)], null, ['2026-10-28'])[0]?.kind === 'calendar');
    const two = run([o(T, 'a'), o(T, 'b', 'relief')], null);
    check('두 팀 같은 날 등판은 묻는다', two.length === 1 && two[0].kind === 'teams' && conflictLine(two[0], T).includes('A팀 선발') && conflictLine(two[0], T).includes('B팀 불펜'));
    check('창(7일) 밖 · 지난 등판은 안 봄', run([o('2026-11-05')], '내일 등판').length === 0 && run([o('2026-10-25')], '내일 등판').length === 0);
    check("선수에게 보일 말에 조직 · 역할 · 한도", conflictLine(run([o(T)], '없음')[0], T) === "팀은 A팀 · 오늘 선발 · 60구까지인데, 오늘 체크인에는 '없음'으로 답했어요.");
    const team = src('app/actions/app-team.ts');
    check(
      '코치에게는 체크인 공유를 켠 선수의 체크인 답만(다른 팀 · 개인 달력 안 보임)',
      team.includes("r.scope?.checkin && out.get(r.id)?.status === 'confirmed'") && team.includes('calendarOutings: [] }).length ?')
    );
    check('엔진은 그대로 — 팀 등판은 달력 모양으로 같은 출처', src('lib/org/team-load.ts').includes('(await teamOutingsOf(userId, from, to)).map((o) => ({ date: new Date(`${o.date}T00:00:00.000Z`), title: OUTING_CALENDAR_TITLE }))'));
  }
  {
    /* ② 공통 셸 · 배치(계약 9-3 · 9-4) */
    check('고르개 역할 말', spaceRoleWord({ kind: 'TEAM', role: 'PLAYER' }) === '선수' && spaceRoleWord({ kind: 'LESSON', role: 'PLAYER' }) === '회원' && spaceRoleWord({ kind: 'TEAM', role: 'MASTER' }) === '대표' && spaceRoleWord({ kind: 'LESSON', role: 'STAFF' }) === '코치');
    const space = src('native/src/org/space.tsx');
    check('공간 머리 한 줄 — 싱커 이름표 · 두 줄 고르개 · 알림 종', space.includes('<Wordmark size={17}') && space.includes('sub={`${KIND_WORD[space.kind]} · ${spaceRoleWord(space)}`}') && space.includes("params: { only: '1' }"));
    check('설정 › 정보에 앱 판(화면 묶음 · 바닥 판)', src('native/src/app/settings.tsx').includes('loadBundleInfo()') && src('native/src/shell/app-update.ts').includes('Updates.updateId.slice(0, 8)'));
    check('카드는 평평 — 그림자는 머리 카드(float)만', src('native/src/org/parts.tsx').includes('float && { boxShadow: c.float }') && !src('native/src/org/coach.tsx').includes('boxShadow'));
    const coach = src('native/src/org/coach.tsx');
    check('코치 일정은 빈 날을 안 그림 — 한 주 띠 + 일정 있는 날만', coach.includes('const withEvents = data ? days.filter((d) => data.events.some((e) => e.date === d)) : [];') && coach.includes('withEvents.map((d, di)'));
    check("오늘의 숫자 → 선수단 거르개", coach.includes("openRoster(space, filterOfWatch(g.k))") && coach.includes('nextRosterFilter = null;') && src('app/actions/app-org.ts').includes('watch: watchKindOf({ hasUser: !!m.user, consent: m.consent }, statusOf.get(m.id) ?? null)'));
  }
  {
    /* ③ 흐름 잇기(계약 9-6 ③) */
    const ev = parseOrgOpen(orgOpenHref('o1', 'p', 'schedule', { kind: 'event', id: 'e1' }));
    check('일정 알림 왕복 · 기록 화면 주소(선수 · 코치)', JSON.stringify(ev?.rec) === '{"kind":"event","id":"e1"}' && orgRecordHref('o1', 'p', { kind: 'event', id: 'e1', member: 'm1' }) === '/org/my-event?org=o1&id=e1&member=m1' && orgRecordHref('o1', 'c', { kind: 'event', id: 'e1' }) === '/org/team-event?org=o1&id=e1');
    check('공유 바꿈 · 나감 알림은 선수단 탭으로', targetTab('TEAM', 'c', 'roster') === 'roster' && targetTab('LESSON', 'c', 'roster') === 'roster');
    const cal = src('app/actions/org-calendar.ts');
    check(
      '일정 알림 — 새로 · 바뀜(메모만은 안 보냄) · 취소 · 빠짐, 오늘 · 앞으로만',
      cal.includes("title: '새 일정이 잡혔어요'") && cal.includes("title: '일정이 바뀌었어요'") && cal.includes("'일정이 취소됐어요'") && cal.includes("title: '일정이 빠졌어요'") &&
        cal.includes('found.title !== title || found.memberId !== memberId') && !cal.includes('found.memo !== memo')
    );
    const team = src('app/actions/app-team.ts');
    check("메뉴 알림은 2일 안 살아 있는 일정의 활동 대상만", team.includes("key > shiftDateKey(today, 2) || targets.length === 0) return;") && team.includes("await tellPlan(orgId, event, targets, '훈련 메뉴가 올라왔어요');"));
    check('확인 알림은 바뀐 선수에게 한 번(올라옴 · 바뀜 · 확인해 주세요)', src('lib/org/team-session-store.ts').includes("title: w.status === 'needs_check' ? '팀 훈련 기록을 확인해 주세요' : had ? '팀 훈련 기록이 바뀌었어요' : '팀 훈련 기록이 올라왔어요'"));
    check('공유 바꿈 · 나감은 대표 · 코치에게(앱 · PC)', src('app/actions/app-org.ts').includes('님이 나갔어요') && src('app/actions/app-org.ts').includes('님이 보여 주는 기록을 바꿨어요') && src('app/actions/sharing.ts').includes('notifyCoaches(member.orgId'));
    check(
      '코치 세트 바꾸기는 선수 세트(일정에 이은 것)를 안 지움',
      src('lib/org/team-work-store.ts').includes('deleteMany({ where: { sessionId: id, orgEventId: a.orgEventId, enteredById: { not: null } } })')
    );
    check(
      "'코치가 남긴 수행' · 팀 훈련 기록 카드는 코치 세트 · 팀 투구 줄만",
      team.includes("setSummary({ userId: r.user.id, orgEventId: e.id, enteredById: { not: null } })") &&
        team.includes('where: { userId, orgEventId: { in: events.map((e) => e.id) }, enteredById: { not: null } }') &&
        team.includes('prisma.pitchLog.findMany({ where: { userId, clientKey: { startsWith: `team:${event.id}:` } }')
    );
    check(
      '내 기록 잇기 — 내 세트 · 그날 · 아직 안 이은 것 · 메뉴 운동(없으면 시작 뒤 것만)',
      team.includes("...(session ? { sessionId: session } : {})") && team.includes("...(!session && ids.length ? { exerciseId: { in: ids } } : {})") && team.includes('...(from ? { recordedAt: { gte: from } } : {})') && team.includes('if (!session && !ids.length && !from) return { ok: true, linked: 0 };')
    );
    check("일정 화면 '운동하기'는 메뉴를 오늘 운동에 넣고, 마치면 이 일정에 잇기", src('native/src/app/org/my-event.tsx').includes("'app-team.menuToToday'") && src('native/src/org/space-store.ts').includes("('app-team.linkMyWork', l.memberId, l.eventId, l.since, l.sessionId)"));
  }
  {
    /* 다시 쓰기 · 오늘 브리핑(계약 10-4) */
    check('복사한 메뉴 대상 — 모두는 모두, 고른 선수는 새 일정 선수로 좁힘, 아무도 안 남으면 버림', JSON.stringify(copyPlanTargets([], ['a', 'b'])) === '[]' && JSON.stringify(copyPlanTargets(['a', 'c'], ['a', 'b'])) === '["a"]' && copyPlanTargets(['c'], ['a', 'b']) === null);
    check('한 주 복사의 같은 일정', weekCopyKey({ date: '2026-11-03', time: '19:00', title: '훈련' }) === weekCopyKey({ date: '2026-11-03', time: '19:00', title: '훈련' }) && weekCopyKey({ date: '2026-11-03', time: null, title: '훈련' }) !== weekCopyKey({ date: '2026-11-03', time: '19:00', title: '훈련' }));
    const team = src('app/actions/app-team.ts');
    check(
      '복사는 새 행만 — 실제 · 예외 · 등판 · 결과는 안 옮기고, 바꾸기는 이 일정의 활동만 지움',
      team.includes("if (mode === 'replace') await tx.orgPlan.deleteMany({ where: { orgId, eventId: to.id } });") &&
        !/actualItems/.test(team.slice(team.indexOf('async function createCopies'), team.indexOf('/** 지난 일정의 활동을'))) &&
        !/copyWeek[\s\S]{0,4000}orgEventAttendee\.create|copyWeek[\s\S]{0,4000}orgOuting\.create|copyWeek[\s\S]{0,4000}userExerciseSet/.test(team.slice(team.indexOf('export async function copyWeek'), team.indexOf('const dayLabelOf')))
    );
    check('한 주 복사는 같은 일정이 있으면 건너뛰고 · 떠난 회원 레슨은 안 옮기고 · 알림은 선수마다 한 번', team.includes('taken.has(weekCopyKey({ date, time: e.time, title: e.title })) || (e.memberId && !active.includes(e.memberId))') && team.includes('count.set(p.userId!, (count.get(p.userId!) ?? 0) + 1)'));
    const org = src('app/actions/app-org.ts');
    check(
      '브리핑 — 원래 기록에서 셈(치우기 없음) · 팀 훈련은 실제 확인 전 · 확인 필요 · 실패 · 정정 요청 · 숙제 영상은 받은 것에만',
      org.includes("'실제 확인 전'") && org.includes("workStatus: { in: ['needs_check', 'failed'] }") && org.includes("kind: 'fix', resolvedAt: null") && org.includes("where: { orgId, status: 'reported' }") && !org.includes("status: 'submitted' }, orderBy")
    );
  }
  check('알림 대상 → 탭', targetTab('TEAM', 'p', 'homework') === 'mytraining' && targetTab('LESSON', 'p', 'homework') === 'homework' && targetTab('TEAM', 'c', 'inbox') === 'today' && targetTab('LESSON', 'c', 'inbox') === 'inbox' && targetTab('TEAM', 'p', 'share') === null);
  check('운동 돌아올 곳 왕복', JSON.stringify(parseOrgReturn(orgReturnParam('o1:p', 'homework'))) === '{"key":"o1:p","tab":"homework"}' && parseOrgReturn('org:x:y') === null);

  /* 서버 */
  check('마스터 계정은 선수 초대 코드를 못 씀', src('lib/org/join.ts').includes("if (invite.role === 'PLAYER' && user.accountType === 'MASTER') return { ok: false, error: 'master' };"));
  const org = src('app/actions/app-org.ts');
  check('공간 목록 — 마스터는 선수 소속 없음 · 지금 소속과 떠난 소속을 가름', org.includes("user.accountType === 'MASTER'\n      ? []") && org.includes('former: spaces.filter((s) => s.left)'));
  for (const f of ['app/actions/app-org.ts', 'app/actions/app-lesson.ts', 'app/actions/app-team.ts'])
    check(`${f} 권한 없음은 ORG_LOST(앱이 공간을 다시 확인)`, src(f).includes('const NO_ACCESS = { ok: false as const, to: ORG_LOST };'));
  check('권한 없음 주소', ORG_LOST === '/org/lost');
  const bodyOf = (file: string, fn: string) => new RegExp(`export async function ${fn}\\([^]*?\\n\\}`).exec(src(file))?.[0] ?? '';
  for (const [file, fn] of [
    ['app/actions/app-lesson.ts', 'markMyHomework'],
    ['app/actions/app-lesson.ts', 'homeworkToToday'],
    ['app/actions/app-lesson.ts', 'addMyComment'],
    ['app/actions/app-lesson.ts', 'myVideoUpload'],
    ['app/actions/app-team.ts', 'answerTeamCheck'],
    ['app/actions/app-team.ts', 'requestTeamFix'],
    ['app/actions/app-team.ts', 'markNoticesRead'],
    ['app/actions/app-org.ts', 'saveConsent'],
  ] as const)
    check(`떠난 회원은 못 씀 — ${fn}`, /status !== 'ACTIVE'/.test(bodyOf(file, fn)));
  check('떠난 회원에게 숙제는 안 보임', bodyOf('app/actions/app-lesson.ts', 'loadMyHomework').includes("if (r.m.status !== 'ACTIVE') return { ok: true, homework: [] };"));
  const actions = readdirSync(join(ROOT, 'app/actions')).filter((f) => f.endsWith('.ts'));
  check('조직 알림이 덕아웃 마이(/me#lessons)로 안 감', actions.every((f) => !src(`app/actions/${f}`).includes('/me#lessons')));
  check('웹 받이 페이지(옛 앱 · PC 404 막기)', existsSync(join(ROOT, 'app/org/open/page.tsx')) && existsSync(join(ROOT, 'app/org/lost/page.tsx')));

  /* 앱 */
  const nativeFiles = walk(join(ROOT, 'native/src')).filter((f) => /\.(ts|tsx)$/.test(f));
  const leaveCallers = nativeFiles.filter((f) => readFileSync(f, 'utf8').includes("'app-org.leaveOrg'")).map((f) => f.slice(ROOT.length).replace(/^\//, ''));
  check('나가기는 소속 관리 화면에서만', leaveCallers.join() === 'native/src/app/org/index.tsx', leaveCallers.join());
  for (const f of ['native/src/org/space-store.ts', 'native/src/org/space.tsx', 'native/src/org/space-pick.tsx', 'native/src/app/org/pick.tsx'])
    check(`${f} 바꾸기는 소속 · 공유를 안 건드림`, !/leaveOrg|saveConsent|joinOrgApp/.test(src(f)));
  const orgScreens = ['native/src/org/coach.tsx', 'native/src/org/player.tsx', 'native/src/org/space.tsx'].map(src).join('\n');
  check('조직 화면에 예약 · 수강권 · 결제 동작 없음(덕아웃 링크만)', !/confirmBooking|addPass|adjustPass|'lessons\.|\/pay\//.test(orgScreens) && orgScreens.includes('openDugout'));
  const store = src('native/src/org/space-store.ts');
  check('마지막 공간은 사람마다', store.includes('`bullpen-space:${userId}`') && store.includes('resolveSpace(before, r.hasSinker, r.spaces)'));
  const shell = src('native/src/app/index.tsx');
  check('껍데기 — 조직 공간이면 내 싱커 판은 숨기고 덮개 · 조직 탭', shell.includes('visible={pagerOn && !inOrg}') && shell.includes('<OrgSpaceView bottom={tabBottom} />') && shell.includes('key={`org:${sp.key}`}'));
  check('껍데기 — 권한 없음 · 조직 알림을 앱이 받음', shell.includes('if (href === ORG_LOST) return orgLost();') && shell.includes('parseOrgOpen(href)') && shell.includes("u.pathname === ORG_LOST || u.pathname === '/org/open'"));
  check('껍데기 — 다른 조직 알림은 쓰던 글을 먼저 물음', shell.includes('if (!(await confirmLeaveDrafts())) return;'));
  check('껍데기 — 앱이 앞으로 올 때 공간을 다시 확인', shell.includes('void spaceOwner(userId);'));
  check('앱 useLoad — 권한 없음은 화면을 무작정 걷지 않음', src('native/src/community/parts.tsx').includes('if (to === ORG_LOST) orgLost();'));
  const tabBar = src('native/src/shell/tab-bar.tsx');
  /* 2026-10-29 확정 디자인 뒤 탭은 홈 · 투구 · 트레이닝 · 기록 · 덕아웃(DEFAULT_TABS) — 타격은 종목 바에만, 더보기는 위 막대 메뉴로. 이 검사는 그 뒤 깨져 있었다(2026-11-01 고침) */
  check('내 싱커 아래 탭 그대로(홈 · 투구 · 트레이닝 · 기록 · 덕아웃)', ["label: '홈'", "label: '투구'", "label: '트레이닝'", "label: '기록'", "label: '덕아웃'"].every((x) => tabBar.includes(x)));
  check('쓰기 화면이 쓰던 글을 알림', ['note', 'homework', 'plan', 'actual', 'exception', 'notice', 'event'].every((n) => src(`native/src/app/org/${n}.tsx`).includes('useDraftGuard(')));
  /* 참석 기능을 걷었다(2026-10-27 김민, 계약 11-9 2) — 앱 · PC · 서버 어디에도 참석 응답 · 참석 확인 · 모두 왔어요 · 참석한 선수 모두 메뉴대로가 없다 */
  const teamFiles = ['app/actions/app-team.ts', 'app/actions/app-org.ts', 'components/master/team-event.tsx', 'native/src/app/org/team-event.tsx', 'native/src/app/org/my-event.tsx', 'native/src/org/player.tsx', 'native/src/org/coach.tsx'];
  check(
    '참석 응답 · 참석 확인 단추가 앱 · PC 어디에도 없음',
    teamFiles.every((f) => !/replyEvent|setAttended|markAllAttended|recordAttendedAsPlan|ATTEND_LABEL|모두 왔어요|가요 ·|참석한 선수 모두/.test(src(f)))
  );
  check('한 선수씩 같은 폼을 내지 않음 — 옛 선수별 수행일지 길(recordWork) 없음', teamFiles.every((f) => !/recordWork|loadMemberWork/.test(src(f))) && !existsSync(join(ROOT, 'native/src/app/org/work.tsx')));
  check(
    '조 전체에 같은 투구 수가 들어가는 길이 없음 — 투구 칸은 선수마다(saveTeamValues 는 줄마다 그 선수 값)',
    src('app/actions/app-team.ts').includes('const v = cleanValues([{ ...x, planId: plan.id }], [plan.id]);') && !/pitchCount: count\b/.test(src('native/src/app/org/team-event.tsx'))
  );
  check('선수 화면은 제 결과만 — 내 회원 한 명만 셈(computeTeamWork(event, [memberId])) · 내 활동만(memberPlans)', src('app/actions/app-team.ts').includes('const t = await computeTeamWork(event, [memberId]);') && src('app/actions/app-team.ts').includes('return memberPlans(await readSessionPlans(event.id), roster, memberId);'));
  check('조직에서 연 운동은 그 공간으로 돌아옴', src('native/src/app/workout-done.tsx').includes('consumeOrgReturn()') && src('native/src/org/player.tsx').includes('setOrgReturn(spaceKeyOf(space), tab)'));
}


/* ───────── 팀 · 레슨 통합 1단계(2026-11-01) — 조직 업무 권한 · 예약 끝냄 중복 차감 · 취소 보존 · 코치 판정 ───────── */
{
  const owner = { role: 'MASTER' as const };
  const coach = { role: 'STAFF' as const };
  const player = { role: 'PLAYER' as const };
  const left = { role: 'MASTER' as const, status: 'LEFT' };
  /* 학부모 총무 — 일반 회원(PLAYER 역할 줄)에 일정 · 공지만 위임 */
  const treasurer = { role: 'PLAYER' as const, grants: [{ capability: 'schedule.manage' as const, scope: 'organization' as const }, { capability: 'notice.publish' as const, scope: 'organization' as const }] };
  check('권한: 소유자는 전부', ORG_CAPABILITIES.every((c) => hasCapability(owner, c)));
  check('권한: 코치는 권한 관리 · 회계 · 내보내기 없음', !hasCapability(coach, 'permission.manage') && !hasCapability(coach, 'finance.manage') && !hasCapability(coach, 'export.data') && hasCapability(coach, 'training.assign'));
  check('권한: 선수는 일정 보기만 · 본인 범위', hasCapability(player, 'schedule.read') && !hasCapability(player, 'roster.read') && capabilityScope(player, 'schedule.read') === 'self');
  check('권한: 떠난 회원은 아무것도 못 함', !hasCapability(left, 'schedule.read'));
  check('권한: 총무는 일정 · 공지만 — 훈련 기록 · 명단은 못 봄', hasCapability(treasurer, 'schedule.manage') && hasCapability(treasurer, 'notice.publish') && !hasCapability(treasurer, 'training.read') && !hasCapability(treasurer, 'roster.read'));
  check('권한: 기록 여는 권한은 셋 — 동의와 교집합으로만', RECORD_CAPABILITIES.size === 3 && RECORD_CAPABILITIES.has('training.read'));
  check('위임: 소유자만 위임한다 · 권한 관리 자체는 못 넘긴다(2026-11-01 F04)', !canGrant(owner, { capability: 'permission.manage', scope: 'organization' }) && canGrant(owner, { capability: 'schedule.manage', scope: 'organization' }) && !canGrant(coach, { capability: 'schedule.manage', scope: 'organization' }));
  check('위임: 총무 · 선수는 아무것도 못 준다', !canGrant(treasurer, { capability: 'schedule.read', scope: 'self' }) && !canGrant(player, { capability: 'schedule.read', scope: 'self' }));
  check('위임: 코치에게 permission.manage 를 묶음 범위로 줘도 아무것도 못 준다(소유자만 위임, 2026-11-01 F04)', (() => {
    const sub = { role: 'STAFF' as const, grants: [{ capability: 'permission.manage' as const, scope: 'explicit_group' as const, targets: ['m1'] }] };
    return !canGrant(sub, { capability: 'schedule.manage', scope: 'explicit_group', targets: ['m1'] }) && !canGrant(sub, { capability: 'schedule.manage', scope: 'organization' }) && !canGrant(sub, { capability: 'permission.manage', scope: 'explicit_group', targets: ['m1'] });
  })());

  /* 예약 끝냄 — 메모리 트랜잭션(조건부 갱신 의미 그대로)으로 두 요청을 겹쳐 돌린다 */
  const makeTx = (state: { booking: string; passes: { id: string; total: number; used: number; expiresAt: Date | null }[] }) => {
    const log: string[] = [];
    const tx = {
      lessonBooking: {
        async updateMany(a: { where: { id: string; status: string }; data: { status: string } }) {
          await Promise.resolve();
          if (state.booking !== a.where.status) return { count: 0 };
          state.booking = a.data.status;
          log.push('booking→' + a.data.status);
          return { count: 1 };
        },
      },
      lessonPass: {
        async findMany() {
          await Promise.resolve();
          return state.passes.map((p) => ({ ...p }));
        },
        async updateMany(a: { where: { id: string; used: { lt: number } }; data: { used: { increment: number } } }) {
          await Promise.resolve();
          const p = state.passes.find((x) => x.id === a.where.id);
          if (!p || !(p.used < a.where.used.lt)) return { count: 0 };
          p.used += a.data.used.increment;
          log.push('debit:' + p.id);
          return { count: 1 };
        },
      },
    };
    return { tx, log };
  };
  const day = '2026-11-01';
  {
    const st = { booking: 'CONFIRMED', passes: [{ id: 'p1', total: 10, used: 9, expiresAt: null }] };
    const { tx, log } = makeTx(st);
    const [a, b] = await Promise.all([
      completeBookingTx(tx, { bookingId: 'b', memberId: 'm', lessonDay: day }),
      completeBookingTx(tx, { bookingId: 'b', memberId: 'm', lessonDay: day }),
    ]);
    check('끝냄 겹침: 하나만 끝내고 한 회만 준다', [a, b].filter((r) => r.done).length === 1 && st.passes[0].used === 10 && log.filter((l) => l.startsWith('debit')).length === 1, JSON.stringify({ a, b, log }));
  }
  {
    const st = { booking: 'CONFIRMED', passes: [{ id: 'p1', total: 10, used: 9, expiresAt: null }] };
    const { tx } = makeTx(st);
    const r1 = await completeBookingTx(tx, { bookingId: 'b', memberId: 'm', lessonDay: day });
    const r2 = await completeBookingTx(tx, { bookingId: 'b', memberId: 'm', lessonDay: day });
    check('끝냄 재시도: 두 번째는 아무것도 안 바꿈', r1.done && !r2.done && st.passes[0].used === 10);
  }
  {
    const st = { booking: 'REQUESTED', passes: [{ id: 'p1', total: 10, used: 0, expiresAt: null }] };
    const { tx } = makeTx(st);
    const r = await completeBookingTx(tx, { bookingId: 'b', memberId: 'm', lessonDay: day });
    check('끝냄: 확정 전 예약은 못 끝내고 차감 없음', !r.done && st.passes[0].used === 0 && st.booking === 'REQUESTED');
  }
  {
    const st = { booking: 'CONFIRMED', passes: [{ id: 'old', total: 5, used: 5, expiresAt: null }, { id: 'exp', total: 5, used: 0, expiresAt: new Date('2026-10-01') }, { id: 'ok', total: 5, used: 0, expiresAt: new Date('2026-12-31') }] };
    const { tx } = makeTx(st);
    const r = await completeBookingTx(tx, { bookingId: 'b', memberId: 'm', lessonDay: day });
    check('끝냄: 다 쓴 것 · 기한 지난 것은 건너뛰고 쓸 수 있는 것 하나', r.done && r.passId === 'ok' && st.passes[2].used === 1 && st.passes[0].used === 5);
  }
  {
    const st = { booking: 'CONFIRMED', passes: [] as { id: string; total: number; used: number; expiresAt: Date | null }[] };
    const { tx } = makeTx(st);
    const r = await completeBookingTx(tx, { bookingId: 'b', memberId: 'm', lessonDay: day });
    check('끝냄: 수강권이 없으면 끝내되 passId null(화면이 알린다)', r.done && r.passId === null);
  }
  {
    /* 두 수강권이 각각 한 회 남았을 때 겹친 두 요청 — 끝냄은 하나뿐이라 차감도 한 번뿐 */
    const st = { booking: 'CONFIRMED', passes: [{ id: 'a', total: 1, used: 0, expiresAt: null }, { id: 'b', total: 1, used: 0, expiresAt: null }] };
    const { tx } = makeTx(st);
    await Promise.all(Array.from({ length: 5 }, () => completeBookingTx(tx, { bookingId: 'b', memberId: 'm', lessonDay: day })));
    check('끝냄 다섯 겹침: 총 차감 1', st.passes.reduce((n, p) => n + p.used, 0) === 1);
  }

  /* 소스 — 서버 동작이 새 길을 쓰고 옛 길(상태 미리 읽고 update · 취소 때 일정 삭제 · 코치 = 계정 종류)이 남지 않았나 */
  const lessons = readFileSync(join(ROOT, 'app/actions/lessons.ts'), 'utf8');
  check('lessons.ts: finishBooking 이 finishBookingTx(조건부 전이 + completeBookingTx)를 쓴다', lessons.includes('finishBookingTx(tx') && readFileSync(join(ROOT, 'lib/org/booking-transitions.ts'), 'utf8').includes('await completeBookingTx(tx, a)'));
  check('lessons.ts: 취소가 일정을 지우지 않는다(orgEvent.deleteMany 없음)', !lessons.includes('orgEvent.deleteMany'));
  check('취소는 예정 일정만 취소로(실시한 것은 그대로) — booking-transitions.ts', readFileSync(join(ROOT, 'lib/org/booking-transitions.ts'), 'utf8').includes("status: 'planned' }, data: { status: 'canceled' }"));
  const appAccess = readFileSync(join(ROOT, 'lib/org/app-access.ts'), 'utf8');
  check('app-access.ts: 코치 판정에 계정 종류(isMasterUser)를 안 쓴다', !appAccess.includes('isMasterUser'));
  check('app-access.ts: 코치 판정은 조직 회원 역할(orgsFor)로', appAccess.includes('orgsFor(user)'));
}


/* 2단계(2026-11-01) — 앱 코치 동작마다 업무 권한. 세 파일의 코치 판정은 모두 coachOrgCan(orgId, '권한') 이고 권한 이름은 표에 있는 것 */
{
  const caps = new Set<string>(ORG_CAPABILITIES);
  for (const f of ['app/actions/app-org.ts', 'app/actions/app-team.ts', 'app/actions/app-lesson.ts']) {
    const src2 = readFileSync(join(ROOT, f), 'utf8');
    const bare = src2.replace(/coachOrgCan\(/g, '').includes('coachOrg(');
    const used = [...src2.matchAll(/(?:coachOrgCan|orgAuthz)\(orgId, '([a-zA-Z.]+)'\)/g)].map((m) => m[1]);
    check(`${f}: 코치 판정은 모두 coachOrgCan(권한)`, !bare && used.length > 0, `bare=${bare} used=${used.length}`);
    check(`${f}: 권한 이름이 표에 있다`, used.every((c) => caps.has(c)), used.filter((c) => !caps.has(c)).join(','));
  }
  /* 쓰기 동작은 읽기 권한으로 열리지 않는다 — 저장 · 확인 · 배정 · 초대는 manage/assign/record */
  const team = readFileSync(join(ROOT, 'app/actions/app-team.ts'), 'utf8');
  for (const [fn, cap] of [['savePlan', 'training.assign'], ['saveActual', 'training.recordForAthlete'], ['confirmTeamWork', 'training.recordForAthlete'], ['loadTeamTraining', 'training.read']] as const)
    check(`app-team ${fn} → ${cap}`, (() => { const body = team.slice(team.indexOf(`export async function ${fn}(`)).split('\nexport ')[0]; return body.includes(`coachOrgCan(orgId, '${cap}')`) || body.includes(`orgAuthz(orgId, '${cap}')`); })());
  const org = readFileSync(join(ROOT, 'app/actions/app-org.ts'), 'utf8');
  check('app-org makeInvite → roster.manage', org.slice(org.indexOf('export async function makeInvite(')).split('\nexport ')[0].includes("coachOrgCan(orgId, 'roster.manage')"));
  check('app-access coachOrgCan 은 hasCapability 로 판정', readFileSync(join(ROOT, 'lib/org/app-access.ts'), 'utf8').includes('hasCapability({ role: r.role }, cap)'));
}


/* 2단계(2026-11-01) — 가입은 덕아웃: 두 주소가 같은 본문, 되돌아갈 주소는 목록에 있는 것만 */
{
  const view = readFileSync(join(ROOT, 'components/org/join-view.tsx'), 'utf8');
  check('참여 본문 하나(components/org/join-view.tsx) — 폼이 back 을 싣는다', view.includes('name="back" value={base}') && view.includes("JOIN_BASES = ['/join', '/teams/join']"));
  check('덕아웃 /teams/join 이 본문을 그리고 로그인 전은 로그인으로', (() => { const p = readFileSync(join(ROOT, 'app/(dugout)/teams/join/page.tsx'), 'utf8'); return p.includes('<JoinView') && p.includes("base=\"/teams/join\"") && p.includes("redirect(`/login?next="); })());
  check('싱커 /join 도 같은 본문(옛 링크 · 앱 호환)', readFileSync(join(ROOT, 'app/(app)/join/page.tsx'), 'utf8').includes('base="/join"'));
  const act = readFileSync(join(ROOT, 'app/actions/org-join.ts'), 'utf8');
  check('joinOrg 는 폼의 back 을 목록(isJoinBase)으로만 믿는다', act.includes("isJoinBase(back) ? back : '/join'") && !act.includes('redirect(String('));
}


/* 2단계(2026-11-01) — 웹 마스터 동작(org-*.ts · lessons.ts 코치 쪽)도 업무 권한: requireOrg → requireOrgCan(권한) */
{
  const caps = new Set<string>(ORG_CAPABILITIES);
  for (const f of ['app/actions/org.ts', 'app/actions/org-calendar.ts', 'app/actions/org-notes.ts', 'app/actions/org-notices.ts', 'app/actions/org-record.ts', 'app/actions/lessons.ts']) {
    const src2 = readFileSync(join(ROOT, f), 'utf8');
    const code = src2.split('\n').filter((l) => !l.trim().startsWith('*') && !l.startsWith('import'));
    const bare = code.some((l) => /\brequireOrg\(/.test(l));
    const used = [...src2.matchAll(/requireOrgCan\(user, [^;]+?, (?:'([a-zA-Z.]+)'|cap)\)/g)].map((m) => m[1] ?? 'cap');
    check(`${f}: 조직 판정은 모두 requireOrgCan(권한)`, !bare && used.length > 0, `bare=${bare} used=${used.length}`);
    check(`${f}: 권한 이름이 표에 있다`, used.every((c) => c === 'cap' || caps.has(c)), used.filter((c) => c !== 'cap' && !caps.has(c)).join(','));
  }
  const notes = readFileSync(join(ROOT, 'app/actions/org-notes.ts'), 'utf8');
  check('org-notes memberOf 가 업무 권한을 받는다', notes.includes('cap: OrgCapability') && notes.includes("memberOf(user, note.memberId, 'lesson.manage')") && notes.includes("'booking.manage')"));
  check('조직 설정(org.manage)은 소유자만 — 코치는 못 바꿈', hasCapability({ role: 'MASTER' }, 'org.manage') && !hasCapability({ role: 'STAFF' }, 'org.manage'));
  const orgAct = readFileSync(join(ROOT, 'app/actions/org.ts'), 'utf8');
  check('org.ts updateOrg → org.manage · createInvite → roster.manage', orgAct.includes("requireOrgCan(user, String(formData.get('orgId') ?? ''), 'org.manage')") && orgAct.includes("'roster.manage')"));
  check('lessons.ts 예약 확정 · 거절 · 끝냄 → booking.manage', (readFileSync(join(ROOT, 'app/actions/lessons.ts'), 'utf8').match(/'booking\.manage'\)/g) ?? []).length === 3);
  check('access.ts requireOrgCan 은 hasCapability 로 판정하고 없으면 notFound', (() => { const a = readFileSync(join(ROOT, 'lib/org/access.ts'), 'utf8'); return a.includes('if (!role || !hasCapability({ role }, cap)) notFound();'); })());
}


/* ───────── 교정(2026-11-01 검토 F01~F08) — 예약 전이 겹침(실제 전이 함수 + 메모리 트랜잭션 · 되돌림) · 위임 규칙 · 소스 ───────── */
{
  type Booking = { id: string; orgId: string; userId: string; status: string; memberId: string | null; eventId: string | null; chosen?: Date; reply?: string | null };
  type Pass = { id: string; total: number; used: number; expiresAt: Date | null };
  type Ev = { id: string; status: string };
  type Mem = { id: string; orgId: string; userId: string; role: 'PLAYER' | 'STAFF' | 'MASTER'; status: 'ACTIVE' | 'LEFT' | 'INVITED'; consent: { memberId: string } | null };
  type Store = { booking: Booking; passes: Pass[]; events: Ev[]; members: Mem[]; seq: number };
  const clone = (s: Store): Store => structuredClone(s);
  /* 메모리 트랜잭션 — 함수가 던지면 되돌린다(실제 DB 처럼). 한 번에 한 트랜잭션만 커밋하지만, 단계마다 await 가 끼어 두 요청이 겹친다 */
  /* 예약 줄의 행 잠금 — 한 트랜잭션이 그 줄을 갱신하면 끝날 때까지 다른 트랜잭션의 갱신은 기다린다(PostgreSQL 의 UPDATE 행 잠금처럼) */
  let rowLock: Promise<void> = Promise.resolve();
  const txOf = (live: Store, mine: { locked: boolean; release?: () => void } = { locked: false }) => {
    /* 줄 서기 — 기다리기 전에 제 차례 약속을 먼저 걸어 둔다(둘이 같은 해제된 약속을 함께 기다려 둘 다 잠그는 일이 없게) */
    const acquire = async () => {
      if (mine.locked) return;
      const prev = rowLock;
      let rel: () => void = () => undefined;
      rowLock = new Promise<void>((r) => (rel = r));
      await prev;
      mine.locked = true;
      mine.release = rel;
    };
    const tx = {
      _mine: mine,
      _acquire: acquire,
      lessonBooking: {
        async updateMany(a: { where: { id: string; status?: string | { in: readonly string[] }; orgId?: string; userId?: string }; data: Record<string, unknown> }) {
          await acquire();
          await Promise.resolve();
          const b = live.booking;
          if (b.id !== a.where.id) return { count: 0 };
          if (a.where.orgId && b.orgId !== a.where.orgId) return { count: 0 };
          if (a.where.userId && b.userId !== a.where.userId) return { count: 0 };
          const st = a.where.status;
          if (typeof st === 'string' && b.status !== st) return { count: 0 };
          if (st && typeof st === 'object' && !st.in.includes(b.status)) return { count: 0 };
          Object.assign(b, a.data);
          return { count: 1 };
        },
        async findUnique() { await Promise.resolve(); return { status: live.booking.status, eventId: live.booking.eventId }; },
      },
      lessonPass: {
        async findMany() { await Promise.resolve(); return live.passes.map((p) => ({ ...p })); },
        async updateMany(a: { where: { id: string; used: { lt: number } }; data: { used: { increment: number } } }) {
          await Promise.resolve();
          const p = live.passes.find((x) => x.id === a.where.id);
          if (!p || !(p.used < a.where.used.lt)) return { count: 0 };
          p.used += a.data.used.increment;
          return { count: 1 };
        },
      },
      orgMember: {
        async findUnique(a: { where: { orgId_userId: { orgId: string; userId: string } } }) { await Promise.resolve(); const m = live.members.find((m) => m.orgId === a.where.orgId_userId.orgId && m.userId === a.where.orgId_userId.userId); return m ? { id: m.id, role: m.role, status: m.status } : null; },
        async updateMany(a: { where: { id: string; orgId: string; userId?: null; status?: string }; data: { userId?: string; role?: Mem['role']; status: 'ACTIVE' } }) {
          await Promise.resolve();
          const m = live.members.find((x) => x.id === a.where.id && x.orgId === a.where.orgId && (a.where.userId !== null || !x.userId) && (!a.where.status || x.status === a.where.status));
          if (!m) return { count: 0 };
          if (a.data.userId) m.userId = a.data.userId;
          if (a.data.role) m.role = a.data.role;
          m.status = a.data.status;
          return { count: 1 };
        },
        async create(a: { data: { orgId: string; userId: string; role: Mem['role'] } }) { await Promise.resolve(); const m: Mem = { id: `m${++live.seq}`, orgId: a.data.orgId, userId: a.data.userId, role: a.data.role, status: 'ACTIVE', consent: null }; live.members.push(m); return { id: m.id }; },
      },
      shareConsent: {
        async findUnique(a: { where: { memberId: string } }) { await Promise.resolve(); const m = live.members.find((x) => x.id === a.where.memberId); return m?.consent ?? null; },
      },
      orgEvent: {
        async create() { await Promise.resolve(); const e = { id: `e${++live.seq}`, status: 'planned' }; live.events.push(e); return { id: e.id }; },
        async updateMany(a: { where: { id: string; status: string }; data: { status: string } }) { await Promise.resolve(); const e = live.events.find((x) => x.id === a.where.id && x.status === a.where.status); if (!e) return { count: 0 }; e.status = a.data.status; return { count: 1 }; },
      },
    };
    return tx;
  };
  /* 트랜잭션처럼 — 던지면 live 를 시작 때로 되돌린다 */
  const transaction = async <T,>(live: Store, fn: (tx: ReturnType<typeof txOf>) => Promise<T>, pre?: ReturnType<typeof txOf>): Promise<T | { threw: true; msg: string }> => {
    const tx = pre ?? txOf(live);
    let snap: Store | null = null;
    const orig = tx.lessonBooking.updateMany;
    /* 되돌림 지점은 잠금을 얻은 순간(다른 트랜잭션이 커밋한 뒤)에 찍는다 */
    tx.lessonBooking.updateMany = async (a) => {
      if (!tx._mine.locked) {
        await tx._acquire();
        snap = clone(live);
      }
      return orig(a);
    };
    try {
      return await fn(tx);
    } catch (e) {
      if (snap) Object.assign(live, snap);
      return { threw: true, msg: e instanceof Error ? e.message : String(e) };
    } finally {
      if (tx._mine.locked) {
        tx._mine.locked = false;
        tx._mine.release?.();
        tx._mine.release = undefined;
      }
    }
  };
  const fresh = (status: string, extra: Partial<Store> = {}): Store => ({
    booking: { id: 'b', orgId: 'o', userId: 'u', status, memberId: null, eventId: null },
    passes: [{ id: 'p', total: 10, used: 0, expiresAt: null }],
    events: [],
    members: [],
    seq: 0,
    ...extra,
  });
  const day = '2026-11-01';
  const confirmA = (live: Store) => transaction(live, (tx) => confirmBookingTx(tx, { bookingId: 'b', orgId: 'o', userId: 'u', nickname: '선수', chosen: new Date(), date: new Date(), time: '10:00', reply: null, createdById: 'coach' }));
  const decline = (live: Store) => transaction(live, (tx) => declineBookingTx(tx, { bookingId: 'b', orgId: 'o', reply: null }));
  const cancel = (live: Store) => transaction(live, (tx) => cancelBookingTx(tx, { bookingId: 'b', userId: 'u' }));
  const finish = (live: Store) => transaction(live, (tx) => finishBookingTx(tx, { bookingId: 'b', orgId: 'o', memberId: live.booking.memberId, lessonDay: day }));
  const won = (r: unknown) => !!r && typeof r === 'object' && (r as { ok?: boolean }).ok === true;

  {
    const live = fresh('REQUESTED');
    const [a, b] = await Promise.all([confirmA(live), confirmA(live)]);
    check('F02 확정/확정 겹침: 하나만 이기고 시간표 줄 하나 · 회원 줄 하나', [a, b].filter(won).length === 1 && live.events.length === 1 && live.members.length === 1 && live.booking.eventId === live.events[0].id, JSON.stringify({ a, b, ev: live.events.length }));
    const again = await confirmA(live);
    check('F02 확정 재시도: already', !won(again) && (again as { reason?: string }).reason === 'already');
  }
  for (const order of ['confirm-first', 'cancel-first'] as const) {
    const live = fresh('REQUESTED');
    const [a, b] = order === 'confirm-first' ? await Promise.all([confirmA(live), cancel(live)]) : await Promise.all([cancel(live), confirmA(live)]);
    const winners = [a, b].filter(won).length;
    /* 행 잠금 아래에선 둘 다 이길 수 있다(확정 뒤 취소 = 정상 차례) — 그때 일정은 하나 · 취소, 아니면 하나만 이기고 상태가 일관 */
    const both = winners === 2 && live.booking.status === 'CANCELED' && live.events.length === 1 && live.events[0].status === 'canceled';
    const one = winners === 1 && (live.booking.status === 'CONFIRMED' ? live.events.length === 1 && live.events[0].status === 'planned' : live.booking.status === 'CANCELED' && live.events.length === 0);
    check(`F01/F02 확정/취소 겹침(${order}): 상태 · 시간표가 일관됨(두 번 만든 일정 없음)`, (both || one) && live.events.length <= 1, JSON.stringify({ a, b, st: live.booking.status, ev: live.events }));
  }
  {
    const live = fresh('REQUESTED');
    const [a, b] = await Promise.all([confirmA(live), decline(live)]);
    check('F02 확정/거절 겹침: 하나만 이김', [a, b].filter(won).length === 1 && ['CONFIRMED', 'DECLINED'].includes(live.booking.status));
  }
  {
    const live = fresh('CONFIRMED', { booking: { id: 'b', orgId: 'o', userId: 'u', status: 'CONFIRMED', memberId: 'm1', eventId: 'e1' }, events: [{ id: 'e1', status: 'planned' }] });
    const [a, b] = await Promise.all([finish(live), finish(live)]);
    check('F01 끝냄/끝냄 겹침: 한 번만 끝내고 수강권 한 회', [a, b].filter(won).length === 1 && live.passes[0].used === 1 && live.booking.status === 'DONE', JSON.stringify({ a, b, used: live.passes[0].used }));
  }
  for (const order of ['finish-first', 'cancel-first'] as const) {
    const live = fresh('CONFIRMED', { booking: { id: 'b', orgId: 'o', userId: 'u', status: 'CONFIRMED', memberId: 'm1', eventId: 'e1' }, events: [{ id: 'e1', status: 'planned' }] });
    const [a, b] = order === 'finish-first' ? await Promise.all([finish(live), cancel(live)]) : await Promise.all([cancel(live), finish(live)]);
    const ok = [a, b].filter(won).length === 1 && ((live.booking.status === 'DONE' && live.passes[0].used === 1 && live.events[0].status === 'planned') || (live.booking.status === 'CANCELED' && live.passes[0].used === 0 && live.events[0].status === 'canceled'));
    check(`F01 끝냄/취소 겹침(${order}): DONE 이면 차감 1 · 일정 그대로, CANCELED 면 차감 0 · 일정 취소 — 둘이 섞이지 않음`, ok, JSON.stringify({ a, b, st: live.booking.status, used: live.passes[0].used, ev: live.events[0] }));
  }
  {
    const live = fresh('CANCELED');
    const r = await confirmA(live);
    check('F02 취소된 예약에 늦게 온 확정: conflict · 되살리지 않음', !won(r) && (r as { reason?: string }).reason === 'conflict' && live.booking.status === 'CANCELED' && live.events.length === 0);
    const live2 = fresh('DONE', { passes: [{ id: 'p', total: 10, used: 1, expiresAt: null }] });
    const c = await cancel(live2);
    check('F01 끝난 예약에 늦게 온 취소: conflict · DONE · 차감 그대로', !won(c) && live2.booking.status === 'DONE' && live2.passes[0].used === 1);
  }
  {
    /* 선점 뒤 실패 — 시간표 만들기가 던지면 선점(CONFIRMED)까지 되돌아간다 */
    const live = fresh('REQUESTED');
    const tx = txOf(live);
    tx.orgEvent.create = async () => { throw new Error('boom'); };
    const r = await transaction(live, (t) => confirmBookingTx(t, { bookingId: 'b', orgId: 'o', userId: 'u', nickname: '선수', chosen: new Date(), date: new Date(), time: null, reply: null, createdById: 'c' }), tx);
    check('F02 선점 뒤 실패: 트랜잭션이 되돌려 REQUESTED 그대로 · 회원 줄 없음', (r as { threw?: boolean }).threw === true && live.booking.status === 'REQUESTED' && live.members.length === 0);
  }
  {
    const live = fresh('CONFIRMED', { booking: { id: 'b', orgId: 'other', userId: 'u', status: 'CONFIRMED', memberId: 'm1', eventId: null } });
    const r = await finish(live);
    check('끝냄: 다른 조직의 예약은 못 끝냄(조직 조건)', !won(r) && live.booking.status === 'CONFIRMED');
    const live2 = fresh('CONFIRMED', { booking: { id: 'b', orgId: 'o', userId: 'someone-else', status: 'CONFIRMED', memberId: null, eventId: null } });
    const c = await cancel(live2);
    check('취소: 남의 예약은 못 취소(주인 조건)', !won(c) && live2.booking.status === 'CONFIRMED');
  }

  /* ───── 2차 검토 G02 · G03(2026-11-01) — 회원 전이 표 · 초대 원자 차지(실제 함수 + 메모리 트랜잭션 · 행 잠금 · 되돌림) ───── */
  {
    type Role = 'PLAYER' | 'STAFF' | 'MASTER';
    type St = 'ACTIVE' | 'LEFT' | 'INVITED';
    /* 효력 — orgsFor · OPERATOR_WHERE · loadMySpaces 가 보는 것과 같은 조건(활동 중 + 소유자/스태프 역할) */
    const operates = (m: { role: Role; status: St } | null) => !!m && m.status === 'ACTIVE' && hasCapability({ role: m.role }, 'roster.manage');
    const plays = (m: { role: Role; status: St } | null) => !!m && m.status === 'ACTIVE' && m.role === 'PLAYER';
    /* 표 전체(기존 역할 × 상태 × 들어오는 자격) */
    const table: Record<string, string> = {};
    for (const role of ['PLAYER', 'STAFF', 'MASTER'] as const)
      for (const status of ['ACTIVE', 'LEFT', 'INVITED'] as const)
        for (const incoming of ['PLAYER', 'STAFF'] as const) {
          const p = planMembership({ id: 'm', role, status }, incoming);
          table[`${role}/${status}+${incoming}`] = p.action === 'reactivate' ? `${p.action}:${p.role}` : p.action;
        }
    check('G02 표: 선수 자격은 나간 코치 · 선수를 선수로만 되살린다(코치 권한 안 되살림)', table['STAFF/LEFT+PLAYER'] === 'reactivate:PLAYER' && table['STAFF/INVITED+PLAYER'] === 'reactivate:PLAYER' && table['PLAYER/LEFT+PLAYER'] === 'reactivate:PLAYER');
    check('G02 표: 활동 중인 코치 · 소유자를 선수로 몰래 내리지 않는다(role_conflict) · 소유자 줄은 바꾸지 않는다', table['STAFF/ACTIVE+PLAYER'] === 'conflict' && table['MASTER/ACTIVE+PLAYER'] === 'conflict' && table['MASTER/LEFT+PLAYER'] === 'conflict' && table['MASTER/LEFT+STAFF'] === 'conflict' && table['MASTER/ACTIVE+STAFF'] === 'none');
    check('G02 표: 코치 임명은 STAFF 코드로만 — 활동 중인 선수 줄엔 못 더함(conflict) · 나간 코치 · 나간 선수는 임명', table['PLAYER/ACTIVE+STAFF'] === 'conflict' && table['STAFF/LEFT+STAFF'] === 'reactivate:STAFF' && table['PLAYER/LEFT+STAFF'] === 'reactivate:STAFF' && table['STAFF/ACTIVE+STAFF'] === 'none' && table['PLAYER/ACTIVE+PLAYER'] === 'none');
    check('G02 표: 줄이 없으면 그 자격으로 새로', planMembership(null, 'PLAYER').action === 'create' && planMembership(null, 'STAFF').action === 'create');
    /* 표의 모든 칸에서 — 선수 자격으로 새로 운영 권한이 생기는 칸이 없다 */
    const gained = Object.entries(table).filter(([k, v]) => k.endsWith('+PLAYER') && v === 'reactivate:STAFF');
    check('G02 표: 선수 자격이 운영 권한을 만드는 칸 0', gained.length === 0, gained.map(([k]) => k).join());

    /* 메모리 트랜잭션 — 초대 · 회원 · 동의. 첫 갱신에서 행 잠금(전역 하나)을 얻고 그때 되돌림 지점을 찍는다. 던지면 되돌린다 */
    type Inv = { id: string; orgId: string; role: Role; memberId: string | null; expiresAt: Date; usedAt: Date | null; usedById: string | null };
    type M = { id: string; orgId: string; userId: string | null; role: Role; status: St; nickname: string };
    type Db = { invites: Inv[]; members: M[]; consents: Record<string, string>; seq: number };
    let lock: Promise<void> = Promise.resolve();
    const dbTx = (live: Db) => {
      let mine = false;
      let release: (() => void) | undefined;
      let snap: Db | null = null;
      const write = async () => {
        if (mine) return;
        const prev = lock;
        let rel: () => void = () => undefined;
        lock = new Promise<void>((r) => (rel = r));
        await prev;
        mine = true;
        release = rel;
        snap = structuredClone(live);
      };
      const tx = {
        orgInvite: {
          async findUnique(a: { where: { id: string } }) { await Promise.resolve(); const i = live.invites.find((x) => x.id === a.where.id); return i ? { ...i } : null; },
          async updateMany(a: { where: { id: string; orgId: string; role: Role; usedAt: null; expiresAt: { gt: Date } }; data: { usedById: string; usedAt: Date } }) {
            await write();
            await Promise.resolve();
            const i = live.invites.find((x) => x.id === a.where.id && x.orgId === a.where.orgId && x.role === a.where.role && x.usedAt === null && x.expiresAt.getTime() > a.where.expiresAt.gt.getTime());
            if (!i) return { count: 0 };
            Object.assign(i, a.data);
            return { count: 1 };
          },
        },
        orgMember: {
          async findUnique(a: { where: { orgId_userId: { orgId: string; userId: string } } }) { await Promise.resolve(); const m = live.members.find((x) => x.orgId === a.where.orgId_userId.orgId && x.userId === a.where.orgId_userId.userId); return m ? { id: m.id, role: m.role, status: m.status } : null; },
          async updateMany(a: { where: { id: string; orgId: string; userId?: null; status?: St }; data: { userId?: string; role?: Role; status: 'ACTIVE' } }) {
            await write();
            await Promise.resolve();
            const m = live.members.find((x) => x.id === a.where.id && x.orgId === a.where.orgId && (a.where.userId !== null || x.userId === null) && (!a.where.status || x.status === a.where.status));
            if (!m) return { count: 0 };
            if (a.data.userId) m.userId = a.data.userId;
            if (a.data.role) m.role = a.data.role;
            m.status = a.data.status;
            return { count: 1 };
          },
          async create(a: { data: { orgId: string; userId: string; role: Role; nickname: string } }) { await write(); const m: M = { id: `m${++live.seq}`, orgId: a.data.orgId, userId: a.data.userId, role: a.data.role, status: 'ACTIVE', nickname: a.data.nickname }; live.members.push(m); return { id: m.id }; },
        },
        shareConsent: {
          async upsert(a: { where: { memberId: string }; create: { byUserId: string } }) { await write(); live.consents[a.where.memberId] = a.create.byUserId; return {}; },
        },
        _rollback: () => { if (snap) Object.assign(live, snap); },
        _end: () => { if (mine) { mine = false; release?.(); } },
      };
      return tx;
    };
    type Out = { ok: true; memberId: string; role: Role; outcome: string } | { ok: false; error: string };
    const redeem = async (live: Db, inviteId: string, user: { id: string; nickname: string }): Promise<Out> => {
      const tx = dbTx(live);
      try {
        const r = await redeemInviteTx(tx, { inviteId, user, consent: consentDefaults(), now: NOW });
        return { ok: true, memberId: r.memberId, role: r.role, outcome: r.outcome };
      } catch (e) {
        tx._rollback();
        return { ok: false, error: e instanceof MembershipConflict ? e.reason : `threw:${e instanceof Error ? e.message : String(e)}` };
      } finally {
        tx._end();
      }
    };
    const NOW = new Date('2026-11-01T03:00:00Z');
    const later = new Date('2026-11-10T00:00:00Z');
    const inv = (role: Role, extra: Partial<Inv> = {}): Inv => ({ id: 'i', orgId: 'o', role, memberId: null, expiresAt: later, usedAt: null, usedById: null, ...extra });
    const db = (invites: Inv[], members: M[] = []): Db => ({ invites, members, consents: {}, seq: 10 });
    const A = { id: 'uA', nickname: 'A' };
    const B = { id: 'uB', nickname: 'B' };
    const memOf = (live: Db, userId: string) => live.members.find((m) => m.userId === userId) ?? null;

    /* G02 재현 — 나간 코치가 선수 코드로 들어오면 코치 권한이 되살아나지 않는다 */
    {
      const live = db([inv('PLAYER')], [{ id: 'm1', orgId: 'o', userId: 'uA', role: 'STAFF', status: 'LEFT', nickname: 'A' }]);
      const r = await redeem(live, 'i', A);
      const m = memOf(live, 'uA');
      check('G02 재현: LEFT STAFF + 선수 코드 → 같은 줄이 ACTIVE PLAYER(재합류) · 운영 효력 없음 · 선수 효력 있음', r.ok && r.outcome === 'rejoined' && r.role === 'PLAYER' && m?.id === 'm1' && m.role === 'PLAYER' && m.status === 'ACTIVE' && !operates(m) && plays(m) && live.members.length === 1, JSON.stringify(r));
      check('G02 재현: 선수 재합류에 공유 동의가 적힌다', live.consents.m1 === 'uA');
    }
    {
      const live = db([inv('PLAYER')], [{ id: 'm1', orgId: 'o', userId: 'uA', role: 'STAFF', status: 'ACTIVE', nickname: 'A' }]);
      const r = await redeem(live, 'i', A);
      const m = memOf(live, 'uA');
      check('G02 활동 중인 코치 + 선수 코드 → role_conflict · 줄 그대로(내리지 않음)', !r.ok && r.error === 'role_conflict' && m?.role === 'STAFF' && m.status === 'ACTIVE' && operates(m));
    }
    {
      const live = db([inv('STAFF')], [{ id: 'm1', orgId: 'o', userId: 'uA', role: 'PLAYER', status: 'ACTIVE', nickname: 'A' }]);
      const r = await redeem(live, 'i', A);
      check('G02 활동 중인 선수 + 코치 코드 → role_conflict · 코드는 안 쓴 채 남음(되돌림)', !r.ok && r.error === 'role_conflict' && live.invites[0].usedAt === null && memOf(live, 'uA')?.role === 'PLAYER');
    }
    {
      const live = db([inv('STAFF')], [{ id: 'm1', orgId: 'o', userId: 'uA', role: 'STAFF', status: 'LEFT', nickname: 'A' }]);
      const r = await redeem(live, 'i', A);
      const m = memOf(live, 'uA');
      check('G02 나간 코치 + 새 STAFF 코드 → 다시 임명(appointed) · 운영 효력 · 동의는 안 적음', r.ok && r.outcome === 'appointed' && operates(m) && live.invites[0].usedById === 'uA' && !('m1' in live.consents));
    }
    {
      const live = db([inv('PLAYER')], [{ id: 'm1', orgId: 'o', userId: 'uA', role: 'MASTER', status: 'LEFT', nickname: 'A' }]);
      const r = await redeem(live, 'i', A);
      check('G02 나간 소유자 줄 + 선수 코드 → role_conflict(소유자 줄은 바꾸지 않음)', !r.ok && r.error === 'role_conflict' && memOf(live, 'uA')?.role === 'MASTER');
    }
    /* 예약 확정의 선수 등록 — 같은 표 */
    {
      const live = fresh('REQUESTED', { members: [{ id: 'm1', orgId: 'o', userId: 'u', role: 'STAFF', status: 'LEFT', consent: null }] });
      const r = await confirmA(live);
      const m = live.members[0];
      check('G02 예약 확정: LEFT STAFF 는 선수로 등록(코치 권한 안 되살림) · 동의 대기', won(r) && m.role === 'PLAYER' && m.status === 'ACTIVE' && !operates(m) && (r as { consentPending?: boolean }).consentPending === true && live.members.length === 1);
      const live2 = fresh('REQUESTED', { members: [{ id: 'm1', orgId: 'o', userId: 'u', role: 'STAFF', status: 'ACTIVE', consent: null }] });
      const r2 = await confirmA(live2);
      check('G02 예약 확정: 활동 중인 코치는 선수로 등록 못 함 — 되돌려 REQUESTED · 시간표 없음 · 줄 그대로', (r2 as { threw?: boolean; msg?: string }).threw === true && (r2 as { msg?: string }).msg === 'membership:role_conflict' && live2.booking.status === 'REQUESTED' && live2.events.length === 0 && live2.members[0].role === 'STAFF');
      const live3 = fresh('REQUESTED', { members: [{ id: 'm1', orgId: 'o', userId: 'u', role: 'PLAYER', status: 'LEFT', consent: { memberId: 'm1' } }] });
      const r3 = await confirmA(live3);
      check('G02 예약 확정: 나간 선수는 재합류 · 동의가 남아 있으면 대기 아님', won(r3) && live3.members[0].status === 'ACTIVE' && (r3 as { consentPending?: boolean }).consentPending === false);
    }
    /* G03 — 한 STAFF 코드를 두 사람이 동시에 */
    {
      const live = db([inv('STAFF')]);
      const [a, b] = await Promise.all([redeem(live, 'i', A), redeem(live, 'i', B)]);
      const winners = [a, b].filter((r) => r.ok);
      const loser = [a, b].find((r) => !r.ok) as { ok: false; error: string } | undefined;
      check('G03 STAFF 코드 겹침: 한 사람만 들어가고 다른 사람은 used · 회원 줄 하나 · usedById 는 이긴 사람', winners.length === 1 && loser?.error === 'used' && live.members.length === 1 && live.invites[0].usedById === live.members[0].userId, JSON.stringify({ a, b }));
      const again = await redeem(live, 'i', live.members[0].userId === 'uA' ? A : B);
      check('G03 같은 사람 재시도(답을 못 받고 다시): already · 제 줄 그대로 · 둘째 줄 없음', again.ok && again.outcome === 'already' && again.memberId === live.members[0].id && live.members.length === 1);
      const other = await redeem(live, 'i', live.members[0].userId === 'uA' ? B : A);
      check('G03 쓴 코드를 다른 사람이: used', !other.ok && other.error === 'used');
    }
    /* G03 — 가입 전 자리 코드를 두 사람이 */
    {
      const live = db([inv('PLAYER', { memberId: 'ph' })], [{ id: 'ph', orgId: 'o', userId: null, role: 'PLAYER', status: 'INVITED', nickname: '자리' }]);
      const [a, b] = await Promise.all([redeem(live, 'i', A), redeem(live, 'i', B)]);
      const w = [a, b].find((r) => r.ok) as { ok: true; memberId: string } | undefined;
      const ph = live.members.find((m) => m.id === 'ph')!;
      check('G03 자리 코드 겹침: 한 사람만 자리를 잇고(userId) 다른 사람은 used · 새 줄 없음', !!w && w.memberId === 'ph' && [a, b].filter((r) => r.ok).length === 1 && ph.userId !== null && ph.status === 'ACTIVE' && live.members.length === 1);
    }
    {
      /* 자리를 남이 이미 이은 뒤(코드는 아직 안 쓴 어긋난 상태) — 덮지 않고 conflict, 코드 차지도 되돌림 */
      const live = db([inv('PLAYER', { memberId: 'ph' })], [{ id: 'ph', orgId: 'o', userId: 'uB', role: 'PLAYER', status: 'ACTIVE', nickname: 'B' }]);
      const r = await redeem(live, 'i', A);
      check('G03 남이 이은 자리는 덮지 않음(conflict) · 코드 차지 되돌림 · 새 줄 없음', !r.ok && r.error === 'conflict' && live.members.find((m) => m.id === 'ph')?.userId === 'uB' && live.invites[0].usedAt === null && live.members.length === 1);
    }
    /* G03 — 기한 · 취소(지움)를 트랜잭션 안에서 다시 본다 */
    {
      const live = db([inv('STAFF', { expiresAt: new Date('2026-11-01T02:59:59Z') })]);
      const r = await redeem(live, 'i', A);
      check('G03 미리보기 뒤 기한이 지난 코드: expired · 아무것도 안 바뀜', !r.ok && r.error === 'expired' && live.members.length === 0 && live.invites[0].usedAt === null);
      const live2 = db([]);
      const r2 = await redeem(live2, 'i', A);
      check('G03 지운(취소한) 코드: expired', !r2.ok && r2.error === 'expired');
    }
    /* G03 — 차지 뒤 실패면 차지까지 되돌림 */
    {
      const live = db([inv('PLAYER', { memberId: 'ph' })], [{ id: 'ph', orgId: 'o', userId: null, role: 'PLAYER', status: 'INVITED', nickname: '자리' }]);
      const tx = dbTx(live);
      tx.shareConsent.upsert = async () => { throw new Error('boom'); };
      let threw = '';
      try { await redeemInviteTx(tx, { inviteId: 'i', user: A, consent: consentDefaults(), now: NOW }); } catch (e) { threw = (e as Error).message; tx._rollback(); } finally { tx._end(); }
      check('G03 차지 뒤 동의 저장 실패: 되돌려 코드 미사용 · 자리 미연결', threw === 'boom' && live.invites[0].usedAt === null && live.members[0].userId === null);
      const again = await redeem(live, 'i', A);
      check('G03 되돌린 뒤 다시 넣으면 들어간다', again.ok && again.memberId === 'ph');
    }
    /* 선수(회원) 코드는 여럿이 쓴다 — 차지하지 않는다 */
    {
      const live = db([inv('PLAYER')]);
      const [a, b] = await Promise.all([redeem(live, 'i', A), redeem(live, 'i', B)]);
      check('선수 코드는 두 사람 다 들어가고 코드는 안 쓴 채', a.ok && b.ok && live.members.length === 2 && live.invites[0].usedAt === null);
    }
    /* 웹 · 앱 두 길이 같은 함수 · 같은 답 글 */
    const joinSrc2 = readFileSync(join(ROOT, 'lib/org/join.ts'), 'utf8');
    const webJoin = readFileSync(join(ROOT, 'app/actions/org-join.ts'), 'utf8');
    const appJoin = readFileSync(join(ROOT, 'app/actions/app-org.ts'), 'utf8');
    check('G02/G03 웹(joinOrg) · 앱(joinOrgApp) 둘 다 joinWithCode → redeemInviteTx(트랜잭션) · 답 글 한 표', webJoin.includes('joinWithCode(user') && appJoin.includes('joinWithCode(user') && appJoin.includes('JOIN_ERROR_TEXT[res.error]') && joinSrc2.includes('prisma.$transaction((tx) => redeemInviteTx(tx'));
    check('G03 웹 마스터 코치 합류(org.ts joinAsStaff) · 가입의 스태프 코드(auth.ts)도 트랜잭션 안 조건부 차지', readFileSync(join(ROOT, 'app/actions/org.ts'), 'utf8').includes('redeemInviteTx(tx, { inviteId: invite.id') && readFileSync(join(ROOT, 'app/actions/auth.ts'), 'utf8').includes("role: 'STAFF', usedAt: null, expiresAt: { gt: now }"));
    check('G02 예약 확정 동작이 role_conflict 를 typed 답으로', readFileSync(join(ROOT, 'app/actions/lessons.ts'), 'utf8').includes('if (e instanceof MembershipConflict) return { ok: false, error: BOOKING_RESULT_TEXT.roleConflict }'));
    check('2차 검토: 끝냄 선점은 빈 갱신(data: {})이 아니라 CONFIRMED→DONE 조건부 갱신에 조직 조건을 같이 건다', !readFileSync(join(ROOT, 'lib/org/booking-transitions.ts'), 'utf8').includes('data: {} }') && readFileSync(join(ROOT, 'lib/org/booking-complete.ts'), 'utf8').includes("...(a.orgId ? { orgId: a.orgId } : {})"));
  }

  /* ───── 2차 검토 G01 — 참여 화면의 미리보기 계약(역할 픽스처) · 코치 수락 흐름 · 링크 ───── */
  {
    const now = new Date('2026-11-01T03:00:00Z');
    const later = new Date('2026-11-10T00:00:00Z');
    const ordinary = { id: 'uA', accountType: 'PLAYER' as const };
    const masterAcc = { id: 'uM', accountType: 'MASTER' as const };
    const staffInv = { role: 'STAFF' as const, memberId: null, expiresAt: later, usedAt: null, usedById: null };
    const playerInv = { role: 'PLAYER' as const, memberId: null, expiresAt: later, usedAt: null, usedById: null };
    const pv = (invite: Parameters<typeof invitePreview>[0]['invite'], mine: Parameters<typeof invitePreview>[0]['mine'], user: Parameters<typeof invitePreview>[0]['user'] = ordinary) => invitePreview({ invite, mine, user, now });
    check('G01 일반 계정 + 유효한 STAFF 코드 → staff 수락 화면(새 임명)', JSON.stringify(pv(staffInv, null)) === '{"state":"staff","rejoin":false}');
    check('G01 일반 계정 + 선수 코드 → player 등록 화면', JSON.stringify(pv(playerInv, null)) === '{"state":"player","rejoin":false}');
    check('G01 활동 중인 선수 + STAFF 코드 → role_conflict(선수)', JSON.stringify(pv(staffInv, { id: 'm', role: 'PLAYER', status: 'ACTIVE' })) === '{"state":"role_conflict","role":"PLAYER"}');
    check('G01 나간 코치 + 선수 코드 → player 재합류(코치 권한 안 돌아옴을 화면이 말함)', JSON.stringify(pv(playerInv, { id: 'm', role: 'STAFF', status: 'LEFT' })) === '{"state":"player","rejoin":true}');
    check('G01 나간 코치 + STAFF 코드 → staff 다시 임명', JSON.stringify(pv(staffInv, { id: 'm', role: 'STAFF', status: 'LEFT' })) === '{"state":"staff","rejoin":true}');
    check('G01 활동 중인 코치 + STAFF 코드 → already(코드 안 씀)', JSON.stringify(pv(staffInv, { id: 'm', role: 'STAFF', status: 'ACTIVE' })) === '{"state":"already","role":"STAFF"}');
    check('G01 남이 쓴 STAFF 코드 → used', pv({ ...staffInv, usedAt: now, usedById: 'uZ' }, null).state === 'used');
    check('G01 내가 쓴 STAFF 코드(답을 못 받고 다시 열면) → already', pv({ ...staffInv, usedAt: now, usedById: 'uA' }, { id: 'm', role: 'STAFF', status: 'ACTIVE' }).state === 'already');
    check('G01 기한 지남 · 없음 · 소유자 코드 → expired', pv({ ...staffInv, expiresAt: now }, null).state === 'expired' && pv(null, null).state === 'expired' && pv({ ...staffInv, role: 'MASTER' }, null).state === 'expired');
    check('G01 마스터 계정 + 선수 코드 → master', pv(playerInv, null, masterAcc).state === 'master');
    check('G01 마스터 계정 + STAFF 코드 → staff(계정 종류로 막지 않음)', pv(staffInv, null, masterAcc).state === 'staff');
    /* 화면 · 동작 소스 — 코치 수락 폼이 실제로 있고 동의 체크박스가 없다, 수락 뒤 관리로 */
    const view = readFileSync(join(ROOT, 'components/org/join-view.tsx'), 'utf8');
    const staffBlock = view.slice(view.indexOf("preview?.state === 'staff' && ("), view.indexOf("preview?.state === 'already' && !joined"));
    check('G01 join-view: 코치 코드에 수락 폼(joinOrg) · 업무 목록 · 동의 체크박스 없음', staffBlock.includes('<SafeForm action={joinOrg}') && staffBlock.includes('STAFF_DUTIES.map') && !staffBlock.includes('scope-') && staffBlock.includes('코치로 들어가기'));
    check('G01 join-view: 선수 코드에만 공유 범위 체크박스', view.slice(view.indexOf("preview?.state === 'player' && ("), view.indexOf("preview?.state === 'staff' && (")).includes("name={`scope-${s.key}`}"));
    check('G01 join-view: usable 을 PLAYER 로 못박지 않는다 · 미리보기는 invitePreview', !view.includes("invite.role === 'PLAYER'") && view.includes('invitePreview({ invite, mine, user, now: realNow() })'));
    check('G01 join-view: 수락 뒤 관리로 가기 · 싱커 공간 새로 받기 안내 · role_conflict 설명', view.includes('href="/manage"') && view.includes('공간 고르개에 생겨요') && view.includes("preview?.state === 'role_conflict'"));
    const act2 = readFileSync(join(ROOT, 'app/actions/org-join.ts'), 'utf8');
    check('G01 joinOrg: 코치면 관리 조직 쿠키를 두고 as=staff 로 돌아온다 · 오류 키 그대로', act2.includes("if (res.role !== 'PLAYER') (await cookies()).set(ORG_COOKIE, res.orgId") && act2.includes('&as=${') && act2.includes('redirect(`${base}?error=${res.error}`)'));
    check('G01 CopyJoinLink 는 덕아웃 /teams/join 으로 · 옛 /join 도 같은 본문', readFileSync(join(ROOT, 'components/master/copy-join-link.tsx'), 'utf8').includes('/teams/join?code=${code}') && readFileSync(join(ROOT, 'app/(app)/join/page.tsx'), 'utf8').includes('<JoinView') && readFileSync(join(ROOT, 'app/(dugout)/teams/join/page.tsx'), 'utf8').includes('<JoinView'));
    check('G01 앱 참여 화면은 서버가 준 자격으로 공간을 연다', readFileSync(join(ROOT, 'native/src/app/org/join.tsx'), 'utf8').includes('spaceKeyOf({ orgId: r.orgId, role: r.role })'));
    check('G01 STAFF 코드 받기에 동의는 안 적힌다(redeemInviteTx)', readFileSync(join(ROOT, 'lib/org/membership-transitions.ts'), 'utf8').includes("if (m.role === 'PLAYER' && m.outcome !== 'already')"));
  }

  /* F04 — 위임 규칙 */
  const owner = { role: 'MASTER' as const };
  check('F04 소유자만 위임 · 위임 밖 업무(org.manage · permission.manage · 회계 · 내보내기)는 못 줌', canGrant(owner, { capability: 'schedule.manage', scope: 'organization' }) && !canGrant(owner, { capability: 'org.manage', scope: 'organization' }) && !canGrant(owner, { capability: 'permission.manage', scope: 'organization' }) && !canGrant(owner, { capability: 'finance.manage', scope: 'organization' }));
  check('F04 검토 재현: permission.manage(self)만 가진 선수는 아무것도 못 줌', !canGrant({ role: 'PLAYER', grants: [{ capability: 'permission.manage', scope: 'self' }] }, { capability: 'org.manage', scope: 'explicit_group', targets: ['x'] }) && !canGrant({ role: 'PLAYER', grants: [{ capability: 'permission.manage', scope: 'self' }] }, { capability: 'schedule.read', scope: 'self' }));
  check('F04 코치(STAFF)는 위임 못 함', !canGrant({ role: 'STAFF' }, { capability: 'schedule.read', scope: 'self' }));
  check('F04 사람 범위에 대상이 비면 못 줌', !canGrant(owner, { capability: 'training.read', scope: 'explicit_group' }) && canGrant(owner, { capability: 'training.read', scope: 'explicit_group', targets: ['m1'] }));
  check('F04 범위는 크기 순서가 아니다 — 자녀 범위가 배정 선수 범위를 품지 않음', !scopeCovers({ scope: 'linked_children', targets: ['a'] }, { scope: 'assigned_players', targets: ['a'] }) && scopeCovers({ scope: 'explicit_group', targets: ['a', 'b'] }, { scope: 'explicit_group', targets: ['b'] }) && !scopeCovers({ scope: 'explicit_group', targets: ['a'] }, { scope: 'explicit_group', targets: ['a', 'c'] }));
  check('F04 deny 줄은 기본 묶음에서 뺀다 · 모르는 역할은 거부', !hasCapability({ role: 'STAFF', grants: [{ capability: 'training.recordForAthlete', scope: 'organization', deny: true }] }, 'training.recordForAthlete') && !hasCapability({ role: 'GUEST' as never }, 'schedule.read'));
  check('F04 위임 대상(targets)이 범위에 실린다', JSON.stringify(capabilityTarget({ role: 'PLAYER', grants: [{ capability: 'training.read', scope: 'explicit_group', targets: ['m1', 'm2'] }] }, 'training.read')) === JSON.stringify({ scope: 'explicit_group', targets: ['m1', 'm2'] }));

  /* 소스 — F03 · F05 · F06 · F07 */
  const joinSrc = readFileSync(join(ROOT, 'lib/org/join.ts'), 'utf8');
  check('F03 join.ts: 스태프 코드를 계정 종류로 막지 않는다', !joinSrc.includes("user.accountType !== 'MASTER'") && joinSrc.includes("invite.role === 'MASTER'"));
  const appOrg = readFileSync(join(ROOT, 'app/actions/app-org.ts'), 'utf8');
  check('F03 loadMySpaces: 코치 조직을 isMasterUser 로 가르지 않는다', !appOrg.includes('isMasterUser'));
  const acc = readFileSync(join(ROOT, 'lib/org/access.ts'), 'utf8');
  check('F03 requireOperator: 조직 소유자 · 스태프 회원도 지난다 · 관계 없으면 /today', acc.includes('export async function requireOperator') && acc.includes("redirect('/today')") && acc.includes("role: { in: ['MASTER', 'STAFF'] }, status: 'ACTIVE'"));
  for (const f of ['app/(master)/layout.tsx', 'app/(master)/manage/page.tsx', 'app/(master)/manage/players/page.tsx', 'app/actions/org.ts', 'app/actions/org-notes.ts', 'app/actions/lessons.ts'])
    check(`F03 ${f}: requireOperator 로`, !/\brequireMaster\(\)/.test(readFileSync(join(ROOT, f), 'utf8')) && readFileSync(join(ROOT, f), 'utf8').includes('requireOperator'));
  check('F03 덕아웃 위 막대 관리 입구는 isOperator', readFileSync(join(ROOT, 'app/(dugout)/layout.tsx'), 'utf8').includes('await isOperator(user)'));
  check('F05 없는 소속을 STAFF 로 짐작하지 않는다(access · app-access)', acc.includes("return m ? (m.role as OrgRole) : null") && readFileSync(join(ROOT, 'lib/org/app-access.ts'), 'utf8').includes("return m ? { role: m.role as OrgRole, memberId: m.id } : null"));
  const ll = readFileSync(join(ROOT, 'lib/market/lesson-load.ts'), 'utf8');
  check('F06 예약 목록에 투구 기록 건수 없음', !ll.includes('pitchLogs') && !ll.includes('records:') && !readFileSync(join(ROOT, 'app/(master)/manage/bookings/page.tsx'), 'utf8').includes('records'));
  const les = readFileSync(join(ROOT, 'app/actions/lessons.ts'), 'utf8');
  check('F07 finishBooking 이 수강권 없는 끝냄을 돌려준다 · 폼이 보인다', les.includes('BOOKING_RESULT_TEXT.finishedNoPass') && readFileSync(join(ROOT, 'components/safe-form.tsx'), 'utf8').includes('result.notice') && !readFileSync(join(ROOT, 'components/master/booking-actions.tsx'), 'utf8').includes('doneToast'));
  check('F01/F02 서버 동작이 전이 함수를 쓴다(확정 · 거절 · 끝냄 · 취소) · 알림은 이긴 뒤', ['confirmBookingTx(tx', 'declineBookingTx(tx', 'finishBookingTx(tx', 'cancelBookingTx(tx'].every((x) => les.includes(x)) && les.indexOf('confirmBookingTx(tx') < les.indexOf("title: '레슨 예약이 확정됐어요'"));
  /* F08 — 앱 잇기 대기열 */
  const ss = readFileSync(join(ROOT, 'native/src/org/space-store.ts'), 'utf8');
  check('F08 → G04 잇기 대기열(~/org/link-queue.ts)을 계정 열쇠로 폰에 두고 소속 확인 뒤 다시 보낸다(flushLinks)', ss.includes('export const linkQueue = new LinkQueue({') && ss.includes('void flushLinks();') && ss.includes('await linkQueue.setOwner(userId);'));
  check('F08 → G04 공간을 바꿔도 기록 귀속은 대기열에 남는다 · 저장 실패를 삼키지 않는다', ss.includes('orgReturn = null; /* 돌아갈 곳만 버린다') && ss.includes('await AsyncStorage.setItem(key, JSON.stringify(value));') && !ss.includes('.catch(() => {})'));
}


/* 교정 F05(2026-11-01) → 2차 검토 G05 — 조회 답 가리기(lib/org/dto-scope.ts): 명단 · 훈련 대상이 **따로**인 주체들 · 회원 없는 합계 · 허용 목록 */
{
  const lensFor = (subject: Parameters<typeof capabilityTarget>[0], selfId: string | null = null) => lensOf((cap) => capabilityTarget(subject, cap), selfId);
  const coach = lensFor({ role: 'STAFF' });
  const owner = lensFor({ role: 'MASTER' });
  const schedulerOnly = lensFor({ role: 'PLAYER', grants: [{ capability: 'schedule.read', scope: 'organization' }, { capability: 'schedule.manage', scope: 'organization' }] });
  const rosterOnly = lensFor({ role: 'PLAYER', grants: [{ capability: 'roster.read', scope: 'organization' }] });
  /* 검토 재현: 명단은 조직 전체 · 훈련은 m1 만 */
  const trainM1 = lensFor({ role: 'PLAYER', grants: [{ capability: 'roster.read', scope: 'organization' }, { capability: 'training.read', scope: 'explicit_group', targets: ['m1'] }] });
  /* 좁은 명단 + 넓은 훈련 */
  const rosterM1 = lensFor({ role: 'PLAYER', grants: [{ capability: 'roster.read', scope: 'explicit_group', targets: ['m1'] }, { capability: 'training.read', scope: 'organization' }] });
  const groupCoach = lensFor({ role: 'PLAYER', grants: [{ capability: 'roster.read', scope: 'explicit_group', targets: ['m1'] }, { capability: 'training.read', scope: 'explicit_group', targets: ['m1'] }] });
  /* 미래의 학부모 — 자녀 둘 + 따로 받은 운영 업무 하나(공지) */
  const guardian = lensFor({ role: 'PLAYER', grants: [{ capability: 'roster.read', scope: 'linked_children', targets: ['m1', 'm2'] }, { capability: 'training.read', scope: 'linked_children', targets: ['m1', 'm2'] }, { capability: 'notice.publish', scope: 'organization' }] });
  /* self 범위 — 실제 회원 줄로 */
  const selfOnly = lensFor({ role: 'PLAYER', grants: [{ capability: 'roster.read', scope: 'self' }, { capability: 'training.read', scope: 'self' }] }, 'm2');
  check('G05 렌즈: 대상 집합이 타입에(캐스트 없음) — 코치 · 소유자는 전부 null', coach.training && coach.members === null && coach.trainingTargets === null && coach.checkinTargets === null && owner.trainingTargets === null);
  check('G05 렌즈: 훈련만 m1 — members null · trainingTargets {m1} · checkin 도 {m1}', trainM1.members === null && trainM1.trainingTargets?.size === 1 && trainM1.checkinTargets?.has('m1') === true);
  check('G05 렌즈: 좁은 명단 + 넓은 훈련 — members {m1} · trainingTargets null', rosterM1.members?.size === 1 && rosterM1.trainingTargets === null);
  check('G05 렌즈: self 는 실제 회원 줄', selfOnly.members?.has('m2') === true && selfOnly.trainingTargets?.has('m2') === true && !lensFor({ role: 'PLAYER', grants: [{ capability: 'roster.read', scope: 'self' }] }, null).members?.size);
  check('F05 렌즈: 일정 담당은 회원 집합 비어 있음 · training 없음', !schedulerOnly.training && schedulerOnly.members?.size === 0);
  check('F05 렌즈: 명단만은 회원 전체 · training 없음', !rosterOnly.training && rosterOnly.members === null);
  check('G05 렌즈: 학부모 — 자녀 둘만 · 공지 업무는 렌즈와 무관', guardian.members?.size === 2 && guardian.trainingTargets?.size === 2 && !guardian.members.has('m3'));

  const ev = (o: Partial<Parameters<typeof redactToday>[0]['events'][number]> & { id: string; memberId: string | null }) => ({ time: null, kind: 'training', title: 't', status: 'planned', memberName: null, ...o });
  const today = {
    events: [ev({ id: 'e1', memberId: null, targets: 3, plans: 2, confirmed: true, recorded: 3, selfRecorded: 1, issues: 1 }), ev({ id: 'e2', memberId: 'm2', memberName: 'b', targets: 1, plans: 1, confirmed: true, recorded: 1 }), ev({ id: 'e3', memberId: 'm1', memberName: 'a', recorded: 1 })],
    briefing: { review: [{ kind: 'work', id: 'e1', memberId: null }, { kind: 'homework', id: 'h', memberId: 'm2' }, { kind: 'homework', id: 'h1', memberId: 'm1' }] },
    alerts: [{ memberId: 'm1', level: 'danger' }, { memberId: 'm2', level: 'caution' }],
    watch: [{ kind: 'attention', memberId: 'm1' }, { kind: 'pending', memberId: 'm2' }, { kind: 'unlinked', memberId: 'm3' }, { kind: 'attention', memberId: 'm2' }],
    counts: { members: 3, pending: 1, placeholders: 1 },
  };
  const t0 = redactToday(today, coach);
  check('F05 오늘: 코치는 그대로 · hidden 없음', t0.hidden.length === 0 && t0.alerts.length === 2 && t0.events[0].recorded === 3 && t0.events[0].targets === 3 && t0.briefing?.review.length === 3);
  check('G05 오늘: 소유자도 그대로', redactToday(today, owner).hidden.length === 0);
  const t1 = redactToday(today, rosterOnly);
  check('F05 오늘: 명단만 — 팔 상태 · 수행 수 · 브리핑 · 주의 살핌은 빠지고 동의 · 연결 대기는 남음 · hidden=training', t1.hidden.includes('training') && t1.alerts.length === 0 && t1.events.every((e) => !('recorded' in e) && !('issues' in e)) && t1.briefing?.review.length === 0 && t1.watch.map((w) => w.kind).join() === 'pending,unlinked' && t1.events[0].targets === 3);
  const t2 = redactToday(today, trainM1);
  check('G05 재현(훈련 m1 만): 팀 합계(recorded · selfRecorded · issues)와 팀 브리핑은 빠지고 m1 것만 · m2 줄은 보이되 수행 없음', !('recorded' in t2.events[0]) && !('issues' in t2.events[0]) && t2.events[1].recorded === undefined && t2.events[2].recorded === 1 && t2.briefing?.review.map((r) => r.id).join() === 'h1' && t2.alerts.map((a) => a.memberId).join() === 'm1' && t2.watch.map((w) => `${w.kind}:${w.memberId}`).join() === 'attention:m1,pending:m2,unlinked:m3' && t2.hidden.includes('training') && t2.events.length === 3 && t2.events[0].targets === 3);
  const t3 = redactToday(today, rosterM1);
  check('G05 좁은 명단 + 넓은 훈련: m2 · m3 줄 · 살핌은 빠지고, 팀 합계 recorded 는 남되 명단 크기 targets 는 빠짐', t3.events.map((e) => e.id).join() === 'e1,e3' && t3.events[0].recorded === 3 && t3.events[0].targets === undefined && t3.hidden.includes('members') && t3.alerts.length === 1 && t3.watch.length === 1);
  const t4 = redactToday(today, groupCoach);
  check('F05 오늘: 묶음 코치 — m2 레슨 일정 · 알림 · 살핌 안 보이고 m1 만, 팀 일정은 보이되 합계 없음', t4.events.map((e) => e.id).join() === 'e1,e3' && t4.alerts.length === 1 && t4.alerts[0].memberId === 'm1' && t4.watch.length === 1 && t4.hidden.includes('members') && !('recorded' in t4.events[0]) && t4.events[0].plans === 2);
  const t5 = redactToday(today, schedulerOnly);
  check('G05 일정 담당: 팀 일정 줄은 보이되(plans · confirmed) 합계 · 명단 크기 · 회원 일정 모두 없음', t5.events.map((e) => e.id).join() === 'e1' && t5.events[0].plans === 2 && t5.events[0].confirmed === true && !('targets' in t5.events[0]) && !('recorded' in t5.events[0]) && t5.alerts.length === 0 && t5.watch.length === 0);
  const t6 = redactToday(today, guardian);
  check('G05 학부모: 자녀 둘의 일정 · 살핌 · 숙제만, 팀 합계 없음, m3 연결 대기 안 보임', t6.events.map((e) => e.id).join() === 'e1,e2,e3' && t6.events[1].recorded === 1 && !('recorded' in t6.events[0]) && t6.watch.map((w) => w.memberId).join() === 'm1,m2,m2' && t6.briefing?.review.map((r) => r.id).join() === 'h,h1');
  /* 허용 목록 — 새로 생긴 민감한 칸은 목록에 없으면 안 나간다 */
  const leaky = { ...today, events: [{ ...today.events[0], secretArmNote: 'x' } as unknown as (typeof today.events)[number]] };
  check('G05 허용 목록: 목록에 없는 칸은 누구에게도 안 나간다(새 민감 칸이 정책을 비켜 가지 않게)', !('secretArmNote' in redactToday(leaky, rosterOnly).events[0]) && !('secretArmNote' in redactToday(leaky, coach).events[0]));

  const rows = [{ memberId: 'm1', nickname: 'a', tags: ['투수'], hasUser: true, consentPending: false, pitchOk: true, arm: { level: 'danger' }, watch: 'attention' as const }, { memberId: 'm2', nickname: 'b', tags: [], hasUser: true, consentPending: true, pitchOk: false, arm: null, watch: 'pending' as const }];
  const r1 = redactMembers(rows, rosterOnly);
  check('F05 명단: 명단만 — 팔 상태 null · 주의 살핌 null · 동의 대기는 남음 · hidden=training', r1.members.length === 2 && r1.members[0].arm === null && r1.members[0].watch === null && r1.members[1].watch === 'pending' && r1.hidden.includes('training') && r1.members[0].tags[0] === '투수');
  const r2 = redactMembers(rows, groupCoach);
  check('F05 명단: 묶음 코치는 m1 만 · hidden=members', r2.members.length === 1 && r2.members[0].memberId === 'm1' && r2.hidden.includes('members'));
  const r3 = redactMembers(rows, schedulerOnly);
  check('F05 명단: 일정 담당은 아무 회원도 못 봄(명단 권한 없음)', r3.members.length === 0 && r3.hidden.includes('members'));
  const r4 = redactMembers(rows, trainM1);
  check('G05 명단: 훈련 m1 만 — m2 는 보이되 팔 상태 · 주의 살핌 없음', r4.members.length === 2 && r4.members[0].arm !== null && r4.members[1].arm === null && r4.members[1].watch === 'pending');

  const detail = {
    members: [
      { memberId: 'm1', nickname: 'a', tags: ['투수'], hasUser: true, canTrain: true, canPitch: true, left: false, outing: { role: 'starter' }, exception: { items: [] }, values: [{ planId: 'p', pitchCount: 20 }], status: 'recorded', reasons: [], held: [], selfSets: 2, sameAsGroup: [], fixes: [{ id: 'f', body: '정정' }], outingNote: '체크인과 다름', pending: true },
      { memberId: 'm2', nickname: 'b', tags: ['야수'], hasUser: true, canTrain: true, canPitch: false, left: false, outing: null, exception: null, values: [{ planId: 'p', pitchCount: 5 }], status: 'recorded', reasons: [], held: [], selfSets: 1, sameAsGroup: [], fixes: [], outingNote: '오늘 체크인 던지는 일정 없음', pending: false },
    ],
    plans: [{ id: 'p', memberIds: ['m1', 'm2'], targets: ['m1', 'm2'], actual: [{ exerciseId: 'x' }], actualLines: [{ name: 'x' }], actualSet: true }],
    others: [{ memberId: 'm3' }],
    tags: ['투수', '야수'],
  };
  const d0 = redactEventDetail(detail, coach);
  check('F05 일정 상세: 코치는 그대로', d0.hidden.length === 0 && d0.members[0].values.length === 1 && d0.plans[0].actualSet === true && d0.members[1].outingNote !== null);
  const d1 = redactEventDetail(detail, schedulerOnly);
  const d1Tags: string[] = d1.tags ?? [];
  check('F05 일정 상세: 일정 담당 — 회원 줄 0 · 조 실제 가림 · hidden 에 training · members', d1.members.length === 0 && d1.plans[0].actualSet === false && d1.plans[0].actual.length === 0 && d1.hidden.includes('training') && d1.hidden.includes('members') && d1.plans[0].memberIds.length === 0 && d1Tags.length === 0);
  const d2 = redactEventDetail(detail, rosterOnly);
  check('F05 일정 상세: 명단만 — 회원 줄은 보이되 수행 값 · 정정 · 체크인 한 줄 · 예외 없음', d2.members.length === 2 && d2.members[0].values.length === 0 && d2.members[0].fixes.length === 0 && d2.members[0].outingNote === null && d2.members[0].exception === null && d2.hidden.includes('checkin') && d2.members[0].outing !== null);
  const d3 = redactEventDetail(detail, groupCoach);
  check('F05 일정 상세: 묶음 코치 — m1 수행 값 그대로 · m2 · m3 안 보임 · 조 대상도 m1 만 · 태그는 보이는 회원 것', d3.members.length === 1 && d3.members[0].values.length === 1 && d3.others.length === 0 && d3.plans[0].targets.join() === 'm1' && (d3.tags ?? []).join() === '투수');
  const d4 = redactEventDetail(detail, trainM1);
  check('G05 재현(훈련 m1 만): m2 의 values 가 비면 outingNote 도 비어야 한다 · 조 실제(팀 값)도 가림', d4.members[1].values.length === 0 && d4.members[1].outingNote === null && d4.members[0].outingNote === '체크인과 다름' && d4.plans[0].actualSet === false && d4.hidden.includes('checkin'));
  const d5 = redactEventDetail(detail, rosterM1);
  check('G05 좁은 명단 + 넓은 훈련: m1 만 보이되 수행 값 그대로 · 조 실제 그대로', d5.members.length === 1 && d5.members[0].values.length === 1 && d5.plans[0].actualSet === true && d5.others.length === 0);
  const leakyDetail = { ...detail, members: [{ ...detail.members[1], hrNote: '심박' } as unknown as (typeof detail.members)[number]] };
  check('G05 허용 목록(상세 · 명단): 목록에 없는 칸은 누구에게도 안 나간다', !('hrNote' in redactEventDetail(leakyDetail, trainM1).members[0]) && !('hrNote' in redactEventDetail(leakyDetail, coach).members[0]) && !('hrNote' in redactMembers([{ ...rows[0], hrNote: 1 } as unknown as (typeof rows)[number]], coach).members[0]));
  const tr = [{ id: 'e', recorded: 3, issues: 1, confirmed: true }];
  check('G05 훈련 탭 합계: 훈련 대상이 조직 전체가 아니면 recorded · issues 칸이 빠진다(0 아님)', !('recorded' in redactTrainingRows(tr, trainM1).rows[0]) && redactTrainingRows(tr, trainM1).hidden.includes('training') && redactTrainingRows(tr, coach).rows[0].recorded === 3);
  check('G05 visibleMembers — 합계는 보이는 회원만', visibleMembers(groupCoach, [{ id: 'm1' }, { id: 'm2' }]).length === 1 && visibleMembers(coach, [{ id: 'm1' }, { id: 'm2' }]).length === 2);
  /* 서버 조회가 렌즈를 쓴다(소스) · 화면은 가린 값을 0 으로 안 그린다 */
  const appOrg2 = readFileSync(join(ROOT, 'app/actions/app-org.ts'), 'utf8');
  check('F05 loadOrgToday · loadOrgMembers 가 orgAuthz + redact 를 쓴다 · 합계는 보이는 회원만', appOrg2.includes("orgAuthz(orgId, 'roster.read')") && appOrg2.includes('return redactToday({') && appOrg2.includes('redactMembers(') && appOrg2.includes('members: visible.length'));
  check('F05 loadEventDetail · loadTeamTraining 이 orgAuthz + redact 를 쓴다', (() => { const t = readFileSync(join(ROOT, 'app/actions/app-team.ts'), 'utf8'); return t.includes("orgAuthz(orgId, 'schedule.read')") && t.includes('return redactEventDetail({') && t.includes("orgAuthz(orgId, 'training.read')") && t.includes('redactTrainingRows('); })());
  check('G05 authz 가 self 를 실제 회원 줄로 푼다', readFileSync(join(ROOT, 'lib/org/authz.ts'), 'utf8').includes('capabilityTarget(subject, cap), c.memberId)'));
  const coachUi = readFileSync(join(ROOT, 'native/src/org/coach.tsx'), 'utf8');
  check('G05 앱 화면: 가린 기록 수를 0 으로 그리지 않는다(비공개) · 가린 종류 한 줄', !coachUi.includes('e.recorded ?? 0') && coachUi.includes("e.recorded == null ? '확인함 · 기록 비공개'") && coachUi.includes("r.recorded == null ? ' · 확인함 · 기록 비공개'") && coachUi.includes('<HiddenNote hidden={data.hidden}') && readFileSync(join(ROOT, 'native/src/app/org/team-event.tsx'), 'utf8').includes('<HiddenNote hidden={d.hidden}'));
}

console.log(
  `\n${pass} 통과${fails.length ? `, ${fails.length} 실패:\n  - ${fails.join('\n  - ')}` : ''}`
);
if (fails.length) process.exit(1);
