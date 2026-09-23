/**
 * 아직 서버에 못 보낸 세트를 폰에 맡겨 두는 곳.
 *
 * 지하 헬스장은 신호가 약한 곳이 많다. 예전에는 [세트 완료]가 곧바로 서버를
 * 불렀고, 신호가 끊긴 순간에 누르면 그 세트가 사라지는 것은 물론 화면이
 * 통째로 오류 화면으로 넘어갔다 — 넣고 있던 숫자까지 잃는다.
 *
 * 이제 세트는 먼저 여기에 담기고, 운동 화면이 뒤에서 하나씩 보낸다. 보내는
 * 데 성공한 것만 지운다. 폰의 저장소(localStorage)에 두므로 앱을 닫았다
 * 열어도 남아 있고, 운동 화면을 다시 열면 이어서 보낸다.
 *
 * ■ 두 번 저장되지 않는다
 *
 * 세트마다 번호(setNo)를 여기서 정해 함께 보낸다. 서버는 (판, 운동, 번호)로
 * 덮어쓰므로, 응답만 못 받아 같은 세트를 또 보내도 한 줄로 남는다.
 *
 * ■ 폰 저장소를 못 쓰는 경우
 *
 * 사생활 보호 모드 같은 곳에서는 읽고 쓰기가 막힐 수 있다. 그때는 메모리에만
 * 두고 계속 돈다 — 화면을 닫기 전까지는 똑같이 보낸다.
 */

export type PendingSet = {
  /** 어느 판(TrainingSession)의 세트인가. 다른 판으로 새지 않게 함께 보낸다. */
  sessionId: string;
  exerciseId: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
  /** 누른 순간(ISO). 늦게 보내져도 이 시각으로 남아 휴식 시계와 순서가 맞다. */
  recordedAt: string;
};

const KEY = 'bullpen-log:pending-sets:v1';

/**
 * 이보다 오래 못 보낸 것은 버린다.
 *
 * 그 판은 이미 끝났을 가능성이 크고(서버가 받지 않는다), 영영 남아 폰
 * 저장소를 차지할 이유가 없다. 운동 하나가 일주일을 넘기지는 않는다.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const EMPTY: readonly PendingSet[] = Object.freeze([]);

/*
 * 읽은 것을 들고 있는다. useSyncExternalStore 는 바뀌지 않았으면 같은 값을
 * 돌려받아야 다시 그리지 않는다 — 매번 새로 읽어 새 배열을 주면 끝없이 그린다.
 */
let cache: readonly PendingSet[] | null = null;
const listeners = new Set<() => void>();

function isPendingSet(v: unknown): v is PendingSet {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.sessionId === 'string' &&
    typeof p.exerciseId === 'string' &&
    typeof p.setNo === 'number' &&
    typeof p.recordedAt === 'string'
  );
}

function load(): readonly PendingSet[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - MAX_AGE_MS;
    cache = Array.isArray(parsed)
      ? parsed.filter(isPendingSet).filter((p) => Date.parse(p.recordedAt) > cutoff)
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function store(next: readonly PendingSet[]) {
  /* 메모리는 먼저 바꾼다 — 폰 저장소가 막혀도 화면과 보내기는 돈다 */
  cache = next;
  try {
    if (next.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 사생활 보호 모드 등 — 메모리에만 남는다 */
  }
  for (const l of listeners) l();
}

const same = (
  a: PendingSet,
  b: Pick<PendingSet, 'sessionId' | 'exerciseId' | 'setNo'>
) =>
  a.sessionId === b.sessionId && a.exerciseId === b.exerciseId && a.setNo === b.setNo;

export const outbox = {
  /** useSyncExternalStore 용 — 바뀌면 알린다. 다른 탭에서 바꾼 것도 따라간다. */
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      cache = null;
      listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  },
  snapshot: (): readonly PendingSet[] => load(),
  /** 서버에서 그릴 때는 폰 저장소가 없다 — 비어 있는 것으로 그린다 */
  serverSnapshot: (): readonly PendingSet[] => EMPTY,

  /** 담는다. 같은 세트(판·운동·번호)가 이미 있으면 새것으로 바꾼다. */
  add(p: PendingSet) {
    store([...load().filter((x) => !same(x, p)), p]);
  },

  /** 뺀다. 보내는 데 성공했거나, 보내기 전에 지웠을 때. */
  remove(p: Pick<PendingSet, 'sessionId' | 'exerciseId' | 'setNo'>) {
    const before = load();
    const next = before.filter((x) => !same(x, p));
    if (next.length !== before.length) store(next);
  },
};

/*
 * 한 번에 한 줄만 보낸다. 화면이 여러 까닭(새 세트, 신호 복구, 15초 주기)으로
 * 동시에 불러도, 이미 보내는 중이면 그 줄이 새로 담긴 것까지 이어서 보낸다.
 */
let draining = false;

/**
 * 이 판의 세트를 누른 순서대로 하나씩 보낸다.
 *
 * - 보내서 답을 받으면(저장이든 거절이든) handle 에 넘기고 폰에서 뺀다.
 *   서버가 거절한 것은 다시 보내도 안 되기 때문이다.
 * - 보내다 예외가 나면(신호 없음) 그대로 두고 멈춘다 → 'offline'.
 *   다음 기회에 같은 번호로 다시 보내므로 두 번 저장되지 않는다.
 * - 한 번 보낼 때마다 저장소를 새로 읽는다. 보내는 사이에 담긴 세트도 이어서
 *   보내고, 그사이 지운 세트는 보내지 않는다.
 *
 * rethrow 는 예외 가운데 Next.js 자신의 신호(화면 이동 등)를 걸러 다시 던지는
 * 자리다 — 운동 화면은 next/navigation 의 unstable_rethrow 를 넘긴다.
 */
export async function drainOutbox<R>(
  sessionId: string,
  send: (p: PendingSet) => Promise<R>,
  handle: (p: PendingSet, result: R) => void,
  rethrow: (err: unknown) => void = () => {}
): Promise<'done' | 'offline' | 'busy'> {
  if (draining) return 'busy';
  draining = true;
  try {
    for (;;) {
      const next = load()
        .filter((p) => p.sessionId === sessionId)
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
      outbox.remove(next);
    }
  } finally {
    draining = false;
  }
}
