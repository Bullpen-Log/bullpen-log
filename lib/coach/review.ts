import { shiftDateKey } from '@/lib/pitch-stats';
import type { SlotState } from '@/lib/coach/status';
import { weekdayOf, type DaySlot } from '@/lib/coach/week';

/**
 * 코치 주간 리뷰(docs/designs/ai-coach.md 10-5 U37) — 한 주 칸 + 기록 → 숫자 몇 개와 정해진 문장(AI 없이, 6단계에서 다듬을 수 있음). 진단은 하지 않는다.
 * 보이는 때: 일요일 18시(한국) ~ 월요일 — 일요일엔 이번 주, 월요일엔 지난주. [확인]하면 접힌다(CoachWeek.reviewAckAt). 순수 파일.
 */
export const REVIEW_FROM_HOUR = 18;

/** 지금 보일 리뷰의 주(월요일) — 창 밖이면 null */
export function reviewWeekOf(todayKey: string, hour: number): string | null {
  const wd = weekdayOf(todayKey);
  if (wd === 6 && hour >= REVIEW_FROM_HOUR) return shiftDateKey(todayKey, -6);
  if (wd === 0) return shiftDateKey(todayKey, -7);
  return null;
}

/** 같은 움직임이 이만큼 넘게(날 수) 불편했으면 '전문가와 상의' 한 줄 — 설계 '두 번 넘게' */
export const REPEAT_DISCOMFORT_DAYS = 2;

export type WeekReview = {
  weekStart: string;
  planned: number;
  done: number;
  /** 계획 밖 날에 한 것(쉬는 날에 암케어 등) */
  extra: number;
  missed: number;
  effortAvg: number | null;
  /** 불편 동작이 여러 날 되풀이됐나 */
  repeated: boolean;
  lines: string[];
};

const PLANNED = new Set<DaySlot['items'][number]['kind']>(['train', 'program', 'mechanics']);

export function buildReview(input: {
  weekStart: string;
  slots: readonly DaySlot[];
  states: readonly SlotState[];
  /** 날짜 → 그날 운동 힘듦(1~10) */
  efforts: Readonly<Record<string, number>>;
  /** 날짜 → 그날 고른 불편 동작의 움직임 열쇠(없으면 운동 id) */
  discomfort: Readonly<Record<string, readonly string[]>>;
}): WeekReview {
  const { slots, states } = input;
  const plannedAt = slots.map((s) => s.items.some((x) => PLANNED.has(x.kind)));
  const planned = plannedAt.filter(Boolean).length;
  const done = slots.filter((_, i) => plannedAt[i] && states[i] === 'done').length;
  const extra = slots.filter((_, i) => !plannedAt[i] && states[i] === 'done').length;
  const missed = states.filter((s) => s === 'missed').length;
  const days = slots.map((s) => input.efforts[s.date]).filter((x): x is number => typeof x === 'number');
  const effortAvg = days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null;
  const seen = new Map<string, number>();
  for (const s of slots) for (const k of new Set(input.discomfort[s.date] ?? [])) seen.set(k, (seen.get(k) ?? 0) + 1);
  const repeated = [...seen.values()].some((n) => n > REPEAT_DISCOMFORT_DAYS);

  const lines: string[] = [];
  lines.push(planned ? `계획한 ${planned}일 중 ${done}일 했어요.` : '이번 주는 계획한 운동이 없었어요.');
  if (extra) lines.push(`계획 밖에도 ${extra}일 했어요.`);
  if (days.length >= 2) {
    const d = days[days.length - 1] - days[0];
    lines.push(`힘듦은 평균 ${effortAvg}/10${d >= 2 ? ', 갈수록 힘들어졌어요' : d <= -2 ? ', 갈수록 편해졌어요' : ''}.`);
  } else if (effortAvg != null) lines.push(`힘듦은 ${effortAvg}/10 이었어요.`);
  if (missed >= 2) lines.push('못 한 날이 많았어요. 바쁘면 [이번 주 바빠요]로 줄여도 돼요.');
  if (repeated) lines.push('같은 동작이 여러 번 불편했어요. 계속 그러면 전문가와 상의해 주세요.');
  return { weekStart: input.weekStart, planned, done, extra, missed, effortAvg, repeated, lines };
}
