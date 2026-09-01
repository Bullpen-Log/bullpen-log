import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { createPlaybackUrls, isOwnedBy, isStorageConfigured } from '@/lib/storage';

/** 한 번에 받아갈 수 있는 재생 주소 개수 */
const MAX_PATHS = 10;

/**
 * 지금 화면에 필요한 영상의 재생 주소만 발급한다.
 * 기록이 많아져도 페이지를 열 때마다 전부 발급하지 않도록 요청 시점에 만든다.
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
    const { paths } = await req.json();

    const requested: string[] = Array.isArray(paths)
      ? [...new Set(paths.map((p: unknown) => String(p ?? '').trim()).filter(Boolean))]
      : [];

    if (requested.length === 0) {
      return NextResponse.json({ urls: {} });
    }
    if (requested.length > MAX_PATHS) {
      return NextResponse.json(
        { error: `한 번에 ${MAX_PATHS}개까지만 요청할 수 있습니다` },
        { status: 400 }
      );
    }

    // 경로 형태만으로 1차 확인한 뒤, 실제 본인 기록에 속하는지 DB로 다시 확인한다.
    if (requested.some((p) => !isOwnedBy(p, user.id))) {
      return NextResponse.json({ error: '접근할 수 없는 영상입니다' }, { status: 403 });
    }

    const owned = await prisma.pitchLog.findMany({
      where: { userId: user.id, videoPaths: { hasSome: requested } },
      select: { videoPaths: true },
    });

    const ownedSet = new Set(owned.flatMap((l) => l.videoPaths));
    const allowed = requested.filter((p) => ownedSet.has(p));

    if (allowed.length === 0) {
      return NextResponse.json({ error: '접근할 수 없는 영상입니다' }, { status: 403 });
    }

    return NextResponse.json({ urls: await createPlaybackUrls(allowed) });
  } catch (error) {
    console.error('[POST /api/pitch-log/video-url]', error);
    return NextResponse.json(
      { error: '재생 주소를 만들지 못했습니다' },
      { status: 500 }
    );
  }
}
