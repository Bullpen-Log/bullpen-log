'use client';

import { useSyncExternalStore } from 'react';

const subscribe = (l: () => void) => {
  window.addEventListener('online', l);
  window.addEventListener('offline', l);
  return () => {
    window.removeEventListener('online', l);
    window.removeEventListener('offline', l);
  };
};

/**
 * 인터넷에 붙어 있나 — 오류 화면이 '인터넷 연결이 없어요'와 '화면을 불러오지 못했어요'를 가르는 데 쓴다(2026-10-04).
 * 신호가 끊겨 난 오류에 '잠깐 문제가 생겼어요'라고 하면 앱이 고장 난 줄 안다. 서버에서 그릴 때는 붙어 있다고 본다.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
}
