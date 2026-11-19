/**
 * 코치가 대신 해 주기(docs/designs/ai-coach-knowledge-memory.md 8절 5단계) — 대화 마디 밑 단추 하나. 순수 파일.
 * - log: 선수가 말한 투구를 투구 기록 초안으로 — 기록 화면(퀵스텝)을 채워 열 뿐 저장은 선수가 그 화면에서 한다.
 *   공 수는 선수가 이번 말에 숫자로 적은 것만(AI 가 지어낸 숫자는 버린다). 강도 · 구속은 싣지 않는다(기록 화면에서 선수가 고른다).
 * - open: 할 일 화면 하나 열기(체크인 · 오늘 운동 · 암케어 · 메커니즘 · 3D 동작 분석 · 구속 측정).
 * AI 가 저장 · 시작하지 않는다 — 선수가 눌러야 열린다.
 */
export const ACT_LOG_TYPES = ['캐치볼', '불펜', '라이브', '경기'] as const;
export type ActLogType = (typeof ACT_LOG_TYPES)[number];
/** 초안 날짜는 오늘부터 이만큼 앞까지(앞날은 안 된다 — 기록 화면도 막는다) */
export const ACT_LOG_DAYS_BACK = 6;
/** 기록 화면의 투구 수 상한과 같다(native/src/pitch/entry-model.ts MAX_PITCH_COUNT) */
export const ACT_MAX_COUNT = 500;

export const OPEN_SCREENS = ['checkin', 'training', 'armcare', 'mechanics', 'lab', 'velocity'] as const;
export type OpenScreen = (typeof OPEN_SCREENS)[number];
export const OPEN_LABEL: Record<OpenScreen, string> = {
  checkin: '오늘 체크인',
  training: '오늘 운동',
  armcare: '암케어',
  mechanics: '메커니즘 드릴',
  lab: '3D 동작 분석',
  velocity: '구속 측정',
};

export type CoachAct = { kind: 'log'; date: string; type: ActLogType; count: number | null; done?: boolean } | { kind: 'open'; screen: OpenScreen };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const validDay = (v: unknown): v is string => typeof v === 'string' && DAY_RE.test(v) && shift(v, 0) === v;

/** 선수가 이 숫자를 글에 적었나 — 앞뒤가 숫자가 아닌 그 숫자('40개' · '공 40' 은 되고 '140' 안의 40 은 안 된다) */
export function saidNumber(said: string, n: number): boolean {
  return new RegExp(`(^|\\D)${n}(?!\\d)`).test(said);
}

/**
 * AI 가 낸 act 칸 → 보일 수 있는 단추. 모르는 모양 · 앞날 · 일주일 넘게 지난 날 · 던지지 않은 종류면 null.
 * 공 수는 선수 말(said)에 숫자로 있을 때만 남기고, 없으면 비워 둔다(기록 화면에서 적는다).
 */
export function sanitizeAct(raw: unknown, today: string, said: string): CoachAct | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === 'open') return (OPEN_SCREENS as readonly unknown[]).includes(o.screen) ? { kind: 'open', screen: o.screen as OpenScreen } : null;
  if (o.kind !== 'log') return null;
  if (!(ACT_LOG_TYPES as readonly unknown[]).includes(o.type)) return null;
  const date = o.date == null ? today : o.date;
  if (!validDay(date) || date > today || date < shift(today, -ACT_LOG_DAYS_BACK)) return null;
  const n = o.count;
  const count = typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= ACT_MAX_COUNT && saidNumber(said, n) ? n : null;
  return { kind: 'log', date, type: o.type as ActLogType, count };
}

/** 저장된 마디의 act 칸 읽기(화면에 다시 그릴 때) */
export function readAct(raw: unknown): CoachAct | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === 'open') return (OPEN_SCREENS as readonly unknown[]).includes(o.screen) ? { kind: 'open', screen: o.screen as OpenScreen } : null;
  if (o.kind === 'log' && validDay(o.date) && (ACT_LOG_TYPES as readonly unknown[]).includes(o.type))
    return { kind: 'log', date: o.date, type: o.type as ActLogType, count: typeof o.count === 'number' ? o.count : null };
  return null;
}
