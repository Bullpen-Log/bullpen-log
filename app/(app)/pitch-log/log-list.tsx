'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Film } from 'lucide-react';
import { REST_SESSION_TYPE, SESSION_TYPES } from '@/lib/session-type';
import type { Log } from './pitch-log-client';

/**
 * 투구 기록을 최근 것부터 쭉 내려보는 목록.
 *
 * 달력은 '그 날짜'를 알 때 좋다. 그런데 지난 기록을 찾을 때는 대개 날짜를
 * 모른다 — "요즘 제일 세게 던진 날", "영상 찍어둔 날", "경기 날"을 찾는다.
 * 달력으로는 한 달씩 넘겨가며 눈으로 훑어야 하고, 몇 해 쓰면 그 짓을 수십 번
 * 해야 한다.
 *
 * 거르기를 함께 둔다. 목록만 있으면 여전히 훑어야 한다 — 특히 '영상 있는 날'은
 * 폼을 견주려 할 때마다 찾게 되는데, 달력에서는 작은 점을 눈으로 뒤져야 했다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-31 → 8월 31일 (일) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

/** 2026-08-31 → 2026년 8월 */
function spokenMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${y}년 ${m}월`;
}

type Filter = 'all' | 'video' | 'hard' | string;

/** 이 강도부터 '세게 던진 날'로 본다 */
const HARD_INTENSITY = 8;

export function LogList({ logs }: { logs: Log[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  /* 최근 것부터. 쉰 날도 남긴다 — 언제 쉬었는지도 기록이다. */
  const sorted = useMemo(
    () => [...logs].sort((a, b) => b.date.localeCompare(a.date)),
    [logs]
  );

  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    for (const l of logs)
      byType.set(l.sessionType, (byType.get(l.sessionType) ?? 0) + 1);
    return {
      all: logs.length,
      video: logs.filter((l) => l.videoPaths.length > 0).length,
      hard: logs.filter((l) => l.intensity >= HARD_INTENSITY).length,
      byType,
    };
  }, [logs]);

  /*
   * 달별로 묶는다.
   *
   * 몇 해 쓴 기록을 한 번에 쫙 펴면 무엇을 보고 있는지 알 수가 없다. 달 단위가
   * 사람이 기억하는 단위이기도 하다 — "지난달에 몇 번 던졌더라".
   */
  const months = useMemo(() => {
    const rows = sorted.filter((l) => {
      if (filter === 'all') return true;
      if (filter === 'video') return l.videoPaths.length > 0;
      if (filter === 'hard') return l.intensity >= HARD_INTENSITY;
      return l.sessionType === filter;
    });
    const map = new Map<string, Log[]>();
    for (const l of rows) {
      const m = l.date.slice(0, 7);
      map.set(m, [...(map.get(m) ?? []), l]);
    }
    return [...map.entries()].map(([month, items]) => ({ month, items }));
  }, [sorted, filter]);

  /*
   * 무엇을 펼쳐 둘 것인가.
   *
   * 아무것도 안 골랐으면 가장 최근 달 하나만 편다. 거르기를 고른 뒤에는 걸린
   * 달을 다 편다 — '영상 있는 날'을 골랐는데 전부 접혀 있으면 아무것도 못 찾은
   * 것처럼 보인다.
   */
  const openByDefault = useMemo(
    () =>
      new Set(
        filter === 'all'
          ? months.slice(0, 1).map((g) => g.month)
          : months.map((g) => g.month)
      ),
    [months, filter]
  );
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (month: string) => toggled[month] ?? openByDefault.has(month);

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: counts.all },
    { key: 'video', label: '영상 있는 날', count: counts.video },
    { key: 'hard', label: `강도 ${HARD_INTENSITY} 이상`, count: counts.hard },
    ...SESSION_TYPES.map((t) => ({
      key: t.name as Filter,
      label: t.name,
      count: counts.byType.get(t.name) ?? 0,
    })),
  ].filter((c) => c.count > 0);

  if (logs.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm leading-relaxed text-muted">
        아직 남긴 기록이 없습니다.
        <br />
        달력에서 날짜를 눌러 첫 기록을 남겨보세요.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* 거르기 — 개수가 0인 것은 아예 안 낸다. 눌러도 빈 화면이 나온다. */}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            aria-pressed={filter === c.key}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              filter === c.key
                ? 'border-sky bg-sky-tint text-sky-strong'
                : 'border-line text-muted hover:border-sky-soft'
            }`}
          >
            {c.label}
            <span
              className={`text-display text-[13px] leading-none ${
                filter === c.key ? 'text-sky-strong' : 'text-line-strong'
              }`}
            >
              {c.count}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {months.map((group, gi) => {
          const open = isOpen(group.month);
          return (
            <section key={group.month} className={gi > 0 ? 'border-t border-line' : ''}>
              <button
                type="button"
                onClick={() =>
                  setToggled((prev) => ({ ...prev, [group.month]: !open }))
                }
                aria-expanded={open}
                className="flex w-full items-center gap-2 bg-surface-2 px-5 py-2.5 text-left transition-colors hover:bg-surface-2/70"
              >
                <ChevronDown
                  aria-hidden
                  className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${
                    open ? '' : '-rotate-90'
                  }`}
                />
                <span className="text-[13px] font-semibold text-ink">
                  {spokenMonth(group.month)}
                </span>
                <span className="text-display text-sm leading-none text-muted">
                  {group.items.length}
                </span>
              </button>

              {open && (
                <ul>
                  {group.items.map((log, i) => {
                    const key = log.date.slice(0, 10);
                    const resting = log.sessionType === REST_SESSION_TYPE;
                    return (
                      <li key={log.id}>
                        <Link
                          href={`/pitch-log/${key}`}
                          className={`flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/60 ${
                            i > 0 ? 'border-t border-line' : ''
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-[13px] font-semibold text-ink">
                                {spokenDate(key)}
                              </span>
                              <span className="text-xs text-muted">
                                {resting ? (
                                  '쉬는 날'
                                ) : (
                                  <>
                                    {log.sessionType} {log.pitchCount}구 · 강도{' '}
                                    {log.intensity}
                                    {log.maxVelocity != null &&
                                      ` · 최고 ${log.maxVelocity}km/h`}
                                  </>
                                )}
                              </span>
                              {log.videoPaths.length > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[11px] text-sky-strong">
                                  <Film aria-hidden className="h-3 w-3" />
                                  {log.videoPaths.length}
                                </span>
                              )}
                            </span>
                            {log.memo && (
                              <span className="mt-0.5 block truncate text-xs text-muted/70">
                                {log.memo}
                              </span>
                            )}
                          </span>
                          <ChevronRight
                            aria-hidden
                            className="h-4 w-4 shrink-0 text-line-strong"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {months.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          고른 조건에 맞는 기록이 없습니다.
        </p>
      )}
    </div>
  );
}
