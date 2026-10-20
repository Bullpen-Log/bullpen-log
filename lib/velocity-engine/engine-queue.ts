/**
 * 앱 계산기(app/velocity-engine/engine-client.tsx)의 줄 — 클립을 한 번에 하나씩 잰다(폰에서 둘을 같이 재면 서로 느려진다).
 *
 * 앱이 시한에 포기한 일(abort)은 차례가 와도 하지 않고 'skipped' 만 알린다. 예전엔 포기한 일도 끝까지 해, 앱이 그사이 보낸 새 훑기 ·
 * 재기가 그 뒤에 끝없이 쌓였다 — 한 번 늦어지면 그 뒤 모든 공이 시한에 걸려 새 앱에서는 '인식'이 한 번도 안 떴다(2026-10-20 금윤호 실내).
 * 시작을 알려 달라는 일(ack)은 차례가 오면 'start' 를 보낸다 — 앱이 시한을 줄 선 때가 아니라 시작한 때부터 잰다.
 * 이미 돌고 있는 일은 멈추지 못한다(엔진에 끊을 곳이 없다) — 그 뒤에 선 일만 건너뛴다.
 */
export type QueueSignal = { t: 'start' | 'skipped'; id: number };

export function createEngineQueue(send: (m: QueueSignal) => void) {
  let tail: Promise<void> = Promise.resolve();
  /** 줄에 서서 아직 시작 안 한 일 · 그중 앱이 포기한 일 · 시작을 알려 달라는 일 */
  const waiting = new Set<number>();
  const aborted = new Set<number>();
  const wantsStart = new Set<number>();
  return {
    /** 줄 끝에 선다. 차례가 오면 work 를 돌린다(포기됐으면 건너뜀). 돌려준 약속은 이 일이 끝나거나 건너뛴 때 풀린다 */
    run(id: number, ack: boolean, work: () => Promise<void>): Promise<void> {
      waiting.add(id);
      if (ack) wantsStart.add(id);
      tail = tail.then(async () => {
        waiting.delete(id);
        const ackHere = wantsStart.delete(id);
        if (aborted.delete(id)) return send({ t: 'skipped', id });
        if (ackHere) send({ t: 'start', id });
        await work().catch(() => undefined);
      });
      return tail;
    },
    /** 앱이 포기했다 — 줄에 서 있으면 건너뛰게, 이미 돌거나 끝났으면 할 것이 없다(답이 늦게 가도 앱이 버린다) */
    abort(id: number) {
      if (waiting.has(id)) aborted.add(id);
    },
  };
}
