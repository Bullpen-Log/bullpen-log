'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { PROBLEM_ID } from '@/components/onboarding/step-card';

/**
 * 온보딩에서 고르는 것 셋 — 카드(설명이 있는 선택지) · 칩(짧은 선택지) · 여러 개 칩.
 *
 * 라디오 input 이 아니라 단추(role=radio)다 — 답은 화면이 상태로 쥐고 숨은 칸으로 보낸다(lib/nutrition/onboarding-answers.ts
 * toFormFields). 그래야 "목표 체중 화면은 증량 · 감량일 때만" 처럼 답에 따라 차례가 바뀌는 마법사를 한 폼 안에서 돌릴 수 있다.
 *
 * 묶음에는 id "{name}-field" 와 data-field 가 붙는다 — 마법사가 막힌 칸으로 초점을 보낼 때 찍는 자리(고른 단추, 없으면 첫 단추).
 * 키보드는 Segmented 와 같다: 고른 칸만 Tab 으로 닿고 화살표로 옮긴다(여러 개 칩은 하나하나 닿는다).
 *
 * 들어오는 움직임은 animate-row-in(app/globals.css) — 숨어 있던 화면이 보이는 순간 선택지가 위에서부터 차례로 떠오른다.
 */

export type ChoiceOption<V extends string> = {
  value: V;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** 이름 오른쫹의 작은 꼬리표('미리 골랐어요') */
  badge?: string;
};

function useArrowMove<V extends string>(
  options: readonly ChoiceOption<V>[],
  onChange: (v: V) => void
) {
  const ref = useRef<HTMLDivElement>(null);
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabled = options
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => !o.disabled)
      .map(({ i }) => i);
    const at = enabled.indexOf(index);
    if (at < 0) return;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = enabled[(at + 1) % enabled.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = enabled[(at - 1 + enabled.length) % enabled.length];
        break;
      case 'Home':
        next = enabled[0];
        break;
      case 'End':
        next = enabled[enabled.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(options[next].value);
    ref.current
      ?.querySelector<HTMLButtonElement>(
        `[data-value="${CSS.escape(options[next].value)}"]`
      )
      ?.focus();
  }
  return { ref, move };
}

const groupProps = (name: string, invalid: boolean) => ({
  id: `${name}-field`,
  'data-field': name,
  ...(invalid ? { 'aria-invalid': true as const, 'aria-describedby': PROBLEM_ID } : {}),
});

/** 고른 칸만 Tab 으로 닿는다. 아무것도 안 골랐으면 첫 누를 수 있는 칸 */
function tabIndexOf<V extends string>(
  options: readonly ChoiceOption<V>[],
  value: V | null,
  index: number
) {
  const o = options[index];
  if (o.disabled) return -1;
  const hasSelected = options.some((x) => x.value === value && !x.disabled);
  if (hasSelected) return o.value === value ? 0 : -1;
  return options.findIndex((x) => !x.disabled) === index ? 0 : -1;
}

/**
 * 카드 — 이름 + 설명. 목표 · 평소 움직임 · 시즌 · 탄단지처럼 '왜'가 있는 선택지.
 * columns 1 은 설명이 길 때(한 줄에 하나), 2 는 넷 안팎일 때.
 */
export function OptionCards<V extends string>({
  name,
  label,
  options,
  value,
  onChange,
  columns = 2,
  invalid = false,
  foot,
}: {
  name: string;
  /** 묶음 이름(aria-label) */
  label: string;
  options: readonly ChoiceOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  columns?: 1 | 2;
  invalid?: boolean;
  /** 카드 밑 한 줄(선택지가 왜 이것뿐인지) */
  foot?: ReactNode;
}) {
  const { ref, move } = useArrowMove(options, onChange);
  return (
    <div>
      <div
        ref={ref}
        role="radiogroup"
        aria-label={label}
        {...groupProps(name, invalid)}
        className={`grid gap-2.5 ${columns === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}
      >
        {options.map((o, i) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.disabled}
              tabIndex={tabIndexOf(options, value, i)}
              data-value={o.value}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => move(e, i)}
              style={{ '--row': i } as React.CSSProperties}
              className={`motion-safe:animate-row-in flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-[border-color,background-color,color,box-shadow] duration-200 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-strong disabled:cursor-not-allowed disabled:opacity-40 ${
                on
                  ? 'border-sky bg-sky/10 shadow-[inset_0_0_0_1px_var(--color-sky)]'
                  : invalid
                    ? 'border-danger/60 bg-surface-2 hover:border-danger'
                    : 'border-line bg-surface-2 hover:border-sky-soft'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={`flex items-center gap-2 text-[15px] font-semibold break-keep ${on ? 'text-sky-strong' : 'text-ink'}`}
                >
                  {o.label}
                  {o.badge && (
                    <span className="rounded-full bg-sky/15 px-2 py-0.5 text-[11px] font-medium text-sky-strong">
                      {o.badge}
                    </span>
                  )}
                </span>
                {o.hint && (
                  <span
                    className={`mt-0.5 block text-xs leading-snug break-keep ${on ? 'text-sky-strong/80' : 'text-muted'}`}
                  >
                    {o.hint}
                  </span>
                )}
              </span>
              <span
                aria-hidden
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-200 ${
                  on
                    ? 'scale-100 border-sky bg-sky text-white'
                    : 'scale-90 border-line-strong bg-surface text-transparent'
                }`}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
      {foot && (
        <p className="mt-2.5 text-xs leading-relaxed break-keep text-muted">{foot}</p>
      )}
    </div>
  );
}

const chipBase =
  'motion-safe:animate-row-in inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm transition-[border-color,background-color,color] duration-200 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-strong disabled:cursor-not-allowed disabled:opacity-35';
const chipOn = 'border-sky bg-sky/10 font-semibold text-sky-strong';
const chipOff = (invalid: boolean) =>
  invalid
    ? 'border-danger/60 bg-surface-2 text-muted hover:border-danger'
    : 'border-line bg-surface-2 text-muted hover:border-sky-soft hover:text-ink';

/** 칩 — 짧은 선택지 하나 고르기(던지는 손 · 성별 · 소속 · 투구 3문항 · 끼니 구성). legend 를 주면 묶음 이름이 칸 위에 보인다 */
export function Chips<V extends string>({
  name,
  label,
  legend,
  options,
  value,
  onChange,
  invalid = false,
  hint,
}: {
  name: string;
  label?: string;
  legend?: string;
  options: readonly ChoiceOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  invalid?: boolean;
  /** 묶음 밑 한 줄 */
  hint?: ReactNode;
}) {
  const { ref, move } = useArrowMove(options, onChange);
  return (
    <div>
      {legend && (
        <p className="mb-2 text-xs font-medium text-muted" id={`${name}-legend`}>
          {legend}
        </p>
      )}
      <div
        ref={ref}
        role="radiogroup"
        aria-label={legend ? undefined : label}
        aria-labelledby={legend ? `${name}-legend` : undefined}
        {...groupProps(name, invalid)}
        className="flex flex-wrap gap-2"
      >
        {options.map((o, i) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.disabled}
              tabIndex={tabIndexOf(options, value, i)}
              data-value={o.value}
              title={o.hint}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => move(e, i)}
              style={{ '--row': i } as React.CSSProperties}
              className={`${chipBase} ${on ? chipOn : chipOff(invalid)}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && (
        <p className="mt-2 text-xs leading-relaxed break-keep text-muted">{hint}</p>
      )}
    </div>
  );
}

/** 여러 개 고르는 칩(못 먹는 것) — 하나하나 Tab 으로 닿고, 누르면 켜고 끈다 */
export function MultiChips<V extends string>({
  name,
  label,
  options,
  values,
  onToggle,
  hint,
}: {
  name: string;
  label: string;
  options: readonly ChoiceOption<V>[];
  values: readonly V[];
  onToggle: (v: V, on: boolean) => void;
  hint?: ReactNode;
}) {
  return (
    <div>
      <div
        role="group"
        aria-label={label}
        id={`${name}-field`}
        data-field={name}
        className="flex flex-wrap gap-2"
      >
        {options.map((o, i) => {
          const on = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={o.disabled}
              data-value={o.value}
              onClick={() => onToggle(o.value, !on)}
              style={{ '--row': i } as React.CSSProperties}
              className={`${chipBase} ${on ? chipOn : chipOff(false)}`}
            >
              {on && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && (
        <p className="mt-2 text-xs leading-relaxed break-keep text-muted">{hint}</p>
      )}
    </div>
  );
}
