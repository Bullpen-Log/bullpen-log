'use server';

import { revalidatePath } from 'next/cache';
import { appNow } from '@/lib/clock';
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
  remindMin: number | null;
}): CalendarEventView {
  return {
    id: row.id,
    date: keyOfDbDate(row.date),
    title: row.title,
    time: row.time,
    memo: row.memo,
    remindMin: row.remindMin,
  };
}

export async function saveCalendarEvent(
  id: string | null,
  input: CalendarEventInput
): Promise<EventResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  const clean = cleanEvent(input, toDateKey(appNow()));
  if (!clean.ok) return clean;
  const data = { ...clean.value, date: dbDate(clean.value.date) };

  if (id === null) {
    const row = await prisma.calendarEvent.create({
      data: { ...data, userId: user.id },
    });
    refreshAfterEvent();
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
  refreshAfterEvent();
  return { ok: true, event: view(row) };
}

export async function deleteCalendarEvent(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (typeof id !== 'string') return NOT_FOUND;
  await prisma.calendarEvent.deleteMany({ where: { id, userId: user.id } });
  refreshAfterEvent();
  return { ok: true };
}

/**
 * 일정은 홈 달력만의 것이 아니다 — 트레이닝 엔진이 달력의 다음 등판을 읽어(facts.condition.outingCalendar) 오늘 일정 · 상태 띠가 바뀐다.
 * 그래서 탭 넷이 함께 새로 그려지게 한다(체크인 저장과 같은 길, 2026-10-16 통합 시험).
 */
function refreshAfterEvent() {
  revalidatePath('/', 'layout');
}
