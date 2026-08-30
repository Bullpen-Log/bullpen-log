'use client';

import { useState, useTransition } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { Modal } from '@/components/modal';
import {
  addDrillToToday,
  removeDrillFromToday,
  setDrillDone,
} from '@/app/actions/drill-log';

/**
 * 오늘 할 투구 드릴.
 *
 * 운동 목록과 다르다. 운동은 앱이 골라서 채워 주지만, 여기는 비어 있는 채로
 * 시작하고 선수가 직접 담는다. 어떤 드릴이 필요한지는 자기 폼을 보는 사람이
 * 정할 일이고, 우리가 가진 것으로는 그것을 짚어 줄 수 없다.
 *
 * 그래서 세트도 횟수도 없다. 담고, 했으면 체크하는 것이 전부다.
 */

export type PickableDrill = {
  id: string;
  title: string;
  category: string;
  focusPoints: string[];
  equipment: string[];
  /** 무엇을 하는 드릴인지 — 고르는 데 필요한 만큼만 앞부분을 잘라 넘긴다 */
  summary: string;
};

export type TodayDrill = PickableDrill & { done: boolean };

/** 한 번에 보여주는 최대 개수. 116개를 통째로 그리면 창이 버벅인다. */
const PAGE = 30;

export function DrillSection({
  today,
  library,
}: {
  /** 오늘 담아 둔 드릴. 비어 있는 것이 기본이다. */
  today: TodayDrill[];
  /** 고를 수 있는 드릴 전체 */
  library: PickableDrill[];
}) {
  const [items, setItems] = useState(today);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const inToday = new Set(items.map((d) => d.id));

  const add = (drill: PickableDrill) => {
    if (inToday.has(drill.id)) return;
    const before = items;
    setItems((prev) => [...prev, { ...drill, done: false }]);
    setError(undefined);
    startTransition(async () => {
      const res = await addDrillToToday(drill.id);
      if ('error' in res) {
        setItems(before);
        setError(res.error);
      }
    });
  };

  const remove = (id: string) => {
    const before = items;
    setItems((prev) => prev.filter((d) => d.id !== id));
    setError(undefined);
    startTransition(async () => {
      const res = await removeDrillFromToday(id);
      if ('error' in res) {
        setItems(before);
        setError(res.error);
      }
    });
  };

  const toggle = (id: string) => {
    const target = items.find((d) => d.id === id);
    if (!target) return;
    const next = !target.done;
    setItems((prev) => prev.map((d) => (d.id === id ? { ...d, done: next } : d)));
    setError(undefined);
    startTransition(async () => {
      const res = await setDrillDone(id, next);
      if ('error' in res) {
        setItems((prev) => prev.map((d) => (d.id === id ? { ...d, done: !next } : d)));
        setError(res.error);
      }
    });
  };

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 px-1">
        <h2 className="text-sm font-bold text-ink">투구 드릴</h2>
        <span className="text-xs text-muted">
          설명을 보고 필요한 것을 직접 고르세요
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-xs leading-relaxed text-muted">
          아직 담은 드릴이 없습니다.
          <br />
          투구 드릴은 앱이 골라 주지 않습니다 — 무엇이 필요한지는 본인이 가장 잘 압니다.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((d) => (
            <li key={d.id} className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => toggle(d.id)}
                aria-pressed={d.done}
                className={`flex min-w-0 flex-1 items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${
                  d.done
                    ? 'border-sky bg-sky-tint'
                    : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    d.done ? 'border-sky bg-sky text-white' : 'border-line-strong'
                  }`}
                >
                  {d.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={`text-sm font-semibold ${d.done ? 'text-sky-strong' : 'text-ink'}`}
                    >
                      {d.title}
                    </span>
                    <span className="text-[11px] text-muted">{d.category}</span>
                  </span>
                  {d.equipment.length > 0 && (
                    <span className="block text-[11px] text-muted">
                      {d.equipment.join(' · ')}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove(d.id)}
                aria-label={`${d.title} 오늘 목록에서 빼기`}
                title="목록에서 빼기"
                className="shrink-0 rounded-2xl border border-line px-2.5 text-muted transition-colors hover:border-danger-line hover:bg-danger-bg hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <DrillPicker library={library} inTodayIds={inToday} onAdd={add} />
    </section>
  );
}

/** 드릴을 골라 담는 창. 앱이 순서를 매기지 않는다 — 찾아보고 고르는 자리다. */
function DrillPicker({
  library,
  inTodayIds,
  onAdd,
}: {
  library: PickableDrill[];
  inTodayIds: Set<string>;
  onAdd: (drill: PickableDrill) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categories = [...new Set(library.map((d) => d.category))];

  const text = query.trim().toLowerCase();
  const found = library.filter((d) => {
    if (category && d.category !== category) return false;
    if (!text) return true;
    return (
      d.title.toLowerCase().includes(text) ||
      d.summary.toLowerCase().includes(text) ||
      d.focusPoints.some((f) => f.toLowerCase().includes(text)) ||
      d.equipment.some((e) => e.toLowerCase().includes(text))
    );
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm font-medium text-muted transition-colors hover:border-sky hover:text-sky"
      >
        <Plus className="h-4 w-4" />
        드릴 고르기
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="투구 드릴 고르기"
        description="설명을 읽고 오늘 필요한 것을 담으세요. 앱은 순서를 정해 주지 않습니다."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
            <Search aria-hidden className="h-4 w-4 shrink-0 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·설명·장비로 찾기"
              aria-label="드릴 찾기"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted/60"
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            <FilterChip on={category === null} onClick={() => setCategory(null)}>
              전체
            </FilterChip>
            {categories.map((c) => (
              <FilterChip
                key={c}
                on={category === c}
                onClick={() => setCategory(category === c ? null : c)}
              >
                {c}
              </FilterChip>
            ))}
          </div>

          <p className="text-xs text-muted">
            {found.length}개 {found.length > PAGE && `· 앞에서 ${PAGE}개만 보입니다`}
          </p>

          <ul className="space-y-2">
            {found.slice(0, PAGE).map((d) => {
              const already = inTodayIds.has(d.id);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => onAdd(d)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      already
                        ? 'border-sky-soft bg-sky/5 text-muted'
                        : 'border-line bg-surface hover:border-sky hover:bg-sky/5'
                    }`}
                  >
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-ink">{d.title}</span>
                        <span className="text-[11px] text-muted">{d.category}</span>
                        {d.equipment.length > 0 && (
                          <span className="text-[11px] text-muted">
                            · {d.equipment.join(' · ')}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs leading-relaxed text-muted">
                        {d.summary}
                      </span>
                    </span>
                    <span
                      className={`mt-0.5 shrink-0 text-xs font-medium ${
                        already ? 'text-sky-strong' : 'text-muted'
                      }`}
                    >
                      {already ? '담음' : '담기'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {found.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">찾는 드릴이 없습니다.</p>
          )}
        </div>
      </Modal>
    </>
  );
}

function FilterChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
        on
          ? 'border-sky bg-sky/10 font-medium text-sky-strong'
          : 'border-line bg-surface-2 text-muted hover:border-sky-soft hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
