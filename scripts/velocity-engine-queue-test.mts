/**
 * 앱 계산기 줄(lib/velocity-engine/engine-queue.ts) 시험 — 앱이 포기한 일은 건너뛰고, 시작을 알려 달라는 일엔 'start' 를 보낸다.
 * 2026-10-20 금윤호 실내: 포기한 일도 끝까지 해 줄이 끝없이 길어져 새 앱에서 공이 한 번도 안 재졌다.
 *   npm run velocity:queue-test
 */
import { createEngineQueue, type QueueSignal } from '../lib/velocity-engine/engine-queue.ts';

let failed = 0;
let passed = 0;
function check(ok: boolean, name: string) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* 1 — 셋을 줄 세우고, 첫째가 도는 동안 둘째를 포기한다 → 둘째는 안 돌고 skipped, 셋째는 start 뒤 돈다 */
{
  const log: string[] = [];
  const q = createEngineQueue((m: QueueSignal) => log.push(`${m.t}:${m.id}`));
  const job = (id: number, ms: number) => async () => {
    log.push(`run:${id}`);
    await wait(ms);
    log.push(`done:${id}`);
  };
  void q.run(1, true, job(1, 30));
  void q.run(2, true, job(2, 30));
  const last = q.run(3, true, job(3, 5));
  await wait(5);
  q.abort(2);
  await last;
  check(!log.includes('run:2'), `포기한 일은 돌지 않는다 — ${log.join(' ')}`);
  check(log.join(' ') === 'start:1 run:1 done:1 skipped:2 start:3 run:3 done:3', `차례 · 알림 — ${log.join(' ')}`);
}

/* 2 — 이미 도는 일은 포기해도 끝까지(엔진에 끊을 곳이 없다), 건너뜀 알림도 없다 */
{
  const log: string[] = [];
  const q = createEngineQueue((m) => log.push(`${m.t}:${m.id}`));
  const p = q.run(7, true, async () => {
    log.push('run:7');
    await wait(10);
  });
  await wait(2);
  q.abort(7);
  await p;
  check(log.join(' ') === 'start:7 run:7', `도는 일 포기 — ${log.join(' ')}`);
}

/* 3 — 옛 앱(ack 없음)은 start 를 안 받는다, 모르는 id 를 포기해도 아무 일 없다 */
{
  const log: string[] = [];
  const q = createEngineQueue((m) => log.push(`${m.t}:${m.id}`));
  q.abort(99);
  await q.run(1, false, async () => void log.push('run:1'));
  check(log.join(' ') === 'run:1', `ack 없음 · 모르는 포기 — ${log.join(' ')}`);
}

/* 4 — 일이 던져도 줄은 이어진다 */
{
  const log: string[] = [];
  const q = createEngineQueue(() => undefined);
  void q.run(1, false, async () => {
    throw new Error('x');
  });
  await q.run(2, false, async () => void log.push('run:2'));
  check(log.join(' ') === 'run:2', '앞 일이 던져도 다음 일이 돈다');
}

console.log(`\n통과 ${passed} / 실패 ${failed}`);
if (failed) process.exit(1);
