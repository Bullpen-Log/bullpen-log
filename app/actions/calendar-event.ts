'use server';

import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import {
  cleanEvent,
  type CalendarEventInput,
  type CalendarEventView,
} from '@/lib/calendar-event';

/**
 * 홈 캘린더 일정 — 더하기 · 고치기 · 지우기. 화면이 바로 부르고 돌려받은 줄로 제 목록을 고친다
 * (홈 전체를 다시 그리지 않게).
 */

export type EventResult =
  { ok: true; event: CalendarEventView } | { ok: false; error: string };

const NEED_LOGIN = { ok: false as const, error: '로그인이 필요해요.' };
const NOT_FOUND = {
  ok: false as const,
  error: '그 일정을 찾지 못했어요. 새로고침해 주세요.',
};

function view(row: {
  id: string;
  date: Date;
  title: string;
  time: string | null;
  memo: string | null;
}): CalendarEventView {
  return {
    id: row.id,
    date: keyOfDbDate(row.date),
    title: row.title,
    time: row.time,
    memo: row.memo,
  };
}

export async function saveCalendarEvent(
  id: string | null,
  input: CalendarEventInput
): Promise<EventResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  const clean = cleanEvent(input, toDateKey(new Date()));
  if (!clean.ok) return clean;
  const data = { ...clean.value, date: dbDate(clean.value.date) };

  if (id === null) {
    const row = await prisma.calendarEvent.create({
      data: { ...data, userId: user.id },
    });
    return { ok: true, event: view(row) };
  }
  if (typeof id !== 'string') return NOT_FOUND;
  /* 남의 일정은 못 고친다 — userId 까지 걸어 찾는다 */
  const { count } = await prisma.calendarEvent.updateMany({
    where: { id, userId: user.id },
    data,
  });
  if (count === 0) return NOT_FOUND;
  const row = await prisma.calendarEvent.findUniqueOrThrow({ where: { id } });
  return { ok: true, event: view(row) };
}

export async function deleteCalendarEvent(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (typeof id !== 'string') return NOT_FOUND;
  await prisma.calendarEvent.deleteMany({ where: { id, userId: user.id } });
  return { ok: true };
}
