import 'server-only';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';
import { fitCalibration, type CalFit, type CalPair } from '@/lib/velocity-calibration';

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

export type AdminOverview = {
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
};

export type AdminPitchRow = {
  id: string;
  seq: number;
  createdAt: string;
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
  analysis: AdminPitchAnalysis | null;
};

export type AdminSessionRow = {
  id: string;
  userId: string;
  nickname: string;
  date: string;
  createdAt: string;
  source: string;
  mode: string;
  cameraPos: string;
  net: boolean;
  device: string | null;
  fovDeg: number;
  focalPx: number | null;
  /** 렌즈 보정 요약 한 줄(있을 때) */
  lensCal: string | null;
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

type PairLike = {
  kmh: number;
  releaseKmh: number | null;
  gunKmh: number | null;
  calibExclude: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 짝인가 — 스피드건 값이 있고 보정에서 빼지 않은 공 */
export function isPair<T extends PairLike>(p: T): p is T & { gunKmh: number } {
  return p.gunKmh != null && !p.calibExclude;
}

/** 공 하나의 오차 — (릴리스 추정 ?? 보정 후 값) − 스피드건. 짝이 아니면 null */
export function pitchError(p: PairLike): number | null {
  if (!isPair(p)) return null;
  return round1((p.releaseKmh ?? p.kmh) - p.gunKmh);
}

/** 오차 묶음의 편향 · p90 · 표준편차. 짝이 없으면 전부 null */
export function errorStats(errors: number[]): {
  biasKmh: number | null;
  p90Kmh: number | null;
  sdKmh: number | null;
} {
  const n = errors.length;
  if (n === 0) return { biasKmh: null, p90Kmh: null, sdKmh: null };
  const mean = errors.reduce((s, v) => s + v, 0) / n;
  const abs = errors.map((e) => Math.abs(e)).sort((a, b) => a - b);
  /* 90 백분위 — 가장 가까운 순위(nearest-rank) */
  const p90 = abs[Math.min(n - 1, Math.max(0, Math.ceil(n * 0.9) - 1))];
  const sd =
    n > 1 ? Math.sqrt(errors.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { biasKmh: round1(mean), p90Kmh: round1(p90), sdKmh: round1(sd) };
}

/* ───────────────────────── 종합 ───────────────────────── */

type OverviewPitch = {
  sessionId: string;
  userId: string;
  rawKmh: number;
  kmh: number;
  releaseKmh: number | null;
  gunKmh: number | null;
  calibExclude: boolean;
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

/** 종합 — 숫자 타일 · 날짜 목록 · 최근 30일 편향 · 보정식 · 설정별 */
export async function loadVelocityAdminOverview(): Promise<AdminOverview> {
  const [rows, sessionCount] = await Promise.all([
    prisma.velocityPitch.findMany({
      select: {
        sessionId: true,
        userId: true,
        rawKmh: true,
        kmh: true,
        releaseKmh: true,
        gunKmh: true,
        calibExclude: true,
        clipPath: true,
        clipBytes: true,
        session: { select: { date: true, cameraPos: true, net: true, source: true } },
      },
    }),
    prisma.velocitySession.count(),
  ]);

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

  /* 최근 30일 — 오늘(UTC 날짜 기준)부터 거꾸로 30칸, 오름차순 */
  const recent: AdminOverview['recent'] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)
    );
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
  };
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

/** 그날(YYYY-MM-DD)의 모든 계정 세션 — 관리자 날짜 페이지 */
export async function loadVelocityAdminDay(date: string): Promise<AdminDay> {
  const at = new Date(`${date}T00:00:00.000Z`);
  const sessions = await prisma.velocitySession.findMany({
    where: { date: at },
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { nickname: true } },
      pitches: { orderBy: { seq: 'asc' } },
    },
  });

  /* 그날 클립 전부의 재생 주소를 한 번에 */
  const clipPaths = sessions.flatMap((s) =>
    s.pitches.map((p) => p.clipPath).filter((p): p is string => !!p)
  );
  const urls = clipPaths.length ? await createPlaybackUrls(clipPaths) : {};

  const rows: AdminSessionRow[] = sessions.map((s) => ({
    id: s.id,
    userId: s.userId,
    nickname: s.user.nickname,
    date,
    createdAt: s.createdAt.toISOString(),
    source: s.source,
    mode: s.mode,
    cameraPos: s.cameraPos,
    net: s.net,
    device: s.device,
    fovDeg: s.fovDeg,
    focalPx: s.focalPx,
    lensCal: lensCalText(s.lensCal),
    releaseDistM: s.releaseDistM,
    autoMode: s.autoMode,
    forCalibration: s.forCalibration,
    calScale: s.calScale,
    calOffset: s.calOffset,
    calPairs: s.calPairs,
    frameW: s.frameW,
    frameH: s.frameH,
    memo: s.memo,
    pitches: s.pitches.map((p) => ({
      id: p.id,
      seq: p.seq,
      createdAt: p.createdAt.toISOString(),
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
      analysis: pickAnalysis(p.analysis),
    })),
  }));

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
      clipPath: p.clipPath,
      clipBytes: p.clipBytes,
      session: { date: s.date, cameraPos: s.cameraPos, net: s.net, source: s.source },
    }))
  );

  return { date, stat: dayStatOf(date, flat), sessions: rows };
}
