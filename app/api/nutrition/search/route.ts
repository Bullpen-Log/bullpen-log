import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { searchMfds } from '@/lib/nutrition/mfds';

/**
 * 식약처 음식 검색 — 영양 탭의 검색창이 부른다.
 *
 * 기본 목록과 내 음식은 화면이 이미 들고 있어서 치는 즉시 걸러 보여 준다.
 * 여기는 그 밖의 것(수만 가지)만 맡는다. 인증키는 서버에만 두어야 해서 화면이
 * 포털을 직접 부르지 않고 여기를 거친다.
 *
 * 로그인한 사람만 쓴다 — 키의 하루 호출 수를 아무나 쓰지 못하게.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ foods: [] }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 40);
  if (!q) return NextResponse.json({ foods: [] });

  const foods = await searchMfds(q);
  return NextResponse.json({ foods });
}
