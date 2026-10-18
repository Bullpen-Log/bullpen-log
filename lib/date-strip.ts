import { shiftDateKey } from '@/lib/pitch-stats';

/**
 * 제목 밑 날짜 띠(영양 · 트레이닝)가 보여 주는 날들 — 옆으로 굴리는 한 줄(2026-10-15 사용자: "최근 날짜별로 좌우로 긴 것,
 * 스크롤 가능하게"). 예전에는 고른 날이 든 한 주(일~토)만 보이고 겹화살표로 넘겼다.
 *
 * 6주(42일). 끝은 오늘 — 고른 날이 오래전이면 그날 뒤 3주까지만(그 앞뒤가 보이게). 앞은 가장 이른 날(oldest)에서 멈춘다.
 * 더 먼 날은 제목 옆 간이 달력으로 간다.
 */
export const STRIP_DAYS = 42;
const STRIP_AHEAD = 21;

export function stripDays(date: string, today: string, oldest?: string): string[] {
  const late = shiftDateKey(date, STRIP_AHEAD);
  const to = late < today ? late : today;
  let from = shiftDateKey(to, -(STRIP_DAYS - 1));
  if (oldest && from < oldest) from = oldest;
  const days: string[] = [];
  for (let d = from; d <= to; d = shiftDateKey(d, 1)) days.push(d);
  return days;
}
