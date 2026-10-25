/**
 * 움직임 기다리기(native/src/shell/transition.ts) 시험 — 넘어가는 중에는 시간이 지나도 돌지 않고, 끝 · 취소 · 알림 없음 · 끝 알림 잃음을 가른다.
 * 실행: npm run native-transition:test (약 5초 — 끝 알림을 잃은 경우를 실제 시간으로 기다린다)
 * 실제 아이폰의 화면 넘김 알림 차례 · 손가락 속도는 이 시험이 보지 못한다(알림을 흉내 내 부른다).
 */
import assert from 'node:assert/strict';
import { beginMotion, endMotion, noteTransition, stackMoving, whenStill } from '~/shell/transition';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* 1. 넘어가는 중(시작 알림만) — 1.2초가 지나도 돌지 않는다(예전: 1초에 돌았다), 끝 알림이 오면 돈다 */
{
  let ran = 0;
  noteTransition('A', 'start', false);
  whenStill(() => ran++, { grace: 0 });
  await wait(1200);
  eq(ran, 0, '천천히 뒤로 쓰는 중 — 아직');
  noteTransition('A', 'end', false);
  await wait(10);
  eq(ran, 1, '끝나면 돈다');
}

/* 2. 뒤로 쓸다 그만둠 — 취소 알림이면 돈다 */
{
  let ran = 0;
  noteTransition('B', 'start', true);
  whenStill(() => ran++, { grace: 0 });
  await wait(50);
  eq(ran, 0, '쓰는 중');
  noteTransition('B', 'cancel');
  await wait(10);
  eq(ran, 1, '그만두면 돈다');
}

/* 3. 이어지는 넘김 — 앞 것이 끝나도 뒤 것이 가는 중이면 기다린다 */
{
  let ran = 0;
  noteTransition('C', 'start', false);
  whenStill(() => ran++, { grace: 0 });
  noteTransition('D', 'start', false);
  noteTransition('C', 'end', false);
  await wait(30);
  eq(ran, 0, 'D 가 아직');
  noteTransition('D', 'end', false);
  await wait(10);
  eq(ran, 1, '다 끝나면');
}

/* 4. 알림이 하나도 없으면(알림 없는 넘김) grace 뒤에 돈다 */
{
  let ran = 0;
  whenStill(() => ran++, { grace: 60 });
  await wait(20);
  eq(ran, 0, 'grace 안');
  await wait(80);
  eq(ran, 1, 'grace 뒤');
}

/* 5. 앱이 직접 움직이는 것(탭 판 · 더보기)도 같은 표 — 그만두기(돌려준 함수)면 안 돈다 */
{
  let ran = 0;
  beginMotion('pager');
  eq(stackMoving(), true, '판이 미끄러지는 중');
  const stop = whenStill(() => ran++, { grace: 0 });
  stop();
  endMotion('pager');
  await wait(20);
  eq(ran, 0, '빨리 다른 탭으로 — 그만둔 것은 안 돈다');
  eq(stackMoving(), false, '멈춤');
}

/* 6. 끝 알림을 잃은 것(앱 버그)만 4초 뒤 잊는다 */
{
  let ran = 0;
  noteTransition('E', 'start', false);
  whenStill(() => ran++, { grace: 0 });
  await wait(3500);
  eq(ran, 0, '3.5초 — 아직 넘어가는 중으로 본다');
  await wait(700);
  eq(ran, 1, '4초 넘으면 잃은 것으로 보고 돈다');
}

console.log(`움직임 기다리기 ${n}개 통과`);
