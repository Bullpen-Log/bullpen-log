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

/**
 * 체크인 — 앱 어디서든 웹의 한 화면 흐름(app/(session)/checkin)을 연다. 앱을 켤 때의 관문도 그 흐름이라, 앱에 따로 그린 폼을 두면
 * 체크인 화면이 둘이었다(2026-10-18 김민: "웹과 많이 다르다" — 3D 몸 그림 · 쉬라는 카드도 웹에만 있었다). 끝나면 next(없으면 홈)로.
 */
export const openCheckin = (next?: string) => leaveTo(next ? `/checkin?next=${encodeURIComponent(next)}` : '/checkin');

/*
 * 웹이 새 주소를 그렸다는 알림(껍데기 index.tsx 가 웹의 'path' 알림을 받을 때 부른다) — leaveWhenShown 이 듣는다.
 */
const arrived = new Set<(path: string, search: string) => void>();
export const webArrived = (path: string, search: string) => arrived.forEach((f) => f(path, search));

/**
 * leaveTo 와 같지만 앱 화면을 웹이 그 주소를 그린 뒤에 걷는다 — 먼저 걷으면 웹이 옮겨 가는 동안 밑의 옛 웹 화면(트레이닝 첫 화면)이 잠깐
 * 보였다(2026-10-20 김민: "3D 근육 지도를 누르면 트레이닝 첫 화면에 갔다가 넘어간다"). 웹 주소일 때만 쓴다 — 앱 화면 주소면 새로 연 화면까지 걷힌다.
 * 웹이 알려 오지 않으면(같은 주소 · 느린 망) 2.5초 뒤에 걷는다.
 */
export function leaveWhenShown(href: string) {
  const [path, query = ''] = href.split('?');
  const want = new URLSearchParams(query);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    arrived.delete(on);
    clearTimeout(timer);
    if (router.canDismiss()) router.dismissAll();
    else if (router.canGoBack()) router.back();
  };
  const on = (p: string, search: string) => {
    const got = new URLSearchParams(search);
    if (p === path && [...want].every(([k, v]) => got.get(k) === v)) finish();
  };
  arrived.add(on);
  const timer = setTimeout(finish, 2500);
  openWebAfter(href);
}
