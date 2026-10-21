/**
 * 레슨 노트의 '한 일'(2026-10-21 개편 3단계, docs/designs/sinker-dugout.md 결정 3) — 코치가 한 줄에 하나씩 적은 운동을 표로 바꾼다.
 * 순수 함수만. 저장은 LessonNote.exercises(Json), 읽는 쪽은 선수의 레슨 줄(lib/org/lesson-feed.ts)과 트레이닝 엔진(김민 B-3).
 *
 *   "스쿼트 3x10 60kg"  → { name: '스쿼트', sets: 3, reps: 10, note: '60kg' }
 *   "런지 12회"         → { name: '런지', sets: null, reps: 12, note: null }
 *   "밴드 외회전"       → { name: '밴드 외회전', sets: null, reps: null, note: null }
 */
export type LessonExercise = {
  name: string;
  sets: number | null;
  reps: number | null;
  note: string | null;
};

export const EXERCISE_LINES_MAX = 20;
export const PITCH_COUNT_MAX = 300;
export const INTENSITY_MIN = 1;
export const INTENSITY_MAX = 10;

const SETS_REPS = /^(.+?)\s+(\d{1,2})\s*[x×X*]\s*(\d{1,3})\s*(.*)$/;
const REPS_ONLY = /^(.+?)\s+(\d{1,3})\s*(회|개|번|reps?)\s*(.*)$/i;

export function parseExercises(text: string): LessonExercise[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-•·*]\s*/, ''))
    .filter(Boolean)
    .slice(0, EXERCISE_LINES_MAX)
    .map((line) => {
      let m = SETS_REPS.exec(line);
      if (m)
        return {
          name: m[1].trim(),
          sets: Number(m[2]),
          reps: Number(m[3]),
          note: m[4].trim() || null,
        };
      m = REPS_ONLY.exec(line);
      if (m)
        return {
          name: m[1].trim(),
          sets: null,
          reps: Number(m[2]),
          note: m[4].trim() || null,
        };
      return { name: line.slice(0, 60), sets: null, reps: null, note: null };
    });
}

export function formatExercise(e: LessonExercise): string {
  const amount = e.sets && e.reps ? `${e.sets}×${e.reps}` : e.reps ? `${e.reps}회` : '';
  return [e.name, amount, e.note].filter(Boolean).join(' ');
}

/** DB 의 Json 을 안전하게 표로 */
export function readExercises(json: unknown): LessonExercise[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter(
      (x): x is Record<string, unknown> =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as { name?: unknown }).name === 'string'
    )
    .map((x) => ({
      name: String(x.name),
      sets: typeof x.sets === 'number' ? x.sets : null,
      reps: typeof x.reps === 'number' ? x.reps : null,
      note: typeof x.note === 'string' ? x.note : null,
    }));
}

/** 폼 숫자 칸 — 비면 null, 범위 밖이면 null */
export function readBounded(
  raw: FormDataEntryValue | null,
  min: number,
  max: number
): number | null {
  const n = Number(String(raw ?? '').trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/**
 * 트레이닝 엔진에 넘길 그날 운동량 한 줄(김민 B-3 과 맞출 자리) — 세트 수의 합과 던진 공 수. 세트가 없는 운동은 1세트로 센다.
 */
export function lessonLoadOf(
  exercises: LessonExercise[],
  pitchCount: number | null
): { sets: number; pitches: number } {
  return {
    sets: exercises.reduce((a, e) => a + (e.sets ?? 1), 0),
    pitches: pitchCount ?? 0,
  };
}
