'use client';

import { scrollToTop } from '@/lib/scroller';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MORE_HREF, type NavGroup, type NavItem, type SportKey } from '@/lib/nav';
import { slideToTab } from '@/components/tab-pager';
import { applyTheme, THEME_CHOICES, type ThemeChoice } from '@/lib/theme';
import {
  applyLengthUnit,
  applySpeedUnit,
  applyWeightUnit,
  LENGTH_UNITS,
  SPEED_UNITS,
  WEIGHT_UNITS,
  type LengthUnit,
  type SpeedUnit,
  type WeightUnit,
} from '@/lib/units-storage';

/**
 * 새 아이폰 앱(Expo, native/)의 앱 탭 막대와 잇는다 — 앱이 아래 탭을 그리고(투구 탭은 앱 화면), 이 웹 화면은 홈 · 트레이닝 · 영양을 맡는다.
 *   웹 → 앱: { t: 'tabs', items, sports }(탭 이름 · 주소 · 잠김, 투구 · 타격 종목 바 — ‹ 칸은 빼고 보냄) · { t: 'path', path, search }(주소가 바뀔 때 — 앱이 지금 탭을 칠한다) ·
 *            { t: 'tabbar', on }(이 틀이 붙고 떨어질 때 — 탭이 없는 화면에서는 앱 막대도 숨긴다)
 *            { t: 'menu', groups, nickname, avatarUrl, isAdmin }(더보기 목록 — 사진 · 관리자는 폴더 밑 내 정보 줄 — 앱이 제 더보기 화면에 그린다, 앱 화면 위에서 웹 메뉴를 열면 밑에 깔려 안 보여서)
 *            { t: 'webfront', on: false }(설정 창을 닫았다 — 앱이 덮었던 앱 화면을 다시 보인다)
 *   앱 → 웹: window.__bpTab(href) — 판 넘기기(slideToTab)로 옮기고, 못 하면(하위 화면) 이동. 더보기는 메뉴를 연다.
 *            window.__bpOpen('settings' | 'profile') — 설정 · 내 정보 창(웹 틀의 창이라 주소가 없다 — /profile 은 홈으로 간다)
 *            window.__bpPrefs({ theme, length, weight, speed }) — 앱 설정 화면(native/src/app/settings.tsx)에서 고른 테마 · 단위를 웹에도 바로 칠한다
 * 새 앱이 아니면 아무것도 안 한다. 웹 탭 막대는 globals.css 'Expo 앱 탭'이 숨긴다.
 */
type RN = { postMessage(s: string): void };
const rn = () => (window as unknown as { ReactNativeWebView?: RN }).ReactNativeWebView;
const isExpo = () => typeof navigator !== 'undefined' && navigator.userAgent.includes('BullpenNative/');

/**
 * 앱 하단바(기본 · 투구 · 타격 종목 바)로 옮긴 화면은 맨 위에서 시작 — 판마다 스크롤 자리를 기억해(tab-pager), 전에 아래까지 내려 본 화면
 * (트레이닝 · 암케어 · 메커니즘 · 타격 기록 …)을 다시 누르면 아래에서 열렸다(2026-10-20 김민). 주소가 바뀌어 새 화면이 붙은 뒤에 올린다.
 */
function startAtTop(href: string, slid: boolean) {
  const want = new URL(href, location.href);
  const until = performance.now() + 3000;
  /* 판으로 미끄러지면 그 판이 지난 주소(?view=…)로 돌아가 길만 본다 */
  const at = () => location.pathname === want.pathname && (slid || location.search === want.search);
  const tick = () => {
    if (at()) {
      scrollToTop(false);
      requestAnimationFrame(() => scrollToTop(false));
    } else if (performance.now() < until) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function ExpoTabBridge({
  tabs,
  sportBars,
  onMenu,
  groups,
  nickname,
  avatarUrl,
  isAdmin,
  settingsOpen,
  onSettings,
  onProfile,
}: {
  tabs: NavItem[];
  /** 투구 · 타격 종목 바(잠금 적용) — 앱이 투구 · 타격 안에서 하단바를 갈아 끼운다(2026-10-20 타격 1단계 D1) */
  sportBars: Record<SportKey, NavItem[]>;
  onMenu: () => void;
  groups: NavGroup[];
  nickname: string;
  avatarUrl: string | null;
  isAdmin: boolean;
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
      const slid = slideToTab(href);
      if (!slid) router.push(href);
      startAtTop(href, slid);
    };
    /*
     * 앱 화면이 서버 동작(/api/rpc)으로 저장한 뒤 — 거기서 부른 revalidatePath 는 웹뷰가 들고 있는 화면을 비우지 못한다(영양 첫 설정을 마쳐도
     * 탭이 잠긴 채였다, 2026-10-18 점검). 틀(탭 잠금)부터 다시 받는다.
     */
    (window as unknown as { __bpRefresh?: () => void }).__bpRefresh = () => router.refresh();
  }, [onMenu, router]);

  useEffect(() => {
    if (!isExpo()) return;
    const shell = (t: NavItem) => ({ href: t.href, label: t.short ?? t.label, icon: t.icon, locked: !!t.locked });
    rn()?.postMessage(
      JSON.stringify({
        t: 'tabs',
        items: tabs.map(shell),
        /* ‹ 는 앱 막대가 따로 그린다(TabBar back) — 칸으로는 안 보낸다. 옛 앱은 이 칸을 모르고 지나간다 */
        sports: {
          pitch: sportBars.pitch.filter((t) => t.icon !== 'back').map(shell),
          hit: sportBars.hit.filter((t) => t.icon !== 'back').map(shell),
        },
      })
    );
  }, [tabs, sportBars]);

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
        avatarUrl,
        isAdmin,
        groups: groups.map((g) => ({
          title: g.title ?? null,
          items: g.items.map((i) => ({ href: i.href, label: i.label, icon: i.icon, locked: !!i.locked, hidden: !!i.appMoreHidden })),
        })),
      })
    );
  }, [groups, nickname, avatarUrl, isAdmin]);

  useEffect(() => {
    if (!isExpo()) return;
    const has = <T extends string>(list: readonly { value: T }[], v: unknown): v is T => list.some((o) => o.value === v);
    (window as unknown as { __bpPrefs?: (p: Record<string, unknown>) => void }).__bpPrefs = (p) => {
      if (has<ThemeChoice>(THEME_CHOICES, p.theme)) applyTheme(p.theme);
      if (has<LengthUnit>(LENGTH_UNITS, p.length)) applyLengthUnit(p.length);
      if (has<WeightUnit>(WEIGHT_UNITS, p.weight)) applyWeightUnit(p.weight);
      if (has<SpeedUnit>(SPEED_UNITS, p.speed)) applySpeedUnit(p.speed);
    };
  }, []);

  useEffect(() => {
    if (!isExpo()) return;
    (window as unknown as { __bpOpen?: (what: string) => void }).__bpOpen = (what) => {
      if (what === 'settings') onSettings();
      else if (what === 'profile') onProfile();
    };
  }, [onSettings, onProfile]);

  /*
   * 설정 · 내 정보 창이 열리고 닫히면 앱에 알린다 — 열리면 앱이 앱 화면 · 하단 탭을 걷어 창이 보이고 닫을 자리(아래 막)가 드러나고,
   * 닫히면 앱 화면을 다시 보인다. 열림도 여기서 알린다(앱이 열기를 부른 뒤 먼저 걷으면, 이 연결이 없는 웹 화면에서는 탭 없이 갇혔다).
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!isExpo()) return;
    if (wasOpen.current !== settingsOpen) rn()?.postMessage(JSON.stringify({ t: 'webfront', on: settingsOpen }));
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
