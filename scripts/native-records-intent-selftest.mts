/**
 * 기록 탭 한곳 보기(PITCH-RECORDS-MINIMAL01 R2) 시험 — `node --import ./scripts/native-test-register.mjs scripts/native-records-intent-selftest.mts`.
 * 회귀 위험이 큰 곳만: 다른 탭이 기록 탭을 여는 약속(날짜 · 묶음 · 기록 하나 · 최근)의 거르기와 주소 왕복, 옛 주소(투구 기록 달력 ?view=log ·
 * 그날 투구 읽기 /pitch-log/<날짜>)의 옮김과 입력 채우기 주소는 안 옮김, '최근' 입구의 날, 기록 탭 부탁 통로(판이 붙기 전 · 붙은 뒤 · 두 번 · 로그아웃),
 * 한 줄 글('불펜 · 35구', '근력 · 42분'), 하단 탭 차례(홈 · 코치 · 기록 · 투구 · 트레이닝 · 덕아웃)와 판 15 사이트 탭.
 * 실제 아이폰의 그림 · 손가락 · 판 넘기기는 이 시험이 보지 못한다(폰에서 확인).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RecordItem } from '@/lib/records/day-records';
import { APP_RECORDS_LEVEL, APP_TABS, APP_TABS_V15, RECORDS_HREF } from '@/lib/nav';
import {
  categoryOfRecordId,
  dateOfRecord,
  isDateKey,
  pitchLogIdOf,
  RECORDS_PATH,
  recordsHref,
  recordsIntent,
  recordsIntentOfHref,
  resolveRecentDate,
} from '~/records/intent';
import { rowOf } from '~/records/model';
import { clearTabIntents, openRecordsAt, openTabAt, subscribeRecordsIntent } from '~/shell/tab-intent';

let n = 0;
const ok = (cond: unknown, m: string) => {
  assert.ok(cond, m);
  n++;
};
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UUID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

/* ── 1. 약속 거르기 — 모르는 값은 버리고 화면이 죽지 않게 ── */
{
  eq(recordsIntent(), { date: null, category: 'all', recordId: null, recent: false }, '빈 부탁 = 오늘 · 전체');
  ok(isDateKey('2028-02-29') && !isDateKey('2026-02-30') && !isDateKey('2026-1-05') && !isDateKey(20261105), '날짜 키는 실제 있는 날만');
  eq(recordsIntent({ date: '2026-02-30' }).date, null, '없는 날은 버림(오늘로)');
  eq(recordsIntent({ category: 'nutrition' }).category, 'all', '모르는 묶음은 전체');
  eq(recordsIntent({ recordId: 'pitch:../x' }).recordId, null, '꼴이 틀린 기록 번호는 버림');
  eq(recordsIntent({ recordId: `pitch:${UUID}`, category: 'training' }).recordId, null, '묶음과 다른 종류의 기록은 버림(묶음을 몰래 안 바꿈)');
  eq(recordsIntent({ recordId: 'armcare:2026-11-20', category: 'training' }).recordId, 'armcare:2026-11-20', '암케어는 트레이닝 묶음');
  eq(recordsIntent({ recordId: 'checkin:abc', category: 'all' }).recordId, 'checkin:abc', '전체 묶음은 어느 기록이든');
  eq(recordsIntent({ date: '2026-11-20', recent: true }).recent, false, '날짜를 주면 최근이 아님');
  eq(recordsIntent({ recent: 'yes' }).recent, false, '최근은 true 만');
  eq([categoryOfRecordId(`pitch:${UUID}`), categoryOfRecordId('drill:2026-11-20'), categoryOfRecordId('checkin:x'), categoryOfRecordId('nope:1')], ['pitch', 'training', 'condition', null], '기록 번호 → 묶음');
}

/* ── 2. 주소 왕복 — 탭 콜백 · leaveTo · 푸시가 모두 이 주소를 실어 나른다 ── */
{
  const cases = [
    {},
    { date: '2026-11-25' },
    { date: '2026-11-25', category: 'pitch' as const },
    { date: '2026-11-24', category: 'pitch' as const, recordId: `pitch:${UUID}` },
    { category: 'training' as const, recent: true },
    { date: '2026-11-01', category: 'condition' as const },
  ];
  for (const c of cases) eq(recordsIntentOfHref(recordsHref(c)), recordsIntent(c), `왕복 ${recordsHref(c)}`);
  eq(recordsHref(), RECORDS_PATH, '빈 부탁은 쿼리 없는 /records(탭 누름과 같은 뜻 — 보던 날짜를 안 바꿈)');
  eq(recordsHref({ date: '2026-11-24', category: 'pitch', recordId: `pitch:${UUID}` }), `/records?date=2026-11-24&cat=pitch&id=pitch%3A${UUID}`, '기록 번호는 인코딩');
  eq(recordsIntentOfHref(`/records?id=pitch:${UUID}`)?.recordId, `pitch:${UUID}`, '인코딩 안 한 번호도');
  eq(recordsIntentOfHref('/records?id=%E0%A4%A')?.recordId, null, '깨진 인코딩은 버림');
  eq(recordsIntentOfHref('/records/')?.category, 'all', '끝 / 는 같은 곳');
  eq(recordsIntentOfHref('/records?date=zzz&cat=zzz'), recordsIntent(), '엉터리 쿼리는 오늘 · 전체');
  eq([recordsIntentOfHref('/recordsx'), recordsIntentOfHref('records'), recordsIntentOfHref('https://x.test/records')], [null, null, null], '기록 탭 주소가 아니면 null');
}

/* ── 3. 옛 주소 — 남긴 기록 읽기만 옮기고 입력 · 영상 흐름은 그대로 ── */
{
  eq(recordsIntentOfHref('/videos?view=log'), recordsIntent({ category: 'pitch', recent: true }), '옛 투구 기록 달력 → 최근 투구');
  eq(recordsIntentOfHref('/videos?view=log&date=2026-11-20'), recordsIntent({ category: 'pitch', date: '2026-11-20' }), '날짜를 실은 옛 달력 → 그날 투구');
  eq(recordsIntentOfHref('/pitch-log/2026-11-20'), recordsIntent({ category: 'pitch', date: '2026-11-20' }), '그날 투구 읽기 → 그날 투구');
  eq(recordsIntentOfHref('/pitch-log/2026-02-30'), recordsIntent({ category: 'pitch', recent: true }), '없는 날 투구 읽기 → 최근 투구');
  eq(
    [
      recordsIntentOfHref('/pitch-log/2026-11-20?drill=12&pct=60'),
      recordsIntentOfHref('/videos'),
      recordsIntentOfHref('/videos?view=videos'),
      recordsIntentOfHref('/videos?date=2026-11-20'),
      recordsIntentOfHref('/pitch/2026-11-20'),
      recordsIntentOfHref('/pitch/edit?date=2026-11-20'),
      recordsIntentOfHref('/training/day/2026-11-20'),
    ],
    [null, null, null, null, null, null, null],
    '드릴 공 채우기 · 투구 첫 화면 · 투구 영상 달력 · 그날 투구 화면 · 입력 창 · 운동 기록 화면은 그대로'
  );
}

/* ── 4. '최근' 입구 · 기록 하나 · 투구 번호 ── */
{
  const R = (kind: RecordItem['kind'], id: string, date: string) => ({ kind, id, date }) as Pick<RecordItem, 'kind' | 'id' | 'date'>;
  const items = [R('pitch', `pitch:${UUID}`, '2026-11-18'), R('armcare', 'armcare:2026-11-21', '2026-11-21'), R('checkin', 'checkin:c1', '2026-11-22'), R('pitch', 'pitch:future', '2026-11-30')];
  eq(resolveRecentDate(items, 'pitch', '2026-11-25'), '2026-11-18', '최근 투구 — 앞날 기록은 안 셈');
  eq(resolveRecentDate(items, 'training', '2026-11-25'), '2026-11-21', '트레이닝 묶음에 암케어');
  eq(resolveRecentDate(items, 'all', '2026-11-25'), '2026-11-22', '전체는 가장 최근 아무 기록');
  eq(resolveRecentDate([], 'pitch', '2026-11-25'), '2026-11-25', '기록이 없으면 오늘');
  eq([dateOfRecord(items, 'checkin:c1'), dateOfRecord(items, 'checkin:none')], ['2026-11-22', null], '가리킨 기록의 날');
  eq([pitchLogIdOf(`pitch:${UUID}`), pitchLogIdOf('training:2026-11-20'), pitchLogIdOf('pitch:')], [UUID, null, null], '투구 줄 번호 → 실제 투구 기록 번호');
}

/* ── 5. 기록 탭 부탁 통로 — 판이 붙기 전(차가운 시작) · 붙은 뒤(이미 기록 탭) · 두 번 · 로그아웃 ── */
{
  clearTabIntents();
  const got: unknown[] = [];
  openRecordsAt(recordsIntent({ date: '2026-11-01' }));
  openRecordsAt(recordsIntent({ date: '2026-11-02', category: 'pitch' }));
  const off = subscribeRecordsIntent((i) => got.push(i));
  eq(got, [recordsIntent({ date: '2026-11-02', category: 'pitch' })], '붙기 전 부탁은 마지막 하나만, 붙을 때 한 번');
  const off2 = subscribeRecordsIntent((i) => got.push(['second', i]));
  eq(got.length, 1, '꺼낸 부탁은 다시 안 줌(두 번째 판에 또 안 감)');
  off2();
  openRecordsAt(recordsIntent({ date: '2026-11-03', category: 'training' }));
  eq(got.at(-1), recordsIntent({ date: '2026-11-03', category: 'training' }), '붙어 있으면 바로');
  openTabAt('records', '2026-11-04');
  eq(got.at(-1), recordsIntent({ date: '2026-11-04' }), '옛 날짜 부탁(openTabAt)도 같은 통로 · 전체');
  off();
  openRecordsAt(recordsIntent({ date: '2026-11-05' }));
  clearTabIntents();
  const late: unknown[] = [];
  const off3 = subscribeRecordsIntent((i) => late.push(i));
  eq(late, [], '로그아웃(계정 바뀜) 뒤에는 앞사람 부탁이 안 옴');
  off3();
}

/* ── 6. 한 줄 글 — 작은 묶음 이름 · 제목 · 실제 값 하나(모르면 비움) ── */
{
  const base = { date: '2026-11-25', at: null } as const;
  eq(rowOf({ ...base, kind: 'pitch', id: 'pitch:a', title: '불펜', pitches: 35, rested: false, maxKmh: null, videos: 0, memo: null }), { label: '투구', title: '불펜', metric: '35구' }, '불펜 · 35구');
  eq(rowOf({ ...base, kind: 'pitch', id: 'pitch:b', title: '휴식', pitches: 0, rested: true, maxKmh: null, videos: 0, memo: null }), { label: '투구', title: '휴식', metric: null }, '휴식은 값 없이(0구 아님)');
  eq(rowOf({ ...base, kind: 'training', id: 'training:1', title: '근력', count: 6, minutes: 42, active: false }).metric, '42분', '근력 · 42분');
  eq(rowOf({ ...base, kind: 'training', id: 'training:2', title: '근력', count: 2, minutes: null, active: true }).metric, '진행 중', '하는 중');
  eq(rowOf({ ...base, kind: 'training', id: 'training:3', title: '운동', count: 4, minutes: null, active: false }).metric, '4종목', '시간을 모르면 종목 수');
  eq(rowOf({ ...base, kind: 'training', id: 'training:4', title: '운동', count: 0, minutes: null, active: false }).metric, null, '값이 없으면 비움');
  eq(rowOf({ ...base, kind: 'armcare', id: 'armcare:x', count: 5 }), { label: '트레이닝', title: '암케어', metric: '5동작' }, '암케어 · 5동작');
  eq(rowOf({ ...base, kind: 'drill', id: 'drill:x', count: 3 }), { label: '트레이닝', title: '메커니즘', metric: '드릴 3개' }, '메커니즘 · 드릴 3개');
  eq(rowOf({ ...base, kind: 'checkin', id: 'checkin:x', condition: 7, sleepQuality: null, note: null }), { label: '컨디션', title: '체크인', metric: '7/10' }, '체크인 · 7/10');
}

/* ── 7. 하단 탭 — 기록은 하나, 투구 바로 왼쪽. 사이트(판 15) · 앱 기본 탭이 같은 차례 ── */
{
  const order = ['/today', '/coach', RECORDS_HREF, '/videos', '/training?view=home', '/?dugout=1'];
  eq(APP_TABS_V15.map((t) => t.href), order, '판 15 사이트 탭 차례 — 홈 · 코치 · 기록 · 투구 · 트레이닝 · 덕아웃');
  eq(APP_TABS_V15.map((t) => t.label), ['홈', '코치', '기록', '투구', '트레이닝', '덕아웃'], '이름');
  eq(APP_TABS_V15.filter((t) => t.href === RECORDS_PATH).length, 1, '기록 탭은 하나');
  ok(!APP_TABS.some((t) => t.href === RECORDS_PATH), '판 14 탭은 그대로(기록은 투구 탭 고르개) — 옛 앱 안 바뀜');
  ok(APP_RECORDS_LEVEL === 15, '판 15 부터');
  const shell = readFileSync(path.join(root, 'native/src/shell/tab-bar.tsx'), 'utf8');
  const block = shell.slice(shell.indexOf('export const DEFAULT_TABS'), shell.indexOf('];', shell.indexOf('export const DEFAULT_TABS')));
  eq([...block.matchAll(/href: '([^']+)'/g)].map((m) => m[1]), order, '앱 기본 탭(꺼진 망 · 사이트 답 전)도 같은 차례');
  const site = readFileSync(path.join(root, 'native/src/lib/site.ts'), 'utf8');
  ok(/BullpenNative\/15\b/.test(site), '앱이 판 15 를 알린다(사이트가 새 탭을 보냄)');
  const layout = readFileSync(path.join(root, 'app/(app)/layout.tsx'), 'utf8');
  ok(/level >= APP_RECORDS_LEVEL \? APP_TABS_V15/.test(layout), '사이트는 판 15 이상에만 새 탭');
}

console.log(`native-records-intent: ${n}개 통과`);
