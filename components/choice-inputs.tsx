'use client';

import { Check } from 'lucide-react';

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

/*
 * 칩 — 휴대폰은 테두리 없는 회색 알약(체크인 칩과 같은 모양), PC 는 예전 네모 칩(2026-10-01 '애플처럼').
 */
const chipBase =
  'cursor-pointer select-none rounded-full border border-transparent bg-ink/6 px-3.5 py-2 text-[13px] text-ink/80 transition-colors desk:rounded-lg desk:border-line desk:bg-surface-2 desk:px-3 desk:text-xs desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink';

/*
 * 설명이 붙는 고르기(경력 · 목표 …) — 휴대폰은 한 줄에 하나씩 둥근 칸, 고른 칸은 파랑으로 두르고 오른쪽에 체크
 * (아이폰의 고르는 목록처럼). PC 는 예전 네모 칩.
 */
const cardBase =
  'cursor-pointer select-none rounded-2xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink transition-colors desk:rounded-lg desk:border-line desk:bg-surface-2 desk:px-3 desk:py-2 desk:text-xs desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink';

/** 선택된 항목에 색이 들어가도록 peer-checked를 쓴다. */
const chipChecked =
  'peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:text-sky peer-checked:font-semibold desk:peer-checked:font-medium';

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
  /**
   * desc가 있으면 항목 아래에 설명이 붙는다.
   *
   * value 는 서버로 보낼 값이다. 없으면 name 을 그대로 보낸다 — 대개 보이는
   * 글자가 곧 값이라 그걸로 충분하고, 둘이 달라야 할 때만 적는다('앱이 정함'을
   * 빈 값으로 보내는 자리처럼).
   */
  options: readonly { name: string; desc?: string; value?: string }[];
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
          <label key={option.name} className="group block">
            <input
              type="radio"
              name={name}
              value={option.value ?? option.name}
              required={required}
              defaultChecked={(option.value ?? option.name) === selected}
              onChange={
                onChange ? () => onChange(option.value ?? option.name) : undefined
              }
              className="peer sr-only"
            />
            {compact ? (
              <span
                className={`${chipBase} ${chipChecked} block h-full peer-focus-visible:ring-1 peer-focus-visible:ring-sky`}
              >
                <span className="inline">{option.name}</span>
                {option.desc && (
                  <span className="ml-1.5 text-[11px] opacity-70">{option.desc}</span>
                )}
              </span>
            ) : (
              <span
                className={`${cardBase} ${chipChecked} flex h-full items-center gap-3 peer-focus-visible:ring-1 peer-focus-visible:ring-sky desk:block`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block">{option.name}</span>
                  {option.desc && (
                    <span className="mt-1 block text-xs leading-relaxed font-normal opacity-70 desk:text-[11px]">
                      {option.desc}
                    </span>
                  )}
                </span>
                {/* 고른 칸의 체크 — 휴대폰만(PC 는 칸 색으로 안다) */}
                <Check
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-sky opacity-0 transition-opacity group-has-[:checked]:opacity-100 desk:hidden"
                  strokeWidth={2.6}
                />
              </span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
