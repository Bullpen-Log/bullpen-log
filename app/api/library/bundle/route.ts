import { NextResponse } from 'next/server';
import { hasBuildToken } from '@/lib/build-token';
import { LIBRARY_HEVC_PREFIX, LIBRARY_SMALL_PREFIX, createPlaybackUrls, smallLibraryCopies, smallLibraryPath } from '@/lib/storage';
import { visibleExercises, visibleGuides } from '@/lib/library-cache';

/**
 * 아이폰 앱 굽기(GitHub · .github/workflows/ios.yml)가 앱 안에 넣을 운동 · 드릴 영상(720p)을 받는 곳.
 * 회원 로그인 대신 굽기 전용 열쇠(LIBRARY_BUNDLE_TOKEN — Vercel 환경변수 · GitHub 비밀)로만 연다 — 줄인 라이브러리 영상
 * 읽기 주소(1시간)만 준다. 열쇠가 없으면(설정 전) 404.
 * `?kind=hevc` 면 새 앱(Expo, ios-native.yml)이 넣는 720p HEVC 판(library-hevc/), 없으면 옛 앱의 H.264 판(library-720/).
 */
export async function GET(req: Request) {
  if (!hasBuildToken(req)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const prefix = new URL(req.url).searchParams.get('kind') === 'hevc' ? LIBRARY_HEVC_PREFIX : LIBRARY_SMALL_PREFIX;
  const [exercises, guides, copies] = await Promise.all([
    visibleExercises(),
    visibleGuides(),
    smallLibraryCopies(prefix),
  ]);
  const small = [...new Set([...exercises, ...guides].map((r) => (r.videoPath ? smallLibraryPath(r.videoPath, prefix) : null)))].filter(
    (p): p is string => p !== null && copies.has(p)
  );
  const urls = await createPlaybackUrls(small);
  const files = small
    .filter((p) => urls[p])
    .map((p) => ({ key: p.slice(p.indexOf('/') + 1, -'.mp4'.length), url: urls[p] }));
  /* kind 를 같이 — 새 앱 굽기가 배포 전 옛 주소(늘 H.264)의 답을 HEVC 로 잘못 받지 않게 이 칸이 올 때까지 다시 묻는다 */
  return NextResponse.json({ kind: prefix === LIBRARY_HEVC_PREFIX ? 'hevc' : 'h264', files });
}
