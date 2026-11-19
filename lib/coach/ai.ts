import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { COACH_SYSTEM_BLOCK } from '@/lib/coach/ai-prompt';
import { TOOL_DEFS } from '@/lib/coach/tool-defs';
import type { AiUsage } from '@/lib/coach/ai-price';

/**
 * 코치 AI 부르기(docs/designs/ai-coach.md 10-6 U39 · U40) — 서버에서만(앱 → rpc → 서버 → Anthropic). 열쇠는 Vercel 환경변수 ANTHROPIC_API_KEY.
 * 대화: 답 글은 구조화 출력(zod)으로, 기록 읽기 · 바꾸기 제안은 도구로(개인 비서 1단계 — 도구 되돌기, lib/coach/tool-defs.ts). 바꾸기 도구는 카드만 만들고
 * 저장 · 적용은 하지 않는다(사용자가 카드를 눌러야 서버가 다시 확인하고 실행).
 * 거절(stop_reason 'refusal')을 먼저 본다. 기본 모델은 Haiku 5.5(2026-11-16 김민: 값 — Opus 5.5 의 1/40). Haiku 는 서버 쪽 이어받기(fallbacks)가 없어
 * 붙이지 않고, 거절이면 정해진 문장으로 간다. 환경변수로 Opus · Sonnet 을 고르면 fallbacks 'default'(베타 server-side-fallback-2026-07-01)를 붙인다.
 * 생각(thinking)은 켜 둔 채 effort 'low' 로 줄이고, 생각 글은 보이지도 저장하지도 않는다. 대화 기록은 글만 다시 보낸다.
 */
export const COACH_MODEL_CHAT = process.env.COACH_MODEL_CHAT || 'claude-haiku-5-5';

export const aiKeyReady = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
/* 15초 · 재시도 둘(SDK 기본 재시도 규칙) — 넘으면 정해진 문장 */
const clientOf = () => (client ??= new Anthropic({ timeout: 15_000, maxRetries: 2 }));

/* 답 글 하나 — 바꾸기 제안은 도구(카드)로 낸다(개인 비서 1단계, lib/coach/tool-defs.ts) */
const ChatOut = z.object({ reply: z.string() });

/** 한 답에 도구를 부르는 횟수(되돌기) 상한 · 전체 시간 — 넘으면 도구 없이 답을 맺게 한다(값 · 기다림을 묶는다) */
export const MAX_TOOL_ROUNDS = 3;
const TURN_BUDGET_MS = 30_000;

/** 도구 실행기 — 읽기는 글로 돌려주고, 바꾸기는 카드를 모으고 결과 글을 돌려준다(lib/coach/tools.ts) */
export type Toolbox = { run(name: string, input: unknown): Promise<{ text: string; error?: boolean }> };

export type ChatLine = { role: 'user' | 'coach'; text: string };

export type ChatTurn =
  | { ok: true; reply: string; model: string; usage: AiUsage; ms: number; rounds: number }
  | { ok: false; why: 'refusal' | 'parse' | 'error'; model: string; usage: AiUsage; ms: number };

const addUsage = (sum: AiUsage, u: AiUsage) => {
  for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const) sum[k] = (sum[k] ?? 0) + (u[k] ?? 0);
};

/**
 * 앞 마디(글만) 정리 — 사용자로 시작, 같은 쪽이 이어지면 합친다(실패한 마디 뒤에 사용자 말이 둘 이어질 수 있다). 마지막 칸(코치 답)에 캐시 표시를
 * 단다 — 시스템 글 + 지난 마디는 다음 마디에도 글자 그대로라 5분 안 다음 마디가 읽는다. 오늘 맥락 + 이번 말은 그 뒤라 캐시를 안 깬다.
 * 예전에는 요청 끝(맥락 + 이번 말)에 자동 표시를 달아, 다음 마디에는 그 칸이 맥락 없이 저장된 말로 바뀌어 한 번도 못 읽고 쓰기 값만 냈다
 * (2026-11-17 검토 [27]). 20마디 창이 밀리기 시작하면 앞이 바뀌어 못 읽는다(짧은 대화 몫).
 */
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
  return out.map((m, i) =>
    i === out.length - 1 ? { role: m.role, content: [{ type: 'text' as const, text: m.content, cache_control: { type: 'ephemeral' as const } }] } : m
  );
}

/**
 * 한 마디 — 도구를 쓰면 실행해 결과를 돌려주고 다시 묻는다(MAX_TOOL_ROUNDS 번까지, 그 뒤엔 도구 없이 답을 맺게). 비용은 모든 되돌기를 더한다.
 * 생각 블록이 섞인 앞 응답은 그대로 돌려준다(도구 되돌기 규칙).
 */
export async function chatTurn(history: readonly ChatLine[], context: string, text: string, box: Toolbox): Promise<ChatTurn> {
  const t0 = Date.now();
  let model = COACH_MODEL_CHAT;
  const usage: AiUsage = {};
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [...turnsOf(history), { role: 'user', content: `${context}\n\n[사용자 말]\n${text}` }];
  try {
    for (let round = 0; ; round++) {
      const last = round >= MAX_TOOL_ROUNDS || Date.now() - t0 > TURN_BUDGET_MS;
      const r = await clientOf().beta.messages.parse({
        model: COACH_MODEL_CHAT,
        max_tokens: 2000,
        /* 도구 목록 + 규칙 글 + 지식 카드 — 모든 사용자가 같아 여기 캐시 표시(도구가 system 앞에 붙어 같이 캐시된다) */
        tools: TOOL_DEFS,
        tool_choice: { type: last ? 'none' : 'auto' },
        system: [{ type: 'text', text: COACH_SYSTEM_BLOCK, cache_control: { type: 'ephemeral' } }],
        messages,
        output_config: { effort: 'low', format: betaZodOutputFormat(ChatOut) },
        /* 캐시 표시는 고정 덩이 끝(system) · 지난 마디 끝(turnsOf) 둘 — usage.cache_read_input_tokens 로 확인 */
        ...(COACH_MODEL_CHAT.includes('haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
      });
      model = r.model;
      addUsage(usage, r.usage as AiUsage);
      if (r.stop_reason === 'refusal') return { ok: false, why: 'refusal', model, usage, ms: Date.now() - t0 };
      if (r.stop_reason === 'tool_use' && !last) {
        const uses = r.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use');
        messages.push({ role: 'assistant', content: r.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
        const results = await Promise.all(
          uses.map(async (u) => {
            const o = await box.run(u.name, u.input).catch((e: unknown) => {
              console.error('[coach-ai] tool failed:', u.name, e instanceof Error ? e.message : String(e));
              return { text: '지금은 읽지 못했어요.', error: true };
            });
            return { type: 'tool_result' as const, tool_use_id: u.id, content: o.text, ...(o.error ? { is_error: true } : {}) };
          })
        );
        messages.push({ role: 'user', content: results });
        continue;
      }
      const out = r.parsed_output;
      if (!out || !out.reply.trim()) return { ok: false, why: 'parse', model, usage, ms: Date.now() - t0 };
      return { ok: true, reply: out.reply.trim().slice(0, 600), model, usage, ms: Date.now() - t0, rounds: round };
    }
  } catch (e) {
    /* 왜 실패했는지 서버 로그에 남긴다(열쇠 · 사용자 글은 안 찍힌다 — SDK 오류 글만) */
    console.error('[coach-ai] chat failed:', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    return { ok: false, why: 'error', model, usage, ms: Date.now() - t0 };
  }
}
