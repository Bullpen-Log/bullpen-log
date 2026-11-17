import { appNowMs } from '@/lib/clock';
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
 * 이보다 오래 못 보낸 것은 버린다 — **기본값이고, 붙들지 않은 줄에만**(암케어 체크처럼 held 를 쓰지 않는 대기열).
 *
 * EX-LOAD01-R1 — 나이로는 저장을 증명하지 못한다. 붙든 줄(held — 서버가 고쳐 달라고 했거나 저장 확인이 없는 것)은 어느 대기열에서도
 * 나이로 버리지 않는다. 운동 세트 대기열은 expireAfterMs: null 로 나이 거르기를 아예 끈다(lib/workout/outbox.ts) — 빼는 길은 저장이
 * 증명된 답과 사람이 누른 [버리기] 둘뿐이다.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * EX-LOAD01-R1 — 저장소의 값 자체가 깨졌거나(JSON 아님) 배열이 아닐 때(앞으로 나올 판의 다른 겉모양 등) 그 원래 글자를 옮겨 두는 곳의 이름
 * 꼬리. 다음 쓰기가 덮기 **전에** 여기로 옮긴다(옮기지 못하면 원래 칸을 덮지 않는다). 보내지 않고, 복구 화면이 수만 보이고 사람이 버린다.
 */
export const QUARANTINE_SUFFIX = ':quarantine';

/** 옮겨 둔 깨진 저장 값 하나 — raw 는 저장소에 있던 글자 그대로 */
export type QuarantineEntry = { raw: string; foundAt: string };

/** 복구 화면이 보는 것 — malformed: 모양이 틀린 줄(원래 값 그대로) · corrupt: 깨진 저장 값(원래 글자 그대로) */
export type OutboxExtras = { malformed: readonly unknown[]; corrupt: readonly QuarantineEntry[] };

/** 모양이 틀린 줄 · 깨진 저장 값을 가리키는 열쇠(버리기에 쓴다) */
export const extraKey = (v: unknown): string => {
  try {
    return typeof v === 'string' ? `s:${v}` : `j:${JSON.stringify(v)}`;
  } catch {
    return 'x';
  }
};
export const quarantineKey = (q: QuarantineEntry): string => `${q.foundAt}|${q.raw}`;

/** 옮겨 둔 칸의 값 읽기 — 그 칸마저 깨졌으면 그 글자 전체를 한 줄로(덮지 않고 같이 옮겨 둔다) */
export function readQuarantine(raw: string | null): QuarantineEntry[] {
  if (raw == null) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v) && v.every((x) => !!x && typeof x === 'object' && typeof (x as QuarantineEntry).raw === 'string'))
      return v.map((x) => ({ raw: (x as QuarantineEntry).raw, foundAt: typeof (x as QuarantineEntry).foundAt === 'string' ? (x as QuarantineEntry).foundAt : '' }));
  } catch {
    /* 아래로 */
  }
  return [{ raw, foundAt: '' }];
}

/**
 * EX-LOAD01 — 붙들어 둔 줄의 표. 서버가 '고쳐서 다시'라고 돌려준 것(actionRequired) · 옛 서버가 새 칸을 모르고 지나친 것 ·
 * 다른 계정의 것일 수 있는 것. 지우지 않고 남겨 사람에게 보인다(고치면 풀리고, 버리면 뺀다).
 */
export type HoldMark = { code: string; message: string; at: string };

/**
 * 붙들린 줄인가 — 줄에 held 칸이 차 있을 때만. 그 칸을 쓰는 대기열(운동 세트)만 해당하고, held 를 한 번도 붙이지 않는
 * 대기열(암케어 체크)은 아무것도 바뀌지 않는다. 붙들린 줄은 어느 보내기에서도 건너뛴다(보내면 같은 거절로 다시 붙들릴 뿐이고,
 * 예전 길로 보내면 거절과 함께 지워진다).
 */
export function isHeld(p: unknown): boolean {
  return !!p && typeof p === 'object' && !!(p as { held?: unknown }).held;
}

/** 보내기의 덧붙임(새 기능 — 넘기지 않으면 예전과 같다) */
export type DrainOptions<T, R> = {
  /**
   * 답을 보고 붙들 줄을 돌려준다(held 를 붙인 줄). 돌려주면 그 줄을 지우지 않고 같은 자리에 바꿔 둔다 — 보내는 사이 사람이
   * 그 줄을 고쳤거나 지웠으면 그 뜻이 이긴다(바꿔 두지 않는다). null 이면 예전처럼 보낸 그것을 뺀다.
   */
  holdAs?: (p: T, result: R) => T | null;
};

type DrainFn<T> = <R>(
  pick: (p: T) => boolean,
  send: (p: T) => Promise<R>,
  handle: (p: T, result: R) => void,
  rethrow?: (err: unknown) => void,
  opts?: DrainOptions<T, R>
) => Promise<'done' | 'offline' | 'busy'>;

/**
 * 대기열의 보내기를 그 대기열의 snapshot 함수로 찾아 두는 곳. 바깥 모듈(운동 세트의 lib/workout/outbox.ts)이 보내기를
 * 감싸 내보내도(drainOutbox · drainAllSets — 덧붙임을 못 넘긴다), 같은 대기열 · 같은 '한 번에 하나' 잠금으로 덧붙임을 넘겨
 * 보낼 수 있게 한다(drainVia). 대기열이 내보내는 snapshot 은 만든 그 함수 그대로다.
 */
const drains = new WeakMap<object, unknown>();

/**
 * 덧붙임(holdAs)과 함께 보낸다 — box 는 createOutbox 가 만든 대기열(또는 그 snapshot 을 그대로 내보낸 묶음).
 * 보내는 규칙 · 잠금은 그 대기열의 drain 과 같다.
 */
export function drainVia<T, R>(
  box: { snapshot: () => readonly T[] },
  pick: (p: T) => boolean,
  send: (p: T) => Promise<R>,
  handle: (p: T, result: R) => void,
  rethrow: (err: unknown) => void = () => {},
  opts?: DrainOptions<T, R>
): Promise<'done' | 'offline' | 'busy'> {
  const drain = drains.get(box.snapshot) as DrainFn<T> | undefined;
  if (!drain) throw new Error('createOutbox 로 만든 대기열이 아니에요.');
  return drain(pick, send, handle, rethrow, opts);
}

const EMPTY_EXTRAS: OutboxExtras = Object.freeze({ malformed: Object.freeze([]), corrupt: Object.freeze([]) });

export function createOutbox<T extends Stamped & K, K>({
  key,
  isItem,
  same,
  expireAfterMs = MAX_AGE_MS,
  keepUnknown = false,
}: {
  /** 폰 저장소의 이름 */
  key: string;
  /** 저장소에서 읽은 값이 제 모양인가 — 옛 모양이나 망가진 값은 버린다(keepUnknown 이면 보내지 않고 그대로 남긴다) */
  isItem: (v: unknown) => v is T;
  /** 같은 것인가 — 같은 것을 다시 담으면 새것으로 바꾼다 */
  same: (a: T, b: K) => boolean;
  /**
   * EX-LOAD01-R1 — 붙들지 않은 줄을 이만큼 지나면 버린다(기본 7일). null 이면 나이로 버리지 않는다(운동 세트). 붙든 줄은 늘 버리지 않는다.
   */
  expireAfterMs?: number | null;
  /**
   * EX-LOAD01-R1 — 모양이 틀린 줄(isItem 이 아님)을 버리지 않고 원래 값 그대로 다시 쓰고, 깨진 저장 값 · 배열이 아닌 값은 다음 쓰기 전에
   * 옮겨 둔다(QUARANTINE_SUFFIX). 둘 다 보내지 않는다. 기본 false — 암케어 체크는 예전 그대로(모양이 틀린 줄은 버린다).
   */
  keepUnknown?: boolean;
}) {
  const EMPTY: readonly T[] = Object.freeze([]);
  const qKey = key + QUARANTINE_SUFFIX;

  /*
   * 읽은 것을 들고 있는다. useSyncExternalStore 는 바뀌지 않았으면 같은 값을
   * 돌려받아야 다시 그리지 않는다 — 매번 새로 읽어 새 배열을 주면 끝없이 그린다.
   */
  let cache: readonly T[] | null = null;
  /* keepUnknown — 모양이 틀린 줄(원래 값 그대로). 쓸 때마다 뒤에 붙여 다시 쓴다 */
  let unknownRows: readonly unknown[] = [];
  /* keepUnknown — 저장 칸의 원래 글자가 깨졌거나 배열이 아니면 그 글자. 다음 쓰기 전에 옮겨 둔다(옮기기 전에는 원래 칸을 덮지 않는다) */
  let pendingCorrupt: string | null = null;
  /* keepUnknown — 저장 칸을 읽지 못했으면(막힘) 쓰지도 않는다 — 읽지 못한 원래 값을 새 목록으로 덮지 않게 */
  let readOk = true;
  let extrasCache: OutboxExtras | null = null;
  const listeners = new Set<() => void>();

  function load(): readonly T[] {
    if (cache) return cache;
    if (typeof window === 'undefined') return EMPTY;
    extrasCache = null;
    if (!keepUnknown) {
      try {
        const raw = window.localStorage.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        cache = Array.isArray(parsed) ? parsed.filter(isItem).filter(alive) : [];
      } catch {
        cache = [];
      }
      return cache;
    }
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
      readOk = true;
    } catch {
      /* 사생활 보호 모드 등 — 읽지 못했으니 쓰지도 않는다(메모리에서만 돈다) */
      readOk = false;
      unknownRows = [];
      pendingCorrupt = null;
      cache = [];
      return cache;
    }
    pendingCorrupt = null;
    let parsed: unknown = [];
    if (raw != null) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = undefined;
      }
      if (!Array.isArray(parsed)) {
        /* 깨진 값 · 배열이 아닌 겉모양 — 원래 글자를 그대로 쥐고, 다음 쓰기 전에 옮겨 둔다 */
        pendingCorrupt = raw;
        parsed = [];
      }
    }
    const items: T[] = [];
    const unknown: unknown[] = [];
    for (const v of parsed as unknown[]) {
      if (isItem(v)) {
        if (alive(v)) items.push(v);
      } else unknown.push(v);
    }
    unknownRows = unknown;
    cache = items;
    return cache;
  }

  /** 나이로 버리지 않는가 — 붙든 줄은 늘 남긴다. 나이를 읽을 수 없는 줄도 남긴다(시각이 틀렸다고 지우지 않는다) */
  function alive(p: T): boolean {
    if (expireAfterMs == null || isHeld(p)) return true;
    const at = Date.parse(p.recordedAt);
    return !Number.isFinite(at) || at > appNowMs() - expireAfterMs;
  }

  function store(next: readonly T[]) {
    /* 메모리는 먼저 바꾼다 — 폰 저장소가 막혀도 화면과 보내기는 돈다 */
    cache = next;
    extrasCache = null;
    try {
      if (keepUnknown) {
        if (!readOk) throw new Error('읽지 못한 저장 칸은 덮지 않는다');
        if (pendingCorrupt != null) {
          /* 깨진 원래 값을 먼저 옮긴다 — 옮기지 못하면(던짐) 원래 칸을 덮지 않는다 */
          const q = readQuarantine(window.localStorage.getItem(qKey));
          q.push({ raw: pendingCorrupt, foundAt: new Date(appNowMs()).toISOString() });
          window.localStorage.setItem(qKey, JSON.stringify(q));
          pendingCorrupt = null;
        }
      }
      const all = keepUnknown ? [...next, ...unknownRows] : next;
      if (all.length === 0) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(all));
    } catch {
      /* 사생활 보호 모드 등 — 메모리에만 남는다 */
    }
    for (const l of listeners) l();
  }

  /** 복구 화면용 — 모양이 틀린 줄 · 옮겨 둔(또는 옮길) 깨진 값. 바뀌지 않았으면 같은 묶음을 돌려준다 */
  function extras(): OutboxExtras {
    if (!keepUnknown || typeof window === 'undefined') return EMPTY_EXTRAS;
    load();
    if (extrasCache) return extrasCache;
    let stored: QuarantineEntry[] = [];
    try {
      stored = readQuarantine(window.localStorage.getItem(qKey));
    } catch {
      stored = [];
    }
    const corrupt = pendingCorrupt != null ? [...stored, { raw: pendingCorrupt, foundAt: '' }] : stored;
    extrasCache = { malformed: unknownRows, corrupt };
    return extrasCache;
  }

  /** 모양이 틀린 줄 하나를 사람이 버린다(복구 화면의 [버리기] — 확인을 받은 뒤) */
  function discardMalformed(k: string): boolean {
    load();
    const i = unknownRows.findIndex((v) => extraKey(v) === k);
    if (i < 0) return false;
    unknownRows = unknownRows.filter((_, n) => n !== i);
    store(load());
    return true;
  }

  /** 깨진 저장 값 하나를 사람이 버린다 — 아직 옮기지 않은 원래 칸의 값이면 그 칸을 새 목록으로 쓴다 */
  function discardCorrupt(k: string): boolean {
    load();
    if (pendingCorrupt != null && quarantineKey({ raw: pendingCorrupt, foundAt: '' }) === k) {
      pendingCorrupt = null;
      store(load());
      return true;
    }
    try {
      const q = readQuarantine(window.localStorage.getItem(qKey));
      const i = q.findIndex((x) => quarantineKey(x) === k);
      if (i < 0) return false;
      q.splice(i, 1);
      if (q.length) window.localStorage.setItem(qKey, JSON.stringify(q));
      else window.localStorage.removeItem(qKey);
    } catch {
      return false;
    }
    extrasCache = null;
    for (const l of listeners) l();
    return true;
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

  const box = {
    /** useSyncExternalStore 용 — 바뀌면 알린다. 다른 탭에서 바꾼 것도 따라간다. */
    subscribe(listener: () => void) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key !== key && e.key !== qKey) return;
        cache = null;
        extrasCache = null;
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

    /** EX-LOAD01-R1 — 복구 화면: 모양이 틀린 줄 · 깨진 저장 값(keepUnknown 일 때만, 아니면 늘 빈 묶음) */
    extras,
    /** EX-LOAD01-R1 — 모양이 틀린 줄 하나를 사람이 버린다(extraKey 로 가리킴) */
    discardMalformed,
    /** EX-LOAD01-R1 — 깨진 저장 값 하나를 사람이 버린다(quarantineKey 로 가리킴) */
    discardCorrupt,

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
     *
     * EX-LOAD01 — 붙들린 줄(isHeld)은 고르지 않는다. opts.holdAs 가 줄을 돌려주면 그 답의 줄은 빼지 않고 붙들어 둔다.
     */
    async drain<R>(
      pick: (p: T) => boolean,
      send: (p: T) => Promise<R>,
      handle: (p: T, result: R) => void,
      rethrow: (err: unknown) => void = () => {},
      opts?: DrainOptions<T, R>
    ): Promise<'done' | 'offline' | 'busy'> {
      if (draining) return 'busy';
      draining = true;
      try {
        for (;;) {
          const next = load()
            .filter((p) => !isHeld(p) && pick(p))
            .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
          if (!next) return 'done';

          let result: R;
          try {
            result = await send(next);
          } catch (err) {
            rethrow(err);
            return 'offline';
          }
          const hold = opts?.holdAs?.(next, result) ?? null;
          handle(next, result);
          /*
           * 보낸 그것만 뺀다. 보내는 사이에 같은 것(같은 세트)을 고쳐 다시 담았으면 열쇠는 같고 값만 새것이라, 열쇠로
           * 빼면 그 새 값까지 지워져 고친 것이 서버에 안 갔다(약한 신호에서 8회 → 10회로 고쳐도 8회로 남음). 새 값은
           * 남겨 두어 다음 차례에 보낸다.
           */
          const now = load().find((x) => same(x, next));
          const unchanged = now === next || JSON.stringify(now) === JSON.stringify(next);
          if (!unchanged) continue;
          if (hold) {
            /* 붙든다 — 지우지 않고 같은 자리에 표를 붙인 줄로 바꿔 둔다(다음 차례부터 건너뛴다) */
            store(load().map((x) => (same(x, next) ? hold : x)));
          } else {
            remove(next);
          }
        }
      } finally {
        draining = false;
      }
    },
  };
  drains.set(box.snapshot, box.drain);
  return box;
}
