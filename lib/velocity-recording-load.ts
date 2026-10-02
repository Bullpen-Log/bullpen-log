import 'server-only';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';

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
};

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
      parts: { select: { bytes: true } },
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
  id: string;
  date: string;
  createdAt: string;
  status: string;
  durationSec: number | null;
  memo: string | null;
  userName: string | null;
  meta: RecordingMeta;
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
  const [user, urls] = await Promise.all([
    prisma.user.findUnique({ where: { id: r.userId }, select: { nickname: true } }),
    createPlaybackUrls(r.parts.map((p) => p.path)).catch(
      () => ({}) as Record<string, string>
    ),
  ]);
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
