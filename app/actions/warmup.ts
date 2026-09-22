'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import type { ActionState } from '@/app/actions/content';

/**
 * 고정 워밍업 루틴을 손보는 동작들.
 *
 * 루틴은 일정처럼 날마다 만들어지는 것이 아니라 미리 짜 두고 그대로 쓴다.
 * 그래서 여기서 하는 일은 '만들기·지우기'가 아니라 '이름 고치기'와 '운동
 * 담기·빼기·순서 바꾸기'뿐이다. 루틴 넷은 마이그레이션에서 심어 두었다.
 *
 * 운동 자체는 라이브러리의 '워밍업' 카테고리에 올린다. 영상·미리보기·처방이
 * 이미 다 있는 구조라, 워밍업만을 위한 것을 새로 만들지 않는다.
 */

const PATH = '/library/warmup';

async function assertAdmin() {
  const user = await getCurrentUser();
  return user && user.role === 'ADMIN' ? user : null;
}

/** 루틴의 이름과 한 줄 설명을 고친다. */
export async function updateWarmupRoutine(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!(await assertAdmin())) return { error: '관리자만 고칠 수 있습니다.' };

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  if (!id) return { error: '어느 루틴인지 알 수 없습니다.' };
  if (!name) return { error: '이름을 적어주세요.' };

  await prisma.warmupRoutine.update({ where: { id }, data: { name, description } });
  revalidatePath(PATH);
  return { success: '고쳤습니다.' };
}

/**
 * 루틴에 운동을 담는다. 맨 뒤에 붙는다.
 *
 * 이미 담긴 운동을 또 담으려 하면 조용히 넘어간다 — 같은 운동이 한 루틴에
 * 두 번 들어갈 이유가 없고, 두 번 눌렀다고 오류를 보여줄 일도 아니다.
 */
export async function addWarmupItem(formData: FormData) {
  if (!(await assertAdmin())) return;

  const routineId = String(formData.get('routineId') ?? '');
  const exerciseId = String(formData.get('exerciseId') ?? '');
  if (!routineId || !exerciseId) return;

  /* '워밍업' 카테고리가 아닌 것은 담지 않는다. 폼은 누구나 고쳐 보낼 수 있다. */
  const ex = await prisma.exerciseVideo.findUnique({
    where: { id: exerciseId },
    select: { category: true },
  });
  if (ex?.category !== '워밍업') return;

  const last = await prisma.warmupRoutineItem.findFirst({
    where: { routineId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  await prisma.warmupRoutineItem.upsert({
    where: { routineId_exerciseId: { routineId, exerciseId } },
    update: {},
    create: { routineId, exerciseId, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  revalidatePath(PATH);
}

/** 루틴에서 운동을 뺀다. 운동 자체는 그대로 남는다. */
export async function removeWarmupItem(formData: FormData) {
  if (!(await assertAdmin())) return;

  const routineId = String(formData.get('routineId') ?? '');
  const exerciseId = String(formData.get('exerciseId') ?? '');
  if (!routineId || !exerciseId) return;

  await prisma.warmupRoutineItem.deleteMany({ where: { routineId, exerciseId } });
  revalidatePath(PATH);
}

/**
 * 담긴 순서를 한 칸 올리거나 내린다.
 *
 * 번호를 다시 매기지 않고 이웃과 맞바꾼다. 다시 매기면 줄 수만큼 쓰기가
 * 생기는데, 한 루틴에 몇 개 안 들어가는 자리에서 그럴 이유가 없다.
 */
export async function moveWarmupItem(formData: FormData) {
  if (!(await assertAdmin())) return;

  const routineId = String(formData.get('routineId') ?? '');
  const exerciseId = String(formData.get('exerciseId') ?? '');
  const up = formData.get('direction') === 'up';
  if (!routineId || !exerciseId) return;

  const items = await prisma.warmupRoutineItem.findMany({
    where: { routineId },
    orderBy: { sortOrder: 'asc' },
    select: { exerciseId: true, sortOrder: true },
  });

  const at = items.findIndex((i) => i.exerciseId === exerciseId);
  const other = up ? at - 1 : at + 1;
  if (at < 0 || other < 0 || other >= items.length) return;

  await prisma.$transaction([
    prisma.warmupRoutineItem.update({
      where: { routineId_exerciseId: { routineId, exerciseId } },
      data: { sortOrder: items[other].sortOrder },
    }),
    prisma.warmupRoutineItem.update({
      where: {
        routineId_exerciseId: { routineId, exerciseId: items[other].exerciseId },
      },
      data: { sortOrder: items[at].sortOrder },
    }),
  ]);
  revalidatePath(PATH);
}
