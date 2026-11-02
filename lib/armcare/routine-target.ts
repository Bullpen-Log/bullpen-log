import { MY_ROUTINE_MAX_ITEMS, clampRoutineSets, type MyRoutineItem } from '@/lib/armcare/my-routines';

export type RoutineChoice = { id: string; name: string; exerciseIds: string[] };
export type AddRoutineResult =
  | { ok: true; added: boolean; routine: RoutineChoice }
  | { error: string; code: 'invalid' | 'exercise' | 'missing' | 'full' | 'conflict' };
export const targetStatus = (r: RoutineChoice, exerciseId: string) =>
  r.exerciseIds.includes(exerciseId) ? 'inside' : r.exerciseIds.length >= MY_ROUTINE_MAX_ITEMS ? 'full' : 'available';

/** Append only; never normalize/reorder the existing prescription during a one-item add. */
export function appendRoutineExercise(items: MyRoutineItem[], exerciseId: string, sets: unknown) {
  if (items.some((it) => it.exerciseId === exerciseId)) return { kind: 'inside' as const, items };
  if (items.length >= MY_ROUTINE_MAX_ITEMS) return { kind: 'full' as const, items };
  return { kind: 'added' as const, items: [...items, { exerciseId, sets: clampRoutineSets(sets) }] };
}
