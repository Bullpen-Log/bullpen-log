import {
  CHECKIN_PARTS,
  HIGH_SORENESS,
  LOW_CONDITION_THRESHOLD,
  SEVERE_ARM_FATIGUE,
  SEVERE_SORENESS,
  SHORT_SLEEP_HOURS,
  armFatigueWord,
  formatSleepHours,
  isShortSleep,
  sorenessWord,
  type CheckinPartKey,
  type OutingWindow,
} from '@/lib/checkin';
import { isArmPlyo, isHeavyLower, isHeavyUpperPush } from '@/lib/engine/exercise-class';
import { outingOf } from '@/lib/engine/outing';
import { INTENSITY_CAP, intensityLevel, type BodyPart } from '@/lib/exercise-meta';
import { YOUTH_AGE_THRESHOLD } from '@/lib/report/plan';
import { BEGINNER_LEVEL_NAME } from '@/lib/report/personalize';
import type { ReportFacts } from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';

/**
 * 운동을 고르기 전에(theme.ts · auto-setup.ts), 코드가 먼저 위험한 것을 걸러낸다.
 *
 * 여기서 빠진 운동은 고르는 쪽에 아예 보이지 않으므로 추천될 수가 없다 — 고르는 쪽이 틀려도 안전한 구조.
 * (AI 가 고르던 때 만든 틀이고, 2026-10-07 AI 를 뺀 뒤에도 같다.)
 *
 * 이 파일의 모든 규칙은 안전을 위한 것이며, 후보가 부족하다고 해서
 * 완화하지 않는다. 부족하면 부족하다고 말하는 편이 맞다.
 *
 * 근력 프로그램(partsOnly)에서 어느 규칙이 걸리는가 — 부위 · 팔 상태 규칙(통증 · 뻐근 · 최근 통증 · 재활 · 메모 · 팔 피로)은
 * drop 이라 프로그램에도 걸린다(그 칸이 그날 대체된다). 날 · 나이 · 몸 전체 규칙(부하 구간 · 통증 확인 전 · 등판 창 · 성장기 ·
 * 경력 · 컨디션 · 근육통 · 수면 · 성장기 쉬는 날)은 capTo 처럼 프로그램에서 건너뛴다 — 프로그램은 그런 날 스스로 쉬거나 칸을
 * 가볍게 한다(lib/program/program.ts decideToday). 새 규칙도 이 기준으로 넣는다(2판 P4).
 */

export type ExerciseLike = {
  id: string;
  title: string;
  category: string;
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
  /**
   * 동작 계열(힌지 · 스쿼트 · 밀기 …) — 무거운 하체 · 팔 플라이오 · 무거운 상체 밀기 판정(lib/engine/exercise-class.ts)이 읽는다.
   * 선택 칸인 까닭: 라이브러리 줄(ExerciseVideo · 캐시)에는 늘 있지만 자체 시험의 가짜 운동에는 없다. 없으면 계열로 거는 판정은
   * 안 걸리고 부위 · 장비로만 가른다(theme.ts ThemedExercise 와 같은 약속, 2판 P4).
   */
  movementPattern?: string | null;
};

/**
 * 부하 구간별로 허용하는 강도 상한.
 *
 * 이름이 아니라 단계 숫자로 비교한다. 강도 단계를 나중에 더 늘려도
 * 새 이름이 필터를 그냥 통과하는 일이 생기지 않는다.
 */
const ZONE_CAP: Record<string, number> = {
  danger: INTENSITY_CAP.RECOVERY,
  caution: INTENSITY_CAP.MODERATE,
  optimal: INTENSITY_CAP.ALL,
  low: INTENSITY_CAP.ALL,
};

/** 던진 날은 있는데 부하 지수를 아직 못 낼 때는 보수적으로 간다. */
const UNKNOWN_ZONE_CAP = INTENSITY_CAP.MODERATE;

/**
 * 어느 부위가 뻐근할 때 함께 피해야 하는 부위들.
 *
 * 가슴(프레스류)과 등(풀업·로우류) 모두 어깨 관절을 지나는 동작이라
 * 어깨가 좋지 않은 날에는 함께 뺀다. 다만 빠지는 것은 무게를 다루는
 * 단계(높음 이상)뿐이라, 가벼운 로우나 페이스풀 같은 어깨 보강 운동은
 * 그대로 남는다.
 *
 * 여기 적는 이름은 BODY_PARTS 에 있는 것이어야 한다. 타입으로 묶어두었으므로
 * 목록에 없는 이름을 적으면 빌드가 실패한다. 예전에 '허리', '하체' 처럼
 * 목록에 없는 이름이 섞여 있었는데, 어떤 운동과도 매칭되지 않아 그 줄이
 * 아무 일도 하지 않았다. 눈으로는 규칙이 있어 보여 알아채기 어렵다.
 */
const RELATED_PARTS: Record<CheckinPartKey, BodyPart[]> = {
  shoulder: ['어깨', '견갑', '가슴', '등'],
  // 이두·삼두는 모두 팔꿈치를 지나는 근육이라 팔꿈치 쪽에 함께 넣는다.
  elbow: ['팔꿈치', '손목·전완', '이두', '삼두'],
  wrist: ['손목·전완', '팔꿈치'],
  // 허리가 아플 때 코어 고강도(데드리프트류)와 등·고관절 동작이 함께 걸린다.
  lowerBack: ['코어', '등', '고관절'],
  lowerBody: ['고관절', '햄스트링·둔근', '전신'],
};

/**
 * 오늘 아픈 부위가 있을 때 통째로 피하는 부위들 — 강도와 상관없이 뺀다.
 *
 * 뻐근할 때(RELATED_PARTS)보다 넓다. 하체에 종아리·발목을 넣고, 전신 운동은 어디가 아프든 뺀다 —
 * 전신 운동은 아픈 곳도 같이 쓴다. 한계: 부위 꼬리표로만 가른다. 바벨을 어깨에 메는 스쿼트처럼
 * 꼬리표에 없는 부위를 쓰는 운동은 남는다 — 그래서 일정 이유에 '하다가 아프면 바로 멈추라'를 붙인다.
 */
const PAIN_PARTS: Record<CheckinPartKey, BodyPart[]> = {
  shoulder: ['어깨', '견갑', '가슴', '등', '전신'],
  elbow: ['팔꿈치', '손목·전완', '이두', '삼두', '전신'],
  wrist: ['손목·전완', '팔꿈치', '전신'],
  lowerBack: ['코어', '등', '고관절', '전신'],
  lowerBody: ['고관절', '햄스트링·둔근', '종아리·발목', '전신'],
};

/** 체크인 부위 이름 — '어깨', '허리' … */
export function checkinPartLabel(key: CheckinPartKey): string {
  return CHECKIN_PARTS.find((p) => p.key === key)?.label ?? key;
}

/** 오늘 체크인에서 '통증'이라고 한 부위 */
export function painPartsToday(facts: ReportFacts): CheckinPartKey[] {
  const today = facts.condition.today;
  if (!today) return [];
  return CHECKIN_PARTS.filter((p) => today[p.key] === '통증').map((p) => p.key);
}

/** 최근 7일에 아팠는데 오늘은 통증이라고 하지 않은 부위 */
export function painEasingParts(facts: ReportFacts): CheckinPartKey[] {
  const today = painPartsToday(facts);
  return (facts.condition.painRecentParts ?? []).filter((key) => !today.includes(key));
}

/**
 * 재활 1~3단계의 관절(facts.condition.rehabParts) — 오늘 통증이라고 한 부위는 뺀다(그 부위는 1-1) 이 가벼운 것까지 다 뺀다).
 * '최근 통증 부위'와 똑같이 다룬다(재활 2편 — 무거운 것 빼기 · 근력 날 피하기). 4단계 · 재활을 끝내면 빈 목록.
 */
export function rehabEasingParts(facts: ReportFacts): CheckinPartKey[] {
  const today = painPartsToday(facts);
  return (facts.condition.rehabParts ?? []).filter((key) => !today.includes(key));
}

/** 최근에 아팠는데 오늘 체크인이 없어, 지금 아픈지 모르는가 */
export function painStateUnknown(facts: ReportFacts): boolean {
  return facts.condition.painRecently && facts.condition.today == null;
}

export type ExclusionReason = {
  rule: string;
  count: number;
};

/**
 * 이 함수는 후보를 걸러내고 순서만 바꾼다. 그래서 넘겨받은 운동이 어떤 필드를
 * 더 갖고 있든 그대로 돌려준다. 타입을 ExerciseLike 로 고정해두면 세트·횟수
 * 같은 필드가 여기를 지나면서 사라져, 다음 단계에서 쓸 수 없게 된다.
 */
export type PrescriptionCandidates<T extends ExerciseLike = ExerciseLike> = {
  /** 통증 등으로 처방 자체를 하지 않는가 */
  halted: boolean;
  haltReason: string | null;
  candidates: T[];
  /** 무엇이 왜 빠졌는지 — 화면에 근거로 그대로 보여준다 */
  excluded: ExclusionReason[];
  /** 적용된 조건 요약 */
  basis: string[];
  /** 후보가 너무 적어 제대로 된 처방이 어려운 상태인가 */
  tooFew: boolean;
};

/** 이 개수보다 적으면 라이브러리가 부족하다고 본다. */
export const MIN_CANDIDATES = 4;

/**
 * 다음 등판이 이 날수 안(창의 끝 max 기준)이면 무거운 하체를 뺀다 — 오늘(0) · 내일(1) · 2~3일 뒤(3). 검토안 4-2 의 '2~3일: 무거운
 * 하체 금지'와 같은 선이다. 4일 이상 뒤면 다시 든다(무거운 하체는 등판에서 먼 날의 몫).
 */
export const HEAVY_LOWER_BLOCK_WITHIN_DAYS = 3;

/**
 * 근거 줄의 '언제' — 창 하나를 사람이 읽는 말로. 하루로 못 박히면 '오늘' · '내일' · 'N일 뒤', 아니면 '2~3일 뒤'처럼 범위
 * (어제 '2~3일 뒤'를 오늘 하루 당긴 1~2 는 '1~2일 뒤'). 끝이 없는 창은 이 규칙에 안 오지만 'N일 이상 뒤'로 읽는다.
 */
function outingWhenText(w: OutingWindow): string {
  const day = (n: number) => (n === 0 ? '오늘' : n === 1 ? '내일' : `${n}일 뒤`);
  if (w.max == null) return `${w.min}일 이상 뒤`;
  if (w.min === w.max) return day(w.min);
  return `${w.min}~${w.max}일 뒤`;
}

export function selectCandidates<T extends ExerciseLike>({
  facts,
  plan,
  library,
  caution = [],
  partsOnly = false,
}: {
  facts: ReportFacts;
  plan: PitchPlan;
  library: T[];
  /**
   * 메모에서 찾은 조심할 부위 (자동 맞춤 — lib/report/auto-setup.ts).
   * 체크인의 '뻐근'과 똑같이 다룬다. 조심을 더하기만 하고 빼지는 못한다.
   */
  caution?: { part: CheckinPartKey; why: string }[];
  /**
   * 부위 규칙만 쓴다 — 몸 전체 강도 상한(부하 구간 · 통증 확인 전 · 성장기 · 경력 · 컨디션 · 근육통 · 수면)과 등판 창의 무거운 하체(2-2) ·
   * 성장기 쉬는 날(5-3)은 건너뛴다. 팔 피로 '심함'(5-2)은 팔 상태 규칙이라 걸린다.
   * 근력 · 파워 프로그램이 쓴다(lib/program/load.ts). 프로그램은 그런 날에도 진행하고 주의 한 줄 · 칸 조정으로
   * 스스로 가볍게 하므로(설계 D22~D25), 여기서 무거운 운동을 통째로 빼면 고정 운동이 날마다 대체된다.
   */
  partsOnly?: boolean;
}): PrescriptionCandidates<T> {
  /*
   * 1) 통증.
   *
   * 2026-10-03 부터 아픈 곳을 피해서 짠다(사용자 결정). 예전에는 통증이 한 곳이라도 있으면 운동 처방을
   * 통째로 멈췄다. 투구 계획은 그대로 멈춘다(plan.ts) — 공은 팔 하나로 던지는 것이 아니다.
   *
   * 최근에 아팠는데 오늘 체크인이 없으면 나았는지 알 수 없다. 그때만 예전처럼 멈추고 체크인을 청한다.
   */
  if (painStateUnknown(facts)) {
    return {
      halted: true,
      haltReason: plan.haltReason,
      candidates: [],
      excluded: [],
      basis: ['최근 통증 기록 + 오늘 체크인 없음 → 체크인 전까지 처방 중단'],
      tooFew: false,
    };
  }

  const basis: string[] = [];
  const excluded: ExclusionReason[] = [];
  let pool = library;

  const drop = (rule: string, keep: (ex: T) => boolean) => {
    const before = pool.length;
    pool = pool.filter(keep);
    const removed = before - pool.length;
    if (removed > 0) excluded.push({ rule, count: removed });
  };

  /* 1-1) 오늘 아픈 부위는 그 부위를 쓰는 운동을 가벼운 것까지 모두 뺀다. */
  for (const key of painPartsToday(facts)) {
    const label = checkinPartLabel(key);
    const parts: readonly string[] = PAIN_PARTS[key];
    basis.push(`${label} 통증 → ${parts.join('·')} 쓰는 운동 모두 제외`);
    drop(`${label} 통증`, (ex) => !ex.bodyParts.some((p) => parts.includes(p)));
  }

  /*
   * 규칙마다 "여기까지만 허용" 하는 상한이 있고, 가장 낮은 것이 이긴다.
   * 이름 비교가 아니라 단계 숫자라서, 강도 단계를 더 늘려도 새 이름이
   * 조건을 빠져나가는 일이 없다.
   */
  const capTo = (rule: string, cap: number) => {
    if (partsOnly) return;
    drop(rule, (ex) => intensityLevel(ex.intensity) <= cap);
  };

  /*
   * 2) 부하 구간에 따른 강도 상한
   *
   * 최근에 던진 날이 하루도 없으면(gather.ts 의 LOOKBACK_DAYS, 45일) 투구 부하로는 거르지 않는다.
   * 지수를 못 내는 까닭이 '던진 것이 없어서'라, 걸러 낼 투구 부하도 없다. 예전에는 이때도 무게 드는
   * 운동을 전부 뺐는데, 공을 쉬는 비시즌이 근력을 키우기 가장 좋은 때다(2026-10-03 사용자 결정:
   * "투구 기록이 없을 때 무거운 운동을 허용하자"). 휴식(0구)만 적은 날도 던진 날로 치지 않는다.
   * 던진 날은 있는데 기록이 짧아 지수를 못 내는 사람은 예전처럼 보수적으로 간다.
   */
  const noRecentThrows = facts.patterns.lastThrowDate == null;
  const zoneCap = facts.load.zone
    ? (ZONE_CAP[facts.load.zone] ?? UNKNOWN_ZONE_CAP)
    : noRecentThrows
      ? INTENSITY_CAP.ALL
      : UNKNOWN_ZONE_CAP;

  if (facts.load.zone === 'danger') {
    basis.push('부하 위험 구간 → 회복 수준까지만');
  } else if (facts.load.zone === 'caution') {
    basis.push('부하 주의 구간 → 무게 드는 운동 제외');
  } else if (facts.load.zone) {
    basis.push('부하가 적정 범위 → 강도 제한 없음');
  } else if (noRecentThrows) {
    basis.push('최근 투구 기록이 없음 → 투구 부하로는 거르지 않음');
  } else {
    basis.push('부하 지수를 아직 낼 수 없어 무게 드는 운동 제외');
  }
  capTo('부하 구간에 맞지 않는 강도', zoneCap);

  /*
   * 2-1) 메모에 통증으로 보이는 말이 있는데 오늘 체크인이 없으면(plan.needsPainCheck) 어디가 아픈지
   *      모른다. 확인될 때까지 몸 전체를 회복 수준까지만 남긴다. 최근 체크인에서 아팠던 부위는
   *      어디인지 아니까 그 부위만 뺀다 — 아래 4-3).
   */
  if (plan.needsPainCheck) {
    basis.push('메모의 통증 표현 확인 전 → 회복 수준 운동까지만');
    capTo('통증 확인 전', INTENSITY_CAP.RECOVERY);
  }

  /*
   * 2-2) 등판 창 — 다음 등판이 3일 안(오늘 · 내일 · 2~3일 뒤)이면 무거운 하체를 뺀다(2판 P4 커밋 D).
   *
   * 무거운 하체(바벨 스쿼트 · 데드리프트 · 하체 점프 — lib/engine/exercise-class.ts isHeavyLower)는 다음 날 다리에 무게가 남는다.
   * 투수는 다리로 던지니, 등판 2~3일 안에 그것을 들면 마운드에서 다리가 무겁다(검토안 4-2 '2~3일: 무거운 하체 금지'). 지금까지는
   * '오늘 등판' · '내일 등판'만 테마(회복 · 보조)로 막았고, '2~3일 뒤'는 근력 날이라 바벨 스쿼트가 그대로 나왔다. '그래도 하기'로
   * 테마를 밀어 근력 날이 된 등판 날에도 무거운 하체가 나왔다. 그래서 테마가 아니라 여기(후보)에서 뺀다 — 무엇으로 날을 정하든 이
   * 줄이 남고, 아침에 만든 일정의 무거운 하체는 낮에 '내일 등판'이라 고쳐 적으면 안전 재검사(today-data)가 저절로 걸러 낸다.
   * 가벼운 하체(고블렛 스쿼트 · 덤벨 스텝업 · 한 다리 운동)는 남아 하체 날의 재료가 되고, 하체 본운동이 통째로 비면 날은
   * theme.ts 의 steerFromEmptyMain 이 바꾼다.
   *
   * 등판은 lib/engine/outing.ts 의 outingOf 한 곳에서 읽는다 — 매일 일정의 테마(plannedOuting) · 오늘 상태 한 장과 같은 창이다.
   * 창의 끝(max)이 3일 이하일 때만 건다. 어제 '4일 이상 뒤'를 오늘 하루 당긴 '3일 이상 뒤'(max 없음)는 걸지 않는다 — 끝이 없는
   * 답이라 '곧 등판'이 아니고, 걸면 '4일 이상 뒤'를 적고 다음 날 체크인을 건너뛴 사람마다 무거운 하체가 빠진다. 다음 등판을 짐작한
   * 출처(달력 · 같은 요일, outing.soft)는 조이는 쪽이라 이 규칙에 그대로 써도 된다(커밋 G 가 더한다).
   *
   * 날 규칙이라 근력 프로그램(partsOnly)에서는 건너뛴다(파일 머리 주석의 기준, 사용자 결정 D6 — 프로그램 날은 프로그램 그대로).
   * 프로그램은 경기 날 · 전날을 스스로 쉬고(lib/program/program.ts decideToday 의 gameToday · gameTomorrow), '2~3일 뒤'는 그날 칸을
   * 처방대로 한다. 매일 일정과 프로그램이 같은 날 다른 하체를 낼 수 있는데, 둘을 나누는 일은 중재(P6, 하체 예산)의 몫이다.
   * '그래도 하기'(override)로는 안 풀린다 — 테마만 넘기고 이 거르기는 남는다(컨디션 저하 상한과 같은 원칙).
   */
  const outingWindow = outingOf(facts).daysUntilNext;
  if (
    !partsOnly &&
    outingWindow != null &&
    outingWindow.max != null &&
    outingWindow.max <= HEAVY_LOWER_BLOCK_WITHIN_DAYS
  ) {
    basis.push(`${outingWhenText(outingWindow)} 등판 → 무거운 하체 제외`);
    drop('등판 전 무거운 하체', (ex) => !isHeavyLower(ex));
  }

  // 3) 성장기는 최대 강도를 뺀다.
  if (facts.profile.age != null && facts.profile.age < YOUTH_AGE_THRESHOLD) {
    basis.push(`만 ${facts.profile.age}세(성장기) → 매우 높은 강도 제외`);
    capTo('성장기 고강도 제한', INTENSITY_CAP.STRENGTH);
  }

  /*
   * 3-1) 웨이트가 처음인 사람도 최대 강도를 뺀다.
   *
   * 어떤 난이도로 적혀 있든, 강도가 '매우 높음'인 것은 전력으로 뛰거나 최대
   * 무게를 다루는 운동이다. 동작을 아는 것과 그 무게를 감당하는 것은 다르다.
   * 난이도로 거르는 일(personalize.ts)과 나눠 둔 이유가 이것이다 —
   * 저쪽은 "못 한다"를 보고 여기는 "다친다"를 본다.
   */
  if (facts.profile.trainingLevel === BEGINNER_LEVEL_NAME) {
    basis.push(`웨이트 경력 ${BEGINNER_LEVEL_NAME} → 매우 높은 강도 제외`);
    capTo('경력 대비 과한 강도', INTENSITY_CAP.STRENGTH);
  }

  const today = facts.condition.today;

  /*
   * 체크인이 없으면 아래 두 규칙(컨디션 저하·뻐근한 부위)이 통째로 건너뛰어진다.
   * 남은 것은 투구 부하로 정한 상한뿐이다. 그 사이의 전신 근육통 · 짧은 밤(4-1 · 4-2)도
   * 체크인에서 읽는 값이라 같이 건너뛴다.
   *
   * 그 사실을 근거에 적어두지 않으면, 몸 상태를 보고 고른 것처럼 보인다.
   * 실제로는 보지 않았으므로 그대로 밝힌다.
   */
  if (!today) {
    basis.push('오늘 체크인이 없어 몸 상태(컨디션·뻐근한 부위)는 반영하지 못함');
  }

  // 4) 컨디션이 낮은 날은 무게 드는 것부터 뺀다.
  if (today && today.condition <= LOW_CONDITION_THRESHOLD) {
    basis.push(`오늘 컨디션 ${today.condition}/10 → 무게 드는 운동 제외`);
    capTo('컨디션 저하', INTENSITY_CAP.MODERATE);
  }

  /*
   * 4-1) 전신 근육통 (간편 체크인의 선택 칸 — 안 적은 날은 아무 일도 글도 없다).
   *
   * 온몸 값이라 어느 부위인지는 모른다. 그래서 부위를 골라 빼지 않고 전체 강도만 낮춘다
   * (부위를 아는 것은 바로 아래의 '뻐근'이 한다).
   *   '심함'  무게 드는 운동을 뺀다 — 그날은 회복·재생 데이다(theme.ts 의 decideTheme). '그래도
   *           하겠다'로 테마를 밀어도 이 상한은 남는다(낮은 컨디션과 같은 방식).
   *   '많이'  가장 센 것만 뺀다. 알이 심하게 밴 날은 최대 힘 · 점프가 먼저 떨어진다.
   *   '보통' 아래  훈련한 다음 날의 정상 반응이라 줄이지 않는다. 다만 읽었다는 것은 근거에 남긴다.
   *
   * 1~5 밖의 값(화면으로는 못 만든다 — DB 를 손으로 고친 경우뿐)은 안 적은 것으로 넘긴다.
   * 말이 없는 값으로 글을 만들면 근거에 "전신 근육통 'null'"이 찍힌다. 폼을 읽을 때와 같은
   * 판단이다(lib/checkin.ts 의 parseCheckinBody — 범위 밖은 안 적은 것으로).
   */
  const soreness = today?.soreness;
  const soreWord = sorenessWord(soreness);
  if (soreness != null && soreWord) {
    if (soreness >= SEVERE_SORENESS) {
      basis.push(`전신 근육통 '${soreWord}' → 무게 드는 운동 제외`);
      capTo('전신 근육통', INTENSITY_CAP.MODERATE);
    } else if (soreness >= HIGH_SORENESS) {
      basis.push(`전신 근육통 '${soreWord}' → 매우 높은 강도 제외`);
      capTo('전신 근육통', INTENSITY_CAP.STRENGTH);
    } else {
      basis.push(`전신 근육통 '${soreWord}' → 제한 없음`);
    }
  }

  /*
   * 4-2) 짧은 밤 — 느낌이 '부족'이거나 잔 시간이 6시간 미만(lib/checkin.ts 의 isShortSleep).
   *
   * 하루 못 잔 것으로는 목표도 요일도 시간도 안 바꾼다. 가장 센 것만 뺀다 — 하룻밤 부족은
   * 기술 · 순발력이 먼저 떨어지는데, 최대 무게 · 전력 동작이 바로 그것을 요구한다.
   * (며칠 이어질 때 목표를 바꾸는 것은 자동 맞춤의 몫이다 — auto-setup.ts 의 SLEEP_DEBT_DAYS.)
   *
   * 잔 시간도 안 적었고 느낌이 충분 · 보통이면 글을 안 붙인다 — 두 칸이 생기기 전과 같은 근거다.
   */
  const sleepHours = today?.sleepHours;
  if (today && isShortSleep(today)) {
    basis.push(
      sleepHours != null && sleepHours < SHORT_SLEEP_HOURS
        ? `어젯밤 ${formatSleepHours(sleepHours)} 수면 → 매우 높은 강도 제외`
        : `오늘 수면 '부족' → 매우 높은 강도 제외`
    );
    capTo('수면 부족', INTENSITY_CAP.STRENGTH);
  } else if (sleepHours != null) {
    basis.push(`어젯밤 ${formatSleepHours(sleepHours)} 수면 → 제한 없음`);
  }

  /*
   * 4-3) 최근 7일에 아팠지만 오늘은 통증이라고 하지 않은 부위 — 그 부위의 무거운 운동만 뺀다(뻐근과 같은 방식).
   *
   * 예전에는 지난 통증 하나로 몸 전체를 회복 수준까지만 남겼다(2026-10-03 사용자 결정으로 그 부위만).
   * 오늘 뻐근이라고 한 부위는 바로 아래 5) 가 같은 일을 하므로 건너뛴다.
   *
   * 재활 1~3단계의 관절도 같은 규칙이다(재활 2편) — 근거 줄만 '재활 중'. 둘 다면 재활 쪽 말을 쓴다.
   */
  const rehabParts = rehabEasingParts(facts);
  for (const key of new Set([...painEasingParts(facts), ...rehabParts])) {
    if (today?.[key] === '뻐근') continue;
    const label = checkinPartLabel(key);
    const parts: readonly string[] = RELATED_PARTS[key];
    const why = rehabParts.includes(key) ? `재활 중(${label})` : `최근 ${label} 통증`;
    basis.push(`${why} → ${parts.join('·')} 부위 고강도 제외`);
    drop(
      why,
      (ex) =>
        intensityLevel(ex.intensity) <= INTENSITY_CAP.MODERATE ||
        !ex.bodyParts.some((p) => parts.includes(p))
    );
  }

  /*
   * 5) 뻐근한 부위는 그 부위를 쓰는 무거운 운동을 뺀다.
   *    가벼운 회복·가동성 운동은 오히려 도움이 되므로 남긴다.
   */
  for (const { key, label } of CHECKIN_PARTS) {
    if (today?.[key] !== '뻐근') continue;
    /*
     * 적을 때는 BodyPart 로 검사받고(오타·없는 부위를 막는다),
     * 비교할 때는 문자열로 본다 — DB에서 온 bodyParts 는 string[] 이다.
     */
    const parts: readonly string[] = RELATED_PARTS[key];
    basis.push(`${label} 뻐근함 → ${parts.join('·')} 부위 고강도 제외`);
    drop(
      `${label} 뻐근함`,
      (ex) =>
        intensityLevel(ex.intensity) <= INTENSITY_CAP.MODERATE ||
        !ex.bodyParts.some((p) => parts.includes(p))
    );
  }

  /*
   * 5-1) 메모에서 찾은 조심할 부위도 같은 방식으로 뺀다.
   *
   * "스쿼트 때 무릎이 불편했다"고 적어 두고 체크인은 '정상'으로 넘기는 일이
   * 흔하다. 메모를 읽는 것은 자동 맞춤(지금은 규칙)이지만, 무엇을 빼는지는 여기 규칙이 정한다.
   * 체크인에서 이미 뻐근이라고 한 부위는 위에서 걸렀으므로 건너뛴다.
   */
  for (const { part, why } of caution) {
    if (today?.[part] === '뻐근') continue;
    const label = CHECKIN_PARTS.find((p) => p.key === part)?.label ?? part;
    const parts: readonly string[] = RELATED_PARTS[part];
    basis.push(`메모에서 ${label} 불편(${why}) → ${parts.join('·')} 부위 고강도 제외`);
    drop(
      `메모 속 ${label} 불편`,
      (ex) =>
        intensityLevel(ex.intensity) <= INTENSITY_CAP.MODERATE ||
        !ex.bodyParts.some((p) => parts.includes(p))
    );
  }

  /*
   * 5-2) 팔 피로 '심함'(SEVERE_ARM_FATIGUE) — 무거운 상체 밀기 · 팔 플라이오를 뺀다(2판 P4 커밋 C).
   *
   * 팔은 공을 던지는 곳이라, 팔이 '심하게' 지친 날 벤치 프레스 · 메디신볼 던지기까지 얹으면 같은 관절에 부담이 겹친다.
   * 어디가 아픈지는 모르니 부위 꼬리표가 아니라 '팔로 밀고 던지는 것'(lib/engine/exercise-class.ts 판정)만 뺀다 — 가벼운 밀기 ·
   * 당기기 · 하체 · 코어는 남는다. 눈금의 몫을 나눈다: '심함'은 여기서 운동을 뺀다, '많이'(HIGH_ARM_FATIGUE)는 암케어만 회복으로
   * 돌린다, 그 아래는 고르기 점수(P5) 몫이다. 팔 상태 규칙이라 근력 프로그램에서도 걸린다(그 칸이 그날 대체된다).
   * 1~5 밖의 값은 안 적은 것으로 넘긴다 — 근육통(4-1)과 같은 판단, 근거에 'null' 이 찍히지 않게.
   */
  const armFatigue = today?.armFatigue;
  const armWord = armFatigueWord(armFatigue);
  if (armFatigue != null && armWord && armFatigue >= SEVERE_ARM_FATIGUE) {
    basis.push(`팔 피로 '${armWord}' → 무거운 상체 밀기 · 팔 플라이오 제외`);
    drop(`팔 피로 '${armWord}'`, (ex) => !isHeavyUpperPush(ex) && !isArmPlyo(ex));
  }

  /*
   * 5-3) 성장기(YOUTH_AGE_THRESHOLD 미만)가 투구 계획상 공을 쉬는 날 — 팔 플라이오를 뺀다(2판 D4).
   *
   * 쉬는 날(plan.today.throwing 이 false — 큰 등판 다음 날 · 통증 · 메모 확인 · 재활)은 팔을 쉬라는 날인데, 메디신볼 던지기 ·
   * 플라이오 푸시업은 공 없이 팔을 빠르게 쓰는 운동이다. 성장기의 팔에는 그날 그 부담도 빼 둔다. 만 16세부터는 사용자 결정(D4)대로
   * 성인 기준이라 그대로다. 나이 · 날 규칙이라 근력 프로그램에서는 건너뛴다 — 3) 성장기 강도 상한과 같은 기준(파일 머리 주석).
   * 오늘 이미 던져 plan.today 가 없는 날은 쉬는 날이 아니다.
   */
  if (
    !partsOnly &&
    facts.profile.age != null &&
    facts.profile.age < YOUTH_AGE_THRESHOLD &&
    plan.today?.throwing === false
  ) {
    basis.push(
      `만 ${facts.profile.age}세(성장기) · 오늘 공을 쉬는 날 → 팔 플라이오 제외`
    );
    drop('쉬는 날 팔 플라이오(성장기)', (ex) => !isArmPlyo(ex));
  }

  /*
   * 6) 오늘 하고 싶다고 고른 부위를 후보에서 먼저 고른다(하는 차례는 lib/report/exercise-order.ts 가 따로 정한다).
   *
   * 여기서는 아무것도 빼지 않는다 — 빼는 일은 위의 안전 규칙만 한다.
   * 선호로 후보를 걸러버리면 "하체만 하고 싶다"고 고른 날 어깨 회복 운동이
   * 사라지는데, 그건 사용자가 바란 것도 아니고 몸에 좋지도 않다.
   */
  const wanted = new Set(today?.preferredParts ?? []);
  if (wanted.size > 0) {
    basis.push(`오늘 하고 싶은 부위(${[...wanted].join('·')})를 먼저 골라 담음`);
    pool = [
      ...pool.filter((ex) => ex.bodyParts.some((p) => wanted.has(p))),
      ...pool.filter((ex) => !ex.bodyParts.some((p) => wanted.has(p))),
    ];
  }

  return {
    halted: false,
    haltReason: null,
    candidates: pool,
    excluded,
    basis,
    tooFew: pool.length < MIN_CANDIDATES,
  };
}
