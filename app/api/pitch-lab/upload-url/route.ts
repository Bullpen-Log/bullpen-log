import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { isStorageConfigured } from '@/lib/storage';
import { createLabUploadTarget, findLabOwner } from '@/lib/pitch-lab';
import {
  LAB_MAX_VIDEO_BYTES,
  LAB_MAX_VIDEO_MB,
  isLabId,
  isLabSport,
  isLabView,
} from '@/lib/pitch-lab-meta';
import { can } from '@/lib/permissions';

/**
 * 3D 동작 분석(베타) — 옆 · 뒤 영상 하나를 저장소로 직접 올릴 임시 주소. 로그인한 누구나 — 자기 폴더에만(관리자는 관리자끼리).
 * 샘플 번호 · 어느 쪽은 주소의 ?pair= · ?view= 로 받는다(components/video-upload.tsx 의 uploadToStorage 가 몸통을 정한다).
 * ?sport=hit 면 3D 스윙 분석(타자) 폴더(swing-lab, 2026-10-21) — 그때만 3D 개발 관리자가 마커 샘플의 ③ · ④ 카메라(view cam3 · cam4)도 올린다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: '영상 저장소가 아직 설정되지 않았어요.' },
      { status: 503 }
    );
  }

  const params = new URL(req.url).searchParams;
  const pair = params.get('pair');
  const view = params.get('view');
  const rawSport = params.get('sport');
  const sport = rawSport == null ? 'pitch' : rawSport;
  const extraCam = (view === 'cam3' || view === 'cam4') && sport === 'hit' && can(user.role, 'dev3d');
  if (!isLabId(pair) || !isLabSport(sport) || !(isLabView(view) || extraCam)) {
    return NextResponse.json(
      { error: '샘플 번호를 확인할 수 없어요' },
      { status: 400 }
    );
  }

  try {
    const { fileName, fileSize, fileType } = await req.json();
    if (typeof fileType !== 'string' || !fileType.startsWith('video/')) {
      return NextResponse.json(
        { error: '영상 파일만 올릴 수 있어요' },
        { status: 400 }
      );
    }
    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json(
        { error: '파일 크기를 확인할 수 없어요' },
        { status: 400 }
      );
    }
    if (size > LAB_MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: `영상은 ${LAB_MAX_VIDEO_MB}MB 이하만 올릴 수 있어요` },
        { status: 400 }
      );
    }
    /* 다른 관리자가 만든 샘플에 다시 올리면 그 폴더에(관리자끼리), 새 샘플은 내 폴더에 — 일반 사용자는 늘 자기 폴더 */
    const target = await createLabUploadTarget(
      (await findLabOwner(pair, user, sport)) ?? user.id,
      pair,
      view as 'side' | 'back' | 'cam3' | 'cam4',
      typeof fileName === 'string' ? fileName : 'video.mp4',
      sport
    );
    return NextResponse.json(target);
  } catch (error) {
    console.error('[POST /api/pitch-lab/upload-url]', error);
    return NextResponse.json(
      { error: '업로드 주소를 만들지 못했어요' },
      { status: 500 }
    );
  }
}
