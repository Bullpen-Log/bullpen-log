import 'server-only';
import { prisma } from '@/lib/prisma';
import { mergeVideos, type MyVideoItem, type MyVideoLog } from '@/lib/my-videos';

/** @db.Date → 'YYYY-MM-DD' */
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 한 사람의 '내 영상' 전부 — UserVideo 줄 · 투구/타격 기록의 영상을 경로로 합친다(lib/my-videos.ts).
 * 구속 측정 클립은 넣지 않는다(2026-10-27 김민 "표시할 필요 없다" — 공마다 생겨 갤러리를 덮는다. 투구 그날 화면의 구속 칸에서 본다).
 * 시도 클립 · 녹화 조각 · 3D 샘플(관리자 자료)도 넣지 않는다.
 */
export async function loadMyVideos(userId: string): Promise<MyVideoItem[]> {
  const [rows, pitchLogs, hitLogs] = await Promise.all([
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
    clips: [],
  });
}
