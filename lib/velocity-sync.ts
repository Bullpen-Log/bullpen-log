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
      pitches: { select: { clipPath: true } },
    },
  });
  if (!session) return null;
  const clips = session.pitches.map((p) => p.clipPath).filter((p): p is string => !!p);
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
}) {
  await prisma.velocityPitch.delete({ where: { id: pitch.id } });
  if (pitch.clipPath) await deleteVideos([pitch.clipPath]).catch(() => undefined);
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
]);
const LIVE_PIPELINES = new Set(['worker-stream', 'worker-frames', 'main']);
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
  };
}

/**
 * 엔진이 본 자료(분석 JSON)를 저장할 모양으로 다듬는다 — 숫자만, 궤적은 200점까지.
 * 브라우저가 보낸 것을 그대로 믿지 않는다.
 */
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
    v: a.v === 2 ? 2 : 1,
    /* v2(모델 1.6.0) — 어느 자로 쟀나 · 흐림 · SE(lib/velocity-analysis.ts) */
    ruler: a.ruler === 'limb' || a.ruler === 'area' ? a.ruler : null,
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
  };
  return JSON.stringify(out).length > 40_000 ? null : out;
}
