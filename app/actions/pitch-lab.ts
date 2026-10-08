'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { deleteLabSample, saveLabMeta } from '@/lib/pitch-lab';
import { isLabId, readLabMeta } from '@/lib/pitch-lab-meta';

/**
 * 투구 분석 실험실(베타)의 저장 동작 — 관리자만. 영상은 브라우저가 이미 올렸고(app/api/pitch-lab/upload-url), 여기서는 촬영 정보만 적는다.
 * 오류 글은 해요체 한 줄(화면이 그대로 보인다).
 */

type Result = { ok: true } | { error: string };

const LAB_PATH = '/videos/lab';

export async function saveLabSample(input: { id: string; meta: unknown }): Promise<Result> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') return { error: '관리자만 할 수 있어요.' };
  if (!isLabId(input.id)) return { error: '샘플 번호를 확인할 수 없어요.' };
  try {
    await saveLabMeta(user.id, input.id, readLabMeta(input.meta, new Date().toISOString()));
  } catch {
    return { error: '정보를 저장하지 못했어요. 다시 해 주세요.' };
  }
  revalidatePath(LAB_PATH);
  return { ok: true };
}

export async function removeLabSample(input: { id: string }): Promise<Result> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') return { error: '관리자만 할 수 있어요.' };
  if (!isLabId(input.id)) return { error: '샘플 번호를 확인할 수 없어요.' };
  try {
    await deleteLabSample(user.id, input.id);
  } catch {
    return { error: '지우지 못했어요. 다시 해 주세요.' };
  }
  revalidatePath(LAB_PATH);
  return { ok: true };
}
