import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingSet, ShownSet as BaseShownSet } from '@/lib/workout/outbox';
import type { SavedSet } from '@/app/actions/workout';
import type { LoadStatus } from '@/lib/workout/load/recorded';
import { outcomeOf } from '@/lib/workout/load/protocol';

/**
 * 아직 서버에 못 보낸 세트를 폰에 맡겨 두는 곳 — 앱 판. 웹(lib/workout/outbox.ts · lib/outbox.ts)은 localStorage 라 앱이 못 써서,
 * 같은 규칙을 앱 저장소(AsyncStorage)로 옮겼다:
 *   - 담는 순간 화면에 보이고(신호를 기다리지 않는다), 보내는 데 성공한 것만 뺀다.
 *   - 같은 세트(판 · 운동 · 번호)를 다시 담으면 새 값으로 바뀐다 — 서버도 그 번호로 덮어써 두 번 저장되지 않는다.
 *   - 보내다 예외(신호 없음 · 서버가 잠깐 멈춤)면 그대로 두고 멈춘다 → 'offline'.
 *   - EX-LOAD01 — 말없이 버리지 않는다. 대기열에서 빼는 것은 저장이 증명된 답(lib/workout/load/protocol.ts outcomeOf 가 'saved')뿐이다.
 *     서버의 거절 답({ error } — 이미 마친 판 · 목록에 없는 운동 · 고쳐야 하는 값 무엇이든) · 모양이 틀린 답 · 저장 확인 없는 구조화 무게 ·
 *     계정을 모르는 옛 줄이 받은 '이 계정의 판이 아님'은 빼지 않고 붙들어(held) 둔다(예전에는 거절 답이면 뺐다).
 *     붙든 줄은 보내기가 건너뛰고(뒤 세트를 막지 않는다) 운동 화면이 까닭과 함께 보인다 — 고쳐 다시 담으면 풀리고, [버리기]를 눌러야 뺀다.
 *     정해진 오류(예외)가 같은 세트에서 여덟 번 나도 빼지 않고 붙든다(예전에는 뺐다).
 *   - 보낸 결과는 듣는 화면 모두에(onSent) — 껍데기(앱을 켤 때 · 다시 볼 때)가 보내도 열린 운동 화면이 저장된 세트를 받는다.
 *   - EX-LOAD01-R1 — 나이로 버리지 않는다(예전에는 7일). 나이 · 거듭된 오류는 저장을 증명하지 못한다 — 빼는 길은 저장이 증명된 답과 사람이
 *     누른 [버리기] 둘뿐이다. 모양이 틀린 줄은 원래 값 그대로 다시 쓰고(보내지 않는다), 저장 칸이 깨졌거나 배열이 아니면 그 원래 글자를
 *     다음 쓰기 전에 옮겨 둔다(QUARANTINE_KEY — 옮기지 못하면 원래 칸을 덮지 않는다). 둘 다 복구 화면(app/workout-recovery.tsx)이 수만 보이고
 *     사람이 버린다. 쓰기는 앱을 켤 때 읽기(loaded)가 끝난 뒤에만 한다 — 읽기 전에 담긴 세트가 지난 세트를 덮지 않게.
 * 화면(useSyncExternalStore)은 subscribe · snapshot 으로 읽는다.
 */
export type { PendingSet };
type SetKey = Pick<PendingSet, 'sessionId' | 'exerciseId' | 'setNo'>;

const KEY = 'bullpen-workout:pending-sets:v1';
/** EX-LOAD01-R1 — 깨진 저장 값을 옮겨 두는 칸(웹 lib/outbox.ts QUARANTINE_SUFFIX 와 같은 꼴) */
const QUARANTINE_KEY = `${KEY}:quarantine`;

/*
 * EX-LOAD01-R1 — 깨진 값 · 모양이 틀린 줄의 꼴과 열쇠. 웹 lib/outbox.ts 와 같은 모양이다 — 그 파일은 window 를 써서 앱이 못 부른다
 * (scripts/shared-lib-selftest.mts), 그래서 몇 줄을 여기에 같은 뜻으로 둔다.
 */
/** 옮겨 둔 깨진 저장 값 하나 — raw 는 저장소에 있던 글자 그대로 */
export type QuarantineEntry = { raw: string; foundAt: string };
/** 복구 화면이 보는 것 — malformed: 모양이 틀린 줄(원래 값 그대로) · corrupt: 깨진 저장 값(원래 글자 그대로) */
export type OutboxExtras = { malformed: readonly unknown[]; corrupt: readonly QuarantineEntry[] };
/** 모양이 틀린 줄을 가리키는 열쇠(버리기에 쓴다) */
export const extraKey = (v: unknown): string => {
  try {
    return typeof v === 'string' ? `s:${v}` : `j:${JSON.stringify(v)}`;
  } catch {
    return 'x';
  }
};
export const quarantineKey = (q: QuarantineEntry): string => `${q.foundAt}|${q.raw}`;
/** 옮겨 둔 칸의 값 읽기 — 그 칸마저 깨졌으면 그 글자 전체를 한 줄로(덮지 않고 같이 옮겨 둔다) */
function readQuarantine(raw: string | null): QuarantineEntry[] {
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
const EMPTY: readonly PendingSet[] = Object.freeze([]);
const keyText = (k: SetKey) => `${k.sessionId}|${k.exerciseId}|${k.setNo}`;
const same = (a: SetKey, b: SetKey) => a.sessionId === b.sessionId && a.exerciseId === b.exerciseId && a.setNo === b.setNo;

/** 화면에 그리는 세트 한 줄 — 저장된 세트의 무게 상태(loadStatus)까지 같이 본다(EX-LOAD01) */
export type ShownSet = BaseShownSet & { loadStatus?: LoadStatus | null };

/**
 * 담은 사람(계정) — 같은 폰에 다른 사람이 로그인해도 앞사람의 못 보낸 세트를 그 사람 이름으로 보내지 않는다(보내면 서버가 거절해 버려진다).
 * heldUnder: 계정을 모르는 옛 줄을 붙들었을 때(OWNER_UNKNOWN) 그때 로그인한 계정 — 다른 계정이 로그인하면 그 계정으로 한 번 더 보내 본다
 * ('그 계정으로 다시 로그인하면 보내요'를 지킨다). 서버에는 안 보낸다.
 */
type Stored = PendingSet & { owner?: string; heldUnder?: string };
let items: readonly Stored[] = EMPTY;
let owner: string | null = null;
/*
 * EX-LOAD01-R1 — 계정이 바뀌는 것을 듣는 곳. 복구 화면처럼 계정마다 다른 줄을 보이는 화면이 떠 있는 채로 계정이 바뀌면(로그아웃 → 다른 계정)
 * 열린 고치기 창을 닫고 다시 고른다(useSyncExternalStore(subscribeOutboxOwner, outboxOwner)).
 */
const ownerListeners = new Set<() => void>();
export function subscribeOutboxOwner(l: () => void) {
  ownerListeners.add(l);
  return () => {
    ownerListeners.delete(l);
  };
}
/** 지금 로그인한 계정 — 껍데기가 정한다(loadMe 뒤, 로그아웃 때 null). 담는 세트에 붙고, 보내기는 이 계정 것만 */
export function setOutboxOwner(id: string | null) {
  if (owner === id) return;
  owner = id;
  ownerListeners.forEach((l) => l());
}
/** 지금 계정 — 암케어 체크 대기열(~/armcare/outbox.ts)도 같은 계정 규칙을 쓴다 */
export const outboxOwner = () => owner;
/**
 * 지운 세트 — 지우는 사이에 그 세트의 보내기가 이미 가는 중이면 서버에 다시 생긴다. 지운 열쇠를 적어 두고, 그 보내기의 답이 오면 한 번 더
 * 지운다(onSent 를 듣는 화면이). 같은 세트를 다시 담으면 풀린다.
 */
const dropped = new Set<string>();
const listeners = new Set<() => void>();

/**
 * 폰 저장소 쓰기가 실패했는가 — 실패하면 세트는 메모리에만 있다(앱을 닫으면 사라질 수 있다). 화면은 이것으로 '신호 기다림'과 '이 기기에
 * 저장 못 함'을 가른다(2026-10-30 시안 07 — 메모리에만 있는 세트를 '폰에 안전하게 저장'이라고 말하지 않게). 다음 쓰기가 되면 풀린다.
 */
let persistFailed = false;
/* 쓰기 차례 — 늦게 끝난 앞 쓰기가 새 목록을 옛 목록으로 덮지 않게 하나씩 */
let writing: Promise<void> = Promise.resolve();

/** EX-LOAD01-R1 — 모양이 틀린 줄(원래 값 그대로) — 쓸 때마다 뒤에 붙여 다시 쓴다. 보내지 않는다 */
let unknownRows: readonly unknown[] = [];
/** EX-LOAD01-R1 — 저장 칸의 원래 글자가 깨졌거나 배열이 아니면 그 글자. 다음 쓰기 전에 QUARANTINE_KEY 로 옮긴다 */
let pendingCorrupt: string | null = null;
/** EX-LOAD01-R1 — 옮겨 둔 깨진 값(앱을 켤 때 읽는다) */
let quarantined: readonly QuarantineEntry[] = [];
/** EX-LOAD01-R1 — 저장 칸을 읽지 못했으면 쓰지도 않는다(읽지 못한 원래 값을 새 목록으로 덮지 않게) */
let readOk = true;
let extrasCache: OutboxExtras | null = null;

function persist() {
  writing = writing.then(async () => {
    /* 앱을 켤 때의 읽기가 끝나야 쓴다 — 그 전에 쓰면 지난번에 못 보낸 세트를 덮는다 */
    await loaded;
    const now = items;
    try {
      if (!readOk) throw new Error('읽지 못한 저장 칸은 덮지 않는다');
      if (pendingCorrupt != null) {
        /* 깨진 원래 값을 먼저 옮긴다 — 옮기지 못하면(던짐) 원래 칸을 덮지 않는다 */
        const corrupt = pendingCorrupt;
        const q = readQuarantine(await AsyncStorage.getItem(QUARANTINE_KEY));
        q.push({ raw: corrupt, foundAt: new Date().toISOString() });
        await AsyncStorage.setItem(QUARANTINE_KEY, JSON.stringify(q));
        if (pendingCorrupt === corrupt) pendingCorrupt = null;
        quarantined = q;
        extrasCache = null;
      }
      const all = [...now, ...unknownRows];
      if (all.length) await AsyncStorage.setItem(KEY, JSON.stringify(all));
      else await AsyncStorage.removeItem(KEY);
      if (persistFailed) {
        persistFailed = false;
        listeners.forEach((l) => l());
      }
    } catch {
      /* 못 쓰면 메모리에만 — 이 화면을 닫기 전까지는 똑같이 보낸다. 화면이 알린다 */
      if (!persistFailed) {
        persistFailed = true;
        listeners.forEach((l) => l());
      }
    }
  });
  return writing;
}

function set(next: readonly Stored[]) {
  items = next;
  listeners.forEach((l) => l());
  void persist();
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
 * EX-LOAD01-R1 — 나이로 거르지 않는다. 모양이 틀린 줄은 unknownRows 로, 깨진 값 · 배열이 아닌 값은 pendingCorrupt 로 쥔다(버리지 않는다).
 */
const loaded: Promise<void> = (async () => {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(KEY);
  } catch {
    readOk = false;
    return;
  }
  try {
    quarantined = readQuarantine(await AsyncStorage.getItem(QUARANTINE_KEY));
  } catch {
    quarantined = [];
  }
  let parsed: unknown = [];
  if (raw != null) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    if (!Array.isArray(parsed)) {
      pendingCorrupt = raw;
      parsed = [];
    }
  }
  const stored: PendingSet[] = [];
  const unknown: unknown[] = [];
  for (const v of parsed as unknown[]) {
    if (isPending(v)) stored.push(v);
    else unknown.push(v);
  }
  unknownRows = unknown;
  extrasCache = null;
  const extra = stored.filter((s) => !items.some((x) => same(x, s)));
  if (extra.length) set([...extra, ...items]);
  else listeners.forEach((l) => l());
})().catch(() => undefined);

const EMPTY_EXTRAS: OutboxExtras = Object.freeze({ malformed: Object.freeze([]), corrupt: Object.freeze([]) });

export const outbox = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  snapshot: (): readonly PendingSet[] => items,
  /** EX-LOAD01-R1 — 앱을 켤 때의 읽기가 끝날 때까지(복구 화면 · 시험) */
  ready: (): Promise<void> => loaded,
  /** EX-LOAD01-R1 — 복구 화면: 모양이 틀린 줄 · 깨진 저장 값(보내지 않는다). 바뀌지 않았으면 같은 묶음 */
  extras(): OutboxExtras {
    if (extrasCache) return extrasCache;
    const corrupt = pendingCorrupt != null ? [...quarantined, { raw: pendingCorrupt, foundAt: '' }] : quarantined;
    extrasCache = unknownRows.length || corrupt.length ? { malformed: unknownRows, corrupt } : EMPTY_EXTRAS;
    return extrasCache;
  },
  /** EX-LOAD01-R1 — 모양이 틀린 줄 하나를 사람이 버린다(확인을 받은 뒤, extraKey 로 가리킴) */
  discardMalformed(k: string): boolean {
    const i = unknownRows.findIndex((v) => extraKey(v) === k);
    if (i < 0) return false;
    unknownRows = unknownRows.filter((_, n) => n !== i);
    extrasCache = null;
    set(items);
    return true;
  },
  /** EX-LOAD01-R1 — 깨진 저장 값 하나를 사람이 버린다(확인을 받은 뒤, quarantineKey 로 가리킴) */
  async discardCorrupt(k: string): Promise<boolean> {
    await loaded;
    if (pendingCorrupt != null && quarantineKey({ raw: pendingCorrupt, foundAt: '' }) === k) {
      pendingCorrupt = null;
      extrasCache = null;
      set(items);
      return true;
    }
    const i = quarantined.findIndex((x) => quarantineKey(x) === k);
    if (i < 0) return false;
    const next = quarantined.filter((_, n) => n !== i);
    try {
      if (next.length) await AsyncStorage.setItem(QUARANTINE_KEY, JSON.stringify(next));
      else await AsyncStorage.removeItem(QUARANTINE_KEY);
    } catch {
      return false;
    }
    quarantined = next;
    extrasCache = null;
    listeners.forEach((l) => l());
    return true;
  },
  /**
   * EX-LOAD01-R1 — 계정 표시가 없는 줄에 지금 계정을 붙인다. **서버가 그 판이 이 계정의 것이라고 확인한 뒤에만**(복구 화면의 '내 기록으로
   * 확인하기' — workout.finishStatus 로 판 번호만 묻는 읽기, 세트 내용은 보내지 않는다). 이미 계정 표시가 있으면 바꾸지 않는다(false).
   * 계정을 몰라 붙든 표(OWNER_UNKNOWN)만 풀고 값 · 누른 시각은 그대로.
   */
  bindOwner(k: SetKey, expectOwner?: string | null): boolean {
    const cur = items.find((x) => same(x, k));
    if (!cur || !owner || cur.owner) return false;
    /* 화면이 확인한 계정과 지금 계정이 다르면(그사이 계정이 바뀜) 붙이지 않는다 */
    if (expectOwner !== undefined && expectOwner !== owner) return false;
    const next: Stored = { ...cur, owner };
    if (next.held?.code === 'OWNER_UNKNOWN') {
      delete next.held;
      delete next.heldUnder;
    }
    set(items.map((x) => (x === cur ? next : x)));
    return true;
  },
  /**
   * EX-LOAD01-R1 — [다시 보내기]: 붙든 표만 풀어 다음 보내기가 고르게 한다. 값 · 누른 시각 · 담은 계정은 그대로(날짜를 바꾸지 않는다).
   * 서버가 또 받지 않으면 같은 원래 값이 다시 붙들린다. 지금 계정의 줄만 — 다른 계정 · 계정 모르는 줄은 false.
   */
  release(k: SetKey, expectOwner?: string | null): boolean {
    const cur = items.find((x) => same(x, k));
    if (!cur || !owner || cur.owner !== owner) return false;
    if (expectOwner !== undefined && expectOwner !== owner) return false;
    serverFails.delete(keyText(k));
    if (!cur.held) return true;
    const next: Stored = { ...cur };
    delete next.held;
    delete next.heldUnder;
    set(items.map((x) => (x === cur ? next : x)));
    return true;
  },
  /** 담는다 — 같은 세트가 있으면 새 값으로. 고쳐 다시 담으면 붙든 표시(held)는 풀린다(새 값을 다시 보낸다) */
  add(p: PendingSet) {
    dropped.delete(keyText(p));
    serverFails.delete(keyText(p));
    const fresh: Stored = { ...p };
    delete fresh.held;
    delete fresh.heldUnder;
    delete fresh.owner;
    set([...items.filter((x) => !same(x, p)), owner ? { ...fresh, owner } : fresh]);
  },
  /**
   * [버리기] — 붙든(held) 세트를 사람이 버린다. 폰에서만 뺀다(서버에 이미 있는 값은 그대로 — 옛 서버가 횟수만 받았으면 그 줄은 남는다).
   * 말없이 버리는 곳은 없다 — 이 단추만 뺀다.
   */
  discard(k: SetKey) {
    serverFails.delete(keyText(k));
    if (items.some((x) => same(x, k))) set(items.filter((x) => !same(x, k)));
  },
  /**
   * EX-LOAD01-R1 — 복구 화면의 [버리기]: 줄의 계정이 맞고 지금 계정이 그대로일 때만. expectOwner 가 계정이면 그 계정이 담은 줄을(지금 로그인한
   * 계정도 그 계정이어야), null 이면 계정 표시가 없는 줄만 버린다. 다른 계정이 담은 줄은 이 길로 버리지 않는다(수만 보인다).
   */
  discardOwned(k: SetKey, expectOwner: string | null, screenOwner: string | null): boolean {
    const cur = items.find((x) => same(x, k));
    if (!cur || !owner || screenOwner !== owner) return false;
    const o = cur.owner ?? null;
    if (o !== expectOwner || (expectOwner != null && expectOwner !== owner)) return false;
    serverFails.delete(keyText(k));
    set(items.filter((x) => x !== cur));
    return true;
  },
  /**
   * EX-LOAD01-R1 — 복구 화면의 [고치기]: 같은 세트(판 · 운동 · 번호)를 고친 값으로 바꾼다. 화면을 연 계정(expectOwner) · 지금 계정 · 그 줄을 담은
   * 계정이 모두 같을 때만 — 줄의 계정을 그대로 둔다(지금 계정으로 새로 찍지 않는다). 붙든 표는 풀린다. 아니면 false(아무것도 바꾸지 않음).
   */
  correct(k: SetKey, next: PendingSet, expectOwner: string | null): boolean {
    const cur = items.find((x) => same(x, k));
    if (!cur || !owner || expectOwner !== owner || cur.owner !== owner || !same(next, k)) return false;
    const fixed: Stored = { ...next, owner: cur.owner };
    delete fixed.held;
    delete fixed.heldUnder;
    dropped.delete(keyText(k));
    serverFails.delete(keyText(k));
    set(items.map((x) => (x === cur ? fixed : x)));
    return true;
  },
  /** 사람이 지운 세트 — 빼고, 가는 중인 보내기의 답을 알아보게 적어 둔다 */
  drop(k: SetKey) {
    dropped.add(keyText(k));
    if (items.some((x) => same(x, k))) set(items.filter((x) => !same(x, k)));
  },
  isDropped: (k: SetKey) => dropped.has(keyText(k)),
  /** 폰 저장소에 못 쓴 상태인가 — subscribe 로 바뀜을 듣는다 */
  persistFailed: () => persistFailed,
  /** 저장소 쓰기를 다시 해 본다 — 되면 풀린다 */
  retryPersist: () => persist().then(() => !persistFailed),
  /** 보내는 중인 것이 끝날 때까지 — 마치기 창이 '못 보낸 세트'를 견주기 전에 가는 중인 보내기를 기다린다 */
  idle: (): Promise<void> => drainRun,
  remove(k: SetKey) {
    if (items.some((x) => same(x, k))) set(items.filter((x) => !same(x, k)));
  },
};

let draining = false;
/** 지금 도는 보내기(없으면 끝난 약속) — outbox.idle 이 기다린다 */
let drainRun: Promise<void> = Promise.resolve();
/** 같은 세트에서 정해진 오류가 난 횟수 — 여덟이면 붙든다(메모리만, 앱을 다시 켜면 다시 센다) */
const serverFails = new Map<string, number>();
/* 여덟 번(운동 화면은 15초마다 — 약 2분) — 배포 중 잠깐 나는 오류로 세트를 붙들지 않을 만큼 */
const SERVER_FAIL_LIMIT = 8;
/** 붙든 세트를 이 계정으로 보내도 되나 — 계정을 모르는 옛 줄(OWNER_UNKNOWN)만, 붙든 때와 다른 계정이 로그인했을 때 한 번 더 */
const sendable = (p: Stored) => !p.held || (p.held.code === 'OWNER_UNKNOWN' && p.heldUnder !== owner);
/** 그 세트를 붙든다 — 보내는 사이 사람이 같은 세트를 고쳐 다시 담았으면(새 값) 새 값을 남기고 그것을 다음에 보낸다 */
function hold(sentItem: Stored, code: string, message: string) {
  const now = items.find((x) => same(x, sentItem));
  if (!now || (now !== sentItem && JSON.stringify(now) !== JSON.stringify(sentItem))) return;
  const held: Stored = { ...sentItem, held: { code, message, at: new Date().toISOString() } };
  if (code === 'OWNER_UNKNOWN' && owner) held.heldUnder = owner;
  else delete held.heldUnder;
  set(items.map((x) => (x === now ? held : x)));
}
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
  let finish: () => void = () => undefined;
  drainRun = new Promise<void>((r) => (finish = r));
  try {
    await loaded;
    /* 지금 계정을 모르면 보내지 않는다 — 계정 없이 담은 줄이 다른 사람 쿠키로 나갈 수 있다(2026-10-18 통합 점검). 다음 기회에 */
    if (!owner) return 'offline';
    for (;;) {
      /*
       * 지금 계정 것만 — 다른 계정 것은 그 사람이 다시 로그인할 때까지 둔다. 붙든 줄(held)은 건너뛴다(사람이 고치거나 버릴 때까지 — 뒤 세트를
       * 막지 않는다). EX-LOAD01-R1 — 계정을 모르고 담은 줄도 보내지 않는다(예전에는 누구로든 보냈다 — 다른 사람의 세트 내용이 지금 계정으로
       * 서버에 갔다). 지우지도, 저절로 지금 계정 것으로 삼지도 않는다. 복구 화면이 판 번호만 서버에 물어 확인한 줄만 계정을 붙인다(bindOwner).
       */
      const next = [...items]
        .filter((p) => p.owner === owner && sendable(p))
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
      if (!next) return 'done';
      /* 담은 사람 · 붙든 표시는 폰 것 — 서버에는 안 보낸다 */
      const plain: PendingSet = { ...next };
      delete (plain as Stored).owner;
      delete (plain as Stored).heldUnder;
      delete plain.held;
      let result: R;
      try {
        result = await send(plain);
      } catch (e) {
        /* 신호 없음 · 다시 로그인 · 앱 업데이트는 나중에 다시. 그 밖(서버가 처리 못 함 — 500 · 모르는 동작 · 틀린 값)만 센다 */
        const code = (e as { code?: unknown })?.code;
        /* 서버가 잠깐 멈춘 것(500 — 'server') · 문 앞에서 막힌 것('http')도 남긴다(암케어 대기열과 같게, 2026-10-18 김민) — 2분 오류에 세트가 지워졌다 */
        /* 출시 전 베타에 잠긴 기능(FEATURE_LOCKED_BETA)도 지우지 않고 멈춘다 — 정책이 풀리면 그때 보낸다(2026-10-29) */
        if (code === 'offline' || code === 'redirect' || code === 'update' || code === 'server' || code === 'http' || code === 'FEATURE_LOCKED_BETA' || code == null)
          return 'offline';
        const n = (serverFails.get(keyText(next)) ?? 0) + 1;
        serverFails.set(keyText(next), n);
        if (n < SERVER_FAIL_LIMIT) return 'offline';
        /* 서버가 이 세트를 계속 못 받는다 — 빼지 않고 붙들어 화면에 보인다(고치거나 버린다). 뒤 세트는 이어서 보낸다 */
        serverFails.delete(keyText(next));
        hold(next, 'SEND_FAILED', '서버가 이 세트를 계속 받지 못했어요. 고쳐서 다시 남기거나 버려 주세요.');
        continue;
      }
      serverFails.delete(keyText(next));
      /*
       * EX-LOAD01 — 답을 보고 뺄지 붙들지 정한다(웹 대기열과 같은 판단). 저장이 증명된 답('saved')만 빼고, 그 밖(거절 답 · 틀린 모양 ·
       * 구조화 무게의 저장 확인 없음 · 계정을 모르는 줄의 '이 계정의 판이 아님')은 붙든다. 붙든 것은 '보낸 결과'로 알리지 않는다
       * (화면은 대기열을 읽어 붙든 줄을 까닭과 함께 보인다).
       */
      const outcome = outcomeOf(plain, result, next.owner === owner);
      if (outcome.kind === 'held') {
        hold(next, outcome.code, outcome.message);
        continue;
      }
      handle(next, result);
      sentSubs.forEach((f) => f(next, result));
      const now = items.find((x) => same(x, next));
      if (now === next || JSON.stringify(now) === JSON.stringify(next)) outbox.remove(next);
    }
  } finally {
    draining = false;
    finish();
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
      /* EX-LOAD01 — 담은 밴드 · 무게 · 변형 · 붙든 까닭도 같이(신호 없이도 고른 밴드가 줄에 보인다) */
      ...(p.load !== undefined ? { load: p.load } : {}),
      ...(p.variant !== undefined ? { variant: p.variant } : {}),
      ...(p.held ? { held: p.held } : {}),
      pending: true,
    })),
  ];
}
