import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';
import { fitCalibration, type CalFit, type CalPair } from '@/lib/velocity-calibration';
import { VELOCITY_ENGINE_VERSION } from '@/lib/velocity-engine/version';
import { toDateKey } from '@/lib/pitch-stats';

/**
 * 구속 측정 관리자(/admin/velocity)가 읽는 것 — 모든 계정의 세션 · 공 · 스피드건 짝 · 영상 클립.
 *
 * 서버 컴포넌트만 부른다. 서버 액션 파일에 두지 않는 까닭은 lib/velocity-load.ts 와 같다 —
 * 거기서 내보낸 함수는 브라우저가 부를 수 있어서, 남의 자료를 읽는 함수를 둘 수 없다.
 *
 * 오차의 정의: 짝(pair) = 스피드건 값이 있고 보정에서 빼지 않은(calibExclude=false) 공.
 * err = (릴리스 추정 ?? 보정 후 값) − 스피드건. 릴리스 추정이 스피드건과 물리적으로 같은 값
 * (릴리스 직후 속도)이라 그것을 먼저 견준다. bias 는 err 평균, p90 은 |err| 의 90 백분위,
 * sd 는 표준편차.
 */

export type AdminDayStat = {
  date: string;
  users: number;
  sessions: number;
  pitches: number;
  pairs: number;
  clips: number;
  biasKmh: number | null;
  p90Kmh: number | null;
  sdKmh: number | null;
  maxKmh: number | null;
};

export type AdminSetupStat = {
  key: string;
  label: string;
  pitches: number;
  pairs: number;
  biasKmh: number | null;
  p90Kmh: number | null;
};

/** 탐색기의 월 폴더 — 그 달의 날짜 폴더들(최근부터). stat.date 는 '2026-09' */
export type AdminTreeMonth = { key: string; stat: AdminDayStat; days: AdminDayStat[] };
/** 탐색기의 연도 폴더 — 그 해의 월 폴더들(최근부터). stat.date 는 '2026' */
export type AdminTreeYear = {
  key: string;
  stat: AdminDayStat;
  months: AdminTreeMonth[];
};

/* ── 보정 재측정(VelocityCalibRun) — 탐색기의 [보정] 영역 ── */

/** 보정 차수 하나의 요약 — 날짜 폴더 안의 폴더 하나 */
export type AdminCalibRunSummary = {
  id: string;
  /** 다시 잰 공들의 날짜(YYYY-MM-DD) */
  date: string;
  /** 그날의 몇 번째 보정인가(1부터) */
  pass: number;
  engineVersion: string;
  /** 돌린 때(ISO) — 보정일 */
  createdAt: string;
  nickname: string;
  memo: string | null;
  /** 결과 수 · 잰 수(ok) · 스피드건 짝(ok 이고 건 값 있음) */
  results: number;
  ok: number;
  pairs: number;
  /** 다시 잰 값(릴리스 ?? 카메라) − 스피드건 — 짝 기준 */
  biasKmh: number | null;
  p90Kmh: number | null;
  sdKmh: number | null;
};
/** 보정 영역의 날짜 폴더 — 그날의 차수들(최근 차수부터) */
export type AdminCalibDay = { date: string; runs: AdminCalibRunSummary[] };
export type AdminCalibMonth = { key: string; runs: number; days: AdminCalibDay[] };
export type AdminCalibYear = { key: string; runs: number; months: AdminCalibMonth[] };

/** 보정 차수 안의 공 하나 — 원본 값 · 다시 잰 값 · 스피드건 */
export type AdminCalibResultRow = {
  id: string;
  pitchId: string;
  /** 원본 공 — 차례 · 스피드건 · 구종 · 클립 주소 · 원본 값 */
  pitch: AdminPitchRow;
  session: AdminSessionRow;
  ok: boolean;
  rawKmh: number | null;
  releaseKmh: number | null;
  errorKmh: number | null;
  confidence: string | null;
  frames: number | null;
  fps: number | null;
  /** 거부 까닭(RejectCode) — ok 가 false 일 때 */
  reject: string | null;
};
export type AdminCalibRunView = AdminCalibRunSummary & { rows: AdminCalibResultRow[] };

export type AdminOverview = {
  /** 탐색기 폴더 트리 — 연도 › 월 › 날짜(모두 최근부터), 폴더마다 통계 */
  tree: AdminTreeYear[];
  /** [보정] 영역의 트리 — 연도 › 월 › 날짜 › 차수 */
  calibTree: AdminCalibYear[];
  /** 지금 배포된 구속 측정 모델 버전(lib/velocity-engine/version.ts) */
  engineVersion: string;
  totals: {
    users: number;
    sessions: number;
    pitches: number;
    pairs: number;
    clips: number;
    clipBytes: number;
  };
  /** 전체 짝의 편향 · p90 · 표준편차(릴리스 − 건) */
  overall: { biasKmh: number | null; p90Kmh: number | null; sdKmh: number | null };
  /** 날짜 내림차순 */
  days: AdminDayStat[];
  /** 최근 30일 오름차순 — 그래프용. 짝이 없는 날은 biasKmh 가 null */
  recent: { date: string; biasKmh: number | null; pairs: number }[];
  /** 전체 짝으로 맞춘 보정식 — raw(보정 전 카메라 값) · release(릴리스 추정) 기준 */
  fit: { raw: CalFit; release: CalFit };
  /** 카메라 위치 × 네트 × 출처 조합별 */
  bySetup: AdminSetupStat[];
};

export type AdminPitchAnalysis = {
  fps: number | null;
  frameCount: number | null;
  fitQuality: number | null;
  startKmh: number | null;
  endKmh: number | null;
  focalPx: number | null;
  shakePx: number | null;
  /** 잰 순간의 스트라이크 존(장면 비율) — 영상에 겹쳐 그린다. 옛 공은 null */
  zoneRect: { x: number; y: number; w: number; h: number } | null;
};

export type AdminPitchRow = {
  id: string;
  sessionId: string;
  seq: number;
  createdAt: string;
  /** 이 값을 낸 모델 버전 — 옛 자료는 null */
  engineVersion: string | null;
  rawKmh: number;
  kmh: number;
  releaseKmh: number | null;
  errorKmh: number;
  confidence: string;
  releaseDxCm: number | null;
  releaseDyCm: number | null;
  releaseDistM: number | null;
  travelM: number | null;
  durationSec: number | null;
  frames: number | null;
  fps: number | null;
  gunKmh: number | null;
  calibExclude: boolean;
  /** 수기 — 카메라 값 없이 스피드건 값만 적어 올린 공(rawKmh · kmh 는 그 값) */
  manual: boolean;
  autoDetected: boolean;
  pitchType: string | null;
  zone: number | null;
  result: string | null;
  memo: string | null;
  clipPath: string | null;
  /** 서명 재생 주소 — 클립이 없거나 주소를 못 만들면 null */
  clipUrl: string | null;
  clipSec: number | null;
  clipEventSec: number | null;
  clipBytes: number | null;
  clipMime: string | null;
  /** 같은 공의 광각 카메라 영상(앱의 동시 촬영) — 서명 재생 주소 · 길이 · 던진 시각 */
  wideClipPath: string | null;
  wideClipUrl: string | null;
  wideClipSec: number | null;
  wideClipEventSec: number | null;
  analysis: AdminPitchAnalysis | null;
};

export type AdminSessionRow = {
  id: string;
  userId: string;
  nickname: string;
  date: string;
  createdAt: string;
  /** 잰 모델 버전 — 옛 세션은 null */
  engineVersion: string | null;
  source: string;
  mode: string;
  cameraPos: string;
  net: boolean;
  device: string | null;
  fovDeg: number;
  focalPx: number | null;
  /** 렌즈 보정 요약 한 줄(있을 때) */
  lensCal: string | null;
  /**
   * 렌즈 보정의 저장 형식 판(lib/velocity-lens.ts LENS_VERSION). 지금 판이 아니면 다른 자(면적)로 잰 보정이라 다시 잴 때
   * 그 초점거리를 쓰지 않는다(explorer-panels remeasurePitch).
   */
  lensCalVersion: number | null;
  releaseDistM: number | null;
  autoMode: boolean;
  forCalibration: boolean;
  calScale: number;
  calOffset: number;
  calPairs: number;
  frameW: number | null;
  frameH: number | null;
  memo: string | null;
  pitches: AdminPitchRow[];
};

export type AdminDay = {
  date: string;
  stat: AdminDayStat;
  sessions: AdminSessionRow[];
};

/* ───────────────────────── 오차 통계 ───────────────────────── */

import { errorStats, isPair, pitchError } from '@/lib/velocity-stats';
export { errorStats, isPair, pitchError };


/* ───────────────────────── 종합 ───────────────────────── */

type OverviewPitch = {
  sessionId: string;
  userId: string;
  rawKmh: number;
  kmh: number;
  releaseKmh: number | null;
  gunKmh: number | null;
  calibExclude: boolean;
  manual: boolean;
  clipPath: string | null;
  clipBytes: number | null;
  session: { date: Date; cameraPos: string; net: boolean; source: string };
};

const dateKeyOf = (d: Date) => d.toISOString().slice(0, 10);

function dayStatOf(date: string, rows: OverviewPitch[]): AdminDayStat {
  const errors = rows.map(pitchError).filter((e): e is number => e != null);
  return {
    date,
    users: new Set(rows.map((r) => r.userId)).size,
    sessions: new Set(rows.map((r) => r.sessionId)).size,
    pitches: rows.length,
    pairs: errors.length,
    clips: rows.filter((r) => r.clipPath).length,
    maxKmh: rows.length ? Math.max(...rows.map((r) => r.kmh)) : null,
    ...errorStats(errors),
  };
}

function setupLabel(cameraPos: string, net: boolean, source: string) {
  return [
    cameraPos === 'behind-catcher' ? '포수 뒤' : '투수 뒤',
    net ? '네트 있음' : '네트 없음',
    source === 'file' ? '영상 파일' : '카메라',
  ].join(' · ');
}

/* ── 보정 차수 요약 ── */

/** 차수 요약에 필요한 만큼만 — 결과마다 원본 공의 스피드건 · 제외 표시 */
const CALIB_RUN_SELECT = {
  id: true,
  date: true,
  pass: true,
  engineVersion: true,
  userId: true,
  memo: true,
  createdAt: true,
  results: {
    select: {
      ok: true,
      rawKmh: true,
      releaseKmh: true,
      pitch: { select: { gunKmh: true, calibExclude: true } },
    },
  },
} satisfies Prisma.VelocityCalibRunSelect;

type CalibRunLite = Prisma.VelocityCalibRunGetPayload<{ select: typeof CALIB_RUN_SELECT }>;

/**
 * 결과 하나의 오차 — (다시 잰 릴리스 ?? 다시 잰 카메라 값) − 스피드건. 짝 = 잰 것(ok)이고 원본 공에
 * 스피드건 값이 있고 보정에서 빼지 않은 것. 원본이 수기(manual)여도 이번 결과는 영상을 새로 잰 값이라 짝이다.
 */
function calibResultError(r: {
  ok: boolean;
  rawKmh: number | null;
  releaseKmh: number | null;
  pitch: { gunKmh: number | null; calibExclude: boolean };
}): number | null {
  if (!r.ok || r.pitch.gunKmh == null || r.pitch.calibExclude) return null;
  const v = r.releaseKmh ?? r.rawKmh;
  if (v == null) return null;
  return Math.round((v - r.pitch.gunKmh) * 10) / 10;
}

function calibRunSummaryOf(run: CalibRunLite, nickname: string): AdminCalibRunSummary {
  const errors = run.results
    .map(calibResultError)
    .filter((e): e is number => e != null);
  return {
    id: run.id,
    date: dateKeyOf(run.date),
    pass: run.pass,
    engineVersion: run.engineVersion,
    createdAt: run.createdAt.toISOString(),
    nickname,
    memo: run.memo,
    results: run.results.length,
    ok: run.results.filter((r) => r.ok).length,
    pairs: errors.length,
    ...errorStats(errors),
  };
}

/** 돌린 관리자의 별명 — VelocityCalibRun 은 User 와 관계를 두지 않아 따로 읽는다. 탈퇴했으면 '—' */
async function nicknamesOf(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, nickname: true },
  });
  return new Map(users.map((u) => [u.id, u.nickname]));
}

/** [보정] 트리 — 연도 › 월 › 날짜 › 차수, 모두 최근부터 */
function calibTreeOf(runs: AdminCalibRunSummary[]): AdminCalibYear[] {
  const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
  const byDate = new Map<string, AdminCalibRunSummary[]>();
  for (const r of runs) {
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }
  const days: AdminCalibDay[] = [...byDate.entries()]
    .sort(([a], [b]) => desc(a, b))
    .map(([date, list]) => ({
      date,
      runs: [...list].sort((a, b) => b.pass - a.pass),
    }));
  const months = new Map<string, AdminCalibDay[]>();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    const list = months.get(k);
    if (list) list.push(d);
    else months.set(k, [d]);
  }
  const monthRows: AdminCalibMonth[] = [...months.entries()]
    .sort(([a], [b]) => desc(a, b))
    .map(([key, list]) => ({
      key,
      runs: list.reduce((s, d) => s + d.runs.length, 0),
      days: list,
    }));
  const years = new Map<string, AdminCalibMonth[]>();
  for (const m of monthRows) {
    const k = m.key.slice(0, 4);
    const list = years.get(k);
    if (list) list.push(m);
    else years.set(k, [m]);
  }
  return [...years.entries()]
    .sort(([a], [b]) => desc(a, b))
    .map(([key, list]) => ({
      key,
      runs: list.reduce((s, m) => s + m.runs, 0),
      months: list,
    }));
}

/** 종합 — 숫자 타일 · 날짜 목록 · 최근 30일 편향 · 보정식 · 설정별 · [보정] 트리 */
export async function loadVelocityAdminOverview(): Promise<AdminOverview> {
  const [rows, sessionCount, calibRuns] = await Promise.all([
    prisma.velocityPitch.findMany({
      select: {
        sessionId: true,
        userId: true,
        rawKmh: true,
        kmh: true,
        releaseKmh: true,
        gunKmh: true,
        calibExclude: true,
        manual: true,
        clipPath: true,
        clipBytes: true,
        session: { select: { date: true, cameraPos: true, net: true, source: true } },
      },
    }),
    prisma.velocitySession.count(),
    prisma.velocityCalibRun.findMany({
      orderBy: [{ date: 'desc' }, { pass: 'desc' }],
      select: CALIB_RUN_SELECT,
    }),
  ]);
  const nicknames = await nicknamesOf(calibRuns.map((r) => r.userId));
  const calibTree = calibTreeOf(
    calibRuns.map((r) => calibRunSummaryOf(r, nicknames.get(r.userId) ?? '—'))
  );

  /* 날짜별로 묶는다 */
  const byDate = new Map<string, OverviewPitch[]>();
  for (const r of rows) {
    const key = dateKeyOf(r.session.date);
    const list = byDate.get(key);
    if (list) list.push(r);
    else byDate.set(key, [r]);
  }
  const days = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, list]) => dayStatOf(date, list));

  /* 탐색기 트리 — 연도 › 월 › 날짜. 폴더 통계는 그 안의 공 전부로 다시 낸다(p90 은 날짜 값을 합칠 수 없다) */
  const groupBy = (keyOf: (d: string) => string) => {
    const m = new Map<string, OverviewPitch[]>();
    for (const [date, list] of byDate) {
      const k = keyOf(date);
      const acc = m.get(k);
      if (acc) acc.push(...list);
      else m.set(k, [...list]);
    }
    return m;
  };
  const byYear = groupBy((d) => d.slice(0, 4));
  const byMonth = groupBy((d) => d.slice(0, 7));
  const tree: AdminTreeYear[] = [...byYear.keys()]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((year) => ({
      key: year,
      stat: dayStatOf(year, byYear.get(year) as OverviewPitch[]),
      months: [...byMonth.keys()]
        .filter((m) => m.startsWith(`${year}-`))
        .sort((a, b) => (a < b ? 1 : -1))
        .map((month) => ({
          key: month,
          stat: dayStatOf(month, byMonth.get(month) as OverviewPitch[]),
          days: days.filter((d) => d.date.startsWith(`${month}-`)),
        })),
    }));

  /*
   * 최근 30일 — 오늘(한국 날짜)부터 거꾸로 30칸, 오름차순. 서버는 UTC 로 돌아서 UTC 날짜로 세면 한국 0~9시에는 오늘이
   * 빠졌다(세션 날짜는 한국 날짜를 UTC 자정으로 적어 둔 것이라 칸도 그 모양으로 만든다).
   */
  const recent: AdminOverview['recent'] = [];
  const [ty, tm, td] = toDateKey(new Date()).split('-').map(Number);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.UTC(ty, tm - 1, td - i));
    const key = dateKeyOf(d);
    const stat = byDate.has(key)
      ? dayStatOf(key, byDate.get(key) as OverviewPitch[])
      : null;
    recent.push({ date: key, biasKmh: stat?.biasKmh ?? null, pairs: stat?.pairs ?? 0 });
  }

  /* 보정식 — 전체 짝으로 */
  const pairs = rows.filter(isPair);
  const rawPairs: CalPair[] = pairs.map((p) => ({ measured: p.rawKmh, gun: p.gunKmh }));
  const releasePairs: CalPair[] = pairs
    .filter((p) => p.releaseKmh != null)
    .map((p) => ({ measured: p.releaseKmh as number, gun: p.gunKmh }));

  /* 설정별 */
  const bySetupMap = new Map<string, OverviewPitch[]>();
  for (const r of rows) {
    const key = `${r.session.cameraPos}|${r.session.net ? 'net' : 'open'}|${r.session.source}`;
    const list = bySetupMap.get(key);
    if (list) list.push(r);
    else bySetupMap.set(key, [r]);
  }
  const bySetup: AdminSetupStat[] = [...bySetupMap.entries()]
    .map(([key, list]) => {
      const errors = list.map(pitchError).filter((e): e is number => e != null);
      const s = errorStats(errors);
      return {
        key,
        label: setupLabel(
          list[0].session.cameraPos,
          list[0].session.net,
          list[0].session.source
        ),
        pitches: list.length,
        pairs: errors.length,
        biasKmh: s.biasKmh,
        p90Kmh: s.p90Kmh,
      };
    })
    .sort((a, b) => b.pitches - a.pitches);

  return {
    tree,
    calibTree,
    engineVersion: VELOCITY_ENGINE_VERSION,
    totals: {
      users: new Set(rows.map((r) => r.userId)).size,
      sessions: sessionCount,
      pitches: rows.length,
      pairs: pairs.length,
      clips: rows.filter((r) => r.clipPath).length,
      clipBytes: rows.reduce((s, r) => s + (r.clipBytes ?? 0), 0),
    },
    overall: errorStats(rows.map(pitchError).filter((e): e is number => e != null)),
    days,
    recent,
    fit: { raw: fitCalibration(rawPairs), release: fitCalibration(releasePairs) },
    bySetup,
  };
}

/* ───────────────────────── 하루 ───────────────────────── */

const numOrNull = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** analysis JSON 에서 화면에 보여 줄 칸만 — 궤적은 크니 빼고 */
function pickAnalysis(raw: unknown): AdminPitchAnalysis | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  return {
    fps: numOrNull(a.fps),
    frameCount: numOrNull(a.frameCount),
    fitQuality: numOrNull(a.fitQuality),
    startKmh: numOrNull(a.startKmh),
    endKmh: numOrNull(a.endKmh),
    focalPx: numOrNull(a.focalPx),
    shakePx: numOrNull(a.shakePx),
    zoneRect: zoneRectOf(a.zoneRect),
  };
}

function zoneRectOf(raw: unknown): AdminPitchAnalysis['zoneRect'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const z = raw as Record<string, unknown>;
  const x = numOrNull(z.x);
  const y = numOrNull(z.y);
  const w = numOrNull(z.w);
  const h = numOrNull(z.h);
  return x != null && y != null && w != null && h != null && w > 0 && h > 0
    ? { x, y, w, h }
    : null;
}

/** 렌즈 보정 JSON 의 저장 형식 판 — 없으면 null */
function lensCalVersionOf(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return numOrNull((raw as Record<string, unknown>).version);
}

/** 렌즈 보정 JSON(lib/velocity-lens.ts 의 LensCalibration) 한 줄 요약 */
function lensCalText(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const l = raw as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof l.label === 'string' && l.label) parts.push(l.label);
  const f = numOrNull(l.focalPerLongSide);
  if (f != null) parts.push(`f/긴변 ${Math.round(f * 1000) / 1000}`);
  const ball = numOrNull(l.ballPx);
  const dist = numOrNull(l.surfaceDistanceM);
  if (ball != null && dist != null) parts.push(`공 ${Math.round(ball)}px @ ${dist}m`);
  const zoom = numOrNull(l.zoom);
  if (zoom != null && zoom !== 1) parts.push(`줌 ×${zoom}`);
  return parts.length ? parts.join(' · ') : null;
}

/** 세션 + 별명 + 공 전부(차례대로) — 날짜 페이지 · 보정 차수 페이지가 같은 모양으로 읽는다 */
const SESSION_INCLUDE = {
  user: { select: { nickname: true } },
  pitches: { orderBy: { seq: 'asc' } },
} satisfies Prisma.VelocitySessionInclude;

type SessionWithPitches = Prisma.VelocitySessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

function toPitchRow(
  p: SessionWithPitches['pitches'][number],
  urls: Record<string, string>
): AdminPitchRow {
  return {
    id: p.id,
    sessionId: p.sessionId,
    seq: p.seq,
    createdAt: p.createdAt.toISOString(),
    engineVersion: p.engineVersion,
    rawKmh: p.rawKmh,
    kmh: p.kmh,
    releaseKmh: p.releaseKmh,
    errorKmh: p.errorKmh,
    confidence: p.confidence,
    releaseDxCm: p.releaseDxCm,
    releaseDyCm: p.releaseDyCm,
    releaseDistM: p.releaseDistM,
    travelM: p.travelM,
    durationSec: p.durationSec,
    frames: p.frames,
    fps: p.fps,
    gunKmh: p.gunKmh,
    calibExclude: p.calibExclude,
    manual: p.manual,
    autoDetected: p.autoDetected,
    pitchType: p.pitchType,
    zone: p.zone,
    result: p.result,
    memo: p.memo,
    clipPath: p.clipPath,
    clipUrl: p.clipPath ? (urls[p.clipPath] ?? null) : null,
    clipSec: p.clipSec,
    clipEventSec: p.clipEventSec,
    clipBytes: p.clipBytes,
    clipMime: p.clipMime,
    wideClipPath: p.wideClipPath,
    wideClipUrl: p.wideClipPath ? (urls[p.wideClipPath] ?? null) : null,
    wideClipSec: p.wideClipSec,
    wideClipEventSec: p.wideClipEventSec,
    analysis: pickAnalysis(p.analysis),
  };
}

function toSessionRow(s: SessionWithPitches, urls: Record<string, string>): AdminSessionRow {
  return {
    id: s.id,
    userId: s.userId,
    nickname: s.user.nickname,
    date: dateKeyOf(s.date),
    createdAt: s.createdAt.toISOString(),
    engineVersion: s.engineVersion,
    source: s.source,
    mode: s.mode,
    cameraPos: s.cameraPos,
    net: s.net,
    device: s.device,
    fovDeg: s.fovDeg,
    focalPx: s.focalPx,
    lensCal: lensCalText(s.lensCal),
    lensCalVersion: lensCalVersionOf(s.lensCal),
    releaseDistM: s.releaseDistM,
    autoMode: s.autoMode,
    forCalibration: s.forCalibration,
    calScale: s.calScale,
    calOffset: s.calOffset,
    calPairs: s.calPairs,
    frameW: s.frameW,
    frameH: s.frameH,
    memo: s.memo,
    pitches: s.pitches.map((p) => toPitchRow(p, urls)),
  };
}

/** 세션들을 화면 줄로 — 클립 전부의 서명 재생 주소를 한 번에 만든다 */
async function sessionRowsOf(sessions: SessionWithPitches[]): Promise<AdminSessionRow[]> {
  const clipPaths = sessions.flatMap((s) =>
    s.pitches
      .flatMap((p) => [p.clipPath, p.wideClipPath])
      .filter((p): p is string => !!p)
  );
  const urls = clipPaths.length ? await createPlaybackUrls(clipPaths) : {};
  return sessions.map((s) => toSessionRow(s, urls));
}

/** 그날(YYYY-MM-DD)의 모든 계정 세션 — 관리자 날짜 폴더(원본 · 보정 둘 다 이 자료를 쓴다) */
export async function loadVelocityAdminDay(date: string): Promise<AdminDay> {
  const at = new Date(`${date}T00:00:00.000Z`);
  const sessions = await prisma.velocitySession.findMany({
    where: { date: at },
    orderBy: { createdAt: 'asc' },
    include: SESSION_INCLUDE,
  });
  const rows = await sessionRowsOf(sessions);

  /* 그날 타일 — 종합과 같은 계산 */
  const flat: OverviewPitch[] = sessions.flatMap((s) =>
    s.pitches.map((p) => ({
      sessionId: s.id,
      userId: s.userId,
      rawKmh: p.rawKmh,
      kmh: p.kmh,
      releaseKmh: p.releaseKmh,
      gunKmh: p.gunKmh,
      calibExclude: p.calibExclude,
      manual: p.manual,
      clipPath: p.clipPath,
      clipBytes: p.clipBytes,
      session: { date: s.date, cameraPos: s.cameraPos, net: s.net, source: s.source },
    }))
  );

  return { date, stat: dayStatOf(date, flat), sessions: rows };
}

/* ───────────────────────── 보정 차수 ───────────────────────── */

/**
 * 보정 차수 하나 — 요약 + 결과 줄(공마다 원본 공 · 그 세션 · 다시 잰 값). 없는 차수면 null.
 * 결과의 원본 공 · 세션은 날짜 폴더와 같은 모양(클립 주소까지)이라 미리보기가 같은 부품을 쓴다.
 * 줄 차례는 세션이 만들어진 순서, 그 안에서 공 차례(seq).
 */
export async function loadVelocityAdminCalibRun(
  runId: string
): Promise<AdminCalibRunView | null> {
  const run = await prisma.velocityCalibRun.findUnique({
    where: { id: runId },
    select: {
      ...CALIB_RUN_SELECT,
      results: {
        select: {
          id: true,
          pitchId: true,
          ok: true,
          rawKmh: true,
          releaseKmh: true,
          errorKmh: true,
          confidence: true,
          frames: true,
          fps: true,
          reject: true,
          pitch: { select: { sessionId: true, gunKmh: true, calibExclude: true } },
        },
      },
    },
  });
  if (!run) return null;

  const sessionIds = [...new Set(run.results.map((r) => r.pitch.sessionId))];
  const [sessions, nicknames] = await Promise.all([
    sessionIds.length
      ? prisma.velocitySession.findMany({
          where: { id: { in: sessionIds } },
          orderBy: { createdAt: 'asc' },
          include: SESSION_INCLUDE,
        })
      : Promise.resolve([] as SessionWithPitches[]),
    nicknamesOf([run.userId]),
  ]);
  const sessionRows = await sessionRowsOf(sessions);
  const sessionById = new Map(sessionRows.map((s) => [s.id, s]));
  const pitchById = new Map(sessionRows.flatMap((s) => s.pitches.map((p) => [p.id, p])));

  const rows: AdminCalibResultRow[] = [];
  for (const r of run.results) {
    const pitch = pitchById.get(r.pitchId);
    const session = pitch && sessionById.get(pitch.sessionId);
    /* 원본 공이 그새 지워졌으면(결과는 cascade 로 같이 지워지지만 그 사이) 건너뛴다 */
    if (!pitch || !session) continue;
    rows.push({
      id: r.id,
      pitchId: r.pitchId,
      pitch,
      session,
      ok: r.ok,
      rawKmh: r.rawKmh,
      releaseKmh: r.releaseKmh,
      errorKmh: r.errorKmh,
      confidence: r.confidence,
      frames: r.frames,
      fps: r.fps,
      reject: r.reject,
    });
  }
  rows.sort(
    (a, b) =>
      (a.session.createdAt < b.session.createdAt
        ? -1
        : a.session.createdAt > b.session.createdAt
          ? 1
          : 0) || a.pitch.seq - b.pitch.seq
  );

  return {
    ...calibRunSummaryOf(run, nicknames.get(run.userId) ?? '—'),
    rows,
  };
}
