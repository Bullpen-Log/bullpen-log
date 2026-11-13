/**
 * 관리자가 가져오는 3D 결과 (INTAKE-MAIN/R03 D) — 팀이 원본을 내려받아 밖에서 만든 결과를 이 접수의 '성공한 실행' 하나로 들인다.
 * 그 뒤는 GPU 실행과 같다: 관리자 미리보기 → 그 결과 그대로의 검토 완료 → 공개(lib/intake/review.ts · publication.ts 그대로).
 *
 * ── 약속 ──────────────────────────────
 * - GPU · 분석 서버 설정 · 국외 이전 문서 준비(analysisRunGate) · 초안 동의 우회 플래그에 기대지 않는다. 그것들을 켜거나 바꾸지 않는다.
 * - 받는 형식은 묶음 하나다: { format: 'intake-manual-result/1', sideSha256, rearSha256, result, (선택) submissionId · revisionId · receiptCode }.
 *   result 는 이미 쓰는 3D 결과 계약(lib/pitch-3d/v2/contract.ts readPitch3dV2Result, ok:true)이다. 유한한 숫자 · 장면 수 · 관절 수 · 크기를 그 검사로 본다.
 *   GLB · FBX · Blender 파일은 받지 않는다 — 지금 보기는 관절 움직임을 그리는 보기라 그 파일을 그릴 수 없다(따로 변환기가 필요하다).
 * - 묶음은 이 접수의 지금 판 원본 짝에 묶인다: 두 해시가 그 판의 서버가 다시 잰 해시와 같아야 하고, 화면이 보던 판(expectedRevisionId)이 지금 판이어야 한다.
 *   다른 접수의 결과 · 고침 앞 판의 결과 · 검증이 안 끝난 판에는 넣지 못한다. 묶음에 접수 · 판 번호가 있으면 그것도 맞아야 한다.
 * - 던지는 손이 정해져 있으면 결과의 손과 같아야 한다. 아직 모르면 결과의 손으로 정하고 손 바꿈 감사를 남긴다(검토 묶음의 바뀜 표시가 센다).
 * - 실패하면 아무것도 바뀌지 않는다 — 앞서 가져온 결과 · 지금 공개는 그대로다. 새 실행은 성공한 경우에만 생긴다.
 * - 새 결과는 늘 비공개 초안이다. 새 실행이 생기면 실행 수 · 마지막 실행이 바뀌어(review.ts ChangeMarks) 앞서 남긴 검토 완료로는 공개할 수 없다.
 *   지금 공개는 다른 결과를 일부러 공개할 때까지 그대로다.
 * - 결과 파일은 작업 번호(jobId)를 이 실행 번호로 바꿔 저장하고 그 바이트의 해시를 적는다(readSucceededResult 가 둘을 다시 맞춘다). 가져온 파일 그대로의 해시도 따로 적는다.
 * - 권한은 보지 않는다 — 서버 동작(app/actions/intake-admin.ts)이 대표관리자인지 먼저 본다.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { metaOf, runResultPath } from '@/lib/intake/analysis';
import { writeAudit } from '@/lib/intake/audit';
import { IntakeError } from '@/lib/intake/errors';
import { isIntakeId } from '@/lib/intake/paths';
import { readCorrection } from '@/lib/intake/state';
import type { IntakeRunStorage } from '@/lib/intake/storage-core';
import { MAX_V2_RESULT_BYTES, readPitch3dV2Result, storedV2ResultJson, type Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { buildReport, reportSummary, type ReportSummary } from '@/lib/pitch-3d/v2/report';

export const MANUAL_RESULT_FORMAT = 'intake-manual-result/1';
export const MANUAL_ENGINE_KEY = 'manual-import/1';
/**
 * 가져오는 파일 상한 — 묶음 겉 + 결과. 서버 동작 본문 한도(Next 기본 1MB)보다 작게 둔다(next.config 를 바꾸지 않는다).
 * 저장하는 결과는 따로 MAX_V2_RESULT_BYTES(900KB) 안이어야 한다. 들여쓰기한 큰 파일은 한 줄(minified) JSON 으로 내보낸다.
 */
export const MAX_MANUAL_IMPORT_BYTES = 960_000;

const SHA256 = /^[0-9a-f]{64}$/;
type Hand = 'R' | 'L';

export type ManualEnvelope = {
  sideSha256: string;
  rearSha256: string;
  result: Pitch3dV2Ok;
  /** 가져온 파일 그대로의 SHA-256 */
  sourceSha256: string;
  declared: { submissionId: string | null; revisionId: string | null; receiptCode: string | null };
};

const invalid = (reason: string) => new IntakeError('manual_result_invalid', { reason });

/** 글 → 묶음. 모양이 틀리면 manual_result_invalid(어디가 틀렸는지 reason 하나) */
export function parseManualEnvelope(text: string): ManualEnvelope {
  if (typeof text !== 'string' || !text.trim()) throw invalid('empty');
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_MANUAL_IMPORT_BYTES) throw new IntakeError('manual_result_too_large', { bytes, max: MAX_MANUAL_IMPORT_BYTES });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw invalid('json');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid('shape');
  const r = raw as Record<string, unknown>;
  if (r.format !== MANUAL_RESULT_FORMAT) throw invalid('format');
  const side = typeof r.sideSha256 === 'string' ? r.sideSha256.toLowerCase() : '';
  const rear = typeof r.rearSha256 === 'string' ? r.rearSha256.toLowerCase() : '';
  if (!SHA256.test(side) || !SHA256.test(rear)) throw invalid('sha256');
  const opt = (v: unknown, field: string, check: (x: string) => boolean): string | null => {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string' || !check(v)) throw invalid(field);
    return v;
  };
  const declared = {
    submissionId: opt(r.submissionId, 'submissionId', isIntakeId),
    revisionId: opt(r.revisionId, 'revisionId', isIntakeId),
    receiptCode: opt(r.receiptCode, 'receiptCode', (x) => /^IN-\d{6}-[2-9A-HJKMNP-Z]{6}$/.test(x)),
  };
  const parsed = readPitch3dV2Result(r.result);
  if (!parsed) throw invalid('result');
  if (!parsed.ok) throw invalid('result_failed');
  return { sideSha256: side, rearSha256: rear, result: parsed, sourceSha256: createHash('sha256').update(text, 'utf8').digest('hex'), declared };
}

export type ManualImportInput = {
  submissionId: string;
  adminId: string;
  /** 화면이 보던 지금 판 — 그사이 판이 바뀌었으면 막는다 */
  expectedRevisionId: string;
  /** 가져온 파일 글 그대로 */
  text: string;
};
export type ManualImportResult = { runId: string; revisionId: string; revisionNumber: number; sha256: string; sourceSha256: string; frames: number; hand: Hand; handSet: boolean };
export type ManualImportRuntime = { db: PrismaClient; storage: IntakeRunStorage; now?: () => Date };

type Tx = Prisma.TransactionClient;
const lockSubmission = (tx: Tx, id: string) => tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${id} FOR UPDATE`;

type Checked = { revisionId: string; revisionNumber: number; side: string; rear: string; knownHand: Hand | null; openCorrection: ReturnType<typeof readCorrection> | null; draftHand: string | null };

/** 이 묶음이 지금 이 접수의 지금 판 원본 짝에 맞는가 — 트랜잭션 안팎에서 같은 판단을 한다 */
async function checkBinding(db: Tx | PrismaClient, input: ManualImportInput, env: ManualEnvelope): Promise<Checked> {
  const sub = await db.intakeSubmission.findUnique({ where: { id: input.submissionId }, select: { id: true, status: true, currentRevisionId: true, throwingHand: true, receiptCode: true, correction: true } });
  if (!sub) throw new IntakeError('submission_not_found');
  /* 철회 뒤에는 관리자도 결과를 열지 않는다(loadRunResult 와 같다) — 새 결과도 들이지 않는다 */
  if (sub.status === 'withdrawn') throw new IntakeError('original_locked');
  if (!sub.currentRevisionId || sub.currentRevisionId !== input.expectedRevisionId) throw new IntakeError('manual_result_stale', { currentRevisionId: sub.currentRevisionId });
  if (env.declared.submissionId && env.declared.submissionId !== sub.id) throw new IntakeError('manual_result_mismatch', { field: 'submissionId' });
  if (env.declared.revisionId && env.declared.revisionId !== sub.currentRevisionId) throw new IntakeError('manual_result_mismatch', { field: 'revisionId' });
  if (env.declared.receiptCode && env.declared.receiptCode !== sub.receiptCode) throw new IntakeError('manual_result_mismatch', { field: 'receiptCode' });
  const rev = await db.intakeRevision.findUnique({ where: { id: sub.currentRevisionId } });
  if (!rev || rev.submissionId !== sub.id) throw new IntakeError('manual_result_stale');
  if (rev.status !== 'verified') throw new IntakeError('manual_result_not_ready', { revisionStatus: rev.status });
  const assets = await db.intakeAsset.findMany({ where: { id: { in: [rev.sideAssetId, rev.rearAssetId] } }, select: { id: true, serverSha256: true, status: true } });
  const side = assets.find((a) => a.id === rev.sideAssetId);
  const rear = assets.find((a) => a.id === rev.rearAssetId);
  /* 서버가 저장소에서 다시 잰 해시와 맞춘다 — 브라우저가 알린 해시가 아니다. 검증된 판이라 둘이 같지만 서버 값이 권위다 */
  if (!side?.serverSha256 || !rear?.serverSha256) throw new IntakeError('manual_result_not_ready');
  if (side.serverSha256 !== env.sideSha256 || rear.serverSha256 !== env.rearSha256) {
    const swapped = side.serverSha256 === env.rearSha256 && rear.serverSha256 === env.sideSha256;
    throw new IntakeError('manual_result_mismatch', { field: swapped ? 'swapped' : 'sha256' });
  }
  /* 손 — 접수 값이 먼저다(관리자가 정한 값). 고침 중이면 고침 앞 값으로 본다(analysis.ts submittedHandOf 와 같은 뜻) */
  const open = sub.status === 'correction_requested' ? readCorrection(sub.correction) : null;
  const subHand = open?.handBefore !== undefined ? open.handBefore : sub.throwingHand;
  const h = subHand ?? rev.throwingHand ?? null;
  /* 고침 중 받는 분이 저장만 하고 아직 내지 않은 손 — 낸 손이 없을 때 이 값을 결과의 손으로 덮지 않는다 */
  const draftHand = open && open.handBefore !== undefined && sub.throwingHand !== open.handBefore ? sub.throwingHand : null;
  /* GPU 실행이 도는 중이면 받지 않는다 — 끝날 때 그 실행이 분석 상태를 다시 적어 둘이 엇갈린다 */
  if ((await db.intakeAnalysisRun.count({ where: { submissionId: sub.id, status: { in: ['requested', 'running'] } } })) > 0) throw new IntakeError('analysis_busy');
  return { revisionId: rev.id, revisionNumber: rev.number, side: rev.sideAssetId, rear: rev.rearAssetId, knownHand: h === 'R' || h === 'L' ? h : null, openCorrection: open, draftHand };
}

/**
 * 손 — 낸 손이 있으면 결과의 손과 같아야 한다. 낸 손이 없는데 고침 중 받는 분이 다른 손을 저장해 두었으면 받지 않는다
 * (관리자가 그 답을 모른 채 결과의 손으로 덮게 되므로 — 고침을 마치거나 손을 정한 뒤 가져온다).
 */
function assertHand(c: Checked, hand: Hand): void {
  if (c.knownHand && c.knownHand !== hand) throw new IntakeError('manual_result_hand', { expected: c.knownHand, got: hand });
  if (!c.knownHand && c.draftHand != null && c.draftHand !== hand) throw new IntakeError('manual_result_hand', { reason: 'correction_draft', got: hand });
}

function reportOf(result: Pitch3dV2Ok): ReportSummary | null {
  try {
    return reportSummary(buildReport(result, { heightCm: null, ground: 'mound', youth: false }));
  } catch {
    return null;
  }
}

/** 가져온다 — 성공하면 새 '성공한 실행' 하나(비공개). 실패하면 아무것도 바뀌지 않는다 */
export async function importManualResult(input: ManualImportInput, rt: ManualImportRuntime): Promise<ManualImportResult> {
  if (!isIntakeId(input.submissionId)) throw new IntakeError('submission_not_found');
  if (!isIntakeId(input.expectedRevisionId)) throw new IntakeError('invalid_input', { field: 'expectedRevisionId' });
  const now = rt.now?.() ?? new Date();
  const env = parseManualEnvelope(input.text);
  const pre = await checkBinding(rt.db, input, env);
  assertHand(pre, env.result.hand);
  if (!rt.storage.putRunFile) throw new IntakeError('storage_unavailable', { cause: 'put_run_file' });

  const runId = randomUUID();
  const stored = storedV2ResultJson({ ...env.result, jobId: runId });
  if ('error' in stored) throw new IntakeError('manual_result_too_large', { max: MAX_V2_RESULT_BYTES });
  const bytes = new TextEncoder().encode(stored.json);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const path = runResultPath(input.submissionId, runId);
  /* 파일 먼저(새 경로 · 덮어쓰지 않음), 줄은 나중 — 줄이 실패하면 아무도 안 가리키는 파일만 남고 지운다 */
  await rt.storage.putRunFile(path, bytes, 'application/json');

  try {
    return await rt.db.$transaction(async (tx) => {
      await lockSubmission(tx, input.submissionId);
      /* 잠근 뒤 다시 본다 — 그사이 고침 · 새 판 · 철회 · 손 바꿈이 있었으면 막는다 */
      const c = await checkBinding(tx, input, env);
      assertHand(c, env.result.hand);
      const hand: Hand = c.knownHand ?? env.result.hand;
      let handSet = false;
      if (!c.knownHand) {
        /* 고침 중이면 거둘 때 돌아갈 값도 같이 바꾼다(setAnalysisHand 와 같다) */
        await tx.intakeSubmission.update({
          where: { id: input.submissionId },
          data: { throwingHand: hand, ...(c.openCorrection ? { correction: { ...c.openCorrection, handBefore: hand } as Prisma.InputJsonValue } : {}) },
        });
        await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'analysis.hand_set', submissionId: input.submissionId, detail: { hand, source: 'manual_import' } }, now);
        handSet = true;
      }
      await tx.intakeAnalysisRun.create({
        data: {
          id: runId,
          submissionId: input.submissionId,
          revisionId: c.revisionId,
          engineKey: MANUAL_ENGINE_KEY,
          dedupeKey: null,
          status: 'succeeded',
          gpuCallId: null,
          requestedByAdminId: input.adminId,
          resultPath: path,
          resultMeta: {
            input: { side: c.side, rear: c.rear, hand },
            sha256,
            bytes: bytes.byteLength,
            frames: env.result.t.length,
            report: reportOf(env.result),
            source: 'manual',
            manual: { format: MANUAL_RESULT_FORMAT, sourceSha256: env.sourceSha256, importedAt: now.toISOString() },
          } as Prisma.InputJsonValue,
          requestedAt: now,
          startedAt: now,
          finishedAt: now,
        },
      });
      /* 쓸 수 있는 결과가 생겼다 — GPU 가 돌고 있으면 그 상태를 덮지 않는다 */
      const sub = await tx.intakeSubmission.findUniqueOrThrow({ where: { id: input.submissionId }, select: { analysisStatus: true } });
      if (sub.analysisStatus !== 'queued' && sub.analysisStatus !== 'running') {
        await tx.intakeSubmission.update({ where: { id: input.submissionId }, data: { analysisStatus: 'succeeded' } });
      }
      await writeAudit(
        tx,
        {
          actor: { kind: 'admin', id: input.adminId },
          action: 'analysis.manual_imported',
          submissionId: input.submissionId,
          detail: { runId, revision: c.revisionNumber, sha256, sourceSha256: env.sourceSha256, frames: env.result.t.length, hand, format: MANUAL_RESULT_FORMAT },
        },
        now,
      );
      return { runId, revisionId: c.revisionId, revisionNumber: c.revisionNumber, sha256, sourceSha256: env.sourceSha256, frames: env.result.t.length, hand, handSet };
    });
  } catch (e) {
    await rt.storage.remove([path]).catch(() => {});
    throw e;
  }
}

/** 이 실행이 가져온 결과인가 — 화면 꼬리표 */
export const isManualRun = (run: { resultMeta: unknown }) => metaOf(run as { resultMeta: Prisma.JsonValue }).source === 'manual';

/** 묶음 틀 — 매니페스트가 접수마다 싣는다. result 칸에 팀이 만든 3D 결과를 넣으면 그대로 가져올 수 있다 */
export function manualEnvelopeTemplate(input: { submissionId: string; revisionId: string; receiptCode: string | null; sideSha256: string; rearSha256: string }) {
  return {
    format: MANUAL_RESULT_FORMAT,
    submissionId: input.submissionId,
    revisionId: input.revisionId,
    receiptCode: input.receiptCode,
    sideSha256: input.sideSha256,
    rearSha256: input.rearSha256,
    result: null,
  };
}

/** 모양 검사만 — 시험 · 화면 미리 보기용 */
export const readManualResultShape = (raw: unknown) => readPitch3dV2Result(raw);
