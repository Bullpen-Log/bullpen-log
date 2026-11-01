/**
 * 코치 AI 를 부르기 전 판정(docs/designs/ai-coach.md 10-6 U41 · U42) — 하나라도 걸리면 AI 없이 정해진 문장으로. 순수 파일(값은 서버가 모아 넘긴다).
 * 차례: 국외 이전 동의 → 만 14세 → 열쇠 → 상한 0(끔) → 이번 달 비용 → (대화만) 하루 30마디.
 */
export const AI_DAILY_CHATS = 30;
export const AI_MIN_AGE = 14;
export const AI_DEFAULT_MONTHLY_USD = 30;

export type AiKind = 'chat' | 'explain';
export type AiBlock = 'consent' | 'age' | 'key' | 'off' | 'budget' | 'daily';
export type AiGate = { ok: true; left: number } | { ok: false; why: AiBlock };

export type AiGateInput = {
  consent: boolean;
  age: number | null;
  hasKey: boolean;
  capUsd: number;
  monthCostMicro: number;
  todayChats: number;
};

export function aiGate(kind: AiKind, i: AiGateInput): AiGate {
  if (!i.consent) return { ok: false, why: 'consent' };
  if (i.age == null || i.age < AI_MIN_AGE) return { ok: false, why: 'age' };
  if (!i.hasKey) return { ok: false, why: 'key' };
  if (!(i.capUsd > 0)) return { ok: false, why: 'off' };
  if (i.monthCostMicro >= i.capUsd * 1_000_000) return { ok: false, why: 'budget' };
  if (kind === 'chat' && i.todayChats >= AI_DAILY_CHATS) return { ok: false, why: 'daily' };
  return { ok: true, left: Math.max(0, AI_DAILY_CHATS - i.todayChats) };
}

/** 환경변수 COACH_AI_MONTHLY_USD — 없거나 읽을 수 없으면 기본 $30, 0 이면 AI 끔(비상 스위치) */
export function capUsdOf(raw: string | undefined): number {
  if (raw == null || raw.trim() === '') return AI_DEFAULT_MONTHLY_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : AI_DEFAULT_MONTHLY_USD;
}

/** 대화 칸에 보이는 한 줄 — 단추 조정은 그대로 된다 */
export const AI_BLOCK_TEXT: Record<AiBlock, string> = {
  consent: 'AI 대화는 동의한 뒤에 쓸 수 있어요.',
  age: 'AI 대화는 만 14세부터 쓸 수 있어요.',
  key: '지금은 AI 대화를 쓸 수 없어요. 단추로는 계속 바꿀 수 있어요.',
  off: '지금은 AI 대화를 쉬고 있어요. 단추로는 계속 바꿀 수 있어요.',
  budget: '이번 달 AI 대화가 끝났어요. 단추로는 계속 바꿀 수 있어요.',
  daily: '오늘 대화는 다 썼어요. 내일 다시 이야기해요. 단추로는 계속 바꿀 수 있어요.',
};
