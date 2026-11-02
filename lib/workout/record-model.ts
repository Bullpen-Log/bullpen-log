import { summarizeSets, totalVolumeKg } from '@/lib/workout/summarize';

export type RecordSet = {
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
  rir: number | null;
};
export type RecordMeta = { perHand: boolean; perSide: boolean; inMinutes: boolean };
export type RecordExercise = {
  id: string;
  title: string;
  category: string;
  planned: string | null;
  done: boolean;
  setsDone: number | null;
  repsDone: number | null;
  holdSecondsDone: number | null;
  weightKg: number | null;
  sets: RecordSet[] | null;
  meta: RecordMeta;
  method: 'exercise' | 'drill';
  canToggle: boolean;
};
export type RecordNote = { intensity: number; memo: string | null; version: string };
export const recordNoteMatches = (
  n: RecordNote | null,
  p: { intensity: number; memo: string }
) => n != null && n.intensity === p.intensity && (n.memo ?? '') === p.memo.trim();
export type WorkoutRecord = {
  date: string;
  today: string;
  kind: 'training' | 'armcare' | 'drill';
  editable: boolean;
  title: string;
  programLabel: string | null;
  session: { id: string; status: string } | null;
  minutes: number | null;
  setCount: number | null;
  volumeKg: number | null;
  exercises: RecordExercise[];
  note: RecordNote | null;
  setsKnown: boolean;
  noteKnown: boolean;
};
export function validRecordDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function recordEditable(date: string, today: string): boolean {
  if (!validRecordDate(date) || !validRecordDate(today) || date > today) return false;
  return (Date.parse(today) - Date.parse(date)) / 86400000 <= 7;
}
/** The raw rows are authoritative; maxima and representative repetitions are never multiplied to invent volume. */
export function applyRecordSets(
  ex: Omit<RecordExercise, 'sets' | 'canToggle'>,
  sets: RecordSet[] | null,
  editable: boolean,
  active: boolean
): RecordExercise {
  const summary = sets?.length
    ? summarizeSets(sets.map((s) => ({ ...s, exerciseId: ex.id })))[0]
    : null;
  return {
    ...ex,
    ...(summary ?? {}),
    done: Boolean(sets?.length) || ex.done,
    sets,
    canToggle: editable && !active && sets != null && sets.length === 0,
  };
}
export function recordTotals(exercises: RecordExercise[], known: boolean) {
  if (!known) return { setCount: null, volumeKg: null };
  const sets = exercises.flatMap((e) => e.sets ?? []);
  return {
    setCount: sets.length,
    volumeKg: sets.length
      ? totalVolumeKg(sets.map((s) => ({ ...s, exerciseId: '' })))
      : null,
  };
}
