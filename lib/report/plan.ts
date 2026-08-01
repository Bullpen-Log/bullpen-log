import { shiftDateKey } from '@/lib/pitch-stats';
import type { ReportFacts } from '@/lib/report/facts';

/**
 * 향후 3일 투구 계획을 규칙만으로 만든다.
 *
 * 이 파일에는 AI가 전혀 개입하지 않는다. 여기서 나온 숫자가 리포트의
 * 근거가 되고, AI는 그 숫자를 설명하는 문장만 쓴다.
 *
 * 아래 기준표는 절대 진리가 아니라 조정 가능한 설정값이다.
 * 팀 사정에 맞게 바꿔도 되며, 바꾸면 계획도 그대로 따라 바뀐다.
 */

/**
 * 나이별 하루 최대 투구수.
 * 유소년 투구수 가이드(Pitch Smart)에서 널리 쓰이는 구간을 옮긴 것으로,
 * 성장기일수록 상한을 낮게 잡는다.
 */
export const AGE_PITCH_LIMITS = [
  { throughAge: 10, dailyMax: 75 },
  { throughAge: 12, dailyMax: 85 },
  { throughAge: 14, dailyMax: 95 },
  { throughAge: 16, dailyMax: 95 },
  { throughAge: 18, dailyMax: 105 },
  { throughAge: 200, dailyMax: 120 },
] as const;

/** 나이를 모를 때 쓰는 보수적인 상한 */
export const UNKNOWN_AGE_DAILY_MAX = 95;

/**
 * 던진 투구수에 따라 필요한 휴식일.
 * 고교 연령(15~18) 기준표를 따르며, 그보다 어리면 더 보수적으로 봐야 한다.
 */
export const REST_REQUIREMENTS = [
  { minPitches: 76, restDays: 4 },
  { minPitches: 61, restDays: 3 },
  { minPitches: 46, restDays: 2 },
  { minPitches: 31, restDays: 1 },
  { minPitches: 0, restDays: 0 },
] as const;

/** 성장기로 보아 추가 주의를 안내할 나이 */
export const YOUTH_AGE_THRESHOLD = 15;

export function dailyPitchCap(age: number | null) {
  if (age == null) return UNKNOWN_AGE_DAILY_MAX;
  return (
    AGE_PITCH_LIMITS.find((r) => age <= r.throughAge)?.dailyMax ??
    UNKNOWN_AGE_DAILY_MAX
  );
}

export function requiredRestDays(pitches: number) {
  return REST_REQUIREMENTS.find((r) => pitches >= r.minPitches)?.restDays ?? 0;
}

/** 부하 구간별 조절 계수 — 평소 투구수에 곱한다. */
const ZONE_ADJUSTMENT: Record<
  string,
  { volume: number; maxIntensity: number; label: string }
> = {
  danger: { volume: 0.5, maxIntensity: 5, label: '부하 위험 구간이라 절반으로 줄임' },
  caution: { volume: 0.7, maxIntensity: 6, label: '부하 주의 구간이라 30% 줄임' },
  optimal: { volume: 1.0, maxIntensity: 8, label: '부하가 적정해 평소 수준 유지' },
  low: { volume: 1.0, maxIntensity: 8, label: '부하가 낮아 평소 수준부터 서서히 회복' },
};

/** 부하 지수를 아직 낼 수 없을 때 쓰는 보수적인 기본값 */
const UNKNOWN_ZONE = {
  volume: 0.9,
  maxIntensity: 7,
  label: '4주치 기록이 아직 없어 보수적으로 잡음',
};

export type DayPlan = {
  dateKey: string;
  /** 오늘 / 내일 / 모레 */
  label: string;
  throwing: boolean;
  /** 던지는 날의 권장 상한. 쉬는 날이면 null */
  maxPitches: number | null;
  maxIntensity: number | null;
  reason: string;
};

export type PitchPlan = {
  /** 통증이 있으면 계획 대신 휴식·진료 안내만 낸다 */
  halted: boolean;
  haltReason: string | null;
  days: DayPlan[];
  /** 향후 3일 권장 총 투구수 */
  threeDayTotal: number;
  /** 어떤 규칙이 적용됐는지 — 화면에 근거로 그대로 보여준다 */
  basis: string[];
  /** 성장기 회원에게 덧붙일 주의 */
  youthNote: string | null;
};

const DAY_LABELS = ['오늘', '내일', '모레'];

export function buildPitchPlan(facts: ReportFacts): PitchPlan {
  const { patterns, load, profile, condition } = facts;
  const cap = dailyPitchCap(profile.age);
  const basis: string[] = [];

  const youthNote =
    profile.age != null && profile.age < YOUTH_AGE_THRESHOLD
      ? `만 ${profile.age}세는 성장기라 위 수치보다 더 보수적으로 잡는 것이 안전합니다. 지도자와 상의하세요.`
      : null;

  // 1) 통증 신호가 있으면 계획 자체를 내지 않는다. 다른 어떤 규칙보다 우선한다.
  if (condition.painRecently) {
    return {
      halted: true,
      haltReason:
        '최근 체크인에 통증이 기록되어 있습니다. 통증이 있는 동안에는 투구 계획을 제공하지 않습니다. 통증이 이어지면 전문의 진료를 받아보세요.',
      days: [],
      threeDayTotal: 0,
      basis: ['체크인 통증 기록 → 계획 중단'],
      youthNote,
    };
  }

  // 메모에 통증으로 보이는 표현이 있어도 멈춘다.
  // 잘못 잡았을 수 있으므로 체크인으로 정정하는 길을 함께 안내한다.
  if (condition.painWordsInMemo.length > 0) {
    return {
      halted: true,
      haltReason: `최근 메모에 통증으로 보이는 표현(${condition.painWordsInMemo.join(', ')})이 있어 계획을 내지 않았습니다. 실제로 통증이 있다면 던지지 말고 전문의와 상담하세요. 통증이 아니라면 오늘 체크인에서 몸 상태를 정확히 남겨주시면 다음 리포트부터 반영됩니다.`,
      days: [],
      threeDayTotal: 0,
      basis: ['메모의 통증 표현 → 계획 중단'],
      youthNote,
    };
  }

  // 2) 마지막 등판량에 따라 남은 휴식일을 센다.
  const lastOuting = patterns.lastOutingPitches ?? 0;
  const needRest = requiredRestDays(lastOuting);
  const restedSoFar = patterns.restDays ?? 99;
  const remainingRest = Math.max(0, needRest - restedSoFar);

  if (needRest > 0 && patterns.lastThrowDate) {
    basis.push(
      `마지막 등판 ${lastOuting}구 → 휴식 ${needRest}일 필요 (경과 ${restedSoFar}일)`
    );
  }

  // 3) 부하 구간에 따른 조절 계수
  const adj = load.zone ? ZONE_ADJUSTMENT[load.zone] : UNKNOWN_ZONE;
  basis.push(
    load.zone
      ? `부하 지수 ${load.ratio?.toFixed(2)} (${load.zone === 'danger' ? '위험' : load.zone === 'caution' ? '주의' : load.zone === 'optimal' ? '적정' : '낮음'}) → ${adj.label}`
      : adj.label
  );

  // 4) 기준 투구수 — 평소 던지던 양이 없으면 상한의 절반에서 시작한다.
  const baseline = patterns.baselinePitches ?? Math.round(cap * 0.5);
  if (patterns.baselinePitches == null) {
    basis.push(`평소 투구량 기록이 없어 상한의 절반(${baseline}구)에서 시작`);
  } else {
    basis.push(`평소 던진 날 평균 ${baseline}구를 기준으로 계산`);
  }

  let target = Math.round(baseline * adj.volume);

  // 5) 나이별 상한을 넘지 않게 자른다.
  if (target > cap) {
    basis.push(
      `나이별 하루 상한 ${cap}구 적용 (${profile.age != null ? `만 ${profile.age}세` : '나이 미입력이라 보수적 기준'})`
    );
    target = cap;
  }

  // 6) 연투가 길었으면 하루는 반드시 쉰다.
  const streakRest = patterns.longestStreak >= 3;
  if (streakRest) {
    basis.push(`최근 4주 최장 연투 ${patterns.longestStreak}일 → 중간 휴식일 확보`);
  }

  const days: DayPlan[] = DAY_LABELS.map((label, i) => {
    const dateKey = shiftDateKey(facts.asOf, i);

    // 남은 휴식일 안에 드는 날은 무조건 쉰다.
    if (i < remainingRest) {
      return {
        dateKey,
        label,
        throwing: false,
        maxPitches: null,
        maxIntensity: null,
        reason: `마지막 등판(${lastOuting}구) 회복 중`,
      };
    }

    // 연투가 길었던 회원은 첫 등판 다음 날을 쉬게 한다.
    if (streakRest && i === remainingRest + 1) {
      return {
        dateKey,
        label,
        throwing: false,
        maxPitches: null,
        maxIntensity: null,
        reason: '연투가 길어 회복일 배치',
      };
    }

    return {
      dateKey,
      label,
      throwing: true,
      maxPitches: target,
      maxIntensity: adj.maxIntensity,
      reason: adj.label,
    };
  });

  return {
    halted: false,
    haltReason: null,
    days,
    threeDayTotal: days.reduce((sum, d) => sum + (d.maxPitches ?? 0), 0),
    basis,
    youthNote,
  };
}
