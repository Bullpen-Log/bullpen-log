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

/** 부하 구간별로 허용하는 운동 강도 */
const ALLOWED_INTENSITY: Record<string, string[]> = {
  danger: ['낮음'],
  caution: ['낮음', '중간'],
  optimal: ['낮음', '중간', '높음'],
  low: ['낮음', '중간', '높음'],
};

/** 부하 지수를 아직 못 낼 때는 보수적으로 간다. */
const UNKNOWN_ZONE_INTENSITY = ['낮음', '중간'];

/** 컨디션이 이 값 이하면 고강도를 뺀다. */
const LOW_CONDITION_THRESHOLD = 4;

/** 어느 부위가 뻐근할 때 함께 피해야 하는 부위들 */
const RELATED_PARTS: Record<string, string[]> = {
  shoulder: ['어깨', '견갑'],
  elbow: ['팔꿈치', '손목·전완'],
};

export type ExclusionReason = {
  rule: string;
  count: number;
};

export type PrescriptionCandidates = {
  /** 통증 등으로 처방 자체를 하지 않는가 */
  halted: boolean;
  haltReason: string | null;
  candidates: ExerciseLike[];
  /** 무엇이 왜 빠졌는지 — 화면에 근거로 그대로 보여준다 */
  excluded: ExclusionReason[];
  /** 적용된 조건 요약 */
  basis: string[];
  /** 후보가 너무 적어 제대로 된 처방이 어려운 상태인가 */
  tooFew: boolean;
};

/** 이 개수보다 적으면 라이브러리가 부족하다고 본다. */
export const MIN_CANDIDATES = 4;

export function selectCandidates({
  facts,
  plan,
  library,
}: {
  facts: ReportFacts;
  plan: PitchPlan;
  library: ExerciseLike[];
}): PrescriptionCandidates {
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

  const drop = (rule: string, keep: (ex: ExerciseLike) => boolean) => {
    const before = pool.length;
    pool = pool.filter(keep);
    const removed = before - pool.length;
    if (removed > 0) excluded.push({ rule, count: removed });
  };

  // 2) 부하 구간에 따른 강도 상한
  const allowed = facts.load.zone
    ? ALLOWED_INTENSITY[facts.load.zone]
    : UNKNOWN_ZONE_INTENSITY;

  if (facts.load.zone === 'danger') {
    basis.push('부하 위험 구간 → 낮은 강도 운동만');
  } else if (facts.load.zone === 'caution') {
    basis.push('부하 주의 구간 → 높은 강도 제외');
  } else if (facts.load.zone) {
    basis.push('부하가 적정 범위 → 강도 제한 없음');
  } else {
    basis.push('부하 지수를 아직 낼 수 없어 높은 강도 제외');
  }
  drop('부하 구간에 맞지 않는 강도', (ex) => allowed.includes(ex.intensity));

  // 3) 성장기는 고강도를 뺀다.
  if (facts.profile.age != null && facts.profile.age < YOUTH_AGE_THRESHOLD) {
    basis.push(`만 ${facts.profile.age}세(성장기) → 높은 강도 제외`);
    drop('성장기 고강도 제한', (ex) => ex.intensity !== '높음');
  }

  // 4) 컨디션이 낮은 날도 고강도를 뺀다.
  const today = facts.condition.today;
  if (today && today.condition <= LOW_CONDITION_THRESHOLD) {
    basis.push(`오늘 컨디션 ${today.condition}/10 → 높은 강도 제외`);
    drop('컨디션 저하', (ex) => ex.intensity !== '높음');
  }

  // 5) 뻐근한 부위는 그 부위를 쓰는 고강도 운동을 뺀다.
  //    (가벼운 회복·가동성 운동은 오히려 도움이 되므로 남긴다.)
  for (const [key, label] of [
    ['shoulder', '어깨'],
    ['elbow', '팔꿈치'],
  ] as const) {
    if (today?.[key] !== '뻐근') continue;
    const parts = RELATED_PARTS[key];
    basis.push(`${label} 뻐근함 → ${parts.join('·')} 부위 고강도 제외`);
    drop(
      `${label} 뻐근함`,
      (ex) =>
        ex.intensity !== '높음' || !ex.bodyParts.some((p) => parts.includes(p))
    );
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
