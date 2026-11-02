import type { PrismaClient } from '@prisma/client';
import { recordEditable } from '@/lib/workout/record-model';
export type RecordCheckChange = { exerciseId: string; before: boolean; done: boolean };
export async function saveRecordChecks(
  db: PrismaClient,
  userId: string,
  date: string,
  changes: RecordCheckChange[],
  allowedIds: ReadonlySet<string>,
  today: string
): Promise<{ ok: true } | { error: string }> {
  if (
    !recordEditable(date, today) ||
    !Array.isArray(changes) ||
    !changes.length ||
    changes.length > 50 ||
    changes.some(
      (c) =>
        !c ||
        !allowedIds.has(c.exerciseId) ||
        typeof c.before !== 'boolean' ||
        typeof c.done !== 'boolean'
    ) ||
    new Set(changes.map((c) => c.exerciseId)).size !== changes.length
  )
    return { error: '기록을 확인한 뒤 다시 시도해 주세요.' };
  const at = new Date(`${date}T00:00:00Z`);
  return db.$transaction(
    async (tx) => {
      const [sets, session, logs] = await Promise.all([
        tx.userExerciseSet.count({
          where: {
            userId,
            date: at,
            exerciseId: { in: changes.map((c) => c.exerciseId) },
          },
        }),
        tx.trainingSession.findUnique({
          where: { userId_date: { userId, date: at } },
          select: { status: true },
        }),
        tx.userExerciseLog.findMany({
          where: {
            userId,
            date: at,
            exerciseId: { in: changes.map((c) => c.exerciseId) },
          },
          select: { exerciseId: true, completed: true },
        }),
      ]);
      if (sets || session?.status === 'ACTIVE')
        return { error: '세트가 있거나 진행 중인 운동은 여기서 바꿀 수 없어요.' };
      if (
        changes.some(
          (c) =>
            (logs.find((l) => l.exerciseId === c.exerciseId)?.completed ?? false) !==
            c.before
        )
      )
        return { error: '다른 곳에서 기록이 바뀌었어요. 다시 불러와 주세요.' };
      for (const c of changes) {
        const key = { userId, exerciseId: c.exerciseId, date: at };
        if (c.done)
          await tx.userExerciseLog.upsert({
            where: { userId_exerciseId_date: key },
            create: { ...key, completed: true },
            update: { completed: true },
          });
        else await tx.userExerciseLog.deleteMany({ where: key });
      }
      return { ok: true as const };
    },
    { isolationLevel: 'Serializable' }
  );
}
