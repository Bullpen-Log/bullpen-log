'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { validateSavedAnalysis } from '@/lib/pose/saved';

/**
 * 폼 분석 결과 저장. 영상 하나당 최신 분석 1개를 보관한다
 * (다시 저장하면 갱신). 본인 기록의 본인 영상인지 확인한다.
 */
export async function savePoseAnalysis(
  raw: unknown
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();

  const checked = validateSavedAnalysis(raw);
  if ('error' in checked) return { error: checked.error };
  const input = checked.value;

  const log = await prisma.pitchLog.findUnique({
    where: { id: input.pitchLogId },
    select: { userId: true, videoPaths: true },
  });
  if (!log || log.userId !== user.id) return { error: '기록을 찾을 수 없습니다.' };
  if (!log.videoPaths.includes(input.videoPath))
    return { error: '이 기록의 영상이 아닙니다.' };

  const data = {
    userId: user.id,
    pitchLogId: input.pitchLogId,
    videoPath: input.videoPath,
    throwingSide: input.throwingSide,
    wristSide: input.wristSide,
    leadSide: input.leadSide,
    direction: input.direction,
    quality: input.quality,
    coverage: input.coverage,
    kneeUpT: input.kneeUpT,
    footPlantT: input.footPlantT,
    releaseT: input.releaseT,
    kneeUpManualT: input.kneeUpManualT,
    footPlantManualT: input.footPlantManualT,
    releaseManualT: input.releaseManualT,
    metrics: input.metrics as object[],
  };

  await prisma.poseAnalysis.upsert({
    where: { videoPath: input.videoPath },
    create: data,
    update: data,
  });

  revalidatePath('/pitch-log');
  return { ok: true };
}
