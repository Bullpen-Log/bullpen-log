'use server';

import type { Prisma } from '@prisma/client';
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
