import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { browseMfds, isBrowseCategory } from '@/lib/nutrition/mfds-browse';

/**
 * 식약처 품목대표 둘러보기 — 음식 창 [전체 음식]의 전체 · 분류 칸이 검색 없이 내려가며 부른다.
 *
 *   ?cat=밥 | all   분류(앱의 음식 분류 이름) 또는 전체
 *   ?offset=40      몇 번째부터(40줄씩)
 *
 * 앱에 넣어 둔 자료만 읽어 포털을 부르지 않는다(키가 없어도 된다). 검색처럼 로그인한 사람만.
 * 자료는 배포 때만 바뀌므로 브라우저가 한 시간 들고 있게 한다.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ items: [], total: 0, next: null }, { status: 401 });

  const cat = req.nextUrl.searchParams.get('cat') ?? 'all';
  if (!isBrowseCategory(cat)) {
    return NextResponse.json({ items: [], total: 0, next: null }, { status: 400 });
  }
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? 0);
  const page = browseMfds(cat, Number.isFinite(offset) && offset >= 0 ? offset : 0);
  return NextResponse.json(page, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  });
}
