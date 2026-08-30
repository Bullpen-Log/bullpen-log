import {
  intensityLevel,
  minutesForSets,
  type Prescription,
} from '@/lib/exercise-meta';
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
export const WORKOUT_MINUTES_CHOICES = [15, 20, 30, 45, 60, 90] as const;

/** 프로필에서 아직 고르지 않은 사용자의 기본값 */
export const DEFAULT_WORKOUT_MINUTES = 45;

/**
 * 회복 데이의 시간 상한.
 * 90분을 골라둔 사용자라도 회복이 목적인 날 90분을 시키면 회복이 아니다.
 */
export const RECOVERY_MAX_MINUTES = 35;

/**
 * 운동 하나에 걸리는 대략의 시간(분).
 *
 * 세트 단위로 센다 — (세트당 시간 × 세트 수). 세트당 시간은 실제 수행 시간에
 * 세트 사이 휴식을 더한 값이다(lib/exercise-meta.ts의 secondsPerSet).
 *
 * 세트 단위로 두는 이유가 있다. 나중에 "3세트 짜줬는데 2세트만 했다"를 그대로
 * 계산해야 하기 때문이다. 부하는 계획이 아니라 실제로 한 만큼이어야 한다.
 * sets 를 주면 그 세트 수로, 안 주면 운동에 적힌 기본 세트로 센다.
 *
 * 아직 세트·횟수를 안 채운 운동은 종류와 강도로 어림한다.
 */
export function estimateMinutes(
  ex: { category: string; intensity: string } & Partial<Prescription>,
  sets?: number
): number {
  const measured = minutesForSets(ex, sets);
  if (measured != null) return measured;

  const level = intensityLevel(ex.intensity);
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

/**
 * 오늘 고른 운동 종류 때문에 몸 상태와 부딪히는가.
 *
 * 부딪히면 기본은 가벼운 쪽으로 준다. 다만 막지는 않는다 — 사용자가 알고도
 * 원하면 원한 대로 준다. 이 함수는 '무엇이 걸렸는지'만 말하고, 무엇을 줄지는
 * decideTheme 이 정한다.
 *
 * 통증은 여기서 다루지 않는다. 그것만은 고를 수 있는 것이 아니다.
 */
export function workoutConflict({
  facts,
  preferredWorkout,
}: {
  facts: ReportFacts;
  preferredWorkout: string | null;
}): { reason: string; fallback: ThemeKey } | null {
  // 회복을 원했으면 부딪힐 일이 없다. 가벼운 쪽으로 가는 것은 언제나 괜찮다.
  if (preferredWorkout == null || preferredWorkout === '회복') return null;

  if (facts.load.zone === 'danger') {
    return { reason: '투구 부하가 위험 구간입니다', fallback: 'recovery' };
  }
  const condition = facts.condition.today?.condition;
  if (condition != null && condition <= LOW_CONDITION_THRESHOLD) {
    return { reason: `오늘 컨디션이 ${condition}/10입니다`, fallback: 'recovery' };
  }
  if (facts.load.zone === 'caution') {
    return { reason: '투구 부하가 주의 구간입니다', fallback: 'assist' };
  }
  return null;
}

export function decideTheme({
  facts,
  plan,
  lastLowerKey,
  lastUpperKey,
  preferredWorkout = null,
  override = false,
}: {
  facts: ReportFacts;
  plan: PitchPlan;
  /** 최근 2주 안에 하체 스트렝스를 완료한 마지막 날 (없으면 null) */
  lastLowerKey: string | null;
  /** 최근 2주 안에 상체 스트렝스를 완료한 마지막 날 (없으면 null) */
  lastUpperKey: string | null;
  /** 오늘 체크인에서 고른 운동 종류 — 파워 / 웨이트 / 회복 */
  preferredWorkout?: string | null;
  /**
   * 몸 상태 경고를 보고도 원한 대로 받겠다고 했는가.
   *
   * 최종 선택은 사용자 몫이라는 원칙에서 나온 값이다. 우리는 왜 가벼운 쪽을
   * 권하는지 말하고, 그래도 하겠다면 하게 한다. 통증만은 예외다.
   */
  override?: boolean;
}): SessionTheme {
  /*
   * 1) 통증은 고를 수 있는 것이 아니다. 무엇을 골랐든, 밀고 나가겠다고 해도
   *    여기서 멈춘다.
   *
   * halted 는 통증 때문에만 켜진다 — 오늘 통증이 있거나, 최근 통증이 있었는데
   * 오늘 상태를 모르거나. 처음에는 recovering 만 봤는데, 그러면 '오늘 통증'인
   * 사람에게 상체 스트렝스 데이가 나왔다. 실제로는 그 앞에서 처방이 멈춰
   * 아무것도 안 나오지만, 이 함수가 혼자 불려도 맞는 답을 내야 한다.
   * (자가 시험이 잡았다.)
   */
  if (plan.halted || plan.recovering) {
    return {
      key: 'recovery',
      label: '회복·재생 데이',
      reason: plan.halted
        ? '통증 기록이 있어 재생과 가동성 외에는 권하지 않습니다.'
        : '최근 통증 기록이 있어 재생과 가동성 위주로 구성했습니다.',
    };
  }

  // 2) 회복을 골랐으면 몸이 좋아도 회복으로 간다. 쉬겠다는데 말릴 이유가 없다.
  if (preferredWorkout === '회복') {
    return {
      key: 'recovery',
      label: '회복·재생 데이',
      reason: '오늘은 회복 위주로 하고 싶다고 하셔서 그렇게 구성했습니다.',
    };
  }

  /*
   * 3) 몸 상태가 걸리면 가벼운 쪽으로 권한다.
   *
   * 아무것도 안 골랐으면(추천대로) 권하는 대로 간다. 골랐는데 부딪히면,
   * 알고도 원한 경우에만 원한 대로 준다.
   */
  const conflict = workoutConflict({ facts, preferredWorkout });
  const forcing = conflict != null && override;

  if (!forcing) {
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
    if (facts.load.zone === 'caution') {
      return {
        key: 'assist',
        label: '보조·코어 데이',
        reason: '투구 부하가 주의 구간이라 무게 대신 코어와 암케어에 집중합니다.',
      };
    }
  }

  /** 몸 상태 경고를 넘기고 온 날에는 그 사실을 이유에 붙인다. */
  const forcedNote = forcing
    ? ` ${conflict.reason}만, 그래도 하겠다고 하셔서 그대로 만들었습니다. 무리가 오면 바로 멈추세요.`
    : '';

  /*
   * 오늘 던진 날이면 그 이야기를 먼저 한다.
   *
   * 운동을 고를 때 투구량은 실제로 보고 있다 — 부하가 높으면 무게를 다루는
   * 운동이 후보에서 빠진다. 그런데 화면에 적히는 이유는 '상체 다음은 하체'
   * 하나뿐이라, 60구를 던지고 온 사람에게 웨이트를 시키는 것처럼 보였다.
   * 감안했다는 사실이 안 보이면 감안하지 않은 것과 같다.
   */
  const threwToday =
    facts.patterns.restDays === 0 && (facts.patterns.lastOutingPitches ?? 0) > 0;
  const todayNote = threwToday
    ? `오늘 ${facts.patterns.lastOutingPitches}구를 던지셨습니다. 그 부담을 빼고 골랐습니다. `
    : '';

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
          reason:
            todayNote +
            '부하가 적정 범위입니다. 투구의 힘은 하체에서 나옵니다.' +
            forcedNote,
        }
      : {
          key: 'upper',
          label: '상체 스트렝스 데이',
          reason:
            todayNote +
            '부하가 적정 범위라 상체 근력을 훈련하기 좋은 날입니다.' +
            forcedNote,
        };
  }
  if (lastLowerKey == null || (lastUpperKey != null && lastLowerKey < lastUpperKey)) {
    return {
      key: 'lower',
      label: '하체 스트렝스 데이',
      reason:
        todayNote +
        (lastUpperKey != null
          ? '최근에 상체를 했으니 오늘은 하체 차례입니다.'
          : '최근 하체 기록이 없어 하체부터 시작합니다.') +
        forcedNote,
    };
  }
  return {
    key: 'upper',
    label: '상체 스트렝스 데이',
    reason:
      todayNote +
      (lastLowerKey != null
        ? '최근에 하체를 했으니 오늘은 상체 차례입니다.'
        : '최근 상체 기록이 없어 상체부터 시작합니다.') +
      forcedNote,
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
  /*
   * 보조 데이는 개수 상한을 넉넉히 둔다. 코어·암케어는 하나에 4분 안팎이라,
   * 90분을 부탁하면 상한에 먼저 걸려 74분밖에 안 나왔다.
   */
  assist: [
    { slot: 'warmup', share: 0.15, categories: ['모빌리티'], maxCount: 6 },
    { slot: 'main', share: 0.35, categories: ['코어'], maxCount: 9 },
    { slot: 'prehab', share: 0.15, categories: ['회복 및 보강'], maxCount: 5 },
    { slot: 'armcare', share: 0.35, categories: ['암케어'], maxCount: 9 },
  ],
  recovery: [
    { slot: 'warmup', share: 0.3, categories: ['모빌리티'], maxCount: 4 },
    { slot: 'core', share: 0.15, categories: ['코어'], maxCount: 3 },
    { slot: 'prehab', share: 0.25, categories: ['회복 및 보강'], maxCount: 4 },
    { slot: 'armcare', share: 0.3, categories: ['암케어'], maxCount: 4 },
  ],
};

/**
 * 짧은 날에 먼저 빼는 구간.
 *
 * 워밍업·본운동·암케어는 남긴다. 몸을 열지 않고 시작하거나 어깨를 안 챙기고
 * 끝내는 것은 시간이 없다고 해서 할 일이 아니고, 본운동은 그날의 목적이다.
 */
const OPTIONAL_SLOTS: SlotKey[] = ['core', 'prehab'];

/**
 * 이 시간 아래로는 구간을 줄인다.
 *
 * 구간마다 적어도 하나는 들어가야 하는데, 다섯 구간이면 그것만으로 30분을
 * 넘는다. 실제로 30분을 부탁하면 35분이 나왔다. 시간이 짧은 날에 다섯 블록을
 * 다 넣는 트레이너는 없다 — 몸 풀고, 오늘 할 것 하고, 어깨 챙기고 끝낸다.
 */
const SHORT_SESSION_MINUTES = 32;

/**
 * 훈련 목표를 반영한 시간 배분을 만든다.
 *
 * 목표마다 구간에 곱하는 값이 있고(personalize.ts의 weights), 곱한 뒤 합이
 * 1이 되도록 다시 나눈다. 정규화를 빼먹으면 목표를 고른 것만으로 전체 운동
 * 시간이 늘거나 줄어든다 — "45분"이라고 해놓고 52분치를 주게 된다.
 *
 * 회복 데이는 목표를 반영하지 않는다. 몸을 지키려고 잡은 날인데 '파워 향상'을
 * 골랐다고 파워 비중을 올리면 회복 데이의 뜻이 없어진다. 다만 짧은 날에
 * 구간을 줄이는 것은 회복 데이에도 똑같이 한다.
 */
export function compositionFor(
  theme: ThemeKey,
  goalName: string | null,
  minutes?: number
): SlotSpec[] {
  let base: readonly SlotSpec[] = COMPOSITIONS[theme];

  /*
   * 짧은 날은 구간을 줄인다. 남는 구간이 없어지지 않게 최소 둘은 지킨다.
   *
   * 회복 데이는 줄이지 않는다. 코어와 보강이 곁가지가 아니라 그날의 내용이고,
   * 회복 운동은 하나에 3~4분이라 다 넣어도 시간이 안 넘친다. 실제로 빼봤더니
   * 30분을 부탁했는데 19분치밖에 안 나왔다.
   */
  if (theme !== 'recovery' && minutes != null && minutes < SHORT_SESSION_MINUTES) {
    const kept = base.filter((spec) => !OPTIONAL_SLOTS.includes(spec.slot));
    if (kept.length >= 2) base = kept;
  }

  const goal = theme === 'recovery' ? null : findGoal(goalName);
  const weighted = base.map((spec) => ({
    spec,
    share: spec.share * (goal ? goal.weights[spec.slot] : 1),
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
  /**
   * 몸을 어떤 방식으로 쓰는가 — 힌지·스쿼트·런지·밀기·당기기·회전·운반.
   *
   * 한 구간에 같은 계열이 몰리지 않게 하는 데 쓴다. 비어 있으면 따지지 않는다 —
   * 스트레칭이나 종아리처럼 이 축으로 가를 것이 없는 운동이 많다.
   */
  movementPattern?: string | null;
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
export function slotOf(ex: ThemedExercise, specs: SlotSpec[]): SlotKey {
  if (isWarmup(ex) && specs.some((s) => s.slot === 'warmup')) return 'warmup';
  for (const spec of specs) {
    if (spec.slot !== 'warmup' && spec.categories.includes(ex.category)) return spec.slot;
  }
  // 맞는 구간이 없으면 본운동에, 본운동이 없는 테마라면 첫 구간에 둔다.
  return (specs.find((s) => s.slot === 'main') ?? specs[0]).slot;
}

/**
 * 사용자가 직접 더한 운동을 어느 구간에 놓을지.
 *
 * 만들어 준 목록을 그대로 하는 사람은 없다. 빼기도 하고 더하기도 하는데,
 * 더한 것도 자기 자리에 들어가야 순서(워밍업 → 본운동 → …)가 뜻을 잃지 않는다.
 * 목표는 구간의 시간 배분을 정하는 값이라 여기서는 보지 않는다 — 자리만 정한다.
 */
export function slotForTheme(ex: ThemedExercise, theme: ThemeKey): SlotKey {
  return slotOf(ex, COMPOSITIONS[theme]);
}

/**
 * 구간마다 배분된 시간을 넘겨도 되는 한도(분).
 *
 * 딱 맞아떨어지는 일이 거의 없어 조금은 넘겨야 한다. 다섯 구간이 각자 조금씩
 * 넘치므로 크게 잡으면 안 된다 — 2분씩 다섯이면 벌써 10분이다.
 */
const SLOT_SLACK_MINUTES = 1.5;

/**
 * 하루 전체로 넘겨도 되는 한도(분).
 *
 * 구간마다 봐주는 것만으로는 부족했다. 1.5분씩 다섯 구간이면 7.5분인데,
 * 90분에는 8%지만 30분에는 25%다. 실제로 30분을 부탁하면 37분이 나왔다.
 *
 * 고른 시간에 비례해서 줄인다. 3분을 그대로 두면 15분을 부탁한 사람에게는
 * 20%가 되어 또 같은 문제가 된다.
 */
function totalSlack(minutes: number): number {
  return Math.min(3, minutes * 0.12);
}

/**
 * 한 번 한 운동을 몇 세션 뒤부터 다시 내보낼 수 있다고 볼 것인가.
 *
 * 예전에는 안 해본 운동이 언제나 앞이라, 445개를 거의 다 소진할 때까지 같은
 * 운동이 다시 나오지 않았다. 그러면 "지난번 몇 kg 들었나"를 견줄 수가 없다 —
 * 재보니 사회인 사용자는 1년을 써도 본운동의 18%만 견줄 것이 있었다.
 *
 * 날이 아니라 세션으로 센다. 날로 세면 매일 하는 사람과 주 2회 하는 사람에게
 * 전혀 다른 뜻이 되기 때문이다(lib/report/gather.ts 에 자세히).
 *
 * 여섯인 이유 — 1년치를 두 사람으로 재고 골랐다(npm run rotation:check).
 * 주 2~3회 하는 사람에게 두어 주에 한 번꼴이라, 지난번 무게가 아직 기억나는
 * 간격이다. 더 짧게 하면 후보가 좁아져 같은 계열 동작이 몰린다.
 */
const RETURN_SESSIONS = 6;

/**
 * 후보를 어떤 순서로 볼지 정한다.
 *
 * 예전에는 "최근 사흘 안에 했나"만 보고 그것만 뒤로 보냈다. 그런데 사흘이
 * 지나면 다시 맨 앞으로 돌아오므로, 등록순 앞자리 몇 개가 영원히 돌았다.
 * 두 달에 라이브러리 415개 중 29개(7%)만 화면에 나왔다.
 *
 * 지금은 네 무리로 나눈 뒤, 앞의 둘을 번갈아 낸다.
 *
 *   ① 돌아올 때가 된 것   여섯 세션 넘게 안 한 것 — 오래된 것부터
 *   ② 아직 안 해본 것     날마다 다른 순서로 섞어서
 *   ③ 아직 이른 것        여섯 세션이 안 지난 것 — 뒤로
 *   ④ 최근 사흘에 한 것   맨 뒤. 회복 규칙은 그대로 지킨다
 *
 * ①과 ②를 번갈아 내는 것이 핵심이다. 처음에는 한 줄로 세워 보았는데 — 안 해본
 * 것을 "N세션 전에 한 셈"으로 쳐서 함께 정렬했다 — 그 값을 얼마로 잡느냐가
 * 두 가지를 한꺼번에 정해 버렸다. 라이브러리가 굳지 않을 만큼 크게 잡으면
 * 실제 재등장은 마흔 세션 뒤에나 일어나, 처음 몇 달은 견줄 기록이 하나도 없었다
 * (첫 서른 세션에 7%). 번갈아 내면 둘이 따로 논다 — 같은 조건에서 55%.
 *
 * 빼지는 않는다. 후보가 적은 날에 빼버리면 줄 것이 없어진다.
 */
function orderCandidates<T extends ThemedExercise>(
  candidates: T[],
  {
    recentIds,
    sessionsAgo,
    rotationSeed,
  }: { recentIds: Set<string>; sessionsAgo: Map<string, number>; rotationSeed?: string }
): T[] {
  if (recentIds.size === 0 && sessionsAgo.size === 0 && rotationSeed == null) {
    return candidates;
  }

  const due: T[] = [];
  const fresh: T[] = [];
  const early: T[] = [];
  const recent: T[] = [];

  for (const ex of candidates) {
    if (recentIds.has(ex.id)) {
      recent.push(ex);
      continue;
    }
    const ago = sessionsAgo.get(ex.id);
    if (ago == null) fresh.push(ex);
    else if (ago >= RETURN_SESSIONS) due.push(ex);
    else early.push(ex);
  }

  /*
   * 씨앗이 없으면 모두 0이라 원래 순서가 그대로 남는다(정렬이 안정적이다).
   * 시험 스크립트가 등록순을 못박고 견주는 곳이 있어 그 자리를 지킨다.
   */
  const seedOf = (ex: T) => (rotationSeed ? mix(ex.id, rotationSeed) : 0);
  const byAge = (a: T, b: T) =>
    (sessionsAgo.get(b.id) ?? 0) - (sessionsAgo.get(a.id) ?? 0) || seedOf(a) - seedOf(b);

  due.sort(byAge);
  early.sort(byAge);
  fresh.sort((a, b) => seedOf(a) - seedOf(b));

  // 돌아올 것 하나, 처음 보는 것 하나 — 번갈아
  const mixed: T[] = [];
  for (let i = 0; i < Math.max(due.length, fresh.length); i++) {
    if (i < due.length) mixed.push(due[i]);
    if (i < fresh.length) mixed.push(fresh[i]);
  }

  return [...mixed, ...early, ...recent];
}

/**
 * 글자 두 개를 섞어 숫자 하나로 (FNV-1a).
 *
 * 아무 숫자나 만들려는 것이 아니라, 같은 입력에는 늘 같은 값이 나와야 한다 —
 * 만들어 둔 일정을 저녁에 다시 열었을 때 순서가 달라지면 안 된다.
 *
 * 씨앗을 앞에 붙인다. 뒤에 붙였더니 8월 30일과 8월 31일이 완전히 같은 순서를
 * 냈다. 마지막 글자만 다르면 모든 값이 똑같은 만큼 밀리는데, 똑같이 밀면
 * 순서는 그대로다. 앞에 두면 그 차이가 뒤따르는 계산을 모두 지나며 흩어진다.
 * (이어진 날끼리 자리가 그대로일 확률: 뒤에 붙일 때 22%, 앞에 붙이면 1%.)
 */
function mix(id: string, seed: string): number {
  let h = 0x811c9dc5;
  const text = `${seed}:${id}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
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
  sessionsAgo,
  rotationSeed,
  preferredParts = [],
  preferredWorkout = null,
  goal = null,
}: {
  candidates: T[];
  theme: ThemeKey;
  /** 오늘 쓸 운동 시간(분). effectiveMinutes 를 거친 값을 넣는다. */
  minutes: number;
  /** 오늘 이미 완료한 것 — 목록에서 사라지면 안 된다 */
  doneIds: Set<string>;
  /** 최근 며칠 안에 한 것 — 빼지는 않고 뒤로 미룬다(회복 규칙) */
  recentIds?: Set<string>;
  /**
   * 운동별로 몇 세션 전에 했는가. 오래 안 한 것부터 내보낸다.
   *
   * 없으면 예전처럼 등록순으로 간다. 시험 스크립트가 순서를 못박고 견주는
   * 곳이 있어 기본값을 바꾸지 않는다.
   */
  sessionsAgo?: Map<string, number>;
  /**
   * 아직 안 해본 운동들의 순서를 섞는 씨앗.
   *
   * 보통은 오늘 날짜를 넣는다 — 그러면 날마다 다른 순서가 나오고, 같은 날에는
   * 늘 같은 순서라 만들어 둔 일정이 안 바뀐다. 이것이 없으면 완료 표시를 안
   * 하는 사람은 매일 똑같은 일곱 개를 받는다.
   *
   * 날짜가 아니어도 된다. '다시 만들기'는 여기에 지금 일정을 섞어 넣어, 같은
   * 날에도 다른 목록이 나오게 한다.
   */
  rotationSeed?: string;
  /** 오늘 하고 싶다고 고른 부위 — 본운동 안에서 앞으로 당긴다 */
  preferredParts?: string[];
  /**
   * 오늘 하고 싶다고 고른 운동 종류 — 파워 / 웨이트.
   *
   * 본운동은 스트렝스와 파워가 섞인 자리라, 고른 쪽을 앞으로 당긴다.
   * '회복'은 여기 오지 않는다 — 그건 테마 자체를 회복으로 바꾼다.
   */
  preferredWorkout?: string | null;
  /** 훈련 목표 — 구간별 시간 배분과 본운동 순서를 바꾼다 */
  goal?: string | null;
}): { picks: ThemedPick<T>[]; estimatedMinutes: number; notes: string[] } {
  const specs = compositionFor(theme, goal, minutes);
  const goalPrefer: readonly string[] = findGoal(goal).prefer;
  const notes: string[] = [];

  /*
   * 본운동에서 먼저 볼 카테고리.
   *
   * '웨이트'는 이 테마의 스트렝스를 뜻한다 — 하체 데이면 하체 스트렝스,
   * 상체 데이면 상체 스트렝스. 회복·보조 데이에는 본운동에 스트렝스가 없으므로
   * 아무것도 하지 않는다.
   */
  const mainFirst =
    preferredWorkout === '파워'
      ? '파워'
      : preferredWorkout === '웨이트'
        ? theme === 'lower'
          ? '하체 스트렝스'
          : theme === 'upper'
            ? '상체 스트렝스'
            : null
        : null;

  const ordered = orderCandidates(candidates, {
    recentIds: recentIds ?? new Set<string>(),
    sessionsAgo: sessionsAgo ?? new Map<string, number>(),
    rotationSeed,
  });

  const taken = new Set<string>();
  const bySlot = new Map<SlotKey, T[]>(specs.map((s) => [s.slot, []]));
  /** 여기까지 고른 것의 총 소요(분). 구간을 넘나들며 쌓인다. */
  let totalUsed = 0;

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
     * 마지막으로 오늘 고른 운동 종류를 얹는다.
     *
     * 제일 나중에 얹는 것이 제일 앞에 온다(안정 분할이라 앞의 순서는 그 안에서
     * 유지된다). 종류는 부위보다 큰 결정이다 — "오늘 하체"보다 "오늘 파워"가
     * 몸에 걸리는 부담을 더 크게 가른다.
     */
    if (spec.slot === 'main' && mainFirst != null) {
      pool = [
        ...pool.filter((ex) => ex.category === mainFirst),
        ...pool.filter((ex) => ex.category !== mainFirst),
      ];
    }

    /*
     * 배분된 시간이 찰 때까지 넣는다.
     *
     * 딱 맞아떨어지는 일은 거의 없으므로 조금 넘치는 것은 받아들인다. 그렇게
     * 하지 않으면 8분이 남았는데 9분짜리가 안 들어가 시간이 그냥 버려진다.
     *
     * 넘겨도 되는 양은 분으로 못박는다. 예전에는 '그 운동의 절반'까지 봐줬는데,
     * 그건 운동이 7~10분씩 하던 때 정한 값이다. 세트 수를 운동 성격에 맞게
     * 나눈 뒤로는 1분짜리 스트레칭과 15분짜리 데드리프트가 같은 목록에 있어,
     * 절반을 봐주면 긴 운동 하나가 예산을 7분씩 넘겼다. 45분을 부탁했는데
     * 55분이 나왔다.
     *
     * 구간이 비는 것보다는 넘치는 편이 낫다. 첫 하나는 무조건 넣는다.
     *
     * 자리를 못 찾으면 다음 운동을 계속 본다(멈추지 않는다). 긴 운동이 안
     * 들어갈 때 짧은 운동으로 남은 시간을 채울 수 있어서다.
     */
    let used = chosen.reduce((sum, ex) => sum + estimateMinutes(ex), 0);
    totalUsed += used;
    /*
     * 구간에 배분된 시간과 하루 전체, 둘 다 봐야 한다. 구간만 보면 다섯이
     * 조금씩 넘쳐 30분이 37분이 된다.
     *
     * 구간의 첫 하나는 무조건 넣는다. 구간이 비는 것이 더 나쁘다.
     */
    const fits = (cost: number) =>
      used + cost <= budget + SLOT_SLACK_MINUTES &&
      totalUsed + cost <= minutes + totalSlack(minutes);

    /*
     * 같은 계열이 몰리지 않게 한다.
     *
     * 앞에서 이미 고른 것과 동작 계열이 겹치면 한 바퀴 미룬다. 스쿼트를 넣고
     * 나면 다음 자리는 힌지·런지 쪽을 먼저 본다는 뜻이다.
     *
     * 왜 필요한가. 카테고리(하체 스트렝스)만 맞으면 무엇이든 들어가던 때는
     * 60일 중 25일이 본운동을 무릎 계열로만 채웠다. 구속은 뒤쪽 사슬에서
     * 나오는데 그쪽이 통째로 빠지는 날이다.
     *
     * 막지는 않는다. 겹치지 않는 것이 하나도 안 남으면 겹쳐도 넣는다 —
     * 구간이 비는 것이 훨씬 나쁘다. 계열이 비어 있는 운동은 이 규칙을 지나간다.
     */
    const usedPatterns = new Set(
      chosen.map((ex) => ex.movementPattern).filter((p): p is string => !!p)
    );
    const clashes = (ex: T) =>
      ex.movementPattern != null && usedPatterns.has(ex.movementPattern);

    const remaining = pool.filter((ex) => !taken.has(ex.id));
    while (chosen.length < spec.maxCount) {
      const free = (ex: T) => !taken.has(ex.id);
      const canTake = (ex: T) => free(ex) && fits(estimateMinutes(ex));
      /*
       * 시간 안에 드는 것 중에서 계열이 안 겹치는 것 → 시간 안에 드는 것 →
       * (구간이 비었을 때만) 시간을 넘겨서라도 하나.
       *
       * 마지막 줄이 마지막 수단이라는 점이 중요하다. 예전에는 구간의 첫 하나를
       * 시간과 상관없이 넣었는데, 다섯 구간이 저마다 비싼 것을 하나씩 집어
       * 30분을 부탁하면 37분이 나왔다. 들어갈 것이 정말 없을 때만 넘긴다.
       */
      /*
       * 넘길 수밖에 없을 때는 가장 짧은 것으로 넘긴다.
       *
       * 순서상 첫 번째를 집으면 하필 12분짜리가 걸려 15분 일정이 19분이 됐다.
       * 어차피 넘길 거라면 조금만 넘기는 편이 맞다.
       */
      const cheapest = (pick: (ex: T) => boolean) =>
        remaining
          .filter(pick)
          .reduce<T | undefined>(
            (best, ex) =>
              best == null || estimateMinutes(ex) < estimateMinutes(best) ? ex : best,
            undefined
          );

      const next =
        remaining.find((ex) => canTake(ex) && !clashes(ex)) ??
        remaining.find(canTake) ??
        (chosen.length === 0
          ? (cheapest((ex) => free(ex) && !clashes(ex)) ?? cheapest(free))
          : undefined);
      if (next == null) break;
      chosen.push(next);
      taken.add(next.id);
      const spent = estimateMinutes(next);
      used += spent;
      totalUsed += spent;
      if (next.movementPattern) usedPatterns.add(next.movementPattern);
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
        totalUsed += cost;
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
