'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { visibleGuides } from '@/lib/library-cache';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import {
  applyFeel,
  freshProgress,
  isElementName,
  isFeel,
  readProgress,
  type DrillStage,
} from '@/lib/mechanics/program';

/**
 * 투구 메커니즘 프로그램 — 시작 · 강조 바꾸기 · 처음부터 · 드릴 느낌 · 세션 마치기(2026-10-04).
 * 규칙은 lib/mechanics/program.ts, 표는 MechanicsProgram(한 사람에 하나). '했다'는 UserDrillLog 에 남긴다.
 */

type Result = { ok: true } | { error: string };

const PROGRAM_PATH = '/training';

/** 프로그램 시작 — 강조 요소 하나(없으면 여섯을 고르게). 이미 있으면 강조만 바꾼다(진행은 지킨다) */
export async function startMechanicsProgram(focus: string | null): Promise<Result> {
  const user = await requireUser();
  const value = focus && isElementName(focus) ? focus : null;
  await prisma.mechanicsProgram.upsert({
    where: { userId: user.id },
    create: { userId: user.id, focus: value, progress: freshProgress() },
    update: { focus: value },
  });
  revalidatePath(PROGRAM_PATH);
  return { ok: true };
}

/** 처음부터 — 프로그램을 지운다. 지난 '했다' 기록(UserDrillLog)은 남는다 */
export async function resetMechanicsProgram(): Promise<Result> {
  const user = await requireUser();
  await prisma.mechanicsProgram.deleteMany({ where: { userId: user.id } });
  revalidatePath(PROGRAM_PATH);
  return { ok: true };
}

/**
 * 드릴 하나를 마치고 느낌을 남긴다 — 그 요소의 진행을 바꾸고, 오늘 그 드릴을 '했다'로 적는다.
 * 오른 단계가 있으면 돌려준다(따라 하기 끝 화면이 알린다).
 *
 * 화면을 다시 그리지 않는다(revalidatePath 없음) — 따라 하기 도중에 서버가 세션을 새로 짜면, 단계가 오른 요소의
 * 드릴이 바뀌어 지금 하던 차례가 엉킨다. 세션을 마칠 때(finishMechanicsSession) 한 번에 새로 그린다.
 */
export async function recordMechanicsDrill(input: {
  guideId: string;
  element: string;
  feel: string;
}): Promise<{ ok: true; leveled: DrillStage | null } | { error: string }> {
  const user = await requireUser();
  const { guideId, element, feel } = input;
  if (!isElementName(element) || !isFeel(feel)) return { error: '알 수 없는 값이에요.' };
  if (!(await visibleGuides()).some((g) => g.id === guideId)) {
    return { error: '드릴을 찾을 수 없어요.' };
  }
  const program = await prisma.mechanicsProgram.findUnique({ where: { userId: user.id } });
  if (!program) return { error: '프로그램을 먼저 시작해 주세요.' };

  const { progress, leveled } = applyFeel(readProgress(program.progress), element, feel);
  const date = dbDate(toDateKey(new Date()));
  await prisma.$transaction([
    prisma.mechanicsProgram.update({
      where: { userId: user.id },
      data: { progress: progress as unknown as Prisma.InputJsonValue },
    }),
    prisma.userDrillLog.upsert({
      where: { userId_guideId_date: { userId: user.id, guideId, date } },
      create: { userId: user.id, guideId, date, done: true },
      update: { done: true },
    }),
  ]);
  return { ok: true, leveled };
}

/** 세션을 마쳤다 — 다음 세션은 다른 요소로 짠다(sessionElements) */
export async function finishMechanicsSession(): Promise<Result> {
  const user = await requireUser();
  const program = await prisma.mechanicsProgram.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!program) return { error: '프로그램을 먼저 시작해 주세요.' };
  await prisma.mechanicsProgram.update({
    where: { userId: user.id },
    data: { sessionsDone: { increment: 1 }, lastSessionOn: dbDate(toDateKey(new Date())) },
  });
  revalidatePath(PROGRAM_PATH);
  return { ok: true };
}
