import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createPlaybackUrls, smallLibraryCopies, smallLibraryPath } from '@/lib/storage';
import { visibleExercises, visibleGuides } from '@/lib/library-cache';

/**
 * 아이폰 앱 굽기(GitHub · .github/workflows/ios.yml)가 앱 안에 넣을 운동 · 드릴 영상(720p)을 받는 곳.
 * 회원 로그인 대신 굽기 전용 열쇠(LIBRARY_BUNDLE_TOKEN — Vercel 환경변수 · GitHub 비밀)로만 연다 — 줄인 라이브러리 영상
 * 읽기 주소(1시간)만 준다. 열쇠가 없으면(설정 전) 404.
 */
function authorized(req: Request): boolean {
  const want = process.env.LIBRARY_BUNDLE_TOKEN;
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!want || want.length < 32) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const [exercises, guides, copies] = await Promise.all([
    visibleExercises(),
    visibleGuides(),
    smallLibraryCopies(),
  ]);
  const small = [...new Set([...exercises, ...guides].map((r) => (r.videoPath ? smallLibraryPath(r.videoPath) : null)))].filter(
    (p): p is string => p !== null && copies.has(p)
  );
  const urls = await createPlaybackUrls(small);
  const files = small
    .filter((p) => urls[p])
    .map((p) => ({ key: p.slice(p.indexOf('/') + 1, -'.mp4'.length), url: urls[p] }));
  return NextResponse.json({ files });
}
