import 'server-only';
import { prisma } from '@/lib/prisma';
import { deleteVideos } from '@/lib/storage';

/**
 * 영상 파일이 아직 어딘가에 붙어 있는지 — 지우기 전에 한 곳에서 본다(2026-10-26 '내 영상' P0).
 *
 * 같은 영상 하나를 투구 기록 · 타격 일지 · 구속 측정 공 · 시도 클립이 같이 쓸 수 있다(경로가 같으면 같은 파일).
 * 예전에는 기록을 지우거나 영상을 빼면 그 경로를 묻지 않고 지워, 다른 기록이 쓰던 영상까지 사라질 수 있었다.
 * 이제 지우는 곳은 행을 먼저 지우거나 고친 **뒤에** deleteUnreferenced 를 부른다 — 그때도 남은 참조가 있으면 안 지운다.
 *
 * 경로 맨 앞이 주인(`{userId}/…`)이라 주인별로 묻는다(그 사람 기록만 그 사람 폴더를 쓴다 — 색인도 userId 로 탄다).
 * 엔진 개발용 녹화 조각(관리자)은 주인 칸이 없어 경로로만 묻는다.
 */

/** 경로 맨 앞의 주인 번호 — 꼴이 아니면 null */
export function ownerOfPath(path: string): string | null {
  const i = path.indexOf('/');
  return i > 0 ? path.slice(0, i) : null;
}

/** paths 가운데 지금 어느 기록이 쓰고 있는 것 */
export async function referencedPaths(paths: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  const byOwner = new Map<string, string[]>();
  for (const p of new Set(paths)) {
    const owner = ownerOfPath(p);
    if (!owner) {
      used.add(p); // 꼴을 모르는 경로는 지우지 않는다
      continue;
    }
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), p]);
  }
  await Promise.all(
    [...byOwner].map(async ([userId, own]) => {
      const [logs, hits, clips, attempts, parts] = await Promise.all([
        prisma.pitchLog.findMany({
          where: { userId, videoPaths: { hasSome: own } },
          select: { videoPaths: true },
        }),
        prisma.hittingLog.findMany({
          where: { userId, videoPaths: { hasSome: own } },
          select: { videoPaths: true },
        }),
        prisma.velocityPitch.findMany({
          where: { userId, OR: [{ clipPath: { in: own } }, { wideClipPath: { in: own } }] },
          select: { clipPath: true, wideClipPath: true },
        }),
        prisma.velocityAttempt.findMany({
          where: { userId, clipPath: { in: own } },
          select: { clipPath: true },
        }),
        prisma.velocityRecordingPart.findMany({
          where: { path: { in: own } },
          select: { path: true },
        }),
      ]);
      const hit = new Set<string>([
        ...logs.flatMap((l) => l.videoPaths),
        ...hits.flatMap((h) => h.videoPaths),
        ...clips.flatMap((c) => [c.clipPath, c.wideClipPath]).filter((p): p is string => !!p),
        ...attempts.map((a) => a.clipPath).filter((p): p is string => !!p),
        ...parts.map((p) => p.path),
      ]);
      for (const p of own) if (hit.has(p)) used.add(p);
    })
  );
  return used;
}

/**
 * 아무 기록도 안 쓰는 것만 저장소에서 지우고, 그 경로를 돌려준다. 행을 지우거나 고친 뒤에 부른다.
 * 폰 영상(local-)은 저장소에 파일이 없어 지울 게 없지만(썸네일만), 돌려준 목록으로 앱이 폰에서 지운다.
 */
export async function deleteUnreferenced(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const used = await referencedPaths(paths);
  const orphans = [...new Set(paths)].filter((p) => !used.has(p));
  if (orphans.length > 0) await deleteVideos(orphans);
  return orphans;
}
