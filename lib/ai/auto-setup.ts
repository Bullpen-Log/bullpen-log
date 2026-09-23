import 'server-only';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AI_MODEL, getAiClient, isAiConfigured } from '@/lib/ai/client';
import {
  AUTO_SYSTEM_PROMPT,
  acceptAnswer,
  autoSetupSchema,
  buildAutoPrompt,
  type AutoPromptInput,
} from '@/lib/ai/auto-setup-prompt';
import type { AutoDecision } from '@/lib/report/auto-setup';

/**
 * AI 맞춤 — AI에게 오늘 방향을 묻는다.
 *
 * 답이 늦거나, 틀리거나, 연결이 안 되면 규칙 초안으로 간다. 그래서 여기서는
 * 실패를 던지지 않고 까닭과 함께 돌려준다 — 일정은 AI가 없어도 나와야 한다.
 */

/**
 * 기다리는 한도(밀리초).
 *
 * 누른 사람은 화면 앞에서 기다린다. 이보다 오래 걸리면 규칙 초안으로 만드는
 * 편이 낫다. 다시 시도도 하지 않는다 — 한 번 늦은 것을 한 번 더 기다리면
 * 두 배를 기다리게 된다.
 */
const TIMEOUT_MS = 25_000;

export type AskResult =
  | {
      ok: true;
      decision: AutoDecision;
      model: string;
      usage: { input: number; output: number };
      ms: number;
    }
  | {
      ok: false;
      /** 무엇이 잘못됐는지 — 기록에 남긴다. 화면에는 짧은 안내만 나간다 */
      reason: string;
      /** 실제로 AI를 불렀는가. 불렀으면 비용이 나갔으므로 하루 횟수에 센다 */
      called: boolean;
      model?: string;
      usage?: { input: number; output: number };
      ms?: number;
    };

export async function askAutoSetup(
  input: AutoPromptInput,
  /** 라이브러리의 모든 운동 이름 — 이유에 종목 이름이 나오면 버린다 */
  allTitles: string[]
): Promise<AskResult> {
  if (!isAiConfigured()) {
    return { ok: false, called: false, reason: 'ANTHROPIC_API_KEY 없음' };
  }

  const started = Date.now();
  try {
    const response = await getAiClient().messages.parse(
      {
        model: AI_MODEL,
        max_tokens: 1500,
        /*
         * 깊이 생각하는 단계를 끈다.
         *
         * 켜 두었더니(모델 기본값) 짧은 답 하나에 10~20초가 걸렸고, 생각하는 데
         * 토큰을 다 써 답이 중간에 잘린 적도 있다(2026-09-23 실제로 불러 봄).
         * 고를 것이 울타리 안의 몇 가지뿐이고 안전은 규칙이 지키므로, 누른 사람을
         * 기다리게 할 만큼 깊이 생각할 일이 아니다.
         */
        thinking: { type: 'disabled' },
        system: AUTO_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildAutoPrompt(input) }],
        output_config: { format: zodOutputFormat(autoSetupSchema(input.fence)) },
      },
      { timeout: TIMEOUT_MS, maxRetries: 0 }
    );
    const ms = Date.now() - started;
    const usage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    };

    const answer = response.parsed_output;
    if (!answer) {
      return {
        ok: false,
        called: true,
        reason: '답의 형식이 맞지 않음',
        model: AI_MODEL,
        usage,
        ms,
      };
    }

    const checked = acceptAnswer(answer, input, allTitles);
    if (!checked.ok) {
      return {
        ok: false,
        called: true,
        reason: checked.reason,
        model: AI_MODEL,
        usage,
        ms,
      };
    }

    return { ok: true, decision: checked.decision, model: AI_MODEL, usage, ms };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      called: true,
      reason: `AI 호출 실패: ${message.slice(0, 200)}`,
      model: AI_MODEL,
      ms: Date.now() - started,
    };
  }
}
