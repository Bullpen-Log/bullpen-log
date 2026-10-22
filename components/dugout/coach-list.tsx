'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CoachCard } from '@/components/dugout/coach-card';
import type { CoachCard as CoachCardData } from '@/lib/market/lesson-load';
import { COMPARE_MAX } from '@/lib/market/lessons';

/**
 * 코치 목록 + 비교함(3판) — 카드 오른쪽 위 체크로 최대 셋을 담으면 아래에 '비교하기' 막대가 뜬다(휴대폰 아래 탭 위).
 * 비교는 주소(/lessons/compare?ids=)라 공유할 수 있다. 카드 자체는 상세로 간다.
 */
export function CoachList({ coaches, bookQuery }: { coaches: CoachCardData[]; bookQuery: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length >= COMPARE_MAX ? p : [...p, id]
    );
  const full = picked.length >= COMPARE_MAX;
  return (
    <>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {coaches.map((c) => {
          const on = picked.includes(c.id);
          return (
            <CoachCard
              key={c.id}
              c={c}
              href={`/lessons/${c.id}${bookQuery ? `?${bookQuery}` : ''}`}
              aside={
                <label
                  onClick={(e) => e.stopPropagation()}
                  className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
                    on
                      ? 'border-sky bg-sky text-white'
                      : full
                        ? 'border-line text-muted/50'
                        : 'border-line bg-surface text-muted hover:border-sky-soft hover:text-ink'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    disabled={!on && full}
                    onChange={() => toggle(c.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {on ? '비교함 ✓' : '비교'}
                </label>
              }
            />
          );
        })}
      </div>

      {picked.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-top,0px)+0.75rem)] z-30 px-4 md:bottom-6">
          <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-full bg-ink px-4 py-2 text-white shadow-lg">
            <span className="text-sm font-semibold">
              {picked.length}명 담음
              <span className="ml-1 text-xs font-normal text-white/70">(최대 {COMPARE_MAX}명)</span>
            </span>
            <button
              type="button"
              onClick={() => setPicked([])}
              className="text-xs text-white/70 hover:text-white"
            >
              비우기
            </button>
            <Link
              href={`/lessons/compare?ids=${picked.join(',')}${bookQuery ? `&${bookQuery}` : ''}`}
              aria-disabled={picked.length < 2}
              className={`ml-auto inline-flex min-h-10 items-center rounded-full px-4 text-sm font-bold ${
                picked.length < 2 ? 'pointer-events-none bg-white/20 text-white/60' : 'bg-white text-ink'
              }`}
            >
              비교하기
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
