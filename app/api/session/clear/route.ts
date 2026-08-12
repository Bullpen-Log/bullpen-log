import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/session';

/**
 * 남아 있는 세션 쿠키를 지우고 로그인 화면으로 보낸다.
 *
 * 토큰은 유효한데 그 회원이 DB에 없으면(예: 관리자가 계정을 삭제한 뒤)
 * 로그인 화면과 대시보드가 서로 떠넘기는 무한 리다이렉트가 생긴다.
 * 페이지를 그리는 중에는 쿠키를 지울 수 없어서, requireUser 가 그런
 * 세션을 발견하면 여기를 거쳐 쿠키를 지우고 나간다.
 */
export async function GET(request: Request) {
  await deleteSession();
  return NextResponse.redirect(new URL('/login', request.url));
}
