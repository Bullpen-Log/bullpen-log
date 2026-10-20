import { timingSafeEqual } from 'node:crypto';

/**
 * 굽기 전용 열쇠(LIBRARY_BUNDLE_TOKEN — Vercel 환경변수 · GitHub 비밀) — GitHub 굽기가 회원 로그인 대신 이것으로 사이트를 부른다
 * (운동 영상 받기 /api/library/bundle · 앱 업데이트 올리기 /api/app-update/publish). 열쇠가 없거나 32자 밑이면 늘 거절.
 */
export function hasBuildToken(req: Request): boolean {
  const want = process.env.LIBRARY_BUNDLE_TOKEN;
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!want || want.length < 32) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
