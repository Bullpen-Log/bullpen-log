/**
 * 오늘의 운동 고르기에 쓰이는 공통 조각.
 *
 * 실제로 고르는 일은 lib/report/theme.ts 가 한다 — 테마(하체 데이 등)를
 * 정하고 시간에 맞춰 구성하는 방식으로 바뀌면서, 예전의 "부위 안 겹치게
 * 5개" 규칙은 그쪽으로 흡수됐다.
 */

/**
 * 며칠 전에 한 것까지 "최근에 했다"고 볼지.
 *
 * 근육이 회복되는 데 보통 이틀에서 사흘이 걸리므로 사흘로 둔다.
 * 이 값을 늘리면 같은 운동이 돌아오는 주기가 길어지고, 대신 후보가
 * 적은 날에는 미뤄둔 것을 다시 꺼내 쓰게 된다.
 */
export const RECENT_DAYS = 3;

/**
 * 고를 수 있는 부위 목록을 라이브러리에서 뽑는다.
 *
 * 목록을 코드에 적어두면 안 된다. 지금 라이브러리에는 '하체'라는 이름이
 * 없고 고관절·햄스트링·둔근으로 나뉘어 있는데, 없는 이름을 보여주면
 * 골라도 아무것도 안 나온다. 실제로 있는 것만 보여준다.
 */
export function availableParts(library: { bodyParts: string[] }[]): string[] {
  const counts = new Map<string, number>();
  for (const ex of library) {
    for (const part of ex.bodyParts) {
      counts.set(part, (counts.get(part) ?? 0) + 1);
    }
  }
  // 운동이 많은 부위부터 — 골랐을 때 실제로 뭔가 나올 가능성이 높은 순서다.
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .map(([part]) => part);
}
