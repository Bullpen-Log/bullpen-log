import { orderWithinSlot } from '@/lib/report/exercise-order';
import {
  LOW_CONDITION_THRESHOLD,
  SEVERE_SORENESS,
  sorenessWord,
  type CheckinPartKey,
} from '@/lib/checkin';
import { recentHardOuting } from '@/lib/engine/day-state';
import { outingOf } from '@/lib/engine/outing';
import {
  HEAVY_CATEGORIES,
  LOWER_POWER_PATTERNS,
  UPPER_POWER_PATTERNS,
  isLowerPower,
  isUpperPower,
} from '@/lib/engine/exercise-class';
import { dayKindOf, type DayKind } from '@/lib/engine/microcycle';
import {
  HEAVY_EQUIPMENT,
  INTENSITY_CAP,
  intensityLevel,
  minutesForSets,
  type Prescription,
} from '@/lib/exercise-meta';
import { withJosa } from '@/lib/korean';
import { shiftDateKey } from '@/lib/pitch-stats';
import {
  HARD_OUTING_MIN_LOAD,
  HARD_OUTING_MIN_PITCHES,
  isNearMaxOuting,
  type HardOuting,
  type ReportFacts,
} from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';
import {
  checkinPartLabel,
  painEasingParts,
  painPartsToday,
  painStateUnknown,
  rehabEasingParts,
} from '@/lib/report/prescription';
import {
  findFocus,
  findGoal,
  goalForUnchosen,
  type GoalFocusKey,
  type GoalMix,
} from '@/lib/report/personalize';

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
 * 고를 수 있는 하루 운동 시간(분) — 목표마다 다르다.
 *
 * 무게를 드는 두 목표(근력 향상·파워 향상)는 45·60·75·90분, 컨디셔닝은
 * 45·60·75분이다(2026-09-25 사용자분과 정함). 15분 간격이라 오늘 쓸 수 있는
 * 시간에 가깝게 고를 수 있다.
 *
 * 예전에는 60·90·120분과 40·60·90분이었다. 그때는 일정마다 암케어가 몫을
 * 떼어 가서, 45분이면 무게 운동이 둘도 안 들어갔다. 암케어를 일정에서 빼
 * 따로 하게 한 뒤로는(트레이닝의 암케어 화면) 45분에도 본운동이 둘은 들어간다.
 * 두 시간은 채울 것이 없어 뺐다.
 *
 * 컨디셔닝은 75분까지다. 몸을 다지는 날이라 길게 끄는 것이 이 날의 뜻이 아니다.
 */
/**
 * 이 목표만 구성도 시간 선택지도 다르다.
 *
 * 예전 이름은 '부상 방지'였다(2026-09-25 바꿈 — 까닭은 personalize.ts 의 목표 설명).
 * 코드 이름(CONDITIONING_* · conditioningDay)도 함께 바꿨다. 저장된 값에는 이
 * 이름을 쓴 곳이 없었다 — 회원 설정도, 만들어 둔 일정도 0건이었다.
 */
export const CONDITIONING_GOAL = '컨디셔닝';

const WEIGHT_MINUTES = [45, 60, 75, 90] as const;
const CONDITIONING_MINUTES = [45, 60, 75] as const;

/** 목표가 정해지지 않은 자리(내 정보의 기본 시간)에서 쓰는 목록 */
export const WORKOUT_MINUTES_CHOICES = WEIGHT_MINUTES;

/**
 * 자동 맞춤이 한 주에 늘릴 수 있는 운동 시간(분) — 선택지 한 칸(트레이닝 추천 2판 P5-f, 2026-10-12).
 *
 * 검토안 2판 4-5 '시간 바꾸기는 한 주에 ±15분까지 — 줄이는 쪽은 바로, 늘리는 쪽은 천천히'. 기본 시간을 90분으로 저장해 둔
 * 사람이 지난주 45분씩만 했으면 오늘 바로 90분이 아니라 60분까지 간다. 몸이 받는 양은 한 번에 두 배가 되지 않게 늘려야
 * 한다(부하 지수의 급증 구간과 같은 생각). 지난주 시간을 세는 규칙은 lib/report/daily-plan.ts 의 weeklyMinutesCap 한 곳.
 */
export const WEEKLY_MINUTES_STEP = 15;

/** 이 목표로 고를 수 있는 시간 */
export function minutesChoicesFor(goalName: string | null): readonly number[] {
  return goalName === CONDITIONING_GOAL ? CONDITIONING_MINUTES : WEIGHT_MINUTES;
}

/**
 * 저장돼 있던 시간을 지금 고를 수 있는 값으로 맞춘다.
 *
 * 예전 선택지(15·30분, 120분, 컨디셔닝의 40분)로 고른 값이 그대로 남아 있으면
 * 라디오에서 짝이 없어 아무것도 안 골라진 채로 뜬다 — 화면만 보면 시간을
 * 고르지 않은 것처럼 보인다. 짧은 쪽은 올려서, 긴 쪽은 내려서 가장 가까운
 * 값을 짚어준다.
 *
 * 목표를 주면 그 목표가 고를 수 있는 값 안에서 고른다. 컨디셔닝으로 바꿨는데
 * 90분이 남아 있으면 75분으로 내려온다.
 */
export function nearestMinutesChoice(
  minutes: number,
  goalName: string | null = null
): number {
  const choices = minutesChoicesFor(goalName);
  if (choices.includes(minutes)) return minutes;
  return choices.reduce((best, m) =>
    Math.abs(m - minutes) < Math.abs(best - minutes) ? m : best
  );
}

/** 프로필에서 아직 고르지 않은 사용자의 기본값 */
export const DEFAULT_WORKOUT_MINUTES = 60;

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

/*
 * 종목을 바꾸는 데 드는 시간(분).
 *
 * 세트 사이 휴식만 세고 있었다. 자리를 옮기고, 장비를 챙기고, 무게를 갈고,
 * 다음 것이 무엇인지 보는 시간이 통째로 빠져 있었다. 그래서 "59분"이라고
 * 계산한 60분 세션에 종목이 열넷 들어갔고, 실제로 하면 한 시간 반이 걸렸다.
 *
 * 무게를 드는 운동은 더 든다. 봉을 끼우고 원판을 갈고, 무엇보다 본세트 전에
 * 가벼운 무게로 두어 세트를 먼저 한다 — 앱이 그 준비 세트를 따로 세지 않으므로
 * 여기서 함께 먹는다.
 *
 * 무게를 드는 카테고리(HEAVY_CATEGORIES)는 lib/engine/exercise-class.ts 한 곳이다(2판 P5 에서 옮김 — 양 조절이
 * 세트를 줄이는 대상도 같은 목록이라, 이 파일 안에 비공개로 두면 다른 층이 베끼게 된다).
 */

/**
 * 하루에 하나만 넣는 계열 — 고립(컬 · 레이즈 · 삼두 익스텐션, 2026-10-04 암케어에서 옮겨 옴).
 *
 * 계열 겹침은 겹치지 않는 것이 다 떨어지면 겹쳐도 넣는다(구간이 비는 것이 더 나쁘다). 그런데 고립까지 그렇게 채우니
 * 상체날 본운동에 고립이 매일 들어가 많은 날은 다섯이었다(180일 모의 — 평균 2.2개). 보조 운동은 하루 하나면 된다.
 */
const ONCE_PER_DAY_PATTERNS: ReadonlySet<string> = new Set(['고립']);
/** 보조(고립) 운동인가 — 본운동 밀기 · 당기기를 다 고른 뒤에 넣는다 */
function isAccessory(ex: { movementPattern?: string | null }): boolean {
  return ex.movementPattern != null && ONCE_PER_DAY_PATTERNS.has(ex.movementPattern);
}
function onceTaken(
  ex: { movementPattern?: string | null },
  usedPatterns: ReadonlySet<string>
): boolean {
  return isAccessory(ex) && usedPatterns.has(ex.movementPattern!);
}
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
  /**
   * 무거운 하체를 들 수 있는 날인가(2판 P4 커밋 E) — 등판 창이 3일 안이면 false(안전 거르기 2-2 가 무거운 하체를 뺀 날). 없으면 든다.
   * 날을 다 정한 뒤 finishDayTheme 이 붙인다 — 날을 바꾸는 함수(steerAroundPain · steerFromEmptyMain · conditioningDay)가 테마를 새로
   * 만들 때 칸이 빠지지 않게(설계 검토 G18). 화면 · 일정 JSON 의 표시용이고, 실제로 빼는 일은 prescription.ts 가 한다.
   */
  heavyLowerAllowed?: boolean;
};

/** 컨디션이 이 값 이하면 회복 테마로 돌린다 — 값은 lib/checkin.ts(안전 거름 · 암케어 · 프로그램과 같은 값) */
export { LOW_CONDITION_THRESHOLD };

/**
 * 세게 던진 날 문턱 — 값 · 판정은 lib/report/facts.ts 한 곳(HARD_OUTING_MIN_LOAD · isHardOuting, 2판 D2). 여기서는 옛 import
 * (스크립트 · 자체 시험이 theme 에서 읽는다)가 그대로 맞게 다시 내보내기만 한다.
 */
export { HARD_OUTING_MIN_LOAD, HARD_OUTING_MIN_PITCHES };

/**
 * 세게 던진 날의 여파 — 그날과 다음 날은 가벼운 컨디셔닝(회복·재생 데이), 이틀 뒤부터 무거운 웨이트 · 파워.
 *
 * 2026-10-03 사용자분과 다시 정했다. 예전에는 투구 계획의 남은 휴식일(Pitch Smart 표, plan.ts 의
 * pendingOuting)을 그대로 따라 90구 다음 날부터 이틀은 회복, 사흘째는 보조, 나흘째에야 무게가 나왔다.
 * 그 표는 '공을 언제 다시 던져도 되나'의 기준이라 웨이트까지 그만큼 막을 까닭이 없었고, 5일
 * 로테이션이면 첫 무거운 날이 다음 등판 전날이 됐다. 여기서는 체크인에 적은 '오늘 등판 · 내일 등판'만 읽는다
 * (plannedOuting, 2026-10-09 — 그 전에는 묻기만 하고 안 읽었다). 며칠 뒤 등판인지('2~3일 뒤 · 4일 이상 뒤', 2026-10-12)는
 * 2판 P4 커밋 E 부터 날 종류(lib/engine/microcycle.ts dayKindOf)가 읽는다 — 테마는 그 결과로 정한다(decideThemeForBody).
 *
 * '세게 던진 날' = 그날 투구수 × 체감 강도(%)의 합이 2,700(30구 × 90%) 이상, 경기는 체감과 상관없이 100%
 * (2판 D2, 2026-10-12 — facts.ts 의 isHardOuting). 그 전 규칙(경기, 또는 강도 9~10 으로 그날 합쳐 30구 이상)으로 세게
 * 던진 날은 모두 그대로 세게 던진 날이고, 많이 가볍게 던진 날(불펜 40구 70% 같은)이 새로 든다.
 * 그보다 가볍게 던진 날은 다음 날을 막지 않는다. 공을 쉬어야 하는 날은 투구 계획이 따로 말하고,
 * 쌓인 부하는 부하 지수(주의 · 위험 구간)가 따로 본다.
 *
 * '오늘 · 어제 세게 던진 날을 고르는' 몸통은 2026-10-12(2판 P3)부터 오늘 상태 한 장(lib/engine/day-state.ts 의 recentHardOuting)
 * 에 있다 — 그 장의 load.hardOuting 과 이 값이 늘 같게 한 곳에서 셈한다. 서명 · 값은 그대로라 독자(프로그램 · 일정 지문 · 자체
 * 시험 · 기준선)는 그대로다. 테마 · 부딪힘은 2판 P4 커밋 E 부터 날 종류(dayKindOf)의 R1 으로 같은 값을 읽는다.
 */
export function hardOuting(facts: ReportFacts): HardOuting | null {
  return recentHardOuting(facts);
}

/**
 * 체크인에 적은 등판 — 아직 던지기 전이라 투구 기록에는 없는 것.
 *
 * 세게 던진 날 규칙(hardOuting)은 던지고 난 뒤의 기록을 본다. 등판 날 아침과 그 전날에는 기록이 없어
 * 무거운 하체가 나왔다 — 체크인의 '던지는 일정'은 2026-09-30 부터 묻고 있었는데(lib/checkin.ts 의 THROW_PLANS)
 * 영양과 프로그램만 읽고 매일 운동 계획은 안 읽었다(2026-10-09 트레이닝 검토 1-①).
 *
 * 오늘 적은 답이 먼저다. 어제 '내일 등판'이라고 했어도 오늘 '없음'이라고 고쳤으면(비 · 순서 바뀜) 오늘 것을
 * 따른다 — 오늘 안 적었을 때만 어제 답을 본다. '오늘 불펜'은 날을 바꾸지 않는다 — 가볍게 던지는 날이라
 * 세게 던진 날 규칙이 던진 뒤에 따로 본다. 프로그램의 읽기(lib/program/program.ts 의 programSignalsOf)는 경기 기록까지
 * 합쳐 보는데, 여기서는 기록은 hardOuting 이 맡으니 체크인만 본다.
 *
 * 답을 날로 읽는 규칙은 lib/checkin.ts 의 nextOutingDays 한 곳(2026-10-12, 2판 D1). 여기서는 그 범위가 꼭 오늘(0~0)
 * 이면 today, 꼭 내일(1~1)이면 tomorrow 만 가른다(lib/checkin.ts exactOutingDay — 영양 · 프로그램과 같은 물음) —
 * '2~3일 뒤' · '4일 이상 뒤'는 날을 못 박지 못하니 '없음'처럼 null(테마 그대로). 어제 답의 이월도 '내일 등판'(어제 기준 1~1) 하나뿐 — 어제 '2~3일 뒤'는 오늘 1~2일 뒤라 null.
 * 반환은 둘뿐이다. 며칠 뒤 등판을 쓰는 규칙(P4 · P5)은 이 함수를 넓히지 않고 outingOf 의 daysUntilNext · nextSource 를 바로
 * 읽는다 — 2판 P4 커밋 E 부터 테마 · 부딪힘도 이 함수가 아니라 날 종류(dayKindOf)의 R3 · R4 로 같은 값(nextDay)을 읽는다. 이 함수는
 * 얇은 겉옷으로 남는다(자체 시험 · 기준선이 부른다).
 *
 * 오늘 · 어제 답을 합치는 규칙(오늘 답이 이김 · 어제 답은 하루 당겨 읽음)은 2026-10-12(2판 P3)부터 lib/checkin.ts 의
 * nextOutingWindow 한 곳이고, facts 에서 그 답을 꺼내 등판으로 읽는 일은 2판 P4 커밋 B(2026-10-12)부터 lib/engine/outing.ts 의
 * outingOf 한 곳이다 — 오늘 상태 한 장(day-state)의 outing 칸과 이 값이 같은 함수에서 나온다(예전에는 둘이 저마다 꺼냈다).
 * 여기서는 그 결과의 nextDay(꼭 오늘 0 · 꼭 내일 1)만 읽는다. 하루 당긴 어제 '2~3일 뒤'(1~2)는 꼭 내일이 아니니 그대로 null 이다
 * (옛 규칙과 같은 값 — 자체 시험이 답 49쌍 + 오늘 체크인 없음 7 · 160조합에서 견준다).
 */
export function plannedOuting(facts: ReportFacts): 'today' | 'tomorrow' | null {
  const { nextDay } = outingOf(facts);
  if (nextDay === 0) return 'today';
  if (nextDay === 1) return 'tomorrow';
  return null;
}

/** 등판 날 · 등판 전날의 이유 — 언제부터 다시 무게를 드는지까지 말한다(hardOutingReason 과 같은 틀) */
function plannedOutingReason(when: 'today' | 'tomorrow'): string {
  return when === 'today'
    ? '오늘 등판이에요. 가볍게 풀고 활성화만 하고, 무게는 모레부터 다시 올려요.'
    : '내일 등판이라 무게 대신 코어와 보강을 해요. 등판 전날은 다리를 가볍게 둬요.';
}

/**
 * '오늘 거의 전력으로 82구를 던지셨어요' / '어제 60구를 던져 팔 부담이 컸어요'.
 *
 * 그날 체감 평균이 90% 이상(경기 · 옛 강도 9~10)이면 예전 글 그대로 '거의 전력으로'. 곱 규칙으로 새로 드는 날(불펜 60구
 * 50% 같은)에 '거의 전력'이라고 하면 틀린 말이라, 그때는 왜 쉬는지(팔에 간 양)를 말한다. 평균 %는 안 적는다 — 경기는
 * 적은 값과 상관없이 100% 로 셈해 숫자가 사용자가 고른 것과 달라 보인다.
 */
function outingPhrase(outing: HardOuting): string {
  const when = outing.daysAgo === 0 ? '오늘' : '어제';
  return isNearMaxOuting(outing)
    ? `${when} 거의 전력으로 ${outing.pitches}구를 던지셨어요`
    : `${when} ${outing.pitches}구를 던져 팔 부담이 컸어요`;
}

/** 세게 던진 날의 회복·재생 데이 이유 — 언제부터 다시 무게를 드는지까지 말한다 */
function hardOutingReason(outing: HardOuting): string {
  return outing.daysAgo === 0
    ? `${outingPhrase(outing)}. 오늘과 내일은 가볍게 풀고, 모레부터 무게를 다시 올려요.`
    : `${outingPhrase(outing)}. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.`;
}

/** 기록 없는 등판 다음 날(R3', C6 결정)의 짧은 말 — 부딪힘 까닭과 이유 글 앞머리가 같은 말 */
const CLAIMED_NO_LOG_PHRASE = '어제 등판이라고 적었는데 투구 기록이 없어요';

/** 0 일요일 ~ 6 토요일(lib/engine/outing.ts OutingGuess.weekday) */
const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

/**
 * 짐작한 오늘 · 내일 등판(R4' softOutingNear, 2판 P4 커밋 G)의 말 — 어디서 짐작했는지(달력 · 같은 요일)를 밝히고, 아니면 체크인 답으로
 * 고칠 수 있다고 말한다(답을 적으면 짐작을 안 쓴다 — outing.ts 차례). 회복 날의 '무게는 모레부터'는 안 붙인다 — 짐작으로는 무게만 뺀다.
 */
function softOutingWords(dk: DayKind): { reason: string; clash: string } | null {
  const g = dk.outing.guess;
  if (!g || g.days > 1) return null;
  const when = g.days === 0 ? '오늘' : '내일';
  if (g.source === 'calendar') {
    return {
      reason:
        g.days === 0
          ? '달력에 오늘 경기가 있어 무게 대신 코어와 보강을 해요. 등판이 아니면 체크인에서 던지는 일정을 적어 주세요.'
          : '달력에 내일 경기가 있어 무게 대신 코어와 보강을 해요. 등판 전날은 다리를 가볍게 둬요.',
      clash: `달력에 ${when} 경기가 있어요`,
    };
  }
  const day = `${WEEKDAY_NAMES[g.weekday] ?? ''}요일`;
  return {
    reason: `최근 4주 ${day}에 경기를 ${g.games}번 해서 ${when} 등판으로 봤어요. 무게 대신 코어와 보강을 해요. 아니면 체크인에서 던지는 일정을 적어 주세요.`,
    clash: `최근 ${day}마다 경기가 있어 ${when} 등판으로 봤어요`,
  };
}

/**
 * 날 종류(lib/engine/microcycle.ts dayKindOf)가 회복 · 보조 날일 때의 말 — reason 은 테마 이유(마침표로 끝남), clash 는 부딪힘 까닭
 * (마침표 없이 — workoutConflict 가 돌려주고, decideTheme 이 '그래도 하기' 글 앞에, 화면이 경고에 그대로 쓴다). 근력 · 모름 날은 null.
 *
 * 글을 여기 한 곳에서 만든다 — 날 종류는 코드(rule)와 재료만 돌려준다(설계 검토 G12). R1 · R3 · R4 의 글은 커밋 E 전과 글자까지 같다
 * (hardOutingReason · plannedOutingReason · outingPhrase · '오늘 등판이에요' · '내일 등판이에요'). 새 글은 둘:
 *   R2  '어제 25구를 던졌고 최근 운동도 힘들었어요. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.'
 *   R3' '어제 등판이라고 적었는데 투구 기록이 없어요. 오늘은 무게 대신 코어와 보강을 해요. 기록을 남기면 던진 양으로 다시 짤 수 있어요.'
 *       (기록을 남기면 일정 지문의 마지막 투구가 바뀌어 '상태가 바뀌었어요'가 뜬다 — 다시 짜는 것은 사용자가 고른다)
 * 커밋 G 에서 하나 더: R4' 짐작한 오늘 · 내일 등판(softOutingWords — 달력 · 같은 요일).
 */
function dayKindWords(dk: DayKind): { reason: string; clash: string } | null {
  switch (dk.rule) {
    case 'hard':
      return dk.hard
        ? { reason: hardOutingReason(dk.hard), clash: outingPhrase(dk.hard) }
        : null;
    case 'outingToday':
      return { reason: plannedOutingReason('today'), clash: '오늘 등판이에요' };
    case 'moderateSpike': {
      if (!dk.yesterday) return null;
      const phrase = `어제 ${dk.yesterday.pitches}구를 던졌고 최근 운동도 힘들었어요`;
      return {
        reason: `${phrase}. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.`,
        clash: phrase,
      };
    }
    case 'claimedNoLog':
      return {
        reason: `${CLAIMED_NO_LOG_PHRASE}. 오늘은 무게 대신 코어와 보강을 해요. 기록을 남기면 던진 양으로 다시 짤 수 있어요.`,
        clash: CLAIMED_NO_LOG_PHRASE,
      };
    case 'outingTomorrow':
      return { reason: plannedOutingReason('tomorrow'), clash: '내일 등판이에요' };
    case 'softOutingNear':
      return softOutingWords(dk);
    default:
      return null;
  }
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
   *
   * 2판 P4 커밋 E 부터 등판 쪽은 날 종류(dayKindOf) 하나로 읽는다 — 회복 날(세게 던진 날 · 오늘 등판 · 어제 중간 부하 + 운동 힘듦 급증)은
   * 여기 맨 앞, 보조 날(기록 없는 등판 다음 날 · 내일 등판)은 아래 근육통 '심함' 뒤. decideThemeForBody 가 같은 dk 의 같은 rank 를 같은
   * 두 자리에서 읽으니, 예전처럼 사슬을 두 번 적어 '같이 고칠 것'으로 묶지 않아도 된다.
   */
  const dk = dayKindOf(facts);
  const words = dayKindWords(dk);
  if (dk.rank === 'recovery' && words) {
    return { reason: words.clash, fallback: 'recovery' };
  }
  if (facts.load.zone === 'danger') {
    return { reason: '투구 부하가 위험 구간이에요', fallback: 'recovery' };
  }
  const condition = facts.condition.today?.condition;
  if (condition != null && condition <= LOW_CONDITION_THRESHOLD) {
    return { reason: `오늘 컨디션이 ${condition}/10이에요`, fallback: 'recovery' };
  }
  /*
   * 전신 근육통 '심함' — 낮은 컨디션과 같은 자리 · 같은 결론(회복).
   *
   * 통증이 아니라 고를 수 있다(override). 다만 후보 상한은 prescription.ts 가 남긴다 — 그래도
   * 하겠다고 해도 무게 드는 운동은 안 나온다. '많이'는 여기 안 걸린다(고른 대로 가고 가장 센 것만
   * 빠진다). decideTheme 의 같은 자리에도 같은 줄이 있다 — 두 곳을 같이 고칠 것.
   *
   * 1~5 밖의 값(말이 없는 값)은 안 적은 것으로 넘긴다 — 글에 'null' 이 찍히지 않게.
   */
  const soreness = facts.condition.today?.soreness;
  const soreWord = sorenessWord(soreness);
  if (soreness != null && soreWord && soreness >= SEVERE_SORENESS) {
    return { reason: `전신 근육통이 '${soreWord}'이에요`, fallback: 'recovery' };
  }
  /* 등판 전날 · 기록 없는 등판 다음 날 · 짐작한 오늘 · 내일 등판 — 회복까지는 아니고 무게만 뺀다(보조·코어, 날 종류의 보조 날) */
  if (dk.rank === 'light' && words) {
    return { reason: words.clash, fallback: 'assist' };
  }
  if (facts.load.zone === 'caution') {
    return { reason: '투구 부하가 주의 구간이에요', fallback: 'assist' };
  }
  return null;
}

/**
 * 오늘 던진 날이면 이유 맨 앞에 붙이는 말. 안 던졌으면 빈 문자열.
 *
 * 운동을 고를 때 투구량은 실제로 보고 있다 — 부하가 높으면 무게를 다루는
 * 운동이 후보에서 빠진다. 그런데 화면에 적히는 이유는 '상체 다음은 하체'
 * 하나뿐이라, 60구를 던지고 온 사람에게 웨이트를 시키는 것처럼 보였다.
 * 감안했다는 사실이 안 보이면 감안하지 않은 것과 같다.
 */
function threwTodayNote(facts: ReportFacts): string {
  const threwToday =
    facts.patterns.restDays === 0 && (facts.patterns.lastOutingPitches ?? 0) > 0;
  return threwToday
    ? `오늘 ${facts.patterns.lastOutingPitches}구를 던지셨어요. 그 부담을 빼고 골랐어요. `
    : '';
}

/** 근력 날에 목표를 컨디셔닝으로 잡은 날의 이름 */
export const CONDITIONING_DAY_LABEL = '컨디셔닝 데이';

/**
 * 근력 날인데 목표가 컨디셔닝이면, 그날은 컨디셔닝 데이다.
 *
 * 컨디셔닝은 무게 드는 구간을 통째로 뺀다(GOAL_SHAPES — 가동성·코어·보강, 유산소
 * 영상이 있으면 유산소 하나).
 * 그런데 이름은 번갈아 정한 '하체 스트렝스 데이'가 그대로 남아, 목록에는 하체
 * 근력 운동이 하나도 없는데 제목만 하체였다. 직접 고르기에서 컨디셔닝을 골라도
 * 그랬고, AI 맞춤을 만들면서 드러났다(2026-09-23 — 잠 부족·운동 부하·암케어
 * 공백이면 AI 맞춤이 컨디셔닝으로 가서 더 자주 보인다).
 *
 * 이름과 이유만 바꾸고 key 는 그대로 둔다. 번갈아 가는 차례는 실제로 한 근력
 * 운동으로 세므로(lib/report/gather.ts 의 lastStrengthDates) 오늘 못 한 쪽이
 * 다음 근력 날로 그대로 넘어가고, 직접 더한 운동의 자리(slotForTheme)도 지금처럼
 * 정해진다. 회복날·보조날은 원래 무게를 안 드는 날이라 그대로다.
 */
export function conditioningDay(
  theme: SessionTheme,
  facts: ReportFacts,
  /**
   * 실제로 뽑힌 구간. 이유에는 이것만 적는다 — 유산소는 영상이 있는 날에만
   * 들어간다. 안 주면(아직 고르기 전인 AI 맞춤의 울타리) 이 목표의 기본 구간을
   * 적는다 — 유산소는 들어갈지 모르니 뺀다.
   */
  slots?: readonly SlotKey[]
): SessionTheme {
  if (theme.key !== 'lower' && theme.key !== 'upper') return theme;
  const part = theme.key === 'lower' ? '하체' : '상체';
  const shape = GOAL_SHAPES[CONDITIONING_GOAL];
  const shown = SLOT_ORDER.filter((s) =>
    slots ? s !== 'main' && slots.includes(s) : s !== 'cardio' && s in shape
  );
  const filled = shown.map((s) => SLOT_LABELS[s].label).join('·');
  return {
    key: theme.key,
    label: CONDITIONING_DAY_LABEL,
    reason:
      painNote(facts).note +
      threwTodayNote(facts) +
      `목표가 컨디셔닝이라 무게 드는 운동 대신 ${withJosa(filled, '으로/로')} 채웠어요. ${part} 근력은 다음 근력 날로 넘어가요.`,
  };
}

/** 상체 쪽 · 하체 쪽 체크인 부위 — 아픈 쪽을 피해 근력 날을 고를 때 쓴다 */
const UPPER_PAIN_PARTS: readonly CheckinPartKey[] = ['shoulder', 'elbow', 'wrist'];
const LOWER_PAIN_PARTS: readonly CheckinPartKey[] = ['lowerBack', 'lowerBody'];

/**
 * 통증 때문에 무엇을 골랐든 회복·재생 데이로 가는 날이면 그 까닭, 아니면 null.
 *
 * 2026-10-03 부터 통증은 아픈 곳을 피해서 짠다(사용자 결정 — prescription.ts 가 그 부위 운동을 뺀다).
 * 그래도 회복으로 가는 날이 셋 있다.
 *   최근에 아팠는데 오늘 체크인이 없다 — 나았는지 모른다(처방도 멈춘다).
 *   메모에 통증으로 보이는 말이 있는데 오늘 체크인이 없다 — 어디가 아픈지 모른다.
 *   상체(어깨·팔꿈치·손목)와 하체 쪽(허리·하체)이 함께 아프다 — 피해서 할 쪽이 없다.
 *
 * 통증만은 '그래도 하겠다'(override)로 넘길 수 없다. 그래서 오늘 데이터(today-data.ts) · AI 맞춤의
 * 울타리(auto-setup.ts)도 이 값이 있는 날에는 부딪힘(workoutConflict)을 따지지 않는다.
 */
export function painRecoveryReason(facts: ReportFacts, plan: PitchPlan): string | null {
  if (painStateUnknown(facts)) {
    return '최근 통증 기록이 있는데 오늘 상태를 몰라 가볍게만 짰어요. 체크인을 남기면 아픈 곳을 피해서 다시 짜요.';
  }
  if (plan.needsPainCheck) {
    return '메모에 통증으로 보이는 말이 있어 확인 전까지 가볍게 짰어요.';
  }
  const parts = painPartsToday(facts);
  if (
    parts.some((p) => UPPER_PAIN_PARTS.includes(p)) &&
    parts.some((p) => LOWER_PAIN_PARTS.includes(p))
  ) {
    return `${parts.map(checkinPartLabel).join('·')} 통증이 있어 그 부위를 쓰는 운동은 모두 빼고 가볍게 짰어요. 통증이 이어지면 진료를 받아 보세요.`;
  }
  return null;
}

/**
 * 통증 때문에 뺀 것을 일정 이유 맨 앞에 붙이는 말 — 아픈 곳이 없으면 빈 문자열.
 *
 * 오늘 아픈 곳이 있으면 그것을, 없으면 최근 7일에 아팠던 곳과 재활 중인 관절(1~3단계)을 말한다. 날을 고르는 곳
 * (steerAroundPain)과 컨디셔닝 날의 이유(conditioningDay)가 같이 쓴다 — 이유를 새로 쓰는 곳에서 이 말이 빠지면 안 된다.
 */
function painNote(facts: ReportFacts): { parts: CheckinPartKey[]; note: string } {
  const today = painPartsToday(facts);
  if (today.length > 0) {
    const labels = today.map(checkinPartLabel).join('·');
    return {
      parts: today,
      note: `${labels} 통증이 있어 그 부위를 쓰는 운동은 모두 뺐어요. 하다가 아프면 바로 멈추세요. `,
    };
  }
  const recent = painEasingParts(facts);
  const rehab = rehabEasingParts(facts).filter((key) => !recent.includes(key));
  const parts = [...recent, ...rehab];
  if (parts.length === 0) return { parts, note: '' };
  const why = [
    ...(recent.length > 0
      ? [`최근 ${recent.map(checkinPartLabel).join('·')} 통증`]
      : []),
    ...(rehab.length > 0 ? [`${rehab.map(checkinPartLabel).join('·')} 재활 중`] : []),
  ].join(' · ');
  return {
    parts,
    note:
      rehab.length > 0
        ? `${why}이라 그 부위의 무거운 운동은 뺐어요. `
        : `${why}이 있어 그 부위의 무거운 운동은 뺐어요. `,
  };
}

/**
 * 아픈 쪽을 피해 근력 날을 고른다 — 상체가 아프면 하체 날, 허리·하체가 아프면 상체 날.
 *
 * 오늘 아픈 곳이 없으면 최근 7일에 아팠던 곳을 본다. 그 부위의 무거운 운동이 빠지므로(prescription.ts)
 * 그쪽 근력 날이면 본운동이 비어 버린다. 근력 날이 아니면(회복·보조) 날은 그대로 두고 까닭만 앞에 붙인다.
 */
function steerAroundPain(day: SessionTheme, facts: ReportFacts): SessionTheme {
  const { parts, note } = painNote(facts);
  if (parts.length === 0) return day;

  const upper = parts.some((p) => UPPER_PAIN_PARTS.includes(p));
  const lower = parts.some((p) => LOWER_PAIN_PARTS.includes(p));

  if (day.key === 'upper' && upper && !lower) {
    return {
      key: 'lower',
      label: '하체 스트렝스 데이',
      reason: note + '오늘은 하체 위주로 해요.',
    };
  }
  if (day.key === 'lower' && lower && !upper) {
    return {
      key: 'upper',
      label: '상체 스트렝스 데이',
      reason: note + '오늘은 상체 위주로 해요.',
    };
  }
  return { ...day, reason: note + day.reason };
}

/**
 * 통증 때문에 피해야 할 근력 쪽 — steerAroundPain 과 같은 판정. 상체 쪽(어깨 · 팔꿈치 · 손목)만 아프면 'upper',
 * 허리 · 하체 쪽만 아프면 'lower', 둘 다거나 없으면 null. 본운동 후보가 비어 날을 바꿀 때(steerFromEmptyMain) 아픈 쪽으로
 * 되돌아가지 않게 쓴다(2026-10-12 검토에서 나온 구멍 — 허리가 아파 상체 날로 피했는데 상체 후보가 없다고 하체로 되돌렸다).
 */
export function painAvoidedSide(facts: ReportFacts): 'lower' | 'upper' | null {
  const { parts } = painNote(facts);
  const upper = parts.some((p) => UPPER_PAIN_PARTS.includes(p));
  const lower = parts.some((p) => LOWER_PAIN_PARTS.includes(p));
  if (upper && !lower) return 'upper';
  if (lower && !upper) return 'lower';
  return null;
}

type DecideThemeInput = {
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
  /**
   * 오늘 목표에서 좁힌 부위. 없으면 앱이 번갈아 정한다.
   *
   * 몸 상태로 갈리는 분기(통증·회복 데이·보조 데이)보다 뒤에 본다. 상체
   * 밀기를 고른 날에도 컨디션이 3/10이면 회복이 먼저다 — 부위를 고른 것은
   * '웨이트를 한다면 어디를'이지 '무슨 일이 있어도 웨이트를'이 아니다.
   */
  focus?: GoalFocusKey | null;
};

export function decideTheme(input: DecideThemeInput): SessionTheme {
  /*
   * 1) 통증은 고를 수 있는 것이 아니다. 무엇을 골랐든, 밀고 나가겠다고 해도 여기서 정한다.
   *
   * 예전에는 통증이면 무조건 회복·재생 데이였다. 2026-10-03 부터는 아픈 쪽을 피해 근력 날을 고르고
   * (steerAroundPain), 피할 쪽이 없거나 상태를 모를 때만 회복으로 간다(painRecoveryReason).
   */
  const forced = painRecoveryReason(input.facts, input.plan);
  if (forced) return { key: 'recovery', label: '회복·재생 데이', reason: forced };
  return steerAroundPain(decideThemeForBody(input), input.facts);
}

/** 통증을 뺀 몸 상태 · 고른 것 · 번갈아 가는 차례로 오늘의 날을 정한다 */
function decideThemeForBody({
  facts,
  lastLowerKey,
  lastUpperKey,
  preferredWorkout = null,
  override = false,
  focus = null,
}: DecideThemeInput): SessionTheme {
  // 2) 회복을 골랐으면 몸이 좋아도 회복으로 간다. 쉬겠다는데 말릴 이유가 없다.
  if (preferredWorkout === '회복') {
    return {
      key: 'recovery',
      label: '회복·재생 데이',
      reason: '오늘은 회복 위주로 하고 싶다고 하셔서 그렇게 짰어요.',
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
  /* 날 종류 — 등판 주기의 어디쯤인가(lib/engine/microcycle.ts). 아래 두 자리와 번갈아 예비 규칙이 이것 하나를 읽는다 */
  const dk = dayKindOf(facts);
  const dkWords = dayKindWords(dk);

  if (!forcing) {
    /*
     * 날 종류의 회복 날을 맨 앞에 본다 — 세게 던진 날(그날 · 다음 날, hardOuting 과 같은 값) · 체크인에 적은 오늘 등판(아직 안 던져
     * 기록이 없어도 그날은 가볍게 풀고 활성화만) · 어제 중간 부하 + 최근 운동 힘듦 급증(D3, 2판 P4 커밋 E).
     *
     * 부하 지수는 4주 평균에 견주는 값이라 어제 90구가 바로 반영되지 않고,
     * 반영되더라도 "위험 구간"이라고만 하면 왜 그런지 알 수 없다. 던진 것이
     * 원인이면 그것을 그대로 말하는 편이 낫다.
     */
    if (dk.rank === 'recovery' && dkWords) {
      return {
        key: 'recovery',
        label: '회복·재생 데이',
        reason: dkWords.reason,
      };
    }
    if (facts.load.zone === 'danger') {
      return {
        key: 'recovery',
        label: '회복·재생 데이',
        reason: '투구 부하가 위험 구간이라 회복 위주로 짰어요.',
      };
    }
    const condition = facts.condition.today?.condition;
    if (condition != null && condition <= LOW_CONDITION_THRESHOLD) {
      return {
        key: 'recovery',
        label: '회복·재생 데이',
        reason: `오늘 컨디션이 ${condition}/10이라 회복 위주로 짰어요.`,
      };
    }
    /*
     * 전신 근육통 '심함' — 컨디션 바로 뒤, 부하 주의(보조·코어)보다 앞.
     *
     * 온몸에 알이 심하게 밴 날은 무게를 올릴 날이 아니다. 통증이 아니라 고를 수 있다(override) —
     * 다만 후보 상한은 prescription.ts 가 남긴다. workoutConflict 의 같은 자리에도 같은 줄이 있다 —
     * 두 곳을 같이 고칠 것. 안 적은 날(null · 칸 없음)과 1~5 밖의 값(말이 없는 값)은 여기 안 걸린다.
     */
    const soreness = facts.condition.today?.soreness;
    const soreWord = sorenessWord(soreness);
    if (soreness != null && soreWord && soreness >= SEVERE_SORENESS) {
      return {
        key: 'recovery',
        label: '회복·재생 데이',
        reason: `전신 근육통이 '${soreWord}'이라 가볍게 움직이며 푸는 회복 위주로 짰어요.`,
      };
    }
    /*
     * 날 종류의 보조 날 — 회복(위 넷)보다 뒤, 부하 주의와 같은 자리(보조·코어). 등판 전날(무거운 하체를 하면 다음 날 다리가 무겁다)과
     * 기록 없는 등판 다음 날(C6 결정, 2판 P4 커밋 E — 어제 '오늘 등판'이라 적었는데 기록이 없으면 부하를 몰라 무게를 빼고 기록을 청한다),
     * 달력 · 같은 요일로 짐작한 오늘 · 내일 등판(커밋 G — 짐작이라 회복까지는 안 가고 여기서 멈춘다).
     * 통증이 아니라 고를 수 있다(override). workoutConflict 가 같은 dk 를 같은 자리에서 읽는다.
     */
    if (dk.rank === 'light' && dkWords) {
      return {
        key: 'assist',
        label: '보조·코어 데이',
        reason: dkWords.reason,
      };
    }
    if (facts.load.zone === 'caution') {
      return {
        key: 'assist',
        label: '보조·코어 데이',
        reason: '투구 부하가 주의 구간이라 무게 대신 코어와 보강을 해요.',
      };
    }
  }

  /** 몸 상태 경고를 넘기고 온 날에는 그 사실을 이유에 붙인다. */
  const forcedNote = forcing
    ? ` ${conflict.reason}. 그래도 하겠다고 하셔서 그대로 만들었어요. 무리가 오면 바로 멈추세요.`
    : '';

  const todayNote = threwTodayNote(facts);

  /*
   * 2-1) 오늘 목표에서 부위를 좁혔으면 그대로 간다.
   *
   * 번갈아 가기보다 먼저다. 사용자가 직접 고른 것이라 앱의 순서가 그것을
   * 덮으면 고른 뜻이 없어진다. 위의 몸 상태 분기는 이미 지나온 뒤라, 아픈
   * 날까지 이 값이 밀고 들어오지는 않는다.
   */
  const chosen = findFocus(focus);
  if (chosen) {
    return {
      key: chosen.theme,
      label: chosen.dayLabel,
      reason: todayNote + `오늘 목표에서 '${chosen.label}'를 고르셨어요.` + forcedNote,
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
    /*
     * 최근에 던진 날이 없으면 부하 이야기를 하지 않는다 — 볼 투구 부하가 없다. 2026-10-03 부터 투구 기록이
     * 없어도 일정을 만들 수 있게 되어(training/page.tsx), '부하가 적정 범위예요'가 사실과 다른 말이 됐다.
     */
    const noThrows = facts.patterns.lastThrowDate == null;
    const loadNote = '최근 투구 기록이 없어 투구량은 따로 보지 않았어요. ';
    /*
     * 날 종류가 쪽을 말하면 그쪽(2판 P4 커밋 E) — 등판이 3일 안(R5)이면 다리를 아끼는 상체, 등판에서 먼 날(R6)이면 하체.
     * 한쪽 기록이라도 있으면 여기 오지 않는다(아래 번갈아가 이긴다). 날짜 홀짝은 날 종류가 쪽을 말하지 않을 때만.
     */
    if (dk.side === 'upper') {
      return {
        key: 'upper',
        label: '상체 스트렝스 데이',
        reason:
          todayNote +
          (noThrows ? loadNote : '') +
          '등판이 가까워 다리는 아끼고 상체 근력을 해요.' +
          forcedNote,
      };
    }
    if (dk.side === 'lower') {
      return {
        key: 'lower',
        label: '하체 스트렝스 데이',
        reason:
          todayNote +
          (noThrows ? loadNote : '') +
          '등판이 아직 멀어 하체 근력을 하기 좋은 날이에요. 투구의 힘은 하체에서 나와요.' +
          forcedNote,
      };
    }
    const [, m, d] = facts.asOf.split('-').map(Number);
    const lower = (m + d) % 2 === 0;
    return lower
      ? {
          key: 'lower',
          label: '하체 스트렝스 데이',
          reason:
            todayNote +
            (noThrows ? loadNote : '부하가 적정 범위예요. ') +
            '투구의 힘은 하체에서 나와요.' +
            forcedNote,
        }
      : {
          key: 'upper',
          label: '상체 스트렝스 데이',
          reason:
            todayNote +
            (noThrows
              ? loadNote + '상체 근력을 훈련하기 좋은 날이에요.'
              : '부하가 적정 범위라 상체 근력을 훈련하기 좋은 날이에요.') +
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
          ? '최근에 상체를 했으니 오늘은 하체 차례예요.'
          : '최근 하체 기록이 없어 하체부터 시작해요.') +
        forcedNote,
    };
  }
  return {
    key: 'upper',
    label: '상체 스트렝스 데이',
    reason:
      todayNote +
      (lastLowerKey != null
        ? '최근에 하체를 했으니 오늘은 상체 차례예요.'
        : '최근 상체 기록이 없어 상체부터 시작해요.') +
      forcedNote,
  };
}

/* ------------------------------ 시간 배분과 구성 ----------------------------- */

/*
 * 하루를 채우는 구간들.
 *
 * 예전에는 맨 앞에 'warmup' 이 있었다. 이제 워밍업은 일정을 만들 때 뽑지
 * 않는다 — 고정 루틴으로 따로 두고, 본운동 시간에도 넣지 않는다.
 *
 * 'mobility' 는 그 자리를 물려받은 것이 아니라 다른 것이다. 회복 데이에만
 * 있고, 그 날에는 가동성이 준비 운동이 아니라 그날의 운동 자체다. 그래서
 * 기록도 평소대로 남는다.
 */
export type SlotKey = 'cardio' | 'mobility' | 'main' | 'core' | 'prehab' | 'armcare';

/**
 * 본운동 후보가 하나도 없을 때 다른 운동으로 채우는 대비책의 개수 상한(P1, 2026-10-11).
 *
 * 둘이면 '본운동이 비었다'는 사실이 보이면서도 그날이 통째로 다른 부위의 날이 되지는 않는다. 날 자체를 바꾸는 것은
 * steerFromEmptyMain 이 먼저 한다 — 여기까지 오는 날은 사용자가 부위를 좁힌 날, 그리고 보조 날에 코어 후보가 없는 날이다
 * (보조 날의 코어 자리도 slot 이 'main' 이라 같은 상한이 걸린다 — 예전엔 여섯까지 채웠다).
 */
const FALLBACK_MAX_COUNT = 2;

export const SLOT_LABELS: Record<SlotKey, { label: string; hint: string }> = {
  /*
   * 회복날(맨 앞, 가볍게)과 컨디셔닝 날(심폐) 둘 다 쓰는 칸이라 '가벼운'을 뺐다.
   * 안내는 어느 날이든 같은 줄이 보이므로(exercise-list.tsx) 두 날의 세기를 함께
   * 적는다 — '숨이 찰 만큼'만 적으면 큰 경기 다음 날 회복날에도 그렇게 읽힌다.
   */
  cardio: { label: '유산소', hint: '회복날은 가볍게, 컨디셔닝 날은 숨이 찰 만큼' },
  mobility: { label: '가동성', hint: '천천히 관절을 열어 주세요' },
  main: { label: '본운동', hint: '오늘 주로 할 운동이에요' },
  core: { label: '코어', hint: '몸통을 단단하게' },
  /*
   * 보강.
   *
   * 이 구간이 없던 때는 '회복 및 보강' 39개 중 31개가 어느 구간에도 못 들어가
   * 한 번도 나오지 않았다. 고관절·내전근 보강은 투수의 부상 방지에서 가장
   * 중요한 축인데, 몸을 다지는 목표('컨디셔닝', 예전 이름 '부상 방지')를 두고
   * 정작 그 운동을 안 쓰면 이름만 있는 목표가 된다.
   */
  prehab: { label: '보강', hint: '고관절·내전근처럼 약해지기 쉬운 곳' },
  /*
   * 암케어는 이제 어느 날의 구성에도 없다 — 트레이닝의 암케어 화면에서 따로
   * 한다(2026-09-25). 칸은 남긴다. 그 전에 만든 일정과, 목록에서 직접 더한
   * 암케어를 보여줄 자리다(slotForTheme).
   */
  armcare: { label: '암케어', hint: '어깨·팔꿈치 관리로 마무리' },
};

/** 화면·구성에서 쓰는 구간 순서 */
/*
 * 유산소가 맨 앞이다. 회복날에 자전거·걷기로 몸을 데운 뒤 가동성과 보강을
 * 하는 것이 순서다 — 굳은 채로 관절부터 여는 것보다 낫다.
 */
export const SLOT_ORDER: SlotKey[] = [
  'cardio',
  'mobility',
  'main',
  'core',
  'prehab',
  'armcare',
];

type SlotSpec = {
  slot: SlotKey;
  /** 전체 시간에서 이 구간이 차지하는 비율 */
  share: number;
  /**
   * 자리가 남을 때만 넣는 곁가지 구간인가.
   *
   * 구간은 원래 시간이 모자라도 하나는 억지로 넣는다 — 본운동이 비는 날이
   * 없게 하려는 규칙이다. 그런데 회복날은 구간이 다섯이고 유산소 하나가 10분
   * 이라, 30분짜리 날에 구간마다 하나씩만 넣어도 38분이 됐다. 곁가지(컨디셔닝
   * 날의 유산소)는 시간이 남을 때만 넣고, 모자라면 건너뛴다. 남는 시간은 몫이
   * 가장 큰 구간(본운동, 없으면 회복날의 가동성처럼 몫이 가장 큰 구간)으로 간다.
   */
  optional?: boolean;
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
   * 계열이 비어 있는 파워는 예전에 지나갔다(막아버리면 영영 안 나온다고 봤다). 2판 P5 검토(2026-10-13)부터는 부위로 가른다 —
   * 하체 부위면 하체 칸에만, 메디신볼 · 어깨 · 팔꿈치면 상체 칸에만(fitsPowerSide, 분류 한 곳 exercise-class.ts). 하체 부위만 있는
   * 아이소 둘이 상체 날 파워 칸에 들어 무거운 하체가 이틀 이어졌다.
   */
  powerPatterns?: readonly string[];
  /**
   * 이 구간에 들어올 수 있는 스트렝스의 동작 계열.
   *
   * 목표에서 '상체 밀기'처럼 좁혔을 때만 채워진다. powerPatterns 와 나란한
   * 장치이되 거는 대상이 다르다 — 저쪽은 파워, 이쪽은 스트렝스다.
   *
   * 계열이 안 적힌 운동은 지나간다. 막아버리면 영영 안 나온다.
   */
  strengthPatterns?: readonly string[];
};

/*
 * 테마별 시간 배분표.
 *
 * 파워는 따로 자리를 만들지 않고 스트렝스 데이의 본운동에 섞는다.
 * 파워 운동이 6개뿐이라 전용 데이를 만들면 구성이 빈약하고,
 * 부하가 좋은 날에만 안전 필터를 통과하므로 자연스럽게 좋은 날에만 나온다.
 * 영상이 더 채워지면 전용 테마로 승격하면 된다.
 */
/**
 * 목표마다 웨이트 날의 구성이 다르다.
 *
 * 예전에는 하체날·상체날이 언제나 다섯 구간(워밍업·본운동·코어·보강·암케어)
 * 이었다. 그러니 한 시간에 종목이 열넷 되고 정작 무게를 드는 운동은 둘뿐이었다.
 * 한 시간에 열넷을 3세트씩 하는 사람은 없다.
 *
 * 목표가 무엇을 하러 온 날인지 정하므로, 구간도 목표가 정하게 한다.
 *
 *   근력 향상      본운동 · 코어
 *                 무게를 드는 데 시간을 몰아준다. 코어는 하나둘만 —
 *                 기본 목표라 예전 '균형 잡힌 관리'가 하던 몫을 넘겨받았다.
 *   파워 향상      본운동 · 코어
 *                 폭발력은 하체에서 코어를 지나 팔로 간다. 코어 없이
 *                 파워만 하면 힘이 새는 자리를 그대로 두는 셈이다.
 *   컨디셔닝      가동성 · 코어 · 보강 · 유산소
 *                 무게와 파워를 통째로 뺀다. 몸을 다지러 고른 날인데
 *                 스쿼트와 점프가 나오면 목표와 반대다. 유산소는 하나 —
 *                 영상이 아직 없으면 그 칸은 빠진다(dropEmptySlots).
 *
 * 2026-09-25 '균형 잡힌 관리'를 없앴다. 다섯 구간을 하나씩 다 쓰는 목표였는데,
 * 근력 향상과 거의 같은 날이 나와 고를 까닭이 흐렸다.
 *
 * 같은 날 암케어도 모든 일정에서 뺐다(사용자분과 정함). 투수에게 어깨 관리는
 * 매일인데, 일정의 한 구간으로 두니 운동을 안 하는 날에는 못 하고, 하는 날에는
 * 무게 운동의 몫을 떼어 갔다. 이제 트레이닝의 암케어 화면에서 그날 몸 상태에
 * 맞춰 따로 짠다(lib/armcare).
 */
type GoalShape = {
  /** 무게·파워를 하는 구간. 없으면 그 목표는 무게를 안 든다. */
  main?: { share: number; maxCount: number };
  /** 가동성 — 컨디셔닝만 쓴다 */
  mobility?: { share: number; maxCount: number };
  core?: { share: number; maxCount: number };
  prehab?: { share: number; maxCount: number };
  /** 유산소 — 컨디셔닝만 쓴다 */
  cardio?: { share: number; maxCount: number };
};

const GOAL_SHAPES: Record<string, GoalShape> = {
  '근력 향상': {
    main: { share: 0.7, maxCount: 8 },
    /* 예전 균형 잡힌 관리의 코어 몫 그대로 */
    core: { share: 0.1, maxCount: 2 },
  },
  '파워 향상': {
    main: { share: 0.62, maxCount: 8 },
    core: { share: 0.13, maxCount: 2 },
  },
  컨디셔닝: {
    /*
     * 가동성은 암케어가 빠진 자리에 들어왔다(2026-09-25). 몸을 다지는 날에 관절을
     * 여는 일이 빠지면 코어와 보강만 남는다.
     *
     * 개수 상한(코어 6 · 보강 7)은 75분이 차도록 잡았다. 암케어가 빠지기 전의
     * 4 · 5로는 75분을 부탁해도 60분 남짓에서 멈췄다.
     */
    mobility: { share: 0.2, maxCount: 4 },
    core: { share: 0.25, maxCount: 6 },
    prehab: { share: 0.3, maxCount: 7 },
    /*
     * 유산소 하나 — 10~15분짜리 자전거·걷기·가벼운 달리기·로잉 같은 것.
     *
     * 몸을 다지는 날에 심폐를 빼면 '컨디셔닝'이라는 이름이 반쪽이다. 하나로
     * 묶는 것은 유산소 둘을 이어 하는 사람이 없어서다. 영상이 아직 없는
     * 동안에는 이 칸이 빠지고 나머지가 그 몫을 나눠 쓴다(dropEmptySlots).
     *
     * 몫(0.34)은 60분에 10분짜리 하나(추정 14분)가 들어갈 만큼이다. 처음에 0.2로
     * 두었더니 목표별 곱을 지나 60분에 8분 남짓만 남아, 한 개도 안 맞는데 '빈
     * 구간은 억지로 하나' 규칙으로 들어가며 그때 있던 암케어 몫을 깎았다. 그래서
     * 곁가지로 두고(shapeToSpecs 의 optional) 맨 뒤에 채운다 — 짧은 날에 안 맞으면
     * 뺀다.
     */
    cardio: { share: 0.34, maxCount: 1 },
  },
};

/**
 * 목표가 정한 모양에 그 날의 본운동 카테고리를 끼워 구성을 만든다.
 *
 * 본운동에 무엇이 들어가는지(하체 스트렝스인지 상체 스트렝스인지, 파워는 어느
 * 계열까지인지)는 목표가 아니라 그날의 테마가 정한다. 모양과 내용을 따로 두면
 * 목표를 하나 더 만들 때 카테고리를 다시 적을 일이 없다.
 */
function shapeToSpecs(shape: GoalShape, mainSpec: SlotSpec): SlotSpec[] {
  const specs: SlotSpec[] = [];
  if (shape.main) {
    specs.push({ ...mainSpec, share: shape.main.share, maxCount: shape.main.maxCount });
  }
  if (shape.core) specs.push({ slot: 'core', ...shape.core, categories: ['코어'] });
  if (shape.prehab) {
    specs.push({ slot: 'prehab', ...shape.prehab, categories: ['회복 및 보강'] });
  }
  if (shape.mobility) {
    specs.push({ slot: 'mobility', ...shape.mobility, categories: ['모빌리티'] });
  }
  /*
   * 유산소는 맨 뒤에, 곁가지로 채운다. 채우는 차례가 곧 시간을 쓰는 차례라, 앞에
   * 두면 넘친 몫이 다른 구간에서 빠진다. 화면에 보이는 차례는 SLOT_ORDER 가 따로
   * 정한다(유산소가 맨 앞).
   */
  if (shape.cardio) {
    specs.push({
      slot: 'cardio',
      ...shape.cardio,
      categories: ['유산소'],
      optional: true,
    });
  }
  return specs;
}

const COMPOSITIONS: Record<ThemeKey, SlotSpec[]> = {
  lower: [
    {
      slot: 'main',
      share: 0.7,
      categories: ['하체 스트렝스', '파워'],
      /*
       * 하체날의 파워는 뛰고 미는 계열만. 목록은 무거운 하체 판정(lib/engine/exercise-class.ts isHeavyLower)과 한 벌이다 —
       * 하체날에 들어가는 점프와 등판 전에 빼는 점프가 어긋나지 않게(2판 P4).
       */
      powerPatterns: LOWER_POWER_PATTERNS,
      maxCount: 8,
    },
  ],
  upper: [
    {
      slot: 'main',
      share: 0.7,
      categories: ['상체 스트렝스', '파워'],
      /*
       * 상체날의 파워는 던지는 계열만 — 스쿼트·런지 점프는 하체날 몫이다. 목록은 상체 파워 판정(lib/engine/exercise-class.ts
       * isUpperPower)과 한 벌이다(2판 P5 — 고르기 점수 · 프로그램 겹침이 같은 말로 본다). 계열이 없는 파워까지 그 판정으로 가르는
       * 것은 fitsPowerSide(2판 P5 검토) — 그 전에는 목록만 같고 계열 없는 하체 파워가 이 칸에 들었다.
       */
      powerPatterns: UPPER_POWER_PATTERNS,
      maxCount: 8,
    },
  ],
  /*
   * 보조 데이 — 무게 대신 코어와 보강.
   *
   * 예전에는 코어와 암케어가 반씩이었다. 암케어를 일정에서 뺀 뒤(2026-09-25)
   * 그 몫을 보강과 가동성이 나눠 받는다. 코어만 남기면 90분에 코어가 열 개 넘게
   * 나온다 — 하루에 할 코어가 아니다.
   *
   * 개수 상한은 넉넉히 둔다. 하나에 4~7분이라, 상한이 빠듯하면 90분을 부탁해도
   * 상한에 먼저 걸려 시간이 덜 찬다.
   */
  assist: [
    { slot: 'main', share: 0.45, categories: ['코어'], maxCount: 6 },
    { slot: 'prehab', share: 0.35, categories: ['회복 및 보강'], maxCount: 5 },
    { slot: 'mobility', share: 0.2, categories: ['모빌리티'], maxCount: 4 },
  ],
  /*
   * 회복 데이도 상한을 넉넉히 둔다.
   *
   * 예전에는 회복이 무조건 35분이라 넷씩이면 충분했다. 시간에 비례해 30·40·45분이
   * 되고 나니 워밍업과 암케어가 개수 상한에 먼저 걸려, 45분을 잡아도 35분치밖에
   * 안 나왔다. 회복 운동은 하나에 1~4분이라 개수가 있어야 시간이 찬다.
   */
  recovery: [
    /*
     * 회복 데이의 가동성은 준비 운동이 아니라 그날의 운동이다.
     *
     * 다른 날에서는 워밍업을 아예 안 뽑지만, 이 날만은 남긴다. 투수의 회복
     * 데이에서 가동성을 빼면 그날의 4분의 1이 사라지고 남는 것은 보강과
     * 암케어뿐이다. 그래서 여기서는 구간 이름도 '가동성'이고, 한 것도 평소
     * 처럼 기록에 남는다.
     */
    /*
     * 2026-09-23 다시 짰다 (사용자분과 정한 C안).
     *
     * 실제로 뽑아 보니 두 가지가 걸렸다. 덤벨 발목 안정성 스쿼트·덤벨 라잉
     * 트라이셉스 익스텐션처럼 무게를 드는 '중간' 운동이 섞여 나왔고(가벼운 것만
     * 받는 거르개는 pickForTheme 의 isRecoveryLight), 90구를 던진 다음 날
     * 가장 챙길 팔이 한두 개뿐이었다.
     *
     * 그래서 팔 중심으로 나누고(가동성 30 · 암케어 45 · 보강 15 · 코어 10),
     * 맨 앞에 가벼운 유산소를 25% 둔다 — 나머지는 그 비율 그대로 75% 안에서
     * 나눈다. 유산소 영상이 아직 없는 동안에는 그 구간이 통째로 빠지고
     * (dropEmptySlots) 앞의 비율이 그대로 살아난다.
     *
     * 2026-09-25 다시 짰다. 암케어는 모든 일정에서 빠져 트레이닝의 암케어
     * 화면으로 갔다 — 던진 다음 날은 그 화면이 회복 루틴을 짜 준다. 회복날은
     * 아주 가볍게만: 가동성 · 가벼운 유산소 · 가벼운 보강(사용자분과 정함).
     * 코어도 뺐다. 몸을 쉬게 하려고 잡은 날이다.
     *
     * ■ 적힌 차례가 곧 채우는 차례다
     *
     * 구간은 여기 적힌 차례대로 채우고, 하루 전체 시간 한도는 앞에서부터 쓴다.
     * 처음에 화면 순서대로(유산소 → 가동성 → …) 적었더니 앞 구간들이 조금씩
     * 넘겨 쓴 끝에 가장 챙길 구간이 한 개밖에 못 들어가는 날이 나왔다. 그래서
     * 중요한 순서로 적는다 — 이 날의 몸통인 가동성이 맨 앞이고, 남는 시간도
     * 몫이 가장 큰 가동성으로 간다. 화면에 보이는 순서는 SLOT_ORDER 가 따로
     * 정하므로 이 차례와 상관없다.
     */
    { slot: 'mobility', share: 0.45, categories: ['모빌리티'], maxCount: 8 },
    { slot: 'cardio', share: 0.25, categories: ['유산소'], maxCount: 1 },
    { slot: 'prehab', share: 0.3, categories: ['회복 및 보강'], maxCount: 4 },
  ],
};

/**
 * 회복날에 내보내도 되는 운동인가 — 낮음 이하 강도, 무게를 드는 장비 없이.
 *
 * 회복날은 몸을 쉬게 하려고 잡은 날이다. 강도가 '중간'이면 평소 훈련일 수준이고
 * (lib/exercise-meta.ts 의 INTENSITY_LEVELS), 덤벨·바벨·케틀벨·원판·케이블은
 * 그 자체로 무게를 싣는다. 90구를 던진 다음 날 팔꿈치에 덤벨을 드는 운동이
 * 나오는 일을 막는다.
 *
 * 새로 고르는 것에만 쓴다. 오늘 이미 마친 운동이나 직접 더한 운동은 빼지
 * 않는다 — 한 것은 사실이고, 넣은 것은 본인이다.
 */
function isRecoveryLight(ex: ThemedExercise): boolean {
  return (
    intensityLevel(ex.intensity) <= intensityLevel('낮음') &&
    !(ex.equipment ?? []).some((q) => HEAVY_EQUIPMENT.includes(q))
  );
}

/**
 * 후보가 하나도 없는 구간은 빼고 나머지 비율을 다시 나눈다.
 *
 * 유산소는 영상이 올라오기 전까지 비어 있다. 그대로 두면 그 몫(25%)은 남는
 * 시간으로 떠돌다 한 구간에 몰린다. 빼고 나누면 나머지가 원래 비율대로 그
 * 시간을 나눠 갖고, 영상이 올라오는 날부터는 저절로 들어온다.
 */
function dropEmptySlots<T extends ThemedExercise>(
  specs: SlotSpec[],
  pool: T[]
): SlotSpec[] {
  const kept = specs.filter((sp) =>
    pool.some((ex) => sp.categories.includes(ex.category))
  );
  if (kept.length === specs.length || kept.length === 0) return specs;
  const total = kept.reduce((sum, sp) => sum + sp.share, 0);
  return kept.map((sp) => ({ ...sp, share: sp.share / total }));
}

/**
 * 훈련 목표를 반영한 시간 배분을 만든다.
 *
 * 목표마다 구간에 곱하는 값이 있고(personalize.ts의 weights), 곱한 뒤 합이
 * 1이 되도록 다시 나눈다. 정규화를 빼먹으면 목표를 고른 것만으로 전체 운동
 * 시간이 늘거나 줄어든다 — "45분"이라고 해놓고 52분치를 주게 된다.
 *
 * 회복 데이는 목표를 반영하지 않는다. 몸을 지키려고 잡은 날인데 '파워 향상'을
 * 골랐다고 파워 비중을 올리면 회복 데이의 뜻이 없어진다.
 *
 * 예전에는 32분 아래의 짧은 날에 코어·보강을 먼저 뺐다. 가장 짧은 선택지가
 * 45분이 되고 일정에 구간이 둘셋만 남으면서 그 규칙이 걸릴 일이 없어져 지웠다.
 */
export function compositionFor(
  theme: ThemeKey,
  goalName: string | null,
  focus?: GoalFocusKey | null
): SlotSpec[] {
  /*
   * 웨이트 날은 목표가 구성을 정한다. 컨디셔닝을 고르면 웨이트 날의 구성을
   * 통째로 바꾼다.
   *
   * 보조 데이와 회복 데이는 그대로 둔다 — 이미 무게를 안 드는 구성이고,
   * 그 날들은 투구량이 정한 것이라 목표가 뒤집을 자리가 아니다.
   */
  const shape = goalName == null ? undefined : GOAL_SHAPES[goalName];
  const mainSpec = COMPOSITIONS[theme].find((sp) => sp.slot === 'main');
  const base: readonly SlotSpec[] =
    shape && mainSpec && (theme === 'lower' || theme === 'upper')
      ? shapeToSpecs(shape, mainSpec)
      : COMPOSITIONS[theme];

  const goal = theme === 'recovery' ? null : findGoal(goalName);
  const weighted = base.map((spec) => ({
    spec,
    /*
     * 목표별 곱은 웨이트 날의 구간에만 있다. 유산소처럼 곱을 안 적어 둔 구간
     * (회복날·컨디셔닝의 유산소)은 1이다 — 회복날은 목표를 아예 안 본다.
     */
    share:
      spec.share *
      (goal ? ((goal.weights as Partial<Record<SlotKey, number>>)[spec.slot] ?? 1) : 1),
  }));
  const total = weighted.reduce((sum, w) => sum + w.share, 0);

  const specs = weighted.map(({ spec, share }) => ({
    ...spec,
    share: share / total,
  }));

  /*
   * 목표에서 '상체 밀기'처럼 좁혔으면 본운동의 스트렝스를 그 계열로만 둔다.
   *
   * 카테고리를 갈아치우지 않고 계열만 얹는다 — 상체 데이의 본운동은
   * '상체 스트렝스 + 파워' 한 자리라, 카테고리를 바꾸면 파워가 통째로 빠진다.
   */
  const pattern = findFocus(focus)?.pattern;
  if (!pattern) return specs;
  return specs.map((sp) =>
    sp.slot === 'main' ? { ...sp, strengthPatterns: [pattern] } : sp
  );
}

/**
 * 파워가 이 구간의 쪽(하체 · 상체)에 드는가 — 분류 한 곳(lib/engine/exercise-class.ts)의 판정 그대로.
 *
 *   하체 칸(LOWER_POWER_PATTERNS)  isLowerPower — 계열이 하체이거나, 계열이 없으면 하체 부위
 *   상체 칸(UPPER_POWER_PATTERNS)  isUpperPower 이고 isLowerPower 가 아님 — 계열이 없는 파워는 하체 부위가 있으면 하체 몫이다
 *
 * 2판 P5 검토(2026-10-13)에서 고쳤다. 예전에는 계열이 없는 파워면 검사를 건너뛰어 어느 칸에나 들었다. 그래서 하체 부위 꼬리표만 있는
 * 하체 파워(발목 아이소메트릭 프레스 · 가속 포지션 아이소 홀드)가 상체 날 파워 칸에 들었고, P5 점수가 내일 프로그램과 겹치는 상체 파워를
 * 뒤로 밀자 그 자리를 채워 무거운 하체가 이틀 이어진 짝(기준선 ㉑)이 35 → 42 로 늘었다. 계열이 있는 파워는 예전과 같다(계열 하나는
 * 두 목록 중 한쪽에만 있다). 계열이 없고 어느 쪽도 아닌 파워는 이제 어느 칸에도 안 든다 — 2026-10-12 표에는 없다(44개가 모두 한쪽).
 * 칸은 목록의 정체(같은 배열)로 가른다 — COMPOSITIONS · shapeToSpecs 가 그 배열을 그대로 옮긴다. 다른 목록이면 예전처럼 계열만 본다.
 */
function fitsPowerSide(ex: ThemedExercise, patterns: readonly string[]): boolean {
  const cls = { ...ex, equipment: ex.equipment ?? [] };
  if (patterns === LOWER_POWER_PATTERNS) return isLowerPower(cls);
  if (patterns === UPPER_POWER_PATTERNS) return isUpperPower(cls) && !isLowerPower(cls);
  return ex.movementPattern == null || patterns.includes(ex.movementPattern);
}

/**
 * 이 운동이 이 구간의 규격에 맞는가 — 카테고리, 파워면 구간의 쪽(fitsPowerSide), 스트렝스면 좁힌 계열.
 *
 * pickForTheme 의 구간별 후보 거르기와 본운동 후보 세기(mainCandidateCount)가 같은 규칙을 쓰려고 뗐다. 회복날의
 * '가벼운 것만'(isRecoveryLight)은 여기 없다 — 테마 전체에 걸리는 조건이라 pickForTheme 이 따로 본다.
 */
function fitsSlot(ex: ThemedExercise, spec: SlotSpec): boolean {
  if (!spec.categories.includes(ex.category)) return false;
  /* 파워는 이 구간에 맞는 계열만 — 상체날에 스쿼트 점프가 들어오지 않게 */
  if (
    ex.category === '파워' &&
    spec.powerPatterns &&
    !fitsPowerSide(ex, spec.powerPatterns)
  ) {
    return false;
  }
  /* 목표에서 '상체 밀기'처럼 좁힌 날은 스트렝스도 그 계열만 */
  if (
    ex.category.endsWith('스트렝스') &&
    spec.strengthPatterns &&
    ex.movementPattern != null &&
    !spec.strengthPatterns.includes(ex.movementPattern)
  ) {
    return false;
  }
  return true;
}

/**
 * 이 테마 · 목표에서 본운동 구간에 들어갈 수 있는 후보 수. 본운동 구간이 없는 구성(컨디셔닝 목표 · 회복)이면 null.
 */
export function mainCandidateCount(
  candidates: readonly ThemedExercise[],
  theme: ThemeKey,
  goalName: string | null,
  focus?: GoalFocusKey | null
): number | null {
  const spec = compositionFor(theme, goalName, focus).find((sp) => sp.slot === 'main');
  if (!spec) return null;
  return candidates.filter((ex) => fitsSlot(ex, spec)).length;
}

/**
 * 이 테마 · 목표 · 좁힌 부위의 어느 구간에든 들어갈 수 있는 운동인가 — pickForTheme 이 구간마다 거르는 규칙(fitsSlot)과 회복날의 '가벼운
 * 것만'(isRecoveryLight)을 같이 본다. 고르는 데는 안 쓴다. 일정 까닭(score.ts planReasonItemsOf, 2판 P5-j)이 '그날 구간을 두고 겨룬 후보'만
 * 세려고 쓴다 — 상체 날에 하체 점프까지 세면 그날과 상관없는 '하체 점프는 뒤로 뒀어요'를 말한다. 구성은 한 번만 만들고 판정 함수를
 * 돌려준다(후보 수백 개에 쓴다).
 */
export function competesForDay(
  theme: ThemeKey,
  goalName: string | null,
  focus?: GoalFocusKey | null
): (ex: ThemedExercise) => boolean {
  const specs = compositionFor(theme, goalName, focus);
  return (ex) =>
    (theme !== 'recovery' || isRecoveryLight(ex)) &&
    specs.some((sp) => fitsSlot(ex, sp));
}

/**
 * 날을 바꿀 때 가지 않을 쪽과 그 까닭(2판 P6-3, 2026-10-13) — steerFromEmptyMain · steerForLowerBudget 가 읽는다.
 *   pain   통증 때문에 피한 쪽(painAvoidedSide — steerAroundPain 이 비켜 간 쪽)
 *   arm    팔을 아끼는 날(중재의 팔 예산을 다 씀 · 팔 피로 '많이' 이상) — 상체로 가면 상체 무게가 새로 생긴다(비판 1 빈틈 28)
 *   stiff  어깨 · 팔꿈치 · 손목이 오늘 '뻐근'
 *   rehab  어깨 · 팔꿈치 재활 1~3단계
 * 예전(2판 P6-2 까지)에는 통증 쪽 하나('lower' | 'upper' | null)였다. 중재(lib/engine/arbiter.ts)의 '상체로 가도 되는가'(upperBlockedBy)를
 * 같이 받으려고 배열로 넓혔다 — 통증만 주면 예전과 글자까지 같다(같은 글 · 같은 차례).
 */
export type SteerAvoidReason = 'pain' | 'arm' | 'stiff' | 'rehab';
export type SteerAvoid = { side: 'lower' | 'upper'; because: SteerAvoidReason };

/** 그쪽으로 안 가는 까닭 — '{반대쪽}는 … 쉬어요'의 가운데 */
const STEER_AVOID_WHY: Record<SteerAvoidReason, string> = {
  pain: '아픈 곳이라',
  arm: '팔을 아끼는 날이라',
  stiff: '뻐근한 곳이라',
  rehab: '재활 중이라',
};

/**
 * 근력 날인데 그쪽 본운동 후보가 하나도 없으면 날을 바꾼다 — 반대쪽 근력 날로, 그것도 없거나 어제 했으면 보조 · 코어 날로.
 *
 * 2026-10-11 (트레이닝 추천 2판 P1 '대비책 상한'). 예전에는 본운동이 비면 pickForTheme 의 대비책이 모빌리티 · 암케어만 빼고
 * 아무 운동으로 채웠다(최대 여덟). 상체 후보가 0 인 표(맨몸 · 입문은 상체 스트렝스가 1개)에서는 상체 날마다 하체 운동이
 * 들어가고, 그것을 마치면 '하체를 한 날'이 되어 다음 날도 상체 차례 — 상체 날에 갇힌 채 하체를 7일 연속 들었다(자체 시험 (e)).
 *
 * 규칙
 *   사용자가 오늘 부위를 좁혔으면(focus) 바꾸지 않는다 — 사용자 선택이 이긴다. 그날은 대비책이 두 개까지만 채우고 알린다.
 *   본운동 구간이 없는 구성(컨디셔닝 목표)은 셀 것이 없으니 그대로.
 *   반대쪽으로 가되, 반대쪽을 어제 했으면(완료든 계획이든 — lastLowerKey/lastUpperKey) 보조 · 코어 날 — 같은 쪽 무거운 날을
 *   이틀 잇지 않는다(가정: 하체 · 상체 모두 하루는 쉰다. 2판 중재의 '하체 48시간 예산'과 같은 뜻).
 *   이유 글은 원래 까닭 뒤에 한 줄 더한다 — 왜 차례와 다른 날이 됐는지 사용자가 읽을 수 있게.
 */
export function steerFromEmptyMain({
  day,
  candidates,
  goalName,
  focus = null,
  lastLowerKey,
  lastUpperKey,
  asOf,
  avoid = [],
}: {
  day: SessionTheme;
  /** 안전 거르기를 지난 후보(selectCandidates) — 그 안에서만 센다 */
  candidates: readonly ThemedExercise[];
  goalName: string | null;
  focus?: GoalFocusKey | null;
  lastLowerKey: string | null;
  lastUpperKey: string | null;
  /** 오늘(YYYY-MM-DD) */
  asOf: string;
  /**
   * 가지 않을 쪽(SteerAvoid — 통증 쪽 painAvoidedSide, 중재의 '상체로 가도 되는가'). 그쪽으로는 되돌아가지 않고 보조 · 코어 날로 간다.
   * 앞의 것이 글을 정한다(부르는 쪽이 통증을 먼저 넣는다).
   */
  avoid?: readonly SteerAvoid[];
}): SessionTheme {
  if (day.key !== 'lower' && day.key !== 'upper') return day;
  if (focus) return day;
  const own = mainCandidateCount(candidates, day.key, goalName);
  if (own == null || own > 0) return day;

  const other: ThemeKey = day.key === 'lower' ? 'upper' : 'lower';
  const otherCount = mainCandidateCount(candidates, other, goalName) ?? 0;
  const part = day.key === 'lower' ? '하체' : '상체';
  const otherPart = other === 'lower' ? '하체' : '상체';
  const otherLast = other === 'lower' ? lastLowerKey : lastUpperKey;
  const yesterday = shiftDateKey(asOf, -1);

  const blocked = avoid.find((a) => a.side === other);
  if (otherCount > 0 && otherLast !== yesterday && !blocked) {
    return {
      key: other,
      label: other === 'lower' ? '하체 스트렝스 데이' : '상체 스트렝스 데이',
      reason: `${day.reason} ${part} 운동이 없어 오늘은 ${otherPart}를 해요. 오늘 운동을 만들 때 장비를 더 켜면 ${part} 날이 생겨요.`,
    };
  }
  const why =
    otherCount === 0
      ? '하체 · 상체 운동이 모두 없어 오늘은 코어와 보강을 해요. 오늘 운동을 만들 때 장비를 더 켜면 근력 날이 생겨요.'
      : blocked
        ? `${part} 운동이 없고 ${otherPart}는 ${STEER_AVOID_WHY[blocked.because]} 쉬어요. 오늘은 코어와 보강을 해요.`
        : `${part} 운동이 없고 ${otherPart}는 어제 했어요. 오늘은 코어와 보강을 해요.`;
  return { key: 'assist', label: '보조·코어 데이', reason: `${day.reason} ${why}` };
}

/** 하체 예산을 '그래도 하기'로 넘긴 날의 한 줄 — 까닭(어제 · 내일 · 프로그램)과 상관없이 같은 말 */
export const LOWER_BUDGET_OVERRIDE_NOTE =
  '무거운 하체를 쉬는 날이지만 고른 대로 해요. 아프면 바로 멈춰요.';

/**
 * 하체 예산(중재 lib/engine/arbiter.ts lowerBudget — 무거운 하체가 48시간 안에 두 번 없게)이 막은 날, 하체 날을 바꾼다(2판 P6-3, 2026-10-13).
 *
 * 왜. 매일 일정끼리는 번갈아 규칙이 어제 하체면 오늘 상체로 보낸다. 그런데 근력 프로그램과 일정 사이(어제 프로그램 스쿼트 → 오늘 일정 하체,
 * 오늘 일정 하체 → 내일 프로그램 스쿼트)는 아무도 안 봤다(기준선 ㉑ 이 0 인 것은 대본이 우연히 그랬을 뿐 막는 규칙이 없었다). 부르는 쪽
 * (daily-plan.ts)이 무거운 하체(exercise-class.ts isHeavyLower)를 후보에서 이미 뺐고, 여기서는 날만 정한다.
 *
 * 규칙(위가 이긴다)
 *   하체 날이 아니면 그대로 — 상체 · 보조 · 회복 날에는 무거운 하체가 처음부터 안 든다.
 *   사용자가 오늘 부위를 좁혔으면(focus) 하체 날 그대로, 무거운 것만 빠진다 — 사용자 선택이 이긴다(steerFromEmptyMain 과 같은 원칙). 한 줄을 단다.
 *   본운동 구간이 없는 목표(컨디셔닝)도 그대로 — 바꿀 본운동이 없다. 한 줄을 단다.
 *   상체로 갈 수 있으면 상체 날 — 상체 본운동 후보가 있고, 어제 상체가 아니고, 상체를 피할 까닭(avoid — 팔을 아끼는 날 · 통증 · 뻐근 · 재활)이 없을 때.
 *   그 밖에는 보조 · 코어 날(비판 1 빈틈 28 — 상체로 가면 상체 무게가 새로 생긴다).
 * 이유 글은 원래 까닭 뒤에 예산의 한 줄과 어디로 갔는지를 붙인다(steerFromEmptyMain 과 같은 꼴).
 * 부르는 쪽은 무거운 하체를 실제로 뺀 날(하체 날에 들 무거운 하체가 있었던 날)에만 부른다 — 빼지도 않은 날 날을 바꾸지 않게.
 */
export function steerForLowerBudget({
  day,
  candidates,
  goalName,
  focus = null,
  lastUpperKey,
  asOf,
  avoid = [],
  text,
}: {
  day: SessionTheme;
  /** 하체 예산으로 무거운 하체를 뺀 뒤의 후보(안전 거르기도 지난 것) */
  candidates: readonly ThemedExercise[];
  goalName: string | null;
  focus?: GoalFocusKey | null;
  lastUpperKey: string | null;
  /** 오늘(YYYY-MM-DD) */
  asOf: string;
  /** 가지 않을 쪽(SteerAvoid) — 'upper' 가 있으면 상체로 안 간다 */
  avoid?: readonly SteerAvoid[];
  /** 하체 예산의 한 줄(arbiter LOWER_BUDGET_TEXT — 막힌 까닭) */
  text: string;
}): SessionTheme {
  if (day.key !== 'lower') return day;
  const noted = { ...day, reason: `${day.reason} ${text}` };
  if (focus) return noted;
  if (mainCandidateCount(candidates, 'lower', goalName) == null) return noted;
  const upperCount = mainCandidateCount(candidates, 'upper', goalName) ?? 0;
  const yesterday = shiftDateKey(asOf, -1);
  if (
    upperCount > 0 &&
    lastUpperKey !== yesterday &&
    !avoid.some((a) => a.side === 'upper')
  ) {
    return {
      key: 'upper',
      label: '상체 스트렝스 데이',
      reason: `${day.reason} ${text} 대신 상체를 해요.`,
    };
  }
  return {
    key: 'assist',
    label: '보조·코어 데이',
    reason: `${day.reason} ${text} 대신 코어와 보강을 해요.`,
  };
}

/**
 * 테마를 반영해 실제로 쓸 시간을 정한다. 회복 데이는 길게 잡아도 줄인다.
 *
 * 5분 단위로 내림한다. "31분으로 줄였습니다"는 계산기가 뱉은 값처럼 보이고,
 * 사람이 시계를 보며 운동하는 단위도 아니다. 45·60·75·90분은 각각 30·40·40·40분이
 * 된다.
 */
export function effectiveMinutes(theme: ThemeKey, requested: number): number {
  if (theme !== 'recovery') return requested;
  const scaled = Math.floor((requested * RECOVERY_SHARE) / 5) * 5;
  return Math.min(scaled, RECOVERY_MAX_MINUTES);
}

/** 등판 창 안의 하체 날에 붙이는 한 줄 — 안전 거르기(prescription.ts 2-2)가 무거운 하체를 뺀 날 */
export const OUTING_LIGHT_LOWER_NOTE =
  '등판이 가까워 무거운 하체는 빼고 가벼운 하체 운동으로 해요.';

/**
 * 날을 다 정한 뒤 붙이는 표시(2판 P4 커밋 E) — buildDailyPlan 이 마지막에 한 번 부른다.
 *
 * 날을 바꾸는 함수(steerAroundPain · steerFromEmptyMain · conditioningDay)는 테마를 새 객체로 만들어 칸 · 이유 끝줄이 빠진다. 그래서
 * 표시용은 날이 다 정해진 뒤 날 종류(dk)와 마지막 key 로 한 번에 붙인다(설계 검토 G18):
 *   heavyLowerAllowed  등판 창이 무거운 하체를 뺀 날에만 false 를 싣는다(없으면 든다 — 옛 일정과 같은 뜻, JSON 이 흔들리지 않게)
 *   하체 날 한 줄     그날 하체 날이고 본운동이 있는 목표(컨디셔닝 아님)면 OUTING_LIGHT_LOWER_NOTE
 *   짧게 한 줄        shortened 가 오면(구원 '어제 실전 강도로 20구 넘게', 회복 날 아님) 몇 분으로 줄였는지
 * 무거운 하체를 실제로 빼는 일은 prescription.ts 가 이미 했다 — 여기서는 글과 표시만 붙인다.
 */
export function finishDayTheme(
  theme: SessionTheme,
  dk: DayKind,
  {
    conditioning,
    shortened,
  }: {
    /** 목표가 컨디셔닝이라 본운동(무게)이 없는 날 */
    conditioning: boolean;
    /** 짧게 잡았으면 { 어제 실전 강도로 던진 공 · 줄인 분 }, 아니면 null */
    shortened: { pitches: number; minutes: number } | null;
  }
): SessionTheme {
  const lines = [theme.reason];
  if (!dk.heavyLowerAllowed && theme.key === 'lower' && !conditioning) {
    lines.push(OUTING_LIGHT_LOWER_NOTE);
  }
  if (shortened) {
    lines.push(
      `어제 실전 강도로 ${shortened.pitches}구를 던져 오늘은 ${shortened.minutes}분으로 짧게 잡았어요.`
    );
  }
  return {
    key: theme.key,
    label: theme.label,
    reason: lines.join(' '),
    ...(dk.heavyLowerAllowed ? {} : { heavyLowerAllowed: false }),
  };
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
  /** 쓰는 장비. 회복날에 무게를 드는 장비를 거르는 데 쓴다 (isRecoveryLight). */
  equipment?: string[];
} & Partial<Prescription>;

export type ThemedPick<T> = { exercise: T; slot: SlotKey };

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
  for (const spec of specs) {
    if (spec.categories.includes(ex.category)) return spec.slot;
  }
  /*
   * 맞는 구간이 없으면 본운동에, 본운동이 없는 테마라면 첫 구간에 둔다.
   * 단 유산소 칸에는 넣지 않는다 — 회복날에 직접 더한 스쿼트가 '유산소'
   * 아래에 들어가면 순서가 뜻을 잃는다.
   */
  return (
    specs.find((s) => s.slot === 'main') ??
    specs.find((s) => s.slot !== 'cardio') ??
    specs[0]
  ).slot;
}

/**
 * 사용자가 직접 더한 운동을 어느 구간에 놓을지.
 *
 * 만들어 준 목록을 그대로 하는 사람은 없다. 빼기도 하고 더하기도 하는데,
 * 더한 것도 자기 자리에 들어가야 순서(워밍업 → 본운동 → …)가 뜻을 잃지 않는다.
 * 목표는 구간의 시간 배분을 정하는 값이라 여기서는 보지 않는다 — 자리만 정한다.
 */
export function slotForTheme(ex: ThemedExercise, theme: ThemeKey): SlotKey {
  /*
   * 암케어는 어느 날의 구성에도 없다(암케어 화면에서 따로 한다). 그래도 목록에서
   * 직접 더할 수는 있어서, 그때는 제 이름의 칸에 둔다 — 하체날 본운동 아래에 밴드
   * 외회전이 끼면 순서가 뜻을 잃는다.
   */
  if (ex.category === '암케어') return 'armcare';
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
export const RETURN_SESSIONS = 6;

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
 *
 * 고르기 점수(scoreOf, 2판 P5-i · 2026-10-12)는 ① ② ③ 무리 안에서만 첫째 키로 쓴다 — 클수록 앞. 예전에는 무리 안 차례가
 * '오래된 것 · 씨앗'뿐이라, 어깨가 뻐근한 날 · 내일 등판인 날에도 같은 줄에서 같은 운동이 뽑혔다(기준선 ⑰ 11.4%). 무리 나누기 ·
 * 번갈아 내기는 점수보다 위에 둔다 — 오래 안 한 것을 다시 꺼내는 규칙(위 '같은 조건에서 55%')을 점수가 뒤집으면 안 된다. 동점은
 * 지금 키(① ③ 오래된 것 → 씨앗, ② 씨앗)가 가른다. 그래서 모든 점수가 0 이면 점수 없이 부른 것과 글자까지 같은 차례다(정렬이
 * 안정적이라). ④ 최근 사흘은 점수를 안 매기고 후보 차례 그대로 맨 뒤 — 점수가 높아도 회복 규칙을 못 넘는다. 점수는 빼지 않는다.
 * 빼는 것은 안전 거르기(prescription.ts selectCandidates)의 몫이라, 점수가 틀려도 위험한 운동이 들어오지 않는다.
 *
 * 자체 시험이 직접 부른다(scripts/training-selftest.mts '[2판 P5] 차례에 점수') — 앱은 pickForTheme 으로만 부른다.
 */
export function orderCandidates<T extends ThemedExercise>(
  candidates: T[],
  {
    recentIds,
    sessionsAgo,
    rotationSeed,
    scoreOf,
  }: {
    recentIds: Set<string>;
    sessionsAgo: Map<string, number>;
    rotationSeed?: string;
    /** 운동마다 고르기 점수(클수록 앞). 안 주면 예전 차례 그대로 */
    scoreOf?: (ex: T) => number;
  }
): T[] {
  if (
    recentIds.size === 0 &&
    sessionsAgo.size === 0 &&
    rotationSeed == null &&
    scoreOf == null
  ) {
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
    (sessionsAgo.get(b.id) ?? 0) - (sessionsAgo.get(a.id) ?? 0) ||
    seedOf(a) - seedOf(b);
  /*
   * 점수는 운동마다 한 번만 센다(정렬이 비교마다 부르면 같은 운동을 여러 번 센다). 숫자가 아닌 값(NaN · 무한)은 0 으로 —
   * 비교가 NaN 을 내면 정렬 차례가 엔진마다 달라진다. 최근 사흘 무리는 점수를 안 쓰니 세지 않는다.
   */
  const scores = new Map<T, number>();
  if (scoreOf != null) {
    for (const ex of [...due, ...fresh, ...early]) {
      const v = scoreOf(ex);
      scores.set(ex, Number.isFinite(v) ? v : 0);
    }
  }
  const byScore = (a: T, b: T) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0);

  due.sort((a, b) => byScore(a, b) || byAge(a, b));
  early.sort((a, b) => byScore(a, b) || byAge(a, b));
  fresh.sort((a, b) => byScore(a, b) || seedOf(a) - seedOf(b));

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

/** 근력 날 첫 칸의 무거운 복합 운동 — 그날 쪽 스트렝스, 강도 '높음' 이상, 몸 전체를 쓰는 계열 */
const ANCHOR_PATTERNS: Partial<Record<ThemeKey, { category: string; patterns: string[] }>> = {
  lower: { category: '하체 스트렝스', patterns: ['스쿼트', '힌지', '런지'] },
  upper: { category: '상체 스트렝스', patterns: ['밀기', '당기기'] },
};

export function isStrengthAnchor(
  ex: { category: string; intensity: string; movementPattern?: string | null },
  theme: ThemeKey
): boolean {
  const a = ANCHOR_PATTERNS[theme];
  return (
    a != null &&
    ex.category === a.category &&
    ex.movementPattern != null &&
    a.patterns.includes(ex.movementPattern) &&
    intensityLevel(ex.intensity) >= INTENSITY_CAP.STRENGTH
  );
}

/**
 * 테마와 시간에 맞춰 오늘의 운동을 고른다.
 *
 * 반환 순서는 화면 순서와 같다(SLOT_ORDER): 유산소 → 가동성 → 본운동 → 코어 → 보강.
 */
export function pickForTheme<T extends ThemedExercise>({
  candidates,
  theme,
  minutes,
  doneIds,
  recentIds,
  sessionsAgo,
  lastSessionIds,
  rotationSeed,
  preferredParts = [],
  preferredWorkout = null,
  goal = null,
  focus = null,
  scoreOf,
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
   * 가장 최근 세션에 한 운동(daily-plan.ts lastSessionIdsOf) — 보강 칸만 이것을 다시 고르지 않는다. sessionsAgo 는 차례에만 쓰고(자체 시험이 지킨다) 빼는 일은
   * 이 칸이 따로 한다. 없으면 빼지 않는다.
   */
  lastSessionIds?: Set<string>;
  /**
   * 아직 안 해본 운동들의 순서를 섞는 씨앗.
   *
   * 보통은 오늘 날짜를 넣는다 — 그러면 날마다 다른 순서가 나오고, 같은 날에는
   * 늘 같은 순서라 만들어 둔 일정이 안 바뀐다. 이것이 없으면 완료 표시를 안
   * 하는 사람은 매일 똑같은 일곱 개를 받는다.
   *
   * 날짜가 아니어도 된다. '다시 만들기'는 여기에 지금 일정을 섞어 넣어, 같은
   * 날에도 다른 목록이 나오게 한다. 앱은 맨 앞에 사용자 id 를 붙인다(training-setup.ts) —
   * 설정이 같은 두 사람이 같은 날 같은 목록을 받지 않게(2026-10-11 P1).
   */
  rotationSeed?: string;
  /**
   * 오늘 하고 싶다고 고른 부위 — 본운동 후보에서 먼저 고른다(시간이 모자라면 이쪽이 남는다).
   * 화면에서 하는 차례는 lib/report/exercise-order.ts 가 따로 정한다.
   */
  preferredParts?: string[];
  /**
   * 오늘 하고 싶다고 고른 운동 종류 — 파워 / 웨이트.
   *
   * 본운동은 스트렝스와 파워가 섞인 자리라, 고른 쪽을 후보에서 먼저 고른다. 하는 차례는
   * exercise-order.ts 가 정한다 — 파워가 있으면 늘 맨 앞(지치기 전에 하는 운동이라).
   * '회복'은 여기 오지 않는다 — 그건 테마 자체를 회복으로 바꾼다.
   */
  preferredWorkout?: string | null;
  /** 훈련 목표 — 구간별 시간 배분과 본운동에서 먼저 고를 것을 바꾼다 */
  goal?: string | null;
  /** 목표 안에서 좁힌 부위 — 본운동의 스트렝스를 한 계열로 줄인다 */
  focus?: GoalFocusKey | null;
  /**
   * 운동마다 고르기 점수 — 오늘 상태(뻐근한 관절 · 다음 등판 · 팔 피로 · 프로그램 · 뺀 운동 · 빠진 계열 · 즐겨찾기)를 작은 정수로
   * 매긴 것(score.ts 의 scoreOf 가 낸 total 을 넘긴다, 2판 P5). 클수록 먼저 본다.
   *
   * 차례만 바꾼다 — 무리(돌아올 것 · 처음 보는 것 · 이른 것) 안에서만 첫째 키라(orderCandidates), 최근 사흘은 그대로 맨 뒤,
   * 오늘 고른 운동 종류 · 부위 · 목표가 먼저 고를 쪽(아래 안정 분할 셋)과 거름(구간 규격 · 시간 · 계열 겹침 · 파워 비중)은
   * 점수보다 위다. 빼는 일은 없다. 안 주면 예전 차례 그대로 — 모든 점수가 0 이어도 같다.
   */
  scoreOf?: (ex: T) => number;
}): { picks: ThemedPick<T>[]; estimatedMinutes: number; notes: string[] } {
  /*
   * 목표를 안 준 날은 오늘 고른 운동 종류를 따른다 — 일정 만들기와 같은 규칙이다
   * (lib/report/personalize.ts 의 goalForUnchosen). 파워를 골랐으면 파워 향상,
   * 아니면 기본 목표(근력 향상).
   */
  const goalName = goal ?? goalForUnchosen(preferredWorkout);
  /* 회복날에는 가벼운 것만 새로 고른다 (isRecoveryLight) */
  const eligible = (ex: T) => theme !== 'recovery' || isRecoveryLight(ex);
  const specs = dropEmptySlots(
    compositionFor(theme, goalName, focus),
    candidates.filter(eligible)
  );
  const goalPrefer: readonly string[] = findGoal(goalName).prefer;
  /*
   * 목표가 정한 본운동의 섞임. 회복 데이에는 본운동이 없어 쓰이지 않는다.
   */
  const goalMix: GoalMix = theme === 'recovery' ? {} : findGoal(goalName).mix;
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
    scoreOf,
  });

  const taken = new Set<string>();
  const bySlot = new Map<SlotKey, T[]>(specs.map((s) => [s.slot, []]));
  /* 본운동 후보를 순서까지 정한 채로 들고 있는다 — 남는 시간을 여기서 더 쓴다 */
  let mainPool: T[] = [];
  /* 본운동이 없는 날(컨디셔닝·회복)에 남는 시간을 쓸 후보 */
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

    /*
     * 구간 규격(카테고리 · 파워 계열 · 좁힌 스트렝스 계열 — fitsSlot)과 테마 조건(회복날은 가벼운 것만)으로 거른다.
     *
     * 예전에는 여기서 '모빌리티이거나 매우 낮음'인 운동을 통째로 걸렀다.
     * 워밍업 구간이 그것들을 따로 받아 갔기 때문이다. 워밍업을 안 뽑게 된
     * 지금 그 거르개를 그대로 두면, '매우 낮음' 회복 운동이 어느 구간에도
     * 못 들어가 영영 안 나온다.
     */
    let pool = ordered.filter((ex) => fitsSlot(ex, spec) && eligible(ex));

    /*
     * 이 구간에서 이 운동이 걸리는 시간.
     *
     * 가벼운 웨이트 워밍업은 처방과 상관없이 짧게 센다. 본운동 처방(3세트에
     * 세트 사이 2분)으로 세면 막대 RDL 하나가 12분이라 워밍업이 하나밖에 안
     * 들어간다.
     */
    const costOf = (ex: T) => estimateMinutes(ex);

    /*
     * 본운동 후보에서 먼저 고를 차례를 정한다(화면의 하는 차례는 아래 orderWithinSlot 이 따로 정한다). 목표를 먼저 반영하고, 그 위에 오늘 고른
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
     * 제일 나중에 얹는 것을 제일 먼저 고른다(안정 분할이라 앞의 순서는 그 안에서
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
     * 근력 날의 첫 스트렝스는 무거운 복합 운동 하나(anchorOf). 차례가 '오래 안 한 것 · 씨앗'뿐이라 운동 표가 줄자(2026-10-14 '나중에 촬영'
     * 63개) 상급 · 장비 전부 · 60분 하체 날에 월 싯 · 카프 레이즈 같은 가벼운 것만 다섯이 나왔다(2026-10-18, 무거운 하체 16개가 후보에 있었는데).
     * 그 칸의 차례에서 가장 앞의 하나만 올린다 — 날마다 다른 무거운 운동이 오고, 나머지 차례 · 계열 규칙은 그대로다. 안전 거르기가 무거운
     * 것을 뺀 날(등판 창 · 컨디션)은 후보에 없으니 아무 일도 없다. 오늘 파워를 고른 날은 파워가 먼저라 건드리지 않는다.
     */
    if (spec.slot === 'main' && mainFirst !== '파워' && goalName === '근력 향상') {
      const anchor = pool.find((ex) => isStrengthAnchor(ex, theme));
      if (anchor) pool = [anchor, ...pool.filter((ex) => ex !== anchor)];
    }

    /*
     * 보강은 앞 세션에 한 운동을 다시 고르지 않는다 — 맨몸만이면 보강 후보가 하나라 운동하는 날마다 같은 보강(하프닐링 내전근 플랭크)이
     * 나왔다(2026-10-16 트레이닝 50명). 그 하나뿐이면 이날은 보강을 쉬고 다음 세션에 다시 나온다(이틀에 한 번). 오늘 이미 한 것(0세션 전)은 그대로.
     */
    if (spec.slot === 'prehab' && lastSessionIds && lastSessionIds.size > 0) {
      pool = pool.filter((ex) => !lastSessionIds.has(ex.id));
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
    let used = chosen.reduce((sum, ex) => sum + costOf(ex), 0);
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
     * 파워가 아직 모자란가 — 모자라면 이번 차례는 파워를 먼저 본다.
     *
     * 파워를 스트렝스보다 먼저 채운다. 파워 하나가 14분 남짓이라, 15분짜리
     * 무게 운동을 먼저 넣으면 남는 자리에 파워가 안 들어간다. 실제로 60분
     * 상체날에 파워 하나로 끝난 날이 나왔다.
     */
    const shortOnPower = () =>
      spec.slot === 'main' &&
      goalMix.minPower != null &&
      chosen.filter(isPower).length < goalMix.minPower;

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
      const canTake = (ex: T) =>
        free(ex) && fits(costOf(ex)) && mixAllows(ex) && !onceTaken(ex, usedPatterns);
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
            (best, ex) => (best == null || costOf(ex) < costOf(best) ? ex : best),
            undefined
          );

      const next =
        /*
         * 스트렝스가 모자란 동안에는 스트렝스부터 본다. 파워 향상 날에도
         * 무게 드는 운동 하나는 이렇게 확보된다.
         */
        /* 파워가 먼저다 — 자리를 못 잡으면 아예 못 들어간다 */
        (shortOnPower()
          ? (remaining.find((ex) => canTake(ex) && isPower(ex) && !clashes(ex)) ??
            remaining.find((ex) => canTake(ex) && isPower(ex)))
          : undefined) ??
        (shortOnStrength()
          ? (remaining.find(
              (ex) => canTake(ex) && !isPower(ex) && !clashes(ex) && !isAccessory(ex)
            ) ??
            remaining.find((ex) => canTake(ex) && !isPower(ex) && !clashes(ex)) ??
            remaining.find((ex) => canTake(ex) && !isPower(ex)))
          : undefined) ??
        /* 고립(보조)은 겹치지 않는 본운동을 다 고른 뒤에 — 짧은 날 밀기 · 당기기 자리를 가져가지 않게 */
        remaining.find((ex) => canTake(ex) && !clashes(ex) && !isAccessory(ex)) ??
        remaining.find((ex) => canTake(ex) && !clashes(ex)) ??
        remaining.find(canTake) ??
        /* 빈 구간은 하나라도 억지로 넣는다 — 곁가지 구간만 빼고 (SlotSpec.optional) */
        (chosen.length === 0 && !spec.optional
          ? (cheapest((ex) => free(ex) && mixAllows(ex) && !clashes(ex)) ??
            cheapest((ex) => free(ex) && mixAllows(ex)) ??
            cheapest(free))
          : undefined);
      if (next == null) break;
      chosen.push(next);
      taken.add(next.id);
      const spent = costOf(next);
      used += spent;
      totalUsed += spent;
      if (next.movementPattern && countsForPattern(next)) {
        usedPatterns.add(next.movementPattern);
      }
    }

    /*
     * 본운동에 넣을 것이 하나도 없으면 다른 운동으로라도 채운다.
     * 그리고 그 사실을 적어둔다 — 조용히 빈약해지는 것이 최악이다.
     *
     * 2026-10-11 (P1 '대비책 상한') 부터 두 개까지만 채운다(FALLBACK_MAX_COUNT). 예전에는 구간 상한(여덟)까지 채워,
     * 상체 후보가 없는 날이 사실상 하체 날이 됐다. 날 자체는 이제 daily-plan.ts 가 steerFromEmptyMain 으로 먼저
     * 바꾸므로 여기까지 오는 날은 사용자가 부위를 좁힌 날, 그리고 보조 날에 코어 후보가 없는 날이다 — 고른 뜻을
     * 지키고(또는 보조 날을 보조 날로 두고) 알림만 남긴다.
     */
    if (chosen.length === 0 && spec.slot === 'main') {
      const label = SLOT_LABELS[spec.slot].label;
      const cap = Math.min(spec.maxCount, FALLBACK_MAX_COUNT);
      for (const ex of ordered) {
        /* 가동성은 그 자체로 한 구간이라(회복·컨디셔닝·보조) 본운동 빈자리를 메우는 데 쓰지 않는다 */
        /*
         * 암케어도 쓰지 않는다 — 어느 일정에도 암케어를 넣지 않기로 했다(암케어 화면에서
         * 따로 한다). 빼지 않았더니 케틀벨만 가진 사람의 '상체 당기기' 날에 본운동
         * 빈자리로 쿼드 T 같은 암케어가 들어왔다.
         */
        if (
          taken.has(ex.id) ||
          ex.category === '모빌리티' ||
          ex.category === '암케어'
        ) {
          continue;
        }
        /*
         * 보조 날(무게 대신 코어와 보강)의 코어 자리는 스트렝스 · 파워로 메우지 않는다 — 어제 한 쪽을 피하려고
         * 보조로 온 날(steerFromEmptyMain)에 그쪽 무게가 뒷문으로 들어오면 안 된다(2026-10-12 검토).
         */
        if (
          theme === 'assist' &&
          (ex.category.endsWith('스트렝스') || ex.category === '파워')
        ) {
          continue;
        }
        const cost = estimateMinutes(ex);
        if (!fits(cost)) continue;
        chosen.push(ex);
        taken.add(ex.id);
        used += cost;
        totalUsed += cost;
        if (chosen.length >= cap) break;
      }
      if (chosen.length > 0) {
        notes.push(
          `${spec.categories.join('·')} 운동이 부족해 ${label}을 다른 운동으로 채웠어요.`
        );
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
   * 본운동이 있으면 거기다. 컨디셔닝·회복 날에는 본운동이 없어서, 그냥
   * 본운동만 찾으면 남는 시간이 통째로 버려졌다 — 45분을 부탁했는데 38분치만
   * 나왔다. 그때는 몫이 가장 큰 구간(컨디셔닝은 대개 보강, 회복날은 가동성)으로
   * 보낸다.
   */
  const mainSpec =
    specs.find((sp) => sp.slot === 'main') ??
    specs.reduce<SlotSpec | undefined>(
      (best, sp) => (best == null || sp.share > best.share ? sp : best),
      undefined
    );
  const mainPicks = mainSpec ? (bySlot.get(mainSpec.slot) ?? []) : [];
  if (mainSpec && mainPicks.length > 0) {
    const pool =
      mainSpec.slot === 'main' ? mainPool : (topUpPool.get(mainSpec.slot) ?? []);
    const usedPatterns = new Set(
      mainPicks
        .filter((ex) => ex.category !== '파워')
        .map((ex) => ex.movementPattern)
        .filter((p): p is string => !!p)
    );
    while (mainPicks.length < mainSpec.maxCount) {
      const room = minutes + totalSlack(minutes) - totalUsed;
      /*
       * 남은 시간을 채울 때도 목표의 파워 상한을 지킨다 — 예전에는 파워가 한 자리 14분 남짓이라 남는 틈에 안 들어갔는데,
       * 짧은 파워(10초 버티기 · 2026-10-09 '스플릿 스탠스 발목 아이소메트릭 프레스')가 생기자 근력 향상 날에 끼어들었다.
       */
      const powerCapped =
        mainSpec.slot === 'main' &&
        goalMix.maxPower != null &&
        mainPicks.filter((ex) => ex.category === '파워').length >= goalMix.maxPower;
      const free = pool.filter(
        (ex) =>
          !taken.has(ex.id) &&
          estimateMinutes(ex) <= room &&
          !(powerCapped && ex.category === '파워')
      );
      if (free.length === 0) break;
      const next =
        free.find(
          (ex) =>
            ex.category === '파워' ||
            ex.movementPattern == null ||
            !usedPatterns.has(ex.movementPattern)
        ) ?? free.find((ex) => !onceTaken(ex, usedPatterns));
      if (next == null) break;
      mainPicks.push(next);
      taken.add(next.id);
      totalUsed += estimateMinutes(next);
      if (next.movementPattern && next.category !== '파워') {
        usedPatterns.add(next.movementPattern);
      }
    }
  }

  /*
   * 구간 안의 차례는 고른 차례가 아니라 하는 차례로(lib/report/exercise-order.ts — 파워(가벼운 것부터) → 본 운동(센 것부터) → 보조,
   * 가동성은 가벼운 것부터). 고른 차례는 '오래 안 한 것 먼저'라 강도가 뒤섞였다(2026-10-04 사용자분).
   */
  const picks: ThemedPick<T>[] = [];
  for (const slot of SLOT_ORDER) {
    for (const ex of orderWithinSlot(slot, bySlot.get(slot) ?? [])) {
      picks.push({ exercise: ex, slot });
    }
  }

  const estimatedMinutes = Math.round(
    picks.reduce((sum, p) => sum + estimateMinutes(p.exercise), 0)
  );

  return { picks, estimatedMinutes, notes };
}
