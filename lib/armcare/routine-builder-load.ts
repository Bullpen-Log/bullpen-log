import 'server-only';
import { visibleExercises } from '@/lib/library-cache';
import { formatPrescription } from '@/lib/exercise-meta';
import { ARMCARE_CATEGORY, primaryArea } from '@/lib/armcare/anatomy';
import { armcareMinutes } from '@/lib/armcare/routine';
import { loadMyRoutine, loadMyRoutines } from '@/lib/armcare/my-routines-store';
import { MY_ROUTINE_MAX, clampRoutineSets, isRoutineId, type MyRoutineItem } from '@/lib/armcare/my-routines';
import { toArmcareViews } from '@/app/(app)/training/armcare-views';
import type { BuilderExercise } from '@/app/(app)/training/routine/[id]/routine-builder';

/**
 * 내 루틴 만들기 · 고치기가 그릴 것 — 웹 화면(app/(app)/training/routine/[id]/page.tsx)과 아이폰 앱 화면
 * (native/src/app/training/routine/[id].tsx, app/actions/app-training-parts.ts 의 loadAppRoutine)이 같이 쓴다.
 * 'use server' 파일에 두지 않는다 — userId 를 받는 함수가 거기 있으면 누구나 부를 수 있는 입구가 된다.
 */
export type RoutineBuilderData = {
  /** 고치는 루틴. 새로 만들면 null */
  id: string | null;
  name: string;
  items: MyRoutineItem[];
  exercises: BuilderExercise[];
  /** 루틴이 이미 최대 개수라 새로 못 만든다 */
  full: boolean;
  /** 담아 뒀는데 라이브러리에서 숨겨져 빠진 운동 수 */
  droppedHidden: number;
};

/**
 * 담을 수 있는 운동 — 보이는 암케어 운동 전부와 담을 때 쓰는 기본 세트 · 부위 · 세트별 분 · 세트 뺀 처방.
 * 루틴 만들기와 앱의 운동 추가(app-training-parts.loadAppRoutineCatalog)가 같이 쓴다. 저장은 이것과 따로 다시 확인한다(app/actions/armcare.ts).
 */
export async function loadBuilderExercises(): Promise<BuilderExercise[]> {
  const armcare = (await visibleExercises()).filter((ex) => ex.category === ARMCARE_CATEGORY);
  const views = await toArmcareViews(armcare);
  return armcare.map((ex, i) => {
    const muscles = ex.targetMuscles ?? [];
    const one = formatPrescription({ ...ex, sets: 1 });
    return {
      view: views[i],
      defaultSets: clampRoutineSets(ex.sets ?? 2),
      area: primaryArea(muscles)?.key ?? null,
      minutes: [1, 2, 3, 4, 5].map((s) => armcareMinutes({ ...ex, targetMuscles: muscles }, s)),
      /* '1세트 × 10회 …'에서 세트를 뗀 것 — 세트는 이 화면에서 따로 고른다 */
      dose: one ? one.replace(/^1세트 × /, '') : null,
    };
  });
}

/**
 * id 는 'new' 또는 루틴 번호. 없는 루틴이면 null(웹은 notFound).
 * add 가 암케어 운동 id 면 그 운동을 담은 채로 시작한다 — 부위별 보강의 '이 운동으로 새 루틴 만들기'.
 */
export async function loadRoutineBuilder(
  userId: string,
  id: string,
  add: unknown
): Promise<RoutineBuilderData | null> {
  const isNew = id === 'new';
  const routine = !isNew && isRoutineId(id) ? await loadMyRoutine(userId, id) : null;
  if (!isNew && !routine) return null;

  const [exercises, mine] = await Promise.all([
    loadBuilderExercises(),
    isNew ? loadMyRoutines(userId) : Promise.resolve([]),
  ]);
  const known = new Set(exercises.map((e) => e.view.id));

  const items = routine
    ? routine.items.filter((it) => known.has(it.exerciseId))
    : typeof add === 'string' && known.has(add)
      ? [{ exerciseId: add, sets: exercises.find((e) => e.view.id === add)!.defaultSets }]
      : [];

  return {
    id: routine?.id ?? null,
    name: routine?.name ?? '',
    items,
    exercises,
    full: isNew && mine.length >= MY_ROUTINE_MAX,
    droppedHidden: routine ? routine.items.length - items.length : 0,
  };
}
