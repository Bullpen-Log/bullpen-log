/**
 * 숙제(2026-10-26 2단계, docs/designs/sinker-team-lesson-contract.md 3절 OrgAssignment) — 순수 함수만.
 *
 * 숙제는 라이브러리 운동 · 드릴만 고른다(자유 글 운동 없음 — 나중에 부하로 옮길 수 있게). 선수가 트레이닝에서 그 운동을 하면
 * (운동 기록 UserExerciseLog · 드릴 기록 UserDrillLog) 숙제를 낸 날부터의 기록으로 저절로 '완료'가 된다 — 운동 화면은 안 건드린다.
 */

export type HomeworkItem = { exerciseId?: string; guideId?: string; sets?: number; reps?: number; holdSec?: number; note?: string };

export const HOMEWORK_ITEMS_MAX = 10;
export const HOMEWORK_NOTE_MAX = 80;

export const HOMEWORK_STATUSES = ['assigned', 'in_progress', 'done', 'excused', 'canceled'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];
export const HOMEWORK_STATUS_LABEL: Record<HomeworkStatus, string> = {
  assigned: '안 함',
  in_progress: '하는 중',
  done: '완료',
  excused: '면제',
  canceled: '취소',
};
/** 코치가 바꿀 수 있는 상태 — 완료는 선수 기록(또는 선수가 '했어요')으로만 */
export const COACH_STATUSES: readonly HomeworkStatus[] = ['assigned', 'excused', 'canceled'];
/** 선수가 바꿀 수 있는 상태 */
export const PLAYER_STATUSES: readonly HomeworkStatus[] = ['in_progress', 'done'];
export const isHomeworkStatus = (v: unknown): v is HomeworkStatus => HOMEWORK_STATUSES.includes(v as HomeworkStatus);
/** 아직 할 숙제 — 기록을 보고 저절로 완료할 대상 */
export const isOpenHomework = (s: string) => s === 'assigned' || s === 'in_progress';

const int = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

/** 보낸 숙제 줄 거르기 — 아는 운동 · 드릴만, 같은 것은 한 번, 열 개까지 */
export function cleanHomeworkItems(
  raw: unknown,
  known: { exercises: ReadonlySet<string>; guides: ReadonlySet<string> }
): HomeworkItem[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: '숙제로 낼 운동을 골라 주세요.' };
  if (raw.length > HOMEWORK_ITEMS_MAX) return { error: `숙제는 ${HOMEWORK_ITEMS_MAX}개까지 낼 수 있어요.` };
  const seen = new Set<string>();
  const out: HomeworkItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') return { error: '숙제를 다시 골라 주세요.' };
    const o = r as Record<string, unknown>;
    const exerciseId = typeof o.exerciseId === 'string' && known.exercises.has(o.exerciseId) ? o.exerciseId : undefined;
    const guideId = !exerciseId && typeof o.guideId === 'string' && known.guides.has(o.guideId) ? o.guideId : undefined;
    const id = exerciseId ?? guideId;
    if (!id) return { error: '없는 운동이 섞여 있어요. 다시 골라 주세요.' };
    if (seen.has(id)) continue;
    seen.add(id);
    const note = typeof o.note === 'string' ? o.note.trim().slice(0, HOMEWORK_NOTE_MAX) : '';
    out.push({
      ...(exerciseId ? { exerciseId } : { guideId }),
      ...(int(o.sets, 1, 20) ? { sets: int(o.sets, 1, 20) } : {}),
      ...(int(o.reps, 1, 200) ? { reps: int(o.reps, 1, 200) } : {}),
      ...(int(o.holdSec, 1, 600) ? { holdSec: int(o.holdSec, 1, 600) } : {}),
      ...(note ? { note } : {}),
    });
  }
  return out;
}

/** DB 의 Json → 줄(모양이 틀린 줄은 버림) */
export function readHomeworkItems(json: unknown): HomeworkItem[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (x): x is HomeworkItem => !!x && typeof x === 'object' && (typeof x.exerciseId === 'string' || typeof x.guideId === 'string')
  );
}

/** 처방 한 줄 — '3세트 · 15회' · '3세트 · 30초' */
export function homeworkDose(i: HomeworkItem): string {
  const amount = i.reps ? `${i.reps}회` : i.holdSec ? `${i.holdSec}초` : '';
  return [i.sets ? `${i.sets}세트` : '', amount, i.note ?? ''].filter(Boolean).join(' · ');
}

/** 기록으로 본 숙제 진행 — 한 운동이라도 했으면 하는 중, 모두 했으면 완료 */
export function homeworkProgress(items: HomeworkItem[], doneExercises: ReadonlySet<string>, doneGuides: ReadonlySet<string>): 'none' | 'some' | 'all' {
  if (items.length === 0) return 'none';
  const done = items.filter((i) => (i.exerciseId ? doneExercises.has(i.exerciseId) : i.guideId ? doneGuides.has(i.guideId) : false)).length;
  return done === 0 ? 'none' : done === items.length ? 'all' : 'some';
}
