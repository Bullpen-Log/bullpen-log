/**
 * 횟수 제한 — DB 고정 창. 서버리스라 메모리에 둘 수 없다. 원래 IP 는 저장하지 않고 소금을 친 해시만 둔다.
 * 창이 바뀌는 순간에는 한도의 두 배까지 지나갈 수 있다(고정 창의 한계) — 접수 규모에는 충분하다.
 */
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { IntakeError } from '@/lib/intake/errors';

export type RateRule = { limit: number; windowSec: number };

/** 범위마다의 기본값 — 접근 코드는 맞출 때까지 시도할 수 없게 가장 좁다 */
export const INTAKE_RATE_RULES = {
  /** 공개 API 전체 — 주소별 */
  public: { limit: 120, windowSec: 60 },
  /** 없는 토큰으로 두드리기 */
  invalid_token: { limit: 20, windowSec: 600 },
  /** 전송 토큰 발급 */
  upload_token: { limit: 60, windowSec: 600 },
  /** 완료 */
  finalize: { limit: 20, windowSec: 600 },
  /** 틀린 접근 코드 — 초대별. 대조 전에 세고 맞으면 돌려준다(access.ts verifyResultAccess) */
  code: { limit: 8, windowSec: 900 },
  /** 선택 동의 철회 — 초대별. 철회는 기간이 끝나도 되는 동작이라 따로 묶는다 */
  withdraw: { limit: 10, windowSec: 600 },
  /** 동의 쓰기 — 초대별. 답을 뒤집을 때마다 동의 줄 · 감사 줄이 쌓여서 묶는다. 보통은 한두 번이다 */
  consent: { limit: 20, windowSec: 600 },
  /** 초안 저장 — 초대별. 나이 답을 뒤집으면 감사 줄이 쌓여서 묶는다. 화면은 단계마다 한 번 부른다 */
  draft: { limit: 60, windowSec: 600 },
} as const satisfies Record<string, RateRule>;

export type RateScope = keyof typeof INTAKE_RATE_RULES;

export function hashRateSubject(subject: string, salt: string = process.env.SESSION_SECRET ?? ''): string {
  return createHash('sha256').update(`${salt}|${subject}`).digest('hex').slice(0, 40);
}

/** 프록시 머리에서 주소를 꺼낸다 — 맨 앞 주소(Vercel 이 채운다). 없으면 'unknown' */
export function clientAddress(headers: { get(name: string): string | null }): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || 'unknown';
}

export type RateResult = { allowed: boolean; remaining: number; retryAfterSec: number };

/** 한 번 센다. 한도 안이면 allowed */
export async function hitRateLimit(
  db: PrismaClient,
  input: { scope: RateScope; subject: string; rule?: RateRule; now?: Date; salt?: string },
): Promise<RateResult> {
  const rule = input.rule ?? INTAKE_RATE_RULES[input.scope];
  const now = input.now ?? new Date();
  const windowMs = rule.windowSec * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${input.scope}:${hashRateSubject(input.subject, input.salt)}`;
  const row = await db.intakeRateLimit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  return {
    allowed: row.count <= rule.limit,
    remaining: Math.max(0, rule.limit - row.count),
    retryAfterSec: Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000),
  };
}

/** 센 것을 하나 돌려준다 — 대조 전에 잡아 둔 자리가 맞는 코드로 끝났을 때 부른다 */
export async function refundRateLimit(db: PrismaClient, input: { scope: RateScope; subject: string; rule?: RateRule; now?: Date; salt?: string }): Promise<void> {
  const rule = input.rule ?? INTAKE_RATE_RULES[input.scope];
  const now = input.now ?? new Date();
  const windowMs = rule.windowSec * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${input.scope}:${hashRateSubject(input.subject, input.salt)}`;
  await db.intakeRateLimit.updateMany({ where: { key, windowStart, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
}

/** 넘었으면 던진다 */
export async function enforceRateLimit(db: PrismaClient, input: Parameters<typeof hitRateLimit>[1]): Promise<void> {
  const r = await hitRateLimit(db, input);
  if (!r.allowed) throw new IntakeError('rate_limited', { retryAfterSec: r.retryAfterSec });
}

/** 지난 창을 지운다 — 정리 작업이 부른다 */
export async function pruneRateLimits(db: PrismaClient, now: Date = new Date()): Promise<number> {
  const r = await db.intakeRateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 86_400_000) } } });
  return r.count;
}
