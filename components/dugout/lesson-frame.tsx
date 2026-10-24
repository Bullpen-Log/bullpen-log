import Link from 'next/link';
import type { ReactNode } from 'react';
import { RoundBack } from '@/components/round-icon';

/**
 * 레슨 화면의 공통 틀(2026-10-22 금윤호: "화면 인터페이스가 안 맞고 서로 크기도 안 맞아 — 닥터나우와 비슷하게").
 * 휴대폰 · 패드: 닥터나우 안쪽 화면처럼 가운데 좁은 기둥(max-w-2xl) 하나, 맨 위에 '‹' 와 가운데 제목 한 줄.
 * PC(lg, 2026-10-24 금윤호: "레슨 탭이 너무 모바일 화면 같아 — 좀 더 세련되게 PC 버전스럽게"): 덕아웃의 다른 화면과 같은 폭(max-w-6xl),
 * 왼쪽 정렬 머리(위치 줄 · 큰 제목 · 한 줄 설명 · 오른쪽 단추 자리). 화면마다 PC 칸 나누기는 각 화면이 정한다.
 */
export type Crumb = { label: string; href?: string };

export function LessonFrame({
  back,
  backLabel,
  title,
  wide = false,
  crumbs,
  subtitle,
  actions,
  children,
}: {
  /** 뒤로 가는 주소 — 없으면 머리줄에 ‹ 가 없다(허브) */
  back?: string;
  backLabel?: string;
  title: string;
  /** 비교표처럼 넓어야 하는 화면(패드에서 조금 넓게) */
  wide?: boolean;
  /** PC 머리 위 위치 줄 — '레슨 › 코치 목록' */
  crumbs?: Crumb[];
  /** PC 큰 제목 밑 한 줄 */
  subtitle?: ReactNode;
  /** PC 머리 오른쪽 자리 */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto ${wide ? 'max-w-4xl' : 'max-w-2xl'} space-y-5 lg:max-w-6xl lg:space-y-7`}>
      {/* 휴대폰 · 패드 머리 — 그대로 */}
      <div className="relative flex min-h-11 items-center justify-center lg:hidden">
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

      {/* PC 머리 */}
      <div className="hidden items-end justify-between gap-6 border-b border-line pb-5 lg:flex">
        <div className="min-w-0 space-y-1.5">
          {crumbs && crumbs.length > 0 && (
            <nav aria-label="위치" className="flex items-center gap-1.5 text-xs text-muted">
              {crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden className="text-muted/60">›</span>}
                  {c.href ? (
                    <Link href={c.href} className="hover:text-ink">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-ink">
                      {c.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className="truncate text-2xl font-black tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {children}
    </div>
  );
}

/** 화면 안의 작은 묶음 제목 — 닥터나우의 '비대면 진료 시작하기' 같은 한 줄. PC 에서는 한 단계 크게 */
export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-bold text-ink lg:text-base">{children}</h2>
      {action}
    </div>
  );
}
