/**
 * 커뮤니티 규칙 시험 — 연락처 가리기 · 옛 갈래 맞추기(lib/community.ts). `npm run community:test`
 */
import assert from 'node:assert/strict';
import {
  AUTO_HIDE,
  CONTACT_MASK as M,
  RATE_LIMITS,
  changedFacts,
  gatherState,
  gatherStateLabel,
  headcountText,
  joinBlockReason,
  kstDateTime,
  maskContacts,
  normalizeCategory,
  parseMeetup,
  parseTeam,
  rateLimitError,
  readTeamForm,
  shouldAutoHide,
  teamFlowOf,
} from '@/lib/community';
import { DISTRICTS } from '@/lib/kr-districts';

let extra = 0;
const t = (cond: unknown, label: string) => {
  assert.ok(cond, label);
  extra++;
};

const cases: [string, string][] = [
  ['연락 010-1234-5678 주세요', `연락 ${M} 주세요`],
  ['01012345678', M],
  ['010 1234 5678', M],
  ['+82 10-1234-5678 로', `${M} 로`],
  ['사무실 02-123-4567', `사무실 ${M}`],
  ['카톡 abc_123 으로', `카톡 ${M} 으로`],
  ['카카오톡 아이디: Pitcher.K', `카카오톡 아이디: ${M}`],
  ['kakao id yuno05', `kakao id ${M}`],
  ['https://open.kakao.com/o/sAbC123 들어와요', `${M} 들어와요`],
  /* 잡으면 안 되는 것 */
  ['구속 132km 나왔어요, 3월 24일', '구속 132km 나왔어요, 3월 24일'],
  ['톡 해주세요', '톡 해주세요'],
  ['투구 수 120 · 2026-10-24', '투구 수 120 · 2026-10-24'],
  ['회비 30000원', '회비 30000원'],
];
for (const [input, want] of cases) assert.equal(maskContacts(input), want, input);

assert.equal(normalizeCategory('record'), 'free');
assert.equal(normalizeCategory('tip'), 'free');
assert.equal(normalizeCategory('meetup'), 'meetup');
assert.equal(normalizeCategory('nope'), null);

/* 번개 양식 — 한국 시각으로 읽고, 지난 시각 · 60일 넘음 · 빈 칸을 막는다 */
assert.equal(kstDateTime('2026-10-25T10:00')?.toISOString(), '2026-10-25T01:00:00.000Z');
assert.equal(kstDateTime('2026-10-25'), null);
const now = new Date('2026-10-24T03:00:00Z');
const fields = (o: Record<string, string>) => (k: string) => o[k] ?? '';
const ok = { meetAt: '2026-10-25T10:00', place: '한강 잠원 야구장', region: '서울', capacity: '4', age: 'adult' };
const good = parseMeetup(fields(ok), now);
assert.ok('form' in good && good.form.capacity === 4 && good.form.age === 'adult' && good.form.level === 'any');
assert.ok('error' in parseMeetup(fields({ ...ok, meetAt: '2026-10-24T09:00' }), now)); // 지난 시각(한국 12시보다 앞)
assert.ok('error' in parseMeetup(fields({ ...ok, meetAt: '2027-01-10T10:00' }), now));
assert.ok('error' in parseMeetup(fields({ ...ok, place: ' ' }), now));
assert.ok('error' in parseMeetup(fields({ ...ok, region: '전국(택배)' }), now));
assert.ok('error' in parseMeetup(fields({ ...ok, capacity: '0' }), now));
const all = (o: Record<string, string[]>) => (k: string) => o[k] ?? [];
const team = parseTeam(fields({ region: '경기', team: '수원 블루스' }), all({ days: ['토', '일', '없는날'] }), 'promo', now);
assert.ok('form' in team && team.form.days.join() === '토,일');
assert.ok('error' in parseTeam(fields({}), all({}), 'promo', now));

/* 번개 1명 모집 — 글쓴이를 뺀 인원이라 1명부터, 31명은 넘침 */
const one = parseMeetup(fields({ ...ok, capacity: '1' }), now);
t('form' in one && one.form.capacity === 1, '추가 모집 1명 허용');
t('error' in parseMeetup(fields({ ...ok, capacity: '31' }), now), '31명 막음');
t(headcountText(1, 3) === '1/3명 모집 · 모두 4명', '인원 글자 — 모집 · 모두(글쓴이 포함)');

/* 시 · 군 · 구 — 그 시 · 도의 것만 */
const gn = parseMeetup(fields({ ...ok, district: '강남구' }), now);
t('district' in gn && gn.district === '강남구', '서울 강남구');
t('error' in parseMeetup(fields({ ...ok, district: '수원시' }), now), '서울에 수원시 → 막음');
t(Object.values(DISTRICTS).flat().length > 200 && DISTRICTS['인천'].includes('제물포구') && !DISTRICTS['인천'].includes('중구'), '시 · 군 · 구 표(2026-07 인천 개편)');
t(DISTRICTS['대구'].includes('군위군') && !DISTRICTS['경북'].includes('군위군'), '군위군은 대구');

/* 고치기 — 날짜를 안 바꿨으면 지난 시각이어도 그대로 */
const pastAt = new Date('2026-10-20T01:00:00Z');
const kept = parseMeetup(fields({ ...ok, meetAt: '2026-10-20T10:00' }), now, pastAt);
t('meetAt' in kept && kept.meetAt.getTime() === pastAt.getTime(), '고치기: 지난 날짜 그대로 두기');
t('error' in parseMeetup(fields({ ...ok, meetAt: '2026-10-21T10:00' }), now, pastAt), '고치기: 다른 지난 날짜로는 못 바꿈');

/* 팀 말머리마다 꼭 받는 칸 */
t('error' in parseTeam(fields({ region: '서울' }), all({}), 'recruit', now), '팀원 모집: 포지션 꼭');
const rec = parseTeam(fields({ region: '서울', count: '2', career: '1년 이상', venue: '버려질 칸' }), all({ positions: ['투수', '아무거나'] }), 'recruit', now);
t('form' in rec && rec.form.positions.join() === '투수' && rec.form.count === 2 && rec.form.venue === '', '팀원 모집: 쓰는 칸만 · 안 쓰는 칸은 비움');
t('error' in parseTeam(fields({ region: '서울' }), all({}), 'merc', now), '용병: 경기 날짜 꼭');
const merc = parseTeam(fields({ region: '서울', gameAt: '2026-10-26T09:00', venue: '목동' }), all({}), 'merc', now);
t('meetAt' in merc && merc.meetAt?.toISOString() === '2026-10-26T00:00:00.000Z', '용병: 경기 날짜가 meetAt');
t('error' in parseTeam(fields({ region: '서울' }), all({}), 'seek', now), '팀 구해요: 포지션 꼭');
t(teamFlowOf('seek').apply !== teamFlowOf('recruit').apply && teamFlowOf('seek').who === '제안한 팀', '팀 구해요는 모집과 다른 말 · 다른 방향');
t(teamFlowOf(null).apply === '문의하기', '말머리 없는 옛 글 = 팀 홍보');
const legacy = readTeamForm({ team: '옛 팀', league: '3부', days: ['토'], fee: '3만', ages: '20대' });
t(legacy?.team === '옛 팀' && legacy.positions.length === 0 && legacy.count === 0, '옛 팀 양식도 읽힌다');

/* 모집 상태 — 결과 > 시각 > 마감 > 인원 */
const at = new Date(now.getTime() + 3_600_000);
const base0 = { meetAt: at, closedAt: null, outcome: null, joins: 0, capacity: 2, now };
t(gatherState(base0) === 'open', '모집 중');
t(gatherState({ ...base0, joins: 2 }) === 'full', '다 참');
t(gatherState({ ...base0, closedAt: now }) === 'closed', '마감');
t(gatherState({ ...base0, outcome: 'cancelled', joins: 2 }) === 'cancelled', '취소가 다 참보다 먼저');
t(gatherState({ ...base0, meetAt: new Date(now.getTime() - 1) }) === 'past', '시각 지남 = 결과 기다림');
t(gatherState({ ...base0, meetAt: new Date(now.getTime() - 1), outcome: 'held' }) === 'held', '모였어요');
t(gatherState({ ...base0, capacity: null, joins: 99 }) === 'open', '팀 글은 인원으로 안 닫힌다');
t(gatherStateLabel('past', 'team', 'merc') === '지난 경기' && gatherStateLabel('open', 'team', 'seek') === '팀 찾는 중', '상태 말이 게시판 · 말머리를 따른다');

/* 고치기 알림 — 참가 판단에 닿는 것만 */
const f0 = { meetAt: at, region: '서울', district: '강남구', form: { place: '한강', cost: '', capacity: 3 } };
t(changedFacts(f0, { ...f0 }).length === 0, '그대로면 알림 없음');
t(changedFacts(f0, { ...f0, meetAt: new Date(at.getTime() + 60_000) }).join() === '날짜', '날짜');
t(changedFacts({ ...f0, meetAt: new Date('2026-10-25T01:00:42.123Z') }, { ...f0, meetAt: new Date('2026-10-25T01:00:00Z') }).length === 0, '같은 분이면 날짜 안 바뀐 것(칸은 분까지)');
const keptSec = parseMeetup(fields({ ...ok, meetAt: '2026-10-20T10:00' }), now, new Date('2026-10-20T01:00:37Z'));
t('meetAt' in keptSec && keptSec.meetAt.toISOString() === '2026-10-20T01:00:37.000Z', '고치기: 같은 분이면 원래 시각 그대로');
t(changedFacts(f0, { ...f0, district: '서초구' }).join() === '장소', '장소(구)');
t(changedFacts(f0, { ...f0, form: { ...f0.form, cost: '5,000원', capacity: 5 } }).join() === '비용,인원', '비용 · 인원');

/* 도배 막기 */
t(rateLimitError('comment', RATE_LIMITS.comment.max - 1) === null && rateLimitError('comment', RATE_LIMITS.comment.max), '댓글 빈도 문턱');

/* 자동 임시 가림 기준 */
const oldAcc = new Date(now.getTime() - 30 * 86_400_000);
const r = (n: number, extra2: Partial<{ reporterSince: Date; reporterDismissed: number; createdAt: Date }> = {}) =>
  Array.from({ length: n }, () => ({ createdAt: now, reporterSince: oldAcc, reporterDismissed: 0, ...extra2 }));
const q0 = { now, alreadyHidden: false, authorIsStaff: false, adminReviewed: false };
t(!shouldAutoHide({ ...q0, reports: r(AUTO_HIDE.reporters - 1) }), '문턱 밑');
t(shouldAutoHide({ ...q0, reports: r(AUTO_HIDE.reporters) }), '문턱 = 가림');
t(!shouldAutoHide({ ...q0, reports: r(5, { reporterSince: now }) }), '갓 만든 계정은 안 셈');
t(!shouldAutoHide({ ...q0, reports: r(5, { reporterDismissed: AUTO_HIDE.dismissedLimit }) }), '문제없음 신고를 되풀이한 사람은 안 셈');
t(!shouldAutoHide({ ...q0, reports: r(5, { createdAt: new Date(now.getTime() - 2 * 86_400_000) }) }), '하루 지난 신고는 안 셈');
t(!shouldAutoHide({ ...q0, adminReviewed: true, reports: r(5) }), '운영자가 본 것은 다시 안 가림');
t(!shouldAutoHide({ ...q0, authorIsStaff: true, reports: r(5) }), '운영자 글은 안 가림');

/* 참가 막기 */
const base = { age: 20, adultOnly: false, isAuthor: false, closed: false, full: false, past: false };
assert.equal(joinBlockReason(base), null);
assert.ok(joinBlockReason({ ...base, age: 13 }));
assert.equal(joinBlockReason({ ...base, age: 14 }), null);
assert.ok(joinBlockReason({ ...base, age: 17, adultOnly: true }));
assert.ok(joinBlockReason({ ...base, age: null }));
assert.ok(joinBlockReason({ ...base, full: true }));
assert.ok(joinBlockReason({ ...base, past: true }));
t(joinBlockReason({ ...base, blocked: true }) === '이 글에는 참가할 수 없어요.', '차단 — 누가 막았는지 안 드러냄');
t(/취소/.test(joinBlockReason({ ...base, cancelled: true, full: true }) ?? ''), '취소가 마감보다 먼저');
t(joinBlockReason({ ...base, past: true, word: '지난 경기' }) === '지난 경기예요.', '팀 경기는 지난 경기');

/* 휴대폰 브라우저 — 덕아웃 커뮤니티 · 로그인 · 가입은 열리고, 싱커 화면은 '앱으로 써 주세요'(proxy.ts OPEN, 2026-10-26) */
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');
  const lit = /const OPEN =\s*\/(.+)\/;/.exec(src)?.[1];
  t(lit, 'proxy.ts 의 OPEN 을 읽음');
  const open = new RegExp(lit!);
  t(open.test('/login') && open.test('/login/qr'), '휴대폰: 로그인 · 가입(/login?signup=1) 열림');
  t(open.test('/community/abc') && open.test('/community/guide') && open.test('/me/community') && open.test('/search'), '휴대폰: 커뮤니티 · 내 활동 · 검색 열림');
  t(!open.test('/today') && !open.test('/videos') && !open.test('/training'), '휴대폰: 싱커 화면은 그대로 막힘');
}

console.log(`community selftest: ${cases.length + 25 + extra} 통과`);
