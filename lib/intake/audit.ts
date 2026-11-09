/**
 * 감사 기록 — 덧붙이기만 한다. 토큰 · 서명 주소 · 코드가 detail 로 새어 들어오지 않게 칸 이름으로 거른다.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export type AuditDb = Pick<PrismaClient, 'intakeAudit'> | Prisma.TransactionClient;

export type AuditActor = { kind: 'admin'; id: string } | { kind: 'invitee' } | { kind: 'system' };

export type AuditEntry = {
  actor: AuditActor;
  action: string;
  submissionId?: string | null;
  invitationId?: string | null;
  detail?: Record<string, unknown>;
};

const SECRET_KEY = /token|signature|secret|password|code$|url|authorization|apikey/i;

/** 비밀이 아닌 코드 칸 — 'code$' 에 걸려도 그대로 둔다(접수 번호 · 막힌 까닭) */
const PLAIN_CODE_KEYS = new Set(['receiptCode', 'rejectCode', 'failureCode']);

/** 비밀일 수 있는 칸을 뺀다. receiptCode 처럼 공개해도 되는 번호는 그대로 둔다 */
export function cleanAuditDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (PLAIN_CODE_KEYS.has(k)) out[k] = v;
    else if (SECRET_KEY.test(k)) out[k] = '[빼 둠]';
    else if (typeof v === 'bigint') out[k] = Number(v);
    else if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out;
}

/** 남긴 줄의 번호를 돌려준다 — 검토 완료처럼 뒤에서 그 줄을 가리켜야 하는 기록이 쓴다 */
export async function writeAudit(db: AuditDb, entry: AuditEntry, now: Date = new Date()): Promise<string> {
  const row = await db.intakeAudit.create({
    data: {
      submissionId: entry.submissionId ?? null,
      invitationId: entry.invitationId ?? null,
      actorKind: entry.actor.kind,
      actorId: entry.actor.kind === 'admin' ? entry.actor.id : null,
      action: entry.action,
      detail: entry.detail ? (cleanAuditDetail(entry.detail) as Prisma.InputJsonValue) : undefined,
      createdAt: now,
    },
    select: { id: true },
  });
  return row.id;
}
