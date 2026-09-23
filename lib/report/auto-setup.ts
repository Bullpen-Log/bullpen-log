import type { CheckinLike, ReportFacts } from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';
import { CHECKIN_PARTS, type CheckinPartKey } from '@/lib/checkin';
import { ACWR_ZONES } from '@/lib/pitch-stats';
import { withJosa } from '@/lib/korean';
import {
  TRAINING_GOALS,
  TRAINING_GOAL_NAMES,
  focusesFor,
  type GoalFocusKey,
} from '@/lib/report/personalize';
import {
  PREVENTION_GOAL,
  decideTheme,
  effectiveMinutes,
  minutesChoicesFor,
  nearestMinutesChoice,
  workoutConflict,
  type SessionTheme,
} from '@/lib/report/theme';
import type { TrainingLoad } from '@/lib/training-load';

/**
 * AI 맞춤 — 목표·시간·부위를 앱이 정하는 일정 만들기.
 *
 * 사용자는 장비만 고른다. 나머지는 두 겹으로 정한다(2026-09-23 사용자분과 정함).
 *
 *   규칙   몸을 지키는 것 — 통증, 회복날·보조날, 운동 부하, 수면, 체크인에서
 *          고른 운동. 여기서 정한 것은 AI가 바꾸지 못한다.
 *   AI     그 울타리 안에서 목표·시간·부위를 고르고, 메모에서 조심할 부위를
 *          찾고, 왜 그렇게 정했는지 사람 말로 설명한다 (lib/ai/auto-setup.ts).
 *
 * 운동 종목은 둘 다 고르지 않는다. 방향이 정해지면 지금까지처럼 엔진이 안전
 * 필터를 거쳐 고른다(lib/report/daily-plan.ts). AI가 종목을 고르면 없는 운동을
 * 지어내거나 안전 필터를 건너뛸 길이 생긴다.
 *
 * 이 파일은 규칙 쪽이다. DB도 AI도 부르지 않아 자가 시험으로 그대로 밟아 볼 수
 * 있다. 여기서 만드는 '규칙 초안'은 AI가 없거나 실패한 날 그대로 쓰는 답이기도
 * 하다 — 그래서 AI가 없어도 일정은 늘 나온다.
 */

export const BALANCED_GOAL = TRAINING_GOALS[0].name;
const POWER_GOAL = '파워 향상';
const STRENGTH_GOAL = '근력 향상';

/*
 * 목표 이름이 목록과 어긋나면 규칙이 조용히 아무 일도 안 한다. 여기서 막는다.
 * (TRAINING_GOALS 의 이름을 바꾸면 이 파일도 같이 봐야 한다는 뜻이다.)
 */
for (const name of [BALANCED_GOAL, POWER_GOAL, STRENGTH_GOAL, PREVENTION_GOAL]) {
  if (!TRAINING_GOAL_NAMES.includes(name)) {
    throw new Error(`훈련 목표 목록에 없는 이름: ${name}`);
  }
}

/**
 * 수면 부족이 '이어진다'고 보는 기준 — 오늘 잠이 부족하고, 오늘을 넣어 최근
 * 7일 중 이만큼.
 *
 * 하루 이틀 못 잔 것은 흔한 일이라 그것만으로 목표를 바꾸지 않는다. 한 주의
 * 절반 가까이 못 잔 채로 오늘도 못 잤다면, 무게를 올릴 날이 아니다.
 */
export const SLEEP_DEBT_DAYS = 3;

/**
 * 암케어 공백을 따질 만큼 운동해 온 사람인가 — 최근 7일에 운동한 날.
 *
 * 기록이 없는 사람은 암케어도 당연히 0세트다. 그걸 '암케어를 건너뛰었다'로
 * 읽으면 처음 쓰는 사람은 전부 부상 방지로 시작한다. 운동은 했는데 암케어만
 * 안 한 사람에게만 건다.
 */
export const ARMCARE_GAP_MIN_DAYS = 2;

/** 하루에 AI를 부르는 상한. 체크인을 고칠 때마다 다시 묻지만 끝없이는 아니다. */
export const AI_CALLS_PER_DAY = 5;

/** 메모에서 찾은, 오늘 조심할 부위. 그 부위의 무거운 운동을 뺀다. */
export type AutoCaution = { part: CheckinPartKey; why: string };

/** 오늘 운동의 방향 — 규칙 초안이든 AI가 고른 것이든 모양이 같다. */
export type AutoDecision = {
  goal: string;
  minutes: number;
  /** 좁힌 부위. null 이면 지금처럼 앱이 상체·하체를 번갈아 정한다 */
  focus: GoalFocusKey | null;
  caution: AutoCaution[];
  /** 메모에 통증으로 보이는 말이 있는가 — 체크인을 고쳐 달라고 안내한다 */
  painSuspected: boolean;
  /** 왜 이렇게 정했는지. 화면에 그대로 나간다 */
  reason: string;
};

/**
 * 규칙이 친 울타리. AI는 이 안에서만 고른다.
 *
 * 목표·시간·부위를 '고를 수 있는 값의 목록'으로 둔다. 목록 밖의 답은 받지
 * 않으므로(lib/ai/auto-setup-prompt.ts 의 acceptAnswer), AI가 무엇을 쓰든 여기
 * 적힌 선을 넘을 수 없다.
 */
export type AutoFence = {
  /** 오늘 몸 상태로 정해진 날. 회복·보조날이면 목표가 거의 안 걸린다 */
  day: SessionTheme;
  /** 근력 날(상체·하체)인가. 아니면 부위를 고르지 않는다 */
  strengthDay: boolean;
  /** 규칙이 정해 AI가 바꿀 수 없는 목표. 없으면 null */
  fixedGoal: string | null;
  /** 고를 수 있는 목표 — fixedGoal 이 있으면 그것 하나 */
  goals: string[];
  /** 목표별로 고를 수 있는 시간(분). 기본 시간을 넘지 않는다 */
  minutes: Record<string, number[]>;
  /** 목표별로 고를 수 있는 부위. 비어 있으면 앱이 번갈아 정한다 */
  focuses: Record<string, GoalFocusKey[]>;
  /** 규칙이 정한 것과 그 까닭 — 화면의 '왜 이 운동인가요?'와 AI에게 */
  rules: string[];
  /** 체크인에서 고른 운동이 몸 상태와 부딪혔는가 — 이유에 꼭 들어가야 한다 */
  clash: { kind: string; reason: string } | null;
  /** 규칙 초안 — AI가 없거나 실패하면 이대로 만든다 */
  draft: AutoDecision;
};

/**
 * 일정에 함께 저장하는 AI 맞춤 기록 (DailyPlan.auto).
 *
 * 무엇으로 정했는지까지 남긴다. 화면이 "AI가 정했다"와 "AI를 못 불러 규칙대로
 * 했다"를 구별해 말해야 하고, AI 비용도 여기서 따라간다.
 */
export type AutoRecord = AutoDecision & {
  /** 누가 정했나 — AI, 또는 AI를 못 써서 규칙 초안 */
  by: 'ai' | 'rules';
  /** 규칙이 정한 것 (AI가 바꿀 수 없던 것) */
  rules: string[];
  /** by 가 'rules' 인 까닭. 사람에게 보여줄 한 줄 */
  fallback?: string;
  /** 그 까닭의 속사정 — 화면에는 안 내고, 무엇이 막혔는지 나중에 보려고 남긴다 */
  fallbackDetail?: string;
  /** 이 판단을 내릴 때의 체크인 — 체크인을 고치면 AI에게 다시 묻는다 */
  checkin: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** AI가 답하는 데 걸린 시간(밀리초) */
  ms?: number;
};

/** 운동 부하 중 여기서 보는 것만 */
export type WorkoutSignals = Pick<
  TrainingLoad,
  | 'zone'
  | 'ratio'
  | 'recentDays'
  | 'recentMinutes'
  | 'volume'
  | 'historyDays'
  | 'daysNeeded'
>;

/**
 * 뻐근하거나 조심할 부위가 있을 때 고르지 않는 '오늘 할 부위'.
 *
 * 하체가 뻐근한 날 하체 데이로 좁히면, 안전 필터가 무거운 하체 운동을 빼고 남은
 * 가벼운 것으로 하체 데이를 채운다. 이름만 하체 데이인 날이 된다.
 *
 * 허리는 양쪽에 걸린다 — 힌지(하체)와 로우(당기기)가 모두 허리를 쓴다
 * (lib/report/prescription.ts 의 RELATED_PARTS 와 같은 판단).
 */
const BLOCKED_FOCUSES: Record<CheckinPartKey, GoalFocusKey[]> = {
  shoulder: ['upper', 'upperPush', 'upperPull'],
  elbow: ['upper', 'upperPush', 'upperPull'],
  wrist: ['upper', 'upperPush', 'upperPull'],
  lowerBack: ['lower', 'upperPull'],
  lowerBody: ['lower'],
};

export function blockedFocuses(parts: CheckinPartKey[]): Set<GoalFocusKey> {
  return new Set(parts.flatMap((p) => BLOCKED_FOCUSES[p]));
}

/** 오늘 체크인에서 '뻐근'한 부위. 통증인 날은 여기까지 오지 않는다. */
function soreParts(today: CheckinLike | null): CheckinPartKey[] {
  if (!today) return [];
  return CHECKIN_PARTS.filter((p) => today[p.key] === '뻐근').map((p) => p.key);
}

/**
 * 오늘 체크인을 한 줄 도장으로 — 이 값이 같으면 AI에게 다시 묻지 않는다.
 *
 * '다시 만들기'는 대개 운동 목록이 마음에 안 들어서 누른다. 방향(목표·시간)은
 * 그대로 두고 종목만 새로 뽑으면 되는데, 그때마다 AI를 부르면 비용만 든다.
 * 체크인을 고쳤다면 몸 상태가 달라진 것이니 다시 묻는다.
 */
export function checkinStamp(today: CheckinLike): string {
  return JSON.stringify([
    ...CHECKIN_PARTS.map((p) => today[p.key]),
    today.condition,
    today.sleep,
    today.preferredParts,
    today.preferredWorkout ?? null,
  ]);
}

/** 시간 선택지에서 한 단계 아래. 맨 아래면 그대로 */
function oneStepDown(goal: string, minutes: number): number {
  const choices = minutesChoicesFor(goal);
  const i = choices.indexOf(minutes);
  return choices[Math.max(0, i - 1)];
}

export function decideAutoFence({
  facts,
  plan,
  workout,
  defaultMinutes,
  lastLowerKey,
  lastUpperKey,
}: {
  facts: ReportFacts;
  plan: PitchPlan;
  workout: WorkoutSignals;
  /** 저장해 둔 기본 시간(분). 없으면 60분 */
  defaultMinutes: number;
  lastLowerKey: string | null;
  lastUpperKey: string | null;
}): AutoFence {
  const today = facts.condition.today;
  const preferred = today?.preferredWorkout ?? null;
  const rules: string[] = [];

  /*
   * 오늘이 어떤 날인지는 지금 엔진이 정한다 — 통증·등판 여파·투구 부하·컨디션.
   *
   * 몸 상태 경고를 넘기는 것(override)은 AI 맞춤에 없다. 체크인에서 고른 운동이
   * 몸 상태와 부딪히면 AI 맞춤은 몸 상태 쪽으로 가고 이유를 말한다(사용자분과
   * 정함). 그래도 하고 싶으면 '직접 고르기'에서 할 수 있다.
   */
  const day = decideTheme({
    facts,
    plan,
    lastLowerKey,
    lastUpperKey,
    preferredWorkout: preferred,
    override: false,
    focus: null,
  });
  const strengthDay = day.key === 'lower' || day.key === 'upper';

  /*
   * 통증 회복 중에는 부딪힘을 따지지 않는다. 그날은 무엇을 골랐든 회복이고,
   * 까닭도 통증이지 투구량이 아니다 (lib/report/today-data.ts 와 같은 판단).
   */
  const conflict = plan.recovering
    ? null
    : workoutConflict({ facts, preferredWorkout: preferred });
  const clash =
    conflict && preferred ? { kind: preferred, reason: conflict.reason } : null;

  const loadHigh = workout.zone === 'caution' || workout.zone === 'danger';
  const sleepDebt =
    today?.sleep === '부족' && facts.condition.poorSleepDays >= SLEEP_DEBT_DAYS;

  let fixedGoal: string | null = null;
  let shorten = false;

  if (!strengthDay) {
    /*
     * 회복날·보조날은 목표가 구성을 거의 못 바꾼다(compositionFor 가 웨이트
     * 날에만 목표 모양을 쓴다). 그런 날 "목표: 근력 향상"이라고 적혀 있으면
     * 회복날 목록과 어긋나 보인다. 몸을 아끼는 날이라 부상 방지로 둔다.
     */
    fixedGoal = PREVENTION_GOAL;
    rules.push(`오늘은 ${day.label} → 목표는 ${PREVENTION_GOAL}`);
  }
  if (clash) {
    rules.push(
      `체크인에서 ${clash.kind} 운동을 고르셨지만 ${clash.reason} → 몸 상태에 맞춰 가볍게`
    );
  }

  if (loadHigh || sleepDebt) {
    fixedGoal = PREVENTION_GOAL;
    /* 회복날은 이미 시간을 줄인다(effectiveMinutes). 두 번 줄이지 않는다. */
    shorten = day.key !== 'recovery';
    const tail = shorten ? `${PREVENTION_GOAL}, 시간 한 단계 줄임` : PREVENTION_GOAL;
    if (loadHigh && workout.zone) {
      const zone = ACWR_ZONES[workout.zone];
      const ratio = workout.ratio != null ? ` ${workout.ratio.toFixed(2)}` : '';
      rules.push(`운동 부하 지수${ratio}(${zone.label}) → ${tail}`);
    }
    if (sleepDebt) {
      rules.push(
        `최근 7일 중 잠이 부족한 날 ${facts.condition.poorSleepDays}일(오늘 포함) → ${tail}`
      );
    }
  } else if (strengthDay && (preferred === '파워' || preferred === '웨이트')) {
    /*
     * 몸 상태와 안 부딪히고 고른 것은 그대로 간다. 고른 사람의 뜻이고,
     * 부딪혔다면 위에서 이미 회복·보조날이 됐다.
     */
    fixedGoal = preferred === '파워' ? POWER_GOAL : STRENGTH_GOAL;
    rules.push(`체크인에서 ${preferred} 운동을 고르셔서 → ${fixedGoal}`);
  }

  const goals = fixedGoal ? [fixedGoal] : [...TRAINING_GOAL_NAMES];

  /*
   * 시간은 기본 시간을 넘지 않는다 — 줄이는 것만 고를 수 있다.
   *
   * 기본 시간은 그 사람이 운동에 쓸 수 있는 시간이다. 앱이 몸 상태를 보고
   * 120분을 권해도 그 사람에게 60분밖에 없으면 소용이 없다.
   */
  const minutes: Record<string, number[]> = {};
  for (const goal of goals) {
    const base = nearestMinutesChoice(defaultMinutes, goal);
    const cap = shorten ? oneStepDown(goal, base) : base;
    minutes[goal] = minutesChoicesFor(goal).filter((m) => m <= cap);
  }

  /* 부위는 근력 날에만, 뻐근한 곳으로 좁히지 않게 */
  const blocked = blockedFocuses(soreParts(today));
  const focuses: Record<string, GoalFocusKey[]> = {};
  for (const goal of goals) {
    focuses[goal] = strengthDay
      ? focusesFor(goal)
          .map((f) => f.key)
          .filter((key) => !blocked.has(key))
      : [];
  }

  /* 규칙 초안 */
  const armcareGap =
    workout.recentDays >= ARMCARE_GAP_MIN_DAYS && workout.volume.armCare.sets === 0;
  const draftGoal = fixedGoal ?? (armcareGap ? PREVENTION_GOAL : BALANCED_GOAL);
  const draftMinutes = Math.max(...minutes[draftGoal]);

  return {
    day,
    strengthDay,
    fixedGoal,
    goals,
    minutes,
    focuses,
    rules,
    clash,
    draft: {
      goal: draftGoal,
      minutes: draftMinutes,
      focus: null,
      caution: [],
      painSuspected: false,
      reason: draftReason({
        goal: draftGoal,
        minutes: draftMinutes,
        strengthDay,
        clash,
        loadHigh,
        sleepDebt,
        shorten,
        preferred,
        armcareGap,
        hasHistory: workout.recentDays > 0,
        /* 회복날은 고른 시간보다 짧게 한다 — 이유에는 실제로 할 시간을 적는다 */
        actualMinutes: effectiveMinutes(day.key, draftMinutes),
      }),
    },
  };
}

/**
 * 규칙 초안의 이유 — AI가 없거나 실패한 날 화면에 이 문장이 나간다.
 *
 * 왜 이 목표·시간인지만 말한다. 왜 회복날인지는 바로 위에 적힌 테마 이유
 * (decideTheme 의 reason)가 이미 말하므로 되풀이하지 않는다.
 */
function draftReason({
  goal,
  minutes,
  strengthDay,
  clash,
  loadHigh,
  sleepDebt,
  shorten,
  preferred,
  armcareGap,
  hasHistory,
  actualMinutes,
}: {
  goal: string;
  minutes: number;
  strengthDay: boolean;
  clash: { kind: string; reason: string } | null;
  loadHigh: boolean;
  sleepDebt: boolean;
  shorten: boolean;
  preferred: string | null;
  armcareGap: boolean;
  hasHistory: boolean;
  actualMinutes: number;
}): string {
  const time =
    actualMinutes < minutes
      ? `회복날이라 시간은 ${actualMinutes}분으로 줄였습니다.`
      : shorten
        ? `시간은 ${minutes}분으로 줄였습니다.`
        : `시간은 ${minutes}분입니다.`;
  if (clash) {
    return `${clash.kind} 운동을 하고 싶다고 하셨는데, ${clash.reason}. 그래서 오늘은 몸 상태에 맞춰 가볍게 만들었습니다. ${time}`;
  }
  if (loadHigh && sleepDebt) {
    return `최근 운동 부하가 높고 잠도 부족한 날이 이어져, 목표는 ${withJosa(goal, '으로/로')} 두었습니다. ${time}`;
  }
  if (loadHigh) {
    return `최근 운동 부하가 평소보다 높아, 목표는 ${withJosa(goal, '으로/로')} 두었습니다. ${time}`;
  }
  if (sleepDebt) {
    return `잠이 부족한 날이 이어져, 오늘은 무게를 올리기보다 ${goal}에 씁니다. ${time}`;
  }
  if (!strengthDay) {
    return `몸을 아끼는 날이라 목표는 ${withJosa(goal, '으로/로')} 두었습니다. ${time}`;
  }
  if (preferred === '파워' || preferred === '웨이트') {
    return `체크인에서 ${preferred} 운동을 고르셔서 목표를 ${withJosa(goal, '으로/로')} 잡았습니다. ${time}`;
  }
  if (armcareGap) {
    return `최근 7일 동안 암케어를 한 세트도 안 하셔서, 오늘은 ${withJosa(goal, '으로/로')} 어깨와 팔부터 챙깁니다. ${time}`;
  }
  if (!hasHistory) {
    return `운동 기록이 아직 적어 ${withJosa(goal, '으로/로')} 시작합니다. 기록이 쌓이면 더 맞춰 드립니다. ${time}`;
  }
  return `한쪽으로 기울일 신호가 없어 ${withJosa(goal, '으로/로')} 잡았습니다. ${time}`;
}

/**
 * 오늘 방향을 AI에게 다시 묻지 않고 그대로 써도 되는가 ('다시 만들기').
 *
 * AI가 정한 것이고, 체크인이 그대로이고, 지금 울타리 안에도 여전히 드는 경우.
 * 만든 뒤에 투구를 기록했다면 울타리가 바뀌었을 수 있다 — 그때는 다시 묻는다.
 */
export function canReuse(
  prev: AutoRecord | undefined,
  fence: AutoFence,
  stamp: string
): prev is AutoRecord {
  if (!prev || prev.by !== 'ai' || prev.checkin !== stamp) return false;
  if (!fence.goals.includes(prev.goal)) return false;
  if (!(fence.minutes[prev.goal] ?? []).includes(prev.minutes)) return false;
  if (prev.focus != null && !(fence.focuses[prev.goal] ?? []).includes(prev.focus)) {
    return false;
  }
  return true;
}

/** 조심할 부위를 사람 말로 */
export function cautionLabel(part: CheckinPartKey): string {
  return CHECKIN_PARTS.find((p) => p.key === part)?.label ?? part;
}
