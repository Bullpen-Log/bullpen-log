import type { CalendarEvent, PrismaClient } from '@prisma/client';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import {
  eventCommand,
  eventMatches,
  isEventId,
  type CalendarEventSnapshot,
  type EventVerification,
  type EventWriteResult,
} from '@/lib/calendar-edit';

export const calendarSnapshot = (row: CalendarEvent): CalendarEventSnapshot => ({
  id: row.id,
  date: keyOfDbDate(row.date),
  title: row.title,
  time: row.time,
  memo: row.memo,
  remindMin: row.remindMin,
  version: row.updatedAt.toISOString(),
});
const conflict = {
  ok: false as const,
  conflict: true,
  error: '다른 곳에서 일정이 바뀌었어요. 최신 내용을 확인해주세요.',
};

export async function readCalendarEvent(
  db: PrismaClient,
  user: { id: string; role: string },
  id: unknown
) {
  if (!isEventId(id)) return { ok: false as const, error: '일정을 찾지 못했어요.' };
  const row = await db.calendarEvent.findFirst({
    where: {
      id,
      ...(user.role === 'ADMIN' ? { user: { role: 'ADMIN' } } : { userId: user.id }),
    },
    include: { user: { select: { nickname: true } } },
  });
  return {
    ok: true as const,
    event: row
      ? {
          ...calendarSnapshot(row),
          ...(row.userId === user.id
            ? {}
            : { owner: row.user.nickname || '다른 관리자' }),
        }
      : null,
  };
}

export async function writeCalendarEvent(
  db: PrismaClient,
  userId: string,
  raw: unknown,
  today: string,
  now: Date
): Promise<EventWriteResult> {
  const parsed = eventCommand(raw, today);
  if (!parsed.ok) return parsed;
  const command = parsed.command;
  if (command.op === 'create') {
    const data = {
      ...command.input,
      date: dbDate(command.input.date),
      title: command.input.title.trim(),
      time: command.input.time || null,
      memo: command.input.memo?.trim() || null,
      remindMin: command.input.remindMin ?? null,
    };
    // ON CONFLICT DO NOTHING is safe even when two deliveries arrive together.
    await db.calendarEvent.createMany({
      data: { ...data, id: command.id, userId },
      skipDuplicates: true,
    });
    const own = await db.calendarEvent.findFirst({ where: { id: command.id, userId } });
    if (!own || !eventMatches(calendarSnapshot(own), command.input)) return conflict;
    return {
      ok: true,
      event: calendarSnapshot(own),
      id: own.id,
      date: keyOfDbDate(own.date),
    };
  }
  return db.$transaction(async (tx) => {
    const old = await tx.calendarEvent.findFirst({ where: { id: command.id, userId } });
    if (!old)
      return command.op === 'delete'
        ? { ok: true, event: null, id: command.id, date: null }
        : {
            ok: false,
            conflict: true,
            error: '이 일정은 삭제되었어요. 작성한 내용은 그대로 있어요.',
          };
    const previous = calendarSnapshot(old);
    if (command.op === 'update' && eventMatches(previous, command.input))
      return { ok: true, event: previous, id: old.id, date: previous.date };
    if (previous.version !== command.version) return conflict;
    if (command.op === 'delete') {
      const removed = await tx.calendarEvent.deleteMany({
        where: { id: old.id, userId, updatedAt: old.updatedAt },
      });
      return removed.count === 1
        ? { ok: true, event: null, id: old.id, date: previous.date }
        : conflict;
    }
    const updatedAt = new Date(Math.max(now.getTime(), old.updatedAt.getTime() + 1));
    const result = await tx.calendarEvent.updateMany({
      where: { id: old.id, userId, updatedAt: old.updatedAt },
      data: { ...command.input, date: dbDate(command.input.date), updatedAt },
    });
    if (result.count !== 1) return conflict;
    const saved = await tx.calendarEvent.findUnique({ where: { id: old.id } });
    return saved
      ? {
          ok: true,
          event: calendarSnapshot(saved),
          id: saved.id,
          date: keyOfDbDate(saved.date),
        }
      : conflict;
  });
}

/** Reads only: an absent/unchanged record is never an automatic instruction to resend a mutation. */
export async function verifyCalendarEvent(
  db: PrismaClient,
  userId: string,
  raw: unknown,
  today: string
): Promise<EventVerification> {
  const parsed = eventCommand(raw, today, true);
  if (!parsed.ok) return parsed;
  const command = parsed.command;
  const row = await db.calendarEvent.findFirst({ where: { id: command.id, userId } });
  const event = row ? calendarSnapshot(row) : null;
  if (command.op === 'delete')
    return {
      ok: true,
      state: !event
        ? 'applied'
        : event.version === command.version
          ? 'not-applied'
          : 'conflict',
      event,
    };
  if (event && eventMatches(event, command.input))
    return { ok: true, state: 'applied', event };
  if (command.op === 'create')
    return { ok: true, state: event ? 'conflict' : 'not-applied', event };
  return {
    ok: true,
    state: !event || event.version !== command.version ? 'conflict' : 'not-applied',
    event,
  };
}
