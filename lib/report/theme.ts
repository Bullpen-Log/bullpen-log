import { intensityLevel, type Prescription } from '@/lib/exercise-meta';
import type { ReportFacts } from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';
import { findGoal } from '@/lib/report/personalize';

/**
 * 오늘의 훈련 테마와, 운동 시간에 맞춘 구성.
 *
 * 예전에는 안전 필터를 통과한 후보를 "부위가 안 겹치게 5개" 뽑았다.
 * 그 규칙은 매일 전신을 조금씩 시키는 셈이라, 하체 데이·회복 데이 같은
 * "오늘의 목적"이 생길 수 없었고 결과가 중구난방으로 보였다.
 *
 * 지금은 두 단계로 나눈다.
 *   1) decideTheme  — 이미 계산된 값(부하 구간·컨디션·회복 상태·최근 완료
 *      기록)으로 오늘의 테마를 정한다.
 *   2) pickForTheme — 테마의 시간 배분표에 따라, 사용자의 운동 시간에
 *      맞는 개수만큼 채운다.
 *
 * 안전과의 관계는 예전과 같다. 위험한 운동은 여기 오기 전에
 * selectCandidates 가 이미 걸러냈다. 여기서는 남은 것의 구성만 정하므로,
 * 이 파일의 규칙이 아무리 바뀌어도 위험한 운동이 끼어들 수 없다.
 */

/* ------------------------------- 운동 시간 ------------------------------- */

/** 고를 수 있는 하루 운동 시간(분) */
export const WORKOUT_MINUTES_CHOICES = [30, 45, 60, 90] as const;

/** 프로필에서 아직 고르지 않은 사용자의 기본값 */
export const DEFAULT_WORKOUT_MINUTES = 45;

/**
 * 회복 데이의 시간 상한.
 * 90분을 골라둔 사용자라도 회복이 목적인 날 90분을 시키면 회복이 아니다.
 */
export const RECOVERY_MAX_MINUTES = 35;

/** 한 운동을 끝내고 다음 운동으로 넘어가는 데 걸리는 시간(초) */
const SECONDS_BETWEEN_EXERCISES = 30;

/** 세트·휴식이 비어 있을 때 쓸 값 */
const FALLBACK_REST_SECONDS = 60;

/** 한 번 반복하는 데 걸리는 대략의 시간(초) */
function secondsPerRep(category: string, level: number): number {
  if (category === '파워') return 4; // 한 번마다 자세를 다시 잡는다
  if (level >= 4) return 4; // 무거운 것은 천천히
  return 3;
}

/**
 * 운동 하나에 걸리는 대략의 시간(분).
 *
 * 예전에는 카테고리마다 고정된 숫자를 썼다("하체는 무조건 7분"). 그러다 보니
 * 30초 버티는 스트레칭과 3세트짜리 데드리프트가 같은 시간으로 계산돼서,
 * "45분에 맞췄습니다"라고 적어놓고 실제로는 한참 다른 양이 나왔다.
 *
 * 지금은 운동에 적힌 세트·횟수·휴식으로 직접 센다.
 *   (한 세트에 걸리는 시간 × 세트 수) + (세트 사이 휴식 × (세트 수 − 1)) + 넘어가는 시간
 *
 * 3세트면 세트 사이에 쉬는 것은 두 번이다. 세 번으로 세면 무거운 운동이
 * 실제보다 3분씩 길게 나온다.
 *
 * 아직 세트·횟수를 안 채운 운동은 예전처럼 종류로 어림한다.
 */
export function estimateMinutes(
  ex: { category: string; intensity: string } & Partial<Prescription>
): number {
  const level = intensityLevel(ex.intensity);

  const sets = ex.sets ?? null;
  const work = ex.holdSeconds ?? (ex.reps != null ? ex.reps * secondsPerRep(ex.category, level) : null);
  if (sets != null && sets > 0 && work != null) {
    const perSet = ex.perSide ? work * 2 : work;
    const rest = ex.restSeconds ?? FALLBACK_REST_SECONDS;
    const seconds = sets * perSet + (sets - 1) * rest + SECONDS_BETWEEN_EXERCISES;
    return seconds / 60;
  }

  // 세트·횟수가 아직 없는 운동 — 종류와 강도로 어림한다.
  if (ex.category === '모빌리티' || level <= 1) return 3;
  if (ex.category === '암케어') return 4;
  if (ex.category === '코어') return 5;
  if (ex.category === '파워') return 7;
  if (ex.category === '상체 스트렝스' || ex.category === '하체 스트렝스') {
    return level >= 4 ? 9 : 7;
  }
  return level >= 4 ? 8 : level === 3 ? 6 : 4;
}

/* -------------------------------- 테마 결정 ------------------------------- */

export type ThemeKey = 'recovery' | 'assist' | 'lower' | 'upper';

export type SessionTheme = {
  key: ThemeKey;
  /** 화면에 크게 보여줄 이름 */
  label: string;
  /** 왜 오늘 이 테마인지 — 근거 패널과 AI 설명에 그대로 쓴다 */
  reason: string;
};

/**
 * 컨디션이 이 값 이하면 회복 테마로 돌린다.
 * (lib/report/prescription.ts 의 무게 제외 기준과 같은 값이다.)
 */
const LOW_CONDITION_THRESHOLD = 4;

export function decideTheme({
  facts,
  plan,
  lastLowerKey,
  lastUpperKey,
}: {
  facts: ReportFacts;
  plan: PitchPlan;
  /** 최근 2주 안에 하체 스트렝스를 완료한 마지막 날 (없으면 null) */
  lastLowerKey: string | null;
  /** 최근 2주 안에 상체 스트렝스를 완료한 마지막 날 (없으면 null) */
  lastUpperKey: string | null;
}): SessionTheme {
  // 1) 몸을 지키는 조건이 먼저다. 여기 걸리면 무조건 회복.
  if (plan.recovering) {
    return {
      key: 'recovery',
      label: '회복·재생 데이',
      reason: '최근 통증 기록이 있어 재생과 가동성 위주로 구성했습니다.',
    };
  }
  if (facts.load.zone === 'danger') {
    return {
      key: 'recovery',
      label: '회복·재생 데이',
      reason: '투구 부하가 위험 구간이라 회복 위주로 구성했습니다.',
    };
  }
  const condition = facts.condition.today?.condition;
  if (condition != null && condition <= LOW_CONDITION_THRESHOLD) {
    return {
      key: 'recovery',
      label: '회복·재생 데이',
      reason: `오늘 컨디션이 ${condition}/10이라 회복 위주로 구성했습니다.`,
    };
  }

  // 2) 부하가 주의 구간이면 무게 대신 몸통과 팔 관리에 집중한다.
  if (facts.load.zone === 'caution') {
    return {
      key: 'assist',
      label: '보조·코어 데이',
      reason: '투구 부하가 주의 구간이라 무게 대신 코어와 암케어에 집중합니다.',
    };
  }

  /*
   * 3) 몸이 괜찮은 날은 하체와 상체를 번갈아 간다.
   *
   * 완료 기록에서 마지막으로 한 날을 찾아 더 오래된 쪽을 고른다.
   * 완료 표시를 안 하는 사용자는 기록이 늘 비어 있으므로,
   * 날짜로 번갈아 도는 예비 규칙을 둔다.
   */
  if (lastLowerKey == null && lastUpperKey == null) {
    const [, m, d] = facts.asOf.split('-').map(Number);
    const lower = (m + d) % 2 === 0;
    return lower
      ? {
          key: 'lower',
          label: '하체 스트렝스 데이',
          reason: '부하가 적정 범위입니다. 투구의 힘은 하체에서 나옵니다.',
        }
      : {
          key: 'upper',
          label: '상체 스트렝스 데이',
          reason: '부하가 적정 범위라 상체 근력을 훈련하기 좋은 날입니다.',
        };
  }
  if (lastLowerKey == null || (lastUpperKey != null && lastLowerKey < lastUpperKey)) {
    return {
      key: 'lower',
      label: '하체 스트렝스 데이',
      reason:
        lastUpperKey != null
          ? '최근에 상체를 했으니 오늘은 하체 차례입니다.'
          : '최근 하체 기록이 없어 하체부터 시작합니다.',
    };
  }
  return {
    key: 'upper',
    label: '상체 스트렝스 데이',
    reason:
      lastLowerKey != null
        ? '최근에 하체를 했으니 오늘은 상체 차례입니다.'
        : '최근 상체 기록이 없어 상체부터 시작합니다.',
  };
}

/* ------------------------------ 시간 배분과 구성 ----------------------------- */

export type SlotKey = 'warmup' | 'main' | 'core' | 'prehab' | 'armcare';

export const SLOT_LABELS: Record<SlotKey, { label: string; hint: string }> = {
  warmup: { label: '워밍업', hint: '가볍게 몸을 열고 시작하세요' },
  main: { label: '본운동', hint: '오늘 테마의 핵심입니다' },
  core: { label: '코어', hint: '몸통을 단단하게' },
  /*
   * 보강.
   *
   * 이 구간이 없던 때는 '회복 및 보강' 39개 중 31개가 어느 구간에도 못 들어가
   * 한 번도 나오지 않았다. 고관절·내전근 보강은 투수의 부상 방지에서 가장
   * 중요한 축인데, 목표에 '부상 방지'를 두고 정작 그 운동을 안 쓰면
   * 이름만 있는 목표가 된다.
   */
  prehab: { label: '보강', hint: '고관절·내전근처럼 약해지기 쉬운 곳' },
  armcare: { label: '암케어', hint: '어깨·팔꿈치 관리로 마무리' },
};

/** 화면·구성에서 쓰는 구간 순서 */
export const SLOT_ORDER: SlotKey[] = ['warmup', 'main', 'core', 'prehab', 'armcare'];

type SlotSpec = {
  slot: SlotKey;
  /** 전체 시간에서 이 구간이 차지하는 비율 */
  share: number;
  /** 이 구간을 채우는 카테고리 (워밍업은 별도 규칙) */
  categories: string[];
  /**
   * 시간이 아무리 길어도 이 개수까지만.
   *
   * 시간은 아래에서 운동마다 실제로 더해 채운다. 이 값은 짧은 운동만 골라
   * 열 개씩 늘어놓는 일을 막는 안전장치다.
   */
  maxCount: number;
};

/*
 * 테마별 시간 배분표.
 *
 * 파워는 따로 자리를 만들지 않고 스트렝스 데이의 본운동에 섞는다.
 * 파워 운동이 6개뿐이라 전용 데이를 만들면 구성이 빈약하고,
 * 부하가 좋은 날에만 안전 필터를 통과하므로 자연스럽게 좋은 날에만 나온다.
 * 영상이 더 채워지면 전용 테마로 승격하면 된다.
 */
const COMPOSITIONS: Record<ThemeKey, SlotSpec[]> = {
  lower: [
    { slot: 'warmup', share: 0.15, categories: ['모빌리티'], maxCount: 5 },
    { slot: 'main', share: 0.45, categories: ['하체 스트렝스', '파워'], maxCount: 8 },
    { slot: 'core', share: 0.15, categories: ['코어'], maxCount: 4 },
    { slot: 'prehab', share: 0.1, categories: ['회복 및 보강'], maxCount: 3 },
    { slot: 'armcare', share: 0.15, categories: ['암케어'], maxCount: 4 },
  ],
  upper: [
    { slot: 'warmup', share: 0.15, categories: ['모빌리티'], maxCount: 5 },
    { slot: 'main', share: 0.45, categories: ['상체 스트렝스', '파워'], maxCount: 8 },
    { slot: 'core', share: 0.15, categories: ['코어'], maxCount: 4 },
    { slot: 'prehab', share: 0.1, categories: ['회복 및 보강'], maxCount: 3 },
    { slot: 'armcare', share: 0.15, categories: ['암케어'], maxCount: 4 },
  ],
  assist: [
    { slot: 'warmup', share: 0.15, categories: ['모빌리티'], maxCount: 5 },
    { slot: 'main', share: 0.35, categories: ['코어'], maxCount: 8 },
    { slot: 'prehab', share: 0.15, categories: ['회복 및 보강'], maxCount: 4 },
    { slot: 'armcare', share: 0.35, categories: ['암케어'], maxCount: 7 },
  ],
  recovery: [
    { slot: 'warmup', share: 0.3, categories: ['모빌리티'], maxCount: 4 },
    { slot: 'core', share: 0.15, categories: ['코어'], maxCount: 3 },
    { slot: 'prehab', share: 0.25, categories: ['회복 및 보강'], maxCount: 4 },
    { slot: 'armcare', share: 0.3, categories: ['암케어'], maxCount: 4 },
  ],
};

/**
 * 훈련 목표를 반영한 시간 배분을 만든다.
 *
 * 목표마다 구간에 곱하는 값이 있고(personalize.ts의 weights), 곱한 뒤 합이
 * 1이 되도록 다시 나눈다. 정규화를 빼먹으면 목표를 고른 것만으로 전체 운동
 * 시간이 늘거나 줄어든다 — "45분"이라고 해놓고 52분치를 주게 된다.
 *
 * 회복 데이는 목표와 상관없이 그대로 둔다. 몸을 지키려고 잡은 날인데
 * "구속 향상"을 골랐다고 파워 비중을 올리면 회복 데이의 뜻이 없어진다.
 */
export function compositionFor(theme: ThemeKey, goalName: string | null): SlotSpec[] {
  const base = COMPOSITIONS[theme];
  if (theme === 'recovery') return base;

  const goal = findGoal(goalName);
  const weighted = base.map((spec) => ({
    spec,
    share: spec.share * goal.weights[spec.slot],
  }));
  const total = weighted.reduce((sum, w) => sum + w.share, 0);

  return weighted.map(({ spec, share }) => ({ ...spec, share: share / total }));
}

/** 테마를 반영해 실제로 쓸 시간을 정한다. 회복 데이는 길게 잡아도 줄인다. */
export function effectiveMinutes(theme: ThemeKey, requested: number): number {
  return theme === 'recovery' ? Math.min(requested, RECOVERY_MAX_MINUTES) : requested;
}

export type ThemedExercise = {
  id: string;
  category: string;
  intensity: string;
  bodyParts: string[];
} & Partial<Prescription>;

export type ThemedPick<T> = { exercise: T; slot: SlotKey };

/** 워밍업 구간에 들어갈 수 있는가 — 모빌리티이거나 스트레칭 수준 강도 */
function isWarmup(ex: ThemedExercise): boolean {
  return ex.category === '모빌리티' || intensityLevel(ex.intensity) <= 1;
}

/**
 * 완료된 운동을 어느 구간에 되돌려 놓을지 정한다.
 *
 * 반드시 이 테마에 실제로 있는 구간을 돌려줘야 한다. 없는 구간 이름을 주면
 * 그 운동은 목록에서 조용히 사라지고, 사용자는 잘못 누른 체크를 풀 수 없다.
 *
 * 예전에는 맞는 구간이 없으면 무조건 'main'을 줬는데, 회복 데이에는 본운동
 * 구간이 없다. 하체 운동을 마친 뒤 통증을 입력해 테마가 회복으로 바뀌면
 * 방금 체크한 운동이 사라졌다.
 */
function slotOf(ex: ThemedExercise, specs: SlotSpec[]): SlotKey {
  if (isWarmup(ex) && specs.some((s) => s.slot === 'warmup')) return 'warmup';
  for (const spec of specs) {
    if (spec.slot !== 'warmup' && spec.categories.includes(ex.category)) return spec.slot;
  }
  // 맞는 구간이 없으면 본운동에, 본운동이 없는 테마라면 첫 구간에 둔다.
  return (specs.find((s) => s.slot === 'main') ?? specs[0]).slot;
}

/**
 * 테마와 시간에 맞춰 오늘의 운동을 고른다.
 *
 * 반환 순서는 화면 순서와 같다: 워밍업 → 본운동 → 코어 → 보강 → 암케어.
 */
export function pickForTheme<T extends ThemedExercise>({
  candidates,
  theme,
  minutes,
  doneIds,
  recentIds,
  preferredParts = [],
  goal = null,
}: {
  candidates: T[];
  theme: ThemeKey;
  /** 오늘 쓸 운동 시간(분). effectiveMinutes 를 거친 값을 넣는다. */
  minutes: number;
  /** 오늘 이미 완료한 것 — 목록에서 사라지면 안 된다 */
  doneIds: Set<string>;
  /** 최근 며칠 안에 한 것 — 빼지는 않고 뒤로 미룬다 */
  recentIds?: Set<string>;
  /** 오늘 하고 싶다고 고른 부위 — 본운동 안에서 앞으로 당긴다 */
  preferredParts?: string[];
  /** 훈련 목표 — 구간별 시간 배분과 본운동 순서를 바꾼다 */
  goal?: string | null;
}): { picks: ThemedPick<T>[]; estimatedMinutes: number; notes: string[] } {
  const specs = compositionFor(theme, goal);
  const goalPrefer: readonly string[] = findGoal(goal).prefer;
  const notes: string[] = [];

  /*
   * 최근에 한 것을 뒤로 보낸다. 빼지 않는 이유는 예전과 같다 —
   * 후보가 적은 날에 빼버리면 줄 것이 없다.
   */
  const recent = recentIds ?? new Set<string>();
  const ordered =
    recent.size > 0
      ? [
          ...candidates.filter((ex) => !recent.has(ex.id)),
          ...candidates.filter((ex) => recent.has(ex.id)),
        ]
      : candidates;

  const taken = new Set<string>();
  const bySlot = new Map<SlotKey, T[]>(specs.map((s) => [s.slot, []]));

  // 1) 오늘 이미 완료한 운동은 자기 구간에 먼저 넣는다. 사라지면 체크를 못 푼다.
  for (const ex of ordered) {
    if (!doneIds.has(ex.id)) continue;
    // slotOf 는 이 테마에 있는 구간만 돌려주므로 여기서 못 찾는 일은 없다.
    bySlot.get(slotOf(ex, specs))!.push(ex);
    taken.add(ex.id);
  }

  const wanted = new Set(preferredParts);

  // 2) 구간마다 배분된 시간이 찰 때까지 운동을 넣는다.
  for (const spec of specs) {
    const chosen = bySlot.get(spec.slot)!;
    const budget = minutes * spec.share;

    let pool = ordered.filter((ex) =>
      spec.slot === 'warmup'
        ? isWarmup(ex)
        : !isWarmup(ex) && spec.categories.includes(ex.category)
    );

    /*
     * 본운동 안의 순서를 정한다. 목표를 먼저 반영하고, 그 위에 오늘 고른
     * 부위를 얹는다. 둘 다 나누기만 하고 순서를 뒤섞지 않으므로(안정 분할),
     * 오늘 고른 부위 안에서도 목표에 맞는 것이 앞에 남는다.
     *
     * 오늘 고른 부위를 나중에 얹는 이유는, 그쪽이 오늘 하루의 선택이라
     * 오래 두고 정한 목표보다 우선해야 하기 때문이다.
     */
    if (spec.slot === 'main' && goalPrefer.length > 0) {
      pool = [
        ...pool.filter((ex) => goalPrefer.includes(ex.category)),
        ...pool.filter((ex) => !goalPrefer.includes(ex.category)),
      ];
    }
    if (spec.slot === 'main' && wanted.size > 0) {
      pool = [
        ...pool.filter((ex) => ex.bodyParts.some((p) => wanted.has(p))),
        ...pool.filter((ex) => !ex.bodyParts.some((p) => wanted.has(p))),
      ];
    }

    /*
     * 배분된 시간이 찰 때까지 넣는다.
     *
     * 딱 맞아떨어지는 일은 거의 없으므로, 남은 시간에 그 운동의 절반 이상이
     * 들어가면 넣는다. 그렇게 하지 않으면 8분이 남았는데 9분짜리가 안 들어가
     * 시간이 그냥 버려진다. 넘치더라도 절반을 넘기지는 않는다.
     *
     * 자리를 못 찾으면 다음 운동을 계속 본다(멈추지 않는다). 긴 운동이 안
     * 들어갈 때 짧은 운동으로 남은 시간을 채울 수 있어서다.
     */
    let used = chosen.reduce((sum, ex) => sum + estimateMinutes(ex), 0);
    const fits = (cost: number) => chosen.length === 0 || used + cost / 2 <= budget;

    for (const ex of pool) {
      if (chosen.length >= spec.maxCount) break;
      if (taken.has(ex.id)) continue;
      const cost = estimateMinutes(ex);
      if (!fits(cost)) continue;
      chosen.push(ex);
      taken.add(ex.id);
      used += cost;
    }

    /*
     * 본운동에 넣을 것이 하나도 없으면 다른 운동으로라도 채운다.
     * 그리고 그 사실을 적어둔다 — 조용히 빈약해지는 것이 최악이다.
     */
    if (chosen.length === 0 && spec.slot === 'main') {
      const label = SLOT_LABELS[spec.slot].label;
      for (const ex of ordered) {
        if (taken.has(ex.id) || isWarmup(ex)) continue;
        const cost = estimateMinutes(ex);
        if (!fits(cost)) continue;
        chosen.push(ex);
        taken.add(ex.id);
        used += cost;
        if (chosen.length >= spec.maxCount) break;
      }
      if (chosen.length > 0) {
        notes.push(`${spec.categories.join('·')} 운동이 부족해 ${label}을 다른 운동으로 채웠습니다.`);
      }
    }
  }

  const picks: ThemedPick<T>[] = [];
  for (const slot of SLOT_ORDER) {
    for (const ex of bySlot.get(slot) ?? []) picks.push({ exercise: ex, slot });
  }

  const estimatedMinutes = Math.round(
    picks.reduce((sum, p) => sum + estimateMinutes(p.exercise), 0)
  );

  return { picks, estimatedMinutes, notes };
}
