import { areasOf, primaryArea, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import type { ArmcareExerciseView } from '@/app/(app)/training/armcare-media';
export const AREA_SHORT: Record<ArmcareAreaKey, string> = { 'shoulder-back': '뒤쪽', 'shoulder-front': '앞쪽', 'shoulder-top': '위쪽', scapula: '날개뼈', 'elbow-inner': '안쪽', 'elbow-outer': '바깥쪽', 'elbow-back': '뒤쪽', 'elbow-front': '앞쪽' };
export const uniqueExercises = (list: readonly ArmcareExerciseView[]) => [...new Map(list.map((e) => [e.id, e])).values()];
export const inArea = (list: readonly ArmcareExerciseView[], area: ArmcareAreaKey | null) => uniqueExercises(list).filter((e) => !area || areasOf(e.targetMuscles).some((a) => a.key === area));
const norm = (s: string) => s.normalize('NFC').trim().toLowerCase();
export function filterGuide(list: readonly ArmcareExerciseView[], q: string, gear: string | null) {
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  return list.filter((e) => (!gear || e.equipment.some((g) => norm(g) === norm(gear))) && tokens.every((t) => norm([e.title, ...e.targetMuscles, ...e.equipment].join(' ')).includes(t)));
}
export const isPrimary = (e: ArmcareExerciseView, area: ArmcareAreaKey) => primaryArea(e.targetMuscles)?.key === area;
