'use client';

import { ViewTransition, type ReactNode } from 'react';
import { OPEN_POPUP, QUIET_REFRESH } from '@/lib/transition-types';
import { takeLeaveTop } from '@/lib/nav-state';

/**
 * 방향 표시(<html data-nav> — push · pop · fade · none)가 있는 전환이 시작될 때(리액트가 그림을 다 찍은 뒤, 첫 장면 전).
 * 돌려준 함수는 그 전환이 끝나는 순간(finished) 불린다.
 *
 * 1. 표시를 걷는다 — 리액트는 불러오는 중 화면이 내용으로 바뀌는 순간에도 전환을 다시 건다. 표시가 남아 있으면 뼈대가
 *    밀려 들어온 뒤 내용이 한 번 더 밀려 들어오거나(2026-10-06 '로딩 화면이 깨진다'), 안쪽 조각이 드러날 때마다 본문
 *    전체가 다시 옅어졌다(2026-10-04 '잔상'). 걷은 뒤의 전환은 곧장 바뀐다(globals.css '곧장 바꾼다').
 * 2. 들어가기 · 탭 이동은 새 화면을 맨 위부터 보인다. Next 는 불러오기 뼈대 다음 전환에서야 맨 위로 굴려, 그 사이
 *    스크롤이 뼈대 길이에 걸린 채(빈 아래쪽)로 밀려 들어왔다. 날만 바꾸는 링크(none) · 뒤로(pop)는 그대로 둔다.
 * 3. 옛 화면 그림을 누를 때 보이던 자리에 둔다(--nav-old-y). 틀(group)은 새 화면 자리에 서므로, 스크롤을 내린 채
 *    누르면 옛 그림이 그만큼 아래로 밀려 화면 밖으로 빠지고 빈 바탕만 보였다.
 */
function endNavMotion() {
  const html = document.documentElement;
  const nav = html.dataset.nav;
  if (!nav) return;
  const main = document.querySelector('main');
  if (
    main &&
    (nav === 'push' || nav === 'fade') &&
    main.getBoundingClientRect().top < 0
  ) {
    window.scrollTo(0, 0);
  }
  const leaveTop = takeLeaveTop();
  if (main && leaveTop !== null) {
    html.style.setProperty(
      '--nav-old-y',
      `${leaveTop - main.getBoundingClientRect().top}px`
    );
  }
  return () => {
    html.style.removeProperty('--nav-old-y');
    if (html.dataset.nav === nav) html.removeAttribute('data-nav');
  };
}

/**
 * 본문 전환(app-main) — 탭을 옮길 때 본문만 부드럽게 바뀐다. 무엇이 어떻게 움직이는지는 app/globals.css
 * '움직임'과 app/(app)/layout.tsx 의 설명을 본다.
 *
 * 레이아웃(서버)에 있던 것을 그대로 옮겼다 — 전환 이벤트(onUpdate 등)는 함수라 화면 쪽 부품에서만 넘길 수 있다.
 */
export function MainTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      name="app-main"
      share="page"
      enter="page"
      exit="page"
      update={{ [QUIET_REFRESH]: 'none', [OPEN_POPUP]: 'none', default: 'auto' }}
      onUpdate={endNavMotion}
      onShare={endNavMotion}
      onEnter={endNavMotion}
      onExit={endNavMotion}
    >
      {children}
    </ViewTransition>
  );
}
