import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * 덕아웃 쪽 머리(2026-10-24 UI 통일 — docs/designs/dugout-ui-audit.md) — 쪽 제목 24px / 32px 굵게(2026-10-26 v2: 26px 아주 굵게 → 무게를 덜어 가격 · 결과가 먼저 읽히게).
 * 윗글(13 회색) · 한 줄 설명 · 오른쪽 단추 자리는 있을 때만. 위치 줄(crumbs)은 깊은 화면(상세 · 예약 · 비교)에만 작게.
 * 모든 덕아웃 화면의 첫 제목은 이것으로(dugout:test 가 본다). 휴대폰 상세의 '‹ 가운데 제목' 머리는 레슨 틀(lesson-frame)이 따로 둔다.
 */
export type Crumb = { label: string; href?: string };

export function DugoutPageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
  crumbs,
  className = '',
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  crumbs?: Crumb[];
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${className}`}>
      <div className="min-w-0 flex-1 basis-56 space-y-1">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="위치" className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
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
        {eyebrow && <p className="text-[13px] text-muted">{eyebrow}</p>}
        <h1 data-dugout-title className="text-[24px] leading-8 font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 has-[form]:w-full sm:has-[form]:w-auto">{actions}</div>}
    </div>
  );
}
