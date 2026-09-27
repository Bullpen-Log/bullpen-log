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

import { createOutbox } from '@/lib/outbox';

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

const box = createOutbox<PendingSet, SetKey>({
  key: 'bullpen-log:pending-sets:v1',
  isItem: isPendingSet,
  /* 같은 세트 — 판·운동·번호가 같다. 다시 담으면 새 값으로 바뀐다(저장된 세트 고치기) */
  same: (a, b) =>
    a.sessionId === b.sessionId && a.exerciseId === b.exerciseId && a.setNo === b.setNo,
});

export const outbox = {
  subscribe: box.subscribe,
  snapshot: box.snapshot,
  serverSnapshot: box.serverSnapshot,
  add: box.add,
  remove: box.remove,
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
  rethrow: (err: unknown) => void = () => {}
): Promise<'done' | 'offline' | 'busy'> {
  return box.drain((p) => p.sessionId === sessionId, send, handle, rethrow);
}
