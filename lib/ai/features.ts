import 'server-only';
import { isAiConfigured } from '@/lib/ai/client';

/**
 * AI 기능 켜고 끄기 — 부를 때마다 돈이 나가는 곳이라, 두 사람이 정한 것만 켠다.
 *
 * 2026-10-02 금윤호: AI 를 어디에 얼마나 쓸지 김민과 회의로 정하기 전까지 홈 분석 리포트 ·
 * 영양 사진 기록을 끈다(정리는 docs/ai-usage.md). 끄면 단추가 사라지고, 서버도 AI 를 부르지
 * 않는다 — 지난 리포트는 그대로 보인다. 다시 켤 때는 여기 값만 true 로 바꾼다.
 *
 * 트레이닝 'AI 맞춤'(lib/ai/auto-setup.ts)은 김민 담당이라 여기서 다루지 않는다 — 끄기로 정하면
 * askAutoSetup 맨 앞에서 이 판을 보게 하면 된다(꺼져 있으면 규칙대로 짠다).
 */
export const AI_FEATURES = {
  /** 홈 → 분석의 리포트(app/actions/ai-report.ts) */
  homeReport: false,
  /** 영양 → 음식 추가의 사진 기록(app/api/nutrition/photo) */
  nutritionPhoto: false,
} as const;

export type AiFeature = keyof typeof AI_FEATURES;

/** 키가 있고, 이 기능을 켜 두었는가 */
export function isAiFeatureOn(feature: AiFeature) {
  return isAiConfigured() && AI_FEATURES[feature];
}
