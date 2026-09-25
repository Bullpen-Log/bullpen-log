import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import {
  AVATAR_TYPES,
  MAX_AVATAR_BYTES,
  createAvatarUploadTarget,
  isStorageConfigured,
} from '@/lib/storage';

/**
 * 브라우저가 프로필 사진을 저장소로 직접 올릴 임시 주소를 발급한다.
 *
 * 투구 영상과 같은 방식이다(app/api/pitch-log/upload-url). 파일 자체는 서버를
 * 거치지 않으므로, 서버가 받을 수 있는 크기에 매이지 않는다.
 *
 * 주소는 로그인한 본인 폴더로만 나간다 — 경로를 폼에서 받지 않고 여기서
 * 사용자 id 로 만든다. 남의 폴더에 올릴 방법이 없다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: '저장소가 아직 설정되지 않았습니다. 관리자에게 문의해주세요.' },
      { status: 503 }
    );
  }

  try {
    const { fileSize, fileType } = await req.json();

    if (typeof fileType !== 'string' || !AVATAR_TYPES.includes(fileType)) {
      return NextResponse.json(
        { error: '사진은 JPG·PNG·WebP·GIF 만 올릴 수 있습니다' },
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

    if (size > MAX_AVATAR_BYTES) {
      const mb = Math.round(MAX_AVATAR_BYTES / 1024 / 1024);
      return NextResponse.json(
        { error: `사진은 ${mb}MB 이하만 올릴 수 있습니다` },
        { status: 400 }
      );
    }

    return NextResponse.json(await createAvatarUploadTarget(user.id, fileType));
  } catch (error) {
    console.error('[POST /api/profile/avatar-url]', error);
    return NextResponse.json(
      { error: '업로드 주소를 만들지 못했습니다' },
      { status: 500 }
    );
  }
}
