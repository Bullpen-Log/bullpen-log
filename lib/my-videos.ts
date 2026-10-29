/**
 * '내 영상' 갤러리의 규칙(순수 — 서버 · 앱 공용, 2026-10-26).
 *
 * 영상은 따로 된 표(UserVideo)의 줄 · 투구/타격 기록의 videoPaths · 구속 측정 공의 클립에 흩어져 있다. 갤러리는 이 셋을
 * **경로 하나에 카드 하나**로 합쳐 보인다 — 옮기거나 다시 올리지 않는다. 기존 영상은 줄이 없는 채로 보이다가(saved: false)
 * 메모나 ★ 를 처음 적을 때 줄이 생긴다.
 *
 * 영상 메모(note)와 기록 총평(PitchLog.memo)은 다른 원본이다 — 복제하지 않는다. 찾기는 둘 다 보되 어디서 찾았는지 알린다.
 *
 * 시험: npm run my-videos:test
 */
import { isPhoneVideoPath } from '@/lib/phone-video-path';

export type VideoSport = 'pitch' | 'hit';
export type VideoStorage = 'phone' | 'server';
/** header = 파일 머리 · camera = 앱에서 찍음 · manual = 사람이 고침 · log = 붙은 기록 날짜 · unknown = 모름 */
export type VideoDateSource = 'header' | 'camera' | 'manual' | 'log' | 'unknown';
export type VideoOrigin = 'camera' | 'album' | 'log' | 'velocityClip';

export const FEEL_NOTE_MAX = 200;

/** 영상이 붙은 기록 한 줄(읽기만) */
export type MyVideoLog = {
  id: string;
  kind: VideoSport;
  /** YYYY-MM-DD */
  date: string;
  /** 투구 · 타격 종류 */
  type: string;
  /** 투구수 · 스윙 수 */
  count: number;
  memo: string | null;
  cuesGood: string[];
  cuesBad: string[];
};

/** 구속 측정 공의 클립(회원 세션 · 보정용 아님) */
export type MyVideoClip = {
  pitchId: string;
  sessionId: string;
  /** YYYY-MM-DD */
  date: string;
  kmh: number;
  pitchType: string | null;
};

/** UserVideo 줄(서버가 읽은 그대로, 날짜는 글자로) */
export type MyVideoRow = {
  path: string;
  storage: string;
  sport: string;
  /** YYYY-MM-DD 또는 null */
  capturedDate: string | null;
  capturedSource: string;
  origin: string;
  feelNote: string | null;
  revisit: boolean;
  durationSec: number | null;
  /** ISO */
  createdAt: string;
};

export type MyVideoItem = {
  path: string;
  storage: VideoStorage;
  sport: VideoSport;
  /** 묶을 날짜(YYYY-MM-DD) — 모르면 null('촬영 날짜 모름') */
  date: string | null;
  dateSource: VideoDateSource;
  origin: VideoOrigin;
  /** 영상 메모 — 기록 총평과 따로 */
  note: string | null;
  revisit: boolean;
  /** UserVideo 줄이 있나 — 없으면 기존 기록 · 클립에서 보이는 영상 */
  saved: boolean;
  /** 줄을 만든 때(ISO) — 줄이 없으면 null */
  createdAt: string | null;
  durationSec: number | null;
  logs: MyVideoLog[];
  clip: MyVideoClip | null;
};

const SOURCES: readonly VideoDateSource[] = ['header', 'camera', 'manual', 'log', 'unknown'];
const ORIGINS: readonly VideoOrigin[] = ['camera', 'album', 'log', 'velocityClip'];

/** 갤러리에 안 넣는 경로 — 3D 분석 샘플 폴더(관리자 · 분석용) */
export function isGalleryPath(path: string): boolean {
  return path.includes('/') && !path.includes('/pitch-lab/') && !path.includes('/swing-lab/');
}

/** 영상 메모 다듬기 — 비면 null, 200자에서 자른다 */
export function cleanFeelNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().replace(/\s+/g, ' ');
  return t ? [...t].slice(0, FEEL_NOTE_MAX).join('') : null;
}

/**
 * 셋을 경로로 합친다. deleted = 지운 영상(deletedAt) 경로 — 기록이 아직 그 경로를 쥐어도 숨긴다.
 * 날짜: 줄의 촬영 날짜 → 클립 날짜 → 가장 이른 기록 날짜 → 모름.
 */
export function mergeVideos(input: {
  rows: readonly MyVideoRow[];
  logs: readonly { log: MyVideoLog; paths: readonly string[] }[];
  clips: readonly { clip: MyVideoClip; path: string }[];
  deleted?: readonly string[];
}): MyVideoItem[] {
  const hidden = new Set(input.deleted ?? []);
  const rowOf = new Map(input.rows.map((r) => [r.path, r]));
  const logsOf = new Map<string, MyVideoLog[]>();
  for (const { log, paths } of input.logs) {
    for (const p of new Set(paths)) logsOf.set(p, [...(logsOf.get(p) ?? []), log]);
  }
  const clipOf = new Map<string, MyVideoClip>();
  for (const { clip, path } of input.clips) if (!clipOf.has(path)) clipOf.set(path, clip);

  const paths = new Set([...rowOf.keys(), ...logsOf.keys(), ...clipOf.keys()]);
  const items: MyVideoItem[] = [];
  for (const path of paths) {
    if (hidden.has(path) || !isGalleryPath(path)) continue;
    const row = rowOf.get(path);
    const logs = (logsOf.get(path) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const clip = clipOf.get(path) ?? null;
    const fallbackDate = clip?.date ?? logs[0]?.date ?? null;
    const date = row?.capturedDate ?? fallbackDate;
    const dateSource: VideoDateSource = row?.capturedDate
      ? (SOURCES.find((s) => s === row.capturedSource) ?? 'unknown')
      : fallbackDate
        ? 'log'
        : 'unknown';
    const sport: VideoSport =
      row?.sport === 'hit' || row?.sport === 'pitch'
        ? row.sport
        : clip
          ? 'pitch'
          : (logs[0]?.kind ?? 'pitch');
    items.push({
      path,
      storage: isPhoneVideoPath(path) ? 'phone' : 'server',
      sport,
      date,
      dateSource,
      origin: row
        ? (ORIGINS.find((o) => o === row.origin) ?? 'album')
        : clip
          ? 'velocityClip'
          : 'log',
      note: row?.feelNote ?? null,
      revisit: row?.revisit ?? false,
      saved: !!row,
      createdAt: row?.createdAt ?? null,
      durationSec: row?.durationSec ?? null,
      logs,
      clip,
    });
  }
  return items.sort(compareItems);
}

/** 날짜 아는 것 먼저(최근부터) → 같은 날은 만든 때 최근부터 → 날짜 모름은 맨 끝(만든 때 최근부터) */
export function compareItems(a: MyVideoItem, b: MyVideoItem): number {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return b.date.localeCompare(a.date);
  }
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.path.localeCompare(b.path);
}

/**
 * 기간 — 찍은 날(모르면 붙은 기록 날짜) 기준, 양끝 포함. 날짜를 모르는 영상은 '전체'와 '날짜 모름만'에서만 보인다(기간에 아무렇게나 넣지 않는다).
 * 최근 7일 = 오늘 포함 7일, 이번 달 · 지난달 = 달력 기준. today 는 앱의 한국 오늘(YYYY-MM-DD).
 */
export type PeriodKind = 'all' | '7d' | 'thisMonth' | 'lastMonth' | 'custom' | 'unknown';
export type Period = { kind: PeriodKind; from?: string | null; to?: string | null };
export const PERIOD_LABEL: Record<PeriodKind, string> = {
  all: '전체 기간',
  '7d': '최근 7일',
  thisMonth: '이번 달',
  lastMonth: '지난달',
  custom: '직접 고른 기간',
  unknown: '날짜 모름만',
};

const pad2 = (n: number) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' 더하기(달력대로 넘김 — 월말 · 윤년) — UTC 로만 셈해 시간대에 안 흔들린다 */
function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}
function monthEnd(y: number, m: number): string {
  return `${y}-${pad2(m)}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

/** 기간 → 양끝 날짜(포함). unknownOnly = 날짜 모름만. 둘 다 null 이면 전체 */
export function periodRange(p: Period, today: string): { from: string | null; to: string | null; unknownOnly: boolean } {
  const [y, m] = today.split('-').map(Number);
  switch (p.kind) {
    case '7d':
      return { from: addDays(today, -6), to: today, unknownOnly: false };
    case 'thisMonth':
      return { from: `${y}-${pad2(m)}-01`, to: monthEnd(y, m), unknownOnly: false };
    case 'lastMonth': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad2(pm)}-01`, to: monthEnd(py, pm), unknownOnly: false };
    }
    case 'custom': {
      const a = p.from && DATE_KEY.test(p.from) ? p.from : null;
      const b = p.to && DATE_KEY.test(p.to) ? p.to : null;
      /* 거꾸로 고르면 바꿔 끼운다 */
      return a && b && a > b ? { from: b, to: a, unknownOnly: false } : { from: a, to: b, unknownOnly: false };
    }
    case 'unknown':
      return { from: null, to: null, unknownOnly: true };
    default:
      return { from: null, to: null, unknownOnly: false };
  }
}
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type LinkedFilter = 'any' | 'linked' | 'unlinked';
export type VideoOrder = 'new' | 'old';

export type VideoFilter = {
  text: string;
  sport: VideoSport | null;
  /** 즐겨찾기만(UserVideo.revisit — 칸 이름은 그대로, 화면 이름만 '즐겨찾기') */
  favoriteOnly: boolean;
  period: Period;
  /** 붙은 기록의 종류(불펜 · 경기 …) — 비면 거르지 않음. 기록 여럿 중 하나라도 맞으면 */
  types: readonly string[];
  linked: LinkedFilter;
};
export const EMPTY_VIDEO_FILTER: VideoFilter = {
  text: '',
  sport: null,
  favoriteOnly: false,
  period: { kind: 'all' },
  types: [],
  linked: 'any',
};

/** 어디서 찾았나 — 영상 메모 · 기록 총평 · 감각 칩 · 그 밖(종류 · 날짜) */
export type MatchWhere = 'note' | 'memo' | 'cue' | 'other';
export const MATCH_LABEL: Record<MatchWhere, string> = {
  note: '영상 메모에서',
  memo: '기록 총평에서',
  cue: '감각 칩에서',
  other: '종류 · 날짜에서',
};

export type FilteredRow = {
  item: MyVideoItem;
  where: MatchWhere | null;
  /** 걸린 곳의 짧은 글(메모 · 총평 · 칩) — 결과에서 '왜 나왔는지' */
  snippet: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** 'YYYY-MM-DD' → '2026-10-26 2026년 10월 26일' — 날짜로도 찾게('10월 26일'은 해마다, '2025 10월'은 그해로) */
function dateWords(key: string | null): string {
  if (!key) return '촬영 날짜 모름';
  const [y, m, d] = key.split('-').map(Number);
  return `${key} ${y}년 ${m}월 ${d}일`;
}

/** 글 속 첫 낱말 자리 앞뒤로 짧게 */
function excerpt(text: string, word: string, room = 14): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(word);
  if (at < 0) return flat.slice(0, room * 2);
  const from = Math.max(0, at - room);
  const to = Math.min(flat.length, at + word.length + room);
  return `${from > 0 ? '…' : ''}${flat.slice(from, to)}${to < flat.length ? '…' : ''}`;
}

/**
 * 거르기 + 어디서 찾았는지. 낱말을 띄어 쓰면 모든 낱말이 어딘가에 있어야 한다(AND).
 * where 는 낱말이 처음 걸린 곳 가운데 앞선 것(영상 메모 → 총평 → 칩 → 그 밖). 검색어가 없으면 null.
 * keep = 즐겨찾기만 보는 중에 별을 끈 영상 — 조건을 바꿀 때까지 자리에 둔다(목록이 툭 줄어들지 않게).
 */
export function filterVideos(
  items: readonly MyVideoItem[],
  f: VideoFilter,
  today = '9999-12-31',
  keep?: ReadonlySet<string>
): FilteredRow[] {
  const words = norm(f.text).split(' ').filter(Boolean);
  const range = periodRange(f.period, today);
  const types = new Set(f.types);
  const out: FilteredRow[] = [];
  for (const item of items) {
    if (f.sport && item.sport !== f.sport) continue;
    if (f.favoriteOnly && !item.revisit && !keep?.has(item.path)) continue;
    if (range.unknownOnly ? item.date !== null : (range.from || range.to) && (item.date === null || (range.from && item.date < range.from) || (range.to && item.date > range.to))) continue;
    if (f.linked === 'linked' && item.logs.length === 0) continue;
    if (f.linked === 'unlinked' && item.logs.length > 0) continue;
    if (types.size && !item.logs.some((l) => types.has(l.type))) continue;
    if (!words.length) {
      out.push({ item, where: null, snippet: null });
      continue;
    }
    const memoText = item.logs.map((l) => l.memo).filter(Boolean).join(' · ');
    const cueText = item.logs.flatMap((l) => [...l.cuesGood, ...l.cuesBad]).join(' · ');
    const hay: [MatchWhere, string, string][] = [
      ['note', norm(item.note), item.note ?? ''],
      ['memo', norm(memoText), memoText],
      ['cue', norm(cueText), cueText],
      [
        'other',
        norm([dateWords(item.date), ...item.logs.map((l) => l.type), item.sport === 'hit' ? '타격' : '투구'].join(' ')),
        '',
      ],
    ];
    let best = -1;
    let bestWord = '';
    let all = true;
    for (const w of words) {
      const at = hay.findIndex(([, h]) => h.includes(w));
      if (at < 0) {
        all = false;
        break;
      }
      if (best < 0 || at < best) {
        best = at;
        bestWord = w;
      }
    }
    if (!all) continue;
    const [where, , raw] = hay[best];
    out.push({ item, where, snippet: raw ? excerpt(raw, bestWord) : null });
  }
  return out;
}

/** 오래된 순 — 날짜 아는 것은 오래된 날부터, 같은 날은 먼저 만든 것부터, 날짜 모름은 그대로 맨 끝 */
export function compareItemsOld(a: MyVideoItem, b: MyVideoItem): number {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date.localeCompare(b.date);
  }
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.path.localeCompare(b.path);
}
export function sortRows<T extends { item: MyVideoItem }>(rows: readonly T[], order: VideoOrder): T[] {
  const cmp = order === 'old' ? compareItemsOld : compareItems;
  return [...rows].sort((a, b) => cmp(a.item, b.item));
}

/** 날짜 묶음 — 정렬된 목록을 받아 그 차례 그대로. 날짜 모름은 맨 끝 한 묶음 */
export function groupByDate<T extends { item: MyVideoItem }>(
  rows: readonly T[]
): { date: string | null; rows: T[] }[] {
  const groups: { date: string | null; rows: T[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.item.date) last.rows.push(r);
    else groups.push({ date: r.item.date, rows: [r] });
  }
  return groups;
}

/**
 * 달 묶음 — 즐겨찾기 보기(2026-10-29 시안): 날마다 묶으면 한두 개짜리 묶음이 많아 빈 칸이 늘어서 달로 묶고 날짜는 칸 안에 적는다.
 * 정렬된 목록 그대로, 날짜 모름은 맨 끝 한 묶음(key = 'YYYY-MM' 또는 null).
 */
export function groupByMonth<T extends { item: MyVideoItem }>(rows: readonly T[]): { date: string | null; rows: T[] }[] {
  const groups: { date: string | null; rows: T[] }[] = [];
  for (const r of rows) {
    const ym = r.item.date ? r.item.date.slice(0, 7) : null;
    const last = groups[groups.length - 1];
    if (last && last.date === ym) last.rows.push(r);
    else groups.push({ date: ym, rows: [r] });
  }
  return groups;
}

/** 칸 여럿씩 한 줄(그리드) — 묶음마다 따로 자른다 */
export function chunkRows<T>(rows: readonly T[], cols: number): T[][] {
  const n = Math.max(1, Math.floor(cols));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
  return out;
}

/** 월 바로 가기 — 영상이 있는 달(최근부터)과 그 달의 전체 수 · 지금 조건에 맞는 수 */
export function monthIndex(all: readonly MyVideoItem[], shown: readonly { item: MyVideoItem }[]): { ym: string; total: number; shown: number }[] {
  const total = new Map<string, number>();
  for (const v of all) if (v.date) total.set(v.date.slice(0, 7), (total.get(v.date.slice(0, 7)) ?? 0) + 1);
  const hit = new Map<string, number>();
  for (const r of shown) if (r.item.date) hit.set(r.item.date.slice(0, 7), (hit.get(r.item.date.slice(0, 7)) ?? 0) + 1);
  return [...total.keys()].sort().reverse().map((ym) => ({ ym, total: total.get(ym)!, shown: hit.get(ym) ?? 0 }));
}

/** 기록 종류 고르기 — 실제로 붙은 기록의 종류만(많은 순) */
export function recordTypes(items: readonly MyVideoItem[]): { type: string; count: number }[] {
  const n = new Map<string, number>();
  for (const v of items) for (const t of new Set(v.logs.map((l) => l.type))) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

export type FilterChipKey = 'text' | 'sport' | 'favorite' | 'period' | 'linked' | `type:${string}`;
const shortDate = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8))}`;
/** 켜진 조건 칩(하나씩 지울 수 있게) */
export function filterChips(f: VideoFilter, today: string): { key: FilterChipKey; label: string }[] {
  const out: { key: FilterChipKey; label: string }[] = [];
  if (f.text.trim()) out.push({ key: 'text', label: `'${f.text.trim()}'` });
  if (f.period.kind !== 'all') {
    const r = periodRange(f.period, today);
    out.push({
      key: 'period',
      label:
        f.period.kind === 'custom'
          ? `${r.from ? shortDate(r.from) : '처음'} ~ ${r.to ? shortDate(r.to) : '오늘'}`
          : PERIOD_LABEL[f.period.kind],
    });
  }
  if (f.sport) out.push({ key: 'sport', label: f.sport === 'hit' ? '타격' : '투구' });
  if (f.favoriteOnly) out.push({ key: 'favorite', label: '즐겨찾기' });
  for (const t of f.types) out.push({ key: `type:${t}`, label: t });
  if (f.linked !== 'any') out.push({ key: 'linked', label: f.linked === 'linked' ? '기록 연결됨' : '기록 연결 없음' });
  return out;
}
export function clearChip(f: VideoFilter, key: FilterChipKey): VideoFilter {
  if (key === 'text') return { ...f, text: '' };
  if (key === 'period') return { ...f, period: { kind: 'all' } };
  if (key === 'sport') return { ...f, sport: null };
  if (key === 'favorite') return { ...f, favoriteOnly: false };
  if (key === 'linked') return { ...f, linked: 'any' };
  return { ...f, types: f.types.filter((t) => `type:${t}` !== key) };
}
export const isFilterActive = (f: VideoFilter) => filterChips(f, '9999-12-31').length > 0;

/** 영상만 저장(폰이 보냄)의 칸 — checkNewVideo 가 다듬는다 */
export type NewVideo = {
  clientId: string;
  path: string;
  sport: VideoSport;
  origin: 'camera' | 'album';
  /** ISO — 모르면 null */
  capturedAt: string | null;
  /** YYYY-MM-DD — 모르면 null */
  capturedDate: string | null;
  capturedSource: 'header' | 'camera' | 'manual' | 'unknown';
  feelNote: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
};

const DATE_RE = DATE_KEY;
const numIn = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/**
 * 폰이 보낸 '영상만 저장'을 다듬는다 — 본인 폴더의 경로만, 오늘보다 뒤인 촬영 날짜는 모름으로. 틀린 칸은 버리고 꼭 필요한 것(번호 · 경로)만 막는다.
 * today = 한국 오늘(YYYY-MM-DD).
 */
export function checkNewVideo(raw: unknown, userId: string, today: string): { value: NewVideo } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const clientId = typeof r.clientId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(r.clientId) ? r.clientId : null;
  if (!clientId) return { error: '영상 번호가 올바르지 않아요.' };
  const path = typeof r.path === 'string' ? r.path : '';
  if (!path.startsWith(`${userId}/`) || path.includes('..') || path.length > 300 || !isGalleryPath(path))
    return { error: '영상 경로가 올바르지 않아요.' };
  const date = typeof r.capturedDate === 'string' && DATE_RE.test(r.capturedDate) && r.capturedDate <= today && !Number.isNaN(Date.parse(r.capturedDate)) ? r.capturedDate : null;
  const at = typeof r.capturedAt === 'string' && !Number.isNaN(Date.parse(r.capturedAt)) ? new Date(r.capturedAt).toISOString() : null;
  const src = (['header', 'camera', 'manual'] as const).find((s) => s === r.capturedSource);
  const int = (v: unknown) => {
    const n = numIn(v, 1, 10000);
    return n === null ? null : Math.round(n);
  };
  return {
    value: {
      clientId,
      path,
      sport: r.sport === 'hit' ? 'hit' : 'pitch',
      origin: r.origin === 'camera' ? 'camera' : 'album',
      capturedAt: at,
      capturedDate: date,
      capturedSource: date && src ? src : 'unknown',
      feelNote: cleanFeelNote(r.feelNote),
      durationSec: numIn(r.durationSec, 0, 3600),
      width: int(r.width),
      height: int(r.height),
    },
  };
}
