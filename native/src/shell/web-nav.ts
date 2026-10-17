import { useEffect } from 'react';

/**
 * 앱 화면(스택 위 화면 — 구속 측정 · 운동 진행 …)이 끝난 뒤 웹을 어디로 보낼지 껍데기(index.tsx)에 알린다.
 * 예: 운동을 마치면 router.back() 하고 openWebAfter('/workout/done') — 껍데기가 웹을 그 주소로 옮긴다.
 */
const subs = new Set<(href: string) => void>();
export const openWebAfter = (href: string) => subs.forEach((f) => f(href));
export function useWebNav(handler: (href: string) => void) {
  useEffect(() => {
    subs.add(handler);
    return () => {
      subs.delete(handler);
    };
  }, [handler]);
}
