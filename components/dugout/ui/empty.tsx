import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * 덕아웃 빈 화면(장터의 '아직 올라온 물건이 없어요', 2026-10-24 UI 통일) — 가운데 py-20, 굵은 한 줄 · 회색 한 줄 · 초록 알약 단추 하나.
 */
export function DugoutEmpty({
  title,
  description,
  href,
  cta,
  action,
  icon,
  compact = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  cta?: string;
  /** 단추 대신 다른 것 */
  action?: ReactNode;
  icon?: ReactNode;
  /** 카드 안처럼 좁은 곳 — 위아래 여백을 줄인다 */
  compact?: boolean;
}) {
  return (
    <div className={`space-y-3 text-center ${compact ? 'py-10' : 'py-20'}`}>
      {icon && <div className="mx-auto grid h-12 w-12 place-items-center text-muted/70 [&_svg]:h-8 [&_svg]:w-8">{icon}</div>}
      <p className="text-base font-bold text-ink">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action ??
        (href && cta && (
          <Link href={href} className="inline-flex min-h-11 items-center rounded-full bg-sky px-5 text-sm font-bold text-white transition-colors hover:bg-sky-strong">
            {cta}
          </Link>
        ))}
    </div>
  );
}
