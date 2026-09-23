'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, ChevronRight, GitCommitHorizontal, Search, StickyNote } from 'lucide-react';
import { Card, EmptyState, Input } from '@/components/ui';

export type PatchRow = {
  id: string;
  /** 'YYYY-MM-DD' */
  day: string;
  authorName: string;
  commitCount: number;
  filesChanged: number;
  insertions: number;
  deletions: number;
  areas: string[];
  /** 그날 첫 커밋 제목. 목록에서 한 줄로 요약하는 몫이다. */
  headline: string;
  hasNote: boolean;
};

const SORTS = [
  { value: 'new', label: '최신순' },
  { value: 'old', label: '오래된순' },
  { value: 'author', label: '사람순' },
  { value: 'size', label: '큰 작업순' },
] as const;

type Sort = (typeof SORTS)[number]['value'];

/**
 * 패치노트 목록 — 고르고, 찾고, 사람별로 묶어서 본다.
 *
 * 거르는 일은 전부 화면에서 한다. 하루에 한 장씩 쌓여도 한 해에 삼백 장이라
 * 서버를 다시 부를 것이 없고, 글자를 칠 때마다 결과가 따라오는 편이 훨씬
 * 빠르게 느껴진다.
 */
export function PatchNoteList({ rows }: { rows: PatchRow[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [who, setWho] = useState<string>('all');

  /* 누가 있는지는 기록에서 뽑는다 — 사람이 늘면 칸도 저절로 는다 */
  const people = useMemo(
    () => [...new Set(rows.map((r) => r.authorName))].sort((a, b) => a.localeCompare(b, 'ko')),
    [rows]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (who !== 'all' && r.authorName !== who) return false;
      if (!q) return true;
      /* 이름·날짜·한 일·건드린 자리 — 기억나는 어느 쪽으로 쳐도 걸리게 */
      return (
        r.authorName.toLowerCase().includes(q) ||
        r.day.includes(q) ||
        r.headline.toLowerCase().includes(q) ||
        r.areas.some((a) => a.toLowerCase().includes(q))
      );
    });

    const sorted = [...filtered];
    if (sort === 'new') sorted.sort((a, b) => b.day.localeCompare(a.day));
    if (sort === 'old') sorted.sort((a, b) => a.day.localeCompare(b.day));
    if (sort === 'author')
      sorted.sort(
        (a, b) => a.authorName.localeCompare(b.authorName, 'ko') || b.day.localeCompare(a.day)
      );
    /* 큰 작업순 — 고친 줄 수로 잰다. 커밋 수는 사람마다 쪼개는 버릇이 달라 못 믿는다. */
    if (sort === 'size')
      sorted.sort((a, b) => b.insertions + b.deletions - (a.insertions + a.deletions));
    return sorted;
  }, [rows, query, sort, who]);

  /*
   * 달별로 묶는다.
   *
   * 날짜별로 묶으면 한 줄짜리 묶음이 수십 개 생긴다 — 한 장이 이미 하루치라서
   * 날짜가 곧 그 줄이다. 달이 한 단계 위라 머리글 몫을 한다.
   *
   * 사람순·큰 작업순일 때는 묶지 않는다. 그 순서로 늘어놓으면 같은 달이
   * 여기저기 흩어져 머리글만 늘어난다.
   */
  const byMonth = useMemo(() => {
    if (sort !== 'new' && sort !== 'old') return null;
    const map = new Map<string, PatchRow[]>();
    for (const r of shown) {
      const month = r.day.slice(0, 7);
      const list = map.get(month);
      if (list) list.push(r);
      else map.set(month, [r]);
    }
    return [...map.entries()];
  }, [shown, sort]);

  return (
    <div className="space-y-4">
      {/* ── 고르는 줄 ───────────────────────────────── */}
      <Card className="space-y-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 날짜 · 한 일 · 고친 자리로 찾기"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Chips
            label="순서"
            icon={<ArrowUpDown className="h-3 w-3" />}
            options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
            current={sort}
            onPick={(v) => setSort(v as Sort)}
          />

          {people.length > 1 && (
            <Chips
              label="사람"
              options={[
                { value: 'all', label: '전체' },
                ...people.map((p) => ({ value: p, label: p })),
              ]}
              current={who}
              onPick={setWho}
            />
          )}
        </div>

        <p className="text-xs text-muted/70">
          {shown.length}장{shown.length !== rows.length && ` (전체 ${rows.length}장 중)`}
        </p>
      </Card>

      {/* ── 목록 ────────────────────────────────────── */}
      {shown.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? '아직 기록이 없습니다' : '찾는 것이 없습니다'}
          description={
            rows.length === 0
              ? '코드를 올리면 깃 기록에서 저절로 채워집니다.'
              : '다른 말로 찾아보세요.'
          }
        />
      ) : byMonth ? (
        <div key={`${sort}|${who}|m`} className="space-y-5">
          {byMonth.map(([month, list]) => (
            <section key={month} className="space-y-2">
              <h2 className="px-1 text-xs font-semibold tracking-normal text-muted">
                {spokenMonth(month)}
                <span className="ml-2 font-normal text-muted/60">{list.length}장</span>
              </h2>
              <ul className="space-y-2">
                {list.map((r, i) => (
                  <Row key={r.id} row={r} at={i} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul key={`${sort}|${who}`} className="space-y-2">
          {shown.map((r, i) => (
            <Row key={r.id} row={r} at={i} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** 한 줄 — 눌러서 들어간다. `at` 은 몇 번째로 올라올지. */
function Row({ row, at }: { row: PatchRow; at: number }) {
  /* 자리는 셋까지만. 스무 개짜리 하루는 줄이 두 번 접혀 날짜가 안 보인다. */
  const areas = row.areas.slice(0, 3);
  const more = row.areas.length - areas.length;

  return (
    <li className="motion-safe:animate-row-in" style={{ '--row': at } as React.CSSProperties}>
      <Link
        href={`/admin/patch-notes/${row.id}`}
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors duration-75 hover:border-sky-soft hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-ink">{spokenDay(row.day)}</span>
            <span className="text-xs text-muted">{row.authorName}</span>
            {row.hasNote && <StickyNote aria-hidden className="h-3 w-3 shrink-0 text-sky" />}
          </span>

          {row.headline && (
            <span className="mt-1 block truncate text-xs text-muted">{row.headline}</span>
          )}

          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {areas.map((a) => (
              <span
                key={a}
                className="rounded-md border border-line-strong px-1.5 py-0.5 text-[10px] text-muted"
              >
                {a}
              </span>
            ))}
            {more > 0 && <span className="text-[10px] text-muted/60">외 {more}곳</span>}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="flex items-center justify-end gap-1 text-xs text-muted">
            <GitCommitHorizontal aria-hidden className="h-3.5 w-3.5" />
            {row.commitCount}
          </span>
          <span className="mt-0.5 block font-mono text-[10px] whitespace-nowrap">
            <span className="text-sky">+{row.insertions}</span>{' '}
            <span className="text-danger">−{row.deletions}</span>
          </span>
        </span>

        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}

/** 고르는 칩 한 줄 */
function Chips({
  label,
  icon,
  options,
  current,
  onPick,
}: {
  label: string;
  icon?: React.ReactNode;
  options: { value: string; label: string }[];
  current: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
        {icon}
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(o.value)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition-colors duration-75 ${
                on
                  ? 'border-sky bg-sky/10 font-medium text-sky'
                  : 'border-line text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** '9월 24일 (수)' */
function spokenDay(day: string) {
  const d = new Date(`${day}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

/** '2026년 9월' — 머리글용 */
function spokenMonth(month: string) {
  const [y, m] = month.split('-');
  return `${y}년 ${Number(m)}월`;
}
