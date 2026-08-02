import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import {
  MAX_THUMB_BYTES,
  MAX_VIDEO_BYTES,
  createLibraryUploadTarget,
  isStorageConfigured,
} from '@/lib/storage';

/**
 * 라이브러리(트레이닝·드릴) 영상을 올릴 임시 주소를 발급한다.
 * 회원 모두가 보게 되는 자료이므로 관리자만 올릴 수 있다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }
  // 화면에서 버튼을 숨기는 것과 별개로 서버에서도 반드시 막는다.
  if (user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: '관리자만 라이브러리 영상을 올릴 수 있습니다' },
      { status: 403 }
    );
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: '영상 저장소가 아직 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const { fileName, fileSize, fileType, kind } = await req.json();

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: '파일 이름이 필요합니다' }, { status: 400 });
    }

    // 영상과, 재생 전에 보여줄 미리보기 이미지 두 가지만 받는다.
    const isThumb = kind === 'thumbnail';
    const expectedPrefix = isThumb ? 'image/' : 'video/';
    if (typeof fileType !== 'string' || !fileType.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: isThumb ? '이미지 파일만 올릴 수 있습니다' : '영상 파일만 올릴 수 있습니다' },
        { status: 400 }
      );
    }

    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json(
        { error: '파일 크기를 확인할 수 없습니다' },
        { status: 400 }
      );
    }

    const limit = isThumb ? MAX_THUMB_BYTES : MAX_VIDEO_BYTES;
    if (size > limit) {
      const mb = Math.round(limit / 1024 / 1024);
      return NextResponse.json(
        { error: `${isThumb ? '이미지' : '영상'}는 ${mb}MB 이하만 올릴 수 있습니다` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await createLibraryUploadTarget(fileName, isThumb ? 'thumbnail' : 'video')
    );
  } catch (error) {
    console.error('[POST /api/library/upload-url]', error);
    return NextResponse.json(
      { error: '업로드 주소를 만들지 못했습니다' },
      { status: 500 }
    );
  }
}
