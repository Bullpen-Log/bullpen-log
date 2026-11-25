/** Cookie hydration and account changes share one queue; credentials stay in the OS jars. */
export function createSessionLifecycle(hydrate: () => Promise<unknown>) {
  let ready: Promise<unknown> | null = null;
  let epoch = 0;
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  let revision = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    revision++;
    for (const listener of listeners) listener();
  };
  return {
    epoch: () => epoch,
    revision: () => revision,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    pending: () => pending > 0,
    idle: () => tail,
    ready() {
      if (!ready) {
        const p = Promise.resolve().then(hydrate);
        ready = p;
        p.catch(() => { if (ready === p) ready = null; });
      }
      return ready;
    },
    retryHydration() { ready = null; },
    change<T>(run: (version: number) => Promise<T>): Promise<T> {
      // Invalidate immediately, even while a previous login/password request is finishing.
      const version = ++epoch;
      pending++;
      const result = tail.then(() => run(version)).finally(() => {
        pending--;
        notify();
      });
      tail = result.catch(() => undefined);
      notify();
      return result;
    },
  };
}
