'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { PLAN_EXERCISE_IDS } from '@/lib/shoot/plan';
import {
  isShootStatus,
  type ShootCheckView,
  type ShootStatus,
} from '@/lib/shoot/progress';
import { loadShootChecks } from '@/lib/shoot/load';

/**
 * 트레이닝 영상 촬영 체크 — 관리자만(/admin/shoot).
 *
 * 화면이 바로 부른다(폼이 아니다). 먼저 화면을 바꾸고(낙관적) 여기서 실패하면 되돌린다. 성공하면 모든 체크를 돌려준다 —
 * 같이 찍는 두 사람의 폰이 서로의 체크를 받는 길이기도 하다(fetchShootChecks 를 15초마다 부른다).
 */

export type ShootResult =
  { ok: true; checks: ShootCheckView[] } | { ok: false; error: string };

const NOT_ADMIN = { ok: false as const, error: '관리자만 할 수 있습니다.' };
const NOTE_MAX = 200;

async function requireAdminUser() {
  const user = await getCurrentUser();
  return user && user.role === 'ADMIN' ? user : null;
}

function revalidate() {
  revalidatePath('/admin/shoot', 'layout');
}

/**
 * 한 운동의 상태를 바꾼다. status null = 되돌리기(줄을 지운다 → 대기).
 * note 를 안 주면(undefined) 적어 둔 메모를 그대로 둔다. 빈 글은 메모를 지운다.
 */
export async function setShootStatus(
  exerciseId: string,
  status: ShootStatus | null,
  note?: string | null
): Promise<ShootResult> {
  const user = await requireAdminUser();
  if (!user) return NOT_ADMIN;
  if (typeof exerciseId !== 'string' || !PLAN_EXERCISE_IDS.has(exerciseId)) {
    return { ok: false, error: '촬영 계획에 없는 운동이에요. 새로고침해 주세요.' };
  }
  if (status !== null && !isShootStatus(status)) {
    return { ok: false, error: '상태가 올바르지 않아요.' };
  }
  let memo: string | null | undefined = undefined;
  if (note !== undefined) {
    if (note !== null && typeof note !== 'string')
      return { ok: false, error: '메모가 올바르지 않아요.' };
    const t = (note ?? '').trim();
    if (t.length > NOTE_MAX)
      return { ok: false, error: `메모는 ${NOTE_MAX}자까지예요.` };
    memo = t || null;
  }

  if (status === null) {
    await prisma.shootCheck.deleteMany({ where: { exerciseId } });
  } else {
    const prev = await prisma.shootCheck.findUnique({ where: { exerciseId } });
    /* 메모만 고친 것이면 시각은 그대로 — 날별 속도 · 계획 대비가 흔들리지 않게 */
    const sameStatus = prev?.status === status;
    await prisma.shootCheck.upsert({
      where: { exerciseId },
      update: {
        status,
        userId: user.id,
        ...(sameStatus ? {} : { checkedAt: new Date() }),
        ...(memo !== undefined ? { note: memo } : {}),
      },
      create: { exerciseId, status, userId: user.id, note: memo ?? null },
    });
  }
  revalidate();
  return { ok: true, checks: await loadShootChecks() };
}

/** 지금 체크 — 촬영 화면이 15초마다 · 다시 볼 때 부른다(다른 사람이 찍은 것을 받으려고) */
export async function fetchShootChecks(): Promise<ShootResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;
  return { ok: true, checks: await loadShootChecks() };
}
