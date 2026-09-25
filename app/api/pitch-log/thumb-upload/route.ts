import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import {
  MAX_THUMB_BYTES,
  createPitchThumbUploadTarget,
  isOwnedBy,
  isStorageConfigured,
  pitchThumbPath,
} from '@/lib/storage';

/**
 * 투구 영상 미리보기를 올릴 임시 주소를 준다. 같은 자리에 덮어쓴다.
 *
 * 영상을 올린 직후(아직 기록을 저장하기 전)에도 부른다 — 그래서 DB 의 기록을 보지 않고
 * 경로가 본인 폴더인지만 본다. 미리보기 자리는 영상 경로에서 정해지므로(pitchThumbPath)
 * 남의 영상 자리에는 쓸 수 없다.
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
    const { videoPath, fileSize, fileType } = await req.json();
    const path = typeof videoPath === 'string' ? videoPath.trim() : '';
    const thumbPath = path && isOwnedBy(path, user.id) ? pitchThumbPath(path) : null;
    if (!thumbPath) {
      return NextResponse.json({ error: '접근할 수 없는 영상입니다' }, { status: 403 });
    }

    if (fileType !== 'image/jpeg') {
      return NextResponse.json({ error: '미리보기는 JPEG 만 됩니다' }, { status: 400 });
    }
    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_THUMB_BYTES) {
      return NextResponse.json(
        { error: '미리보기 크기가 올바르지 않습니다' },
        { status: 400 }
      );
    }

    return NextResponse.json(await createPitchThumbUploadTarget(thumbPath));
  } catch (error) {
    console.error('[POST /api/pitch-log/thumb-upload]', error);
    return NextResponse.json(
      { error: '업로드 주소를 만들지 못했습니다' },
      { status: 500 }
    );
  }
}
