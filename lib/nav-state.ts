/**
 * 앱처럼 움직이는 길 찾기의 상태 — 화면 쪽에서만 쓴다(2026-10-04 '앱 틀을 네이티브처럼').
 *
 * 셋을 든다.
 * 1. 지나온 화면 — 이 탭(브라우저 창) 안에서 거쳐 온 주소 차례. '‹ 뒤로'가 진짜 뒤로 갈지(앞 화면이 그 목적지인가)
 *    정하는 데 쓴다(components/back-link.tsx). 예전 '‹ 트레이닝'은 그 주소로 앞으로 가서 기록이 A → B → A 로 쌓였고,
 *    목록의 스크롤 자리를 잃고, 밀어서 뒤로 가면 방금 본 화면이 다시 나왔다.
 * 2. 위 막대의 제목 · 뒤로 — 화면의 큰 제목(PageHeading)과 '‹ 뒤로'(BackLink)가 스스로 적어 두고, 휴대폰 위 막대
 *    (components/app-shell.tsx MobileTopBar)가 읽는다. 큰 제목이 스크롤로 가려지면 막대 가운데에 작은 제목이 나온다.
 * 3. 화면 이동 방향 — <html data-nav="push|pop|none">. 안으로 들어가면 밀려 들어오고, 뒤로는 밀려 나간다
 *    (globals.css '앱처럼 화면 이동'). components/nav-motion.tsx 가 단다.
 */

/* ── 1. 지나온 화면 ── */

const stack: string[] = [];

/** 지금 주소 — 경로 + 물음표 뒤 */
export function currentUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname + window.location.search;
}

/**
 * 주소가 바뀔 때마다 부른다(nav-motion.tsx). 바로 앞 주소로 돌아온 것이면 하나 빼고, 아니면 쌓는다. 같은 주소면 그대로.
 */
export function recordUrl(url: string) {
  if (stack[stack.length - 1] === url) return;
  if (stack[stack.length - 2] === url) {
    stack.pop();
    return;
  }
  stack.push(url);
  if (stack.length > 40) stack.shift();
}

/** 바로 앞 화면의 주소 — 이 창에서 처음 연 화면이면 null */
export function previousUrl(): string | null {
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}

/** 두 주소가 같은 화면인가 — 경로가 같고, target 에 적힌 물음표 값이 모두 같으면 같다고 본다 */
export function sameScreen(a: string, target: string): boolean {
  const ua = new URL(a, 'http://x');
  const ub = new URL(target, 'http://x');
  if (ua.pathname !== ub.pathname) return false;
  for (const [k, v] of ub.searchParams) if (ua.searchParams.get(k) !== v) return false;
  return true;
}

/* ── 2. 위 막대의 제목 · 뒤로 ── */

export type NavBack = { href: string; label: string };
type BarState = { title: string | null; collapsed: boolean; back: NavBack | null };

let bar: BarState = { title: null, collapsed: false, back: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeBar(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function barSnapshot(): BarState {
  return bar;
}
const SERVER_BAR: BarState = { title: null, collapsed: false, back: null };
export function serverBarSnapshot(): BarState {
  return SERVER_BAR;
}

/** 큰 제목이 적는다 — 떠날 때는 같은 제목일 때만 지운다(다음 화면이 먼저 적었을 수 있다) */
export function setBarTitle(title: string | null, collapsed = false) {
  if (bar.title === title && bar.collapsed === collapsed) return;
  bar = { ...bar, title, collapsed };
  emit();
}
export function clearBarTitle(title: string) {
  if (bar.title !== title) return;
  bar = { ...bar, title: null, collapsed: false };
  emit();
}

/** '‹ 뒤로'가 적는다 */
export function setBarBack(back: NavBack | null) {
  if (bar.back?.href === back?.href && bar.back?.label === back?.label) return;
  bar = { ...bar, back };
  emit();
}
export function clearBarBack(href: string) {
  if (bar.back?.href !== href) return;
  bar = { ...bar, back: null };
  emit();
}

/* ── 3. 화면 이동 방향 ── */

/** fade = 하단 탭 · 메뉴처럼 옆으로 나란한 곳으로 — 옅어지며 바뀐다 */
export type NavDirection = 'push' | 'pop' | 'fade' | 'none';

/** '‹ 뒤로'가 router.back() 을 부르기 직전에 켠다 — 뒤따르는 popstate 를 '앱 안의 뒤로'로 읽게 */
let backPressed = false;
export function markBackPressed() {
  backPressed = true;
}
export function takeBackPressed(): boolean {
  const was = backPressed;
  backPressed = false;
  return was;
}

/** 방향을 단 때 본문 머리의 화면 위치 — 옛 화면 그림을 보던 자리에 두는 데 쓴다(components/main-transition.tsx) */
let leaveTop: number | null = null;

export function setNavDirection(dir: NavDirection) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-nav', dir);
  leaveTop = document.querySelector('main')?.getBoundingClientRect().top ?? null;
}
export function takeLeaveTop(): number | null {
  const was = leaveTop;
  leaveTop = null;
  return was;
}
