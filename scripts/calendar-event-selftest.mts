/* 홈 캘린더 일정 검사(lib/calendar-event.ts) — npm run calendar:test */
import assert from 'node:assert/strict';
import { cleanEvent, remindAt, sortEvents, timeLabel } from '@/lib/calendar-event';

const T = '2026-10-09';
const ok = (r: ReturnType<typeof cleanEvent>) =>
  r.ok ? r.value : assert.fail(r.error);

assert.deepEqual(
  ok(cleanEvent({ date: '2026-10-20', title: ' 연습 경기 ', time: '', memo: ' ' }, T)),
  {
    date: '2026-10-20',
    title: '연습 경기',
    time: null,
    memo: null,
    remindMin: null,
  }
);
assert.equal(
  ok(cleanEvent({ date: '2026-10-20', title: '병원', time: '09:30' }, T)).time,
  '09:30'
);
assert.equal(cleanEvent({ date: '2026-02-30', title: 'x' }, T).ok, false, '없는 날짜');
assert.equal(cleanEvent({ date: '2040-01-01', title: 'x' }, T).ok, false, '너무 먼 해');
assert.equal(cleanEvent({ date: '2026-10-20', title: '  ' }, T).ok, false, '빈 이름');
assert.equal(
  cleanEvent({ date: '2026-10-20', title: 'x', time: '24:00' }, T).ok,
  false,
  '없는 시각'
);
assert.equal(
  cleanEvent({ date: '2026-10-20', title: 'x'.repeat(41) }, T).ok,
  false,
  '긴 이름'
);

const e = (id: string, time: string | null) => ({
  id,
  date: T,
  title: id,
  time,
  memo: null,
  remindMin: null,
});
assert.deepEqual(
  sortEvents([e('b', '15:00'), e('a', '09:00'), e('c', null)]).map((x) => x.id),
  ['c', 'a', 'b']
);
assert.equal(timeLabel('15:05'), '오후 3:05');
assert.equal(timeLabel('00:30'), '오전 12:30');
assert.equal(timeLabel(null), '하루 종일');
// 알림 — 한국 시각 기준, 하루 종일은 오전 9시
assert.equal(
  remindAt({ date: '2026-10-20', time: '15:00', remindMin: 30 }),
  Date.parse('2026-10-20T14:30:00+09:00')
);
assert.equal(
  remindAt({ date: '2026-10-20', time: null, remindMin: 1440 }),
  Date.parse('2026-10-19T09:00:00+09:00')
);
assert.equal(remindAt({ date: '2026-10-20', time: '15:00', remindMin: null }), null);
assert.equal(
  cleanEvent({ date: '2026-10-20', title: 'x', remindMin: 7 }, T).ok,
  false,
  '없는 알림'
);
assert.equal(
  ok(cleanEvent({ date: '2026-10-20', title: 'x', remindMin: 60 }, T)).remindMin,
  60
);
console.log('일정 시험 통과');
