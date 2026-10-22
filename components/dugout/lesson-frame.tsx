import Link from 'next/link';
import type { ReactNode } from 'react';
import { RoundBack } from '@/components/round-icon';

/**
 * 레슨 화면의 공통 틀(2026-10-22 금윤호: "화면 인터페이스가 안 맞고 서로 크기도 안 맞아 — 닥터나우와 비슷하게, 우리 인터페이스를 조금만 묻히는 느낌").
 * 닥터나우 안쪽 화면처럼 가운데 좁은 기둥(max-w-2xl) 하나, 맨 위에 '‹' 와 가운데 제목 한 줄. 모든 레슨 화면이 같은 폭 · 같은 머리라 크기가 맞는다.
 */
export function LessonFrame({
  back,
  backLabel,
  title,
  wide = false,
  children,
}: {
  /** 뒤로 가는 주소 — 없으면 머리줄에 ‹ 가 없다(허브) */
  back?: string;
  backLabel?: string;
  title: string;
  /** 비교표처럼 넓어야 하는 화면 */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto ${wide ? 'max-w-4xl' : 'max-w-2xl'} space-y-5`}>
      <div className="relative flex min-h-11 items-center justify-center">
        {back && (
          <Link
            href={back}
            aria-label={backLabel ?? '뒤로'}
            className="absolute left-0 grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-ink/6"
          >
            <RoundBack className="h-5 w-5" />
          </Link>
        )}
        <h1 className="text-base font-bold text-ink">{title}</h1>
      </div>
      {children}
    </div>
  );
}

/** 화면 안의 작은 묶음 제목 — 닥터나우의 '비대면 진료 시작하기' 같은 한 줄 */
export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}
