'use client';

import { useEffect } from 'react';
import { haptic } from '@/lib/haptics';

/** 눌러서 값을 고르는 것 — 이미 골라진 것을 다시 누르면 떨지 않는다(값이 안 바뀐다) */
const PICKERS =
  '[role="radio"], [role="tab"], [role="switch"], [role="menuitemradio"], [role="option"], button[aria-pressed], [role="navigation"] a[data-thumb-key]';

/**
 * 고르면 손에 '톡' — 아이폰 앱이 고르개 · 스위치 · 칩에 주는 가벼운 떨림을 화면 전체에 한 곳에서(2026-10-04 '앱 느낌' 3단계).
 *
 * 고르는 부품이 수십 곳(Segmented · 칩 · 스위치 · 체크 상자)이라 하나하나 떨림을 달면 빠지는 곳이 생기고 세기도
 * 제각각이 된다. 그래서 누름 표시(components/press-feedback.tsx)처럼 문서 한 곳에서 듣는다:
 *   - 체크 상자 · 라디오 · 선택 상자의 change — 손으로 바꿨을 때만 난다(코드가 바꾼 값은 change 가 없다)
 *   - 라디오 · 탭 · 스위치 역할의 단추를 누름 — 이미 골라진 것은 빼고
 * 떨리면 안 되는 곳은 [data-haptic="none"] 으로 뺀다. 손가락 화면만(hover: none) — 실제로 떠는 것은 아이폰 앱 ·
 * 안드로이드다(lib/haptics.ts).
 */
export function HapticFeedback() {
  useEffect(() => {
    if (!window.matchMedia('(hover: none)').matches) return;

    const quiet = (el: Element) => el.closest('[data-haptic="none"]') !== null;

    const onChange = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLSelectElement) {
        if (!quiet(t)) haptic('selection');
        return;
      }
      if (!(t instanceof HTMLInputElement)) return;
      if (t.type !== 'checkbox' && t.type !== 'radio') return;
      if (!quiet(t)) haptic('selection');
    };

    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(PICKERS);
      /* 체크 상자 · 라디오 자체는 change 가 맡는다 */
      if (!el || el instanceof HTMLInputElement || quiet(el)) return;
      /* 스위치 · 눌림 단추는 다시 누르면 꺼지니 늘 바뀐다 — 고르기(라디오 · 탭)만 골라진 것을 뺀다 */
      const toggles = el.getAttribute('role') === 'switch' || el.hasAttribute('aria-pressed');
      if (
        (!toggles && el.getAttribute('aria-checked') === 'true') ||
        el.getAttribute('aria-selected') === 'true' ||
        el.getAttribute('aria-current') === 'page' ||
        el.getAttribute('aria-disabled') === 'true' ||
        (el instanceof HTMLButtonElement && el.disabled)
      )
        return;
      haptic('selection');
    };

    document.addEventListener('change', onChange, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('change', onChange, true);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
