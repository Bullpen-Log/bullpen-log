import 'server-only';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AI_MODEL, getAiClient } from '@/lib/ai/client';
import {
  ReportSchema,
  SYSTEM_PROMPT,
  buildUserPrompt,
  checkPitchCounts,
  checkTrainingMentions,
  type AiReportBody,
  type TrainingContext,
  type WorkoutLoadContext,
} from '@/lib/ai/report-prompt';
import type { ReportFacts } from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';

export type { AiReportBody };

export type GenerateResult =
  | { ok: true; body: AiReportBody; usage: { input: number; output: number } }
  | { ok: false; reason: string };

/**
 * 리포트 문장을 생성한다.
 * 통증 등으로 계획이 멈춘 경우에는 애초에 부르지 않는다(호출부에서 처리).
 */
export async function generateReportBody(
  facts: ReportFacts,
  plan: PitchPlan,
  /** 오늘 배정된 운동. 라이브러리가 비어 있으면 없을 수 있다. */
  training?: TrainingContext,
  /** 배정되지 않은 운동을 권했는지 검사할 때 쓰는 전체 목록 */
  allExerciseTitles: string[] = [],
  /** 최근 운동량과 운동 부하 지수. 투구와 합치지 않고 따로 넘긴다. */
  workout?: WorkoutLoadContext
): Promise<GenerateResult> {
  try {
    const response = await getAiClient().messages.parse({
      model: AI_MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserPrompt(facts, plan, training, workout) },
      ],
      output_config: { format: zodOutputFormat(ReportSchema) },
    });

    const body = response.parsed_output;
    if (!body) return { ok: false, reason: '리포트 형식을 만들지 못했습니다.' };

    // 계획에 없는 투구수를 지어냈다면 저장하지 않는다.
    const numbers = checkPitchCounts(body, facts, plan);
    if (!numbers.ok) {
      return {
        ok: false,
        reason: `계획에 없는 투구수(${numbers.offending.join(', ')}구)가 포함되어 저장하지 않았습니다.`,
      };
    }

    // 안전 규칙으로 뺀 운동을 이름으로 권했다면 저장하지 않는다.
    if (training) {
      const mentions = checkTrainingMentions(body, {
        pickedTitles: training.picked.map((p) => p.title),
        allTitles: allExerciseTitles,
      });
      if (!mentions.ok) {
        return {
          ok: false,
          reason: `오늘 배정되지 않은 운동(${mentions.offending.join(', ')})이 언급되어 저장하지 않았습니다.`,
        };
      }
    }

    return {
      ok: true,
      body,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `AI 호출에 실패했습니다: ${message}` };
  }
}
