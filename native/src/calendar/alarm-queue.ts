import { remindAt, type CalendarEventView } from '@/lib/calendar-event';
export type EventAlarmState =
  'ready' | 'off' | 'past' | 'denied' | 'failed' | 'readonly';
export function alarmIdsToRemove(
  armed: Iterable<string>,
  events: CalendarEventView[],
  complete: boolean
) {
  if (!complete) return [];
  const own = new Set(events.filter((e) => e.owner === undefined).map((e) => e.id));
  return [...armed].filter((id) => !own.has(id));
}

/** Per-id ordering prevents an old registration from overtaking a later edit/delete. */
export function createEventAlarmQueue(deps: {
  epoch: () => number;
  now: () => number;
  cancel: (id: string) => Promise<unknown>;
  schedule: (
    id: string,
    at: number,
    title: string,
    body: string
  ) => Promise<{ scheduled: boolean; denied?: boolean }>;
  armed: (id: string, on: boolean, epoch: number) => Promise<void>;
}) {
  const jobs = new Map<string, Promise<EventAlarmState>>();
  const run = (event: CalendarEventView): Promise<EventAlarmState> => {
    const epoch = deps.epoch();
    const job = (jobs.get(event.id) ?? Promise.resolve()).then(
      async (): Promise<EventAlarmState> => {
        if (epoch !== deps.epoch()) return 'failed';
        if (event.owner !== undefined) return 'readonly';
        const at = remindAt(event);
        try {
          if (at == null || at <= deps.now()) {
            await deps.cancel(event.id);
            await deps.armed(event.id, false, epoch);
            return at == null ? 'off' : 'past';
          }
          const result = await deps.schedule(
            event.id,
            at,
            event.title,
            [event.time, event.memo?.split('\n')[0]].filter(Boolean).join(' · ')
          );
          if (epoch !== deps.epoch()) {
            await deps.cancel(event.id);
            return 'failed';
          }
          await deps.armed(event.id, result.scheduled, epoch);
          return result.scheduled
            ? 'ready'
            : result.denied
              ? 'denied'
              : at <= deps.now() + 1000
                ? 'past'
                : 'failed';
        } catch {
          return 'failed';
        }
      }
    );
    jobs.set(event.id, job);
    void job.then(() => {
      if (jobs.get(event.id) === job) jobs.delete(event.id);
    });
    return job;
  };
  return {
    run,
    cancel: (id: string) =>
      run({ id, date: '', title: '', time: null, memo: null, remindMin: null }),
  };
}
