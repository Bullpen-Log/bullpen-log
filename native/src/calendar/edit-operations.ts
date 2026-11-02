import {
  eventCommand,
  type CalendarEventSnapshot,
  type EventCommand,
  type EventVerification,
  type EventWriteResult,
} from '@/lib/calendar-edit';

export type PendingEvent = {
  command: EventCommand;
  base: CalendarEventSnapshot | null;
};
export type EditOperationState = {
  ready: boolean;
  busy: boolean;
  pending: PendingEvent | null;
  error: string | null;
  conflict: boolean;
  notApplied: boolean;
};
const INITIAL: EditOperationState = {
  ready: false,
  busy: false,
  pending: null,
  error: null,
  conflict: false,
  notApplied: false,
};

export function createEventOperations(deps: {
  epoch: () => number;
  read: (key: string) => Promise<{ ok: true; value: unknown } | { ok: false }>;
  store: (key: string, value: unknown) => Promise<boolean>;
  write: (command: EventCommand) => Promise<EventWriteResult>;
  verify: (command: EventCommand) => Promise<EventVerification>;
  completed: (
    result: Extract<EventWriteResult, { ok: true }>,
    pending: PendingEvent
  ) => void;
  rejected: (error: unknown) => boolean;
}) {
  let state = INITIAL,
    key: string | null = null,
    epoch = deps.epoch(),
    alive = true,
    lock = false,
    generation = 0;
  let onComplete = deps.completed;
  const listeners = new Set<() => void>();
  const current = () => alive && epoch === deps.epoch();
  const set = (patch: Partial<EditOperationState>) => {
    if (current()) {
      state = { ...state, ...patch };
      listeners.forEach((f) => f());
    }
  };
  const readPending = (value: unknown): PendingEvent | null | false => {
    if (value == null) return null;
    if (typeof value !== 'object' || !('command' in value)) return false;
    const parsed = eventCommand(value.command, '', true);
    if (!parsed.ok) return false;
    const base =
      'base' in value && value.base && typeof value.base === 'object'
        ? (value.base as CalendarEventSnapshot)
        : null;
    if (
      parsed.command.op !== 'create' &&
      (!base ||
        base.id !== parsed.command.id ||
        base.version !== parsed.command.version)
    )
      return false;
    return { command: parsed.command, base };
  };
  const clear = async (mine: number) => {
    if (!key || !current() || mine !== generation) return false;
    const saved = await deps.store(key, null);
    if (!current() || mine !== generation) return false;
    if (!saved) {
      set({ error: '이 기기의 확인 정보를 정리하지 못했어요. 다시 확인해주세요.' });
      return false;
    }
    set({ pending: null, notApplied: false });
    return true;
  };
  const open = async (owner: string) => {
    const mine = ++generation;
    epoch = deps.epoch();
    alive = true;
    key = `sinker:calendar-pending:${owner}`;
    lock = false;
    state = { ...INITIAL };
    set({});
    const stored = await deps.read(key);
    if (!current() || mine !== generation) return;
    if (!stored.ok)
      return set({
        error: '이 기기의 저장 확인 정보를 읽지 못했어요. 다시 열어주세요.',
      });
    const pending = readPending(stored.value);
    if (pending === false)
      return set({
        error: '저장 확인 정보를 확인할 수 없어요. 고객센터에 문의해주세요.',
      });
    set({
      ready: true,
      pending,
      error: pending
        ? pending.command.op === 'delete'
          ? '삭제 결과 확인이 필요해요.'
          : '저장 결과 확인이 필요해요.'
        : null,
    });
  };
  const send = async (pending: PendingEvent, retry = false) => {
    if (!current() || !state.ready || lock || !key || (state.pending && !retry)) return;
    const parsed = eventCommand(pending.command, '', true);
    if (
      !parsed.ok ||
      (retry &&
        JSON.stringify(state.pending?.command) !== JSON.stringify(parsed.command))
    )
      return;
    const mine = generation;
    const active = () => current() && mine === generation;
    pending = { ...pending, command: parsed.command };
    lock = true;
    set({ busy: true, error: null, conflict: false, notApplied: false });
    try {
      if (!(await deps.store(key, pending))) {
        if (!active()) return;
        set({ error: '이 기기에 저장 준비를 마치지 못했어요.' });
        return;
      }
      if (!active()) return;
      set({ pending });
      const result = await deps.write(parsed.command);
      if (!active()) return;
      if (!result.ok) {
        if (await clear(mine))
          set({ error: result.error, conflict: !!result.conflict });
      } else if (await clear(mine)) {
        onComplete(result, pending);
      }
    } catch (error) {
      if (!active()) return;
      if (deps.rejected(error)) {
        if (await clear(mine))
          set({ error: error instanceof Error ? error.message : '접근할 수 없어요.' });
      } else
        set({
          pending,
          error:
            pending.command.op === 'delete'
              ? '삭제 여부를 확인하지 못했어요.'
              : '저장 여부를 확인하지 못했어요.',
        });
    } finally {
      if (active()) {
        lock = false;
        set({ busy: false });
      }
    }
  };
  const verify = async () => {
    if (!current() || lock || !state.pending) return;
    const pending = state.pending;
    const mine = generation;
    const active = () => current() && mine === generation;
    lock = true;
    set({ busy: true, error: null, notApplied: false });
    try {
      const result = await deps.verify(pending.command);
      if (!active()) return;
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      if (result.state === 'applied') {
        if (await clear(mine))
          onComplete(
            {
              ok: true,
              event: result.event,
              id: pending.command.id,
              date: result.event?.date ?? pending.base?.date ?? null,
            },
            pending
          );
      } else if (result.state === 'conflict') {
        if (await clear(mine))
          set({
            error: '다른 곳에서 일정이 바뀌었어요. 최신 내용을 확인해주세요.',
            conflict: true,
          });
      } else
        set({
          notApplied: true,
          error:
            '아직 변경이 반영되지 않았어요. 다시 확인하거나 같은 내용으로 다시 시도할 수 있어요.',
        });
    } catch (error) {
      if (active()) {
        deps.rejected(error);
        set({ error: '아직 결과를 확인하지 못했어요. 잠시 뒤 다시 확인해주세요.' });
      }
    } finally {
      if (active()) {
        lock = false;
        set({ busy: false });
      }
    }
  };
  return {
    snapshot: () => (current() ? state : INITIAL),
    subscribe(f: () => void) {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    setCompleted: (f: typeof deps.completed) => {
      onComplete = f;
    },
    open,
    send,
    verify,
    retry: () =>
      state.pending && state.notApplied ? send(state.pending, true) : Promise.resolve(),
    dismissError: () => set({ error: null, conflict: false }),
    dispose: () => {
      alive = false;
      generation++;
    },
  };
}
