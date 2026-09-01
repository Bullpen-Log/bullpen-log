import { EXERCISE_EQUIPMENT } from '@/lib/exercise-meta';

/**
 * 가진 장비로 할 수 있는 운동만 남긴다.
 *
 * 이건 안전 규칙이 아니다. 위험해서 빼는 것이 아니라, 바벨이 없는 사람에게
 * 바벨 운동을 시켜봐야 못 하기 때문에 빼는 것이다. 그래서 안전 필터
 * (lib/report/prescription.ts)와 파일을 나눠 두었다 — 두 가지가 섞이면
 * "후보가 모자라니 좀 풀어주자"는 판단이 안전 규칙에까지 번진다.
 *
 * 여기서 빼는 것은 언제든 완화해도 된다. 장비를 사면 되니까.
 */

/** 몸은 누구나 가지고 있다. 고르는 목록에도 넣지 않는다. */
export const ALWAYS_OWNED = '맨몸';

/** 프로필에서 고를 수 있는 장비 — 맨몸은 빼고 보여준다. */
export const SELECTABLE_EQUIPMENT = EXERCISE_EQUIPMENT.filter(
  (name) => name !== ALWAYS_OWNED
);

/**
 * 오늘 실제로 쓸 수 있는 장비를 정한다.
 *
 * 두 가지를 나눠 둔 이유가 있다. '가지고 있는 것'은 잘 안 바뀌지만, 그중
 * 오늘 쓸 수 있는 것은 날마다 다르다 — 집에서 하는 날과 헬스장 가는 날이
 * 다르고, 밴드는 가방에 있지만 바벨은 없는 날이 있다.
 *
 * 오늘 것을 안 골랐으면 가진 것을 다 쓸 수 있다고 본다. 매일 고르라고 하면
 * 대부분은 안 고를 텐데, 그때 아무것도 못 쓴다고 보면 훈련이 맨몸만 남는다.
 *
 * 오늘 고른 것 중에 가진 것이 아닌 게 있으면 무시한다. 프로필에서 장비를
 * 뺐는데 오늘 목록에는 남아 있는 경우다.
 */
export function equipmentForToday(
  owned: string[],
  availableToday: string[] | null | undefined
): string[] {
  if (owned.length === 0) return []; // 가진 장비를 아직 안 골랐으면 아무것도 안 거른다
  if (!availableToday || availableToday.length === 0) return owned;
  const has = new Set(owned);
  return [
    ALWAYS_OWNED,
    ...availableToday.filter((name) => name !== ALWAYS_OWNED && has.has(name)),
  ];
}

type WithEquipment = { equipment: string[] };

/** 이 운동을 가진 장비로 할 수 있는가 */
function canDo(ex: WithEquipment, owned: Set<string>): boolean {
  return ex.equipment.every((name) => name === ALWAYS_OWNED || owned.has(name));
}

export type EquipmentFilterResult<T> = {
  /** 할 수 있는 운동만 남긴 것 */
  pool: T[];
  /** 장비가 없어 빠진 개수. 0이면 화면에 아무 말도 하지 않는다. */
  excludedCount: number;
  /**
   * 하나만 더 있으면 가장 많이 늘어나는 장비.
   * 뺀 것이 없으면 null — 다 할 수 있는데 뭘 더 사라고 할 이유가 없다.
   */
  bestAddition: { name: string; unlocks: number } | null;
};

/**
 * 아직 장비를 안 고른 사람은 아무것도 빼지 않는다.
 *
 * 빈 목록을 "아무것도 없다"로 읽으면, 프로필을 한 번도 안 열어본 사람에게
 * 갑자기 맨몸 운동만 나온다. 안 고른 것과 없는 것은 다르다.
 */
export function filterByEquipment<T extends WithEquipment>(
  library: T[],
  ownedEquipment: string[],
  /**
   * 무엇을 더하라고 권할지 정하는 후보. 안 주면 목록 전체에서 찾는다.
   *
   * 오늘만 장비를 좁혀 놓은 날에는 여기에 '가지고 있지만 오늘 끈 것'을 넣는다.
   * 그렇게 하지 않으면 갖고 있지도 않은 기구를 "그날이면 더 할 수 있다"고
   * 권하게 되는데, 그건 오늘 다시 켠다고 되는 일이 아니다.
   */
  suggestFrom?: readonly string[]
): EquipmentFilterResult<T> {
  if (ownedEquipment.length === 0) {
    return { pool: library, excludedCount: 0, bestAddition: null };
  }

  const owned = new Set(ownedEquipment);
  const pool = library.filter((ex) => canDo(ex, owned));
  const excludedCount = library.length - pool.length;
  if (excludedCount === 0) {
    return { pool, excludedCount: 0, bestAddition: null };
  }

  /*
   * 하나를 더 샀을 때 몇 개가 늘어나는지 장비마다 세어 가장 큰 것을 고른다.
   * "밴드가 있으면 101개를 더 할 수 있습니다" 처럼, 무엇이 아쉬운지
   * 숫자로 알려주기 위한 것이다.
   */
  let bestAddition: EquipmentFilterResult<T>['bestAddition'] = null;
  for (const name of suggestFrom ?? SELECTABLE_EQUIPMENT) {
    if (owned.has(name)) continue;
    const withIt = new Set(owned).add(name);
    const unlocks = library.filter(
      (ex) => !canDo(ex, owned) && canDo(ex, withIt)
    ).length;
    if (unlocks > 0 && (bestAddition == null || unlocks > bestAddition.unlocks)) {
      bestAddition = { name, unlocks };
    }
  }

  return { pool, excludedCount, bestAddition };
}
