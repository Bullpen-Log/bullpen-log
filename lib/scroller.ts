/**
 * 지금 굴러가는 것 — 휴대폰의 탭 첫 화면은 창이 아니라 '판'(components/tab-pager.tsx 의 [data-panel])이 굴러간다(판 넘기기, 2026-10-15).
 * 하위 화면 · PC 는 예전대로 창. 스크롤 자리를 읽거나 맨 위로 보내거나 스크롤을 들을 때는 여기를 거친다 — 위 막대 숨기기 ·
 * 당겨서 새로고침 · 하단 탭 다시 누르기가 같이 쓴다.
 */
export function activeScroller(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (document.documentElement.dataset.pager !== 'tabs') return null;
  return document.querySelector<HTMLElement>('[data-panel][data-active]');
}

/** 지금 보이는 것이 얼마나 굴러 내려갔나(px) */
export function scrollTopNow(): number {
  const s = activeScroller();
  return s ? s.scrollTop : window.scrollY;
}

export function scrollToTop(smooth: boolean) {
  const s = activeScroller();
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
  if (s) s.scrollTo({ top: 0, behavior });
  else window.scrollTo({ top: 0, behavior });
}

/** 창이든 판이든 굴러갈 때 — scroll 은 번지지 않아 문서에서 잡는 단계(capture)로 듣는다 */
export function onAnyScroll(fn: () => void): () => void {
  document.addEventListener('scroll', fn, { capture: true, passive: true });
  return () => document.removeEventListener('scroll', fn, { capture: true });
}
