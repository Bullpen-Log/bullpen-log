'use client';

import { ViewTransition, type ReactNode } from 'react';
import { OPEN_POPUP, QUIET_REFRESH } from '@/lib/transition-types';

/**
 * 이번 전환이 '밀기'(<html data-nav> — push · pop · none)로 움직였으면, 그 전환이 끝나는 순간 표시를 걷는다.
 *
 * 2026-10-06 사용자: "홈에서 하이라이트를 누르면 화면 전환 중 로딩 화면이 깨진다". 까닭 — 표시는 주소가 바뀐 뒤
 * 0.7초에 걷혔는데(components/nav-motion.tsx), 리액트는 불러오는 중 화면(loading)이 내용으로 바뀌는 순간에도 전환을
 * 다시 건다. 0.7초 안에 내용이 오면 뼈대가 밀려 들어오고 곧바로 내용이 한 번 더 밀려 들어왔다(두 번 미끄러짐).
 * 리액트가 돌려준 정리 함수를 전환이 끝날 때(finished) 부르므로, 밀기는 처음 한 번만 하고 뒤따르는 바뀜은 옅어지기로
 * 지나간다.
 */
function endNavMotion() {
  const html = document.documentElement;
  const nav = html.dataset.nav;
  if (!nav) return;
  return () => {
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
