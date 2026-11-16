import { shiftDateKey } from '@/lib/pitch-stats';
import type { FixedDay, Weekday } from '@/lib/coach/week';

/**
 * 주마다 일정 묻기(2026-11-16 김민: "등판 일정이랑 스케줄을 매주 사용자한테 물어보고 일정 생성") — 한 주에 한 번, 요일마다 하나를 고른다:
 * 선발 · 불펜 대기 · 팀 훈련(레슨) · 못 하는 날. 답한 주는 등판을 짐작하지 않는다(보통 등판 요일 · 선발 간격을 안 쓴다) — 답이 곧 그 주의 사실이다.
 * 답은 CoachProfile.answers.weekAsks 에 최근 두 주만(새 표 없음). 안 답하면 지금처럼 짐작으로 짠다(막지 않는다). 순수 파일.
 *
 * 선발과 불펜 대기를 가르는 까닭: 달력 경기는 얼마나 던질지 몰라 늘 긴 등판으로 봤다(다음 날 쉬기). 불펜 대기는 안 던지거나 짧게 던지는 날이
 * 많아, 다음 날은 실제로 던진 양(투구 기록 → lastOuting)으로 정한다 — 계획기에서는 '가볍게 하는 쪽에만 쓰는 등판'(soft)과 같은 몫이다.
 */
export const WEEK_PICKS = [
  { value: 'start', label: '선발' },
  { value: 'relief', label: '불펜 대기' },
  { value: 'team', label: '팀 훈련 · 레슨' },
  { value: 'off', label: '못 하는 날' },
] as const;

export type WeekPick = (typeof WEEK_PICKS)[number]['value'];
/** 요일(0 월 … 6 일) → 고른 것. 안 고른 요일은 칸이 없다 */
export type WeekPicks = Partial<Record<Weekday, WeekPick>>;
/** skipped = '이번 주는 건너뛰기' — 다시 묻지 않고 짐작으로 짠다 */
export type WeekAsk = { weekStart: string; picks: WeekPicks; skipped?: true };

/* 0 월 … 6 일 — lib/coach/week.ts weekdayOf 와 같은 셈. 거기서 가져오지 않는 까닭: 앱 화면이 이 파일의 선택지를 쓰는데 계획기(프로그램 · 엔진 표)까지
   앱 묶음에 딸려 오지 않게 */
const dayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** 물을 주의 월요일 — 일요일 18시부터는 다음 주(주간 리뷰가 뜨는 때와 같다), 그 밖에는 이번 주 */
export function askWeekStart(today: string, hour: number): string {
  const monday = shiftDateKey(today, -dayOf(today));
  return dayOf(today) === 6 && hour >= 18 ? shiftDateKey(monday, 7) : monday;
}

/**
 * 답을 합친다 — from(이번 주면 오늘 요일, 다음 주면 0) 앞의 날은 화면에서 못 고르므로 앱이 보낸 값을 버리고 예전 답을 지킨다. 지난 날의 답이
 * 사라지면 오늘이 '등판 다음 날'에서 풀려 다시 짜인다(어제 선발 → 오늘 쉬기).
 */
export function mergePicks(old: WeekPicks | null, picks: WeekPicks, from: number): WeekPicks {
  const out: WeekPicks = {};
  for (let d = 0; d < 7; d++) {
    const v = d < from ? old?.[d as Weekday] : picks[d as Weekday];
    if (v) out[d as Weekday] = v;
  }
  return out;
}

/** 앱이 보낸 답 검사 — 요일 열쇠 0~6, 값은 넷 중 하나. 모양이 틀리면 null */
export function readWeekPicks(v: unknown): WeekPicks | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: WeekPicks = {};
  for (const [k, pick] of Object.entries(v as Record<string, unknown>)) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !WEEK_PICKS.some((o) => o.value === pick)) return null;
    out[day as Weekday] = pick as WeekPick;
  }
  return out;
}

const listOf = (asks: unknown): WeekAsk[] =>
  Array.isArray(asks) ? asks.filter((a): a is WeekAsk => !!a && typeof a === 'object' && typeof (a as WeekAsk).weekStart === 'string' && !!readWeekPicks((a as WeekAsk).picks)) : [];

/** 그 주의 답(건너뛴 주도 돌려준다 — 다시 안 묻게) */
export const weekAskFor = (asks: unknown, weekStart: string): WeekAsk | null => listOf(asks).find((a) => a.weekStart === weekStart) ?? null;

/**
 * 엔진에 넘기는 등판 일정 — 답한 주(건너뛴 주 빼고)의 선발 · 불펜 대기 날. 계획기만 답을 읽으면 그날 운동 엔진은 등판을 몰라, 코치 칸은
 * '등판 전날 · 가볍게'인데 실제 일정은 무거운 하체 날이 나올 수 있었다(2026-11-16 검토). 엔진은 이것을 달력 일정처럼 짐작한 등판(soft)으로
 * 읽어 가볍게 하는 쪽에만 쓴다(lib/report/gather.ts — 팀이 확정한 등판과 같은 길). 이름에 '등판'이 들어가야 엔진이 등판으로 읽는다
 * (lib/calendar-event.ts isOutingTitle).
 */
export const WEEK_ASK_OUTING_TITLE = {
  start: '선발 등판(이번 주 일정)',
  relief: '불펜 대기 등판(이번 주 일정)',
} as const;

export function weekAskOutings(asks: unknown): { date: string; title: string }[] {
  const out: { date: string; title: string }[] = [];
  for (const a of listOf(asks)) {
    if (a.skipped) continue;
    for (const [k, pick] of Object.entries(a.picks)) {
      if (pick === 'start' || pick === 'relief')
        out.push({ date: shiftDateKey(a.weekStart, Number(k)), title: WEEK_ASK_OUTING_TITLE[pick] });
    }
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** 답을 넣고 최근 두 주만 남긴다 */
export function withWeekAsk(asks: unknown, ask: WeekAsk): WeekAsk[] {
  return [...listOf(asks).filter((a) => a.weekStart !== ask.weekStart), ask].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1)).slice(-2);
}

/**
 * 미리 채울 값 — 그 주에 이미 답했으면 그 답, 지난주 답이 있으면 그것(same: '지난주와 같아요' 한 번으로 끝낼 수 있다), 없으면 달력 경기(선발로) ·
 * 되풀이 팀 훈련 요일. 달력 경기는 얼마나 던질지 몰라 선발로 채운다 — 사용자가 불펜 대기로 바꾼다.
 */
export function prefillPicks(asks: unknown, weekStart: string, known: { games: readonly Weekday[]; teamDays: readonly Weekday[] }): { picks: WeekPicks; same: boolean } {
  const mine = weekAskFor(asks, weekStart);
  if (mine && !mine.skipped) return { picks: mine.picks, same: false };
  const last = weekAskFor(asks, shiftDateKey(weekStart, -7));
  if (last && !last.skipped && Object.keys(last.picks).length) return { picks: last.picks, same: true };
  const picks: WeekPicks = {};
  for (const d of known.teamDays) picks[d] = 'team';
  for (const d of known.games) picks[d] = 'start';
  return { picks, same: false };
}

/**
 * 답을 계획기 입력으로 — 답한 주는 짐작(outingDays · outingEvery)을 끄고, 팀 훈련 요일 · 못 하는 날을 그 주 답으로 바꾼다. 달력 경기는 그대로 두되
 * 그날을 불펜 대기로 골랐으면 불펜 대기로 본다. 건너뛴 주 · 답 없는 주는 null(지금처럼 짐작으로).
 */
export function applyWeekAsk(
  ask: WeekAsk | null,
  base: { days: readonly Weekday[]; fixed: readonly FixedDay[] }
): { days: Weekday[]; teamDays: Weekday[]; fixed: FixedDay[] } | null {
  if (!ask || ask.skipped) return null;
  const entries = Object.entries(ask.picks).map(([k, pick]) => ({ day: Number(k) as Weekday, date: shiftDateKey(ask.weekStart, Number(k)), pick }));
  const relief = new Set(entries.filter((e) => e.pick === 'relief').map((e) => e.date));
  const fixed: FixedDay[] = base.fixed.map((f) => (f.kind === 'game' && relief.has(f.date) ? { ...f, relief: true as const } : f));
  for (const e of entries) {
    if ((e.pick !== 'start' && e.pick !== 'relief') || fixed.some((f) => f.kind === 'game' && f.date === e.date)) continue;
    fixed.push(e.pick === 'relief' ? { date: e.date, kind: 'game', relief: true } : { date: e.date, kind: 'game' });
  }
  return {
    days: base.days.filter((d) => ask.picks[d] !== 'off'),
    teamDays: entries.filter((e) => e.pick === 'team').map((e) => e.day),
    fixed,
  };
}
