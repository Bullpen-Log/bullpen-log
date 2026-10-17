'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MORE_HREF, type NavGroup, type NavItem } from '@/lib/nav';
import { slideToTab } from '@/components/tab-pager';

/**
 * 새 아이폰 앱(Expo, native/)의 앱 탭 막대와 잇는다 — 앱이 아래 탭을 그리고(투구 탭은 앱 화면), 이 웹 화면은 홈 · 트레이닝 · 영양을 맡는다.
 *   웹 → 앱: { t: 'tabs', items }(탭 이름 · 주소 · 잠김) · { t: 'path', path, search }(주소가 바뀔 때 — 앱이 지금 탭을 칠한다) ·
 *            { t: 'tabbar', on }(이 틀이 붙고 떨어질 때 — 탭이 없는 화면에서는 앱 막대도 숨긴다)
 *            { t: 'menu', groups, nickname }(더보기 목록 — 앱이 제 더보기 화면에 그린다, 앱 화면 위에서 웹 메뉴를 열면 밑에 깔려 안 보여서)
 *            { t: 'webfront', on: false }(설정 창을 닫았다 — 앱이 덮었던 앱 화면을 다시 보인다)
 *   앱 → 웹: window.__bpTab(href) — 판 넘기기(slideToTab)로 옮기고, 못 하면(하위 화면) 이동. 더보기는 메뉴를 연다.
 *            window.__bpOpen('settings' | 'profile') — 설정 · 내 정보 창(웹 틀의 창이라 주소가 없다 — /profile 은 홈으로 간다)
 * 새 앱이 아니면 아무것도 안 한다. 웹 탭 막대는 globals.css 'Expo 앱 탭'이 숨긴다.
 */
type RN = { postMessage(s: string): void };
const rn = () => (window as unknown as { ReactNativeWebView?: RN }).ReactNativeWebView;
const isExpo = () => typeof navigator !== 'undefined' && navigator.userAgent.includes('BullpenNative/');

export function ExpoTabBridge({
  tabs,
  onMenu,
  groups,
  nickname,
  settingsOpen,
  onSettings,
  onProfile,
}: {
  tabs: NavItem[];
  onMenu: () => void;
  groups: NavGroup[];
  nickname: string;
  /** 앱이 연 웹 창(설정 · 내 정보)이 열려 있나 — 닫히면 앱에 알린다 */
  settingsOpen: boolean;
  onSettings: () => void;
  onProfile: () => void;
}) {
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

  useEffect(() => {
    if (!isExpo()) return;
    rn()?.postMessage(
      JSON.stringify({
        t: 'menu',
        nickname,
        groups: groups.map((g) => ({
          title: g.title ?? null,
          items: g.items.map((i) => ({ href: i.href, label: i.label, icon: i.icon, locked: !!i.locked })),
        })),
      })
    );
  }, [groups, nickname]);

  useEffect(() => {
    if (!isExpo()) return;
    (window as unknown as { __bpOpen?: (what: string) => void }).__bpOpen = (what) => {
      if (what === 'settings') onSettings();
      else if (what === 'profile') onProfile();
    };
  }, [onSettings, onProfile]);

  /* 설정 창을 닫으면 앱에 알린다 — 앱 화면(홈 · 투구 · 영양) 위에서 연 창이면 앱이 그 화면을 다시 보인다 */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!isExpo()) return;
    if (wasOpen.current && !settingsOpen) rn()?.postMessage(JSON.stringify({ t: 'webfront', on: false }));
    wasOpen.current = settingsOpen;
  }, [settingsOpen]);

  /* 이 틀이 있는 동안만 앱 탭 막대를 보인다 — (session) 화면(운동 진행 · 체크인 …) · 로그인에는 웹도 탭이 없다 */
  useEffect(() => {
    if (!isExpo()) return;
    rn()?.postMessage(JSON.stringify({ t: 'tabbar', on: true }));
    return () => rn()?.postMessage(JSON.stringify({ t: 'tabbar', on: false }));
  }, []);

  return null;
}
