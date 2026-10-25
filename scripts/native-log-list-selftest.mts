/**
 * 투구 목록 묶기(native/src/pitch/log-groups.ts) 시험 + 잰 것 — 예전 묶기와 같은 결과인지, 기록이 많을 때 걸리는 시간.
 * 실행: npm run native-log-list:test
 * 시간은 이 맥의 node 에서 잰 계산 시간이다 — 아이폰에서 줄을 그리는 시간(네이티브 배치)은 재지 못한다.
 */
import assert from 'node:assert/strict';
import { dayPathsOf, groupMonths, rowBudget, type Sort } from '~/pitch/log-groups';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
type C = { id: string; date: string; sessionType: string; maxVelocity: number | null; effortPct: number };

/* 예전 묶기(2026-10-25 판 log-list.tsx 그대로) — 달마다 배열을 통째로 다시 만들었다 */
function oldGroup(clips: C[], filter: string, sort: Sort) {
  const map = new Map<string, C[]>();
  for (const x of clips) {
    if (filter !== 'all' && x.sessionType !== filter) continue;
    const m = x.date.slice(0, 7);
    map.set(m, [...(map.get(m) ?? []), x]);
  }
  const cmp = (a: C, b: C) =>
    sort === 'velocity' ? (b.maxVelocity ?? -1) - (a.maxVelocity ?? -1) : sort === 'intensity' ? b.effortPct - a.effortPct : b.date.localeCompare(a.date);
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, items]) => ({ month, items: [...items].sort(cmp) }));
}

/* 씨앗 고정 난수 — 늘 같은 자료 */
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const TYPES = ['불펜', '경기', '캐치볼', '라이브'];
function makeClips(count: number): C[] {
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(Date.UTC(2026, 9, 26) - Math.floor(i / 3) * 86_400_000).toISOString().slice(0, 10);
    return { id: `c${i}`, date: day, sessionType: TYPES[Math.floor(rnd() * 4)], maxVelocity: rnd() < 0.2 ? null : 100 + Math.floor(rnd() * 50), effortPct: Math.floor(rnd() * 100) };
  });
}

/* 1. 예전 묶기와 같은 결과 — 종류 · 정렬 모두 */
{
  const clips = makeClips(900);
  for (const f of ['all', '불펜', '경기'])
    for (const s of ['recent', 'velocity', 'intensity'] as Sort[]) eq(groupMonths(clips, f, s), oldGroup(clips, f, s), `${f} · ${s}`);
}

/* 2. 그날 영상 — 쉰 날은 빼고 차례대로 */
{
  const m = dayPathsOf(
    [
      { date: '2026-10-01T00:00:00.000Z', sessionType: '불펜', videoPaths: ['a', 'b'] },
      { date: '2026-10-01T00:00:00.000Z', sessionType: '휴식', videoPaths: ['x'] },
      { date: '2026-10-01T00:00:00.000Z', sessionType: '경기', videoPaths: ['c'] },
    ],
    '휴식'
  );
  eq(m.get('2026-10-01'), ['a', 'b', 'c'], '쉰 날 빼고 이어 붙임');
}

/* 3. 줄 나눠 그리기 — 펼친 달을 위에서부터 limit 줄까지 */
{
  const g = [
    { month: '2026-10', items: [1, 2, 3] },
    { month: '2026-09', items: [1, 2, 3, 4] },
    { month: '2026-08', items: [1, 2] },
  ];
  const open = (m: string) => m !== '2026-09';
  eq([...rowBudget(g, open, 4)], [['2026-10', 3], ['2026-09', 0], ['2026-08', 1]], '접힌 달은 0 · 남은 만큼');
  eq([...rowBudget(g, () => true, Infinity)], [['2026-10', 3], ['2026-09', 4], ['2026-08', 2]], '끝까지');
}

/* 4. 잰 것 — 기록 3,000줄(달마다 약 90줄) 묶기. 첫 줄 수 · 계산 시간(node) */
{
  const clips = makeClips(3000);
  const time = (f: () => unknown) => {
    for (let k = 0; k < 5; k++) f();
    const t = performance.now();
    for (let k = 0; k < 20; k++) f();
    return (performance.now() - t) / 20;
  };
  const before = time(() => oldGroup(clips, 'all', 'recent'));
  const after = time(() => groupMonths(clips, 'all', 'recent'));
  const months = groupMonths(clips, 'all', 'recent');
  const all = months.reduce((s, g) => s + g.items.length, 0);
  const first = [...rowBudget(months, () => true, 40).values()].reduce((s, x) => s + x, 0);
  console.log(`  묶기 3,000줄: 예전 ${before.toFixed(2)}ms → 지금 ${after.toFixed(2)}ms (node, 이 맥)`);
  console.log(`  찾는 중(달 모두 펼침) 첫 그림의 줄: 예전 ${all}줄 → 지금 ${first}줄, 나머지는 ${Math.ceil((all - first) / 40)}번에 나눠`);
  eq(first, 40, '첫 그림은 40줄');
}

console.log(`투구 목록 묶기 ${n}개 통과`);
