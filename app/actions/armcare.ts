'use server';

import { appNow } from '@/lib/clock';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { loadArmcareToday } from '@/lib/armcare/today';
import { buildArmcareRoutine } from '@/lib/armcare/routine';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { visibleExercises } from '@/lib/library-cache';
import {
  isRoutineId,
  normalizeRoutineInput,
  readRoutineItems,
  type MyRoutineItem,
} from '@/lib/armcare/my-routines';
import { createRoutineOnce, updateRoutine, type RoutineRefused, type RoutineSaved } from '@/lib/armcare/my-routines-save';

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
  const today = await loadArmcareToday(user, appNow());

  if (!today.hasCheckinToday) {
    return { error: '오늘 체크인을 먼저 남겨 주세요. 몸 상태를 보고 루틴을 짜요.' };
  }
  if (today.decision.kind === 'rest') {
    return { error: '통증이 기록된 날은 암케어도 쉬어요.' };
  }
  /* 재활 중에는 맞춤 루틴 자리에 오늘 재활이 선다(재활 2편, lib/armcare/today.ts) — 루틴을 따로 짜지 않는다 */
  if (today.rehab) {
    return { error: '재활 중에는 맞춤 루틴 대신 오늘 재활을 해요.' };
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
    /* 통증 루틴의 아픈 자리 — 오늘 '통증'인 관절의 것만(lib/armcare/today.ts) */
    painSpots: today.armPain?.spots ?? [],
  });

  if (routine.items.length === 0) {
    return {
      error:
        today.decision.kind === 'pain'
          ? '아픈 날에 할 만한 가벼운 암케어 운동이 없어요. 오늘은 팔을 쉬어 주세요.'
          : today.decision.reason.includes('이미 수행') ? '오늘 어깨·팔 운동을 이미 했어요. 보강을 더 채우지 않아도 돼요.' : '현재 장비와 몸 상태에 맞는 기본 보강이 없어요.',
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
 * 내 루틴을 저장한다 — id 가 있으면 고치고, 없으면 새로 만든다(웹 화면 · 옛 앱). 새 앱의 새 루틴은 createMyArmcareRoutine(같은 시도 key).
 *
 * 규칙은 lib/armcare/my-routines.ts, DB 일은 lib/armcare/my-routines-save.ts 한 곳에 있다(만들기 화면도 같은 규칙을 본다).
 * 여기서는 누구인지와 담을 수 있는 운동(보이는 암케어)만 넘긴다. error 는 쓰지 않은 것이 확정된 거절이다(code 로 까닭을 가른다).
 */
export async function saveMyArmcareRoutine(input: {
  id?: string | null;
  name: string;
  items: MyRoutineItem[];
}): Promise<RoutineSaved | RoutineRefused> {
  const user = await requireUser();
  const known = new Set((await armcareIds()).keys());
  /* id 없는 옛 만들기는 이번 요청에만 쓰는 key — 답이 끊겨 다시 누르면 새 key 라 하나 더 생길 수 있다(옛 화면의 한계, 새 앱은 key 를 정해 보낸다) */
  const res = input.id
    ? await updateRoutine(prisma, user.id, input.id, input, known)
    : await createRoutineOnce(prisma, user.id, randomUUID(), input, known);
  if ('ok' in res) revalidatePath('/training', 'layout');
  return res;
}

/**
 * 새 루틴을 한 번만 만든다(2026-10-31 앱 루틴 만들기) — key 는 앱이 그 초안을 열 때 정해 둔 새 루틴 id. 같은 key 를 다시 보내면(결과 확인 ·
 * 연타 · 답이 끊긴 뒤) 이미 만든 그 루틴을 돌려준다. 남의 key 는 거절한다(있는지도 알리지 않는다).
 */
export async function createMyArmcareRoutine(input: {
  key: string;
  name: string;
  items: MyRoutineItem[];
}): Promise<RoutineSaved | RoutineRefused> {
  const user = await requireUser();
  const known = new Set((await armcareIds()).keys());
  const res = await createRoutineOnce(prisma, user.id, input?.key, { name: input?.name, items: input?.items }, known);
  if ('ok' in res) revalidatePath('/training', 'layout');
  return res;
}

/** 내 루틴을 지운다. 체크해 둔 운동 기록은 그대로 남는다(기록은 운동 기록 표에 있다). */
export async function deleteMyArmcareRoutine(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!isRoutineId(id)) return { error: '잘못된 요청이에요.' };
  const res = await prisma.userArmcareRoutine.deleteMany({
    where: { id, userId: user.id },
  });
  if (res.count === 0) return { error: '루틴을 찾을 수 없어요.' };
  revalidatePath('/training', 'layout');
  return { ok: true };
}

/**
 * 부위별 보강에서 운동 하나를 내 루틴 끝에 담는다.
 *
 * 이미 담겨 있으면 그대로 두고 알린다(두 번 담기지 않게). 세트는 그 운동에 적힌
 * 처방을 따른다 — 만들기 화면에서 바꿀 수 있다.
 */
export async function addToMyArmcareRoutine(
  routineId: string,
  exerciseId: string
): Promise<{ ok: true; added: boolean } | { error: string }> {
  const user = await requireUser();
  if (!isRoutineId(routineId)) return { error: '잘못된 요청이에요.' };
  const known = await armcareIds();
  const exercise = known.get(exerciseId);
  if (!exercise) return { error: '담을 수 없는 운동이에요.' };

  /*
   * 읽은 때와 쓰는 때 사이에 누가 고쳤으면 다시 읽고 다시 더한다(updatedAt 으로 본다).
   * 그러지 않으면 담기를 빠르게 두 번 누를 때 둘 다 같은 목록을 읽어, 뒤에 쓴 쪽이 앞의
   * 것을 덮어 운동 하나가 말없이 사라졌다(2026-09-26 검토).
   */
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await prisma.userArmcareRoutine.findFirst({
      where: { id: routineId, userId: user.id },
      select: { name: true, items: true, updatedAt: true },
    });
    if (!row) return { error: '루틴을 찾을 수 없어요.' };
    const items = readRoutineItems(row.items);
    if (items.some((it) => it.exerciseId === exerciseId)) {
      return { ok: true, added: false };
    }
    const next = normalizeRoutineInput({
      name: row.name,
      items: [...items, { exerciseId, sets: exercise.sets ?? 2 }],
    });
    if (!next.ok) return { error: next.error };

    const res = await prisma.userArmcareRoutine.updateMany({
      where: { id: routineId, userId: user.id, updatedAt: row.updatedAt },
      data: {
        items: next.items as unknown as Prisma.InputJsonValue,
        updatedAt: appNow(),
      },
    });
    if (res.count === 1) {
      revalidatePath('/training', 'layout');
      return { ok: true, added: true };
    }
  }
  return {
    error: '이 루틴이 다른 곳에서 고쳐지는 중이에요. 잠시 뒤 다시 담아 주세요.',
  };
}
