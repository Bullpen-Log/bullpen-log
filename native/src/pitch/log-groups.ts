/**
 * 투구 목록(pitch/log-list.tsx)의 묶기 — 순수(시험 · 잰 것: scripts/native-log-list-selftest.mts).
 * 2026-10-26 2차: 달마다 줄을 더할 때 배열을 통째로 새로 만들던 것(한 달 n 줄이면 n²/2 번 복사)을 push 로, 펼친 줄은 앞에서부터 정한 수만 그린다.
 */
export type Sort = 'recent' | 'velocity' | 'intensity';
type Groupable = { date: string; sessionType: string; maxVelocity: number | null; effortPct: number };
export type MonthGroup<T> = { month: string; items: T[] };

/** 달마다(최근 달 먼저) — 종류 거르기 · 정렬 */
export function groupMonths<T extends Groupable>(clips: readonly T[], filter: string, sort: Sort): MonthGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const x of clips) {
    if (filter !== 'all' && x.sessionType !== filter) continue;
    const m = x.date.slice(0, 7);
    const list = map.get(m);
    if (list) list.push(x);
    else map.set(m, [x]);
  }
  const cmp = (a: T, b: T) =>
    sort === 'velocity' ? (b.maxVelocity ?? -1) - (a.maxVelocity ?? -1) : sort === 'intensity' ? b.effortPct - a.effortPct : b.date.localeCompare(a.date);
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, items]) => ({ month, items: items.sort(cmp) }));
}

/** 날짜마다 그날 영상(쉰 날 줄 빼고) — 대표 별을 고를 때 */
export function dayPathsOf(logs: readonly { date: string; sessionType: string; videoPaths: string[] }[], restType: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const l of logs) {
    if (l.sessionType === restType) continue;
    const day = l.date.slice(0, 10);
    const list = m.get(day);
    if (list) list.push(...l.videoPaths);
    else m.set(day, [...l.videoPaths]);
  }
  return m;
}

/** 펼친 달을 위에서부터 훑어 limit 줄까지 — 달마다 그릴 줄 수(접힌 달은 0) */
export function rowBudget(groups: readonly MonthGroup<unknown>[], isOpen: (month: string) => boolean, limit: number): Map<string, number> {
  const out = new Map<string, number>();
  let left = limit;
  for (const g of groups) {
    const n = isOpen(g.month) ? Math.max(0, Math.min(g.items.length, left)) : 0;
    out.set(g.month, n);
    left -= n;
  }
  return out;
}
