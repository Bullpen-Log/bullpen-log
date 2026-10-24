import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { createUploadTarget, isStorageConfigured } from '@/lib/storage';
import { MEDIA_TYPES, MEDIA_VIDEO_MAX_MB } from '@/lib/community';
import { MAX_IMAGE_BYTES } from '@/lib/market/specs';

/**
 * 커뮤니티 글의 사진 · 영상을 브라우저가 저장소로 바로 올릴 임시 주소 — 장터(app/api/market/upload-url)와 같은 방식.
 * 주소는 로그인한 본인 폴더로만 나간다. 올린 경로는 글 저장(app/actions/community.ts)이 isOwnedBy 로 다시 본다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  if (!isStorageConfigured())
    return NextResponse.json({ error: '저장소가 아직 설정되지 않았어요.' }, { status: 503 });
  try {
    const { fileSize, fileType } = await req.json();
    const ext = typeof fileType === 'string' ? MEDIA_TYPES[fileType] : undefined;
    if (!ext)
      return NextResponse.json(
        { error: '사진(JPG · PNG · WebP)이나 영상(MP4 · MOV)만 올릴 수 있어요' },
        { status: 400 }
      );
    const size = Number(fileSize);
    const video = fileType.startsWith('video/');
    const max = video ? MEDIA_VIDEO_MAX_MB * 1024 * 1024 : MAX_IMAGE_BYTES;
    if (!Number.isFinite(size) || size <= 0)
      return NextResponse.json({ error: '파일 크기를 확인할 수 없어요' }, { status: 400 });
    if (size > max)
      return NextResponse.json(
        { error: `${video ? '영상' : '사진'}은 ${Math.round(max / 1024 / 1024)}MB 이하만 올릴 수 있어요` },
        { status: 400 }
      );
    return NextResponse.json(await createUploadTarget(user.id, `community.${ext}`));
  } catch (error) {
    console.error('[POST /api/community/upload-url]', error);
    return NextResponse.json({ error: '업로드 주소를 만들지 못했어요' }, { status: 500 });
  }
}
