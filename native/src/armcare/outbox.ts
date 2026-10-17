import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingCheck } from '@/lib/armcare/check-outbox';
import { outboxOwner } from '~/workout/outbox';

/**
 * 아직 서버에 못 보낸 암케어 체크를 폰에 맡겨 두는 곳 — 앱 판. 웹(lib/armcare/check-outbox.ts · lib/outbox.ts)은 localStorage 라 앱이 못 써서,
 * 같은 규칙을 앱 저장소(AsyncStorage)로 옮겼다(운동 세트의 ~/workout/outbox.ts 와 같은 꼴):
 *   - 먼저 담고 보내는 데 성공한 것만 뺀다 — 신호 없는 연습장에서 루틴을 끝내고 닫아도 체크가 남는다.
 *   - 같은 체크(운동 · 날)를 다시 담으면 새것으로 바꾼다. 서버도 한 줄로 남긴다(markExerciseDone 의 upsert).
 *   - 보내다 예외(신호 없음)면 두고 멈춘다 → 'offline'. 서버가 답으로 거절한 것은 다시 보내도 안 되니 뺀다.
 *   - 담은 계정을 붙인다 — 같은 폰에 다른 사람이 로그인하면 앞사람 체크를 그 사람 이름으로 보내지 않는다(계정은 껍데기가 정한다).
 *   - 7일 넘게 못 보낸 것은 버린다.
 */
export type { PendingCheck };
type Stored = PendingCheck & { owner?: string };
type CheckKey = Pick<PendingCheck, 'exerciseId' | 'dateKey'>;

const KEY = 'bullpen-armcare:pending-checks:v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY: readonly Stored[] = Object.freeze([]);
const same = (a: CheckKey, b: CheckKey) => a.exerciseId === b.exerciseId && a.dateKey === b.dateKey;
/** 화면에서 한 체크를 가리키는 이름 — 웹 checkId 와 같다 */
export const checkId = (p: CheckKey) => `${p.exerciseId}|${p.dateKey}`;

let items: readonly Stored[] = EMPTY;
const listeners = new Set<() => void>();

function set(next: readonly Stored[]) {
  items = next;
  listeners.forEach((l) => l());
  void (next.length ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY)).catch(() => {
    /* 못 쓰면 메모리에만 — 이 화면을 닫기 전까지는 똑같이 보낸다 */
  });
}

const isCheck = (v: unknown): v is Stored => {
  const p = v as Record<string, unknown> | null;
  return !!p && typeof p.exerciseId === 'string' && typeof p.dateKey === 'string' && typeof p.recordedAt === 'string';
};

/** 앱을 켜면 한 번 읽는다. 그사이 담긴 것(메모리)이 이긴다. 보내기는 이것을 기다린다 — 안 기다리면 지난번 것을 건너뛴다 */
const loaded: Promise<void> = AsyncStorage.getItem(KEY)
  .then((raw) => {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - MAX_AGE_MS;
    const stored = Array.isArray(parsed) ? parsed.filter(isCheck).filter((p) => Date.parse(p.recordedAt) > cutoff) : [];
    const extra = stored.filter((s) => !items.some((x) => same(x, s)));
    if (extra.length) set([...extra, ...items]);
  })
  .catch(() => undefined);

const remove = (k: CheckKey) => {
  if (items.some((x) => same(x, k))) set(items.filter((x) => !same(x, k)));
};

export const checkOutbox = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  snapshot: (): readonly PendingCheck[] => items,
  add(p: PendingCheck) {
    const owner = outboxOwner();
    set([...items.filter((x) => !same(x, p)), owner ? { ...p, owner } : p]);
  },
};

let draining = false;
/** 같은 체크에서 서버 오류가 난 횟수(메모리만) */
const serverFails = new Map<string, number>();
const SERVER_FAIL_LIMIT = 8;

/**
 * 담긴 체크를 마친 순서대로 하나씩 보낸다 — 웹 lib/outbox.ts drain 과 같은 규칙. 한 번에 한 줄만 돌고, 보내는 사이 새로 담긴 것도 이어 보낸다.
 * ponytail: 따라 하기 화면이 열려 있을 때만 돈다(웹은 암케어 목록도 보낸다). 껍데기에서도 보내려면 운동 세트처럼 결과를 듣는 화면 모두에
 * 알려야 한다(~/workout/outbox.ts onSent) — 안 그러면 열린 화면이 그 체크를 저장된 것으로 못 본다.
 */
export async function drainChecks<R>(
  send: (p: PendingCheck) => Promise<R>,
  handle: (p: PendingCheck, result: R) => void
): Promise<'done' | 'offline' | 'busy'> {
  if (draining) return 'busy';
  draining = true;
  try {
    await loaded;
    for (;;) {
      const owner = outboxOwner();
      /* 지금 계정 것(또는 계정을 모르고 담은 것)만 — 다른 계정 것은 그 사람이 다시 로그인할 때까지 둔다 */
      const next = [...items]
        .filter((p) => !p.owner || p.owner === owner)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
      if (!next) return 'done';
      const plain: PendingCheck = { exerciseId: next.exerciseId, dateKey: next.dateKey, recordedAt: next.recordedAt };
      let result: R;
      try {
        result = await send(plain);
      } catch (e) {
        /*
         * 신호 없음 · 다시 로그인 · 앱 업데이트는 나중에 다시. 서버가 처리 못 하는 것(500 · 틀린 값)은 같은 체크에서 여덟 번이면 거절로 본다 — 운동 세트
         * 대기열(~/workout/outbox.ts)과 같은 규칙. 안 그러면 그 한 줄이 뒤의 체크와 재활 3문항을 계속 막는다.
         */
        const code = (e as { code?: unknown })?.code;
        if (code === 'offline' || code === 'redirect' || code === 'update' || code == null) return 'offline';
        const n = (serverFails.get(checkId(next)) ?? 0) + 1;
        serverFails.set(checkId(next), n);
        if (n < SERVER_FAIL_LIMIT) return 'offline';
        serverFails.delete(checkId(next));
        remove(next);
        handle(plain, { error: '서버가 체크 하나를 받지 못해 뺐어요. 다시 체크해 주세요.' } as R);
        continue;
      }
      serverFails.delete(checkId(next));
      handle(plain, result);
      remove(next);
    }
  } finally {
    draining = false;
  }
}
