import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { deleteVideos, isOwnAvatarPath, isOwnedBy } from '@/lib/storage';

/** 한 번에 받는 경로 수 — 기록 하나에 영상은 두 개까지다 */
const MAX_PATHS = 10;

/**
 * 올렸다가 저장하지 않고 버린 투구 영상을 지운다 — 기록 폼에서 새로 올린 영상을 빼거나, 저장하지 않고 폼을 닫을 때
 * (app/(app)/pitch-log/entry-form.tsx).
 *
 * 예전에는 버린 업로드가 저장소에 영영 남았다(영상과 자동 미리보기, 두 개씩). 지우기 전에 꼭 본다:
 * - 이 사람 폴더의 파일인가(isOwnedBy) — 프로필 사진은 아닌가
 * - 어느 투구 기록(videoPaths)에도, 어느 구속 측정 공(clipPath)에도 안 붙어 있는가. 붙어 있으면 건드리지 않는다 —
 *   저장이 먼저 끝났거나 다른 기록이 쓰는 파일이다.
 * 미리보기(thumb-…)는 deleteVideos 가 영상 이름에서 찾아 같이 지운다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { paths?: unknown };
  const asked = Array.isArray(body.paths)
    ? body.paths.map((p) => String(p ?? '').trim()).filter(Boolean)
    : [];
  const own = [...new Set(asked)]
    .slice(0, MAX_PATHS)
    .filter(
      (p) => isOwnedBy(p, user.id) && !isOwnAvatarPath(p, user.id) && !p.includes('..')
    );
  if (own.length === 0) return NextResponse.json({ deleted: 0 });

  const [logs, clips] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, videoPaths: { hasSome: own } },
      select: { videoPaths: true },
    }),
    prisma.velocityPitch.findMany({
      where: {
        userId: user.id,
        OR: [{ clipPath: { in: own } }, { wideClipPath: { in: own } }],
      },
      select: { clipPath: true, wideClipPath: true },
    }),
  ]);
  const used = new Set<string>([
    ...logs.flatMap((l) => l.videoPaths),
    ...clips
      .flatMap((c) => [c.clipPath, c.wideClipPath])
      .filter((p): p is string => p != null),
  ]);
  const orphans = own.filter((p) => !used.has(p));
  if (orphans.length > 0) await deleteVideos(orphans);

  return NextResponse.json({ deleted: orphans.length });
}
