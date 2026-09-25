'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { loadArmcareToday } from '@/lib/armcare/today';
import { buildArmcareRoutine } from '@/lib/armcare/routine';

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
