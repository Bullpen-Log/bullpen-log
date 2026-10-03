'use client';

import { Check } from 'lucide-react';

/**
 * 재활 화면의 고르는 칩 — 체크인의 팔 통증 칩과 같은 모양(휴대폰은 회색 알약 · 고른 것은 파랑, PC 는 네모 칩).
 * 보이는 칩은 40px(칩 규칙), 감싸는 라벨은 휴대폰에서 44px 라 옆 칩을 잘못 누르지 않는다(1편의 CHIP_TALL 과 같다).
 * 값은 부르는 쪽이 쥔다. 하나만 고르면 라디오, 여럿이면 체크 상자 — 화면 읽기에 그대로 읽힌다.
 */
export function RehabChips<V extends string | number>({
  label,
  options,
  value,
  onChange,
  multiple = false,
  stacked = false,
}: {
  label: string;
  options: readonly { value: V; label: string }[];
  value: V | readonly V[] | null;
  onChange: (value: V) => void;
  multiple?: boolean;
  /** 긴 보기(한 줄씩) — 남은 통증 · 느낌 */
  stacked?: boolean;
}) {
  const on = (v: V) =>
    multiple ? ((value as readonly V[] | null) ?? []).includes(v) : value === v;
  return (
    <div
      role="group"
      aria-label={label}
      className={
        stacked ? 'flex flex-col items-start gap-1' : 'flex flex-wrap gap-x-2 gap-y-1'
      }
    >
      {options.map((o) => (
        <label
          key={String(o.value)}
          className="inline-flex min-h-11 items-center desk:min-h-0"
        >
          <input
            type={multiple ? 'checkbox' : 'radio'}
            name={multiple ? undefined : label}
            value={String(o.value)}
            checked={on(o.value)}
            onChange={() => onChange(o.value)}
            className="peer sr-only"
          />
          <span className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-transparent bg-ink/6 px-3.5 py-2 text-sm text-ink/80 transition-colors select-none peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:font-semibold peer-checked:text-sky peer-focus-visible:ring-1 peer-focus-visible:ring-sky desk:min-h-9 desk:rounded-lg desk:border-line desk:bg-surface-2 desk:px-3 desk:text-xs desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink desk:peer-checked:font-medium">
            {multiple && on(o.value) && (
              <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.6} />
            )}
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/** 0~10 통증 칩 열하나 */
export const PAIN_OPTIONS = Array.from({ length: 11 }, (_, i) => ({
  value: i,
  label: String(i),
}));
