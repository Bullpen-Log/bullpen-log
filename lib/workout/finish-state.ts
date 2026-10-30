/**
 * 운동 종료 뒤 결과를 가르는 규칙 — 순수(DB 없음). 서버(lib/workout/finish.ts)가 읽은 값을 넣고, 앱 · 시험이 같은 모양을 쓴다.
 *
 * 프로그램:
 *   none     — 프로그램 날이 아니다
 *   advanced — 이 세션으로 다음 세션으로 갔다
 *   done     — 마지막 세션까지 마쳐 프로그램이 끝났다
 *   below    — 처방 세트 절반(올림)을 못 채워 이 세션을 다시 한다 — 기록은 그대로 남는다
 *   pending  — 기준은 넘었는데 아직 일차가 안 넘어갔다(뒤처리 실패 · 아직 안 함) — 다시 확인하면 넘어간다
 *   unknown  — 회차 줄이 없거나(그만둠 · 지운 프로그램) 맞지 않아 확인할 수 없다
 * 강도 · 메모:
 *   none     — 마칠 때 강도를 안 골랐다(메모만은 받지 않는다)
 *   saved    — 고른 강도(와 적은 메모)가 그날 줄에 있다 — 그 뒤 다른 곳에서 고친 줄도 저장된 것으로 본다
 *   pending  — 골랐는데 그날 줄에 없거나 다르다 — 다시 확인하면 남긴다
 */

export type ProgramOutcome =
  | { state: 'none' }
  | {
      state: 'advanced' | 'done' | 'below' | 'pending' | 'unknown';
      day: number;
      label: string;
      nextLabel: string | null;
      /** 선택 운동을 뺀 처방 세트 · 남긴 세트 · 다음 세션에 필요한 세트 */
      planned: number;
      logged: number;
      needed: number;
      name: string;
    };

export type FinishNote = { intensity: number | null; memo: string | null; at: string };

export type NoteOutcome = {
  state: 'none' | 'saved' | 'pending';
  submitted: { intensity: number | null; memo: string | null } | null;
  saved: { intensity: number; memo: string | null } | null;
};

/** 판 줄(plan JSON)에 남긴 제출값 — 모양이 아니면 null */
export function finishNoteOf(plan: unknown): FinishNote | null {
  if (!plan || typeof plan !== 'object') return null;
  const v = (plan as Record<string, unknown>).finishNote;
  if (!v || typeof v !== 'object') return null;
  const { intensity, memo, at } = v as Record<string, unknown>;
  if (typeof at !== 'string') return null;
  return {
    intensity: typeof intensity === 'number' && Number.isInteger(intensity) && intensity >= 1 && intensity <= 10 ? intensity : null,
    memo: typeof memo === 'string' && memo.trim() ? memo.trim() : null,
    at,
  };
}

export function programStateOf(x: {
  day: number;
  totalDays: number;
  label: string;
  nextLabel: string | null;
  name: string;
  planned: number;
  logged: number;
  needed: number;
  row: { nextDay: number; status: string } | null;
  sessionStatus: string;
}): ProgramOutcome {
  const base = {
    day: x.day,
    label: x.label,
    nextLabel: x.nextLabel,
    planned: x.planned,
    logged: x.logged,
    needed: x.needed,
    name: x.name,
  };
  const met = x.planned > 0 && x.logged >= x.needed;
  /* 기준 미달은 회차 줄과 상관없이 먼저 — 건너뛰기로 nextDay 가 넘어가도 이 판으로 간 것은 아니다 */
  if (!met) return { ...base, state: 'below' };
  if (!x.row) return { ...base, state: 'unknown' };
  if (x.row.status === 'done' && x.day >= x.totalDays) return { ...base, state: 'done' };
  if (x.row.nextDay > x.day || x.row.status === 'done') return { ...base, state: 'advanced' };
  if (x.row.status === 'active' && x.row.nextDay === x.day && x.sessionStatus !== 'ACTIVE') return { ...base, state: 'pending' };
  return { ...base, state: 'unknown' };
}

export function noteStateOf(
  submitted: FinishNote | null,
  saved: { intensity: number; memo: string | null; updatedAt?: Date } | null
): NoteOutcome {
  const savedOut = saved ? { intensity: saved.intensity, memo: saved.memo } : null;
  const sub = submitted ? { intensity: submitted.intensity, memo: submitted.memo } : null;
  if (!submitted || submitted.intensity == null) return { state: 'none', submitted: sub, saved: savedOut };
  if (!saved) return { state: 'pending', submitted: sub, saved: null };
  const same = saved.intensity === submitted.intensity && (submitted.memo == null || saved.memo === submitted.memo);
  /* 제출 뒤에 다른 곳(완료 화면 · 트레이닝 탭)에서 고친 줄이면 그 줄이 이긴다 — 다시 확인이 사람의 새 값을 옛 제출로 덮지 않게 */
  const later = saved.updatedAt != null && saved.updatedAt.getTime() > Date.parse(submitted.at);
  return { state: same || later ? 'saved' : 'pending', submitted: sub, saved: savedOut };
}
