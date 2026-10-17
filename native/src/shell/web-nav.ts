import { router } from 'expo-router';
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

/**
 * 앱 화면에서 따라 하기(암케어 · 메커니즘)를 열 때 붙인다 — 플레이어는 닫거나 마칠 때 웹을 그 칸(/training?view=…)으로 옮겨 왔는데(웹에서 넘어온 때를
 * 위해), 앱 화면(트레이닝 탭 · 암케어 · 메커니즘 화면)에서 열었으면 그냥 뒤로 가야 그 화면이 다시 보인다.
 */
export const fromApp = (path: string) => `${path}${path.includes('?') ? '&' : '?'}from=app`;

/**
 * 앱 화면을 모두 걷고 웹을 그 주소로 — 앱 화면이 웹을 웹 쪽 칸으로 넘길 때 모두 이것을 쓴다. 한 칸만 걷으면 밑의 앱 화면(오늘 운동 위에 연
 * 운동 진행 · 암케어 위의 따라 하기)이 옮긴 웹을 가렸다. 걷은 뒤에 알린다 — 먼저 알리면 껍데기가 그 주소로 연 앱 화면까지 같이 걷혔다.
 */
export function leaveTo(href: string) {
  if (router.canDismiss()) router.dismissAll();
  else if (router.canGoBack()) router.back();
  openWebAfter(href);
}
