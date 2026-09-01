'use client';

/**
 * 운동·드릴 등록 폼에서 쓰는 선택 입력.
 * 네이티브 input을 그대로 쓰고 라벨만 꾸며서, 폼을 초기화하면
 * 선택도 같이 지워지고 서버 액션에 값이 그대로 실려간다.
 */

function Legend({ label, hint }: { label: string; hint?: string }) {
  return (
    <legend className="mb-2.5 block">
      <span className="text-xs font-medium tracking-normal text-muted">{label}</span>
      {hint && <span className="mt-1 block text-xs text-muted/70">{hint}</span>}
    </legend>
  );
}

const chipBase =
  'cursor-pointer select-none rounded-lg border px-3 py-2 text-xs transition-colors border-line bg-surface-2 text-muted hover:border-sky-soft hover:text-ink';

/** 선택된 항목에 색이 들어가도록 peer-checked를 쓴다. */
const chipChecked =
  'peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:text-sky peer-checked:font-medium';

export function CheckboxGroup({
  name,
  label,
  hint,
  options,
  /** 수정할 때 미리 체크해둘 값들 */
  selected,
}: {
  name: string;
  label: string;
  hint?: string;
  options: readonly string[];
  selected?: readonly string[];
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
              defaultChecked={selected?.includes(option)}
              className="peer sr-only"
            />
            <span
              className={`${chipBase} ${chipChecked} peer-focus-visible:ring-1 peer-focus-visible:ring-sky`}
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
  /** 수정할 때 미리 고를 값 */
  selected,
  onChange,
  compact = false,
}: {
  name: string;
  label: string;
  hint?: string;
  /** desc가 있으면 항목 아래에 설명이 붙는다. */
  options: readonly { name: string; desc?: string }[];
  required?: boolean;
  selected?: string | null;
  /**
   * 고른 것이 바뀔 때 알린다.
   *
   * 폼은 그대로 서버로 보내는 방식이라 대개 필요 없다. 다른 칸이 이 값에 따라
   * 달라질 때만 쓴다 — 훈련 목표를 바꾸면 고를 수 있는 운동 시간이 달라진다.
   */
  onChange?: (value: string) => void;
  /**
   * 짧은 항목을 한 줄에 여러 개 늘어놓는다.
   *
   * 기본 모양은 설명이 붙는 항목(경력·목표)에 맞춰져 있어 휴대폰에서 한 줄에
   * 하나씩 온다. '15분' 같은 두세 글자짜리가 여섯 개면 화면 한 판을 다 쓴다.
   */
  compact?: boolean;
}) {
  return (
    <fieldset>
      <Legend label={label} hint={hint} />
      <div className={compact ? 'flex flex-wrap gap-2' : 'grid gap-2 sm:grid-cols-3'}>
        {options.map((option) => (
          <label key={option.name} className="block">
            <input
              type="radio"
              name={name}
              value={option.name}
              required={required}
              defaultChecked={selected === option.name}
              onChange={onChange ? () => onChange(option.name) : undefined}
              className="peer sr-only"
            />
            <span
              className={`${chipBase} ${chipChecked} block h-full peer-focus-visible:ring-1 peer-focus-visible:ring-sky`}
            >
              <span className={compact ? 'inline' : 'block'}>{option.name}</span>
              {option.desc &&
                (compact ? (
                  <span className="ml-1.5 text-[11px] opacity-70">{option.desc}</span>
                ) : (
                  <span className="mt-1 block text-[11px] leading-relaxed opacity-70">
                    {option.desc}
                  </span>
                ))}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
