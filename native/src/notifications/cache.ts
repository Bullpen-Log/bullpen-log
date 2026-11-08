import {
  inboxRead,
  inboxReadIncludes,
  type InboxCursor,
  type InboxItem,
  type InboxPage,
  type InboxRead,
  type InboxResult,
  type InboxVerification,
} from '@/lib/notification-inbox';

export type InboxState = {
  items: InboxItem[] | null;
  unread: number | null;
  before: string | null;
  next: InboxCursor | null;
  loading: boolean;
  refreshing: boolean;
  more: boolean;
  error: string | null;
  moreError: string | null;
  ready: boolean;
  writing: boolean;
  checking: boolean;
  pending: InboxRead | null;
  retry: InboxRead | null;
  readError: string | null;
  newer: boolean;
};
const EMPTY: InboxState = {
  items: null,
  unread: null,
  before: null,
  next: null,
  loading: false,
  refreshing: false,
  more: false,
  error: null,
  moreError: null,
  ready: false,
  writing: false,
  checking: false,
  pending: null,
  retry: null,
  readError: null,
  newer: false,
};
export function createInboxCache(deps: {
  epoch: () => number;
  owner: () => Promise<string>;
  read: (key: string) => Promise<{ ok: true; value: unknown } | { ok: false }>;
  store: (key: string, value: unknown) => Promise<boolean>;
  page: (
    request: { before: string; cursor: InboxCursor } | null
  ) => Promise<({ ok: true } & InboxPage) | { ok: false; error: string }>;
  count: () => Promise<number>;
  write: (command: InboxRead) => Promise<InboxResult>;
  verify: (command: InboxRead) => Promise<InboxVerification>;
  rejected: (error: unknown) => boolean;
}) {
  let state = EMPTY,
    epoch = deps.epoch(),
    generation = 0,
    version = 0,
    pageSeq = 0,
    countSeq = 0;
  let key: string | null = null,
    init: Promise<boolean> | null = null,
    loading: Promise<void> | null = null,
    counting: Promise<void> | null = null;
  let lock = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((f) => f());
  const set = (p: Partial<InboxState>) => {
    state = { ...state, ...p };
    emit();
  };
  const reset = () => {
    generation++;
    version++;
    pageSeq++;
    countSeq++;
    epoch = deps.epoch();
    state = EMPTY;
    key = null;
    init = null;
    loading = null;
    counting = null;
    lock = false;
    emit();
  };
  const sync = () => {
    if (epoch !== deps.epoch()) reset();
  };
  const ticket = () => ({ epoch, generation });
  const valid = (t: ReturnType<typeof ticket>) =>
    t.epoch === deps.epoch() && t.generation === generation;
  const ensure = (): Promise<boolean> => {
    sync();
    if (state.ready) return Promise.resolve(true);
    if (init) return init;
    const t = ticket();
    const job = (async () => {
      try {
        const owner = await deps.owner();
        if (!valid(t)) return false;
        const target = `sinker:notification-read:${owner}`;
        const stored = await deps.read(target);
        if (!valid(t)) return false;
        if (!stored.ok) {
          set({ readError: '읽음 확인 정보를 불러오지 못했어요.' });
          return false;
        }
        const pending = stored.value == null ? null : inboxRead(stored.value);
        if (stored.value != null && !pending) {
          set({ readError: '읽음 확인 정보를 확인할 수 없어요.' });
          return false;
        }
        key = target;
        set({
          ready: true,
          pending,
          readError: pending ? '읽음 처리 여부를 확인하지 못했어요.' : null,
        });
        return true;
      } catch {
        if (valid(t))
          set({ readError: '계정을 확인하지 못했어요. 다시 확인해주세요.' });
        return false;
      }
    })();
    init = job;
    void job.finally(() => {
      if (init === job) init = null;
    });
    return job;
  };
  const load = (force = false): Promise<void> => {
    sync();
    if (loading && !force) return loading;
    const t = ticket(),
      seq = ++pageSeq;
    set({
      loading: state.items == null,
      refreshing: state.items != null,
      more: false,
      error: null,
      moreError: null,
    });
    const job = (async () => {
      await ensure();
      if (!valid(t) || seq !== pageSeq) return;
      const from = version;
      try {
        const r = await deps.page(null);
        if (!valid(t) || seq !== pageSeq || from !== version) return;
        if (!r.ok) throw Error(r.error);
        set({
          items: r.items,
          unread: r.unread,
          before: r.before,
          next: r.next,
          newer: r.items.length === 0 && r.unread > 0,
        });
        /* 신호가 돌아와 목록을 받았으면 남은 읽음 확인도 저절로 */
        if (state.pending && !lock) void verify();
      } catch (e) {
        if (valid(t) && seq === pageSeq)
          set({
            error:
              e instanceof Error && e.message ? e.message : '알림을 불러오지 못했어요.',
          });
      } finally {
        if (valid(t) && seq === pageSeq) set({ loading: false, refreshing: false });
      }
    })();
    loading = job;
    void job.finally(() => {
      if (loading === job) loading = null;
    });
    return job;
  };
  const more = async () => {
    sync();
    if (!state.before || !state.next || state.loading || state.refreshing || state.more)
      return;
    const t = ticket(),
      seq = ++pageSeq,
      from = version,
      request = { before: state.before, cursor: state.next };
    set({ more: true, moreError: null });
    try {
      const r = await deps.page(request);
      if (!valid(t) || seq !== pageSeq || from !== version) return;
      if (!r.ok) throw Error(r.error);
      const items = new Map((state.items ?? []).map((n) => [n.id, n]));
      for (const n of r.items) items.set(n.id, n);
      set({ items: [...items.values()], next: r.next, unread: r.unread });
    } catch {
      if (valid(t) && seq === pageSeq)
        set({ moreError: '이전 알림을 불러오지 못했어요.' });
    } finally {
      if (valid(t) && seq === pageSeq) set({ more: false });
    }
  };
  const count = (): Promise<void> => {
    sync();
    if (counting) return counting;
    const t = ticket(),
      seq = ++countSeq,
      from = version;
    const job = deps
      .count()
      .then((unread) => {
        if (valid(t) && seq === countSeq && from === version) set({ unread });
      })
      .catch(() => undefined);
    counting = job;
    void job.finally(() => {
      if (counting === job) counting = null;
    });
    return job;
  };
  const clear = async (t: ReturnType<typeof ticket>) => {
    if (!key || !valid(t)) return false;
    const ok = await deps.store(key, null);
    if (!valid(t)) return false;
    if (!ok) {
      set({ readError: '읽음 확인을 마치지 못했어요. 다시 확인해주세요.' });
      return false;
    }
    set({ pending: null });
    return true;
  };
  const apply = (command: InboxRead, unread: number) =>
    set({
      items:
        state.items?.map((n) =>
          inboxReadIncludes(command, n) ? { ...n, read: true } : n
        ) ?? null,
      unread,
      newer: command.scope === 'all' && unread > 0,
      retry: null,
      readError: null,
    });
  const mark = async (raw: InboxRead) => {
    sync();
    if (lock) return;
    /* 앞서 답을 못 받은 읽음이 있으면 먼저 확인한다 — 안 그러면 그 뒤 어떤 알림도 읽히지 않는다 */
    if (state.pending) {
      const was = JSON.stringify(state.pending);
      await verify();
      if (lock || state.pending) return;
      /* 같은 읽음이면 확인으로 끝 — 안 됐으면 '다시 시도'(retry)로 따로 보낸다 */
      if (JSON.stringify(inboxRead(raw)) === was) return;
    }
    const command = inboxRead(raw);
    if (!command) return;
    lock = true;
    const t = ticket();
    version++;
    set({ writing: true, readError: null, retry: null });
    try {
      if (!(await ensure()) || !valid(t) || !key || state.pending) return;
      if (!(await deps.store(key, command))) {
        if (valid(t))
          set({ retry: command, readError: '읽음 처리를 준비하지 못했어요.' });
        return;
      }
      if (!valid(t)) return;
      set({ pending: command });
      const r = await deps.write(command);
      if (!valid(t)) return;
      version++;
      if (!r.ok) {
        if (await clear(t)) set({ retry: command, readError: r.error });
      } else if (await clear(t)) apply(command, r.unread);
    } catch (e) {
      if (!valid(t)) return;
      version++;
      if (deps.rejected(e)) {
        if (await clear(t))
          set({
            retry: command,
            readError: e instanceof Error ? e.message : '읽음으로 바꾸지 못했어요.',
          });
      } else
        set({ pending: command, readError: '읽음 처리 여부를 확인하지 못했어요.' });
    } finally {
      if (valid(t)) {
        lock = false;
        set({ writing: false });
        if (state.items == null) void load(true);
      }
    }
  };
  const verify = async () => {
    sync();
    if (lock || !state.pending) return;
    lock = true;
    const t = ticket(),
      command = state.pending;
    version++;
    set({ checking: true, readError: null });
    try {
      const r = await deps.verify(command);
      if (!valid(t)) return;
      version++;
      if (!r.ok) {
        set({ readError: r.error });
        return;
      }
      if (r.state === 'applied') {
        if (await clear(t)) apply(command, r.unread);
      } else if (await clear(t))
        set({
          retry: command,
          unread: r.unread,
          readError: '아직 읽음으로 바뀌지 않았어요.',
        });
    } catch {
      if (valid(t)) {
        version++;
        set({ readError: '아직 결과를 확인하지 못했어요. 잠시 뒤 다시 확인해주세요.' });
      }
    } finally {
      if (valid(t)) {
        lock = false;
        set({ checking: false });
        if (state.items == null) void load(true);
      }
    }
  };
  return {
    snapshot: () => (epoch === deps.epoch() ? state : EMPTY),
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    reset,
    ensure,
    load,
    more,
    count,
    mark,
    verify,
    retry: () =>
      state.pending
        ? verify()
        : state.retry
          ? mark(state.retry)
          : ensure().then(() => undefined),
  };
}
