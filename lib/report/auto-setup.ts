import type { CheckinLike, ReportFacts } from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';
import {
  CHECKIN_PARTS,
  HIGH_SORENESS,
  SHORT_SLEEP_HOURS,
  formatSleepHours,
  isShortSleep,
  sorenessWord,
  type CheckinPartKey,
} from '@/lib/checkin';
import { ACWR_ZONES } from '@/lib/pitch-stats';
import { withJosa } from '@/lib/korean';
import {
  DEFAULT_GOAL_NAME,
  TRAINING_GOAL_NAMES,
  focusesFor,
  type GoalFocusKey,
} from '@/lib/report/personalize';
import {
  CONDITIONING_GOAL,
  decideTheme,
  effectiveMinutes,
  conditioningDay,
  minutesChoicesFor,
  nearestMinutesChoice,
  painRecoveryReason,
  workoutConflict,
  type SessionTheme,
} from '@/lib/report/theme';
import { painEasingParts, rehabEasingParts } from '@/lib/report/prescription';
import type { TrainingLoad } from '@/lib/training-load';

/**
 * 자동 맞춤 — 목표·시간을 앱이 규칙으로 정하는 일정 만들기.
 *
 * 사용자는 장비만 고른다. 몸을 지키는 규칙(통증, 회복날·보조날, 운동 부하, 수면, 전신
 * 근육통, 체크인에서 고른 운동)이 울타리를 치고, 그 안의 '규칙 초안'(draft)이 오늘 방향이다.
 * 2026-10-07 AI 를 뺐다(사용자) — 예전에는 이 울타리 안에서 AI 가 골랐다.
 *
 * 운동 종목은 여기서 고르지 않는다. 방향이 정해지면 엔진이 안전 필터를 거쳐
 * 고른다(lib/report/daily-plan.ts). DB 를 부르지 않아 자가 시험으로 그대로 밟아 볼 수 있다.
 */

/**
 * 신호가 없는 날의 목표 — 목표를 안 고른 사람이 받는 기본 목표(근력 향상)와 같다.
 * 예전에는 '균형 잡힌 관리'였는데 그 목표를 없앴다(lib/report/personalize.ts).
 */
export const DEFAULT_GOAL = DEFAULT_GOAL_NAME;
const POWER_GOAL = '파워 향상';
const STRENGTH_GOAL = '근력 향상';

/*
 * 목표 이름이 목록과 어긋나면 규칙이 조용히 아무 일도 안 한다. 여기서 막는다.
 * (TRAINING_GOALS 의 이름을 바꾸면 이 파일도 같이 봐야 한다는 뜻이다.)
 * DEFAULT_GOAL 은 지금 STRENGTH_GOAL 과 같은 이름이다 — 뜻이 달라 따로 둔다.
 */
for (const name of [DEFAULT_GOAL, POWER_GOAL, STRENGTH_GOAL, CONDITIONING_GOAL]) {
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
 *
 * 어느 날이 '부족한 날'인지는 lib/checkin.ts 의 isShortSleep 이 정한다 — 느낌이
 * '부족'이거나 잔 시간이 6시간 미만. 오늘도, 지난 날을 세는 것도 그 함수 하나다.
 * (하루 못 잔 날에 가장 센 운동만 빼는 것은 prescription.ts 가 따로 한다.)
 */
export const SLEEP_DEBT_DAYS = 3;

/** 오늘 조심할 부위. 그 부위의 무거운 운동을 뺀다(규칙 초안은 늘 빈 목록). */
export type AutoCaution = { part: CheckinPartKey; why: string };

/** 오늘 운동의 방향 */
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

/** 규칙이 친 울타리 — 목표·시간·부위를 '고를 수 있는 값의 목록'으로 둔다. */
export type AutoFence = {
  /** 오늘 몸 상태로 정해진 날. 회복·보조날이면 목표가 거의 안 걸린다 */
  day: SessionTheme;
  /** 근력 날(상체·하체)인가. 아니면 부위를 고르지 않는다 */
  strengthDay: boolean;
  /** 규칙이 정한 목표. 없으면 null */
  fixedGoal: string | null;
  /** 고를 수 있는 목표 — fixedGoal 이 있으면 그것 하나 */
  goals: string[];
  /** 목표별로 고를 수 있는 시간(분). 기본 시간을 넘지 않는다 */
  minutes: Record<string, number[]>;
  /** 목표별로 고를 수 있는 부위. 비어 있으면 앱이 번갈아 정한다 */
  focuses: Record<string, GoalFocusKey[]>;
  /** 규칙이 정한 것과 그 까닭 — 화면의 '왜 이 운동인가요?' */
  rules: string[];
  /** 체크인에서 고른 운동이 몸 상태와 부딪혔는가 — 이유에 꼭 들어가야 한다 */
  clash: { kind: string; reason: string } | null;
  /** 규칙 초안 — 오늘 방향 */
  draft: AutoDecision;
};

/**
 * 일정에 함께 저장하는 자동 맞춤 기록 (DailyPlan.auto).
 *
 * 2026-10-07 전에 저장된 줄은 by 'ai' 이고 그때의 칸(fallback · checkin · 토큰 수)이 더 붙어
 * 있다. 화면은 by 와 상관없이 같은 이름으로 보이고 그 칸들은 읽지 않는다.
 */
export type AutoRecord = AutoDecision & {
  by: 'ai' | 'rules';
  /** 규칙이 정한 것 */
  rules: string[];
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
   * 몸 상태 경고를 넘기는 것(override)은 자동 맞춤에 없다. 체크인에서 고른 운동이
   * 몸 상태와 부딪히면 자동 맞춤은 몸 상태 쪽으로 가고 이유를 말한다(사용자분과
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
   * 통증 때문에 회복으로 정해진 날에는 부딪힘을 따지지 않는다. 그날은 무엇을 골랐든 회복이고,
   * 까닭도 통증이지 투구량이 아니다 (lib/report/today-data.ts 와 같은 판단 — theme.ts 의 painRecoveryReason).
   */
  const conflict = painRecoveryReason(facts, plan)
    ? null
    : workoutConflict({ facts, preferredWorkout: preferred });
  const clash =
    conflict && preferred ? { kind: preferred, reason: conflict.reason } : null;

  const loadHigh = workout.zone === 'caution' || workout.zone === 'danger';
  const sleepDebt =
    today != null &&
    isShortSleep(today) &&
    facts.condition.poorSleepDays >= SLEEP_DEBT_DAYS;

  let fixedGoal: string | null = null;
  let shorten = false;

  if (!strengthDay) {
    /*
     * 회복날·보조날은 목표가 구성을 거의 못 바꾼다(compositionFor 가 웨이트
     * 날에만 목표 모양을 쓴다). 그런 날 "목표: 근력 향상"이라고 적혀 있으면
     * 회복날 목록과 어긋나 보인다. 몸을 아끼는 날이라 컨디셔닝으로 둔다.
     */
    fixedGoal = CONDITIONING_GOAL;
    rules.push(`오늘은 ${day.label} → 목표는 ${CONDITIONING_GOAL}`);
  }
  if (clash) {
    rules.push(
      `체크인에서 ${clash.kind} 운동을 고르셨지만 ${clash.reason} → 몸 상태에 맞춰 가볍게`
    );
  }

  if (loadHigh || sleepDebt) {
    fixedGoal = CONDITIONING_GOAL;
    /* 회복날은 이미 시간을 줄인다(effectiveMinutes). 두 번 줄이지 않는다. */
    shorten = day.key !== 'recovery';
    const tail = shorten
      ? `${CONDITIONING_GOAL}, 시간 한 단계 줄임`
      : CONDITIONING_GOAL;
    if (loadHigh && workout.zone) {
      const zone = ACWR_ZONES[workout.zone];
      const ratio = workout.ratio != null ? ` ${workout.ratio.toFixed(2)}` : '';
      rules.push(`운동 부하 지수${ratio}(${zone.label}) → ${tail}`);
    }
    if (sleepDebt) {
      /* 잔 시간이 짧아서 걸린 날은 그 숫자를 앞에 적는다. 느낌만 '부족'이면 예전 문장 그대로 */
      const hours = today?.sleepHours;
      const lastNight =
        hours != null && hours < SHORT_SLEEP_HOURS
          ? `어젯밤 ${formatSleepHours(hours)} · `
          : '';
      rules.push(
        `${lastNight}최근 7일 중 잠이 부족한 날 ${facts.condition.poorSleepDays}일(오늘 포함) → ${tail}`
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

  /*
   * 전신 근육통 '많이' — 시간을 한 단계 줄이고, 고를 수 있는 목표에서 파워 향상을 뺀다.
   *
   * 알이 심하게 밴 날은 점프 · 전력 동작이 먼저 떨어진다. 가장 센 운동은 이미 후보에서 빠지지만
   * (prescription.ts), 목표가 파워면 남은 것으로 파워 날을 채우게 된다. 요일(상체·하체)은 그대로 둔다.
   *
   * 위 규칙들보다 뒤에 본다. 시간은 한 번만 줄인다(shorten 하나) — 운동 부하 · 잠 때문에 이미
   * 줄였으면 그대로다. 목표가 이미 정해진 날은 목표를 안 건드린다: 체크인에서 파워를 직접 고른
   * 날은 그 뜻 그대로 간다(부딪힘으로 보지 않는다).
   *
   * '심함'은 늘 회복날이라 여기 안 온다 — 회복날은 이미 시간을 줄인다(effectiveMinutes).
   * 1~5 밖의 값(말이 없는 값)은 안 적은 것으로 넘긴다 — 규칙 줄에 'null' 이 찍히지 않게.
   */
  const soreWord = sorenessWord(today?.soreness);
  const soreHigh =
    soreWord != null &&
    (today?.soreness ?? 0) >= HIGH_SORENESS &&
    day.key !== 'recovery';
  const dropPower = soreHigh && fixedGoal == null;

  const goals = fixedGoal
    ? [fixedGoal]
    : TRAINING_GOAL_NAMES.filter((g) => !(dropPower && g === POWER_GOAL));

  let shortBySoreness = false;
  if (soreHigh) {
    if (!shorten) {
      /*
       * 실제로 줄어들 때만 줄였다고 한다. 기본 시간이 이미 맨 아래(45분)인 사람은 더 줄일 데가
       * 없다 — 그대로인데 '시간 한 단계 줄임' · '45분으로 줄였습니다'라고 적으면 없는 일을 말하게 된다.
       */
      shortBySoreness = goals.some((goal) => {
        const base = nearestMinutesChoice(defaultMinutes, goal);
        return oneStepDown(goal, base) < base;
      });
      shorten = shortBySoreness;
    }
    const bits = [
      shortBySoreness ? '시간 한 단계 줄임' : null,
      dropPower ? `${POWER_GOAL}은 고르지 않음` : null,
    ].filter((bit) => bit != null);
    if (bits.length > 0) {
      rules.push(`전신 근육통 '${soreWord}' → ${bits.join(', ')}`);
    }
  }

  /*
   * 시간은 기본 시간을 넘지 않는다 — 줄이는 것만 고를 수 있다.
   *
   * 기본 시간은 그 사람이 운동에 쓸 수 있는 시간이다. 앱이 몸 상태를 보고
   * 90분을 권해도 그 사람에게 60분밖에 없으면 소용이 없다.
   */
  const minutes: Record<string, number[]> = {};
  for (const goal of goals) {
    const base = nearestMinutesChoice(defaultMinutes, goal);
    const cap = shorten ? oneStepDown(goal, base) : base;
    minutes[goal] = minutesChoicesFor(goal).filter((m) => m <= cap);
  }

  /*
   * 부위는 근력 날에만, 뻐근한 곳으로 좁히지 않게. 최근 7일에 아팠던 곳 · 재활 중인 관절(1~3단계)도 막는다 —
   * 그 부위의 무거운 운동이 빠지므로(prescription.ts) 그쪽으로 좁히면 본운동이 빈다.
   */
  const blocked = blockedFocuses([
    ...soreParts(today),
    ...painEasingParts(facts),
    ...rehabEasingParts(facts),
  ]);
  const focuses: Record<string, GoalFocusKey[]> = {};
  for (const goal of goals) {
    focuses[goal] = strengthDay
      ? focusesFor(goal)
          .map((f) => f.key)
          .filter((key) => !blocked.has(key))
      : [];
  }

  /*
   * 규칙 초안.
   *
   * 예전에는 최근 7일에 암케어가 0세트면 컨디셔닝으로 잡았다 — 그 목표에 암케어
   * 몫이 가장 컸다. 암케어가 모든 일정에서 빠진 뒤로(2026-09-25) 그 규칙은 아무도
   * 암케어를 못 하게 하는 셈이라 지웠다. 암케어는 암케어 화면이 따로 챙긴다.
   */
  const draftGoal = fixedGoal ?? DEFAULT_GOAL;
  const draftMinutes = Math.max(...minutes[draftGoal]);

  return {
    /*
     * 컨디셔닝으로 정해진 근력 날은 컨디셔닝 데이다(conditioningDay) — 화면도
     * 그 이름으로 보여야 "오늘은 하체 위주로" 같은 말을 안 한다.
     */
    day: fixedGoal === CONDITIONING_GOAL ? conditioningDay(day, facts) : day,
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
        soreHigh: shortBySoreness || dropPower ? soreWord : null,
        preferred,
        hasHistory: workout.recentDays > 0,
        /* 회복날은 고른 시간보다 짧게 한다 — 이유에는 실제로 할 시간을 적는다 */
        actualMinutes: effectiveMinutes(day.key, draftMinutes),
      }),
    },
  };
}

/**
 * 규칙 초안의 이유 — 화면에 이 문장이 나간다.
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
  soreHigh,
  preferred,
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
  /** 근육통 때문에 시간이나 고를 목표가 바뀐 날이면 그 말('많이'). 아니면 null */
  soreHigh: string | null;
  preferred: string | null;
  hasHistory: boolean;
  actualMinutes: number;
}): string {
  const time =
    actualMinutes < minutes
      ? `회복날이라 시간은 ${actualMinutes}분으로 줄였어요.`
      : shorten
        ? `시간은 ${minutes}분으로 줄였어요.`
        : `시간은 ${minutes}분이에요.`;
  if (clash) {
    return `${clash.kind} 운동을 하고 싶다고 하셨는데, ${clash.reason}. 그래서 오늘은 몸 상태에 맞춰 가볍게 만들었어요. ${time}`;
  }
  if (loadHigh && sleepDebt) {
    return `최근 운동 부하가 높고 잠도 부족한 날이 이어져, 목표는 ${withJosa(goal, '으로/로')} 두었어요. ${time}`;
  }
  if (loadHigh) {
    return `최근 운동 부하가 평소보다 높아, 목표는 ${withJosa(goal, '으로/로')} 두었어요. ${time}`;
  }
  if (sleepDebt) {
    return `잠이 부족한 날이 이어져, 오늘은 무게를 올리기보다 ${goal}에 써요. ${time}`;
  }
  if (soreHigh) {
    /* 파워 · 웨이트를 직접 고른 날은 목표가 그 뜻대로 갔다는 것까지 말한다 */
    const goalNote =
      preferred === '파워' || preferred === '웨이트'
        ? `체크인에서 ${preferred} 운동을 고르셔서 목표는 ${withJosa(goal, '으로/로')} 잡았어요. `
        : `목표는 ${withJosa(goal, '으로/로')} 두었어요. `;
    return `근육통이 '${soreHigh}'인 날이라 가장 센 운동은 빼고 가요. ${goalNote}${time}`;
  }
  if (!strengthDay) {
    return `몸을 아끼는 날이라 목표는 ${withJosa(goal, '으로/로')} 두었어요. ${time}`;
  }
  if (preferred === '파워' || preferred === '웨이트') {
    return `체크인에서 ${preferred} 운동을 고르셔서 목표를 ${withJosa(goal, '으로/로')} 잡았어요. ${time}`;
  }
  if (!hasHistory) {
    return `운동 기록이 아직 적어 ${withJosa(goal, '으로/로')} 시작해요. 기록이 쌓이면 더 맞춰 드려요. ${time}`;
  }
  return `특별히 바꿀 신호가 없어 기본 목표인 ${withJosa(goal, '으로/로')} 잡았어요. ${time}`;
}

/** 조심할 부위를 사람 말로 */
export function cautionLabel(part: CheckinPartKey): string {
  return CHECKIN_PARTS.find((p) => p.key === part)?.label ?? part;
}
