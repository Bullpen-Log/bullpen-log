import 'server-only';
import { prisma } from '@/lib/prisma';
import { mergeVideos, type MyVideoClip, type MyVideoItem, type MyVideoLog } from '@/lib/my-videos';

/** @db.Date → 'YYYY-MM-DD' */
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/* ponytail: 클립은 최근 1,000개까지만 — 공마다 클립이 생겨 한 사람이 수천 개가 될 수 있다. 넘치면 서버에서 쪽 나누기로 */
const MAX_CLIPS = 1000;

/**
 * 한 사람의 '내 영상' 전부 — UserVideo 줄 · 투구/타격 기록의 영상 · 회원 구속 측정 클립을 경로로 합친다(lib/my-videos.ts).
 * 보정용 세션 · 시도 클립 · 녹화 조각 · 광각 클립 · 3D 샘플은 넣지 않는다(관리자 자료).
 */
export async function loadMyVideos(userId: string): Promise<MyVideoItem[]> {
  const [rows, pitchLogs, hitLogs, clips] = await Promise.all([
    prisma.userVideo.findMany({
      where: { userId },
      select: {
        path: true,
        storage: true,
        sport: true,
        capturedDate: true,
        capturedSource: true,
        origin: true,
        feelNote: true,
        revisit: true,
        durationSec: true,
        createdAt: true,
        deletedAt: true,
      },
    }),
    prisma.pitchLog.findMany({
      where: { userId, NOT: { videoPaths: { isEmpty: true } } },
      select: {
        id: true,
        date: true,
        sessionType: true,
        pitchCount: true,
        memo: true,
        cuesGood: true,
        cuesBad: true,
        videoPaths: true,
      },
    }),
    prisma.hittingLog.findMany({
      where: { userId, NOT: { videoPaths: { isEmpty: true } } },
      select: { id: true, date: true, sessionType: true, swings: true, memo: true, videoPaths: true },
    }),
    prisma.velocityPitch.findMany({
      where: { userId, clipPath: { not: null }, session: { forCalibration: false } },
      orderBy: { createdAt: 'desc' },
      take: MAX_CLIPS,
      select: {
        id: true,
        sessionId: true,
        kmh: true,
        pitchType: true,
        clipPath: true,
        session: { select: { date: true } },
      },
    }),
  ]);

  const logs: { log: MyVideoLog; paths: string[] }[] = [
    ...pitchLogs.map((l) => ({
      paths: l.videoPaths,
      log: {
        id: l.id,
        kind: 'pitch' as const,
        date: dayKey(l.date),
        type: l.sessionType,
        count: l.pitchCount,
        memo: l.memo,
        cuesGood: l.cuesGood,
        cuesBad: l.cuesBad,
      },
    })),
    ...hitLogs.map((l) => ({
      paths: l.videoPaths,
      log: {
        id: l.id,
        kind: 'hit' as const,
        date: dayKey(l.date),
        type: l.sessionType,
        count: l.swings,
        memo: l.memo,
        cuesGood: [],
        cuesBad: [],
      },
    })),
  ];
  const clipRows = clips.flatMap((c) =>
    c.clipPath
      ? [
          {
            path: c.clipPath,
            clip: {
              pitchId: c.id,
              sessionId: c.sessionId,
              date: dayKey(c.session.date),
              kmh: c.kmh,
              pitchType: c.pitchType,
            } satisfies MyVideoClip,
          },
        ]
      : []
  );

  return mergeVideos({
    rows: rows
      .filter((r) => !r.deletedAt)
      .map((r) => ({
        ...r,
        capturedDate: r.capturedDate ? dayKey(r.capturedDate) : null,
        createdAt: r.createdAt.toISOString(),
      })),
    deleted: rows.filter((r) => r.deletedAt).map((r) => r.path),
    logs,
    clips: clipRows,
  });
}
