/**
 * 싱커 홈 개편(2026-10-27 시안 1 볼 컨트롤 + 새 하단) 시험 — `npm run native-home:test`.
 * 회귀 위험이 큰 규칙만: 입체 공의 돌림 · 비춤(로고 · 실밥이 구면에 붙어 앞쪽만), 주간 보드(월요일 시작 · 기록한 날 수는 날짜 하나에 한 번 · 휴식도 기록 ·
 * 앞날 안 셈 · 달 · 해 넘김), 지금 할 일 차례와 완료 수(운동 일정 없는 날은 분모에서 뺌), 라커 저장(계정마다 · 스티커는 처음 한 번 · 깨진 값),
 * 공 잡기 판정(한 번 던지면 한 번 · 연타 막기 · 거두기).
 * 실제 아이폰의 그림 · 손가락 · 시트는 이 시험이 보지 못한다(폰에서 확인).
 */
import assert from 'node:assert/strict';
import { ballFrame, GRAIN_POINTS, logoRings, rotation, SEAM, START_ROTATION, STITCH, TILT_Z } from '~/home/ball/geometry';
import { MARK_PATH } from '~/shell/mark-path';
import { buildHomeBoard, type HomeBoardInput } from '@/lib/report/home-board';
import { nextAction, pitchCard, todayCount, workoutCard } from '~/home/plan-model';
import { EMPTY_LOCKER, grantFromHome, grantStickers, lockerNow, lockerOwner, parseLocker, recordCatch, setThread } from '~/home/locker-store';
import { ARRIVE, CATCH, START_STATE, TARGET_STEP, canThrow, cancelThrow, judgeCatch, judgeStep, settle, startThrow } from '~/home/catch-rules';
import { loadJson } from '~/lib/store';

let n = 0;
const ok = (cond: unknown, m: string) => {
  assert.ok(cond, m);
  n++;
};
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};

/* ── 1. 입체 공 ── */
{
  const LOGO = logoRings(MARK_PATH);
  eq(LOGO.rings.length, 2, '로고는 고리 둘(S 몸통 · 아래 막대)');
  ok(LOGO.points.length / 3 === LOGO.rings.reduce((a, b) => a + b, 0), '로고 꼭짓점 수 = 고리 길이 합');
  eq(STITCH.length, 2 * 48 * 9, '바늘땀 두 줄 × 48 · 한 땀 세 점');
  for (let i = 0; i < SEAM.length; i += 3) assert.ok(Math.abs(Math.hypot(SEAM[i], SEAM[i + 1], SEAM[i + 2]) - 1.004) < 1e-9);
  n++;
  /* 돌림 행렬은 길이를 지킨다(행렬식 1) */
  const m = rotation(0.7, -1.1, 0.15);
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  ok(Math.abs(det - 1) < 1e-12, '돌림 행렬식 1');
  /* three Ry(90°): 앞(0,0,1) → 오른쪽(1,0,0) */
  const r = rotation(0, Math.PI / 2, 0);
  ok(Math.abs(r[2] - 1) < 1e-12 && Math.abs(r[8]) < 1e-12, 'Ry 90° 면 앞이 오른쪽으로');
  const frame = (rx: number, ry: number, rz = TILT_Z, cx = 100, cy = 100, R = 80) =>
    ballFrame(rx, ry, rz, cx, cy, R, SEAM, STITCH, GRAIN_POINTS, LOGO.points, LOGO.rings);
  const f0 = frame(START_ROTATION.rx, START_ROTATION.ry);
  ok(f0.logo.length > 0 && f0.logoOpacity > 0.9, '처음 돌림이면 로고가 앞에 또렷이');
  ok(f0.near.length > 0 && f0.seam.length > 0, '처음 돌림이면 실밥이 보임');
  const back = frame(0, Math.PI, 0);
  eq([back.logo, back.logoOpacity], ['', 0], '반 바퀴 돌면 로고는 뒤로 숨는다(그리지 않음)');
  /* 비춘 점은 모두 공 둘레(반지름 × 1.03) 안 */
  const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pts = nums(f0.near + f0.mid + f0.far + f0.seam + f0.logo);
  let inside = true;
  for (let i = 0; i + 1 < pts.length; i += 2) if (Math.hypot(pts[i] - 100, pts[i + 1] - 100) > 80 * 1.03) inside = false;
  ok(inside, '그린 점은 모두 공 안(뒤쪽 점을 비추지 않음)');
  /* 옆으로 돌면 로고가 원근대로 좁아진다(평면 그림 돌리기가 아님) */
  const widthOf = (ry: number) => {
    const xs = nums(frame(0, ry, 0, 0, 0, 100).logo).filter((_, i) => i % 2 === 0);
    return Math.max(...xs) - Math.min(...xs);
  };
  ok(widthOf(1.1) < widthOf(0) * 0.6, '옆으로 돌린 로고는 가로가 줄어든다');
  const t = performance.now();
  for (let i = 0; i < 300; i++) frame(0.25, i * 0.05, TILT_Z, 120, 120, 100);
  const per = (performance.now() - t) / 300;
  console.log(`  (참고) 한 장면 계산 ${per.toFixed(3)}ms — node 기준, 폰 UI 스레드와 다름`);
  ok(per < 4, '한 장면 계산이 4ms 안(node)');
}

/* ── 2. 주간 보드 ── */
const base: HomeBoardInput = {
  today: '2026-10-27',
  pitchDays: {},
  olderLastLog: null,
  velocityByDay: {},
  bestBefore: null,
  bestBeforeDate: null,
  conditionByDay: {},
  checkinDays: [],
  workoutDays: [],
  load: { zone: null, ratio: null },
};
{
  const empty = buildHomeBoard(base);
  eq(empty.weekStart, '2026-10-26', '화요일이면 그 주 월요일부터');
  eq(
    empty.week.map((d) => d.date),
    ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'],
    '일곱 칸 · 달 넘김'
  );
  eq([empty.weekDays, empty.lastPitch, empty.bestVelocity, empty.load, empty.condition], [0, null, null, null, null], '기록 없는 새 사용자는 0 · 없음(지어낸 값 없음)');
  const b = buildHomeBoard({
    ...base,
    pitchDays: { '2026-10-26': { pitches: 0, rest: true }, '2026-10-27': { pitches: 42, rest: false }, '2026-10-28': { pitches: 30, rest: false } },
    checkinDays: ['2026-10-27', '2026-10-27', '2026-10-29'],
    workoutDays: ['2026-10-27'],
    conditionByDay: { '2026-10-27': 7 },
    velocityByDay: { '2026-10-20': 121.4, '2026-10-24': 124.2, '2026-10-28': 130 },
  });
  eq(b.weekDays, 2, '오늘 셋을 남겨도 1일 · 쉰 날도 기록 · 앞날(10-28 · 10-29)은 안 셈');
  eq(b.week[0].pitch, 'rest', '쉰 날 줄만 있으면 휴식');
  eq([b.week[2].pitch, b.week[3].checkin], [null, false], '앞날 칸은 비어 있음');
  eq(b.lastPitch, { date: '2026-10-27', pitches: 42, rested: false }, '마지막 투구 기록 = 오늘 42구(앞날 줄은 안 봄)');
  eq(b.bestVelocity, { kmh: 124.2, date: '2026-10-24', scope: 'recent' }, '최근 6주 최고 · 앞날 값은 안 봄');
  eq(b.condition, { value: 7, label: '보통' }, '컨디션 이름은 체크인 흐름과 같은 5단계');
  const all = buildHomeBoard({ ...base, bestBefore: 118, bestBeforeDate: '2026-08-01' });
  eq(all.bestVelocity, { kmh: 118, date: '2026-08-01', scope: 'all' }, '6주 안에 없으면 그 전 최고 · 제목은 전체');
  const old = buildHomeBoard({ ...base, olderLastLog: { date: '2026-07-01', pitches: 0, rest: true } });
  eq(old.lastPitch, { date: '2026-07-01', pitches: 0, rested: true }, '6주 넘게 비면 그 전 마지막 기록');
  const load = buildHomeBoard({ ...base, load: { zone: 'optimal', ratio: 1.05, chronic: 400, acute: 420 } });
  ok(load.load?.ratio === 1.05 && load.load.level === 'safe' && load.load.label.length > 0, '부하는 서버 판정(loadSignalOf)의 이름으로');
  eq(buildHomeBoard({ ...base, today: '2026-11-01' }).weekStart, '2026-10-26', '일요일이면 그 주(지난 월요일부터)');
  const ny = buildHomeBoard({ ...base, today: '2027-01-01' });
  eq([ny.weekStart, ny.week[6].date], ['2026-12-28', '2027-01-03'], '해 넘김');
}

/* ── 3. 지금 할 일 · 오늘 플랜 ── */
{
  const rings = (training: { value: number; none?: boolean }) => [
    { key: 'checkin' as const, label: '체크인', value: 1, caption: '' },
    { key: 'pitch' as const, label: '투구', value: 1, caption: '' },
    { key: 'training' as const, label: '운동', value: training.value, caption: '', ...(training.none ? { none: true } : {}) },
  ];
  const w = { label: '하체', done: 0, total: 5, minutes: 18, leftMinutes: 18, checkin: 'before' as const };
  const h = { checkinDone: false, pitchDone: false, pitchLocked: false, recovering: false, painWords: null, rings: rings({ value: 0 }), workout: w };
  eq(nextAction({ ...h, painWords: ['아파'] }).key, 'painCheck', '메모에 통증 말이 있으면 확인이 먼저');
  eq(nextAction(h).key, 'checkin', '체크인 전');
  eq(nextAction({ ...h, checkinDone: true }).key, 'pitch', '체크인 뒤 투구');
  eq(nextAction({ ...h, checkinDone: true, pitchLocked: true }).key, 'pitchSetup', '투구가 잠기면 첫 설정');
  const work = nextAction({ ...h, checkinDone: true, pitchDone: true, recovering: true });
  eq([work.key, work.title], ['workout', '오늘 회복 운동'], '회복 날의 운동');
  eq(nextAction({ ...h, checkinDone: true, pitchDone: true, workout: { ...w, done: 5 }, rings: rings({ value: 1 }) }).key, 'done', '다 함');
  const noPlan = nextAction({ ...h, checkinDone: true, pitchDone: true, workout: null, rings: rings({ value: 0, none: true }) });
  eq([noPlan.key, noPlan.sub], ['done', '체크인 · 투구'], '운동 일정 없는 날은 둘만으로 다 함');
  eq(todayCount({ rings: rings({ value: 0, none: true }) }), { done: 2, total: 2 }, '일정 없는 운동은 분모에서 뺌');
  eq(todayCount({ rings: rings({ value: 0.4 }) }), { done: 2, total: 3 }, '반쯤 한 운동은 안 셈');
  eq(workoutCard(null, false).value, '일정 없음', '일정 없으면 가짜 0/5 대신 일정 없음');
  eq(workoutCard(w, false).meta, '저장된 운동 · 체크인 반영 전', '체크인 전에 만든 운동');
  eq(workoutCard({ ...w, checkin: 'applied' }, false).meta, '예상 18분 · 체크인 반영', '체크인을 본 운동만 반영이라 말함');
  ok(workoutCard({ ...w, checkin: 'changed' }, false).meta.includes('바뀌었어요'), '체크인 뒤 상태가 바뀐 운동');
  eq(workoutCard({ ...w, done: 2 }, false).state, 'doing', '하는 중');
  eq(workoutCard(w, true).state, 'locked', '트레이닝이 잠기면 설정으로');
  const board = buildHomeBoard({ ...base, pitchDays: { '2026-10-27': { pitches: 0, rest: true } } });
  eq(pitchCard({ pitchDone: true, pitchLocked: false, board, today: '2026-10-27' }).value, '휴식', '쉰 날은 휴식으로');
  eq(pitchCard({ pitchDone: false, pitchLocked: false, board, today: '2026-10-27' }).value, '기록 전', '기록 전');
}

/* ── 4. 라커 저장 ── */
{
  eq(parseLocker(null), EMPTY_LOCKER, '없으면 빈 라커');
  eq(parseLocker({ v: 2, thread: 1 }), EMPTY_LOCKER, '다른 판이면 빈 라커');
  eq(
    parseLocker({ v: 1, thread: 9, catches: -3, stickers: { checkin: '2026-10-27', pitch: 'x', bogus: '2026-10-27' } }),
    { v: 1, thread: 0, catches: 0, stickers: { checkin: '2026-10-27' } },
    '깨진 칸만 기본값'
  );
  const g1 = grantStickers(EMPTY_LOCKER, { checkin: true, pitch: false }, '2026-10-27');
  eq(g1.gained, ['checkin'], '처음이면 받음');
  const g2 = grantStickers(g1.next, { checkin: true }, '2026-10-28');
  eq([g2.gained, g2.next.stickers.checkin], [[], '2026-10-27'], '다음 날 같은 사실이 와도 다시 안 줌 · 처음 받은 날 유지');

  await lockerOwner('userA');
  ok(lockerNow().ready && lockerNow().owner === 'userA', 'A 의 라커를 읽음');
  setThread(2);
  eq(await grantFromHome({ checkin: true, pitch: true }, '2026-10-27'), ['checkin', 'pitch'], '홈 사실로 처음 받음');
  eq(await grantFromHome({ checkin: true, pitch: true }, '2026-10-27'), [], '같은 홈을 다시 받아도 또 안 줌');
  eq(recordCatch('2026-10-27'), ['catch'], '처음 잡으면 캐치 스티커');
  eq(recordCatch('2026-10-27'), [], '두 번째부터는 캐치 수만');
  eq(lockerNow().locker.catches, 2, '캐치 2번');
  const saved = parseLocker(await loadJson('bullpen-locker:v1:userA'));
  eq([saved.thread, saved.catches, Object.keys(saved.stickers).sort()], [2, 2, ['catch', 'checkin', 'pitch']], '폰에 남음(앱을 다시 켜도)');
  await lockerOwner('userB');
  eq([lockerNow().locker.thread, lockerNow().locker.catches, Object.keys(lockerNow().locker.stickers).length], [0, 0, 0], '다른 계정에는 앞사람 라커가 안 보임');
  const switching = lockerOwner('userA');
  ok(!lockerNow().ready && lockerNow().locker.thread === 0, '바꾸는 동안 빈 라커(앞사람 것이 한 장면도 안 비침)');
  await switching;
  eq(lockerNow().locker.thread, 2, 'A 로 돌아오면 A 의 라커');
  await lockerOwner(null);
  eq(await grantFromHome({ checkin: true }, '2026-10-27'), [], '로그아웃이면 아무것도 안 줌');
}

/* ── 5. 공 잡기 ── */
{
  ok(Math.abs(ARRIVE - 0.8125) < 1e-12, '과녁에 닿는 진행 0.8125');
  eq([judgeCatch(0.5), judgeCatch(ARRIVE), judgeCatch(ARRIVE + CATCH.window), judgeCatch(0.99)], ['early', 'catch', 'catch', 'late'], '닿는 순간 앞뒤만 잡힘');
  const s1 = startThrow(START_STATE, 1000);
  eq(s1.phase, 'flying', '던짐');
  const s2 = settle(s1, s1.throwId, 'catch', 1500);
  ok(settle(s2, s1.throwId, 'catch', 1510) === s2, '한 번 던지면 한 번만 판정(연타로 점수 안 오름)');
  ok(!canThrow(s2, 1600) && canThrow(s2, 1500 + CATCH.cooldownMs), '결과 뒤 0.35초는 다시 던지기 무시');
  eq(settle(startThrow(s2, 3000), s1.throwId, 'catch', 3100).phase, 'flying', '지난 공의 늦은 판정은 새 공에 안 들어감');
  eq(cancelThrow(s1).phase, 'idle', '닫기 · 뒤로 가면 날던 공은 점수 없이 거둠');
  eq([TARGET_STEP, judgeStep(TARGET_STEP - 1), judgeStep(TARGET_STEP), judgeStep(TARGET_STEP + 1)], [5, 'early', 'catch', 'late'], '움직임 줄이기: 과녁 칸만 잡힘');
}

console.log(`native-home: ${n}개 통과`);
