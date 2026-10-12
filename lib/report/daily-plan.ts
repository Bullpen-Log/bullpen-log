import { equipmentForToday, filterByEquipment } from '@/lib/report/equipment';
import {
  filterByLevel,
  findFocus,
  findGoal,
  goalForUnchosen,
  validFocus,
} from '@/lib/report/personalize';
import { selectCandidates, type ExerciseLike } from '@/lib/report/prescription';
import { goalPrescription } from '@/lib/report/goal-prescription';
import {
  CONDITIONING_GOAL,
  decideTheme,
  workoutConflict,
  effectiveMinutes,
  finishDayTheme,
  pickForTheme,
  conditioningDay,
  painAvoidedSide,
  steerFromEmptyMain,
  type SlotKey,
  type ThemeKey,
} from '@/lib/report/theme';
import { dayKindOf, shortenPitchesOf, shortenedMinutes } from '@/lib/engine/microcycle';
import { shiftDateKey } from '@/lib/pitch-stats';
import type { ReportFacts } from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';
import type { AutoCaution, AutoRecord } from '@/lib/report/auto-setup';
import type { PlanSwap } from '@/lib/report/plan-swaps';
import type { PlanFingerprint } from '@/lib/report/plan-fingerprint';

/**
 * 오늘의 운동 일정을 만든다.
 *
 * 예전에는 화면을 열 때마다 여기 있는 계산을 새로 했다. 그래서 만든 적도 없는
 * 일정이 늘 떠 있었고, 새로고침만 해도 내용이 바뀌었다(최근에 한 운동을 뒤로
 * 미루는 규칙 때문이다). 지금은 선수가 '만들기'를 눌렀을 때만 이 함수를 부르고,
 * 결과를 그날 하루 저장해 둔다.
 *
 * 저장하는 것은 운동 목록만이 아니라 근거까지다. 근거를 나중에 다시 계산하면,
 * 만든 뒤에 체크인을 한 날 "컨디션 3/10이라 무게 드는 운동을 뺐습니다"라고
 * 적혀 있는데 목록에는 데드리프트가 있는 상태가 된다.
 *
 * 안전은 여기서 한 번 보고, 화면에서 볼 때마다 다시 본다(app/(app)/today).
 * 만든 뒤에 통증을 입력했다면 저장된 일정이 있어도 보여주면 안 되기 때문이다.
 */

/** 저장해 두는 하루치 일정. DailyTrainingSetup.plan 에 그대로 들어간다. */
export type DailyPlan = {
  /** 모양이 바뀌면 올린다. 옛 기록은 못 읽는 것으로 보고 다시 만들게 한다. */
  version: 1;
  /**
   * heavyLowerAllowed 는 2판 P4 커밋 E 에서 더한 선택 칸 — 등판 창이 무거운 하체를 뺀 날에만 false 가 실린다(theme.ts finishDayTheme).
   * 없으면 든다고 읽는다(옛 줄과 같은 뜻이라 version 은 그대로 — focus 와 같은 까닭).
   */
  theme: { key: ThemeKey; label: string; reason: string; heavyLowerAllowed?: boolean };
  goal: string | null;
  /**
   * 목표 안에서 좁힌 부위. 안 좁혔으면 null 이고, 그때는 앱이 번갈아 정했다.
   *
   * 옛 기록에는 이 칸이 없다. 없으면 안 좁힌 것으로 읽으면 되므로 version 은
   * 올리지 않는다 — 올리면 이미 만들어 둔 오늘 일정이 통째로 안 읽힌다.
   */
  focus?: string | null;
  /** 오늘 체크인에서 고른 운동 종류 — 파워 / 웨이트 / 회복. 안 골랐으면 null */
  preferredWorkout?: string | null;
  /**
   * 몸 상태 경고를 넘기고 만든 날인가.
   *
   * 화면이 이 사실을 그대로 말해야 한다. 말없이 지나가면, 컨디션이 낮은 날에
   * 무거운 운동이 나온 것이 앱의 잘못처럼 보인다.
   */
  overrode?: boolean;
  /** 선수가 고른 운동 시간(분) */
  requestedMinutes: number;
  /** 테마까지 반영해 실제로 쓴 시간(분) — 회복 데이는 줄어든다 */
  minutes: number;
  /** 이 구성의 실제 소요(분) */
  estimatedMinutes: number;
  /**
   * 오늘 할 운동.
   *
   * manual 은 사용자가 목록에서 직접 더한 것이다. 만들어 준 것과 구별해 두는
   * 이유는 안전 재확인 때문이다 — 우리가 고른 것은 몸 상태가 나빠지면 빼지만,
   * 사용자가 일부러 넣은 것은 남기고 표시만 한다. 최종 선택은 본인 몫이다.
   */
  picks: { exerciseId: string; slot: SlotKey; manual?: boolean }[];
  /** 무엇을 보고 이렇게 골랐는지 */
  basis: string[];
  notes: string[];
  excluded: { rule: string; count: number }[];
  equipment: {
    /** 만들 때 쓸 수 있었던 장비 */
    available: string[];
    /** 장비 때문에 뺀 개수 */
    excludedCount: number;
    /** 오늘만 좁혀 놓았는가 — 안내 문구가 달라진다 */
    narrowed: boolean;
    /** 하나만 더 있으면 가장 많이 늘어나는 것 */
    bestAddition: { name: string; unlocks: number } | null;
  };
  /** 경력에 비해 일러서 뺀 개수 */
  levelExcludedCount: number;
  /**
   * 자동 맞춤으로 만든 날에만 있다 — 목표·시간을 어떻게 정했고 왜인지
   * (lib/report/auto-setup.ts). 옛 기록과 직접 고른 날에는 없으므로 version 은
   * 그대로 둔다. (2026-10-07 전 줄에는 AI 호출 수 aiCalls 도 남아 있다 — 읽지 않는다.)
   */
  auto?: AutoRecord;
  /**
   * 그날 뺀 · 바꾼 운동의 기록(lib/report/plan-swaps.ts, 2026-10-12 트레이닝 추천 2판 P2). 일정 화면에서 뺀 것과
   * 운동 중에 뺀 · 바꾼 것(세션 판에도 같이 적힌다)이 쌓이고, '다시 만들기'가 이어 준다(carrySwaps). 옛 줄에는 없고
   * 없으면 빈 것으로 읽으니 version 은 그대로(focus 와 같은 까닭). 새로 만든 일정(buildDailyPlan)에는 넣지 않는다.
   */
  swaps?: PlanSwap[];
  /**
   * 만들 때 본 오늘 상태의 요약(lib/report/plan-fingerprint.ts, 2026-10-12 트레이닝 추천 2판 P2). 읽을 때(today-data.ts)
   * 지금 facts 로 다시 찍어 다르면 '상태가 바뀌었어요'(화면은 P6). generateTodayPlan 이 저장할 때 넣는다 — buildDailyPlan 은
   * 안 넣는다(기준선 도구 · 시험의 결과 모양을 안 흔들려고). 옛 줄에는 없고 없으면 견주지 않으니 version 은 그대로.
   */
  fingerprint?: PlanFingerprint;
};

/** 통증 등으로 일정을 만들지 않은 경우 */
export type HaltedPlan = { halted: true; reason: string | null };

export type BuildResult = DailyPlan | HaltedPlan;

export function isHalted(result: BuildResult): result is HaltedPlan {
  return 'halted' in result;
}

type UserForPlan = {
  ownedEquipment: string[];
  trainingLevel: string | null;
};

export function buildDailyPlan<T extends ExerciseLike>({
  user,
  facts,
  plan,
  library,
  availableToday,
  requestedMinutes,
  trainingGoal = null,
  trainingFocus = null,
  recentIds,
  sessionsAgo,
  rotationSeed,
  lastLowerKey,
  lastUpperKey,
  override = false,
  caution = [],
}: {
  user: UserForPlan;
  facts: ReportFacts;
  plan: PitchPlan;
  library: T[];
  /** 오늘 쓸 수 있다고 고른 장비. 안 골랐으면 null */
  availableToday: string[] | null;
  requestedMinutes: number;
  /**
   * 오늘의 훈련 목표. 일정을 만드는 폼에서 그날그날 온다.
   *
   * 예전에는 user.trainingGoal 을 읽었다. 설정에 한 번 저장해 두는 값이라,
   * '파워 향상'으로 정해둔 사람은 그 뒤 모든 날이 파워 위주가 됐다.
   * 목표는 날마다 달라지는 것이라 그날 고른 값을 받는다. 안 주면 오늘 고른 운동
   * 종류를 따른다(goalForUnchosen — 파워면 파워 향상, 그 밖에는 근력 향상).
   */
  trainingGoal?: string | null;
  /**
   * 목표 안에서 오늘 좁힌 부위. 목표와 같은 자리에서 그날그날 온다.
   *
   * 목표에 없는 값이면 무시한다(validFocus). 근력에서 '상체 당기기'를 골라
   * 두고 파워로 바꾼 채 넘어오는 일이 있다.
   */
  trainingFocus?: string | null;
  /** 최근 며칠 안에 한 운동 — 빼지는 않고 뒤로 미룬다 */
  recentIds: Set<string>;
  /** 운동별로 몇 세션 전에 했는가. 오래 안 한 것부터 내보내는 데 쓴다. */
  sessionsAgo?: Map<string, number>;
  /**
   * 아직 안 해본 운동들의 순서를 섞는 씨앗.
   *
   * 앱은 늘 '사용자 id|날짜|지금 목록…'을 넣는다(app/actions/training-setup.ts). 안 주면 날짜(facts.asOf)만 —
   * 그러면 설정이 같은 두 사람이 같은 날 같은 목록을 받으니, 시험 · 도구 밖에서는 꼭 넣는다.
   */
  rotationSeed?: string;
  lastLowerKey: string | null;
  lastUpperKey: string | null;
  /** 몸 상태 경고를 보고도 고른 대로 받겠다고 했는가 */
  override?: boolean;
  /** 조심할 부위. 그 부위의 무거운 운동을 뺀다(자동 맞춤의 규칙 초안은 늘 비어 있다) */
  caution?: AutoCaution[];
}): BuildResult {
  /*
   * 오늘 쓸 수 있는 장비 → 경력 → 안전 순서로 거른다.
   *
   * 장비와 경력을 안전보다 앞에 두는 이유가 있다. 뒤에 두면 "안전 규칙을
   * 통과한 20개 중 18개가 장비가 없어 빠졌다" 같은 상태가 되어, 안전 필터가
   * 얼마나 걸렀는지가 실제보다 커 보인다.
   */
  const available = equipmentForToday(user.ownedEquipment, availableToday);
  const narrowed = available.length < user.ownedEquipment.length;
  const usable = filterByEquipment(
    library,
    available,
    narrowed ? user.ownedEquipment : undefined
  );
  const leveled = filterByLevel(usable.pool, user.trainingLevel);
  const picked = selectCandidates({ facts, plan, library: leveled.pool, caution });

  if (picked.halted) {
    return { halted: true, reason: picked.haltReason };
  }

  /*
   * 오늘 고른 운동 종류. 체크인을 안 한 날은 없는 것으로 본다.
   *
   * override 는 "몸 상태 경고를 봤고 그래도 하겠다"는 뜻이다. 일정을 만들 때
   * 폼에서 넘어온다 — 오늘 하루만의 결정이라 저장해 두지 않는다.
   */
  const preferredWorkout = facts.condition.today?.preferredWorkout ?? null;
  /* 목표를 안 고른 날은 오늘 고른 운동 종류를 따른다(goalForUnchosen) */
  const goalName = trainingGoal ?? goalForUnchosen(preferredWorkout);
  /* 목표에 없는 부위는 여기서 걸러 둔다 — 아래로는 유효한 값만 흐른다 */
  const chosenFocus = validFocus(goalName, trainingFocus);
  const decided = decideTheme({
    facts,
    plan,
    lastLowerKey,
    lastUpperKey,
    preferredWorkout,
    override,
    focus: chosenFocus,
  });
  /*
   * 고른 부위가 오늘의 날과 맞을 때만 쓴다. 통증 때문에 날이 바뀌면(theme.ts 의 steerAroundPain —
   * '상체 밀기'를 골랐는데 어깨가 아파 하체 날) 그 부위로 좁히면 본운동이 통째로 빈다.
   */
  const focus = findFocus(chosenFocus)?.theme === decided.key ? chosenFocus : null;
  const goal = findGoal(goalName);
  /*
   * 근력 날인데 그쪽 본운동 후보가 0 이면 날을 바꾼다(theme.ts 의 steerFromEmptyMain — 반대쪽, 그것도 없거나 어제
   * 했으면 보조 · 코어). 후보는 안전 거르기를 지난 것만 센다. 부위를 좁힌 날은 바꾸지 않는다(focus 가 그대로 산다).
   * 통증 때문에 피한 쪽(steerAroundPain 이 비켜 간 쪽)으로는 되돌아가지 않는다 — 그때는 보조 · 코어.
   */
  const theme = steerFromEmptyMain({
    day: decided,
    candidates: picked.candidates,
    goalName: goal.name,
    focus,
    lastLowerKey,
    lastUpperKey,
    asOf: facts.asOf,
    avoid: painAvoidedSide(facts),
  });
  /*
   * 쓸 시간 — 회복 날은 effectiveMinutes 가 줄이고, 그 밖의 날은 구원 '어제 실전 강도로 20구 넘게 던졌으면 짧게'(날 종류의 shorten,
   * 2판 P4 커밋 E)일 때 × 0.75 · 바닥 30분. 회복 날은 이미 줄였으니 두 번 줄이지 않는다. 고르기 전에 정해야 구성이 그 시간에 맞는다.
   */
  const dk = dayKindOf(facts);
  const baseMinutes = effectiveMinutes(theme.key, requestedMinutes);
  const shortenPitches = theme.key === 'recovery' ? null : shortenPitchesOf(dk);
  const minutes = shortenPitches != null ? shortenedMinutes(baseMinutes) : baseMinutes;

  const themed = pickForTheme({
    /* 목표에 맞춘 횟수로 시간을 센다 — 화면 · 운동 화면도 같은 값을 쓴다(goal-prescription.ts) */
    candidates: picked.candidates.map((ex) => goalPrescription(ex, goal.name)),
    theme: theme.key,
    minutes,
    // 만드는 시점에는 아직 아무것도 안 했다.
    doneIds: new Set<string>(),
    recentIds,
    sessionsAgo,
    rotationSeed: rotationSeed ?? facts.asOf,
    preferredParts: facts.condition.today?.preferredParts ?? [],
    preferredWorkout,
    goal: goal.name,
    focus,
  });

  /*
   * 근력 날인데 목표가 컨디셔닝이면 이름과 이유를 목록에 맞춘다 — 무게 드는
   * 운동이 하나도 없는데 '하체 스트렝스 데이'라고 적혀 있으면 안 된다. 이유는
   * 실제로 뽑힌 구간으로 적는다 — 유산소는 영상이 있는 날에만 들어간다.
   */
  const conditioning = goal.name === CONDITIONING_GOAL;
  /*
   * 날을 다 정한 뒤 표시를 붙인다(theme.ts finishDayTheme — 등판 창의 하체 날 한 줄 · 짧게 한 줄 · heavyLowerAllowed). 날을 바꾸는 함수가
   * 테마를 새로 만들어도 빠지지 않게 마지막에 한 번(2판 P4 커밋 E).
   */
  const shownTheme = finishDayTheme(
    conditioning
      ? conditioningDay(
          theme,
          facts,
          themed.picks.map((p) => p.slot)
        )
      : theme,
    dk,
    {
      conditioning,
      shortened:
        shortenPitches != null && minutes < baseMinutes
          ? { pitches: shortenPitches, minutes }
          : null,
    }
  );

  return {
    version: 1,
    theme: {
      key: shownTheme.key,
      label: shownTheme.label,
      reason: shownTheme.reason,
      ...(shownTheme.heavyLowerAllowed === false ? { heavyLowerAllowed: false } : {}),
    },
    goal: goal.name,
    focus,
    preferredWorkout,
    /** 몸 상태 경고를 넘기고 만든 날인가. 화면이 그 사실을 그대로 말한다. */
    overrode: override && workoutConflict({ facts, preferredWorkout }) != null,
    requestedMinutes,
    minutes,
    estimatedMinutes: themed.estimatedMinutes,
    picks: themed.picks.map((p) => ({ exerciseId: p.exercise.id, slot: p.slot })),
    basis: picked.basis,
    notes: themed.notes,
    excluded: picked.excluded,
    equipment: {
      available,
      excludedCount: usable.excludedCount,
      narrowed,
      bestAddition: usable.bestAddition,
    },
    levelExcludedCount: leveled.excludedCount,
  };
}

/**
 * 저장해 둔 일정을 읽는다. 모양이 다르면 없는 것으로 본다.
 *
 * 옛 기록을 억지로 읽으려 하면 화면 곳곳에서 값이 비어 터진다. 다시 만들라고
 * 하는 편이 낫다 — 만드는 데 드는 것은 버튼 한 번이다.
 */
export function readDailyPlan(value: unknown): DailyPlan | null {
  if (!value || typeof value !== 'object') return null;
  const plan = value as Partial<DailyPlan>;
  if (plan.version !== 1 || !Array.isArray(plan.picks)) return null;
  return plan as DailyPlan;
}

/* ------------------------- 하체 · 상체를 번갈아 돌릴 마지막 날 ------------------------- */

export type StrengthSide = 'lower' | 'upper';

/** 어디서 온 날인가 — 완료 기록(done) · 저장된 일정(planned) · 없음 */
export type StrengthDateSource = 'done' | 'planned' | null;

export type StrengthDates = {
  lower: string | null;
  upper: string | null;
  source: { lower: StrengthDateSource; upper: StrengthDateSource };
};

/**
 * 저장된 일정이 '그날 근력 날'로 세어지는 조건 — 하체 · 상체 날이고 본운동 구간이 실제로 있었던 날.
 *
 * 컨디셔닝 목표의 날은 이름이 '컨디셔닝 데이'여도 key 는 lower/upper 로 남는데(theme.ts 의 conditioningDay — 번갈아 가는
 * 차례를 다음 근력 날로 넘기려고), 본운동(무게)이 없는 날이라 세지 않는다. 그래서 key 가 아니라 본운동 구간이 있었는지로 본다.
 * 모양이 안 맞는 옛 줄(readDailyPlan 이 null)은 건너뛴다.
 */
export function plannedStrengthSide(value: unknown): StrengthSide | null {
  const plan = readDailyPlan(value);
  if (!plan) return null;
  if (plan.theme.key !== 'lower' && plan.theme.key !== 'upper') return null;
  if (!plan.picks.some((p) => p.slot === 'main')) return null;
  return plan.theme.key;
}

/**
 * 최근 기간 안에 하체 · 상체 스트렝스를 마지막으로 '한' 날 — 완료 기록이 먼저, 없는 날은 저장된 일정으로.
 *
 * 2026-10-11 (트레이닝 추천 2판 P1) 전에는 완료 기록만 봤다. 마침을 안 누르는 사람은 기록이 늘 비어 있어 날짜 홀짝
 * (theme.ts 의 예비 규칙 — (월+일)%2)으로 떨어졌고, 사흘 주기로 등판하는 구원 투수는 그 홀짝이 등판 주기와 맞물려
 * 근력 날이 전부 하체가 됐다(기준선 구원B 하체 5 · 상체 0). 일정을 만들고 안 눌렀어도 몸은 그 계획을 받았다고 본다
 * (가정 — 계획을 세우고 안 한 날도 '한 날'로 센다. 반대로 하면 홀짝으로 돌아간다).
 *
 * 규칙
 *   같은 날에 완료 기록이 있으면 그날은 완료 기록만 본다 — 계획은 하체였는데 상체를 직접 더해 마쳤으면 상체를 한 날이다.
 *   완료 기록이 없는 날은 저장된 일정(plannedStrengthSide)으로 센다.
 *   오늘 것은 넣지 않는다 — 오늘 일정을 '다시 만들기'할 때마다 오늘의 차례가 뒤집히면 안 된다(gather.ts 의 원칙 그대로).
 *   둘 다 없으면 null — theme.ts 가 날짜 홀짝으로 간다(처음 쓰는 사람만).
 *
 * 부르는 쪽(gather.ts · 기준선 도구 · 자체 시험)이 같은 기간(ROTATION_LOOKBACK_DAYS)으로 잘라 넘기고, 재활 체크 · 암케어는
 * 그쪽에서 뺀다. DB 함수가 아니라 여기 두는 까닭은 도구 · 시험이 같은 규칙을 그대로 쓰게 하려는 것이다.
 */
export function strengthDatesFrom({
  done,
  planned,
  todayKey,
}: {
  /** 완료한 운동 — 날짜 키(YYYY-MM-DD)와 카테고리 */
  done: { date: string; category: string }[];
  /** 저장된 일정 — 날짜 키와 DailyTrainingSetup.plan 그대로 */
  planned: { date: string; plan: unknown }[];
  /** 오늘(YYYY-MM-DD) — 이날부터는 안 본다 */
  todayKey: string;
}): StrengthDates {
  const sideOf = (category: string): StrengthSide | null =>
    category === '하체 스트렝스'
      ? 'lower'
      : category === '상체 스트렝스'
        ? 'upper'
        : null;

  /* 날짜 → 그날 완료한 쪽(들). 근력이 아닌 완료만 있는 날은 여기 안 들어가 계획으로 센다. */
  const doneByDay = new Map<string, Set<StrengthSide>>();
  for (const d of done) {
    if (d.date >= todayKey) continue;
    const side = sideOf(d.category);
    if (!side) continue;
    const set = doneByDay.get(d.date) ?? new Set<StrengthSide>();
    set.add(side);
    doneByDay.set(d.date, set);
  }

  const latest: Record<
    StrengthSide,
    { key: string; source: StrengthDateSource } | null
  > = {
    lower: null,
    upper: null,
  };
  const bump = (side: StrengthSide, key: string, source: StrengthDateSource) => {
    const cur = latest[side];
    if (!cur || key > cur.key) latest[side] = { key, source };
  };
  for (const [key, sides] of doneByDay) {
    for (const side of sides) bump(side, key, 'done');
  }
  for (const p of planned) {
    if (p.date >= todayKey || doneByDay.has(p.date)) continue;
    const side = plannedStrengthSide(p.plan);
    if (side) bump(side, p.date, 'planned');
  }
  return {
    lower: latest.lower?.key ?? null,
    upper: latest.upper?.key ?? null,
    source: {
      lower: latest.lower?.source ?? null,
      upper: latest.upper?.source ?? null,
    },
  };
}

/* ------------------------- 최근 2주에 마친 동작 계열(2판 P5) ------------------------- */

/** 동작 계열을 세는 기간(일) — 하체 · 상체를 번갈아 볼 때와 같은 2주(gather.ts 의 ROTATION_LOOKBACK_DAYS) */
export const PATTERNS_LOOKBACK_DAYS = 14;

/**
 * 최근 2주(오늘 빼고) 안에 마친 동작 계열별 날 수 — 고르기 점수(2판 P5)가 '2주 동안 힌지를 안 해서 앞에 뒀어요'를 매길 때 읽는다.
 * 계열은 라이브러리 칸 그대로(스쿼트 · 힌지 · 런지 · 밀기 · 당기기 · 회전 · 운반 · 카프 · 고립 — exercise-meta MOVEMENT_PATTERNS)다.
 * 박스 점프(파워 · 스쿼트)도 스쿼트를 한 날로 센다 — 관절이 하는 일로 가르는 그 칸의 약속 그대로다.
 *
 * 규칙
 *   완료 기록만 센다. 저장된 일정(계획)은 안 센다 — '안 해서'라고 말하려면 실제로 안 한 것이어야 한다(계획만 세우고 안 한 힌지를
 *     했다고 치면 이유 글이 거짓이 된다). 그래서 strengthDatesFrom(하체 · 상체 차례 — 계획도 '한 날')과 규칙이 다르다.
 *   마친 날이 하루도 없으면 null — 그때는 모든 계열이 0 이라 '안 한 계열'이 뜻이 없다(마침을 안 누르는 사람에게 점수가 다 붙는다).
 *     부르는 쪽은 null 이면 이 항목을 끈다. 마친 날은 있는데 계열이 하나도 없으면(코어 · 모빌리티만) 빈 Map 이다.
 *   하루에 같은 계열을 여럿 해도 그날 하나로 센다(날 수) — 한 세션에 스쿼트 둘을 한 것보다 며칠에 나눠 한 것이 '자주'다.
 *   오늘 것은 안 센다 — 오늘 체크할 때마다 오늘 목록이 바뀌지 않게(strengthDatesFrom 과 같은 원칙). 기간 밖(14일보다 앞)도 안 센다.
 *   암케어는 뺀다 — 일정과 따로 매일 하는 루틴이라(gather.ts exerciseSessionsAgo 와 같은 까닭) 밴드 당기기가 '당기기를 한 날'이 되면
 *     안 된다. 재활 체크(재활 단계에서 한 운동)는 부르는 쪽이 뺀다 — 재활 기간을 알아야 가를 수 있다(gather.ts 의 isRehabCheck).
 * 같은 입력이면 늘 같은 Map 이다(넣는 차례는 계열 이름순).
 */
export function patternsDoneFrom({
  done,
  todayKey,
}: {
  /** 완료한 운동 — 날짜 키(YYYY-MM-DD) · 카테고리 · 동작 계열(없으면 null) */
  done: readonly { date: string; category: string; movementPattern: string | null }[];
  /** 오늘(YYYY-MM-DD) — 이날부터는 안 본다 */
  todayKey: string;
}): Map<string, number> | null {
  const sinceKey = shiftDateKey(todayKey, -PATTERNS_LOOKBACK_DAYS);
  const sessionDays = new Set<string>();
  const daysOf = new Map<string, Set<string>>();
  for (const d of done) {
    if (d.date >= todayKey || d.date < sinceKey) continue;
    if (d.category === '암케어') continue;
    sessionDays.add(d.date);
    if (!d.movementPattern) continue;
    const set = daysOf.get(d.movementPattern) ?? new Set<string>();
    set.add(d.date);
    daysOf.set(d.movementPattern, set);
  }
  if (sessionDays.size === 0) return null;
  return new Map(
    [...daysOf.keys()].sort().map((pattern) => [pattern, daysOf.get(pattern)!.size])
  );
}
