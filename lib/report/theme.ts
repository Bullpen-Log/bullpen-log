import {
  intensityLevel,
  minutesForSets,
  type Prescription,
} from '@/lib/exercise-meta';
import type { ReportFacts } from '@/lib/report/facts';
import { remainingRestDays, type PitchPlan } from '@/lib/report/plan';
import { findGoal, type GoalMix } from '@/lib/report/personalize';

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

/**
 * 고를 수 있는 하루 운동 시간(분).
 *
 * 120분은 실제로 채워지는 시간이 조금 모자란다 — 하체·상체는 101분쯤, 보조
 * 데이는 97분쯤이다. 워밍업·보강·암케어가 개수 상한에 먼저 차서, 늘어난 시간
 * 몫을 다 쓰지 못하기 때문이다.
 *
 * 상한을 올리거나 긴 시간의 배분을 다시 나누면 채울 수 있지만, 그러면 2시간
 * 훈련에 워밍업이 여덟 개가 되거나 짧은 시간대의 구성까지 함께 바뀐다.
 * 지금은 고를 수 있게만 두고, 실제로 나오는 시간이 조금 짧은 것은 그대로 둔다.
 */
export const WORKOUT_MINUTES_CHOICES = [45, 60, 90, 120] as const;

/**
 * 저장돼 있던 시간을 지금 고를 수 있는 값으로 맞춘다.
 *
 * 예전에는 15분·20분·30분도 고를 수 있었다. 그때 고른 값이 그대로 남아 있으면
 * 라디오에서 짝이 없어 아무것도 안 골라진 채로 뜬다 — 화면만 보면 시간을
 * 고르지 않은 것처럼 보인다. 짧은 쪽은 올려서, 긴 쪽은 내려서 가장 가까운
 * 값을 짚어준다.
 */
export function nearestMinutesChoice(minutes: number): number {
  const choices = WORKOUT_MINUTES_CHOICES as readonly number[];
  if (choices.includes(minutes)) return minutes;
  return choices.reduce((best, m) =>
    Math.abs(m - minutes) < Math.abs(best - minutes) ? m : best
  );
}

/** 프로필에서 아직 고르지 않은 사용자의 기본값 */
export const DEFAULT_WORKOUT_MINUTES = 45;

/**
 * 회복 데이에 쓸 시간의 비율과 상한.
 *
 * 예전에는 무조건 35분이었다. 시간 선택지가 15분부터였을 때는 그것으로 됐지만,
 * 45분부터로 바꾸고 나니 45분을 고른 사람과 90분을 고른 사람이 똑같이 35분을
 * 받게 됐다. 90분을 비워둔 사람에게 35분은 너무 적고, 45분을 고른 사람에게는
 * 줄인 티가 거의 안 났다.
 *
 * 그래서 고른 시간의 70%로 줄이되 40분을 넘기지 않는다. 회복이 목적인 날
 * 한 시간 가까이 시키면 그건 이미 회복이 아니고, 실제로 45분을 잡아보니
 * 회복 계열 운동만으로는 그만큼이 채워지지도 않았다(theme:check).
 */
export const RECOVERY_SHARE = 0.7;
export const RECOVERY_MAX_MINUTES = 40;

/**
 * 종목을 바꾸는 데 드는 시간(분).
 *
 * 세트 사이 휴식만 세고 있었다. 자리를 옮기고, 장비를 챙기고, 무게를 갈고,
 * 다음 것이 무엇인지 보는 시간이 통째로 빠져 있었다. 그래서 "59분"이라고
 * 계산한 60분 세션에 종목이 열넷 들어갔고, 실제로 하면 한 시간 반이 걸렸다.
 *
 * 무게를 드는 운동은 더 든다. 봉을 끼우고 원판을 갈고, 무엇보다 본세트 전에
 * 가벼운 무게로 두어 세트를 먼저 한다 — 앱이 그 준비 세트를 따로 세지 않으므로
 * 여기서 함께 먹는다.
 */
const HEAVY_CATEGORIES = ['상체 스트렝스', '하체 스트렝스', '파워'];
/** 무게를 드는 운동 */
export const HEAVY_TRANSITION_MINUTES = 4;
/** 나머지 — 매트를 옮기고 밴드를 바꾸는 정도 */
export const TRANSITION_MINUTES = 3;

function transitionFor(category: string): number {
  return HEAVY_CATEGORIES.includes(category)
    ? HEAVY_TRANSITION_MINUTES
    : TRANSITION_MINUTES;
}

/**
 * 운동 하나에 걸리는 대략의 시간(분).
 *
 * 세트 단위로 센다 — (세트당 시간 × 세트 수) + 종목을 바꾸는 시간. 세트당
 * 시간은 실제 수행 시간에 세트 사이 휴식을 더한 값이다(lib/exercise-meta.ts의
 * secondsPerSet).
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
  if (measured != null) return measured + transitionFor(ex.category);

  const level = intensityLevel(ex.intensity);
  /*
   * 세트·횟수가 아직 없는 운동 — 종류와 강도로 어림한다.
   * 이 값들은 이미 종목을 바꾸는 시간을 머금은 어림이라 따로 더하지 않는다.
   */
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
 * 마지막 등판의 여파가 오늘 훈련에 어떻게 걸리는가.
 *
 * 예전에는 던진 것이 훈련에 거의 안 걸렸다. 부하 지수(ACWR)가 강도 상한을
 * 낮추기는 했지만, 그건 4주 평균에 견주는 값이라 어제 82구를 던진 것이
 * 바로 반영되지 않는다. 그래서 어제 완투하고 온 사람에게 오늘 하체
 * 스트렝스 데이가 그대로 나왔다.
 *
 * 남은 휴식일로 센다. 투구 계획이 "오늘은 쉬세요"라고 말하는 그 값과 같은
 * 것을 본다(lib/report/plan.ts 의 remainingRestDays). 각자 계산하면 언젠가
 * 어긋난다 — 투구는 쉬라는데 훈련은 데드리프트를 내주는 식이다.
 *
 *   2일 이상 남음  큰 등판 직후 — 회복만
 *   1일 남음       코어·암케어까지
 *   0일            평소대로
 */
function outingStrain(facts: ReportFacts): {
  level: 0 | 1 | 2;
  pitches: number;
  daysAgo: number;
} {
  const remaining = remainingRestDays(facts.patterns);
  return {
    level: remaining >= 2 ? 2 : remaining >= 1 ? 1 : 0,
    pitches: facts.patterns.lastOutingPitches ?? 0,
    daysAgo: facts.patterns.restDays ?? 0,
  };
}

/** '오늘 82구를 던지셨습니다' / '어제 82구를 던지셨습니다' */
function outingPhrase(strain: { pitches: number; daysAgo: number }): string {
  const when =
    strain.daysAgo === 0 ? '오늘' : strain.daysAgo === 1 ? '어제' : `${strain.daysAgo}일 전`;
  return `${when} ${strain.pitches}구를 던지셨습니다`;
}

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

  /*
   * 등판 여파를 맨 앞에 본다.
   *
   * 부하 구간과 같은 결론(회복)에 이르더라도 이유가 다르다. 부하 지수는 4주
   * 평균에 견준 값이라 "위험 구간"이라고만 하면 왜 그런지 알 수 없다.
   * "어제 90구를 던지셨습니다"는 원인을 그대로 말한다.
   */
  const strain = outingStrain(facts);
  if (strain.level === 2) {
    return { reason: outingPhrase(strain), fallback: 'recovery' };
  }
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
  if (strain.level === 1) {
    return { reason: outingPhrase(strain), fallback: 'assist' };
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
    /*
     * 등판 여파를 맨 앞에 본다.
     *
     * 부하 지수는 4주 평균에 견주는 값이라 어제 90구가 바로 반영되지 않고,
     * 반영되더라도 "위험 구간"이라고만 하면 왜 그런지 알 수 없다. 던진 것이
     * 원인이면 그것을 그대로 말하는 편이 낫다.
     */
    const strain = outingStrain(facts);
    if (strain.level === 2) {
      return {
        key: 'recovery',
        label: '회복·재생 데이',
        reason: `${outingPhrase(strain)}. 아직 회복할 시간이 필요해 가볍게만 구성했습니다.`,
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
    if (facts.load.zone === 'caution') {
      return {
        key: 'assist',
        label: '보조·코어 데이',
        reason: '투구 부하가 주의 구간이라 무게 대신 코어와 암케어에 집중합니다.',
      };
    }
    if (strain.level === 1) {
      return {
        key: 'assist',
        label: '보조·코어 데이',
        reason: `${outingPhrase(strain)}. 하체는 빼고 코어와 어깨 관리 위주로 잡았습니다.`,
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
  /**
   * 이 구간에 들어올 수 있는 파워 운동의 동작 계열.
   *
   * 파워 53개는 몸 쓰는 방향이 제각각이다 — 스쿼트 점프 22개는 하체이고,
   * 메디신볼 던지기 계열(밀기·당기기·회전) 10개는 상체다. 그런데 상체날
   * 본운동이 '상체 스트렝스 + 파워'라 스쿼트 점프가 그 자리를 채웠다.
   * 실제로 재보니 상체날 본운동의 43%가 파워였고 그 76%가 하체 점프였다.
   *
   * 그러면 상체 스트렝스가 하루에 하나밖에 안 들어가고, 밀기와 당기기를
   * 가를 수가 없다 — 상체날 50일 중 스트렝스가 둘 이상인 날이 10일뿐이었다.
   *
   * 계열이 비어 있는 파워는 지나간다. 막아버리면 영영 안 나온다.
   */
  powerPatterns?: readonly string[];
};

/*
 * 테마별 시간 배분표.
 *
 * 파워는 따로 자리를 만들지 않고 스트렝스 데이의 본운동에 섞는다.
 * 파워 운동이 6개뿐이라 전용 데이를 만들면 구성이 빈약하고,
 * 부하가 좋은 날에만 안전 필터를 통과하므로 자연스럽게 좋은 날에만 나온다.
 * 영상이 더 채워지면 전용 테마로 승격하면 된다.
 */
/*
 * 하체날·상체날은 세 구간만 쓴다 — 워밍업 · 본운동 · 암케어.
 *
 * 예전에는 코어와 보강까지 다섯 구간을 다 채웠다. 그러니 한 시간에 아홉
 * 종목이 되고, 정작 무게를 드는 운동은 셋뿐이었다. 한 시간에 종목 아홉을
 * 3세트씩 하는 사람은 없다.
 *
 * 하는 일 기준으로 자른다. 웨이트 하는 날은 무게를 들고, 어깨는 매일 챙긴다.
 * 코어와 고관절 보강은 보조 데이와 회복 데이가 맡는다 — 투구가 많아 무게를
 * 못 드는 날에 할 일이 그쪽이다.
 *
 * 빠진 몫(코어 0.12 + 보강 0.08)은 본운동과 암케어로 갔다.
 */
/**
 * '부상 방지'를 고른 날의 구성.
 *
 * 무게를 드는 운동과 파워를 통째로 뺀다. 몸을 지키려고 고른 날인데 스쿼트와
 * 점프가 나오면 목표와 반대다. 예전에는 본운동을 0.7배로 줄이기만 했는데,
 * 줄인 것도 결국 무게를 드는 운동이었다.
 *
 * 남는 것은 몸 풀기 · 코어 · 고관절 보강 · 어깨 관리다. 하체날이든 상체날이든
 * 같다 — 이 날은 부위를 나눠 하는 날이 아니다.
 */
const PREVENTION_COMPOSITION: SlotSpec[] = [
  { slot: 'warmup', share: 0.15, categories: ['모빌리티'], maxCount: 3 },
  { slot: 'core', share: 0.25, categories: ['코어'], maxCount: 4 },
  { slot: 'prehab', share: 0.3, categories: ['회복 및 보강'], maxCount: 5 },
  { slot: 'armcare', share: 0.3, categories: ['암케어'], maxCount: 5 },
];

/** 이 목표를 고르면 구성 자체가 달라진다 */
const PREVENTION_GOAL = '부상 방지';

const COMPOSITIONS: Record<ThemeKey, SlotSpec[]> = {
  lower: [
    { slot: 'warmup', share: 0.1, categories: ['모빌리티'], maxCount: 2 },
    {
      slot: 'main',
      share: 0.7,
      categories: ['하체 스트렝스', '파워'],
      /* 하체날의 파워는 뛰고 미는 계열만 */
      powerPatterns: ['스쿼트', '런지', '힌지'],
      maxCount: 8,
    },
    { slot: 'armcare', share: 0.2, categories: ['암케어'], maxCount: 3 },
  ],
  upper: [
    { slot: 'warmup', share: 0.1, categories: ['모빌리티'], maxCount: 2 },
    {
      slot: 'main',
      share: 0.7,
      categories: ['상체 스트렝스', '파워'],
      /* 상체날의 파워는 던지는 계열만 — 스쿼트·런지 점프는 하체날 몫이다 */
      powerPatterns: ['밀기', '당기기', '회전'],
      maxCount: 8,
    },
    { slot: 'armcare', share: 0.2, categories: ['암케어'], maxCount: 3 },
  ],
  /*
   * 보조 데이는 개수 상한을 넉넉히 둔다. 코어·암케어는 하나에 4분 안팎이라,
   * 90분을 부탁하면 상한에 먼저 걸려 74분밖에 안 나왔다.
   */
  assist: [
    { slot: 'warmup', share: 0.15, categories: ['모빌리티'], maxCount: 3 },
    { slot: 'main', share: 0.35, categories: ['코어'], maxCount: 12 },
    { slot: 'prehab', share: 0.15, categories: ['회복 및 보강'], maxCount: 2 },
    { slot: 'armcare', share: 0.35, categories: ['암케어'], maxCount: 4 },
  ],
  /*
   * 회복 데이도 상한을 넉넉히 둔다.
   *
   * 예전에는 회복이 무조건 35분이라 넷씩이면 충분했다. 시간에 비례해 30·40·45분이
   * 되고 나니 워밍업과 암케어가 개수 상한에 먼저 걸려, 45분을 잡아도 35분치밖에
   * 안 나왔다. 회복 운동은 하나에 1~4분이라 개수가 있어야 시간이 찬다.
   */
  recovery: [
    { slot: 'warmup', share: 0.25, categories: ['모빌리티'], maxCount: 3 },
    { slot: 'core', share: 0.12, categories: ['코어'], maxCount: 2 },
    { slot: 'prehab', share: 0.3, categories: ['회복 및 보강'], maxCount: 4 },
    { slot: 'armcare', share: 0.3, categories: ['암케어'], maxCount: 5 },
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
  /*
   * 부상 방지를 고르면 웨이트 날의 구성을 통째로 바꾼다.
   *
   * 보조 데이와 회복 데이는 그대로 둔다 — 이미 무게를 안 드는 구성이고,
   * 그 날들은 투구량이 정한 것이라 목표가 뒤집을 자리가 아니다.
   */
  let base: readonly SlotSpec[] =
    goalName === PREVENTION_GOAL && (theme === 'lower' || theme === 'upper')
      ? PREVENTION_COMPOSITION
      : COMPOSITIONS[theme];

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

/**
 * 테마를 반영해 실제로 쓸 시간을 정한다. 회복 데이는 길게 잡아도 줄인다.
 *
 * 5분 단위로 내림한다. "31분으로 줄였습니다"는 계산기가 뱉은 값처럼 보이고,
 * 사람이 시계를 보며 운동하는 단위도 아니다. 45·60·90분은 각각 30·40·40분이 된다.
 */
export function effectiveMinutes(theme: ThemeKey, requested: number): number {
  if (theme !== 'recovery') return requested;
  const scaled = Math.floor((requested * RECOVERY_SHARE) / 5) * 5;
  return Math.min(scaled, RECOVERY_MAX_MINUTES);
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
  /*
   * 목표가 정한 본운동의 섞임. 회복 데이에는 본운동이 없어 쓰이지 않는다.
   */
  const goalMix: GoalMix = theme === 'recovery' ? {} : findGoal(goal).mix;
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
  /* 본운동 후보를 순서까지 정한 채로 들고 있는다 — 남는 시간을 여기서 더 쓴다 */
  let mainPool: T[] = [];
  /* 본운동이 없는 날(부상 방지·회복)에 남는 시간을 쓸 후보 */
  const topUpPool = new Map<SlotKey, T[]>();
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

    let pool = ordered.filter((ex) => {
      if (spec.slot === 'warmup') return isWarmup(ex);
      if (isWarmup(ex) || !spec.categories.includes(ex.category)) return false;
      /* 파워는 이 구간에 맞는 계열만 — 상체날에 스쿼트 점프가 들어오지 않게 */
      if (
        ex.category === '파워' &&
        spec.powerPatterns &&
        ex.movementPattern != null &&
        !spec.powerPatterns.includes(ex.movementPattern)
      ) {
        return false;
      }
      return true;
    });

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

    if (spec.slot === 'main') mainPool = pool;
    else topUpPool.set(spec.slot, pool);

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
    /*
     * 파워는 계열 셈에서 뺀다.
     *
     * 상체날 본운동은 '상체 스트렝스 + 파워'가 한 구간이다. 그런데 파워의
     * 밀기(4개)나 당기기(3개)가 먼저 뽑히면 그 계열이 찼다고 보고, 상체
     * 스트렝스의 밀기 23개가 통째로 뒤로 밀렸다. 가슴을 아예 안 하는 날이
     * 그렇게 생긴다.
     *
     * 파워는 성격이 다르다. 메디신볼 던지기를 '밀기 한 번 했다'로 세면
     * 벤치프레스를 대신한 셈이 되는데, 폭발력 훈련과 근력 훈련은 하는 일이
     * 다르다. 하체도 마찬가지다 — 파워 스쿼트 점프가 스쿼트 자리를 채우면
     * 무게를 드는 스쿼트가 빠진다.
     *
     * 그래서 파워는 넣지도 않고(usedPatterns) 검사받지도 않는다(clashes).
     * 스트렝스끼리만 밀기·당기기가 갈린다.
     */
    const countsForPattern = (ex: T) => ex.category !== '파워';
    const usedPatterns = new Set(
      chosen
        .filter(countsForPattern)
        .map((ex) => ex.movementPattern)
        .filter((p): p is string => !!p)
    );
    const clashes = (ex: T) =>
      countsForPattern(ex) &&
      ex.movementPattern != null &&
      usedPatterns.has(ex.movementPattern);

    /*
     * 목표가 정한 파워 비중을 지킨다.
     *
     * 이름이 약속한 것과 실제가 맞아야 한다 — '근력 향상'을 골랐는데 점프가
     * 나오면 안 되고, '파워 향상'이라고 무게 드는 운동이 하나도 없으면 안 된다.
     * 본운동에만 건다. 다른 구간에는 파워가 애초에 안 들어간다.
     */
    const isPower = (ex: T) => ex.category === '파워';
    const powerFull = () =>
      spec.slot === 'main' &&
      goalMix.maxPower != null &&
      chosen.filter(isPower).length >= goalMix.maxPower;
    /*
     * 스트렝스가 아직 모자란가 — 모자라면 이번 차례는 스트렝스를 먼저 본다.
     *
     * 첫 자리는 건드리지 않는다(chosen.length > 0). 처음부터 스트렝스를
     * 강제했더니 파워 향상 날에 파워가 27%까지 떨어졌다 — 목표가 뒤집힌 셈이다.
     * 첫 하나는 목표가 당겨 놓은 순서대로 가고, 그 뒤에 모자란 것을 채운다.
     */
    const shortOnStrength = () =>
      spec.slot === 'main' &&
      goalMix.minStrength != null &&
      chosen.length > 0 &&
      chosen.filter((ex) => !isPower(ex)).length < goalMix.minStrength;
    const mixAllows = (ex: T) => !(isPower(ex) && powerFull());

    const remaining = pool.filter((ex) => !taken.has(ex.id));
    while (chosen.length < spec.maxCount) {
      const free = (ex: T) => !taken.has(ex.id);
      const canTake = (ex: T) => free(ex) && fits(estimateMinutes(ex)) && mixAllows(ex);
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
        /*
         * 스트렝스가 모자란 동안에는 스트렝스부터 본다. 파워 향상 날에도
         * 무게 드는 운동 하나는 이렇게 확보된다.
         */
        (shortOnStrength()
          ? (remaining.find((ex) => canTake(ex) && !isPower(ex) && !clashes(ex)) ??
            remaining.find((ex) => canTake(ex) && !isPower(ex)))
          : undefined) ??
        remaining.find((ex) => canTake(ex) && !clashes(ex)) ??
        remaining.find(canTake) ??
        (chosen.length === 0
          ? (cheapest((ex) => free(ex) && mixAllows(ex) && !clashes(ex)) ??
            cheapest((ex) => free(ex) && mixAllows(ex)) ??
            cheapest(free))
          : undefined);
      if (next == null) break;
      chosen.push(next);
      taken.add(next.id);
      const spent = estimateMinutes(next);
      used += spent;
      totalUsed += spent;
      if (next.movementPattern && countsForPattern(next)) {
        usedPatterns.add(next.movementPattern);
      }
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

  /*
   * 남은 시간을 본운동으로 넘긴다.
   *
   * 구간마다 개수 상한이 있어서, 상한에 먼저 닿으면 그 구간의 시간 몫이 그냥
   * 버려졌다. 워밍업을 셋으로 조이자 60분 세션이 50분밖에 안 나온 것이 그
   * 탓이다 — 아낀 시간이 아무 데도 안 갔다.
   *
   * 남는 시간은 본운동으로 보낸다. 무게를 드는 시간을 늘리는 것이 맞지,
   * 스트레칭을 하나 더 하는 것이 아니다. 본운동 상한과 계열 겹침은 그대로
   * 지킨다 — 여기서만 규칙을 풀면 어느 날 밀기만 넷이 나온다.
   */
  /*
   * 어디로 보낼 것인가.
   *
   * 본운동이 있으면 거기다. 부상 방지·회복 날에는 본운동이 없어서, 그냥
   * 본운동만 찾으면 남는 시간이 통째로 버려졌다 — 45분을 부탁했는데 38분치만
   * 나왔다. 그때는 몫이 가장 큰 구간(대개 보강)으로 보낸다.
   */
  const mainSpec =
    specs.find((sp) => sp.slot === 'main') ??
    specs.reduce<SlotSpec | undefined>(
      (best, sp) => (best == null || sp.share > best.share ? sp : best),
      undefined
    );
  const mainPicks = mainSpec ? (bySlot.get(mainSpec.slot) ?? []) : [];
  if (mainSpec && mainPicks.length > 0) {
    const pool = mainSpec.slot === 'main' ? mainPool : (topUpPool.get(mainSpec.slot) ?? []);
    const usedPatterns = new Set(
      mainPicks
        .filter((ex) => ex.category !== '파워')
        .map((ex) => ex.movementPattern)
        .filter((p): p is string => !!p)
    );
    while (mainPicks.length < mainSpec.maxCount) {
      const room = minutes + totalSlack(minutes) - totalUsed;
      const free = pool.filter(
        (ex) => !taken.has(ex.id) && estimateMinutes(ex) <= room
      );
      if (free.length === 0) break;
      const next =
        free.find(
          (ex) =>
            ex.category === '파워' ||
            ex.movementPattern == null ||
            !usedPatterns.has(ex.movementPattern)
        ) ?? free[0];
      mainPicks.push(next);
      taken.add(next.id);
      totalUsed += estimateMinutes(next);
      if (next.movementPattern && next.category !== '파워') {
        usedPatterns.add(next.movementPattern);
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
