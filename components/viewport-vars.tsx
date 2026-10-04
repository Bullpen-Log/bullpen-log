'use client';

import { useEffect } from 'react';

/**
 * 자판(키보드) 높이를 CSS 변수로 — <html> 의 --kb(자판이 가린 높이, px) · --vvh(보이는 높이, px).
 *
 * 아이폰(사파리 · 앱 웹뷰)은 자판이 올라와도 화면 높이(100dvh · fixed 의 bottom: 0)가 그대로라, 바닥에 붙인 단추
 * ([세트 기록] 막대 · 운동 마치기 · 아래 시트의 저장)가 자판 뒤에 숨었다(2026-10-03 점검). viewport 의
 * interactiveWidget: 'resizes-content' 는 크롬만 듣고 웹킷은 무시한다. 그래서 보이는 창(visualViewport)을 재서
 * 넘겨 준다 — 바닥에 붙는 것은 bottom: var(--kb, 0px), 화면 높이 틀은 height: var(--vvh, 100dvh) 처럼 쓴다.
 *
 * 자판이 없으면 --kb 는 0px, --vvh 는 지운다(틀이 100dvh 그대로). 두 손가락으로 키운 동안(scale > 1)에는 손대지
 * 않는다 — 그때 보이는 창이 작은 것은 자판 때문이 아니다. 뿌리 레이아웃(app/layout.tsx)에 한 번 붙는다.
 */
export function ViewportVars() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let raf = 0;
    const apply = () => {
      raf = 0;
      if (vv.scale > 1.01) return;
      /* 120px 아래 차이는 주소창이 접혔다 펴진 것 — 자판이 아니다 */
      const hidden = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      if (hidden > 120) {
        root.style.setProperty('--kb', `${hidden}px`);
        root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
        root.setAttribute('data-keyboard', '');
      } else {
        root.style.setProperty('--kb', '0px');
        root.style.removeProperty('--vvh');
        root.removeAttribute('data-keyboard');
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);

    /*
     * 자판이 떠 있는 동안 화면을 끌면 자판을 내린다 — 아이폰 앱만(2026-10-04 '앱 느낌' 3단계).
     *
     * 앱은 자판 위의 '⌃ ⌄ 완료' 막대를 숨긴다(mobile/ios/App/App/MainViewController.swift — 사파리 막대라 웹페이지
     * 같았다). 그러면 숫자 자판에는 닫는 단추가 없어서, 아이폰 앱(메모 · 앱스토어 검색)처럼 끌면 내려가게 한다. 끈 곳이
     * 창 안의 목록이든 화면이든 같다. 입력칸 · [data-keep-keyboard] 안에서 시작한 손가락(글자 고르기 · 칸 안 굴리기)은 뺀다.
     */
    const EDITABLE = 'input, textarea, select, [contenteditable="true"]';
    let watching = false;
    let x0 = 0;
    let y0 = 0;
    const onTouchStart = (e: TouchEvent) => {
      watching = false;
      if (root.dataset.app !== 'native' || !root.hasAttribute('data-keyboard')) return;
      if ((e.target as Element | null)?.closest?.(`${EDITABLE}, [data-keep-keyboard]`)) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      watching = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!watching) return;
      const dx = e.touches[0].clientX - x0;
      const dy = e.touches[0].clientY - y0;
      if (Math.abs(dy) < 24 || Math.abs(dy) < Math.abs(dx)) return;
      watching = false;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches(EDITABLE)) active.blur();
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
