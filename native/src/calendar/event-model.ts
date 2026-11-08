import {
  cleanEvent,
  defaultRemind,
  remindAt,
  type CalendarEventInput,
  type CalendarEventView,
} from '@/lib/calendar-event';
import type { CalendarEventSnapshot } from '@/lib/calendar-edit';
export type EventDraft = {
  title: string;
  date: string;
  allDay: boolean;
  time: string;
  lastTime: string;
  memo: string;
  remind: number | null | 'auto';
};
export function draftOf(event: CalendarEventView | null, date: string): EventDraft {
  return {
    title: event?.title ?? '',
    date: event?.date ?? date,
    allDay: !event?.time,
    time: event?.time ?? '',
    lastTime: event?.time ?? '',
    memo: event?.memo ?? '',
    remind: event ? event.remindMin : 'auto',
  };
}
export const eventInput = (d: EventDraft): CalendarEventInput => ({
  date: d.date,
  title: d.title.trim(),
  time: d.allDay ? null : d.time,
  memo: d.memo.trim() || null,
  remindMin:
    d.remind === 'auto' ? defaultRemind(d.allDay ? null : d.time || null) : d.remind,
});
export const draftChanged = (d: EventDraft, before: EventDraft) =>
  JSON.stringify(eventInput(d)) !== JSON.stringify(eventInput(before));
export function validDraft(d: EventDraft, today: string) {
  return (
    (d.allDay || /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)) &&
    cleanEvent(eventInput(d), today).ok
  );
}
export function toggleAllDay(d: EventDraft, allDay: boolean): EventDraft {
  return allDay
    ? { ...d, allDay, lastTime: d.time || d.lastTime, time: '' }
    : { ...d, allDay, time: d.lastTime };
}
export const snapshotDraft = (r: CalendarEventSnapshot) => draftOf(r, r.date);
export const alarmForDraft = (d: EventDraft) =>
  remindAt({
    ...eventInput(d),
    time: d.allDay ? null : d.time,
    remindMin: eventInput(d).remindMin ?? null,
  });
