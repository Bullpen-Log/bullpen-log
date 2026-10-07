import 'server-only';
import { prisma } from '@/lib/prisma';
import { deleteVideos } from '@/lib/storage';
import { VELOCITY_MEMO_MARK } from '@/lib/velocity-meta';

/**
 * 구속 측정 세션의 뒷정리 — 본인 액션(app/actions/velocity.ts)과 관리자 액션(velocity-admin.ts)이 같이 쓴다.
 */

/** 같이 만든 투구 기록의 메모 — 이 표시로 시작하는 기록만 세션이 다룬다 */
export function velocityLogMemo(n: number) {
  return `${VELOCITY_MEMO_MARK} 카메라로 잰 ${n}구 — 자세한 값은 아래 '구속 측정'에`;
}

/**
 * 공이 줄었으면 같이 만든 투구 기록의 투구수 · 구속을 다시 맞춘다. 공이 하나도 안 남으면
 * 세션과 그 기록을 지운다. 사람이 따로 만든 기록(표시 없음)은 건드리지 않는다.
 */
export async function syncVelocitySession(sessionId: string) {
  const session = await prisma.velocitySession.findUnique({
    where: { id: sessionId },
    select: {
      pitchLogId: true,
      pitchLog: { select: { memo: true } },
      pitches: { select: { kmh: true } },
    },
  });
  if (!session) return;
  const own =
    !!session.pitchLogId && !!session.pitchLog?.memo?.startsWith(VELOCITY_MEMO_MARK);

  if (session.pitches.length === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.velocitySession.delete({ where: { id: sessionId } });
      if (own)
        await tx.pitchLog.delete({ where: { id: session.pitchLogId as string } });
    });
    return;
  }
  if (!own) return;
  const kmhs = session.pitches.map((p) => p.kmh);
  await prisma.pitchLog.update({
    where: { id: session.pitchLogId as string },
    data: {
      pitchCount: kmhs.length,
      maxVelocity: Math.max(...kmhs),
      avgVelocity:
        Math.round((kmhs.reduce((s, v) => s + v, 0) / kmhs.length) * 10) / 10,
      memo: velocityLogMemo(kmhs.length),
    },
  });
}

/** 세션과 같이 만든 투구 기록 · 공들의 영상 클립을 지운다(세션 삭제 전에 부른다) */
export async function deleteVelocitySessionRows(sessionId: string) {
  const session = await prisma.velocitySession.findUnique({
    where: { id: sessionId },
    select: {
      pitchLogId: true,
      pitchLog: { select: { memo: true } },
      pitches: { select: { clipPath: true, wideClipPath: true } },
    },
  });
  if (!session) return null;
  const clips = session.pitches
    .flatMap((p) => [p.clipPath, p.wideClipPath])
    .filter((p): p is string => !!p);
  await prisma.$transaction(async (tx) => {
    await tx.velocitySession.delete({ where: { id: sessionId } });
    if (session.pitchLogId && session.pitchLog?.memo?.startsWith(VELOCITY_MEMO_MARK)) {
      await tx.pitchLog.delete({ where: { id: session.pitchLogId } });
    }
  });
  if (clips.length) await deleteVideos(clips).catch(() => undefined);
  return session;
}

/** 공 하나를 지운다(클립 포함) 뒤 세션을 맞춘다 */
export async function deleteVelocityPitchRow(pitch: {
  id: string;
  sessionId: string;
  clipPath: string | null;
  /** 같은 공의 광각 영상 — 없으면 null */
  wideClipPath?: string | null;
}) {
  await prisma.velocityPitch.delete({ where: { id: pitch.id } });
  const clips = [pitch.clipPath, pitch.wideClipPath].filter((p): p is string => !!p);
  if (clips.length) await deleteVideos(clips).catch(() => undefined);
  await syncVelocitySession(pitch.sessionId);
}

/** 카메라 실시간의 촬영 조건(lib/velocity-analysis.ts AnalysisJson.live) — 아는 코드 · 숫자만 */
const LIVE_NOTE_CODES = new Set([
  'LOW_FPS',
  'TIMING',
  'APPROACH',
  'LOW_RES',
  'CROPPED',
  'FOV_GUESS',
  'ZOOM',
  'HDR',
  'BLUR',
  'DARK_BALL',
  /* 대비 길(모델 1.9.0)로 잰 공 — live-meter.ts LiveNoteCode 와 같이 늘린다 */
  'FALLBACK',
  /* 엔진 2.0 — 끝을 이어 찾음 · 찍는 동안 흔들림 */
  'END_GUESS',
  'SHAKE',
]);
const LIVE_PIPELINES = new Set(['worker-stream', 'worker-frames', 'main']);
/** 잰 순간의 스트라이크 존(장면 비율 0~1) — 넷 다 0~1 이고 폭 · 높이가 있을 때만 */
function sanitizeZoneRect(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const z = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const k of ['x', 'y', 'w', 'h']) {
    const v = z[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return null;
    out[k] = Math.round(v * 10000) / 10000;
  }
  return out.w > 0 && out.h > 0 ? out : null;
}
function sanitizeLive(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const obj = (v: unknown) =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  const t = obj(l.timing);
  const f = obj(l.frame);
  return {
    notes: Array.isArray(l.notes)
      ? l.notes.filter(
          (c): c is string => typeof c === 'string' && LIVE_NOTE_CODES.has(c)
        )
      : [],
    sigmaRel: n(l.sigmaRel),
    focalFromLens: l.focalFromLens === true,
    timing: t
      ? {
          frames: n(t.frames),
          medianGapMs: n(t.medianGapMs),
          sdGapMs: n(t.sdGapMs),
          maxGapMs: n(t.maxGapMs),
          dropped: n(t.dropped),
          regularized: t.regularized === true,
        }
      : null,
    pipeline:
      typeof l.pipeline === 'string' && LIVE_PIPELINES.has(l.pipeline)
        ? l.pipeline
        : null,
    frame: f
      ? {
          format: typeof f.format === 'string' ? f.format.slice(0, 12) : null,
          rotation: n(f.rotation),
          visible: Array.isArray(f.visible) ? f.visible.slice(0, 2).map(n) : null,
          rotationFix: n(f.rotationFix),
        }
      : null,
    zoom: n(l.zoom),
  };
}

/**
 * 엔진이 본 자료(분석 JSON)를 저장할 모양으로 다듬는다 — 숫자만, 궤적은 200점까지.
 * 브라우저가 보낸 것을 그대로 믿지 않는다.
 */
/** 모델 2.0 의 거리 자 기록 — 숫자 · 정해진 낱말만 */
function sanitizeDistance(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const distanceM = n(d.distanceM);
  if (distanceM == null || distanceM <= 0 || distanceM > 100) return null;
  return {
    method: 'distance',
    distanceM,
    inputDistM: n(d.inputDistM),
    sizeDistM: n(d.sizeDistM),
    distanceSource: d.distanceSource === 'ball' ? 'ball' : 'input',
    tiltRad: n(d.tiltRad),
    impact: d.impact === 'rebound' ? 'rebound' : 'end',
    te: n(d.te),
    flightFrames: n(d.flightFrames),
    extended: n(d.extended),
    rmsPx: n(d.rmsPx),
    kmh3d: n(d.kmh3d),
    kmhHorizontal: n(d.kmhHorizontal),
    firstDepthM: n(d.firstDepthM),
    launchDeg: n(d.launchDeg),
    releasePx:
      Array.isArray(d.releasePx) && d.releasePx.length === 2 && d.releasePx.every((x) => n(x) != null)
        ? (d.releasePx as number[]).map((x) => Math.round(x))
        : null,
    endSizeRatio: n(d.endSizeRatio),
    sizeSlope: n(d.sizeSlope),
    shakePx: n(d.shakePx),
  };
}

export function sanitizeAnalysis(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const size = (v: unknown) => {
    const s = v as { width?: unknown; height?: unknown } | null;
    const w = n(s?.width);
    const h = n(s?.height);
    return w && h ? { width: Math.round(w), height: Math.round(h) } : null;
  };
  const track = Array.isArray(a.track)
    ? a.track
        .slice(0, 200)
        .map((p) => {
          const row = Array.isArray(p) ? p : null;
          if (!row || row.length < 4) return null;
          const vals = row.slice(0, 4).map(n);
          return vals.every((v) => v != null)
            ? vals.map((v) => Math.round((v as number) * 1000) / 1000)
            : null;
        })
        .filter((p): p is number[] => !!p)
    : [];
  const out: Record<string, unknown> = {
    v: a.v === 3 ? 3 : a.v === 2 ? 2 : 1,
    /* v3(모델 2.0) — 거리 자로 잰 것(lib/velocity-analysis.ts distance) */
    distance: sanitizeDistance(a.distance),
    /* v2(모델 1.6.0) — 어느 자로 쟀나 · 흐림 · SE(lib/velocity-analysis.ts) */
    ruler: a.ruler === 'limb' || a.ruler === 'area' ? a.ruler : null,
    /* 밝은 배경 앞의 어두운 공(두 번째 길)으로 잰 공 — 자가 달라 보정 짝에 섞지 않으려고(lib/velocity-analysis.ts) */
    polarity:
      a.polarity === 'bright' || a.polarity === 'dark' || a.polarity === 'mixed'
        ? a.polarity
        : null,
    /* 대비 길(모델 1.9.0)로 잰 공 — 보정 짝에 섞지 않으려고(lib/velocity-analysis.ts) */
    fallback: a.fallback === 'close' || a.fallback === 'center' ? a.fallback : null,
    edgeWidthPx: n(a.edgeWidthPx),
    blurCorrectionPx: n(a.blurCorrectionPx),
    startSeKmh: n(a.startSeKmh),
    track,
    analyzeSize: size(a.analyzeSize),
    sourceSize: size(a.sourceSize),
    fps: n(a.fps),
    shakePx: n(a.shakePx),
    focalPx: n(a.focalPx),
    fitQuality: n(a.fitQuality),
    startKmh: n(a.startKmh),
    endKmh: n(a.endKmh),
    frameCount: n(a.frameCount),
    approach: a.approach === 'approaching' ? 'approaching' : 'receding',
    live: sanitizeLive(a.live),
    zoneRect: sanitizeZoneRect(a.zoneRect),
  };
  return JSON.stringify(out).length > 40_000 ? null : out;
}
