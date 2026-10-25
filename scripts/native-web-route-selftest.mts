/**
 * 앱 껍데기의 웹 이동 짝짓기(native/src/shell/web-route.ts) 시험 — 늦게 온 옛 알림이 새 선택을 덮지 않는지.
 * 실행: npm run native-web-route:test
 * 실제 웹뷰의 알림 시각 · 폰 터치는 이 시험이 보지 못한다(아이폰에서 확인).
 */
import assert from 'node:assert/strict';
import { createWebRoute, locOf, sameLoc } from '~/shell/web-route';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};

let t = 0;
const clock = () => t;

/* 1. A → B 를 빨리 — A 의 답이 늦게 오면 무시, B 의 답은 반영 */
{
  const r = createWebRoute(clock);
  eq(r.send('/hitting'), true, 'A 보냄');
  eq(r.send('/?dugout=1'), true, 'B 보냄');
  eq(r.arrive(locOf('/hitting')), 'stale', '늦게 온 A 는 무시');
  eq(r.waiting(), true, 'B 는 아직');
  eq(r.arrive({ path: '/', search: 'dugout=1' }), 'apply', 'B 반영');
  eq(r.waiting(), false, '다 받음');
}

/* 2. 같은 곳을 두 번(A → B → A) — 첫 A 의 답과 마지막 A 의 답은 못 가른다. 마지막 목적지로 보고 반영하고, 뒤에 오는 B · A 는 무시
 *    (2026-10-26 2차: 예전엔 첫 A 를 무시해, 웹이 마지막 A 만 알리면 기다림이 남았다 — 12번) */
{
  const r = createWebRoute(clock);
  r.send('/videos');
  r.send('/today');
  r.send('/videos');
  eq(r.arrive(locOf('/videos')), 'apply', '첫 A');
  eq(r.arrive(locOf('/today')), 'stale', 'B');
  eq(r.arrive(locOf('/videos')), 'stale', '마지막 A(이미 그 자리)');
}

/* 3. 사이트가 돌려보냄(잠긴 타격 → 첫 설정) — 기다리는 이동이 하나면 반영 */
{
  const r = createWebRoute(clock);
  r.send('/hitting');
  eq(r.arrive(locOf('/hitting/setup')), 'apply', '돌려보낸 곳 반영');
}

/* 4. 보낸 적 없는 곳(돌려보냄 · 판의 지난 주소)이 이동이 여럿 가는 중에 오면 — 웹이 실제로 보이는 곳을 따른다. 뒤의 이동이 오면 다시 반영
 *    (2026-10-26 2차: 예전엔 무시하고 기다림을 남겨, 마지막 이동이 돌려보내진 경우 4초 뒤 웹과 다른 탭을 칠했다) */
{
  const r = createWebRoute(clock);
  r.send('/hitting');
  r.send('/today');
  eq(r.arrive(locOf('/login')), 'apply', '웹이 보이는 곳');
  eq(r.waiting(), false, '기다림 끝');
  eq(r.arrive(locOf('/today')), 'apply', '새 이동');
}
{
  /* 마지막 이동이 로그인으로 돌려보내짐 — 앞 이동의 답은 끝내 안 옴 */
  const r = createWebRoute(clock);
  r.send('/videos');
  r.send('/community');
  eq(r.arrive(locOf('/login')), 'apply', '로그인 화면을 따른다');
  eq(r.waiting(), false, '기다림이 안 남음');
}

/* 5. 앱이 보내지 않은 웹 안 이동 — 반영 */
{
  const r = createWebRoute(clock);
  eq(r.arrive(locOf('/coach')), 'apply', '웹 안 이동');
  eq(r.arrive(locOf('/community/abc')), 'apply', '또 웹 안 이동');
}

/* 6. 웹이 이미 그 자리 — 기다리지 않음(알림이 안 온다) */
{
  const r = createWebRoute(clock);
  r.arrive(locOf('/training?view=armcare'));
  eq(r.send('/training?view=armcare'), false, '같은 자리');
  eq(r.send('/training?view=mechanics'), true, '? 값이 다르면 기다림');
}

/* 7. ? 값 — 웹이 값을 더 붙여도 같은 곳, 값이 다르면 다른 곳 */
{
  eq(sameLoc({ path: '/training', search: 'sport=pitch&view=home' }, locOf('/training?view=home')), true, '더 붙은 값');
  eq(sameLoc({ path: '/training', search: 'view=last' }, locOf('/training?view=home')), false, '다른 값');
  eq(sameLoc({ path: '/', search: '' }, locOf('/?dugout=1')), false, '덕아웃 표시 없음');
}

/* 8. 알림을 못 받은 이동은 8초 뒤 잊는다 — 그 뒤의 알림은 반영 */
{
  const r = createWebRoute(clock);
  t = 0;
  r.send('/hitting');
  r.send('/today');
  t = 9000;
  eq(r.waiting(), false, '잊음');
  eq(r.arrive(locOf('/hitting')), 'apply', '잊은 뒤 알림은 반영');
  t = 0;
}

/* 9. 다시 불러오기 — 기억을 비운다 */
{
  const r = createWebRoute(clock);
  r.arrive(locOf('/videos'));
  r.send('/today');
  r.reset();
  eq(r.waiting(), false, '비움');
  eq(r.send('/videos'), true, '자리도 잊어 다시 기다림');
}

/* 10. 지금 그 자리인가(더보기가 폴더를 바로 닫을지) — 가는 중인 이동이 있으면 아니다 */
{
  const r = createWebRoute(clock);
  eq(r.at('/videos'), false, '아직 모름');
  r.arrive(locOf('/coach?view=pitch'));
  eq(r.at('/coach?view=pitch'), true, '그 자리');
  eq(r.at('/coach'), true, '? 값 덜 줘도 같은 곳');
  eq(r.at('/community'), false, '다른 곳');
  r.send('/community');
  eq(r.at('/coach?view=pitch'), false, '가는 중');
}

/* 11. (2차) ? 값 없는 요청 다음 ? 값 있는 요청 — 중간 알림 없이 마지막 것만 오면 반영(예전: 앞 요청에 먼저 걸려 stale · 기다림 남음) */
{
  const r = createWebRoute(clock);
  r.send('/videos');
  r.send('/videos?view=log');
  eq(r.arrive({ path: '/videos', search: 'view=log' }), 'apply', '마지막 목적지');
  eq(r.waiting(), false, '기다림 끝');
}
{
  /* 차례가 거꾸로 — ? 값 있는 것을 먼저 보내고 없는 것을 마지막에. 앞 요청의 답은 무시, 마지막 답은 반영 */
  const r = createWebRoute(clock);
  r.send('/videos?view=log');
  r.send('/videos');
  eq(r.arrive({ path: '/videos', search: 'view=log' }), 'stale', '꼭 같은 앞 요청의 답');
  eq(r.waiting(), true, '마지막은 아직');
  eq(r.arrive(locOf('/videos')), 'apply', '마지막 답');
}
{
  /* 웹이 판의 지난 주소로 미끄러짐 — 마지막 요청(? 없음)에 ? 값이 붙어 와도 그 답 */
  const r = createWebRoute(clock);
  r.send('/today');
  r.send('/videos');
  eq(r.arrive({ path: '/videos', search: 'view=log' }), 'apply', '판의 지난 주소');
}

/* 12. (2차) A → B → A 에서 웹이 마지막 A 만 알림 — 반영, 기다림 없음 */
{
  const r = createWebRoute(clock);
  r.send('/today');
  r.send('/hitting');
  r.send('/today');
  eq(r.arrive(locOf('/today')), 'apply', '마지막 A');
  eq(r.waiting(), false, '기다림 끝');
}
{
  /* 같은 차례에서 웹이 셋 다 알림 — 첫 A 를 마지막으로 보고 반영한 뒤, 건너뛴 줄 안 B · A 는 무시(탭 불이 B 로 튀지 않음) */
  const r = createWebRoute(clock);
  r.send('/today');
  r.send('/hitting');
  r.send('/today');
  eq(r.arrive(locOf('/today')), 'apply', '첫 A');
  eq(r.arrive(locOf('/hitting')), 'stale', '늦은 B');
  eq(r.arrive(locOf('/today')), 'stale', '늦은 A');
  /* 건너뛴 것 무시는 잠시만 — 그 뒤 웹 안에서 B 로 옮기면 따른다 */
  t = 3000;
  eq(r.arrive(locOf('/hitting')), 'apply', '2초 뒤 웹 안 이동');
  t = 0;
}

/* 13. (2차) 건너뛴 요청의 늦은 답이 새 이동이 가는 중에 와도 무시 — 새 이동의 기다림은 그대로 */
{
  const r = createWebRoute(clock);
  r.send('/today');
  r.send('/hitting');
  r.send('/today');
  r.arrive(locOf('/today'));
  r.send('/community');
  eq(r.arrive(locOf('/hitting')), 'stale', '건너뛴 B');
  eq(r.waiting(), true, '커뮤니티는 아직');
  eq(r.arrive(locOf('/community')), 'apply', '새 이동');
}

/* 14. (2차) 잠긴 탭 → 첫 설정 · 웹 안 이동은 그대로 반영 */
{
  const r = createWebRoute(clock);
  r.send('/training?view=home');
  eq(r.arrive({ path: '/training', search: 'sport=pitch&view=home' }), 'apply', '웹이 값을 더 붙임');
  r.send('/videos');
  eq(r.arrive(locOf('/videos/setup')), 'apply', '잠금 → 첫 설정');
  eq(r.arrive(locOf('/coach')), 'apply', '웹 안 이동');
}

console.log(`웹 이동 짝짓기 ${n}개 통과`);
