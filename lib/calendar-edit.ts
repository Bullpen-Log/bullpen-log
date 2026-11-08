import {
  cleanEvent,
  type CalendarEventInput,
  type CalendarEventView,
} from '@/lib/calendar-event';

export type CalendarEventSnapshot = CalendarEventView & { version: string };
export type EventCommand =
  | { op: 'create'; id: string; input: CalendarEventInput }
  | { op: 'update'; id: string; version: string; input: CalendarEventInput }
  | { op: 'delete'; id: string; version: string };
export type EventWriteResult =
  | { ok: true; event: CalendarEventSnapshot | null; id: string; date: string | null }
  | { ok: false; error: string; conflict?: boolean };
export type EventVerification =
  | {
      ok: true;
      state: 'applied' | 'not-applied' | 'conflict';
      event: CalendarEventSnapshot | null;
    }
  | { ok: false; error: string };
export const isEventId = (id: unknown): id is string =>
  typeof id === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const isVersion = (v: unknown): v is string =>
  typeof v === 'string' &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;

/** Verification validates the persisted command without applying a new moving +/-5-year window. */
export function eventCommand(
  raw: unknown,
  today: string,
  reading = false
): { ok: true; command: EventCommand } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object')
    return { ok: false, error: '일정 정보를 확인해주세요.' };
  const r = raw as Record<string, unknown>;
  if (
    !isEventId(r.id) ||
    !['create', 'update', 'delete'].includes(String(r.op)) ||
    (r.op !== 'create' && !isVersion(r.version))
  )
    return { ok: false, error: '일정 정보를 다시 확인해주세요.' };
  if (r.op === 'delete')
    return {
      ok: true,
      command: { op: 'delete', id: r.id, version: r.version as string },
    };
  if (!r.input || typeof r.input !== 'object')
    return { ok: false, error: '일정 내용을 확인해주세요.' };
  const input = r.input as CalendarEventInput;
  const clean = cleanEvent(
    input,
    reading && typeof input.date === 'string' ? input.date : today
  );
  if (!clean.ok) return clean;
  return {
    ok: true,
    command:
      r.op === 'create'
        ? { op: 'create', id: r.id, input: clean.value }
        : { op: 'update', id: r.id, version: r.version as string, input: clean.value },
  };
}

export function eventMatches(
  event: CalendarEventView,
  input: CalendarEventInput
): boolean {
  return (
    event.date === input.date &&
    event.title === input.title.trim() &&
    event.time === (input.time || null) &&
    event.memo === (input.memo?.trim() || null) &&
    event.remindMin === (input.remindMin ?? null)
  );
}

/** A stable record id is generated once before a create is sent, including explicit retries after verification. */
export function newEventId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
