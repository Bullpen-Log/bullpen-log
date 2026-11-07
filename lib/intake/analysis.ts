/**
 * 외부 접수 → 3D 분석 어댑터. 기존 실험실(lib/pitch-lab.ts)의 폴더 · 소유권을 넓히지 않고, 관리자 흉내도 내지 않는다.
 * 얼린 원본의 서명 읽기 주소와 external-intake 버킷의 결과 자리를 startGpuJob 에 넘길 뿐이다. 분석 서버의 약속(lib/pitch-3d/v2/contract.ts)은 그대로 쓴다.
 *
 * ── 약속(다른 작업이 이 위에 짓는다. 인자 모양을 바꾸지 말고 선택 칸만 더한다) ──────────────────────────────
 * - 권한은 보지 않는다. 라우트 · 서버 동작이 먼저 can(role, 'intake') 를 본다.
 * - GPU 는 startIntakeAnalysis 를 관리자가 불렀을 때만 돈다. 일감 · 크론은 GPU 를 걸지 않는다.
 * - 같은 입력(옆 원본 + 뒤 원본 + 엔진 + 던지는 손)은 dedupeKey 유일 제약으로 한 번만 돈다. 실패하면 키를 비워 다시 돌릴 수 있다. 원본 · 실패 까닭은 그대로 남는다.
 *   판 번호는 키에 없다 — 글 칸만 고쳐 새 판이 생겨도 바이트가 같으면 같은 입력이고, 성공한 실행을 그대로 잇는다(carryAnalysisForward).
 * - submission.analysisStatus 는 그 실행의 입력이 지금 입력(두 원본 + 손)과 같을 때만 옮긴다(고침 뒤 옛 입력의 소식이 새 판을 덮지 않게).
 *   손을 고친 판은 다른 입력이다 — 옛 손의 실행을 '지금 것'으로 잇거나 공개하면 왼손 투수에게 오른손 분석이 나간다.
 * - 끝난 실행은 다시 안 바뀐다. 상태 쓰기는 'status in (requested, running)' 조건부 갱신이라 일꾼 둘이 겹쳐도 한 번만 적힌다.
 * - 엔진 판을 모르면 새 실행을 만들지 않는다. 응답 시간 초과 때문에 다른 키로 같은 입력이 또 돌면 안 돼서다.
 * - GPU 걸기의 답을 못 받으면 '안 돌았다'로 치지 않는다. 키를 쥔 채 결과 파일을 기다리고(START_UNKNOWN_WINDOW_MS), 그동안 다시 걸 수 없다.
 * - 철회된 접수 · 폐기된 초대에는 새 실행을 만들지 않는다. 철회 때 이미 돌던 실행은 분석 서버에서 멈출 수 없어서, 다음 상태 묻기에서 결과를 읽지 않고
 *   실패로 닫는다. 그 실행은 공개 · 공개 보기에 쓰이지 않는다. 뒤늦게 올라온 결과 파일은 지우지 않고 아무도 안 읽는다(분석 결과의 보유 기간은 아직 안 정했다).
 * - 원본 보유 기간이 끝나면(지울 날이 지났거나 판의 원본을 지웠거나 지우는 중이면) 새 실행을 만들지 않는다('original_purged'). 끝난 실행의 결과 JSON 은 남아서 공개 결과는 그대로 열린다.
 *
 * 마지막 인자 rt 는 시험용이다. 앱은 안 넘긴다(그때 prisma · 저장소 · GPU 를 불러 쓴다). 이 파일은 그래서 server-only 를 머리에 달지 않는다.
 */
import { createHash } from 'node:crypto';
import type { IntakeAnalysisRun, IntakeRevision, IntakeSubmission, Prisma, PrismaClient } from '@prisma/client';
import { writeAudit } from '@/lib/intake/audit';
import { analysisRunGate, consentDecisionRows, hasRequiredConsents } from '@/lib/intake/consent';
import { IntakeError, INTAKE_ERROR_TEXT, type IntakeErrorCode } from '@/lib/intake/errors';
import { enqueueJob } from '@/lib/intake/jobs';
import type { IntakeMediaFacts } from '@/lib/intake/media';
import { isIntakeId, runObjectPrefix } from '@/lib/intake/paths';
import { originalRetention, retentionDue } from '@/lib/intake/retention';
import { ASSET_GONE, canMoveAnalysis, readCorrection, type AnalysisStatus, type IntakeView } from '@/lib/intake/state';
import type { IntakeRunStorage } from '@/lib/intake/storage-core';
import { busyTimeout, labVideoBlock, looksScreenAspect, looksScreenRecording } from '@/lib/pitch-lab-guard';
import type { GpuJobRequest } from '@/lib/pitch-3d/v2/gpu-client';
import {
  PITCH3D_V2_VERSION,
  V2_FAIL_TEXT,
  V2_VIDEO_FAULT,
  applyGpuStatus,
  engineKeyOf,
  readPitch3dV2Result,
  type GpuStatus,
  type Pitch3dV2Job,
  type Pitch3dV2Ok,
  type Pitch3dV2Result,
  type V2FailCode,
  type V2Stage,
} from '@/lib/pitch-3d/v2/contract';
import { buildReport, reportSummary, type ReportSummary } from '@/lib/pitch-3d/v2/report';

/** 분석 서버가 영상을 받는 동안 쓰는 읽기 주소 수명 — 실험실과 같은 한 시간. 관리자 내려받기(5분)보다 길다. 폐기해도 이 시간까지는 산다 */
const GPU_READ_URL_TTL_SEC = 3600;
/** 상태를 다시 묻는 간격 — 실제로는 크론이 5분마다 돈다 */
export const POLL_INTERVAL_MS = 30_000;
/**
 * GPU 번호를 못 받은 실행의 결과를 기다리는 시간 — 대기열 15분 + GPU 제한 15분. 걸기 응답이 끊겨도 서버에서는 돌고 있을 수 있어서,
 * 이 안에는 다시 걸지 못하게 키를 쥐고 결과 파일을 찾는다. 지나면 실패로 닫는다.
 */
export const START_UNKNOWN_WINDOW_MS = 30 * 60_000;
/** 결과 파일을 읽는 상한 — 약속의 900KB 는 실험실 저장 한도이고, GPU 가 올린 파일은 AI 값이 붙으면 더 크다 */
const MAX_RESULT_READ_BYTES = 8 * 1024 * 1024;

export type IntakeGpu = {
  configured(): boolean;
  start(req: GpuJobRequest): Promise<{ callId: string } | { error: 'gpu' | 'gpu-auth' }>;
  status(callId: string): Promise<GpuStatus>;
  engineBuild(): Promise<string | null>;
};

export type IntakeRuntime = {
  db: PrismaClient;
  storage: IntakeRunStorage;
  gpu: IntakeGpu;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

/** 앱이 쓰는 것을 부른다 — 시험은 rt 를 넘겨 여기까지 오지 않는다 */
export async function appIntakeRuntime(): Promise<IntakeRuntime> {
  const [{ prisma }, { getIntakeStorage }, gpu] = await Promise.all([
    import('@/lib/prisma'),
    import('@/lib/intake/storage'),
    import('@/lib/pitch-3d/v2/gpu-client'),
  ]);
  return {
    db: prisma,
    storage: getIntakeStorage(),
    gpu: { configured: gpu.isPitch3dV2Configured, start: gpu.startGpuJob, status: gpu.getGpuStatus, engineBuild: gpu.getEngineBuild },
  };
}

/** errors.ts 에 아직 없는 분석 · 공개 코드. 그 파일에 더해지면 이 표와 아래 클래스를 지우고 IntakeError 를 바로 쓴다 */
export const ANALYSIS_ERROR_TEXT = {
  stale_publication: '다른 관리자가 공개를 바꿨어요. 최신 내용을 확인한 뒤 다시 시도해 주세요.',
  run_not_current: '지금 판의 영상으로 돌린 실행이 아니에요. 옛 판을 공개하려면 옛 판 공개를 따로 확인해 주세요.',
  analysis_engine_unknown: '분석 서버의 엔진 판을 확인하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
} as const;
export type AnalysisErrorCode = keyof typeof ANALYSIS_ERROR_TEXT;

/** IntakeError 로 잡히고(화면 · 서버 동작이 그대로 쓴다) 코드 · 글만 다르다 */
export class IntakeAnalysisError extends IntakeError {
  constructor(code: AnalysisErrorCode, detail?: Record<string, unknown>) {
    super('invalid_state', detail);
    (this as { code: string }).code = code;
    this.message = ANALYSIS_ERROR_TEXT[code];
  }

  override get httpStatus(): number {
    return 409;
  }
}

const clock = (rt: IntakeRuntime) => rt.now?.() ?? new Date();
/** 실행의 입력 — 얼린 판이 아니라 두 원본과 손이다. 판은 글 칸만 달라도 새로 생긴다 */
type RunInput = { side: string; rear: string; hand: Hand };
const dedupeKeyOf = (input: RunInput, engineKey: string) => `${input.side}:${input.rear}:${engineKey}:${input.hand}`;
type RevisionInput = Pick<IntakeRevision, 'sideAssetId' | 'rearAssetId' | 'throwingHand'>;
export const pollJobKey = (runId: string) => `poll_analysis:${runId}`;
export const runResultPath = (submissionId: string, runId: string) => `${runObjectPrefix(submissionId, runId)}/analysis.json`;
export const runPreviewPath = (submissionId: string, runId: string, view: 'side' | 'rear') => `${runObjectPrefix(submissionId, runId)}/preview-${view}.mp4`;

const lockSubmission = (tx: Prisma.TransactionClient, id: string) => tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${id} FOR UPDATE`;

/* ────────────────────────────── 돌려도 되나 ────────────────────────────── */

type Hand = 'R' | 'L';
const handOf = (sub: Pick<IntakeSubmission, 'throwingHand'>, rev: Pick<IntakeRevision, 'throwingHand'> | null): Hand | null => {
  /* 고침 뒤 다시 낸 판은 접수 값을 그대로 얼린다. 그 뒤 관리자가 정한 값은 접수에만 있어 접수가 먼저다 */
  const h = sub.throwingHand ?? rev?.throwingHand ?? null;
  return h === 'R' || h === 'L' ? h : null;
};

/** 지금 판의 입력 — 손을 모르면 null(아직 돌릴 수 없는 판이다) */
function currentInputOf(sub: Pick<IntakeSubmission, 'throwingHand'>, rev: RevisionInput | null): RunInput | null {
  const hand = rev ? handOf(sub, rev) : null;
  return rev && hand ? { side: rev.sideAssetId, rear: rev.rearAssetId, hand } : null;
}

/** 실행이 쓴 입력 — 실행 줄에 적은 값이 있으면 그것이다. 판의 손은 관리자가 정한 값을 모를 수 있어서 적은 값이 먼저다 */
const runInputOf = (run: Pick<IntakeAnalysisRun, 'resultMeta'>, revision: RevisionInput): RunInput =>
  metaOf(run).input ?? { side: revision.sideAssetId, rear: revision.rearAssetId, hand: revision.throwingHand as Hand };

const sameRunInput = (a: RunInput, b: RunInput | null) => b != null && a.side === b.side && a.rear === b.rear && a.hand === b.hand;

/** 이 실행이 지금 입력(두 원본 + 손)으로 돌았나 — 화면 · 공개 · 상태 옮기기가 같은 말을 하게 여기 하나다 */
export const runMatchesCurrent = (
  run: Pick<IntakeAnalysisRun, 'resultMeta'>,
  runRevision: RevisionInput,
  sub: Pick<IntakeSubmission, 'throwingHand'>,
  currentRevision: RevisionInput | null,
) => sameRunInput(runInputOf(run, runRevision), currentInputOf(sub, currentRevision));

type GateInput = {
  sub: IntakeSubmission;
  rev: IntakeRevision | null;
  consents: Parameters<typeof hasRequiredConsents>[0];
  invitationStatus: string;
  /** 지금 판의 원본을 더 쓸 수 없나 — 지울 날이 지났거나 이미 지웠거나 지우는 중이다 */
  originalsOver: boolean;
};

/** 지금 판의 원본을 더 쓸 수 없나. 지울 날이 지난 접수는 지우기 전이어도 새 실행을 안 받는다 — 삭제가 돌고 있는 파일을 분석 서버로 보내지 않게. 지우기 시작한 파일은 철회로 날짜가 밀려도 그대로 막는다 */
async function originalsOverOf(db: Pick<PrismaClient, 'intakePublication' | 'intakeAsset'>, sub: IntakeSubmission, rev: IntakeRevision | null, now: Date): Promise<boolean> {
  if (!rev) return false;
  const publications = await db.intakePublication.findMany({ where: { submissionId: sub.id }, select: { publishedAt: true } });
  if (retentionDue(originalRetention({ publishedAts: publications.map((p) => p.publishedAt), lastFrozenAt: sub.lastFinalizedAt, withdrawnAt: sub.withdrawnAt }), now)) return true;
  return (await db.intakeAsset.count({ where: { id: { in: [rev.sideAssetId, rev.rearAssetId] }, status: { in: [...ASSET_GONE] } } })) > 0;
}

/** 접수 쪽 막힘 — 비어 있으면 돌릴 수 있다. 문서 · 서버 설정은 analysisReadiness 가 더한다 */
function submissionBlockers({ sub, rev, consents, invitationStatus, originalsOver }: GateInput): IntakeErrorCode[] {
  /* 철회는 고칠 길이 없다 — 다른 까닭을 앞세우지 않는다 */
  if (sub.status === 'withdrawn') return ['analysis_consent_missing'];
  const out: IntakeErrorCode[] = [];
  /* 이것이 먼저다 — 다른 까닭을 풀어도 돌릴 수 없고, 고침으로 새 영상을 받아야 풀린다 */
  if (originalsOver) out.push('original_purged');
  /* 폐기는 '이 접수를 멈춘다'는 관리자의 결정이다. 원본을 국외 분석 서버로 새로 보내지 않는다 */
  if (invitationStatus !== 'active') out.push('invitation_revoked');
  if (sub.status !== 'verified' || sub.analysisStatus === 'none' || !rev || rev.id !== sub.currentRevisionId || rev.status !== 'verified') {
    out.push('analysis_not_ready');
  }
  if (!hasRequiredConsents(consents, sub.submitterRelation)) out.push('analysis_consent_missing');
  if (!handOf(sub, rev)) out.push('analysis_hand_required');
  return out;
}

const gateCode = (reason: 'consent_doc_draft' | 'needs_confirm'): IntakeErrorCode =>
  reason === 'consent_doc_draft' ? 'analysis_doc_draft' : 'analysis_confirm_required';

/** 관리자 화면의 글 — 공개 화면용 글이 받는 사람에게 말하는 곳만 바꾼다 */
const ADMIN_BLOCKER_TEXT: Partial<Record<IntakeErrorCode, string>> = {
  invitation_revoked: '초대가 폐기돼 새 분석을 시작할 수 없어요.',
};
/** 폐기된 초대는 고침을 받지 못한다(requestCorrection 이 막는다) — 할 수 없는 고침을 권하지 않는다 */
const PURGED_REVOKED_TEXT = '보유 기간이 끝난 원본이라 쓸 수 없어요. 초대가 폐기돼 영상을 다시 받을 수도 없어요.';
const blockerText = (code: IntakeErrorCode, invitationStatus: string) =>
  code === 'original_purged' && invitationStatus !== 'active' ? PURGED_REVOKED_TEXT : (ADMIN_BLOCKER_TEXT[code] ?? INTAKE_ERROR_TEXT[code]);

/** 영상 파일 사실로 본 주의 — 막지는 않는다. 관리자가 GPU 를 누르기 전에 본다 */
export type AnalysisInputNote = {
  view: IntakeView;
  code: 'facts_missing' | 'screen_like' | 'low_fps' | 'timing_variable' | 'timing_unknown' | 'retimed' | 'lab_guard' | 'zoom_unknown' | 'fps_unproven';
  text: string;
  /** 영상 시간을 실제 시간으로 믿을 수 없어 시간 지표를 뺀다 */
  dropsTiming: boolean;
};

type InputAsset = { view: string; originalName: string; mediaFacts: unknown };

const VIEW_NAME: Record<IntakeView, string> = { side: '옆 영상', rear: '뒤 영상' };

/**
 * 저장된 파일 사실을 실험실 검사(labVideoBlock)에 대어 본다. 이 흐름은 영상 트랙만 있으면 받으므로, '원본 접수니까 원본이다'라고 보지 않는다.
 * 줌 · 광각은 35mm 환산 초점거리로 본다. 파일에 없으면 볼 수 없다고 알린다.
 * 파일 사실로 못 가르는 것: 초당 60장 안팎의 영상이 그대로 찍은 것인지 슬로 모션을 내보낸 것인지다. 시간 지표를 빼지는 않고 그 한계를 알린다.
 */
export function analysisInputNotes(assets: readonly InputAsset[]): AnalysisInputNote[] {
  const notes: AnalysisInputNote[] = [];
  for (const a of assets) {
    const view = a.view as IntakeView;
    const add = (code: AnalysisInputNote['code'], text: string, dropsTiming: boolean) => notes.push({ view, code, text: `${VIEW_NAME[view]}: ${text}`, dropsTiming });
    const f = a.mediaFacts as IntakeMediaFacts | null;
    if (!f) {
      add('facts_missing', '파일 정보를 읽지 못했어요. 영상 시간을 실제 시간으로 볼 수 없어요.', true);
      continue;
    }
    const long = f.width != null && f.height != null ? Math.max(f.width, f.height) : null;
    const short = f.width != null && f.height != null ? Math.min(f.width, f.height) : null;
    const aspect = long != null && short ? long / short : null;
    const fps = f.averageFps;
    const screenLike = looksScreenRecording(a.originalName) || (!f.hasLensInfo && (fps == null || fps < 100) && aspect != null && looksScreenAspect(aspect));
    const lowFps = fps != null && Math.round(fps) <= 30;
    if (screenLike) add('screen_like', '화면 녹화로 보여요. 영상 시간이 실제 시간과 다를 수 있어요.', true);
    else if (lowFps) add('low_fps', `초당 ${Math.round(fps)}장이에요. 슬로 모션을 내보낸 파일이면 영상 시간이 실제 시간과 달라요.`, true);
    if (f.frameTiming === 'variable') add('timing_variable', '장면 간격이 일정하지 않아요. 시간 지표를 빼고 돌려요.', true);
    else if (f.frameTiming !== 'constant') add('timing_unknown', '장면 간격을 읽지 못했어요. 시간 지표를 빼고 돌려요.', true);
    if (f.editList?.retimed) add('retimed', '재생 속도를 바꾼 구간이 있어요. 시간 지표를 빼고 돌려요.', true);
    if (!screenLike && !lowFps) {
      const block = labVideoBlock({ name: a.originalName, fps, shortSide: short, durationSec: f.sampleDurationSec, focal35: f.focal35mm ?? null, aspect, hasLens: f.hasLensInfo });
      if (block) add('lab_guard', block, false);
      if (fps != null && fps < 100) add('fps_unproven', `초당 ${Math.round(fps)}장이에요. 슬로 모션을 내보낸 파일인지 파일 정보로는 가를 수 없어요. 그런 파일이면 시간 지표가 실제보다 길어져요.`, false);
    }
    if (f.focal35mm == null) add('zoom_unknown', '줌 배율을 읽지 못했어요. 1배로 찍었다고 보고 돌려요.', false);
  }
  return notes;
}

/** 줌 · 광각으로 찍었다고 적힌 영상인가 — 실험실 검사와 같은 범위다. 못 읽은 값으로는 그렇다고 하지 않는다 */
const zoomedFacts = (f: IntakeMediaFacts | null) => f?.focal35mm != null && (f.focal35mm < 20 || f.focal35mm > 32);

export type AnalysisReadiness = {
  runnable: boolean;
  /** 지금 막는 까닭 — analysis_confirm_required 만 있으면 확인을 받아 돌릴 수 있다 */
  blockers: { code: IntakeErrorCode; text: string }[];
  needsDraftConfirm: boolean;
  hand: Hand | null;
  /** 막지는 않지만 GPU 를 누르기 전에 볼 것 */
  inputNotes: AnalysisInputNote[];
};

/** 화면이 단추를 그릴 때 — 읽기만 한다 */
export async function analysisReadiness(submissionId: string, rt?: IntakeRuntime): Promise<AnalysisReadiness> {
  const r = rt ?? (await appIntakeRuntime());
  const sub = await r.db.intakeSubmission.findUnique({ where: { id: submissionId }, include: { invitation: { select: { status: true } } } });
  if (!sub) throw new IntakeError('submission_not_found');
  const rev = sub.currentRevisionId ? await r.db.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } }) : null;
  const codes = submissionBlockers({ sub, rev, consents: await consentDecisionRows(r.db, sub.id), invitationStatus: sub.invitation.status, originalsOver: await originalsOverOf(r.db, sub, rev, clock(r)) });
  if (!r.gpu.configured()) codes.push('analysis_not_configured');
  const gate = analysisRunGate(false, r.env);
  if (!gate.ok) codes.push(gateCode(gate.reason));
  return {
    runnable: codes.length === 0,
    blockers: codes.map((code) => ({ code, text: blockerText(code, sub.invitation.status) })),
    needsDraftConfirm: codes.includes('analysis_confirm_required'),
    hand: handOf(sub, rev),
    inputNotes: rev ? analysisInputNotes(await r.db.intakeAsset.findMany({ where: { id: { in: [rev.sideAssetId, rev.rearAssetId] } }, orderBy: { view: 'desc' } })) : [],
  };
}

/** 관리자가 던지는 손을 정한다 — 접수 칸만 바꾸고 얼린 판은 그대로다. 받는 사람의 초안 판 번호는 안 건드린다 */
export async function setAnalysisHand(
  input: { submissionId: string; adminId: string; hand: Hand },
  rt?: IntakeRuntime,
): Promise<void> {
  if (input.hand !== 'R' && input.hand !== 'L') throw new IntakeError('invalid_input', { field: 'hand' });
  const r = rt ?? (await appIntakeRuntime());
  const now = clock(r);
  await r.db.$transaction(async (tx) => {
    await lockSubmission(tx, input.submissionId);
    const sub = await tx.intakeSubmission.findUnique({ where: { id: input.submissionId } });
    if (!sub) throw new IntakeError('submission_not_found');
    if (sub.throwingHand === input.hand) return;
    /* 고침 중이면 거둘 때 돌아갈 값도 같이 바꾼다 */
    const open = sub.status === 'correction_requested' ? readCorrection(sub.correction) : null;
    await tx.intakeSubmission.update({ where: { id: sub.id }, data: { throwingHand: input.hand, ...(open ? { correction: { ...open, handBefore: input.hand } } : {}) } });
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'analysis.hand_set', submissionId: sub.id, detail: { hand: input.hand } }, now);
  });
}

/* ────────────────────────────── 보기 ────────────────────────────── */

type RunMeta = {
  stages?: Partial<Record<V2Stage, number>>;
  /** 결과 파일의 SHA-256 — 공개 뒤 파일이 바뀌지 않았는지 본다 */
  sha256?: string;
  bytes?: number;
  frames?: number;
  report?: ReportSummary | null;
  failStage?: V2Stage;
  previews?: { side: string; rear: string };
  draftConsent?: boolean;
  /** 이 실행의 입력 — 판이 바뀌어도 같은 입력인지 본다 */
  input?: RunInput;
  /** GPU 걸기의 답을 못 받았다 — 서버에서 돌고 있을 수 있다 */
  startUnknown?: boolean;
  /** 영상 시간을 믿지 못해 시간 지표를 뺀 실행 */
  timingDropped?: boolean;
};

const metaOf = (run: Pick<IntakeAnalysisRun, 'resultMeta'>): RunMeta => (run.resultMeta && typeof run.resultMeta === 'object' ? (run.resultMeta as RunMeta) : {});

export type IntakeRunView = {
  id: string;
  revisionId: string;
  revisionNumber: number;
  /** 지금 입력(두 원본 + 손)의 실행인가 — 영상이나 손을 바꾼 고침 뒤에는 false, 그 밖의 글 칸만 고친 판은 앞 판의 실행을 그대로 잇는다 */
  isCurrentRevision: boolean;
  engineKey: string;
  status: string;
  requestedByAdminId: string | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  stages: Partial<Record<V2Stage, number>>;
  failure: { code: string; text: string; detail: string | null; stage: V2Stage | null; videoFault: boolean } | null;
  hasResult: boolean;
  frames: number | null;
  report: ReportSummary | null;
  /** 저장소 경로 — 관리자 화면이 서명 주소를 받을 때 쓴다. 공개 화면으로 보내지 않는다. 실패한 실행도 만들어 둔 것은 볼 수 있다 */
  previewPaths: { side: string; rear: string } | null;
  /** 걸기 답을 못 받아 결과를 기다리는 중이다 — 끝날 때까지 다시 걸 수 없다 */
  startUnknown: boolean;
  /** 영상 시간을 믿지 못해 시간 지표를 뺀 실행 */
  timingDropped: boolean;
  /** 지금 공개 중인가 */
  published: boolean;
};

/** 분석 서버의 코드가 아닌, 우리가 닫은 실행의 까닭 */
const CLOSED_RUN_TEXT: Record<string, string> = {
  withdrawn: '필수 동의가 철회돼 결과를 받지 않고 닫았어요.',
  revoked: '초대가 폐기돼 분석 서버에 보내지 않고 닫았어요.',
};
const closedRunCode = (code: string): code is ClosedRunCode => code in CLOSED_RUN_TEXT;

function runView(run: IntakeAnalysisRun, revision: { number: number } & RevisionInput, current: RunInput | null, activeRunId: string | null): IntakeRunView {
  const meta = metaOf(run);
  const code = run.failureCode;
  return {
    id: run.id,
    revisionId: run.revisionId,
    revisionNumber: revision.number,
    isCurrentRevision: sameRunInput(runInputOf(run, revision), current),
    engineKey: run.engineKey,
    status: run.status,
    requestedByAdminId: run.requestedByAdminId,
    requestedAt: run.requestedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    stages: meta.stages ?? {},
    failure: code
      ? {
          code,
          text: closedRunCode(code) ? CLOSED_RUN_TEXT[code] : (V2_FAIL_TEXT[code as V2FailCode] ?? V2_FAIL_TEXT.internal),
          detail: run.failureDetail,
          stage: meta.failStage ?? null,
          videoFault: V2_VIDEO_FAULT.has(code as V2FailCode),
        }
      : null,
    hasResult: run.resultPath != null,
    frames: meta.frames ?? null,
    report: meta.report ?? null,
    previewPaths: meta.previews ?? null,
    startUnknown: meta.startUnknown === true && run.gpuCallId == null && (run.status === 'requested' || run.status === 'running'),
    timingDropped: meta.timingDropped === true,
    published: run.id === activeRunId,
  };
}

/** 이 접수의 실행 — 최근 것부터. 실패한 실행도 그대로 보인다 */
export async function listRuns(submissionId: string, rt?: IntakeRuntime): Promise<IntakeRunView[]> {
  if (!isIntakeId(submissionId)) throw new IntakeError('submission_not_found');
  const r = rt ?? (await appIntakeRuntime());
  const sub = await r.db.intakeSubmission.findUnique({
    where: { id: submissionId },
    select: {
      currentRevisionId: true,
      throwingHand: true,
      runs: { orderBy: { requestedAt: 'desc' }, include: { revision: { select: { number: true, sideAssetId: true, rearAssetId: true, throwingHand: true } } } },
      publications: { where: { activeFor: { not: null } }, select: { runId: true } },
    },
  });
  if (!sub) throw new IntakeError('submission_not_found');
  const active = sub.publications[0]?.runId ?? null;
  const rev = sub.currentRevisionId ? await r.db.intakeRevision.findUnique({ where: { id: sub.currentRevisionId }, select: { sideAssetId: true, rearAssetId: true, throwingHand: true } }) : null;
  const current = currentInputOf(sub, rev);
  /* 원본과 함께 지운 미리보기는 없는 것으로 보인다 — 결과 JSON 은 남아 있다 */
  const inputs = sub.runs.flatMap((run) => [run.revision.sideAssetId, run.revision.rearAssetId]);
  const gone = new Set((await r.db.intakeAsset.findMany({ where: { id: { in: inputs }, status: { in: [...ASSET_GONE] } }, select: { id: true } })).map((a) => a.id));
  return sub.runs.map((run) => {
    const view = runView(run, run.revision, current, active);
    return gone.has(run.revision.sideAssetId) || gone.has(run.revision.rearAssetId) ? { ...view, previewPaths: null } : view;
  });
}

/* ────────────────────────────── 결과 읽기 ────────────────────────────── */

export type StoredRunResult = { raw: unknown; sha256: string; bytes: number };

/** 저장소의 결과 파일을 읽는다 — 없으면 null. 모양 검사는 부르는 쪽이 readPitch3dV2Result 로 한다 */
export async function readStoredResult(storage: IntakeRunStorage, path: string): Promise<StoredRunResult | null> {
  const reader = await storage.reader(path);
  if (!reader) return null;
  if (reader.size > MAX_RESULT_READ_BYTES) throw new IntakeError('invalid_state', { cause: 'result_too_large' });
  const bytes = await reader.read(0, reader.size);
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    raw = undefined;
  }
  return { raw, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength };
}

/** 성공한 실행의 결과를 다시 읽고 맞춘다 — 끝날 때 잰 해시와 다르면 없는 것으로 본다(서명 올리기 주소가 살아 있는 동안 파일이 바뀔 수 있어서) */
export async function readSucceededResult(storage: IntakeRunStorage, run: IntakeAnalysisRun): Promise<Pitch3dV2Ok | null> {
  if (run.status !== 'succeeded' || !run.resultPath) return null;
  const stored = await readStoredResult(storage, run.resultPath);
  if (!stored || stored.sha256 !== metaOf(run).sha256) return null;
  const parsed = readPitch3dV2Result(stored.raw);
  return parsed?.ok && parsed.jobId === run.id ? parsed : null;
}

/** 관리자가 공개 전에 보는 결과 — 공개 경계를 지나지 않는다. 라우트가 can(role, 'intake') 를 본 뒤에만 부른다 */
export async function loadRunResult(runId: string, rt?: IntakeRuntime): Promise<Pitch3dV2Ok> {
  if (!isIntakeId(runId)) throw new IntakeError('run_not_found');
  const r = rt ?? (await appIntakeRuntime());
  const run = await r.db.intakeAnalysisRun.findUnique({ where: { id: runId }, include: { submission: { select: { status: true } } } });
  if (!run) throw new IntakeError('run_not_found');
  /* 철회 뒤에는 관리자도 결과를 열지 않는다 — 원본을 잠그는 것과 같다 */
  if (run.submission.status === 'withdrawn') throw new IntakeError('original_locked');
  const result = await readSucceededResult(r.storage, run);
  if (!result) throw new IntakeError('run_not_publishable');
  return result;
}

/* ────────────────────────────── 실행 끝내기 ────────────────────────────── */

type ClosedRunCode = 'withdrawn' | 'revoked';
type RunOutcome =
  | { kind: 'succeeded'; path: string; sha256: string; bytes: number; frames: number; report: ReportSummary | null; stages: RunMeta['stages'] }
  | { kind: 'failed'; code: V2FailCode | ClosedRunCode; detail?: string | null; stage?: V2Stage | null; stages?: RunMeta['stages'] };

const failText = (code: V2FailCode | ClosedRunCode) => (closedRunCode(code) ? CLOSED_RUN_TEXT[code] : V2_FAIL_TEXT[code]);

/** 낸 손 — 고침이 열린 동안 받는 사람이 저장한 손은 아직 내지 않은 값이고 고침을 거두면 사라진다. 그동안은 고침을 열 때의 손이다 */
function submittedHandOf(sub: Pick<IntakeSubmission, 'status' | 'correction' | 'throwingHand'>): Pick<IntakeSubmission, 'throwingHand'> {
  const open = sub.status === 'correction_requested' ? readCorrection(sub.correction) : null;
  return open?.handBefore !== undefined ? { throwingHand: open.handBefore } : sub;
}

/**
 * 이 실행이 낸 입력(두 원본 + 손)으로 돌았나 — 접수 줄을 잠근 뒤에 부른다. 실행의 끝을 상태로 옮길 때만 쓴다.
 * 화면 · 공개는 runMatchesCurrent 로 접수 칸의 손까지 본다. 여기서 그 손을 보면 고침 중에 끝난 실행이 어디에도 안 적혀 상태가 '대기'에 남는다.
 */
async function isCurrentInput(tx: Prisma.TransactionClient, sub: Pick<IntakeSubmission, 'currentRevisionId' | 'throwingHand' | 'status' | 'correction'>, run: Pick<IntakeAnalysisRun, 'revisionId' | 'resultMeta'>): Promise<boolean> {
  if (!sub.currentRevisionId) return false;
  const rows = await tx.intakeRevision.findMany({ where: { id: { in: [sub.currentRevisionId, run.revisionId] } } });
  const current = rows.find((x) => x.id === sub.currentRevisionId);
  const own = rows.find((x) => x.id === run.revisionId);
  return current != null && own != null && runMatchesCurrent(run, own, submittedHandOf(sub), current);
}

/** 끝을 적는다 — 이미 끝난 실행이면 아무것도 안 한다. 실패면 키를 비워 다시 돌릴 수 있게 한다 */
async function settleRun(db: PrismaClient, run: IntakeAnalysisRun, outcome: RunOutcome, now: Date): Promise<boolean> {
  const meta = metaOf(run);
  const failed = outcome.kind === 'failed';
  const data: Prisma.IntakeAnalysisRunUpdateManyMutationInput = failed
    ? {
        status: 'failed',
        dedupeKey: null,
        failureCode: outcome.code,
        failureDetail: outcome.detail ?? failText(outcome.code),
        finishedAt: now,
        resultMeta: { ...meta, stages: { ...meta.stages, ...outcome.stages }, ...(outcome.stage ? { failStage: outcome.stage } : {}) } as Prisma.InputJsonValue,
      }
    : {
        status: 'succeeded',
        resultPath: outcome.path,
        finishedAt: now,
        startedAt: run.startedAt ?? now,
        resultMeta: {
          ...meta,
          stages: { ...meta.stages, ...outcome.stages },
          sha256: outcome.sha256,
          bytes: outcome.bytes,
          frames: outcome.frames,
          report: outcome.report,
        } as Prisma.InputJsonValue,
      };
  return db.$transaction(async (tx) => {
    await lockSubmission(tx, run.submissionId);
    const moved = await tx.intakeAnalysisRun.updateMany({ where: { id: run.id, status: { in: ['requested', 'running'] } }, data });
    if (moved.count === 0) return false;
    const sub = await tx.intakeSubmission.findUniqueOrThrow({ where: { id: run.submissionId } });
    const next: AnalysisStatus = failed ? 'failed' : 'succeeded';
    /* 글만 고쳐 '분석 가능'으로 돌아간 사이 같은 입력의 실행이 끝난 경우 — 이 성공을 지금 판이 그대로 잇는다. 실패는 그대로 두고 다시 누르게 한다 */
    const carried = !failed && sub.analysisStatus === 'ready';
    const current = await isCurrentInput(tx, sub, run);
    if ((carried || canMoveAnalysis(sub.analysisStatus as AnalysisStatus, next)) && current) {
      await tx.intakeSubmission.update({ where: { id: sub.id }, data: { analysisStatus: next } });
    } else if (!current && (sub.analysisStatus === 'queued' || sub.analysisStatus === 'running')) {
      /* 도는 동안 입력이 달라졌다(관리자가 손을 정한 경우 등). 이 결과는 지금 입력의 것이 아니고, 상태를 옮겨 줄 실행이 더 없으면 '대기'에 남아 다시 누를 수도 없다 */
      const live = await tx.intakeAnalysisRun.count({ where: { submissionId: sub.id, status: { in: ['requested', 'running'] } } });
      if (live === 0) await tx.intakeSubmission.update({ where: { id: sub.id }, data: { analysisStatus: 'ready' } });
    }
    await writeAudit(
      tx,
      { actor: { kind: 'system' }, action: failed ? 'analysis.failed' : 'analysis.succeeded', submissionId: run.submissionId, detail: { runId: run.id, failure: failed ? outcome.code : null } },
      now,
    );
    return true;
  });
}

async function markRunning(db: PrismaClient, run: IntakeAnalysisRun, stages: RunMeta['stages'], now: Date): Promise<void> {
  const meta = metaOf(run);
  await db.$transaction(async (tx) => {
    await lockSubmission(tx, run.submissionId);
    const moved = await tx.intakeAnalysisRun.updateMany({
      where: { id: run.id, status: { in: ['requested', 'running'] } },
      data: { status: 'running', startedAt: run.startedAt ?? now, resultMeta: { ...meta, stages: { ...meta.stages, ...stages } } as Prisma.InputJsonValue },
    });
    if (moved.count === 0) return;
    const sub = await tx.intakeSubmission.findUniqueOrThrow({ where: { id: run.submissionId } });
    if (sub.analysisStatus === 'queued' && (await isCurrentInput(tx, sub, run))) {
      await tx.intakeSubmission.update({ where: { id: sub.id }, data: { analysisStatus: 'running' } });
    }
  });
}

/* ────────────────────────────── 시작 ────────────────────────────── */

export type StartAnalysisInput = {
  submissionId: string;
  adminId: string;
  /** 국외 이전 안내가 확정 전인 것을 알고 돌린다(INTAKE_ALLOW_DRAFT_ANALYSIS=1 일 때만 뜻이 있다) */
  confirmDraftConsent?: boolean;
};

const slowmoOf = (facts: IntakeMediaFacts | null): number | null => (facts?.nominalFps === 120 || facts?.nominalFps === 240 ? facts.nominalFps : null);

/**
 * 고쳐 낸 새 판이 앞 판과 같은 입력(두 원본 + 손)이면 분석 상태를 잇는다 — 이름만 고쳤는데 '분석 가능'으로 돌아가 유료 재실행을 부르지 않게.
 * 같은 입력의 실행이 끝나 있으면 '성공', 돌고 있으면 그 상태로 둔다. 'ready' 일 때만 옮기고 GPU 는 안 건다. 손을 고친 판은 잇지 않는다. 잠근 트랜잭션 안에서 부른다.
 */
export async function carryInTx(
  tx: Prisma.TransactionClient,
  sub: Pick<IntakeSubmission, 'id' | 'analysisStatus' | 'throwingHand'>,
  rev: Pick<IntakeRevision, 'id'> & RevisionInput,
  now: Date,
): Promise<AnalysisStatus | null> {
  if (sub.analysisStatus !== 'ready') return null;
  const runs = await tx.intakeAnalysisRun.findMany({
    where: { submissionId: sub.id, status: { in: ['requested', 'running', 'succeeded'] }, revision: { sideAssetId: rev.sideAssetId, rearAssetId: rev.rearAssetId } },
    orderBy: { requestedAt: 'desc' },
    include: { revision: true },
  });
  const run = runs.find((x) => runMatchesCurrent(x, x.revision, sub, rev));
  if (!run) return null;
  const next: AnalysisStatus = run.status === 'succeeded' ? 'succeeded' : run.status === 'running' ? 'running' : 'queued';
  await tx.intakeSubmission.update({ where: { id: sub.id }, data: { analysisStatus: next } });
  await writeAudit(tx, { actor: { kind: 'system' }, action: 'analysis.carried', submissionId: sub.id, detail: { runId: run.id, revisionId: rev.id, status: next } }, now);
  return next;
}

/** 판 등록 뒤 부른다 — 지금 판이 아니면 아무것도 안 한다 */
export async function carryAnalysisForward(rt: Pick<IntakeRuntime, 'db' | 'now'>, revisionId: string): Promise<AnalysisStatus | null> {
  const now = rt.now?.() ?? new Date();
  return rt.db.$transaction(async (tx) => {
    const rev = await tx.intakeRevision.findUnique({ where: { id: revisionId } });
    if (!rev) return null;
    await lockSubmission(tx, rev.submissionId);
    const sub = await tx.intakeSubmission.findUniqueOrThrow({ where: { id: rev.submissionId } });
    if (sub.currentRevisionId !== rev.id || sub.status !== 'verified') return null;
    return carryInTx(tx, sub, rev, now);
  });
}

/**
 * 관리자가 분석을 건다. 같은 입력이면 있던 실행을 돌려준다(created false) — GPU 를 또 부르지 않는다.
 * 순서: 실행 줄 + 상태 일감을 한 트랜잭션에 먼저 남긴다(GPU 를 걸다 끊겨도 흔적이 남아 일꾼이 닫는다) → 서명 주소 → GPU.
 * GPU 를 못 부르면 던지지 않고 실패한 실행을 돌려준다. 실패도 기록이라서다.
 */
export async function startIntakeAnalysis(input: StartAnalysisInput, rt?: IntakeRuntime): Promise<{ run: IntakeRunView; created: boolean }> {
  if (!isIntakeId(input.submissionId)) throw new IntakeError('submission_not_found');
  const r = rt ?? (await appIntakeRuntime());
  const { db, storage, gpu } = r;
  const now = clock(r);

  if (!gpu.configured()) throw new IntakeError('analysis_not_configured');
  const gate = analysisRunGate(input.confirmDraftConsent === true, r.env);
  if (!gate.ok) throw new IntakeError(gateCode(gate.reason));
  /* 판을 못 읽으면 새 실행을 안 만든다 — 시간 초과 하나로 키가 달라져 같은 입력이 또 돌면 안 된다. 다시 누르면 된다 */
  const build = await gpu.engineBuild();
  if (!build) throw new IntakeAnalysisError('analysis_engine_unknown');
  const engineKey = engineKeyOf(build);

  const opened = await db.$transaction(async (tx) => {
    await lockSubmission(tx, input.submissionId);
    const sub = await tx.intakeSubmission.findUnique({ where: { id: input.submissionId }, include: { invitation: { select: { status: true } } } });
    if (!sub) throw new IntakeError('submission_not_found');
    const rev = sub.currentRevisionId ? await tx.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } }) : null;
    const blockers = submissionBlockers({ sub, rev, consents: await consentDecisionRows(tx, sub.id), invitationStatus: sub.invitation.status, originalsOver: await originalsOverOf(tx, sub, rev, now) });
    if (blockers.length) throw new IntakeError(blockers[0]);
    const hand = handOf(sub, rev)!;

    const runInput: RunInput = { side: rev!.sideAssetId, rear: rev!.rearAssetId, hand };
    const dedupeKey = dedupeKeyOf(runInput, engineKey);
    const same = await tx.intakeAnalysisRun.findUnique({ where: { dedupeKey } });
    if (same) {
      /* 글 칸만 고친 새 판이면 여기서 분석 상태를 잇는다. 등록 일감이 먼저 이었으면 할 일이 없다 */
      await carryInTx(tx, sub, rev!, now);
      return { run: same, created: false, rev: rev!, hand };
    }
    /* 엔진이 바뀌어 키가 달라도, 같은 두 원본이 돌고 있으면 끝날 때까지 기다린다 — 돈이 두 번 나가지 않게 */
    const busy = await tx.intakeAnalysisRun.count({
      where: { submissionId: sub.id, status: { in: ['requested', 'running'] }, revision: { sideAssetId: rev!.sideAssetId, rearAssetId: rev!.rearAssetId } },
    });
    if (busy > 0) throw new IntakeError('analysis_busy');
    if (!canMoveAnalysis(sub.analysisStatus as AnalysisStatus, 'queued')) throw new IntakeError('analysis_not_ready');

    const run = await tx.intakeAnalysisRun.create({
      data: {
        submissionId: sub.id,
        revisionId: rev!.id,
        engineKey,
        dedupeKey,
        requestedByAdminId: input.adminId,
        requestedAt: now,
        resultMeta: { input: runInput, ...(gate.draft ? { draftConsent: true } : {}) },
      },
    });
    await tx.intakeSubmission.update({ where: { id: sub.id }, data: { analysisStatus: 'queued' } });
    await enqueueJob(tx, { kind: 'poll_analysis', dedupeKey: pollJobKey(run.id), payload: { runId: run.id }, runAfter: new Date(now.getTime() + POLL_INTERVAL_MS) });
    await writeAudit(
      tx,
      { actor: { kind: 'admin', id: input.adminId }, action: 'analysis.requested', submissionId: sub.id, detail: { runId: run.id, revision: rev!.number, engineKey, hand, draftConsent: gate.draft } },
      now,
    );
    return { run, created: true, rev: rev!, hand };
  });

  const view = async (run: IntakeAnalysisRun) => {
    const sub = await db.intakeSubmission.findUniqueOrThrow({
      where: { id: run.submissionId },
      select: { publications: { where: { activeFor: { not: null } }, select: { runId: true } } },
    });
    const own = run.revisionId === opened.rev.id ? opened.rev : await db.intakeRevision.findUniqueOrThrow({ where: { id: run.revisionId } });
    return runView(run, own, { side: opened.rev.sideAssetId, rear: opened.rev.rearAssetId, hand: opened.hand }, sub.publications[0]?.runId ?? null);
  };
  if (!opened.created) return { run: await view(opened.run), created: false };

  const run = opened.run;
  const finish = async (failure: { code: V2FailCode | ClosedRunCode; detail?: string }) => {
    await settleRun(db, run, { kind: 'failed', ...failure }, clock(r));
    return { run: await view(await db.intakeAnalysisRun.findUniqueOrThrow({ where: { id: run.id } })), created: true };
  };

  let request: GpuJobRequest;
  let previews: { side: string; rear: string } | null;
  let timingDropped: boolean;
  try {
    const assets = await db.intakeAsset.findMany({ where: { id: { in: [opened.rev.sideAssetId, opened.rev.rearAssetId] } } });
    const side = assets.find((a) => a.id === opened.rev.sideAssetId);
    const rear = assets.find((a) => a.id === opened.rev.rearAssetId);
    if (!side || !rear) return finish({ code: 'internal', detail: '얼린 판의 영상을 찾지 못했어요.' });
    const previewPaths = { side: runPreviewPath(run.submissionId, run.id, 'side'), rear: runPreviewPath(run.submissionId, run.id, 'rear') };
    const [sideUrl, rearUrl, uploadUrl] = await Promise.all([
      storage.readUrl(side.objectPath, { ttlSec: GPU_READ_URL_TTL_SEC }),
      storage.readUrl(rear.objectPath, { ttlSec: GPU_READ_URL_TTL_SEC }),
      storage.resultUploadUrl(runResultPath(run.submissionId, run.id)),
    ]);
    /* 가벼운 영상은 관리자 미리 보기용이다. 주소를 못 만들면 빼고 분석만 돌린다 */
    const previewUrls = await Promise.all([storage.resultUploadUrl(previewPaths.side), storage.resultUploadUrl(previewPaths.rear)]).catch(() => null);
    previews = previewUrls ? previewPaths : null;
    /*
     * 원본 접수라고 원본으로 치지 않는다. 영상 시간을 믿을 수 없으면 엔진에 '화면 녹화 · 슬로모 모름'으로 넘긴다 — 그러면 착지 → 릴리스 시간을 빼고 경고를 단다.
     * 슬로모 값을 같이 넘기면 엔진이 그 값으로 시간을 되돌려 셈해서, 믿을 수 없는 값을 또 만든다.
     */
    timingDropped = analysisInputNotes([side, rear]).some((n) => n.dropsTiming);
    request = {
      jobId: run.id,
      engine: PITCH3D_V2_VERSION,
      side: { url: sideUrl },
      back: { url: rearUrl },
      /* 키는 묻지 않아 비워 둔다 */
      /* 줌으로 찍었으면 1배 초점 사전을 끈다(분석 서버 pipeline.py 의 lens 칸) */
      meta: {
        hand: opened.hand,
        slowmoFps: timingDropped ? null : slowmoOf(side.mediaFacts as IntakeMediaFacts | null),
        screenRecorded: timingDropped,
        heightCm: null,
        ...([side, rear].some((a) => zoomedFacts(a.mediaFacts as IntakeMediaFacts | null)) ? { lens: 'zoom' } : {}),
      },
      result: { uploadUrl },
      ...(previewUrls ? { previews: { side: previewUrls[0], back: previewUrls[1] } } : {}),
    };
  } catch {
    return finish({ code: 'upload', detail: '저장소 주소를 만들지 못했어요.' });
  }

  /* 서명 주소를 만드는 사이에 철회 · 폐기됐으면 보내지 않는다. 판단과 전송 사이가 짧을수록 좋아서 전송 바로 앞에서 다시 본다 */
  const live = await db.intakeSubmission.findUnique({ where: { id: run.submissionId }, select: { status: true, invitation: { select: { status: true } } } });
  if (live?.status === 'withdrawn') return finish({ code: 'withdrawn' });
  if (live?.invitation.status !== 'active') return finish({ code: 'revoked' });

  const meta: RunMeta = { ...metaOf(run), timingDropped, ...(previews ? { previews } : {}) };
  /* 걸기 전에 적어 둔다 — 답을 못 받아도 어디에 무엇을 보냈는지 남는다 */
  await db.intakeAnalysisRun.updateMany({ where: { id: run.id, status: 'requested' }, data: { resultMeta: { ...meta, startUnknown: true } as Prisma.InputJsonValue } });

  /*
   * gpu-auth 는 서버가 거절한 것이라 돌지 않았다. 그 밖의 실패 · 예외는 시간 초과 · 망 끊김과 가려지지 않는다 — 서버는 이미 돌고 있을 수 있다.
   * 그래서 실패로 닫지 않고 키를 쥔 채 둔다. 일꾼이 결과 파일을 찾고, 창이 지나면 닫는다(pollStartUnknown).
   */
  const started = await gpu.start(request).catch(() => ({ error: 'gpu' as const }));
  if ('error' in started) {
    if (started.error === 'gpu-auth') return finish({ code: 'gpu-auth' });
    return { run: await view(await db.intakeAnalysisRun.findUniqueOrThrow({ where: { id: run.id } })), created: true };
  }

  await db.intakeAnalysisRun.updateMany({
    where: { id: run.id, status: 'requested' },
    data: { gpuCallId: started.callId, resultMeta: meta as Prisma.InputJsonValue },
  });
  return { run: await view(await db.intakeAnalysisRun.findUniqueOrThrow({ where: { id: run.id } })), created: true };
}

/* ────────────────────────────── 상태 묻기(일꾼) ────────────────────────────── */

/** 실행 줄 → 약속의 작업 모양 — 상태 판단을 실험실과 같은 순수 함수에 맡긴다 */
function jobOf(run: IntakeAnalysisRun): Pitch3dV2Job {
  const requestedAt = run.requestedAt.toISOString();
  return {
    status: run.status === 'requested' ? 'queued' : 'running',
    jobId: run.id,
    requestedAt,
    requestedBy: run.requestedByAdminId ?? '',
    consentAt: requestedAt,
    engine: run.engineKey,
    gpuCallId: run.gpuCallId,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: null,
    stages: metaOf(run).stages ?? {},
    fail: null,
    shownJobId: null,
  };
}

export type PollResult = { finished: boolean; status: string };

/** 결과 파일 → 끝. 진단 요약은 관리자 목록 꼬리표다. 셈이 실패해도 결과는 저장한다. 나이는 받지 않아 성인 기준으로 본다 */
async function settleSaved(db: PrismaClient, run: IntakeAnalysisRun, saved: Pitch3dV2Result, stored: StoredRunResult, path: string, stages: RunMeta['stages'], now: Date): Promise<PollResult> {
  if (!saved.ok) {
    await settleRun(db, run, { kind: 'failed', code: saved.code, detail: saved.reason, stage: saved.stage, stages }, now);
    return { finished: true, status: 'failed' };
  }
  let report: ReportSummary | null = null;
  try {
    report = reportSummary(buildReport(saved, { heightCm: null, ground: 'mound', youth: false }));
  } catch {
    report = null;
  }
  await settleRun(db, run, { kind: 'succeeded', path, sha256: stored.sha256, bytes: stored.bytes, frames: saved.t.length, report, stages }, now);
  return { finished: true, status: 'succeeded' };
}

/**
 * GPU 번호를 못 받은 실행 — 걸기 응답이 끊겼거나, 줄만 만들고 서버 함수가 죽었다. 어느 쪽인지 알 수 없다.
 * 상태를 물을 번호가 없어서 약속한 결과 자리를 본다. 이 실행 번호의 결과면 받고, 창이 지나도 없으면 실패로 닫아 다시 돌릴 수 있게 한다.
 */
async function pollStartUnknown(r: IntakeRuntime, run: IntakeAnalysisRun, now: Date): Promise<PollResult> {
  const path = runResultPath(run.submissionId, run.id);
  let stored: StoredRunResult | null = null;
  try {
    stored = await readStoredResult(r.storage, path);
  } catch (e) {
    /* 저장소가 잠깐 안 되면 던져서 일꾼이 다시 묻는다. 상한을 넘는 파일은 다시 물어도 같아서 실패로 닫는다 */
    if (!(e instanceof IntakeError && e.code === 'invalid_state')) throw e;
    await settleRun(r.db, run, { kind: 'failed', code: 'internal' }, now);
    return { finished: true, status: 'failed' };
  }
  if (stored) {
    const saved = readPitch3dV2Result(stored.raw);
    if (saved && saved.jobId === run.id) return settleSaved(r.db, run, saved, stored, path, {}, now);
    await settleRun(r.db, run, { kind: 'failed', code: 'internal' }, now);
    return { finished: true, status: 'failed' };
  }
  if (now.getTime() - run.requestedAt.getTime() < START_UNKNOWN_WINDOW_MS) return { finished: false, status: run.status };
  await settleRun(r.db, run, { kind: 'failed', code: 'gpu', detail: '분석 서버의 시작 응답을 받지 못했고, 기다린 시간 안에 결과도 오지 않았어요.' }, now);
  return { finished: true, status: 'failed' };
}

/**
 * 돌고 있는 실행을 한 번 묻는다. 일꾼 · 관리자 화면이 같이 불러도 괜찮다(끝은 한 번만 적힌다).
 * 결과는 모양이 맞고 이 실행의 번호일 때만 성공이다. 맞지 않으면 실패로 남기고 원본은 그대로 둔다.
 */
export async function pollIntakeRun(runId: string, rt?: IntakeRuntime): Promise<PollResult> {
  const r = rt ?? (await appIntakeRuntime());
  const { db, storage, gpu } = r;
  const now = clock(r);
  const run = await db.intakeAnalysisRun.findUnique({ where: { id: runId } });
  if (!run) return { finished: true, status: 'missing' };
  if (run.status === 'succeeded' || run.status === 'failed') return { finished: true, status: run.status };

  /* 철회된 접수의 실행은 결과를 읽지 않고 닫는다. 분석 서버의 작업은 멈출 수 없어 파일이 뒤늦게 올라올 수 있지만, 아무도 안 읽고 공개되지도 않는다 */
  const owner = await db.intakeSubmission.findUnique({ where: { id: run.submissionId }, select: { status: true } });
  if (owner?.status === 'withdrawn') {
    await settleRun(db, run, { kind: 'failed', code: 'withdrawn' }, now);
    return { finished: true, status: 'failed' };
  }

  if (!run.gpuCallId) return pollStartUnknown(r, run, now);

  const path = runResultPath(run.submissionId, run.id);
  let status = await gpu.status(run.gpuCallId);
  let saved: Pitch3dV2Result | null = null;
  let stored: StoredRunResult | null = null;
  if (status.kind === 'done' || status.kind === 'failed') {
    try {
      stored = await readStoredResult(storage, path);
      if (stored) saved = readPitch3dV2Result(stored.raw);
    } catch (e) {
      /* 저장소가 잠깐 안 되면 던져서 일꾼이 다시 묻는다. 상한을 넘는 파일은 다시 물어도 같아서 실패로 닫는다 */
      if (!(e instanceof IntakeError && e.code === 'invalid_state')) throw e;
      status = { kind: 'failed', code: 'internal', stages: status.stages };
    }
  }
  if (status.kind === 'done' && stored && (!saved || saved.jobId !== run.id)) {
    status = { kind: 'failed', code: 'internal', stages: status.stages };
    saved = null;
  }

  const job = jobOf(run);
  const next = busyTimeout(job, applyGpuStatus(job, run.id, status, stored != null, now.getTime()));

  if (next.status === 'failed') {
    const code = next.fail?.code ?? 'internal';
    const fail = saved && !saved.ok ? saved : null;
    await settleRun(db, run, { kind: 'failed', code: fail?.code ?? code, detail: fail?.reason ?? next.fail?.reason, stage: fail?.stage ?? null, stages: next.stages }, now);
    return { finished: true, status: 'failed' };
  }
  if (next.status === 'done') {
    if (!saved || !stored) return { finished: false, status: run.status };
    return settleSaved(db, run, saved, stored, path, next.stages, now);
  }
  if (next.status === 'running') await markRunning(db, run, next.stages, now);
  return { finished: false, status: next.status === 'running' ? 'running' : run.status };
}

/** 상태 일감이 없어진 실행을 되살린다 — 일꾼이 횟수를 다 써 멈췄거나 일감 줄이 지워졌을 때. 크론이 부른다 */
export async function activeRunIds(db: PrismaClient, limit = 50): Promise<string[]> {
  const rows = await db.intakeAnalysisRun.findMany({ where: { status: { in: ['requested', 'running'] } }, orderBy: { requestedAt: 'asc' }, take: limit, select: { id: true } });
  return rows.map((x) => x.id);
}
