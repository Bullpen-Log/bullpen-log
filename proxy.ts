import { NextResponse, type NextRequest } from 'next/server';
import { isPhoneBrowser } from '@/lib/app-env';

/**
 * 웹은 PC · 맥에서만, 휴대폰은 앱만(2026-10-20 김민) — 휴대폰 브라우저는 어느 주소로 와도 '앱으로 써 주세요'(/phone)를 본다(주소는 그대로).
 * 앱(웹뷰 · 이름표 BullpenLogApp)은 그대로 지나간다. 휴대폰에서도 여는 곳: 약관 · 개인정보(앱 설정 · 가입이 사파리 창으로 연다) ·
 * 앱 웹뷰가 쓰는 /embed · /velocity-engine · 안내 화면 자신. /api · /_next · 파일(점이 든 주소)은 아예 안 본다.
 */
const OPEN = /^\/(phone|terms|privacy|embed|velocity-engine)(\/|$)/;

export function proxy(req: NextRequest) {
  if (!isPhoneBrowser(req.headers.get('user-agent')) || OPEN.test(req.nextUrl.pathname)) return NextResponse.next();
  return NextResponse.rewrite(new URL('/phone', req.url));
}

export const config = { matcher: ['/((?!api/|_next/|.*\\..*).*)'] };
