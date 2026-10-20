import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { createUploadTarget, isStorageConfigured } from '@/lib/storage';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/market/specs';

/**
 * 장터 사진을 브라우저가 저장소로 바로 올릴 임시 주소(2026-10-20) — 프로필 사진(app/api/profile/avatar-url)과 같은 방식.
 * 주소는 로그인한 본인 폴더로만 나간다. 올린 경로는 물건 저장(app/actions/market.ts)에서 isOwnedBy 로 다시 본다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  if (!isStorageConfigured())
    return NextResponse.json(
      { error: '저장소가 아직 설정되지 않았어요.' },
      { status: 503 }
    );
  try {
    const { fileSize, fileType } = await req.json();
    if (typeof fileType !== 'string' || !IMAGE_TYPES.includes(fileType))
      return NextResponse.json(
        { error: '사진은 JPG · PNG · WebP 만 올릴 수 있어요' },
        { status: 400 }
      );
    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0)
      return NextResponse.json(
        { error: '파일 크기를 확인할 수 없어요' },
        { status: 400 }
      );
    if (size > MAX_IMAGE_BYTES)
      return NextResponse.json(
        {
          error: `사진은 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있어요`,
        },
        { status: 400 }
      );
    const ext =
      fileType === 'image/png' ? 'png' : fileType === 'image/webp' ? 'webp' : 'jpg';
    return NextResponse.json(await createUploadTarget(user.id, `market.${ext}`));
  } catch (error) {
    console.error('[POST /api/market/upload-url]', error);
    return NextResponse.json(
      { error: '업로드 주소를 만들지 못했어요' },
      { status: 500 }
    );
  }
}
