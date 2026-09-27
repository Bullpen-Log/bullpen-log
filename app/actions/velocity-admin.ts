'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { deleteVideos } from '@/lib/storage';
import { deleteVelocityPitchRow, deleteVelocitySessionRows } from '@/lib/velocity-sync';
import {
  PITCH_RESULT_KEYS,
  PITCH_TYPE_KEYS,
  ZONE_MAX,
  ZONE_MIN,
} from '@/lib/velocity-meta';

/**
 * 구속 측정 관리자(/admin/velocity)의 액션 — 관리자가 모든 계정의 공 · 세션 · 클립을 고치고 지운다.
 *
 * 본인 것만 다루는 app/actions/velocity.ts 와 갈라 둔다. 여기는 전부 관리자 판정을 먼저 하고,
 * 검증 규칙(구종 · 코스 · 결과 · 스피드건 범위 · 메모 길이)은 그 파일의 checkEdit 와 같다.
 */

export type AdminActionResult = { ok: true } | { ok: false; error: string };

const MIN_KMH = 30;
const MAX_KMH = 200;
const MEMO_MAX = 500;
const NOT_ADMIN: AdminActionResult = { ok: false, error: '관리자만 할 수 있습니다.' };

async function requireAdminUser() {
  const user = await getCurrentUser();
  return user && user.role === 'ADMIN' ? user : null;
}

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

export type AdminPitchPatch = {
  gunKmh?: number | null;
  calibExclude?: boolean;
  pitchType?: string | null;
  zone?: number | null;
  result?: string | null;
  memo?: string | null;
};

/** 공 하나의 보정 자료를 고친다 — 스피드건 값 · 제외 표시 · 구종 · 코스 · 결과 · 메모 */
export async function adminUpdateVelocityPitch(
  id: string,
  patch: AdminPitchPatch
): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const data: {
    gunKmh?: number | null;
    calibExclude?: boolean;
    pitchType?: string | null;
    zone?: number | null;
    result?: string | null;
    memo?: string | null;
  } = {};

  if ('gunKmh' in patch) {
    if (patch.gunKmh == null) data.gunKmh = null;
    else {
      const gun = num(patch.gunKmh, MIN_KMH, MAX_KMH);
      if (gun == null) {
        return {
          ok: false,
          error: `스피드건 값은 ${MIN_KMH}~${MAX_KMH} km/h 사이로 넣어주세요.`,
        };
      }
      data.gunKmh = Math.round(gun * 10) / 10;
    }
  }
  if ('calibExclude' in patch) data.calibExclude = patch.calibExclude === true;
  if ('pitchType' in patch) {
    const t =
      patch.pitchType == null || patch.pitchType === ''
        ? null
        : String(patch.pitchType);
    if (t != null && !PITCH_TYPE_KEYS.includes(t))
      return { ok: false, error: '구종 값이 올바르지 않습니다.' };
    data.pitchType = t;
  }
  if ('zone' in patch) {
    if (patch.zone == null) data.zone = null;
    else {
      const z = num(patch.zone, ZONE_MIN, ZONE_MAX);
      if (z == null) return { ok: false, error: '코스는 1~9 사이여야 합니다.' };
      data.zone = Math.round(z);
    }
  }
  if ('result' in patch) {
    const r = patch.result == null || patch.result === '' ? null : String(patch.result);
    if (r != null && !PITCH_RESULT_KEYS.includes(r))
      return { ok: false, error: '결과 값이 올바르지 않습니다.' };
    data.result = r;
  }
  if ('memo' in patch) {
    const memo = String(patch.memo ?? '').trim();
    if (memo.length > MEMO_MAX)
      return { ok: false, error: `메모는 ${MEMO_MAX}자까지 적을 수 있습니다.` };
    data.memo = memo || null;
  }
  if (Object.keys(data).length === 0) return { ok: true };

  const row = await prisma.velocityPitch.findUnique({
    where: { id },
    select: { id: true, session: { select: { date: true } } },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없습니다.' };

  await prisma.velocityPitch.update({ where: { id }, data });
  revalidateAll(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

/** 공 하나를 지운다(클립 포함) — 세션의 투구수 · 구속도 다시 맞춘다 */
export async function adminDeleteVelocityPitch(id: string): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const row = await prisma.velocityPitch.findUnique({
    where: { id },
    select: {
      id: true,
      sessionId: true,
      clipPath: true,
      session: { select: { date: true } },
    },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없습니다.' };

  await deleteVelocityPitchRow(row);
  revalidateAll(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

/** 세션을 통째로 지운다 — 같이 만든 투구 기록 · 공들의 클립까지 */
export async function adminDeleteVelocitySession(
  id: string
): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const session = await prisma.velocitySession.findUnique({
    where: { id },
    select: { id: true, date: true },
  });
  if (!session) return { ok: false, error: '세션을 찾을 수 없습니다.' };

  await deleteVelocitySessionRows(id);
  revalidateAll(session.date.toISOString().slice(0, 10));
  return { ok: true };
}

/** 공의 영상 클립만 지운다 — 공과 잰 값은 남긴다 */
export async function adminDeleteClip(pitchId: string): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const row = await prisma.velocityPitch.findUnique({
    where: { id: pitchId },
    select: { id: true, clipPath: true, session: { select: { date: true } } },
  });
  if (!row) return { ok: false, error: '공을 찾을 수 없습니다.' };
  if (!row.clipPath) return { ok: false, error: '이 공에는 클립이 없습니다.' };

  await deleteVideos([row.clipPath]).catch(() => undefined);
  await prisma.velocityPitch.update({
    where: { id: pitchId },
    data: {
      clipPath: null,
      clipBytes: null,
      clipSec: null,
      clipMime: null,
      clipEventSec: null,
    },
  });
  revalidateAll(row.session.date.toISOString().slice(0, 10));
  return { ok: true };
}

/** 세션의 메모 · 보정용 표시를 고친다 */
export async function adminUpdateSession(
  id: string,
  patch: { memo?: string | null; forCalibration?: boolean }
): Promise<AdminActionResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;

  const data: { memo?: string | null; forCalibration?: boolean } = {};
  if ('memo' in patch) {
    const memo = String(patch.memo ?? '').trim();
    if (memo.length > MEMO_MAX)
      return { ok: false, error: `메모는 ${MEMO_MAX}자까지 적을 수 있습니다.` };
    data.memo = memo || null;
  }
  if ('forCalibration' in patch) data.forCalibration = patch.forCalibration === true;
  if (Object.keys(data).length === 0) return { ok: true };

  const session = await prisma.velocitySession.findUnique({
    where: { id },
    select: { id: true, date: true },
  });
  if (!session) return { ok: false, error: '세션을 찾을 수 없습니다.' };

  await prisma.velocitySession.update({ where: { id }, data });
  revalidateAll(session.date.toISOString().slice(0, 10));
  return { ok: true };
}

function revalidateAll(date: string) {
  revalidatePath('/admin/velocity');
  revalidatePath(`/admin/velocity/${date}`);
  revalidatePath(`/pitch-log/${date}`);
  revalidatePath('/videos');
  revalidatePath('/today');
}
