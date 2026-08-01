import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * 모델은 환경변수로 뺀다. 나중에 모델을 바꿀 때 코드를 고치지 않고
 * Vercel 설정만 바꾸면 되고, 되돌리기도 값만 되돌리면 된다.
 */
export const AI_MODEL = process.env.AI_MODEL ?? 'claude-sonnet-5';

/** AI 기능을 쓸 수 있는 상태인가 (키가 없으면 기능을 숨긴다) */
export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export function getAiClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일과 Vercel 환경변수를 확인하세요.'
    );
  }
  // 요청마다 새로 만들 필요가 없어 한 번만 만들어 재사용한다.
  client ??= new Anthropic();
  return client;
}
