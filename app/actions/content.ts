'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { getYouTubeId } from '@/lib/youtube';
import {
  MECHANICS_CATEGORY_NAMES,
  TRAINING_CATEGORY_NAMES,
} from '@/lib/categories';

export type ActionState = { error?: string; success?: string } | undefined;

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return null;
  }
  return user;
}

/* ---------------------------------- 트레이닝 --------------------------------- */

export async function createExercise(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!(await assertAdmin())) return { error: '관리자만 등록할 수 있습니다.' };

  const title = String(formData.get('title') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const videoUrl = String(formData.get('videoUrl') ?? '').trim();

  if (!title || !description || !videoUrl) {
    return { error: '영상 링크를 포함한 모든 필수 항목을 입력해주세요.' };
  }
  if (!TRAINING_CATEGORY_NAMES.includes(category)) {
    return { error: '알 수 없는 카테고리입니다.' };
  }
  if (!getYouTubeId(videoUrl)) {
    return { error: '유효한 유튜브 링크가 아닙니다. (예: https://youtu.be/영상ID)' };
  }

  await prisma.exerciseVideo.create({
    data: { title, category, description, videoUrl },
  });

  revalidatePath('/training');
  return { success: '운동 영상이 등록되었습니다.' };
}

export async function deleteExercise(formData: FormData) {
  if (!(await assertAdmin())) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  await prisma.exerciseVideo.delete({ where: { id } });
  revalidatePath('/training');
}

/* --------------------------------- 메커니즘 --------------------------------- */

export async function createGuide(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!(await assertAdmin())) return { error: '관리자만 등록할 수 있습니다.' };

  const title = String(formData.get('title') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const videoUrl = String(formData.get('videoUrl') ?? '').trim();
  const sortOrderRaw = String(formData.get('sortOrder') ?? '').trim();

  if (!title || !description || !videoUrl) {
    return { error: '영상 링크를 포함한 모든 필수 항목을 입력해주세요.' };
  }
  if (!MECHANICS_CATEGORY_NAMES.includes(category)) {
    return { error: '알 수 없는 카테고리입니다.' };
  }
  if (!getYouTubeId(videoUrl)) {
    return { error: '유효한 유튜브 링크가 아닙니다. (예: https://youtu.be/영상ID)' };
  }

  const sortOrder = sortOrderRaw ? Number.parseInt(sortOrderRaw, 10) : 0;
  if (Number.isNaN(sortOrder)) {
    return { error: '순서는 숫자로 입력해주세요.' };
  }

  await prisma.mechanicsGuide.create({
    data: { title, category, description, videoUrl, sortOrder },
  });

  revalidatePath('/mechanics');
  return { success: '가이드가 등록되었습니다.' };
}

export async function deleteGuide(formData: FormData) {
  if (!(await assertAdmin())) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  await prisma.mechanicsGuide.delete({ where: { id } });
  revalidatePath('/mechanics');
}

/** 가이드 학습 완료 체크를 토글한다. (로그인한 사용자 누구나) */
export async function toggleGuideProgress(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const guideId = String(formData.get('guideId') ?? '');
  if (!guideId) return;

  const existing = await prisma.userGuideProgress.findUnique({
    where: { userId_guideId: { userId: user.id, guideId } },
  });

  await prisma.userGuideProgress.upsert({
    where: { userId_guideId: { userId: user.id, guideId } },
    update: { completed: !existing?.completed },
    create: { userId: user.id, guideId, completed: true },
  });

  revalidatePath('/mechanics');
}
