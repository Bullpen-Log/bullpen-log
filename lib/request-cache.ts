import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { cache as reactCache } from 'react';

/**
 * 한 요청 안에서 같은 읽기를 한 번만 — React cache() 와 같은 뜻인데, 아이폰 앱 입구(/api/rpc, 라우트 핸들러)에서도 먹는다.
 *
 * React cache() 는 화면을 그릴 때(서버 컴포넌트)만 기억하고 라우트 핸들러에서는 그냥 매번 부른다. 앱 홈(app.loadAppHome) 한 번에 조회가
 * 103개였다 — 홈 링 · 요약 칸 · 오늘 계산이 각자 사용자 · 최근 기록 · 오늘 계산을 다시 읽었다(2026-10-18 앱 화면 속도).
 * runWithRequestCache 안이면 그 요청의 기억(AsyncLocalStorage)을 쓰고, 밖(웹 화면)이면 지금처럼 React cache 다.
 * 인자는 React cache 와 같게 본다 — 글자 · 숫자는 값, 객체는 같은 것(참조)일 때만 같은 인자.
 */
type Node = { kids: Map<unknown, Node>; done?: { value: unknown } };
const store = new AsyncLocalStorage<Map<unknown, Node>>();

export function runWithRequestCache<T>(fn: () => Promise<T>): Promise<T> {
  return store.run(new Map(), fn);
}

export function requestCache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const viaReact = reactCache(fn);
  return (...args: A): R => {
    const memo = store.getStore();
    if (!memo) return viaReact(...args);
    let node: Node | undefined = memo.get(fn);
    if (!node) memo.set(fn, (node = { kids: new Map() }));
    for (const a of args) {
      let next: Node | undefined = node.kids.get(a);
      if (!next) node.kids.set(a, (next = { kids: new Map() }));
      node = next;
    }
    if (!node.done) node.done = { value: fn(...args) };
    return node.done.value as R;
  };
}
