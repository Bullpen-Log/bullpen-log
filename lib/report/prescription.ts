import {
  CHECKIN_PARTS,
  HIGH_SORENESS,
  SEVERE_SORENESS,
  SHORT_SLEEP_HOURS,
  formatSleepHours,
  isShortSleep,
  sorenessWord,
  type CheckinPartKey,
} from '@/lib/checkin';
import { INTENSITY_CAP, intensityLevel, type BodyPart } from '@/lib/exercise-meta';
import { YOUTH_AGE_THRESHOLD } from '@/lib/report/plan';
import { BEGINNER_LEVEL_NAME } from '@/lib/report/personalize';
import type { ReportFacts } from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';

/**
 * AI가 운동을 고르기 전에, 코드가 먼저 위험한 것을 걸러낸다.
 *
 * 여기서 빠진 운동은 AI에게 아예 보이지 않으므로 추천될 수가 없다.
 * "AI를 믿는 것"이 아니라 "AI가 틀려도 안전한" 구조를 만드는 부분이다.
 *
 * 이 파일의 모든 규칙은 안전을 위한 것이며, 후보가 부족하다고 해서
 * 완화하지 않는다. 부족하면 부족하다고 말하는 편이 맞다.
 */

export type ExerciseLike = {
  id: string;
  title: string;
  category: string;
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
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

/** 컨디션이 이 값 이하면 무게 드는 운동을 뺀다. */
const LOW_CONDITION_THRESHOLD = 4;

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

export function selectCandidates<T extends ExerciseLike>({
  facts,
  plan,
  library,
  caution = [],
}: {
  facts: ReportFacts;
  plan: PitchPlan;
  library: T[];
  /**
   * 메모에서 찾은 조심할 부위 (AI 맞춤 — lib/report/auto-setup.ts).
   * 체크인의 '뻐근'과 똑같이 다룬다. 조심을 더하기만 하고 빼지는 못한다.
   */
  caution?: { part: CheckinPartKey; why: string }[];
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
  const capTo = (rule: string, cap: number) =>
    drop(rule, (ex) => intensityLevel(ex.intensity) <= cap);

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
   * (며칠 이어질 때 목표를 바꾸는 것은 AI 맞춤의 몫이다 — auto-setup.ts 의 SLEEP_DEBT_DAYS.)
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
   * 흔하다. 메모를 읽는 것은 AI지만, 무엇을 빼는지는 여기 규칙이 정한다.
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
