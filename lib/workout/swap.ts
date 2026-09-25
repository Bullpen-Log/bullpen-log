import { intensityLevel } from '@/lib/exercise-meta';

/**
 * 운동 중에 운동을 바꾸거나 더하는 규칙.
 *
 * 헬스장에서는 기구가 차 있거나, 해 보니 오늘은 아닌 운동이 생긴다. 예전에는
 * 운동 화면에서 순서를 바꾸고 빼는 것만 됐고 새 운동을 넣을 길이 없었다 —
 * 화면을 나가 트레이닝에서 일정을 고치고 다시 들어와야 했다.
 *
 * 화면과 서버가 같은 규칙을 쓰게, 그리고 시험할 수 있게 여기 모은다.
 * DB 도 서버도 부르지 않는다. (시험: scripts/training-selftest.mts)
 */

/** 비슷한지 따지는 데 쓰는 운동의 모양 — 캐시에 담긴 운동 한 줄이면 된다 */
export type SwapSource = {
  id: string;
  category: string;
  bodyParts: string[];
  equipment: string[];
  intensity: string;
  /** 힌지·스쿼트·밀기 … 비어 있는 운동도 많다(스트레칭 등) */
  movementPattern: string | null;
};

/** 한 번에 보여 줄 추천 수. 많으면 오히려 고르기 어렵다. */
export const SIMILAR_LIMIT = 5;

export type Similar<T> = {
  exercise: T;
  /** 왜 비슷한지 한 줄 — '같은 힌지 · 햄스트링·둔근 · 덤벨' */
  reason: string;
};

/**
 * 바꿀 운동과 비슷한 것을 고른다.
 *
 * - 같은 분류(하체 스트렝스·코어 …)만 본다. 같은 부위라도 분류가 다르면 하는
 *   일이 다르다 — 루마니안 데드리프트 대신 박스 점프를 권할 수는 없다.
 * - 그 안에서 동작 계열(힌지·스쿼트 …)이 같거나, 부위가 하나라도 겹쳐야 한다.
 * - 계열이 같으면 가장 앞, 겹치는 부위가 많을수록 앞, 강도 차이가 클수록 뒤.
 *   점수가 같으면 pool 의 순서를 따른다 — 오늘 하고 싶다고 고른 부위가 앞에
 *   와 있다(lib/report/prescription.ts 의 6번).
 *
 * pool 은 오늘 걸러 둔 후보(장비·경력·몸 상태를 다 통과한 것)를 넘긴다. 여기서는
 * 거르지 않고 '비슷한가'만 본다. exclude 에는 오늘 목록에 이미 있는 운동을 넣는다.
 */
export function similarExercises<T extends SwapSource>(
  target: SwapSource,
  pool: readonly T[],
  exclude: ReadonlySet<string>,
  limit = SIMILAR_LIMIT
): Similar<T>[] {
  const targetLevel = intensityLevel(target.intensity);

  const scored = pool.flatMap((ex, index) => {
    if (ex.id === target.id || exclude.has(ex.id)) return [];
    if (ex.category !== target.category) return [];

    const samePattern =
      target.movementPattern != null && ex.movementPattern === target.movementPattern;
    const shared = ex.bodyParts.filter((p) => target.bodyParts.includes(p));
    if (!samePattern && shared.length === 0) return [];

    const levelGap = intensityLevel(ex.intensity) - targetLevel;
    const score =
      (samePattern ? 4 : 0) + Math.min(shared.length, 2) * 2 - Math.abs(levelGap);
    return [{ ex, index, score, samePattern, shared, levelGap }];
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  return scored.slice(0, limit).map((s) => ({
    exercise: s.ex,
    reason: [
      s.samePattern ? `같은 ${target.movementPattern}` : null,
      /* 부위 이름 안에 '·'가 들어 있어(햄스트링·둔근) 부위끼리는 쉼표로 잇는다 */
      s.shared.slice(0, 2).join(', ') || null,
      equipmentLabel(s.ex.equipment),
      s.levelGap < 0 ? '더 가벼움' : s.levelGap > 0 ? '더 무거움' : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }));
}

/** 쓰는 장비를 한 줄로. 맨몸은 다른 장비가 없을 때만 적는다. */
export function equipmentLabel(equipment: readonly string[]): string {
  const gear = equipment.filter((e) => e !== '맨몸');
  return gear.length > 0 ? gear.join(', ') : '맨몸';
}

/**
 * 바꾸기(replace) — 그 자리에 넣는다.
 * 더하기(add) — 하던 운동은 그대로 두고 바로 뒤에 넣는다.
 */
export type SwapMode = 'replace' | 'add';

/**
 * 세트를 남긴 운동은 바꾸지 않고 더한다.
 *
 * 바꾸면 남긴 세트가 목록에 없는 운동에 붙어 떠 버리고, 마칠 때 그것까지
 * 기록으로 접힌다 — 목록에서 빼는 것을 막는 까닭(reorderSession)과 같다.
 * 화면이 '더하기'라고 했으면 그대로 더한다. 서버가 한 번 더 본다 — 폰에만
 * 있고 아직 못 보낸 세트는 서버가 모르므로, 화면은 그것까지 세어 '더하기'를
 * 보낸다.
 */
export function swapMode(requested: SwapMode, hasSets: boolean): SwapMode {
  return requested === 'add' || hasSets ? 'add' : 'replace';
}

/**
 * 오늘 목록에 운동을 넣은 새 목록. 서버(찍어 둔 목록)와 화면(그리는 목록)이
 * 같이 쓴다.
 *
 * from 이 목록에 없거나, 넣을 운동이 이미 목록에 있으면 null — 같은 운동이
 * 두 줄이면 세트가 어느 쪽 것인지 가를 수 없다.
 */
export function placeExercise<E extends { id: string }>(
  list: readonly E[],
  fromId: string,
  entry: E,
  mode: SwapMode
): E[] | null {
  const i = list.findIndex((e) => e.id === fromId);
  if (i < 0 || list.some((e) => e.id === entry.id)) return null;
  return mode === 'replace'
    ? [...list.slice(0, i), entry, ...list.slice(i + 1)]
    : [...list.slice(0, i + 1), entry, ...list.slice(i + 1)];
}
