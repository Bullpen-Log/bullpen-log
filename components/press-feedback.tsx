'use client';

import { useEffect } from 'react';

/** 눌린 것으로 칠 것 — 링크 · 단추 · 펼치기 · 칩(라디오 · 체크를 싼 label) */
const PRESSABLE =
  'a[href], button:not(:disabled), summary, [role="button"], [role="tab"], label:has(input[type="radio"], input[type="checkbox"])';
/** 이만큼 누르고 있어야 눌림을 보인다 — 굴리려고 댄 손가락에 번쩍이지 않게 */
const SHOW_AFTER_MS = 60;
/** 짧게 톡 친 것도 보이게 — 뗀 뒤 이만큼 남긴다 */
const HOLD_AFTER_UP_MS = 100;
/** 이만큼 움직이면 누르기가 아니라 굴리기다 */
const SLOP_PX = 8;
/** 이보다 넓은 것(카드 통째 링크)은 덜 옅게 — 화면 절반이 흐려지면 그것이 번쩍임이다 */
const BIG_AREA = 160 * 160;

/**
 * 손가락으로 누른 것을 옅게 — 아이폰 단추가 눌릴 때처럼(2026-10-01 사용자 '애플처럼').
 *
 * 예전에는 브라우저의 누름 표시(-webkit-tap-highlight-color)를 하늘색으로 칠했다. 누르는 즉시 나타나
 * 확실했지만, 누른 것을 파란 네모로 덮어 '웹 페이지'처럼 보였다(점검의 '탭할 때 파란 번쩍임'). 이제 그 표시는
 * 끄고(globals.css) 누른 것에 data-pressed 를 달아 옅게 한다.
 *
 * - 굴리기와 가른다: 0.06초 누르고 있어야 옅어지고, 그 전에 8px 움직이거나 브라우저가 굴리기로 가져가면
 *   (pointercancel · scroll) 아무 일도 없다 — 목록을 굴리려고 댄 손가락 밑의 줄이 번쩍이지 않는다.
 * - 짧게 톡 친 것도 뗀 뒤 0.1초 옅게 남긴다 — 누른 것이 먹었다는 대답. 화면이 바뀌는 데 0.3초가 걸려,
 *   그동안 아무 대답이 없으면 한 템포 늦게 느껴진다(예전 하늘색 표시를 둔 까닭과 같다).
 * - 손가락 화면만(hover: none). 마우스는 hover 가 있다. [data-press-none] 안은 빼고(창 바깥 어둠 같은 것).
 */
export function PressFeedback() {
  useEffect(() => {
    if (!window.matchMedia('(hover: none)').matches) return;

    /** 손가락이 올라가 있는 것 */
    let pressed: HTMLElement | null = null;
    /** 지금 옅게 칠해진 것 */
    let lit: HTMLElement | null = null;
    let showTimer = 0;
    let hideTimer = 0;
    let x = 0;
    let y = 0;

    const unlight = () => {
      window.clearTimeout(hideTimer);
      lit?.removeAttribute('data-pressed');
      lit = null;
    };
    const light = (el: HTMLElement) => {
      if (lit !== el) unlight();
      el.setAttribute(
        'data-pressed',
        el.offsetWidth * el.offsetHeight > BIG_AREA ? 'big' : ''
      );
      lit = el;
    };
    const cancel = () => {
      window.clearTimeout(showTimer);
      pressed = null;
      unlight();
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      cancel();
      const el = (e.target as Element | null)?.closest?.(PRESSABLE);
      if (!(el instanceof HTMLElement) || el.closest('[data-press-none]')) return;
      pressed = el;
      x = e.clientX;
      y = e.clientY;
      showTimer = window.setTimeout(() => {
        if (pressed) light(pressed);
      }, SHOW_AFTER_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (pressed && Math.hypot(e.clientX - x, e.clientY - y) > SLOP_PX) cancel();
    };
    const onUp = () => {
      if (!pressed) return;
      window.clearTimeout(showTimer);
      light(pressed);
      pressed = null;
      hideTimer = window.setTimeout(unlight, HOLD_AFTER_UP_MS);
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointercancel', cancel, { passive: true });
    /* 굴러가는 칸 어디서든 — 붙잡기(capture)로 듣는다 */
    window.addEventListener('scroll', cancel, { passive: true, capture: true });
    return () => {
      cancel();
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', cancel);
      window.removeEventListener('scroll', cancel, { capture: true });
    };
  }, []);

  return null;
}
