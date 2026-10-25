/**
 * 같은 읽기 합치기(native/src/lib/read-share.ts — lib/rpc.ts 가 읽기마다 씀) 시험. 실행: npm run native-read-share:test
 */
import assert from 'node:assert/strict';
import { createReadShare } from '~/lib/read-share';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
let calls = 0;
const later = <T,>(v: T) => () => {
  calls++;
  return new Promise<T>((r) => setTimeout(() => r(v), 5));
};

/* 1. 겹친 같은 읽기는 한 번 — 돌아옴 · 탭 보임 · 앱이 앞에 옴이 한꺼번에 */
{
  const s = createReadShare();
  calls = 0;
  const [a, b, c] = await Promise.all([s.run('k', later(1)), s.run('k', later(2)), s.run('k', later(3))]);
  eq([a, b, c, calls], [1, 1, 1, 1], '셋이 한 번');
}
/* 2. 끝난 뒤의 읽기는 새로 */
{
  const s = createReadShare();
  calls = 0;
  await s.run('k', later(1));
  eq(await s.run('k', later(2)), 2, '끝난 뒤는 새로');
  eq(calls, 2, '두 번');
}
/* 3. 가는 중에 저장(쓰기)이 끝났으면 합치지 않는다 — 저장 직후 옛 값을 받지 않게 */
{
  const s = createReadShare();
  calls = 0;
  const old = s.run('k', later('옛 값'));
  s.wrote();
  const fresh = s.run('k', later('새 값'));
  /* 쓰기 뒤에 떠난 읽기끼리는 다시 합친다 */
  const again = s.run('k', later('또'));
  eq([await old, await fresh, await again, calls], ['옛 값', '새 값', '새 값', 2], '쓰기 뒤는 새로, 그 뒤끼리는 합침');
}
/* 4. 다른 인자는 따로 · 실패도 함께 받고 다음은 새로 */
{
  const s = createReadShare();
  calls = 0;
  await Promise.all([s.run('a', later(1)), s.run('b', later(2))]);
  eq(calls, 2, '다른 열쇠는 따로');
  const fail = () => {
    calls++;
    return Promise.reject(new Error('끊김'));
  };
  const r = await Promise.allSettled([s.run('c', fail), s.run('c', fail)]);
  eq(r.map((x) => x.status), ['rejected', 'rejected'], '실패도 함께');
  eq(calls, 3, '실패는 한 번만 부름');
  eq(await s.run('c', later('다시')), '다시', '실패 뒤는 새로');
}
console.log(`같은 읽기 합치기 ${n}개 통과`);
