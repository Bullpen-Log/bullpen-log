'use client';

import { useSyncExternalStore } from 'react';
import { toDateKey } from '@/lib/pitch-stats';

/**
 * 오늘 날짜(YYYY-MM-DD, 한국 시각) — 앱을 다시 볼 때마다, 그리고 1분마다 새로 본다.
 *
 * 밤새 켜 둔 앱을 아침에 다시 보면 새날이어야 한다. 체크인 관문과 오른쪽 위 알림이
 * 같은 때에 날짜를 넘기도록 여기 한 곳에 둔다(한쪽만 넘기면 관문은 새날의 체크인을
 * 묻는데 알림은 '할 일 없음'이라고 하는 식으로 어긋난다).
 */
export function subscribeDay(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  const timer = window.setInterval(onChange, 60_000);
  return () => {
    document.removeEventListener('visibilitychange', onChange);
    window.clearInterval(timer);
  };
}

export const readDay = () => toDateKey(new Date());

/**
 * @param serverDay 서버가 본 오늘. 화면을 처음 그릴 때 쓴다 — 서버와 브라우저 모두
 *   한국 시각이라 자정 언저리가 아니면 같고, 다르면 리액트가 곧바로 맞춰 다시 그린다.
 *   null 을 주면 브라우저의 날짜를 알기 전에는 null 이다(관문처럼 아무것도 안 띄울 때).
 */
export function useTodayKey<T extends string | null>(serverDay: T): string | T {
  return useSyncExternalStore<string | T>(subscribeDay, readDay, () => serverDay);
}
