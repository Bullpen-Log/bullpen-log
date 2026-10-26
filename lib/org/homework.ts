/**
 * 숙제(2026-10-26 2단계, docs/designs/sinker-team-lesson-contract.md 3절 OrgAssignment) — 순수 함수만.
 *
 * 숙제는 라이브러리 운동 · 드릴만 고른다(자유 글 운동 없음 — 나중에 부하로 옮길 수 있게).
 *
 * 2026-10-26 계약 9-6 ①-2 — 숙제의 뜻을 넷으로 가른다(한 '완료'로 섞지 않는다):
 * - 실제 기록: 선수가 직접 남긴 세트(코치 대신 세트 제외)가 숙제를 낸 **시각** 뒤 · 기한(없으면 7일) 안에 처방 세트 · 횟수(초)를 채움 → 'done' + 증거(그 세트의 운동 판 doneSessionId).
 *   드릴 기록(UserDrillLog)은 시각이 없어 낸 **다음 날**부터만 센다.
 * - 선수 보고: '했어요' → 'reported'(완료 아님 — 기록이 채워지면 그때 'done').
 * - 영상 제출: 숙제 영상 → 'submitted'(완료 아님).
 * - 코치 확인: 코치가 'done' 으로(증거 없음 = 코치가 확인). 화면은 증거가 있으면 '기록으로 완료', 없으면 '코치가 확인'.
 */

export type HomeworkItem = { exerciseId?: string; guideId?: string; sets?: number; reps?: number; holdSec?: number; note?: string };

export const HOMEWORK_ITEMS_MAX = 10;
export const HOMEWORK_NOTE_MAX = 80;

export const HOMEWORK_STATUSES = ['assigned', 'in_progress', 'reported', 'submitted', 'done', 'excused', 'canceled'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];
export const HOMEWORK_STATUS_LABEL: Record<HomeworkStatus, string> = {
  assigned: '안 함',
  in_progress: '하는 중',
  reported: '선수가 했다고 함',
  submitted: '영상 받음',
  done: '완료',
  excused: '면제',
  canceled: '취소',
};
/** 완료의 근거 — 기록(증거 세트의 운동 판이 있음) · 코치 확인 */
export const doneLabel = (byRecord: boolean) => (byRecord ? '기록으로 완료' : '코치가 확인');
/** 코치가 바꿀 수 있는 상태 — 'done' 은 코치 확인(보고 · 영상을 보고) */
export const COACH_STATUSES: readonly HomeworkStatus[] = ['assigned', 'excused', 'canceled', 'done'];
/** 선수가 바꿀 수 있는 상태 — '했어요'는 보고(완료 아님) */
export const PLAYER_STATUSES: readonly HomeworkStatus[] = ['in_progress', 'reported'];
export const isHomeworkStatus = (v: unknown): v is HomeworkStatus => HOMEWORK_STATUSES.includes(v as HomeworkStatus);
/** 아직 할 숙제 — 선수 화면의 '할 숙제' · 오늘 운동에 넣기 */
export const isOpenHomework = (s: string) => s === 'assigned' || s === 'in_progress';
/** 기록을 보고 저절로 맞출 숙제 — 할 숙제 + 보고 · 영상만 받은 것(기록이 채워지면 기록 완료로) */
export const isUnsettledHomework = (s: string) => isOpenHomework(s) || s === 'reported' || s === 'submitted';
/** 코치가 아직 안 본 것 — 받은 것에 뜬다 */
export const needsCoachLook = (s: string) => s === 'reported' || s === 'submitted';

/** 기록으로 셀 때 — 기한이 없으면 낸 뒤 7일 */
export const HOMEWORK_WINDOW_DAYS = 7;
/** 숙제를 기록으로 맞추는 때(ms) — 낸 시각 ~ 기한 날 끝(한국 23:59:59) 또는 7일 뒤 */
export function homeworkWindow(createdAt: Date, dueDate: Date | null): { from: number; to: number } {
  const from = createdAt.getTime();
  /* dueDate 는 날짜 칸(UTC 0시) — 그 한국 날의 끝은 UTC 14:59:59.999 */
  const to = dueDate ? dueDate.getTime() + 15 * 3_600_000 - 1 : from + HOMEWORK_WINDOW_DAYS * 86_400_000;
  return { from, to: Math.max(to, from) };
}

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

/** 선수가 직접 남긴 세트 하나(코치 대신 세트는 넣지 않는다) — at 은 그 세트를 마친 시각(ms) */
export type HomeworkSet = { exerciseId: string; reps: number | null; holdSeconds: number | null; weightKg: number | null; sessionId: string; at: number };

/** 처방에 맞는 세트인가 — 횟수를 냈으면 그 횟수 이상, 초를 냈으면 그 초 이상, 둘 다 없으면 무엇이든 적은 세트 */
export function setMeets(item: HomeworkItem, s: HomeworkSet): boolean {
  if (item.reps) return (s.reps ?? 0) >= item.reps;
  if (item.holdSec) return (s.holdSeconds ?? 0) >= item.holdSec;
  return s.reps != null || s.holdSeconds != null || s.weightKg != null;
}

/**
 * 기록으로 본 숙제 진행 — 운동은 처방 세트 수(없으면 1)만큼 처방에 맞는 세트가 창 안에 있어야 그 줄을 한 것, 드릴은 창 안 드릴 기록.
 * 모두 했으면 'all'(증거 = 마지막으로 채운 세트의 운동 판, 드릴만이면 null), 무엇이라도 했으면 'some'.
 */
export function homeworkProgress(
  items: readonly HomeworkItem[],
  sets: readonly HomeworkSet[],
  drillsDone: ReadonlySet<string>,
  window: { from: number; to: number }
): { progress: 'none' | 'some' | 'all'; evidence: string | null } {
  if (items.length === 0) return { progress: 'none', evidence: null };
  const inWindow = sets.filter((s) => s.at >= window.from && s.at <= window.to);
  let done = 0;
  let touched = false;
  let evidence: { at: number; sessionId: string } | null = null;
  for (const it of items) {
    if (it.exerciseId) {
      const mine = inWindow.filter((s) => s.exerciseId === it.exerciseId).sort((a, b) => a.at - b.at);
      if (mine.length) touched = true;
      const ok = mine.filter((s) => setMeets(it, s));
      const need = it.sets ?? 1;
      if (ok.length >= need) {
        done++;
        const last = ok[need - 1];
        if (!evidence || last.at > evidence.at) evidence = { at: last.at, sessionId: last.sessionId };
      }
    } else if (it.guideId && drillsDone.has(it.guideId)) {
      done++;
      touched = true;
    }
  }
  return { progress: done === items.length ? 'all' : touched || done > 0 ? 'some' : 'none', evidence: done === items.length ? (evidence?.sessionId ?? null) : null };
}
