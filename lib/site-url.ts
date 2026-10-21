/**
 * 사이트 주소(2026-10-21 개편 7단계) — sitemap · 공유 미리보기 · 코드 로그인 링크가 쓴다.
 * 도메인을 사면 Vercel 에 `NEXT_PUBLIC_SITE_URL=https://<도메인>` 을 넣는다(7-1, 사용자 몫). 옛 vercel 주소는 앱(native/src/lib/site.ts)이 보므로 계속 산다.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bullpen-log.vercel.app').replace(/\/$/, '');

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
