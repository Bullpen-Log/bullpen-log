import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { COACH_SYSTEM_BLOCK } from '@/lib/coach/ai-prompt';
import type { AiUsage } from '@/lib/coach/ai-price';

/**
 * 코치 AI 부르기(docs/designs/ai-coach.md 10-6 U39 · U40) — 서버에서만(앱 → rpc → 서버 → Anthropic). 열쇠는 Vercel 환경변수 ANTHROPIC_API_KEY.
 * 대화: 답 글 + 바꿀 거리(0~3) + 목표 제안(하나 · null) + 대신 해 주기(하나 · null)를 구조화 출력(zod)으로 받는다 — 모양이 늘 맞다. 도구 · 반복 고리 없음. 저장 · 적용은 하지 않는다(거르기 → 사용자 [적용]).
 * 거절(stop_reason 'refusal')을 먼저 본다. 기본 모델은 Haiku 5.5(2026-11-16 김민: 값 — Opus 5.5 의 1/40). Haiku 는 서버 쪽 이어받기(fallbacks)가 없어
 * 붙이지 않고, 거절이면 정해진 문장으로 간다. 환경변수로 Opus · Sonnet 을 고르면 fallbacks 'default'(베타 server-side-fallback-2026-07-01)를 붙인다.
 * 생각(thinking)은 켜 둔 채 effort 'low' 로 줄이고, 생각 글은 보이지도 저장하지도 않는다. 대화 기록은 글만 다시 보낸다.
 */
export const COACH_MODEL_CHAT = process.env.COACH_MODEL_CHAT || 'claude-haiku-5-5';

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
  /* 정한 목표 제안(자비스 2단계) — 서버가 거른다(lib/coach/goal.ts sanitizeGoal) */
  goal: z
    .object({
      kind: z.enum(['set', 'drop']),
      what: z.string().nullable(),
      trigger: z.string().nullable(),
      checkOn: z.string().nullable(),
    })
    .nullable(),
  /* 대신 해 주기(자비스 5단계) — 투구 기록 초안 · 화면 열기 하나. 서버가 거른다(lib/coach/act.ts sanitizeAct) */
  act: z
    .object({
      kind: z.enum(['log', 'open']),
      screen: z.string().nullable(),
      date: z.string().nullable(),
      type: z.string().nullable(),
      count: z.number().int().nullable(),
    })
    .nullable(),
});

export type ChatLine = { role: 'user' | 'coach'; text: string };

export type ChatTurn =
  | { ok: true; reply: string; adjusts: unknown[]; goal: unknown; act: unknown; model: string; usage: AiUsage; ms: number }
  | { ok: false; why: 'refusal' | 'parse' | 'error'; model: string; usage: AiUsage; ms: number };

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

export async function chatTurn(history: readonly ChatLine[], context: string, text: string): Promise<ChatTurn> {
  const t0 = Date.now();
  const model = COACH_MODEL_CHAT;
  try {
    const r = await clientOf().beta.messages.parse({
      model,
      max_tokens: 2000,
      /* 규칙 글 + 지식 카드 — 모든 사용자가 같아 여기 캐시 표시(사람마다 다른 맥락은 마지막 사용자 칸에만) */
      system: [{ type: 'text', text: COACH_SYSTEM_BLOCK, cache_control: { type: 'ephemeral' } }],
      messages: [...turnsOf(history), { role: 'user', content: `${context}\n\n[사용자 말]\n${text}` }],
      output_config: { effort: 'low', format: betaZodOutputFormat(ChatOut) },
      /* 캐시 표시는 고정 덩이 끝(system) · 지난 마디 끝(turnsOf) 둘 — usage.cache_read_input_tokens 로 확인 */
      ...(model.includes('haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    });
    const usage = r.usage as AiUsage;
    const ms = Date.now() - t0;
    if (r.stop_reason === 'refusal') return { ok: false, why: 'refusal', model: r.model, usage, ms };
    const out = r.parsed_output;
    if (!out || !out.reply.trim()) return { ok: false, why: 'parse', model: r.model, usage, ms };
    return { ok: true, reply: out.reply.trim().slice(0, 600), adjusts: out.adjusts, goal: out.goal, act: out.act, model: r.model, usage, ms };
  } catch (e) {
    /* 왜 실패했는지 서버 로그에 남긴다(열쇠 · 사용자 글은 안 찍힌다 — SDK 오류 글만) */
    console.error('[coach-ai] chat failed:', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    return { ok: false, why: 'error', model, usage: {}, ms: Date.now() - t0 };
  }
}
