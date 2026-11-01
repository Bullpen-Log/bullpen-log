'use client';

import { useEffect } from 'react';
import { BETA_LOCK_TITLE, accessAllowsPath, type ReleaseAccess } from '@/lib/release-access';
import { toast } from '@/components/toast';

/**
 * 출시 전 베타의 웹 '잠긴 문'(2026-11-01 금윤호: "인터페이스는 원래대로 모두 동일하게, 문이 잠겨 있듯이 못 들어가게만").
 * 일반 · 준관리자도 원래 싱커 틀 · 메뉴 · 홈을 그대로 보고, 잠긴 곳으로 가는 링크를 누르면 들어가지 않고 '준비 중인 기능입니다.'만 뜬다.
 * 문서 맨 위(캡처 단계)에서 링크 누름을 먼저 받아 Next Link · 다른 처리기보다 앞에서 멈춘다. 판정은 lib/release-access.ts(보기용 — 진짜 막기는
 * 서버 관문이 한다: 주소를 직접 열면 화면은 /today 로, 동작은 403).
 */
export function BetaLinkGuard({ access }: { access: ReleaseAccess }) {
  useEffect(() => {
    let last = 0;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement)) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (accessAllowsPath(access, url.pathname + url.search, 'web')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      /* 되풀이 누름은 안내를 잇달아 띄우지 않는다(앱 shell/release.ts noticeLocked 와 같게) */
      const now = Date.now();
      if (now - last < 2500) return;
      last = now;
      toast(BETA_LOCK_TITLE);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [access]);
  return null;
}
