import 'server-only';
import { needsWeight } from '@/lib/exercise-meta';
import { formatPrescription } from '@/lib/exercise-meta';
import { SLOT_ORDER, type SlotKey, type ThemeKey } from '@/lib/report/theme';

/**
 * 세션을 시작할 때 찍어 두는 오늘 목록.
 *
 * 왜 찍어 두는가. 운동 중에 목록이 바뀌는 길이 넷 있다 — 홈에서 컨디션을
 * 고치면 안전 재검사가 다시 돌고, 통증을 입력하면 목록이 통째로 사라지고,
 * 다른 탭에서 '일정 다시 만들기'를 누르면 같은 날 줄을 덮어쓰고, 목록에서
 * 운동을 빼면 그날 기록까지 지워진다. 스쿼트 3세트 중에 화면에서 스쿼트가
 * 사라지는 일을 막는다.
 *
 * 미리보기 주소는 담지 않는다. 서명 주소는 한 시간이면 죽는데 세션은 그보다
 * 오래 열려 있을 수 있다. 경로만 담고 화면을 그릴 때마다 새로 발급한다.
 */

export type FrozenExercise = {
  id: string;
  title: string;
  category: string;
  slot: SlotKey;
  /** '3세트 × 10회 · 세트 사이 2분 휴식' 같은 한 줄. 안 채운 운동은 없다. */
  prescription: string | null;
  /** 처방 세트 수. 화면에 '3세트 중 2세트째'로 쓴다. */
  plannedSets: number | null;
  plannedReps: number | null;
  plannedHoldSeconds: number | null;
  perSide: boolean;
  /** 바벨·덤벨처럼 무게를 안 적으면 완료로 남길 수 없는 운동인가 */
  needsWeight: boolean;
  /** 시간형 운동인가 — 횟수 대신 버틴 시간을 받는다 */
  isHold: boolean;
  equipment: string[];
  bodyParts: string[];
  intensity: string;
  thumbPath: string | null;
};

export type FrozenPlan = {
  themeKey: ThemeKey;
  themeLabel: string;
  exercises: FrozenExercise[];
};

type SourceExercise = {
  id: string;
  title: string;
  category: string;
  bodyParts: string[];
  intensity: string;
  equipment: string[];
  sets: number | null;
  reps: number | null;
  holdSeconds: number | null;
  restSeconds: number | null;
  perSide: boolean;
  thumbPath: string | null;
};

/**
 * 운동 하나를 세션이 쓸 모양으로 찍는다.
 *
 * 시작할 때 목록 전체를 찍는 freezePlan 과, 운동 중에 바꾸거나 더하는 운동
 * (app/actions/workout.ts 의 changeSessionExercise)이 같이 쓴다. 둘이 따로
 * 찍으면 바꿔 넣은 운동만 처방 줄이나 무게 필수 여부가 다르게 나온다.
 */
export function freezeExercise(ex: SourceExercise, slot: SlotKey): FrozenExercise {
  return {
    id: ex.id,
    title: ex.title,
    category: ex.category,
    slot,
    prescription: formatPrescription(ex),
    plannedSets: ex.sets,
    plannedReps: ex.reps,
    plannedHoldSeconds: ex.holdSeconds,
    perSide: ex.perSide,
    needsWeight: needsWeight(ex.equipment),
    /* 버티기 초가 적혀 있고 횟수가 없으면 시간형이다 */
    isHold: ex.holdSeconds != null && ex.reps == null,
    equipment: ex.equipment,
    bodyParts: ex.bodyParts,
    intensity: ex.intensity,
    thumbPath: ex.thumbPath,
  };
}

/**
 * 오늘 목록을 세션이 쓸 모양으로 찍는다.
 *
 * 구간 순서(SLOT_ORDER)로 다시 줄을 세운다. 직접 더한 운동은 배열 맨 뒤에
 * 붙기 때문에, 그대로 두면 암케어를 하고 나서 본운동을 하게 된다.
 */
export function freezePlan(
  themeKey: ThemeKey,
  themeLabel: string,
  picks: readonly { exerciseId: string; slot: SlotKey }[],
  byId: Map<string, SourceExercise>
): FrozenPlan {
  const order = new Map(SLOT_ORDER.map((s, i) => [s, i]));

  const exercises = picks
    .map((p) => ({ slot: p.slot, ex: byId.get(p.exerciseId) }))
    .filter((p): p is { slot: SlotKey; ex: SourceExercise } => p.ex != null)
    .sort((a, b) => (order.get(a.slot) ?? 99) - (order.get(b.slot) ?? 99))
    .map(({ slot, ex }) => freezeExercise(ex, slot));

  return { themeKey, themeLabel, exercises };
}

/** 찍어 둔 것을 다시 읽는다. 모양이 아니면 null — 옛 세션일 수 있다. */
export function readFrozenPlan(value: unknown): FrozenPlan | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<FrozenPlan>;
  if (typeof v.themeKey !== 'string' || !Array.isArray(v.exercises)) return null;
  return {
    themeKey: v.themeKey as ThemeKey,
    themeLabel: typeof v.themeLabel === 'string' ? v.themeLabel : '오늘의 운동',
    exercises: v.exercises as FrozenExercise[],
  };
}
