import { cursorOfList, type ShootCheckView, type ShootStatus } from '@/lib/shoot/progress';
import type { PlanItem } from '@/lib/shoot/schedule';

export const SHOOT_NOTE_MAX = 200;

export function readShootNote(status: ShootStatus | null, raw: unknown):
  { ok: true; note: string | null | undefined } | { ok: false; error: string } {
  // The existing action still accepts omitted/null notes for older clients and undo.
  if (raw === undefined || raw === null) return { ok: true, note: raw };
  if (typeof raw !== 'string') return { ok: false, error: '메모가 올바르지 않아요.' };
  const note = raw.trim();
  if (note.length > SHOOT_NOTE_MAX) return { ok: false, error: `메모는 ${SHOOT_NOTE_MAX}자까지예요.` };
  if (status === 'later' && !note) return { ok: false, error: '미룸 사유를 적어 주세요.' };
  return { ok: true, note: note || null };
}

export function shootRunHref(week: number, crew?: string | null, at?: string | null, mode: 'shoot' | 'guide' = 'shoot'): string {
  const query = new URLSearchParams();
  if (crew) query.set('crew', crew);
  if (at) query.set('at', at);
  if (mode === 'guide') query.set('mode', 'guide');
  const search = query.toString();
  return `/admin/shoot/${week}/run${search ? `?${search}` : ''}`;
}

export function shootRetakeHref(
  week: number,
  crew: string | null | undefined,
  item: Pick<PlanItem, 'no' | 'exerciseId'>,
  resumeAt?: string | null,
): string {
  const query = new URLSearchParams({ retake: '1', exercise: item.exerciseId });
  if (resumeAt) query.set('resume', resumeAt);
  return `${shootRunHref(week, crew, item.no)}&${query}`;
}

/** Checks select the initial exercise only. The guide then follows this fixed plan. */
export function guideStart(items: PlanItem[], checks: Map<string, ShootCheckView>, at: string | null, deferred: boolean) {
  const picked = items.findIndex((item) => item.no === at);
  if (picked >= 0) return picked;
  const { current } = cursorOfList(items, checks, null, deferred);
  return current ? items.indexOf(current) : 0;
}
