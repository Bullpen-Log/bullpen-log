import 'server-only';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';
import { cutTarget, parseBallLabel, type BallLabel } from '@/lib/velocity-ball-label';

/**
 * 엔진 개발용 녹화 읽기(관리자) — 목록(/admin/velocity/recordings)과 편집기(/admin/velocity/recordings/<id>).
 * 관리자는 누가 찍었든 모든 녹화를 본다(엔진을 같이 고치는 자료).
 */

/** 녹화 때 남긴 카메라 · 설정(lib/velocity-recorder.ts 를 부른 측정 화면의 meta) — 모르는 칸은 null */
export type RecordingMeta = {
  engineVersion: string | null;
  app: boolean | null;
  camera: {
    label: string | null;
    width: number | null;
    height: number | null;
    frameRate: number | null;
    measuredFps: number | null;
  } | null;
  fovDeg: number | null;
  focalRatio: number | null;
  cameraPos: 'behind-pitcher' | 'behind-catcher';
  net: boolean | null;
  releaseDistM: number | null;
  /** 투수 뒤: 폰 → 그물 · 미트(m) — 엔진 2.0 의 거리 자. 2.0 전 녹화는 null */
  targetDistM: number | null;
  mime: string | null;
  bitrate: number | null;
};

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const s = (v: unknown) => (typeof v === 'string' ? v : null);

export function toRecordingMeta(raw: unknown): RecordingMeta {
  const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const c =
    m.camera && typeof m.camera === 'object'
      ? (m.camera as Record<string, unknown>)
      : null;
  return {
    engineVersion: s(m.engineVersion),
    app: typeof m.app === 'boolean' ? m.app : null,
    camera: c
      ? {
          label: s(c.label),
          width: n(c.width),
          height: n(c.height),
          frameRate: n(c.frameRate),
          measuredFps: n(c.measuredFps),
        }
      : null,
    fovDeg: n(m.fovDeg),
    focalRatio: n(m.focalRatio),
    cameraPos: m.cameraPos === 'behind-catcher' ? 'behind-catcher' : 'behind-pitcher',
    net: typeof m.net === 'boolean' ? m.net : null,
    releaseDistM: n(m.releaseDistM),
    targetDistM: n(m.targetDistM),
    mime: s(m.mime),
    bitrate: n(m.bitrate),
  };
}

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export type RecordingListItem = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  createdAt: string;
  status: string;
  durationSec: number | null;
  userName: string | null;
  parts: number;
  bytes: number;
  cuts: number;
  /** 스피드건 값을 적은 공 */
  gunCuts: number;
  memo: string | null;
  /** 측정하는 동안 통째로 찍은 세션 녹화(meta.sessionRecording) — 아니면 엔진 개발용으로 따로 찍은 녹화 */
  session: boolean;
  /** 실제로 올라간 조각 길이 합(초) — 녹화 길이보다 짧으면 그만큼 영상이 빠졌다 */
  uploadedSec: number;
};

/** 녹화 meta 의 세션 녹화 표시 — 앱 · 웹 측정 화면의 세션 녹화가 남긴다 */
export const isSessionRecording = (meta: unknown) =>
  meta != null &&
  typeof meta === 'object' &&
  (meta as Record<string, unknown>).sessionRecording === true;

export async function loadVelocityRecordings(): Promise<RecordingListItem[]> {
  const rows = await prisma.velocityRecording.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: {
      id: true,
      userId: true,
      date: true,
      createdAt: true,
      status: true,
      durationSec: true,
      memo: true,
      meta: true,
      parts: { select: { bytes: true, durationSec: true } },
      cuts: { select: { gunKmh: true } },
    },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, nickname: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.nickname]));
  return rows.map((r) => ({
    id: r.id,
    date: dateKey(r.date),
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    durationSec: r.durationSec,
    userName: nameOf.get(r.userId) ?? null,
    parts: r.parts.length,
    bytes: r.parts.reduce((t, p) => t + p.bytes, 0),
    cuts: r.cuts.length,
    gunCuts: r.cuts.filter((c) => c.gunKmh != null).length,
    memo: r.memo,
    session: isSessionRecording(r.meta),
    uploadedSec: r.parts.reduce((t, p) => t + (p.durationSec ?? 0), 0),
  }));
}

export type RecordingPartRow = {
  id: string;
  index: number;
  path: string;
  /** 재생 · 내려받기 주소(한 시간) — 저장소가 설정되지 않았으면 null */
  url: string | null;
  bytes: number;
  mime: string;
  offsetSec: number;
  durationSec: number | null;
};

export type RecordingCutRow = {
  id: string;
  partId: string;
  startSec: number;
  endSec: number;
  eventSec: number | null;
  gunKmh: number | null;
  pitchType: string | null;
  memo: string | null;
  excluded: boolean;
  ok: boolean | null;
  rawKmh: number | null;
  releaseKmh: number | null;
  errorKmh: number | null;
  reject: string | null;
  engineVersion: string | null;
  measuredAt: string | null;
  createdAt: string;
};

export type RecordingDetail = {
  /** 사람이 찍은 공 자리 — 컷 id 로(없는 컷은 칸 없음) */
  labels: Record<string, BallLabel>;
  id: string;
  date: string;
  createdAt: string;
  status: string;
  durationSec: number | null;
  memo: string | null;
  userName: string | null;
  meta: RecordingMeta;
  /** 세션 녹화인가(목록의 칸과 같은 판정) */
  session: boolean;
  parts: RecordingPartRow[];
  cuts: RecordingCutRow[];
};

export async function loadVelocityRecording(
  id: string
): Promise<RecordingDetail | null> {
  const r = await prisma.velocityRecording.findUnique({
    where: { id },
    include: {
      parts: { orderBy: { index: 'asc' } },
      cuts: { orderBy: [{ createdAt: 'asc' }] },
    },
  });
  if (!r) return null;
  const [user, urls, labelRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: r.userId }, select: { nickname: true } }),
    createPlaybackUrls(r.parts.map((p) => p.path)).catch(
      () => ({}) as Record<string, string>
    ),
    prisma.velocityBallLabel.findMany({
      where: { target: { in: r.cuts.map((c) => cutTarget(c.id)) } },
    }),
  ]);
  const labels: Record<string, BallLabel> = {};
  for (const l of labelRows) {
    const parsed = parseBallLabel({
      sourceW: l.sourceW,
      sourceH: l.sourceH,
      frames: l.frames,
    });
    if (parsed) labels[l.target.slice('cut:'.length)] = parsed;
  }
  const partIndex = new Map(r.parts.map((p) => [p.id, p.index]));
  return {
    id: r.id,
    date: dateKey(r.date),
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    durationSec: r.durationSec,
    memo: r.memo,
    userName: user?.nickname ?? null,
    meta: toRecordingMeta(r.meta),
    session: isSessionRecording(r.meta),
    labels,
    parts: r.parts.map((p) => ({
      id: p.id,
      index: p.index,
      path: p.path,
      url: urls[p.path] ?? null,
      bytes: p.bytes,
      mime: p.mime,
      offsetSec: p.offsetSec,
      durationSec: p.durationSec,
    })),
    /* 조각 차례 → 조각 안 시각 순 */
    cuts: r.cuts
      .map((c) => ({
        id: c.id,
        partId: c.partId,
        startSec: c.startSec,
        endSec: c.endSec,
        eventSec: c.eventSec,
        gunKmh: c.gunKmh,
        pitchType: c.pitchType,
        memo: c.memo,
        excluded: c.excluded,
        ok: c.ok,
        rawKmh: c.rawKmh,
        releaseKmh: c.releaseKmh,
        errorKmh: c.errorKmh,
        reject: c.reject,
        engineVersion: c.engineVersion,
        measuredAt: c.measuredAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      }))
      .sort(
        (a, b) =>
          (partIndex.get(a.partId) ?? 0) - (partIndex.get(b.partId) ?? 0) ||
          a.startSec - b.startSec
      ),
  };
}

/** 녹화 수 — 구속 측정 관리자(휴대폰)의 단추에 */
export async function countVelocityRecordings(): Promise<number> {
  return prisma.velocityRecording.count();
}

/** 세션 녹화 수(측정하는 동안 통째로 찍은 것) — 관리자 화면의 '세션 녹화' 단추에 */
export async function countSessionRecordings(): Promise<number> {
  return prisma.velocityRecording.count({
    where: { meta: { path: ['sessionRecording'], equals: true } },
  });
}
