import { STRENGTH_PER_WEEK } from '@/lib/armcare/routine';
import { DAY_RULE_RANK, FAR_OUTING_MIN_DAYS, type DayRank, type DayRule } from '@/lib/engine/microcycle';
import { shiftDateKey } from '@/lib/pitch-stats';
import { HEAVY_LOWER_BLOCK_WITHIN_DAYS } from '@/lib/report/prescription';
import {
  BASICS_REQUIRED_EQUIPMENT,
  PROGRAMS,
  REQUIRED_EQUIPMENT,
  equipmentBlock,
  profileBlock,
  type PerWeek,
  type ProgramId,
} from '@/lib/program/program';

/**
 * 코치 주간 계획기(docs/designs/ai-coach.md 10-3, 결정 U23~U28) — 한 주 7칸에 날마다 '무엇을 · 몇 분 · 큰 하체를 드나'만 정한다.
 * 운동 목록은 그날 기존 엔진이 만든다(R2 — 상태가 날마다 바뀌어 미리 짠 목록은 낡는다). 그날 안전 층(arbiter · selectCandidates)이 늘 이긴다.
 *
 * 새 안전 규칙을 만들지 않는다: 날 종류는 엔진의 규칙 이름 · 차례 · 문턱(lib/engine/microcycle.ts DAY_RULE_RANK · FAR_OUTING_MIN_DAYS,
 * prescription.ts HEAVY_LOWER_BLOCK_WITHIN_DAYS)을 그대로 쓰고, 엔진은 '오늘 한 날'만 facts 로 판정하므로 여기서는 미래 날마다 '등판까지 며칠'로
 * 같은 표를 읽는다(dayRuleOf — 자체 시험이 진짜 dayKindOf 와 견준다). 짐작한 등판은 가볍게 하는 쪽에만 쓴다(엔진과 같은 약속).
 *
 * 순수 파일 — DB · 시계 · 난수 없음. 같은 입력이면 같은 결과다(다시 짜기는 조정 단추로만, U24).
 */

/** 0 월 … 6 일(한 주의 칸 차례와 같다) */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 코치 질문의 답(4단계, CoachProfile.answers) — 앱에 이미 있는 정보(수준 · 평소 횟수)는 WeekInput 이 따로 받는다 */
export type CoachAnswers = {
  /** 운동할 수 있는 요일 */
  days: readonly Weekday[];
  /** 하루 운동 시간(분) */
  minutes: number;
  /** 보통 등판 요일 — 짐작(가볍게 하는 쪽에만) */
  outingDays: readonly Weekday[];
  /** 선발 간격(일) — 마지막 등판에서 이만큼씩 뒤를 짐작. 없으면 요일 짐작 */
  outingEvery: number | null;
  /** 매주 되풀이되는 팀 훈련 요일(달력에 없는 것) */
  teamDays: readonly Weekday[];
};

/** 달력 · 팀 일정 · 레슨의 확실한 날 */
export type FixedDay = { date: string; kind: 'game' | 'team' | 'lesson' };

export type TrainFence = {
  minutes: number;
  /** 큰 하체를 들 수 있는 날인가(엔진 거르기가 그날 한 번 더 본다) */
  heavyLower: boolean;
  /** 등판 전날 · 짐작한 등판 무렵 — 무게 없이 보조로(엔진 rank 'light') */
  light: boolean;
};

export type SlotItem =
  | { kind: 'train'; fence: TrainFence }
  | { kind: 'program'; heavyLower: boolean }
  | { kind: 'armcare'; mode: 'strength' | 'recovery'; suggested: true }
  | { kind: 'mechanics' }
  | { kind: 'fixed'; what: FixedDay['kind'] }
  | { kind: 'rest' };

/** 칸의 까닭 — 화면 글은 정해진 문장(AI 없이도 설명, U7) */
export type ReasonCode =
  | 'outing'
  | 'outing-soft'
  | 'after-outing'
  | 'outing-tomorrow'
  | 'outing-near'
  | 'game'
  | 'team-practice'
  | 'lesson'
  | 'not-available'
  | 'rest'
  | 'lower-yesterday'
  | 'youth'
  | 'effort-spike'
  | 'pain';

export type DaySlot = {
  date: string;
  items: SlotItem[];
  reasons: ReasonCode[];
  /** 사용자가 트레이닝 탭에서 그날을 고쳤으면 'user' — 다시 맞출 때 안 덮는다(U38) */
  owner: 'coach' | 'user';
  /** 엔진 날 종류(규칙 이름)와 그 몫 — 칸 그림 · 시험이 읽는다 */
  rule: DayRule;
  rank: DayRank;
};

export type WeekInput = {
  /** 그 주 월요일(YYYY-MM-DD) */
  weekStart: string;
  /** 오늘 — 다시 맞출 때 이 날 앞은 그대로 */
  today: string;
  answers: CoachAnswers;
  fixed: readonly FixedDay[];
  /** 체크인 답이 하루로 못 박은 다음 등판(lib/checkin.ts exactOutingDay 를 날짜로) — 확실 */
  outingDate: string | null;
  /** 마지막으로 던진 등판(기록) */
  lastOuting: string | null;
  /** 성장기(만 16세 미만, 엔진 YOUTH 와 같은 띠) — 큰 하체를 짜지 않는다 */
  youth: boolean;
  /** 어깨 · 팔꿈치 통증(건강정보 동의가 있을 때만 넘긴다, U18) — 메커니즘 · 강화 암케어를 안 넣는다 */
  painArm: boolean;
  /** 지난주 운동 힘듦 급증(facts.condition.trainingEffort.spikeFlag) — 운동 날 하나 줄임 */
  effortSpike: boolean;
  /** 경력(입문 · 초급 · 중급 · 상급) */
  level: string | null;
  /** 평소 주당 운동 횟수(User.baselineWorkoutFreq) */
  baselineFreq: number | null;
  /** 진행 중 근력 프로그램 — 있으면 그 횟수만큼 프로그램 날, 없으면 그날그날 운동(U26) */
  program: { perWeek: number } | null;
  /** 진행 중 메커니즘 프로그램의 주당 세션 */
  mechanics: { perWeek: number } | null;
  /** 다시 맞출 때 지난 계획 — 오늘 앞 날 · 사용자가 고친 날은 그대로(U24 · U38) */
  prev?: readonly DaySlot[] | null;
};

/** 경력별 기본 주당 운동 횟수(평소 횟수를 모를 때) */
const LEVEL_FREQ: Record<string, number> = { 입문: 2, 초급: 3, 중급: 3, 상급: 4 };
const DEFAULT_FREQ = 3;
/** 성장기 주당 운동 상한 */
const YOUTH_MAX_FREQ = 3;

type Outing = { date: string; soft: boolean };

/**
 * 그 날의 엔진 날 종류(R1 ~ R7, lib/engine/microcycle.ts 머리 주석) — 등판 날짜 목록에서. 엔진과 같은 차례: 세게 던진 다음 날 > 오늘 등판 >
 * 내일 등판 > 3일 안 > 그 밖. 짐작한 등판(soft)은 오늘 · 내일이면 보조, 2~3일 뒤면 큰 하체만 빼고, 4일 이상이면 모름(엔진 G22 — 짐작으로
 * 무거운 쪽을 고르지 않는다). 지난 등판은 확실한 것만 '다음 날 회복'으로 본다.
 */
export function dayRuleOf(date: string, outings: readonly Outing[]): { rule: DayRule; heavyLower: boolean } {
  const yesterday = shiftDateKey(date, -1);
  if (outings.some((o) => o.date === yesterday && !o.soft)) return { rule: 'hard', heavyLower: false };
  const today = outings.find((o) => o.date === date);
  if (today) return { rule: today.soft ? 'softOutingNear' : 'outingToday', heavyLower: false };
  const next = outings.filter((o) => o.date > date).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (!next) return { rule: 'none', heavyLower: true };
  const n = daysFrom(date, next.date);
  if (n === 1) return { rule: next.soft ? 'softOutingNear' : 'outingTomorrow', heavyLower: false };
  if (n <= HEAVY_LOWER_BLOCK_WITHIN_DAYS) return { rule: 'outingSoon', heavyLower: false };
  if (next.soft) return { rule: 'none', heavyLower: true };
  return { rule: n >= FAR_OUTING_MIN_DAYS ? 'outingFar' : 'outingSoon', heavyLower: n >= FAR_OUTING_MIN_DAYS };
}

function daysFrom(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 확실한 등판(경기 일정 · 체크인 답 · 지난 기록)과 짐작(선발 간격 · 보통 요일) — 짐작은 확실한 등판 앞뒤 하루와 겹치면 버린다 */
function outingsOf(input: WeekInput, from: string, to: string): Outing[] {
  const hard = new Set<string>(input.fixed.filter((f) => f.kind === 'game').map((f) => f.date));
  if (input.outingDate) hard.add(input.outingDate);
  if (input.lastOuting) hard.add(input.lastOuting);
  const near = (d: string) => [...hard].some((h) => Math.abs(daysFrom(h, d)) <= 1);
  const soft = new Set<string>();
  const { outingEvery, outingDays } = input.answers;
  if (outingEvery && outingEvery > 1) {
    for (const a of hard)
      for (let d = shiftDateKey(a, outingEvery); d <= to; d = shiftDateKey(d, outingEvery)) if (d >= from && !near(d)) soft.add(d);
  } else if (outingDays.length) {
    for (let d = from; d <= to; d = shiftDateKey(d, 1)) if (outingDays.includes(weekdayOf(d)) && !near(d)) soft.add(d);
  }
  return [...[...hard].map((date) => ({ date, soft: false })), ...[...soft].map((date) => ({ date, soft: true }))];
}

/** 0 월 … 6 일 */
export function weekdayOf(date: string): Weekday {
  return ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) as Weekday;
}

/** 차례대로 고르되 먼저 이어지지 않게, 모자라면 이어서라도 — 같은 입력이면 같은 날 */
function spread(candidates: readonly number[], count: number, taken: ReadonlySet<number> = new Set()): number[] {
  const picked: number[] = [];
  const adj = (i: number) => picked.includes(i - 1) || picked.includes(i + 1) || taken.has(i - 1) || taken.has(i + 1);
  for (const i of candidates) if (picked.length < count && !adj(i)) picked.push(i);
  for (const i of candidates) if (picked.length < count && !picked.includes(i)) picked.push(i);
  return picked.sort((a, b) => a - b);
}

const RULE_REASON: Partial<Record<DayRule, ReasonCode>> = {
  hard: 'after-outing',
  outingToday: 'outing',
  softOutingNear: 'outing-soft',
  outingTomorrow: 'outing-tomorrow',
  outingSoon: 'outing-near',
};

const WORKOUT = new Set<SlotItem['kind']>(['train', 'program']);
const isWorkoutDay = (s: DaySlot) => s.items.some((x) => WORKOUT.has(x.kind) || (x.kind === 'fixed' && x.what !== 'game'));

/**
 * 한 주(월~일) 7칸. prev 가 있으면 오늘 앞 날 · 사용자가 고친 날은 그대로 두고 나머지만 다시 맞춘다 — 그 칸들이 이미 쓴 횟수(운동 · 강화 암케어 ·
 * 메커니즘)는 목표에서 뺀다. 못 한 날을 다음 날로 몰아넣지 않는다(그날 기록은 여기 없다 — 칸 상태는 기록에서 읽는다, 5단계).
 */
export function planWeek(input: WeekInput): DaySlot[] {
  const { weekStart, answers } = input;
  const dates = Array.from({ length: 7 }, (_, i) => shiftDateKey(weekStart, i));
  const outings = outingsOf(input, shiftDateKey(weekStart, -1), shiftDateKey(weekStart, 6 + FAR_OUTING_MIN_DAYS));
  const kept = new Map<number, DaySlot>();
  for (const s of input.prev ?? []) {
    const i = dates.indexOf(s.date);
    if (i >= 0 && (s.date < input.today || s.owner === 'user')) kept.set(i, s);
  }

  const slots: DaySlot[] = dates.map((date, i) => {
    const old = kept.get(i);
    if (old) return old;
    const { rule } = dayRuleOf(date, outings);
    const reasons: ReasonCode[] = [];
    const fixedKinds = new Set(input.fixed.filter((f) => f.date === date).map((f) => f.kind));
    if (answers.teamDays.includes(i as Weekday)) fixedKinds.add('team');
    const items: SlotItem[] = [...fixedKinds].map((what) => ({ kind: 'fixed' as const, what }));
    for (const what of fixedKinds) reasons.push(what === 'team' ? 'team-practice' : what);
    const r = RULE_REASON[rule];
    if (r) reasons.push(r);
    return { date, items, reasons, owner: 'coach', rule, rank: DAY_RULE_RANK[rule] };
  });

  const free = dates.map((_, i) => i).filter((i) => !kept.has(i));
  const hasFixed = (i: number) => slots[i].items.some((x) => x.kind === 'fixed');
  const trainable = free.filter(
    (i) => answers.days.includes(i as Weekday) && slots[i].rank !== 'recovery' && !hasFixed(i)
  );
  const heavyOk = (i: number) => !input.youth && dayRuleOf(dates[i], outings).heavyLower;
  const keptCount = (kind: SlotItem['kind']) => [...kept.values()].filter((s) => s.items.some((x) => x.kind === kind)).length;

  /* 운동 날 — 쉬는 날(운동 · 팀 훈련 · 레슨 없는 날)은 적어도 하루 */
  const fixedWork = slots.filter((s, i) => !kept.has(i) && s.items.some((x) => x.kind === 'fixed' && x.what !== 'game')).length;
  const keptWork = [...kept.values()].filter(isWorkoutDay).length;
  const room = Math.max(0, 6 - fixedWork - keptWork);
  let target: number;
  let picks: number[];
  if (input.program) {
    target = Math.min(room, Math.max(0, input.program.perWeek - keptCount('program')));
    /* 프로그램은 무게를 드는 날 — 보조 날(등판 전날)은 피하고 큰 하체를 들 수 있는 날 먼저 */
    const strong = trainable.filter((i) => slots[i].rank !== 'light');
    picks = spread([...strong.filter(heavyOk), ...strong.filter((i) => !heavyOk(i))], target, new Set([...kept.keys()].filter((i) => kept.get(i)!.items.some((x) => x.kind === 'program'))));
  } else {
    const lessons = slots.filter((s, i) => !kept.has(i) && s.items.some((x) => x.kind === 'fixed' && x.what === 'lesson')).length;
    let base = input.baselineFreq ?? LEVEL_FREQ[input.level ?? ''] ?? DEFAULT_FREQ;
    if (input.youth) base = Math.min(base, YOUTH_MAX_FREQ);
    if (input.effortSpike) base -= 1;
    target = Math.min(room, Math.max(0, base - lessons - keptCount('train')));
    picks = spread(trainable, target);
  }
  for (const i of picks) {
    const heavyLower = heavyOk(i);
    slots[i].items.push(
      input.program
        ? { kind: 'program', heavyLower }
        : { kind: 'train', fence: { minutes: answers.minutes, heavyLower, light: slots[i].rank === 'light' } }
    );
    if (input.youth && dayRuleOf(dates[i], outings).heavyLower) slots[i].reasons.push('youth');
  }
  if (input.effortSpike && !input.program) slots.find((s, i) => !kept.has(i) && !isWorkoutDay(s))?.reasons.push('effort-spike');

  /* 이어진 이틀 큰 하체 없음(keepsLowerBudget 과 같은 약속) — 앞날이 큰 하체면 오늘은 뺀다 */
  for (let i = 1; i < 7; i++) {
    if (kept.has(i) || !heavyOfSlot(slots[i - 1])) continue;
    const cur = slots[i].items.find((x) => x.kind === 'train' || x.kind === 'program');
    if (!cur || !heavyOfItem(cur)) continue;
    if (cur.kind === 'train') cur.fence.heavyLower = false;
    else if (cur.kind === 'program') cur.heavyLower = false;
    slots[i].reasons.push('lower-yesterday');
  }

  /* 암케어 제안(U23) — 등판 날 · 다음 날은 회복, 강화는 주 STRENGTH_PER_WEEK 번 · 이어서 안 함 · 통증이면 빼고. '제안'이라 안 해도 못 함이 아니다 */
  for (const i of free) if (slots[i].rule === 'outingToday' || slots[i].rule === 'hard') slots[i].items.push({ kind: 'armcare', mode: 'recovery', suggested: true });
  if (!input.painArm) {
    const keptStrength = [...kept.entries()].filter(([, s]) => s.items.some((x) => x.kind === 'armcare' && x.mode === 'strength'));
    const ok = free.filter((i) => slots[i].rank === 'strength' || slots[i].rank === 'none');
    const order = [...ok.filter((i) => isWorkoutDay(slots[i])), ...ok.filter((i) => !isWorkoutDay(slots[i]))];
    const n = Math.max(0, STRENGTH_PER_WEEK - keptStrength.length);
    for (const i of spreadStrict(order, n, new Set(keptStrength.map(([i]) => i)))) slots[i].items.push({ kind: 'armcare', mode: 'strength', suggested: true });
  }

  /* 메커니즘 드릴(U23) — 가능한 날, 팔을 다 쓴 날(등판 · 다음 날) · 등판 전날 · 팀 훈련 날은 빼고, 통증이면 안 넣는다(mechanicsFoldOf 와 같은 쪽) */
  if (input.mechanics) {
    if (input.painArm) slots.find((s, i) => !kept.has(i))?.reasons.push('pain');
    else {
      const ok = free.filter((i) => answers.days.includes(i as Weekday) && slots[i].rank !== 'recovery' && slots[i].rule !== 'outingTomorrow' && !slots[i].items.some((x) => x.kind === 'fixed' && x.what === 'team'));
      const order = [...ok.filter((i) => !slots[i].items.some((x) => x.kind === 'program')), ...ok.filter((i) => slots[i].items.some((x) => x.kind === 'program'))];
      const n = Math.max(0, input.mechanics.perWeek - keptCount('mechanics'));
      for (const i of spread(order, n)) slots[i].items.push({ kind: 'mechanics' });
    }
  }

  /* 쉬는 날 */
  for (const i of free) {
    if (isWorkoutDay(slots[i]) || slots[i].items.some((x) => x.kind === 'fixed')) continue;
    slots[i].items.unshift({ kind: 'rest' });
    slots[i].reasons.push(answers.days.includes(i as Weekday) ? 'rest' : 'not-available');
  }
  return slots;
}

/** 주어진 차례대로, 이어지지 않게만 — 강화 암케어는 이틀 잇지 않는다(STRENGTH_PER_WEEK 주석). 모자라도 억지로 잇지 않는다 */
function spreadStrict(candidates: readonly number[], count: number, taken: ReadonlySet<number>): number[] {
  const picked: number[] = [];
  for (const i of candidates) {
    if (picked.length >= count) break;
    if ([i - 1, i + 1].some((j) => picked.includes(j) || taken.has(j))) continue;
    picked.push(i);
  }
  return picked.sort((a, b) => a - b);
}

function heavyOfItem(x: SlotItem): boolean {
  return (x.kind === 'train' && x.fence.heavyLower) || (x.kind === 'program' && x.heavyLower);
}
function heavyOfSlot(s: DaySlot): boolean {
  return s.items.some(heavyOfItem);
}

/* ─────────────────────────── 프로그램 제안(U26) ─────────────────────────── */

export type ProgramPickInput = {
  age: number | null;
  level: string | null;
  ownedEquipment: readonly string[];
  /** 기본기 4주를 마쳤나 */
  basicsDone: boolean;
  /** 코치 질문의 우선순위 맨 앞(U30) */
  priority: 'velocity' | 'control' | 'stamina' | 'health' | null;
  /** 한 주 운동할 수 있는 날 수 */
  trainingDays: number;
};

/** 우선순위 · 경력별 고르는 차례 — 목록에 있는(why 가 있는) 프로그램만, 자격(나이 · 경력 · 장비)은 고르기 화면과 같은 함수로 */
const ORDER: Record<'velocity' | 'beginner' | 'default', readonly ProgramId[]> = {
  velocity: ['pitcher-power', 'ws4sb', '531', 'stronglifts-5x5'],
  beginner: ['stronglifts-5x5', '531'],
  default: ['531', 'juggernaut-5s', 'ws4sb', 'stronglifts-5x5'],
};

/**
 * 맞는 근력 프로그램 하나(없으면 null — 그날그날 운동). 성장기 · 입문은 기본기 4주부터. 사용자가 미리보기에서 [이 프로그램으로 | 프로그램 없이]를 고른다.
 */
export function suggestProgram(input: ProgramPickInput): { id: ProgramId; perWeek: PerWeek } | null {
  if (input.trainingDays < 2) return null;
  const listed = PROGRAMS.filter((p) => p.why);
  const eligible = (id: ProgramId) => {
    const def = listed.find((p) => p.id === id);
    if (!def) return null;
    const basics = def.audience === 'basics';
    if (profileBlock({ audience: def.audience, age: input.age, trainingLevel: input.level, basicsDone: input.basicsDone })) return null;
    if (equipmentBlock(input.ownedEquipment, def.required ?? (basics ? BASICS_REQUIRED_EQUIPMENT : REQUIRED_EQUIPMENT))) return null;
    return def;
  };
  /* 자격은 profileBlock 이 정한다(입문은 기본기를 마쳐야 다른 프로그램이 열림) — 다른 프로그램이 다 막히면 기본기를 마지막으로 본다 */
  const main = input.priority === 'velocity' ? ORDER.velocity : input.level === '초급' ? ORDER.beginner : ORDER.default;
  const order: readonly ProgramId[] = [...main, 'basics-4w'];
  for (const id of order) {
    const def = eligible(id);
    /* 그 프로그램의 가장 적은 주당 횟수만큼도 못 하면 다음 것 */
    if (!def || input.trainingDays < Math.min(...def.perWeek)) continue;
    const perWeek: PerWeek = input.trainingDays >= 3 && def.perWeek.includes(3) ? 3 : def.perWeek.includes(2) ? 2 : def.perWeek[0];
    return { id, perWeek };
  }
  return null;
}
