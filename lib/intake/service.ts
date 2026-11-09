/**
 * 외부 영상 접수의 DB 동작 — 공개 흐름의 진입점이다. 라우트 · 화면은 여기를 부른다.
 *
 * ── 약속(다른 작업이 이 위에 짓는다. 인자 모양을 바꾸지 말고 선택 칸만 더한다) ──────────────────────────────
 * 흐름: openIntakeScope(머리 → 범위) → saveDraft → recordConsents → reserveAsset → issueUploadToken → (브라우저가 TUS 전송)
 *      → registerUploadUrl → confirmUpload → finalizeSubmission → 일꾼이 verifyAsset → settleRevision → 'verified' + analysisStatus 'ready'.
 *
 * - 공개 함수는 모두 IntakeScope 를 받고, 트랜잭션 안에서 초대를 다시 본다(그사이 폐기되면 막는다). 다른 접수의 번호는 'asset_not_found' 다.
 * - 관리자 함수(createInvitation · reissueInvitationToken · requestCorrection · cancelCorrection · extendUploadWindow · withdrawRequiredConsent · withdrawModelConsentForInvitee · requeueVerification · resetAccessCodeLock)는
 *   권한을 보지 않는다 — 부르는 쪽이 먼저 can(role, 'intake') 를 본다.
 * - 실패는 IntakeError(코드 · 글 · httpStatus)를 던진다. 라우트는 그대로 코드를 돌려준다.
 * - 시각 인자 now 는 시험용이고, 앱은 안 넘긴다.
 *
 * 낙관 잠금: version 은 고른 영상 · 글이 바뀔 때만 오른다. 전송 진행은 안 올린다.
 *   - saveDraft · finalizeSubmission 은 expectedVersion 이 맞아야 한다(틀리면 'stale_version', detail.currentVersion).
 *   - finalizeSubmission 은 expectedAssets 를 주면 칸이 그 자산인지도 본다 — 화면이 보여 준 짝이 아니면 'stale_selection'.
 *     짝이 달라지면 같은 투구 확인(samePitchConfirmed)은 지워져, 새 짝으로 다시 받는다. 칸을 바꿀 때 · 빈 칸을 새로 채울 때 · 정리가 칸을 비울 때 모두다.
 *   - reserveAsset 은 칸마다 expectedAssetId 로 본다 — 두 기기가 옆 · 뒤를 따로 올려도 부딪히지 않고, 같은 칸을 다른 기기가 바꾸면 'stale_selection'.
 *
 * 멱등: finalizeSubmission 은 같은 idempotencyKey 면 같은 영수증을 돌려준다(created false). 이미 접수된 뒤의 다른 키도 새 판을 안 만든다.
 *   reserveAsset 은 같은 칸에 같은 해시 · 크기면 있던 자산을 돌려준다. confirmUpload · verifyAsset 도 다시 불러도 된다.
 *
 * 정산: 판을 'verified' · 'failed' 로 닫는 일(settleRevision)은 자산 쓰기와 다른 트랜잭션이라 사이에서 끊길 수 있다. 그래서 세 곳이 다시 건다 —
 *   이미 끝난 자산의 verifyAsset, 같은 키의 finalizeSubmission 재시도, 크론의 reconcilePendingRevisions.
 *
 * 동의: 바이트보다 먼저다. issueUploadToken 은 필수 동의가 지금 판으로 있어야 한다. finalize 도 다시 보고, consents 를 함께 넘기면 그때 남긴다.
 *   접수 뒤 동의 글의 판이 바뀌면 PublicIntakeState.needsReconsent 가 켜지고 recordConsents 가 그때만 다시 받는다(올리기 기간과 상관없다).
 *
 * 분석 · 공개: 이 파일은 'verified' + analysisStatus 'ready' 와 register_revision 일감까지만 만든다. 실행은 lib/intake/analysis.ts 몫이고, GPU 는 관리자가 누른다.
 * 분석 쪽은 실행의 입력(두 원본 + 손)이 지금 입력과 같을 때만 submission.analysisStatus 를 옮긴다(고침 뒤 옛 입력의 소식이 새 판을 덮지 않게). 판 번호로 견주지 않는다 — 이름만 고친 판은 앞 판의 실행을 잇는다.
 */
import { randomUUID } from 'node:crypto';
import { Prisma, type IntakeAsset, type IntakeInvitation, type IntakeRevision, type IntakeSubmission, type PrismaClient } from '@prisma/client';
import { recheckScope, assertInvitationAllows, assertScopeToken, resultExpired, uploadExpired, type IntakeOp, type IntakeScope } from '@/lib/intake/access';
import { carryInTx, runMatchesCurrent } from '@/lib/intake/analysis';
import { writeAudit } from '@/lib/intake/audit';
import {
  INTAKE_CONSENT_DOCS,
  ageBandBlocked,
  REQUIRED_CONSENT_KINDS,
  consentDecisionRows,
  consentDocOf,
  consentIsCurrent,
  hasRequiredConsents,
  isAgeBand,
  isConsentKind,
  isSubmitterRelation,
  latestConsents,
  type ConsentAnswer,
  type IntakeConsentKind,
} from '@/lib/intake/consent';
import { IntakeError } from '@/lib/intake/errors';
import { enqueueJob, requeueJob, type JobHandlers } from '@/lib/intake/jobs';
import { DEFAULT_UPLOAD_DAYS, TUS_CHUNK_BYTES, TUS_URL_TTL_MS, intakeLimits, type IntakeLimits } from '@/lib/intake/limits';
import { fpsLabel, integrityLabel, mediaRejectCode, mediaUnconfirmed, readIntakeMediaFacts, timingNote, type IntakeMediaFacts } from '@/lib/intake/media';
import { assetObjectPath, isIntakeId, isPurgeablePath, seoulDateKey } from '@/lib/intake/paths';
import { pruneRateLimits } from '@/lib/intake/rate-limit';
import { removeAndFindLeft, removeLeftObject } from '@/lib/intake/remove';
import { WITHDRAWN_DRAFT_GRACE_MS, currentOriginalsPurgedAt, originalRetention, retentionDue, shownRetention } from '@/lib/intake/retention';
import {
  ASSET_GONE,
  CORRECTABLE_FIELDS,
  assertSubmissionMove,
  assetArrived,
  assetGone,
  assetInTransit,
  assetVerifyDone,
  canEditField,
  canEditView,
  canMoveAsset,
  correctionReceiptLine,
  correctionRepickViews,
  isIntakeView,
  publicStatusText,
  currentOriginalsGone,
  purgingScope,
  readCorrection,
  reconsentOpen,
  resolveScreen,
  type CorrectableField,
  type CorrectionRequest,
  type IntakeScreen,
  type IntakeView,
  type OriginalsGone,
  type PurgingScope,
} from '@/lib/intake/state';
import type { IntakeStorage } from '@/lib/intake/storage-core';
import { generateInvitationToken, generateReceiptCode, hashAccessCode, hashInvitationToken, isAccessCode, isIdempotencyKey, verifyAccessCode } from '@/lib/intake/token';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MAX_NAME_CHARS = 40;
/** 올리기 주소가 끝나고도 이만큼 기다린 뒤에야 지운다 — 진행 중인 전송을 건드리지 않게 */
const CLEANUP_GRACE_MS = 2 * 60 * 60_000;
/** 정리가 한 번에 훑는 줄 수는 한도의 몇 배인가 — 안 지워지는 파일이 한도를 채워도 뒤 파일까지 닿게 하되, 저장소가 이상할 때 함수 시간을 다 쓰지 않게 */
const CLEANUP_WALK_PAGES = 4;

/* ────────────────────────────── 공용 ────────────────────────────── */

const slotOf = (view: IntakeView) => (view === 'side' ? 'sideAssetId' : 'rearAssetId');
const otherView = (view: IntakeView): IntakeView => (view === 'side' ? 'rear' : 'side');

/**
 * 줄을 잠그고 읽는다. 범위와 다른 접수는 없는 것으로 본다.
 * 잠근 뒤 범위를 연 토큰이 아직 이 초대의 것인지도 본다 — 링크 바꾸기는 같은 접수 줄을 먼저 잠그고 해시를 바꾸므로, 여기서 읽는 해시는 바꾸기 전이거나 끝난 뒤다.
 * 폐기 · 만료는 부르는 쪽의 recheckScope 가 op 에 맞춰 본다(그것도 토큰을 다시 맞춘다).
 */
async function lockSubmission(tx: Tx, scope: IntakeScope): Promise<IntakeSubmission> {
  await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${scope.submissionId} FOR UPDATE`;
  const row = await tx.intakeSubmission.findUnique({ where: { id: scope.submissionId }, include: { invitation: { select: { id: true, tokenHash: true } } } });
  if (!row || row.invitationId !== scope.invitationId) throw new IntakeError('submission_not_found');
  const { invitation, ...sub } = row;
  assertScopeToken(invitation, scope);
  return sub;
}

/**
 * 글에서 못 쓰는 글자 — 제어 글자, 깨진 서로게이트, 글 방향을 뒤집는 문자. 관리자 목록에서 다른 이름처럼 보이게 만들 수 있어서 막는다.
 * ZWNJ · ZWJ 는 페르시아어 · 인도계 이름에 정상으로 들어가는 글자라 뺀다.
 */
const UNSAFE_TEXT = /[\p{Cc}\p{Cs}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;
const hasUnsafeText = (text: string) => text.search(UNSAFE_TEXT) >= 0;

/** 이름 다듬기 — 앞뒤 공백을 빼고 NFC 로 모은다. 한글 · 외국 이름 · 하이픈 · 아포스트로피를 받고 제어 글자는 막는다 */
export function normalizeAthleteName(raw: unknown): string {
  if (typeof raw !== 'string') throw new IntakeError('athlete_name_required');
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name) throw new IntakeError('athlete_name_required');
  if ([...name].length > MAX_NAME_CHARS) throw new IntakeError('athlete_name_invalid');
  if (hasUnsafeText(name)) throw new IntakeError('athlete_name_chars');
  return name;
}

const cleanLabel = (raw: unknown, max: number): string | null => {
  if (typeof raw !== 'string') return null;
  const text = raw.normalize('NFC').replace(UNSAFE_TEXT, '').trim();
  return text ? [...text].slice(0, max).join('') : null;
};

export type PublicAsset = {
  id: string;
  view: IntakeView;
  status: string;
  fileName: string;
  sizeBytes: number;
  /** 고를 때 브라우저가 잰 전체 SHA-256 — 다시 고른 파일이 같은 파일인지 보는 데 쓴다. 서버가 잰 값이 아니다 */
  sha256: string;
  /** 서버 검증이 끝나면 '선택한 파일 그대로 전송됨' */
  integrity: string | null;
  /** '240fps 감지' · '영상 정보 확인 필요' — 파일 머리를 읽기 전이면 null */
  fps: string | null;
  timing: string | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  /** 표본 시간 길이(초) — 재생 길이가 아니다 */
  sampleDurationSec: number | null;
  rejectCode: string | null;
};

function publicAsset(a: IntakeAsset): PublicAsset {
  const facts = a.mediaFacts as IntakeMediaFacts | null;
  return {
    id: a.id,
    view: a.view as IntakeView,
    status: a.status,
    fileName: a.originalName,
    sizeBytes: Number(a.declaredSize),
    sha256: a.clientSha256,
    integrity: integrityLabel(a.status),
    fps: facts ? fpsLabel(facts) : null,
    timing: facts ? timingNote(facts) : null,
    codec: facts?.codec ?? null,
    width: facts?.width ?? null,
    height: facts?.height ?? null,
    sampleDurationSec: facts?.sampleDurationSec ?? null,
    rejectCode: a.rejectCode,
  };
}

/* ────────────────────────────── 초대(관리자) ────────────────────────────── */

export type CreateInvitationInput = {
  adminId: string;
  /** 관리자가 알아보려는 메모. 공개 화면에 안 나간다 */
  note?: string | null;
  uploadExpiresAt?: Date;
  resultExpiresAt?: Date | null;
  /** 결과 보기 접근 코드 — 6~32자 */
  accessCode?: string | null;
  maxFileBytes?: number | null;
  maxTotalBytes?: number | null;
  /**
   * 만들기 요청 키 — 관리 화면이 창마다 만든 UUID. 서버는 만들었는데 답만 잃고 같은 키로 다시 누르면 초대를 더 만들지 않는다.
   * 받는 분이 아직 아무것도 안 했으면 그 초대의 링크를 새로 바꿔 돌려주고(잃은 토큰은 막힌다), 이미 시작했거나 관리자가 '새 링크 만들기'로 바꿨으면 'invitation_retry_used' 로 막는다.
   * 다시 누른 내용(메모 · 기간 · 접근 코드 · 한도)이 처음과 다르면 'invitation_retry_changed' 로 막는다 — 바꾼 내용이 반영된 줄 알고 링크를 보내지 않게.
   * 안 주면 예전처럼 매번 새로 만든다
   */
  createRequestKey?: string | null;
};

export type CreatedInvitation = {
  /** 토큰 원문 — 이 응답에서만 볼 수 있다. 저장 · 기록하지 말 것 */
  token: string;
  invitationId: string;
  submissionId: string;
  uploadExpiresAt: Date;
  /** 같은 요청 키로 다시 눌러 있던 초대의 링크를 새로 바꿨나 — 그러면 앞서 만든 링크는 이미 막혔다 */
  reissued: boolean;
  /** 링크를 바꾼 횟수 — 새 링크 만들기가 맞춰 볼 값이다 */
  reissueCount: number;
  /** 저장된 초대에 결과 접근 코드가 걸려 있나 — 화면은 지금 폼이 아니라 이 값으로 '코드가 필요해요'를 보인다 */
  coded: boolean;
};

const CREATE_REQUEST_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isCreateRequestKey = (v: unknown): v is string => typeof v === 'string' && CREATE_REQUEST_KEY_RE.test(v);

export type UntouchedFacts = { status: string; version: number; receivedAt: Date | string | null; assets: number; consents: number; revisions: number };

/**
 * 받는 분이 아직 아무것도 안 한 접수인가 — 초안 그대로(판 0) · 고른 영상 · 동의 · 얼린 판이 없다.
 * 링크를 열었는지는 모른다(열기는 아무것도 안 바꾸는 읽기라 기록하지 않는다). 그래서 '링크를 못 받았을 수 있는 접수'를 이것으로 가린다.
 */
export const isUntouchedSubmission = (f: UntouchedFacts) =>
  f.status === 'draft' && f.version === 0 && f.receivedAt == null && f.assets === 0 && f.consents === 0 && f.revisions === 0;

/** 접수 줄을 잠그고 손대지 않았는지 본다 — 받는 분의 동작도 같은 줄을 잠그므로 그사이 시작하지 못한다 */
async function lockUntouched(tx: Tx, submissionId: string): Promise<{ untouched: boolean; assets: number; publicationStatus: string }> {
  await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${submissionId} FOR UPDATE`;
  const s = await tx.intakeSubmission.findUnique({
    where: { id: submissionId },
    select: { status: true, version: true, receivedAt: true, publicationStatus: true, _count: { select: { assets: true, consents: true, revisions: true } } },
  });
  if (!s) throw new IntakeError('submission_not_found');
  return { untouched: isUntouchedSubmission({ ...s, ...s._count }), assets: s._count.assets, publicationStatus: s.publicationStatus };
}

/** 다시 누른 만들기의 내용 — 기간은 누른 시각부터의 길이(ms)로 둔다. 처음 초대는 만든 시각부터의 길이로 견준다 */
type CreateRequestShape = {
  note: string | null;
  uploadMs: number;
  resultMs: number | null;
  accessCode: string | null;
  maxFileBytes: number | null;
  maxTotalBytes: number | null;
};

/** 다시 누른 내용이 처음 만든 초대와 같은가 — 접근 코드는 해시만 있어 맞춰 본다 */
async function sameCreateRequest(inv: IntakeInvitation, want: CreateRequestShape): Promise<boolean> {
  const from = inv.createdAt.getTime();
  const sameBytes = (stored: bigint | null, asked: number | null) => (stored == null ? asked == null : asked != null && stored === BigInt(asked));
  if (inv.note !== want.note) return false;
  if (inv.uploadExpiresAt.getTime() - from !== want.uploadMs) return false;
  if ((inv.resultExpiresAt ? inv.resultExpiresAt.getTime() - from : null) !== want.resultMs) return false;
  if (!sameBytes(inv.maxFileBytes, want.maxFileBytes) || !sameBytes(inv.maxTotalBytes, want.maxTotalBytes)) return false;
  if (inv.accessCodeHash == null || want.accessCode == null) return inv.accessCodeHash == null && want.accessCode == null;
  return verifyAccessCode(want.accessCode, inv.accessCodeHash);
}

/**
 * 같은 요청 키의 초대가 이미 있으면 그 링크를 새로 바꿔 돌려준다. 없으면 null.
 * 부르는 쪽이 키의 자문 잠금을 쥔 트랜잭션 안에서 부른다 — 같은 키의 요청은 줄을 서서, 앞 요청이 만든 줄을 뒤 요청이 본다.
 *
 * 링크를 바꿔도 되는 때는 '만든 링크를 아무도 못 받았을 때'뿐이다:
 * - 관리자가 '새 링크 만들기'로 이미 바꿨으면(adminReissuedAt) 막는다 — 그 링크를 받는 분에게 보냈을 수 있어서, 열어 둔 만들기 창이 며칠 뒤 눌려도 그 링크를 죽이지 않는다.
 * - 받는 분이 시작했으면 막는다. 다시 누른 내용이 처음과 다르면 막는다(바꾼 내용이 들어간 줄 알고 보내지 않게).
 * 시간 제한은 두지 않았다 — 위 셋을 지나면 바꿀 링크를 가진 사람이 없다(잃은 토큰은 원문이 어디에도 없다).
 */
async function rotateForRetry(tx: Tx, adminId: string, key: string, want: CreateRequestShape, now: Date): Promise<CreatedInvitation | null> {
  const found = await tx.intakeInvitation.findUnique({ where: { createRequestKey: key }, include: { submission: { select: { id: true } } } });
  if (!found) return null;
  /* 키는 만든 관리자의 것이다 — 다른 관리자가 같은 키를 보내도 남의 링크를 받지 못한다 */
  if (found.createdByAdminId !== adminId) throw new IntakeError('invalid_input', { field: 'createRequestKey' });
  if (!found.submission) throw new IntakeError('submission_not_found');
  const submissionId = found.submission.id;
  /* 새 링크 만들기도 접수 줄을 먼저 잠근다 — 잠근 뒤 초대를 다시 읽어 그사이 끝난 새 링크 · 폐기를 본다 */
  const facts = await lockUntouched(tx, submissionId);
  const inv = await tx.intakeInvitation.findUniqueOrThrow({ where: { id: found.id } });
  if (inv.status !== 'active') throw new IntakeError('invitation_revoked', { submissionId });
  if (inv.adminReissuedAt) throw new IntakeError('invitation_retry_used', { submissionId, reason: 'admin_reissued' });
  if (!facts.untouched) throw new IntakeError('invitation_retry_used', { submissionId, reason: 'started' });
  if (!(await sameCreateRequest(inv, want))) throw new IntakeError('invitation_retry_changed', { submissionId });
  const token = generateInvitationToken();
  /* 횟수를 맞춰 보며 바꾼다 — 관리자 새 링크가 끼어들 틈은 위 잠금이 막지만, 한 번 더 지킨다 */
  const moved = await tx.intakeInvitation.updateMany({
    where: { id: inv.id, status: 'active', adminReissuedAt: null, tokenReissueCount: inv.tokenReissueCount },
    data: { tokenHash: hashInvitationToken(token), tokenReissuedAt: now, tokenReissueCount: { increment: 1 } },
  });
  if (moved.count === 0) throw new IntakeError('stale_reissue', { submissionId });
  await writeAudit(tx, { actor: { kind: 'admin', id: adminId }, action: 'invitation.reissued', invitationId: inv.id, submissionId, detail: { reason: 'create_retry' } }, now);
  return {
    token,
    invitationId: inv.id,
    submissionId,
    uploadExpiresAt: inv.uploadExpiresAt,
    reissued: true,
    reissueCount: inv.tokenReissueCount + 1,
    coded: inv.accessCodeHash != null,
  };
}

/** 초대와 빈 접수를 같이 만든다. 화면 GET 이 아무것도 안 바꾸게 하려고 접수는 여기서 만든다 */
export async function createInvitation(db: Db, input: CreateInvitationInput, now: Date = new Date()): Promise<CreatedInvitation> {
  if (input.accessCode != null && !isAccessCode(input.accessCode)) throw new IntakeError('invalid_input', { field: 'accessCode' });
  const key = input.createRequestKey ?? null;
  if (key != null && !isCreateRequestKey(key)) throw new IntakeError('invalid_input', { field: 'createRequestKey' });
  const token = generateInvitationToken();
  const uploadExpiresAt = input.uploadExpiresAt ?? new Date(now.getTime() + DEFAULT_UPLOAD_DAYS * DAY_MS);
  const accessCodeHash = input.accessCode ? await hashAccessCode(input.accessCode) : null;
  const note = cleanLabel(input.note, 200);
  const shape: CreateRequestShape = {
    note,
    uploadMs: uploadExpiresAt.getTime() - now.getTime(),
    resultMs: input.resultExpiresAt ? input.resultExpiresAt.getTime() - now.getTime() : null,
    accessCode: input.accessCode ? input.accessCode : null,
    maxFileBytes: input.maxFileBytes ?? null,
    maxTotalBytes: input.maxTotalBytes ?? null,
  };
  return db.$transaction(async (tx) => {
    if (key) {
      /* 같은 키의 요청을 줄 세운다 — 유일 키 충돌로 트랜잭션을 깨뜨리지 않고, 뒤 요청이 앞 요청의 초대를 잇는다. 끝나면 저절로 풀린다 */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`intake-invite:${key}`}, 0))`;
      const retried = await rotateForRetry(tx, input.adminId, key, shape, now);
      if (retried) return retried;
    }
    const inv = await tx.intakeInvitation.create({
      data: {
        tokenHash: hashInvitationToken(token),
        note,
        createdByAdminId: input.adminId,
        uploadExpiresAt,
        resultExpiresAt: input.resultExpiresAt ?? null,
        accessCodeHash,
        maxFileBytes: input.maxFileBytes != null ? BigInt(input.maxFileBytes) : null,
        maxTotalBytes: input.maxTotalBytes != null ? BigInt(input.maxTotalBytes) : null,
        createRequestKey: key,
        createdAt: now,
        submission: { create: { createdAt: now } },
      },
      include: { submission: { select: { id: true } } },
    });
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'invitation.created', invitationId: inv.id, submissionId: inv.submission!.id }, now);
    return { token, invitationId: inv.id, submissionId: inv.submission!.id, uploadExpiresAt, reissued: false, reissueCount: 0, coded: accessCodeHash != null };
  });
}

export type ReissueInvitationInput = {
  adminId: string;
  submissionId: string;
  /** 화면이 본 링크 바꿈 횟수 — 그사이 다른 관리자가 바꿨으면 'stale_reissue'(detail.currentReissueCount) */
  expectedReissueCount: number;
};

export type ReissuedInvitation = {
  /** 새 토큰 원문 — 이 응답에서만 볼 수 있다. 저장 · 기록하지 말 것 */
  token: string;
  invitationId: string;
  submissionId: string;
  uploadExpiresAt: Date;
  reissueCount: number;
  /** 이미 받은 영상이 있었나 — 새 링크로 이어진다 */
  hadAssets: boolean;
  /** 결과를 공개 중이었나 — 새 링크로 이어진다 */
  published: boolean;
};

/**
 * 링크를 새로 바꾼다 — 토큰 해시만 바꾸므로 예전 링크는 곧바로 막히고(openIntakeScope 가 해시로 찾는다), 접수 · 받은 영상 · 공개 결과는 새 링크로 이어진다.
 * 폐기한 초대는 못 바꾼다. 두 관리자가 같이 눌러도 횟수를 맞춰 본 쪽 하나만 바뀐다.
 * 이미 내준 전송 토큰은 저장소에서 바로 거둘 수 없어 수명까지 산다(폐기와 같다).
 * adminReissuedAt 을 남긴다 — 그 뒤로는 열어 둔 만들기 창을 다시 눌러도 이 링크를 바꾸지 못한다(rotateForRetry).
 */
export async function reissueInvitationToken(db: Db, input: ReissueInvitationInput, now: Date = new Date()): Promise<ReissuedInvitation> {
  if (!Number.isInteger(input.expectedReissueCount) || input.expectedReissueCount < 0) throw new IntakeError('invalid_input', { field: 'expectedReissueCount' });
  return db.$transaction(async (tx) => {
    const sub = await tx.intakeSubmission.findUnique({ where: { id: input.submissionId }, select: { id: true, invitationId: true } });
    if (!sub) throw new IntakeError('submission_not_found');
    const facts = await lockUntouched(tx, sub.id);
    const token = generateInvitationToken();
    const moved = await tx.intakeInvitation.updateMany({
      where: { id: sub.invitationId, status: 'active', tokenReissueCount: input.expectedReissueCount },
      data: { tokenHash: hashInvitationToken(token), tokenReissuedAt: now, adminReissuedAt: now, tokenReissueCount: { increment: 1 } },
    });
    const inv = await tx.intakeInvitation.findUnique({ where: { id: sub.invitationId }, select: { status: true, tokenReissueCount: true, uploadExpiresAt: true } });
    if (!inv) throw new IntakeError('submission_not_found');
    if (moved.count === 0) {
      if (inv.status !== 'active') throw new IntakeError('invitation_revoked');
      throw new IntakeError('stale_reissue', { currentReissueCount: inv.tokenReissueCount });
    }
    const hadAssets = facts.assets > 0;
    const published = facts.publicationStatus === 'published';
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'invitation.reissued', invitationId: sub.invitationId, submissionId: sub.id, detail: { reason: 'admin', hadAssets, published } }, now);
    return { token, invitationId: sub.invitationId, submissionId: sub.id, uploadExpiresAt: inv.uploadExpiresAt, reissueCount: inv.tokenReissueCount, hadAssets, published };
  });
}

/* ────────────────────────────── 보이는 상태 ────────────────────────────── */

export type PublicIntakeState = {
  /** 이 기기의 이어 올리기 기록을 접수별로 묶는 데 쓴다 — 번호만으로는 아무것도 못 한다 */
  submissionId: string;
  screen: IntakeScreen;
  statusText: string;
  version: number;
  submissionStatus: string;
  analysisStatus: string;
  draft: {
    athleteName: string | null;
    athleteAgeBand: string | null;
    throwingHand: string | null;
    submitterRelation: string;
    submitterName: string | null;
    samePitchConfirmed: boolean;
  };
  assets: Record<IntakeView, PublicAsset | null>;
  consent: { requiredOk: boolean; granted: Record<IntakeConsentKind, boolean> };
  receipt: { code: string; receivedAt: string; receiptDate: string; revision: number | null } | null;
  correction: CorrectionRequest | null;
  limits: IntakeLimits;
  uploadExpiresAt: string;
  uploadExpired: boolean;
  resultExpiresAt: string | null;
  accessCodeRequired: boolean;
  /** 틀린 코드가 쌓여 결과 보기가 잠겼나 — 관리자가 풀 때까지 코드를 물어도 소용없다 */
  accessCodeLocked: boolean;
  published: boolean;
  /**
   * 공개 결과를 지금 열 수 있나(공개 중이고 결과 기간 안). screen 과 따로 본다 — 고침을 요청받은 동안 screen 은 'correction' 이어도 이 값이 true 일 수 있다.
   * 그때 화면은 고침 안내와 '공개 결과 보기'를 같이 보인다. 코드가 걸려 있으면 accessCodeRequired 도 함께 본다.
   */
  resultAvailable: boolean;
  /** 고친 내용을 다시 낸 뒤의 상태 한 줄 — 공개 화면에도 같이 보인다. 없으면 null */
  correctionStatusLine: string | null;
  /** 동의 글의 판이 바뀌어 필수 동의를 다시 받아야 하나 — 켜지면 화면이 동의 칸을 띄우고 recordConsents 로 받는다 */
  needsReconsent: boolean;
  /** 이 접수에 저장소로 넘어온(또는 넘어오는 중인) 파일이 있나 — 막힌 화면이 '보낸 영상은 없어요'라고 말해도 되는지 본다 */
  assetsOnFile: boolean;
  /** 원본을 지울 날(한국 날짜) — 시계가 없는 초안과 지울 파일이 없는 철회 초안은 null */
  originalDeleteDate: string | null;
  /** 지금 판의 원본을 다 지운 날(한국 날짜) — 남아 있으면 null. 옛 판 파일이 남았어도 지금 판을 지웠으면 날짜가 있다 */
  originalDeletedDate: string | null;
  /** 원본을 지우는 중인가 — 'current' 지금 판의 파일, 'older' 옛 판의 파일뿐이다. 지금 판을 지우는 중이면 originalDeleteDate 는 끝난 날이 아니라 시계가 말하는 날일 뿐이라 화면이 안 보인다(state.ts receiptRetentionRows) */
  originalDeleting: PurgingScope | null;
  /** 지금 판의 원본이 없나 — 있으면 이 판으로는 더 분석할 수 없다. 고침으로 새 판이 오면 풀린다 */
  originalsGone: OriginalsGone | null;
  /**
   * 가장 마지막 판에 얼린 칸별 파일 번호 — 판이 없으면 둘 다 null. 고침 화면이 요청받은 칸을 새로 골랐는지 서버와 같은 판단(correctionRepickViews)으로 본다.
   * 번호는 assets 에도 나가는 자산 번호다. 이것만으로는 아무것도 못 한다.
   */
  frozenAssetIds: Record<IntakeView, string | null>;
};

/** 받는 사람에게 보일 고침 요청 — 관리자 쪽 기억(handBefore)은 뺀다 */
const publicCorrection = (c: CorrectionRequest | null): CorrectionRequest | null => (c ? { fields: c.fields, views: c.views, message: c.message } : null);

/**
 * 다시 찾아온 사람에게 보일 상태 — 읽기만 한다. 관리자 메모 · 담당자 · 실행 번호는 넣지 않는다.
 * accessCodeOk 는 라우트가 코드를 맞춰 본 결과다. 결과 내용 자체는 공개 API 가 따로 준다.
 */
export async function loadPublicState(
  db: Db,
  scope: IntakeScope,
  opts: { now?: Date; accessCodeOk?: boolean } = {},
): Promise<PublicIntakeState> {
  const now = opts.now ?? new Date();
  const sub = await db.intakeSubmission.findUnique({
    where: { id: scope.submissionId },
    include: {
      invitation: true,
      assets: true,
      revisions: { orderBy: { number: 'desc' }, take: 1, select: { number: true, sideAssetId: true, rearAssetId: true, throwingHand: true } },
      publications: {
        where: { activeFor: { not: null } },
        select: { id: true, run: { select: { resultMeta: true, revision: { select: { sideAssetId: true, rearAssetId: true, throwingHand: true } } } } },
      },
    },
  });
  if (!sub || sub.invitationId !== scope.invitationId) throw new IntakeError('submission_not_found');
  /* 범위를 연 바로 뒤 링크를 바꿨으면 예전 링크의 읽기도 막는다 — 초안 · 이름 · 영수증이 바뀐 링크로 나가지 않게(다른 공개 길과 같다) */
  assertScopeToken(sub.invitation, scope);
  assertInvitationAllows(sub.invitation, 'read', now);

  const byId = new Map(sub.assets.map((a) => [a.id, a]));
  const side = sub.sideAssetId ? (byId.get(sub.sideAssetId) ?? null) : null;
  const rear = sub.rearAssetId ? (byId.get(sub.rearAssetId) ?? null) : null;
  const consents = await consentDecisionRows(db, sub.id);
  const latest = latestConsents(consents, sub.submitterRelation);
  const requiredOk = hasRequiredConsents(consents, sub.submitterRelation);
  const published = sub.publications.length > 0;
  const publishedRun = sub.publications[0]?.run ?? null;
  const expired = uploadExpired(sub.invitation, now);
  const resultOver = resultExpired(sub.invitation, now);
  const publishedRows = await db.intakePublication.findMany({ where: { submissionId: sub.id }, select: { publishedAt: true } });
  const plan = originalRetention({ publishedAts: publishedRows.map((p) => p.publishedAt), lastFrozenAt: sub.lastFinalizedAt, withdrawnAt: sub.withdrawnAt });
  const originalsGone = originalsGoneNow(sub.assets, sub.revisions[0] ?? null, plan, now);
  const needsReconsent = reconsentOpen(sub.status, requiredOk, originalsGone);
  const retention = shownRetention(plan, sub.assets.length);
  const deletedAt = currentOriginalsPurgedAt(sub.assets, sub.revisions[0] ?? null);

  const screen = resolveScreen({
    invitationStatus: sub.invitation.status,
    uploadExpired: expired,
    resultExpired: resultOver,
    accessCodeRequired: sub.invitation.accessCodeHash != null,
    accessCodeOk: opts.accessCodeOk ?? false,
    submissionStatus: sub.status,
    analysisStatus: sub.analysisStatus,
    published,
    hasAthleteName: sub.athleteName != null,
    underFourteen: ageBandBlocked(sub.athleteAgeBand),
    consented: requiredOk,
    side: side?.status ?? null,
    rear: rear?.status ?? null,
  });

  return {
    submissionId: sub.id,
    screen,
    statusText: publicStatusText(sub.status, sub.analysisStatus, published, { uploadExpired: expired, needsReconsent, originalsGone }),
    version: sub.version,
    submissionStatus: sub.status,
    analysisStatus: sub.analysisStatus,
    draft: {
      athleteName: sub.athleteName,
      athleteAgeBand: sub.athleteAgeBand,
      throwingHand: sub.throwingHand,
      submitterRelation: sub.submitterRelation,
      submitterName: sub.submitterName,
      samePitchConfirmed: sub.samePitchConfirmed,
    },
    assets: { side: side ? publicAsset(side) : null, rear: rear ? publicAsset(rear) : null },
    consent: {
      requiredOk,
      granted: Object.fromEntries(
        INTAKE_CONSENT_DOCS.map((d) => [d.kind, consentIsCurrent(latest.get(d.kind), d, sub.submitterRelation)]),
      ) as Record<IntakeConsentKind, boolean>,
    },
    receipt:
      sub.receiptCode && sub.receivedAt
        ? {
            code: sub.receiptCode,
            receivedAt: sub.receivedAt.toISOString(),
            receiptDate: seoulDateKey(sub.receivedAt),
            revision: sub.revisions[0]?.number ?? null,
          }
        : null,
    correction: sub.status === 'correction_requested' ? publicCorrection(readCorrection(sub.correction)) : null,
    limits: intakeLimits(sub.invitation),
    uploadExpiresAt: sub.invitation.uploadExpiresAt.toISOString(),
    uploadExpired: expired,
    resultExpiresAt: sub.invitation.resultExpiresAt?.toISOString() ?? null,
    accessCodeRequired: sub.invitation.accessCodeHash != null,
    accessCodeLocked: sub.invitation.accessCodeLockedAt != null,
    published,
    resultAvailable: published && !resultOver && sub.status !== 'withdrawn',
    correctionStatusLine: correctionReceiptLine({
      submissionStatus: sub.status,
      revision: sub.revisions[0]?.number ?? null,
      publishedCurrent: publishedRun != null && sub.revisions[0] != null && runMatchesCurrent(publishedRun, publishedRun.revision, sub, sub.revisions[0]),
      originalsGone,
    }),
    needsReconsent,
    assetsOnFile: sub.assets.some((a) => a.status !== 'reserved' && !assetGone(a.status)),
    originalDeleteDate: retention ? seoulDateKey(retention.purgeAt) : null,
    originalDeletedDate: deletedAt ? seoulDateKey(deletedAt) : null,
    originalDeleting: purgingScope(sub.assets, sub.revisions[0] ?? null),
    originalsGone,
    frozenAssetIds: { side: sub.revisions[0]?.sideAssetId ?? null, rear: sub.revisions[0]?.rearAssetId ?? null },
  };
}

/* ────────────────────────────── 초안 ────────────────────────────── */

export type DraftPatch = {
  expectedVersion: number;
  athleteName?: string;
  athleteAgeBand?: string;
  throwingHand?: string | null;
  submitterRelation?: string;
  submitterName?: string | null;
  samePitchConfirmed?: boolean;
};

/**
 * 글 칸을 저장한다. 바뀐 것이 없으면 판을 안 올린다. 고침 요청 중이면 요청받은 칸만 된다.
 * 나이 답이 바뀌면 감사 기록을 남긴다. 만 14세 미만이면 받을 수 없는 사람이니 이름 · 보내는 분 이름을 남기지 않는다.
 */
export async function saveDraft(db: Db, scope: IntakeScope, patch: DraftPatch, now: Date = new Date()): Promise<{ version: number }> {
  return db.$transaction(async (tx) => {
    const sub = await lockSubmission(tx, scope);
    await recheckScope(tx, scope, 'edit', now);
    if (sub.status !== 'draft' && sub.status !== 'correction_requested') throw new IntakeError('not_editable');
    if (patch.expectedVersion !== sub.version) throw new IntakeError('stale_version', { currentVersion: sub.version });

    const data: Prisma.IntakeSubmissionUpdateInput = {};
    const correction = readCorrection(sub.correction);
    const set = <K extends keyof DraftPatch & keyof IntakeSubmission>(key: K, value: IntakeSubmission[K]) => {
      if (value === sub[key]) return;
      if (!canEditField(sub.status, correction, key)) throw new IntakeError('not_editable', { field: key });
      (data as Record<string, unknown>)[key] = value;
    };

    if (patch.athleteName !== undefined) set('athleteName', normalizeAthleteName(patch.athleteName));
    if (patch.athleteAgeBand !== undefined) {
      if (!isAgeBand(patch.athleteAgeBand)) throw new IntakeError('invalid_input', { field: 'athleteAgeBand' });
      set('athleteAgeBand', patch.athleteAgeBand);
    }
    if (patch.throwingHand !== undefined) {
      if (patch.throwingHand !== null && patch.throwingHand !== 'R' && patch.throwingHand !== 'L') {
        throw new IntakeError('invalid_input', { field: 'throwingHand' });
      }
      set('throwingHand', patch.throwingHand);
    }
    if (patch.submitterRelation !== undefined) {
      if (!isSubmitterRelation(patch.submitterRelation)) throw new IntakeError('invalid_input', { field: 'submitterRelation' });
      set('submitterRelation', patch.submitterRelation);
    }
    if (patch.submitterName !== undefined) set('submitterName', cleanLabel(patch.submitterName, MAX_NAME_CHARS));
    if (patch.samePitchConfirmed !== undefined) set('samePitchConfirmed', patch.samePitchConfirmed === true);

    const ageChanged = 'athleteAgeBand' in data;
    if (ageBandBlocked(ageChanged ? patch.athleteAgeBand : sub.athleteAgeBand)) {
      /* 이미 비어 있으면 바뀐 것이 아니다 — 판을 올리지 않는다 */
      for (const key of ['athleteName', 'submitterName'] as const) {
        if (sub[key] != null) data[key] = null;
        else delete data[key];
      }
    }

    if (Object.keys(data).length === 0) return { version: sub.version };
    const next = await tx.intakeSubmission.update({ where: { id: sub.id }, data: { ...data, version: { increment: 1 } } });
    if (ageChanged) {
      await writeAudit(tx, { actor: { kind: 'invitee' }, action: 'draft.age_band_changed', submissionId: sub.id, detail: { from: sub.athleteAgeBand, to: patch.athleteAgeBand } }, now);
    }
    return { version: next.version };
  });
}

/* ────────────────────────────── 동의 ────────────────────────────── */

async function writeConsents(tx: Tx, sub: IntakeSubmission, answers: readonly ConsentAnswer[], now: Date): Promise<void> {
  if (ageBandBlocked(sub.athleteAgeBand)) throw new IntakeError('under_14');
  const latest = latestConsents(await consentDecisionRows(tx, sub.id), sub.submitterRelation);
  for (const a of answers) {
    if (!isConsentKind(a.kind)) throw new IntakeError('invalid_input', { field: 'consent' });
    const d = consentDocOf(a.kind);
    if (a.version !== d.version || a.textHash !== d.textHash) throw new IntakeError('consent_stale', { kind: a.kind });
    if (d.required && a.granted !== true) throw new IntakeError('consent_required', { kind: a.kind });
    const was = latest.get(a.kind);
    /* 보내는 사람의 관계가 바뀌면 같은 답이어도 새 줄이다 — 동의는 누구의 자격으로 했는지까지가 기록이다 */
    if (was && was.docVersion === d.version && was.textHash === d.textHash && was.granted === a.granted && was.relation === sub.submitterRelation) continue;
    await tx.intakeConsent.create({
      data: {
        submissionId: sub.id,
        kind: a.kind,
        docVersion: d.version,
        textHash: d.textHash,
        granted: a.granted === true,
        proxy: sub.submitterRelation !== 'self',
        relation: sub.submitterRelation,
        agreedAt: now,
      },
    });
    await writeAudit(tx, { actor: { kind: 'invitee' }, action: 'consent.recorded', submissionId: sub.id, detail: { kind: a.kind, granted: a.granted, docVersion: d.version, relation: sub.submitterRelation } }, now);
  }
}

/**
 * 지금 판의 원본을 더 쓸 수 없나(받는 사람 화면 · 다시 동의 판정용). 지운 · 지우는 중인 파일 말고도, 지울 날이 지났으면 크론이 아직 표시하기 전이라도
 * '지우고 있어요'로 본다 — 새 분석은 이미 막혀 있어서(analysis.ts originalsOverOf) '분석을 기다리고 있어요' · '이어서 진행해요'가 거짓이 된다.
 */
function originalsGoneNow(
  assets: readonly { id: string; status: string }[],
  revision: { sideAssetId: string | null; rearAssetId: string | null } | null,
  plan: ReturnType<typeof originalRetention>,
  now: Date,
): OriginalsGone | null {
  const gone = currentOriginalsGone(assets, revision);
  if (gone || !revision) return gone;
  return retentionDue(plan, now) ? 'deleting' : null;
}

/**
 * 동의를 남긴다. 같은 답을 다시 보내면 새 줄을 안 만든다. '영상 보내기'를 누른 순간, 바이트보다 먼저 부른다.
 * 접수 뒤에는 필수 동의가 낡은 때만 받는다 — 새 파일을 받는 일이 아니라서 올리기 기간과 상관없다(reconsentOpen).
 */
export async function recordConsents(
  db: Db,
  scope: IntakeScope,
  input: { answers: readonly ConsentAnswer[] },
  now: Date = new Date(),
): Promise<{ requiredOk: boolean }> {
  return db.$transaction(async (tx) => {
    const sub = await lockSubmission(tx, scope);
    const editing = sub.status === 'draft' || sub.status === 'correction_requested';
    await recheckScope(tx, scope, editing ? 'edit' : 'read', now);
    if (!editing) {
      const revision = sub.currentRevisionId ? await tx.intakeRevision.findUnique({ where: { id: sub.currentRevisionId }, select: { sideAssetId: true, rearAssetId: true } }) : null;
      const publishedAts = (await tx.intakePublication.findMany({ where: { submissionId: sub.id }, select: { publishedAt: true } })).map((p) => p.publishedAt);
      const plan = originalRetention({ publishedAts, lastFrozenAt: sub.lastFinalizedAt, withdrawnAt: sub.withdrawnAt });
      const gone = originalsGoneNow(await tx.intakeAsset.findMany({ where: { submissionId: sub.id }, select: { id: true, status: true } }), revision, plan, now);
      if (!reconsentOpen(sub.status, hasRequiredConsents(await consentDecisionRows(tx, sub.id), sub.submitterRelation), gone)) throw new IntakeError('not_editable');
    }
    await writeConsents(tx, sub, input.answers, now);
    return { requiredOk: hasRequiredConsents(await consentDecisionRows(tx, sub.id), sub.submitterRelation) };
  });
}

/** 공개 중인 판을 닫는다 — 철회할 때 부른다. 공개 칸을 남겨 두면 목록이 '공개 중'으로 거짓말한다. adminId 가 없으면 받는 사람이 거둔 것이다 */
async function closePublication(tx: Tx, submissionId: string, adminId: string | null, now: Date): Promise<boolean> {
  const closed = await tx.intakePublication.updateMany({ where: { activeFor: submissionId }, data: { activeFor: null, unpublishedAt: now, unpublishedByAdminId: adminId } });
  if (closed.count > 0) await tx.intakeSubmission.update({ where: { id: submissionId }, data: { publicationStatus: 'unpublished' } });
  return closed.count > 0;
}

/**
 * 동의를 거둔다. 필수 동의를 거두면 접수가 'withdrawn' 이 되어 분석 · 공개가 멈춘다.
 * 원본은 여기서 지우지 않는다 — 철회 시각을 남기면 보유 기간 규칙이 지울 날을 정한다(lib/intake/retention.ts). 모델 개발 동의는 이 철회로 거두지 않는다.
 * 감사 기록은 실제로 바뀐 때만 남긴다 — 링크를 쥔 사람이 빈 철회를 되풀이해 관리자 기록을 밀어내지 못하게. 횟수 제한은 라우트가 건다('withdraw').
 */
export async function withdrawConsent(
  db: Db,
  scope: IntakeScope,
  input: { kind: IntakeConsentKind },
  now: Date = new Date(),
): Promise<{ submissionWithdrawn: boolean }> {
  if (!isConsentKind(input.kind)) throw new IntakeError('invalid_input', { field: 'kind' });
  return db.$transaction(async (tx) => {
    const sub = await lockSubmission(tx, scope);
    await recheckScope(tx, scope, 'read', now);
    /* 거부한 줄은 거둘 것이 없다 — 동의한 적 없는 사람의 철회로 남지 않게 */
    const changed = await tx.intakeConsent.updateMany({ where: { submissionId: sub.id, kind: input.kind, granted: true, withdrawnAt: null }, data: { withdrawnAt: now } });
    const required = consentDocOf(input.kind).required;
    const stop = required && sub.status !== 'withdrawn';
    if (stop) {
      assertSubmissionMove(sub.status as never, 'withdrawn');
      await tx.intakeSubmission.update({ where: { id: sub.id }, data: { status: 'withdrawn', withdrawnAt: now, version: { increment: 1 } } });
      await closePublication(tx, sub.id, null, now);
    }
    if (changed.count > 0 || stop) {
      await writeAudit(tx, { actor: { kind: 'invitee' }, action: 'consent.withdrawn', submissionId: sub.id, detail: { kind: input.kind } }, now);
    }
    return { submissionWithdrawn: required };
  });
}

/* ────────────────────────────── 자산 ────────────────────────────── */

export type ReserveAssetInput = {
  view: IntakeView;
  /** 화면이 알던 이 칸의 자산 번호 — 비어 있었으면 null */
  expectedAssetId: string | null;
  fileName: string;
  sizeBytes: number;
  declaredType?: string | null;
  /** 브라우저가 전체 파일로 잰 SHA-256 */
  sha256: string;
  /** 보내는 사람이 방금 이 짝을 같은 투구라고 확인했나 — 처음 보낼 때 · 다시 확인한 뒤의 전송이다 */
  pairConfirmed?: boolean;
};

/**
 * 칸에 파일을 고른다 — 새 자산(새 경로)을 만들고 칸이 그것을 가리키게 한다. 옛 자산의 바이트는 건드리지 않는다.
 * 같은 칸에 같은 파일이면 있던 자산을 돌려준다(응답을 잃고 다시 불러도, 새로고침 뒤 같은 파일을 다시 골라도).
 * 짝이 달라지면 '같은 투구' 확인을 지운다 — 그 확인은 옛 짝에 대한 것이었다. 칸을 다른 파일로 바꿀 때도, 한쪽이 있는데 빈 칸을 채울 때도 그렇다.
 * 방금 이 짝을 확인하고 보내는 전송(pairConfirmed)이면 지우지 않고, finalize 나 saveDraft 에서 다시 받지 않아도 된다.
 */
export async function reserveAsset(
  db: Db,
  scope: IntakeScope,
  input: ReserveAssetInput,
  now: Date = new Date(),
): Promise<{ asset: PublicAsset; version: number; created: boolean }> {
  if (!isIntakeView(input.view)) throw new IntakeError('invalid_input', { field: 'view' });
  const sha = typeof input.sha256 === 'string' ? input.sha256.toLowerCase() : '';
  if (!SHA256_RE.test(sha)) throw new IntakeError('invalid_input', { field: 'sha256' });
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) throw new IntakeError('invalid_input', { field: 'sizeBytes' });
  if (input.sizeBytes === 0) throw new IntakeError('file_empty');
  const fileName = cleanLabel(input.fileName, 255) ?? '이름 없는 영상';

  return db.$transaction(async (tx) => {
    const sub = await lockSubmission(tx, scope);
    const inv = await recheckScope(tx, scope, 'upload', now);
    if (ageBandBlocked(sub.athleteAgeBand)) throw new IntakeError('under_14');
    if (!canEditView(sub.status, readCorrection(sub.correction), input.view)) throw new IntakeError('not_editable', { view: input.view });

    const slot = slotOf(input.view);
    const currentId = sub[slot];
    const current = currentId ? await tx.intakeAsset.findUnique({ where: { id: currentId } }) : null;
    /*
     * 고침 중이면 마지막 판에 얼린 이 칸의 파일이다. 확인을 마친 그 파일과 같은 영상이면 다시 받아도 판이 안 바뀌어 고침을 끝낼 수 없다 — 고를 때 바로 말한다.
     * 확인이 안 끝났거나 막혔거나 지운 파일은 같은 영상을 다시 받아 새로 확인한다. 얼린 자산을 그대로 돌려주면 칸이 안 바뀌어 같은 막힘으로 되돌아온다.
     */
    const latest = sub.status === 'correction_requested' ? await tx.intakeRevision.findFirst({ where: { submissionId: sub.id }, orderBy: { number: 'desc' } }) : null;
    const frozenId = latest ? slotOfRevision(latest, input.view) : null;
    const frozen = frozenId == null ? null : frozenId === current?.id ? current : await tx.intakeAsset.findUnique({ where: { id: frozenId } });
    if (frozen?.clientSha256 === sha && (frozen.status === 'verified' || frozen.status === 'unconfirmed')) throw new IntakeError('same_as_sent', { view: input.view });
    /* 지웠거나 지우는 중인 원본과 같은 파일이어도 바이트는 믿을 수 없다 — 새 자산으로 다시 받는다 */
    if (current && current.id !== frozenId && current.clientSha256 === sha && Number(current.declaredSize) === input.sizeBytes && current.status !== 'rejected' && !assetGone(current.status)) {
      return { asset: publicAsset(current), version: sub.version, created: false };
    }
    if ((input.expectedAssetId ?? null) !== (currentId ?? null)) throw new IntakeError('stale_selection', { view: input.view, currentAssetId: currentId });

    const otherId = sub[slotOf(otherView(input.view))];
    const otherRow = otherId ? await tx.intakeAsset.findUnique({ where: { id: otherId } }) : null;
    /* 지웠거나 지우는 중인 원본은 저장소에 없다고 친다 — 같은 파일 · 합계 한도를 견줄 때 없는 것으로 본다 */
    const other = otherRow && assetGone(otherRow.status) ? null : otherRow;
    if (other?.clientSha256 === sha) throw new IntakeError('same_file', { view: input.view });

    const limits = intakeLimits(inv);
    if (input.sizeBytes > limits.maxFileBytes) throw new IntakeError('file_too_large', { maxFileBytes: limits.maxFileBytes });
    if (input.sizeBytes + Number(other?.declaredSize ?? 0) > limits.maxTotalBytes) throw new IntakeError('total_too_large', { maxTotalBytes: limits.maxTotalBytes });
    if ((await tx.intakeAsset.count({ where: { submissionId: sub.id, status: { notIn: [...ASSET_GONE] } } })) >= limits.maxAssets) throw new IntakeError('too_many_assets');

    if (current) {
      const frozen = await tx.intakeRevision.count({
        where: { submissionId: sub.id, OR: [{ sideAssetId: current.id }, { rearAssetId: current.id }] },
      });
      /* 얼린 판이 가리키는 자산은 상태를 안 바꾼다 — 칸만 새 자산으로 옮긴다 */
      if (!frozen && canMoveAsset(current.status as never, 'replaced')) {
        await tx.intakeAsset.update({ where: { id: current.id }, data: { status: 'replaced' } });
      }
    }

    const pairChanged = current ? current.clientSha256 !== sha : otherRow != null;
    const id = randomUUID();
    const asset = await tx.intakeAsset.create({
      data: {
        id,
        submissionId: sub.id,
        view: input.view,
        objectPath: assetObjectPath(sub.id, id),
        originalName: fileName,
        declaredType: cleanLabel(input.declaredType, 100),
        declaredSize: BigInt(input.sizeBytes),
        clientSha256: sha,
        createdAt: now,
      },
    });
    const next = await tx.intakeSubmission.update({
      where: { id: sub.id },
      data: { [slot]: id, version: { increment: 1 }, ...(pairChanged ? { samePitchConfirmed: input.pairConfirmed === true } : {}) },
    });
    await writeAudit(tx, { actor: { kind: 'invitee' }, action: current ? 'asset.replaced' : 'asset.reserved', submissionId: sub.id, detail: { view: input.view, assetId: id, replacedAssetId: current?.id ?? null } }, now);
    return { asset: publicAsset(asset), version: next.version, created: true };
  });
}

async function ownedAsset(db: Db | Tx, scope: IntakeScope, assetId: string): Promise<IntakeAsset> {
  if (!isIntakeId(assetId)) throw new IntakeError('asset_not_found');
  const asset = await db.intakeAsset.findFirst({ where: { id: assetId, submissionId: scope.submissionId } });
  if (!asset) throw new IntakeError('asset_not_found');
  return asset;
}

/**
 * 잠그지 않고 범위를 본다 — 저장소를 오가는 일(전송 토큰 · 도착 확인)이 줄을 오래 쥐지 않게. 링크를 바꾼 뒤의 예전 범위도 여기서 막는다.
 * 읽은 뒤에 바뀔 수 있으니, 되돌릴 수 없는 것을 내주는 issueUploadToken 과 줄을 쓰는 registerUploadUrl · confirmUpload 는 마지막에 잠근 채 한 번 더 본다.
 */
async function openGate(db: Db, scope: IntakeScope, op: IntakeOp, now: Date): Promise<IntakeSubmission & { invitation: IntakeInvitation }> {
  const sub = await db.intakeSubmission.findUnique({ where: { id: scope.submissionId }, include: { invitation: true } });
  if (!sub || sub.invitationId !== scope.invitationId) throw new IntakeError('submission_not_found');
  assertScopeToken(sub.invitation, scope);
  assertInvitationAllows(sub.invitation, op, now);
  return sub;
}

export type UploadGrant = {
  assetId: string;
  endpoint: string;
  token: string;
  tokenTtlMs: number;
  apikey: string | null;
  bucket: string;
  objectName: string;
  contentType: string;
  chunkSize: number;
  /** 아직 살아 있는 업로드 주소 — 있으면 거기서 이어 간다 */
  uploadUrl: string | null;
  transportExpiresAt: string | null;
};

/**
 * 전송 토큰을 준다 — 이 자산의 경로 하나에만 쓰인다. 토큰이 끝나면 다시 부른다(같은 업로드 주소에 새 토큰으로 이어 갈 수 있다).
 * 필수 동의가 없으면 주지 않는다. 폐기 뒤에는 새 토큰이 안 나가지만, 이미 준 토큰은 저장소에서 바로 거둘 수 없다(수명까지 산다).
 */
export async function issueUploadToken(
  db: Db,
  storage: IntakeStorage,
  scope: IntakeScope,
  input: { assetId: string },
  now: Date = new Date(),
): Promise<UploadGrant> {
  const sub = await openGate(db, scope, 'upload', now);
  if (ageBandBlocked(sub.athleteAgeBand)) throw new IntakeError('under_14');
  const asset = await ownedAsset(db, scope, input.assetId);
  if (sub[slotOf(asset.view as IntakeView)] !== asset.id) throw new IntakeError('asset_not_selected');
  if (assetArrived(asset.status) || asset.status === 'rejected') throw new IntakeError('asset_finished');
  if (!assetInTransit(asset.status)) throw new IntakeError('asset_not_selected');
  if (!canEditView(sub.status, readCorrection(sub.correction), asset.view as IntakeView)) throw new IntakeError('not_editable');
  if (!hasRequiredConsents(await consentDecisionRows(db, sub.id), sub.submitterRelation)) throw new IntakeError('consent_required');

  let issued;
  try {
    issued = await storage.issueUpload(asset.objectPath);
  } catch (e) {
    /* 응답을 잃은 사이 전송이 끝났으면 경로에 이미 객체가 있어 서명이 막힌다 — '끝남'으로 알려 confirmUpload 로 넘긴다 */
    if ((await storage.stat(asset.objectPath).catch(() => null)) != null) throw new IntakeError('asset_finished');
    throw e;
  }

  /*
   * 내주기 전에 접수 줄을 잠그고 범위를 다시 본다 — 서명을 받는 사이 링크를 바꿨거나(예전 토큰) 폐기 · 기간이 끝났으면 받은 서명을 버린다.
   * 저장소 토큰은 내준 뒤에는 거둘 수 없어서, 이 잠금을 지난 것만 응답으로 나간다. 바꾸기가 이 잠금 뒤에 오면 그보다 먼저 내준 토큰이다.
   */
  await db.$transaction(async (tx) => {
    await lockSubmission(tx, scope);
    await recheckScope(tx, scope, 'upload', now);
    const moved = await tx.intakeAsset.updateMany({
      where: { id: asset.id, status: { in: ['reserved', 'uploading'] } },
      data: { status: 'uploading', tokenIssuedAt: now, tokenCount: { increment: 1 } },
    });
    if (moved.count === 0) throw new IntakeError('asset_not_selected');
  });

  const alive = asset.uploadUrl && asset.transportExpiresAt && asset.transportExpiresAt.getTime() > now.getTime();
  return {
    assetId: asset.id,
    ...issued,
    contentType: asset.declaredType?.startsWith('video/') ? asset.declaredType : 'application/octet-stream',
    chunkSize: TUS_CHUNK_BYTES,
    uploadUrl: alive ? asset.uploadUrl : null,
    transportExpiresAt: alive ? asset.transportExpiresAt!.toISOString() : null,
  };
}

/** 저장소가 준 업로드 주소를 남긴다 — 새로고침 뒤 이어 가는 데 쓴다. 저장소 주소가 아니면 받지 않는다 */
export async function registerUploadUrl(
  db: Db,
  storage: IntakeStorage,
  scope: IntakeScope,
  input: { assetId: string; uploadUrl: string },
  now: Date = new Date(),
): Promise<{ transportExpiresAt: string }> {
  await openGate(db, scope, 'upload', now);
  const asset = await ownedAsset(db, scope, input.assetId);
  const prefix = `${storage.uploadOrigin}/storage/v1/upload/resumable/`;
  if (typeof input.uploadUrl !== 'string' || !input.uploadUrl.startsWith(prefix) || input.uploadUrl.length > 1024 || /[?#\s]/.test(input.uploadUrl)) {
    throw new IntakeError('upload_url_invalid');
  }
  if (!assetInTransit(asset.status)) throw new IntakeError('asset_finished');
  if (asset.uploadUrl === input.uploadUrl && asset.transportExpiresAt) return { transportExpiresAt: asset.transportExpiresAt.toISOString() };
  const transportExpiresAt = new Date(now.getTime() + TUS_URL_TTL_MS);
  /* 적기 전에 접수 줄을 잠그고 범위를 다시 본다 — 위의 읽기 뒤 링크를 바꿨으면(예전 토큰) 주소를 남기지 않는다(issueUploadToken 과 같은 차례) */
  await db.$transaction(async (tx) => {
    await lockSubmission(tx, scope);
    await recheckScope(tx, scope, 'upload', now);
    const moved = await tx.intakeAsset.updateMany({
      where: { id: asset.id, status: { in: ['reserved', 'uploading'] } },
      data: { uploadUrl: input.uploadUrl, transportExpiresAt },
    });
    if (moved.count === 0) throw new IntakeError('asset_finished');
  });
  return { transportExpiresAt: transportExpiresAt.toISOString() };
}

export const verifyJobKey = (assetId: string) => `verify_asset:${assetId}`;

/**
 * 저장소에 객체가 있으면 '도착'으로 적고 검증을 건다. 크기가 다르면 막는다. confirmUpload · 대사(reconcileUploads)가 같이 쓴다.
 * scope 는 공개 길(confirmUpload)만 넘긴다 — 접수 줄을 잠그고 범위를 다시 봐, 저장소를 보는 사이 링크를 바꿨으면 예전 토큰의 확인을 적지 않는다.
 * 대사는 범위 없이 적는다(바이트는 와 있으니 새 링크의 확인이나 다음 대사가 같은 일을 한다).
 */
async function markArrived(db: Db, asset: IntakeAsset, size: number, now: Date, scope?: IntakeScope): Promise<IntakeAsset> {
  const sizeOk = size === Number(asset.declaredSize);
  return db.$transaction(async (tx) => {
    if (scope) {
      await lockSubmission(tx, scope);
      await recheckScope(tx, scope, 'confirm', now);
    }
    const moved = await tx.intakeAsset.updateMany({
      where: { id: asset.id, status: { in: ['reserved', 'uploading'] } },
      data: sizeOk
        ? { status: 'uploaded', storedBytes: BigInt(size), uploadedAt: now }
        : { status: 'rejected', storedBytes: BigInt(size), rejectCode: 'size_mismatch' },
    });
    if (moved.count > 0 && sizeOk) await enqueueJob(tx, { kind: 'verify_asset', dedupeKey: verifyJobKey(asset.id), payload: { assetId: asset.id }, runAfter: now });
    if (moved.count > 0) {
      await writeAudit(tx, { actor: { kind: 'system' }, action: sizeOk ? 'asset.arrived' : 'asset.size_mismatch', submissionId: asset.submissionId, detail: { assetId: asset.id, size } }, now);
    }
    return tx.intakeAsset.findUniqueOrThrow({ where: { id: asset.id } });
  });
}

/**
 * 전송이 끝났음을 알린다 — 서버가 저장소를 직접 본다. 아직 없으면 'upload_missing'.
 * 올리기 기간이 지나도 된다(새 전송이 아니라 끝난 전송의 확인이라서). 폐기되면 막힌다.
 */
export async function confirmUpload(
  db: Db,
  storage: IntakeStorage,
  scope: IntakeScope,
  input: { assetId: string },
  now: Date = new Date(),
): Promise<PublicAsset> {
  await openGate(db, scope, 'confirm', now);
  const asset = await ownedAsset(db, scope, input.assetId);
  if (!assetInTransit(asset.status)) return publicAsset(asset);
  const stat = await storage.stat(asset.objectPath);
  if (!stat) throw new IntakeError('upload_missing');
  const next = await markArrived(db, asset, stat.size, now, scope);
  if (next.status === 'rejected') throw new IntakeError('upload_size_mismatch');
  return publicAsset(next);
}

/* ────────────────────────────── 완료 ────────────────────────────── */

export type FinalizeInput = {
  expectedVersion: number;
  /** 화면이 한 번 만들어 재시도에도 같은 값을 보낸다 */
  idempotencyKey: string;
  samePitchConfirmed?: boolean;
  consents?: readonly ConsentAnswer[];
  /** 화면이 보여 준 짝 — 주면 칸이 그 자산일 때만 얼린다. 다른 기기가 바꿨으면 'stale_selection' */
  expectedAssets?: ExpectedPair;
};

/** 칸별로 화면이 알던 자산 번호 — 준 칸만 맞춰 본다 */
export type ExpectedPair = Partial<Record<IntakeView, string>>;

export type IntakeReceipt = {
  /** false 면 이미 접수된 것을 돌려준 것이다 */
  created: boolean;
  revision: number;
  receiptCode: string;
  receivedAt: string;
  receiptDate: string;
  athleteName: string;
  submissionStatus: string;
  version: number;
};

const receiptOf = (sub: IntakeSubmission, revision: { number: number; athleteName: string }, created: boolean): IntakeReceipt => ({
  created,
  revision: revision.number,
  receiptCode: sub.receiptCode!,
  receivedAt: sub.receivedAt!.toISOString(),
  receiptDate: seoulDateKey(sub.receivedAt!),
  athleteName: revision.athleteName,
  submissionStatus: sub.status,
  version: sub.version,
});

/**
 * 올리기 기간이 지난 뒤의 완료 — 기간 안에 시작한 전송이 막다른 길이 되지 않게 받는다.
 * 고른 두 파일이 도착했거나 토큰을 기간 안에 받았어야 한다. 아직 오는 중이면 뒤의 'assets_incomplete' 가 기다리라고 말한다.
 * 새 파일을 받는 고침이 아니면(글 칸만 요청) 기간이 끝난 뒤에는 고칠 수 없으니 막는다.
 */
async function assertLateFinalize(tx: Tx, sub: IntakeSubmission, inv: IntakeInvitation): Promise<void> {
  const correction = sub.status === 'correction_requested' ? readCorrection(sub.correction) : null;
  if (sub.status === 'correction_requested' && !correction?.views.length) throw new IntakeError('upload_expired');
  const ids = [sub.sideAssetId, sub.rearAssetId].filter((id): id is string => id != null);
  const pair = await tx.intakeAsset.findMany({ where: { id: { in: ids }, submissionId: sub.id } });
  const inTime = (a: IntakeAsset) => assetArrived(a.status) || (assetInTransit(a.status) && a.tokenIssuedAt != null && a.tokenIssuedAt.getTime() < inv.uploadExpiresAt.getTime());
  if (pair.length !== 2 || !pair.every(inTime)) throw new IntakeError('upload_expired');
}

/**
 * 접수를 끝낸다 — 지금 고른 짝을 얼리고 영수증을 준다. 여러 번 눌러도 · 응답을 잃어도 판은 하나다.
 * 여기까지는 '도착'까지만 본다. 전체 해시 대조는 일꾼의 몫이고, 끝나면 'verified' 가 된다.
 * 판을 만든 뒤의 정산이 끊겨도 영수증은 돌려준다 — 판은 이미 있다. 정산은 재시도나 크론이 잇는다.
 */
export async function finalizeSubmission(db: Db, scope: IntakeScope, input: FinalizeInput, now: Date = new Date()): Promise<IntakeReceipt> {
  if (!isIdempotencyKey(input.idempotencyKey)) throw new IntakeError('invalid_input', { field: 'idempotencyKey' });

  const out = await db.$transaction(async (tx) => {
    const sub = await lockSubmission(tx, scope);

    const same = await tx.intakeRevision.findUnique({ where: { submissionId_finalizeKey: { submissionId: sub.id, finalizeKey: input.idempotencyKey } } });
    if (same) {
      /* 응답을 잃은 재시도 — 폐기만 아니면 기간이 지나도 영수증은 돌려준다 */
      await recheckScope(tx, scope, 'read', now);
      return { receipt: receiptOf(sub, same, false), settle: same.status === 'pending' ? same.id : null };
    }

    const inv = await recheckScope(tx, scope, 'read', now);
    if (sub.status !== 'draft' && sub.status !== 'correction_requested') {
      if (sub.status === 'withdrawn') throw new IntakeError('invalid_state');
      const latest = await tx.intakeRevision.findFirstOrThrow({ where: { submissionId: sub.id }, orderBy: { number: 'desc' } });
      return { receipt: receiptOf(sub, latest, false), settle: latest.status === 'pending' ? latest.id : null };
    }
    if (uploadExpired(inv, now)) await assertLateFinalize(tx, sub, inv);
    if (input.expectedVersion !== sub.version) throw new IntakeError('stale_version', { currentVersion: sub.version });
    for (const view of ['side', 'rear'] as const) {
      const want = input.expectedAssets?.[view];
      if (want && sub[slotOf(view)] !== want) throw new IntakeError('stale_selection', { view, currentAssetId: sub[slotOf(view)] });
    }

    /* 나이부터 본다 — 만 14세 미만이면 이름을 남기지 않아서 '이름 없음'이 먼저 나오면 까닭이 틀린다 */
    if (ageBandBlocked(sub.athleteAgeBand)) throw new IntakeError('under_14');
    if (!sub.athleteName) throw new IntakeError('athlete_name_required');
    if (!sub.athleteAgeBand) throw new IntakeError('age_band_required');
    if (!(input.samePitchConfirmed ?? sub.samePitchConfirmed)) throw new IntakeError('same_pitch_required');

    if (input.consents?.length) await writeConsents(tx, sub, input.consents, now);
    const consentRows = await consentDecisionRows(tx, sub.id);
    if (!hasRequiredConsents(consentRows, sub.submitterRelation)) throw new IntakeError('consent_required');

    if (!sub.sideAssetId || !sub.rearAssetId) {
      /* 고침 중에 요청받은 칸이 비었으면 끊긴 전송을 정리가 버린 칸이다 — 오는 중인 전송이 없으니 기다리라고 하지 않고 그 칸을 고치라고 답한다 */
      const asked = sub.status === 'correction_requested' ? (readCorrection(sub.correction)?.views ?? []) : [];
      const empty = (['side', 'rear'] as const).filter((v) => !sub[slotOf(v)]);
      throw new IntakeError(empty.some((v) => asked.includes(v)) ? 'correction_incomplete' : 'assets_incomplete', { empty });
    }
    const pair = await tx.intakeAsset.findMany({ where: { id: { in: [sub.sideAssetId, sub.rearAssetId] }, submissionId: sub.id } });
    const side = pair.find((a) => a.id === sub.sideAssetId);
    const rear = pair.find((a) => a.id === sub.rearAssetId);
    if (!side || !rear) throw new IntakeError('assets_incomplete');
    /*
     * 막혔거나 지운 칸이 요청에 빠졌다(요청보다 앞선 줄 등) — 받는 사람이 그 칸을 고칠 수 없어 끝낼 수 없다. 요청에 넣고 그 칸을 고치라고 답한다.
     * 넣은 것은 남아야 해서 여기서 던지지 않고 돌려준다. 거래가 끝난 뒤에 던진다.
     */
    const widened = await widenOpenCorrection(tx, sub, now);
    if (widened.length) return { widened };
    /* 지웠거나 지우는 중인 칸은 전송을 기다릴 일이 아니라 새 파일을 받아야 한다 — 이 파일로 판을 얼리면 시계가 다시 돈 채 원본이 사라진다 */
    if (assetGone(side.status) || assetGone(rear.status)) throw new IntakeError('correction_incomplete', { side: side.status, rear: rear.status });

    const prior = await tx.intakeRevision.findFirst({ where: { submissionId: sub.id }, orderBy: { number: 'desc' } });
    const correction = sub.status === 'correction_requested' ? readCorrection(sub.correction) : null;
    /*
     * 요청받은 칸을 새로 안 받았다 — 막힌 파일이거나 얼린 그 파일 그대로다. 전송은 끝났으니 '전송이 안 끝났다'(assets_incomplete)가 아니라 고치라고 답한다.
     * 고침 화면도 공개 상태의 frozenAssetIds 로 같은 칸을 보내기 전에 막는다.
     */
    if (correction) {
      const repick = correctionRepickViews(correction.views, { side, rear }, prior ? { side: prior.sideAssetId, rear: prior.rearAssetId } : null);
      if (repick.length) throw new IntakeError('correction_incomplete', { views: repick });
    }
    if (!assetArrived(side.status) || !assetArrived(rear.status)) throw new IntakeError('assets_incomplete', { side: side.status, rear: rear.status });
    if (side.clientSha256 === rear.clientSha256 || (side.serverSha256 && side.serverSha256 === rear.serverSha256)) throw new IntakeError('same_file');

    /* 판에는 지금 보내는 사람의 답만 얼린다 — 옛 관계의 답을 얼리면 판의 기록이 앱의 판단과 어긋난다 */
    const latest = latestConsents(consentRows, sub.submitterRelation);
    const revision = await tx.intakeRevision.create({
      data: {
        submissionId: sub.id,
        number: (prior?.number ?? 0) + 1,
        sideAssetId: side.id,
        rearAssetId: rear.id,
        athleteName: sub.athleteName,
        throwingHand: sub.throwingHand,
        submitterRelation: sub.submitterRelation,
        submitterName: sub.submitterName,
        consentSnapshot: [...latest.values()].map((c) => ({ kind: c.kind, docVersion: c.docVersion, textHash: c.textHash, granted: c.granted, relation: sub.submitterRelation })),
        finalizeKey: input.idempotencyKey,
        finalizedAt: now,
      },
    });

    assertSubmissionMove(sub.status as never, 'submitted');
    const next = await tx.intakeSubmission.update({
      where: { id: sub.id },
      data: {
        status: 'submitted',
        version: { increment: 1 },
        samePitchConfirmed: true,
        currentRevisionId: revision.id,
        receiptCode: sub.receiptCode ?? generateReceiptCode(now),
        receivedAt: sub.receivedAt ?? now,
        lastFinalizedAt: now,
        analysisStatus: 'none',
        correction: Prisma.DbNull,
      },
    });

    for (const a of [side, rear]) {
      if (a.status === 'uploaded') await enqueueJob(tx, { kind: 'verify_asset', dedupeKey: verifyJobKey(a.id), payload: { assetId: a.id }, runAfter: now });
    }
    await writeAudit(tx, { actor: { kind: 'invitee' }, action: 'submission.finalized', submissionId: sub.id, detail: { revision: revision.number, receiptCode: next.receiptCode } }, now);
    return { receipt: receiptOf(next, revision, true), settle: revision.id };
  });
  if ('widened' in out) throw new IntakeError('correction_incomplete', { views: out.widened });
  const { receipt, settle } = out;

  /* 두 파일이 이미 검증을 마쳤으면(고침 뒤 다시 낸 경우 등) 일꾼을 기다리지 않는다 */
  if (settle) {
    try {
      await settleRevision(db, settle, now);
      const sub = await db.intakeSubmission.findUniqueOrThrow({ where: { id: scope.submissionId } });
      return { ...receipt, submissionStatus: sub.status, version: sub.version };
    } catch (e) {
      console.error(`[intake] settle: ${e instanceof Error ? e.name : 'unknown'}`);
    }
  }
  return receipt;
}

/* ────────────────────────────── 고침 요청(관리자) ────────────────────────────── */

export type CorrectionInput = {
  adminId: string;
  submissionId: string;
  fields?: readonly CorrectableField[];
  views?: readonly IntakeView[];
  message?: string | null;
  /** 올리기 기간이 끝났으면 늘린다 — 안 늘리면 받은 사람이 못 고친다 */
  extendUploadUntil?: Date;
  /** 화면이 알던 판 — 주면 잠근 뒤 맞춰 본다(두 관리자가 같은 접수를 보고 있을 때) */
  expectedVersion?: number;
};

const slotOfRevision = (rev: IntakeRevision, view: IntakeView) => (view === 'side' ? rev.sideAssetId : rev.rearAssetId);

/**
 * 고침 중에 바뀐 칸 · 글을 얼린 판 값으로 되돌린다 — 요청에서 빠진 것 또는 고침 취소 때 부른다. 돌려줄 값만 만들고 쓰기는 부르는 쪽이 한다.
 * 칸에서 밀려난 자산은 어떤 판에도 없으면 'replaced' 로 옮겨 정리 대상이 되게 한다. 바이트는 건드리지 않는다.
 * 던지는 손은 고침을 열 때의 값으로 돌아간다 — 관리자가 정한 손은 접수 칸에만 있어서, 판 값으로 되돌리면 그 답이 사라진다.
 */
async function restoreFrozen(
  tx: Tx,
  sub: IntakeSubmission,
  rev: IntakeRevision,
  views: readonly IntakeView[],
  fields: readonly CorrectableField[],
  correction: CorrectionRequest | null,
): Promise<Prisma.IntakeSubmissionUpdateInput> {
  const data: Record<string, unknown> = {};
  for (const view of views) {
    const was = sub[slotOf(view)];
    const frozen = slotOfRevision(rev, view);
    if (was === frozen) continue;
    data[slotOf(view)] = frozen;
    if (!was) continue;
    const kept = await tx.intakeRevision.count({ where: { OR: [{ sideAssetId: was }, { rearAssetId: was }] } });
    const asset = await tx.intakeAsset.findUnique({ where: { id: was } });
    if (!kept && asset && canMoveAsset(asset.status as never, 'replaced')) await tx.intakeAsset.update({ where: { id: was }, data: { status: 'replaced' } });
  }
  for (const field of fields) {
    const was = field === 'throwingHand' && correction?.handBefore !== undefined ? correction.handBefore : rev[field];
    if (sub[field] !== was) data[field] = was;
  }
  const pairIsFrozen = (['side', 'rear'] as const).every((v) => ((data[slotOf(v)] as string | undefined) ?? sub[slotOf(v)]) === slotOfRevision(rev, v));
  if (pairIsFrozen) data.samePitchConfirmed = true;
  return data;
}

/** 관리자 동작이 접수를 잠그고 읽는다 — 범위가 없으니 번호로 찾는다 */
async function lockForAdmin(tx: Tx, submissionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${submissionId} FOR UPDATE`;
  const sub = await tx.intakeSubmission.findUnique({ where: { id: submissionId }, include: { invitation: true } });
  if (!sub) throw new IntakeError('submission_not_found');
  return sub;
}

/** 원본을 지웠거나 지우는 중인 칸 — 칸의 파일이나 얼린 판의 파일이 그렇다면 그 칸은 새 파일을 받아야 한다 */
export async function purgedViews(tx: Tx, sub: Pick<IntakeSubmission, 'sideAssetId' | 'rearAssetId'>, rev: Pick<IntakeRevision, 'sideAssetId' | 'rearAssetId'> | null): Promise<IntakeView[]> {
  const ids = [sub.sideAssetId, sub.rearAssetId, rev?.sideAssetId, rev?.rearAssetId].filter((id): id is string => id != null);
  const gone = new Set((await tx.intakeAsset.findMany({ where: { id: { in: ids }, status: { in: [...ASSET_GONE] } }, select: { id: true } })).map((a) => a.id));
  return (['side', 'rear'] as const).filter((v) => {
    const slot = sub[slotOf(v)];
    const frozen = rev?.[slotOf(v)];
    return (slot != null && gone.has(slot)) || (frozen != null && gone.has(frozen));
  });
}

/**
 * 새 파일을 받아야 판을 얼릴 수 있는 칸 — 원본을 지웠거나 지우는 중이거나, 파일 검증에서 막힌('rejected') 칸이다. 칸의 파일과 얼린 판의 파일을 둘 다 본다.
 * 막힌 파일은 받는 사람이 그 칸을 고치지 않으면 끝낼 수 없어서, 요청받지 않은 칸이면 받는 사람이 막힌다.
 */
export async function blockedViews(tx: Tx, sub: Pick<IntakeSubmission, 'sideAssetId' | 'rearAssetId'>, rev: Pick<IntakeRevision, 'sideAssetId' | 'rearAssetId'> | null): Promise<IntakeView[]> {
  const ids = [sub.sideAssetId, sub.rearAssetId, rev?.sideAssetId, rev?.rearAssetId].filter((id): id is string => id != null);
  const bad = new Set((await tx.intakeAsset.findMany({ where: { id: { in: ids }, status: { in: [...ASSET_GONE, 'rejected'] } }, select: { id: true } })).map((a) => a.id));
  return (['side', 'rear'] as const).filter((v) => {
    const slot = sub[slotOf(v)];
    const frozen = rev?.[slotOf(v)];
    return (slot != null && bad.has(slot)) || (frozen != null && bad.has(frozen));
  });
}

/**
 * 연 고침 요청에 막힌 칸이 빠졌으면 넣는다 — 요청한 뒤에 파일이 막힌 경우다. 넣은 칸을 돌려준다. 부르는 쪽이 접수를 잠근다.
 * 판 번호가 같이 올라 낡은 화면은 다시 읽고, 받는 사람은 그 칸에 새 파일을 낼 수 있다.
 */
async function widenOpenCorrection(tx: Tx, sub: IntakeSubmission, now: Date): Promise<IntakeView[]> {
  const open = sub.status === 'correction_requested' ? readCorrection(sub.correction) : null;
  if (!open) return [];
  const rev = sub.currentRevisionId ? await tx.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } }) : null;
  const add = (await blockedViews(tx, sub, rev)).filter((v) => !open.views.includes(v));
  if (add.length === 0) return [];
  const correction: CorrectionRequest = { ...open, views: [...open.views, ...add] };
  await tx.intakeSubmission.update({ where: { id: sub.id }, data: { correction, version: { increment: 1 } } });
  await writeAudit(tx, { actor: { kind: 'system' }, action: 'correction.widened', submissionId: sub.id, detail: { views: add } }, now);
  return add;
}

/**
 * 고쳐 달라고 다시 연다 — 요청한 칸만 열린다. 얼린 판 · 옛 자산은 그대로다.
 * 이미 고침 중이면 요청 내용을 바꾼다: 기간을 늘리거나 칸을 더하고 뺄 수 있다. 뺀 칸에서 받는 사람이 고친 것은 얼린 판 값으로 돌아간다.
 * 원본을 지웠거나 지우는 중인 칸 · 파일 검증에서 막힌 칸은 언제나 요청에 넣는다 — 그 파일로는 판을 얼릴 수 없어서, 글만 고치라고 하면 받는 사람이 끝낼 수 없다. 삭제가 도는 중에도 고침은 막지 않는다. 새 파일을 받는 길이라서다.
 */
export async function requestCorrection(db: Db, input: CorrectionInput, now: Date = new Date()): Promise<{ version: number }> {
  const fields = [...new Set(input.fields ?? [])];
  const asked = [...new Set(input.views ?? [])];
  if (!fields.every((f) => (CORRECTABLE_FIELDS as readonly string[]).includes(f)) || !asked.every(isIntakeView)) throw new IntakeError('invalid_input');
  if (!fields.length && !asked.length) throw new IntakeError('invalid_input', { field: 'correction' });

  return db.$transaction(async (tx) => {
    const sub = await lockForAdmin(tx, input.submissionId);
    if (sub.invitation.status !== 'active') throw new IntakeError('invitation_revoked');
    if (sub.status === 'draft') throw new IntakeError('not_finalized');
    if (input.expectedVersion !== undefined && input.expectedVersion !== sub.version) throw new IntakeError('stale_version', { currentVersion: sub.version });
    assertSubmissionMove(sub.status as never, 'correction_requested');

    if (input.extendUploadUntil && input.extendUploadUntil.getTime() > sub.invitation.uploadExpiresAt.getTime()) {
      await tx.intakeInvitation.update({ where: { id: sub.invitationId }, data: { uploadExpiresAt: input.extendUploadUntil } });
    }

    const open = sub.status === 'correction_requested' ? readCorrection(sub.correction) : null;
    const frozenRev = sub.currentRevisionId ? await tx.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } }) : null;
    const views = [...new Set([...asked, ...(await blockedViews(tx, sub, frozenRev))])];
    const rev = open ? frozenRev : null;
    const restored = open && rev ? await restoreFrozen(tx, sub, rev, open.views.filter((v) => !views.includes(v)), open.fields.filter((f) => !fields.includes(f)), open) : {};

    /* 처음 열 때의 손을 기억한다 — 요청을 바꿔도 그대로 잇는다 */
    const correction: CorrectionRequest = { fields, views, message: cleanLabel(input.message, 500), handBefore: open?.handBefore !== undefined ? open.handBefore : sub.throwingHand };
    const next = await tx.intakeSubmission.update({
      where: { id: sub.id },
      data: { ...restored, status: 'correction_requested', correction, correctionRequestedAt: now, version: { increment: 1 } },
    });
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: open ? 'correction.updated' : 'correction.requested', submissionId: sub.id, detail: { fields, views } }, now);
    return { version: next.version };
  });
}

/**
 * 고침 요청을 거둔다 — 접수를 지금 판의 상태로 돌린다. 앞 상태를 기억해 두지 않고 판에서 읽는다(요청 동안 판이 정산됐을 수 있어서).
 * 받는 사람이 그사이 고른 파일 · 고친 글은 칸에서 내리고 얼린 판 값으로 되돌린다. 얼린 판 · 옛 자산은 그대로다.
 */
export async function cancelCorrection(
  db: Db,
  input: { adminId: string; submissionId: string; expectedVersion: number },
  now: Date = new Date(),
): Promise<{ version: number; status: string }> {
  return db.$transaction(async (tx) => {
    const sub = await lockForAdmin(tx, input.submissionId);
    if (input.expectedVersion !== sub.version) throw new IntakeError('stale_version', { currentVersion: sub.version });
    if (sub.status !== 'correction_requested') throw new IntakeError('invalid_state', { from: sub.status });
    const rev = sub.currentRevisionId ? await tx.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } }) : null;
    if (!rev) throw new IntakeError('not_finalized');

    const correction = readCorrection(sub.correction);
    const restored = await restoreFrozen(tx, sub, rev, ['side', 'rear'], correction?.fields ?? [], correction);
    const to = rev.status === 'verified' ? 'verified' : rev.status === 'failed' ? 'needs_attention' : 'submitted';
    assertSubmissionMove(sub.status as never, to);
    /* 요청 동안 판이 정산됐으면 접수는 옮겨 가지 못했다 — 여기서 마저 한다 */
    const becameReady = to === 'verified' && sub.analysisStatus === 'none';
    const next = await tx.intakeSubmission.update({
      where: { id: sub.id },
      data: { ...restored, status: to, correction: Prisma.DbNull, correctionRequestedAt: null, version: { increment: 1 }, ...(becameReady ? { analysisStatus: 'ready' } : {}) },
    });
    if (becameReady) await enqueueJob(tx, { kind: 'register_revision', dedupeKey: `register_revision:${rev.id}`, payload: { revisionId: rev.id }, runAfter: now });
    /* 고침이 열린 동안 돈 등록 일감은 잇지 못하고 끝났을 수 있다 — 다시 돌 일감이 없으니 여기서 잇는다 */
    if (to === 'verified') await carryInTx(tx, next, rev, now);
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'correction.cancelled', submissionId: sub.id, detail: { to, revision: rev.number } }, now);
    return { version: next.version, status: to };
  });
}

/** 올리기 기간을 늘린다 — 초안과 고침 중에만 뜻이 있다. 지금 기간보다 뒤여야 한다. 폐기된 초대는 늘리지 않는다 */
export async function extendUploadWindow(
  db: Db,
  input: { adminId: string; submissionId: string; until: Date },
  now: Date = new Date(),
): Promise<{ uploadExpiresAt: string }> {
  if (!(input.until instanceof Date) || Number.isNaN(input.until.getTime()) || input.until.getTime() <= now.getTime()) throw new IntakeError('invalid_input', { field: 'until' });
  return db.$transaction(async (tx) => {
    const sub = await lockForAdmin(tx, input.submissionId);
    if (sub.invitation.status !== 'active') throw new IntakeError('invitation_revoked');
    if (sub.status !== 'draft' && sub.status !== 'correction_requested') throw new IntakeError('invalid_state', { from: sub.status });
    const from = sub.invitation.uploadExpiresAt;
    if (input.until.getTime() <= from.getTime()) throw new IntakeError('invalid_input', { field: 'until' });
    await tx.intakeInvitation.update({ where: { id: sub.invitationId }, data: { uploadExpiresAt: input.until } });
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'upload_window.extended', submissionId: sub.id, invitationId: sub.invitationId, detail: { from, to: input.until } }, now);
    return { uploadExpiresAt: input.until.toISOString() };
  });
}

/**
 * 받는 사람이 담당자에게 알린 필수 동의 철회를 남긴다(동의 글: '링크를 보내 준 담당자에게 알려 주시면 처리해요').
 * 철회 시각을 동의 줄과 접수에 적고, 접수를 'withdrawn' 으로, 공개 중인 판을 닫는다. 원본은 여기서 지우지 않는다 — 보유 기간 규칙이 지울 날을 정한다. 모델 개발 동의는 따로 남는다.
 * 이미 철회된 접수는 아무것도 안 바꾼다.
 */
export async function withdrawRequiredConsent(
  db: Db,
  input: { adminId: string; submissionId: string; note?: string | null },
  now: Date = new Date(),
): Promise<{ withdrawn: boolean; unpublished: boolean }> {
  return db.$transaction(async (tx) => {
    const sub = await lockForAdmin(tx, input.submissionId);
    if (sub.status === 'withdrawn') return { withdrawn: false, unpublished: false };
    await tx.intakeConsent.updateMany({ where: { submissionId: sub.id, kind: { in: [...REQUIRED_CONSENT_KINDS] }, withdrawnAt: null }, data: { withdrawnAt: now } });
    assertSubmissionMove(sub.status as never, 'withdrawn');
    await tx.intakeSubmission.update({ where: { id: sub.id }, data: { status: 'withdrawn', withdrawnAt: now, version: { increment: 1 } } });
    const unpublished = await closePublication(tx, sub.id, input.adminId, now);
    await writeAudit(
      tx,
      { actor: { kind: 'admin', id: input.adminId }, action: 'consent.withdrawn_by_admin', submissionId: sub.id, detail: { kinds: [...REQUIRED_CONSENT_KINDS], note: cleanLabel(input.note, 500), unpublished } },
      now,
    );
    return { withdrawn: true, unpublished };
  });
}

/**
 * 받는 사람이 담당자에게 알린 모델 개발 동의 철회를 남긴다 — 동의 글이 '언제든'이라 링크가 폐기돼 화면이 없는 사람에게도 길이 있어야 한다.
 * 접수 · 분석 · 공개는 그대로다(선택 동의라서). 살아 있는 동의가 없으면(거부했거나 이미 거뒀으면) 아무것도 안 바꾸고 기록도 안 남긴다.
 */
export async function withdrawModelConsentForInvitee(
  db: Db,
  input: { adminId: string; submissionId: string; note?: string | null },
  now: Date = new Date(),
): Promise<{ withdrawn: boolean }> {
  return db.$transaction(async (tx) => {
    const sub = await lockForAdmin(tx, input.submissionId);
    /* 마지막 답이 동의일 때만 거둘 것이 있다 — 거부한 사람의 철회로 기록되면 사실이 아니다 */
    if (!latestConsents(await consentDecisionRows(tx, sub.id)).get('model')?.granted) return { withdrawn: false };
    const changed = await tx.intakeConsent.updateMany({ where: { submissionId: sub.id, kind: 'model', granted: true, withdrawnAt: null }, data: { withdrawnAt: now } });
    if (changed.count === 0) return { withdrawn: false };
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'consent.model_withdrawn_by_admin', submissionId: sub.id, detail: { note: cleanLabel(input.note, 500) } }, now);
    return { withdrawn: true };
  });
}

/** 틀린 접근 코드로 잠긴 결과 보기를 푼다 — 코드 자체는 안 바꾼다. 잠기지 않았고 틀린 횟수도 없으면 아무것도 안 한다 */
export async function resetAccessCodeLock(db: Db, input: { adminId: string; submissionId: string }, now: Date = new Date()): Promise<{ reset: boolean }> {
  return db.$transaction(async (tx) => {
    const sub = await lockForAdmin(tx, input.submissionId);
    const inv = sub.invitation;
    if (inv.accessCodeFailures === 0 && inv.accessCodeLockedAt == null) return { reset: false };
    await tx.intakeInvitation.update({ where: { id: inv.id }, data: { accessCodeFailures: 0, accessCodeLockedAt: null } });
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'access_code.reset', submissionId: sub.id, invitationId: inv.id, detail: { failures: inv.accessCodeFailures } }, now);
    return { reset: true };
  });
}

/* ────────────────────────────── 검증 · 정산(일꾼) ────────────────────────────── */

/**
 * 판의 결과를 정한다 — 두 자산 상태를 보고 접수를 옮긴다. 몇 번 불러도 같다.
 * 'verified' 가 되면 analysisStatus 'ready' 로 두고 register_revision 일감을 건다(GPU 는 안 돈다).
 * 머리를 못 읽어 영상인지 모르는 자산('unconfirmed')이 있으면 'failed'(media_unconfirmed) 로 닫는다 — 접수는 needs_attention 이고 분석 가능으로 가지 않는다.
 */
export async function settleRevision(db: Db, revisionId: string, now: Date = new Date()): Promise<string> {
  return db.$transaction(async (tx) => {
    const rev = await tx.intakeRevision.findUnique({ where: { id: revisionId } });
    if (!rev) throw new IntakeError('not_finalized');
    await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${rev.submissionId} FOR UPDATE`;
    /* 잠그기 전에 읽은 값은 낡았을 수 있다 — 두 일꾼이 같은 판을 정산해도 기록이 하나로 남게 다시 읽는다 */
    const fresh = await tx.intakeRevision.findUniqueOrThrow({ where: { id: revisionId } });
    if (fresh.status !== 'pending') return fresh.status;

    const pair = await tx.intakeAsset.findMany({ where: { id: { in: [rev.sideAssetId, rev.rearAssetId] } } });
    const rejected = pair.some((a) => a.status === 'rejected');
    const finished = pair.length === 2 && pair.every((a) => a.status === 'verified' || a.status === 'unconfirmed');
    if (!rejected && !finished) return 'pending';

    const duplicate = finished && pair[0].serverSha256 === pair[1].serverSha256;
    const failureCode = rejected ? 'asset_rejected' : duplicate ? 'same_file' : pair.some((a) => a.status === 'unconfirmed') ? 'media_unconfirmed' : null;
    const failed = failureCode != null;
    await tx.intakeRevision.update({
      where: { id: rev.id },
      data: { status: failed ? 'failed' : 'verified', failureCode, settledAt: now },
    });

    const sub = await tx.intakeSubmission.findUniqueOrThrow({ where: { id: rev.submissionId } });
    /* 고침 요청 중이거나 더 새 판이 있으면 접수는 그대로 둔다 */
    if (sub.currentRevisionId === rev.id && sub.status === 'submitted') {
      await tx.intakeSubmission.update({
        where: { id: sub.id },
        data: failed ? { status: 'needs_attention' } : { status: 'verified', analysisStatus: 'ready' },
      });
      if (!failed) await enqueueJob(tx, { kind: 'register_revision', dedupeKey: `register_revision:${rev.id}`, payload: { revisionId: rev.id }, runAfter: now });
    }
    await writeAudit(tx, { actor: { kind: 'system' }, action: failed ? 'revision.failed' : 'revision.verified', submissionId: rev.submissionId, detail: { revision: rev.number, failureCode } }, now);
    return failed ? 'failed' : 'verified';
  });
}

/** 이 자산이 든 판 가운데 아직 안 닫힌 것을 정산한다 */
async function settlePendingFor(db: Db, assetId: string, now: Date): Promise<void> {
  const revisions = await db.intakeRevision.findMany({
    where: { status: 'pending', OR: [{ sideAssetId: assetId }, { rearAssetId: assetId }] },
    select: { id: true },
  });
  for (const r of revisions) await settleRevision(db, r.id, now);
}

/**
 * 파일 내용 때문에 DB 가 거절한 쓰기인가 — 다시 해도 같으니 일꾼이 되풀이하면 안 된다.
 * 값이 Date · 칸 모양에 안 맞으면 Prisma 가 쓰기 전에 막고, 글자 · 수 범위는 Postgres 22 묶음(자료 예외)이다. 연결 끊김 같은 것은 다시 돌린다.
 */
export function isContentWriteError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientValidationError) return true;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const cause = (e.meta as { driverAdapterError?: { cause?: { originalCode?: unknown } } } | undefined)?.driverAdapterError?.cause;
    return e.code === 'P2039' || (typeof cause?.originalCode === 'string' && cause.originalCode.startsWith('22'));
  }
  return false;
}

/** 검증을 닫는다 — 재는 사이 다른 파일로 바뀌었으면('replaced') 쓰지 않는다. 상태를 되돌리지 않는다 */
async function closeVerify(
  db: Db,
  asset: IntakeAsset,
  data: Prisma.IntakeAssetUpdateManyMutationInput & { status: 'verified' | 'unconfirmed' | 'rejected'; rejectCode: string | null },
  now: Date,
): Promise<string> {
  const wrote = await db.$transaction(async (tx) => {
    /* 고침 요청과 차례를 맞춘다 — 요청이 막힌 칸을 보는 것과 여기서 막는 것이 엇갈리지 않게 */
    await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${asset.submissionId} FOR UPDATE`;
    const moved = await tx.intakeAsset.updateMany({ where: { id: asset.id, status: 'verifying' }, data });
    if (moved.count === 0) return false;
    await writeAudit(tx, { actor: { kind: 'system' }, action: `asset.${data.status}`, submissionId: asset.submissionId, detail: { assetId: asset.id, rejectCode: data.rejectCode } }, now);
    /* 고침이 열린 뒤에 막혔으면 그 칸은 요청에 없을 수 있다 — 받는 사람이 고칠 수 있게 넣는다 */
    if (data.status === 'rejected') {
      const sub = await tx.intakeSubmission.findUnique({ where: { id: asset.submissionId } });
      if (sub) await widenOpenCorrection(tx, sub, now);
    }
    return true;
  });
  if (!wrote) return (await db.intakeAsset.findUniqueOrThrow({ where: { id: asset.id } })).status;
  await settlePendingFor(db, asset.id, now);
  return data.status;
}

/**
 * 올라간 객체를 처음부터 끝까지 다시 읽어 맞춘다 — 머리로 영상인지 보고, 스트리밍으로 전체 SHA-256 을 잰다.
 * 저장소 탓의 실패는 던져서 일꾼이 다시 한다. 파일 탓의 실패는 'rejected' 로 남는다. 다시 불러도 괜찮다.
 *
 * 머리는 해시보다 먼저 읽고, 읽은 사실은 해시보다 먼저 저장한다 — 머리가 나쁜 파일이 1GiB 전체 읽기를 쓰지 못하게, 그리고 저장이 파일 탓으로 막히면 곧바로 닫게.
 * 이미 끝난 자산이면 판 정산만 마저 한다. 앞 시도가 자산을 적고 정산 전에 끊겼을 수 있다.
 *
 * opts.signal(크론의 실행 예산)이 끊기면 해시 읽기를 멈추고 signal.reason 을 그대로 던진다 — 'verified' 도 'rejected' 도 적지 않는다.
 * 자산은 'verifying' 에 남고, 다음 시도가 처음부터 다시 읽는다. 끊김을 실패로 셀지는 부른 쪽(job-handlers.ts)이 signal 을 보고 가른다.
 */
export async function verifyAsset(
  db: Db,
  storage: IntakeStorage,
  assetId: string,
  now: Date = new Date(),
  opts: { signal?: AbortSignal; onHashBytes?: (bytesRead: number) => void } = {},
): Promise<string> {
  const asset = await db.intakeAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new IntakeError('asset_not_found');
  if (asset.status !== 'uploaded' && asset.status !== 'verifying') {
    if (assetVerifyDone(asset.status)) await settlePendingFor(db, asset.id, now);
    return asset.status;
  }
  if (opts.signal?.aborted) throw opts.signal.reason;
  await db.intakeAsset.updateMany({ where: { id: asset.id, status: 'uploaded' }, data: { status: 'verifying' } });

  const reader = await storage.reader(asset.objectPath);
  if (!reader) throw new IntakeError('storage_unavailable', { cause: 'object_missing' });
  const facts = await readIntakeMediaFacts(reader);
  const factsJson = JSON.parse(JSON.stringify(facts)) as Prisma.InputJsonValue;

  try {
    await db.intakeAsset.updateMany({
      where: { id: asset.id, status: 'verifying' },
      data: { mediaFacts: factsJson, captureAt: facts.captureAtMs != null ? new Date(facts.captureAtMs) : null, captureAtSource: facts.captureSource },
    });
  } catch (e) {
    if (!isContentWriteError(e)) throw e;
    return closeVerify(db, asset, { status: 'rejected', rejectCode: 'facts_unreadable', verifiedAt: null }, now);
  }

  const headReject = mediaRejectCode(facts);
  if (headReject) return closeVerify(db, asset, { status: 'rejected', rejectCode: headReject, verifiedAt: null }, now);

  const measured = await storage.hash(asset.objectPath, { signal: opts.signal, onBytes: opts.onHashBytes });
  const rejectCode = measured.size !== Number(asset.declaredSize) ? 'size_mismatch' : measured.sha256 !== asset.clientSha256 ? 'hash_mismatch' : null;
  const sums = { serverSha256: measured.sha256, storedBytes: BigInt(measured.size) };
  if (rejectCode) return closeVerify(db, asset, { ...sums, status: 'rejected', rejectCode, verifiedAt: null }, now);
  return closeVerify(db, asset, { ...sums, status: mediaUnconfirmed(facts) ? 'unconfirmed' : 'verified', rejectCode: null, verifiedAt: now }, now);
}

/**
 * 관리자의 '다시 확인' — 끝나지 못한 파일의 검증을 다시 건다. 횟수를 다 써 멈춘 일감도 처음부터 다시 돈다.
 * 이미 끝난 자산은 다시 재지 않는다. 일감이 줄에 있거나 도는 중이면 아무것도 안 한다.
 */
export async function requeueVerification(db: Db, input: { adminId: string; assetId: string }, now: Date = new Date()): Promise<{ requeued: boolean }> {
  if (!isIntakeId(input.assetId)) throw new IntakeError('asset_not_found');
  const asset = await db.intakeAsset.findUnique({ where: { id: input.assetId } });
  if (!asset) throw new IntakeError('asset_not_found');
  if (asset.status !== 'uploaded' && asset.status !== 'verifying') throw new IntakeError('invalid_state', { from: asset.status });
  const key = verifyJobKey(asset.id);
  const requeued = (await requeueJob(db, key, now)) || (await enqueueJob(db, { kind: 'verify_asset', dedupeKey: key, payload: { assetId: asset.id }, runAfter: now }));
  if (requeued) await writeAudit(db, { actor: { kind: 'admin', id: input.adminId }, action: 'asset.verify_requeued', submissionId: asset.submissionId, detail: { assetId: asset.id } }, now);
  return { requeued };
}

/* ────────────────────────────── 대사 · 정리(일꾼) ────────────────────────────── */

/**
 * 저장소에는 끝났는데 DB 가 모르는 전송을 찾는다 — 화면이 confirmUpload 전에 닫힌 경우다.
 * 토큰을 받고 조금 지난 'uploading' 만 본다.
 */
export async function reconcileUploads(db: Db, storage: IntakeStorage, now: Date = new Date(), limit = 50): Promise<number> {
  const rows = await db.intakeAsset.findMany({
    where: { status: 'uploading', tokenIssuedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
    orderBy: { tokenIssuedAt: 'asc' },
    take: limit,
  });
  let found = 0;
  for (const asset of rows) {
    const stat = await storage.stat(asset.objectPath);
    if (!stat) continue;
    await markArrived(db, asset, stat.size, now);
    found++;
  }
  return found;
}

/**
 * 끊긴 정산을 잇는다 — 두 자산이 끝났는데(또는 하나가 막혔는데) 'pending' 으로 남은 판을 찾아 닫는다. 크론이 부른다.
 * 한 판이 실패해도 나머지는 돈다. 돌려주는 값은 닫힌 판 수다.
 */
export async function reconcilePendingRevisions(db: Db, now: Date = new Date(), limit = 100): Promise<number> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT r."id" FROM "IntakeRevision" r
    JOIN "IntakeAsset" s ON s."id" = r."sideAssetId"
    JOIN "IntakeAsset" a ON a."id" = r."rearAssetId"
    WHERE r."status" = 'pending'
      AND ((s."status" IN ('verified', 'unconfirmed') AND a."status" IN ('verified', 'unconfirmed')) OR s."status" = 'rejected' OR a."status" = 'rejected')
    ORDER BY r."finalizedAt" ASC
    LIMIT ${limit}`;
  let settled = 0;
  for (const { id } of rows) {
    try {
      if ((await settleRevision(db, id, now)) !== 'pending') settled++;
    } catch (e) {
      console.error(`[intake] reconcile settle: ${e instanceof Error ? e.name : 'unknown'}`);
    }
  }
  return settled;
}

/** 정리가 쓰는 시각 경계 — 줄을 고를 때와 잠근 뒤 다시 볼 때 같은 값을 쓴다 */
export const cleanupCutoffs = (now: Date) => ({ cutoff: new Date(now.getTime() - TUS_URL_TTL_MS - CLEANUP_GRACE_MS), withdrawnCutoff: new Date(now.getTime() - WITHDRAWN_DRAFT_GRACE_MS) });

type AbandonFacts = {
  status: string;
  updatedAt: Date;
  submission: { status: string; withdrawnAt: Date | null; invitation: { status: string; uploadExpiresAt: Date; revokedAt: Date | null } };
};

/** 칸에서 내려도 되나 — cleanupStaleUploads 가 줄을 고르는 두 조회와 같은 말이다. 조회를 고치면 이것도 같이 고친다 */
function abandonDue(a: AbandonFacts, now: Date): boolean {
  const { cutoff, withdrawnCutoff } = cleanupCutoffs(now);
  const { status, withdrawnAt, invitation: inv } = a.submission;
  if (status === 'withdrawn' && withdrawnAt != null && withdrawnAt <= withdrawnCutoff) return true;
  if (assetInTransit(a.status)) return a.updatedAt < cutoff && (inv.status === 'revoked' || inv.uploadExpiresAt < now);
  return (status === 'draft' || status === 'correction_requested') && (inv.uploadExpiresAt < cutoff || (inv.status === 'revoked' && (inv.revokedAt == null || inv.revokedAt < cutoff)));
}

/**
 * 칸에서 내려 버린 것으로 적는다. 완료와 부딪히지 않게 접수를 잠근 채 다시 본다 — 그사이 판에 얼렸으면 건드리지 않고, 줄을 고른 조건이 이제 안 맞으면 내리지 않는다.
 * 줄을 읽은 뒤에 관리자가 기간을 늘렸거나 철회가 들어온 경우다. 기간 늘리기 · 철회도 같은 잠금을 쥐어서, 여기서 보는 값이 최신이다.
 */
async function abandonAsset(db: Db, asset: Pick<IntakeAsset, 'id' | 'submissionId' | 'status'>, now: Date): Promise<number> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${asset.submissionId} FOR UPDATE`;
    if (await tx.intakeRevision.count({ where: { OR: [{ sideAssetId: asset.id }, { rearAssetId: asset.id }] } })) return 0;
    const fresh = await tx.intakeAsset.findUnique({
      where: { id: asset.id },
      select: { status: true, updatedAt: true, submission: { select: { status: true, withdrawnAt: true, invitation: { select: { status: true, uploadExpiresAt: true, revokedAt: true } } } } },
    });
    if (!fresh || !abandonDue(fresh, now)) return 0;
    const r = await tx.intakeAsset.updateMany({ where: { id: asset.id, status: asset.status }, data: { status: 'abandoned' } });
    if (r.count === 0) return 0;
    /* 칸도 비운다 — 초대 기간을 늘려 다시 열었을 때 지워진 자산을 가리키지 않게. 짝이 깨졌으니 같은 투구 확인도 지운다 */
    await tx.intakeSubmission.updateMany({ where: { sideAssetId: asset.id }, data: { sideAssetId: null, samePitchConfirmed: false, version: { increment: 1 } } });
    await tx.intakeSubmission.updateMany({ where: { rearAssetId: asset.id }, data: { rearAssetId: null, samePitchConfirmed: false, version: { increment: 1 } } });
    return r.count;
  });
}

/**
 * 쓰이지 않는 파일을 지운다. 지우는 것은 '어떤 판에도 없고, 어떤 칸도 안 가리키고, 여유가 지난' 자산뿐이다.
 * 판에 얼린 원본은 어떤 경우에도 여기서 안 지운다. 그것은 보유 삭제(lib/intake/purge.ts)만 지운다. 미완료 전송의 조각은 저장소가 스스로 버린다.
 *
 * 버리는 것은 셋이다.
 * - 아직 전송 중인 자산: 올리기 기간이 끝났거나 폐기된 초대에서, 업로드 주소가 끝나고도 여유가 지난 것.
 * - 도착했지만 판에 오르지 못한 자산: 끝내지 않은 접수(초안 · 고침 중)에서, 올리기 기간이나 폐기 뒤로 같은 여유가 지난 것.
 *   이 여유 안에는 받는 사람이 끝낼 수 있고 관리자가 기간을 늘릴 수 있다. 접수되지 않은 임시 파일의 여유일 뿐, 접수된 원본의 보유 기간이 아니다.
 * - 철회한 접수에서 판에 오르지 못한 자산: 철회한 날부터 7일 유예 뒤. 철회한 접수는 끝낼 길이 없어서, 지울 때 업로드 주소의 여유를 또 기다리지 않는다.
 *
 * 버리기는 줄을 읽은 뒤 잠근 채 같은 조건을 다시 본다(abandonDue). 그사이 관리자가 기간을 늘렸으면 받는 사람의 파일을 칸에서 내리지 않는다.
 *
 * 철회한 접수의 파일은 7일 유예만 본다. 버린 지 오래된 파일이어도 철회한 날부터 7일 안에는 안 지운다.
 * 줄을 읽은 뒤에 철회가 끼어들 수 있어 지우기 직전에 접수를 다시 본다. 이 길에는 표시 단계가 없어서, 다시 본 뒤 저장소를 부르는 사이의 철회는 못 잡는다. 철회 앞에 정한 지우기로 친다.
 * 저장소에서 없어진 것을 보고서야 'purged' 로 적는다. 지웠다는 답만 오고 객체가 남은 파일은 건너뛰어 나머지를 지운 뒤 끝에 던진다 — 일감이 다시 돌고 까닭이 lastError 에 남는다.
 * 남은 파일은 시각을 안 밀어 늘 줄 맨 앞에 있다. 그래서 한도(limit)는 지운 수로 세고, 남은 파일을 건너뛰어 뒤 줄까지 훑는다. 훑는 줄에는 끝이 있다(maxRows).
 * 연결이 실패하면 바로 던진다. 지워졌는지 모르고, 다음 파일도 같을 테니 함수 시간을 쓰지 않는다.
 *
 * 남는 틈: 지운 뒤 답이 끊기면 그 파일은 다음 정리까지 'replaced' · 'abandoned' 로 남아 관리자 화면이 있다고 말한다. 다음 정리가 없어진 것을 보고 끝내서 저절로 풀린다.
 * 판에 오른 적 없는 파일이고, 여기에 'purging' 을 쓰면 보유 삭제가 판 파일만 다룬다는 약속(lib/intake/purge.ts)을 갈라야 해서 표시를 안 둔다.
 */
export async function cleanupStaleUploads(db: Db, storage: IntakeStorage, now: Date = new Date(), limit = 50, maxRows = limit * CLEANUP_WALK_PAGES): Promise<{ purged: number; abandoned: number }> {
  const { cutoff, withdrawnCutoff } = cleanupCutoffs(now);
  const graceOver = { status: 'withdrawn', withdrawnAt: { lte: withdrawnCutoff } };

  const stuck = await db.intakeAsset.findMany({
    where: {
      status: { in: ['reserved', 'uploading'] },
      OR: [{ updatedAt: { lt: cutoff }, submission: { invitation: { OR: [{ status: 'revoked' }, { uploadExpiresAt: { lt: now } }] } } }, { submission: graceOver }],
    },
    take: limit,
  });
  /* 판에 있는 자산은 여기서 뺀다 — 고침 중인 접수의 얼린 자산이 한도를 차지해 다른 것이 밀리지 않게 */
  const arrived = await db.$queryRaw<Pick<IntakeAsset, 'id' | 'submissionId' | 'status'>[]>`
    SELECT a."id", a."submissionId", a."status" FROM "IntakeAsset" a
    JOIN "IntakeSubmission" s ON s."id" = a."submissionId"
    JOIN "IntakeInvitation" i ON i."id" = s."invitationId"
    WHERE a."status" IN ('uploaded', 'verifying', 'verified', 'unconfirmed', 'rejected')
      AND (
        (s."status" IN ('draft', 'correction_requested') AND (i."uploadExpiresAt" < ${cutoff} OR (i."status" = 'revoked' AND (i."revokedAt" IS NULL OR i."revokedAt" < ${cutoff}))))
        OR (s."status" = 'withdrawn' AND s."withdrawnAt" <= ${withdrawnCutoff})
      )
      AND NOT EXISTS (SELECT 1 FROM "IntakeRevision" r WHERE r."sideAssetId" = a."id" OR r."rearAssetId" = a."id")
    ORDER BY a."updatedAt" ASC
    LIMIT ${limit}`;
  let abandoned = 0;
  for (const a of [...stuck, ...arrived]) abandoned += await abandonAsset(db, a, now);

  const seen: string[] = [];
  let purged = 0;
  let left = false;
  while (purged < limit && seen.length < maxRows) {
    const rows = await db.intakeAsset.findMany({
      where: { id: { notIn: seen }, status: { in: ['replaced', 'abandoned'] }, OR: [{ updatedAt: { lt: cutoff }, submission: { status: { not: 'withdrawn' } } }, { submission: graceOver }] },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: Math.min(limit, maxRows - seen.length),
    });
    if (rows.length === 0) break;
    for (const a of rows) {
      if (purged >= limit) break;
      seen.push(a.id);
      const frozen = await db.intakeRevision.count({ where: { OR: [{ sideAssetId: a.id }, { rearAssetId: a.id }] } });
      if (frozen) continue;
      const sub = await db.intakeSubmission.findUnique({ where: { id: a.submissionId }, select: { status: true, withdrawnAt: true, sideAssetId: true, rearAssetId: true } });
      if (!sub || sub.sideAssetId === a.id || sub.rearAssetId === a.id) continue;
      /* 줄을 읽은 뒤 철회가 끼어들었으면 7일 유예를 다시 본다 */
      if (sub.status === 'withdrawn' && !(sub.withdrawnAt && sub.withdrawnAt <= withdrawnCutoff)) continue;
      if (!isPurgeablePath(a.objectPath, a.submissionId)) continue;
      /* 남은 파일의 updatedAt 은 안 민다 — 밀면 여유 조건에서 빠져 다음 시도에 안 보이고, 일감이 성공으로 끝나 실패 기록까지 지워진다 */
      if ((await removeAndFindLeft(storage, [a.objectPath])).length > 0) {
        left = true;
        continue;
      }
      /* 겹쳐 돈 정리가 먼저 적었으면 기록도 수도 안 더한다 */
      const wrote = await db.$transaction(async (tx) => {
        const r = await tx.intakeAsset.updateMany({ where: { id: a.id, status: a.status }, data: { status: 'purged', purgedAt: now } });
        if (r.count !== 1) return false;
        await writeAudit(tx, { actor: { kind: 'system' }, action: 'asset.purged', submissionId: a.submissionId, detail: { assetId: a.id, was: a.status } }, now);
        return true;
      });
      if (wrote) purged++;
    }
  }
  await pruneRateLimits(db, now);
  if (left) throw removeLeftObject();
  return { purged, abandoned };
}

/**
 * 이 파일이 맡는 일감의 처리기 — 분석 쪽은 register_revision · poll_analysis 를 더해 runDueJobs 에 넘긴다.
 * 앱의 검증 길(크론 · 공개 라우트 after() · 검증 작업자)은 job-handlers.ts 의 예산 처리기로 verify_asset 을 덮는다. 여기 것은 예산 끊김을 기다림으로 바꾸지 않는다 —
 * 그래도 실행의 signal 은 해시 읽기에 이어, 예산을 준 실행이 이 처리기를 써도 함수 시간을 넘겨 읽지 않게 한다(끊기면 실패 한 번으로 센다).
 */
export function intakeCoreJobHandlers(db: Db, storage: IntakeStorage): JobHandlers {
  return {
    verify_asset: async (job, ctx) => {
      const { assetId } = job.payload as { assetId: string };
      await verifyAsset(db, storage, assetId, undefined, { signal: ctx.signal });
    },
    cleanup_uploads: async () => {
      await reconcileUploads(db, storage);
      await cleanupStaleUploads(db, storage);
    },
  };
}
