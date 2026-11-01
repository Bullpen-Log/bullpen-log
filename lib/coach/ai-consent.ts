import { consentStateOf, type ConsentRecord, type ConsentState } from '@/lib/analysis-consent';

/**
 * 코치 AI 국외 이전 동의 — 선택(docs/designs/ai-coach.md 10-6 U43, 개인정보 보호법 국외 이전). 기록은 AnalysisConsent 표에 purpose 'coachAi'(건강정보 · 3D 와 같은 틀).
 * 거부해도 코치는 시작된다 — 대화 칸이 없고 설명은 정해진 문장. 거두면 대화 기록을 지운다.
 * 판을 올리는 것은 알릴 내용이 바뀔 때만. 보관 기간 · 학습 미사용은 사용자가 Anthropic 콘솔 · 약관에서 확인한 값으로 채운다(2026-11-01 '자리만 두고 나중에').
 */
export const COACH_AI_PURPOSE = 'coachAi';

export const COACH_AI_CONSENT = {
  version: '2026-11-01',
  title: 'AI 코치 대화 · 국외 이전 동의(선택)',
  to: 'Anthropic, PBC(미국) · privacy@anthropic.com',
  when: 'AI 코치에게 말을 걸거나 설명을 만들 때마다, 암호화된 연결로 보내요.',
  items: '나이대(14~16 · 17~19 · 20세 이상), 역할 · 목표 순위, 이번 주 일정(종류 · 시간 · 까닭 · 한 것), 다음 등판까지 일 수, 건강정보 동의가 있으면 오늘 체크인 신호, 내가 쓴 대화 글',
  notSent: '이름 · 이메일 · 생년월일 · 계정 번호 · 체크인 메모 원문 · 영상 · 위치는 보내지 않아요.',
  purpose: '코치 대화와 일정 설명 문장 만들기',
  /* ponytail: 확인 중 자리 — 출시 전 사용자가 Anthropic 콘솔 · 약관에서 확인한 값으로 바꾸고 version 을 올린다 */
  retention: '우리 앱에는 대화를 30일 동안 둬요. Anthropic 쪽 보관 기간과 학습에 쓰지 않는 조건은 확인 중이에요.',
  refusal: '동의하지 않아도 코치는 그대로 써요. AI 대화만 없고, 설명은 정해진 문장으로 나와요. 거두면 대화 기록을 지워요.',
} as const;

export function coachAiConsentOf(records: readonly ConsentRecord[]): ConsentState {
  return consentStateOf(records, true, COACH_AI_CONSENT.version);
}
