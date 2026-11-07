/**
 * 초대 권한. 초대는 관리자 세션이 아니고 로그인도 아니다 — 자기 접수 하나에만, 작업마다 다시 본다.
 * 토큰은 Authorization 머리로만 받는다. 없는 토큰 · 모양이 틀린 토큰은 구별 없이 같은 오류다.
 */
import type { IntakeInvitation, Prisma, PrismaClient } from '@prisma/client';
import { writeAudit } from '@/lib/intake/audit';
import { IntakeError } from '@/lib/intake/errors';
import { hitRateLimit, refundRateLimit } from '@/lib/intake/rate-limit';
import { hashInvitationToken, parseIntakeAuthorization, verifyAccessCode } from '@/lib/intake/token';

/**
 * read 상태 보기 · edit 초안 고치기 · upload 새 전송 · confirm 이미 시작한 전송의 도착 확인 · view_result 결과 보기.
 * confirm 은 '새 올리기'가 아니라서 올리기 기간이 지나도 된다(기간 끝에 전송을 마친 사람의 바이트가 고아가 되지 않게). 폐기되면 모두 막힌다.
 * 완료는 범위 op 가 없다 — 기간이 지나도 도착한 짝은 끝낼 수 있어서 finalizeSubmission 이 잠근 채 판단한다.
 */
export type IntakeOp = 'read' | 'edit' | 'upload' | 'confirm' | 'view_result';

/** 공개 요청 하나의 범위 — service.ts 의 공개 함수는 모두 이것을 받는다. 관리자 함수에는 넘기지 않는다 */
export type IntakeScope = { invitationId: string; submissionId: string };

type InvitationGate = Pick<IntakeInvitation, 'status' | 'uploadExpiresAt' | 'resultExpiresAt'>;

/** 이 초대가 이 작업을 지금 해도 되나 — 안 되면 던진다 */
export function assertInvitationAllows(inv: InvitationGate, op: IntakeOp, now: Date): void {
  if (inv.status !== 'active') throw new IntakeError('invitation_revoked');
  if ((op === 'edit' || op === 'upload') && inv.uploadExpiresAt.getTime() <= now.getTime()) {
    throw new IntakeError('upload_expired');
  }
  if (op === 'view_result' && inv.resultExpiresAt && inv.resultExpiresAt.getTime() <= now.getTime()) {
    throw new IntakeError('result_expired');
  }
}

export const uploadExpired = (inv: Pick<IntakeInvitation, 'uploadExpiresAt'>, now: Date) => inv.uploadExpiresAt.getTime() <= now.getTime();
export const resultExpired = (inv: Pick<IntakeInvitation, 'resultExpiresAt'>, now: Date) =>
  inv.resultExpiresAt != null && inv.resultExpiresAt.getTime() <= now.getTime();

/**
 * 머리 → 범위. 라우트 맨 앞에서 부른다. 읽기만 하고 아무것도 바꾸지 않는다(링크 미리보기가 초대를 쓰지 못한다).
 * 폐기 · 만료는 op 로 판단한다 — 'read' 는 폐기만 막아, 만료된 사람에게 왜 안 되는지 보일 수 있다.
 */
export async function openIntakeScope(
  db: PrismaClient,
  authorization: string | null | undefined,
  op: IntakeOp,
  now: Date = new Date(),
): Promise<IntakeScope> {
  const token = parseIntakeAuthorization(authorization);
  if (!token) throw new IntakeError('invitation_invalid');
  const inv = await db.intakeInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { submission: { select: { id: true } } },
  });
  if (!inv?.submission) throw new IntakeError('invitation_invalid');
  assertInvitationAllows(inv, op, now);
  return { invitationId: inv.id, submissionId: inv.submission.id };
}

/** 트랜잭션 안에서 범위를 다시 본다 — 그사이 폐기됐으면 막는다 */
export async function recheckScope(tx: Prisma.TransactionClient, scope: IntakeScope, op: IntakeOp, now: Date): Promise<IntakeInvitation> {
  const inv = await tx.intakeInvitation.findUnique({ where: { id: scope.invitationId } });
  if (!inv) throw new IntakeError('invitation_invalid');
  assertInvitationAllows(inv, op, now);
  return inv;
}

/** 틀린 코드 누적 한도 — 넘으면 관리자가 풀 때까지 결과 보기를 잠근다. 창마다의 제한(rate-limit 'code')만으로는 며칠이면 짧은 코드가 뚫린다 */
export const ACCESS_CODE_MAX_FAILURES = 10;
/** 자리를 쥔 채 대조하는 시간의 상한 — 함수 하나의 수명보다 길다. 이보다 오래된 마지막 자리는 쥔 쪽이 죽은 것이다 */
export const ACCESS_CODE_HOLD_STALE_MS = 2 * 60_000;

type CodeGate = Pick<IntakeInvitation, 'accessCodeHash'> & { accessCodeLockedAt?: Date | null };

/**
 * 시도 자리를 잡는다 — 코드를 대조하기 전에 DB 가 한 번에 센다. 읽고 나서 세면 동시에 보낸 틀린 코드가 모두 낡은 값을 보고 한도를 넘는다.
 * 잡은 자리의 번호(누적 틀린 횟수에 이 시도를 더한 값)를 돌려준다. 맞는 코드면 releaseCodeAttempt 로 돌려준다.
 */
async function holdCodeAttempt(db: PrismaClient, invitationId: string, submissionId: string, now: Date): Promise<number> {
  const window = await hitRateLimit(db, { scope: 'code', subject: invitationId, now });
  if (!window.allowed) throw new IntakeError('rate_limited', { retryAfterSec: window.retryAfterSec });
  const rows = await db.$queryRaw<{ accessCodeFailures: number }[]>`
    UPDATE "IntakeInvitation" SET "accessCodeFailures" = "accessCodeFailures" + 1, "updatedAt" = ${now}
    WHERE "id" = ${invitationId} AND "accessCodeLockedAt" IS NULL AND "accessCodeFailures" < ${ACCESS_CODE_MAX_FAILURES}
    RETURNING "accessCodeFailures"`;
  if (rows[0]) return rows[0].accessCodeFailures;
  await refundRateLimit(db, { scope: 'code', subject: invitationId, now });
  const inv = await db.intakeInvitation.findUnique({ where: { id: invitationId }, select: { accessCodeLockedAt: true } });
  if (inv?.accessCodeLockedAt) throw new IntakeError('access_code_locked');
  if (await lockAbandonedSeat(db, invitationId, submissionId, now)) throw new IntakeError('access_code_locked');
  /* 다른 시도가 마지막 자리를 쥐고 대조하는 중이다 — 그 결과에 따라 잠기거나 자리가 돌아온다 */
  throw new IntakeError('rate_limited', { retryAfterSec: 5 });
}

/**
 * 마지막 자리를 잡은 시도가 끝을 못 적고 죽었다 — 잠금도 돌려주기도 안 되어, 그대로 두면 맞는 코드까지 영영 '잠시 뒤에'만 듣는다.
 * 틀린 쪽으로 친다. 자리를 잡고 대조하는 동안에는 이 시간을 넘지 않아서, 살아 있는 시도의 결과를 앞지르지 않는다.
 */
async function lockAbandonedSeat(db: PrismaClient, invitationId: string, submissionId: string, now: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const moved = await tx.intakeInvitation.updateMany({
      where: { id: invitationId, accessCodeLockedAt: null, accessCodeFailures: { gte: ACCESS_CODE_MAX_FAILURES }, updatedAt: { lt: new Date(now.getTime() - ACCESS_CODE_HOLD_STALE_MS) } },
      data: { accessCodeLockedAt: now },
    });
    if (moved.count === 0) return false;
    await writeAudit(tx, { actor: { kind: 'system' }, action: 'access_code.locked', invitationId, submissionId, detail: { failures: ACCESS_CODE_MAX_FAILURES, abandoned: true } }, now);
    return true;
  });
}

/** 맞는 코드였다 — 잡은 자리를 돌려준다. 맞게 낸 사람의 시도는 안 센다 */
async function releaseCodeAttempt(db: PrismaClient, invitationId: string, now: Date): Promise<void> {
  await db.intakeInvitation.updateMany({ where: { id: invitationId, accessCodeFailures: { gt: 0 } }, data: { accessCodeFailures: { decrement: 1 } } });
  await refundRateLimit(db, { scope: 'code', subject: invitationId, now });
}

/** 틀린 코드였다 — 감사 기록을 남기고, 자리 번호가 한도에 닿았으면 잠근다. 잠갔으면 true */
async function recordWrongCode(db: PrismaClient, invitationId: string, submissionId: string, failures: number, now: Date): Promise<boolean> {
  const lock = failures >= ACCESS_CODE_MAX_FAILURES;
  return db.$transaction(async (tx) => {
    if (lock) await tx.intakeInvitation.updateMany({ where: { id: invitationId, accessCodeLockedAt: null }, data: { accessCodeLockedAt: now } });
    await writeAudit(tx, { actor: { kind: 'invitee' }, action: lock ? 'access_code.locked' : 'access_code.wrong', invitationId, submissionId, detail: { failures } }, now);
    return lock;
  });
}

/**
 * 공개 결과의 코드 관문 — 틀린 시도만 남는다(맞는 사람을 잠그지 않게). 자리 잡기 → 코드 대조 → 맞으면 돌려주기, 틀리면 감사 · 잠금 차례다.
 * 넘겨받은 초대 줄은 낡았을 수 있어서 판단은 자리 잡기가 DB 값으로 한다. 코드가 없는 초대는 그대로 지나간다.
 */
export async function verifyResultAccess(
  db: PrismaClient,
  input: { invitation: CodeGate & Pick<IntakeInvitation, 'id'>; submissionId: string; code: string | null | undefined },
  now: Date = new Date(),
): Promise<void> {
  const { invitation: inv, code } = input;
  if (!inv.accessCodeHash) return;
  if (inv.accessCodeLockedAt) throw new IntakeError('access_code_locked');
  if (!code) throw new IntakeError('access_code_required');
  const failures = await holdCodeAttempt(db, inv.id, input.submissionId, now);
  let right = false;
  try {
    right = await verifyAccessCode(code, inv.accessCodeHash);
  } catch (e) {
    await releaseCodeAttempt(db, inv.id, now);
    throw e;
  }
  if (right) return releaseCodeAttempt(db, inv.id, now);
  if (await recordWrongCode(db, inv.id, input.submissionId, failures, now)) throw new IntakeError('access_code_locked');
  throw new IntakeError('access_code_wrong');
}
