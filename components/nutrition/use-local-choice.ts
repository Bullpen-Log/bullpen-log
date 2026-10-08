'use client';

import { useSyncExternalStore } from 'react';

/**
 * 이 기기에서만 기억하는 고르기(localStorage) — 영양 탭의 [기록｜통계] · [자세히｜한눈에].
 *
 * 서버는 값을 모르니 처음 그림은 기본값으로, 화면에 붙은 뒤 진짜 값으로 바꿔 그린다(useSyncExternalStore —
 * 단위 · 테마와 같은 방식). 저장소를 못 쓰는 브라우저(사생활 보호 창)에서는 기본값으로 돌고 바꾼 것이 남지 않을 뿐이다.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useLocalChoice<V extends string>(
  key: string,
  fallback: V,
  allowed: readonly V[]
): [V, (next: V) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const raw = window.localStorage.getItem(key);
        return raw !== null && (allowed as readonly string[]).includes(raw)
          ? (raw as V)
          : fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback
  );
  const set = (next: V) => {
    try {
      window.localStorage.setItem(key, next);
    } catch {
      /* 못 남기면 이번만 — 다음에 열면 기본값 */
    }
    listeners.forEach((notify) => notify());
  };
  return [value, set];
}
