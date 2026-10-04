'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  currentUrl,
  recordUrl,
  setNavDirection,
  takeBackPressed,
} from '@/lib/nav-state';

/** 방향 표시를 언제 걷나 — 화면이 바뀐 뒤 움직임(320ms)이 끝날 만큼, 길이 막혔으면 넉넉히 뒤에 */
const CLEAR_AFTER_MS = 700;
const GIVE_UP_MS = 8000;

/**
 * 화면 이동 방향을 <html data-nav> 에 단다 — 아이폰 앱처럼(2026-10-04 '앱 틀을 네이티브처럼', lib/nav-state.ts).
 *
 *   push  본문 안의 링크로 들어갈 때 — 새 화면이 오른쪽에서 밀려 들어온다
 *   pop   '‹ 뒤로'를 눌렀을 때 — 지금 화면이 오른쪽으로 밀려 나간다(components/back-link.tsx 가 단다)
 *   none  손가락으로 밀어 뒤로 · 브라우저의 뒤로/앞으로 — 아이폰이 이미 움직임을 보여 줬으니 겹쳐 움직이지 않는다
 *   (없음) 하단 탭 · 메뉴로 옮길 때 — 예전처럼 옅어지며 바뀐다(옆으로 나란한 탭이라 앞뒤가 없다)
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
      /* 하단 탭 · 메뉴 · 도크는 본문(main) 밖 — 예전처럼 옅어진다. 링크가 스스로 방향을 정했으면 그것 */
      if (!a.closest('main') || a.dataset.nav) return;
      const url = new URL(a.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === currentUrl()) return;
      setNavDirection('push');
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
