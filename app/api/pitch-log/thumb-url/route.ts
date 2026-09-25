import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import {
  createPlaybackUrls,
  forgetPlaybackUrls,
  isOwnedBy,
  isStorageConfigured,
  pitchThumbPath,
} from '@/lib/storage';

/** 한 번에 물을 수 있는 영상 수 — 영상 캘린더 한 달(하루 대표 하나)이 넉넉히 들어간다 */
const MAX_PATHS = 40;

/**
 * 투구 영상 미리보기의 주소 — 영상 캘린더가 칸마다 채운다.
 *
 * 영상 경로를 받아, 그 미리보기가 있으면 주소를 돌려준다(없으면 빠진다). 빠진 것은
 * 화면이 영상에서 한 장면을 떠 올린다(/api/pitch-log/thumb-upload).
 *
 * fresh 를 주면 들고 있던 주소를 버리고 새로 만든다 — 방금 새 장면을 올린 뒤에, 같은
 * 주소면 브라우저가 옛 그림을 그대로 보여주기 때문이다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: '영상 저장소가 설정되지 않았습니다' },
      { status: 503 }
    );
  }

  try {
    const { paths, fresh } = await req.json();
    const requested: string[] = Array.isArray(paths)
      ? [...new Set(paths.map((p: unknown) => String(p ?? '').trim()).filter(Boolean))]
      : [];

    if (requested.length === 0) return NextResponse.json({ thumbs: {} });
    if (requested.length > MAX_PATHS) {
      return NextResponse.json(
        { error: `한 번에 ${MAX_PATHS}개까지만 요청할 수 있습니다` },
        { status: 400 }
      );
    }
    if (requested.some((p) => !isOwnedBy(p, user.id))) {
      return NextResponse.json({ error: '접근할 수 없는 영상입니다' }, { status: 403 });
    }

    /* 경로 모양만 보지 않고, 실제로 본인 기록에 붙은 영상인지 DB 로 다시 본다 */
    const owned = await prisma.pitchLog.findMany({
      where: { userId: user.id, videoPaths: { hasSome: requested } },
      select: { videoPaths: true },
    });
    const ownedSet = new Set(owned.flatMap((l) => l.videoPaths));

    const pairs = requested
      .filter((p) => ownedSet.has(p))
      .map((video) => ({ video, thumb: pitchThumbPath(video) }))
      .filter((x): x is { video: string; thumb: string } => x.thumb !== null);

    if (fresh === true) forgetPlaybackUrls(pairs.map((x) => x.thumb));
    const urls = await createPlaybackUrls(pairs.map((x) => x.thumb));

    const thumbs: Record<string, string> = {};
    for (const { video, thumb } of pairs) {
      if (urls[thumb]) thumbs[video] = urls[thumb];
    }
    return NextResponse.json({ thumbs });
  } catch (error) {
    console.error('[POST /api/pitch-log/thumb-url]', error);
    return NextResponse.json(
      { error: '미리보기 주소를 만들지 못했습니다' },
      { status: 500 }
    );
  }
}
