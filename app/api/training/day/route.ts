import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { trainingDay } from '@/lib/report/training-history';

/**
 * 하루치 운동 기록을 자세히 돌려준다.
 *
 * 달력은 요약(몇 개·강도 몇)만 들고 있다가, 날짜를 눌렀을 때 여기로 부른다.
 * 처음부터 전부 내려보내면 하루 열 개씩 한 해를 쌓았을 때 삼천 줄이 화면 열
 * 때마다 따라온다.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  const date = new URL(req.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다' }, { status: 400 });
  }

  try {
    return NextResponse.json(await trainingDay(user.id, date));
  } catch (error) {
    console.error('[GET /api/training/day]', error);
    return NextResponse.json({ error: '기록을 불러오지 못했습니다' }, { status: 500 });
  }
}
