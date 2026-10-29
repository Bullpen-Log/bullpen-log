import { useSyncExternalStore } from 'react';
import type { IconName } from '~/shell/icon';
import { DEFAULT_TABS, type ShellTab } from '~/shell/tab-bar';

/** 더보기 목록 — 사이트가 알려 준 것(components/app-shell/expo-tabs.tsx { t: 'menu' }). 껍데기가 넣고 더보기 화면(/more)이 그린다 */
/** hidden — 더보기에서 뺌(투구 · 타격 화면에서 들어감, 웹 lib/nav.ts appMoreHidden). 권한 판정(투구 탭 ABS 칸 등)에는 그대로 쓴다 */
export type MenuItem = { href: string; label: string; icon: string; locked: boolean; hidden?: boolean };
export type MenuGroup = { title: string | null; items: MenuItem[] };
/** tabs — 지금 하단 탭(사이트가 보낸 것, { t: 'tabs' }). 더보기가 하단 탭에 있는 항목을 폴더에서 뺄 때 쓴다 */
type Menu = { groups: MenuGroup[]; nickname: string; avatarUrl?: string | null; isAdmin?: boolean; tabs: ShellTab[] };

let menu: Menu = { groups: [], nickname: '', tabs: DEFAULT_TABS };
const subs = new Set<() => void>();
/** 메뉴 알림은 탭을 모른다 — 탭은 따로 온 것(setMenuTabs)을 그대로 둔다 */
export function setMenu(next: Omit<Menu, 'tabs'>) {
  menu = { ...next, tabs: menu.tabs };
  subs.forEach((f) => f());
}
export function setMenuTabs(tabs: ShellTab[]) {
  menu = { ...menu, tabs };
  subs.forEach((f) => f());
}
export const useMenu = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => menu
  );
/** 앱 내 정보(app/profile.tsx)에서 닉네임을 고치면 더보기 머리도 바로 바꾼다 — 사이트가 다음 알림을 보낼 때까지 */
export const setMenuNickname = (nickname: string) => setMenu({ ...menu, nickname });

/* 웹 nav-icons.tsx NAV_ICONS 와 같은 선 그림 */
export const MENU_ICON: Record<string, IconName> = {
  home: 'house',
  baseball: 'baseball',
  dumbbell: 'dumbbell',
  film: 'film',
  utensils: 'utensils',
  target: 'pitcher',
  zone: 'zone',
  book: 'book-open',
  settings: 'settings',
  shield: 'shield',
  gauge: 'gauge',
  clapper: 'clapperboard',
  radar: 'radar',
  body: 'pitcher',
  /* 3D 스윙 분석 · 3D 개발 관리자 — 타자(2026-10-22), 타격 — 방망이 */
  batter: 'batter',
  bat: 'baseball-bat',
  community: 'messages-square',
  /* 2026-10-22 둥근 그림 — 웹 nav-icons.tsx 와 같게(관리자는 'admin' 별 방패, 'shield' 는 홈 요약 칸 컨디션) */
  heart: 'armcare',
  calendar: 'log',
  users: 'people',
  admin: 'admin',
  back: 'back',
  support: 'life-buoy',
  menu: 'menu',
};
