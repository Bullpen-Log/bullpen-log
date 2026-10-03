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
    return () => {
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
