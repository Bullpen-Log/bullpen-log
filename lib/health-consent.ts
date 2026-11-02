import { consentStateOf, type ConsentRecord, type ConsentState } from '@/lib/analysis-consent';

/**
 * 건강정보(민감정보) 별도 동의 — 선택(docs/designs/ai-coach.md U15 · U17 · U18, 개인정보 보호법 제23조).
 * 동의 기록은 AnalysisConsent 표에 purpose 'health' 로 같이 둔다(같은 판 · 철회 틀 — lib/analysis-consent.ts consentStateOf).
 * 안 해도 가입 · 기록 · 트레이닝은 그대로 — 통증 · 팔 칸을 받지 않고(체크인), 재활 · 코치 시작만 막는다(B4).
 * 판을 올리는 것은 알릴 내용(항목 · 목적 · 보관)이 바뀔 때만 — 올리면 모두 다시 동의해야 한다.
 */
export const HEALTH_PURPOSE = 'health';

export const HEALTH_CONSENT = {
  version: '2026-11-01',
  title: '건강정보 수집 · 이용 동의(선택)',
  /* U17 — 컨디션 · 수면 · 키 · 몸무게 · 운동 · 투구 기록은 일반 정보라 여기 안 들어간다 */
  items: '통증 · 불편한 곳(부위 · 정도), 팔 통증 · 팔 피로, 재활(진단 · 단계), 코치의 운동 제한(전문가가 정한 것)',
  purpose: '아픈 곳을 피해 운동 · 암케어 · 재활 · 코치 일정을 맞추기',
  retention: '탈퇴하거나 동의를 거두면 지워요.',
  refusal: '동의하지 않아도 가입과 기록 · 트레이닝은 그대로 쓸 수 있어요. 아픈 곳은 받지 않고, 재활 · 코치는 시작할 수 없어요.',
} as const;

/** 받은 곳 — 가입 · 그 기능을 처음 열 때 · 설정 · 보호자(14세 미만) */
export type HealthConsentSource = 'signup' | 'first_use' | 'settings' | 'guardian';

/** 기록(purpose 'health' 줄만 넘긴다) → 지금 상태. 우리 문서라 확인할 남의 것이 없어 늘 확정이다 */
export function healthConsentOf(records: readonly ConsentRecord[]): ConsentState {
  return consentStateOf(records, true, HEALTH_CONSENT.version);
}
