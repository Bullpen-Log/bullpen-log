/**
 * 공개 — 특정 성공 실행에 묶인다. 재분석은 공개를 안 바꾸고, 관리자가 그 실행을 눌러야만 바뀐다.
 *
 * ── 약속 ──────────────────────────────
 * - publishRun · unpublish 는 권한을 보지 않는다. 라우트 · 서버 동작이 먼저 can(role, 'intake') 를 본다.
 * - 한 접수에 공개는 하나다(activeFor 유일). 다른 실행을 공개하면 앞 공개를 닫고 새 판 번호를 준다. 옛 줄은 지우지 않는다.
 * - 같은 실행 · 같은 설명을 다시 누르면 있던 공개를 돌려준다(created false).
 * - 공개 · 내리기는 화면이 알던 공개(expectedActivePublicationId, 없으면 null)를 잠금 안에서 맞춰 본다. 다르면 stale_publication —
 *   낡은 화면이 다른 관리자의 공개를 말없이 바꾸지 않게. 담당자의 비교 후 교체와 같은 규칙이다.
 * - 공개할 실행은 지금 판과 같은 입력(두 원본 + 손)이어야 한다. 영상이나 손을 바꾼 고침 앞의 실행을 공개하려면 allowOlderRevision 을 분명히 넘긴다.
 * - 공개는 시계를 다시 돌린다. 그 실행의 판이나 지금 판의 원본을 지우는 중이면 막는다('purge_in_progress') — 시계가 돈 채 그 원본이 지워지지 않게. 다 지운 뒤에는 결과 JSON 으로 공개할 수 있다.
 * - 고침 뒤 새 판이 와도 공개는 안 바뀐다. 결과 · 설명은 승인한 판 그대로다.
 * - 공개 칸의 선수 이름만은 지금 판에서 읽는다. 이름은 승인한 분석 내용이 아니라 신원 표시이고, 관리자가 고침을 요청해 받은 값이다.
 *   묶인 판의 이름을 쓰면 오타 하나를 고치려고 재공개(실행 판에 따라서는 GPU 재실행)가 필요했다.
 *
 * 공개 데이터 경계는 loadPublicResult 하나다. 결과 내용은 lib/intake/public-result.ts 의 허용 칸만 나간다.
 */
import type { PrismaClient } from '@prisma/client';
import { assertInvitationAllows, openIntakeScope, verifyResultAccess, type IntakeScope } from '@/lib/intake/access';
import { appIntakeRuntime, carryInTx, IntakeAnalysisError, readSucceededResult, runMatchesCurrent, type IntakeRuntime } from '@/lib/intake/analysis';
import { writeAudit } from '@/lib/intake/audit';
import { IntakeError, isIntakeError } from '@/lib/intake/errors';
import { isIntakeId, seoulDateKey } from '@/lib/intake/paths';
import { PUBLIC_RESPONSE_HEADERS } from '@/lib/intake/public-api';
import { toPublicResult, type PublicResult } from '@/lib/intake/public-result';
import { clientAddress, enforceRateLimit } from '@/lib/intake/rate-limit';
import type { IntakeRunStorage } from '@/lib/intake/storage-core';

const MAX_EXPLANATION_CHARS = 2000;

/** 줄바꿈은 지키고 그 밖의 제어 글자는 뺀다 */
function cleanExplanation(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw new IntakeError('invalid_input', { field: 'explanation' });
  const text = raw.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[^\P{C}\n]/gu, '').trim();
  if ([...text].length > MAX_EXPLANATION_CHARS) throw new IntakeError('invalid_input', { field: 'explanation' });
  return text || null;
}

export type PublishInput = {
  runId: string;
  adminId: string;
  explanation?: string | null;
  /** 화면이 알던 지금 공개 번호 — 공개가 없으면 null. 그사이 바뀌었으면 막는다 */
  expectedActivePublicationId: string | null;
  /** 지금 판과 다른 입력(영상 · 손)의 실행을 일부러 공개한다 */
  allowOlderRevision?: boolean;
  /** 화면이 보던 접수 — 넘기면 이 실행이 그 접수의 것인지도 본다 */
  submissionId?: string;
};
export type PublishResult = { publicationId: string; number: number; runId: string; created: boolean; replacedRunId: string | null };

type PublishRuntime = Pick<IntakeRuntime, 'db' | 'storage' | 'now'>;
const runtime = async (rt?: PublishRuntime): Promise<PublishRuntime> => rt ?? appIntakeRuntime();
const clock = (rt: PublishRuntime) => rt.now?.() ?? new Date();

/** 화면이 알던 공개 — 비워 두면 맞춰 볼 수 없어 받지 않는다(옛 화면이 말없이 지나가지 않게) */
function mustExpected(v: string | null | undefined): asserts v is string | null {
  if (v !== null && !isIntakeId(v)) throw new IntakeError('invalid_input', { field: 'expectedActivePublicationId' });
}

/** 이 실행을 공개한다. 결과 파일을 다시 읽어 모양 · 해시가 맞을 때만 공개한다 */
export async function publishRun(input: PublishInput, rt?: PublishRuntime): Promise<PublishResult> {
  if (!isIntakeId(input.runId)) throw new IntakeError('run_not_found');
  mustExpected(input.expectedActivePublicationId);
  const { db, storage, now: nowFn } = await runtime(rt);
  const now = nowFn?.() ?? new Date();
  const explanation = cleanExplanation(input.explanation);

  const found = await db.intakeAnalysisRun.findUnique({ where: { id: input.runId } });
  if (!found || (input.submissionId !== undefined && found.submissionId !== input.submissionId)) throw new IntakeError('run_not_found');
  /* 파일 읽기는 트랜잭션 밖에서 — 저장소를 기다리며 줄을 잠그지 않는다. 끝난 실행은 안 바뀌어 다시 볼 것이 없다 */
  if (!(await readSucceededResult(storage, found))) throw new IntakeError('run_not_publishable');

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${found.submissionId} FOR UPDATE`;
    const sub = await tx.intakeSubmission.findUniqueOrThrow({ where: { id: found.submissionId }, include: { invitation: true } });
    if (sub.invitation.status !== 'active') throw new IntakeError('invitation_revoked');
    if (sub.status === 'withdrawn') throw new IntakeError('result_unavailable');

    const active = await tx.intakePublication.findUnique({ where: { activeFor: sub.id } });
    /* 두 번 누름 — 이미 그대로면 바꿀 것이 없어서 맞춰 보지 않아도 된다 */
    if (active && active.runId === found.id && active.explanation === explanation) {
      return { publicationId: active.id, number: active.number, runId: found.id, created: false, replacedRunId: null };
    }
    if ((active?.id ?? null) !== input.expectedActivePublicationId) throw new IntakeAnalysisError('stale_publication', { currentPublicationId: active?.id ?? null });

    const runRevision = await tx.intakeRevision.findUniqueOrThrow({ where: { id: found.revisionId } });
    const currentRevision = sub.currentRevisionId ? await tx.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } }) : null;
    /* 표시도 같은 잠금 안에서 걸려 틈이 없다. 옛 실행을 공개해도 시계는 지금 판까지 같이 돌려서 지금 판도 본다 */
    const inputs = [runRevision.sideAssetId, runRevision.rearAssetId, ...(currentRevision ? [currentRevision.sideAssetId, currentRevision.rearAssetId] : [])];
    if ((await tx.intakeAsset.count({ where: { id: { in: inputs }, status: 'purging' } })) > 0) throw new IntakeError('purge_in_progress');
    const current = currentRevision != null && runMatchesCurrent(found, runRevision, sub, currentRevision);
    if (!current && !input.allowOlderRevision) throw new IntakeAnalysisError('run_not_current', { currentRevisionId: sub.currentRevisionId });

    if (active) {
      await tx.intakePublication.update({
        where: { id: active.id },
        data: { activeFor: null, unpublishedAt: now, unpublishedByAdminId: input.adminId },
      });
    }
    const last = await tx.intakePublication.findFirst({ where: { submissionId: sub.id }, orderBy: { number: 'desc' }, select: { number: true } });
    const number = (last?.number ?? 0) + 1;
    const pub = await tx.intakePublication.create({
      data: { submissionId: sub.id, runId: found.id, number, activeFor: sub.id, explanation, publishedByAdminId: input.adminId, publishedAt: now },
    });
    await tx.intakeSubmission.update({ where: { id: sub.id }, data: { publicationStatus: 'published' } });
    /* 글만 고친 판이 앞 판의 실행을 공개하는 길 — 등록 일감이 아직 안 이었으면 여기서 잇는다 */
    if (current) await carryInTx(tx, sub, currentRevision, now);
    await writeAudit(
      tx,
      { actor: { kind: 'admin', id: input.adminId }, action: 'publication.published', submissionId: sub.id, detail: { runId: found.id, number, replacedRunId: active?.runId ?? null, olderRevision: !current } },
      now,
    );
    return { publicationId: pub.id, number, runId: found.id, created: true, replacedRunId: active?.runId ?? null };
  });
}

/** 공개를 내린다 — 공개가 없으면 아무것도 안 한다. 실행과 결과 파일은 그대로 둔다 */
export async function unpublish(input: { submissionId: string; adminId: string; expectedActivePublicationId: string | null }, rt?: PublishRuntime): Promise<{ unpublished: boolean }> {
  if (!isIntakeId(input.submissionId)) throw new IntakeError('submission_not_found');
  mustExpected(input.expectedActivePublicationId);
  const r = await runtime(rt);
  const now = clock(r);
  return r.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${input.submissionId} FOR UPDATE`;
    const sub = await tx.intakeSubmission.findUnique({ where: { id: input.submissionId } });
    if (!sub) throw new IntakeError('submission_not_found');
    const active = await tx.intakePublication.findUnique({ where: { activeFor: sub.id } });
    if (!active) return { unpublished: false };
    /* 옛 판을 보고 내렸는데 그사이 새 판이 공개됐으면 그 판을 내리지 않는다 */
    if (active.id !== input.expectedActivePublicationId) throw new IntakeAnalysisError('stale_publication', { currentPublicationId: active.id });
    await tx.intakePublication.update({ where: { id: active.id }, data: { activeFor: null, unpublishedAt: now, unpublishedByAdminId: input.adminId } });
    await tx.intakeSubmission.update({ where: { id: sub.id }, data: { publicationStatus: 'unpublished' } });
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'publication.unpublished', submissionId: sub.id, detail: { runId: active.runId, number: active.number } }, now);
    return { unpublished: true };
  });
}

/**
 * 공개 결과를 읽는다 — 초대 범위 안의 지금 공개 판 하나만. 다른 접수 · 내부 메모 · 원본 주소는 여기로 들어오지 않는다.
 * 접근 코드가 걸려 있으면 틀린 시도를 초대마다 쌓고 감사 기록을 남긴다. 맞는 코드는 안 센다(access.ts verifyResultAccess).
 */
export async function loadPublicResult(
  scope: IntakeScope,
  input: { accessCode?: string | null } = {},
  rt?: { db: PrismaClient; storage: IntakeRunStorage; now?: () => Date },
): Promise<PublicResult> {
  const r = await runtime(rt);
  const now = clock(r);
  const sub = await r.db.intakeSubmission.findUnique({
    where: { id: scope.submissionId },
    include: { invitation: true, publications: { where: { activeFor: { not: null } }, include: { run: { include: { revision: { select: { athleteName: true } } } } } } },
  });
  if (!sub || sub.invitationId !== scope.invitationId) throw new IntakeError('submission_not_found');
  assertInvitationAllows(sub.invitation, 'view_result', now);
  if (sub.status === 'withdrawn') throw new IntakeError('result_unavailable');
  const pub = sub.publications[0];
  if (!pub) throw new IntakeError('result_not_published');
  const currentRevision = sub.currentRevisionId ? await r.db.intakeRevision.findUnique({ where: { id: sub.currentRevisionId }, select: { athleteName: true } }) : null;

  /* scope 를 넘겨 범위를 연 토큰을 맞춰 본다 — 범위를 연 바로 뒤 링크를 바꿨으면 코드 자리를 잡지도 결과를 내주지도 않는다 */
  await verifyResultAccess(r.db, { invitation: sub.invitation, submissionId: sub.id, code: input.accessCode, scope }, now);

  const result = await readSucceededResult(r.storage, pub.run);
  if (!result) throw new IntakeError('result_unavailable');
  return toPublicResult({
    version: pub.number,
    athleteName: currentRevision?.athleteName ?? pub.run.revision.athleteName,
    explanation: pub.explanation,
    resultDate: seoulDateKey(pub.publishedAt),
    result,
  });
}

const MAX_BODY_BYTES = 4 * 1024;

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...PUBLIC_RESPONSE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

/** 본문은 접근 코드 하나뿐이다 — 없거나 모양이 달라도 코드 없는 요청으로 본다 */
async function accessCodeOf(req: Request): Promise<string | null> {
  const text = await req.text().catch(() => '');
  if (!text || text.length > MAX_BODY_BYTES) return null;
  try {
    const body = JSON.parse(text) as { accessCode?: unknown } | null;
    return typeof body?.accessCode === 'string' ? body.accessCode : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/intake/public/result 의 몸체. 라우트와 시험이 같은 것을 부른다. 응답 모양은 다른 공개 API 와 같다 — 성공은 { result }, 실패는 { error: { code, message, detail } }.
 * 토큰은 Authorization 머리로만 받는다. 접근 코드는 본문으로 받아 주소 · 기록에 남지 않게 한다. detail 은 기다릴 시간만 내보낸다.
 */
export async function handlePublicResultRequest(req: Request, rt?: { db: PrismaClient; storage: IntakeRunStorage; now?: () => Date }): Promise<Response> {
  try {
    const r = await runtime(rt);
    const now = clock(r);
    const address = clientAddress(req.headers);
    await enforceRateLimit(r.db, { scope: 'public', subject: address, now });
    let scope: IntakeScope;
    try {
      scope = await openIntakeScope(r.db, req.headers.get('authorization'), 'view_result', now);
    } catch (e) {
      if (isIntakeError(e) && e.code === 'invitation_invalid') await enforceRateLimit(r.db, { scope: 'invalid_token', subject: address, now });
      throw e;
    }
    return reply(200, { result: await loadPublicResult(scope, { accessCode: await accessCodeOf(req) }, r) });
  } catch (e) {
    if (isIntakeError(e)) {
      const retryAfterSec = typeof e.detail?.retryAfterSec === 'number' ? e.detail.retryAfterSec : null;
      return reply(
        e.httpStatus,
        { error: { code: e.code, message: e.message, detail: retryAfterSec != null ? { retryAfterSec } : null } },
        retryAfterSec != null ? { 'Retry-After': String(retryAfterSec) } : {},
      );
    }
    console.error(`[intake public] result: ${e instanceof Error ? e.name : 'unknown'}`);
    return reply(500, { error: { code: 'internal', message: '잠시 뒤에 다시 시도해 주세요.', detail: null } });
  }
}
