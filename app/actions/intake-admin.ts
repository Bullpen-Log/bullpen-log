'use server';

import { revalidatePath } from 'next/cache';
import type { PrismaClient } from '@prisma/client';
import { requirePermission } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { allowAdmin } from '@/lib/release-gate';
import {
  addIntakeNote,
  adminCancelCorrection,
  adminCreateInvitationLink,
  adminExtendUploadWindow,
  adminReissueInvitation,
  adminRequestCorrection,
  adminRequeueVerification,
  adminResetAccessCodeLock,
  adminRevokeInvitation,
  adminWithdrawConsent,
  adminWithdrawModelConsent,
  assignSubmission,
  deleteIntakeNote,
  issueOriginalLinks,
  issueRunPreviewLink,
  markIntakeRead,
  markIntakeUnread,
  type AdminCorrectionInput,
  type AdminInvitationInput,
  type IntakeActor,
  type OriginalLink,
  type OriginalPurpose,
} from '@/lib/intake/admin';
import { setAnalysisHand, startIntakeAnalysis } from '@/lib/intake/analysis';
import { isIntakeError } from '@/lib/intake/errors';
import { publishRun, unpublish } from '@/lib/intake/publication';
import type { IntakeView } from '@/lib/intake/state';
import { getIntakeStorage } from '@/lib/intake/storage';

/**
 * 외부 영상 접수 관리 동작 — 웹 관리 화면(app/(app)/admin/intake)만 부른다. 앱 RPC 표(registry)에는 넣지 않는다: 앱은 이 동작을 안 쓰고, 입구를 늘릴 까닭이 없다.
 * 서버 동작은 화면 밖에서도 POST 로 부를 수 있어 동작마다 권한을 본다 — 'intake'(대표관리자) 가 아니면 lib/dal.ts requirePermission 이 돌려보내고, 베타면 관문이 막는다.
 * lib/intake/admin.ts 가 한 번 더 본다.
 *
 * 실패는 { ok: false, code, message, detail } 로 돌려준다. 화면이 코드로 갈라 보고, 잠금 충돌이면 최신 내용을 다시 받는다.
 * 토큰 · 서명 주소는 이 응답에만 실리고 어디에도 기록하지 않는다.
 */
export type IntakeActionFailure = { ok: false; code: string; message: string; detail?: Record<string, unknown> };
export type IntakeActionResult<T extends object = object> = ({ ok: true } & T) | IntakeActionFailure;

const db = prisma as unknown as PrismaClient;

function revalidate(submissionId?: string) {
  revalidatePath('/admin/intake');
  if (submissionId) revalidatePath(`/admin/intake/${submissionId}`);
}

/**
 * 링크를 이미 저장한 뒤의 뒷일(읽음 표시 · 화면 새로 고침) — 실패해도 링크는 돌려준다.
 * 새 토큰은 저장됐고 예전 링크는 막혔다. 여기서 던지면 원문이 사라져 두 링크를 다 잃는다. 기록에는 오류 이름만 남긴다(토큰은 안 닿는다).
 */
async function afterIssued(work: () => unknown): Promise<void> {
  try {
    await work();
  } catch (e) {
    console.warn('[intake] 링크를 만든 뒤 정리 실패', e instanceof Error ? e.name : typeof e);
  }
}

/** 권한을 본 뒤 일을 하고, 아는 실패는 답으로 바꾼다. 돌려보내기 · 베타 막힘은 그대로 던진다 */
async function asAdmin<T extends object>(work: (actor: IntakeActor) => Promise<T>): Promise<IntakeActionResult<T>> {
  allowAdmin('intake');
  const user = await requirePermission('intake');
  try {
    return { ok: true, ...(await work({ id: user.id, role: user.role })) };
  } catch (e) {
    if (isIntakeError(e)) return { ok: false, code: e.code, message: e.message, detail: e.detail };
    throw e;
  }
}

/** 보낼 링크 — 서버가 설정의 정식 주소로 만든다. external 이 false 면 개발용 주소라 받는 사람에게 보내면 안 된다 */
type IssuedLinkResult = { link: string; external: boolean; submissionId: string; uploadExpiresAt: string; reissueCount: number };

/** 만든 초대 — coded 는 저장된 초대에 결과 접근 코드가 걸려 있나(지금 폼이 아니라 서버 값이다) */
type CreatedLinkResult = IssuedLinkResult & { reissued: boolean; coded: boolean };

/**
 * 초대를 만든다 — 준비(표 · 정식 주소)가 안 됐으면 'intake_not_ready'. createRequestKey 가 같으면 초대를 더 만들지 않는다:
 * 받는 분이 아직 시작하지 않았으면 그 초대의 링크를 새로 바꿔 돌려주고(reissued true), 시작했거나 관리자가 새 링크로 바꿨으면 'invitation_retry_used',
 * 다시 누른 내용이 처음과 다르면 'invitation_retry_changed'. 막힌 답의 detail.submissionId 로 화면이 앞 초대를 연다.
 */
export async function createIntakeInvitation(input: AdminInvitationInput): Promise<IntakeActionResult<CreatedLinkResult>> {
  return asAdmin(async (actor) => {
    const made = await adminCreateInvitationLink(db, actor, input);
    await afterIssued(() => revalidate(made.submissionId));
    return {
      link: made.link,
      external: made.external,
      submissionId: made.submissionId,
      uploadExpiresAt: made.uploadExpiresAt.toISOString(),
      reissueCount: made.reissueCount,
      reissued: made.reissued,
      coded: made.coded,
    };
  });
}

/** 링크를 새로 바꾼다 — 예전 링크는 바로 막힌다. expectedReissueCount 는 화면이 본 바꿈 횟수다(그사이 바뀌었으면 'stale_reissue') */
export async function reissueIntakeInvitation(submissionId: string, expectedReissueCount: number): Promise<IntakeActionResult<IssuedLinkResult & { hadAssets: boolean; published: boolean }>> {
  return asAdmin(async (actor) => {
    const made = await adminReissueInvitation(db, actor, { submissionId, expectedReissueCount });
    await afterIssued(() => markIntakeRead(db, actor, submissionId));
    await afterIssued(() => revalidate(submissionId));
    return {
      link: made.link,
      external: made.external,
      submissionId: made.submissionId,
      uploadExpiresAt: made.uploadExpiresAt.toISOString(),
      reissueCount: made.reissueCount,
      hadAssets: made.hadAssets,
      published: made.published,
    };
  });
}

export async function revokeIntakeInvitation(submissionId: string): Promise<IntakeActionResult<{ revoked: boolean }>> {
  return asAdmin(async (actor) => {
    const result = await adminRevokeInvitation(db, actor, { submissionId });
    await markIntakeRead(db, actor, submissionId);
    revalidate(submissionId);
    return result;
  });
}

export async function assignIntake(submissionId: string, assigneeId: string | null, expectedAssigneeId: string | null): Promise<IntakeActionResult<{ assigneeId: string | null; changed: boolean }>> {
  return asAdmin(async (actor) => {
    const result = await assignSubmission(db, actor, { submissionId, assigneeId, expectedAssigneeId });
    revalidate(submissionId);
    return result;
  });
}

export async function markIntakeSeen(submissionId: string): Promise<IntakeActionResult> {
  return asAdmin(async (actor) => {
    await markIntakeRead(db, actor, submissionId);
    revalidatePath('/admin/intake');
    return {};
  });
}

export async function markIntakeUnseen(submissionId: string): Promise<IntakeActionResult> {
  return asAdmin(async (actor) => {
    await markIntakeUnread(db, actor, submissionId);
    revalidatePath('/admin/intake');
    return {};
  });
}

export async function addIntakeAdminNote(submissionId: string, body: string): Promise<IntakeActionResult<{ id: string }>> {
  return asAdmin(async (actor) => {
    const note = await addIntakeNote(db, actor, { submissionId, body });
    revalidate(submissionId);
    return note;
  });
}

export async function deleteIntakeAdminNote(submissionId: string, noteId: string): Promise<IntakeActionResult> {
  return asAdmin(async (actor) => {
    await deleteIntakeNote(db, actor, { submissionId, noteId });
    revalidate(submissionId);
    return {};
  });
}

export async function requestIntakeCorrection(input: AdminCorrectionInput): Promise<IntakeActionResult<{ version: number }>> {
  return asAdmin(async (actor) => {
    const result = await adminRequestCorrection(db, actor, input);
    revalidate(input.submissionId);
    return result;
  });
}

export async function cancelIntakeCorrection(submissionId: string, expectedVersion: number): Promise<IntakeActionResult<{ version: number; status: string }>> {
  return asAdmin(async (actor) => {
    const result = await adminCancelCorrection(db, actor, { submissionId, expectedVersion });
    revalidate(submissionId);
    return result;
  });
}

/** 올리기 기간을 오늘부터 며칠로 늘린다 */
export async function extendIntakeUploadWindow(submissionId: string, days: number): Promise<IntakeActionResult<{ uploadExpiresAt: string }>> {
  return asAdmin(async (actor) => {
    const result = await adminExtendUploadWindow(db, actor, { submissionId, days });
    revalidate(submissionId);
    return result;
  });
}

/** 틀린 접근 코드로 잠긴 결과 보기를 푼다 */
export async function resetIntakeAccessCodeLock(submissionId: string): Promise<IntakeActionResult<{ reset: boolean }>> {
  return asAdmin(async (actor) => {
    const result = await adminResetAccessCodeLock(db, actor, { submissionId });
    revalidate(submissionId);
    return result;
  });
}

/** 받는 사람이 알린 필수 동의 철회를 남긴다 — 되돌릴 수 없어 화면이 먼저 묻는다. note 는 누가 언제 알렸는지 적는 칸이다 */
export async function withdrawIntakeConsent(submissionId: string, note?: string | null): Promise<IntakeActionResult<{ withdrawn: boolean; unpublished: boolean }>> {
  return asAdmin(async (actor) => {
    const result = await adminWithdrawConsent(db, actor, { submissionId, note: note ?? null });
    revalidate(submissionId);
    return result;
  });
}

/** 받는 사람이 알린 모델 개발 동의 철회를 남긴다. note 는 누가 언제 알렸는지 적는 칸이다 */
export async function withdrawIntakeModelConsent(submissionId: string, note?: string | null): Promise<IntakeActionResult<{ withdrawn: boolean }>> {
  return asAdmin(async (actor) => {
    const result = await adminWithdrawModelConsent(db, actor, { submissionId, note: note ?? null });
    revalidate(submissionId);
    return result;
  });
}

/** '다시 확인' — 자산을 안 주면 지금 판의 두 파일 · 칸의 파일과 등록 일감을 다시 건다 */
export async function requeueIntakeVerification(submissionId: string, assetId?: string): Promise<IntakeActionResult<{ requeued: number }>> {
  return asAdmin(async (actor) => {
    const result = await adminRequeueVerification(db, actor, { submissionId, assetId });
    revalidate(submissionId);
    return result;
  });
}

/** 자산 하나의 미리보기 · 내려받기 주소 */
export async function getIntakeOriginalLink(submissionId: string, assetId: string, purpose: OriginalPurpose): Promise<IntakeActionResult<{ link: OriginalLink }>> {
  return asAdmin(async (actor) => {
    const [link] = await issueOriginalLinks(db, getIntakeStorage(), actor, { submissionId, assetId, purpose });
    return { link };
  });
}

/** 짝 내려받기 — 묶음 파일이 아니라 원본 둘의 짧은 주소다 */
export async function getIntakePairLinks(submissionId: string): Promise<IntakeActionResult<{ links: OriginalLink[] }>> {
  return asAdmin(async (actor) => ({ links: await issueOriginalLinks(db, getIntakeStorage(), actor, { submissionId, purpose: 'download' }) }));
}

/** 분석이 만든 미리보기 영상 주소 — 브라우저가 원본을 못 풀 때 본다 */
export async function getIntakeRunPreview(submissionId: string, runId: string, view: IntakeView): Promise<IntakeActionResult<{ url: string }>> {
  return asAdmin(async (actor) => {
    const { url } = await issueRunPreviewLink(db, getIntakeStorage(), actor, { submissionId, runId, view });
    return { url };
  });
}

/* ── 분석 · 공개 — 판단과 쓰기는 lib/intake/analysis.ts · publication.ts 가 한다. 여기는 권한만 보고 넘긴다 ── */

export async function setIntakeHand(submissionId: string, hand: 'R' | 'L'): Promise<IntakeActionResult> {
  return asAdmin(async (actor) => {
    await setAnalysisHand({ submissionId, adminId: actor.id, hand });
    await markIntakeRead(db, actor, submissionId);
    revalidate(submissionId);
    return {};
  });
}

/** 분석을 건다 — 같은 입력이면 있던 실행을 돌려준다(created false). GPU 를 못 불러도 실패한 실행으로 남는다 */
export async function runIntakeAnalysis(submissionId: string, confirmDraftConsent = false): Promise<IntakeActionResult<{ created: boolean; status: string }>> {
  return asAdmin(async (actor) => {
    const { run, created } = await startIntakeAnalysis({ submissionId, adminId: actor.id, confirmDraftConsent });
    await markIntakeRead(db, actor, submissionId);
    revalidate(submissionId);
    return { created, status: run.status };
  });
}

/**
 * 이 실행을 공개한다 — 다른 실행이 공개 중이면 바꾸는 것이고, 화면이 먼저 알린다(몰래 바뀌지 않게).
 * expectedActivePublicationId 는 화면이 그릴 때 본 지금 공개(없으면 null)다. 그사이 바뀌었으면 code 'stale_publication' 으로 돌아온다.
 * 영상을 바꾼 고침 앞의 실행은 allowOlderRevision 을 넘겨야 공개된다(code 'run_not_current').
 */
export async function publishIntakeRun(
  submissionId: string,
  runId: string,
  explanation: string,
  expectedActivePublicationId: string | null,
  options: { allowOlderRevision?: boolean } = {},
): Promise<IntakeActionResult<{ replaced: boolean }>> {
  return asAdmin(async (actor) => {
    const result = await publishRun({ runId, submissionId, adminId: actor.id, explanation, expectedActivePublicationId, allowOlderRevision: options.allowOlderRevision === true });
    await markIntakeRead(db, actor, submissionId);
    revalidate(submissionId);
    return { replaced: result.replacedRunId != null };
  });
}

export async function unpublishIntake(submissionId: string, expectedActivePublicationId: string | null): Promise<IntakeActionResult> {
  return asAdmin(async (actor) => {
    await unpublish({ submissionId, adminId: actor.id, expectedActivePublicationId });
    await markIntakeRead(db, actor, submissionId);
    revalidate(submissionId);
    return {};
  });
}
