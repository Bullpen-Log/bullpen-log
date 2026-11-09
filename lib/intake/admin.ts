/**
 * 외부 영상 접수의 관리자 쪽 — 목록 · 상세 · 초대 · 담당자 · 메모 · 고침 요청 · 철회 기록 · 다시 확인 · 원본 주소. 화면과 서버 동작(app/actions/intake-admin.ts)이 여기를 부른다.
 *
 * ── 약속 ──────────────────────────────
 * - 함수마다 맨 앞에서 actor 의 권한을 본다(assertIntakeAdmin). 서버 동작이 먼저 보지만, 여기서 또 본다 — 새 화면이 이 파일을 바로 불러도 뚫리지 않게.
 * - 권한의 근거는 lib/permissions.ts 'intake' 하나다. 초대를 누가 만들었는지는 권한과 상관없다(대표관리자 둘이 같은 접수를 본다).
 * - 함께 보는 상태: 담당자는 '알던 담당자'를 맞춰 본 뒤 바꾼다(비교 후 교체). 고침 요청은 접수 version 을 잠근 뒤 맞춰 본다.
 *   담당자 · 메모는 version 을 안 올린다 — version 은 받는 사람의 낙관 잠금이라, 관리자 일로 받는 사람의 화면이 '최신 내용을 불러오라'고 하면 안 된다.
 * - 관리자별 상태: 읽음(IntakeAdminRead)은 사람마다 따로다. 접수가 내가 읽은 뒤 바뀌면(updatedAt > readAt) 다시 '안 읽음'이 된다.
 *   접수를 끝낸 것(receivedAt)만 센다 — 받는 사람이 초안을 쓰는 동안 알림이 쌓이지 않게.
 * - 돌려주는 값에 토큰 해시 · 코드 해시 · 저장 경로 · TUS 주소를 넣지 않는다. 서명 주소는 issueOriginalLinks 만 주고, 5분짜리다.
 *   일감의 오류 글도 주소 · 경로를 지우고 내보낸다(jobErrorText).
 * - 묶음 파일을 만들지 않는다 — 짝 내려받기는 원본 두 개의 서명 주소다(몇 GB 를 메모리에 올리지 않는다).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { ACCESS_CODE_MAX_FAILURES, uploadExpired } from '@/lib/intake/access';
import { writeAudit } from '@/lib/intake/audit';
import { consentDecisionRows, hasRequiredConsents, latestConsents, modelUseAllowed } from '@/lib/intake/consent';
import { IntakeError } from '@/lib/intake/errors';
import { GIB, INTAKE_BUCKET_MAX_BYTES, READ_URL_TTL_SEC, intakeLimits, isVerifyBudgetNote, type IntakeLimits } from '@/lib/intake/limits';
import { fpsLabel, integrityLabel, timingNote, type IntakeMediaFacts } from '@/lib/intake/media';
import { downloadFileName, isIntakeId, isSubmissionPath, originalExtension } from '@/lib/intake/paths';
import { requeueJob } from '@/lib/intake/jobs';
import { ORIGINAL_RETENTION_MS, correctionHoldUntil, currentOriginalsPurgedAt, originalRetention, retentionDue, shownRetention, type RetentionBasis } from '@/lib/intake/retention';
import {
  cancelCorrection,
  cleanupCutoffs,
  createInvitation,
  extendUploadWindow,
  isUntouchedSubmission,
  reissueInvitationToken,
  requestCorrection,
  requeueVerification,
  resetAccessCodeLock,
  withdrawRequiredConsent,
  type CreatedInvitation,
  type ReissuedInvitation,
  withdrawModelConsentForInvitee,
} from '@/lib/intake/service';
import { resolveLinkOrigin, type LinkOrigin, type LinkOriginEnv } from '@/lib/intake/link-origin';
import {
  ANALYSIS_STATUSES,
  ASSET_GONE,
  CORRECTABLE_FIELDS,
  INVITATION_STATUSES,
  PUBLICATION_STATUSES,
  SUBMISSION_STATUSES,
  assetGone,
  isIntakeView,
  purgingScope,
  readCorrection,
  verifyTargetIds,
  type CorrectableField,
  type CorrectionRequest,
  type IntakeView,
  type PurgingScope,
} from '@/lib/intake/state';
import type { IntakeStorage } from '@/lib/intake/storage-core';
import { analysisBlockOf, sampleDurationLabel, slotProgressOf, type AnalysisBlock, type ViewProgress } from '@/lib/intake/admin-labels';
import { can } from '@/lib/permissions';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
export const INTAKE_PAGE_SIZE = 20;
const MAX_SEARCH_CHARS = 60;
const MAX_NOTE_CHARS = 2000;
const MAX_AUDIT_ROWS = 200;
/** 받는 사람 쪽 기록은 따로 세어 잘라낸다 — 링크를 쥔 사람이 동의를 뒤집어 관리자 · 일꾼의 기록을 화면 밖으로 밀어내지 못하게 */
const MAX_INVITEE_AUDIT_ROWS = 60;
/** 화면에 싣는 동의 줄 — 답을 뒤집어 쌓인 줄이 상세 화면을 부풀리지 않게. 판단에 드는 줄은 이 수와 상관없이 다 싣는다 */
const MAX_CONSENT_ROWS = 100;
const MAX_JOB_ISSUES = 20;
/** 크론 세 바퀴 — 이만큼 지나도 안 돌면 멈춘 것으로 본다 */
const JOB_STALL_MS = 15 * 60_000;
/**
 * 예산 기다림이 멈춤으로 바뀌는 때 — 크론(5분마다)은 차례가 온 기다림을 건너뛸 때마다 글을 다시 써서 updatedAt 이 새로 찍힌다.
 * 차례 · 마지막 손길 둘 다 한 시간(열두 바퀴) 넘게 지났으면 크론이 안 도는 것으로 본다. 하루 쉬는 일은 차례가 미래라 그동안은 기다림이다.
 */
const JOB_WAIT_STALL_MS = 60 * 60_000;
/** 올리기 기간 · 결과 보기 기간의 범위(일) */
const MAX_UPLOAD_DAYS = 60;
const MAX_RESULT_DAYS = 365;
const MIN_LIMIT_BYTES = 1024 * 1024;

export type IntakeActor = { id: string; role: string | null | undefined };

/** 'intake' 권한이 없으면 던진다 */
export function assertIntakeAdmin(actor: IntakeActor | null | undefined): asserts actor is IntakeActor {
  if (!actor?.id || !can(actor.role, 'intake')) throw new IntakeError('admin_forbidden');
}

const mustSubmissionId = (id: string) => {
  if (!isIntakeId(id)) throw new IntakeError('submission_not_found');
};

/* ────────────────────────────── 담당자 후보 ────────────────────────────── */

export type IntakeAdminPerson = { id: string; name: string };

/** 'intake' 권한이 있는 역할 — 권한 표가 바뀌면 저절로 따라간다 */
const INTAKE_ROLES = (['ADMIN', 'MANAGER'] as const).filter((r) => can(r, 'intake'));

async function intakeAdmins(db: Db): Promise<IntakeAdminPerson[]> {
  const rows = await db.user.findMany({ where: { role: { in: [...INTAKE_ROLES] } }, select: { id: true, nickname: true }, orderBy: { nickname: 'asc' } });
  return rows.map((u) => ({ id: u.id, name: u.nickname }));
}

/* ────────────────────────────── 목록 ────────────────────────────── */

export type IntakeListFilters = {
  q: string | null;
  status: string | null;
  analysis: string | null;
  publication: string | null;
  invitation: string | null;
  /** 'me' · 'none' · 관리자 번호 */
  assignee: string | null;
  unread: boolean;
  page: number;
};

const firstOf = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const oneOf = (v: string | undefined, allowed: readonly string[]) => (v && allowed.includes(v) ? v : null);

/** 주소의 값 → 거름 조건. 모르는 값은 버린다(그 칸을 안 거른다) */
export function parseIntakeFilters(raw: Record<string, string | string[] | undefined>): IntakeListFilters {
  const q = firstOf(raw.q)?.normalize('NFC').replace(/\p{C}/gu, '').trim();
  const assignee = firstOf(raw.assignee);
  const page = Number.parseInt(firstOf(raw.page) ?? '', 10);
  return {
    q: q ? [...q].slice(0, MAX_SEARCH_CHARS).join('') : null,
    status: oneOf(firstOf(raw.status), SUBMISSION_STATUSES),
    analysis: oneOf(firstOf(raw.analysis), ANALYSIS_STATUSES),
    publication: oneOf(firstOf(raw.publication), PUBLICATION_STATUSES),
    invitation: oneOf(firstOf(raw.invitation), INVITATION_STATUSES),
    assignee: assignee === 'me' || assignee === 'none' || isIntakeId(assignee) ? (assignee as string) : null,
    unread: firstOf(raw.unread) === '1',
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100_000) : 1,
  };
}

export type IntakeListRow = {
  id: string;
  athleteName: string | null;
  /** 초대 메모 — 이름이 아직 없을 때 알아보는 데 쓴다 */
  invitationNote: string | null;
  receiptCode: string | null;
  /** 접수일(서버 시각). 촬영일이 아니다 */
  receivedAt: string | null;
  createdAt: string;
  side: ViewProgress;
  rear: ViewProgress;
  status: string;
  analysisStatus: string;
  publicationStatus: string;
  invitationStatus: string;
  uploadExpired: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  unread: boolean;
  /** 원본을 지울 날 — 시계가 없는 초안은 null */
  originalPurgeAt: string | null;
  /** 지금 판의 원본을 다 지운 시각 — 남아 있으면 null */
  originalsPurgedAt: string | null;
  /** 원본을 지우는 중인가 — 'older' 면 옛 판의 파일뿐이다. 지금 판이 살아 있는지는 originalsPurgedAt 이 말한다. 아니면 null */
  originalsPurging: PurgingScope | null;
  /** 판에 오른 적이 있나 — 없으면 파일을 '원본'이 아니라 '영상'이라고 부른다(retentionLineText · analysisBlockOf) */
  hasRevision: boolean;
  /** 새 분석을 못 하는 까닭 — 칩이 '분석 가능'이라고 말하지 않게 한다. 없으면 null(analysisBlockOf) */
  analysisBlock: AnalysisBlock | null;
  /** 받는 분이 아직 아무것도 안 했나 — 링크를 못 받았을 수 있다(service.ts isUntouchedSubmission). 열었는지는 모른다 */
  untouched: boolean;
};

export type IntakeListResult = {
  rows: IntakeListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** 거름과 상관없이 이 관리자의 안 읽은 접수 수 */
  unreadCount: number;
  admins: IntakeAdminPerson[];
};

/** 이 관리자가 안 읽은 접수 번호 — 두 칸을 견주는 조건이라 SQL 로 잰다 */
async function unreadIds(db: Db, adminId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT s."id"
    FROM "IntakeSubmission" s
    LEFT JOIN "IntakeAdminRead" r ON r."submissionId" = s."id" AND r."adminId" = ${adminId}
    WHERE s."receivedAt" IS NOT NULL AND (r."readAt" IS NULL OR r."readAt" < s."updatedAt")
  `);
  return rows.map((r) => r.id);
}

/**
 * '분석 가능'이지만 새 분석을 못 하는 접수 — 칩의 analysisBlockOf 와 같은 조건이다: 지금 판을 지우는 중 · 다 지움 · 철회 · 폐기 · 지울 날 지남.
 * 지울 날은 originalRetention 을 그대로 옮긴 것이다. 철회는 앞 조건이 먼저 잡으니 남는 것은 마지막으로 낸 날과 마지막 공개 가운데 늦은 날이다.
 * 판이 없는 접수의 막힘(받은 영상 지움 · 지우는 중)은 안 본다. 판을 정산해야 '분석 가능'이 되므로 그런 접수는 이 거름에 들 수 없다.
 */
async function blockedReadyIds(db: Db, now: Date): Promise<string[]> {
  const cutoff = new Date(now.getTime() - ORIGINAL_RETENTION_MS);
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT s."id"
    FROM "IntakeSubmission" s
    JOIN "IntakeInvitation" i ON i."id" = s."invitationId"
    LEFT JOIN "IntakeRevision" r ON r."id" = s."currentRevisionId"
    WHERE s."analysisStatus" = 'ready' AND (
      s."status" = 'withdrawn'
      OR i."status" <> 'active'
      OR EXISTS (SELECT 1 FROM "IntakeAsset" a WHERE a."id" IN (r."sideAssetId", r."rearAssetId") AND a."status" = 'purging')
      OR (SELECT count(*) FROM "IntakeAsset" a WHERE a."id" IN (r."sideAssetId", r."rearAssetId") AND a."purgedAt" IS NOT NULL) = 2
      OR GREATEST(s."lastFinalizedAt", (SELECT max(p."publishedAt") FROM "IntakePublication" p WHERE p."submissionId" = s."id")) <= ${cutoff}
    )
  `);
  return rows.map((r) => r.id);
}

function listWhere(f: IntakeListFilters, adminId: string, unread: readonly string[], blockedReady: readonly string[]): Prisma.IntakeSubmissionWhereInput {
  const where: Prisma.IntakeSubmissionWhereInput = {};
  const and: Prisma.IntakeSubmissionWhereInput[] = [];
  if (f.status) where.status = f.status;
  if (f.analysis) where.analysisStatus = f.analysis;
  if (f.publication) where.publicationStatus = f.publication;
  if (f.invitation) where.invitation = { status: f.invitation };
  if (f.assignee === 'none') where.assigneeAdminId = null;
  else if (f.assignee) where.assigneeAdminId = f.assignee === 'me' ? adminId : f.assignee;
  if (f.unread) and.push({ id: { in: [...unread] } });
  /* '분석 가능'은 지금 돌릴 수 있다는 뜻이다 — 칩이 '분석 불가 · 원본 지워짐'이라고 말하는 접수는 안 섞는다 */
  if (f.analysis === 'ready' && blockedReady.length) and.push({ id: { notIn: [...blockedReady] } });
  if (and.length) where.AND = and;
  if (f.q) {
    const contains = { contains: f.q, mode: 'insensitive' as const };
    where.OR = [{ athleteName: contains }, { receiptCode: contains }, { submitterName: contains }, { invitation: { note: contains } }];
  }
  return where;
}

type RetentionSource = {
  withdrawnAt: Date | null;
  lastFinalizedAt: Date | null;
  currentRevisionId: string | null;
  publications: { publishedAt: Date }[];
  revisions: { id: string; sideAssetId: string; rearAssetId: string }[];
  assets: { id: string; purgedAt: Date | null }[];
};

/** 목록 · 상세가 같은 말을 하게 — 지금 판의 두 파일을 다 지웠으면 지운 시각이다. 판이 없는 접수는 있는 파일 전부를 본다 */
function retentionOf(s: RetentionSource) {
  const plan = shownRetention(originalRetention({ publishedAts: s.publications.map((p) => p.publishedAt), lastFrozenAt: s.lastFinalizedAt, withdrawnAt: s.withdrawnAt }), s.assets.length);
  return { plan, purgedAt: currentOriginalsPurgedAt(s.assets, s.revisions.find((r) => r.id === s.currentRevisionId) ?? null) };
}

/** 대표관리자가 함께 보는 접수함 — 만든 사람으로 거르지 않는다 */
export async function loadIntakeList(db: Db, actor: IntakeActor, f: IntakeListFilters, now: Date = new Date()): Promise<IntakeListResult> {
  assertIntakeAdmin(actor);
  const unread = await unreadIds(db, actor.id);
  const unreadSet = new Set(unread);
  const where = listWhere(f, actor.id, unread, f.analysis === 'ready' ? await blockedReadyIds(db, now) : []);
  const [total, admins] = await Promise.all([db.intakeSubmission.count({ where }), intakeAdmins(db)]);
  const pageCount = Math.max(1, Math.ceil(total / INTAKE_PAGE_SIZE));
  const page = Math.min(f.page, pageCount);
  const subs = await db.intakeSubmission.findMany({
    where,
    orderBy: [{ receivedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * INTAKE_PAGE_SIZE,
    take: INTAKE_PAGE_SIZE,
    include: {
      invitation: { select: { status: true, uploadExpiresAt: true, note: true } },
      assets: { select: { id: true, view: true, status: true, purgedAt: true } },
      revisions: { select: { id: true, sideAssetId: true, rearAssetId: true } },
      publications: { select: { publishedAt: true } },
      _count: { select: { consents: true } },
    },
  });
  const nameOf = new Map(admins.map((a) => [a.id, a.name]));
  const rows = subs.map((s): IntakeListRow => {
    const statusOf = (id: string | null) => (id ? (s.assets.find((a) => a.id === id)?.status ?? null) : null);
    const retention = retentionOf(s);
    const purging = purgingScope(s.assets, s.revisions.find((r) => r.id === s.currentRevisionId) ?? null);
    return {
      id: s.id,
      athleteName: s.athleteName,
      invitationNote: s.invitation.note,
      receiptCode: s.receiptCode,
      receivedAt: s.receivedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      side: slotProgressOf(s.assets, 'side', statusOf(s.sideAssetId)),
      rear: slotProgressOf(s.assets, 'rear', statusOf(s.rearAssetId)),
      status: s.status,
      analysisStatus: s.analysisStatus,
      publicationStatus: s.publicationStatus,
      invitationStatus: s.invitation.status,
      uploadExpired: uploadExpired(s.invitation, now),
      assigneeId: s.assigneeAdminId,
      assigneeName: s.assigneeAdminId ? (nameOf.get(s.assigneeAdminId) ?? '알 수 없음') : null,
      unread: unreadSet.has(s.id),
      originalPurgeAt: iso(retention.plan?.purgeAt),
      originalsPurgedAt: iso(retention.purgedAt),
      originalsPurging: purging,
      hasRevision: s.currentRevisionId != null,
      analysisBlock: analysisBlockOf(
        { status: s.status, invitationStatus: s.invitation.status, originalPurgeAt: iso(retention.plan?.purgeAt), originalsPurgedAt: iso(retention.purgedAt), originalsPurging: purging, hasRevision: s.currentRevisionId != null },
        now,
      ),
      untouched: isUntouchedSubmission({ status: s.status, version: s.version, receivedAt: s.receivedAt, assets: s.assets.length, consents: s._count.consents, revisions: s.revisions.length }),
    };
  });
  return { rows, total, page, pageCount, pageSize: INTAKE_PAGE_SIZE, unreadCount: unread.length, admins };
}

/* ────────────────────────────── 상세 ────────────────────────────── */

export type IntakeAssetDetail = {
  id: string;
  view: IntakeView;
  status: string;
  /** 지금 칸이 가리키는 자산인가 */
  current: boolean;
  /** 이 자산을 얼린 판 번호 */
  revisions: number[];
  fileName: string;
  declaredType: string | null;
  declaredBytes: number;
  storedBytes: number | null;
  clientSha256: string;
  serverSha256: string | null;
  /** 서버가 잰 해시가 고른 파일과 같다 */
  hashMatched: boolean;
  rejectCode: string | null;
  integrity: string | null;
  fps: string | null;
  averageFps: number | null;
  timing: string | null;
  container: string | null;
  brand: string | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  frameCount: number | null;
  frameTiming: string | null;
  /** 표본 시간 — 재생 길이가 아니다. 촬영 길이라고 말해도 되는지는 durationLabel 이 정한다 */
  sampleDurationSec: number | null;
  /** sampleDurationSec 칸의 이름 — '촬영 길이' 또는 '표본 시간' */
  durationLabel: string;
  playbackDurationSec: number | null;
  make: string | null;
  model: string | null;
  /** 파일에 적힌 촬영 시각과 그 출처 — 접수일이 아니다 */
  captureAt: string | null;
  captureAtSource: string | null;
  uploadedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  /** 저장소에 바이트가 있어 미리보기 · 내려받기를 줄 수 있나 */
  available: boolean;
  /** 저장소에서 지운 시각 — 해시 · 파일 사실은 남는다 */
  purgedAt: string | null;
};

/** 끝나지 못한 일감 — 접수가 '확인 중'에 멈춘 까닭을 관리자가 본다 */
export type IntakeJobIssue = {
  id: string;
  kind: string;
  /**
   * failed 시도를 다 씀 · retrying 실패 뒤 기다림 · stalled 차례가 지났는데 안 돎 ·
   * waiting 실패가 아니라 실행 예산 때문에 기다리는 파일 확인(큰 파일 — 크론이 이어 받거나 검증 작업자를 기다린다. 시도 횟수를 안 쓴다)
   */
  state: 'failed' | 'retrying' | 'stalled' | 'waiting';
  attempts: number;
  maxAttempts: number;
  /** 주소 · 저장 경로를 지운 오류 글 — 기다림(waiting)은 오류가 아니라 비워 두고 글을 note 에 둔다 */
  lastError: string | null;
  /** 기다림 글 — waiting 일 때 왜 기다리는지(lib/intake/job-handlers.ts VERIFY_BUDGET_NOTES). 화면은 오류 색 없이 보인다. 그 밖에는 null */
  note?: string | null;
  view: IntakeView | null;
  revisionNumber: number | null;
  updatedAt: string;
  /** '다시 확인'으로 풀 수 있는 일감인가 */
  canRequeue: boolean;
};

export type IntakeDetail = {
  id: string;
  /** 낙관 잠금 — 고침 요청이 이 값을 보낸다 */
  version: number;
  status: string;
  analysisStatus: string;
  publicationStatus: string;
  receiptCode: string | null;
  receivedAt: string | null;
  lastFinalizedAt: string | null;
  createdAt: string;
  athleteName: string | null;
  athleteAgeBand: string | null;
  throwingHand: string | null;
  submitterRelation: string;
  submitterName: string | null;
  samePitchConfirmed: boolean;
  assigneeId: string | null;
  admins: IntakeAdminPerson[];
  unread: boolean;
  correction: CorrectionRequest | null;
  correctionRequestedAt: string | null;
  invitation: {
    id: string;
    status: string;
    note: string | null;
    createdBy: string | null;
    createdAt: string;
    uploadExpiresAt: string;
    uploadExpired: boolean;
    resultExpiresAt: string | null;
    revokedAt: string | null;
    revokedBy: string | null;
    /** 코드 값은 저장돼 있지 않다 — 걸려 있는지만 안다 */
    hasAccessCode: boolean;
    /** 틀린 코드로 결과 보기가 잠겼나 — 풀면 코드는 그대로다 */
    accessCodeLocked: boolean;
    accessCodeFailures: number;
    /** 관리자가 풀어 줄 것이 있나 — 잠겼거나, 한도를 채운 시도가 끝을 못 적어 잠기기 전에 막혀 있다 */
    accessCodeNeedsReset: boolean;
    limits: IntakeLimits;
    /** 링크를 새로 바꾼 횟수 — 새 링크 만들기가 이 값을 보내 맞춰 본다 */
    reissueCount: number;
    /** 링크를 마지막으로 바꾼 시각 — 없으면 null */
    reissuedAt: string | null;
  };
  /** 받는 분이 아직 아무것도 안 했나 — 링크를 못 받았을 수 있다. 열었는지는 모른다 */
  untouched: boolean;
  assets: IntakeAssetDetail[];
  revisions: { id: string; number: number; status: string; failureCode: string | null; athleteName: string; finalizedAt: string; settledAt: string | null; current: boolean }[];
  consents: { id: string; kind: string; granted: boolean; docVersion: string; proxy: boolean; relation: string; agreedAt: string; withdrawnAt: string | null }[];
  /** 위 목록에 못 실은 오래된 동의 줄 수 — 판단에 드는 줄은 늘 실린다 */
  consentsHidden: number;
  consentRequiredOk: boolean;
  modelUseAllowed: boolean;
  /** 거둘 모델 동의가 남아 있나 — 마지막 답이 동의일 때다. 동의 판이 낡거나 관계가 바뀌어 modelUseAllowed 가 false 여도 답은 남아 있을 수 있다. 거부 줄만 있으면 false 다 */
  modelConsentOpen: boolean;
  publications: { id: string; number: number; runId: string; active: boolean; explanation: string | null; publishedAt: string; publishedBy: string; unpublishedAt: string | null; unpublishedBy: string | null }[];
  /** 지금 공개 번호 — 공개 · 내리기가 '알던 공개'로 보낸다. 없으면 null */
  activePublicationId: string | null;
  /** 시도를 다 썼거나 멈춘 일감 — 지울 때가 지났는데 남은 임시 파일도 든다(접수에 안 묶인 정리 일감이라 자산 줄로 찾는다) */
  jobIssues: IntakeJobIssue[];
  /** 새 분석을 못 하는 까닭 — 목록과 같은 판단이다(analysisBlockOf). 없으면 null */
  analysisBlock: AnalysisBlock | null;
  /** 받은 파일을 다 지운 시각 — 목록의 originalsPurgedAt 과 같다. 시계가 없는 초안(임시 파일만 지움)도 여기 든다. 남아 있으면 null */
  filesPurgedAt: string | null;
  /** 원본 보유 — 끝내지 않은 초안과 지울 파일이 없는 철회 초안은 null */
  retention: {
    purgeAt: string;
    anchorAt: string;
    basis: RetentionBasis;
    /** 다 지운 시각 — 남아 있으면 null */
    purgedAt: string | null;
    /** 열린 고침을 기다려 주는 끝 — 기다리지 않으면 null */
    heldUntil: string | null;
    /** 지우는 중인 파일 — since 는 가장 먼저 지우기로 정한 시각이다. scope 'current' 면 since · files 는 지금 판의 파일만 보고, 'older' 면 옛 판의 파일뿐이다. 없으면 null */
    purging: { since: string; files: number; scope: PurgingScope } | null;
  } | null;
  notes: { id: string; body: string; authorId: string; author: string; mine: boolean; createdAt: string }[];
  audit: { id: string; action: string; actor: string; actorKind: string; detail: Record<string, unknown> | null; createdAt: string }[];
};

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const numberOrNull = (v: bigint | null | undefined) => (v == null ? null : Number(v));

/**
 * 판에 안 오른 파일을 철회 때문에 지웠나 — 철회한 접수이고 지운 때(지우는 중이면 그렇게 적은 때)가 철회 뒤다.
 * 철회 앞에 정리가 지운 파일은 그냥 쓰이지 않은 임시 파일이다.
 */
const goneByWithdrawal = (a: { status: string; purgedAt: Date | null; updatedAt: Date }, s: { status: string; withdrawnAt: Date | null }) =>
  s.status === 'withdrawn' && s.withdrawnAt != null && assetGone(a.status) && (a.purgedAt ?? a.updatedAt).getTime() >= s.withdrawnAt.getTime();

/** 바이트가 저장소에 있나 — 도착 기록이 있고 지웠거나 지우는 중인 것이 아니면 된다 */
const hasBytes = (a: { status: string; uploadedAt: Date | null; storedBytes: bigint | null }) =>
  !assetGone(a.status) && a.status !== 'abandoned' && (a.uploadedAt != null || a.storedBytes != null);

type JobRow = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAfter: Date;
  leaseUntil: Date | null;
  updatedAt: Date;
  payload: { assetId?: string; revisionId?: string; runId?: string } | null;
};

/** 일감 오류 글은 저장소 예외에서 온다 — 서명 주소 · 저장 경로가 섞여도 화면으로 안 나가게 지운다 */
export function jobErrorText(raw: string | null): string | null {
  return raw?.replace(/\bhttps?:\/\/\S+/g, '[주소]').replace(/\bsub\/[^\s'")]+/g, '[저장 경로]') ?? null;
}

/** 실행 예산 때문에 줄에서 기다리는 파일 확인인가 — 크론이 '남은 시간이 모자라' 건너뛰었거나 해시를 끊어 되돌린 일이다(lib/intake/jobs.ts) */
export const isVerifyBudgetWait = (j: Pick<JobRow, 'kind' | 'status' | 'lastError'>) => j.kind === 'verify_asset' && j.status === 'queued' && isVerifyBudgetNote(j.lastError);

/**
 * 일감의 모습 — 보일 것이 없으면 null.
 * 예산 때문에 기다리는 파일 확인은 차례가 지나도 '멈춤' · '재시도'가 아니다. 크론은 건너뛸 때 차례를 안 미뤄서(다음 실행에서 먼저 집게) 시간만 보면 멈춘 것처럼 보인다.
 * 도는 중인데 임대가 끝난 일은 기다림 글이 남아 있어도 일꾼이 죽은 것이라 멈춤이다.
 * 기다림도 크론이 한 시간 넘게 손대지 않았으면(차례 · updatedAt 둘 다 JOB_WAIT_STALL_MS 넘게 지남) 멈춤이다 — 크론이 죽었는데 조용한 기다림으로 숨지 않게.
 */
export function jobStateOf(j: Pick<JobRow, 'kind' | 'status' | 'lastError' | 'runAfter' | 'leaseUntil' | 'updatedAt'>, now: Date): IntakeJobIssue['state'] | null {
  if (j.status === 'failed') return 'failed';
  if (j.status === 'running') return j.leaseUntil && j.leaseUntil < now ? 'stalled' : null;
  if (j.status !== 'queued') return null;
  if (isVerifyBudgetWait(j)) {
    const lastTouchMs = Math.max(j.runAfter.getTime(), j.updatedAt.getTime());
    return now.getTime() - lastTouchMs > JOB_WAIT_STALL_MS ? 'stalled' : 'waiting';
  }
  if (now.getTime() - j.runAfter.getTime() > JOB_STALL_MS) return 'stalled';
  return j.lastError ? 'retrying' : null;
}

/**
 * '다시 확인'으로 풀 수 있는 일감인가 — 시도를 다 쓴 파일 확인 · 분석 등록, 그리고 예산 때문에 기다리는 파일 확인(requeueJob 이 차례를 지금으로 당기고 끊김 기록을 지운다).
 * 줄에서 재시도를 기다리거나 도는 일감은 일꾼이 집어 간다.
 */
export function canRequeueJob(kind: string, state: IntakeJobIssue['state']): boolean {
  if (state === 'waiting') return kind === 'verify_asset';
  return state === 'failed' && (kind === 'verify_asset' || kind === 'register_revision');
}

/** 이 접수의 끝나지 못한 일감 — 일감 표에는 접수 번호 칸이 없어 payload 의 접수 · 자산 · 판 · 실행 번호로 찾는다 */
async function jobIssuesOf(
  db: Db,
  input: { submissionId: string; assets: { id: string; view: string; status: string }[]; revisions: { id: string; number: number }[]; runs: { id: string; status: string }[]; currentRevisionId: string | null; verifyTargets: readonly string[]; purgeLive: boolean },
  now: Date,
): Promise<IntakeJobIssue[]> {
  const ids = [input.submissionId, ...input.assets.map((a) => a.id), ...input.revisions.map((r) => r.id), ...input.runs.map((r) => r.id)];
  const rows = await db.$queryRaw<JobRow[]>(Prisma.sql`
    SELECT "id", "kind", "status", "attempts", "maxAttempts", "lastError", "runAfter", "leaseUntil", "updatedAt", "payload"
    FROM "IntakeJob"
    WHERE "status" <> 'done'
      AND ("payload"->>'assetId' = ANY(${ids}) OR "payload"->>'revisionId' = ANY(${ids}) OR "payload"->>'runId' = ANY(${ids}) OR "payload"->>'submissionId' = ANY(${ids}))
    ORDER BY "updatedAt" DESC
    LIMIT ${MAX_JOB_ISSUES}
  `);
  const issues: IntakeJobIssue[] = [];
  for (const j of rows) {
    const state = jobStateOf(j, now);
    if (!state) continue;
    /* 일감이 멈춘 뒤 고침으로 넘어간 대상은 더 볼 일이 없다 — 남겨 두면 '다시 확인'이 안 받는, 풀 수 없는 경고가 된다 */
    const asset = input.assets.find((a) => a.id === j.payload?.assetId);
    if (j.kind === 'verify_asset' && asset && ((asset.status !== 'uploaded' && asset.status !== 'verifying') || !input.verifyTargets.includes(asset.id))) continue;
    if (j.kind === 'register_revision' && j.payload?.revisionId !== input.currentRevisionId) continue;
    if (j.kind === 'poll_analysis' && input.runs.some((r) => r.id === j.payload?.runId && (r.status === 'succeeded' || r.status === 'failed'))) continue;
    /* 다 지운 뒤에 일감을 닫기 전에 일꾼이 죽으면 임대가 끝나 실패로 닫히고, 다시 걸 까닭이 없어 그대로 남는다 */
    if (j.kind === 'purge_originals' && !input.purgeLive) continue;
    const view = asset?.view;
    issues.push({
      id: j.id,
      kind: j.kind,
      state,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      /* 기다림 글은 오류가 아니다 — 오류 칸에 두면 화면이 실패처럼 붉게 그린다 */
      lastError: state === 'waiting' ? null : jobErrorText(j.lastError),
      note: state === 'waiting' ? jobErrorText(j.lastError) : null,
      view: isIntakeView(view) ? view : null,
      revisionNumber: input.revisions.find((r) => r.id === j.payload?.revisionId)?.number ?? null,
      updatedAt: j.updatedAt.toISOString(),
      canRequeue: canRequeueJob(j.kind, state),
    });
  }
  return issues;
}

/**
 * 지울 때가 지났는데 남은 판 밖 파일 — 정리 일감(cleanup_uploads)은 모든 접수를 한 번에 훑어 payload 에 접수가 없어서 jobIssuesOf 가 못 찾는다. 그래서 자산 줄로 찾는다.
 * 조건은 cleanupStaleUploads 가 지울 줄을 고르는 조건과 같다(service.ts cleanupCutoffs). 정리는 15분마다 돌아서, 그 한 칸이 지나도 남은 것만 멈춘 것으로 본다.
 * 정리는 칸마다 새 일감으로 다시 지우므로 '다시 시도하는 중'이다. 까닭 글은 가장 최근에 오류를 남긴 정리 일감의 것이다 — 다른 접수의 파일 때문에 남은 글일 수도 있다.
 */
async function cleanupLeftovers(
  db: Db,
  s: { status: string; withdrawnAt: Date | null; sideAssetId: string | null; rearAssetId: string | null; assets: { id: string; view: string; status: string; updatedAt: Date }[] },
  frozen: ReadonlySet<string>,
  now: Date,
): Promise<IntakeJobIssue[]> {
  const { cutoff, withdrawnCutoff } = cleanupCutoffs(new Date(now.getTime() - JOB_STALL_MS));
  const overdue = (a: { updatedAt: Date }) => (s.status === 'withdrawn' ? s.withdrawnAt != null && s.withdrawnAt <= withdrawnCutoff : a.updatedAt < cutoff);
  const left = s.assets.filter((a) => (a.status === 'replaced' || a.status === 'abandoned') && !frozen.has(a.id) && a.id !== s.sideAssetId && a.id !== s.rearAssetId && overdue(a));
  if (left.length === 0) return [];
  const job = await db.intakeJob.findFirst({ where: { kind: 'cleanup_uploads', lastError: { not: null } }, orderBy: { updatedAt: 'desc' }, select: { attempts: true, maxAttempts: true, lastError: true, updatedAt: true } });
  return left.map((a) => ({
    id: `cleanup:${a.id}`,
    kind: 'cleanup_uploads',
    state: 'retrying' as const,
    attempts: job?.attempts ?? 0,
    maxAttempts: job?.maxAttempts ?? 0,
    lastError: jobErrorText(job?.lastError ?? null),
    view: isIntakeView(a.view) ? a.view : null,
    revisionNumber: null,
    updatedAt: (job?.updatedAt ?? a.updatedAt).toISOString(),
    canRequeue: false,
  }));
}

/** 접수 하나 — 읽기만 한다. 읽음 표시는 화면이 붙은 뒤에 따로 부른다(미리 받기가 읽음으로 만들지 않게) */
export async function loadIntakeDetail(db: Db, actor: IntakeActor, submissionId: string, now: Date = new Date()): Promise<IntakeDetail> {
  assertIntakeAdmin(actor);
  mustSubmissionId(submissionId);
  const s = await db.intakeSubmission.findUnique({
    where: { id: submissionId },
    include: {
      invitation: true,
      assets: { orderBy: { createdAt: 'asc' } },
      revisions: { orderBy: { number: 'desc' } },
      consents: { orderBy: { agreedAt: 'desc' }, take: MAX_CONSENT_ROWS },
      publications: { orderBy: { number: 'desc' } },
      notes: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
      reads: { where: { adminId: actor.id }, select: { readAt: true } },
      runs: { select: { id: true, status: true } },
    },
  });
  if (!s) throw new IntakeError('submission_not_found');

  const currentRevision = s.revisions.find((r) => r.id === s.currentRevisionId) ?? null;
  const verifyTargets = verifyTargetIds(s, currentRevision);
  const { plan, purgedAt } = retentionOf(s);
  /* 지울 일이 남았나 — 지우는 파일이 있거나, 지울 날이 지난 판 파일이 아직 표시 전이다 */
  const frozen = new Set(s.revisions.flatMap((r) => [r.sideAssetId, r.rearAssetId]));
  const purgeLive = s.assets.some((a) => a.status === 'purging') || (retentionDue(plan, now) && s.assets.some((a) => frozen.has(a.id) && !assetGone(a.status)));
  const jobIssues = [
    ...(await jobIssuesOf(db, { submissionId: s.id, assets: s.assets, revisions: s.revisions, runs: s.runs, currentRevisionId: s.currentRevisionId, verifyTargets, purgeLive }, now)),
    ...(await cleanupLeftovers(db, s, frozen, now)),
  ];
  const [decision, consentTotal] = await Promise.all([consentDecisionRows(db, s.id), db.intakeConsent.count({ where: { submissionId: s.id } })]);
  const shown = new Set(s.consents.map((c) => c.id));
  const consents = [...s.consents, ...decision.filter((c) => !shown.has(c.id))].sort((a, b) => b.agreedAt.getTime() - a.agreedAt.getTime());
  const auditScope = { OR: [{ submissionId: s.id }, { invitationId: s.invitationId }] };
  const [staffAudit, inviteeAudit] = await Promise.all([
    db.intakeAudit.findMany({ where: { ...auditScope, actorKind: { not: 'invitee' } }, orderBy: { createdAt: 'desc' }, take: MAX_AUDIT_ROWS }),
    db.intakeAudit.findMany({ where: { ...auditScope, actorKind: 'invitee' }, orderBy: { createdAt: 'desc' }, take: MAX_INVITEE_AUDIT_ROWS }),
  ]);
  const audit = [...staffAudit, ...inviteeAudit].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const admins = await intakeAdmins(db);
  const personIds = new Set<string>();
  const note = (id: string | null | undefined) => {
    if (id) personIds.add(id);
  };
  note(s.invitation.createdByAdminId);
  note(s.invitation.revokedByAdminId);
  s.notes.forEach((n) => note(n.adminId));
  s.publications.forEach((p) => {
    note(p.publishedByAdminId);
    note(p.unpublishedByAdminId);
  });
  audit.forEach((a) => note(a.actorId));
  const people = await db.user.findMany({ where: { id: { in: [...personIds] } }, select: { id: true, nickname: true } });
  const nameOf = new Map(people.map((u) => [u.id, u.nickname]));
  const person = (id: string | null | undefined) => (id ? (nameOf.get(id) ?? '알 수 없는 관리자') : null);

  const frozenIn = (assetId: string) => s.revisions.filter((r) => r.sideAssetId === assetId || r.rearAssetId === assetId).map((r) => r.number);
  const assets = s.assets.map((a): IntakeAssetDetail => {
    const facts = a.mediaFacts as IntakeMediaFacts | null;
    const revisions = frozenIn(a.id);
    return {
      id: a.id,
      view: a.view as IntakeView,
      status: a.status,
      current: a.id === s.sideAssetId || a.id === s.rearAssetId,
      revisions,
      fileName: a.originalName,
      declaredType: a.declaredType,
      declaredBytes: Number(a.declaredSize),
      storedBytes: numberOrNull(a.storedBytes),
      clientSha256: a.clientSha256,
      serverSha256: a.serverSha256,
      hashMatched: a.serverSha256 != null && a.serverSha256 === a.clientSha256,
      rejectCode: a.rejectCode,
      integrity: integrityLabel(a.status, revisions.length > 0, goneByWithdrawal(a, s)),
      fps: facts ? fpsLabel(facts) : null,
      averageFps: facts?.averageFps ?? null,
      timing: facts ? timingNote(facts) : null,
      container: facts?.container ?? null,
      brand: facts?.brand ?? null,
      codec: facts?.codec ?? null,
      width: facts?.width ?? null,
      height: facts?.height ?? null,
      rotation: facts?.rotation ?? null,
      frameCount: facts?.frameCount ?? null,
      frameTiming: facts?.frameTiming ?? null,
      sampleDurationSec: facts?.sampleDurationSec ?? null,
      durationLabel: sampleDurationLabel(facts),
      playbackDurationSec: facts?.playbackDurationSec ?? null,
      make: facts?.make ?? null,
      model: facts?.model ?? null,
      captureAt: iso(a.captureAt),
      captureAtSource: a.captureAtSource,
      uploadedAt: iso(a.uploadedAt),
      verifiedAt: iso(a.verifiedAt),
      createdAt: a.createdAt.toISOString(),
      available: hasBytes(a),
      purgedAt: iso(a.purgedAt),
    };
  });

  const scope = purgingScope(s.assets, currentRevision);
  /* 지금 판을 지우는 중이면 지금 판의 줄만 본다 — 옛 판이 먼저 멈춰 있으면 그 시각은 지금 판 파일이 생기기도 전이다 */
  const purgingRows = s.assets.filter((a) => a.status === 'purging' && (scope !== 'current' || a.id === currentRevision?.sideAssetId || a.id === currentRevision?.rearAssetId));
  /* 지금 판을 지우기 시작했거나 다 지웠으면 기다릴 삭제가 없다 — 표시는 고침을 안 기다린다(lib/intake/purge.ts) */
  const heldUntil = scope === 'current' || purgedAt ? null : correctionHoldUntil(plan, { status: s.status, invitationStatus: s.invitation.status, uploadExpiresAt: s.invitation.uploadExpiresAt }, now);
  /* 표시할 때 updatedAt 을 그 시각으로 적고, 그 뒤로 이 줄을 쓰는 곳이 없다 */
  const purging = scope ? { since: new Date(Math.min(...purgingRows.map((a) => a.updatedAt.getTime()))).toISOString(), files: purgingRows.length, scope } : null;

  const readAt = s.reads[0]?.readAt ?? null;
  return {
    id: s.id,
    version: s.version,
    status: s.status,
    analysisStatus: s.analysisStatus,
    publicationStatus: s.publicationStatus,
    receiptCode: s.receiptCode,
    receivedAt: iso(s.receivedAt),
    lastFinalizedAt: iso(s.lastFinalizedAt),
    createdAt: s.createdAt.toISOString(),
    athleteName: s.athleteName,
    athleteAgeBand: s.athleteAgeBand,
    throwingHand: s.throwingHand,
    submitterRelation: s.submitterRelation,
    submitterName: s.submitterName,
    samePitchConfirmed: s.samePitchConfirmed,
    assigneeId: s.assigneeAdminId,
    admins,
    unread: s.receivedAt != null && (readAt == null || readAt < s.updatedAt),
    correction: readCorrection(s.correction),
    correctionRequestedAt: iso(s.correctionRequestedAt),
    invitation: {
      id: s.invitation.id,
      status: s.invitation.status,
      note: s.invitation.note,
      createdBy: person(s.invitation.createdByAdminId),
      createdAt: s.invitation.createdAt.toISOString(),
      uploadExpiresAt: s.invitation.uploadExpiresAt.toISOString(),
      uploadExpired: uploadExpired(s.invitation, now),
      resultExpiresAt: iso(s.invitation.resultExpiresAt),
      revokedAt: iso(s.invitation.revokedAt),
      revokedBy: person(s.invitation.revokedByAdminId),
      hasAccessCode: s.invitation.accessCodeHash != null,
      accessCodeLocked: s.invitation.accessCodeLockedAt != null,
      accessCodeFailures: s.invitation.accessCodeFailures,
      accessCodeNeedsReset: s.invitation.accessCodeLockedAt != null || s.invitation.accessCodeFailures >= ACCESS_CODE_MAX_FAILURES,
      limits: intakeLimits(s.invitation),
      reissueCount: s.invitation.tokenReissueCount,
      reissuedAt: iso(s.invitation.tokenReissuedAt),
    },
    untouched: isUntouchedSubmission({ status: s.status, version: s.version, receivedAt: s.receivedAt, assets: s.assets.length, consents: consentTotal, revisions: s.revisions.length }),
    assets,
    revisions: s.revisions.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      failureCode: r.failureCode,
      athleteName: r.athleteName,
      finalizedAt: r.finalizedAt.toISOString(),
      settledAt: iso(r.settledAt),
      current: r.id === s.currentRevisionId,
    })),
    consents: consents.map((c) => ({
      id: c.id,
      kind: c.kind,
      granted: c.granted,
      docVersion: c.docVersion,
      proxy: c.proxy,
      relation: c.relation,
      agreedAt: c.agreedAt.toISOString(),
      withdrawnAt: iso(c.withdrawnAt),
    })),
    consentsHidden: Math.max(0, consentTotal - consents.length),
    consentRequiredOk: hasRequiredConsents(decision, s.submitterRelation),
    modelUseAllowed: modelUseAllowed(decision, s.submitterRelation),
    modelConsentOpen: latestConsents(decision).get('model')?.granted === true,
    publications: s.publications.map((p) => ({
      id: p.id,
      number: p.number,
      runId: p.runId,
      active: p.activeFor != null,
      explanation: p.explanation,
      publishedAt: p.publishedAt.toISOString(),
      publishedBy: person(p.publishedByAdminId) ?? '알 수 없는 관리자',
      unpublishedAt: iso(p.unpublishedAt),
      unpublishedBy: person(p.unpublishedByAdminId),
    })),
    activePublicationId: s.publications.find((p) => p.activeFor != null)?.id ?? null,
    jobIssues,
    analysisBlock: analysisBlockOf(
      { status: s.status, invitationStatus: s.invitation.status, originalPurgeAt: iso(plan?.purgeAt), originalsPurgedAt: iso(purgedAt), originalsPurging: scope, hasRevision: currentRevision != null },
      now,
    ),
    filesPurgedAt: iso(purgedAt),
    retention: plan ? { purgeAt: plan.purgeAt.toISOString(), anchorAt: plan.anchorAt.toISOString(), basis: plan.basis, purgedAt: iso(purgedAt), heldUntil: iso(heldUntil), purging } : null,
    notes: s.notes.map((n) => ({
      id: n.id,
      body: n.body,
      authorId: n.adminId,
      author: person(n.adminId) ?? '알 수 없는 관리자',
      mine: n.adminId === actor.id,
      createdAt: n.createdAt.toISOString(),
    })),
    audit: audit.map((a) => ({
      id: a.id,
      action: a.action,
      actor: a.actorKind === 'admin' ? (person(a.actorId) ?? '알 수 없는 관리자') : a.actorKind === 'invitee' ? '보내는 분' : '시스템',
      actorKind: a.actorKind,
      detail: (a.detail as Record<string, unknown> | null) ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

/* ────────────────────────────── 준비 상태 ────────────────────────────── */

/** 초대 쪽 동작이 기대는 표 · 칸 — 마이그레이션(prisma/pending-migrations)을 적용하기 전이면 없다 */
const INTAKE_TABLES = [
  'IntakeInvitation',
  'IntakeSubmission',
  'IntakeRevision',
  'IntakeAsset',
  'IntakeConsent',
  'IntakeAnalysisRun',
  'IntakePublication',
  'IntakeAudit',
  'IntakeAdminNote',
  'IntakeAdminRead',
  'IntakeJob',
  'IntakeRateLimit',
] as const;
const INVITATION_COLUMNS = ['createRequestKey', 'tokenReissueCount', 'tokenReissuedAt', 'adminReissuedAt'] as const;

export type IntakeReadinessBlocker = 'db' | 'origin';

export type IntakeReadiness = {
  /** 초대를 만들거나 링크를 바꿔도 되나 */
  ready: boolean;
  blockers: IntakeReadinessBlocker[];
  /** DB 에 없는 표 · 칸 — 화면에 그대로 보이지 않고 수만 쓴다 */
  missing: string[];
  link: LinkOrigin;
};

/** 표가 없을 때 Prisma 가 던지는 것 — 표 없음 P2021 · 칸 없음 P2022 */
export const isMissingTableError = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2021' || e.code === 'P2022');

/**
 * 초대를 만들 준비가 됐나 — 표 · 칸이 있고, 받는 사람에게 보낼 정식 주소가 있다(운영이면 필수, 개발이면 '개발용 링크'로 만든다 — lib/intake/link-origin.ts).
 * 화면은 버튼을 끄고 까닭을 말하며, 서버 동작은 같은 판단으로 다시 막는다(assertIntakeReady).
 */
export async function checkIntakeReadiness(db: Db, env: LinkOriginEnv = process.env): Promise<IntakeReadiness> {
  const link = resolveLinkOrigin(env);
  const rows = await db.$queryRaw<{ table_name: string; column_name: string }[]>(Prisma.sql`
    SELECT table_name::text AS table_name, column_name::text AS column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name::text = ANY(${[...INTAKE_TABLES]})
  `);
  const tables = new Set(rows.map((r) => r.table_name));
  const invitationColumns = new Set(rows.filter((r) => r.table_name === 'IntakeInvitation').map((r) => r.column_name));
  const missing = [
    ...INTAKE_TABLES.filter((t) => !tables.has(t)),
    ...(tables.has('IntakeInvitation') ? INVITATION_COLUMNS.filter((c) => !invitationColumns.has(c)).map((c) => `IntakeInvitation.${c}`) : []),
  ];
  const blockers: IntakeReadinessBlocker[] = [];
  if (missing.length) blockers.push('db');
  /* 운영에서는 정식 주소가 없으면 막는다. 개발 · 미리보기는 만들되 화면이 '보내면 안 되는 링크'로 보인다. 주소를 아예 못 읽으면 어디서든 막는다 */
  if (!link.origin || (!link.external && link.strict)) blockers.push('origin');
  return { ready: blockers.length === 0, blockers, missing, link };
}

/** 준비가 안 됐으면 던진다 — 서버 동작이 만들기 · 바꾸기 앞에서 부른다 */
async function assertIntakeReady(db: Db, env: LinkOriginEnv): Promise<IntakeReadiness> {
  const readiness = await checkIntakeReadiness(db, env);
  if (!readiness.ready) throw new IntakeError('intake_not_ready', { blockers: readiness.blockers, missing: readiness.missing.length, source: readiness.link.source });
  return readiness;
}

/** 표가 없으면 준비 안 됨으로 바꿔 던진다 — 확인과 쓰기 사이에 마이그레이션이 바뀌어도 화면이 오류로 넘어가지 않게 */
async function orNotReady<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (isMissingTableError(e)) throw new IntakeError('intake_not_ready', { blockers: ['db'] });
    throw e;
  }
}

/* ────────────────────────────── 초대 ────────────────────────────── */

export type AdminInvitationInput = {
  note?: string | null;
  /** 올리기 기간(일) — 비우면 기본값 */
  uploadDays?: number | null;
  /** 결과 보기 기간(일) — 비우면 만료 없음 */
  resultDays?: number | null;
  accessCode?: string | null;
  maxFileBytes?: number | null;
  maxTotalBytes?: number | null;
  /** 만들기 요청 키 — 관리 화면이 창마다 만든 UUID(service.ts CreateInvitationInput.createRequestKey) */
  createRequestKey?: string | null;
};

const wholeInRange = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;

/** 초대를 만든다 — 돌려준 토큰은 이 응답에서만 볼 수 있다. 저장 · 기록하지 말 것 */
export async function adminCreateInvitation(db: Db, actor: IntakeActor, input: AdminInvitationInput, now: Date = new Date()): Promise<CreatedInvitation> {
  assertIntakeAdmin(actor);
  if (input.uploadDays != null && !wholeInRange(input.uploadDays, 1, MAX_UPLOAD_DAYS)) throw new IntakeError('invalid_input', { field: 'uploadDays', max: MAX_UPLOAD_DAYS });
  if (input.resultDays != null && !wholeInRange(input.resultDays, 1, MAX_RESULT_DAYS)) throw new IntakeError('invalid_input', { field: 'resultDays', max: MAX_RESULT_DAYS });
  /* 한도는 버킷 한도 안에서만 — 프로젝트 전체 한도가 더 낮으면 저장소가 막는다(lib/intake/limits.ts) */
  if (input.maxFileBytes != null && !wholeInRange(input.maxFileBytes, MIN_LIMIT_BYTES, INTAKE_BUCKET_MAX_BYTES)) throw new IntakeError('invalid_input', { field: 'maxFileBytes', max: INTAKE_BUCKET_MAX_BYTES });
  if (input.maxTotalBytes != null && !wholeInRange(input.maxTotalBytes, MIN_LIMIT_BYTES, 2 * INTAKE_BUCKET_MAX_BYTES)) throw new IntakeError('invalid_input', { field: 'maxTotalBytes', max: 2 * GIB });
  if (input.maxFileBytes != null && input.maxTotalBytes != null && input.maxTotalBytes < input.maxFileBytes) throw new IntakeError('invalid_input', { field: 'maxTotalBytes' });
  const uploadExpiresAt = input.uploadDays != null ? new Date(now.getTime() + input.uploadDays * DAY_MS) : undefined;
  const resultExpiresAt = input.resultDays != null ? new Date(now.getTime() + input.resultDays * DAY_MS) : null;
  if (uploadExpiresAt && resultExpiresAt && resultExpiresAt < uploadExpiresAt) throw new IntakeError('invalid_input', { field: 'resultDays' });
  return createInvitation(
    db,
    {
      adminId: actor.id,
      note: input.note ?? null,
      uploadExpiresAt,
      resultExpiresAt,
      accessCode: input.accessCode?.trim() ? input.accessCode.trim() : null,
      maxFileBytes: input.maxFileBytes ?? null,
      maxTotalBytes: input.maxTotalBytes ?? null,
      createRequestKey: input.createRequestKey ?? null,
    },
    now,
  );
}

/** 보낼 링크가 붙은 초대 · 새 링크 — 링크는 서버가 설정에서 만든 앞쪽으로 붙인다(window.location 을 쓰지 않는다) */
export type IssuedLink = {
  /** 토큰 원문이 담긴 링크 — 이 응답에서만 볼 수 있다. 저장 · 기록하지 말 것 */
  link: string;
  /** 받는 사람에게 보내도 되는 정식 주소인가 — 아니면 화면이 '개발용 주소'라고 붙이고 보낼 링크 복사를 주지 않는다 */
  external: boolean;
};

const linkOf = (readiness: IntakeReadiness, token: string): IssuedLink => {
  const origin = readiness.link.origin;
  /* checkIntakeReadiness 가 앞쪽이 없으면 막는다 — 여기 닿으면 준비 판단이 바뀐 것이다 */
  if (!origin) throw new IntakeError('intake_not_ready', { blockers: ['origin'] });
  return { link: `${origin}/submit#${token}`, external: readiness.link.external };
};

/** 서버 동작의 초대 만들기 — 권한 · 준비 · 만들기 · 링크까지. 토큰 원문은 링크에만 담겨 나간다 */
export async function adminCreateInvitationLink(
  db: Db,
  actor: IntakeActor,
  input: AdminInvitationInput,
  env: LinkOriginEnv = process.env,
  now: Date = new Date(),
): Promise<IssuedLink & Omit<CreatedInvitation, 'token'>> {
  assertIntakeAdmin(actor);
  const readiness = await orNotReady(() => assertIntakeReady(db, env));
  const { token, ...made } = await orNotReady(() => adminCreateInvitation(db, actor, input, now));
  return { ...made, ...linkOf(readiness, token) };
}

/**
 * 링크를 새로 바꾼다 — 예전 링크는 곧바로 막히고, 받은 영상 · 공개 결과는 새 링크로 이어진다. 폐기한 초대는 못 바꾼다.
 * expectedReissueCount 는 화면이 본 바꿈 횟수다. 다른 관리자가 먼저 바꿨으면 'stale_reissue'.
 */
export async function adminReissueInvitation(
  db: Db,
  actor: IntakeActor,
  input: { submissionId: string; expectedReissueCount: number },
  env: LinkOriginEnv = process.env,
  now: Date = new Date(),
): Promise<IssuedLink & Omit<ReissuedInvitation, 'token'>> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  const readiness = await orNotReady(() => assertIntakeReady(db, env));
  const { token, ...made } = await orNotReady(() =>
    reissueInvitationToken(db, { adminId: actor.id, submissionId: input.submissionId, expectedReissueCount: input.expectedReissueCount }, now),
  );
  return { ...made, ...linkOf(readiness, token) };
}

/**
 * 초대를 폐기한다 — 새 토큰 · 완료 · 결과 보기 · 새 분석이 막힌다. 두 번 눌러도 처음 시각이 남는다.
 * 동의 철회는 아니다 — 원본은 계속 열리고, 돌던 분석은 끝까지 받는다. 받는 사람이 철회를 알렸으면 adminWithdrawConsent 로 따로 남긴다.
 * 이미 낸 전송 토큰은 저장소에서 바로 거둘 수 없어 수명까지 산다(docs/designs/external-intake.md).
 */
export async function adminRevokeInvitation(db: Db, actor: IntakeActor, input: { submissionId: string }, now: Date = new Date()): Promise<{ revoked: boolean }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  return db.$transaction(async (tx) => {
    const sub = await tx.intakeSubmission.findUnique({ where: { id: input.submissionId }, select: { id: true, invitationId: true } });
    if (!sub) throw new IntakeError('submission_not_found');
    const moved = await tx.intakeInvitation.updateMany({
      where: { id: sub.invitationId, status: 'active' },
      data: { status: 'revoked', revokedAt: now, revokedByAdminId: actor.id },
    });
    if (moved.count === 0) return { revoked: false };
    await writeAudit(tx, { actor: { kind: 'admin', id: actor.id }, action: 'invitation.revoked', invitationId: sub.invitationId, submissionId: sub.id }, now);
    return { revoked: true };
  });
}

/* ────────────────────────────── 담당자 ────────────────────────────── */

export type AssignInput = {
  submissionId: string;
  assigneeId: string | null;
  /** 화면이 알던 담당자 — 그사이 바뀌었으면 막는다 */
  expectedAssigneeId: string | null;
};

/** 비교 후 교체 — 두 관리자가 동시에 눌러도 하나만 된다. 진 쪽은 'stale_assignee'(지금 담당자를 detail 로) */
export async function assignSubmission(db: Db, actor: IntakeActor, input: AssignInput, now: Date = new Date()): Promise<{ assigneeId: string | null; changed: boolean }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  if (input.assigneeId != null) {
    const person = await db.user.findUnique({ where: { id: input.assigneeId }, select: { role: true } });
    if (!person || !can(person.role, 'intake')) throw new IntakeError('invalid_input', { field: 'assigneeId' });
  }
  return db.$transaction(async (tx) => {
    const moved = await tx.intakeSubmission.updateMany({
      where: { id: input.submissionId, assigneeAdminId: input.expectedAssigneeId },
      data: { assigneeAdminId: input.assigneeId },
    });
    if (moved.count === 0) {
      const sub = await tx.intakeSubmission.findUnique({ where: { id: input.submissionId }, select: { assigneeAdminId: true } });
      if (!sub) throw new IntakeError('submission_not_found');
      /* 같은 사람을 또 눌렀다 — 이미 된 일이다 */
      if (sub.assigneeAdminId === input.assigneeId) return { assigneeId: input.assigneeId, changed: false };
      throw new IntakeError('stale_assignee', { currentAssigneeId: sub.assigneeAdminId });
    }
    await writeAudit(tx, { actor: { kind: 'admin', id: actor.id }, action: 'assignee.changed', submissionId: input.submissionId, detail: { from: input.expectedAssigneeId, to: input.assigneeId } }, now);
    await touchRead(tx, actor.id, input.submissionId);
    return { assigneeId: input.assigneeId, changed: true };
  });
}

/* ────────────────────────────── 읽음(관리자별) ────────────────────────────── */

/** 내가 방금 한 일로 '안 읽음'이 되지 않게 — 읽은 시각은 실제 지금이다(updatedAt 이 실제 시각이라 견줄 수 있어야 한다) */
async function touchRead(db: Db | Tx, adminId: string, submissionId: string): Promise<void> {
  const readAt = new Date();
  await db.intakeAdminRead.upsert({
    where: { submissionId_adminId: { submissionId, adminId } },
    create: { submissionId, adminId, readAt },
    update: { readAt },
  });
}

/** 이 관리자의 읽음만 바꾼다 */
export async function markIntakeRead(db: Db, actor: IntakeActor, submissionId: string): Promise<void> {
  assertIntakeAdmin(actor);
  mustSubmissionId(submissionId);
  if (!(await db.intakeSubmission.count({ where: { id: submissionId } }))) throw new IntakeError('submission_not_found');
  try {
    await touchRead(db, actor.id, submissionId);
  } catch (e) {
    /* 탭 두 개가 같은 순간에 처음 읽으면 한쪽이 유일 제약에 걸린다 — 어차피 읽은 것이다 */
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
  }
}

export async function markIntakeUnread(db: Db, actor: IntakeActor, submissionId: string): Promise<void> {
  assertIntakeAdmin(actor);
  mustSubmissionId(submissionId);
  await db.intakeAdminRead.deleteMany({ where: { submissionId, adminId: actor.id } });
}

/* ────────────────────────────── 내부 메모 ────────────────────────────── */

function cleanNote(raw: unknown): string {
  if (typeof raw !== 'string') throw new IntakeError('invalid_input', { field: 'note' });
  const body = raw.normalize('NFC').replace(/[^\P{C}\n]/gu, '').trim();
  if (!body || [...body].length > MAX_NOTE_CHARS) throw new IntakeError('invalid_input', { field: 'note', max: MAX_NOTE_CHARS });
  return body;
}

export async function addIntakeNote(db: Db, actor: IntakeActor, input: { submissionId: string; body: string }, now: Date = new Date()): Promise<{ id: string }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  const body = cleanNote(input.body);
  return db.$transaction(async (tx) => {
    if (!(await tx.intakeSubmission.count({ where: { id: input.submissionId } }))) throw new IntakeError('submission_not_found');
    const note = await tx.intakeAdminNote.create({ data: { submissionId: input.submissionId, adminId: actor.id, body, createdAt: now } });
    /* 메모 내용은 감사 기록에 넣지 않는다 */
    await writeAudit(tx, { actor: { kind: 'admin', id: actor.id }, action: 'note.added', submissionId: input.submissionId, detail: { noteId: note.id } }, now);
    return { id: note.id };
  });
}

/** 메모를 숨긴다 — 쓴 사람만. 줄은 남는다 */
export async function deleteIntakeNote(db: Db, actor: IntakeActor, input: { submissionId: string; noteId: string }, now: Date = new Date()): Promise<void> {
  assertIntakeAdmin(actor);
  await db.$transaction(async (tx) => {
    const moved = await tx.intakeAdminNote.updateMany({
      where: { id: input.noteId, submissionId: input.submissionId, adminId: actor.id, deletedAt: null },
      data: { deletedAt: now },
    });
    if (moved.count === 0) throw new IntakeError('note_not_found');
    await writeAudit(tx, { actor: { kind: 'admin', id: actor.id }, action: 'note.deleted', submissionId: input.submissionId, detail: { noteId: input.noteId } }, now);
  });
}

/* ────────────────────────────── 고침 요청 ────────────────────────────── */

export type AdminCorrectionInput = {
  submissionId: string;
  expectedVersion: number;
  fields?: readonly string[];
  views?: readonly string[];
  message?: string | null;
  /** 올리기 기간을 오늘부터 며칠 늘릴까 */
  extendDays?: number | null;
};

/** 요청한 칸만 다시 연다. 올리기 기간이 끝났는데 안 늘리면 받는 사람이 못 고치니 막는다 */
export async function adminRequestCorrection(db: Db, actor: IntakeActor, input: AdminCorrectionInput, now: Date = new Date()): Promise<{ version: number }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  if (input.extendDays != null && !wholeInRange(input.extendDays, 1, MAX_UPLOAD_DAYS)) throw new IntakeError('invalid_input', { field: 'extendDays', max: MAX_UPLOAD_DAYS });
  const fields = (input.fields ?? []).filter((f): f is CorrectableField => (CORRECTABLE_FIELDS as readonly string[]).includes(f));
  const views = (input.views ?? []).filter(isIntakeView);
  if (fields.length !== (input.fields ?? []).length || views.length !== (input.views ?? []).length) throw new IntakeError('invalid_input', { field: 'correction' });

  const sub = await db.intakeSubmission.findUnique({ where: { id: input.submissionId }, select: { invitation: { select: { uploadExpiresAt: true } } } });
  if (!sub) throw new IntakeError('submission_not_found');
  const extendUploadUntil = input.extendDays != null ? new Date(now.getTime() + input.extendDays * DAY_MS) : undefined;
  if (uploadExpired(sub.invitation, now) && !extendUploadUntil) throw new IntakeError('invalid_input', { field: 'extendDays' });

  const result = await requestCorrection(db, { adminId: actor.id, submissionId: input.submissionId, fields, views, message: input.message, extendUploadUntil, expectedVersion: input.expectedVersion }, now);
  await touchRead(db, actor.id, input.submissionId);
  return result;
}

/** 고침 요청을 거둔다 — 접수는 지금 판의 상태로 돌아간다 */
export async function adminCancelCorrection(db: Db, actor: IntakeActor, input: { submissionId: string; expectedVersion: number }, now: Date = new Date()): Promise<{ version: number; status: string }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  const result = await cancelCorrection(db, { adminId: actor.id, submissionId: input.submissionId, expectedVersion: input.expectedVersion }, now);
  await touchRead(db, actor.id, input.submissionId);
  return result;
}

/** 올리기 기간을 오늘부터 며칠로 늘린다 — 초안 · 고침 중에만 뜻이 있다 */
export async function adminExtendUploadWindow(db: Db, actor: IntakeActor, input: { submissionId: string; days: number }, now: Date = new Date()): Promise<{ uploadExpiresAt: string }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  if (!wholeInRange(input.days, 1, MAX_UPLOAD_DAYS)) throw new IntakeError('invalid_input', { field: 'days', max: MAX_UPLOAD_DAYS });
  const result = await extendUploadWindow(db, { adminId: actor.id, submissionId: input.submissionId, until: new Date(now.getTime() + input.days * DAY_MS) }, now);
  await touchRead(db, actor.id, input.submissionId);
  return result;
}

/** 틀린 코드로 잠긴 결과 보기를 푼다 — 코드는 안 바뀐다 */
export async function adminResetAccessCodeLock(db: Db, actor: IntakeActor, input: { submissionId: string }, now: Date = new Date()): Promise<{ reset: boolean }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  const result = await resetAccessCodeLock(db, { adminId: actor.id, submissionId: input.submissionId }, now);
  await touchRead(db, actor.id, input.submissionId);
  return result;
}

/**
 * 받는 사람이 담당자에게 알린 필수 동의 철회를 남긴다 — 동의 글이 약속한 길이다. 관리자 동의로 대신하는 일이 아니라, 받은 요청을 적는 일이다.
 * 동의 줄 · 접수 · 공개가 한 트랜잭션에서 닫힌다(service.ts). 그 뒤로 새 분석 · 공개 · 원본 주소 · 미리보기가 막힌다.
 * 이미 돌던 분석은 멈출 수 없어서, 일꾼이 결과를 읽지 않고 실패로 닫는다(analysis.ts). 원본은 보유 기간 규칙대로 나중에 지운다. 모델 개발 동의는 함께 거두지 않는다.
 */
export async function adminWithdrawConsent(db: Db, actor: IntakeActor, input: { submissionId: string; note?: string | null }, now: Date = new Date()): Promise<{ withdrawn: boolean; unpublished: boolean }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  const result = await withdrawRequiredConsent(db, { adminId: actor.id, submissionId: input.submissionId, note: input.note ?? null }, now);
  await touchRead(db, actor.id, input.submissionId);
  return result;
}

/**
 * 받는 사람이 알린 모델 개발 동의 철회를 남긴다. 링크가 폐기됐으면 받는 사람의 화면이 없어서 이 길뿐이다.
 * 필수 동의 철회와 묶지 않는다 — 따로 남긴다고 사람이 정했다(2026-11-06). 동의 글이 그렇게 말한다.
 */
export async function adminWithdrawModelConsent(db: Db, actor: IntakeActor, input: { submissionId: string; note?: string | null }, now: Date = new Date()): Promise<{ withdrawn: boolean }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  const result = await withdrawModelConsentForInvitee(db, { adminId: actor.id, submissionId: input.submissionId, note: input.note ?? null }, now);
  await touchRead(db, actor.id, input.submissionId);
  return result;
}

/**
 * '다시 확인' — 멈춘 검증 · 등록을 다시 건다. 자산을 주면 그 하나, 안 주면 지금 판의 두 파일과 칸의 파일(고침 중 새로 고른 것), 등록 일감이다.
 * 끝난 자산은 다시 재지 않는다. 이 접수의 자산이 아니면 없는 것으로 나온다.
 */
export async function adminRequeueVerification(db: Db, actor: IntakeActor, input: { submissionId: string; assetId?: string }, now: Date = new Date()): Promise<{ requeued: number }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  const sub = await db.intakeSubmission.findUnique({ where: { id: input.submissionId } });
  if (!sub) throw new IntakeError('submission_not_found');
  if (sub.status === 'withdrawn') throw new IntakeError('original_locked');

  let requeued = 0;
  if (input.assetId !== undefined) {
    if (!isIntakeId(input.assetId) || !(await db.intakeAsset.count({ where: { id: input.assetId, submissionId: sub.id } }))) throw new IntakeError('asset_not_found');
    if ((await requeueVerification(db, { adminId: actor.id, assetId: input.assetId }, now)).requeued) requeued++;
  } else {
    const revision = sub.currentRevisionId ? await db.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } }) : null;
    const open = await db.intakeAsset.findMany({ where: { id: { in: verifyTargetIds(sub, revision) }, submissionId: sub.id, status: { in: ['uploaded', 'verifying'] } }, select: { id: true } });
    for (const a of open) if ((await requeueVerification(db, { adminId: actor.id, assetId: a.id }, now)).requeued) requeued++;
    if (revision && (await requeueJob(db, `register_revision:${revision.id}`, now))) {
      requeued++;
      await writeAudit(db, { actor: { kind: 'admin', id: actor.id }, action: 'revision.register_requeued', submissionId: sub.id, detail: { revision: revision.number } }, now);
    }
  }
  await touchRead(db, actor.id, input.submissionId);
  return { requeued };
}

/* ────────────────────────────── 원본 주소 ────────────────────────────── */

export type OriginalPurpose = 'preview' | 'download';

export type OriginalLink = {
  assetId: string;
  view: IntakeView;
  /** 내려받기 이름 — athlete_receipt-date_receipt-id_side-or-rear_original.ext */
  fileName: string;
  url: string;
  expiresInSec: number;
};

export type OriginalLinksInput = {
  submissionId: string;
  purpose: OriginalPurpose;
  /** 자산 하나 — 비우면 얼린 짝(없으면 지금 고른 짝) 둘 */
  assetId?: string;
};

/**
 * 원본의 짧은 서명 주소를 준다. 묶음을 만들지 않는다 — 짝이면 주소 둘이다. 주소를 낼 때마다 감사 기록을 남긴다(주소 자체는 안 남긴다).
 * 동의를 거둔 접수는 원본을 열지 않는다. 보유 기간이 끝나 지웠거나 지우는 중인 원본은 'original_purged' 로 막는다. 잠금 밖이라 표시 직전에 읽으면 5분 주소가 나갈 수 있지만 바이트는 그대로 지워진다.
 */
export async function issueOriginalLinks(db: Db, storage: IntakeStorage, actor: IntakeActor, input: OriginalLinksInput, now: Date = new Date()): Promise<OriginalLink[]> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  if (input.purpose !== 'preview' && input.purpose !== 'download') throw new IntakeError('invalid_input', { field: 'purpose' });
  const sub = await db.intakeSubmission.findUnique({ where: { id: input.submissionId } });
  if (!sub) throw new IntakeError('submission_not_found');
  if (sub.status === 'withdrawn') throw new IntakeError('original_locked');

  const revision = sub.currentRevisionId ? await db.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } }) : null;
  let wanted: string[];
  if (input.assetId) {
    if (!isIntakeId(input.assetId)) throw new IntakeError('asset_not_found');
    wanted = [input.assetId];
  } else {
    const side = revision?.sideAssetId ?? sub.sideAssetId;
    const rear = revision?.rearAssetId ?? sub.rearAssetId;
    if (!side || !rear) throw new IntakeError('assets_incomplete');
    wanted = [side, rear];
  }
  /* submissionId 로 묶어 찾는다 — 다른 접수의 번호는 없는 것으로 나온다 */
  const rows = await db.intakeAsset.findMany({ where: { id: { in: wanted }, submissionId: sub.id } });
  if (rows.length !== wanted.length) throw new IntakeError('asset_not_found');
  const assets = wanted.map((id) => rows.find((r) => r.id === id)!);
  if (assets.some((a) => assetGone(a.status))) throw new IntakeError('original_purged');
  if (!assets.every(hasBytes)) throw new IntakeError('original_unavailable');

  const links: OriginalLink[] = [];
  for (const a of assets) {
    const view = a.view as IntakeView;
    const facts = a.mediaFacts as IntakeMediaFacts | null;
    const fileName = downloadFileName({
      athleteName: revision?.athleteName ?? sub.athleteName ?? 'athlete',
      receivedAt: sub.receivedAt ?? a.createdAt,
      receiptCode: sub.receiptCode ?? 'draft',
      view,
      ext: originalExtension(facts?.container, a.originalName),
    });
    const url = await storage.readUrl(a.objectPath, { ttlSec: READ_URL_TTL_SEC, ...(input.purpose === 'download' ? { download: fileName } : {}) });
    links.push({ assetId: a.id, view, fileName, url, expiresInSec: READ_URL_TTL_SEC });
  }
  await db.$transaction(async (tx) => {
    for (const l of links) {
      await writeAudit(tx, { actor: { kind: 'admin', id: actor.id }, action: `original.${input.purpose}_issued`, submissionId: sub.id, detail: { assetId: l.assetId, view: l.view } }, now);
    }
  });
  return links;
}

/**
 * 실행이 만든 미리보기 영상의 주소 — 브라우저가 못 푸는 HEVC/MOV 를 볼 때 쓴다. 원본을 대신하지 않는다. 실행이 성공했는지는 안 본다(실패한 실행의 영상도 관리자에게는 쓸모가 있다).
 * 분석을 안 돌린 접수에는 없다 — 영상을 바꿔 구울 수 있는 곳이 분석 서버뿐이라, 분석 전 미리보기는 만들지 않았다(대조표 '원본 처리').
 * 경로는 실행 줄에서 서버가 읽는다. 화면이 경로를 보내지 않는다.
 */
export async function issueRunPreviewLink(
  db: Db,
  storage: IntakeStorage,
  actor: IntakeActor,
  input: { submissionId: string; runId: string; view: IntakeView },
  now: Date = new Date(),
): Promise<{ url: string; expiresInSec: number }> {
  assertIntakeAdmin(actor);
  mustSubmissionId(input.submissionId);
  if (!isIntakeView(input.view) || !isIntakeId(input.runId)) throw new IntakeError('invalid_input', { field: 'preview' });
  const sub = await db.intakeSubmission.findUnique({ where: { id: input.submissionId }, select: { status: true } });
  if (!sub) throw new IntakeError('submission_not_found');
  if (sub.status === 'withdrawn') throw new IntakeError('original_locked');
  const run = await db.intakeAnalysisRun.findFirst({ where: { id: input.runId, submissionId: input.submissionId }, select: { resultMeta: true, revision: { select: { sideAssetId: true, rearAssetId: true } } } });
  /* 미리보기는 원본과 같이 지운다. 파일이 없다고만 말하면 까닭을 모른다 */
  if (run && (await db.intakeAsset.count({ where: { id: { in: [run.revision.sideAssetId, run.revision.rearAssetId] }, status: { in: [...ASSET_GONE] } } })) > 0) throw new IntakeError('original_purged');
  const previews = (run?.resultMeta as { previews?: Partial<Record<IntakeView, unknown>> } | null | undefined)?.previews;
  const path = previews?.[input.view];
  if (typeof path !== 'string' || !isSubmissionPath(path, input.submissionId)) throw new IntakeError('original_unavailable');
  /* 실패한 실행도 굽다 만 영상이 있으면 보여 준다. 만들어지기 전에 끝난 실행에는 파일이 없다 */
  if (!(await storage.stat(path))) throw new IntakeError('original_unavailable');
  const url = await storage.readUrl(path, { ttlSec: READ_URL_TTL_SEC });
  await writeAudit(db, { actor: { kind: 'admin', id: actor.id }, action: 'preview.issued', submissionId: input.submissionId, detail: { runId: input.runId, view: input.view } }, now);
  return { url, expiresInSec: READ_URL_TTL_SEC };
}
