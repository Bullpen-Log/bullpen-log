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
 *     '같은 체크'는 계정까지 같아야 한다 — 예전엔 운동 · 날만 견줘, B 가 같은 운동을 같은 날 체크하면 A 의 못 보낸 체크가 지워졌고, A 의 체크를
 *     보낸 답이 오면 B 의 체크까지 뺐다(2026-10-26). 보낸 뒤에는 실제로 보낸 그 줄(같은 객체)만 뺀다 — 보내는 사이 다시 담은 새 판은 남는다.
 *     계정을 모르고 담은 옛 줄(owner 없음)은 그대로 둔다(누구로든 보내는 규칙 그대로 — 지우거나 아무 계정에 붙이지 않는다).
 *   - 7일 넘게 못 보낸 것은 버린다.
 */
export type { PendingCheck };
type Stored = PendingCheck & { owner?: string };
type CheckKey = Pick<PendingCheck, 'exerciseId' | 'dateKey'>;

const KEY = 'bullpen-armcare:pending-checks:v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY: readonly Stored[] = Object.freeze([]);
const sameCheck = (a: CheckKey, b: CheckKey) => a.exerciseId === b.exerciseId && a.dateKey === b.dateKey;
/** 같은 사람의 같은 체크 — 계정이 다르면 다른 줄(같은 폰에 두 사람) */
const sameEntry = (a: Stored, b: Stored) => sameCheck(a, b) && (a.owner ?? null) === (b.owner ?? null);
/** 지금 계정이 보내는 줄 — 제 것과 계정을 모르고 담은 옛 줄 */
const mine = (x: Stored, owner: string | null) => !x.owner || x.owner === owner;
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
    const extra = stored.filter((s) => !items.some((x) => sameEntry(x, s)));
    if (extra.length) set([...extra, ...items]);
  })
  .catch(() => undefined);

/** 보낸 그 줄만 뺀다(같은 객체) — 보내는 사이 다시 담은 새 판 · 다른 계정 줄은 남는다 */
const removeExact = (sent: Stored) => {
  if (items.includes(sent)) set(items.filter((x) => x !== sent));
};

/* 화면이 보는 목록 — 지금 계정 것만(다른 사람의 못 보낸 체크가 내 체크로 보이지 않게). 같은 값이면 같은 배열(useSyncExternalStore) */
let shown: { items: readonly Stored[]; owner: string | null; list: readonly Stored[] } = { items: EMPTY, owner: null, list: EMPTY };
function visible(): readonly Stored[] {
  const owner = outboxOwner();
  if (shown.items !== items || shown.owner !== owner) shown = { items, owner, list: items.filter((x) => mine(x, owner)) };
  return shown.list;
}

export const checkOutbox = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** 대기열 전체(모든 계정) */
  snapshot: (): readonly PendingCheck[] => items,
  /** 화면이 보는 것 — 지금 계정 것과 계정 모르는 옛 줄만(다른 사람의 못 보낸 체크가 내 체크로 보이지 않게) */
  visible: (): readonly PendingCheck[] => visible(),
  /** 아직 안 보낸 체크를 푼다(체크 목록에서 다시 누름) — 서버에는 간 적이 없으니 빼기만. 지금 계정이 보는 줄(제 것 · 옛 줄)만 */
  drop(k: CheckKey) {
    const owner = outboxOwner();
    if (items.some((x) => sameCheck(x, k) && mine(x, owner))) set(items.filter((x) => !(sameCheck(x, k) && mine(x, owner))));
  },
  /** 같은 사람의 같은 체크(운동 · 날)를 다시 담으면 새것으로 — 다른 계정 줄 · 계정 모르는 옛 줄은 그대로 */
  add(p: PendingCheck) {
    const owner = outboxOwner();
    const entry: Stored = owner ? { ...p, owner } : p;
    set([...items.filter((x) => !sameEntry(x, entry)), entry]);
  },
};

/*
 * 보낸 결과를 듣는 곳 — 껍데기(앱을 켤 때 · 앞에 올 때)도 보내므로, 열린 따라 하기 화면이 자기가 안 보낸 체크도 저장된 것으로 알게(운동 세트의
 * ~/workout/outbox.ts onSent 와 같은 꼴). 거절은 { error } 결과로 온다.
 */
type CheckListener = (p: PendingCheck, result: unknown) => void;
const resultListeners = new Set<CheckListener>();
export function onCheckResult(l: CheckListener) {
  resultListeners.add(l);
  return () => {
    resultListeners.delete(l);
  };
}

let draining = false;
/** 같은 체크에서 서버 오류가 난 횟수(메모리만) — 계정마다 */
const serverFails = new Map<string, number>();
const failKey = (x: Stored) => `${x.owner ?? ''}|${checkId(x)}`;
const SERVER_FAIL_LIMIT = 8;

/**
 * 담긴 체크를 마친 순서대로 하나씩 보낸다 — 웹 lib/outbox.ts drain 과 같은 규칙. 한 번에 한 줄만 돌고, 보내는 사이 새로 담긴 것도 이어 보낸다.
 * 따라 하기 화면과 껍데기(앱을 켤 때 · 앞에 올 때, native/src/app/index.tsx) 둘이 보낸다 — 결과는 onCheckResult 로 듣는 곳 모두에.
 * 'auth' 는 로그인이 풀렸다(신호 끊김과 다르게 알린다 — 로그인하면 이어 보낸다).
 */
export async function drainChecks<R>(
  send: (p: PendingCheck) => Promise<R>,
  handle: (p: PendingCheck, result: R) => void
): Promise<'done' | 'offline' | 'auth' | 'busy'> {
  if (draining) return 'busy';
  draining = true;
  try {
    await loaded;
    /* 지금 계정을 모르면 보내지 않는다 — 암케어 체크는 세션에 안 묶여 다른 계정에 그대로 남는다(2026-10-18 통합 점검). 다음 기회에 */
    if (!outboxOwner()) return 'offline';
    for (;;) {
      const owner = outboxOwner();
      /* 지금 계정 것(또는 계정을 모르고 담은 것)만 — 다른 계정 것은 그 사람이 다시 로그인할 때까지 둔다 */
      const next = [...items].filter((p) => mine(p, owner)).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
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
        if (code === 'redirect') return 'auth';
        /*
         * 서버가 잠깐 멈춘 것(500 · 504 — code 'server')도 남긴다(2026-10-18 김민). 2분쯤 오류가 이어지면 따라 하기 중 체크가 다 지워지고
         * 재활 3문항까지 막혔다 — 웹 대기열(lib/outbox.ts)처럼 쥐고 있다가 다시 보낸다. 서버가 그 체크 자체를 못 받는 것
         * (bad-body · unknown-action 같은 정해진 오류)만 여덟 번이면 뺀다.
         */
        /* 출시 전 베타에 잠긴 기능(FEATURE_LOCKED_BETA)도 지우지 않고 멈춘다(2026-10-29) */
        if (code === 'offline' || code === 'update' || code === 'server' || code === 'FEATURE_LOCKED_BETA' || code == null) return 'offline';
        const fk = failKey(next);
        const n = (serverFails.get(fk) ?? 0) + 1;
        serverFails.set(fk, n);
        if (n < SERVER_FAIL_LIMIT) return 'offline';
        serverFails.delete(fk);
        removeExact(next);
        const refused = { error: '서버가 체크 하나를 받지 못해 뺐어요. 다시 체크해 주세요.' };
        handle(plain, refused as R);
        resultListeners.forEach((l) => l(plain, refused));
        continue;
      }
      serverFails.delete(failKey(next));
      handle(plain, result);
      resultListeners.forEach((l) => l(plain, result));
      removeExact(next);
    }
  } finally {
    draining = false;
  }
}
