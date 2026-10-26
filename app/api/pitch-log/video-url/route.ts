import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { createPlaybackUrls, isOwnedBy, isStorageConfigured } from '@/lib/storage';
import { referencedPaths } from '@/lib/video-refs';

/** 한 번에 받아갈 수 있는 재생 주소 개수 */
const MAX_PATHS = 10;

/**
 * 지금 화면에 필요한 영상의 재생 주소만 발급한다.
 * 기록이 많아져도 페이지를 열 때마다 전부 발급하지 않도록 요청 시점에 만든다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: '영상 저장소가 설정되지 않았어요' },
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
        { error: `한 번에 ${MAX_PATHS}개까지만 요청할 수 있어요` },
        { status: 400 }
      );
    }

    // 경로 형태만으로 1차 확인한 뒤, 실제 본인 기록에 속하는지 DB로 다시 확인한다.
    if (requested.some((p) => !isOwnedBy(p, user.id))) {
      return NextResponse.json({ error: '접근할 수 없는 영상이에요' }, { status: 403 });
    }

    /*
     * 본인 기록 어딘가(투구 · 타격 기록 · 내 영상 · 구속 측정 공)에 붙은 영상만 — 지우기 검사와 같은 곳에서 본다(lib/video-refs.ts).
     * 예전엔 투구 기록만 봐서 '내 영상'에 따로 남긴 관리자 영상 · 타격 기록 영상이 '불러오지 못했어요'였다(2026-10-27)
     */
    const ownedSet = await referencedPaths(requested);
    const allowed = requested.filter((p) => ownedSet.has(p));

    if (allowed.length === 0) {
      return NextResponse.json({ error: '접근할 수 없는 영상이에요' }, { status: 403 });
    }

    return NextResponse.json({ urls: await createPlaybackUrls(allowed) });
  } catch (error) {
    console.error('[POST /api/pitch-log/video-url]', error);
    return NextResponse.json(
      { error: '재생 주소를 만들지 못했어요' },
      { status: 500 }
    );
  }
}
