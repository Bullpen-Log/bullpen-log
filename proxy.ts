import { NextResponse, type NextRequest } from 'next/server';
import { isPhoneBrowser, surfaceOf } from '@/lib/app-env';

/**
 * 웹은 PC · 맥에서만, 휴대폰은 앱만(2026-10-20 김민) — 휴대폰 브라우저는 어느 주소로 와도 '앱으로 써 주세요'(/phone)를 본다(주소는 그대로).
 * 앱(웹뷰 · 이름표 BullpenLogApp)은 그대로 지나간다. 휴대폰에서도 여는 곳: 약관 · 개인정보(앱 설정 · 가입이 사파리 창으로 연다) ·
 * 앱 웹뷰가 쓰는 /embed · /velocity-engine · 안내 화면 자신. /api · /_next · 파일(점이 든 주소)은 아예 안 본다.
 */
/* 덕아웃(/ · /intro)은 휴대폰 브라우저도 본다 — 로그인 없이 보는 바깥 공간이라 검색으로 온 사람이 막히면 안 된다(2026-10-20 금윤호) */
/* 덕아웃(2026-10-21 2단계부터 뿌리 주소: / · /market · /chat · /lessons · /venues · /gear · /me · /search · /pay · /u · /notifications)은 휴대폰 브라우저도 본다 */
/*
 * /login(가입 ?signup=1 · 폰 로그인 /login/qr 포함)도 연다(2026-10-26 커뮤니티) — 덕아웃에서 '로그인하고 댓글 달기'를 누르면 '앱으로 써 주세요'에 막혔다.
 * 로그인 뒤는 ?next= 로 돌아간 덕아웃 화면이고, next 가 없는 선수 계정은 /today 로 가서 예전처럼 '앱으로 써 주세요'를 본다(싱커 화면은 그대로 막힘).
 * 비밀번호 찾기 화면은 아직 없다(메일 보내는 길이 없음).
 */
const OPEN =
  /^\/(phone|terms|privacy|embed|velocity-engine|intro|report|market|chat|lessons|venues|gear|me|pay|u|notifications|link|community|search|baseball|login)(\/|$)|^\/$/;

/*
 * 덕아웃 앱(이름표 DugoutApp — native/src/dugout, 2026-10-24 김민)은 덕아웃 주소에 더해 /login 까지 — 로그인은 앱 화면이 맡고 가입만 아직 웹 폼
 * (/login?signup=1)이다. 싱커 화면은 그대로 막혀 '앱으로 써 주세요'를 본다(덕아웃 앱은 선수가 아닌 사람의 앱).
 */
/* 관리(/manage — 팀 · 레슨장 계정 · 관리자의 덕아웃 관리, app/(master))도 연다(2026-10-26 김민 "앱에서 관리자 기능을 쓸 수 있게"). 방어는 그 틀의 requireMaster */
const DUGOUT_APP_OPEN = /^\/(login|manage)(\/|$)/;

/**
 * 요청의 종류 · 주소를 서버 관문(lib/release-gate.ts)에 알린다 — 출시 전 베타의 화면 판정이 이 값을 본다(2026-10-29).
 * 손님이 같은 이름의 머리를 보내도 여기서 덮는다. 화면 주소로 오는 GET · HEAD 는 'page', 그 밖의 방법(서버 동작 POST)은 'action',
 * /api 는 'api'. 이 머리가 없는 요청은 관문이 '동작'으로 보고 기능 밝힘을 요구한다(덜 열린 쪽).
 */
function gateHeaders(req: NextRequest): Headers {
  const h = new Headers(req.headers);
  const path = req.nextUrl.pathname;
  const api = path === '/api' || path.startsWith('/api/');
  const page = req.method === 'GET' || req.method === 'HEAD';
  h.set('x-bp-entry', api ? 'api' : page ? 'page' : 'action');
  h.set('x-bp-path', path + req.nextUrl.search);
  return h;
}

export function proxy(req: NextRequest) {
  const headers = gateHeaders(req);
  const next = () => NextResponse.next({ request: { headers } });
  const path = req.nextUrl.pathname;
  if (path === '/api' || path.startsWith('/api/')) return next();
  /* 개발 서버(localhost)는 막지 않는다 — 휴대폰 웹 화면을 새 앱과 견주며 고칠 때 · 휴대폰 크기 확인(브라우저 휴대폰 흉내는 이름표도 바꾼다) */
  if (process.env.NODE_ENV !== 'production') return next();
  const ua = req.headers.get('user-agent');
  if (!isPhoneBrowser(ua) || OPEN.test(path) || (surfaceOf(ua) === 'dugout-app' && DUGOUT_APP_OPEN.test(path)))
    return next();
  return NextResponse.rewrite(new URL('/phone', req.url), { request: { headers } });
}

/* /api 도 지나가게 둔다(점이 든 /api/sinker/log.csv 까지) — 관문 머리를 덮어 손님이 'page' 로 꾸미지 못하게. 휴대폰 막기는 /api 를 보지 않는다 */
export const config = { matcher: ['/((?!api/|_next/|.*\\..*).*)', '/api/:path*'] };
