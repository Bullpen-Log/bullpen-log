import type { ShellTab } from '~/shell/tab-bar';

/**
 * 덕아웃 앱(APP_VARIANT=dugout — app.config.js)이 띄우는 사이트의 약속.
 *
 * UA 에는 'DugoutApp/1' 만 단다 — 'BullpenLogApp' 을 같이 달면 사이트가 싱커 앱으로 보고 '/' 를 /today 로 돌린다(app/(dugout)/page.tsx),
 * 'BullpenNative/' 를 달면 사이트가 싱커의 앱 화면(OpenNative)으로 넘기려 한다. 사이트는 lib/app-env.ts surfaceOf 로 'dugout-app' 을 가린다.
 * 숫자는 덕아웃 앱이 아는 앱 화면의 판 — 사이트가 덕아웃 앱 화면으로 넘기는 길을 더하면 올린다.
 */
export const DUGOUT_UA = 'DugoutApp/1';

/** 아래 탭 — 웹 휴대폰 탭(components/dugout/dugout-shell.tsx)에서 '올리기' 대신 커뮤니티(올리기는 장터 안에 있다) */
export const DUGOUT_TABS: ShellTab[] = [
  { href: '/', label: '홈', icon: 'home' },
  { href: '/market', label: '장터', icon: 'market' },
  { href: '/community', label: '커뮤니티', icon: 'community' },
  { href: '/chat', label: '채팅', icon: 'chat' },
  { href: '/me', label: '마이', icon: 'user' },
];

/** 사이트 주소 → 그 주소가 속한 탭(없으면 null — 렌즈를 안 띄운다) */
export function dugoutTabOf(path: string): string | null {
  if (path === '/') return '/';
  const hit = DUGOUT_TABS.find((t) => t.href !== '/' && (path === t.href || path.startsWith(`${t.href}/`)));
  return hit?.href ?? null;
}

/** 로그인 화면 — 웹 대신 앱 로그인(app/login.tsx)을 띄운다. 가입은 웹(?web=1)으로 */
export const isLoginPath = (p: string) => p === '/login' || p.startsWith('/login/');
