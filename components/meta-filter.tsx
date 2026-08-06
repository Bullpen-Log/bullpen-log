'use client';

import { X } from 'lucide-react';

export type FilterGroup = {
  key: string;
  label: string;
  options: readonly string[];
};

export type FilterState = Record<string, string[]>;

/**
 * 영상 목록 위에 붙는 조건 고르기.
 * 같은 줄 안에서는 하나만 맞아도 통과(또는), 줄끼리는 모두 맞아야 통과(그리고).
 */
export function MetaFilter({
  groups,
  value,
  onChange,
  total,
  matched,
}: {
  groups: FilterGroup[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  total: number;
  matched: number;
}) {
  const active = Object.values(value).some((v) => v.length > 0);

  const toggle = (key: string, option: string) => {
    const current = value[key] ?? [];
    onChange({
      ...value,
      [key]: current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option],
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">조건으로 찾기</h2>
        {active ? (
          <button
            type="button"
            onClick={() => onChange({})}
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-sky"
          >
            <X className="h-3.5 w-3.5" />
            초기화
          </button>
        ) : (
          <span className="text-xs text-muted/60">전체 {total}개</span>
        )}
      </div>

      <div className="space-y-3.5">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((option) => {
                const on = (value[group.key] ?? []).includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(group.key, option)}
                    aria-pressed={on}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                      on
                        ? 'border-sky bg-sky/10 font-medium text-sky'
                        : 'border-line bg-surface-2 text-muted hover:border-sky-soft hover:text-ink'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {active && (
        <p className="border-t border-line pt-3 text-xs text-muted">
          {matched === 0 ? (
            <span className="text-warn">조건에 맞는 영상이 없습니다</span>
          ) : (
            <>
              <span className="text-ink">{matched}개</span> 찾음 (전체 {total}개)
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** 고른 조건에 맞는지 검사한다. 아무것도 안 골랐으면 통과. */
export function matchesFilter(
  value: FilterState,
  fields: Record<string, string[]>
) {
  return Object.entries(value).every(([key, chosen]) => {
    if (chosen.length === 0) return true;
    const owned = fields[key] ?? [];
    return chosen.some((c) => owned.includes(c));
  });
}
