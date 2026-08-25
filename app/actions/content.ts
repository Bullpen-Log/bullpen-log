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
  type Prescription,
} from '@/lib/exercise-meta';
import { withInput, type FormValues } from '@/lib/form-values';

export type ActionState = {
  error?: string;
  success?: string;
  values?: FormValues;
} | undefined;

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return null;
  }
  return user;
}

/* ---------------------------------- 트레이닝 --------------------------------- */

/** 숫자 칸 하나. 비어 있거나 범위를 벗어나면 null 로 본다. */
function readNumber(formData: FormData, name: string, min: number, max: number) {
  const raw = String(formData.get(name) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

/**
 * 세트·횟수·휴식을 읽는다.
 *
 * 다 비워도 된다 — 그러면 트레이닝이 종류로 시간을 어림한다.
 * 횟수와 버티는 시간을 둘 다 적으면 버티는 시간을 쓴다(시간형 운동으로 본다).
 */
function readPrescription(formData: FormData): Prescription {
  const holdSeconds = readNumber(formData, 'holdSeconds', 1, 600);
  return {
    sets: readNumber(formData, 'sets', 1, 10),
    reps: holdSeconds != null ? null : readNumber(formData, 'reps', 1, 100),
    holdSeconds,
    restSeconds: readNumber(formData, 'restSeconds', 0, 600),
    perSide: formData.get('perSide') === 'on',
  };
}

/**
 * 오류로 끝나면 입력한 값을 함께 돌려준다.
 * 부위 하나 안 골랐다고 설명까지 다시 쓰게 할 수는 없다.
 */
export async function createExercise(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return withInput(await tryCreateExercise(formData), formData);
}

async function tryCreateExercise(formData: FormData): Promise<ActionState> {
  if (!(await assertAdmin())) return { error: '관리자만 등록할 수 있습니다.' };

  const title = String(formData.get('title') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const videoPath = String(formData.get('videoPath') ?? '').trim();
  // 미리보기 이미지는 없어도 되므로 형식이 어긋나면 조용히 버린다.
  const rawThumb = String(formData.get('thumbPath') ?? '').trim();
  const thumbPath = rawThumb && isLibraryPath(rawThumb) ? rawThumb : null;

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
      thumbPath,
      bodyParts,
      intensity,
      difficulty,
      equipment,
      ...readPrescription(formData),
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
  await deleteVideos([removed.videoPath, removed.thumbPath].filter((p): p is string => !!p));
  revalidatePath('/library/training');
}

/**
 * 등록된 운동을 수정한다.
 * 영상은 새로 올렸을 때만 바꾸고, 그때 예전 파일을 정리한다.
 */
export async function updateExercise(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return withInput(await tryUpdateExercise(formData), formData);
}

async function tryUpdateExercise(formData: FormData): Promise<ActionState> {
  if (!(await assertAdmin())) return { error: '관리자만 수정할 수 있습니다.' };

  const id = String(formData.get('id') ?? '');
  const existing = id ? await prisma.exerciseVideo.findUnique({ where: { id } }) : null;
  if (!existing) return { error: '대상을 찾을 수 없습니다.' };

  const title = String(formData.get('title') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  if (!title || !description) {
    return { error: '모든 필수 항목을 입력해주세요.' };
  }
  if (!TRAINING_CATEGORY_NAMES.includes(category)) {
    return { error: '알 수 없는 카테고리입니다.' };
  }

  // 새 영상을 올렸으면 교체하고, 아니면 쓰던 것을 그대로 둔다.
  const newVideo = String(formData.get('videoPath') ?? '').trim();
  const newThumbRaw = String(formData.get('thumbPath') ?? '').trim();
  const replacing = Boolean(newVideo);
  if (replacing && !isLibraryPath(newVideo)) {
    return { error: '영상을 다시 올려주세요.' };
  }
  const videoPath = replacing ? newVideo : existing.videoPath;
  const thumbPath = replacing
    ? newThumbRaw && isLibraryPath(newThumbRaw)
      ? newThumbRaw
      : null
    : existing.thumbPath;

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

  await prisma.exerciseVideo.update({
    where: { id },
    data: {
      title,
      category,
      description,
      videoPath,
      thumbPath,
      bodyParts,
      intensity,
      difficulty,
      equipment,
      ...readPrescription(formData),
    },
  });

  // DB를 먼저 바꾼 뒤에 옛 파일을 지운다. 순서가 반대면 실패 시 영상이 사라진다.
  if (replacing) {
    await deleteVideos(
      [existing.videoPath, existing.thumbPath].filter((p): p is string => !!p)
    );
  }

  revalidatePath('/library/training');
  return { success: '수정했습니다.' };
}

/* --------------------------------- 메커니즘 --------------------------------- */

export async function createGuide(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return withInput(await tryCreateGuide(formData), formData);
}

async function tryCreateGuide(formData: FormData): Promise<ActionState> {
  if (!(await assertAdmin())) return { error: '관리자만 등록할 수 있습니다.' };

  const title = String(formData.get('title') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const videoPath = String(formData.get('videoPath') ?? '').trim();
  const rawThumb = String(formData.get('thumbPath') ?? '').trim();
  const thumbPath = rawThumb && isLibraryPath(rawThumb) ? rawThumb : null;
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
      thumbPath,
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
  await deleteVideos([removed.videoPath, removed.thumbPath].filter((p): p is string => !!p));
  revalidatePath('/library/mechanics');
}

/** 등록된 드릴을 수정한다. 영상은 새로 올렸을 때만 교체한다. */
export async function updateGuide(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return withInput(await tryUpdateGuide(formData), formData);
}

async function tryUpdateGuide(formData: FormData): Promise<ActionState> {
  if (!(await assertAdmin())) return { error: '관리자만 수정할 수 있습니다.' };

  const id = String(formData.get('id') ?? '');
  const existing = id ? await prisma.mechanicsGuide.findUnique({ where: { id } }) : null;
  if (!existing) return { error: '대상을 찾을 수 없습니다.' };

  const title = String(formData.get('title') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const sortOrderRaw = String(formData.get('sortOrder') ?? '').trim();

  if (!title || !description) {
    return { error: '모든 필수 항목을 입력해주세요.' };
  }
  if (!MECHANICS_CATEGORY_NAMES.includes(category)) {
    return { error: '알 수 없는 카테고리입니다.' };
  }

  const newVideo = String(formData.get('videoPath') ?? '').trim();
  const newThumbRaw = String(formData.get('thumbPath') ?? '').trim();
  const replacing = Boolean(newVideo);
  if (replacing && !isLibraryPath(newVideo)) {
    return { error: '영상을 다시 올려주세요.' };
  }
  const videoPath = replacing ? newVideo : existing.videoPath;
  const thumbPath = replacing
    ? newThumbRaw && isLibraryPath(newThumbRaw)
      ? newThumbRaw
      : null
    : existing.thumbPath;

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

  await prisma.mechanicsGuide.update({
    where: { id },
    data: {
      title,
      category,
      description,
      videoPath,
      thumbPath,
      focusPoints,
      equipment,
      sortOrder,
    },
  });

  if (replacing) {
    await deleteVideos(
      [existing.videoPath, existing.thumbPath].filter((p): p is string => !!p)
    );
  }

  revalidatePath('/library/mechanics');
  return { success: '수정했습니다.' };
}

/**
 * 이미 올려둔 영상의 미리보기 이미지만 새로 지정한다.
 * 업로드할 때 캡처가 실패한 영상을, 영상을 다시 올리지 않고 고치기 위한 것.
 */
export async function setExerciseThumbnail(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!(await assertAdmin())) return { error: '관리자만 바꿀 수 있습니다.' };

  const id = String(formData.get('id') ?? '');
  const thumbPath = String(formData.get('thumbPath') ?? '').trim();
  if (!thumbPath || !isLibraryPath(thumbPath)) {
    return { error: '미리보기 이미지를 만들지 못했습니다.' };
  }

  const existing = id ? await prisma.exerciseVideo.findUnique({ where: { id } }) : null;
  if (!existing) return { error: '대상을 찾을 수 없습니다.' };

  await prisma.exerciseVideo.update({ where: { id }, data: { thumbPath } });
  if (existing.thumbPath) await deleteVideos([existing.thumbPath]);

  revalidatePath('/library/training');
  return { success: '미리보기 이미지를 만들었습니다.' };
}

export async function setGuideThumbnail(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!(await assertAdmin())) return { error: '관리자만 바꿀 수 있습니다.' };

  const id = String(formData.get('id') ?? '');
  const thumbPath = String(formData.get('thumbPath') ?? '').trim();
  if (!thumbPath || !isLibraryPath(thumbPath)) {
    return { error: '미리보기 이미지를 만들지 못했습니다.' };
  }

  const existing = id ? await prisma.mechanicsGuide.findUnique({ where: { id } }) : null;
  if (!existing) return { error: '대상을 찾을 수 없습니다.' };

  await prisma.mechanicsGuide.update({ where: { id }, data: { thumbPath } });
  if (existing.thumbPath) await deleteVideos([existing.thumbPath]);

  revalidatePath('/library/mechanics');
  return { success: '미리보기 이미지를 만들었습니다.' };
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
