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
import {
  ATTEND_REPLIES,
  OUTING_CALENDAR_TITLE,
  PITCHING_ROLES,
  cleanPlanMembers,
  eventMemberIds,
  isAttendReply,
  isOutingRole,
  planMemberIds,
  planWork,
  replyCounts,
} from '@/lib/org/team';
import { isOutingTitle } from '@/lib/calendar-event';
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

/* ─────────────────────── 15. 3단계(팀) — 참석 · 훈련 메뉴 · 수행일지 · 등판 계획 · 공지 읽음 ─────────────────────── */

{
  const all = ['a', 'b', 'c'];
  check('팀 일정은 활동 선수 모두', eventMemberIds({ memberId: null }, all).join() === 'a,b,c');
  check('회원 일정은 그 회원만 · 떠났으면 아무도', eventMemberIds({ memberId: 'b' }, all).join() === 'b' && eventMemberIds({ memberId: 'z' }, all).length === 0);
  check('메뉴 대상이 비면 일정의 모두', planMemberIds([], all).join() === 'a,b,c');
  check('메뉴 대상은 아직 일정 대상인 사람만', planMemberIds(['b', 'z'], all).join() === 'b');
  check('대상 거르기 — 모르는 사람 · 겹침 뺌', cleanPlanMembers(['b', 'b', 'z', 3], all).join() === 'b');
  check('모두 고르면 빈 명단(=모두)', cleanPlanMembers(['a', 'b', 'c'], all).length === 0 && cleanPlanMembers('x', all).length === 0);
  const defaults = new Map([
    ['sq', { sets: 3, reps: 8, holdSeconds: null }],
    ['plank', { sets: 2, reps: null, holdSeconds: 30 }],
    ['nosets', { sets: null, reps: 10, holdSeconds: null }],
  ]);
  const work = planWork(
    [
      { items: [{ exerciseId: 'sq', sets: 4, reps: 5 }, { guideId: 'drill' }, { exerciseId: 'plank' }, { exerciseId: 'gone' }] },
      { items: [{ exerciseId: 'sq', sets: 2 }, { exerciseId: 'nosets' }, { exerciseId: 'plank', holdSec: 45, sets: 99 }] },
    ],
    defaults
  );
  check('메뉴대로 — 드릴 · 지운 운동은 뺌, 같은 운동은 앞 메뉴 한 번', work.map((w) => w.exerciseId).join() === 'sq,plank,nosets');
  check('메뉴에 적은 세트 · 횟수가 먼저', work[0].sets.length === 4 && work[0].sets.every((x) => x.reps === 5 && x.holdSeconds == null && x.weightKg == null));
  check('안 적으면 라이브러리 기본(버티기는 초)', work[1].sets.length === 2 && work[1].sets[0].holdSeconds === 30 && work[1].sets[0].reps == null);
  check('세트 수도 없으면 1세트', work[2].sets.length === 1 && work[2].sets[0].reps === 10);
  check('세트는 열 개까지', planWork([{ items: [{ exerciseId: 'sq', sets: 99 }] }], defaults)[0].sets.length === 10);
  check('세트끼리 같은 객체를 안 나눔', work[0].sets[0] !== work[0].sets[1]);
  check('참석 응답 수', JSON.stringify(replyCounts(['yes', 'no', 'yes', null, 'maybe', 'x'])) === '{"yes":2,"no":1,"maybe":1}');
  check('응답 · 역할 거르기', ATTEND_REPLIES.every(isAttendReply) && !isAttendReply('YES') && isOutingRole('standby') && !isOutingRole('closer'));
  check('대기는 다음 등판 재료가 아님', PITCHING_ROLES.join() === 'starter,relief');
  check('엔진이 확정 등판 이름을 등판으로 읽음', isOutingTitle(OUTING_CALENDAR_TITLE));

  /* 'use server' 파일의 내보낸 함수는 누구나 부를 수 있다 — 하나도 빠짐없이 코치(coachOrg) · 선수(myMember) 확인부터 */
  const team = src('app/actions/app-team.ts');
  const fns = [...team.matchAll(/export async function (\w+)\([^]*?\n\}/g)];
  check('app-team 동작이 있다', fns.length >= 12);
  for (const m of fns) check(`app-team.${m[1]} 이 권한부터 본다`, /coachOrg\(|myMember\(/.test(m[0]));
  check('앱 팀 동작이 허용 목록에', src('app/api/rpc/registry.ts').includes("'app-team': appTeam"));
  check('수행일지는 선수 운동 판에 코치 세트로(writeOrgWork)', team.includes('await writeOrgWork({'));
  check('수행일지는 가입 · 트레이닝 공유를 켠 선수만', team.includes('memberScope(p.consent, true).training'));
  check('오지 않은 일정은 수행일지를 못 남김', team.includes("dateKey > toDateKey(appNow())"));
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
      parseOrgOpen('/org/open?org=o1&as=p&to=notes&rec=event.e1')?.rec === undefined &&
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
    check(
      "'메뉴대로'는 선수가 직접 남긴 그날 메뉴 운동이 있으면 멈추고, 'plan-anyway' 만 남김",
      team.includes("const own = mode === 'plan' ? (await ownSetsOn([t.userId], t.dateKey, ids)).length : 0;") &&
        team.includes('return { ok: false, own, error:') &&
        store.includes('enteredById: null, exerciseId: { in: [...exerciseIds] }')
    );
    check('선수 직접 기록은 트레이닝 공유를 켠 선수만 코치에게 보임', team.includes('memberScope(p.consent, true).training);') && team.includes('ownSets: ownOf(p.id, p.userId)'));
    check(
      '일정 지우기 · 취소는 고른 때만 코치 세트를 뺌(기본은 둠)',
      cal.includes("if (formData.get('work') === 'remove') await clearEventWork(ev.id, user.id);") &&
        cal.includes("if (status === 'canceled' && formData.get('work') === 'remove') await clearEventWork(ev.id, user.id);") &&
        store.includes("items: [] });")
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
      team.includes("memberScope(p.consent, true).checkin && out.get(p.id)?.status === 'confirmed'") && team.includes('calendarOutings: [] }).length ?')
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
    ['app/actions/app-team.ts', 'replyEvent'],
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
  check('내 싱커 아래 탭 그대로(홈 · 덕아웃 · 투구 · 타격 · 더보기)', ["label: '홈'", "label: '덕아웃'", "label: '투구'", "label: '타격'", "label: '더보기'"].every((x) => tabBar.includes(x)));
  check('쓰기 화면이 쓰던 글을 알림', ['note', 'homework', 'plan', 'work', 'notice', 'event'].every((n) => src(`native/src/app/org/${n}.tsx`).includes('useDraftGuard(')));
  check('조직에서 연 운동은 그 공간으로 돌아옴', src('native/src/app/workout-done.tsx').includes('consumeOrgReturn()') && src('native/src/org/player.tsx').includes('setOrgReturn(spaceKeyOf(space), tab)'));
}

console.log(
  `\n${pass} 통과${fails.length ? `, ${fails.length} 실패:\n  - ${fails.join('\n  - ')}` : ''}`
);
if (fails.length) process.exit(1);
