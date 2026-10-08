'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { deleteLabSample, loadLabAnalysis as loadAnalysis, saveLabAnalysis as saveAnalysis, saveLabMeta } from '@/lib/pitch-lab';
import { readPitch3dResult, storedAnalysisJson, type Pitch3dResult } from '@/lib/pitch-3d/analyze';
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

/** 3D 분석 결과 저장 — 계산은 브라우저가 했다(영상은 기기 밖으로 안 나간다). 모양 · 크기를 검사하고 샘플 폴더에 둔다 */
export async function saveLabAnalysis(input: { id: string; result: unknown }): Promise<Result> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') return { error: '관리자만 할 수 있어요.' };
  if (!isLabId(input.id)) return { error: '샘플 번호를 확인할 수 없어요.' };
  const checked = storedAnalysisJson(input.result);
  if ('error' in checked) return checked;
  try {
    await saveAnalysis(user.id, input.id, checked.json);
  } catch {
    return { error: '분석 결과를 저장하지 못했어요. 다시 해 주세요.' };
  }
  revalidatePath(LAB_PATH);
  return { ok: true };
}

/** 저장된 3D 분석 결과 — 없거나 모양이 맞지 않으면 null */
export async function loadLabAnalysis(input: { id: string }): Promise<{ result: Pitch3dResult | null } | { error: string }> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') return { error: '관리자만 할 수 있어요.' };
  if (!isLabId(input.id)) return { error: '샘플 번호를 확인할 수 없어요.' };
  try {
    return { result: readPitch3dResult(await loadAnalysis(user.id, input.id)) };
  } catch {
    return { error: '분석 결과를 불러오지 못했어요.' };
  }
}
