import 'server-only';
import { prisma } from '@/lib/prisma';
import { readRoutineItems, type MyRoutine } from '@/lib/armcare/my-routines';

/**
 * 내 암케어 루틴을 읽는다 — 먼저 만든 것이 위로.
 *
 * 만든 차례로 두는 것은, 고칠 때마다 순서가 바뀌면 늘 하던 루틴을 매번 다시 찾아야
 * 하기 때문이다.
 */
export async function loadMyRoutines(userId: string): Promise<MyRoutine[]> {
  const rows = await prisma.userArmcareRoutine.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, items: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    items: readRoutineItems(r.items),
  }));
}

/** 하나 — 남의 것이면 없는 것으로 본다 */
export async function loadMyRoutine(
  userId: string,
  id: string
): Promise<MyRoutine | null> {
  const row = await prisma.userArmcareRoutine.findFirst({
    where: { id, userId },
    select: { id: true, name: true, items: true },
  });
  return row
    ? { id: row.id, name: row.name, items: readRoutineItems(row.items) }
    : null;
}
