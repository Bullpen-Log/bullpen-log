/**
 * 코치 AI 값표(docs/designs/ai-coach.md 10-6 U41) — 모델별 $/백만 토큰. 응답 usage → CoachLog.costMicro(백만분의 1달러). 순수 파일.
 * Opus 5.5 는 문서값($4 · $20 · 캐시 읽기 $0.20, 캐시 쓰기는 입력의 1.25배). Haiku 5.5 는 입력 · 출력이 문서값($0.10 · $0.50, 10만 토큰 이하),
 * 캐시 읽기 · 쓰기는 다른 모델과 같은 비율(0.1배 · 1.25배)로 둔 어림 — 실제 청구서를 보고 고친다. 모르는 모델은 가장 비싼 값으로 센다(덜 세지 않게).
 */
export type AiPrice = { input: number; output: number; cacheRead: number; cacheWrite: number };

export const AI_PRICE: Record<string, AiPrice> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

const MOST: AiPrice = AI_PRICE['claude-opus-5-5'];

export type AiUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** 백만분의 1달러 — $/MTok × 토큰 수가 곧 마이크로달러다. 올림(덜 세지 않게) */
export function costMicroOf(model: string, u: AiUsage): number {
  const p = AI_PRICE[model] ?? MOST;
  const n = (x: number | null | undefined) => (typeof x === 'number' && x > 0 ? x : 0);
  return Math.ceil(p.input * n(u.input_tokens) + p.output * n(u.output_tokens) + p.cacheRead * n(u.cache_read_input_tokens) + p.cacheWrite * n(u.cache_creation_input_tokens));
}
