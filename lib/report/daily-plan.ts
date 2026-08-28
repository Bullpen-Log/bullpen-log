import { equipmentForToday, filterByEquipment } from '@/lib/report/equipment';
import { filterByLevel, findGoal } from '@/lib/report/personalize';
import { selectCandidates, type ExerciseLike } from '@/lib/report/prescription';
import {
  decideTheme,
  workoutConflict,
  effectiveMinutes,
  pickForTheme,
  type SlotKey,
  type ThemeKey,
} from '@/lib/report/theme';
import type { ReportFacts } from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';

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
  theme: { key: ThemeKey; label: string; reason: string };
  goal: string | null;
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
  picks: { exerciseId: string; slot: SlotKey }[];
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
  trainingGoal: string | null;
};

export function buildDailyPlan<T extends ExerciseLike>({
  user,
  facts,
  plan,
  library,
  availableToday,
  requestedMinutes,
  recentIds,
  lastLowerKey,
  lastUpperKey,
  override = false,
}: {
  user: UserForPlan;
  facts: ReportFacts;
  plan: PitchPlan;
  library: T[];
  /** 오늘 쓸 수 있다고 고른 장비. 안 골랐으면 null */
  availableToday: string[] | null;
  requestedMinutes: number;
  /** 최근 며칠 안에 한 운동 — 빼지는 않고 뒤로 미룬다 */
  recentIds: Set<string>;
  lastLowerKey: string | null;
  lastUpperKey: string | null;
  /** 몸 상태 경고를 보고도 고른 대로 받겠다고 했는가 */
  override?: boolean;
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
  const picked = selectCandidates({ facts, plan, library: leveled.pool });

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
  const theme = decideTheme({
    facts,
    plan,
    lastLowerKey,
    lastUpperKey,
    preferredWorkout,
    override,
  });
  const minutes = effectiveMinutes(theme.key, requestedMinutes);
  const goal = findGoal(user.trainingGoal);

  const themed = pickForTheme({
    candidates: picked.candidates,
    theme: theme.key,
    minutes,
    // 만드는 시점에는 아직 아무것도 안 했다.
    doneIds: new Set<string>(),
    recentIds,
    preferredParts: facts.condition.today?.preferredParts ?? [],
    preferredWorkout,
    goal: goal.name,
  });

  return {
    version: 1,
    theme: { key: theme.key, label: theme.label, reason: theme.reason },
    goal: user.trainingGoal,
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
