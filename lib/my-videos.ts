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

export type VideoFilter = {
  text: string;
  sport: VideoSport | null;
  revisitOnly: boolean;
};
export const EMPTY_VIDEO_FILTER: VideoFilter = { text: '', sport: null, revisitOnly: false };

/** 어디서 찾았나 — 영상 메모 · 기록 총평 · 감각 칩 · 그 밖(종류 · 날짜) */
export type MatchWhere = 'note' | 'memo' | 'cue' | 'other';
export const MATCH_LABEL: Record<MatchWhere, string> = {
  note: '영상 메모에서',
  memo: '기록 총평에서',
  cue: '감각 칩에서',
  other: '종류 · 날짜에서',
};

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** 'YYYY-MM-DD' → '10월 26일' — 날짜로도 찾게 */
function dateWords(key: string | null): string {
  if (!key) return '촬영 날짜 모름';
  const [, m, d] = key.split('-').map(Number);
  return `${key} ${m}월 ${d}일`;
}

/**
 * 거르기 + 어디서 찾았는지. 낱말을 띄어 쓰면 모든 낱말이 어딘가에 있어야 한다(AND).
 * where 는 낱말이 처음 걸린 곳 가운데 앞선 것(영상 메모 → 총평 → 칩 → 그 밖). 검색어가 없으면 null.
 */
export function filterVideos(
  items: readonly MyVideoItem[],
  f: VideoFilter
): { item: MyVideoItem; where: MatchWhere | null }[] {
  const words = norm(f.text).split(' ').filter(Boolean);
  const out: { item: MyVideoItem; where: MatchWhere | null }[] = [];
  for (const item of items) {
    if (f.sport && item.sport !== f.sport) continue;
    if (f.revisitOnly && !item.revisit) continue;
    if (!words.length) {
      out.push({ item, where: null });
      continue;
    }
    const hay: [MatchWhere, string][] = [
      ['note', norm(item.note)],
      ['memo', norm(item.logs.map((l) => l.memo).filter(Boolean).join(' '))],
      ['cue', norm(item.logs.flatMap((l) => [...l.cuesGood, ...l.cuesBad]).join(' '))],
      [
        'other',
        norm(
          [
            dateWords(item.date),
            ...item.logs.map((l) => l.type),
            item.clip ? `구속 측정 ${item.clip.pitchType ?? ''}` : '',
            item.sport === 'hit' ? '타격' : '투구',
          ].join(' ')
        ),
      ],
    ];
    let where: MatchWhere | null = null;
    let all = true;
    for (const w of words) {
      const at = hay.find(([, h]) => h.includes(w));
      if (!at) {
        all = false;
        break;
      }
      if (where === null || hay.findIndex(([k]) => k === at[0]) < hay.findIndex(([k]) => k === where)) where = at[0];
    }
    if (all) out.push({ item, where });
  }
  return out;
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
