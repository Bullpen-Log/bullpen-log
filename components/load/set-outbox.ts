/**
 * EX-LOAD01 — 웹의 운동 세트 대기열 보내기(운동 화면 · 앱 어디서든 보내는 SendPendingSets 가 같이 쓴다). 순수 — React 를 부르지 않는다.
 *
 * - 계정 표시(owner): 운동 화면이 담는 세트에 지금 계정 id 를 붙인다. 보내기는 지금 계정의 줄만 보낸다 — 다른 계정의 줄은 손대지 않는다
 *   (계정을 바꿔도 서로의 세트를 보내거나 지우지 않는다).
 * - EX-LOAD01-R1 — 계정 표시가 없는 줄(옛 줄)은 **보내지 않는다**(예전에는 누구로든 보내고 서버의 '이 계정의 판이 아님'을 보고 붙들었다 —
 *   그것도 다른 사람의 세트 내용을 지금 계정으로 서버에 보낸 것이다). 지우지도, 저절로 지금 계정 것으로 삼지도 않는다. 복구 화면에서 사람이
 *   '내 기록으로 확인하기'를 누르면 세트 내용 없이 판 번호만 서버에 물어(읽기만) 이 계정의 판으로 확인된 줄만 계정을 붙인다(outbox.bindOwner).
 * - 붙들기: 보낸 답을 lib/workout/load/protocol.ts outcomeOf 로 본다. 'held'(고쳐야 하는 거절 · 옛 서버가 새 칸을 모르고 지나침 ·
 *   계정을 모르는 줄의 '이 계정의 판이 아님')이면 지우지 않고 held 표를 붙여 둔다. 붙들린 줄은 보내지 않고 화면이 보인다.
 */

import { drainVia, type HoldMark } from '@/lib/outbox';
import { outbox, type PendingSet } from '@/lib/workout/outbox';
import { outcomeOf } from '@/lib/workout/load/protocol';

/** 계정 표시가 붙은 세트 — 칸은 대기열 줄에 그대로 실려 저장된다 */
export type OwnedSet = PendingSet & { owner?: string | null };

/** 줄을 담은 계정 — 모르면(옛 줄) null */
export function ownerOfSet(p: PendingSet): string | null {
  const o = (p as OwnedSet).owner;
  return typeof o === 'string' && o.length > 0 ? o : null;
}

/** 지금 계정을 붙인다. 계정을 모르면 그대로 */
export function withOwner<T extends PendingSet>(p: T, owner: string | null | undefined): T {
  return owner ? ({ ...p, owner } as T) : p;
}

/** 이 계정이 보내도 되는 줄인가 — 같은 계정이라고 표시된 줄만(표시가 없는 줄 · 계정을 모를 때는 보내지 않는다) */
export function sendableBy(owner: string | null) {
  return (p: PendingSet): boolean => {
    const o = ownerOfSet(p);
    return owner != null && o === owner;
  };
}

/** 담은 계정이 지금 계정과 같다고 '아는가' — 표시가 없으면 모른다(false) */
export function ownerKnownSame(p: PendingSet, owner: string | null): boolean {
  const o = ownerOfSet(p);
  return o != null && owner != null && o === owner;
}

/** 답을 보고 붙들 줄 — 붙들어야 하면 held 표를 붙인 줄, 아니면 null(예전처럼 뺀다) */
export function heldVersion(p: PendingSet, result: unknown, owner: string | null, now: Date = new Date()): PendingSet | null {
  const o = outcomeOf(p, result, ownerKnownSame(p, owner));
  if (o.kind !== 'held') return null;
  const held: HoldMark = { code: o.code, message: o.message, at: now.toISOString() };
  return { ...p, held };
}

/** 붙들린 줄인가(화면용) */
export function heldOf(p: { held?: PendingSet['held'] }): HoldMark | null {
  return p.held ?? null;
}

/**
 * 세트를 보낸다 — sessionId 를 주면 그 판의 것만(운동 화면), 안 주면 모든 판의 것(SendPendingSets). 붙들린 줄 · 다른 계정의 줄은 건너뛴다.
 * box 는 시험에서 새로 불러온 대기열을 넘길 때만.
 */
export function drainSets<R>(a: {
  owner: string | null;
  sessionId?: string;
  send: (p: PendingSet) => Promise<R>;
  handle: (p: PendingSet, result: R) => void;
  rethrow?: (err: unknown) => void;
  box?: { snapshot: () => readonly PendingSet[] };
}): Promise<'done' | 'offline' | 'busy'> {
  const mine = sendableBy(a.owner);
  return drainVia<PendingSet, R>(
    a.box ?? outbox,
    (p) => (a.sessionId == null || p.sessionId === a.sessionId) && mine(p),
    a.send,
    a.handle,
    a.rethrow,
    { holdAs: (p, r) => heldVersion(p, r, a.owner) }
  );
}
