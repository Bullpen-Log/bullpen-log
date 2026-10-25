/**
 * 그날 기록 영상의 재생기 나눔(native/src/pitch/viewport.ts) 시험 — 위치를 잰 횟수 · 재생기 수 · 가까운 순.
 * 실행: npm run native-viewport:test
 * 실제 아이폰의 굴림 · 재생기 만드는 시간은 이 시험이 보지 못한다(재는 것은 부른 횟수뿐이다).
 */
import assert from 'node:assert/strict';
import { createViewport, type CardState } from '~/pitch/viewport';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};

/* 영상 20개 — 카드 높이 420, 사이 20(그날 창의 영상 칸) · 화면 800 */
function setup(count = 20, opts: { maxLive?: number } = {}) {
  const jobs: (() => void)[] = [];
  const vp = createViewport({ maxLive: opts.maxLive, schedule: (f) => void jobs.push(f) });
  const states: CardState[] = [];
  const pins: boolean[] = [];
  const offs: (() => void)[] = [];
  for (let i = 0; i < count; i++) {
    states.push({ live: false, visible: false });
    pins.push(false);
    offs.push(
      vp.register({
        measure: (done) => done({ y: i * 440, h: 420 }),
        set: (s) => (states[i] = s),
        pinned: () => pins[i],
      })
    );
  }
  vp.resize(800);
  const flush = () => {
    while (jobs.length) jobs.shift()!();
  };
  const live = () => states.flatMap((s, i) => (s.live ? [i] : []));
  return { vp, states, pins, offs, flush, live };
}

/* 1. 위치는 붙을 때 한 번 — 굴림 10번에 더 재지 않는다(예전: 굴림마다 모든 카드 = 20 × 10 = 200번) */
{
  const { vp, flush } = setup();
  flush();
  eq(vp.measureCount(), 20, '붙을 때 20번');
  for (let k = 1; k <= 10; k++) vp.scroll(k * 300);
  flush();
  eq(vp.measureCount(), 20, '굴림 10번 뒤에도 20번');
}

/* 2. 재생기는 가까운 순으로 하나씩 — 화면 위아래 한 화면 안(0~3번)만, 한 번에 하나 */
{
  const { live, flush, states } = setup();
  eq(live(), [0], '처음엔 가장 가까운 하나');
  flush();
  eq(live(), [0, 1, 2, 3], '다음 틱마다 하나씩 — 한 화면 밖(4번~)은 안 줌');
  eq(states.flatMap((s, i) => (s.visible ? [i] : [])), [0, 1], '보이는 것은 0 · 1');
}

/* 3. 멀리 굴리면 놓고(두 화면 밖) 새 자리 가까운 것에 준다 — 살아 있는 수는 maxLive 를 넘지 않는다 */
{
  const { vp, live, flush } = setup();
  flush();
  vp.scroll(4400); // 10번 카드가 맨 위
  flush();
  eq(live(), [9, 10, 11, 12], '새 자리에서 가까운 넷(9번은 20 위, 12번은 80 아래)');
  eq(live().includes(0), false, '0번은 놓음');
  eq(live().length <= 4, true, '4개 넘지 않음');
}

/* 4. 전체 화면 · 측정 중(고정)이면 멀어져도 놓지 않는다 */
{
  const { vp, live, flush, pins } = setup();
  flush();
  pins[0] = true;
  vp.update();
  vp.scroll(4400);
  flush();
  eq(live().includes(0), true, '고정은 그대로');
  eq(live().length <= 5, true, '고정 하나 + 4');
}

/* 5. 배치가 바뀌면 다시 재되, 한 틱에 여러 번 불러도 한 번만 */
{
  const { vp, flush } = setup();
  flush();
  for (let k = 0; k < 5; k++) vp.remeasure();
  flush();
  eq(vp.measureCount(), 40, '다시 재기 한 번 = 20');
}

/* 6. 못 재면(안쪽 판이 없음) 화면 안에 있는 것으로 — 영상이 영영 안 뜨지 않게 */
{
  const states: CardState[] = [];
  const vp = createViewport({ schedule: (f) => f() });
  vp.register({ measure: (done) => done(null), set: (s) => states.push(s), pinned: () => false });
  vp.resize(800);
  eq(states.at(-1), { live: true, visible: true }, '못 재도 재생기');
}

/* 7. 빠짐 — 놓은 카드는 더 알리지 않고 그 자리를 다른 카드가 받는다 */
{
  const { offs, live, flush } = setup(6, { maxLive: 2 });
  flush();
  eq(live(), [0, 1], '둘까지');
  offs[0]();
  flush();
  eq(live().includes(0), true, '빠진 카드의 마지막 상태는 그대로(더 안 알림)');
  eq(live().filter((i) => i !== 0), [1, 2], '빈자리를 2번이 받음');
}

console.log(`영상 재생기 나눔 ${n}개 통과`);
