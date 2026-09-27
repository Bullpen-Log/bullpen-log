import 'server-only';
import { prisma } from '@/lib/prisma';
import type { VelocitySessionView } from '@/lib/velocity-meta';

/**
 * 구속 측정을 읽는다 — 서버 컴포넌트가 쓴다.
 *
 * 서버 액션 파일(app/actions/velocity.ts)에 두지 않는다. 그 파일에서 내보낸 함수는 무엇이든
 * 브라우저가 부를 수 있어서, userId 를 받는 읽기 함수를 거기 두면 남의 것을 읽을 수 있다.
 */

const CONFIDENCES = ['high', 'medium', 'low'] as const;

/** 그날의 측정 세션들 — 그날 화면(/pitch-log/<날짜>) */
export async function loadVelocityDay(
  userId: string,
  at: Date
): Promise<VelocitySessionView[]> {
  const rows = await prisma.velocitySession.findMany({
    where: { userId, date: at },
    orderBy: { createdAt: 'asc' },
    include: { pitches: { orderBy: { seq: 'asc' } } },
  });
  return rows.map((s) => ({
    id: s.id,
    date: s.date.toISOString().slice(0, 10),
    pitchLogId: s.pitchLogId,
    fovDeg: s.fovDeg,
    calScale: s.calScale,
    calOffset: s.calOffset,
    calPairs: s.calPairs,
    source: s.source,
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
    })),
  }));
}

/** 날짜별 요약(공 수 · 최고) — 투구 기록 캘린더의 그날 칸 */
export async function loadVelocityByDate(
  userId: string
): Promise<Record<string, { n: number; max: number }>> {
  const rows = await prisma.velocityPitch.findMany({
    where: { userId },
    select: { kmh: true, session: { select: { date: true } } },
  });
  const out: Record<string, { n: number; max: number }> = {};
  for (const r of rows) {
    const key = r.session.date.toISOString().slice(0, 10);
    const cur = out[key] ?? { n: 0, max: 0 };
    cur.n += 1;
    cur.max = Math.max(cur.max, r.kmh);
    out[key] = cur;
  }
  return out;
}
