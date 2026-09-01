import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import {
  MAX_VIDEO_BYTES,
  createUploadTarget,
  isStorageConfigured,
} from '@/lib/storage';

/**
 * 브라우저가 영상을 저장소로 직접 올릴 수 있는 임시 주소를 발급한다.
 * 파일 자체는 서버를 거치지 않으므로 용량 제한에 걸리지 않는다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: '영상 저장소가 아직 설정되지 않았습니다. 관리자에게 문의해주세요.' },
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

    const target = await createUploadTarget(user.id, fileName);
    return NextResponse.json(target);
  } catch (error) {
    console.error('[POST /api/pitch-log/upload-url]', error);
    return NextResponse.json(
      { error: '업로드 주소를 만들지 못했습니다' },
      { status: 500 }
    );
  }
}
