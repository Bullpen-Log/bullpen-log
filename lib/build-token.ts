import { timingSafeEqual } from 'node:crypto';

/**
 * 굽기 전용 열쇠(LIBRARY_BUNDLE_TOKEN — Vercel 환경변수 · GitHub 비밀) — GitHub 굽기가 회원 로그인 대신 이것으로 사이트를 부른다
 * (운동 영상 받기 /api/library/bundle). 열쇠가 없거나 32자 밑이면 늘 거절.
 */
export function hasBuildToken(req: Request): boolean {
  return matches(req, process.env.LIBRARY_BUNDLE_TOKEN);
}

/**
 * 앱 업데이트 올리기(/api/app-update/publish) 열쇠 — 모든 사용자 앱의 화면 코드를 바꾸는 열쇠라 운동 영상 열쇠와 따로 둔다(2026-10-21 김민).
 * APP_UPDATE_TOKEN 이 서버에 있으면 그것만 받는다. 아직 없으면 옮기는 동안 LIBRARY_BUNDLE_TOKEN 으로 받고 경고를 남긴다.
 */
export function hasAppUpdateToken(req: Request): boolean {
  const own = process.env.APP_UPDATE_TOKEN;
  if (own) return matches(req, own);
  const ok = hasBuildToken(req);
  if (ok) console.warn('[app-update] APP_UPDATE_TOKEN 이 없어 LIBRARY_BUNDLE_TOKEN 으로 받았다 — Vercel · GitHub 에 APP_UPDATE_TOKEN 을 넣어 주세요');
  return ok;
}

function matches(req: Request, want: string | undefined): boolean {
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!want || want.length < 32) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
