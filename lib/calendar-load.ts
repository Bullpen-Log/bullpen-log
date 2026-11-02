import type { PrismaClient } from '@prisma/client';
import { sortEvents, type CalendarEventView } from '@/lib/calendar-event';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';

/** A bounded display read, deliberately independent of notification reconciliation. */
export async function readCalendarEvents(
  db: Pick<PrismaClient, 'calendarEvent'>,
  user: { id: string; role: string },
  from: string,
  to: string
): Promise<CalendarEventView[]> {
  const rows = await db.calendarEvent.findMany({
    where: {
      date: { gte: dbDate(from), lte: dbDate(to) },
      ...(user.role === 'ADMIN' ? { user: { role: 'ADMIN' } } : { userId: user.id }),
    },
    select: {
      id: true,
      date: true,
      title: true,
      time: true,
      memo: true,
      remindMin: true,
      userId: true,
      user: { select: { nickname: true } },
    },
  });
  return sortEvents(
    rows.map(({ userId, user: owner, ...e }) => ({
      ...e,
      date: keyOfDbDate(e.date),
      ...(userId === user.id ? {} : { owner: owner.nickname || '다른 관리자' }),
    }))
  );
}
