import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import {
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
    const { fileName, fileSize, fileType } = await req.json();

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: '파일 이름이 필요합니다' }, { status: 400 });
    }

    if (typeof fileType !== 'string' || !fileType.startsWith('video/')) {
      return NextResponse.json(
        { error: '영상 파일만 올릴 수 있습니다' },
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

    if (size > MAX_VIDEO_BYTES) {
      const mb = Math.round(MAX_VIDEO_BYTES / 1024 / 1024);
      return NextResponse.json(
        { error: `영상은 ${mb}MB 이하만 올릴 수 있습니다` },
        { status: 400 }
      );
    }

    return NextResponse.json(await createLibraryUploadTarget(fileName));
  } catch (error) {
    console.error('[POST /api/library/upload-url]', error);
    return NextResponse.json(
      { error: '업로드 주소를 만들지 못했습니다' },
      { status: 500 }
    );
  }
}
