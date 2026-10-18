import { useSyncExternalStore } from 'react';

/** 더보기 목록 — 사이트가 알려 준 것(components/app-shell/expo-tabs.tsx { t: 'menu' }). 껍데기가 넣고 더보기 화면(/more)이 그린다 */
export type MenuItem = { href: string; label: string; icon: string; locked: boolean };
export type MenuGroup = { title: string | null; items: MenuItem[] };
type Menu = { groups: MenuGroup[]; nickname: string; avatarUrl?: string | null; isAdmin?: boolean };

let menu: Menu = { groups: [], nickname: '' };
const subs = new Set<() => void>();
export function setMenu(next: Menu) {
  menu = next;
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
