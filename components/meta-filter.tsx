'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Modal } from '@/components/modal';

type FilterGroup = {
  key: string;
  label: string;
  options: readonly string[];
};

export type FilterState = Record<string, string[]>;

/**
 * 영상 목록 위에 붙는 조건 고르기.
 * 같은 줄 안에서는 하나만 맞아도 통과(또는), 줄끼리는 모두 맞아야 통과(그리고).
 *
 * 휴대폰은 [필터] 단추 한 줄 — 누르면 아래 시트에서 고른다(아이폰 앱의 필터처럼, 2026-10-01 '애플처럼').
 * 늘 펴 둔 칸(부위 · 강도 · 장비 칩 수십 개)이 목록보다 먼저 화면 하나를 먹었다. 고른 조건 수가 단추에
 * 붙고, 고르는 동안 시트 밑 단추가 '12개 보기'로 바로 결과 수를 알려 준다. PC 는 예전처럼 늘 펴 둔 칸.
 */
export function MetaFilter({
  groups,
  value,
  onChange,
  total,
  matched,
  leading,
}: {
  groups: FilterGroup[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  total: number;
  matched: number;
  /** 휴대폰 줄의 [필터] 앞에 함께 둘 것 — 운동 영상의 [★ 즐겨찾기] 같은 알약 하나 */
  leading?: React.ReactNode;
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

  const count = Object.values(value).reduce((n, v) => n + v.length, 0);
  const [sheet, setSheet] = useState(false);

  const chips = (
    <div className="space-y-3.5 desk:space-y-3.5">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="mb-2 text-xs font-semibold tracking-normal text-muted desk:text-[11px] desk:font-medium">
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
                  /* 휴대폰은 테두리 없는 알약(고른 것은 파랑으로 두름), PC 는 예전 네모 칩 */
                  className={`min-h-9 rounded-full border px-3.5 text-[13px] transition-colors desk:min-h-0 desk:rounded-lg desk:px-2.5 desk:py-1.5 desk:text-xs ${
                    on
                      ? 'border-sky bg-sky/10 font-semibold text-sky desk:font-medium'
                      : 'border-transparent bg-ink/6 text-ink/80 desk:border-line desk:bg-surface-2 desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink'
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
  );

  return (
    <>
      {/* ── 휴대폰: [필터] 단추 한 줄 → 아래 시트 ── */}
      <div className="flex flex-wrap items-center gap-2 desk:hidden">
        {leading}
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-haspopup="dialog"
          className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
            active ? 'bg-sky text-white' : 'bg-ink/6 text-ink'
          }`}
        >
          <SlidersHorizontal aria-hidden className="h-4 w-4" />
          필터
          {count > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[11px] font-bold text-sky tabular-nums">
              {count}
            </span>
          )}
        </button>
        {active && (
          <>
            <span className="text-xs whitespace-nowrap text-muted">
              {matched === 0 ? (
                <span className="text-warn">맞는 것이 없어요</span>
              ) : (
                `${matched}개 찾음`
              )}
            </span>
            <button
              type="button"
              onClick={() => onChange({})}
              className="ml-auto min-h-10 shrink-0 px-1 text-xs font-semibold whitespace-nowrap text-sky"
            >
              모두 지우기
            </button>
          </>
        )}
      </div>
      <Modal open={sheet} onClose={() => setSheet(false)} title="조건으로 찾기">
        <div className="space-y-5">
          {chips}
          <div className="flex items-center gap-3 pt-1">
            {active && (
              <button
                type="button"
                onClick={() => onChange({})}
                className="min-h-12 shrink-0 px-3 text-sm font-semibold text-sky"
              >
                초기화
              </button>
            )}
            <button
              type="button"
              onClick={() => setSheet(false)}
              className="min-h-12 flex-1 rounded-full bg-sky text-base font-semibold text-white transition-transform motion-safe:active:scale-[0.98]"
            >
              {active
                ? matched === 0
                  ? '맞는 것이 없어요'
                  : `${matched}개 보기`
                : `전체 ${total}개 보기`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── PC: 늘 펴 둔 칸(예전 그대로) ── */}
      <div className="hidden space-y-4 rounded-2xl border border-line bg-surface p-(--block-pad) desk:block">
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

        {chips}

        {active && (
          <p className="border-t border-line pt-3 text-xs text-muted">
            {matched === 0 ? (
              <span className="text-warn">조건에 맞는 영상이 없어요</span>
            ) : (
              <>
                <span className="text-ink">{matched}개</span> 찾음 (전체 {total}개)
              </>
            )}
          </p>
        )}
      </div>
    </>
  );
}

/** 고른 조건에 맞는지 검사한다. 아무것도 안 골랐으면 통과. */
export function matchesFilter(value: FilterState, fields: Record<string, string[]>) {
  return Object.entries(value).every(([key, chosen]) => {
    if (chosen.length === 0) return true;
    const owned = fields[key] ?? [];
    return chosen.some((c) => owned.includes(c));
  });
}
