import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingSet, ShownSet } from '@/lib/workout/outbox';
import type { SavedSet } from '@/app/actions/workout';

/**
 * 아직 서버에 못 보낸 세트를 폰에 맡겨 두는 곳 — 앱 판. 웹(lib/workout/outbox.ts · lib/outbox.ts)은 localStorage 라 앱이 못 써서,
 * 같은 규칙을 앱 저장소(AsyncStorage)로 옮겼다:
 *   - 담는 순간 화면에 보이고(신호를 기다리지 않는다), 보내는 데 성공한 것만 뺀다.
 *   - 같은 세트(판 · 운동 · 번호)를 다시 담으면 새 값으로 바뀐다 — 서버도 그 번호로 덮어써 두 번 저장되지 않는다.
 *   - 보내다 예외(신호 없음 · 서버 오류)면 그대로 두고 멈춘다 → 'offline'. 서버가 답으로 거절한 것은 다시 보내도 안 되니 뺀다.
 *   - 7일 넘게 못 보낸 것은 버린다(서버가 받지 않는다).
 * 화면(useSyncExternalStore)은 subscribe · snapshot 으로 읽는다.
 */
export type { PendingSet, ShownSet };
type SetKey = Pick<PendingSet, 'sessionId' | 'exerciseId' | 'setNo'>;

const KEY = 'bullpen-workout:pending-sets:v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY: readonly PendingSet[] = Object.freeze([]);
const same = (a: SetKey, b: SetKey) => a.sessionId === b.sessionId && a.exerciseId === b.exerciseId && a.setNo === b.setNo;

let items: readonly PendingSet[] = EMPTY;
const listeners = new Set<() => void>();

function set(next: readonly PendingSet[]) {
  items = next;
  listeners.forEach((l) => l());
  void (next.length ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY)).catch(() => {
    /* 못 쓰면 메모리에만 — 이 화면을 닫기 전까지는 똑같이 보낸다 */
  });
}

const isPending = (v: unknown): v is PendingSet => {
  const p = v as Record<string, unknown> | null;
  return (
    !!p &&
    typeof p.sessionId === 'string' &&
    typeof p.exerciseId === 'string' &&
    typeof p.setNo === 'number' &&
    typeof p.recordedAt === 'string'
  );
};

/**
 * 앱을 켜면 한 번 읽는다. 그사이 담긴 것(메모리)이 이긴다 — 같은 세트면 방금 담은 값이 새것이다.
 * 보내기(drain)는 이것을 기다린 뒤에 돈다 — 안 기다리면 지난번에 못 보낸 세트를 건너뛴다.
 */
const loaded: Promise<void> = AsyncStorage.getItem(KEY)
  .then((raw) => {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - MAX_AGE_MS;
    const stored = Array.isArray(parsed)
      ? parsed.filter(isPending).filter((p) => Date.parse(p.recordedAt) > cutoff)
      : [];
    const extra = stored.filter((s) => !items.some((x) => same(x, s)));
    if (extra.length) set([...extra, ...items]);
  })
  .catch(() => undefined);

export const outbox = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  snapshot: (): readonly PendingSet[] => items,
  /** 담는다 — 같은 세트가 있으면 새 값으로 */
  add(p: PendingSet) {
    set([...items.filter((x) => !same(x, p)), p]);
  },
  remove(k: SetKey) {
    if (items.some((x) => same(x, k))) set(items.filter((x) => !same(x, k)));
  },
};

let draining = false;

/**
 * 담긴 세트를 누른 순서대로 하나씩 보낸다 — 웹 lib/outbox.ts drain 과 같은 규칙. 한 번에 한 줄만 돌고, 보내는 사이 새로 담긴 것도
 * 이어서 보낸다. 보내는 사이 같은 세트를 고쳐 다시 담았으면 새 값은 남겨 다음 차례에 보낸다.
 *
 * 다른 판의 세트까지 보낸다(웹 components/send-pending-sets.tsx 의 몫) — 신호 없이 나간 지난 판의 세트도 다음에 운동 화면을 열면 간다.
 * ponytail: 운동 화면이 열려 있을 때만 돈다. 앱 어디서든 보내려면 껍데기(index.tsx)가 켤 때 한 번 부르면 된다.
 */
export async function drainOutbox<R>(
  send: (p: PendingSet) => Promise<R>,
  handle: (p: PendingSet, result: R) => void
): Promise<'done' | 'offline' | 'busy'> {
  if (draining) return 'busy';
  draining = true;
  try {
    await loaded;
    for (;;) {
      const next = [...items].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
      if (!next) return 'done';
      let result: R;
      try {
        result = await send(next);
      } catch {
        return 'offline';
      }
      handle(next, result);
      const now = items.find((x) => same(x, next));
      if (now === next || JSON.stringify(now) === JSON.stringify(next)) outbox.remove(next);
    }
  } finally {
    draining = false;
  }
}

/**
 * 서버에 저장된 세트 위에 폰에만 있는 세트를 겹친다 — 웹 lib/workout/outbox.ts withPending 과 같다(그 파일은 localStorage 틀을 끌고
 * 와서 앱이 못 부른다). 같은 세트가 양쪽에 있으면 폰 쪽이 이긴다 — 고친 값이 신호 없이도 보인다.
 */
export function withPending(saved: readonly SavedSet[], pending: readonly PendingSet[]): ShownSet[] {
  const key = (s: { exerciseId: string; setNo: number }) => `${s.exerciseId}#${s.setNo}`;
  const waiting = new Set(pending.map(key));
  return [
    ...saved.filter((s) => !waiting.has(key(s))),
    ...pending.map((p) => ({
      setNo: p.setNo,
      exerciseId: p.exerciseId,
      weightKg: p.weightKg,
      reps: p.reps,
      holdSeconds: p.holdSeconds,
      recordedAt: p.recordedAt,
      rir: p.rir,
      pending: true,
    })),
  ];
}
