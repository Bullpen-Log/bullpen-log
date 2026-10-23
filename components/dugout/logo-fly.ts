/**
 * 위 막대 로고 → 큰 로고 첫 화면(2026-10-23 금윤호: "좌측 상단 로고를 누르면 로고가 커지면서 중앙으로 이동하고, 로고가 큰 홈이 스르륵").
 * 막대(components/dugout/dugout-topbar.tsx)가 누른 순간의 로고 자리를 여기 두고, 첫 화면(dugout-hero.tsx)이 그 자리에서 로고를 키워 가운데로 옮긴다.
 * 다른 화면에서 누르면 첫 화면이 붙을 때 가져가고, 이미 '/' 에 있으면 알림(LOGO_FLY_EVENT)으로 바로 받는다.
 */
export type LogoRect = { x: number; y: number; w: number; h: number; at: number };

export const LOGO_FLY_EVENT = 'dugout-logo-fly';
/** 이보다 오래된 자리는 버린다(누르고 한참 뒤에 다른 길로 '/' 에 온 것) */
const STALE_MS = 4000;

let pending: LogoRect | null = null;

export function startLogoFly(el: Element) {
  const r = el.getBoundingClientRect();
  pending = { x: r.left, y: r.top, w: r.width, h: r.height, at: performance.now() };
  window.dispatchEvent(new Event(LOGO_FLY_EVENT));
}

/** 남은 자리를 본다(가져가지 않음 — 그리기 중 여러 번 불려도 같게) */
export function peekLogoFly(): LogoRect | null {
  if (pending && performance.now() - pending.at > STALE_MS) pending = null;
  return pending;
}

export function takeLogoFly(): LogoRect | null {
  const r = peekLogoFly();
  pending = null;
  return r;
}
