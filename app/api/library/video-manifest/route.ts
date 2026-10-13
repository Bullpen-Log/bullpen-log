import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { isLibraryPath } from '@/lib/storage';
import { visibleExercises, visibleGuides } from '@/lib/library-cache';

/**
 * 지금 보이는 운동 · 드릴 영상 경로 목록 — 아이폰 앱이 앱 안에 없는 영상(새로 올리거나 고친 것)만 받아 두는 데 쓴다
 * (components/library-sync.tsx). 경로만 주고 재생 주소는 주지 않는다(받을 때 /api/library/video-url 로).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  }
  const [exercises, guides] = await Promise.all([visibleExercises(), visibleGuides()]);
  const paths = [...new Set([...exercises, ...guides].map((r) => r.videoPath))].filter(
    (p): p is string => typeof p === 'string' && isLibraryPath(p)
  );
  return NextResponse.json({ paths });
}
