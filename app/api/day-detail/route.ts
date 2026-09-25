import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { isFutureDateKey } from '@/lib/pitch-stats';
import { loadDayDetail } from '@/lib/day-detail';

/**
 * 홈 캘린더 밑 칸이 부른다 — 고른 날의 조금 더 자세한 요약(lib/day-detail.ts).
 *
 * 날짜를 고를 때 그날 것만 받는다. 캘린더가 열세 달치를 미리 들고 있는 것은 한 줄
 * 요약뿐이고, 이것까지 미리 읽기에는 크다.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const date = req.nextUrl.searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isFutureDateKey(date)) {
    return NextResponse.json({ error: '날짜가 올바르지 않습니다.' }, { status: 400 });
  }
  return NextResponse.json(await loadDayDetail(user, date));
}
