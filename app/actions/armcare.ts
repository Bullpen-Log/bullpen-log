'use server';

import { appendToOwnedRoutine } from '@/lib/armcare/routine-add';
import { loadMyRoutines } from '@/lib/armcare/my-routines-store';
import { type AddRoutineResult, type RoutineChoice } from '@/lib/armcare/routine-target';
import { appNow } from '@/lib/clock';
import { withJosa } from '@/lib/korean';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { loadArmcareToday, notAdvised } from '@/lib/armcare/today';
import { featureLocks } from '@/lib/feature-locks';
import { toDateKey } from '@/lib/pitch-stats';
import { formatPrescription } from '@/lib/exercise-meta';
import { equipmentLabel, similarExercises } from '@/lib/workout/swap';
import { armcarePlayerItems } from '@/lib/armcare/play-load';
import { armcareSwapPosition, type ArmcareSwapOptions, type ArmcareSwapRequest } from '@/lib/armcare/swap';
import type { PlayerItem } from '@/app/(session)/armcare/play/[id]/armcare-player';
import {
  ARMCARE_KIND_TEXT,
  ARMCARE_OFF_TEXT,
  armcareBlock,
  armcareChoices,
  armcareMinutes,
  buildArmcareRoutine,
  type ArmcareChoice,
  type ArmcareLength,
  type ArmcareRoutine,
} from '@/lib/armcare/routine';
import { ARMCARE_AREAS, ARMCARE_CATEGORY, areasOf, primaryArea } from '@/lib/armcare/anatomy';
import { visibleExercises } from '@/lib/library-cache';
import {
  isRoutineId,
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
 *
 * choice(2026-11-24) — 권한 것 대신 고른 것. 권한 것보다 가벼운 쪽만 받는다(armcareChoices). 안 주면 권한 대로(옛 화면 · 옛 앱).
 * 'off' 는 쉬는 날로 남긴다(루틴 없음 — 다시 고르면 바뀐다).
 * length(2026-11-24) — 'quick' 이면 짧게(앞 자리만, lib/armcare/routine.ts QUICK_SLOTS). 안 주면 보통.
 */
export async function makeArmcareRoutine(
  input?: { choice?: ArmcareChoice; length?: ArmcareLength } | null
): Promise<{ ok: true } | { error: string }> {
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

  const recommended = today.decision.kind;
  const choice = input?.choice ?? recommended;
  if (choice !== recommended && !armcareChoices(recommended).some((c) => c === choice)) {
    return { error: '지금 몸 상태로는 고를 수 없는 루틴이에요. 화면을 새로 불러와 주세요.' };
  }
  if (choice === 'off') {
    const off: ArmcareRoutine = {
      version: 2,
      kind: recommended,
      reason: ARMCARE_OFF_TEXT.reason,
      notes: [],
      items: [],
      estimatedMinutes: 0,
      recommended,
      off: true,
    };
    await saveRoutine(user.id, today.midnight, off);
    return { ok: true };
  }
  const chosen = choice !== recommended;

  const built = buildArmcareRoutine({
    decision: chosen
      ? { kind: choice, reason: `${withJosa(ARMCARE_KIND_TEXT[choice].label, '을/를')} 직접 골랐어요.` }
      : today.decision,
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
    length: input?.length === 'quick' ? 'quick' : 'full',
    mobility: today.mobility,
  });
  const routine: ArmcareRoutine = chosen ? { ...built, recommended } : built;

  if (routine.items.length === 0) {
    return {
      error:
        today.decision.kind === 'pain'
          ? '아픈 날에 할 만한 가벼운 암케어 운동이 없어요. 오늘은 팔을 쉬어 주세요.'
          : today.decision.reason.includes('이미 수행') ? '오늘 어깨·팔 운동을 이미 했어요. 보강을 더 채우지 않아도 돼요.' : '현재 장비와 몸 상태에 맞는 기본 보강이 없어요.',
    };
  }

  await saveRoutine(user.id, today.midnight, routine);
  return { ok: true };
}

async function saveRoutine(userId: string, date: Date, routine: ArmcareRoutine) {
  const plan = routine as unknown as Prisma.InputJsonValue;
  await prisma.dailyArmcare.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, plan },
    update: { plan },
  });
  revalidatePath('/training');
}

const ROUTINE_CHANGED = '오늘 루틴이 바뀌었어요. 다시 열어 주세요.';
type ArmcareUser = Awaited<ReturnType<typeof requireUser>>;

/** 그날의 맞춤 루틴을 기준으로 교체할 자리와 지금 가능한 운동을 고른다. */
async function armcareSwapContext(user: ArmcareUser, input: ArmcareSwapRequest, toId?: string) {
  const now = appNow();
  if (
    input?.dateKey !== toDateKey(now) || typeof input.fromId !== 'string' ||
    !Array.isArray(input.planIds) || !input.planIds.every((id) => typeof id === 'string')
  ) return { ok: false as const, error: ROUTINE_CHANGED };

  const today = await loadArmcareToday(user, now);
  const routine = today.routine;
  if (!routine || routine.off || today.rehab || !today.hasCheckinToday || today.decision.kind === 'rest') {
    return { ok: false as const, error: '지금은 오늘 암케어 루틴을 바꿀 수 없어요.' };
  }
  const ids = routine.items.map((item) => item.exerciseId);
  const position = armcareSwapPosition(ids, input.planIds, input.fromId, toId);
  if (!position) return { ok: false as const, error: ROUTINE_CHANGED };
  if (today.doneToday.has(input.fromId) || (toId != null && today.doneToday.has(toId))) {
    return { ok: false as const, error: '이미 수행한 운동은 바꿀 수 없어요.' };
  }

  const from = today.library.find((ex) => ex.id === input.fromId);
  if (!from) return { ok: false as const, error: '바꿀 수 없는 운동이에요.' };
  const original = routine.items[position.index];
  const pool = today.candidates.flatMap((ex) => {
    if (ex.id === input.fromId || today.doneToday.has(ex.id) ||
      (ids.includes(ex.id) && !(position.applied && ex.id === toId)) ||
      notAdvised(today, ex, false) || armcareBlock(ex, routine.kind, today.facts.condition.today)) return [];
    const areas = areasOf(ex.targetMuscles);
    const sameArea = areas.find((area) => area.key === original.area);
    if (routine.kind === 'pain' && !sameArea) return [];
    const area = sameArea ?? primaryArea(ex.targetMuscles);
    return area ? [{ ...ex, area, bodyParts: areas.map((known) => known.label), similar: !!sameArea }] : [];
  });
  return { ok: true as const, today, routine, original, position, from, pool };
}

/** 트레이닝 교체의 비슷한 운동 정렬을 암케어 부위 기준으로 사용한다. */
export async function armcareSwapOptions(input: ArmcareSwapRequest): Promise<ArmcareSwapOptions | { error: string }> {
  const user = await requireUser();
  if (featureLocks(user).training) return { error: '트레이닝 설정을 먼저 마쳐 주세요.' };
  const context = await armcareSwapContext(user, input);
  if (!context.ok) return { error: context.error };
  const { original, from, pool } = context;
  const fromAreas = new Set(areasOf(from.targetMuscles).map((area) => area.key));
  fromAreas.add(original.area);
  const relatedAreas = ARMCARE_AREAS.filter((area) => fromAreas.has(area.key));
  const similar = similarExercises({
    ...from,
    bodyParts: relatedAreas.map((area) => area.label),
  }, pool.filter((ex) => ex.similar), new Set()).map(({ exercise, reason }) => ({ id: exercise.id, reason }));
  return {
    picks: pool.map((ex) => ({
      id: ex.id,
      title: ex.title,
      area: ex.area.label,
      equipment: equipmentLabel(ex.equipment, ex.id),
      prescription: formatPrescription({ ...ex, sets: original.sets }),
    })),
    similar,
  };
}

/** 교체 직전에 조건을 다시 보고, 그동안 다시 만든 루틴을 덮어쓰지 않는다. */
export async function replaceArmcareExercise(input: ArmcareSwapRequest & { toId: string }): Promise<{ item: PlayerItem } | { error: string }> {
  const user = await requireUser();
  if (featureLocks(user).training) return { error: '트레이닝 설정을 먼저 마쳐 주세요.' };
  if (typeof input?.toId !== 'string' || !input.toId || input.toId === input.fromId) return { error: '바꿀 운동을 골라 주세요.' };
  const context = await armcareSwapContext(user, input, input.toId);
  if (!context.ok) return { error: context.error };
  const { today, routine, original, position, from, pool } = context;
  const to = pool.find((ex) => ex.id === input.toId);
  if (!to) return { error: '지금 루틴에 넣을 수 없는 운동이에요.' };

  const [item] = await armcarePlayerItems([{ exercise: to, sets: original.sets, doneBefore: false, unsafe: false }]);
  if (position.applied) return { item };

  const items = routine.items.map((entry, index) =>
    index === position.index ? { ...entry, exerciseId: to.id, area: to.area.key } : entry);
  const estimatedMinutes = Math.max(1, Math.round(
    routine.estimatedMinutes - armcareMinutes(from, original.sets) + armcareMinutes(to, original.sets)
  ));
  const result = await prisma.dailyArmcare.updateMany({
    where: { userId: user.id, date: today.midnight, plan: { equals: routine as unknown as Prisma.InputJsonValue } },
    data: { plan: { ...routine, items, estimatedMinutes } as unknown as Prisma.InputJsonValue },
  });
  if (result.count === 0) return { error: ROUTINE_CHANGED };
  revalidatePath('/training');
  return { item };
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
/** Raw membership includes hidden exercises; reading does not mutate the routine. */
export async function loadMyArmcareTargets(): Promise<RoutineChoice[]> {
  const user = await requireUser();
  return (await loadMyRoutines(user.id)).map((r) => ({ id: r.id, name: r.name, exerciseIds: r.items.map((it) => it.exerciseId) }));
}

export async function addToMyArmcareRoutine(routineId: string, exerciseId: string): Promise<AddRoutineResult> {
  const user = await requireUser();
  if (!isRoutineId(routineId) || !isRoutineId(exerciseId)) return { code: 'invalid', error: '잘못된 요청이에요.' };
  const exercise = (await armcareIds()).get(exerciseId);
  if (!exercise) return { code: 'exercise', error: '담을 수 없는 운동이에요.' };
  const result = await appendToOwnedRoutine(prisma, user.id, routineId, exerciseId, exercise.sets, appNow);
  if ('ok' in result && result.added) revalidatePath('/training', 'layout');
  return result;
}
