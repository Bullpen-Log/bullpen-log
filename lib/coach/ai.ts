import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { COACH_SYSTEM } from '@/lib/coach/ai-prompt';
import type { AiUsage } from '@/lib/coach/ai-price';

/**
 * 코치 AI 부르기(docs/designs/ai-coach.md 10-6 U39 · U40) — 서버에서만(앱 → rpc → 서버 → Anthropic). 열쇠는 Vercel 환경변수 ANTHROPIC_API_KEY.
 * 대화: 답 글 + 바꿀 거리(0~3) 를 구조화 출력(zod)으로 받는다 — 모양이 늘 맞다. 도구 · 반복 고리 없음. 저장 · 적용은 하지 않는다(거르기 → 사용자 [적용]).
 * 거절(stop_reason 'refusal')을 먼저 본다. 대화는 fallbacks 'default'(베타 server-side-fallback-2026-07-01)로 다른 모델이 이어받는다.
 * 생각(thinking)은 Opus 5.5 에서 끌 수 없어 effort 'low' 로 줄이고, 생각 글은 보이지도 저장하지도 않는다. 대화 기록은 글만 다시 보낸다.
 */
export const COACH_MODEL_CHAT = process.env.COACH_MODEL_CHAT || 'claude-opus-5-5';

export const aiKeyReady = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
/* 15초 · 재시도 둘(SDK 기본 재시도 규칙) — 넘으면 정해진 문장 */
const clientOf = () => (client ??= new Anthropic({ timeout: 15_000, maxRetries: 2 }));

const ChatOut = z.object({
  reply: z.string(),
  adjusts: z.array(
    z.object({
      kind: z.enum(['minutes', 'skip', 'move', 'busy']),
      date: z.string().nullable(),
      minutes: z.number().int().nullable(),
      from: z.string().nullable(),
      to: z.string().nullable(),
    })
  ),
});

export type ChatLine = { role: 'user' | 'coach'; text: string };

export type ChatTurn =
  | { ok: true; reply: string; adjusts: unknown[]; model: string; usage: AiUsage; ms: number }
  | { ok: false; why: 'refusal' | 'parse' | 'error'; model: string; usage: AiUsage; ms: number };

/** 앞 마디(글만) 정리 — 사용자로 시작, 같은 쪽이 이어지면 합친다(실패한 마디 뒤에 사용자 말이 둘 이어질 수 있다) */
function turnsOf(history: readonly ChatLine[]): Anthropic.Beta.Messages.BetaMessageParam[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const h of history) {
    const role = h.role === 'user' ? 'user' : 'assistant';
    if (!out.length && role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${h.text}`;
    else out.push({ role, content: h.text });
  }
  if (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}

export async function chatTurn(history: readonly ChatLine[], context: string, text: string): Promise<ChatTurn> {
  const t0 = Date.now();
  const model = COACH_MODEL_CHAT;
  try {
    const r = await clientOf().beta.messages.parse({
      model,
      max_tokens: 2000,
      system: COACH_SYSTEM,
      messages: [...turnsOf(history), { role: 'user', content: `${context}\n\n[사용자 말]\n${text}` }],
      output_config: { effort: 'low', format: betaZodOutputFormat(ChatOut) },
      /* 시스템 글 + 지난 마디를 5분 안 다음 마디가 캐시로 읽는다(usage.cache_read_input_tokens 로 확인) */
      cache_control: { type: 'ephemeral' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    const usage = r.usage as AiUsage;
    const ms = Date.now() - t0;
    if (r.stop_reason === 'refusal') return { ok: false, why: 'refusal', model: r.model, usage, ms };
    const out = r.parsed_output;
    if (!out || !out.reply.trim()) return { ok: false, why: 'parse', model: r.model, usage, ms };
    return { ok: true, reply: out.reply.trim().slice(0, 600), adjusts: out.adjusts, model: r.model, usage, ms };
  } catch {
    return { ok: false, why: 'error', model, usage: {}, ms: Date.now() - t0 };
  }
}
