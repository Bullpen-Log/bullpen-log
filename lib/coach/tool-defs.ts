import { z } from 'zod';
import { applyAdjust, readAdjust, type CoachAdjust } from '@/lib/coach/adjust';
import { ACT_LOG_TYPES, OPEN_LABEL, sanitizeAct } from '@/lib/coach/act';
import { WEEKDAY_LABELS, slotLine } from '@/lib/coach/answers';
import { sanitizeGoal, type GoalOffer } from '@/lib/coach/goal';
import { scrubNames } from '@/lib/coach/ai-prompt';
import { weekdayOf, type DaySlot } from '@/lib/coach/week';
import type { CoachCard } from '@/lib/coach/card';
import { WORKOUT_KINDS } from '@/lib/checkin';
import { GOAL_FOCUSES } from '@/lib/report/personalize';

/**
 * 코치 도구 표(개인 비서 1단계, 2026-11-20 김민: "AI 코치가 싱커 안 개인 비서 — 모든 부분에서 액세스와 컨트롤") — 순수 파일.
 * - 읽기 도구: 코치가 맥락에 없는 기록을 직접 찾아본다. 실행은 서버(lib/coach/tools.ts)가 — 여기는 이름 · 설명 · 입력 모양만.
 * - 바꾸기 도구: 코치는 카드만 만든다(propose). 확인을 통과한 것만 카드가 되고, 안 되면 까닭을 코치에게 돌려준다(코치가 그 까닭으로 답한다).
 *   실행은 선수가 카드를 누를 때 서버가 다시 확인하고 한다(lib/coach/tools.ts apply). 같은 입력이면 같은 카드.
 * 도구 목록은 모든 사용자 · 모든 마디가 같다(캐시가 tools → system 순서로 걸린다). 쓸 수 없는 사람에게는 실행할 때 '못 써요'로 돌려준다.
 */

/** 확인 재료 — 이번 주 일정 · 오늘 · 이번 말(공 수는 말한 숫자만) · 진행 중 목표가 있나 */
export type ProposeCtx = { today: string; said: string; week: readonly DaySlot[]; locked: (date: string) => boolean; goalOpen: boolean };

export type Proposed = { card: Omit<CoachCard, 'id'> } | { refuse: string };

/** 카드 날 글 — 저장돼 나중에 보이므로 '오늘' 대신 날짜 */
export function dayText(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일(${WEEKDAY_LABELS[weekdayOf(date)]})`;
}

const ymd = z.string().describe('YYYY-MM-DD');

const WeekIn = z.object({
  kind: z.enum(['minutes', 'skip', 'move', 'busy']).describe('minutes 시간 바꾸기 · skip 쉬기 · move 옮기기 · busy 바쁜 주 줄이기'),
  date: ymd.nullable().describe('minutes · skip 의 날'),
  minutes: z.number().int().nullable().describe('minutes 일 때 45 · 60 · 75 · 90'),
  from: ymd.nullable().describe('move 의 원래 날'),
  to: ymd.nullable().describe('move 의 옮길 날'),
});
const GoalIn = z.object({
  kind: z.enum(['set', 'drop']),
  what: z.string().nullable().describe('신경 쓸 것만 짧게(예: 착지 균형)'),
  trigger: z.string().nullable().describe('불펜 · 라이브 · 경기 중 하나, 아니면 null'),
  checkOn: ymd.nullable().describe('확인할 날'),
});
const LogIn = z.object({
  date: ymd.nullable().describe('던진 날(오늘이면 null 도 됨)'),
  type: z.enum(ACT_LOG_TYPES),
  count: z.number().int().nullable().describe('사용자가 이번 말에 숫자로 말한 공 수만, 아니면 null'),
});
const OpenIn = z.object({ screen: z.string().describe('checkin · training · armcare · mechanics · lab') });
const RangeIn = z.object({ from: ymd, to: ymd });
const TodayIn = z.object({
  kind: z.enum(['lighter', 'harder', 'focus', 'workout', 'remove', 'add', 'swap']).describe(
    'lighter 가볍게(본운동 세트 −1 · 무게 그대로) · harder 양 늘리기(본운동 세트 +1) · focus 부위 · workout 운동 종류 · remove 빼기 · add 더하기 · swap 바꾸기'
  ),
  focus: z.string().nullable().describe('focus 일 때 하체 · 상체 · 상체 밀기 · 상체 당기기'),
  workout: z.string().nullable().describe('workout 일 때 파워 · 웨이트 · 회복'),
  exercise: z.string().nullable().describe('remove · swap 은 오늘 목록의 운동 이름 그대로, add 는 더할 운동 이름(find_exercises 로 찾은 것)'),
  with: z.string().nullable().describe('swap 일 때 넣을 운동 이름(find_exercises 로 찾은 것)'),
});
const FindIn = z.object({ query: z.string().describe('운동 이름 일부 · 부위(예: 스쿼트, 하체, 어깨)') });

type Def = { name: string; description: string; input: z.ZodType };

/** 읽기 도구 — 실행은 lib/coach/tools.ts READERS */
export const READ_DEFS = [
  {
    name: 'read_pitch_logs',
    description: '투구 기록을 날짜 범위로 읽는다(최대 60일). 날짜 · 종류 · 구수 · 체감 강도 · 만족도. 맥락의 throws(최근 7일)보다 앞이 필요할 때.',
    input: RangeIn,
  },
  {
    name: 'find_exercises',
    description: '오늘 더하거나 바꿔 넣을 수 있는 운동을 이름 · 부위로 찾는다(오늘 장비 · 몸 상태로 앱이 고른 후보, 처방 포함). change_today add · swap 전에 쓴다.',
    input: FindIn,
  },
  {
    name: 'read_checkins',
    description: '체크인을 날짜 범위로 읽는다(최대 30일). 컨디션 · 잠의 질 · 어깨 · 팔꿈치. 건강정보 동의가 없으면 못 읽는다.',
    input: RangeIn,
  },
] as const satisfies readonly Def[];

/** 바꾸기 도구 — 카드를 만든다. 실행은 선수가 누를 때 */
export const WRITE_DEFS = [
  {
    name: 'change_week',
    description: '이번 주 일정 바꾸기 카드. 오늘부터 일요일까지 잠기지 않은 날만. minutes 는 운동 칸에만(프로그램 날 안 됨), move 는 경기 · 등판 · 회복 날로 못 옮긴다.',
    input: WeekIn,
  },
  {
    name: 'change_today',
    description:
      '오늘 운동 바꾸기 카드. 앱 엔진이 다시 짜고 안전 규칙(통증 · 강도 상한 · 빠진 운동)은 그대로 지킨다. 양 늘리기는 몸 신호가 없을 때만, 성장기는 안 된다. 운동을 시작한 뒤에는 못 바꾼다.',
    input: TodayIn,
  },
  { name: 'goal', description: "정한 목표 카드. 'set' 정하기(확인할 날은 오늘부터 14일 안) · 'drop' 지우기. 몸 상태 · 통증은 목표로 정하지 않는다.", input: GoalIn },
  {
    name: 'draft_pitch_log',
    description: '사용자가 던졌다고 말했는데 기록이 없을 때 투구 기록 초안 카드(기록 화면을 채워 연다 — 저장은 사용자가).',
    input: LogIn,
  },
  { name: 'open_screen', description: '지금 할 일이 다른 화면에 있을 때 그 화면 열기 카드(체크인 · 오늘 운동 · 암케어 · 메커니즘 · 3D 동작 분석).', input: OpenIn },
] as const satisfies readonly Def[];

export type ToolName = (typeof READ_DEFS)[number]['name'] | (typeof WRITE_DEFS)[number]['name'];
export const READ_NAMES: ReadonlySet<string> = new Set(READ_DEFS.map((d) => d.name));
export const WRITE_NAMES: ReadonlySet<string> = new Set(WRITE_DEFS.map((d) => d.name));
const INPUT: Record<string, z.ZodType> = Object.fromEntries([...READ_DEFS, ...WRITE_DEFS].map((d) => [d.name, d.input]));

/** API 에 보내는 도구 목록 — 차례 · 글자가 늘 같다(캐시) */
export const TOOL_DEFS = [...READ_DEFS, ...WRITE_DEFS].map((d) => {
  const schema = z.toJSONSchema(d.input) as Record<string, unknown>;
  delete schema.$schema;
  /* 엄격(strict)은 켜지 않는다 — 입력은 실행 전에 서버가 zod 로 다시 거른다(parseToolInput). 스키마 기능 차이로 호출 전체가 막히지 않게 */
  return { name: d.name, description: d.description, input_schema: schema as { type: 'object'; [k: string]: unknown } };
});

/** 도구 입력 거르기 — 모르는 도구 · 모양이 틀리면 null */
export function parseToolInput(name: string, raw: unknown): Record<string, unknown> | null {
  const s = INPUT[name];
  if (!s) return null;
  const r = s.safeParse(raw);
  return r.success ? (r.data as Record<string, unknown>) : null;
}

const noNull = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

function proposeWeek(ctx: ProposeCtx, input: Record<string, unknown>): Proposed {
  const a = readAdjust(noNull(input));
  if (!a) return { refuse: '바꿀 거리 모양이 틀렸어요(시간은 45 · 60 · 75 · 90분).' };
  const dates = a.kind === 'minutes' || a.kind === 'skip' ? [a.date] : a.kind === 'move' ? [a.from, a.to] : [];
  for (const d of dates) {
    if (d < ctx.today) return { refuse: '지난 날은 바꿀 수 없어요.' };
    if (!ctx.week.some((s) => s.date === d)) return { refuse: '이번 주 날만 바꿀 수 있어요.' };
    if (ctx.locked(d)) return { refuse: '그날은 이미 운동을 시작해서 잠겼어요.' };
  }
  const r = applyAdjust(ctx.week, a, ctx.locked);
  if ('error' in r) return { refuse: r.error };
  const line = (d: string) => `${dayText(d)}: ${slotLine(ctx.week.find((s) => s.date === d)!)} → ${slotLine(r.week.find((s) => s.date === d)!)}`;
  /* 오늘이 바뀌면 이미 만든 오늘 운동도 같이 바뀐다(app/actions/coach.ts syncTodayPlan) — 카드에서 미리 말한다 */
  const todayWorks = r.week.find((s) => s.date === ctx.today)?.items.some((x) => x.kind === 'train' || x.kind === 'program');
  const todayLine = r.changed.includes(ctx.today) ? [todayWorks ? '오늘 운동을 이대로 다시 짜요(만든 목록이 있으면 바뀌어요)' : '오늘 만든 운동 목록은 걷어요'] : [];
  return { card: { tool: 'change_week', title: weekTitle(a), lines: [...r.changed.map(line), ...todayLine], cta: '적용', args: { adjust: a } } };
}

function weekTitle(a: CoachAdjust): string {
  if (a.kind === 'minutes') return `${dayText(a.date)} 운동을 ${a.minutes}분으로`;
  if (a.kind === 'skip') return `${dayText(a.date)} 운동 쉬기`;
  if (a.kind === 'move') return `${dayText(a.from)} 운동을 ${dayText(a.to)}에 하기`;
  return '이번 주 운동 날 하나 줄이기';
}

function proposeGoal(ctx: ProposeCtx, input: Record<string, unknown>): Proposed {
  const p = sanitizeGoal(noNull(input), ctx.today);
  if (!p) return { refuse: '목표로 정할 수 없어요(확인할 날은 오늘부터 14일 안, 몸 상태 · 통증은 목표가 아니에요).' };
  if (p.kind === 'drop') {
    if (!ctx.goalOpen) return { refuse: '지울 목표가 없어요.' };
    return { card: { tool: 'goal', title: '정한 목표 지우기', lines: [], cta: '지우기', args: { offer: p satisfies GoalOffer } } };
  }
  if (scrubNames(p.what) !== p.what) return { refuse: '다른 기관 이름은 목표에 넣지 않아요.' };
  const when = `${dayText(p.checkOn)}${p.trigger ? ` ${p.trigger}` : ''}에 어땠는지 물어볼게요`;
  return { card: { tool: 'goal', title: `목표 정하기: ${p.what}`, lines: [when], cta: '정하기', args: { offer: p satisfies GoalOffer } } };
}

function proposeLog(ctx: ProposeCtx, input: Record<string, unknown>): Proposed {
  const a = sanitizeAct({ kind: 'log', ...input }, ctx.today, ctx.said);
  if (a?.kind !== 'log') return { refuse: '초안을 만들 수 없어요(날짜는 오늘부터 6일 전까지, 종류는 캐치볼 · 불펜 · 라이브 · 경기).' };
  return {
    card: {
      tool: 'draft_pitch_log',
      title: `투구 기록 초안: ${dayText(a.date)} ${a.type}${a.count ? ` ${a.count}구` : ''}`,
      lines: ['눌러서 확인하고 저장해 주세요'],
      cta: '초안 열기',
      open: { kind: 'log', date: a.date, type: a.type, count: a.count },
    },
  };
}

function proposeOpen(ctx: ProposeCtx, input: Record<string, unknown>): Proposed {
  const a = sanitizeAct({ kind: 'open', ...input }, ctx.today, ctx.said);
  if (a?.kind !== 'open') return { refuse: '열 수 없는 화면이에요.' };
  return { card: { tool: 'open_screen', title: OPEN_LABEL[a.screen], lines: [], cta: '열기', open: { kind: 'screen', screen: a.screen } } };
}


/** 오늘 더할 수 있는 후보 한 줄(lib/report/training-today-data.ts TodayPickItem 의 칸만) */
export type TodayPick = { id: string; title: string; category: string; bodyParts: string[]; prescription: string | null; inPlan: boolean; unsafe: boolean };

/** 오늘 운동 바꾸기의 확인 재료(개인 비서 2단계) — 대화를 열 때 맥락과 같은 값으로 채운다(app/actions/coach-chat.ts) */
export type TodayWork = {
  /** 오늘 운동을 시작했다 — 오늘은 잠겨 못 바꾼다 */
  started: boolean;
  checkedIn: boolean;
  /** 오늘 만든 판의 운동(없으면 빈 목록) */
  rows: { id: string; title: string }[];
  /** 양을 늘릴 수 없는 까닭(몸 신호 · 통증 확인 전 · 멈춘 계획) — 없으면 null */
  harderBlock: string | null;
  /** 만 16세 미만 — 양을 늘리지 않는다 */
  young: boolean;
  /** 오늘 더할 수 있는 후보(오늘 장비 · 몸 상태로 앱이 고른 것) — 처음 부를 때만 읽는다 */
  picker: () => Promise<TodayPick[]>;
};

/** 이름 맞추기 — 띄어쓰기 · 대소문자 무시. 꼭 같은 것 먼저, 아니면 하나만 걸리는 일부 */
export const norm = (t: string) => t.replace(/\s+/g, '').toLowerCase();
function byName<T extends { title: string }>(items: readonly T[], name: string | null): T | null {
  if (!name) return null;
  const n = norm(name);
  const exact = items.find((i) => norm(i.title) === n);
  if (exact) return exact;
  const some = items.filter((i) => norm(i.title).includes(n) || n.includes(norm(i.title)));
  return some.length === 1 ? some[0] : null;
}

/** 오늘 운동 바꾸기 카드 — 확인을 통과한 것만. 실행은 선수가 누를 때(app/actions/coach-chat.ts applyTodayChange) */
export async function proposeToday(w: TodayWork | undefined, input: Record<string, unknown>): Promise<{ card: Omit<CoachCard, 'id'> } | { refuse: string }> {
  if (!w) return { refuse: '지금은 오늘 운동을 바꿀 수 없어요.' };
  if (w.started) return { refuse: '오늘 운동을 이미 시작해서 여기서는 못 바꿔요. 운동 화면에서 바꿔 주세요.' };
  if (!w.checkedIn) return { refuse: '오늘 체크인을 먼저 해야 운동을 짤 수 있어요.' };
  const remake = '오늘 운동을 다시 짜요(목록이 조금 바뀔 수 있어요)';
  const k = input.kind;
  if (k === 'lighter') return { card: { tool: 'change_today', title: '오늘 운동 가볍게', lines: ['본운동을 한 세트씩 줄이고 무게는 올리지 않아요', remake], cta: '적용', args: { kind: 'lighter' } } };
  if (k === 'harder') {
    if (w.young) return { refuse: '성장기(만 16세 미만)는 앱이 운동량을 늘리지 않아요.' };
    if (w.harderBlock) return { refuse: `오늘은 늘리지 않아요: ${w.harderBlock}` };
    return { card: { tool: 'change_today', title: '오늘 운동 양 늘리기', lines: ['본운동을 한 세트씩 늘려요(다섯 세트까지)', '오늘 빠진 운동 · 강도 상한은 그대로예요', remake], cta: '적용', args: { kind: 'harder' } } };
  }
  if (k === 'focus') {
    const f = GOAL_FOCUSES.find((x) => x.label === input.focus || x.key === input.focus);
    if (!f) return { refuse: '부위는 하체 · 상체 · 상체 밀기 · 상체 당기기 중 하나예요.' };
    return { card: { tool: 'change_today', title: `오늘 운동을 ${f.label} 위주로`, lines: ['오늘 고른 부위로 다시 짜요(몸 상태가 먼저예요)', remake], cta: '적용', args: { kind: 'focus', focus: f.key } } };
  }
  if (k === 'workout') {
    const kind = WORKOUT_KINDS.find((x) => x.name === input.workout);
    if (!kind) return { refuse: '운동 종류는 파워 · 웨이트 · 회복 중 하나예요.' };
    return { card: { tool: 'change_today', title: `오늘 운동 종류: ${kind.name}`, lines: [kind.desc, remake], cta: '적용', args: { kind: 'workout', workout: kind.name } } };
  }
  const out = k === 'remove' || k === 'swap' ? byName(w.rows, input.exercise as string | null) : null;
  if ((k === 'remove' || k === 'swap') && !out) return { refuse: '오늘 목록에서 그 운동을 못 찾았어요. 목록에 있는 이름 그대로 주세요.' };
  if (k === 'remove') return { card: { tool: 'change_today', title: `${out!.title} 빼기`, lines: ['오늘 목록에서 빼요(이미 한 표시도 지워요)'], cta: '적용', args: { kind: 'remove', id: out!.id } } };
  if (k !== 'add' && k !== 'swap') return { refuse: '바꿀 거리 모양이 틀렸어요.' };
  if (!w.rows.length) return { refuse: '오늘 운동을 먼저 만들어야 운동을 더하거나 바꿀 수 있어요.' };
  const want = byName((await w.picker()).filter((p) => !p.inPlan), (k === 'add' ? input.exercise : input.with) as string | null);
  if (!want) return { refuse: '오늘 더할 수 있는 후보에서 그 운동을 못 찾았어요(find_exercises 로 찾은 이름을 주세요).' };
  if (want.unsafe) return { refuse: `${want.title}은 오늘 몸 상태에는 권하지 않아요.` };
  const rx = want.prescription ? [`${want.title}: ${want.prescription}`] : [];
  return k === 'add'
    ? { card: { tool: 'change_today', title: `${want.title} 더하기`, lines: rx, cta: '적용', args: { kind: 'add', id: want.id } } }
    : { card: { tool: 'change_today', title: `${out!.title} → ${want.title}`, lines: [`${out!.title}을 빼고 넣어요`, ...rx], cta: '적용', args: { kind: 'swap', out: out!.id, in: want.id } } };
}

/** 순수 확인 — change_today 는 오늘 판 · 후보가 필요해 서버(lib/coach/tools.ts proposeToday)가 한다 */
const PROPOSERS: Record<Exclude<(typeof WRITE_DEFS)[number]['name'], 'change_today'>, (ctx: ProposeCtx, input: Record<string, unknown>) => Proposed> = {
  change_week: proposeWeek,
  goal: proposeGoal,
  draft_pitch_log: proposeLog,
  open_screen: proposeOpen,
};

/** 바꾸기 도구 → 카드 또는 까닭(코치에게 돌려준다) */
export function propose(name: string, ctx: ProposeCtx, raw: unknown): Proposed {
  const fn = PROPOSERS[name as keyof typeof PROPOSERS];
  if (!fn) return { refuse: '모르는 도구예요.' };
  const input = parseToolInput(name, raw);
  if (!input) return { refuse: '입력 모양이 틀렸어요.' };
  return fn(ctx, input);
}

/** 카드 모음 — 같은 카드는 한 번, CARDS_MAX 까지. 받아들였으면 카드 id, 아니면 까닭 */
export function addCard(cards: CoachCard[], card: Omit<CoachCard, 'id'>, max: number): { id: string } | { refuse: string } {
  const key = JSON.stringify([card.tool, card.args ?? card.open]);
  if (cards.some((c) => JSON.stringify([c.tool, c.args ?? c.open]) === key)) return { refuse: '같은 카드가 이미 있어요.' };
  if (cards.length >= max) return { refuse: `카드는 한 답에 ${max}개까지예요.` };
  const id = `c${cards.length}`;
  cards.push({ id, ...card });
  return { id };
}
