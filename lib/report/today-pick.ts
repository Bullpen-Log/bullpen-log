import { INTENSITY_CAP, intensityLevel } from '@/lib/exercise-meta';

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
  intensity: string;
};

/**
 * 운동을 세션 안의 어느 순서에 놓을지.
 *
 * '매우 낮음'은 강도 목록에서 스트레칭·가동성으로 정의된 단계이고, 지금
 * 라이브러리에서도 90/90 힙 스위치·월드 그레이티스트 스트레치처럼 전부
 * 몸을 여는 동작이다. 그래서 이 단계만 워밍업으로 본다.
 *
 * '낮음'을 마무리로 묶고 싶지만 그렇게 하지 않았다. 데드버그·플랭크처럼
 * 본운동에 가까운 것이 섞여 있어, 마무리라고 적으면 틀린 말이 된다.
 * 마무리까지 정확히 나누려면 운동마다 역할을 따로 지정해야 한다.
 */
export type SessionPhase = 'warmup' | 'main';

export function sessionPhase(intensity: string): SessionPhase {
  return intensityLevel(intensity) <= INTENSITY_CAP.MOBILITY_ONLY
    ? 'warmup'
    : 'main';
}

/** 하루에 제안할 운동 수. 너무 많으면 아무것도 안 하게 된다. */
export const PICK_COUNT = 5;

/**
 * 며칠 전에 한 것까지 "최근에 했다"고 볼지.
 *
 * 근육이 회복되는 데 보통 이틀에서 사흘이 걸리므로 사흘로 둔다.
 * 이 값을 늘리면 같은 운동이 돌아오는 주기가 길어지고, 대신 후보가
 * 적은 날에는 미뤄둔 것을 다시 꺼내 쓰게 된다.
 */
export const RECENT_DAYS = 3;

export function pickForToday<T extends Pickable>({
  candidates,
  doneIds,
  recentIds,
  preferredParts = [],
  count = PICK_COUNT,
}: {
  candidates: T[];
  /** 오늘 이미 완료한 것 — 목록에서 사라지면 안 된다 */
  doneIds: Set<string>;
  /** 최근 며칠 안에 한 것 — 빼지는 않고 뒤로 미룬다 */
  recentIds?: Set<string>;
  /** 오늘 하고 싶다고 고른 부위 */
  preferredParts?: string[];
  count?: number;
}): T[] {
  const chosen: T[] = [];
  const taken = new Set<string>();

  /*
   * 최근에 한 것을 뒤로 보낸다.
   *
   * 빼지 않고 순서만 바꾸는 이유가 있다. 후보가 적은 날에 빼버리면
   * 줄 것이 없어 목록이 비는데, 그건 매일 같은 운동이 나오는 것보다 나쁘다.
   * 앞쪽이 동나면 미뤄둔 것을 그대로 다시 쓴다.
   *
   * 안전 규칙과는 무관하다 — 위험한 운동은 여기 오기 전에 이미 빠져 있다.
   */
  const recent = recentIds ?? new Set<string>();
  const ordered =
    recent.size > 0
      ? [
          ...candidates.filter((ex) => !recent.has(ex.id)),
          ...candidates.filter((ex) => recent.has(ex.id)),
        ]
      : candidates;

  const take = (ex: T) => {
    chosen.push(ex);
    taken.add(ex.id);
  };

  // 1) 이미 한 것은 무조건 남긴다. 하고 나서 사라지면 한 표시를 할 수가 없다.
  for (const ex of ordered) {
    if (doneIds.has(ex.id)) take(ex);
  }

  /*
   * 2) 워밍업 한 자리를 먼저 잡아둔다.
   *
   * 나중에 채우려 하면 본운동이 다섯 자리를 다 먹어, 몸을 열지 않고
   * 바로 무게를 드는 구성이 된다. 후보에 워밍업이 없으면 그냥 넘어간다 —
   * 없는 것을 억지로 만들지는 않는다.
   */
  if (
    chosen.length < count &&
    !chosen.some((ex) => sessionPhase(ex.intensity) === 'warmup')
  ) {
    const warmup = ordered.find(
      (ex) => !taken.has(ex.id) && sessionPhase(ex.intensity) === 'warmup'
    );
    if (warmup) take(warmup);
  }

  const wanted = new Set(preferredParts);
  const matchesPreference = (ex: T) => ex.bodyParts.some((p) => wanted.has(p));

  /*
   * 3) 고른 부위가 있으면 그것부터 채운다.
   *    이때는 부위가 겹쳐도 넣는다 — "오늘 하체"라고 골랐는데 하체 운동을
   *    하나만 주면 고른 의미가 없다.
   */
  if (wanted.size > 0) {
    for (const ex of ordered) {
      if (chosen.length >= count) break;
      if (taken.has(ex.id)) continue;
      if (matchesPreference(ex)) take(ex);
    }
  }

  /*
   * 4) 남은 자리는 부위가 겹치지 않게 채운다.
   *    한쪽 부위만 계속 시키지 않으려는 것이다.
   */
  const usedParts = new Set<string>();
  for (const ex of chosen) ex.bodyParts.forEach((p) => usedParts.add(p));

  for (const ex of ordered) {
    if (chosen.length >= count) break;
    if (taken.has(ex.id)) continue;
    if (ex.bodyParts.some((p) => usedParts.has(p))) continue;
    ex.bodyParts.forEach((p) => usedParts.add(p));
    take(ex);
  }

  // 5) 그래도 자리가 남으면 겹침을 따지지 않고 채운다.
  for (const ex of ordered) {
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
