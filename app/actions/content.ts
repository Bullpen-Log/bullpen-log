'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { deleteVideos, isLibraryPath } from '@/lib/storage';
import {
  MECHANICS_CATEGORY_NAMES,
  TRAINING_CATEGORY_NAMES,
} from '@/lib/categories';
import {
  BODY_PARTS,
  DIFFICULTY_NAMES,
  DRILL_EQUIPMENT,
  EXERCISE_EQUIPMENT,
  FOCUS_POINTS,
  INTENSITY_NAMES,
  pickMany,
  pickOne,
} from '@/lib/exercise-meta';

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
  const videoPath = String(formData.get('videoPath') ?? '').trim();

  if (!title || !description) {
    return { error: '모든 필수 항목을 입력해주세요.' };
  }
  if (!TRAINING_CATEGORY_NAMES.includes(category)) {
    return { error: '알 수 없는 카테고리입니다.' };
  }
  // 올린 영상의 경로만 받는다. 다른 폴더를 가리키면 거부한다.
  if (!videoPath || !isLibraryPath(videoPath)) {
    return { error: '영상을 올려주세요.' };
  }

  // 목록에 없는 값이 섞여 들어오지 않도록 서버에서 다시 거른다.
  const bodyParts = pickMany(formData.getAll('bodyParts').map(String), BODY_PARTS);
  if (bodyParts.length === 0) {
    return { error: '목표 부위를 하나 이상 선택해주세요.' };
  }

  const intensity = pickOne(String(formData.get('intensity') ?? ''), INTENSITY_NAMES);
  if (!intensity) {
    return { error: '운동 강도를 선택해주세요.' };
  }

  const difficulty = pickOne(
    String(formData.get('difficulty') ?? ''),
    DIFFICULTY_NAMES
  );
  const equipment = pickMany(
    formData.getAll('equipment').map(String),
    EXERCISE_EQUIPMENT
  );

  await prisma.exerciseVideo.create({
    data: {
      title,
      category,
      description,
      videoPath,
      bodyParts,
      intensity,
      difficulty,
      equipment,
    },
  });

  revalidatePath('/library/training');
  return { success: '운동 영상이 등록되었습니다.' };
}

export async function deleteExercise(formData: FormData) {
  if (!(await assertAdmin())) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  // 기록을 지우면 저장소의 영상 파일도 함께 정리한다.
  const removed = await prisma.exerciseVideo.delete({ where: { id } });
  await deleteVideos([removed.videoPath]);
  revalidatePath('/library/training');
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
  const videoPath = String(formData.get('videoPath') ?? '').trim();
  const sortOrderRaw = String(formData.get('sortOrder') ?? '').trim();

  if (!title || !description) {
    return { error: '모든 필수 항목을 입력해주세요.' };
  }
  if (!MECHANICS_CATEGORY_NAMES.includes(category)) {
    return { error: '알 수 없는 카테고리입니다.' };
  }
  if (!videoPath || !isLibraryPath(videoPath)) {
    return { error: '영상을 올려주세요.' };
  }

  const sortOrder = sortOrderRaw ? Number.parseInt(sortOrderRaw, 10) : 0;
  if (Number.isNaN(sortOrder)) {
    return { error: '순서는 숫자로 입력해주세요.' };
  }

  const focusPoints = pickMany(
    formData.getAll('focusPoints').map(String),
    FOCUS_POINTS
  );
  if (focusPoints.length === 0) {
    return { error: '교정 포인트를 하나 이상 선택해주세요.' };
  }

  const equipment = pickMany(
    formData.getAll('equipment').map(String),
    DRILL_EQUIPMENT
  );

  await prisma.mechanicsGuide.create({
    data: {
      title,
      category,
      description,
      videoPath,
      focusPoints,
      equipment,
      sortOrder,
    },
  });

  revalidatePath('/library/mechanics');
  return { success: '가이드가 등록되었습니다.' };
}

export async function deleteGuide(formData: FormData) {
  if (!(await assertAdmin())) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const removed = await prisma.mechanicsGuide.delete({ where: { id } });
  await deleteVideos([removed.videoPath]);
  revalidatePath('/library/mechanics');
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

  revalidatePath('/library/mechanics');
}
