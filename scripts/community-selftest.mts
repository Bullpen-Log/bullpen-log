/**
 * 커뮤니티 규칙 시험 — 연락처 가리기 · 옛 갈래 맞추기(lib/community.ts). `npm run community:test`
 */
import assert from 'node:assert/strict';
import {
  CONTACT_MASK as M,
  joinBlockReason,
  kstDateTime,
  maskContacts,
  normalizeCategory,
  parseMeetup,
  parseTeam,
} from '@/lib/community';

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
assert.ok('error' in parseMeetup(fields({ ...ok, capacity: '1' }), now));
const team = parseTeam(fields({ region: '경기', team: '수원 블루스' }), ['토', '일', '없는날']);
assert.ok('form' in team && team.form.days.join() === '토,일');
assert.ok('error' in parseTeam(fields({}), []));

/* 참가 막기 */
const base = { age: 20, adultOnly: false, isAuthor: false, closed: false, full: false, past: false };
assert.equal(joinBlockReason(base), null);
assert.ok(joinBlockReason({ ...base, age: 13 }));
assert.equal(joinBlockReason({ ...base, age: 14 }), null);
assert.ok(joinBlockReason({ ...base, age: 17, adultOnly: true }));
assert.ok(joinBlockReason({ ...base, age: null }));
assert.ok(joinBlockReason({ ...base, full: true }));
assert.ok(joinBlockReason({ ...base, past: true }));

console.log(`community selftest: ${cases.length + 25} 통과`);
