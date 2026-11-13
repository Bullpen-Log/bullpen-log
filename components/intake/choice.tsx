'use client';

import { Check } from '@/components/icon';

/** 하나 고르기 칸 — 켜짐을 색으로만 말하지 않는다. 체크 표시와 두꺼운 테두리 · 채운 바탕이 같이 바뀐다 */
export function Choice<V extends string>({
  id,
  name,
  value,
  checked,
  label,
  onSelect,
}: {
  id?: string;
  name: string;
  value: V;
  checked: boolean;
  label: string;
  onSelect: (v: V) => void;
}) {
  return (
    <label className="relative flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink has-checked:border-sky has-checked:bg-sky/10 has-checked:font-bold has-checked:text-sky-strong has-checked:ring-1 has-checked:ring-sky has-focus-visible:outline-2 has-focus-visible:outline-sky">
      <input id={id} type="radio" name={name} value={value} checked={checked} onChange={() => onSelect(value)} className="sr-only" />
      {checked && <Check aria-hidden className="h-4 w-4 shrink-0" />}
      {label}
    </label>
  );
}
