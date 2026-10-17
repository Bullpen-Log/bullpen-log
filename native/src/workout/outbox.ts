import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingSet, ShownSet } from '@/lib/workout/outbox';
import type { SavedSet } from '@/app/actions/workout';

/**
 * 아직 서버에 못 보낸 세트를 폰에 맡겨 두는 곳 — 앱 판. 웹(lib/workout/outbox.ts · lib/outbox.ts)은 localStorage 라 앱이 못 써서,
 * 같은 규칙을 앱 저장소(AsyncStorage)로 옮겼다:
 *   - 담는 순간 화면에 보이고(신호를 기다리지 않는다), 보내는 데 성공한 것만 뺀다.
 *   - 같은 세트(판 · 운동 · 번호)를 다시 담으면 새 값으로 바뀐다 — 서버도 그 번호로 덮어써 두 번 저장되지 않는다.
 *   - 보내다 예외(신호 없음)면 그대로 두고 멈춘다 → 'offline'. 서버가 답으로 거절한 것은 다시 보내도 안 되니 뺀다. 서버 오류(500 · 404)가
 *     같은 세트에서 여덟 번 나면 그것도 거절로 본다 — 안 그러면 그 한 줄이 뒤의 세트를 모두 막고 마치기도 막았다.
 *   - 보낸 결과는 듣는 화면 모두에(onSent) — 껍데기(앱을 켤 때 · 다시 볼 때)가 보내도 열린 운동 화면이 저장된 세트를 받는다.
 *   - 7일 넘게 못 보낸 것은 버린다(서버가 받지 않는다).
 * 화면(useSyncExternalStore)은 subscribe · snapshot 으로 읽는다.
 */
export type { PendingSet, ShownSet };
type SetKey = Pick<PendingSet, 'sessionId' | 'exerciseId' | 'setNo'>;

const KEY = 'bullpen-workout:pending-sets:v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY: readonly PendingSet[] = Object.freeze([]);
const keyText = (k: SetKey) => `${k.sessionId}|${k.exerciseId}|${k.setNo}`;
const same = (a: SetKey, b: SetKey) => a.sessionId === b.sessionId && a.exerciseId === b.exerciseId && a.setNo === b.setNo;

/** 담은 사람(계정) — 같은 폰에 다른 사람이 로그인해도 앞사람의 못 보낸 세트를 그 사람 이름으로 보내지 않는다(보내면 서버가 거절해 버려진다) */
type Stored = PendingSet & { owner?: string };
let items: readonly Stored[] = EMPTY;
let owner: string | null = null;
/** 지금 로그인한 계정 — 껍데기가 정한다(loadMe 뒤, 로그아웃 때 null). 담는 세트에 붙고, 보내기는 이 계정 것만 */
export function setOutboxOwner(id: string | null) {
  owner = id;
}
/**
 * 지운 세트 — 지우는 사이에 그 세트의 보내기가 이미 가는 중이면 서버에 다시 생긴다. 지운 열쇠를 적어 두고, 그 보내기의 답이 오면 한 번 더
 * 지운다(onSent 를 듣는 화면이). 같은 세트를 다시 담으면 풀린다.
 */
const dropped = new Set<string>();
const listeners = new Set<() => void>();

function set(next: readonly Stored[]) {
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
    dropped.delete(keyText(p));
    set([...items.filter((x) => !same(x, p)), owner ? { ...p, owner } : p]);
  },
  /** 사람이 지운 세트 — 빼고, 가는 중인 보내기의 답을 알아보게 적어 둔다 */
  drop(k: SetKey) {
    dropped.add(keyText(k));
    if (items.some((x) => same(x, k))) set(items.filter((x) => !same(x, k)));
  },
  isDropped: (k: SetKey) => dropped.has(keyText(k)),
  remove(k: SetKey) {
    if (items.some((x) => same(x, k))) set(items.filter((x) => !same(x, k)));
  },
};

let draining = false;
/** 같은 세트에서 서버 오류가 난 횟수 — 여덟이면 거절로 본다(메모리만, 앱을 다시 켜면 다시 센다) */
const serverFails = new Map<string, number>();
/* 여덟 번(운동 화면은 15초마다 — 약 2분) — 배포 중 잠깐 나는 오류로 세트를 버리지 않을 만큼 */
const SERVER_FAIL_LIMIT = 8;
/** 보낸 결과를 듣는 곳(운동 화면) — 누가 보냈든 같은 답이 간다 */
const sentSubs = new Set<(p: PendingSet, result: unknown) => void>();
export function onSent(f: (p: PendingSet, result: unknown) => void) {
  sentSubs.add(f);
  return () => {
    sentSubs.delete(f);
  };
}

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
      /* 지금 계정 것(또는 계정을 모르고 담은 옛 줄)만 — 다른 계정 것은 그 사람이 다시 로그인할 때까지 둔다 */
      const next = [...items]
        .filter((p) => !p.owner || p.owner === owner)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
      if (!next) return 'done';
      /* 담은 사람 표시는 폰 것 — 서버에는 안 보낸다 */
      const plain: PendingSet = { ...next };
      delete (plain as Stored).owner;
      let result: R;
      try {
        result = await send(plain);
      } catch (e) {
        /* 신호 없음 · 다시 로그인 · 앱 업데이트는 나중에 다시. 그 밖(서버가 처리 못 함 — 500 · 모르는 동작 · 틀린 값)만 센다 */
        const code = (e as { code?: unknown })?.code;
        if (code === 'offline' || code === 'redirect' || code === 'update' || code == null) return 'offline';
        const n = (serverFails.get(keyText(next)) ?? 0) + 1;
        serverFails.set(keyText(next), n);
        if (n < SERVER_FAIL_LIMIT) return 'offline';
        /* 서버가 이 세트를 계속 못 받는다 — 빼고 알린다(답으로 거절한 것과 같이) */
        serverFails.delete(keyText(next));
        outbox.remove(next);
        const failed = { error: '서버가 세트 하나를 받지 못해 뺐어요. 다시 남겨 주세요.' };
        sentSubs.forEach((f) => f(next, failed));
        continue;
      }
      serverFails.delete(keyText(next));
      handle(next, result);
      sentSubs.forEach((f) => f(next, result));
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
