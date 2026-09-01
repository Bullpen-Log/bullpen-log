'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Film } from 'lucide-react';
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

/** 한 해가 넘어가면 연도를 한 번 적어 준다 */
function yearOf(key: string) {
  return key.slice(0, 4);
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
    for (const l of logs) byType.set(l.sessionType, (byType.get(l.sessionType) ?? 0) + 1);
    return {
      all: logs.length,
      video: logs.filter((l) => l.videoPaths.length > 0).length,
      hard: logs.filter((l) => l.intensity >= HARD_INTENSITY).length,
      byType,
    };
  }, [logs]);

  /*
   * 걸러낸 목록에 '여기서 해가 바뀐다'를 미리 붙여 둔다.
   *
   * 앞줄과 견주기만 하고 바깥 값은 안 고친다. 그리는 도중에 값을 고치면
   * 리액트가 그 순서를 보장하지 않는다.
   */
  const matched = useMemo(() => {
    const rows = sorted.filter((l) => {
      if (filter === 'all') return true;
      if (filter === 'video') return l.videoPaths.length > 0;
      if (filter === 'hard') return l.intensity >= HARD_INTENSITY;
      return l.sessionType === filter;
    });
    return rows.map((log, i) => {
      const key = log.date.slice(0, 10);
      const year = yearOf(key);
      const before = i > 0 ? yearOf(rows[i - 1].date.slice(0, 10)) : null;
      return { log, key, year, newYear: year !== before };
    });
  }, [sorted, filter]);

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

      <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
        {matched.map(({ log, key, year, newYear }, i) => {
          const resting = log.sessionType === REST_SESSION_TYPE;

          return (
            <li key={log.id}>
              {newYear && (
                <p className="border-t border-line bg-surface-2 px-5 py-1.5 text-[11px] font-semibold text-muted first:border-t-0">
                  {year}년
                </p>
              )}
              <Link
                href={`/pitch-log/${key}`}
                className={`flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/60 ${
                  i > 0 && !newYear ? 'border-t border-line' : ''
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

      {matched.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          고른 조건에 맞는 기록이 없습니다.
        </p>
      )}
    </div>
  );
}
