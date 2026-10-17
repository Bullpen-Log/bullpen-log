'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MORE_HREF, type NavItem } from '@/lib/nav';
import { slideToTab } from '@/components/tab-pager';

/**
 * 새 아이폰 앱(Expo, native/)의 앱 탭 막대와 잇는다 — 앱이 아래 탭을 그리고(투구 탭은 앱 화면), 이 웹 화면은 홈 · 트레이닝 · 영양을 맡는다.
 *   웹 → 앱: { t: 'tabs', items }(탭 이름 · 주소 · 잠김) · { t: 'path', path, search }(주소가 바뀔 때 — 앱이 지금 탭을 칠한다) ·
 *            { t: 'tabbar', on }(이 틀이 붙고 떨어질 때 — 탭이 없는 화면에서는 앱 막대도 숨긴다)
 *   앱 → 웹: window.__bpTab(href) — 판 넘기기(slideToTab)로 옮기고, 못 하면(하위 화면) 이동. 더보기는 메뉴를 연다.
 * 새 앱이 아니면 아무것도 안 한다. 웹 탭 막대는 globals.css 'Expo 앱 탭'이 숨긴다.
 */
type RN = { postMessage(s: string): void };
const rn = () => (window as unknown as { ReactNativeWebView?: RN }).ReactNativeWebView;
const isExpo = () => typeof navigator !== 'undefined' && navigator.userAgent.includes('BullpenNative/');

export function ExpoTabBridge({ tabs, onMenu }: { tabs: NavItem[]; onMenu: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (!isExpo()) return;
    (window as unknown as { __bpTab?: (href: string) => void }).__bpTab = (href) => {
      if (href === MORE_HREF) return onMenu();
      if (!slideToTab(href)) router.push(href);
    };
  }, [onMenu, router]);

  useEffect(() => {
    if (!isExpo()) return;
    rn()?.postMessage(
      JSON.stringify({
        t: 'tabs',
        items: tabs.map((t) => ({ href: t.href, label: t.short ?? t.label, icon: t.icon, locked: !!t.locked })),
      })
    );
  }, [tabs]);

  useEffect(() => {
    if (!isExpo()) return;
    rn()?.postMessage(JSON.stringify({ t: 'path', path: pathname, search }));
  }, [pathname, search]);

  /* 이 틀이 있는 동안만 앱 탭 막대를 보인다 — (session) 화면(운동 진행 · 체크인 …) · 로그인에는 웹도 탭이 없다 */
  useEffect(() => {
    if (!isExpo()) return;
    rn()?.postMessage(JSON.stringify({ t: 'tabbar', on: true }));
    return () => rn()?.postMessage(JSON.stringify({ t: 'tabbar', on: false }));
  }, []);

  return null;
}
