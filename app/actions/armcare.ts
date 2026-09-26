'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { loadArmcareToday } from '@/lib/armcare/today';
import { buildArmcareRoutine } from '@/lib/armcare/routine';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { visibleExercises } from '@/lib/library-cache';
import {
  MY_ROUTINE_MAX,
  normalizeRoutineInput,
  type MyRoutineItem,
} from '@/lib/armcare/my-routines';
import { loadMyRoutine } from '@/lib/armcare/my-routines-store';

/**
 * 오늘의 암케어를 만든다 — 처음 만들 때와 '다시 만들기'가 같은 동작이다.
 *
 * 운동 일정과 같은 규칙을 지킨다(app/actions/training-setup.ts).
 *   - 오늘 체크인이 있어야 만든다. 몸 상태를 모른 채 짜면 통증이 있어도 못 멈춘다.
 *   - 통증인 날은 만들지 않는다. 화면이 쉬라고 말한다.
 *
 * 다시 만들면 순서를 섞는 씨앗에 지금 목록을 넣는다. 날짜만 씨앗으로 쓰면 같은
 * 날에는 몇 번을 눌러도 똑같은 루틴이 나와, 누른 보람이 없다.
 */
export async function makeArmcareRoutine(): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const today = await loadArmcareToday(user, new Date());

  if (!today.hasCheckinToday) {
    return { error: '오늘 체크인을 먼저 남겨주세요. 몸 상태를 보고 루틴을 짭니다.' };
  }
  if (today.decision.kind === 'rest') {
    return { error: '통증이 기록된 날은 암케어도 쉽니다.' };
  }

  const routine = buildArmcareRoutine({
    decision: today.decision,
    candidates: today.candidates,
    facts: today.facts,
    lastDone: today.lastDone,
    doneToday: today.doneToday,
    /* 오늘 체크한 것은 장비 설정이 바뀌었어도 찾아서 남긴다 */
    known: today.library,
    previous: today.routine,
    seed: today.routine
      ? `${today.todayKey}:${today.routine.items.map((it) => it.exerciseId).join(',')}`
      : today.todayKey,
  });

  if (routine.items.length === 0) {
    return {
      error:
        '가진 장비로 할 수 있는 암케어 운동이 없습니다. 트레이닝 설정에서 가진 장비를 확인해 주세요.',
    };
  }

  const plan = routine as unknown as Prisma.InputJsonValue;
  await prisma.dailyArmcare.upsert({
    where: { userId_date: { userId: user.id, date: today.midnight } },
    create: { userId: user.id, date: today.midnight, plan },
    update: { plan },
  });

  revalidatePath('/training');
  return { ok: true };
}

/* ── 내 루틴 ─────────────────────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 담을 수 있는 운동 — 보이는 암케어 운동. 숨긴 것과 다른 카테고리는 못 담는다 */
async function armcareIds(): Promise<Map<string, { sets: number | null }>> {
  const all = await visibleExercises();
  return new Map(
    all
      .filter((ex) => ex.category === ARMCARE_CATEGORY)
      .map((ex) => [ex.id, { sets: ex.sets }])
  );
}

/**
 * 내 루틴을 저장한다 — id 가 없으면 새로 만들고, 있으면 고친다.
 *
 * 규칙은 lib/armcare/my-routines.ts 한 곳에 있다(만들기 화면도 같은 것을 본다).
 * 여기서 더 보는 것은 둘이다 — 담은 운동이 정말 보이는 암케어 운동인가, 남의 루틴을
 * 고치려는 것은 아닌가.
 */
export async function saveMyArmcareRoutine(input: {
  id?: string | null;
  name: string;
  items: MyRoutineItem[];
}): Promise<{ ok: true; id: string } | { error: string }> {
  const user = await requireUser();
  const clean = normalizeRoutineInput(input);
  if (!clean.ok) return { error: clean.error };

  const known = await armcareIds();
  const unknown = clean.items.filter((it) => !known.has(it.exerciseId));
  if (unknown.length) {
    return {
      error:
        '담을 수 없는 운동이 섞여 있습니다. 화면을 새로고침한 뒤 다시 담아 주세요.',
    };
  }
  const items = clean.items as unknown as Prisma.InputJsonValue;

  if (input.id) {
    if (!UUID.test(input.id)) return { error: '잘못된 요청입니다.' };
    const res = await prisma.userArmcareRoutine.updateMany({
      where: { id: input.id, userId: user.id },
      data: { name: clean.name, items },
    });
    if (res.count === 0) return { error: '루틴을 찾을 수 없습니다.' };
    revalidatePath('/training', 'layout');
    return { ok: true, id: input.id };
  }

  const count = await prisma.userArmcareRoutine.count({ where: { userId: user.id } });
  if (count >= MY_ROUTINE_MAX) {
    return {
      error: `내 루틴은 ${MY_ROUTINE_MAX}개까지 둘 수 있습니다. 안 쓰는 루틴을 지우고 만들어 주세요.`,
    };
  }
  const created = await prisma.userArmcareRoutine.create({
    data: { userId: user.id, name: clean.name, items },
    select: { id: true },
  });
  revalidatePath('/training', 'layout');
  return { ok: true, id: created.id };
}

/** 내 루틴을 지운다. 체크해 둔 운동 기록은 그대로 남는다(기록은 운동 기록 표에 있다). */
export async function deleteMyArmcareRoutine(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (typeof id !== 'string' || !UUID.test(id)) return { error: '잘못된 요청입니다.' };
  const res = await prisma.userArmcareRoutine.deleteMany({
    where: { id, userId: user.id },
  });
  if (res.count === 0) return { error: '루틴을 찾을 수 없습니다.' };
  revalidatePath('/training', 'layout');
  return { ok: true };
}

/**
 * 부위별 보강·훈련 방식에서 운동 하나를 내 루틴 끝에 담는다.
 *
 * 이미 담겨 있으면 그대로 두고 알린다(두 번 담기지 않게). 세트는 그 운동에 적힌
 * 처방을 따른다 — 만들기 화면에서 바꿀 수 있다.
 */
export async function addToMyArmcareRoutine(
  routineId: string,
  exerciseId: string
): Promise<{ ok: true; added: boolean } | { error: string }> {
  const user = await requireUser();
  if (typeof routineId !== 'string' || !UUID.test(routineId)) {
    return { error: '잘못된 요청입니다.' };
  }
  const known = await armcareIds();
  const exercise = known.get(exerciseId);
  if (!exercise) return { error: '담을 수 없는 운동입니다.' };

  const routine = await loadMyRoutine(user.id, routineId);
  if (!routine) return { error: '루틴을 찾을 수 없습니다.' };
  if (routine.items.some((it) => it.exerciseId === exerciseId)) {
    return { ok: true, added: false };
  }
  const next = normalizeRoutineInput({
    name: routine.name,
    items: [...routine.items, { exerciseId, sets: exercise.sets ?? 2 }],
  });
  if (!next.ok) return { error: next.error };

  await prisma.userArmcareRoutine.update({
    where: { id: routine.id },
    data: { items: next.items as unknown as Prisma.InputJsonValue },
  });
  revalidatePath('/training', 'layout');
  return { ok: true, added: true };
}
