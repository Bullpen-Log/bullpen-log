/**
 * 화면 읽기(native/src/community/load-core.ts — community/parts.tsx useLoad 가 쓰는 그대로)의 요청 차례 · 계정 세대 시험.
 * 실행: npm run native-load-core:test
 * useLoad 가 하는 순서(start → begin → 답이 오면 remember · current)를 그대로 부른다. 화면 그리기 · 실제 네트워크는 보지 못한다.
 */
import assert from 'node:assert/strict';
import { createLatest, createLoadCache, type Token } from '~/community/load-core';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};

let epoch = 0;
let wroteAt = 0;
let clock = 1000;
const fresh = () => {
  epoch = 0;
  wroteAt = 0;
  clock = 1000;
  return createLoadCache<string>({ epoch: () => epoch, lastWriteAt: () => wroteAt, now: () => clock });
};
/* useLoad.run 과 같은 차례 — 시작하면 번호를 받고 화면 차례에 올린다. 답이 오면 받아 둔 값에 두고, 화면에는 마지막 요청만 */
function screen(cache: ReturnType<typeof fresh>) {
  const gate = createLatest(() => epoch);
  let shown: string | null = null;
  let error: string | null = null;
  return {
    gate,
    shown: () => shown,
    error: () => error,
    start(): Token {
      const t = cache.start();
      gate.begin(t);
      return t;
    },
    ok(t: Token, key: string, data: string) {
      cache.remember(key, t, data);
      if (gate.current(t)) {
        shown = data;
        error = null;
      }
    },
    fail(t: Token, text: string) {
      if (gate.current(t)) error = text;
    },
  };
}
const K = 'support.loadAppInquiries[]';

/* 1. 재현 — A 의 새로고침이 가는 중에 화면을 닫고 로그아웃 → B 로그인 → A 의 답이 늦게 옴 → B 가 문의 목록을 열어도 A 것이 없다 */
{
  const cache = fresh();
  const a = screen(cache);
  const t = a.start();
  a.gate.close(); // 화면 닫음
  epoch++; // 로그아웃(받아 둔 값 세대가 오름) · B 로그인
  a.ok(t, K, 'A 의 문의');
  eq(cache.recall(K), null, 'B 에게 A 의 받아 둔 값이 없다');
  eq(a.shown(), null, '닫은 화면에도 안 씀');
  const b = screen(cache);
  const tb = b.start();
  b.ok(tb, K, 'B 의 문의');
  eq([b.shown(), cache.recall(K)], ['B 의 문의', 'B 의 문의'], 'B 는 B 것');
}

/* 2. 재현 — 같은 인자로 요청 1 · 2, 2 의 답이 먼저 오고 1 의 옛 답이 뒤에 옴 → 화면 · 받아 둔 값 모두 2 그대로 */
{
  const cache = fresh();
  const s = screen(cache);
  const t1 = s.start();
  const t2 = s.start();
  s.ok(t2, K, '새 목록');
  s.ok(t1, K, '옛 목록');
  eq([s.shown(), cache.recall(K)], ['새 목록', '새 목록'], '옛 답이 덮지 않음');
}

/* 3. 돌아올 때 새로 받기 + 당겨서 새로고침이 겹침 — 늦게 시작한 쪽만. 실패 · 성공이 엇갈려도 */
{
  const cache = fresh();
  const s = screen(cache);
  const t1 = s.start(); // 돌아옴
  const t2 = s.start(); // 당겨서 새로고침
  s.fail(t2, '신호가 약해 불러오지 못했어요.');
  s.ok(t1, K, '옛 성공');
  eq([s.shown(), s.error()], [null, '신호가 약해 불러오지 못했어요.'], '앞 요청의 성공이 늦게 와도 화면엔 마지막 요청의 실패');
  eq(cache.recall(K), '옛 성공', '받아 둔 값은 같은 계정의 값이라 둔다(더 늦은 요청이 둔 것이 없음)');
  const t3 = s.start();
  const t4 = s.start();
  s.ok(t4, K, '최신');
  s.fail(t3, '옛 실패');
  eq([s.shown(), s.error()], ['최신', null], '앞 요청의 실패가 늦게 와도 최신 성공 그대로');
}

/* 4. 인자 A → B → A — 첫 A 의 답이 마지막에 와도 화면은 마지막 A 의 답 */
{
  const cache = fresh();
  const s = screen(cache);
  const a1 = s.start();
  const b = s.start();
  const a2 = s.start();
  s.ok(a2, 'k:A', 'A 최신');
  s.ok(b, 'k:B', 'B');
  s.ok(a1, 'k:A', 'A 옛');
  eq([s.shown(), cache.recall('k:A'), cache.recall('k:B')], ['A 최신', 'A 최신', 'B'], '화면은 마지막 · 받아 둔 A 는 최신 · B 는 B');
}

/* 5. 저장 뒤 다시 받기 — 저장 전에 받아 둔 값은 안 쓰고, 저장 뒤 답을 쓴다 */
{
  const cache = fresh();
  const s = screen(cache);
  s.ok(s.start(), K, '저장 전');
  clock = 2000;
  wroteAt = 1500; // 글을 씀
  eq(cache.recall(K), null, '저장 뒤엔 저장 전 값을 안 씀');
  clock = 2500;
  s.ok(s.start(), K, '저장 뒤');
  eq(cache.recall(K), '저장 뒤', '저장 뒤 답');
}

/* 6. 화면을 닫은 뒤 끝난 새로고침 — 화면엔 안 쓰고(같은 계정이면 받아 둔 값은 둔다) */
{
  const cache = fresh();
  const s = screen(cache);
  const t = s.start();
  s.gate.close();
  s.ok(t, K, '닫은 뒤 답');
  eq([s.shown(), cache.recall(K)], [null, '닫은 뒤 답'], '화면엔 안 씀');
}

console.log(`화면 읽기 차례 · 계정 세대 ${n}개 통과`);
