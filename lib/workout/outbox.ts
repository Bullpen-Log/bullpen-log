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
 * 담고 보내는 틀은 lib/outbox.ts — 따라하기의 암케어 체크와 같이 쓴다.
 */

import { createOutbox, type OutboxExtras } from '@/lib/outbox';
import { outcomeOf } from '@/lib/workout/load/protocol';
import type { RecordedLoad } from '@/lib/workout/load/recorded';

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
  /** 근력 · 파워 프로그램의 '몇 개 더?'(0~4). 마지막 세트를 같은 번호로 다시 담으며 붙인다. 없으면 서버 값을 그대로 둔다. */
  rir?: number | null;
  /** EX-LOAD01 — 새 화면이 담는 세트의 약속 번호(lib/workout/load/protocol.ts LOAD_PROTOCOL). 옛 줄에는 없다 */
  loadProtocol?: number;
  /**
   * EX-LOAD01 — 구조화한 무게(밴드 · 섞임 · 서로 다른 무게 · 기구 이름). 칸이 없으면 서버가 이미 있는 값을 그대로 둔다(없음 ≠ 지움).
   * 서버가 저장할 수 있을 때(loadCapability.structured)만 담는다.
   */
  load?: RecordedLoad | null;
  /** EX-LOAD01 — 구조화 무게를 보낼 때 함께 싣는 해석기 판(lib/workout/load/contract.ts RESOLVER_VERSION) */
  loadResolver?: number;
  /** EX-LOAD01 — 밴드/무게를 골라 하는 운동에서 이 세트에 쓴 것 */
  variant?: 'band' | 'mass' | null;
  /**
   * EX-LOAD01 — 서버가 '고쳐서 다시'라고 돌려준 세트(actionRequired) · 옛 서버가 구조화 무게를 모르고 지나친 세트. 지우지 않고 붙들어
   * 둔다 — 보내기는 이 줄을 건너뛰고, 화면이 사람에게 보인다(고쳐 다시 담으면 풀리고, 버리면 뺀다).
   */
  held?: { code: string; message: string; at: string } | null;
  /** EX-LOAD01 — 담은 계정(components/load/set-outbox.ts withOwner). 옛 줄에는 없다 — 그 줄은 누구로든 보내되 '이 계정의 판 아님'이면 붙든다 */
  owner?: string;
};

/**
 * 옛 보내기(drainOutbox · drainAllSets)도 증명된 저장만 뺀다 — 그 밖의 답(오류 · 고칠 것 · 모양이 틀린 성공 · 구조화 확인 없음)은 붙든다.
 * 계정을 모르는 보내기라 '이 계정의 판 아님'은 계정 모름으로 붙는다. 웹 화면은 components/load/set-outbox.ts drainSets 를 쓴다.
 */
function holdUnlessSaved(p: PendingSet, result: unknown): PendingSet | null {
  const o = outcomeOf(p, result, false);
  return o.kind === 'held' ? { ...p, held: { code: o.code, message: o.message, at: new Date().toISOString() } } : null;
}

type SetKey = Pick<PendingSet, 'sessionId' | 'exerciseId' | 'setNo'>;

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

const sameSet = (a: SetKey, b: SetKey) => a.sessionId === b.sessionId && a.exerciseId === b.exerciseId && a.setNo === b.setNo;

const box = createOutbox<PendingSet, SetKey>({
  key: 'bullpen-log:pending-sets:v1',
  isItem: isPendingSet,
  /* 같은 세트 — 판·운동·번호가 같다. 다시 담으면 새 값으로 바뀐다(저장된 세트 고치기) */
  same: sameSet,
  /*
   * EX-LOAD01-R1 — 못 보낸 세트는 나이로 버리지 않는다(예전에는 7일). 나이도, 거듭된 오류도 저장을 증명하지 못한다 — 빼는 길은 저장이
   * 증명된 답(outcomeOf 'saved')과 사람이 확인한 [버리기] 둘뿐이다. 모양이 틀린 줄 · 깨진 저장 값도 버리지 않고 남겨 복구 화면이 보인다
   * (app/(app)/training/recovery). 서버가 '마친 판'이라고 받지 않은 세트도 그대로 붙들어 둔다 — 그 계정의 원래 값이다.
   */
  expireAfterMs: null,
  keepUnknown: true,
});

const EMPTY_SET_EXTRAS: OutboxExtras = Object.freeze({ malformed: Object.freeze([]), corrupt: Object.freeze([]) });

export const outbox = {
  subscribe: box.subscribe,
  snapshot: box.snapshot,
  serverSnapshot: box.serverSnapshot,
  add: box.add,
  remove: box.remove,
  /** EX-LOAD01-R1 — 복구 화면: 모양이 틀린 줄 · 깨진 저장 값(보내지 않는다) */
  extras: box.extras,
  /** 서버에서 그릴 때의 extras(비어 있음) */
  serverExtras: (): OutboxExtras => EMPTY_SET_EXTRAS,
  discardMalformed: box.discardMalformed,
  discardCorrupt: box.discardCorrupt,
  /**
   * EX-LOAD01-R1 — [다시 보내기]: 붙든 표만 풀어 다음 보내기가 고르게 한다. 값 · 누른 시각 · 계정 표시는 그대로(날짜를 바꾸지 않는다).
   * 서버가 또 받지 않으면 같은 원래 값이 다시 붙들린다. 그 세트가 없으면 false.
   */
  release(k: SetKey, owner?: string | null): boolean {
    const cur = box.snapshot().find((x) => sameSet(x, k));
    if (!cur) return false;
    /* EX-LOAD01-R1 — 계정을 넘기면 그 계정이 담은 줄만(복구 화면 — 화면을 연 뒤 계정이 바뀌었으면 손대지 않는다) */
    if (owner !== undefined && (!owner || cur.owner !== owner)) return false;
    if (!cur.held) return true;
    const next: PendingSet = { ...cur };
    delete next.held;
    box.add(next);
    return true;
  },
  /** EX-LOAD01-R1 — [버리기](확인을 받은 뒤): 폰에서만 뺀다. 서버에 이미 있는 값은 그대로 */
  discard(k: SetKey) {
    box.remove(k);
  },
  /**
   * EX-LOAD01-R1 — 복구 화면의 [버리기]: 줄의 계정이 맞을 때만. owner 를 주면 그 계정이 담은 줄만, null 이면 계정 표시가 없는 줄만
   * (다른 계정이 담은 줄은 이 길로 버리지 않는다 — 수만 보인다).
   */
  discardOwned(k: SetKey, owner: string | null): boolean {
    const cur = box.snapshot().find((x) => sameSet(x, k));
    if (!cur) return false;
    const o = typeof cur.owner === 'string' && cur.owner.length > 0 ? cur.owner : null;
    if (o !== owner) return false;
    box.remove(k);
    return true;
  },
  /**
   * EX-LOAD01-R1 — 복구 화면의 [고치기]: 같은 세트(판 · 운동 · 번호)를 고친 값으로 바꾼다. 그 줄을 담은 계정(owner)이 맞을 때만 — 줄의 계정을
   * 그대로 둔다(다른 계정으로 바꿔 달지 않는다). 붙든 표는 풀린다(고친 값을 다시 보낸다). 열쇠가 다르거나 줄이 없으면 false.
   */
  correct(k: SetKey, next: PendingSet, owner: string): boolean {
    const cur = box.snapshot().find((x) => sameSet(x, k));
    if (!cur || !owner || cur.owner !== owner || !sameSet(next, k)) return false;
    const fixed: PendingSet = { ...next, owner: cur.owner };
    delete fixed.held;
    box.add(fixed);
    return true;
  },
  /**
   * EX-LOAD01-R1 — 계정 표시가 없는 옛 줄에 계정을 붙인다. **서버가 그 판이 이 계정의 것이라고 확인한 뒤에만**(복구 화면의 '내 기록으로 확인하기' —
   * 세트 내용은 보내지 않고 판 번호만 묻는 읽기). 이미 계정 표시가 있으면 바꾸지 않는다(false). 계정을 몰라 붙든 표(OWNER_UNKNOWN)만 풀고
   * 값 · 누른 시각은 그대로 둔다.
   */
  bindOwner(k: SetKey, owner: string): boolean {
    const cur = box.snapshot().find((x) => sameSet(x, k));
    if (!cur || !owner || (typeof cur.owner === 'string' && cur.owner.length > 0)) return false;
    const next: PendingSet = { ...cur, owner };
    if (next.held?.code === 'OWNER_UNKNOWN') delete next.held;
    box.add(next);
    return true;
  },
};

/** 화면에 그리는 세트 한 줄. 폰에만 있고 아직 못 보낸 것은 pending 이 붙는다. */
export type ShownSet = Omit<PendingSet, 'sessionId'> & { pending?: boolean };

/**
 * 서버에 저장된 세트 위에 폰에만 있는 세트를 겹쳐, 화면에 그릴 목록을 만든다.
 * pending 은 이 판의 것만 넘긴다.
 *
 * 같은 세트(운동·번호)가 양쪽에 다 있으면 폰 쪽이 이긴다. 저장된 세트를
 * 고치면 고친 값이 같은 번호로 먼저 폰에 담기는데, 서버 값이 이기면 신호가
 * 없는 동안 고친 것이 화면에 안 보인다 — 고쳤는지조차 알 수 없다. 보내고
 * 나면 두 값이 같아지고 폰 쪽은 빠지므로, 앞세워도 달라지는 것이 없다.
 */
export function withPending(
  saved: readonly Omit<PendingSet, 'sessionId'>[],
  pending: readonly PendingSet[]
): ShownSet[] {
  const key = (s: { exerciseId: string; setNo: number }) =>
    `${s.exerciseId}#${s.setNo}`;
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
      ...(p.load !== undefined ? { load: p.load } : {}),
      ...(p.variant !== undefined ? { variant: p.variant } : {}),
      ...(p.held ? { held: p.held } : {}),
      pending: true,
    })),
  ];
}

/**
 * 이 판의 세트를 누른 순서대로 하나씩 보낸다 — 보내는 규칙은 lib/outbox.ts 의 drain.
 * 신호가 없어 못 보낸 것은 다음 기회에 같은 번호로 다시 보내므로 두 번 저장되지 않는다.
 */
export function drainOutbox<R>(
  sessionId: string,
  send: (p: PendingSet) => Promise<R>,
  handle: (p: PendingSet, result: R) => void,
  rethrow: (err: unknown) => void = () => {},
  /** EX-LOAD01-R1 — 지금 계정. 그 계정이 담은 줄만 보낸다(모르면 아무것도 안 보낸다 — 계정 표시가 없는 줄도) */
  owner: string | null = null
): Promise<'done' | 'offline' | 'busy'> {
  return box.drain((p) => p.sessionId === sessionId && ownedBy(p, owner), send, handle, rethrow, { holdAs: holdUnlessSaved });
}

/** EX-LOAD01-R1 — 보내도 되는 줄인가: 지금 계정이 담았다고 표시된 줄만(components/load/set-outbox.ts sendableBy 와 같은 규칙) */
const ownedBy = (p: PendingSet, owner: string | null) => owner != null && typeof p.owner === 'string' && p.owner === owner;

/**
 * 모든 판의 세트를 보낸다 — 운동 화면 밖에서(components/send-pending-sets.tsx). 운동 화면은 제 판의 것만 보내서,
 * 신호 없이 운동을 마치고 나가면 신호가 돌아와도 아무도 안 보냈다.
 */
export function drainAllSets<R>(
  send: (p: PendingSet) => Promise<R>,
  handle: (p: PendingSet, result: R) => void,
  rethrow: (err: unknown) => void = () => {},
  /** EX-LOAD01-R1 — 지금 계정(위 drainOutbox 와 같은 규칙) */
  owner: string | null = null
): Promise<'done' | 'offline' | 'busy'> {
  return box.drain((p) => ownedBy(p, owner), send, handle, rethrow, { holdAs: holdUnlessSaved });
}
