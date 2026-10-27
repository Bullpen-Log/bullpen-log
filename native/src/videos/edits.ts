/**
 * 내 영상에서 고친 값(메모 · 즐겨찾기)을 다루는 규칙 — React Native 없이 돌아 셀프테스트가 바로 부른다(scripts/my-videos-selftest.mts).
 *
 * 1) 덮어쓰기 표: 고친 값을 들고 있다가, 그 고침이 끝난 **뒤에** 떠난 목록 물음의 답이 오면 놓는다. 그 전에 떠난 물음의 답(옛 값)은
 *    고친 값으로 덮어 보인다 — 새로고침이 방금 누른 별을 되돌리지 않게.
 * 2) 즐겨찾기 줄: 한 영상에 한 번에 하나만 보낸다. 보내는 사이 또 누르면 끝난 뒤 마지막 뜻을 한 번 더(서버 도착 차례가 뒤바뀌지 않게).
 *    실패하면 서버가 마지막으로 받은 값으로 되돌린다.
 */
export type Override = { note?: string | null; revisit?: boolean; done: number | null };

export function applyOverrides<T extends { path: string; note: string | null; revisit: boolean }>(items: T[], ov: ReadonlyMap<string, Override>): T[] {
  if (!ov.size) return items;
  return items.map((v) => {
    const o = ov.get(v.path);
    return o ? { ...v, ...(o.note !== undefined ? { note: o.note } : {}), ...(o.revisit !== undefined ? { revisit: o.revisit } : {}) } : v;
  });
}

/** startedAt 에 떠난 목록 답이 왔을 때 — 그 전에 끝난 고침은 서버 답에 이미 들었으니 놓는다 */
export function pruneOverrides(ov: Map<string, Override>, startedAt: number) {
  for (const [p, o] of ov) if (o.done !== null && o.done < startedAt) ov.delete(p);
}

type Send = (path: string, want: boolean) => Promise<{ ok: true; revisit: boolean } | { ok: false; error: string }>;
export function createFavQueue(opts: {
  send: Send;
  /** 보이는 값 — done = 서버가 확인함(또는 되돌림) */
  show: (path: string, value: boolean, done: boolean) => void;
  fail: (path: string, error: string) => void;
  now?: () => number;
}) {
  const want = new Map<string, boolean>();
  const server = new Map<string, boolean>();
  const busy = new Set<string>();
  let gen = 0;
  async function flush(path: string) {
    if (busy.has(path)) return;
    busy.add(path);
    const g = gen;
    try {
      for (;;) {
        const w = want.get(path);
        if (w === undefined) break;
        const r = await opts.send(path, w);
        if (g !== gen) return; // 그새 로그아웃
        if (!r.ok) {
          want.delete(path);
          opts.show(path, server.get(path) ?? false, true);
          opts.fail(path, r.error);
          break;
        }
        server.set(path, r.revisit);
        if (want.get(path) === w) {
          want.delete(path);
          opts.show(path, r.revisit, true);
          break;
        }
      }
    } finally {
      busy.delete(path);
    }
  }
  return {
    /** current = 지금 보이는 값. 바뀐 값을 돌려준다 */
    toggle(path: string, current: boolean): boolean {
      if (!want.has(path) && !busy.has(path)) server.set(path, current);
      const next = !current;
      want.set(path, next);
      opts.show(path, next, false);
      void flush(path);
      return next;
    },
    reset() {
      gen++;
      want.clear();
      server.clear();
      busy.clear();
    },
  };
}
