/**
 * 커뮤니티 규칙 시험 — 연락처 가리기 · 옛 갈래 맞추기(lib/community.ts). `npm run community:test`
 */
import assert from 'node:assert/strict';
import { CONTACT_MASK as M, maskContacts, normalizeCategory } from '@/lib/community';

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

console.log(`community selftest: ${cases.length + 4} 통과`);
