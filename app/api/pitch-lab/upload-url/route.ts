import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { MAX_VIDEO_BYTES, isStorageConfigured } from '@/lib/storage';
import { createLabUploadTarget } from '@/lib/pitch-lab';
import { isLabId, isLabView } from '@/lib/pitch-lab-meta';

/**
 * 투구 분석 실험실(베타) — 옆 · 뒤 영상 하나를 저장소로 직접 올릴 임시 주소. 관리자만.
 * 샘플 번호 · 어느 쪽은 주소의 ?pair= · ?view= 로 받는다(components/video-upload.tsx 의 uploadToStorage 가 몸통을 정한다).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자만 올릴 수 있어요' }, { status: 403 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: '영상 저장소가 아직 설정되지 않았어요.' }, { status: 503 });
  }

  const params = new URL(req.url).searchParams;
  const pair = params.get('pair');
  const view = params.get('view');
  if (!isLabId(pair) || !isLabView(view)) {
    return NextResponse.json({ error: '샘플 번호를 확인할 수 없어요' }, { status: 400 });
  }

  try {
    const { fileName, fileSize, fileType } = await req.json();
    if (typeof fileType !== 'string' || !fileType.startsWith('video/')) {
      return NextResponse.json({ error: '영상 파일만 올릴 수 있어요' }, { status: 400 });
    }
    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: '파일 크기를 확인할 수 없어요' }, { status: 400 });
    }
    if (size > MAX_VIDEO_BYTES) {
      const mb = Math.round(MAX_VIDEO_BYTES / 1024 / 1024);
      return NextResponse.json({ error: `영상은 ${mb}MB 이하만 올릴 수 있어요` }, { status: 400 });
    }
    const target = await createLabUploadTarget(
      user.id,
      pair,
      view,
      typeof fileName === 'string' ? fileName : 'video.mp4'
    );
    return NextResponse.json(target);
  } catch (error) {
    console.error('[POST /api/pitch-lab/upload-url]', error);
    return NextResponse.json({ error: '업로드 주소를 만들지 못했어요' }, { status: 500 });
  }
}
