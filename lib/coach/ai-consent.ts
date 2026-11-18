import { consentStateOf, type ConsentRecord, type ConsentState } from '@/lib/analysis-consent';

/**
 * 코치 AI 국외 이전 동의 — 선택(docs/designs/ai-coach.md 10-6 U43, 개인정보 보호법 국외 이전). 기록은 AnalysisConsent 표에 purpose 'coachAi'(건강정보 · 3D 와 같은 틀).
 * 거부해도 코치는 시작된다 — 대화 칸이 없고 설명은 정해진 문장. 거두면 대화 기록을 지운다.
 * 판을 올리는 것은 알릴 내용이 바뀔 때만. 보관 기간 · 학습 미사용은 사용자가 Anthropic 콘솔 · 약관에서 확인한 값으로 채운다(2026-11-01 '자리만 두고 나중에').
 */
export const COACH_AI_PURPOSE = 'coachAi';

export const COACH_AI_CONSENT = {
  /* 2026-11-19 판: 코치가 일정 밖 기록도 읽는다(자비스 1단계) — 보내는 것이 늘어 다시 동의받는다. 11-16 에 넓힌 투구 기록 · 팔 상태 · 오늘 운동도 이제 적는다 */
  version: '2026-11-19',
  title: 'AI 코치 대화 · 국외 이전 동의(선택)',
  to: 'Anthropic, PBC(미국) · privacy@anthropic.com',
  when: 'AI 코치에게 말을 걸거나 설명을 만들 때마다, 암호화된 연결로 보내요.',
  items:
    '나이대(14~16 · 17~19 · 20세 이상), 역할 · 목표 순위, 이번 주 일정(종류 · 시간 · 까닭 · 한 것), 다음 등판까지 일 수, 최근 7일 투구 기록(종류 · 구수 · 강도), 운동 힘듦, 오늘 운동의 종류 · 시간, 가장 최근 3D 동작 분석의 판정(요소 이름 · 고칠 점), 메커니즘 처방 진행, 최근 구속 측정값, 최근 14일 암케어를 한 날 수, 영양을 쓰면 오늘 더 먹을 양 · 균형 점수, 건강정보 동의가 있으면 오늘 체크인 신호 · 팔 상태 · 피할 동작 · 오늘 운동의 까닭 · 영양 할 일, 내가 쓴 대화 글',
  notSent: '이름 · 이메일 · 생년월일 · 계정 번호 · 체크인 · 투구 메모 원문 · 영상 · 3D 분석의 각도 숫자 · 위치는 보내지 않아요.',
  purpose: '코치 대화(기록을 읽고 할 일 짚어 주기 · 일정 바꾸기 제안)와 일정 설명 문장 만들기',
  /* ponytail: 확인 중 자리 — 출시 전 사용자가 Anthropic 콘솔 · 약관에서 확인한 값으로 바꾸고 version 을 올린다 */
  retention: '우리 앱에는 대화를 30일 동안 둬요. Anthropic 쪽 보관 기간과 학습에 쓰지 않는 조건은 확인 중이에요.',
  refusal: '동의하지 않아도 코치는 그대로 써요. AI 대화만 없고, 설명은 정해진 문장으로 나와요. 거두면 대화 기록을 지워요.',
} as const;

export function coachAiConsentOf(records: readonly ConsentRecord[]): ConsentState {
  return consentStateOf(records, true, COACH_AI_CONSENT.version);
}
