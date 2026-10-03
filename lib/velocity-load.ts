import 'server-only';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';
import { isRect } from '@/lib/velocity-setup';
import type {
  DayClip,
  PitchClipView,
  VelocityDayFact,
  VelocitySessionView,
} from '@/lib/velocity-meta';
import type { VelocityHistoryItem } from '@/components/velocity/session-types';

/**
 * 구속 측정을 읽는다 — 서버 컴포넌트가 쓴다.
 *
 * 서버 액션 파일(app/actions/velocity.ts)에 두지 않는다. 그 파일에서 내보낸 함수는 무엇이든
 * 브라우저가 부를 수 있어서, userId 를 받는 읽기 함수를 거기 두면 남의 것을 읽을 수 있다.
 */

const CONFIDENCES = ['high', 'medium', 'low'] as const;

/**
 * 그날의 측정 세션들 — 그날 화면(/pitch-log/<날짜>).
 *
 * 공마다 영상(일반 · 광각)의 재생 주소를 한 번에 만든다. 읽는 줄이 이 사람 것(userId)뿐이라 남의 영상 주소는 나가지 않는다.
 * 저장소가 안 되면 영상만 빠지고 화면은 그대로 뜬다.
 */
export async function loadVelocityDay(
  userId: string,
  at: Date
): Promise<VelocitySessionView[]> {
  const rows = await prisma.velocitySession.findMany({
    where: { userId, date: at },
    orderBy: { createdAt: 'asc' },
    include: { pitches: { orderBy: { seq: 'asc' } } },
  });
  const paths = rows.flatMap((s) =>
    s.pitches.flatMap((p) => [p.clipPath, p.wideClipPath]).filter((p): p is string => !!p)
  );
  const urls = paths.length
    ? await createPlaybackUrls(paths).catch((err: unknown) => {
        console.error('[velocity] 그날 영상 주소를 만들지 못함', err);
        return {} as Record<string, string>;
      })
    : {};
  const clipOf = (
    path: string | null,
    eventSec: number | null,
    sec: number | null
  ): PitchClipView | null => {
    const url = path ? urls[path] : undefined;
    return url ? { url, eventSec, sec } : null;
  };
  return rows.map((s) => ({
    id: s.id,
    date: s.date.toISOString().slice(0, 10),
    pitchLogId: s.pitchLogId,
    fovDeg: s.fovDeg,
    calScale: s.calScale,
    calOffset: s.calOffset,
    calPairs: s.calPairs,
    source: s.source,
    mode: s.mode,
    cameraPos: s.cameraPos,
    net: s.net,
    device: s.device,
    createdAt: s.createdAt.toISOString(),
    pitches: s.pitches.map((p) => ({
      id: p.id,
      seq: p.seq,
      rawKmh: p.rawKmh,
      kmh: p.kmh,
      errorKmh: p.errorKmh,
      confidence: (CONFIDENCES as readonly string[]).includes(p.confidence)
        ? (p.confidence as (typeof CONFIDENCES)[number])
        : 'medium',
      releaseKmh: p.releaseKmh,
      releaseDxCm: p.releaseDxCm,
      releaseDyCm: p.releaseDyCm,
      releaseDistM: p.releaseDistM,
      travelM: p.travelM,
      durationSec: p.durationSec,
      frames: p.frames,
      fps: p.fps,
      pitchType: p.pitchType,
      zone: p.zone,
      result: p.result,
      gunKmh: p.gunKmh,
      memo: p.memo,
      clip: clipOf(p.clipPath, p.clipEventSec, p.clipSec),
      wideClip: clipOf(p.wideClipPath, p.wideClipEventSec, p.wideClipSec),
      zoneRect: zoneRectOf(p.analysis),
    })),
  }));
}

/**
 * 그날 클립만 — 홈 캘린더 정보의 영상 칸(/api/day-detail?clips=1). 그날 화면의 loadVelocityDay 보다 가볍게: 클립이 남은 공만,
 * 일반 카메라 영상만 서명한다(광각은 그날 화면에서). 서명이 안 되면 그 공은 빠진다.
 */
export async function loadVelocityClipsDay(userId: string, at: Date): Promise<DayClip[]> {
  const rows = await prisma.velocityPitch.findMany({
    where: { userId, clipPath: { not: null }, session: { date: at } },
    orderBy: [{ session: { createdAt: 'asc' } }, { seq: 'asc' }],
    select: {
      id: true,
      seq: true,
      kmh: true,
      pitchType: true,
      zone: true,
      clipPath: true,
      clipEventSec: true,
      clipSec: true,
      analysis: true,
      session: { select: { cameraPos: true } },
    },
  });
  if (rows.length === 0) return [];
  const urls = await createPlaybackUrls(rows.map((r) => r.clipPath!)).catch((err: unknown) => {
    console.error('[velocity] 그날 클립 주소를 만들지 못함', err);
    return {} as Record<string, string>;
  });
  return rows.flatMap((r) => {
    const url = urls[r.clipPath!];
    if (!url) return [];
    return [
      {
        id: r.id,
        seq: r.seq,
        kmh: r.kmh,
        pitchType: r.pitchType,
        zone: r.zone,
        zoneRect: zoneRectOf(r.analysis),
        clip: { url, eventSec: r.clipEventSec, sec: r.clipSec },
        cameraPos: r.session.cameraPos,
      },
    ];
  });
}

/** 분석 JSON 에 실린 잰 순간의 스트라이크 존(analysis.zoneRect) — 꼴이 틀리면 null */
function zoneRectOf(analysis: unknown) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return null;
  const z = (analysis as Record<string, unknown>).zoneRect;
  return isRect(z) && z.w > 0 && z.h > 0 ? { x: z.x, y: z.y, w: z.w, h: z.h } : null;
}

/**
 * 지난 세션 전부(오래된 것부터) — 구속 측정 메인 화면(/velocity)의 구속 변화 그래프 · 최근 세션 목록.
 * 공은 kmh 와 구종만 읽는다 — 그래프에는 세션마다 최고 · 평균 · 공 수면 된다.
 */
export async function loadVelocityHistory(userId: string): Promise<VelocityHistoryItem[]> {
  const rows = await prisma.velocitySession.findMany({
    where: { userId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      date: true,
      createdAt: true,
      mode: true,
      cameraPos: true,
      net: true,
      pitchLog: { select: { sessionType: true } },
      pitches: { select: { kmh: true, pitchType: true } },
    },
  });
  return rows
    .filter((s) => s.pitches.length > 0)
    .map((s) => {
      const kmhs = s.pitches.map((p) => p.kmh);
      const byType: Record<string, number> = {};
      for (const p of s.pitches) if (p.pitchType) byType[p.pitchType] = (byType[p.pitchType] ?? 0) + 1;
      return {
        id: s.id,
        date: s.date.toISOString().slice(0, 10),
        createdAt: s.createdAt.toISOString(),
        sessionType: s.pitchLog?.sessionType ?? null,
        mode: s.mode,
        cameraPos: s.cameraPos,
        net: s.net,
        n: kmhs.length,
        maxKmh: Math.max(...kmhs),
        avgKmh: Math.round((kmhs.reduce((a, b) => a + b, 0) / kmhs.length) * 10) / 10,
        byType,
      };
    });
}

/**
 * 날짜별 요약(공 수 · 최고 · 영상 수) — 투구 기록 캘린더의 그날 칸 · 홈 캘린더 정보.
 * from 을 주면 그날부터(홈은 캘린더가 처음 받는 범위만).
 */
export async function loadVelocityByDate(
  userId: string,
  from?: Date
): Promise<Record<string, VelocityDayFact>> {
  const rows = await prisma.velocityPitch.findMany({
    where: { userId, ...(from ? { session: { date: { gte: from } } } : {}) },
    select: {
      id: true,
      kmh: true,
      pitchType: true,
      zone: true,
      clipPath: true,
      session: { select: { date: true } },
    },
    orderBy: { id: 'asc' },
  });
  const out: Record<string, VelocityDayFact> = {};
  const hash: Record<string, number> = {};
  for (const r of rows) {
    const key = r.session.date.toISOString().slice(0, 10);
    const cur = out[key] ?? { n: 0, max: 0, clips: 0, sig: '' };
    cur.n += 1;
    cur.max = Math.max(cur.max, r.kmh);
    if (r.clipPath) cur.clips += 1;
    out[key] = cur;
    /* 지문 — 공마다 바뀌는 칸을 이어 붙여 짧게(FNV-1a 32비트). 차례는 id 로 고정 */
    let h = hash[key] ?? 0x811c9dc5;
    const line = `${r.id}|${r.pitchType ?? ''}|${r.zone ?? ''}|${r.kmh}|${r.clipPath ? 1 : 0};`;
    for (let i = 0; i < line.length; i++) h = Math.imul(h ^ line.charCodeAt(i), 0x01000193);
    hash[key] = h;
  }
  for (const [key, h] of Object.entries(hash)) out[key].sig = (h >>> 0).toString(36);
  return out;
}
