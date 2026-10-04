'use client';

import type { ReactNode } from 'react';

/**
 * 켜고 끄는 스위치 — 아이폰 설정의 스위치 모양(2026-10-04 '앱 느낌' 3단계).
 *
 * 예전에는 '앞으로도 기본으로 쓰기' · '내 음식에 저장' 같은 켜고 끄는 것이 브라우저 기본 체크 상자(16~20px 네모)라
 * 웹 폼처럼 보였고 손가락으로 맞히기도 어려웠다. 줄 전체(SwitchRow)를 누르면 켜지고 꺼진다. 떨림은 화면 전체가 한
 * 곳에서 준다(components/haptic-feedback.tsx — 체크 상자의 change 를 듣는다).
 *
 * 안은 그대로 체크 상자(role="switch")라 폼에 그대로 실린다 — name · value 를 주면 켜졌을 때만 보낸다.
 * checked 를 주면 부모가 쥐고(onChange 로 받는다), 안 주면 defaultChecked 로 스스로 쥔다.
 */
type SwitchProps = {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (on: boolean) => void;
  name?: string;
  value?: string;
  disabled?: boolean;
  /** 화면 읽기용 이름 — 줄(SwitchRow) 안에서는 줄 글자가 이름이라 안 줘도 된다 */
  ariaLabel?: string;
};

export function Switch({
  checked,
  defaultChecked,
  onChange,
  name,
  value,
  disabled,
  ariaLabel,
}: SwitchProps) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange?.(e.target.checked)}
        className="peer sr-only"
      />
      {/* 51 × 31 · 손잡이 27 — 아이폰 스위치 비율. 켜지면 손잡이가 오른쪽으로 미끄러지고 바탕이 파랗게 */}
      <span
        aria-hidden
        className="relative h-7.5 w-12.5 rounded-full bg-line-strong transition-colors duration-200 peer-checked:bg-sky peer-disabled:opacity-40 peer-focus-visible:ring-2 peer-focus-visible:ring-sky peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface after:absolute after:top-0.5 after:left-0.5 after:h-6.5 after:w-6.5 after:rounded-full after:bg-white after:shadow-[0_2px_6px_rgb(0_0_0/0.18)] after:transition-transform after:duration-200 after:ease-[cubic-bezier(0.22,1,0.36,1)] peer-checked:after:translate-x-5"
      />
    </span>
  );
}

/** 글자 + 스위치 한 줄 — 줄 어디를 눌러도 켜지고 꺼진다(아이폰 설정 목록의 한 줄) */
export function SwitchRow({
  children,
  hint,
  className = '',
  ...props
}: SwitchProps & {
  children: ReactNode;
  /** 글자 밑 작은 설명 */
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink ${className}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block break-keep">{children}</span>
        {hint && (
          <span className="mt-0.5 block text-xs leading-relaxed break-keep text-muted">{hint}</span>
        )}
      </span>
      <Switch {...props} />
    </label>
  );
}
