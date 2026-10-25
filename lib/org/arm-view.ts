import { armStatusOf, type ArmStatus } from '@/lib/report/arm-status';
import type { ReportFacts } from '@/lib/report/facts';
import { shiftDateKey } from '@/lib/pitch-stats';
import type { Consent } from '@/lib/org/rules';

/**
 * 코치 · 보호자가 보는 팔 상태(2026-10-25 0단계 계약 2-1). 판정은 선수 엔진(armStatusOf) 그대로 — 다만 공유하지 않은 범위는 판정에서 빼고
 * missing 에 적는다. 체크인을 공유하지 않았는데 통증 신호가 섞여 보이던 것(투구 공유만 켜도 체크인 통증이 팔 상태에 들어감)을 막는다.
 * missing 이 있으면 화면은 '안전' 대신 '정보 부족'을 보인다 — 못 읽은 것을 안전으로 보이게 하지 않는다.
 */

/** 'checkin' 체크인 비공유 · 'training' 트레이닝(재활) 비공유 · 'records' 최근 투구 기록 없음 */
export type ArmMissing = 'checkin' | 'training' | 'records';
export type CoachArmStatus = ArmStatus & { missing: ArmMissing[] };

/** 이 날수 안에 투구 기록(쉰 날 줄 포함)이 없으면 'records' — 2주 쉰 선수도 '안전'이 아니라 '기록 없음'으로 */
export const ARM_RECORD_DAYS = 14;

export const ARM_MISSING_TEXT: Record<ArmMissing, string> = {
  checkin: '체크인을 공유하지 않았어요',
  training: '재활 · 트레이닝을 공유하지 않았어요',
  records: `최근 ${ARM_RECORD_DAYS}일 투구 기록이 없어요`,
};

export function coachArmStatusOf(facts: ReportFacts, scope: Consent, todayKey: string): CoachArmStatus {
  const missing: ArmMissing[] = [];
  let condition = facts.condition;
  if (!scope.checkin) {
    condition = { ...condition, today: null, painToday: false, painRecently: false, painRecentParts: [] };
    missing.push('checkin');
  }
  if (!scope.training) {
    condition = { ...condition, rehab: null, rehabParts: [] };
    missing.push('training');
  }
  const last = facts.patterns.lastThrowDate;
  if (!last || last < shiftDateKey(todayKey, -(ARM_RECORD_DAYS - 1))) missing.push('records');
  return { ...armStatusOf({ ...facts, condition }), missing };
}

/** 판정은 '안전'인데 못 읽은 것이 있다 — 화면은 '안전' 대신 '정보 부족'. 주의 · 위험은 읽은 것만으로도 뜬 신호라 그대로 보인다 */
export function armUnknown(s: CoachArmStatus): boolean {
  return s.level === 'safe' && s.missing.length > 0;
}
