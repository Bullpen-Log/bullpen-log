'use client';

import { useState, type ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';

/*
 * 아이폰 설정 목록 — 묶음(옅은 면 · 둥근 모서리) 안에 '이름 · 값' 줄이 선으로 갈린다(2026-10-04 '앱 느낌' 4단계).
 *
 * 예전 내 정보 · 설정은 이름표 밑에 상자 입력칸이 하나씩 쌓인 긴 웹 폼이었다. 이제 줄 하나가 칸 하나다: 왼쪽에 이름, 오른쪽에
 * 값(적는 칸은 테두리 없이 오른쪽 정렬, 고르는 칸은 아이폰 기본 고르개). 창(시트)의 흰 바탕 위라 묶음은 한 단계 옅은 면이다 —
 * 설정 › 정보의 줄(components/settings-info.tsx)과 같다.
 */

/** 묶음 — 위 작은 제목, 밑 작은 설명(아이폰 설정의 머리글 · 꼬리글) */
export function ListGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      {title && <h4 className="px-4 pb-1.5 text-xs font-medium text-muted">{title}</h4>}
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2">
        {children}
      </div>
      {footer && (
        <p className="px-4 pt-1.5 text-xs leading-relaxed break-keep text-muted">{footer}</p>
      )}
    </section>
  );
}

/** 줄 하나 — 왼쪽 이름, 오른쪽 값(children). label 로 감싸 줄 어디를 눌러도 칸에 들어간다 */
export function ListRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-12 cursor-text items-center gap-3 px-4">
      <span className="shrink-0 text-sm text-ink">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">{children}</span>
    </label>
  );
}

/** 줄 안의 적는 칸 — 테두리 없이 오른쪽 정렬, 적는 동안만 진하게 */
export const ROW_INPUT =
  'w-full min-w-0 bg-transparent py-3 text-right text-sm text-muted tabular-nums placeholder:text-muted/45 focus:text-ink focus:outline-none';

/** 칸 뒤의 단위(cm · kg …) */
export function RowUnit({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-sm text-muted">{children}</span>;
}

/**
 * 고르는 줄 — 누르면 아이폰 기본 고르개(select)가 뜬다. 고른 값은 오른쪽에 회색으로.
 *
 * 안의 select 를 줄 전체에 투명하게 깐다 — 줄 어디를 눌러도 고르개가 뜨고, 폼에는 name 으로 그대로 실린다. 값은 이 줄이 쥔다
 * (폼이 저장 뒤 되돌려도 고른 값이 남는다). 빈 값('')은 '고르지 않음'이다 — 서버가 빈 값을 '그대로 둠'으로 읽는다.
 */
export function SelectRow({
  label,
  name,
  options,
  defaultValue,
  placeholder = '선택',
  onChange,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label?: string }[];
  defaultValue: string;
  /** 아무것도 안 골랐을 때 보이는 글 */
  placeholder?: string;
  onChange?: (value: string, el: HTMLSelectElement) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const chosen = options.find((o) => o.value === value);
  return (
    <label className="relative flex min-h-12 cursor-pointer items-center gap-3 px-4">
      <span className="shrink-0 text-sm text-ink">{label}</span>
      <span
        className={`ml-auto min-w-0 truncate text-right text-sm ${chosen ? 'text-muted' : 'text-muted/45'}`}
      >
        {chosen ? (chosen.label ?? chosen.value) : placeholder}
      </span>
      <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-muted/60" />
      <select
        name={name}
        value={value}
        aria-label={label}
        onChange={(e) => {
          setValue(e.target.value);
          onChange?.(e.target.value, e.target);
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {!chosen && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label ?? o.value}
          </option>
        ))}
      </select>
    </label>
  );
}
