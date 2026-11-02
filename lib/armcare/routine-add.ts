import type { PrismaClient, Prisma } from '@prisma/client';
import { appendRoutineExercise, type AddRoutineResult } from '@/lib/armcare/routine-target';
import { readRoutineItems } from '@/lib/armcare/my-routines';

/** Same optimistic append on production Prisma and isolated test databases. */
export async function appendToOwnedRoutine(db: Pick<PrismaClient, 'userArmcareRoutine'>, userId: string, routineId: string, exerciseId: string, sets: unknown, now: () => Date): Promise<AddRoutineResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.userArmcareRoutine.findFirst({
      where: { id: routineId, userId }, select: { name: true, items: true, updatedAt: true },
    });
    if (!row) return { code: 'missing', error: '루틴을 찾을 수 없어요.' };
    const next = appendRoutineExercise(readRoutineItems(row.items), exerciseId, sets);
    const routine = { id: routineId, name: row.name, exerciseIds: next.items.map((it) => it.exerciseId) };
    if (next.kind === 'inside') return { ok: true, added: false, routine };
    if (next.kind === 'full') return { code: 'full', error: '한 루틴에는 운동을 15개까지 담을 수 있어요.' };
    const res = await db.userArmcareRoutine.updateMany({
      where: { id: routineId, userId, updatedAt: row.updatedAt },
      data: { items: next.items as unknown as Prisma.InputJsonValue, updatedAt: new Date(Math.max(now().getTime(), row.updatedAt.getTime() + 1)) },
    });
    if (res.count === 1) return { ok: true, added: true, routine };
  }
  return { code: 'conflict', error: '루틴 구성이 바뀌었어요. 다시 확인해 주세요.' };
}
