/**
 * 안전 필터를 통과한 후보 중에서 오늘 할 것을 고른다.
 *
 * selectCandidates 가 "해도 되는 것"을 걸러내고, 여기서는 그중 몇 개를
 * 어떤 순서로 보여줄지만 정한다. 두 일을 섞지 않는 이유는, 여기 규칙이
 * 아무리 바뀌어도 위험한 운동이 끼어들 수 없게 하기 위해서다.
 */

export type Pickable = {
  id: string;
  bodyParts: string[];
};

/** 하루에 제안할 운동 수. 너무 많으면 아무것도 안 하게 된다. */
export const PICK_COUNT = 5;

export function pickForToday<T extends Pickable>({
  candidates,
  doneIds,
  preferredParts = [],
  count = PICK_COUNT,
}: {
  candidates: T[];
  /** 오늘 이미 완료한 것 — 목록에서 사라지면 안 된다 */
  doneIds: Set<string>;
  /** 오늘 하고 싶다고 고른 부위 */
  preferredParts?: string[];
  count?: number;
}): T[] {
  const chosen: T[] = [];
  const taken = new Set<string>();

  const take = (ex: T) => {
    chosen.push(ex);
    taken.add(ex.id);
  };

  // 1) 이미 한 것은 무조건 남긴다. 하고 나서 사라지면 한 표시를 할 수가 없다.
  for (const ex of candidates) {
    if (doneIds.has(ex.id)) take(ex);
  }

  const wanted = new Set(preferredParts);
  const matchesPreference = (ex: T) => ex.bodyParts.some((p) => wanted.has(p));

  /*
   * 2) 고른 부위가 있으면 그것부터 채운다.
   *    이때는 부위가 겹쳐도 넣는다 — "오늘 하체"라고 골랐는데 하체 운동을
   *    하나만 주면 고른 의미가 없다.
   */
  if (wanted.size > 0) {
    for (const ex of candidates) {
      if (chosen.length >= count) break;
      if (taken.has(ex.id)) continue;
      if (matchesPreference(ex)) take(ex);
    }
  }

  /*
   * 3) 남은 자리는 부위가 겹치지 않게 채운다.
   *    한쪽 부위만 계속 시키지 않으려는 것이다.
   */
  const usedParts = new Set<string>();
  for (const ex of chosen) ex.bodyParts.forEach((p) => usedParts.add(p));

  for (const ex of candidates) {
    if (chosen.length >= count) break;
    if (taken.has(ex.id)) continue;
    if (ex.bodyParts.some((p) => usedParts.has(p))) continue;
    ex.bodyParts.forEach((p) => usedParts.add(p));
    take(ex);
  }

  // 4) 그래도 자리가 남으면 겹침을 따지지 않고 채운다.
  for (const ex of candidates) {
    if (chosen.length >= count) break;
    if (taken.has(ex.id)) continue;
    take(ex);
  }

  return chosen;
}

/**
 * 고를 수 있는 부위 목록을 라이브러리에서 뽑는다.
 *
 * 목록을 코드에 적어두면 안 된다. 지금 라이브러리에는 '하체'라는 이름이
 * 없고 고관절·햄스트링·둔근으로 나뉘어 있는데, 없는 이름을 보여주면
 * 골라도 아무것도 안 나온다. 실제로 있는 것만 보여준다.
 */
export function availableParts(library: Pickable[]): string[] {
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
