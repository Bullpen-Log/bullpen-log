'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Fragment,
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
  AdminCalibMonth,
  AdminCalibResultRow,
  AdminCalibRunSummary,
  AdminCalibRunView,
  AdminCalibYear,
  AdminDay,
  AdminPitchRow,
  AdminSessionRow,
  AdminTreeYear,
} from '@/lib/velocity-admin-load';
import {
  CONFIDENCE_TEXT,
  pitchTypeLabel,
  type ConfidenceKey,
} from '@/lib/velocity-meta';
import { reject, type RejectCode } from '@/lib/velocity-engine/validate';
import { quietRefresh } from '@/lib/quiet-refresh';
import { calibRunName, dayShortLabel, errorTone, hhmm, signed } from './format';
import {
  AREA_LABEL,
  ancestorsOf,
  explorerHref,
  gunGroupLabel,
  gunGroupOf,
  parentOf,
  samePath,
  type ExplorerPath,
} from './explorer-path';
import { DriveGlyph, FolderGlyph, PitchFileGlyph } from './explorer-glyphs';
import {
  CalibResultPanel,
  CalibRunPanel,
  FolderStatPanel,
  PitchPreview,
  pitchName,
  type FolderStat,
  type Run,
} from './explorer-panels';
import { CalibRunButton } from './calib-run-button';

/**
 * 구속 측정 탐색기 — PC 파일 탐색기처럼 폴더를 열어 가며 찾는다.
 *
 *   구속 측정 › 원본 › 2026년 › 9월 › 28일 (일) › 03번 공
 *   구속 측정 › 보정 › 2026년 › 9월 › 28일 (일) › 1차 보정 · 9/28 · v1.4.0 › 03번 공
 *
 * 맨 위는 [원본] · [보정] 두 폴더. 원본은 올라온 · 잰 값 그대로 — 날짜 폴더를 열면 세션 폴더 없이
 * 그날 공 파일이 바로 보인다(사용자 요청, 2026-09-28: 날짜에 들어가서 투구별로 또 들어갈 필요 없게).
 * 보정은 그날 영상들을 나중 모델로 다시 잰 결과가 차수마다 폴더로 쌓인다(N차 보정 · 보정일 · 모델).
 * 날짜 폴더의 공과 차수 폴더의 결과는 실제 스피드건 값 10km/h 그룹(140~149 · 130~139 …)으로 묶어
 * 보인다 — 값이 없는 공은 맨 뒤 '스피드건 없음'.
 *
 * 위 도구 줄 — 뒤로 · 앞으로 · 위로 · 주소 줄 · 이 폴더에서 찾기 · 보기(큰 아이콘 | 자세히) ·
 * (날짜 · 차수 폴더에서) 보정 재측정. 넓은 화면 — [폴더 트리 | 내용 | 미리보기] 세 칸, 맨 밑 상태 줄
 * (오른쪽 끝에 모델 버전). 휴대폰 — 트리를 숨기고 주소 줄로 다니며, 파일을 누르면 미리보기가 창으로 뜬다.
 *
 * 폴더를 누르면 연다(주소가 바뀌어 뒤로 · 앞으로 · 새로고침이 된다). 파일은 누르면 골라서
 * 미리보기에 연다 — 공은 영상 · 값 · 스피드건 입력 · 보정에서 빼기 · 다시 재기 · 지우기, 결과는
 * 원본 값과 다시 잰 값의 비교. 폴더가 바뀌면 부모가 key 를 바꿔 이 부품을 새로 만든다(고른 것 ·
 * 정렬 · 찾기가 초기화된다).
 */

type Item =
  | {
      kind: 'folder';
      id: string;
      name: string;
      sub: string;
      path: ExplorerPath;
      stat: FolderStat;
      /** 보정 차수 폴더 — 폴더에 보정 표시, 자세히 보기의 모델 · 보정일 */
      run?: AdminCalibRunSummary;
      /** 보정 영역의 연도 · 월 · 날짜 폴더 — 그 안의 차수 수 */
      runs?: number;
    }
  | {
      kind: 'file';
      id: string;
      name: string;
      sub: string;
      pitch: AdminPitchRow;
      session: AdminSessionRow;
    }
  | {
      /** 보정 차수 안의 결과 하나 — 원본 공을 다시 잰 값(id 는 결과의 id) */
      kind: 'result';
      id: string;
      name: string;
      sub: string;
      row: AdminCalibResultRow;
    };
type FolderItem = Extract<Item, { kind: 'folder' }>;
type FileLike = Exclude<Item, { kind: 'folder' }>;

/** 폴더 안의 한 묶음 — 스피드건 10km/h 그룹. 폴더만 든 곳은 이름 없는 묶음 하나 */
type Group = { key: string; label: string | null; items: Item[] };

type Col = {
  key: string;
  label: string;
  className?: string;
  cell: (it: Item) => ReactNode;
  /** 긴 글(거부 까닭)이 드는 칸 — 줄을 바꿔 휴대폰에서 표가 옆으로 넘치지 않게 */
  wrap?: boolean;
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

/* ───────────────────────── 글자 · 통계 ───────────────────────── */

const monthName = (key: string) => `${Number(key.slice(5, 7))}월`;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** ISO 시각 → '9/28'(한국 날짜) — 보정 폴더의 '마지막 보정일' */
const md = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(iso));

const folderSub = (s: FolderStat, withSessions: boolean) =>
  [
    withSessions && s.sessions != null ? `세션 ${s.sessions}` : null,
    `${s.pitches}구`,
    s.pairs ? `짝 ${s.pairs}` : null,
    s.biasKmh != null ? `편향 ${signed(s.biasKmh)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

const rootStatEmpty: FolderStat = {
  pitches: 0,
  pairs: 0,
  clips: 0,
  biasKmh: null,
  p90Kmh: null,
  sdKmh: null,
  maxKmh: null,
};

const runsOfMonth = (m: AdminCalibMonth) => m.days.flatMap((d) => d.runs);
const runsOfYear = (y: AdminCalibYear) => y.months.flatMap(runsOfMonth);
/** 가장 나중에 돌린 차수 */
const latestRun = (runs: AdminCalibRunSummary[]) =>
  runs.reduce<AdminCalibRunSummary | null>(
    (m, r) => (!m || r.createdAt > m.createdAt ? r : m),
    null
  );

/**
 * 보정 폴더의 통계 — 차수 요약을 합쳐 FolderStat 모양으로. 결과는 모두 클립에서 다시 잰 것이라
 * 클립 수 = 결과 수. 편향은 짝 수로 가중한 평균, p90 · 표준편차는 합칠 수 없어 짝이 든 차수가
 * 하나일 때만 그 값을 쓴다.
 */
function calibStat(runs: AdminCalibRunSummary[]): FolderStat {
  if (runs.length === 0) return rootStatEmpty;
  const pitches = runs.reduce((s, r) => s + r.results, 0);
  const pairs = runs.reduce((s, r) => s + r.pairs, 0);
  const withBias = runs.filter((r) => r.biasKmh != null && r.pairs > 0);
  const biasPairs = withBias.reduce((s, r) => s + r.pairs, 0);
  const bias = biasPairs
    ? withBias.reduce((s, r) => s + (r.biasKmh as number) * r.pairs, 0) / biasPairs
    : null;
  const one = withBias.length === 1 ? withBias[0] : null;
  return {
    pitches,
    pairs,
    clips: pitches,
    biasKmh: bias == null ? null : round1(bias),
    p90Kmh: one?.p90Kmh ?? null,
    sdKmh: one?.sdKmh ?? null,
    maxKmh: null,
  };
}

/** 결과의 다시 잰 값 — 릴리스 ?? 카메라(소수 한 자리). 거부면 null */
const remeasured = (r: AdminCalibResultRow) => {
  const v = r.ok ? (r.releaseKmh ?? r.rawKmh) : null;
  return v == null ? null : round1(v);
};
/** 다시 잰 값 − 스피드건 */
const resultDiff = (r: AdminCalibResultRow) => {
  const v = remeasured(r);
  return v != null && r.pitch.gunKmh != null ? round1(v - r.pitch.gunKmh) : null;
};
/** 거부 까닭 한 줄 — 엔진의 RejectCode 를 사람 말로. 모르는 코드는 그대로 */
const rejectText = (code: string | null) =>
  code
    ? ((reject(code as RejectCode).message as string | undefined) ?? code)
    : '까닭 없음';

/** 차수 폴더(결과 파일들이 있는 곳)의 통계 — 요약 값에 결과 줄로 클립 · 최고를 더한다 */
function runStat(r: AdminCalibRunView): FolderStat {
  const speeds = r.rows.map(remeasured).filter((v): v is number => v != null);
  return {
    ...calibStat([r]),
    clips: r.rows.filter((x) => x.pitch.clipPath).length,
    maxKmh: speeds.length ? Math.max(...speeds) : null,
  };
}

/* ───────────────────────── 항목 만들기 ───────────────────────── */

const folder = (f: Omit<FolderItem, 'kind'>): Item => ({ kind: 'folder', ...f });

const pitchDiff = (p: AdminPitchRow) =>
  p.gunKmh != null ? round1((p.releaseKmh ?? p.kmh) - p.gunKmh) : null;

/** 원본 날짜 폴더의 공 파일 — 세션이 폴더가 아니니 누구의 몇 시 세션인지를 설명에 적는다 */
function fileItem(p: AdminPitchRow, s: AdminSessionRow): Item {
  return {
    kind: 'file',
    id: p.id,
    name: pitchName(p),
    sub: [
      `${hhmm(s.createdAt)} ${s.nickname}`,
      p.gunKmh != null ? `건 ${p.gunKmh} · ${signed(pitchDiff(p))}` : '건 —',
      p.manual ? '수기' : null,
      pitchTypeLabel(p.pitchType),
      p.calibExclude ? '보정 제외' : null,
    ]
      .filter(Boolean)
      .join(' · '),
    pitch: p,
    session: s,
  };
}

/** 보정 차수 폴더의 결과 파일 — 이름은 원본 공과 같게 */
function resultItem(row: AdminCalibResultRow): Item {
  const v = remeasured(row);
  const gun = row.pitch.gunKmh;
  return {
    kind: 'result',
    id: row.id,
    name: pitchName(row.pitch),
    sub: !row.ok
      ? `거부 — ${rejectText(row.reject)}`
      : gun != null
        ? `다시 잼 ${v ?? '—'} → 건 ${gun} · ${signed(resultDiff(row))}`
        : `다시 잼 ${v ?? '—'} · 건 —`,
    row,
  };
}

const single = (items: Item[]): Group[] => [{ key: 'all', label: null, items }];

const gunOfItem = (it: Item) =>
  it.kind === 'file'
    ? it.pitch.gunKmh
    : it.kind === 'result'
      ? it.row.pitch.gunKmh
      : null;
const sessionOf = (it: Item) =>
  it.kind === 'file' ? it.session : it.kind === 'result' ? it.row.session : null;
const seqOf = (it: Item) =>
  it.kind === 'file' ? it.pitch.seq : it.kind === 'result' ? it.row.pitch.seq : 0;

/**
 * 스피드건 10km/h 그룹으로 묶는다 — 값이 큰 그룹부터(140, 130 …), '스피드건 없음'은 맨 뒤.
 * 그룹 안은 세션 시각 · 공 차례.
 */
function gunGroups(items: Item[]): Group[] {
  const sorted = [...items].sort((a, b) => {
    const sa = sessionOf(a)?.createdAt ?? '';
    const sb = sessionOf(b)?.createdAt ?? '';
    return sa < sb ? -1 : sa > sb ? 1 : seqOf(a) - seqOf(b);
  });
  const m = new Map<number | null, Item[]>();
  for (const it of sorted) {
    const g = gunGroupOf(gunOfItem(it));
    const list = m.get(g);
    if (list) list.push(it);
    else m.set(g, [it]);
  }
  return [...m.entries()]
    .sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : b - a))
    .map(([g, list]) => ({
      key: g == null ? 'none' : String(g),
      label: gunGroupLabel(g),
      items: list,
    }));
}

/* ───────────────────────── 탐색기 ───────────────────────── */

export function VelocityExplorer({
  tree,
  calibTree,
  rootStat,
  engineVersion,
  path,
  day,
  run,
  initialPick,
}: {
  tree: AdminTreeYear[];
  /** [보정] 영역 — 연도 › 월 › 날짜 › 차수 요약 */
  calibTree: AdminCalibYear[];
  rootStat: FolderStat;
  /** 지금 배포된 구속 측정 모델 버전 — 상태 줄 오른쪽 끝 */
  engineVersion: string;
  path: ExplorerPath;
  /** 날짜 · 차수 폴더일 때 그날 자료(세션 · 공 · 클립 주소) — 보정 재측정도 이것으로 돌린다 */
  day: AdminDay | null;
  /** 차수 폴더일 때 그 차수의 결과들 */
  run: AdminCalibRunView | null;
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

  /* 트리에서 펼친 폴더 — 처음에는 지금 폴더까지. 열쇠는 영역:폴더(원본 · 보정의 같은 달을 가른다) */
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (path.level === 'root') return s;
    s.add(path.area);
    if (path.level !== 'area') s.add(`${path.area}:${path.year}`);
    if (path.level === 'month' || path.level === 'day' || path.level === 'run')
      s.add(`${path.area}:${path.month}`);
    if ((path.level === 'day' || path.level === 'run') && path.area === 'calib')
      s.add(`calib:${path.date}`);
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
  const act: Run = (action, after) => {
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
  const area = path.level === 'root' ? null : path.area;
  /* 주소의 연도 · 월 · 날짜 — 폴더 찾기에 쓴다(맨 위 · 영역 폴더는 빈 값) */
  const atYear = path.level === 'root' || path.level === 'area' ? null : path.year;
  const atMonth =
    path.level === 'month' || path.level === 'day' || path.level === 'run'
      ? path.month
      : null;
  const atDate = path.level === 'day' || path.level === 'run' ? path.date : null;
  const year =
    area === 'orig' && atYear ? tree.find((y) => y.key === atYear) : undefined;
  const month =
    year && atMonth ? year.months.find((m) => m.key === atMonth) : undefined;
  const calibYear =
    area === 'calib' && atYear ? calibTree.find((y) => y.key === atYear) : undefined;
  const calibMonth =
    calibYear && atMonth ? calibYear.months.find((m) => m.key === atMonth) : undefined;
  const calibDay =
    calibMonth && atDate ? calibMonth.days.find((d) => d.date === atDate) : undefined;
  /** 차수 폴더의 요약 — 결과를 못 받았어도(지워진 차수) 이름은 트리에서 찾는다 */
  const runSummary: AdminCalibRunSummary | null =
    path.level === 'run'
      ? (run ?? calibDay?.runs.find((r) => r.id === path.runId) ?? null)
      : null;
  const allRuns = useMemo(() => calibTree.flatMap(runsOfYear), [calibTree]);
  /** 이 날짜에 다음 보정이 몇 차가 되는지 — 재측정 확인창에 적는다 */
  const nextPass = atDate
    ? allRuns
        .filter((r) => r.date === atDate)
        .reduce((m, r) => Math.max(m, r.pass), 0) + 1
    : undefined;

  const folderStat: FolderStat = (() => {
    switch (path.level) {
      case 'root':
        return rootStat;
      case 'area':
        return path.area === 'orig' ? rootStat : calibStat(allRuns);
      case 'year':
        return path.area === 'orig'
          ? (year?.stat ?? rootStatEmpty)
          : calibStat(calibYear ? runsOfYear(calibYear) : []);
      case 'month':
        return path.area === 'orig'
          ? (month?.stat ?? rootStatEmpty)
          : calibStat(calibMonth ? runsOfMonth(calibMonth) : []);
      case 'day':
        return path.area === 'orig'
          ? (day?.stat ?? rootStatEmpty)
          : calibStat(calibDay?.runs ?? []);
      case 'run':
        return run ? runStat(run) : calibStat(runSummary ? [runSummary] : []);
    }
  })();

  const label = (p: ExplorerPath): string => {
    switch (p.level) {
      case 'root':
        return '구속 측정';
      case 'area':
        return AREA_LABEL[p.area];
      case 'year':
        return `${p.year}년`;
      case 'month':
        return monthName(p.month);
      case 'day':
        return dayShortLabel(p.date);
      case 'run': {
        const r =
          runSummary?.id === p.runId
            ? runSummary
            : allRuns.find((x) => x.id === p.runId);
        return r ? calibRunName(r) : '보정';
      }
    }
  };

  /* ── 폴더 안의 것 — 묶음으로 ── */
  const groups: Group[] = useMemo(() => {
    switch (path.level) {
      case 'root': {
        const last = latestRun(allRuns);
        return single([
          folder({
            id: 'orig',
            name: AREA_LABEL.orig,
            sub: folderSub(rootStat, true),
            path: { level: 'area', area: 'orig' },
            stat: rootStat,
          }),
          folder({
            id: 'calib',
            name: AREA_LABEL.calib,
            sub: last
              ? `보정 ${allRuns.length}차례 · 마지막 ${md(last.createdAt)} · 모델 v${last.engineVersion}`
              : '아직 보정 없음',
            path: { level: 'area', area: 'calib' },
            stat: calibStat(allRuns),
            runs: allRuns.length,
          }),
        ]);
      }
      case 'area':
        return single(
          path.area === 'orig'
            ? tree.map((y) =>
                folder({
                  id: y.key,
                  name: `${y.key}년`,
                  sub: folderSub(y.stat, true),
                  path: { level: 'year', area: 'orig', year: y.key },
                  stat: y.stat,
                })
              )
            : calibTree.map((y) => {
                const rs = runsOfYear(y);
                return folder({
                  id: y.key,
                  name: `${y.key}년`,
                  sub: `보정 ${rs.length}차례`,
                  path: { level: 'year', area: 'calib', year: y.key },
                  stat: calibStat(rs),
                  runs: rs.length,
                });
              })
        );
      case 'year':
        return single(
          path.area === 'orig'
            ? (year?.months ?? []).map((m) =>
                folder({
                  id: m.key,
                  name: monthName(m.key),
                  sub: folderSub(m.stat, true),
                  path: { level: 'month', area: 'orig', year: path.year, month: m.key },
                  stat: m.stat,
                })
              )
            : (calibYear?.months ?? []).map((m) => {
                const rs = runsOfMonth(m);
                return folder({
                  id: m.key,
                  name: monthName(m.key),
                  sub: `보정 ${rs.length}차례`,
                  path: {
                    level: 'month',
                    area: 'calib',
                    year: path.year,
                    month: m.key,
                  },
                  stat: calibStat(rs),
                  runs: rs.length,
                });
              })
        );
      case 'month':
        return single(
          path.area === 'orig'
            ? (month?.days ?? []).map((d) =>
                folder({
                  id: d.date,
                  name: dayShortLabel(d.date),
                  sub: folderSub(d, true),
                  path: {
                    level: 'day',
                    area: 'orig',
                    year: path.year,
                    month: path.month,
                    date: d.date,
                  },
                  stat: d,
                })
              )
            : (calibMonth?.days ?? []).map((d) => {
                const last = latestRun(d.runs);
                return folder({
                  id: d.date,
                  name: dayShortLabel(d.date),
                  sub: `보정 ${d.runs.length}차례${last ? ` · 마지막 v${last.engineVersion}` : ''}`,
                  path: {
                    level: 'day',
                    area: 'calib',
                    year: path.year,
                    month: path.month,
                    date: d.date,
                  },
                  stat: calibStat(d.runs),
                  runs: d.runs.length,
                });
              })
        );
      case 'day':
        /* 원본 날짜 폴더 — 세션 폴더 없이 그날 공 전부, 스피드건 그룹으로 */
        if (path.area === 'orig')
          return gunGroups(
            (day?.sessions ?? []).flatMap((s) => s.pitches.map((p) => fileItem(p, s)))
          );
        /* 보정 날짜 폴더 — 차수 폴더들(최근 차수부터) */
        return single(
          (calibDay?.runs ?? []).map((r) =>
            folder({
              id: r.id,
              name: calibRunName(r),
              sub: `결과 ${r.results} · 짝 ${r.pairs} · 편향 ${signed(r.biasKmh)}`,
              path: {
                level: 'run',
                area: 'calib',
                year: path.year,
                month: path.month,
                date: path.date,
                runId: r.id,
              },
              stat: calibStat([r]),
              run: r,
            })
          )
        );
      case 'run':
        return gunGroups((run?.rows ?? []).map(resultItem));
    }
  }, [
    path,
    tree,
    calibTree,
    allRuns,
    rootStat,
    year,
    month,
    calibYear,
    calibMonth,
    calibDay,
    day,
    run,
  ]);

  /** 스피드건 그룹으로 묶인 폴더인가(원본 날짜 · 보정 차수) */
  const grouped =
    (path.level === 'day' && path.area === 'orig') || path.level === 'run';

  /* ── 자세히 보기의 칸 ── */
  const cols: Col[] = useMemo(() => {
    switch (path.level) {
      case 'root':
        return folderCols('root');
      case 'run':
        return resultCols;
      case 'day':
        return path.area === 'orig' ? fileCols : folderCols('runs');
      default:
        return folderCols(path.area);
    }
  }, [path]);

  /* 찾기는 항목을 거른 뒤 빈 묶음을 숨기고, 정렬은 묶음 안에서만 */
  const shown: Group[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const col = sort ? cols.find((c) => c.key === sort.key) : undefined;
    return groups
      .map((g) => {
        let list = q
          ? g.items.filter((it) => `${it.name} ${it.sub}`.toLowerCase().includes(q))
          : g.items;
        if (col && sort) {
          list = [...list].sort((a, b) => {
            const x = col.sort(a);
            const y = col.sort(b);
            if (x == null && y == null) return 0;
            if (x == null) return 1;
            if (y == null) return -1;
            return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
          });
        }
        return { ...g, items: list };
      })
      .filter((g) => g.items.length > 0);
  }, [groups, query, sort, cols]);
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const shownCount = shown.reduce((s, g) => s + g.items.length, 0);

  /* 주소 줄이 넘치면(휴대폰) 끝 — 지금 폴더 — 이 보이게 오른쪽으로 민다 */
  const crumbRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = crumbRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const picked: FileLike | null = useMemo(
    () =>
      pick
        ? (groups
            .flatMap((g) => g.items)
            .find((it): it is FileLike => it.kind !== 'folder' && it.id === pick) ??
          null)
        : null,
    [groups, pick]
  );
  const up = path.level === 'root' ? null : explorerHref(parentOf(path));
  const crumbs = ancestorsOf(path);

  const open = (it: Item) => {
    if (it.kind === 'folder') router.push(explorerHref(it.path));
    else setPick(it.id === pick ? null : it.id);
  };

  const deletedPitch = () => setPick(null);
  const deletedRun = () => router.push(explorerHref(parentOf(path)));
  /** 보정 재측정을 저장하면 그 차수 폴더로 */
  const savedRun = (runId: string) => {
    if (path.level !== 'day' && path.level !== 'run') return;
    router.push(
      explorerHref({
        level: 'run',
        area: 'calib',
        year: path.year,
        month: path.month,
        date: path.date,
        runId,
      })
    );
  };

  /* 오른쪽 칸 — 고른 공 · 고른 결과 · 차수 정보 · 폴더 통계 */
  const preview = (it: FileLike) =>
    it.kind === 'file' ? (
      <PitchPreview
        key={`${it.id}:${it.pitch.gunKmh ?? ''}`}
        session={it.session}
        pitch={it.pitch}
        pending={pending}
        onRun={act}
        onDeleted={deletedPitch}
        /* 접힌 세션 정보에서 세션을 지우면 — 고른 공도 같이 사라지니 선택을 풀고, act 가 새로 받는다 */
        onSessionDeleted={deletedPitch}
      />
    ) : run ? (
      <CalibResultPanel
        key={it.id}
        row={it.row}
        run={run}
        pending={pending}
        onRun={act}
      />
    ) : null;
  const detail = picked ? (
    preview(picked)
  ) : path.level === 'run' && run ? (
    <CalibRunPanel
      key={run.id}
      run={run}
      pending={pending}
      onRun={act}
      onDeleted={deletedRun}
    />
  ) : (
    <FolderStatPanel
      title={label(path)}
      subtitle={
        path.level === 'root' || (path.level === 'area' && path.area === 'orig')
          ? '모든 계정 · 모든 날'
          : path.level === 'area'
            ? '나중 모델로 다시 잰 결과 · 차수마다 폴더'
            : undefined
      }
      stat={folderStat}
    />
  );

  /* 상태 줄 오른쪽 끝의 모델 — 차수 폴더는 그 차수를 잰 모델(지금과 다르면 둘 다) */
  const modelText =
    runSummary && runSummary.engineVersion !== engineVersion
      ? `모델 v${runSummary.engineVersion} · 지금 v${engineVersion}`
      : `모델 v${runSummary?.engineVersion ?? engineVersion}`;
  const countWord = area === 'calib' ? '결과' : '공';

  const emptyText = query.trim()
    ? `'${query.trim()}' 이(가) 든 항목이 없어요.`
    : path.level === 'area' && path.area === 'orig'
      ? '아직 잰 자료가 없어요. 구속 측정 시작이나 영상 파일로 재기로 첫 자료를 만들어요.'
      : path.level === 'area'
        ? '아직 보정 재측정이 없어요. 원본의 날짜 폴더에서 보정 재측정을 눌러 그날 영상들을 지금 모델로 다시 재요.'
        : '이 폴더는 비어 있어요.';

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

        {/* 보정 재측정 — 그날 영상들을 지금 모델로 다시 재서 새 차수로 저장(날짜 · 차수 폴더에서).
            휴대폰은 찾기 칸을 밀지 않게 주소 줄 밑 제 줄에 */}
        {day && (path.level === 'day' || path.level === 'run') && (
          <div className="order-last flex basis-full justify-end sm:order-none sm:basis-auto">
            <CalibRunButton
              date={path.date}
              day={day}
              pending={pending}
              onRun={act}
              onSaved={savedRun}
              nextPass={nextPass}
            />
          </div>
        )}
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

          {/* 원본 — 연도 › 월 › 날짜(잎). 공은 트리에 넣지 않는다 */}
          <TreeRow
            depth={1}
            label={AREA_LABEL.orig}
            count={rootStat.pitches}
            href={explorerHref({ level: 'area', area: 'orig' })}
            active={samePath(path, { level: 'area', area: 'orig' })}
            open={expanded.has('orig')}
            onToggle={() => toggle('orig')}
          />
          {expanded.has('orig') &&
            tree.map((y) => {
              const yKey = `orig:${y.key}`;
              const yOpen = expanded.has(yKey);
              const yPath: ExplorerPath = { level: 'year', area: 'orig', year: y.key };
              return (
                <div key={yKey}>
                  <TreeRow
                    depth={2}
                    label={`${y.key}년`}
                    count={y.stat.pitches}
                    href={explorerHref(yPath)}
                    active={samePath(path, yPath)}
                    open={yOpen}
                    onToggle={() => toggle(yKey)}
                  />
                  {yOpen &&
                    y.months.map((m) => {
                      const mKey = `orig:${m.key}`;
                      const mOpen = expanded.has(mKey);
                      const mPath: ExplorerPath = {
                        ...yPath,
                        level: 'month',
                        month: m.key,
                      };
                      return (
                        <div key={mKey}>
                          <TreeRow
                            depth={3}
                            label={monthName(m.key)}
                            count={m.stat.pitches}
                            href={explorerHref(mPath)}
                            active={samePath(path, mPath)}
                            open={mOpen}
                            onToggle={() => toggle(mKey)}
                          />
                          {mOpen &&
                            m.days.map((d) => {
                              const dPath: ExplorerPath = {
                                ...mPath,
                                level: 'day',
                                date: d.date,
                              };
                              return (
                                <TreeRow
                                  key={d.date}
                                  depth={4}
                                  label={dayShortLabel(d.date)}
                                  count={d.pitches}
                                  href={explorerHref(dPath)}
                                  active={samePath(path, dPath)}
                                />
                              );
                            })}
                        </div>
                      );
                    })}
                </div>
              );
            })}

          {/* 보정 — 연도 › 월 › 날짜 › 차수 */}
          <TreeRow
            depth={1}
            label={AREA_LABEL.calib}
            count={allRuns.length}
            href={explorerHref({ level: 'area', area: 'calib' })}
            active={samePath(path, { level: 'area', area: 'calib' })}
            open={expanded.has('calib')}
            onToggle={() => toggle('calib')}
          />
          {expanded.has('calib') &&
            calibTree.map((y) => {
              const yKey = `calib:${y.key}`;
              const yOpen = expanded.has(yKey);
              const yPath: ExplorerPath = { level: 'year', area: 'calib', year: y.key };
              return (
                <div key={yKey}>
                  <TreeRow
                    depth={2}
                    label={`${y.key}년`}
                    count={y.runs}
                    href={explorerHref(yPath)}
                    active={samePath(path, yPath)}
                    open={yOpen}
                    onToggle={() => toggle(yKey)}
                  />
                  {yOpen &&
                    y.months.map((m) => {
                      const mKey = `calib:${m.key}`;
                      const mOpen = expanded.has(mKey);
                      const mPath: ExplorerPath = {
                        ...yPath,
                        level: 'month',
                        month: m.key,
                      };
                      return (
                        <div key={mKey}>
                          <TreeRow
                            depth={3}
                            label={monthName(m.key)}
                            count={m.runs}
                            href={explorerHref(mPath)}
                            active={samePath(path, mPath)}
                            open={mOpen}
                            onToggle={() => toggle(mKey)}
                          />
                          {mOpen &&
                            m.days.map((d) => {
                              const dKey = `calib:${d.date}`;
                              const dOpen = expanded.has(dKey);
                              const dPath: ExplorerPath = {
                                ...mPath,
                                level: 'day',
                                date: d.date,
                              };
                              return (
                                <div key={dKey}>
                                  <TreeRow
                                    depth={4}
                                    label={dayShortLabel(d.date)}
                                    count={d.runs.length}
                                    href={explorerHref(dPath)}
                                    active={samePath(path, dPath)}
                                    open={dOpen}
                                    onToggle={() => toggle(dKey)}
                                  />
                                  {dOpen &&
                                    d.runs.map((r) => {
                                      const rPath: ExplorerPath = {
                                        level: 'run',
                                        area: 'calib',
                                        year: y.key,
                                        month: m.key,
                                        date: d.date,
                                        runId: r.id,
                                      };
                                      return (
                                        <TreeRow
                                          key={r.id}
                                          depth={5}
                                          label={calibRunName(r)}
                                          count={r.results}
                                          href={explorerHref(rPath)}
                                          active={samePath(path, rPath)}
                                          calib
                                        />
                                      );
                                    })}
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
          {shown.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-muted">{emptyText}</p>
          ) : view === 'icons' ? (
            <div className="space-y-3 p-2.5 sm:p-3">
              {shown.map((g) => (
                <div key={g.key}>
                  {g.label && (
                    <h3 className="mb-1.5 px-1 text-xs font-semibold text-muted">
                      {g.label}
                      <span className="font-normal tabular-nums">
                        {' '}
                        · {g.items.length}구
                      </span>
                    </h3>
                  )}
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] sm:gap-2">
                    {g.items.map((it) => (
                      <li key={it.id}>
                        <Tile
                          item={it}
                          selected={it.kind !== 'folder' && it.id === pick}
                          onOpen={() => open(it)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
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
                {shown.map((g) => (
                  <Fragment key={g.key}>
                    {/* 묶음 구분 줄 — 스피드건 그룹 */}
                    {g.label && (
                      <tr>
                        <th
                          scope="colgroup"
                          colSpan={cols.length}
                          className="border-b border-line/70 bg-surface-2/70 px-3 py-1.5 text-left text-xs font-semibold text-muted"
                        >
                          {g.label}
                          <span className="font-normal tabular-nums">
                            {' '}
                            · {g.items.length}구
                          </span>
                        </th>
                      </tr>
                    )}
                    {g.items.map((it) => {
                      const selected = it.kind !== 'folder' && it.id === pick;
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
                              className={`px-3 py-2 align-middle tabular-nums ${
                                c.wrap ? 'break-keep' : 'whitespace-nowrap'
                              } ${c.className ?? ''}`}
                            >
                              {c.cell(it)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
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
          항목 {shownCount}개{shownCount !== total && ` / ${total}개`}
        </span>
        {grouped && <span>그룹 {shown.length}</span>}
        <span className="tabular-nums">
          {countWord} {folderStat.pitches} · 짝 {folderStat.pairs} · 클립{' '}
          {folderStat.clips}
        </span>
        {folderStat.biasKmh != null && (
          <span className="tabular-nums">
            편향{' '}
            <span className={errorTone(folderStat.biasKmh)}>
              {signed(folderStat.biasKmh)}
            </span>
            {folderStat.p90Kmh != null && ` · p90 ${folderStat.p90Kmh.toFixed(1)} km/h`}
          </span>
        )}
        {picked && <span className="font-semibold text-ink">선택: {picked.name}</span>}
        <span className="ml-auto tabular-nums">{modelText}</span>
        {pending && <span>저장 중…</span>}
      </footer>

      {/* 휴대폰 — 고른 파일은 창으로 */}
      <Modal
        open={!desktop && picked != null}
        onClose={() => setPick(null)}
        title={picked ? `${picked.name} · ${label(path)}` : '공'}
      >
        {!desktop && picked && <div className="px-5 py-4">{preview(picked)}</div>}
      </Modal>
    </section>
  );
}

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
  /** 보정 차수 — 폴더에 보정 표시 */
  calib?: boolean;
}) {
  return (
    <div className="flex items-center" style={{ paddingLeft: `${depth * 0.625}rem` }}>
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
        title={label}
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
        <FolderGlyph className="h-14 w-16" badge={it.run ? 'calib' : null} />
      ) : it.kind === 'file' ? (
        <PitchFileGlyph
          value={
            it.pitch.releaseKmh != null
              ? String(Math.round(it.pitch.releaseKmh * 10) / 10)
              : String(Math.round(it.pitch.kmh * 10) / 10)
          }
          hasClip={!!it.pitch.clipPath}
          excluded={it.pitch.calibExclude}
        />
      ) : (
        /* 결과 — 다시 잰 값, 거부는 빈 값에 흐리게 */
        <PitchFileGlyph
          value={it.row.ok ? String(remeasured(it.row) ?? '—') : '—'}
          hasClip={!!it.row.pitch.clipPath}
          excluded={!it.row.ok}
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
  /* 파일 아이콘 — 영상이 있으면 필름, 아니면 문서. 보정에서 뺀 공 · 거부된 결과는 회색 */
  const icon =
    it.kind === 'folder' ? (
      <FolderGlyph className="h-5 w-6 shrink-0" badge={it.run ? 'calib' : null} />
    ) : it.kind === 'file' ? (
      it.pitch.clipPath ? (
        <FileVideo
          aria-hidden
          className={`h-5 w-5 shrink-0 ${it.pitch.calibExclude ? 'text-muted' : 'text-sky'}`}
        />
      ) : (
        <FileText aria-hidden className="h-5 w-5 shrink-0 text-muted" />
      )
    ) : it.row.ok ? (
      <FileVideo aria-hidden className="h-5 w-5 shrink-0 text-sky" />
    ) : (
      <FileText aria-hidden className="h-5 w-5 shrink-0 text-muted" />
    );
  return (
    <span className="flex min-w-0 items-center gap-2">
      {icon}
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

const nameCol: Col = {
  key: 'name',
  label: '이름',
  cell: (it) => <NameCell it={it} />,
  sort: (it) => it.name,
};

/** 세션 폴더가 없으니 파일마다 누구의 몇 시 세션인지 — 좁은 화면은 숨긴다(설명에도 있다) */
const sessionCol: Col = {
  key: 'session',
  label: '세션',
  className: 'hidden md:table-cell text-xs text-muted',
  cell: (it) => {
    const s = sessionOf(it);
    return s ? `${hhmm(s.createdAt)} · ${s.nickname}` : '—';
  },
  sort: (it) => sessionOf(it)?.createdAt ?? null,
};

/**
 * 폴더 칸 — 어느 폴더들이 들었나에 따라
 *   root: [원본] · [보정]        orig: 원본의 연도 · 월 · 날짜     calib: 보정의 연도 · 월 · 날짜
 *   runs: 보정 날짜 안의 차수 폴더들(모델 · 보정일)
 */
function folderCols(variant: 'root' | 'orig' | 'calib' | 'runs'): Col[] {
  const num = (
    key: string,
    label: string,
    pick: (s: FolderStat) => number | null | undefined,
    className?: string,
    digits?: number
  ): Col => ({
    key,
    label,
    className,
    cell: (it) => {
      const s = statOf(it);
      return dash(s ? pick(s) : null, digits);
    },
    sort: (it) => {
      const s = statOf(it);
      return s ? (pick(s) ?? null) : null;
    },
  });
  const bias: Col = {
    key: 'bias',
    label: '편향',
    cell: (it) => {
      const b = statOf(it)?.biasKmh ?? null;
      return <span className={`font-semibold ${errorTone(b)}`}>{signed(b)}</span>;
    },
    sort: (it) => statOf(it)?.biasKmh ?? null,
  };
  const pairs = num('pairs', '짝', (s) => s.pairs, 'hidden sm:table-cell');
  const p90 = num('p90', 'p90', (s) => s.p90Kmh, 'hidden sm:table-cell', 1);
  switch (variant) {
    case 'root':
      return [nameCol, num('pitches', '공', (s) => s.pitches), pairs, bias, p90];
    case 'orig':
      return [
        nameCol,
        num('sessions', '세션', (s) => s.sessions, 'hidden md:table-cell'),
        num('pitches', '공', (s) => s.pitches),
        pairs,
        num(
          'clips',
          '클립',
          (s) => s.clips,
          'hidden md:table-cell lg:hidden xl:table-cell'
        ),
        bias,
        p90,
      ];
    case 'calib':
      return [
        nameCol,
        {
          key: 'runs',
          label: '보정',
          className: 'hidden sm:table-cell',
          cell: (it) =>
            it.kind === 'folder' && it.runs != null ? `${it.runs}차례` : '—',
          sort: (it) => (it.kind === 'folder' ? (it.runs ?? null) : null),
        },
        num('pitches', '결과', (s) => s.pitches),
        pairs,
        bias,
      ];
    case 'runs':
      return [
        nameCol,
        {
          key: 'model',
          label: '모델',
          className: 'text-muted',
          cell: (it) =>
            it.kind === 'folder' && it.run ? `v${it.run.engineVersion}` : '—',
          sort: (it) => (it.kind === 'folder' ? (it.run?.engineVersion ?? null) : null),
        },
        {
          key: 'at',
          label: '보정일',
          className: 'hidden md:table-cell text-muted',
          cell: (it) =>
            it.kind === 'folder' && it.run
              ? `${md(it.run.createdAt)} ${hhmm(it.run.createdAt)}`
              : '—',
          sort: (it) => (it.kind === 'folder' ? (it.run?.createdAt ?? null) : null),
        },
        num('pitches', '결과', (s) => s.pitches),
        pairs,
        bias,
        p90,
      ];
  }
}

const pitchOf = (it: Item) => (it.kind === 'file' ? it.pitch : null);
const diffOf = (p: AdminPitchRow | null) => (p ? pitchDiff(p) : null);

const fileCols: Col[] = [
  { ...nameCol, sort: (it) => pitchOf(it)?.seq ?? 0 },
  sessionCol,
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

const rowOf = (it: Item) => (it.kind === 'result' ? it.row : null);

/** 결과 파일의 칸 — 원본 값과 다시 잰 값을 나란히. 모델은 폴더 공통이라 상태 줄에 */
const resultCols: Col[] = [
  { ...nameCol, sort: (it) => rowOf(it)?.pitch.seq ?? 0 },
  sessionCol,
  {
    key: 'orig',
    label: '원본',
    className: 'hidden sm:table-cell text-muted',
    cell: (it) => {
      const r = rowOf(it);
      return r
        ? r.pitch.manual
          ? `수기 ${r.pitch.kmh}`
          : dash(r.pitch.releaseKmh ?? r.pitch.kmh)
        : '—';
    },
    sort: (it) => {
      const r = rowOf(it);
      return r ? (r.pitch.releaseKmh ?? r.pitch.kmh) : null;
    },
  },
  {
    key: 're',
    label: '다시 잼',
    cell: (it) => {
      const r = rowOf(it);
      return (
        <span className="font-semibold text-ink">{dash(r ? remeasured(r) : null)}</span>
      );
    },
    sort: (it) => {
      const r = rowOf(it);
      return r ? remeasured(r) : null;
    },
  },
  {
    key: 'gun',
    label: '건',
    className: 'hidden sm:table-cell',
    cell: (it) => dash(rowOf(it)?.pitch.gunKmh),
    sort: (it) => rowOf(it)?.pitch.gunKmh ?? null,
  },
  {
    key: 'diff',
    label: '차이',
    cell: (it) => {
      const r = rowOf(it);
      const d = r ? resultDiff(r) : null;
      return <span className={`font-semibold ${errorTone(d)}`}>{signed(d)}</span>;
    },
    sort: (it) => {
      const r = rowOf(it);
      return r ? resultDiff(r) : null;
    },
  },
  {
    key: 'status',
    label: '상태',
    className: 'text-xs',
    wrap: true,
    cell: (it) => {
      const r = rowOf(it);
      if (!r) return '—';
      return r.ok ? (
        <span className="text-muted">잼</span>
      ) : (
        <span className="text-warn">거부 — {rejectText(r.reject)}</span>
      );
    },
    sort: (it) => {
      const r = rowOf(it);
      return r ? (r.ok ? 0 : 1) : null;
    },
  },
];
