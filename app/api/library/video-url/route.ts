import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { createPlaybackUrls, isLibraryPath } from '@/lib/storage';

/** 한 번에 받아갈 수 있는 영상 수. */
const MAX_PATHS = 20;

/**
 * 라이브러리 영상의 재생 주소를 발급한다.
 *
 * 라이브러리는 회원 모두가 보는 자료라 소유자 확인은 하지 않지만,
 * 아무 경로나 열어주면 남의 투구 영상까지 새어 나가므로
 * (1) 라이브러리 폴더인지, (2) 실제로 등록된 영상인지 두 번 확인한다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  try {
    const { paths } = await req.json();

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ urls: {} });
    }
    if (paths.length > MAX_PATHS) {
      return NextResponse.json(
        { error: `한 번에 ${MAX_PATHS}개까지만 요청할 수 있습니다` },
        { status: 400 }
      );
    }

    // 1) 라이브러리 폴더 밖의 경로는 아예 받지 않는다.
    const requested = paths.filter(
      (p): p is string => typeof p === 'string' && isLibraryPath(p)
    );
    if (requested.length === 0) return NextResponse.json({ urls: {} });

    // 2) 실제로 등록된 영상인지 DB에서 다시 확인한다.
    const [exercises, guides] = await Promise.all([
      prisma.exerciseVideo.findMany({
        where: { videoPath: { in: requested } },
        select: { videoPath: true },
      }),
      prisma.mechanicsGuide.findMany({
        where: { videoPath: { in: requested } },
        select: { videoPath: true },
      }),
    ]);

    const registered = new Set([
      ...exercises.map((e) => e.videoPath),
      ...guides.map((g) => g.videoPath),
    ]);
    const allowed = requested.filter((p) => registered.has(p));
    if (allowed.length === 0) return NextResponse.json({ urls: {} });

    return NextResponse.json({ urls: await createPlaybackUrls(allowed) });
  } catch (error) {
    console.error('[POST /api/library/video-url]', error);
    return NextResponse.json(
      { error: '재생 주소를 만들지 못했습니다' },
      { status: 500 }
    );
  }
}
