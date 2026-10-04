'use client';

import { useEffect, ViewTransition, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  currentUrl,
  recordUrl,
  setNavDirection,
  takeBackPressed,
  takeLeaveTop,
  type NavDirection,
} from '@/lib/nav-state';
import { OPEN_POPUP, QUIET_REFRESH } from '@/lib/transition-types';

/** 방향 표시를 언제 걷나 — 화면이 바뀐 뒤 움직임(320ms)이 끝날 만큼, 길이 막혔으면 넉넉히 뒤에 */
const CLEAR_AFTER_MS = 700;
const GIVE_UP_MS = 8000;

/**
 * 화면 이동 방향을 <html data-nav> 에 단다 — 아이폰 앱처럼(2026-10-04 '앱 틀을 네이티브처럼', lib/nav-state.ts).
 *
 *   push  본문 안의 링크로 들어갈 때 — 새 화면이 오른쪽에서 밀려 들어온다
 *   pop   '‹ 뒤로'를 눌렀을 때 — 지금 화면이 오른쪽으로 밀려 나간다(components/back-link.tsx 가 단다)
 *   none  손가락으로 밀어 뒤로 · 브라우저의 뒤로/앞으로 — 아이폰이 이미 움직임을 보여 줬으니 겹쳐 움직이지 않는다
 *   fade  하단 탭 · 메뉴로 옮길 때 — 옅어지며 바뀐다(옆으로 나란한 탭이라 앞뒤가 없다)
 *   (없음) 불러오기 뼈대 뒤에 내용이 드러날 때 · 코드로 옮길 때 — 움직이지 않고 곧장 바뀐다(MainTransition)
 *
 * 예전에는 모든 이동이 똑같이 옅어졌다. 자료실 → 글, 트레이닝 홈 → 암케어처럼 '안으로 들어가는' 이동과 '뒤로'가
 * 구별되지 않아 웹사이트처럼 느껴졌고, 앱에서 밀어서 뒤로 가면 아이폰의 미끄러짐이 끝난 뒤 한 번 더 옅어졌다.
 *
 * 주소가 바뀔 때마다 지나온 화면에 적는다(recordUrl) — '‹ 뒤로'가 진짜 뒤로 갈지 정하는 데 쓴다. 뿌리 레이아웃에
 * 한 번 붙는다(앱 틀 밖의 운동 · 따라 하기 화면을 오가도 끊기지 않게).
 */
export function NavMotion() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    recordUrl(currentUrl());
    const t = window.setTimeout(
      () => document.documentElement.removeAttribute('data-nav'),
      CLEAR_AFTER_MS
    );
    return () => window.clearTimeout(t);
  }, [pathname, search]);

  useEffect(() => {
    let giveUp = 0;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === currentUrl()) return;
      /*
       * 링크가 스스로 정했으면 그것(data-nav) — 고르개 칸은 fade, 같은 화면에서 날만 바꾸는 링크는 none.
       * 아니면 본문 안은 들어가기, 하단 탭 · 메뉴 · 도크(본문 밖)는 옅어지기.
       */
      const own = a.dataset.nav as NavDirection | undefined;
      setNavDirection(own ?? (a.closest('main') ? 'push' : 'fade'));
      window.clearTimeout(giveUp);
      giveUp = window.setTimeout(
        () => document.documentElement.removeAttribute('data-nav'),
        GIVE_UP_MS
      );
    };
    const onPop = () => setNavDirection(takeBackPressed() ? 'pop' : 'none');
    /* 붙잡기 단계 — 링크(next/link)가 이동을 시작하기 전에 방향을 단다 */
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
      window.clearTimeout(giveUp);
    };
  }, []);

  return null;
}

/**
 * 이동 전환이 시작될 때(리액트가 그림을 다 찍은 뒤, 첫 장면 전) — 돌려준 함수는 전환이 끝난 뒤 불린다.
 *
 * 1. 들어가기 · 탭 이동은 새 화면을 맨 위부터 보인다. Next 는 불러오기 뼈대 다음 전환에서야 맨 위로 굴려, 그 사이
 *    스크롤이 뼈대 길이에 걸린 채(빈 아래쪽)로 밀려 들어왔다. 날만 바꾸는 링크(none) · 뒤로(pop)는 그대로 둔다.
 * 2. 옛 화면 그림을 누를 때 보이던 자리에 둔다(--nav-old-y, globals.css). 틀(group)은 새 화면 자리에 서므로, 스크롤을
 *    내린 채 누르면 옛 그림이 그만큼 아래로 밀려 화면 밖으로 빠지고 빈 바탕만 보였다.
 */
const settleNav = () => {
  const root = document.documentElement;
  const main = document.querySelector('main');
  const dir = root.dataset.nav;
  if (main && (dir === 'push' || dir === 'fade') && main.getBoundingClientRect().top < 0) {
    window.scrollTo(0, 0);
  }
  const leaveTop = takeLeaveTop();
  if (main && leaveTop !== null) {
    root.style.setProperty('--nav-old-y', `${leaveTop - main.getBoundingClientRect().top}px`);
  }
  return () => {
    root.removeAttribute('data-nav');
    root.style.removeProperty('--nav-old-y');
  };
};

/**
 * 본문(app-main)의 화면 전환 — app/(app)/layout.tsx 가 본문을 감싼다.
 *
 * 움직임은 방향 표시(<html data-nav>)가 있는 전환 한 번뿐이다(globals.css '본문'). 화면 이동은 불러오기 뼈대 →
 * 내용 → 안쪽 조각 차례로 드러나며 전환을 서너 번 거는데, 표시가 남아 있으면 그때마다 본문 전체가 다시 옅어지거나
 * 밀려 들어왔다 — 옛 화면의 잔상이 남고, 리액트가 전환을 하나씩 차례로 돌려 내용도 그만큼 늦게 떴다(2026-10-04).
 * 첫 전환이 끝날 때 표시를 걷어, 뒤따르는 조각은 곧장 바뀐다.
 *
 * default="none" 은 쓰지 않는다 — 탭 이동에는 붙인 표시(transitionTypes)가 없어 이동까지 걸러진다. 자료만 새로
 * 받는 전환(lib/quiet-refresh.ts) · 팝업을 여는 이동(OPEN_POPUP)만 뺀다.
 */
export function MainTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      name="app-main"
      share="page"
      enter="page"
      exit="page"
      update={{ [QUIET_REFRESH]: 'none', [OPEN_POPUP]: 'none', default: 'auto' }}
      onUpdate={settleNav}
      onShare={settleNav}
      onEnter={settleNav}
      onExit={settleNav}
    >
      {children}
    </ViewTransition>
  );
}
