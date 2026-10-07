import { requireUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { isNutritionDate } from '@/lib/nutrition/days';
import { loadNutritionDay } from '@/lib/nutrition/load';
import { loadAdvice } from '@/lib/nutrition/advice-load';
import { serviceHour } from '@/lib/nutrition/advice-input';
import { NutritionView } from './nutrition-view';

/**
 * 영양 — 먹은 것과 쓴 것.
 *
 * 날짜는 주소(?date=YYYY-MM-DD)로 받는다. 없거나 틀리면 오늘이다. 주소에 두면
 * 뒤로 가기로 전날에서 돌아오고, 날짜 화살표가 링크라 미리 불러 둘 수 있다.
 */

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function now() {
  return new Date();
}

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const today = toDateKey(now());
  const raw = (await searchParams).date;
  const date = typeof raw === 'string' && isNutritionDate(raw) ? raw : today;

  /* 오늘 영양 조언(맨 위 카드)은 홈 카드와 같은 길(lib/nutrition/advice-load.ts) — 같이 기다린다 */
  const [day, advice] = await Promise.all([
    loadNutritionDay(user, date),
    loadAdvice(user, date, today, serviceHour(now())),
  ]);
  return <NutritionView day={day} today={today} advice={advice} />;
}
