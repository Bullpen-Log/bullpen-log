import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { mfdsEnabled, searchMfds, searchMfdsReps } from '@/lib/nutrition/mfds';

/**
 * 식약처 음식 검색 — 영양 탭의 검색창이 부른다.
 *
 * 기본 목록과 내 음식은 화면이 이미 들고 있어서 치는 즉시 걸러 보여 준다.
 * 여기는 그 밖의 것(수만 가지)만 맡는다. 인증키는 서버에만 두어야 해서 화면이
 * 포털을 직접 부르지 않고 여기를 거친다.
 *
 * 화면은 한 검색어에 두 번 부른다.
 *   ?part=reps  넣어 둔 품목대표(표준값)에서만 — 포털을 안 불러 바로 온다.
 *   (없음)      상품까지 — 포털을 부르므로 새 검색어는 흔한 말 1~2초, 상품 이름 같은 말은 8~13초.
 *               오면 위의 것을 바꿔 끼운다.
 *
 * 로그인한 사람만 쓴다 — 키의 하루 호출 수를 아무나 쓰지 못하게.
 */

/*
 * 포털은 결과가 적은 말에 4~6초 걸리고(DB 를 끝까지 훑는다), 상품 이름 같은 말은 두 차례 부른다.
 * 기다리는 시간의 합(lib/nutrition/mfds.ts 의 두 TIMEOUT, 9초 × 2)에 로그인 확인 · 줄 세우기를 더해 넉넉하게.
 */
export const maxDuration = 25;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ foods: [] }, { status: 401 });

  /* 자모가 풀린 한글(NFD — 맥 · 아이폰)은 한 글자가 코드 두세 개다. 먼저 모아야 40자가 글자 중간에서 안 잘린다 */
  const q = (req.nextUrl.searchParams.get('q') ?? '')
    .normalize('NFC')
    .trim()
    .slice(0, 40);
  if (!q) return NextResponse.json({ foods: [] });

  if (req.nextUrl.searchParams.get('part') === 'reps') {
    /* 키가 없으면 화면에 식약처 칸이 아예 없다 — 여기도 같이 닫아 둔다 */
    return NextResponse.json({ foods: mfdsEnabled() ? searchMfdsReps(q) : [] });
  }

  const foods = await searchMfds(q);
  return NextResponse.json({ foods });
}
