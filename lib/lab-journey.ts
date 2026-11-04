import { isLabId, type LabView } from '@/lib/pitch-lab-meta';

export type LabPractice = {
  id: string;
  date: string;
  goal: string;
  note: string;
  savedAt: string;
};
export function readLabPractice(raw: unknown): LabPractice | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as LabPractice;
  if (
    typeof v.id !== 'string' ||
    !isLabId(v.id) ||
    typeof v.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.date)
  )
    return null;
  const date = new Date(`${v.date}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== v.date)
    return null;
  if (
    typeof v.goal !== 'string' ||
    !v.goal.trim() ||
    v.goal.length > 120 ||
    typeof v.note !== 'string' ||
    v.note.length > 500
  )
    return null;
  return {
    id: v.id,
    date: v.date,
    goal: v.goal.trim(),
    note: v.note.trim(),
    savedAt: typeof v.savedAt === 'string' ? v.savedAt : '',
  };
}

export type LabJourney = {
  practices: LabPractice[];
  sourcePaths: Partial<Record<LabView, string>>;
  previous: { id: string; practices: LabPractice[] } | null;
  retakes: { id: string; createdAt: string }[];
};
