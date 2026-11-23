/**
 * 주간 세트 목표 — 이번 주(월요일부터) 동작 묶음마다 몇 세트를 했고 목표가 몇인가(2026-11-23 김민, Fitbod 의 Weekly Set Targets 를 투수에 맞게).
 *
 * 근육이 아니라 동작 묶음으로 센다 — 하체 · 밀기 · 당기기 · 코어 · 회전. 투수에게 균형이 문제가 되는 축이 이쪽이다(밀기 · 당기기 1 대 1,
 * 회전을 빠뜨리지 않기). 워밍업 · 가동성 · 암케어 · 유산소는 세지 않는다(따로 관리하는 것들이다).
 *
 * 목표는 주 3번 운동하는 사람 기준의 고정값이다 — 저항 훈련 지침의 '부위마다 주 10세트 안팎'을 묶음에 맞춰 나눴다.
 * ponytail: 사람마다 운동 횟수 · 시즌이 달라도 같은 목표다. 맞추려면 주 운동 횟수 설정을 받아 곱한다.
 * 일정 만들기에는 쓰지 않는다 — 덜 한 동작을 앞세우는 일은 고르기 점수의 계열 항목(score.ts pattern)이 이미 한다. 여기는 보여 주기만.
 *
 * 순수 파일 — DB · 날짜 함수 없음.
 */

export type WeekSetKey = 'lower' | 'push' | 'pull' | 'core' | 'rotation';

export const WEEK_SET_GROUPS: readonly { key: WeekSetKey; label: string; target: number }[] = [
  { key: 'lower', label: '하체', target: 12 },
  { key: 'push', label: '밀기', target: 8 },
  { key: 'pull', label: '당기기', target: 8 },
  { key: 'core', label: '코어', target: 6 },
  { key: 'rotation', label: '회전', target: 4 },
];

/** 운동이 드는 묶음 — 없으면 null(세지 않는다). 회전은 분류와 상관없이 동작으로(메디신볼 회전 던지기도 회전이다) */
export function weekSetGroupOf(ex: { category: string; movementPattern?: string | null }): WeekSetKey | null {
  if (ex.category === '모빌리티' || ex.category === '워밍업' || ex.category === '암케어' || ex.category === '유산소') return null;
  if (ex.movementPattern === '회전') return 'rotation';
  if (ex.category === '하체 스트렝스') return 'lower';
  if (ex.category === '상체 스트렝스') {
    if (ex.movementPattern === '밀기') return 'push';
    if (ex.movementPattern === '당기기') return 'pull';
    return null;
  }
  if (ex.category === '코어') return 'core';
  return null;
}

export type WeekSetRow = { key: WeekSetKey; label: string; done: number; target: number };

/** 묶음마다 한 세트 수 → 화면 줄(목표 차례 그대로) */
export function weekSetRows(done: ReadonlyMap<WeekSetKey, number>): WeekSetRow[] {
  return WEEK_SET_GROUPS.map((g) => ({ ...g, done: done.get(g.key) ?? 0 }));
}
