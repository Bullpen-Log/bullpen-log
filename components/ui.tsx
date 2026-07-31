import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/** 섹션 상단의 작은 골드 라벨 (예: "TRAINING") */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-[0.25em] text-gold">
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
        <h1 className="text-3xl font-bold tracking-tight text-cream sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
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
    'bg-gold text-ink hover:bg-gold-bright focus-visible:outline-gold font-semibold',
  secondary:
    'border border-line-strong bg-surface-2 text-cream hover:border-gold hover:text-gold focus-visible:outline-gold',
  ghost: 'text-muted hover:text-cream focus-visible:outline-line-strong',
  danger:
    'border border-red-900/60 bg-red-950/40 text-red-300 hover:bg-red-950/70 focus-visible:outline-red-700',
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
  'w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-cream placeholder:text-muted/60 transition-colors focus:border-gold focus:outline-none';

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
      <span className="block text-xs font-medium uppercase tracking-wider text-muted">
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

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(fieldStyles, 'cursor-pointer', className)} {...props} />;
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
      <p className="text-sm font-medium text-cream">{title}</p>
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
    <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
      {children}
    </p>
  );
}
