'use client';

/**
 * 운동·드릴 등록 폼에서 쓰는 선택 입력.
 * 네이티브 input을 그대로 쓰고 라벨만 꾸며서, 폼을 초기화하면
 * 선택도 같이 지워지고 서버 액션에 값이 그대로 실려간다.
 */

function Legend({ label, hint }: { label: string; hint?: string }) {
  return (
    <legend className="mb-2.5 block">
      <span className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      {hint && <span className="mt-1 block text-xs text-muted/70">{hint}</span>}
    </legend>
  );
}

const chipBase =
  'cursor-pointer select-none rounded-lg border px-3 py-2 text-xs transition-colors border-line bg-surface-2 text-muted hover:border-gold-dim hover:text-cream';

/** 선택된 항목에 색이 들어가도록 peer-checked를 쓴다. */
const chipChecked =
  'peer-checked:border-gold peer-checked:bg-gold/10 peer-checked:text-gold peer-checked:font-medium';

export function CheckboxGroup({
  name,
  label,
  hint,
  options,
}: {
  name: string;
  label: string;
  hint?: string;
  options: readonly string[];
}) {
  return (
    <fieldset>
      <Legend label={label} hint={hint} />
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className="inline-flex">
            <input
              type="checkbox"
              name={name}
              value={option}
              className="peer sr-only"
            />
            <span
              className={`${chipBase} ${chipChecked} peer-focus-visible:ring-1 peer-focus-visible:ring-gold`}
            >
              {option}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function RadioGroup({
  name,
  label,
  hint,
  options,
  required,
}: {
  name: string;
  label: string;
  hint?: string;
  /** desc가 있으면 항목 아래에 설명이 붙는다. */
  options: readonly { name: string; desc?: string }[];
  required?: boolean;
}) {
  return (
    <fieldset>
      <Legend label={label} hint={hint} />
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option.name} className="block">
            <input
              type="radio"
              name={name}
              value={option.name}
              required={required}
              className="peer sr-only"
            />
            <span
              className={`${chipBase} ${chipChecked} block h-full peer-focus-visible:ring-1 peer-focus-visible:ring-gold`}
            >
              <span className="block">{option.name}</span>
              {option.desc && (
                <span className="mt-1 block text-[11px] leading-relaxed opacity-70">
                  {option.desc}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
