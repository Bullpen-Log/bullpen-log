import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/jwt';

const PUBLIC_ROUTES = ['/', '/login'];

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
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
};
