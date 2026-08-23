import { CHECKIN_PARTS, type CheckinPartKey } from '@/lib/checkin';
import { INTENSITY_CAP, intensityLevel, type BodyPart } from '@/lib/exercise-meta';
import { YOUTH_AGE_THRESHOLD } from '@/lib/report/plan';
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

/** 부하 지수를 아직 못 낼 때는 보수적으로 간다. */
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
}: {
  facts: ReportFacts;
  plan: PitchPlan;
  library: T[];
}): PrescriptionCandidates<T> {
  // 1) 통증이면 운동 처방을 아예 하지 않는다. 투구 계획과 같은 기준이다.
  if (plan.halted) {
    return {
      halted: true,
      haltReason: plan.haltReason,
      candidates: [],
      excluded: [],
      basis: ['통증 신호 → 운동 처방 중단'],
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

  /*
   * 규칙마다 "여기까지만 허용" 하는 상한이 있고, 가장 낮은 것이 이긴다.
   * 이름 비교가 아니라 단계 숫자라서, 강도 단계를 더 늘려도 새 이름이
   * 조건을 빠져나가는 일이 없다.
   */
  const capTo = (rule: string, cap: number) =>
    drop(rule, (ex) => intensityLevel(ex.intensity) <= cap);

  // 2) 부하 구간에 따른 강도 상한
  const zoneCap = facts.load.zone
    ? (ZONE_CAP[facts.load.zone] ?? UNKNOWN_ZONE_CAP)
    : UNKNOWN_ZONE_CAP;

  if (facts.load.zone === 'danger') {
    basis.push('부하 위험 구간 → 회복 수준까지만');
  } else if (facts.load.zone === 'caution') {
    basis.push('부하 주의 구간 → 무게 드는 운동 제외');
  } else if (facts.load.zone) {
    basis.push('부하가 적정 범위 → 강도 제한 없음');
  } else {
    basis.push('부하 지수를 아직 낼 수 없어 무게 드는 운동 제외');
  }
  capTo('부하 구간에 맞지 않는 강도', zoneCap);

  /*
   * 2-1) 최근 통증이 있었지만 오늘은 괜찮다고 한 경우.
   *
   * 계획을 아예 멈추지는 않되(그러면 지난 통증 기록 하나로 며칠이 잠긴다),
   * 무게를 다루는 운동은 빼고 회복·가동성 수준부터 다시 올린다.
   */
  if (plan.recovering) {
    basis.push(
      plan.needsPainCheck
        ? '메모의 통증 표현 확인 전 → 회복 수준 운동까지만'
        : '최근 통증 기록 → 회복 수준 운동까지만'
    );
    capTo('통증 회복 중', INTENSITY_CAP.RECOVERY);
  }

  // 3) 성장기는 최대 강도를 뺀다.
  if (facts.profile.age != null && facts.profile.age < YOUTH_AGE_THRESHOLD) {
    basis.push(`만 ${facts.profile.age}세(성장기) → 매우 높은 강도 제외`);
    capTo('성장기 고강도 제한', INTENSITY_CAP.STRENGTH);
  }

  const today = facts.condition.today;

  /*
   * 체크인이 없으면 아래 두 규칙(컨디션 저하·뻐근한 부위)이 통째로 건너뛰어진다.
   * 남은 것은 투구 부하로 정한 상한뿐이다.
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
   * 6) 오늘 하고 싶다고 고른 부위를 앞으로 당긴다.
   *
   * 여기서는 아무것도 빼지 않는다 — 빼는 일은 위의 안전 규칙만 한다.
   * 선호로 후보를 걸러버리면 "하체만 하고 싶다"고 고른 날 어깨 회복 운동이
   * 사라지는데, 그건 사용자가 바란 것도 아니고 몸에 좋지도 않다.
   */
  const wanted = new Set(today?.preferredParts ?? []);
  if (wanted.size > 0) {
    basis.push(`오늘 하고 싶은 부위(${[...wanted].join('·')})를 먼저 배치`);
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
