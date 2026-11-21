import { shiftDateKey } from '@/lib/pitch-stats';
import { RATED_SESSION_TYPES } from '@/lib/pitch-satisfaction';
import { toWeight, type WeightUnit } from '@/lib/units';
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
  /** 늘어난 것 한 줄(growthLineOf) — 없으면 안 싣는다 */
  growth?: string | null;
}): WeekReview {
  const { slots, states } = input;
  /* 틀이 생기기 전에 지난 날(late)은 계획한 날로 세지 않는다 */
  const plannedAt = slots.map((s) => !s.late && s.items.some((x) => PLANNED.has(x.kind)));
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
  if (input.growth) lines.push(input.growth);
  if (extra) lines.push(`계획 밖에도 ${extra}일 했어요.`);
  if (days.length >= 2) {
    const d = days[days.length - 1] - days[0];
    lines.push(`힘듦은 평균 ${effortAvg}/10${d >= 2 ? ', 갈수록 힘들어졌어요' : d <= -2 ? ', 갈수록 편해졌어요' : ''}.`);
  } else if (effortAvg != null) lines.push(`힘듦은 ${effortAvg}/10 이었어요.`);
  if (missed >= 2) lines.push('못 한 날이 많았어요. 바쁘면 [이번 주 바빠요]로 줄여도 돼요.');
  if (repeated) lines.push('같은 동작이 여러 번 불편했어요. 계속 그러면 전문가와 상의해 주세요.');
  return { weekStart: input.weekStart, planned, done, extra, missed, effortAvg, repeated, lines };
}

/* ─────────── 늘어난 것 한 줄(2026-11-21 김민: AI 코치 검토 4번 — 리뷰가 '얼마나 했나'만 말했다) ─────────── */

/** 무게: 이번 주 전 이만큼 안의 가장 최근 기록과 견준다 */
export const GROWTH_LOOKBACK_DAYS = 56;
/** 만족도: 그 주 기록이 이만큼 넘고(이상) 앞 3주도 이만큼일 때, 평균이 이만큼 넘게 오르면 */
export const GROWTH_FEEL_WEEKS = 3;
export const GROWTH_FEEL_MIN = 2;
export const GROWTH_FEEL_STEP = 0.5;

export type GrowthInput = {
  weekStart: string;
  /** 무게를 적은 세트 · 운동 체크(그 주 끝까지 · GROWTH_LOOKBACK_DAYS 앞부터) */
  lifts: readonly { date: string; name: string; weightKg: number | null; reps: number | null }[];
  /** 투구 기록(그 주 끝까지 · 앞 3주부터) */
  pitches: readonly { date: string; sessionType: string; satisfaction: number | null }[];
  /** 그 주에 다시 잰 3D 를 처방 비교에 이었나 */
  rechecked: boolean;
  unit: WeightUnit;
};

type Best = { w: number; r: number };
const better = (a: Best, b: Best) => a.w > b.w || (a.w === b.w && a.r > b.r);
const weightText = (kg: number, unit: WeightUnit) => `${Math.round(toWeight(kg, unit) * 10) / 10}${unit}`;

/**
 * 그 주에 늘어난 것 — 하나만, 이 차례로: ① 무게(그 주 가장 무거운 세트가 그 전 가장 최근 날보다 무게가 올랐고 횟수가 같거나 많음,
 * 또는 같은 무게에 횟수가 늘음) ② 투구 만족도(그 주 평균이 앞 3주보다 0.5 넘게) ③ 3D 다시 재기를 이음(사실만 — 좋아졌다는 말은 안 함).
 * 없으면 null(지어낸 칭찬을 안 한다). '이번 주'라는 말은 안 쓴다 — 월요일엔 지난주 리뷰를 보인다.
 */
export function growthLineOf(x: GrowthInput): string | null {
  const end = shiftDateKey(x.weekStart, 6);
  const inWeek = (d: string) => d >= x.weekStart && d <= end;
  const oldest = shiftDateKey(x.weekStart, -GROWTH_LOOKBACK_DAYS);
  const byName = new Map<string, Map<string, Best>>();
  for (const l of x.lifts) {
    if (!l.weightKg || l.weightKg <= 0 || !l.reps || l.reps <= 0 || l.date > end || l.date < oldest) continue;
    const days = byName.get(l.name) ?? new Map<string, Best>();
    const b = { w: l.weightKg, r: l.reps };
    const prev = days.get(l.date);
    if (!prev || better(b, prev)) days.set(l.date, b);
    byName.set(l.name, days);
  }
  let pick: { name: string; t: Best; p: Best } | null = null;
  for (const [name, days] of [...byName.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const week = [...days.entries()].filter(([d]) => inWeek(d)).map(([, b]) => b);
    const before = [...days.keys()].filter((d) => d < x.weekStart).sort().at(-1);
    if (!week.length || !before) continue;
    const t = week.reduce((a, b) => (better(b, a) ? b : a));
    const p = days.get(before)!;
    if (!((t.w > p.w && t.r >= p.r) || (t.w === p.w && t.r > p.r))) continue;
    const gain = (c: { t: Best; p: Best }) => [c.t.w / c.p.w, c.t.r - c.p.r];
    if (!pick) pick = { name, t, p };
    else {
      const [gw, gr] = gain({ t, p }), [pw, pr] = gain(pick);
      if (gw > pw || (gw === pw && gr > pr)) pick = { name, t, p };
    }
  }
  if (pick) {
    const { name, t, p } = pick;
    const now = `${name} ${weightText(t.w, x.unit)}×${t.r}`;
    return t.w > p.w
      ? `${now}, 지난 기록 ${weightText(p.w, x.unit)}×${p.r}보다 ${weightText(t.w - p.w, x.unit)} 올렸어요.`
      : `${now}, 지난 기록보다 ${t.r - p.r}회 더 했어요.`;
  }
  const from = shiftDateKey(x.weekStart, -7 * GROWTH_FEEL_WEEKS);
  const rated = x.pitches.filter((l) => l.satisfaction != null && (RATED_SESSION_TYPES as readonly string[]).includes(l.sessionType));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const now = rated.filter((l) => inWeek(l.date)).map((l) => l.satisfaction!);
  const prior = rated.filter((l) => l.date >= from && l.date < x.weekStart).map((l) => l.satisfaction!);
  if (now.length >= GROWTH_FEEL_MIN && prior.length >= GROWTH_FEEL_MIN && avg(now) - avg(prior) >= GROWTH_FEEL_STEP) {
    const r = (v: number) => Math.round(v * 10) / 10;
    return `투구 만족도 평균 ${r(avg(now))}, 그 전 3주 ${r(avg(prior))}보다 올랐어요.`;
  }
  return x.rechecked ? '3D 동작 분석을 다시 재서 처방 비교에 이었어요. 비교는 메커니즘 드릴 화면에서 봐요.' : null;
}
