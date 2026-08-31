import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/** 섹션 상단의 작은 골드 라벨 (예: "TRAINING") */
/** 한글이 한 글자라도 있으면 넓은 자간을 쓰지 않는다 */
const HAS_HANGUL = /[ㄱ-ㆎ가-힣]/;

/**
 * 페이지 제목 위의 작은 머리글 (HOME · LIBRARY …).
 *
 * 자간을 벌리는 것은 영문 대문자에서만 통한다. 한글에 0.25em 을 주면
 * '투 구 일 지'처럼 낱자로 흩어져, 낱말로 읽히지 않는다.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  const korean = typeof children === 'string' && HAS_HANGUL.test(children);
  return (
    <span
      className={`text-xs font-medium text-sky ${
        korean ? 'tracking-normal' : 'uppercase tracking-[0.25em]'
      }`}
    >
      {children}
    </span>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-3">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="text-heading text-[1.75rem] leading-[1.15] text-ink sm:text-[2.5rem]">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl break-keep text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Card({
  className,
  children,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] sm:p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-sky text-white hover:bg-sky-strong focus-visible:outline-sky font-semibold',
  secondary:
    'border border-line-strong bg-surface-2 text-ink hover:border-sky hover:text-sky focus-visible:outline-sky',
  ghost: 'text-muted hover:text-ink focus-visible:outline-line-strong',
  danger:
    'border border-danger-line bg-danger-bg text-danger hover:border-danger focus-visible:outline-danger',
};

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button className={cn(buttonBase, buttonStyles[variant], className)} {...props} />
  );
}

export function ButtonLink({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link className={cn(buttonBase, buttonStyles[variant], className)} {...props} />
  );
}

const fieldStyles =
  'w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink placeholder:text-muted/60 transition-colors focus:border-sky focus:outline-none';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-xs font-medium tracking-normal text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted/70">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldStyles, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldStyles, 'resize-y', className)} {...props} />;
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-line-strong px-3 py-1 text-xs text-muted',
        className
      )}
    >
      {children}
    </span>
  );
}

/** 데이터가 없을 때 보여주는 빈 상태 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      )}
      {action}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
      {children}
    </p>
  );
}
