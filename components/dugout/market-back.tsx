'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

/**
 * 장터 상세 → 목록으로 돌아가기(2026-10-26) — 입구(/market)와 결과(/market/browse?…)가 갈려, 상세의 '‹ 장터'가 늘 입구로 가면 고르던 목록 · 굴린 자리를 잃는다.
 * 목록 화면(MarketListMemory)이 물건 카드를 누르는 순간 '어느 목록에서 어느 물건을 열었나'를 이 탭(sessionStorage)에 적고,
 * 상세(MarketBackLink)는 지금 물건이 그 물건이면 브라우저 뒤로(router.back — Next 가 굴린 자리까지 되살린다), 아니면 적어 둔 목록 주소로, 그것도 없으면 입구로 간다.
 * 링크로 바로 들어온 상세(공유 주소)에서 뒤로를 누르면 사이트 밖으로 나가 버리지 않게 history 가 아니라 적어 둔 값을 본다.
 */
const KEY = 'dugout-market-from';
type Memo = { from: string; id: string };
/** 상세 주소 — /market/<id> 하나뿐(browse · new · sell-preview · <id>/edit 는 아님) */
const DETAIL = /^\/market\/(?!browse$|new$|sell-preview$)([^/?#]+)$/;

/** 적어 둔 글 그대로(바뀌었는지 견주기 쉽게 문자열) — 서버 그림 · 못 읽으면 null */
function readRaw(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
const noSubscribe = () => () => {};

function parse(raw: string | null): Memo | null {
  try {
    const v = JSON.parse(raw ?? 'null') as Memo | null;
    return v && typeof v.from === 'string' && typeof v.id === 'string' && v.from.startsWith('/market') ? v : null;
  } catch {
    return null;
  }
}

export function MarketListMemory() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a) return;
      const url = new URL((a as HTMLAnchorElement).href, location.href);
      if (url.origin !== location.origin) return;
      const m = DETAIL.exec(url.pathname);
      if (!m) return;
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ from: location.pathname + location.search, id: decodeURIComponent(m[1]) } satisfies Memo));
      } catch {
        /* 사생활 보호 창 — 적지 못하면 상세의 링크가 입구로 간다 */
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return null;
}

export function MarketBackLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  /* 서버 그림은 입구 — 붙은 뒤에 적어 둔 목록으로 바꾼다(그리기 어긋남 없이) */
  const memo = parse(useSyncExternalStore(noSubscribe, readRaw, () => null));
  const same = memo?.id === id;
  return (
    <Link
      href={memo?.from ?? '/market'}
      className={className}
      onClick={(e) => {
        if (!same || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
