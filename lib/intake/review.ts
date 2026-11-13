/**
 * 공개 전 검토 — 여는 것 · 검토 완료 · 공개가 그 기록을 서버에서 다시 맞춰 보는 규칙(INTAKE-MAIN/R01, 2026-11-10 05 발주).
 *
 * ── 약속 ──────────────────────────────
 * - 검토를 '연 것'(run.review_opened)과 '검토 완료'(run.review_acknowledged)는 다르다. 공개는 검토 완료만 받는다. 예전의 run.reviewed 감사도 검토 완료가 아니다.
 * - 검토 완료는 공개하는 관리자 본인 것이어야 한다(다른 관리자의 확인으로 공개하지 않는다 — 05 확정).
 * - 묶음(ReviewBinding)은 서버가 정한 값이다: 계약 판 · 초대 · 접수 · 실행 · 실행 판 · 지금 판 · 결과 해시 · 실행 입력 · 지금 입력 · 공개 세대
 *   + 바뀜 표시(접수 판 번호 · 손 바꿈 횟수 · 실행 수와 마지막 실행). 바뀜 표시는 늘기만 해서 손 R→L→R 처럼 값이 되돌아와도 '그사이 바뀜'을 가린다.
 * - 여는 것도 그때의 묶음을 남긴다. 검토 완료는 그 관리자가 그 실행을 가장 최근에 연 묶음이 지금 묶음과 같을 때만 남는다 — 화면이 본 것과 서버가 묶는 것이 같게.
 *   다르면 stale_review(reason 'reopen') — 다시 열어 보고 누른다.
 * - 화면이 보낸 값(결과 해시 · 지금 판)은 서버 값과 맞춰 볼 뿐 그대로 믿지 않는다. 번호를 안다고 권한이 생기지 않는다.
 * - 같은 묶음의 검토 완료를 두 번 누르면 있던 기록을 돌려준다(줄이 늘지 않는다).
 * - 어느 하나라도 바뀌면(새 판 · 손 바꿈 · 고침 · 새 분석 · 철회 · 회수 · 내리기 · 다른 공개 · 결과 해시 다름) 그 검토 완료로는 새 공개를 못 만든다(stale_review).
 *   글만 고친 판은 분석을 다시 돌리지 않고 다시 검토만 하면 된다.
 * - 같은 공개의 응답을 잃고 다시 누른 것만, 그 공개를 만든 기록이 같은 검토 완료를 가리킬 때 쓰기 없이 돌려준다(05 확정).
 * - 저장소 읽기는 잠금 밖에서 하고, 잠금 안에서 실행 줄을 다시 읽어 그때 읽은 결과(상태 · 경로 · 해시)와 같은지 본다.
 * - 이 파일은 권한을 보지 않는다. 서버 동작(app/actions/intake-admin.ts asAdmin)이 부를 때마다 대표관리자인지 본다.
 * - 사람이 실제로 화면을 봤는지는 기술로 증명하지 않는다. 남는 것은 검토자의 명시적인 진술과 그 대상이다.
 */
import type { IntakeAnalysisRun, IntakeInvitation, IntakeRevision, IntakeSubmission, Prisma } from '@prisma/client';
import { appIntakeRuntime, currentInputOf, IntakeAnalysisError, loadRunResult, metaOf, readSucceededResult, runInputOf, type IntakeRuntime, type RunInput } from '@/lib/intake/analysis';
import { writeAudit } from '@/lib/intake/audit';
import { IntakeError } from '@/lib/intake/errors';
import { isIntakeId } from '@/lib/intake/paths';
import { toPublicView, type PublicPitchView } from '@/lib/intake/public-result';

/** 묶음의 판 — 묶는 칸이 바뀌면 올린다. 다른 판의 기록은 공개에 안 쓴다 */
export const REVIEW_CONTRACT = 'intake-review/2';
export const REVIEW_OPENED_ACTION = 'run.review_opened';
export const REVIEW_ACK_ACTION = 'run.review_acknowledged';
/** 손 바꿈 감사 — 바뀜 표시로 센다 */
const HAND_SET_ACTION = 'analysis.hand_set';

const SHA256 = /^[0-9a-f]{64}$/;

type Tx = Prisma.TransactionClient;
type ReviewRuntime = Pick<IntakeRuntime, 'db' | 'storage' | 'now'>;

/** 공개 세대 — 마지막 공개 번호(없으면 0)와 지금 공개 번호(없으면 null). 공개 · 내리기 · 바꿔 공개 어느 것이든 둘 중 하나가 바뀐다 */
export type PublicationGeneration = { lastNumber: number; activeId: string | null };
/** 바뀜 표시 — 늘기만 하는 값들. 접수 판 번호(받는 사람 초안 · 고침 · 철회가 올린다) · 손 바꿈 횟수 · 실행 수와 마지막 실행 */
export type ChangeMarks = { submissionVersion: number; handSets: number; runCount: number; latestRunId: string | null };

/** 검토 완료가 묶이는 것 — 모두 서버가 읽은 값이다 */
export type ReviewBinding = {
  contract: typeof REVIEW_CONTRACT;
  explicit: true;
  invitationId: string;
  runId: string;
  runRevisionId: string;
  currentRevisionId: string | null;
  resultSha256: string;
  runInput: RunInput;
  currentInput: RunInput | null;
  generation: PublicationGeneration;
  marks: ChangeMarks;
};

type SubRow = Pick<IntakeSubmission, 'id' | 'invitationId' | 'currentRevisionId' | 'throwingHand' | 'status' | 'version'> & { invitation: Pick<IntakeInvitation, 'status'> };
type ReadDb = Tx;

/** 접수 줄을 잠근 뒤에 부르면 그사이 안 바뀐다(공개 · 내리기 · 새 판 · 손 바꿈 · 철회 · 새 분석이 같은 줄을 잠근다) */
export async function publicationGeneration(tx: ReadDb, submissionId: string): Promise<PublicationGeneration> {
  const [last, active] = await Promise.all([
    tx.intakePublication.findFirst({ where: { submissionId }, orderBy: { number: 'desc' }, select: { number: true } }),
    tx.intakePublication.findUnique({ where: { activeFor: submissionId }, select: { id: true } }),
  ]);
  return { lastNumber: last?.number ?? 0, activeId: active?.id ?? null };
}

async function changeMarks(tx: ReadDb, sub: Pick<IntakeSubmission, 'id' | 'version'>): Promise<ChangeMarks> {
  const [handSets, runCount, latest] = await Promise.all([
    tx.intakeAudit.count({ where: { submissionId: sub.id, action: HAND_SET_ACTION } }),
    tx.intakeAnalysisRun.count({ where: { submissionId: sub.id } }),
    tx.intakeAnalysisRun.findFirst({ where: { submissionId: sub.id }, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], select: { id: true } }),
  ]);
  return { submissionVersion: sub.version, handSets, runCount, latestRunId: latest?.id ?? null };
}

/** 지금 상태로 본 검토 대상 */
export async function currentReviewBinding(tx: ReadDb, sub: SubRow, run: Pick<IntakeAnalysisRun, 'id' | 'revisionId' | 'resultMeta'>): Promise<ReviewBinding> {
  const ids = [run.revisionId, ...(sub.currentRevisionId && sub.currentRevisionId !== run.revisionId ? [sub.currentRevisionId] : [])];
  const revisions = await tx.intakeRevision.findMany({ where: { id: { in: ids } } });
  const runRevision = revisions.find((r) => r.id === run.revisionId);
  if (!runRevision) throw new IntakeError('run_not_found');
  const currentRevision: IntakeRevision | null = sub.currentRevisionId ? (revisions.find((r) => r.id === sub.currentRevisionId) ?? null) : null;
  return {
    contract: REVIEW_CONTRACT,
    explicit: true,
    invitationId: sub.invitationId,
    runId: run.id,
    runRevisionId: run.revisionId,
    currentRevisionId: sub.currentRevisionId,
    resultSha256: metaOf(run).sha256 ?? '',
    runInput: runInputOf(run, runRevision),
    currentInput: currentInputOf(sub, currentRevision),
    generation: await publicationGeneration(tx, sub.id),
    marks: await changeMarks(tx, sub),
  };
}

const sameInput = (a: unknown, b: RunInput | null): boolean => {
  if (b === null) return a === null;
  if (!a || typeof a !== 'object') return false;
  const x = a as Record<string, unknown>;
  return x.side === b.side && x.rear === b.rear && x.hand === b.hand;
};

/** 기록된 묶음이 지금 묶음과 같은가 — 칸 하나라도 다르면 아니다. 모양이 다른(예전 판 · 손댄) 기록도 아니다 */
export function bindingMatches(stored: unknown, now: ReviewBinding): boolean {
  if (!stored || typeof stored !== 'object') return false;
  const d = stored as Record<string, unknown>;
  const g = d.generation as Record<string, unknown> | null | undefined;
  const m = d.marks as Record<string, unknown> | null | undefined;
  return (
    d.contract === now.contract &&
    d.explicit === true &&
    d.invitationId === now.invitationId &&
    d.runId === now.runId &&
    d.runRevisionId === now.runRevisionId &&
    (d.currentRevisionId ?? null) === now.currentRevisionId &&
    typeof d.resultSha256 === 'string' &&
    SHA256.test(d.resultSha256) &&
    d.resultSha256 === now.resultSha256 &&
    sameInput(d.runInput, now.runInput) &&
    sameInput(d.currentInput ?? null, now.currentInput) &&
    !!g &&
    g.lastNumber === now.generation.lastNumber &&
    (g.activeId ?? null) === now.generation.activeId &&
    !!m &&
    m.submissionVersion === now.marks.submissionVersion &&
    m.handSets === now.marks.handSets &&
    m.runCount === now.marks.runCount &&
    (m.latestRunId ?? null) === now.marks.latestRunId
  );
}

/** 잠금 밖에서 읽은 실행과 잠금 안에서 다시 읽은 실행이 같은 결과를 가리키나 */
export const sameResult = (a: Pick<IntakeAnalysisRun, 'status' | 'resultPath' | 'resultMeta'>, b: Pick<IntakeAnalysisRun, 'status' | 'resultPath' | 'resultMeta'>) =>
  a.status === b.status && a.resultPath === b.resultPath && (metaOf(a).sha256 ?? null) === (metaOf(b).sha256 ?? null);

/* ────────────────────────────── 열기 ────────────────────────────── */

/** 관리자 3D 검토에 실어 보내는 것 — 받는 사람이 볼 칸과, 서버가 확인한 검토 대상(결과 해시 · 지금 판) */
export type RunReviewView = {
  view: PublicPitchView;
  athleteName: string;
  revisionNumber: number;
  isCurrentRevision: boolean;
  finishedAt: string | null;
  /** 서버가 결과 파일을 다시 읽어 맞춘 SHA-256 — 검토 완료(acknowledgeRunReview)가 그대로 돌려보낸다 */
  resultDigest: string;
  /** 이름을 읽은 지금 판 — 이름 표시도 검토 대상이다. 판이 바뀌면 다시 검토한다 */
  currentRevisionId: string | null;
};

/**
 * 관리자 3D 검토 열기 — 공개 전에 받는 사람이 볼 모양 그대로(toPublicView 의 허용 칸) 연다.
 * 접수 번호와 실행 번호를 같이 받아 그 접수의 실행인지 본다. 결과 파일의 해시 · 모양 검사는 loadRunResult 를 그대로 쓴다.
 * '열었다'(run.review_opened)와 그때의 묶음을 남길 뿐 검토 완료가 아니다. 이름은 공개 화면과 같은 규칙(지금 판 → 실행 판)으로 읽는다.
 * 권한은 부르는 쪽(관리자 동작)이 먼저 본다.
 */
export async function loadRunReview(input: { submissionId: string; runId: string; adminId: string }, rt?: IntakeRuntime): Promise<RunReviewView> {
  if (!isIntakeId(input.submissionId) || !isIntakeId(input.runId)) throw new IntakeError('run_not_found');
  const r = rt ?? (await appIntakeRuntime());
  const found = await r.db.intakeAnalysisRun.findFirst({ where: { id: input.runId, submissionId: input.submissionId }, include: { revision: { select: { number: true, athleteName: true } } } });
  if (!found) throw new IntakeError('run_not_found');
  const result = await loadRunResult(found.id, r);
  const sub = await r.db.intakeSubmission.findUniqueOrThrow({ where: { id: input.submissionId }, include: { invitation: { select: { status: true } } } });
  const binding = await currentReviewBinding(r.db as unknown as ReadDb, sub, found);
  const current = sub.currentRevisionId ? await r.db.intakeRevision.findUnique({ where: { id: sub.currentRevisionId }, select: { athleteName: true } }) : null;
  await writeAudit(
    r.db,
    {
      actor: { kind: 'admin', id: input.adminId },
      action: REVIEW_OPENED_ACTION,
      submissionId: sub.id,
      detail: { runId: found.id, resultSha256: binding.resultSha256, currentRevisionId: binding.currentRevisionId, binding: binding as unknown as Record<string, unknown> },
    },
    r.now?.() ?? new Date(),
  );
  return {
    view: toPublicView(result),
    athleteName: current?.athleteName ?? found.revision.athleteName ?? '',
    revisionNumber: found.revision.number,
    isCurrentRevision: binding.currentRevisionId === found.revisionId,
    finishedAt: found.finishedAt?.toISOString() ?? null,
    resultDigest: binding.resultSha256,
    currentRevisionId: binding.currentRevisionId,
  };
}

/* ────────────────────────────── 검토 완료 ────────────────────────────── */

export type AcknowledgeInput = {
  submissionId: string;
  runId: string;
  adminId: string;
  /** 검토 화면이 받은 결과 해시(loadRunReview 의 resultDigest) */
  resultDigest: string;
  /** 검토 화면이 이름을 읽은 지금 판(loadRunReview 의 currentRevisionId) */
  currentRevisionId: string | null;
};

const detailOf = (row: { detail: unknown } | null | undefined): Record<string, unknown> => (row?.detail && typeof row.detail === 'object' ? (row.detail as Record<string, unknown>) : {});

/**
 * 검토 완료 — 관리자가 결과 화면이 준비된 뒤 '이 결과 검토 완료'를 누른다.
 * 결과 파일은 잠금 밖에서 다시 읽어 해시를 맞추고, 잠금 안에서 실행 · 접수 · 초대 · 공개 세대 · 바뀜 표시를 다시 읽어 묶는다.
 * 그 관리자가 그 실행을 가장 최근에 연 묶음이 지금 묶음과 같아야 한다. 같은 묶음의 검토 완료가 이미 있으면 그 번호를 돌려준다. 돌려주는 번호는 감사 줄 번호다.
 */
export async function acknowledgeRunReview(input: AcknowledgeInput, rt?: ReviewRuntime): Promise<{ acknowledgementId: string }> {
  if (!isIntakeId(input.submissionId) || !isIntakeId(input.runId)) throw new IntakeError('run_not_found');
  if (typeof input.resultDigest !== 'string' || !SHA256.test(input.resultDigest)) throw new IntakeError('invalid_input', { field: 'resultDigest' });
  if (input.currentRevisionId !== null && !isIntakeId(input.currentRevisionId)) throw new IntakeError('invalid_input', { field: 'currentRevisionId' });
  const { db, storage, now: nowFn } = rt ?? (await appIntakeRuntime());
  const now = nowFn?.() ?? new Date();

  const found = await db.intakeAnalysisRun.findFirst({ where: { id: input.runId, submissionId: input.submissionId } });
  if (!found) throw new IntakeError('run_not_found');
  /* 저장소 읽기는 잠금 밖 — 결과 파일의 해시 · 모양이 실행 줄과 맞아야 한다 */
  if (!(await readSucceededResult(storage, found))) throw new IntakeError('run_not_publishable');
  if (metaOf(found).sha256 !== input.resultDigest) throw new IntakeAnalysisError('stale_review', { reason: 'result' });

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${found.submissionId} FOR UPDATE`;
    const sub = await tx.intakeSubmission.findUniqueOrThrow({ where: { id: found.submissionId }, include: { invitation: { select: { status: true } } } });
    if (sub.invitation.status !== 'active') throw new IntakeError('invitation_revoked');
    if (sub.status === 'withdrawn') throw new IntakeError('result_unavailable');
    const run = await tx.intakeAnalysisRun.findUniqueOrThrow({ where: { id: found.id } });
    if (!sameResult(found, run)) throw new IntakeAnalysisError('stale_review', { reason: 'result' });
    if (sub.currentRevisionId !== input.currentRevisionId) throw new IntakeAnalysisError('stale_review', { reason: 'revision' });

    const binding = await currentReviewBinding(tx, sub, run);
    /* 이 관리자가 이 실행을 지금 묶음 그대로 연 적이 있어야 한다 — 화면이 본 것을 묶는다.
       바뀜 표시가 늘기만 해서 예전 상태에서 연 기록은 값이 되돌아와도 맞지 않는다(시각 순서에 기대지 않는다) */
    const opened = await tx.intakeAudit.findMany({
      where: { submissionId: sub.id, action: REVIEW_OPENED_ACTION, actorKind: 'admin', actorId: input.adminId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { detail: true },
    });
    const ofRun = opened.map(detailOf).filter((d) => d.runId === run.id);
    if (ofRun.length === 0) throw new IntakeAnalysisError('review_required', { reason: 'not_opened' });
    const sawIt = ofRun.some((d) => d.resultSha256 === input.resultDigest && (d.currentRevisionId ?? null) === input.currentRevisionId && bindingMatches(d.binding, binding));
    if (!sawIt) throw new IntakeAnalysisError('stale_review', { reason: 'reopen' });

    /* 같은 묶음을 두 번 눌렀으면 있던 기록 */
    const prior = await tx.intakeAudit.findMany({
      where: { submissionId: sub.id, action: REVIEW_ACK_ACTION, actorKind: 'admin', actorId: input.adminId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, detail: true },
    });
    const same = prior.find((p) => bindingMatches(p.detail, binding));
    if (same) return { acknowledgementId: same.id };

    const acknowledgementId = await writeAudit(
      tx,
      { actor: { kind: 'admin', id: input.adminId }, action: REVIEW_ACK_ACTION, submissionId: sub.id, invitationId: sub.invitationId, detail: binding as unknown as Record<string, unknown> },
      now,
    );
    return { acknowledgementId };
  });
}

/* ────────────────────────────── 공개가 부르는 것 ────────────────────────────── */

/** 공개가 받는 검토 완료 기록을 읽는다 — 다른 접수 · 다른 동작 · 다른 사람의 기록이면 없는 것과 같다 */
export async function readAcknowledgement(tx: Tx, input: { acknowledgementId: string | null | undefined; submissionId: string; adminId: string }): Promise<{ id: string; detail: unknown } | null> {
  if (!input.acknowledgementId || !isIntakeId(input.acknowledgementId)) return null;
  const row = await tx.intakeAudit.findUnique({ where: { id: input.acknowledgementId } });
  if (!row || row.submissionId !== input.submissionId || row.action !== REVIEW_ACK_ACTION || row.actorKind !== 'admin' || row.actorId !== input.adminId) return null;
  return { id: row.id, detail: row.detail };
}

/**
 * 공개 트랜잭션 안에서 — 접수 줄을 잠근 뒤 부른다. 지금 묶음과 맞는 검토 완료가 없으면 던진다.
 * 기록이 없거나 이 공개자 것이 아니면 review_required, 있지만 그사이 무엇이 바뀌었으면 stale_review.
 */
export async function assertReviewAcknowledged(
  tx: Tx,
  input: { acknowledgementId: string | null | undefined; adminId: string; sub: SubRow; run: Pick<IntakeAnalysisRun, 'id' | 'revisionId' | 'resultMeta'> },
): Promise<string> {
  const ack = await readAcknowledgement(tx, { acknowledgementId: input.acknowledgementId, submissionId: input.sub.id, adminId: input.adminId });
  if (!ack) throw new IntakeAnalysisError('review_required');
  if (!bindingMatches(ack.detail, await currentReviewBinding(tx, input.sub, input.run))) throw new IntakeAnalysisError('stale_review', { reason: 'changed' });
  return ack.id;
}

/** 지금 공개를 만든 공개 기록이 이 검토 완료를 가리키나 — 같은 공개의 응답 유실을 가리는 데만 쓴다 */
export async function publicationUsedAcknowledgement(tx: Tx, input: { submissionId: string; publicationId: string; acknowledgementId: string | null | undefined; adminId: string }): Promise<boolean> {
  if (!input.acknowledgementId || !isIntakeId(input.acknowledgementId)) return false;
  const rows = await tx.intakeAudit.findMany({
    where: { submissionId: input.submissionId, action: 'publication.published', actorKind: 'admin', actorId: input.adminId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { detail: true },
  });
  return rows.some((r) => {
    const d = detailOf(r);
    return d.publicationId === input.publicationId && d.acknowledgementId === input.acknowledgementId;
  });
}
