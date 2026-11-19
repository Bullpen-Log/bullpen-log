import { z } from 'zod';
import { applyAdjust, readAdjust, type CoachAdjust } from '@/lib/coach/adjust';
import { ACT_LOG_TYPES, OPEN_LABEL, sanitizeAct } from '@/lib/coach/act';
import { WEEKDAY_LABELS, slotLine } from '@/lib/coach/answers';
import { sanitizeGoal, type GoalOffer } from '@/lib/coach/goal';
import { scrubNames } from '@/lib/coach/ai-prompt';
import { weekdayOf, type DaySlot } from '@/lib/coach/week';
import type { CoachCard } from '@/lib/coach/card';
import { THROW_PLANS, WORKOUT_KINDS } from '@/lib/checkin';
import { GOAL_FOCUSES, TRAINING_LEVEL_NAMES } from '@/lib/report/personalize';
import { ALWAYS_OWNED, SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { cleanEvent, isOutingTitle } from '@/lib/calendar-event';
import { POST_BODY_MAX, POST_CATEGORIES, POST_TITLE_MAX } from '@/lib/community';

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
const OpenIn = z.object({ screen: z.string().describe('checkin · training · armcare · mechanics · lab · calendar · programs · settings') });
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
const NoIn = z.object({});
const FindIn = z.object({ query: z.string().describe('운동 이름 일부 · 부위(예: 스쿼트, 하체, 어깨)') });

/* 4단계 쓰기 — 확인 · 실행은 서버(lib/coach/assist.ts), 카드 글은 아래 순수 함수 */
export const CALENDAR_KINDS = ['경기', '훈련', '레슨', '기타'] as const;
const CalendarIn = z.object({
  kind: z.enum(['add', 'change', 'delete']).describe('add 새 일정 · change 날 · 시각 · 이름 바꾸기 · delete 지우기'),
  date: ymd.describe('add 는 새 일정의 날, change · delete 는 바꿀 일정의 지금 날'),
  eventKind: z.enum(CALENDAR_KINDS).describe('add 는 새 일정의 종류, change · delete 는 바꿀 일정의 종류(read_calendar 로 본 것)'),
  title: z.string().nullable().describe('add 의 이름 · change 의 새 이름(짧게, 예: 연습경기 등판), 아니면 null'),
  time: z.string().nullable().describe('HH:MM(24시) — add 의 시각 · change 의 새 시각, 모르면 null'),
  newDate: ymd.nullable().describe('change 일 때 옮길 날, 아니면 null'),
});
const ThrowPlanIn = z.object({ answer: z.enum(THROW_PLANS).describe('오늘 등판 답') });
const FavoriteIn = z.object({
  kind: z.enum(['운동', '드릴']),
  name: z.string().describe('운동 · 드릴 이름(read_workouts · find_exercises 로 본 그대로)'),
  on: z.boolean().describe('true 즐겨찾기 · false 빼기'),
});
const SettingsIn = z.object({
  kind: z.enum(['level', 'add_equipment', 'remove_equipment']).describe('level 웨이트 경력 · add_equipment 가진 장비 더하기 · remove_equipment 빼기'),
  value: z.string().describe('경력 이름 또는 장비 이름'),
});
const ProgramIn = z.object({ kind: z.enum(['skip', 'stop']).describe('skip 이번 세션 건너뛰기 · stop 프로그램 그만두기') });
const PostIn = z.object({
  category: z.enum(POST_CATEGORIES.map((c) => c.key) as [string, ...string[]]).describe('free 자유 · question 질문 · 답변 · meetup 번개 · team 팀 홍보 · 선수 모집'),
  title: z.string(),
  body: z.string(),
});

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
    name: 'read_workouts',
    description: '운동 기록을 날짜 범위로 읽는다(최대 31일). 날마다 한 운동 · 세트 · 횟수 · 무게 · 운동 힘듦. 오늘 운동 목록이 아니라 지난 기록이 필요할 때.',
    input: RangeIn,
  },
  {
    name: 'read_armcare',
    description: '암케어 기록을 날짜 범위로 읽는다(최대 31일). 날마다 한 암케어 운동.',
    input: RangeIn,
  },
  {
    name: 'read_calendar',
    description: '달력 일정과 팀 · 레슨 일정을 날짜 범위로 읽는다(최대 60일, 오늘부터 60일 뒤까지). 종류(경기 · 훈련 · 레슨 · 기타) · 날짜 · 시각.',
    input: RangeIn,
  },
  { name: 'read_program', description: '근력 · 파워 프로그램 진행(이름 · 몇 번째 세션 · 마지막 한 날 · 지난 프로그램)과 메커니즘 처방 진행(요소 · 단계 · 한 세션 수).', input: NoIn },
  { name: 'read_3d_history', description: '3D 동작 분석을 한 날들(최근 10개)과 가장 최근 판정.', input: NoIn },
  { name: 'read_settings', description: '앱 설정 — 던지는 손 · 하루 운동 시간 · 웨이트 경력 · 운동 목표 · 가진 장비, 최근 알림 10개(종류 · 제목 · 날짜).', input: NoIn },
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
  {
    name: 'open_screen',
    description:
      '지금 할 일이 다른 화면에 있을 때 그 화면 열기 카드(체크인 · 오늘 운동 · 암케어 · 메커니즘 · 3D 동작 분석 · 달력 · 근력 프로그램 고르기 · 트레이닝 설정). 3D 분석 요청 · 메커니즘 처방 고르기 · 프로그램 시작은 그 화면에서 사용자가 한다.',
    input: OpenIn,
  },
  {
    name: 'calendar',
    description:
      "내 달력 일정 더하기 · 바꾸기 · 지우기 카드(오늘부터 180일 안). 팀 · 레슨 일정은 못 바꾼다. 경기 · 등판 일정은 이름에 '경기' 또는 '등판'을 넣는다(앱이 다음 등판으로 읽는다). 지우기는 앱이 한 번 더 묻는다.",
    input: CalendarIn,
  },
  { name: 'throw_plan', description: '오늘 등판 답(던지는 일정) 저장 카드. 오늘 체크인이 있어야 저장된다. 오늘 운동 · 투구 계획이 이 답을 읽는다.', input: ThrowPlanIn },
  { name: 'favorite', description: '운동 · 드릴 즐겨찾기 달기 · 빼기 카드.', input: FavoriteIn },
  {
    name: 'training_settings',
    description: `트레이닝 설정 카드 — 웨이트 경력(${TRAINING_LEVEL_NAMES.join(' · ')}) 또는 가진 장비 더하기 · 빼기(${SELECTABLE_EQUIPMENT.join(' · ')}). 다음에 만드는 운동부터 바뀐다.`,
    input: SettingsIn,
  },
  { name: 'armcare_today', description: '오늘 암케어 루틴 만들기 카드(오늘 몸 상태로 앱이 짠다, 있으면 새로). 오늘 체크인이 있어야 한다.', input: NoIn },
  { name: 'program_day', description: '진행 중인 근력 프로그램의 이번 세션 건너뛰기 · 그만두기 카드(그만두기는 앱이 한 번 더 묻는다, 기록은 남는다). 새 프로그램 시작은 open_screen programs.', input: ProgramIn },
  {
    name: 'draft_post',
    description: '덕아웃 커뮤니티 글 초안 카드 — 글쓰기 화면을 채워 연다. 올리기는 사용자가 직접 한다. 다른 사람의 이름 · 연락처 · 건강정보는 넣지 않는다.',
    input: PostIn,
  },
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
export function byName<T extends { title: string }>(items: readonly T[], name: string | null): T | null {
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
/** 서버가 DB 를 보고 확인하는 도구 — lib/coach/assist.ts ASSIST_PROPOSERS */
export const SERVER_TOOLS = ['change_today', 'calendar', 'throw_plan', 'favorite', 'training_settings', 'armcare_today', 'program_day', 'draft_post'] as const;
const PROPOSERS: Record<Exclude<(typeof WRITE_DEFS)[number]['name'], (typeof SERVER_TOOLS)[number]>, (ctx: ProposeCtx, input: Record<string, unknown>) => Proposed> = {
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

/* ───────────── 4단계 카드 글(순수 — 확인 재료는 서버가 읽어 넘긴다) ───────────── */

/** 일정 이름 → 종류(read_calendar 와 같은 판정 — AI 는 이름 대신 종류로 일정을 가리킨다) */
export const calendarKindOf = (title: string): (typeof CALENDAR_KINDS)[number] =>
  isOutingTitle(title) ? '경기' : /레슨/.test(title) ? '레슨' : /훈련|연습/.test(title) ? '훈련' : '기타';

const CAL_AHEAD = 180;
const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const inCalRange = (d: string, today: string) => d >= today && d <= shiftDay(today, CAL_AHEAD);

type CalRow = { id: string; date: string; title: string; time: string | null };
const OUTING_LINE = '경기 · 등판 일정은 이번 주 일정 · 투구 계획이 읽어요';

/**
 * 달력 카드 — rows 는 그날(change · delete 의 date) 내 일정. 카드 제목에는 원래 일정 이름을 안 넣는다(이름은 AI 에게 안 보낸다 —
 * 도구 결과가 카드 제목을 돌려준다). 이름은 사용자만 보는 줄에.
 */
export function calendarCard(input: Record<string, unknown>, today: string, rows: readonly CalRow[]): Proposed {
  const i = input as { kind: 'add' | 'change' | 'delete'; date: string; eventKind: (typeof CALENDAR_KINDS)[number]; title: string | null; time: string | null; newDate: string | null };
  if (!inCalRange(i.date, today) || (i.newDate && !inCalRange(i.newDate, today))) return { refuse: `오늘부터 ${CAL_AHEAD}일 안의 날만 돼요.` };
  if (i.kind === 'add') {
    const title = (i.title ?? i.eventKind).trim();
    const clean = cleanEvent({ date: i.date, title, time: i.time }, today);
    if (!clean.ok) return { refuse: clean.error };
    if (calendarKindOf(title) !== i.eventKind)
      return { refuse: i.eventKind === '경기' ? "경기 · 등판 일정은 이름에 '경기' 또는 '등판'을 넣어 주세요." : `이름이 ${i.eventKind} 일정으로 안 읽혀요. 이름을 바꿔 주세요.` };
    if (scrubNames(title) !== title) return { refuse: '다른 기관 이름은 일정에 넣지 않아요.' };
    return {
      card: {
        tool: 'calendar',
        title: `${dayText(i.date)} ${i.eventKind} 일정 더하기`,
        lines: [`이름: ${title}${i.time ? ` · ${i.time}` : ''}`, ...(i.eventKind === '경기' ? [OUTING_LINE] : [])],
        cta: '더하기',
        args: { kind: 'add', date: i.date, title, time: i.time },
      },
    };
  }
  const same = rows.filter((r) => r.date === i.date && calendarKindOf(r.title) === i.eventKind);
  if (!same.length) return { refuse: '그날 그 종류의 내 일정을 못 찾았어요(팀 · 레슨 일정은 바꿀 수 없어요).' };
  if (same.length > 1) return { refuse: '그날 같은 종류 일정이 둘 이상이에요. 달력에서 직접 골라 주세요(open_screen calendar).' };
  const row = same[0];
  if (i.kind === 'delete')
    return {
      card: {
        tool: 'calendar',
        title: `${dayText(i.date)} ${i.eventKind} 일정 지우기`,
        lines: [`이름: ${row.title}${row.time ? ` · ${row.time}` : ''}`],
        cta: '지우기',
        confirm: '이 일정을 지울까요?',
        args: { kind: 'delete', id: row.id },
      },
    };
  const next = { date: i.newDate ?? row.date, title: (i.title ?? row.title).trim(), time: i.time ?? row.time };
  if (next.date === row.date && next.title === row.title && next.time === row.time) return { refuse: '바뀌는 게 없어요.' };
  const clean = cleanEvent(next, today);
  if (!clean.ok) return { refuse: clean.error };
  if (scrubNames(next.title) !== next.title) return { refuse: '다른 기관 이름은 일정에 넣지 않아요.' };
  const was = `${dayText(row.date)} ${row.title}${row.time ? ` ${row.time}` : ''}`;
  const now = `${dayText(next.date)} ${next.title}${next.time ? ` ${next.time}` : ''}`;
  return {
    card: {
      tool: 'calendar',
      title: `${dayText(i.date)} ${i.eventKind} 일정 바꾸기`,
      lines: [`${was} → ${now}`, ...(i.eventKind === '경기' || isOutingTitle(next.title) ? [OUTING_LINE] : [])],
      cta: '바꾸기',
      args: { kind: 'change', id: row.id, date: next.date, title: next.title, time: next.time },
    },
  };
}

export function throwPlanCard(answer: unknown, checkedIn: boolean): Proposed {
  const a = THROW_PLANS.find((p) => p === answer);
  if (!a) return { refuse: `등판 답은 ${THROW_PLANS.join(' · ')} 중 하나예요.` };
  if (!checkedIn) return { refuse: '오늘 체크인을 먼저 해야 등판 답이 저장돼요(open_screen checkin).' };
  return { card: { tool: 'throw_plan', title: `오늘 등판 답: ${a}`, lines: ['오늘 운동 · 투구 계획이 이 답을 읽어요'], cta: '저장', args: { answer: a } } };
}

export function favoriteCard(kind: '운동' | '드릴', found: { id: string; title: string } | null, on: boolean, already: boolean): Proposed {
  if (!found) return { refuse: `그 ${kind}을 못 찾았어요. 이름을 그대로 주세요.` };
  if (already === on) return { refuse: on ? '이미 즐겨찾기예요.' : '즐겨찾기에 없어요.' };
  return { card: { tool: 'favorite', title: `${found.title} 즐겨찾기${on ? '' : ' 빼기'}`, lines: [], cta: on ? '달기' : '빼기', args: { kind, id: found.id, on } } };
}

/** 트레이닝 설정 카드 — owned 는 지금 가진 장비(한 번도 안 골랐으면 빈 목록) */
export function settingsCard(kind: 'level' | 'add_equipment' | 'remove_equipment', value: string, level: string | null, owned: readonly string[]): Proposed {
  const v = value.trim();
  const after = '다음에 만드는 운동부터 바뀌어요(오늘 만든 목록은 그대로)';
  if (kind === 'level') {
    if (!TRAINING_LEVEL_NAMES.includes(v)) return { refuse: `경력은 ${TRAINING_LEVEL_NAMES.join(' · ')} 중 하나예요.` };
    if (v === level) return { refuse: '이미 그 경력이에요.' };
    return { card: { tool: 'training_settings', title: `웨이트 경력: ${level ?? '모름'} → ${v}`, lines: [after], cta: '바꾸기', args: { kind, value: v } } };
  }
  if (!(SELECTABLE_EQUIPMENT as readonly string[]).includes(v)) return { refuse: `장비는 ${SELECTABLE_EQUIPMENT.join(' · ')} 중 하나예요.` };
  /* 한 번도 안 고른 사람(빈 목록)은 앱이 모든 장비를 켠 채로 본다 — 하나만 더하면 나머지가 빠진다 */
  if (!owned.length) return { refuse: '가진 장비를 아직 안 골랐어요. 트레이닝 설정에서 한 번 골라 주세요(open_screen settings).' };
  const has = owned.includes(v);
  if (kind === 'add_equipment' ? has : !has) return { refuse: has ? '이미 가진 장비예요.' : '가진 장비에 없어요.' };
  return {
    card: { tool: 'training_settings', title: `가진 장비 ${kind === 'add_equipment' ? '더하기' : '빼기'}: ${v}`, lines: [after], cta: kind === 'add_equipment' ? '더하기' : '빼기', args: { kind, value: v } },
  };
}

/** 장비 목록 바꾸기(실행할 때 지금 목록에 다시 건다) — 맨몸은 늘 */
export function nextEquipment(owned: readonly string[], kind: 'add_equipment' | 'remove_equipment', v: string): string[] {
  const rest = owned.filter((n) => n !== ALWAYS_OWNED && n !== v);
  return kind === 'add_equipment' ? [...rest, v] : rest;
}

export function armcareCard(checkedIn: boolean): Proposed {
  if (!checkedIn) return { refuse: '오늘 체크인을 먼저 해야 암케어를 짤 수 있어요(open_screen checkin).' };
  return { card: { tool: 'armcare_today', title: '오늘 암케어 루틴 만들기', lines: ['오늘 몸 상태로 짜요(이미 있으면 새로 짜요)'], cta: '만들기', args: {} } };
}

export function programCard(kind: 'skip' | 'stop', p: { name: string; nextDay: number } | null): Proposed {
  if (!p) return { refuse: '진행 중인 근력 프로그램이 없어요.' };
  if (kind === 'skip')
    return { card: { tool: 'program_day', title: `${p.name} ${p.nextDay}번째 세션 건너뛰기`, lines: ['건너뜀으로 세고 다음 세션으로 넘어가요'], cta: '건너뛰기', args: { kind, day: p.nextDay } } };
  return { card: { tool: 'program_day', title: `${p.name} 그만두기`, lines: ['지금까지 기록은 남아요'], cta: '그만두기', confirm: '근력 프로그램을 그만둘까요?', args: { kind } } };
}

export function postCard(input: Record<string, unknown>): Proposed {
  const { category, title, body } = input as { category: string; title: string; body: string };
  const t = title.trim();
  const b = body.trim();
  if (!t || !b) return { refuse: '제목과 내용을 적어 주세요.' };
  if (t.length > POST_TITLE_MAX || b.length > POST_BODY_MAX) return { refuse: `제목은 ${POST_TITLE_MAX}자 · 내용은 ${POST_BODY_MAX}자까지예요.` };
  if (scrubNames(t) !== t || scrubNames(b) !== b) return { refuse: '다른 기관 이름은 글에 넣지 않아요.' };
  const label = POST_CATEGORIES.find((c) => c.key === category)?.label ?? '자유';
  return {
    card: { tool: 'draft_post', title: `덕아웃 글 초안(${label}): ${t}`, lines: ['눌러서 고치고 직접 올려 주세요'], cta: '초안 열기', open: { kind: 'post', category, title: t, body: b } },
  };
}
