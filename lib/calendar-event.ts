/**
 * 홈 캘린더의 일정 — 사용자가 직접 적는 할 일(등판 · 병원 · 시합 · 약속).
 *
 * 홈 캘린더(app/(app)/today)에만 보인다. 투구 기록 캘린더(/videos)는 지난 기록을 보는 곳이라 넣지 않는다.
 * 화면과 서버가 같은 규칙으로 고르도록 검사는 여기 한곳에 둔다(순수).
 */

export type CalendarEventView = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** 'HH:MM' — null 이면 하루 종일 */
  time: string | null;
  memo: string | null;
  /** 몇 분 전에 알릴까(0 = 그 시각) — null 이면 알림 없음 */
  remindMin: number | null;
};

export type CalendarEventInput = {
  date: string;
  title: string;
  time?: string | null;
  memo?: string | null;
  remindMin?: number | null;
};

/**
 * 알림 고르기 — 아이폰 캘린더의 '알림'과 같은 몇 가지. 하루 종일 일정은 그날 오전 9시를 기준으로 센다
 * (자정에 울리면 자는 중이라).
 */
export const REMIND_OPTIONS: {
  value: number | null;
  label: string;
  allDayLabel: string;
}[] = [
  { value: null, label: '없음', allDayLabel: '없음' },
  { value: 0, label: '일정 시각', allDayLabel: '당일 오전 9시' },
  { value: 10, label: '10분 전', allDayLabel: '당일 오전 8:50' },
  { value: 30, label: '30분 전', allDayLabel: '당일 오전 8:30' },
  { value: 60, label: '1시간 전', allDayLabel: '당일 오전 8시' },
  { value: 1440, label: '하루 전', allDayLabel: '전날 오전 9시' },
];
const REMIND_VALUES = new Set(REMIND_OPTIONS.map((o) => o.value));

/** 새 일정의 알림 — 시각이 있으면 30분 전, 하루 종일이면 그날 아침 */
export function defaultRemind(time: string | null): number {
  return time ? 30 : 0;
}

/** 하루 종일 일정의 기준 시각 */
const ALL_DAY_AT = '09:00';

/**
 * 알림이 울릴 때(ms, Date.now 기준). 알림이 없으면 null. 한국 시각(+09:00)으로 센다 — 이 앱의 날짜 키가 모두 한국 날짜다.
 */
export function remindAt(e: Pick<CalendarEventView, 'date' | 'time' | 'remindMin'>) {
  if (e.remindMin == null) return null;
  const at = Date.parse(`${e.date}T${e.time ?? ALL_DAY_AT}:00+09:00`);
  return Number.isNaN(at) ? null : at - e.remindMin * 60_000;
}

export const EVENT_TITLE_MAX = 40;
export const EVENT_MEMO_MAX = 300;

/** 오늘에서 앞뒤로 몇 해까지 적게 할까 — 엉뚱한 해에 잘못 적는 것만 막는다 */
const YEARS_SPAN = 5;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 있는 날짜인가 — '2026-02-30' 같은 것을 막는다 */
function realDate(key: string) {
  if (!DATE_RE.test(key)) return false;
  const d = new Date(`${key}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

/** 받은 값을 다듬어 돌려준다. 틀리면 화면에 그대로 띄울 말 */
export function cleanEvent(
  input: CalendarEventInput,
  today: string
): { ok: true; value: Required<CalendarEventInput> } | { ok: false; error: string } {
  const date = typeof input.date === 'string' ? input.date : '';
  if (!realDate(date)) return { ok: false, error: '날짜가 올바르지 않아요.' };
  const year = Number(date.slice(0, 4));
  const thisYear = Number(today.slice(0, 4));
  if (Math.abs(year - thisYear) > YEARS_SPAN)
    return { ok: false, error: `앞뒤 ${YEARS_SPAN}년 안의 날짜만 적을 수 있어요.` };

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return { ok: false, error: '일정 이름을 적어 주세요.' };
  if (title.length > EVENT_TITLE_MAX)
    return { ok: false, error: `이름은 ${EVENT_TITLE_MAX}자까지 적을 수 있어요.` };

  const rawTime = typeof input.time === 'string' ? input.time.trim() : '';
  if (rawTime && !TIME_RE.test(rawTime))
    return { ok: false, error: '시각이 올바르지 않아요.' };

  const rawMemo = typeof input.memo === 'string' ? input.memo.trim() : '';
  if (rawMemo.length > EVENT_MEMO_MAX)
    return { ok: false, error: `메모는 ${EVENT_MEMO_MAX}자까지 적을 수 있어요.` };

  const remindMin = input.remindMin ?? null;
  if (!REMIND_VALUES.has(remindMin))
    return { ok: false, error: '알림이 올바르지 않아요.' };

  return {
    ok: true,
    value: { date, title, time: rawTime || null, memo: rawMemo || null, remindMin },
  };
}

/** 하루 안의 차례 — 하루 종일이 먼저, 그다음 이른 시각부터 */
export function sortEvents(list: CalendarEventView[]) {
  return [...list].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? '').localeCompare(b.time ?? '') ||
      a.title.localeCompare(b.title)
  );
}

/** '오후 3:30' — 아이폰 캘린더처럼 */
export function timeLabel(time: string | null) {
  if (!time) return '하루 종일';
  const [h, m] = time.split(':').map(Number);
  const half = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${half} ${h12}:${String(m).padStart(2, '0')}`;
}
