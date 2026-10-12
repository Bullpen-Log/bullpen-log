/**
 * 중재 — 근력 프로그램 · 매일 일정 · 암케어 · 메커니즘이 같은 하루를 나눠 쓰는 규칙(트레이닝 추천 2판 P6-1, 2026-10-13,
 * docs/designs/training-recommendation-engine.md).
 *
 * 왜 두는가. 기능마다 오늘을 따로 정해서, 같은 날 둘이 부딪쳤다(설계 검토 P6 arbiter 갈래).
 *   - 프로그램 날에도 매일 일정이 본운동을 따로 짰다(기준선 ⑳ 34/34). 사용자 결정 D6 은 '프로그램 진행 중이면 그날은 프로그램 운동 그대로'다.
 *   - 무거운 하체가 이틀 이어지는 것을 매일 일정끼리는 번갈아 규칙이 막지만, 프로그램과 일정 사이(어제 프로그램 스쿼트 → 오늘 일정 하체,
 *     오늘 일정 하체 → 내일 프로그램 스쿼트)는 아무도 안 봤다(기준선 ㉑ 은 P5 검토 반영으로 0 이 됐지만 막는 규칙은 없다).
 *   - 등판 날 '그래도 하기'로 넘기면 메디신볼 · 회전 던지기가 그대로 남았다(프로그램 D24 · 매일 일정 forcing).
 *   - 오늘 세게 던진 날(오늘 불펜 40구 90%)에 매일 일정은 회복인데 프로그램은 주의 한 줄만 달고 무거운 날을 냈다(비판 1 빈틈 29).
 * 여기서 층 차례로 한 번 정하고, 독자(프로그램 판정 · 매일 일정 · 암케어 · 메커니즘)는 결과의 제 칸만 읽는다.
 *
 * 층 차례(ARBITER_LAYERS) — 위 층이 정한 것을 아래 층이 되살리지 못한다.
 *   1 safety   안전 층 — 통증이 있었는데 오늘 체크인이 없으면(painStateUnknown) 매일 일정 · 프로그램이 멈춘다. 중재는 운동을 더하지 않는다.
 *              빼는 일(selectCandidates)은 안전 층의 몫이고 여기서 하지 않는다.
 *   2 outing   등판 보호(팔) — 오늘 등판 · 오늘 경기 기록 · 오늘 세게 던진 날이면 팔로 던지는 것(팔 플라이오 · 프로그램 메디신볼 · 회전 던지기 ·
 *              메커니즘 던지기 드릴 · 암케어 강화)을 오늘은 뺀다. '그래도 하기'로도 못 넘긴다(비판 1 빈틈 30 권함 — 조이는 쪽).
 *              과제 글의 마지막 층 '팔 · 하체 · 시간 예산' 가운데 팔 예산은 등판 날에만 있어 이 층에 둔다.
 *   3 choice   사용자 선택 — 오늘 '그래도 하기'(매일 일정 forcing · 프로그램 D24 '그래도 오늘 할래요'), 오늘 '회복'을 고름, 다른 운동을 먼저
 *              시작함(프로그램 otherMode). '그래도 하기'는 아래 쉬는 날 · 예산을 넘고(경고 한 줄), 회복 고름 · 다른 운동은 프로그램을 쉬게 한다.
 *   4 rest     쉬라는 날 — 날 종류(lib/engine/microcycle.ts)가 회복(R1 세게 던진 날 · R3 오늘 등판 · R2 중간 부하 + 힘듦 급증)이거나 프로그램이
 *              스스로 쉬는 날(decideToday 'rest'). 사용자 선택이 없으면 프로그램은 오늘 안 한다. 과제 글의 '등판 보호'에서 넘길 수 있는 쪽을
 *              뗀 층이다 — 지금 코드가 '그래도 하기'로 등판 날 쉬기를 넘기게 해 두었다(D24 · forcing), 그것을 그대로 지킨다.
 *   5 program  프로그램 — 진행 중인 프로그램이 오늘 하는 날(owns)이면 매일 일정은 프로그램 운동 그대로(D6, PROGRAM_DAY_DAILY 'none').
 *   6 budget   예산 — 하체(무거운 하체가 48시간 안에 두 번 없게)와 시간. 프로그램 운동은 빼지 않고 큰 하체만 가볍게(D6 '그대로'를 지킨다).
 *
 * 이 파일이 정하지 않는 것 — 읽는 쪽이 같은 결과로 한다(arbitrate 를 부르는 곳은 아직 없다, P6-3 부터 잇는다):
 *   - 프로그램 판정(lib/program/program.ts decideToday)에 신호를 넣는 일 — 2판 P6-2 에서 이었다: programArbiterSignals 가 armBudget(state).spent →
 *     armSpent, 고정 운동으로 가른 팔 던지기 → armThrows(판정이 오늘 일차와 겹치는 것을 deferVariants 로), lowerBudget(…).programLighter →
 *     heavyLowerYesterday, 쉬라는 날 층의 오늘 세게 던진 날 → hardToday, 사용자 선택 층의 '회복' → choseRecovery, 등판 창(outingNearOf, 2판 P6
 *     검토) → outingSoon · softOutingNear 를 만들고 lib/program/load.ts ·
 *     자체 시험 · 기준선이 그것을 판정에 넘긴다. 판정 전에 부른다 — armBudget 은 판정을 안 보고, lowerBudget 은 판정 없이 만든 칸
 *     (programCommitment(commitment), 역할 'unknown')으로도 다음 일차를 본다. program.ts 는 이 파일을 부르지 않는다(이 파일이 program.ts 를
 *     부르므로 순환) — 그래서 신호는 부르는 쪽이 만들어 넘기고, 둘이 같이 쓰는 상수(ARM_THROW_VARIANTS · 하체 글)는 program.ts 에 둔다.
 *   - 매일 일정이 하체 날을 바꾸는 일(theme.ts steerFromEmptyMain 옆): daily.heavyLower false 면 상체(daily.upperOk) 또는 보조로.
 *   - 메커니즘 접기(D5): mechanics.foldThrows · anyway. 드릴이 던지는 것인지는 메커니즘 쪽 술어(isArmLoaded)가 정한다. 메커니즘 화면은 오늘 상태
 *     한 장을 만들지 않고 lib/mechanics/fold.ts mechanicsFoldOf 가 같은 차례(팔 예산 > 통증 확인 전 > 통증, 성장기 통증은 못 펼침)로 정한다 —
 *     2판 P6 검토부터, 자체 시험이 둘이 같은 답인지 격자로 본다.
 *   - 암케어: 등판 · 오늘 던진 날은 decideArmcare 가 이미 회복으로 간다(오늘 상태 한 장의 outing.role · 오늘 N구). 여기 armcare.strength 는
 *     같은 날을 같은 말로 적어 둘 뿐이다(자체 시험이 둘이 같은지 본다). 암케어 파일은 안 고친다(비판 1 빈틈 9).
 *
 * 밀린 것(deferred)의 until 은 '다시 할 수 있는 가장 이른 날'이지 일정에 다시 넣는다는 약속이 아니다 — 다음 날 일정이 밀린 것을 읽는 곳이 없다
 * (비판 1 빈틈 32). 그래서 글은 '내일로 미뤘어요'가 아니라 '오늘은 뺐어요' · '오늘은 쉬어요'로 쓴다.
 *
 * 순수 파일이다 — 'server-only' · prisma · 날짜 함수(appNow · new Date) · 난수 없음. 자체 시험 · 기준선 도구가 node 로 그대로 부른다
 * (비판 1 빈틈 17 — server-only 를 넣으면 시험이 못 읽는다). 같은 입력이면 늘 같은 값이고 입력을 바꾸지 않는다.
 * import: 프로그램 정의(lib/program/program.ts — 순수) · 운동 분류(exercise-class.ts) · 따르는 프로그램 날수(score.ts — 고르기 점수와 같은
 * 경계) · 오늘 상태 한 장과 날 종류의 타입. lib/report/theme.ts · daily-plan.ts · lib/program/load.ts(server-only)는 부르지 않는다 — 그쪽이
 * 이 파일을 부를 것이라 되부르면 순환이다.
 */
import { ARM_PAIN_ROUTINE_MIN_AGE, type WorkoutKind } from '@/lib/checkin';
import type { DayState, ProgramCommitment } from '@/lib/engine/day-state';
import {
  isArmPlyo,
  isHeavyLower,
  type ClassifiableExercise,
} from '@/lib/engine/exercise-class';
import type { DayKind, DayRule } from '@/lib/engine/microcycle';
import {
  ARM_THROW_VARIANTS,
  CAUTION_TEXT,
  SLOT_OF,
  VARIANT_LABELS,
  dayLabel,
  dayPlan,
  daysBetween,
  parseProgram,
  type SlotKind,
  type TodayDecision,
  type TodaySignals,
  type VariantKey,
} from '@/lib/program/program';
import { HEAVY_LOWER_BLOCK_WITHIN_DAYS } from '@/lib/report/prescription';
import { PROGRAM_FOLLOW_DAYS } from '@/lib/report/score';

/* ─────────────────────────── 층 ─────────────────────────── */

/** 층 차례 — 머리 주석. 앞의 층이 이긴다 */
export const ARBITER_LAYERS = [
  'safety',
  'outing',
  'choice',
  'rest',
  'program',
  'budget',
] as const;
export type ArbiterLayer = (typeof ARBITER_LAYERS)[number];

/**
 * 프로그램 날의 매일 일정 — 'none' 이면 프로그램 운동 그대로(보조를 더하지 않는다), 'assist' 면 남은 시간에 보조 · 코어를 붙인다.
 * 사용자 결정 D6(2026-10-11): '그날의 프로그램 운동을 그대로 가져온다' — 원문에 '보조'라는 말이 없어 'none'(설계 문서 D6 행).
 * 'assist' 길은 결정이 바뀔 때를 위해 남긴다(timeBudget 이 그 시간을 셈한다).
 */
export type ProgramDayDaily = 'none' | 'assist';
export const PROGRAM_DAY_DAILY: ProgramDayDaily = 'none';

/* ─────────────────────────── 프로그램 칸 ─────────────────────────── */

/**
 * 팔로 던지는 프로그램 변형 — 메디신볼 · 회전 던지기. 둘 다 메디신볼을 던지는 상체 파워다(program.ts VARIANT_MOVEMENT_KEY 가 상체 파워로
 * 적고, 고정 운동은 isArmPlyo 가 참 — 메디신볼 장비). 점프(하체 파워)는 같은 파워 칸이지만 팔을 안 쓴다 — 그래서 칸(SlotKind)이 아니라
 * 변형 단위로 뺀다(칸 단위로 빼면 점프까지 지운다, 비판 1 빈틈 35).
 *
 * 상수는 lib/program/program.ts 에 있다(2판 P6-2 에서 옮김) — 프로그램 판정(decideToday)이 고정 운동을 모를 때 이 목록으로 짐작하는데,
 * 그 파일이 이 파일을 부르면 순환이라. 여기서는 예전 이름 그대로 다시 내보낸다(부르던 곳 · 자체 시험이 그대로 맞게).
 */
export { ARM_THROW_VARIANTS };

/**
 * 프로그램 날의 무거운 하체 — 큰 하체 칸(스쿼트 · 힌지). 기준선 ㉑ 판정자(scripts/training-baseline.mts programDayOf 의 bigLower)와 같은
 * 범위다. 매일 일정 쪽의 무거운 하체(exercise-class.ts isHeavyLower)는 하체 점프까지 넣는데 프로그램의 점프 칸은 안 센다 — 프로그램 점프는
 * 세트가 적고(3×3 남짓) 기준선이 안 세서, 넣으면 지표와 규칙이 어긋난다(비판 1 빈틈 38 — 두 정의를 문서에 적는다).
 */
export const PROGRAM_HEAVY_LOWER_SLOT: SlotKind = 'bigLower';

/** 프로그램 일차 하나 — 무엇을 하는가(그날 조정 · 몸 상태는 안 본다 — 하기로 한 것) */
export type ProgramDaySlots = {
  /** 일차(1부터) */
  day: number;
  /** '1주차 · 2일차 · 밀기' — program.ts dayLabel */
  label: string;
  /** 그날 변형(차례대로) */
  variants: VariantKey[];
  /** 그날 칸(겹치지 않게, 처음 나온 차례) */
  slots: SlotKind[];
  /** 큰 하체 칸이 있다(PROGRAM_HEAVY_LOWER_SLOT) */
  heavyLower: boolean;
  /** 그날 변형 가운데 팔로 던지는 것 — 고정 운동을 알면 isArmPlyo, 모르면 ARM_THROW_VARIANTS */
  armThrows: VariantKey[];
};

/** 프로그램이 오늘 무엇인가 — owns 오늘 하는 날 · after 어제 해서 오늘은 쉬는 칸 · none 그 밖 */
export type ProgramRole = 'owns' | 'after' | 'none';

/**
 * 그 역할의 까닭.
 *   session   오늘 프로그램 판을 열었거나 마쳤다(그날은 프로그램 것 — 나중에 쉬는 날이 돼도 되돌리지 않는다)
 *   go        판정이 오늘 하는 날(decideToday 'go')
 *   spacing   어제 프로그램 날이라 오늘은 쉬는 칸(decideToday 'spacing', 판정을 안 줬으면 어제 마친 날로)
 *   rest      프로그램이 스스로 쉬는 날(경기 날 · 전날 · 어제 팔 부담 — decideToday 'rest')
 *   waiting   체크인 기다림 · 통증 멈춤(decideToday 'needCheckin' · 'painWait')
 *   otherMode 오늘 다른 방식으로 운동을 먼저 시작했다
 *   done      다 마쳤다
 *   unknown   판정을 안 줘서 오늘 하는 날인지 모른다 — 하는 날로 짐작하지 않는다(매일 일정을 막지 않게)
 */
export type ProgramRoleWhy =
  'session' | 'go' | 'spacing' | 'rest' | 'waiting' | 'otherMode' | 'done' | 'unknown';

export type ProgramCommitmentView = {
  key: string;
  role: ProgramRole;
  roleWhy: ProgramRoleWhy;
  /** 오늘 하는(했던) 일차 — owns 일 때만 */
  today: ProgramDaySlots | null;
  /** 어제 마친 일차 — 마지막으로 마친 날이 어제일 때만 */
  yesterday: ProgramDaySlots | null;
  /** 다음에 할 일차 — 남아 있으면(오늘 하는 날이면 그다음 일차) */
  next: ProgramDaySlots | null;
  /**
   * 최근에 따르는 프로그램인가 — 마지막으로 마친 날이 PROGRAM_FOLLOW_DAYS(10일) 안. 고르기 점수(score.ts programNextOf)와 같은 경계다.
   * 마친 날이 없으면(시작만 했다) 거짓 — 안 하는 프로그램이 매일 일정의 하체를 몇 주씩 막지 않게.
   */
  following: boolean;
  /** 내일이 프로그램 날일 수 있는가 — 따르고 · 다음 일차가 있고 · 오늘 하는 날이 아니면(하는 날 다음 날은 쉬는 칸) */
  tomorrowPossible: boolean;
};

/** 오늘 프로그램 판의 상태 — 부르는 쪽(lib/program/load.ts todaySession)이 넘긴다. day 는 그 판의 일차(SessionProgramTag.day) */
export type ProgramSessionToday = { state: 'active' | 'finished'; day: number };

/** 일차 하나의 칸 — exerciseOf 로 변형마다 고정 운동을 넘기면 팔 던지기를 그 운동으로 가른다 */
export function programDaySlotsOf(
  key: string,
  day: number,
  exerciseOf?: (variant: VariantKey) => ClassifiableExercise | null | undefined
): ProgramDaySlots | null {
  const plan = parseProgram(key);
  if (!plan || day < 1 || day > plan.totalDays) return null;
  const items = dayPlan(plan, day).items;
  const variants = items.map((x) => x.variant);
  const slots: SlotKind[] = [];
  for (const v of variants) if (!slots.includes(SLOT_OF[v])) slots.push(SLOT_OF[v]);
  return {
    day,
    label: dayLabel(plan, day),
    variants,
    slots,
    heavyLower: slots.includes(PROGRAM_HEAVY_LOWER_SLOT),
    armThrows: variants.filter((v) => {
      const ex = exerciseOf?.(v);
      return ex ? isArmPlyo(ex) : ARM_THROW_VARIANTS.includes(v);
    }),
  };
}

/**
 * 진행 중인 프로그램이 오늘 무엇인가 — 오늘 상태 한 장의 commitments.program 과 (있으면) 오늘 판정 · 오늘 판으로.
 *
 *   오늘 판이 있으면(열었거나 마침) 또는 오늘 마친 날이면  owns(session) — 오늘 일차는 그 판의 일차(없으면 마친 일차 nextDay − 1)
 *   판정 'go'                                              owns(go) — 오늘 일차 nextDay
 *   판정 'spacing', 판정 없이 어제 마친 날                   after(spacing)
 *   판정 'rest' · 'needCheckin' · 'painWait' · 'otherMode' · 'done'   none(그 까닭)
 *   다 마쳤다                                              none(done)
 *   판정 없음                                              none(unknown) — 하는 날로 짐작하지 않는다
 * 프로그램이 없거나 모르는 키면 null. 쉬는 날 · 사용자 선택으로 역할이 바뀌는 것은 arbitrate 가 한다(이 함수는 판정을 그대로 옮긴다).
 */
export function programCommitment(
  commitment: ProgramCommitment | null | undefined,
  {
    decision = null,
    session = null,
    exerciseOf,
  }: {
    decision?: TodayDecision['kind'] | null;
    session?: ProgramSessionToday | null;
    exerciseOf?: (variant: VariantKey) => ClassifiableExercise | null | undefined;
  } = {}
): ProgramCommitmentView | null {
  if (!commitment) return null;
  const plan = parseProgram(commitment.key);
  if (!plan) return null;
  const slotsOf = (day: number) => programDaySlotsOf(commitment.key, day, exerciseOf);
  const since = commitment.daysSinceLastDone;
  const doneToday = since === 0;

  let role: ProgramRole;
  let roleWhy: ProgramRoleWhy;
  let todayDay: number | null = null;
  if (session) {
    role = 'owns';
    roleWhy = 'session';
    todayDay = session.day;
  } else if (doneToday) {
    role = 'owns';
    roleWhy = 'session';
    todayDay = commitment.nextDay - 1;
  } else if (decision === 'go') {
    role = 'owns';
    roleWhy = 'go';
    todayDay = commitment.nextDay;
  } else if (decision === 'spacing' || (decision == null && since === 1)) {
    role = 'after';
    roleWhy = 'spacing';
  } else if (decision === 'rest') {
    role = 'none';
    roleWhy = 'rest';
  } else if (decision === 'needCheckin' || decision === 'painWait') {
    role = 'none';
    roleWhy = 'waiting';
  } else if (decision === 'otherMode') {
    role = 'none';
    roleWhy = 'otherMode';
  } else if (decision === 'done' || commitment.done) {
    role = 'none';
    roleWhy = 'done';
  } else {
    role = 'none';
    roleWhy = 'unknown';
  }

  /* 오늘 판이 아직 일차를 안 넘겼으면(열림 · go) 다음은 그 뒤 일차, 넘겼거나(오늘 마침) 오늘이 아니면 nextDay */
  const advancedToday =
    doneToday || (session != null && session.day < commitment.nextDay);
  const nextDay =
    role === 'owns' && !advancedToday
      ? (todayDay ?? commitment.nextDay) + 1
      : commitment.nextDay;
  const following = since != null && since >= 0 && since <= PROGRAM_FOLLOW_DAYS;
  const next = slotsOf(nextDay);
  return {
    key: commitment.key,
    role,
    roleWhy,
    today: todayDay != null ? slotsOf(todayDay) : null,
    yesterday: since === 1 ? slotsOf(commitment.nextDay - 1) : null,
    next,
    following,
    tomorrowPossible: following && next != null && role !== 'owns',
  };
}

/* ─────────────────────────── 하체 예산 ─────────────────────────── */

/**
 * 매일 일정에 무거운 하체를 못 넣는 까닭(위가 이긴다).
 *   todayProgram      오늘 프로그램 날에 큰 하체가 있다
 *   yesterdayProgram  어제 프로그램 날에 큰 하체가 있었다
 *   yesterdayDaily    어제 하체 날이었다(lastLowerKey — 매일 일정의 하체 마지막 날, 완료든 계획이든)
 *   tomorrowProgram   내일이 프로그램 날일 수 있고 그 일차에 큰 하체가 있다
 */
export type LowerBudgetReason =
  'todayProgram' | 'yesterdayProgram' | 'yesterdayDaily' | 'tomorrowProgram';

export const LOWER_BUDGET_TEXT: Record<LowerBudgetReason | 'programLighter', string> = {
  todayProgram: '오늘 근력 프로그램에 큰 하체가 있어 무거운 하체는 더하지 않아요.',
  yesterdayProgram: '어제 근력 프로그램에서 하체를 해서 오늘은 무거운 하체를 쉬어요.',
  /*
   * 어제 하체 날 — lastLowerKey 는 완료 기록이 없는 날 저장만 한 일정 · 등판 창의 가벼운 하체 날까지 하체 날로 센다(lowerBudget 주석 —
   * 조이는 쪽으로 틀린다). 그래서 '무겁게 했어요'라고 단정하지 않는다(2판 P6 검토).
   */
  yesterdayDaily: '어제가 하체 날이라 오늘은 무거운 하체를 쉬어요.',
  tomorrowProgram: '다음 근력 프로그램에 큰 하체가 있어 오늘은 무거운 하체를 쉬어요.',
  /* 프로그램 카드의 주의 한 줄(program.ts CAUTION_TEXT.lowerBudget)과 한 곳 — 중재 결과와 카드가 같은 글을 쓰게(2판 P6-2) */
  programLighter: CAUTION_TEXT.lowerBudget,
};

export type LowerBudget = {
  /** 오늘 매일 일정에 무거운 하체(isHeavyLower)를 넣어도 되는가 */
  dailyHeavyLower: boolean;
  because: LowerBudgetReason | null;
  /**
   * 오늘(또는 오늘 할 수 있는) 프로그램 일차의 큰 하체를 가볍게 하는가 — 어제 하체 날이었고(프로그램 날이 아닌데) 그 일차에 큰 하체가 있다.
   * 빼지 않고 가볍게만 한다 — D6 '그날의 프로그램 운동 그대로'를 지킨다. 프로그램 판정(decideToday)의 heavyLowerYesterday 가 이것이다.
   */
  programLighter: boolean;
  /** 매일 일정 쪽 한 줄(막혔을 때) */
  text: string | null;
  /** 프로그램 쪽 한 줄(가볍게 할 때) */
  programText: string | null;
};

/**
 * 하체 예산 — 무거운 하체가 48시간 안에 두 번 없게(프로그램 날 다음 날 · 프로그램 날 전날 포함).
 *
 * 매일 일정끼리는 번갈아 규칙(theme.ts — 어제 하체면 오늘 상체)이 이미 막는다. 여기서 더 보는 것은 프로그램과 일정 사이다:
 * 어제 프로그램 스쿼트 → 오늘 일정 하체(로그에 안 접혔을 때), 오늘 일정 하체 → 내일 프로그램 스쿼트, 어제 일정 하체 → 오늘 프로그램 스쿼트.
 * 마지막 것은 프로그램을 빼지 않고 큰 하체만 가볍게 한다(programLighter).
 *
 * lastLowerKey 는 매일 일정의 하체 마지막 날(daily-plan.ts strengthDatesFrom — 완료 기록 · 저장된 계획). 하체 날이었으면 무거운 하체가 빠진
 * 가벼운 하체 날(등판 창)도 걸린다 — 조이는 쪽으로 틀린다(가정). 판정 결과는 안 본다 — 프로그램 판정 전에 부를 수 있게(머리 주석).
 */
export function lowerBudget({
  asOf,
  lastLowerKey,
  program,
}: {
  /** 오늘(YYYY-MM-DD) — 오늘 상태 한 장의 asOf */
  asOf: string;
  lastLowerKey: string | null;
  program: ProgramCommitmentView | null;
}): LowerBudget {
  const yesterdayLower = lastLowerKey != null && daysBetween(lastLowerKey, asOf) === 1;
  const yesterdayProgramHeavy = program?.yesterday?.heavyLower === true;
  const todayProgramHeavy =
    program?.role === 'owns' && program.today?.heavyLower === true;
  const tomorrowProgramHeavy =
    program != null && program.tomorrowPossible && program.next?.heavyLower === true;

  const because: LowerBudgetReason | null = todayProgramHeavy
    ? 'todayProgram'
    : yesterdayProgramHeavy
      ? 'yesterdayProgram'
      : yesterdayLower
        ? 'yesterdayDaily'
        : tomorrowProgramHeavy
          ? 'tomorrowProgram'
          : null;

  /*
   * 오늘 할 수 있는 프로그램 일차 — 판정 뒤면 오늘 일차, 판정 전이면 다음 일차(오늘 go 가 되면 그 일차). 어제가 프로그램 날이면(yesterday)
   * 오늘은 쉬는 칸이라 가볍게 할 것이 없다. 어제 하체 날이 프로그램 판(일차를 못 넘긴 판)이었어도 큰 하체가 이어지니 가볍게 한다.
   */
  const candidate =
    program == null || program.yesterday != null || program.role === 'after'
      ? null
      : (program.today ?? (program.role === 'none' ? program.next : null));
  const programLighter = yesterdayLower && candidate?.heavyLower === true;

  return {
    dailyHeavyLower: because == null,
    because,
    programLighter,
    text: because ? LOWER_BUDGET_TEXT[because] : null,
    programText: programLighter ? LOWER_BUDGET_TEXT.programLighter : null,
  };
}

/** 하체 예산을 지키는 운동인가 — 막힌 날 무거운 하체(isHeavyLower)는 아니다. 매일 일정 쪽이 후보를 거를 때 쓴다 */
export function keepsLowerBudget(
  ex: ClassifiableExercise,
  budget: LowerBudget
): boolean {
  return budget.dailyHeavyLower || !isHeavyLower(ex);
}

/* ─────────────────────────── 팔 예산 ─────────────────────────── */

/**
 * 오늘 팔을 다 쓴 까닭(위가 이긴다).
 *   gameToday   오늘 등판(오늘 '오늘 등판', 또는 오늘 답 없이 어제 '내일 등판' — 오늘 상태 한 장의 outing.role 'game')
 *   gameLogged  오늘 '경기' 투구 기록이 있다(투구수와 상관없이 — 경기는 100% 로 센다)
 *   hardToday   오늘 세게 던진 날(오늘 상태 한 장의 load.hardOuting 이 오늘 — facts.ts isHardOuting, 불펜 · 라이브도)
 * 불펜 날(답 '오늘 불펜')은 다 쓴 날이 아니다 — 프로그램은 이미 회전 던지기만 빼고(decideToday), D5 는 통증 날만 말한다(사용자 확인 전).
 */
export type ArmSpentReason = 'gameToday' | 'gameLogged' | 'hardToday';

export const ARM_BUDGET_TEXT: Record<ArmSpentReason, string> = {
  gameToday: '오늘 등판이라 팔로 던지는 운동은 오늘은 뺐어요.',
  gameLogged: '오늘 경기에서 던져 팔로 던지는 운동은 오늘은 뺐어요.',
  hardToday: '오늘 많이 던져 팔로 던지는 운동은 오늘은 뺐어요.',
};

export type ArmBudget = {
  spent: boolean;
  because: ArmSpentReason | null;
  text: string | null;
  /** 오늘 빼는 것 — spent 면 모두 참 · ARM_THROW_VARIANTS, 아니면 모두 거짓 · 빈 목록 */
  defer: {
    /** 매일 일정의 팔 플라이오(exercise-class.ts isArmPlyo) */
    dailyArmPlyo: boolean;
    /** 프로그램의 팔 던지기 변형 — 오늘 일차에 있는 것만 실제로 뺀다(programDeferVariants) */
    programVariants: readonly VariantKey[];
    /** 메커니즘 던지기 · 메디신볼 드릴(드릴 분류는 메커니즘 쪽 술어가 가른다) */
    mechanicsThrows: boolean;
    /** 암케어 강화 루틴(회복 루틴은 한다 — decideArmcare 가 이미 그렇게 간다) */
    armcareStrength: boolean;
  };
};

/**
 * 팔 예산 — 오늘 등판 · 오늘 경기 기록 · 오늘 세게 던진 날이면 팔로 던지는 것을 오늘은 뺀다. 판정 결과를 안 보므로 프로그램 판정 전에 부를 수
 * 있다. typesToday 는 오늘 투구 기록의 세션 종류(programSignalsOf 와 같은 입력) — 안 주면 기록으로는 안 본다.
 */
export function armBudget({
  state,
  typesToday = [],
}: {
  state: Pick<DayState, 'outing' | 'load'>;
  typesToday?: readonly string[];
}): ArmBudget {
  const because: ArmSpentReason | null =
    state.outing.role === 'game'
      ? 'gameToday'
      : typesToday.includes('경기')
        ? 'gameLogged'
        : state.load.hardOuting?.daysAgo === 0
          ? 'hardToday'
          : null;
  const spent = because != null;
  return {
    spent,
    because,
    text: because ? ARM_BUDGET_TEXT[because] : null,
    defer: {
      dailyArmPlyo: spent,
      programVariants: spent ? [...ARM_THROW_VARIANTS] : [],
      mechanicsThrows: spent,
      armcareStrength: spent,
    },
  };
}

/** 팔 예산을 지키는 운동인가 — 다 쓴 날 팔 플라이오(isArmPlyo)는 아니다. '그래도 하기'로도 안 풀린다 */
export function keepsArmBudget(ex: ClassifiableExercise, budget: ArmBudget): boolean {
  return !budget.defer.dailyArmPlyo || !isArmPlyo(ex);
}

/** 그 일차에서 오늘 빼는 프로그램 변형 — 팔 예산이 뺄 변형 가운데 그 일차의 팔 던지기(armThrows)에 든 것 */
export function programDeferVariants(
  slots: ProgramDaySlots | null,
  budget: ArmBudget
): VariantKey[] {
  if (!slots) return [];
  return slots.armThrows.filter((v) => budget.defer.programVariants.includes(v));
}

/* ─────────────────────────── 프로그램 판정 신호(P6-2) ─────────────────────────── */

/** 프로그램 판정(decideToday)에 넘기는 중재 신호 — TodaySignals 의 선택 칸 일곱(모두 채워서) */
export type ProgramArbiterSignals = Required<
  Pick<
    TodaySignals,
    | 'armSpent'
    | 'armThrows'
    | 'heavyLowerYesterday'
    | 'hardToday'
    | 'choseRecovery'
    | 'outingSoon'
    | 'softOutingNear'
  >
>;

/**
 * 다음 등판이 가까운가 — 프로그램 판정의 두 신호(2판 P6 검토, 2026-10-13). 오늘 상태 한 장의 등판 창(outing.daysUntilNext — 답 · 어제 답 당김 ·
 * 달력 · 같은 요일 짐작이 다 실린다)만 읽는다.
 *   soon      창의 끝이 3일 안(HEAVY_LOWER_BLOCK_WITHIN_DAYS — 매일 일정의 안전 거르기 2-2 와 같은 창 · 같은 문턱, 짐작한 출처 포함).
 *             매일 일정은 이날 무거운 하체를 빼는데 프로그램은 안전 거르기를 partsOnly 로 건너뛰어(D6 '그대로') 스쿼트 · 데드리프트를 처방대로
 *             냈다 — 그날 일정은 '뺐어요'라 적고 실제 판에는 남았다. 프로그램은 빼지 않고 큰 하체를 가볍게 한다(예산 층과 같은 꼴).
 *   softNear  짐작한 다음 등판이 오늘이나 내일(날 종류 R4' softOutingNear — lib/engine/microcycle.ts 와 같은 조건). 매일 일정은 이날 무게 없는
 *             보조 날인데 프로그램은 판정이 짐작을 안 읽어 무거운 날을 냈다. P4 결정 '짐작은 가볍게 하는 쪽에만'을 그대로 옮겨 큰 하체 · 파워를
 *             가볍게 한다(쉬게 하지는 않는다 — 짐작으로 회복을 내지 않는다).
 * 확정 답의 오늘 · 내일 등판은 판정이 이미 쉰다(gameToday · gameTomorrow) — '그래도 오늘 할래요'로 넘긴 날에도 soon 이 큰 하체를 가볍게 한다
 * (매일 일정의 등판 창 거르기도 '그래도 하기'로 안 풀린다).
 */
export function outingNearOf(
  outing: Pick<DayState['outing'], 'daysUntilNext' | 'soft'>
): {
  soon: boolean;
  softNear: boolean;
} {
  const w = outing.daysUntilNext;
  const max = w?.max ?? null;
  return {
    soon: max != null && max <= HEAVY_LOWER_BLOCK_WITHIN_DAYS,
    softNear: outing.soft && max != null && max <= 1,
  };
}

/**
 * 프로그램 판정(lib/program/program.ts decideToday)에 넘길 신호 — 이 파일의 층이 정한 하루를 프로그램 카드도 같은 말로 하게(2판 P6-2).
 * 앱(lib/program/load.ts buildProgramDay) · 자체 시험 · 기준선 도구가 이 함수 하나를 부른다 — load.ts 는 server-only 라 시험이 신호 규칙을
 * 베껴 썼다(비판 1 빈틈 3). 판정을 안 보므로 판정 전에 부른다(arbitrate 는 판정 뒤 — 판정의 kind 를 받는다).
 *
 *   armSpent             팔 예산을 다 썼다(armBudget.spent — 등판 보호 층). 판정은 오늘 일차의 armThrows 를 뺀다(넘겨도)
 *   armThrows            팔로 던지는 변형 — ARM_THROW_VARIANTS 가운데 고정 운동이 팔 플라이오(isArmPlyo)인 것(모르면 넣는다).
 *                        programDeferVariants(programDaySlotsOf(…, exerciseOf), arm) 와 같은 답이다(자체 시험이 견준다)
 *   heavyLowerYesterday  어제 매일 일정이 하체 날이고 오늘(할 수 있는) 일차에 큰 하체가 있다(lowerBudget.programLighter — 예산 층)
 *   hardToday            오늘 세게 던진 날(오늘 상태 한 장 load.hardOuting 이 오늘) — 날 종류 R1 의 오늘 쪽, 쉬라는 날 층. 어제 쪽 · R2 · 오늘 등판은
 *                        판정이 이미 programSignalsOf(gameYesterday · gameToday)로 쉰다
 *   choseRecovery        오늘 체크인에서 '회복'을 골랐다(사용자 선택 층)
 *   (둘 다 오늘 프로그램 판이 있으면 거짓 — 그날은 프로그램 것이라 쉬게 하지 않는다, arbitrate 의 fromSession 과 같다)
 *   outingSoon           다음 등판 창의 끝이 3일 안(outingNearOf.soon — 2판 P6 검토). 판정은 큰 하체를 가볍게(넘겨도)
 *   softOutingNear       짐작한 다음 등판이 오늘 · 내일(outingNearOf.softNear). 판정은 큰 하체 · 파워를 가볍게
 *
 * state.commitments.program 이 없으면(장에 안 얹었으면) 하체 신호는 거짓이다 — 부르는 쪽이 withProgramCommitment 로 얹어 넘긴다.
 * exerciseOf 는 고정 운동을 읽기만 해야 한다(다시 고르며 저장할 것을 적는 함수를 넘기면 쓰지 않는 변형까지 적는다).
 */
export function programArbiterSignals({
  state,
  typesToday = [],
  lastLowerKey,
  session = null,
  exerciseOf,
}: {
  state: Pick<DayState, 'asOf' | 'outing' | 'load' | 'body' | 'commitments'>;
  /** 오늘 투구 기록의 세션 종류(programSignalsOf 와 같은 입력) */
  typesToday?: readonly string[];
  /** 매일 일정의 하체 마지막 날(gather.ts lastStrengthDates 의 lower) */
  lastLowerKey: string | null;
  /** 오늘 프로그램 판(열었거나 마침) — 있으면 그 판의 일차로 하체를 본다 */
  session?: ProgramSessionToday | null;
  exerciseOf?: (variant: VariantKey) => ClassifiableExercise | null | undefined;
}): {
  signals: ProgramArbiterSignals;
  arm: ArmBudget;
  lower: LowerBudget;
  /** 판정 없이 본 프로그램 칸(역할 'unknown' · 'session' · 'after') — 하체 예산의 재료 */
  program: ProgramCommitmentView | null;
} {
  const arm = armBudget({ state, typesToday });
  const program = programCommitment(state.commitments.program, { session, exerciseOf });
  const lower = lowerBudget({ asOf: state.asOf, lastLowerKey, program });
  const armThrows = ARM_THROW_VARIANTS.filter((v) => {
    const ex = exerciseOf?.(v);
    return ex ? isArmPlyo(ex) : true;
  });
  /*
   * 오늘 프로그램 판이 있으면(열었거나 마침) 쉬라는 날 · 사용자 선택 신호는 안 낸다 — arbitrate 가 그날을 프로그램 것으로 두고 쉬게 하지
   * 않는 것(fromSession)과 같은 규칙이다. 아침에 프로그램을 마치고 저녁에 세게 던진 불펜을 적은 날, 카드가 '쉬는 날이에요 · 그래도 할래요'를
   * 내면 이미 한 운동을 쉬라고 하는 셈이다.
   */
  const ownsToday = session != null;
  const near = outingNearOf(state.outing);
  return {
    signals: {
      armSpent: arm.spent,
      armThrows,
      heavyLowerYesterday: lower.programLighter,
      hardToday: !ownsToday && state.load.hardOuting?.daysAgo === 0,
      choseRecovery: !ownsToday && state.body.preferredWorkout === RECOVERY_WORKOUT,
      outingSoon: near.soon,
      softOutingNear: near.softNear,
    },
    arm,
    lower,
    program,
  };
}

/* ─────────────────────────── 시간 예산 ─────────────────────────── */

/**
 * 암케어 시간을 하루 운동 시간에 넣는가 — 넣지 않는다(2026-09-25 · 26 결정: 암케어는 운동 일정과 따로 언제든, training/page.tsx ·
 * theme.ts 주석). timeBudget 은 넣는 길도 셈할 수 있지만 기본은 끈다(비판 1 빈틈 9 · 열린 질문 2).
 */
export const TIME_BUDGET_COUNTS_ARMCARE = false;

/** 프로그램 날 'assist' 길의 보조 시간 — 이보다 짧으면 안 붙이고, 길어도 이만큼까지 */
export const ASSIST_MIN_MINUTES = 10;
export const ASSIST_MAX_MINUTES = 20;

export type TimeBudget = {
  /** 매일 일정에 쓸 시간(분, 5분 단위로 내림, 0 이상) */
  daily: number;
  /** 하루 운동 시간에서 뺀 것 */
  programMinutes: number;
  armcareMinutes: number;
  armcareCounted: boolean;
  /** 줄였을 때 한 줄 */
  note: string | null;
};

/** 0 이상 유한한 분만 — 그 밖은 0 */
const minutesOf = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;

/**
 * 시간 예산 — 프로그램(+ 넣기로 했으면 암케어) + 매일 일정 ≤ 하루 운동 시간.
 *
 * 프로그램 시간이 있으면('assist' 길) 남은 시간을 ASSIST_MIN ~ ASSIST_MAX 로 묶고, 그보다 짧으면 0(따로 짜지 않음). 프로그램이 없으면 남은
 * 시간 그대로. 5분 단위로 내린다(theme.ts effectiveMinutes 와 같은 까닭 — 사람이 시계를 보는 단위).
 */
export function timeBudget({
  requested,
  programMinutes = 0,
  armcareMinutes = 0,
  includeArmcare = TIME_BUDGET_COUNTS_ARMCARE,
}: {
  requested: number;
  programMinutes?: number | null;
  armcareMinutes?: number | null;
  includeArmcare?: boolean;
}): TimeBudget {
  const req = minutesOf(requested);
  const program = minutesOf(programMinutes);
  const armcare = includeArmcare ? minutesOf(armcareMinutes) : 0;
  const left = Math.max(0, Math.floor((req - program - armcare) / 5) * 5);
  const daily =
    program > 0
      ? left >= ASSIST_MIN_MINUTES
        ? Math.min(left, ASSIST_MAX_MINUTES)
        : 0
      : left;
  const note =
    daily >= req
      ? null
      : program > 0
        ? daily > 0
          ? `근력 프로그램이 ${program}분이라 남은 ${daily}분만 짰어요.`
          : `근력 프로그램이 ${program}분이라 따로 더 짜지 않았어요.`
        : armcare > 0
          ? `암케어 ${armcare}분을 빼고 ${daily}분으로 짰어요.`
          : null;
  return {
    daily,
    programMinutes: program,
    armcareMinutes: armcare,
    armcareCounted: includeArmcare,
    note,
  };
}

/* ─────────────────────────── 밀린 것 ─────────────────────────── */

/** 오늘 빠진 것의 종류 — 화면 · 시험이 가른다 */
export type DeferredKey =
  | 'programDay'
  | 'programVariant'
  | 'dailyArmPlyo'
  | 'mechanicsThrows'
  | 'armcareStrength'
  | 'dailyHeavyLower';

/**
 * 오늘 빠진 것 한 줄 — what 무엇이 · until 다시 할 수 있는 가장 이른 날(약속이 아니다, 머리 주석) · why 왜(그 층의 글).
 * 부르는 쪽이 실제로 뺀 것이 있을 때만 보인다(회복 날에는 팔 플라이오가 처음부터 후보에 없다).
 */
export type Deferred = {
  key: DeferredKey;
  /** programVariant 일 때만 — 어느 변형인가 */
  variant?: VariantKey;
  what: string;
  until: '내일';
  why: string;
  /** 그 층 */
  layer: ArbiterLayer;
};

/* ─────────────────────────── 묶기 ─────────────────────────── */

/** 프로그램을 오늘 쉬게 한 층의 글 — 쉬는 날(날 종류 규칙) · 사용자 선택 */
export const PROGRAM_YIELD_TEXT: Partial<Record<DayRule, string>> & {
  chooseRecovery: string;
  otherMode: string;
  programRest: string;
} = {
  hard: '최근에 많이 던져 오늘은 근력 프로그램을 쉬어요.',
  outingToday: '오늘 등판이라 근력 프로그램을 쉬어요.',
  moderateSpike: '어제 던졌고 운동도 힘들어 오늘은 근력 프로그램을 쉬어요.',
  chooseRecovery: '오늘 회복을 골라 근력 프로그램은 쉬어요.',
  otherMode: '오늘은 다른 운동을 먼저 시작해 근력 프로그램은 쉬어요.',
  programRest: '오늘은 근력 프로그램이 쉬는 날이에요.',
};

/**
 * 사용자가 '그래도 하기'로 넘긴 것 — 한 줄. lower 는 매일 일정의 하체 예산 넘김 글(lib/report/theme.ts LOWER_BUDGET_OVERRIDE_NOTE)과
 * 같은 글이다(2판 P6 검토) — 막은 까닭이 어제 · 오늘 · 내일 프로그램이든 어제 하체 날이든 같은 말이라 '어제 하체를 무겁게 했지만'으로 단정하지
 * 않는다. theme.ts 를 부르면 순환이라 글자를 둘이 같이 두고 자체 시험이 같은지 본다.
 */
export const OVERRIDE_TEXT = {
  rest: '쉬는 게 좋은 날이지만 고른 대로 해요. 아프면 바로 멈춰요.',
  lower: '무거운 하체를 쉬는 날이지만 고른 대로 해요. 아프면 바로 멈춰요.',
} as const;

/**
 * 오늘 프로그램 날 — 매일 일정 자리의 한 줄(D6). label 은 그날 일차 이름(program.ts dayLabel '2주차 · 1일차 · 밀기') — 바로 위 프로그램
 * 카드 · 트레이닝 홈 카드가 같은 이름을 보인다(2판 P6 검토: 처음부터 센 일차 '4일차'를 쓰면 카드의 '2주차 · 1일차'와 어긋났다).
 * '날이라'로 이어 받침을 가리지 않는다. 이름을 모르면 번호 없이.
 */
export const programDayText = (label?: string | null) =>
  label
    ? `오늘은 근력 프로그램 ${label} 날이라 그 운동을 그대로 해요.`
    : '오늘은 근력 프로그램 날이라 그 운동을 그대로 해요.';

/**
 * 하체가 막힌 날 상체로 갈 수 없는 까닭(비판 1 빈틈 28 — 하체 대신 상체로 가면 상체 무게가 새로 생긴다. 팔을 아껴야 하는 날은 보조로).
 *   armSpent   팔 예산을 다 썼다
 *   armFatigue 팔 피로 '많이' 이상(HIGH_ARM_FATIGUE — 암케어가 회복으로 가는 문턱과 같다)
 *   upperPain  오늘 어깨 · 팔꿈치 · 손목이 '통증'
 *   upperStiff 오늘 어깨 · 팔꿈치 · 손목이 '뻐근'
 *   upperRehab 어깨 · 팔꿈치 재활 1~3단계
 */
export type UpperBlock =
  'armSpent' | 'armFatigue' | 'upperPain' | 'upperStiff' | 'upperRehab';

const UPPER_PARTS: readonly string[] = ['shoulder', 'elbow', 'wrist'];

/** 매일 일정의 몫 */
export type DailyDirective = {
  /**
   * off      안전 층이 멈췄다 — 만들지 않는다
   * program  프로그램 날 — 매일 일정 = 프로그램 운동 그대로(D6 'none')
   * assist   프로그램 날 'assist' 길 — 남은 시간(minutes)에 보조 · 코어만
   * free     지금처럼 만든다(아래 칸을 지켜서)
   */
  role: 'off' | 'program' | 'assist' | 'free';
  /** 무거운 하체를 넣어도 되는가(하체 예산 · '그래도 하기'로 넘겼으면 참) */
  heavyLower: boolean;
  /** 하체가 막힌 날 상체 날로 바꿔도 되는가 — 아니면 보조 · 코어 */
  upperOk: boolean;
  upperBlockedBy: UpperBlock | null;
  /** 팔 플라이오를 넣어도 되는가(팔 예산 — '그래도 하기'로도 안 풀린다) */
  armPlyo: boolean;
  /** 쓸 시간(분) — minutes 를 넘겼을 때만, 아니면 null */
  minutes: number | null;
  /** '그래도 하기'로 예산(하체)을 넘겼다 */
  overrodeBudget: boolean;
};

/**
 * 오늘 매일 일정 자리를 근력 프로그램이 갖는가(D6, 2판 P6-4) — 중재의 매일 일정 몫이 'program'(지금 길) 또는 'assist'(PROGRAM_DAY_DAILY 를
 * 바꿀 때의 길). 멈춘 날('off')은 아니다. 일정 만들기(lib/program/load.ts programTodayOf)와 화면(트레이닝 · 트레이닝 홈 —
 * lib/report/training-screen.ts)이 이 한 판정을 같이 써야, 일정이 프로그램 날로 짜인 날에 화면도 프로그램 카드를 주인으로 둔다.
 * 프로그램이 없으면(중재 결과가 없음) 거짓.
 */
export function programOwnsDaily(
  daily: Pick<DailyDirective, 'role'> | null | undefined
): boolean {
  return daily?.role === 'program' || daily?.role === 'assist';
}

export type Arbitration = {
  /** 걸린 층(ARBITER_LAYERS 차례) */
  applied: ArbiterLayer[];
  /** 맨 위 층 — 걸린 것이 없으면 null */
  top: ArbiterLayer | null;
  /** 프로그램 — 중재 뒤 역할(쉬게 했으면 none, yielded 에 그 층), 프로그램이 없으면 null */
  program: (ProgramCommitmentView & { yielded: ArbiterLayer | null }) | null;
  daily: DailyDirective;
  /** 프로그램 판정에 넣을 것 — 오늘 뺄 변형(팔 예산) · 큰 하체 가볍게(하체 예산) */
  programAdjust: { deferVariants: VariantKey[]; lighterBigLower: boolean };
  /**
   * 메커니즘 — 던지기 드릴을 접는가. 팔 예산(등판 보호)이면 anyway 거짓(못 펼침), 통증 확인 전(안전 층 — 2판 P6 검토)이면 anyway 거짓, 오늘 어깨 ·
   * 팔꿈치 '통증'이면(D5) anyway 참(그래도 하기 — 성장기는 거짓). 위가 이긴다.
   */
  mechanics: {
    foldThrows: boolean;
    anyway: boolean;
    because: 'armSpent' | 'painUnknown' | 'pain' | null;
  };
  /** 암케어 — 강화 루틴을 해도 되는가(팔 예산을 다 쓴 날 거짓 — decideArmcare 가 이미 회복으로 간다) */
  armcare: { strength: boolean };
  arm: ArmBudget;
  lower: LowerBudget;
  time: TimeBudget | null;
  deferred: Deferred[];
  /** 걸린 층마다 한 줄(해요체 · 줄표 없음 · 60자 안), 층 차례 */
  why: string[];
};

export type ArbiterInput = {
  /** 오늘 상태 한 장(lib/engine/day-state.ts) — 진행 중인 프로그램은 withProgramCommitment 로 얹어 넘긴다 */
  state: Pick<
    DayState,
    'asOf' | 'hard' | 'outing' | 'arm' | 'body' | 'load' | 'commitments'
  >;
  /** 날 종류(lib/engine/microcycle.ts dayKindOf(facts)) — 쉬라는 날(rest 층)을 읽는다 */
  dayKind: Pick<DayKind, 'rule' | 'rank'>;
  /** 프로그램 판정(decideToday 의 kind) · 오늘 판 · 고정 운동 — programCommitment 그대로 */
  programDecision?: TodayDecision['kind'] | null;
  programSession?: ProgramSessionToday | null;
  exerciseOf?: (variant: VariantKey) => ClassifiableExercise | null | undefined;
  /** 매일 일정의 하체 마지막 날(daily-plan.ts strengthDatesFrom 의 lower) */
  lastLowerKey: string | null;
  /** 오늘 투구 기록의 세션 종류 */
  typesToday?: readonly string[];
  /** '그래도 하기'(매일 일정 forcing · 프로그램 D24) */
  override?: boolean;
  /** 하루 운동 시간 · 프로그램 예상 시간 · 암케어 시간(분) — 주면 시간 예산을 셈한다 */
  minutes?: { requested: number; program?: number | null; armcare?: number | null };
  /** 프로그램 날의 매일 일정(기본 PROGRAM_DAY_DAILY) — 시험 · 결정이 바뀔 때만 넘긴다 */
  programDayDaily?: ProgramDayDaily;
  /** 만 나이(모르면 null — 성인으로 본다) — 성장기의 메커니즘 통증 날은 못 펼친다(mechanics.anyway, 2판 P6 검토) */
  age?: number | null;
};

/** 체크인의 운동 종류 '회복' — lib/checkin.ts WORKOUT_KINDS 의 값(theme.ts 가 회복 데이로 읽는 그 값) */
const RECOVERY_WORKOUT: WorkoutKind = '회복';

/**
 * 오늘을 층 차례로 정한다(머리 주석). 같은 입력이면 늘 같은 값이고, 입력을 바꾸지 않고, 돌려주는 목록은 모두 새 배열이다.
 */
export function arbitrate(input: ArbiterInput): Arbitration {
  const {
    state,
    dayKind,
    programDecision = null,
    programSession = null,
    exerciseOf,
    lastLowerKey,
    typesToday = [],
    override = false,
    minutes,
    programDayDaily = PROGRAM_DAY_DAILY,
    age = null,
  } = input;
  const applied = new Set<ArbiterLayer>();
  const deferred: Deferred[] = [];
  const whyBy = new Map<ArbiterLayer, string[]>();
  const say = (layer: ArbiterLayer, line: string | null) => {
    if (!line) return;
    applied.add(layer);
    const lines = whyBy.get(layer) ?? [];
    if (!lines.includes(line)) lines.push(line);
    whyBy.set(layer, lines);
  };
  const defer = (d: Omit<Deferred, 'until'>) => {
    applied.add(d.layer);
    deferred.push({ ...d, until: '내일' });
  };

  const raw = programCommitment(state.commitments.program, {
    decision: programDecision,
    session: programSession,
    exerciseOf,
  });
  const arm = armBudget({ state, typesToday });

  /* 1 안전 층 — 통증 확인 전이면 매일 일정 · 프로그램이 멈춘다. 중재는 더하지 않는다(프로그램은 painWait) */
  const halted = state.hard.painUnknown || programDecision === 'painWait';
  if (halted) applied.add('safety');

  /*
   * 3 사용자 선택 · 4 쉬라는 날 — 프로그램 역할을 안전 → 사용자 선택 → 쉬라는 날 차례로 쉬게 한다. 오늘 판이 있으면(열었거나 마침) 그날은
   * 프로그램 것이라 되돌리지 않는다(이미 한 운동을 '쉬어요'라고 할 수 없다).
   */
  let program: Arbitration['program'] = raw ? { ...raw, yielded: null } : null;
  const yieldProgram = (layer: ArbiterLayer, line: string | null) => {
    if (!program) return;
    say(layer, line);
    if (program.role === 'owns' && program.today) {
      defer({
        key: 'programDay',
        /* 일차 이름(dayLabel) — 카드가 보이는 '2주차 · 1일차'와 같은 말(programDayText 와 같은 까닭) */
        what: `근력 프로그램 ${program.today.label}`,
        why: line ?? PROGRAM_YIELD_TEXT.programRest,
        layer,
      });
    }
    /* 오늘 하는 날이 아니게 되면 다음 일차는 오늘 일차 — 내일 할 수 있는 날이 된다 */
    const next = program.role === 'owns' ? program.today : program.next;
    program = {
      ...program,
      role: 'none',
      yielded: layer,
      today: null,
      next,
      tomorrowPossible: program.following && next != null,
    };
  };
  if (program) {
    const fromSession = program.roleWhy === 'session';
    if (halted && !fromSession) {
      /* 멈춘 날은 밀린 것도 적지 않는다 — 프로그램은 스스로 기다린다(painWait), 중재가 더할 말이 없다 */
      if (program.role === 'owns') {
        program = {
          ...program,
          role: 'none',
          today: null,
          next: program.today,
          tomorrowPossible: program.following && program.today != null,
        };
      }
      program = { ...program, yielded: 'safety' };
    } else if (!fromSession && program.role === 'owns') {
      const choseRecovery = state.body.preferredWorkout === RECOVERY_WORKOUT;
      if (choseRecovery && !override) {
        yieldProgram('choice', PROGRAM_YIELD_TEXT.chooseRecovery);
      } else if (dayKind.rank === 'recovery') {
        if (override) say('choice', OVERRIDE_TEXT.rest);
        else yieldProgram('rest', PROGRAM_YIELD_TEXT[dayKind.rule] ?? null);
      }
    } else if (program.roleWhy === 'otherMode') {
      say('choice', PROGRAM_YIELD_TEXT.otherMode);
      program = { ...program, yielded: 'choice' };
    } else if (program.roleWhy === 'rest') {
      say('rest', PROGRAM_YIELD_TEXT.programRest);
      program = { ...program, yielded: 'rest' };
    }
  }
  const owns = program?.role === 'owns';

  /* 2 등판 보호(팔) — 오늘 무엇을 하든 팔로 던지는 것은 뺀다 */
  const deferVariants = owns ? programDeferVariants(program!.today, arm) : [];
  if (arm.spent) {
    if (owns) {
      for (const v of deferVariants) {
        defer({
          key: 'programVariant',
          variant: v,
          what: `근력 프로그램 ${VARIANT_LABELS[v]}`,
          why: arm.text!,
          layer: 'outing',
        });
      }
    } else if (!halted) {
      defer({
        key: 'dailyArmPlyo',
        what: '팔로 던지는 파워 운동',
        why: arm.text!,
        layer: 'outing',
      });
    }
    if (state.commitments.mechanics && !state.commitments.mechanics.finishedToday) {
      defer({
        key: 'mechanicsThrows',
        what: '메커니즘 던지기 드릴',
        why: arm.text!,
        layer: 'outing',
      });
    }
    defer({
      key: 'armcareStrength',
      what: '암케어 강화 루틴',
      why: arm.text!,
      layer: 'outing',
    });
    say('outing', arm.text);
  }

  /* 5 프로그램 — 오늘 하는 날이면 매일 일정은 프로그램 그대로(D6) */
  if (owns)
    say('program', programDayText(program!.today?.label ?? program!.next?.label));

  /* 6 예산 — 하체(48시간) · 시간. '그래도 하기'는 예산을 넘는다(사용자 선택 > 예산), 경고 한 줄 */
  const lower = lowerBudget({ asOf: state.asOf, lastLowerKey, program });
  const dailyFree = !halted && !owns;
  let overrodeBudget = false;
  let heavyLower = lower.dailyHeavyLower;
  if (!lower.dailyHeavyLower && dailyFree) {
    if (override) {
      heavyLower = true;
      overrodeBudget = true;
      say('choice', OVERRIDE_TEXT.lower);
    } else {
      say('budget', lower.text);
      defer({
        key: 'dailyHeavyLower',
        what: '무거운 하체',
        why: lower.text!,
        layer: 'budget',
      });
    }
  }
  const lighterBigLower = owns && lower.programLighter && !override;
  if (lighterBigLower) say('budget', lower.programText);

  const assist = owns && programDayDaily === 'assist';
  const time = minutes
    ? timeBudget({
        requested: minutes.requested,
        programMinutes: assist ? minutes.program : 0,
        armcareMinutes: minutes.armcare,
      })
    : null;
  if (time?.note && (dailyFree || assist)) say('budget', time.note);

  /* 하체가 막힌 날 상체로 가도 되는가 — 위 층이 상체를 막지 않았을 때만(비판 1 빈틈 28) */
  const upperBlockedBy: UpperBlock | null = arm.spent
    ? 'armSpent'
    : state.arm.fatigueHigh
      ? 'armFatigue'
      : state.hard.painParts.some((p) => UPPER_PARTS.includes(p))
        ? 'upperPain'
        : state.body.stiffParts.some((p) => UPPER_PARTS.includes(p))
          ? 'upperStiff'
          : state.hard.rehabParts.some((p) => p === 'shoulder' || p === 'elbow')
            ? 'upperRehab'
            : null;

  const daily: DailyDirective = {
    role: halted
      ? 'off'
      : owns
        ? assist && (time?.daily ?? 0) > 0
          ? 'assist'
          : 'program'
        : 'free',
    heavyLower: dailyFree ? heavyLower : false,
    upperOk: upperBlockedBy == null,
    upperBlockedBy,
    armPlyo: !arm.defer.dailyArmPlyo,
    /* 멈춘 날 · 프로그램 날('none' 길)은 매일 일정에 쓸 시간이 없다 */
    minutes: time ? (halted || (owns && !assist) ? 0 : time.daily) : null,
    overrodeBudget,
  };

  /*
   * 메커니즘 — 팔 예산(못 펼침) > 통증 확인 전(못 펼침 — 안전 층이 위라는 규칙을 메커니즘에도, 2판 P6 검토) > D5 통증(성인은 그래도 하기, 성장기는
   * 못 펼침). 메커니즘 화면은 lib/mechanics/fold.ts mechanicsFoldOf 가 같은 차례 · 같은 규칙으로 정한다(자체 시험이 같은 답인지 본다).
   */
  const pain = state.arm.painJoints.length > 0;
  const youth = age != null && age < ARM_PAIN_ROUTINE_MIN_AGE;
  const mechanics: Arbitration['mechanics'] = arm.spent
    ? { foldThrows: true, anyway: false, because: 'armSpent' }
    : halted
      ? { foldThrows: true, anyway: false, because: 'painUnknown' }
      : pain
        ? { foldThrows: true, anyway: !youth, because: 'pain' }
        : { foldThrows: false, anyway: true, because: null };

  const order = ARBITER_LAYERS.filter((l) => applied.has(l));
  return {
    applied: order,
    top: order[0] ?? null,
    program,
    daily,
    programAdjust: { deferVariants, lighterBigLower },
    mechanics,
    armcare: { strength: !arm.defer.armcareStrength },
    arm,
    lower,
    time,
    deferred: [...deferred].sort(
      (a, b) => ARBITER_LAYERS.indexOf(a.layer) - ARBITER_LAYERS.indexOf(b.layer)
    ),
    why: order.flatMap((l) => [...(whyBy.get(l) ?? [])]),
  };
}
