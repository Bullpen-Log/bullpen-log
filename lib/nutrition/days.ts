import { dateKeyOf, isFutureDateKey, shiftDateKey, toDateKey } from '@/lib/pitch-stats';

/**
 * 영양 기록의 날짜.
 *
 * 지난날은 1년까지 고칠 수 있다 — 어제 저녁을 깜빡하고 아침에 적는 일이 흔하다.
 * 앞날은 막는다. 앞으로 먹을 것을 적어 두면 주간 평균이 어긋난다.
 * '오늘'은 서비스 기준(한국) 날짜다(lib/pitch-stats.ts 의 SERVICE_TIME_ZONE).
 */
export const NUTRITION_BACK_DAYS = 366;

export function isNutritionDate(dateKey: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const [y, m, d] = dateKey.split('-').map(Number);
  /* 2월 31일 같은 날짜는 Date 가 3월로 넘겨 버리므로, 되돌려서 같은지 본다 */
  if (dateKeyOf(y, m - 1, d) !== dateKey) return false;
  if (isFutureDateKey(dateKey, now)) return false;
  return dateKey >= shiftDateKey(toDateKey(now), -NUTRITION_BACK_DAYS);
}

/** 'YYYY-MM-DD' → DB 의 날짜 칸(@db.Date)에 넣을 값 */
export function dbDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** DB 의 날짜 칸 → 'YYYY-MM-DD' */
export function keyOfDbDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
