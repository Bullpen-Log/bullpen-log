import 'server-only';
import { prisma } from '@/lib/prisma';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { TOTAL_DAYS, shouldAdvance } from '@/lib/program/program';

/**
 * 이 판으로 프로그램 일차를 넘긴다 — 넘겼으면 true.
 *
 * [종료](finishWorkout) · 밤에 저절로 닫기(closeAbandoned) · 닫힌 판에 늦게 온 세트(logSet) 세 곳에서 부른다(U4).
 * 넘기는 쓰기는 'nextDay 가 그 판의 일차일 때만 +1'(updateMany 조건)이라, 세 곳이 다 불러도 · 다시 열고 다시 마쳐도
 * 한 번만 넘어간다(U2). 프로그램이 아닌 판은 아무것도 안 한다(회귀 시험 RG).
 */
export async function advanceProgramDay(sessionId: string): Promise<boolean> {
  const session = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, date: true, status: true, plan: true },
  });
  if (!session || session.status === 'ACTIVE') return false;
  const plan = readFrozenPlan(session.plan);
  const program = plan?.program ?? null;
  if (!plan || !program) return false;

  const row = await prisma.userTrainingProgram.findFirst({
    where: { userId: session.userId, status: 'active', programKey: program.key },
    select: { id: true, nextDay: true },
  });
  if (!row) return false;

  const slotted = plan.exercises.filter((e) => e.programSlot);
  const plannedSets = slotted.reduce((n, e) => n + (e.plannedSets ?? 0), 0);
  const loggedSets = await prisma.userExerciseSet.count({
    where: { sessionId: session.id, exerciseId: { in: slotted.map((e) => e.id) } },
  });
  if (!shouldAdvance({ program, nextDay: row.nextDay, plannedSets, loggedSets }))
    return false;

  const moved = await prisma.userTrainingProgram.updateMany({
    where: { id: row.id, status: 'active', nextDay: program.day },
    data: { nextDay: { increment: 1 }, lastDoneDate: session.date },
  });
  if (moved.count === 0) return false;

  /* 24일차까지 갔으면 끝 */
  if (program.day >= TOTAL_DAYS) {
    await prisma.userTrainingProgram.updateMany({
      where: { id: row.id, status: 'active', nextDay: { gt: TOTAL_DAYS } },
      data: { status: 'done', endedAt: new Date(), endReason: 'done' },
    });
  }
  return true;
}
