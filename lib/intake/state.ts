/**
 * 외부 영상 접수의 상태 — 파일(자산) · 접수 · 분석 · 공개를 따로 둔다. 옮겨 갈 수 있는 길은 이 파일 한 곳이고, 모두 순수 함수다.
 * 다시 찾아왔을 때 어느 화면을 보일지(resolveScreen)도 서버 상태만으로 여기서 정한다.
 */
import { IntakeError } from '@/lib/intake/errors';

export const INTAKE_VIEWS = ['side', 'rear'] as const;
export type IntakeView = (typeof INTAKE_VIEWS)[number];
export const isIntakeView = (v: unknown): v is IntakeView => v === 'side' || v === 'rear';

export const INVITATION_STATUSES = ['active', 'revoked'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const ASSET_STATUSES = [
  'reserved',
  'uploading',
  'uploaded',
  'verifying',
  'verified',
  /* 바이트는 맞지만 머리를 못 읽어 영상인지 확인하지 못했다 — 사람이 볼 때까지 분석 가능으로 안 간다(lib/intake/media.ts 머리글) */
  'unconfirmed',
  'rejected',
  'replaced',
  'abandoned',
  'purged',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const SUBMISSION_STATUSES = [
  'draft',
  'submitted',
  'verified',
  'needs_attention',
  'correction_requested',
  'withdrawn',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const ANALYSIS_STATUSES = ['none', 'ready', 'queued', 'running', 'succeeded', 'failed'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const PUBLICATION_STATUSES = ['unpublished', 'published'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const RUN_STATUSES = ['requested', 'running', 'succeeded', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const REVISION_STATUSES = ['pending', 'verified', 'failed'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

/* 도착한 뒤의 상태에서 'purged' 로 바로 가는 길은 보유 삭제뿐이다(lib/intake/purge.ts). 판에 얼린 원본은 'replaced' · 'abandoned' 를 거치지 않는다 */
const ASSET_FLOW: Record<AssetStatus, readonly AssetStatus[]> = {
  reserved: ['uploading', 'uploaded', 'replaced', 'abandoned'],
  uploading: ['uploaded', 'rejected', 'replaced', 'abandoned'],
  uploaded: ['verifying', 'verified', 'unconfirmed', 'rejected', 'replaced', 'abandoned', 'purged'],
  /* 검증은 도중에 끊겨도 다시 돈다 — 그래서 verifying 에서 verifying 으로 다시 들어가는 일은 이동이 아니다 */
  verifying: ['verified', 'unconfirmed', 'rejected', 'replaced', 'abandoned', 'purged'],
  /* 'abandoned' 는 끝내지 않은 접수의 자산만이다 — 얼린 자산은 cleanupStaleUploads 가 건드리지 않는다 */
  verified: ['replaced', 'abandoned', 'purged'],
  unconfirmed: ['replaced', 'abandoned', 'purged'],
  rejected: ['replaced', 'abandoned', 'purged'],
  replaced: ['purged'],
  abandoned: ['purged'],
  purged: [],
};

const SUBMISSION_FLOW: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['verified', 'needs_attention', 'correction_requested', 'withdrawn'],
  verified: ['needs_attention', 'correction_requested', 'withdrawn'],
  needs_attention: ['verified', 'correction_requested', 'withdrawn'],
  /* 제자리: 요청 내용 바꾸기 · 기간 늘리기. verified · needs_attention: 고침 취소로 앞 판의 상태로 돌아갈 때 */
  correction_requested: ['correction_requested', 'submitted', 'verified', 'needs_attention', 'withdrawn'],
  withdrawn: [],
};

const ANALYSIS_FLOW: Record<AnalysisStatus, readonly AnalysisStatus[]> = {
  none: ['ready'],
  ready: ['none', 'queued'],
  /* 'ready': 돌던 실행이 끝났는데 입력이 그사이 달라졌다 — 끝난 결과를 지금 입력의 것으로 적을 수 없어 다시 돌릴 수 있게 둔다 */
  queued: ['running', 'failed', 'succeeded', 'ready'],
  running: ['succeeded', 'failed', 'ready'],
  /* 재분석은 공개를 바꾸지 않는다 — 공개는 IntakePublication 이 특정 실행에 묶여 있다 */
  succeeded: ['none', 'ready', 'queued'],
  failed: ['none', 'ready', 'queued'],
};

const PUBLICATION_FLOW: Record<PublicationStatus, readonly PublicationStatus[]> = {
  unpublished: ['published'],
  published: ['unpublished'],
};

const can = <T extends string>(flow: Record<T, readonly T[]>, from: T, to: T) => flow[from]?.includes(to) ?? false;

export const canMoveAsset = (from: AssetStatus, to: AssetStatus) => can(ASSET_FLOW, from, to);
export const canMoveSubmission = (from: SubmissionStatus, to: SubmissionStatus) => can(SUBMISSION_FLOW, from, to);
export const canMoveAnalysis = (from: AnalysisStatus, to: AnalysisStatus) => can(ANALYSIS_FLOW, from, to);
export const canMovePublication = (from: PublicationStatus, to: PublicationStatus) => can(PUBLICATION_FLOW, from, to);

function assertMove(ok: boolean, what: string, from: string, to: string) {
  if (!ok) throw new IntakeError('invalid_state', { what, from, to });
}
export const assertAssetMove = (from: AssetStatus, to: AssetStatus) => assertMove(canMoveAsset(from, to), 'asset', from, to);
export const assertSubmissionMove = (from: SubmissionStatus, to: SubmissionStatus) =>
  assertMove(canMoveSubmission(from, to), 'submission', from, to);
export const assertAnalysisMove = (from: AnalysisStatus, to: AnalysisStatus) =>
  assertMove(canMoveAnalysis(from, to), 'analysis', from, to);
export const assertPublicationMove = (from: PublicationStatus, to: PublicationStatus) =>
  assertMove(canMovePublication(from, to), 'publication', from, to);

/** 바이트가 저장소에 다 도착한 뒤의 상태인가 */
export const assetArrived = (s: string) => s === 'uploaded' || s === 'verifying' || s === 'verified' || s === 'unconfirmed';
/** 검증이 끝난 상태인가 — 판을 정산해도 되는 때 */
export const assetVerifyDone = (s: string) => s === 'verified' || s === 'unconfirmed' || s === 'rejected';
/** 아직 전송 중이거나 전송을 기다리는가 */
export const assetInTransit = (s: string) => s === 'reserved' || s === 'uploading';

/** 접수 뒤에 필수 동의가 지금 판이 아니면 다시 받을 수 있다 — 동의 글의 판이 바뀐 경우다. 철회한 접수는 'withdrawn' 이라 여기 안 든다 */
export const reconsentOpen = (submissionStatus: string, requiredOk: boolean) =>
  !requiredOk && (submissionStatus === 'submitted' || submissionStatus === 'verified' || submissionStatus === 'needs_attention');

/**
 * 끝나지 않으면 신경 쓸 파일 — 지금 판의 두 파일과 칸의 파일(고침 중 새로 고른 것)이다.
 * 옛 판에만 있는 파일은 뺀다. 판은 앞으로만 가서 그 파일의 검증을 기다리는 일이 없고, 멈춰도 풀 까닭이 없다.
 */
type PairSlots = { sideAssetId: string | null; rearAssetId: string | null };
export const verifyTargetIds = (sub: PairSlots, currentRevision: PairSlots | null): string[] =>
  [...new Set([currentRevision?.sideAssetId, currentRevision?.rearAssetId, sub.sideAssetId, sub.rearAssetId])].filter((id): id is string => id != null);

/** 고침 요청에서 고를 수 있는 글 칸 */
export const CORRECTABLE_FIELDS = ['athleteName', 'throwingHand', 'submitterName', 'submitterRelation'] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

export type CorrectionRequest = {
  fields: CorrectableField[];
  views: IntakeView[];
  message: string | null;
  /** 고침을 열 때의 던지는 손 — 고침을 거두면 이 값으로 돌아간다(관리자가 정한 손은 얼린 판에 없다). 공개 화면에는 안 나간다 */
  handBefore?: string | null;
};

/** DB 의 Json 칸 → 고침 요청. 모양이 다르면 null */
export function readCorrection(raw: unknown): CorrectionRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const fields = Array.isArray(r.fields)
    ? r.fields.filter((f): f is CorrectableField => (CORRECTABLE_FIELDS as readonly unknown[]).includes(f))
    : [];
  const views = Array.isArray(r.views) ? r.views.filter(isIntakeView) : [];
  const out: CorrectionRequest = { fields, views, message: typeof r.message === 'string' && r.message ? r.message : null };
  if ('handBefore' in r) out.handBefore = r.handBefore === 'R' || r.handBefore === 'L' ? r.handBefore : null;
  return out;
}

/** 지금 이 글 칸을 고칠 수 있나 — 고침 요청 중이면 요청받은 칸만. 나이 확인 · 같은 투구 확인은 처음 접수에서만 고친다 */
export function canEditField(status: string, correction: CorrectionRequest | null, field: string): boolean {
  if (status === 'draft') return true;
  if (status !== 'correction_requested') return false;
  return (correction?.fields as readonly string[] | undefined)?.includes(field) ?? false;
}

/** 지금 이 칸의 영상을 바꿀 수 있나 — 고침 요청 중이면 요청받은 칸만 */
export function canEditView(status: string, correction: CorrectionRequest | null, view: IntakeView): boolean {
  if (status === 'draft') return true;
  if (status !== 'correction_requested') return false;
  return correction?.views.includes(view) ?? false;
}

/* ────────────────────────── 다시 찾아왔을 때의 화면 ────────────────────────── */

export const INTAKE_SCREENS = [
  'revoked',
  'withdrawn',
  'under_14',
  'upload_expired',
  'welcome',
  'side',
  'upload',
  'upload_recovery',
  'correction',
  'receipt',
  'analysis_running',
  'admin_review',
  'access_code',
  'published',
  'result_expired',
] as const;
export type IntakeScreen = (typeof INTAKE_SCREENS)[number];

export type ScreenInput = {
  invitationStatus: string;
  uploadExpired: boolean;
  resultExpired: boolean;
  /** 결과에 접근 코드가 걸려 있나 */
  accessCodeRequired: boolean;
  /** 이번 요청이 맞는 접근 코드를 냈나 */
  accessCodeOk: boolean;
  submissionStatus: string;
  analysisStatus: string;
  /** 공개 중인 판이 있나 */
  published: boolean;
  hasAthleteName: boolean;
  underFourteen: boolean;
  /** 필수 동의가 다 있나 */
  consented: boolean;
  /** 지금 고른 자산의 상태 — 없으면 null */
  side: string | null;
  rear: string | null;
};

/**
 * 서버 상태 → 보일 화면. 파일은 새로고침을 넘어 살아남지 않으므로, 전송이 시작되기 전의 고른 영상은 서버가 모른다 — 이름까지 적었으면 옆 영상 고르기로 돌아간다.
 * 이름 · 뒤 영상 · 검토 단계는 없다: 그 사이의 이동은 화면 안 상태라 서버가 모른다. 서버가 말하는 것은 '어디서 다시 시작하나'까지다.
 * 폐기된 초대는 이 함수까지 오지 않는다 — openIntakeScope · loadPublicState 가 'invitation_revoked' 를 던지면 라우트가 그 화면을 고른다.
 *
 * 고침과 공개는 겹칠 수 있다: 공개 중에 고침을 요청해도 공개는 안 내려간다.
 * - 고칠 수 있는 동안은 'correction' 이고, 공개 결과로 가는 길은 PublicIntakeState.resultAvailable 로 같이 준다(화면이 둘 다 보인다).
 * - 올리기 기간이 끝나면 고칠 수 없으니 공개 · 영수증 쪽으로 내려간다. 올리기 기간은 결과 보기를 막지 못한다.
 * 초안은 기간이 끝나도 두 파일이 다 도착했으면 완료만 남은 'upload' 다 — 기간 안에 시작한 전송이 막다른 길이 되지 않게(finalizeSubmission 도 같다).
 */
export function resolveScreen(s: ScreenInput): IntakeScreen {
  if (s.invitationStatus !== 'active') return 'revoked';
  if (s.submissionStatus === 'withdrawn') return 'withdrawn';

  if (s.submissionStatus === 'correction_requested' && !s.uploadExpired) return 'correction';

  if (s.published) {
    if (s.resultExpired) return 'result_expired';
    if (s.accessCodeRequired && !s.accessCodeOk) return 'access_code';
    return 'published';
  }

  if (s.submissionStatus === 'draft') {
    if (s.underFourteen) return 'under_14';
    /* 이름이 없으면 끝낼 수 없다 — 나이를 고치며 이름이 지워진 경우 파일이 다 왔어도 이름부터 다시 받는다. 기간이 끝났으면 저장할 수 없으니 그 화면으로 */
    if (!s.hasAthleteName) return s.uploadExpired ? 'upload_expired' : 'welcome';
    const started = s.side != null || s.rear != null;
    const bothArrived = s.side != null && s.rear != null && assetArrived(s.side) && assetArrived(s.rear);
    if (s.uploadExpired) return started && s.consented && bothArrived ? 'upload' : 'upload_expired';
    if (started && s.consented) return bothArrived ? 'upload' : 'upload_recovery';
    return 'side';
  }

  if (s.resultExpired) return 'result_expired';
  if (s.analysisStatus === 'queued' || s.analysisStatus === 'running') return 'analysis_running';
  if (s.analysisStatus === 'succeeded') return 'admin_review';
  return 'receipt';
}

export type StatusTextOptions = {
  /** 올리기 기간이 끝났나 — 고침 요청이 열려 있어도 이제 고칠 수 없다 */
  uploadExpired?: boolean;
  /** 필수 동의를 다시 받아야 하나 */
  needsReconsent?: boolean;
};

/** 공개 화면의 지금 상태 한 줄 — 알림을 약속하지 않고 사실만 말한다 */
export function publicStatusText(submissionStatus: string, analysisStatus: string, published: boolean, opts: StatusTextOptions = {}): string {
  if (submissionStatus === 'correction_requested') {
    return opts.uploadExpired ? '고칠 수 있는 기간이 끝났어요. 링크를 보내 준 분에게 문의해 주세요' : '고쳐 주셔야 할 내용이 있어요';
  }
  if (published) return '결과가 공개됐어요';
  if (submissionStatus === 'withdrawn') return '접수가 철회됐어요';
  if (opts.needsReconsent) return '동의 내용이 바뀌었어요. 다시 확인해 주시면 이어서 진행해요';
  if (submissionStatus === 'needs_attention') return '영상을 확인하고 있어요. 담당자가 살펴볼 예정이에요';
  if (submissionStatus === 'submitted') return '파일이 잘 도착했는지 확인하고 있어요';
  if (analysisStatus === 'queued' || analysisStatus === 'running') return '분석하고 있어요';
  if (analysisStatus === 'succeeded') return '담당자가 결과를 검토하고 있어요';
  /* 재시도는 사람이 누른다 — 저절로 다시 준비한다고 말하지 않는다 */
  if (analysisStatus === 'failed') return '담당자가 영상을 다시 확인하고 있어요';
  if (submissionStatus === 'verified') return '파일을 확인했어요. 분석을 기다리고 있어요';
  return '아직 보내지 않았어요';
}

/**
 * 고친 내용을 다시 낸 뒤의 상태 한 줄 — 없으면 null. 공개 화면이 옛 결과만 보이면 고침이 접수됐는지 알 길이 없어서 따로 준다.
 * 공개가 이미 지금 입력(두 원본 + 손)의 실행이면 말할 것이 없다 — 이름만 고친 판은 앞 판의 공개에 그대로 반영된다.
 */
export function correctionReceiptLine(input: { submissionStatus: string; revision: number | null; publishedCurrent: boolean }): string | null {
  if (input.revision == null || input.revision < 2 || input.publishedCurrent) return null;
  if (input.submissionStatus === 'submitted') return '고친 내용이 접수됐어요. 파일을 확인하고 있어요';
  if (input.submissionStatus === 'verified' || input.submissionStatus === 'needs_attention') return '고친 내용이 접수됐어요. 담당자가 확인하고 있어요';
  return null;
}
