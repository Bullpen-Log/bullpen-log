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

/**
 * 건강 동의가 지금 없을 때 그 앞 코치 대화를 AI 에 다시 보내지 않을 경계(2026-11-19 검토) — 동의가 있던 동안의 대화에는 앱이 건넨 건강정보
 * (통증 · 팔 상태 · 피할 동작)와 그에 대한 답이 섞여 있다. 사용자가 쓴 말과 앱이 건넨 것을 글에서 가를 수 없어 시각으로 자른다.
 * - null: 거를 것 없음(동의가 유효하거나, 한 번도 동의한 적 없어 앱이 건강정보를 건넨 적이 없음)
 * - Date: 거둔 때 — 그 뒤의 대화는 동의 없이(건강정보 없이) 오갔다
 * - 'all': 동의 판이 바뀌어 무효가 됨 — 언제부터 무효였는지(배포 시각) 기록이 없어 지난 대화를 모두 뺀다(다시 동의하면 돌아온다)
 */
export function healthCutoffOf(records: readonly ConsentRecord[]): Date | 'all' | null {
  if (records.length === 0 || healthConsentOf(records).valid) return null;
  if (records.some((r) => r.revokedAt == null)) return 'all';
  return new Date(Math.max(...records.map((r) => r.revokedAt!.getTime())));
}

/** 대화 기록을 AI 에 보낼 시작 시각 — 보관 창(keepFrom)과 건강 경계 중 늦은 쪽. null 이면 지난 대화를 보내지 않는다 */
export function historyFloorOf(keepFrom: Date, cutoff: Date | 'all' | null): Date | null {
  if (cutoff === 'all') return null;
  return cutoff && cutoff > keepFrom ? cutoff : keepFrom;
}
