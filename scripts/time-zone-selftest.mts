/**
 * 날짜는 기기 시간대 기준(2026-10-28 김민 Q10, lib/time-zone.ts) — 서버가 요청의 기기 시간대로 '오늘'을 세는지, 미국 자정 · 서머타임 전후,
 * 모르면 한국(예전과 같음). npm run time-zone:test
 */
import assert from 'node:assert/strict';
import { toDateKey, shiftDateKey } from '@/lib/pitch-stats';
import { isTimeZone, serviceTimeZone, zonedNoon } from '@/lib/time-zone';

const g = globalThis as { __bpZone?: () => string | null };
const at = (iso: string) => toDateKey(new Date(iso));
const inZone = (zone: string | null, fn: () => void) => {
  const before = g.__bpZone;
  g.__bpZone = () => zone;
  try {
    fn();
  } finally {
    g.__bpZone = before;
  }
};

// 모르면 한국 — 예전 숫자 그대로
inZone(null, () => {
  assert.equal(serviceTimeZone(), 'Asia/Seoul');
  assert.equal(at('2026-10-27T14:59:00Z'), '2026-10-27');
  assert.equal(at('2026-10-27T15:00:00Z'), '2026-10-28');
});

// 미국 동부 — 현지 자정에 날이 바뀐다
inZone('America/New_York', () => {
  assert.equal(at('2026-10-28T03:59:00Z'), '2026-10-27'); // 23:59 EDT
  assert.equal(at('2026-10-28T04:00:00Z'), '2026-10-28'); // 00:00 EDT
  // 서머타임 끝(2026-11-01 02:00 EDT → 01:00 EST)
  assert.equal(at('2026-11-01T03:59:00Z'), '2026-10-31');
  assert.equal(at('2026-11-01T05:30:00Z'), '2026-11-01'); // 01:30 EDT
  assert.equal(at('2026-11-01T06:30:00Z'), '2026-11-01'); // 01:30 EST(두 번째)
  assert.equal(at('2026-11-02T04:59:00Z'), '2026-11-01'); // 23:59 EST
  assert.equal(at('2026-11-02T05:00:00Z'), '2026-11-02'); // 00:00 EST
  // 서머타임 시작(2027-03-14 02:00 EST → 03:00 EDT)
  assert.equal(at('2027-03-14T04:59:00Z'), '2027-03-13');
  assert.equal(at('2027-03-14T05:00:00Z'), '2027-03-14');
  assert.equal(at('2027-03-15T03:59:00Z'), '2027-03-14'); // 23:59 EDT
  assert.equal(at('2027-03-15T04:00:00Z'), '2027-03-15');
  // 그날 정오가 그날로 읽힌다(예전 한국 정오는 미국에서 전날 밤이었다)
  for (const key of ['2026-10-28', '2026-11-01', '2027-03-14']) assert.equal(toDateKey(zonedNoon(key)), key);
  assert.equal(zonedNoon('2026-10-28').toISOString(), '2026-10-28T16:00:00.000Z');
});

// 미국 서부 · 일본
inZone('America/Los_Angeles', () => {
  assert.equal(at('2026-10-28T06:59:00Z'), '2026-10-27');
  assert.equal(at('2026-10-28T07:00:00Z'), '2026-10-28');
});
inZone('Asia/Tokyo', () => {
  assert.equal(at('2026-10-27T15:00:00Z'), '2026-10-28');
  assert.equal(zonedNoon('2026-10-28').toISOString(), '2026-10-28T03:00:00.000Z');
});

// 엉뚱한 값은 거른다(머리글 · 쿠키는 밖에서 온 값)
assert.ok(isTimeZone('America/Chicago'));
for (const v of ['Foo/Bar', '', null, 3, 'x'.repeat(80)]) assert.ok(!isTimeZone(v), String(v));

// 저장된 날짜 키 셈은 시간대와 무관
inZone('America/New_York', () => assert.equal(shiftDateKey('2026-11-01', 1), '2026-11-02'));

console.log('ok');
