'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { validateSessionType } from '@/lib/session-type';
import type { FormValues } from '@/lib/form-values';

/**
 * 기록 표(PC, /sinker/log)의 줄 고치기 · 지우기(2026-10-21 개편 4단계 4-2). 새 기록은 지금처럼 투구 탭(app/api/pitch-log)이 받는다 —
 * 여기는 이미 있는 줄의 투구 종류 · 공 수 · 강도 · 최고 구속 · 메모만. 남의 줄은 userId 로 막는다.
 */
export type SinkerLogState =
  { error?: string; success?: string; values?: FormValues } | undefined;

const MAX_PITCH_COUNT = 500;

export async function updatePitchLog(
  _prev: SinkerLogState,
  formData: FormData
): Promise<SinkerLogState> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const log = await prisma.pitchLog.findUnique({
    where: { id },
    select: { userId: true, pitchCount: true },
  });
  if (!log || log.userId !== user.id) return { error: '기록을 찾을 수 없어요.' };

  const type = validateSessionType(String(formData.get('sessionType') ?? ''));
  if ('error' in type) return { error: type.error };
  const resting = log.pitchCount === 0;
  const pitchCount = resting
    ? 0
    : Number.parseInt(String(formData.get('pitchCount') ?? ''), 10);
  if (
    !resting &&
    (!Number.isInteger(pitchCount) || pitchCount < 1 || pitchCount > MAX_PITCH_COUNT)
  )
    return { error: `투구수는 1~${MAX_PITCH_COUNT}구예요.` };
  const intensityRaw = String(formData.get('intensity') ?? '').trim();
  const intensity = resting ? 0 : Number.parseInt(intensityRaw, 10);
  if (!resting && (!Number.isInteger(intensity) || intensity < 1 || intensity > 10))
    return { error: '강도는 1~10이에요.' };
  const velRaw = String(formData.get('maxVelocity') ?? '').trim();
  const maxVelocity = velRaw === '' ? null : Number(velRaw);
  if (
    maxVelocity != null &&
    (!Number.isFinite(maxVelocity) || maxVelocity < 30 || maxVelocity > 200)
  )
    return { error: '최고 구속은 30~200 km/h 사이로 적어 주세요.' };
  const memo =
    String(formData.get('memo') ?? '')
      .trim()
      .slice(0, 500) || null;

  await prisma.pitchLog.update({
    where: { id },
    data: { sessionType: type.value, pitchCount, intensity, maxVelocity, memo },
  });
  revalidatePath('/sinker');
  revalidatePath('/sinker/log');
  revalidatePath('/today');
  return { success: '고쳤어요.' };
}

export async function deletePitchLog(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  await prisma.pitchLog.deleteMany({ where: { id, userId: user.id } });
  revalidatePath('/sinker');
  revalidatePath('/sinker/log');
  revalidatePath('/today');
}
