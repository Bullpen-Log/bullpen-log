'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileText,
  FileVideo,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react';
import { Modal } from '@/components/modal';
import { FormError } from '@/components/ui';
import type {
  AdminDay,
  AdminPitchRow,
  AdminSessionRow,
  AdminTreeYear,
} from '@/lib/velocity-admin-load';
import {
  CONFIDENCE_TEXT,
  pitchTypeLabel,
  sessionSetupText,
  type ConfidenceKey,
} from '@/lib/velocity-meta';
import { quietRefresh } from '@/lib/quiet-refresh';
import { dayShortLabel, errorTone, signed } from './format';
import {
  ancestorsOf,
  explorerHref,
  parentOf,
  type ExplorerPath,
} from './explorer-path';
import { DriveGlyph, FolderGlyph, PitchFileGlyph } from './explorer-glyphs';
import {
  FolderStatPanel,
  PitchPreview,
  SessionPanel,
  pitchName,
  sessionName,
  sessionStat,
  type FolderStat,
  type Run,
} from './explorer-panels';

/**
 * 구속 측정 탐색기 — PC 파일 탐색기처럼 폴더를 열어 가며 찾는다.
 *
 *   구속 측정 › 2026년 › 9월 › 28일 (일) › 12:00 · 금윤호 › 03번 공
 *
 * 위 도구 줄 — 뒤로 · 앞으로 · 위로 · 주소 줄 · 이 폴더에서 찾기 · 보기(큰 아이콘 | 자세히).
 * 넓은 화면 — [폴더 트리 | 내용 | 미리보기] 세 칸, 맨 밑 상태 줄. 휴대폰 — 트리를 숨기고 주소 줄로
 * 다니며, 공 파일을 누르면 미리보기가 창으로 뜬다.
 *
 * 폴더를 누르면 연다(주소가 바뀌어 뒤로 · 앞으로 · 새로고침이 된다). 공 파일은 누르면 골라서
 * 미리보기에 연다 — 영상 · 값 · 스피드건 입력 · 보정에서 빼기 · 다시 재기 · 지우기.
 * 폴더가 바뀌면 부모가 key 를 바꿔 이 부품을 새로 만든다(고른 것 · 정렬 · 찾기가 초기화된다).
 */

type Item =
  | {
      kind: 'folder';
      id: string;
      name: string;
      sub: string;
      path: ExplorerPath;
      stat: FolderStat;
      setup?: string;
      calib?: boolean;
    }
  | {
      kind: 'file';
      id: string;
      name: string;
      sub: string;
      pitch: AdminPitchRow;
      session: AdminSessionRow;
    };

type Col = {
  key: string;
  label: string;
  className?: string;
  cell: (it: Item) => ReactNode;
  /** 정렬 값 — 없으면 null(방향과 상관없이 맨 아래) */
  sort: (it: Item) => number | string | null;
};

/* ── 보기(큰 아이콘 | 자세히) — 이 브라우저에 기억 ── */
const VIEW_KEY = 'bullpen-velocity-explorer-view';
const VIEW_EVENT = 'bullpen:velocity-explorer-view';
type ViewMode = 'icons' | 'details';
const subscribeView = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(VIEW_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(VIEW_EVENT, cb);
  };
};
const readView = (): ViewMode => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'details' ? 'details' : 'icons';
  } catch {
    return 'icons';
  }
};
function saveView(v: ViewMode) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* 사생활 보호 모드 — 이번만 */
  }
  window.dispatchEvent(new Event(VIEW_EVENT));
}

/* ── 넓은 화면(미리보기 칸이 있는 화면)인가 ── */
const DESKTOP_MEDIA = '(min-width: 64rem)';
const subscribeMedia = (cb: () => void) => {
  const m = window.matchMedia(DESKTOP_MEDIA);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

const monthName = (key: string) => `${Number(key.slice(5, 7))}월`;
const folderSub = (s: FolderStat, withSessions: boolean) =>
  [
    withSessions && s.sessions != null ? `세션 ${s.sessions}` : null,
    `${s.pitches}구`,
    s.pairs ? `짝 ${s.pairs}` : null,
    s.biasKmh != null ? `편향 ${signed(s.biasKmh)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

export function VelocityExplorer({
  tree,
  rootStat,
  path,
  day,
  initialPick,
}: {
  tree: AdminTreeYear[];
  rootStat: FolderStat;
  path: ExplorerPath;
  /** 날짜 · 세션 폴더일 때 그날 자료(세션 · 공 · 클립 주소) */
  day: AdminDay | null;
  initialPick: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [pick, setPickState] = useState<string | null>(initialPick);
  const view = useSyncExternalStore(subscribeView, readView, (): ViewMode => 'icons');
  const desktop = useSyncExternalStore(
    subscribeMedia,
    () => window.matchMedia(DESKTOP_MEDIA).matches,
    () => true
  );

  /* 트리에서 펼친 폴더 — 처음에는 지금 폴더까지 */
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (path.level !== 'root') s.add(path.year);
    if (path.level === 'month' || path.level === 'day' || path.level === 'session')
      s.add(path.month);
    return s;
  });
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** 액션을 돌리고 새로 받는다 — 실패하면 위에 한 줄 */
  const run: Run = (action, after) => {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      after?.();
      quietRefresh(router);
    });
  };

  /* 고른 파일 — 주소에도 적어 새로고침 · 링크로 다시 연다(서버를 다시 부르지 않는 replaceState) */
  const setPick = (id: string | null) => {
    setPickState(id);
    try {
      window.history.replaceState(null, '', explorerHref(path, id));
    } catch {
      /* 무시 */
    }
  };

  /* ── 지금 폴더 ── */
  const year =
    path.level !== 'root' ? tree.find((y) => y.key === path.year) : undefined;
  const month =
    path.level === 'month' || path.level === 'day' || path.level === 'session'
      ? year?.months.find((m) => m.key === path.month)
      : undefined;
  const session =
    path.level === 'session'
      ? (day?.sessions.find((s) => s.id === path.sessionId) ?? null)
      : null;

  const folderStat: FolderStat =
    path.level === 'root'
      ? rootStat
      : path.level === 'year'
        ? (year?.stat ?? rootStatEmpty)
        : path.level === 'month'
          ? (month?.stat ?? rootStatEmpty)
          : path.level === 'day'
            ? (day?.stat ?? rootStatEmpty)
            : session
              ? sessionStat(session)
              : rootStatEmpty;

  const label = (p: ExplorerPath): string => {
    switch (p.level) {
      case 'root':
        return '구속 측정';
      case 'year':
        return `${p.year}년`;
      case 'month':
        return monthName(p.month);
      case 'day':
        return dayShortLabel(p.date);
      case 'session': {
        const s = day?.sessions.find((x) => x.id === p.sessionId);
        return s ? sessionName(s) : '세션';
      }
    }
  };

  /* ── 폴더 안의 것 ── */
  const items: Item[] = useMemo(() => {
    switch (path.level) {
      case 'root':
        return tree.map((y) => ({
          kind: 'folder' as const,
          id: y.key,
          name: `${y.key}년`,
          sub: folderSub(y.stat, true),
          path: { level: 'year' as const, year: y.key },
          stat: y.stat,
        }));
      case 'year':
        return (year?.months ?? []).map((m) => ({
          kind: 'folder' as const,
          id: m.key,
          name: monthName(m.key),
          sub: folderSub(m.stat, true),
          path: { level: 'month' as const, year: path.year, month: m.key },
          stat: m.stat,
        }));
      case 'month':
        return (month?.days ?? []).map((d) => ({
          kind: 'folder' as const,
          id: d.date,
          name: dayShortLabel(d.date),
          sub: folderSub(d, true),
          path: {
            level: 'day' as const,
            year: path.year,
            month: path.month,
            date: d.date,
          },
          stat: d,
        }));
      case 'day':
        return (day?.sessions ?? []).map((s) => {
          const stat = sessionStat(s);
          return {
            kind: 'folder' as const,
            id: s.id,
            name: sessionName(s),
            sub: [sessionSetupText(s), folderSub(stat, false)].join(' · '),
            path: {
              level: 'session' as const,
              year: path.year,
              month: path.month,
              date: path.date,
              sessionId: s.id,
            },
            stat,
            setup: sessionSetupText(s),
            calib: s.forCalibration,
          };
        });
      case 'session':
        return (session?.pitches ?? []).map((p) => {
          const diff =
            p.gunKmh == null
              ? null
              : Math.round(((p.releaseKmh ?? p.kmh) - p.gunKmh) * 10) / 10;
          return {
            kind: 'file' as const,
            id: p.id,
            name: pitchName(p),
            sub: [
              p.gunKmh != null ? `건 ${p.gunKmh} · ${signed(diff)}` : '건 —',
              pitchTypeLabel(p.pitchType),
              p.calibExclude ? '보정 제외' : null,
            ]
              .filter(Boolean)
              .join(' · '),
            pitch: p,
            session: session as AdminSessionRow,
          };
        });
    }
  }, [path, tree, year, month, day, session]);

  /* ── 자세히 보기의 칸 ── */
  const cols: Col[] = useMemo(
    () => (path.level === 'session' ? fileCols : folderCols(path.level === 'day')),
    [path.level]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((it) => `${it.name} ${it.sub}`.toLowerCase().includes(q))
      : items;
    if (!sort) return list;
    const col = cols.find((c) => c.key === sort.key);
    if (!col) return list;
    return [...list].sort((a, b) => {
      const x = col.sort(a);
      const y = col.sort(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [items, query, sort, cols]);

  /* 주소 줄이 넘치면(휴대폰) 끝 — 지금 폴더 — 이 보이게 오른쪽으로 민다 */
  const crumbRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = crumbRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const picked =
    pick && session ? (session.pitches.find((p) => p.id === pick) ?? null) : null;
  const up = path.level === 'root' ? null : explorerHref(parentOf(path));
  const crumbs = ancestorsOf(path);

  const open = (it: Item) => {
    if (it.kind === 'folder') router.push(explorerHref(it.path));
    else setPick(it.id === pick ? null : it.id);
  };

  const deletedPitch = () => setPick(null);
  const deletedSession = () => router.push(explorerHref(parentOf(path)));

  /* 오른쪽 칸 — 고른 파일 · 세션 정보 · 폴더 통계 */
  const detail = picked ? (
    <PitchPreview
      key={`${picked.id}:${picked.gunKmh ?? ''}`}
      session={session as AdminSessionRow}
      pitch={picked}
      pending={pending}
      onRun={run}
      onDeleted={deletedPitch}
    />
  ) : session ? (
    <SessionPanel
      key={session.id}
      session={session}
      pending={pending}
      onRun={run}
      onDeleted={deletedSession}
    />
  ) : (
    <FolderStatPanel
      title={label(path)}
      subtitle={path.level === 'root' ? '모든 계정 · 모든 날' : undefined}
      stat={folderStat}
    />
  );

  return (
    <section
      aria-label="구속 측정 탐색기"
      className="overflow-hidden rounded-2xl border border-line bg-surface"
    >
      {/* ── 도구 줄 ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/70 px-2.5 py-2">
        <div className="flex items-center">
          <ToolButton label="뒤로" onClick={() => router.back()}>
            <ArrowLeft aria-hidden className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="앞으로" onClick={() => router.forward()}>
            <ArrowRight aria-hidden className="h-4 w-4" />
          </ToolButton>
          {up ? (
            <Link
              href={up}
              prefetch={false}
              aria-label="위 폴더로"
              title="위 폴더로"
              className={TOOL_BTN}
            >
              <ArrowUp aria-hidden className="h-4 w-4" />
            </Link>
          ) : (
            <span aria-hidden className={`${TOOL_BTN} opacity-30`}>
              <ArrowUp className="h-4 w-4" />
            </span>
          )}
        </div>

        {/* 주소 줄 — 휴대폰은 둘째 줄 한 칸 가득 */}
        <nav
          ref={crumbRef}
          aria-label="지금 위치"
          className="no-scrollbar order-last flex h-9 min-w-0 basis-full items-center overflow-x-auto rounded-lg border border-line bg-surface px-1 text-sm sm:order-none sm:flex-1 sm:basis-0"
        >
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={explorerHref(c)} className="flex shrink-0 items-center">
                {i > 0 && (
                  <ChevronRight aria-hidden className="mx-0.5 h-3.5 w-3.5 text-muted" />
                )}
                <Link
                  href={explorerHref(c)}
                  prefetch={false}
                  aria-current={last ? 'location' : undefined}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-surface-2 ${
                    last ? 'font-semibold text-ink' : 'text-muted'
                  }`}
                >
                  {i === 0 && <DriveGlyph />}
                  {label(c)}
                </Link>
              </span>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <label className="relative block min-w-0 flex-1 sm:flex-none">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이 폴더에서 찾기"
              aria-label="이 폴더에서 찾기"
              className="h-9 w-full min-w-0 rounded-lg border border-line bg-surface pl-8 pr-2 text-sm text-ink placeholder:text-muted/70 focus:border-sky focus:outline-none sm:w-44"
            />
          </label>
          <div
            role="radiogroup"
            aria-label="보기"
            className="flex shrink-0 rounded-lg border border-line bg-surface p-0.5"
          >
            <button
              type="button"
              role="radio"
              aria-checked={view === 'icons'}
              aria-label="큰 아이콘"
              title="큰 아이콘"
              onClick={() => saveView('icons')}
              className={`inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                view === 'icons' ? 'bg-sky-tint text-sky' : 'text-muted hover:text-ink'
              }`}
            >
              <LayoutGrid aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === 'details'}
              aria-label="자세히"
              title="자세히"
              onClick={() => saveView('details')}
              className={`inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                view === 'details'
                  ? 'bg-sky-tint text-sky'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <List aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="border-b border-line px-3 py-2">
          <FormError>{error}</FormError>
        </div>
      )}

      {/* ── 트리 | 내용 | 미리보기 ── */}
      <div className="lg:grid lg:h-[min(38rem,calc(100dvh-10rem))] lg:grid-cols-[13.5rem_minmax(0,1fr)_20rem]">
        <aside
          aria-label="폴더 트리"
          className="hidden overflow-y-auto border-r border-line px-1.5 py-2 lg:block"
        >
          <TreeRow
            depth={0}
            label="구속 측정"
            href={explorerHref({ level: 'root' })}
            active={path.level === 'root'}
            icon={<DriveGlyph className="h-4 w-4 shrink-0" />}
          />
          {tree.map((y) => {
            const yOpen = expanded.has(y.key);
            return (
              <div key={y.key}>
                <TreeRow
                  depth={1}
                  label={`${y.key}년`}
                  count={y.stat.pitches}
                  href={explorerHref({ level: 'year', year: y.key })}
                  active={path.level === 'year' && path.year === y.key}
                  open={yOpen}
                  onToggle={() => toggle(y.key)}
                />
                {yOpen &&
                  y.months.map((m) => {
                    const mOpen = expanded.has(m.key);
                    return (
                      <div key={m.key}>
                        <TreeRow
                          depth={2}
                          label={monthName(m.key)}
                          count={m.stat.pitches}
                          href={explorerHref({
                            level: 'month',
                            year: y.key,
                            month: m.key,
                          })}
                          active={path.level === 'month' && path.month === m.key}
                          open={mOpen}
                          onToggle={() => toggle(m.key)}
                        />
                        {mOpen &&
                          m.days.map((d) => {
                            const dayPath: ExplorerPath = {
                              level: 'day',
                              year: y.key,
                              month: m.key,
                              date: d.date,
                            };
                            const here =
                              (path.level === 'day' || path.level === 'session') &&
                              path.date === d.date;
                            return (
                              <div key={d.date}>
                                <TreeRow
                                  depth={3}
                                  label={dayShortLabel(d.date)}
                                  count={d.pitches}
                                  href={explorerHref(dayPath)}
                                  active={path.level === 'day' && path.date === d.date}
                                />
                                {/* 지금 연 날짜는 그 안의 세션까지 */}
                                {here &&
                                  day?.sessions.map((s) => (
                                    <TreeRow
                                      key={s.id}
                                      depth={4}
                                      label={sessionName(s)}
                                      count={s.pitches.length}
                                      href={explorerHref({
                                        ...dayPath,
                                        level: 'session',
                                        sessionId: s.id,
                                      })}
                                      active={
                                        path.level === 'session' &&
                                        path.sessionId === s.id
                                      }
                                      calib={s.forCalibration}
                                    />
                                  ))}
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </aside>

        <div className="min-w-0 lg:overflow-y-auto">
          {/* 휴대폰 — 세션 폴더의 정보 · 메모 · 지우기를 접어 둔다(넓은 화면은 오른쪽 칸) */}
          {session && (
            <details className="group border-b border-line lg:hidden">
              <summary className="flex h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold text-ink">
                <ChevronDown
                  aria-hidden
                  className="h-4 w-4 -rotate-90 text-muted transition-transform group-open:rotate-0"
                />
                세션 정보 · 메모 · 지우기
              </summary>
              <div className="px-3 pb-4">
                <SessionPanel
                  key={session.id}
                  session={session}
                  pending={pending}
                  onRun={run}
                  onDeleted={deletedSession}
                />
              </div>
            </details>
          )}

          {shown.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-muted">
              {query.trim()
                ? `'${query.trim()}' 이(가) 든 항목이 없어요.`
                : path.level === 'root'
                  ? '아직 잰 자료가 없어요. 구속 측정 시작이나 영상 파일로 재기로 첫 자료를 만들어요.'
                  : '이 폴더는 비어 있어요.'}
            </p>
          ) : view === 'icons' ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-1.5 p-2.5 sm:grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] sm:gap-2 sm:p-3">
              {shown.map((it) => (
                <li key={it.id}>
                  <Tile
                    item={it}
                    selected={it.kind === 'file' && it.id === pick}
                    onOpen={() => open(it)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-1 bg-surface text-left text-xs text-muted">
                <tr className="border-b border-line">
                  {cols.map((c) => {
                    const on = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        className={`px-3 py-2 font-medium ${c.className ?? ''}`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSort((prev) =>
                              prev?.key === c.key
                                ? prev.dir === 1
                                  ? { key: c.key, dir: -1 }
                                  : null
                                : { key: c.key, dir: 1 }
                            )
                          }
                          className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-ink ${on ? 'text-ink' : ''}`}
                        >
                          {c.label}
                          {on && (sort?.dir === 1 ? '▲' : '▼')}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((it) => {
                  const selected = it.kind === 'file' && it.id === pick;
                  return (
                    <tr
                      key={it.id}
                      onClick={() => open(it)}
                      aria-selected={selected || undefined}
                      className={`cursor-pointer border-b border-line/70 transition-colors last:border-b-0 ${
                        selected ? 'bg-sky-tint' : 'hover:bg-surface-2'
                      }`}
                    >
                      {cols.map((c) => (
                        <td
                          key={c.key}
                          className={`whitespace-nowrap px-3 py-2 align-middle tabular-nums ${c.className ?? ''}`}
                        >
                          {c.cell(it)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <aside
          aria-label="미리보기"
          className="hidden overflow-y-auto border-l border-line p-4 lg:block"
        >
          {detail}
        </aside>
      </div>

      {/* ── 상태 줄 ── */}
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line bg-surface-2/70 px-3 py-1.5 text-xs text-muted">
        <span>
          항목 {shown.length}개{shown.length !== items.length && ` / ${items.length}개`}
        </span>
        <span className="tabular-nums">
          공 {folderStat.pitches} · 짝 {folderStat.pairs} · 클립 {folderStat.clips}
        </span>
        {folderStat.biasKmh != null && (
          <span className="tabular-nums">
            편향{' '}
            <span className={errorTone(folderStat.biasKmh)}>
              {signed(folderStat.biasKmh)}
            </span>{' '}
            · p90 {folderStat.p90Kmh?.toFixed(1)} km/h
          </span>
        )}
        {picked && (
          <span className="font-semibold text-ink">선택: {pitchName(picked)}</span>
        )}
        {pending && <span className="ml-auto">저장 중…</span>}
      </footer>

      {/* 휴대폰 — 고른 파일은 창으로 */}
      <Modal
        open={!desktop && picked != null}
        onClose={() => setPick(null)}
        title={picked ? `${pitchName(picked)} · ${label(path)}` : '공'}
      >
        {!desktop && picked && (
          <div className="px-5 py-4">
            <PitchPreview
              key={`${picked.id}:${picked.gunKmh ?? ''}`}
              session={session as AdminSessionRow}
              pitch={picked}
              pending={pending}
              onRun={run}
              onDeleted={deletedPitch}
            />
          </div>
        )}
      </Modal>
    </section>
  );
}

const rootStatEmpty: FolderStat = {
  pitches: 0,
  pairs: 0,
  clips: 0,
  biasKmh: null,
  p90Kmh: null,
  sdKmh: null,
  maxKmh: null,
};

/* ───────────────────────── 도구 줄 단추 ───────────────────────── */

const TOOL_BTN =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink';

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={TOOL_BTN}
    >
      {children}
    </button>
  );
}

/* ───────────────────────── 트리 한 줄 ───────────────────────── */

function TreeRow({
  depth,
  label,
  href,
  active,
  count,
  open,
  onToggle,
  icon,
  calib,
}: {
  depth: number;
  label: string;
  href: string;
  active: boolean;
  count?: number;
  open?: boolean;
  onToggle?: () => void;
  icon?: ReactNode;
  calib?: boolean;
}) {
  return (
    <div className="flex items-center" style={{ paddingLeft: `${depth * 0.75}rem` }}>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `${label} 접기` : `${label} 펼치기`}
          aria-expanded={open}
          className="inline-flex h-7 w-5 shrink-0 items-center justify-center rounded text-muted hover:text-ink"
        >
          <ChevronRight
            aria-hidden
            className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      <Link
        href={href}
        prefetch={false}
        aria-current={active ? 'page' : undefined}
        className={`flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-sm transition-colors ${
          active ? 'bg-sky-tint font-semibold text-sky' : 'text-ink hover:bg-surface-2'
        }`}
      >
        {icon ?? (
          <FolderGlyph className="h-4 w-5 shrink-0" badge={calib ? 'calib' : null} />
        )}
        <span className="truncate">{label}</span>
        {count != null && (
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">
            {count}
          </span>
        )}
      </Link>
    </div>
  );
}

/* ───────────────────────── 큰 아이콘 한 칸 ───────────────────────── */

function Tile({
  item: it,
  selected,
  onOpen,
}: {
  item: Item;
  selected: boolean;
  onOpen: () => void;
}) {
  const body = (
    <>
      {it.kind === 'folder' ? (
        <FolderGlyph className="h-14 w-16" badge={it.calib ? 'calib' : null} />
      ) : (
        <PitchFileGlyph
          value={
            it.pitch.releaseKmh != null
              ? String(it.pitch.releaseKmh)
              : String(it.pitch.kmh)
          }
          hasClip={!!it.pitch.clipPath}
          excluded={it.pitch.calibExclude}
        />
      )}
      <span className="line-clamp-2 w-full break-keep text-sm font-semibold leading-snug text-ink">
        {it.name}
      </span>
      <span className="line-clamp-2 w-full break-keep text-xs leading-snug text-muted">
        {it.sub}
      </span>
    </>
  );
  const cls = `flex h-full w-full flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-colors duration-75 focus-visible:outline-2 focus-visible:outline-sky ${
    selected
      ? 'border-sky-soft bg-sky-tint'
      : 'border-transparent hover:border-line hover:bg-surface-2'
  }`;
  if (it.kind === 'folder') {
    return (
      <Link href={explorerHref(it.path)} prefetch={false} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-pressed={selected} className={cls}>
      {body}
    </button>
  );
}

/* ───────────────────────── 자세히 보기의 칸 ───────────────────────── */

function NameCell({ it }: { it: Item }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {it.kind === 'folder' ? (
        <FolderGlyph className="h-5 w-6 shrink-0" badge={it.calib ? 'calib' : null} />
      ) : it.pitch.clipPath ? (
        <FileVideo
          aria-hidden
          className={`h-5 w-5 shrink-0 ${it.pitch.calibExclude ? 'text-muted' : 'text-sky'}`}
        />
      ) : (
        <FileText aria-hidden className="h-5 w-5 shrink-0 text-muted" />
      )}
      {it.kind === 'folder' ? (
        <Link
          href={explorerHref(it.path)}
          prefetch={false}
          onClick={(e) => e.stopPropagation()}
          className="truncate font-semibold text-ink hover:text-sky"
        >
          {it.name}
        </Link>
      ) : (
        <span className="truncate font-semibold text-ink">{it.name}</span>
      )}
    </span>
  );
}

const statOf = (it: Item): FolderStat | null => (it.kind === 'folder' ? it.stat : null);
const dash = (v: number | null | undefined, digits?: number) =>
  v == null ? '—' : digits != null ? v.toFixed(digits) : String(v);

function folderCols(daySessions: boolean): Col[] {
  return [
    {
      key: 'name',
      label: '이름',
      cell: (it) => <NameCell it={it} />,
      sort: (it) => it.name,
    },
    daySessions
      ? {
          key: 'setup',
          label: '설정',
          className: 'hidden md:table-cell lg:hidden xl:table-cell text-xs text-muted',
          cell: (it) => (it.kind === 'folder' ? (it.setup ?? '—') : '—'),
          sort: (it) => (it.kind === 'folder' ? (it.setup ?? '') : ''),
        }
      : {
          key: 'sessions',
          label: '세션',
          className: 'hidden md:table-cell',
          cell: (it) => dash(statOf(it)?.sessions),
          sort: (it) => statOf(it)?.sessions ?? null,
        },
    {
      key: 'pitches',
      label: '공',
      cell: (it) => dash(statOf(it)?.pitches),
      sort: (it) => statOf(it)?.pitches ?? null,
    },
    {
      key: 'pairs',
      label: '짝',
      className: 'hidden sm:table-cell',
      cell: (it) => dash(statOf(it)?.pairs),
      sort: (it) => statOf(it)?.pairs ?? null,
    },
    {
      key: 'clips',
      label: '클립',
      className: 'hidden md:table-cell lg:hidden xl:table-cell',
      cell: (it) => dash(statOf(it)?.clips),
      sort: (it) => statOf(it)?.clips ?? null,
    },
    {
      key: 'bias',
      label: '편향',
      cell: (it) => {
        const b = statOf(it)?.biasKmh ?? null;
        return <span className={`font-semibold ${errorTone(b)}`}>{signed(b)}</span>;
      },
      sort: (it) => statOf(it)?.biasKmh ?? null,
    },
    {
      key: 'p90',
      label: 'p90',
      className: 'hidden sm:table-cell',
      cell: (it) => dash(statOf(it)?.p90Kmh, 1),
      sort: (it) => statOf(it)?.p90Kmh ?? null,
    },
  ];
}

const pitchOf = (it: Item) => (it.kind === 'file' ? it.pitch : null);
const diffOf = (p: AdminPitchRow | null) =>
  p && p.gunKmh != null
    ? Math.round(((p.releaseKmh ?? p.kmh) - p.gunKmh) * 10) / 10
    : null;

const fileCols: Col[] = [
  {
    key: 'name',
    label: '이름',
    cell: (it) => <NameCell it={it} />,
    sort: (it) => pitchOf(it)?.seq ?? 0,
  },
  {
    key: 'raw',
    label: '카메라',
    className: 'hidden md:table-cell lg:hidden xl:table-cell text-muted',
    cell: (it) => {
      const p = pitchOf(it);
      return p ? (p.manual ? `수기 ${p.kmh}` : `${p.rawKmh} → ${p.kmh}`) : '—';
    },
    sort: (it) => pitchOf(it)?.kmh ?? null,
  },
  {
    key: 'release',
    label: '릴리스',
    cell: (it) => (
      <span className="font-semibold text-ink">{dash(pitchOf(it)?.releaseKmh)}</span>
    ),
    sort: (it) => pitchOf(it)?.releaseKmh ?? null,
  },
  {
    key: 'gun',
    label: '건',
    className: 'hidden sm:table-cell',
    cell: (it) => dash(pitchOf(it)?.gunKmh),
    sort: (it) => pitchOf(it)?.gunKmh ?? null,
  },
  {
    key: 'diff',
    label: '차이',
    cell: (it) => {
      const d = diffOf(pitchOf(it));
      return <span className={`font-semibold ${errorTone(d)}`}>{signed(d)}</span>;
    },
    sort: (it) => diffOf(pitchOf(it)) ?? null,
  },
  {
    key: 'conf',
    label: '신뢰도',
    className: 'hidden 2xl:table-cell text-xs text-muted',
    cell: (it) => {
      const p = pitchOf(it);
      return p
        ? (
            CONFIDENCE_TEXT[p.confidence as ConfidenceKey] ?? CONFIDENCE_TEXT.medium
          ).replace('신뢰도 ', '')
        : '—';
    },
    sort: (it) => pitchOf(it)?.confidence ?? '',
  },
  {
    key: 'type',
    label: '구종',
    className: 'hidden md:table-cell lg:hidden xl:table-cell text-muted',
    cell: (it) => pitchTypeLabel(pitchOf(it)?.pitchType ?? null) ?? '—',
    sort: (it) => pitchOf(it)?.pitchType ?? '',
  },
  {
    key: 'clip',
    label: '영상',
    className: 'hidden sm:table-cell text-muted',
    cell: (it) => (pitchOf(it)?.clipPath ? '있음' : '—'),
    sort: (it) => (pitchOf(it)?.clipPath ? 1 : 0),
  },
];
