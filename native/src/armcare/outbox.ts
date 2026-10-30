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
 *
 * 저장 상태(2026-10-30 암케어 완료 화면) — '수행했다'와 '저장됐다'를 가른다:
 *   - 폰 보관: 쓰기를 차례로만 한다(앞 쓰기가 끝난 뒤 다음 — 늦게 끝난 옛 배열이 새 대기열을 덮지 않게). 줄마다 마지막으로 디스크에 들어간 배열에
 *     있으면 'durable', 쓰는 중이면 'writing', 마지막 쓰기가 실패했고 디스크에 없으면 'failed'(메모리에만 — 앱을 닫으면 사라질 수 있다).
 *   - 영수증: 서버의 성공 답(또는 같은 날 · 운동 조회로 확인)이 있어야 'saved'. 대기열에서 사라졌다는 것만으로는 저장이 아니다. 서버가 답으로
 *     거절하면 'refused'(까닭과 함께, 메모리 — 앱을 다시 켜면 남지 않는다). 영수증은 계정마다 따로다.
 *   - 해제 의도(undo): 한 번이라도 보낸(또는 보내는 중인) 체크를 풀면 줄을 지우지 않고 '해제' 줄로 바꿔 서버에도 해제를 보낸다 — 지우기만 하면
 *     이미 간 요청이 나중에 저장돼 푼 체크가 되살아났다. 해제 뒤 늦게 온 성공 답은 저장으로 세지 않는다.
 */
export type { PendingCheck };
/** 앱 대기열의 한 줄 — 해제 의도면 undo(서버에 setExerciseDone(false)) */
export type NativeCheck = PendingCheck & { undo?: true };
type Stored = NativeCheck & { owner?: string; /** 한 번이라도 서버로 보냈다(답을 못 받았어도) */ tried?: true };
type CheckKey = Pick<PendingCheck, 'exerciseId' | 'dateKey'>;

export type CheckStorage = 'durable' | 'writing' | 'failed';
export type CheckEntryState = { undo: boolean; storage: CheckStorage; tried: boolean };
export type CheckReceipt = { status: 'saved' } | { status: 'refused'; message: string };

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
const receiptKey = (owner: string | null | undefined, k: CheckKey) => `${owner ?? ''}|${checkId(k)}`;

let items: readonly Stored[] = EMPTY;
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

/*
 * 폰 저장소 — 시험이 실패를 넣을 수 있게 한 곳으로(scripts/native-check-outbox-selftest.mts). 앱은 AsyncStorage 그대로.
 */
export const checkStorage = {
  get: (k: string) => AsyncStorage.getItem(k),
  set: (k: string, v: string) => AsyncStorage.setItem(k, v),
  remove: (k: string) => AsyncStorage.removeItem(k),
};

/** 마지막으로 디스크에 들어간 배열 — 줄이 여기 있으면 영속 보관됨 */
let onDisk: readonly Stored[] = EMPTY;
let writes = 0;
let lastWriteFailed = false;
let chain: Promise<unknown> = Promise.resolve();

/** 지금 대기열을 디스크에 쓴다 — 앞 쓰기가 끝난 뒤에(차례). 결과: 디스크에 들어갔나 */
function persist(snap: readonly Stored[]): Promise<boolean> {
  writes++;
  const run = chain.then(() => (snap.length ? checkStorage.set(KEY, JSON.stringify(snap)) : checkStorage.remove(KEY)));
  const done = run.then(
    () => {
      onDisk = snap;
      lastWriteFailed = false;
      return true;
    },
    () => {
      lastWriteFailed = true;
      return false;
    }
  );
  chain = done.finally(() => {
    writes--;
    emit();
  });
  return chain.then(() => done);
}

function set(next: readonly Stored[]): Promise<boolean> {
  items = next;
  emit();
  return persist(next);
}

const isCheck = (v: unknown): v is Stored => {
  const p = v as Record<string, unknown> | null;
  return !!p && typeof p.exerciseId === 'string' && typeof p.dateKey === 'string' && typeof p.recordedAt === 'string';
};

/** 앱을 켜면 한 번 읽는다. 그사이 담긴 것(메모리)이 이긴다. 보내기는 이것을 기다린다 — 안 기다리면 지난번 것을 건너뛴다 */
const loaded: Promise<void> = checkStorage
  .get(KEY)
  .then((raw) => {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - MAX_AGE_MS;
    const stored = Array.isArray(parsed) ? parsed.filter(isCheck).filter((p) => Date.parse(p.recordedAt) > cutoff) : [];
    /* 디스크에서 읽은 줄은 이미 보관된 것 */
    onDisk = stored;
    const extra = stored.filter((s) => !items.some((x) => sameEntry(x, s)));
    if (extra.length) void set([...extra, ...items]);
  })
  .catch(() => undefined);

/** 보낸 그 줄만 뺀다(같은 객체) — 보내는 사이 다시 담은 새 판 · 다른 계정 줄은 남는다 */
const removeExact = (sent: Stored) => {
  if (items.includes(sent)) void set(items.filter((x) => x !== sent));
};

/* 화면이 보는 목록 — 지금 계정 것만(다른 사람의 못 보낸 체크가 내 체크로 보이지 않게). 같은 값이면 같은 배열(useSyncExternalStore) */
let shown: { items: readonly Stored[]; owner: string | null; list: readonly Stored[] } = { items: EMPTY, owner: null, list: EMPTY };
function visible(): readonly Stored[] {
  const owner = outboxOwner();
  if (shown.items !== items || shown.owner !== owner) shown = { items, owner, list: items.filter((x) => mine(x, owner)) };
  return shown.list;
}

/** 지금 계정이 보는 그 체크의 줄 */
const entryOf = (k: CheckKey) => {
  const owner = outboxOwner();
  return items.find((x) => sameCheck(x, k) && mine(x, owner)) ?? null;
};

/** 영수증 — 계정마다 · 체크마다. 메모리(앱을 다시 켜면 비어 있다) */
const receipts = new Map<string, CheckReceipt>();
/** 보내는 중인 줄 */
let inflight: Stored | null = null;

export const checkOutbox = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** 바뀔 때마다 오르는 수 — 화면이 저장 상태를 다시 읽을 때(useSyncExternalStore) */
  version: () => version,
  /** 대기열 전체(모든 계정) */
  snapshot: (): readonly NativeCheck[] => items,
  /** 화면이 보는 것 — 지금 계정 것과 계정 모르는 옛 줄만(다른 사람의 못 보낸 체크가 내 체크로 보이지 않게). 해제 줄(undo)도 들어 있다 */
  visible: (): readonly NativeCheck[] => visible(),
  /**
   * 담긴 체크를 푼다(체크 목록에서 다시 누름). 서버에 간 적이 없으면 빼기만, 한 번이라도 보냈으면(답을 못 받았어도 저장됐을 수 있다) 해제 줄로 바꿔
   * 서버에도 해제를 보낸다. 지금 계정이 보는 줄(제 것 · 옛 줄)만.
   */
  drop(k: CheckKey): Promise<boolean> {
    const e = entryOf(k);
    if (!e || e.undo) return Promise.resolve(true);
    receipts.delete(receiptKey(e.owner ?? outboxOwner(), k));
    if (e.tried || inflight === e) {
      const undo: Stored = { exerciseId: k.exerciseId, dateKey: k.dateKey, recordedAt: new Date().toISOString(), undo: true, ...(e.owner ? { owner: e.owner } : {}) };
      return set([...items.filter((x) => x !== e), undo]);
    }
    return set(items.filter((x) => x !== e));
  },
  /** 같은 사람의 같은 체크(운동 · 날)를 다시 담으면 새것으로 — 다른 계정 줄 · 계정 모르는 옛 줄은 그대로. 결과: 폰에 보관됐나 */
  add(p: PendingCheck): Promise<boolean> {
    const owner = outboxOwner();
    const entry: Stored = owner ? { exerciseId: p.exerciseId, dateKey: p.dateKey, recordedAt: p.recordedAt, owner } : { ...p };
    receipts.delete(receiptKey(owner, p));
    return set([...items.filter((x) => !sameEntry(x, entry)), entry]);
  },
  /** 폰 보관을 다시 해 본다([다시 저장]) — 결과: 디스크에 들어갔나 */
  persistAgain: (): Promise<boolean> => persist(items),
  /** 지금 계정이 보는 그 체크의 줄 상태 — 없으면 null(보냈거나 담은 적 없음) */
  entry(k: CheckKey): CheckEntryState | null {
    const e = entryOf(k);
    if (!e) return null;
    const storage: CheckStorage = onDisk.includes(e) ? 'durable' : writes > 0 ? 'writing' : lastWriteFailed ? 'failed' : 'writing';
    return { undo: !!e.undo, storage, tried: !!e.tried || inflight === e };
  },
  /** 서버가 답한 결과(지금 계정) — 없으면 null(아직 모름) */
  receipt: (k: CheckKey): CheckReceipt | null => receipts.get(receiptKey(outboxOwner(), k)) ?? null,
  /** 같은 날 · 운동 조회로 서버 저장을 확인했다(따라 하기 루틴 다시 읽기) — 대기 줄이 없을 때만 영수증으로 */
  confirmSaved(k: CheckKey) {
    if (entryOf(k)) return;
    receipts.set(receiptKey(outboxOwner(), k), { status: 'saved' });
    emit();
  },
};

/*
 * 보낸 결과를 듣는 곳 — 껍데기(앱을 켤 때 · 앞에 올 때)도 보내므로, 열린 따라 하기 화면이 자기가 안 보낸 체크도 저장된 것으로 알게(운동 세트의
 * ~/workout/outbox.ts onSent 와 같은 꼴). 거절은 { error } 결과로 온다. 해제 줄의 결과는 p.undo 가 붙어 온다.
 */
type CheckListener = (p: NativeCheck, result: unknown) => void;
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

/** 결과를 영수증에 — 해제가 뒤에 기다리면 늦게 온 성공은 저장으로 안 센다 */
function record(sent: Stored, owner: string | null, result: unknown) {
  const key = receiptKey(sent.owner ?? owner, sent);
  const error = (result as { error?: unknown } | null)?.error;
  if (typeof error === 'string') receipts.set(key, { status: 'refused', message: error });
  else if (sent.undo) receipts.delete(key);
  else if (items.some((x) => x !== sent && sameEntry(x, sent) && x.undo)) receipts.delete(key);
  else receipts.set(key, { status: 'saved' });
  emit();
}

/**
 * 담긴 체크를 마친 순서대로 하나씩 보낸다 — 웹 lib/outbox.ts drain 과 같은 규칙. 한 번에 한 줄만 돌고, 보내는 사이 새로 담긴 것도 이어 보낸다.
 * 따라 하기 화면과 껍데기(앱을 켤 때 · 앞에 올 때, native/src/app/index.tsx) 둘이 보낸다 — 결과는 onCheckResult 로 듣는 곳 모두에.
 * 'auth' 는 로그인이 풀렸다(신호 끊김과 다르게 알린다 — 로그인하면 이어 보낸다).
 */
export async function drainChecks<R>(
  send: (p: NativeCheck) => Promise<R>,
  handle: (p: NativeCheck, result: R) => void
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
      const plain: NativeCheck = { exerciseId: next.exerciseId, dateKey: next.dateKey, recordedAt: next.recordedAt, ...(next.undo ? { undo: true as const } : {}) };
      /* 보냈다는 표시는 보내기 전에 남긴다 — 답을 못 받아도 서버에 닿았을 수 있다(그 뒤 풀면 해제를 보낸다) */
      if (!next.tried) {
        next.tried = true;
        void persist(items);
      }
      inflight = next;
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
        record(next, owner, refused);
        handle(plain, refused as R);
        resultListeners.forEach((l) => l(plain, refused));
        continue;
      } finally {
        inflight = null;
      }
      serverFails.delete(failKey(next));
      record(next, owner, result);
      handle(plain, result);
      resultListeners.forEach((l) => l(plain, result));
      removeExact(next);
    }
  } finally {
    draining = false;
  }
}

/** 시험만 — 디스크 쓰기가 다 끝날 때까지 */
export const settleWrites = () => chain;
