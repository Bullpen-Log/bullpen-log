import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/jwt';

/*
 * 로그인 없이 볼 수 있는 곳.
 * 약관과 개인정보 처리방침은 가입하기 전에 읽어야 하는 글이라 여기 있어야 한다.
 */
const PUBLIC_ROUTES = ['/', '/login', '/terms', '/privacy'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  const session = await decrypt(request.cookies.get('session')?.value);

  // 로그인이 필요한 페이지에 비로그인 상태로 접근한 경우
  if (!isPublic && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 이미 로그인한 사용자가 로그인 페이지에 접근한 경우
  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/today', request.url));
  }

  return NextResponse.next();
}

/*
 * 로그인 검사를 건너뛸 주소.
 *
 * public/ 아래 파일도 여기 걸린다. 글꼴을 public/fonts 에 두었더니 로그인
 * 화면으로 되돌려져 글꼴이 통째로 안 내려왔다 — 로그인 전 화면이 시스템
 * 글꼴로 나왔다. 파일 확장자로도 함께 거른다.
 */
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico|woff2|woff|css|txt|xml|webmanifest)).*)',
  ],
};
