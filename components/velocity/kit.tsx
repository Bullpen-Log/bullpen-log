'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui';

/**
 * 불펜 벨로시티 화면들이 같이 쓰는 작은 조각 — 앱의 부품(components/ui)과 같은 규격.
 * 화면마다 라벨 · 카드 · 숫자 줄을 따로 만들면 한 앱처럼 안 보인다.
 *
 * 크기 규칙(폰 기준): 큰 단추 48px(h-12) · 아이콘 단추 48px · 칩 40px(min-h-10) · 목록 줄 56px(min-h-14),
 * 글자는 제목 text-heading · 본문 text-sm · 보조 text-xs · 숫자 text-display.
 */

const join = (...c: (string | false | undefined | null)[]) =>
  c.filter(Boolean).join(' ');

/** 진행 띠 — 체크인 흐름과 같은 띠 하나(components/checkin-flow/flow.tsx). 단계 수로 똑같이 나눠 지금 단계까지 찬다 */
export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-label={`${total}단계 중 ${step}단계`}
      className="h-1.5 overflow-hidden rounded-full bg-ink/10"
    >
      <span
        className="block h-full rounded-full bg-sky transition-[width] duration-[280ms] ease-out"
        style={{ width: `${Math.min(100, Math.max(0, (step / total) * 100))}%` }}
      />
    </div>
  );
}

/** 덩이 위 작은 이름 — 폼의 Field 라벨과 같은 글자 */
export function SectionLabel({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
      <span className="text-xs font-medium text-muted">{children}</span>
      {action}
    </div>
  );
}

/** 카드 — 체크인 흐름의 카드처럼 테두리 없이 맨바탕(bg-page) 위에 흰 면. 안 여백은 안에서 정한다(목록은 여백 없이 줄로 나뉜다) */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={join('overflow-hidden rounded-2xl bg-surface', className)}>
      {children}
    </section>
  );
}

/** 숫자 한 줄 — 최고 · 평균 · 공 수처럼 서너 개를 나란히 */
export function StatRow({
  items,
}: {
  items: { label: string; value: number | string; unit?: string }[];
}) {
  return (
    <dl
      className="grid divide-x divide-line"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it) => (
        <div key={it.label} className="px-2 py-3 text-center">
          <dt className="text-xs text-muted">{it.label}</dt>
          <dd className="text-display mt-0.5 text-2xl leading-none tabular-nums text-ink">
            {it.value}
            {/* 단위는 제 줄에 — 네 칸이면 "km/h" 가 숫자 옆에서 갈렸다 */}
            {it.unit && (
              <span className="mt-1 block font-sans text-caption leading-none text-muted">
                {it.unit}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 한 줄 알림 — 앱의 경고 · 오류 상자와 같은 색 */
export function Note({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok';
  children: ReactNode;
}) {
  const cls = {
    info: 'border-transparent bg-ink/5 text-muted',
    warn: 'border-warn-line bg-warn-bg text-warn',
    danger: 'border-danger-line bg-danger-bg text-danger',
    ok: 'border-transparent bg-ink/5 text-ink',
  }[tone];
  return (
    <p
      role={tone === 'danger' ? 'alert' : undefined}
      className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${cls}`}
    >
      {children}
    </p>
  );
}

/** 칩(하나 고르기) — 체크인 · 탭 카드의 칩(components/day-card.tsx DAY_CHIP)과 같은 알약, 높이 44px */
export const CHIP_BASE =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-transparent bg-ink/6 px-4 text-sm text-ink/80 transition-colors hover:text-ink';
export const CHIP_ON = 'border-sky bg-sky/10 font-semibold text-sky';

/** 큰 단추 — 체크인 흐름의 아래 단추와 같은 크기(56px · 모서리 2xl · 큰 글), 남는 폭을 채운다 */
export function BigButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      className={join(
        'h-14 flex-1 rounded-2xl text-base font-bold desk:rounded-2xl',
        className
      )}
      {...props}
    />
  );
}

/**
 * 칩 — 하나를 고르는 짧은 항목들. 운동 등록 폼의 선택 칩과 같은 색 · 모서리(CHIP_BASE), 높이 40px.
 */
export function Chips<V extends string>({
  label,
  options,
  value,
  onChange,
  allowNone = true,
  wrap = true,
}: {
  label: string;
  options: readonly { value: V; label: string }[];
  value: V | null;
  onChange: (v: V | null) => void;
  /** 고른 것을 다시 누르면 푼다 */
  allowNone?: boolean;
  /** false 면 한 줄로 두고 옆으로 굴린다 */
  wrap?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={
        wrap
          ? 'chip-grid flex flex-wrap gap-2'
          : 'no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4'
      }
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on && allowNone ? null : o.value)}
            className={
              on ? `${CHIP_BASE} ${CHIP_ON} shrink-0` : `${CHIP_BASE} shrink-0`
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
