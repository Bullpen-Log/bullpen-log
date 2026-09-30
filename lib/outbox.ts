/**
 * 아직 서버에 못 보낸 것을 폰에 맡겨 두는 곳 — 틀.
 *
 * 운동 세트(lib/workout/outbox.ts)와 따라하기의 암케어 체크(lib/armcare/check-outbox.ts)가
 * 같이 쓴다. 먼저 여기에 담고, 보내는 데 성공한 것만 지운다. 폰의 저장소(localStorage)에
 * 두므로 앱을 닫았다 열어도 남아 있고, 화면을 다시 열면 이어서 보낸다.
 *
 * ■ 폰 저장소를 못 쓰는 경우
 *
 * 사생활 보호 모드 같은 곳에서는 읽고 쓰기가 막힐 수 있다. 그때는 메모리에만
 * 두고 계속 돈다 — 화면을 닫기 전까지는 똑같이 보낸다.
 */

/** 담는 것은 모두 누른 순간(ISO)을 든다 — 보내는 차례와 오래된 것 버리기에 쓴다 */
type Stamped = { recordedAt: string };

/**
 * 이보다 오래 못 보낸 것은 버린다.
 *
 * 그쯤이면 서버가 받지 않고(끝난 판, 고칠 수 없는 날), 영영 남아 폰 저장소를
 * 차지할 이유가 없다. 운동 하나가 일주일을 넘기지는 않는다.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function createOutbox<T extends Stamped & K, K>({
  key,
  isItem,
  same,
}: {
  /** 폰 저장소의 이름 */
  key: string;
  /** 저장소에서 읽은 값이 제 모양인가 — 옛 모양이나 망가진 값은 버린다 */
  isItem: (v: unknown) => v is T;
  /** 같은 것인가 — 같은 것을 다시 담으면 새것으로 바꾼다 */
  same: (a: T, b: K) => boolean;
}) {
  const EMPTY: readonly T[] = Object.freeze([]);

  /*
   * 읽은 것을 들고 있는다. useSyncExternalStore 는 바뀌지 않았으면 같은 값을
   * 돌려받아야 다시 그리지 않는다 — 매번 새로 읽어 새 배열을 주면 끝없이 그린다.
   */
  let cache: readonly T[] | null = null;
  const listeners = new Set<() => void>();

  function load(): readonly T[] {
    if (cache) return cache;
    if (typeof window === 'undefined') return EMPTY;
    try {
      const raw = window.localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const cutoff = Date.now() - MAX_AGE_MS;
      cache = Array.isArray(parsed)
        ? parsed.filter(isItem).filter((p) => Date.parse(p.recordedAt) > cutoff)
        : [];
    } catch {
      cache = [];
    }
    return cache;
  }

  function store(next: readonly T[]) {
    /* 메모리는 먼저 바꾼다 — 폰 저장소가 막혀도 화면과 보내기는 돈다 */
    cache = next;
    try {
      if (next.length === 0) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* 사생활 보호 모드 등 — 메모리에만 남는다 */
    }
    for (const l of listeners) l();
  }

  function remove(p: K) {
    const before = load();
    const next = before.filter((x) => !same(x, p));
    if (next.length !== before.length) store(next);
  }

  /*
   * 한 번에 한 줄만 보낸다. 화면이 여러 까닭(새로 담김, 신호 복구, 15초 주기)으로
   * 동시에 불러도, 이미 보내는 중이면 그 줄이 새로 담긴 것까지 이어서 보낸다.
   */
  let draining = false;

  return {
    /** useSyncExternalStore 용 — 바뀌면 알린다. 다른 탭에서 바꾼 것도 따라간다. */
    subscribe(listener: () => void) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key !== key) return;
        cache = null;
        listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    snapshot: (): readonly T[] => load(),
    /** 서버에서 그릴 때는 폰 저장소가 없다 — 비어 있는 것으로 그린다 */
    serverSnapshot: (): readonly T[] => EMPTY,

    /** 담는다. 같은 것이 이미 있으면 새것으로 바꾼다. */
    add(p: T) {
      store([...load().filter((x) => !same(x, p)), p]);
    },

    /** 뺀다. 보내는 데 성공했거나, 보내기 전에 지웠을 때. */
    remove,

    /**
     * 고른 것(pick)을 누른 순서대로 하나씩 보낸다.
     *
     * - 보내서 답을 받으면(저장이든 거절이든) handle 에 넘기고 폰에서 뺀다.
     *   서버가 거절한 것은 다시 보내도 안 되기 때문이다.
     * - 보내다 예외가 나면(신호 없음) 그대로 두고 멈춘다 → 'offline'.
     *   다음 기회에 같은 것을 다시 보낸다 — 서버는 같은 것을 한 줄로 남긴다.
     * - 한 번 보낼 때마다 저장소를 새로 읽는다. 보내는 사이에 담긴 것도 이어서
     *   보내고, 그사이 지운 것은 보내지 않는다.
     *
     * rethrow 는 예외 가운데 Next.js 자신의 신호(화면 이동 등)를 걸러 다시 던지는
     * 자리다 — 화면은 next/navigation 의 unstable_rethrow 를 넘긴다.
     */
    async drain<R>(
      pick: (p: T) => boolean,
      send: (p: T) => Promise<R>,
      handle: (p: T, result: R) => void,
      rethrow: (err: unknown) => void = () => {}
    ): Promise<'done' | 'offline' | 'busy'> {
      if (draining) return 'busy';
      draining = true;
      try {
        for (;;) {
          const next = load()
            .filter(pick)
            .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
          if (!next) return 'done';

          let result: R;
          try {
            result = await send(next);
          } catch (err) {
            rethrow(err);
            return 'offline';
          }
          handle(next, result);
          /*
           * 보낸 그것만 뺀다. 보내는 사이에 같은 것(같은 세트)을 고쳐 다시 담았으면 열쇠는 같고 값만 새것이라, 열쇠로
           * 빼면 그 새 값까지 지워져 고친 것이 서버에 안 갔다(약한 신호에서 8회 → 10회로 고쳐도 8회로 남음). 새 값은
           * 남겨 두어 다음 차례에 보낸다.
           */
          const now = load().find((x) => same(x, next));
          if (now === next || JSON.stringify(now) === JSON.stringify(next))
            remove(next);
        }
      } finally {
        draining = false;
      }
    },
  };
}
