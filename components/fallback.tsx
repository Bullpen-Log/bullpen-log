import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * 일이 잘못됐을 때 보여주는 화면 조각.
 *
 * 오류·404·로딩은 서로 다른 상황이지만 화면은 닮아야 한다. 사고가 났을 때마다
 * 다른 모양이 나오면, 그 자체가 앱이 망가졌다는 인상을 준다.
 *
 * 여기 있는 것들은 무엇에도 기대지 않는다 — DB도, 로그인 상태도, 클라이언트
 * 코드도. 오류 화면이 오류를 내면 사용자는 아무것도 못 본다.
 */

export function FallbackShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">{children}</div>
    </div>
  );
}

export function FallbackTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-xl font-bold text-ink sm:text-2xl">{children}</h1>;
}

export function FallbackText({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-muted">{children}</p>;
}

export function FallbackActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
      {children}
    </div>
  );
}

/* 휴대폰은 앱의 다른 단추처럼 알약 · 테두리 없는 회색 면(2026-10-04 '앱 안에 머물기'), PC 는 예전 네모 */
const PRIMARY =
  'inline-flex min-h-11 items-center rounded-full bg-sky px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong desk:min-h-0 desk:rounded-xl desk:px-4 desk:py-2.5';
const SECONDARY =
  'inline-flex min-h-11 items-center rounded-full bg-surface px-5 text-sm font-medium text-ink transition-colors desk:min-h-0 desk:rounded-xl desk:border desk:border-line-strong desk:bg-transparent desk:px-4 desk:py-2.5 desk:hover:border-sky desk:hover:text-sky';

export function FallbackLink({
  href,
  primary,
  children,
}: {
  href: string;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={primary ? PRIMARY : SECONDARY}>
      {children}
    </Link>
  );
}

export function FallbackButton({
  onClick,
  primary,
  children,
}: {
  onClick: () => void;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={primary ? PRIMARY : SECONDARY}>
      {children}
    </button>
  );
}

/**
 * 화면을 불러오는 동안 자리를 잡아 두는 회색 덩어리.
 *
 * 빈 화면을 보여주면 멈춘 것처럼 보인다. 실제로 나올 모양과 비슷하게 두면
 * 기다리는 동안에도 무엇이 올지 짐작할 수 있다.
 */
/**
 * 오류 번호 — 같은 오류를 다시 겪었을 때 로그에서 찾는 번호. PC 에서만 보인다: 휴대폰 앱에서 '오류 번호 3998…'은
 * 웹사이트의 오류 화면처럼 보였다(2026-10-04 점검). 사용자에게 뜻이 없는 값이다.
 */
export function ErrorDigest({ digest }: { digest?: string }) {
  if (!digest) return null;
  return <p className="mt-6 hidden text-xs text-muted/60 desk:block">오류 번호 {digest}</p>;
}

/*
 * 색은 선 색(bg-line). 예전 bg-surface-2 는 2026-10-01 '애플처럼'에서 바탕(bg-page)과 같은 #f2f2f7 이 되어, 밝은 테마의
 * 바탕 위 덩어리가 보이지 않았다 — 불러오는 동안 제목만 있는 빈 화면이었다가 내용이 툭 튀어나왔다(2026-10-06 사용자
 * "화면 전환 중 로딩 화면이 깨진다"). 선 색은 모든 테마에서 바탕 · 카드 둘 다와 구별된다.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`animate-pulse rounded-xl bg-line ${className}`} />
  );
}
