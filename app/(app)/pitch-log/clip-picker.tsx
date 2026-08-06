'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { ClipOption } from './compare-view';

/** 날짜에서 연도를 떼어 좁은 화면에서도 읽히게 한다. */
export function shortDate(dateKey: string) {
  const [, m, d] = dateKey.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 영상이 많아지면 목록에서 고르기 어려워지므로,
 * 검색과 월별 묶음을 갖춘 선택창을 쓴다.
 */
export function ClipPicker({
  clips,
  selectedId,
  onSelect,
  side,
}: {
  clips: ClipOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  side: 'A' | 'B';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = clips.find((c) => c.id === selectedId);

  // 최근 날짜가 위로 오게 뒤집는다.
  const ordered = useMemo(() => [...clips].reverse(), [clips]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return ordered;
    return ordered.filter(
      (c) => c.date.includes(q) || shortDate(c.date).includes(q)
    );
  }, [ordered, query]);

  // 월별로 묶어서 스크롤할 때 위치를 가늠할 수 있게 한다.
  const groups = useMemo(() => {
    const map = new Map<string, ClipOption[]>();
    for (const c of filtered) {
      const month = c.date.slice(0, 7);
      const list = map.get(month) ?? [];
      list.push(c);
      map.set(month, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${side}면 영상 선택`}
        className="flex w-full items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink transition-colors hover:border-sky"
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? `${shortDate(selected.date)} ${selected.label}` : '선택'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>

      {open && (
        <>
          {/* 바깥을 눌러 닫기 */}
          <button
            type="button"
            aria-label="선택창 닫기"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl">
            <div className="flex items-center gap-1.5 border-b border-line px-2 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="날짜 검색"
                aria-label="날짜로 검색"
                className="min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-muted/60 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="검색어 지우기"
                  className="shrink-0 text-muted hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto overscroll-contain">
              {groups.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted">
                  일치하는 날짜가 없습니다
                </p>
              ) : (
                groups.map(([month, items]) => (
                  <div key={month}>
                    <p className="sticky top-0 bg-surface-2 px-3 py-1 text-[10px] font-medium tracking-wider text-muted">
                      {month.replace('-', '. ')}
                    </p>
                    {items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onSelect(c.id);
                          setOpen(false);
                          setQuery('');
                        }}
                        className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-2 ${
                          c.id === selectedId ? 'bg-sky/10' : ''
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs text-ink">
                            {shortDate(c.date)} · {c.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-muted">
                            {c.summary}
                          </span>
                        </span>
                        {c.id === selectedId && (
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky" />
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>

            <p className="border-t border-line px-3 py-1.5 text-[10px] text-muted">
              전체 {clips.length}개
            </p>
          </div>
        </>
      )}
    </div>
  );
}
