'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import {
  MAX_VIDEO_BYTES,
  createUploadTarget,
  deleteVideos,
  isOwnedBy,
  isStorageConfigured,
} from '@/lib/storage';
import { toDateKey } from '@/lib/pitch-stats';

/**
 * 구속 측정 — 엔진 개발용 녹화(관리자). 측정 화면에서 측정 없이 찍은 원본 영상을 조각(30초 남짓, 앞 조각과 몇 초 겹침)으로
 * 올린다(lib/velocity-recorder.ts). 흐름: startVelocityRecording → 조각마다 createRecordingPartUpload(서명 주소) → 브라우저가 PUT →
 * attachRecordingPart → 멈추면 finishVelocityRecording. 공별 범위 · 스피드건 값은 구속 측정 관리자에서 적는다(VelocityRecordingCut).
 *
 * 관리자만 — 엔진을 고치려는 자료라 일반 사용자의 투구 기록 · 보정식과 섞지 않는다.
 */

export type RecordingResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: string };

async function requireAdminUser() {
  const user = await getCurrentUser();
  return user && user.role === 'ADMIN' ? user : null;
}

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/** 녹화 하나를 시작한다 — 카메라 · 설정 정보(meta)를 같이 남긴다(4KB 까지) */
export async function startVelocityRecording(input: {
  date?: string;
  meta?: unknown;
}): Promise<RecordingResult<{ id: string }>> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: '관리자만 녹화할 수 있어요.' };
  if (!isStorageConfigured())
    return { ok: false, error: '영상 저장소가 설정되지 않았어요.' };
  const day =
    typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
      ? input.date
      : toDateKey(new Date());
  let meta: Prisma.InputJsonValue | undefined;
  try {
    const text = JSON.stringify(input.meta ?? null);
    if (text && text.length <= 4096 && input.meta && typeof input.meta === 'object')
      meta = JSON.parse(text) as Prisma.InputJsonValue;
  } catch {
    meta = undefined;
  }
  const row = await prisma.velocityRecording.create({
    data: { userId: user.id, date: new Date(`${day}T00:00:00.000Z`), meta },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

async function ownRecording(recordingId: string, userId: string) {
  return prisma.velocityRecording.findFirst({
    where: { id: String(recordingId), userId },
    select: { id: true },
  });
}

/** 조각 하나를 올릴 서명 주소 — 저장소 한 파일 한도(50MB) 안이어야 한다 */
export async function createRecordingPartUpload(
  recordingId: string,
  mime: string,
  bytes: number
): Promise<RecordingResult<{ path: string; signedUrl: string; token: string }>> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: '관리자만 녹화할 수 있어요.' };
  if (!isStorageConfigured())
    return { ok: false, error: '영상 저장소가 설정되지 않았어요.' };
  if (!/^video\//.test(String(mime)))
    return { ok: false, error: '영상 파일만 올릴 수 있어요.' };
  if (!(bytes > 0 && bytes <= MAX_VIDEO_BYTES)) {
    return {
      ok: false,
      error: `조각은 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB 까지 올릴 수 있어요.`,
    };
  }
  if (!(await ownRecording(recordingId, user.id)))
    return { ok: false, error: '녹화를 찾을 수 없어요.' };
  const ext = /mp4/.test(mime) ? 'mp4' : /quicktime/.test(mime) ? 'mov' : 'webm';
  try {
    const target = await createUploadTarget(user.id, `rec.${ext}`);
    return { ok: true, ...target };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '업로드 주소를 만들지 못했어요.',
    };
  }
}

/** 올린 조각을 녹화에 적는다. 같은 차례의 옛 조각이 있으면(다시 올림) 옛 파일은 지운다 */
export async function attachRecordingPart(
  recordingId: string,
  info: {
    index: number;
    path: string;
    bytes: number;
    mime: string;
    offsetSec: number;
    durationSec: number | null;
  }
): Promise<RecordingResult> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: '관리자만 녹화할 수 있어요.' };
  if (!(await ownRecording(recordingId, user.id)))
    return { ok: false, error: '녹화를 찾을 수 없어요.' };
  const path = String(info.path ?? '');
  if (!isOwnedBy(path, user.id) || path.includes('..'))
    return { ok: false, error: '조각 경로가 올바르지 않아요.' };
  const index = num(info.index, 0, 10_000);
  const bytes = num(info.bytes, 1, MAX_VIDEO_BYTES);
  const offsetSec = num(info.offsetSec, 0, 24 * 3600);
  if (index == null || bytes == null || offsetSec == null)
    return { ok: false, error: '조각 정보가 올바르지 않아요.' };
  const durationSec = num(info.durationSec, 0, 3600);
  const mime = /^video\/[\w.+-]+(;.*)?$/.test(String(info.mime))
    ? String(info.mime).slice(0, 100)
    : 'video/mp4';

  const old = await prisma.velocityRecordingPart.findUnique({
    where: { recordingId_index: { recordingId, index: Math.round(index) } },
    select: { path: true },
  });
  await prisma.velocityRecordingPart.upsert({
    where: { recordingId_index: { recordingId, index: Math.round(index) } },
    create: {
      recordingId,
      index: Math.round(index),
      path,
      bytes: Math.round(bytes),
      mime,
      offsetSec,
      durationSec,
    },
    update: { path, bytes: Math.round(bytes), mime, offsetSec, durationSec },
  });
  if (old && old.path !== path) await deleteVideos([old.path]);
  /* 녹화 길이는 지금까지 받은 조각의 끝 — 멈춤을 못 누르고 끊겨도 길이가 남는다 */
  if (durationSec != null) {
    const end = offsetSec + durationSec;
    await prisma.velocityRecording.updateMany({
      where: {
        id: recordingId,
        OR: [{ durationSec: null }, { durationSec: { lt: end } }],
      },
      data: { durationSec: end },
    });
  }
  return { ok: true };
}

/** 멈춤 — 다 올린 뒤 부른다 */
export async function finishVelocityRecording(
  recordingId: string,
  info: { durationSec: number | null }
): Promise<RecordingResult<{ parts: number }>> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: '관리자만 녹화할 수 있어요.' };
  if (!(await ownRecording(recordingId, user.id)))
    return { ok: false, error: '녹화를 찾을 수 없어요.' };
  const parts = await prisma.velocityRecordingPart.count({ where: { recordingId } });
  const durationSec = num(info.durationSec, 0, 24 * 3600);
  await prisma.velocityRecording.update({
    where: { id: recordingId },
    data: { status: 'done', ...(durationSec != null ? { durationSec } : {}) },
  });
  return { ok: true, parts };
}

/* ───────── 관리자 편집기 — 공별 범위 · 스피드건 값 · 다시 잰 값 ───────── */

export type RecordingCutInput = {
  /** 없으면 새로 만든다 */
  id?: string | null;
  recordingId: string;
  partId: string;
  startSec: number;
  endSec: number;
  eventSec?: number | null;
  gunKmh?: number | null;
  pitchType?: string | null;
  memo?: string | null;
  excluded?: boolean;
};

const PITCH_TYPE_RE = /^[a-z-]{1,20}$/;

/** 공 하나의 범위 · 적은 값을 남긴다. 범위가 바뀌면 지난 잰 값은 지운다(다른 장면이라) */
export async function saveRecordingCut(
  input: RecordingCutInput
): Promise<RecordingResult<{ id: string }>> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: '관리자만 고칠 수 있어요.' };
  const part = await prisma.velocityRecordingPart.findFirst({
    where: { id: String(input.partId), recordingId: String(input.recordingId) },
    select: { id: true, durationSec: true },
  });
  if (!part) return { ok: false, error: '조각을 찾을 수 없어요.' };
  const start = num(input.startSec, 0, 3600);
  const end = num(input.endSec, 0, 3600);
  if (start == null || end == null || end - start < 0.2 || end - start > 10)
    return { ok: false, error: '범위는 0.2~10초여야 해요.' };
  const gun = input.gunKmh == null ? null : num(input.gunKmh, 20, 200);
  if (input.gunKmh != null && gun == null)
    return { ok: false, error: '스피드건 값은 20~200km/h 예요.' };
  const data = {
    startSec: start,
    endSec: end,
    eventSec: input.eventSec == null ? null : num(input.eventSec, 0, 3600),
    gunKmh: gun,
    pitchType:
      typeof input.pitchType === 'string' && PITCH_TYPE_RE.test(input.pitchType)
        ? input.pitchType
        : null,
    memo:
      typeof input.memo === 'string' && input.memo.trim()
        ? input.memo.trim().slice(0, 300)
        : null,
    excluded: input.excluded === true,
  };
  if (input.id) {
    const old = await prisma.velocityRecordingCut.findFirst({
      where: { id: String(input.id), recordingId: String(input.recordingId) },
      select: { startSec: true, endSec: true, partId: true },
    });
    if (!old) return { ok: false, error: '공을 찾을 수 없어요.' };
    const moved =
      old.partId !== part.id ||
      Math.abs(old.startSec - start) > 1e-3 ||
      Math.abs(old.endSec - end) > 1e-3;
    await prisma.velocityRecordingCut.update({
      where: { id: String(input.id) },
      data: {
        ...data,
        partId: part.id,
        ...(moved
          ? {
              ok: null,
              rawKmh: null,
              releaseKmh: null,
              errorKmh: null,
              reject: null,
              engineVersion: null,
              measuredAt: null,
              analysis: Prisma.DbNull,
            }
          : {}),
      },
    });
    return { ok: true, id: String(input.id) };
  }
  const row = await prisma.velocityRecordingCut.create({
    data: { ...data, recordingId: String(input.recordingId), partId: part.id },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

/** 지금 모델로 잰 결과를 공에 남긴다(관리자 브라우저가 잰다) */
export async function saveRecordingCutResult(
  cutId: string,
  result: {
    ok: boolean;
    rawKmh: number | null;
    releaseKmh: number | null;
    errorKmh: number | null;
    reject: string | null;
    engineVersion: string;
    analysis?: unknown;
  }
): Promise<RecordingResult> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: '관리자만 고칠 수 있어요.' };
  let analysis: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  try {
    const text = JSON.stringify(result.analysis ?? null);
    if (
      text &&
      text.length <= 200_000 &&
      result.analysis &&
      typeof result.analysis === 'object'
    )
      analysis = JSON.parse(text) as Prisma.InputJsonValue;
  } catch {
    analysis = Prisma.DbNull;
  }
  const done = await prisma.velocityRecordingCut.updateMany({
    where: { id: String(cutId) },
    data: {
      ok: result.ok === true,
      rawKmh: result.ok ? num(result.rawKmh, 0, 300) : null,
      releaseKmh: result.ok ? num(result.releaseKmh, 0, 300) : null,
      errorKmh: result.ok ? num(result.errorKmh, 0, 100) : null,
      reject: result.ok ? null : String(result.reject ?? 'UNKNOWN').slice(0, 40),
      engineVersion: String(result.engineVersion ?? '').slice(0, 20) || null,
      measuredAt: new Date(),
      analysis,
    },
  });
  return done.count > 0 ? { ok: true } : { ok: false, error: '공을 찾을 수 없어요.' };
}

export async function deleteRecordingCut(cutId: string): Promise<RecordingResult> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: '관리자만 고칠 수 있어요.' };
  await prisma.velocityRecordingCut.deleteMany({ where: { id: String(cutId) } });
  return { ok: true };
}

/** 녹화를 통째로 지운다 — 저장소의 조각 파일도. 되돌릴 수 없다(화면이 한 번 묻는다) */
export async function deleteVelocityRecording(
  recordingId: string
): Promise<RecordingResult> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: '관리자만 지울 수 있어요.' };
  const parts = await prisma.velocityRecordingPart.findMany({
    where: { recordingId: String(recordingId) },
    select: { path: true },
  });
  await prisma.velocityRecording.deleteMany({ where: { id: String(recordingId) } });
  if (parts.length > 0) await deleteVideos(parts.map((p) => p.path));
  revalidatePath('/admin/velocity/recordings');
  return { ok: true };
}

/** 녹화 메모 */
export async function saveRecordingMemo(
  recordingId: string,
  memo: string
): Promise<RecordingResult> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: '관리자만 고칠 수 있어요.' };
  await prisma.velocityRecording.updateMany({
    where: { id: String(recordingId) },
    data: { memo: memo.trim() ? memo.trim().slice(0, 500) : null },
  });
  return { ok: true };
}
