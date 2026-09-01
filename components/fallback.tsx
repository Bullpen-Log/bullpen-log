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

const PRIMARY =
  'rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong';
const SECONDARY =
  'rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-sky hover:text-sky';

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
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />
  );
}
