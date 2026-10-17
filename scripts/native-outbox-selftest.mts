/**
 * 아이폰 앱 운동 세트 대기열(native/src/workout/outbox.ts)의 시험 — `npm run native-outbox:test`.
 * 신호가 약한 체육관에서 세트를 잃지 않게 하는 곳이라 규칙을 못 박아 둔다: 성공한 것만 빼기 · 신호 없음은 남기기 · 서버 오류 여덟 번이면 빼고 알리기 ·
 * 다른 계정 것은 안 보내기(계정 표시는 서버에 안 감) · 지운 세트 표시 · 같은 세트는 새 값으로.
 */
import { drainOutbox, onSent, outbox, setOutboxOwner, type PendingSet } from '~/workout/outbox';

let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    fail++;
    console.log(`✗ ${msg}`);
  } else console.log(`✓ ${msg}`);
};
const set = (n: number, extra: Partial<PendingSet> = {}): PendingSet => ({
  sessionId: 's1',
  exerciseId: `ex${n}`,
  setNo: 1,
  weightKg: 50,
  reps: 5,
  holdSeconds: null,
  recordedAt: new Date(Date.now() + n).toISOString(),
  ...extra,
});
const err = (code: string) => Object.assign(new Error(code), { code });
const keyOf = (p: PendingSet) => `${p.sessionId}|${p.exerciseId}|${p.setNo}`;
const pending = () => outbox.snapshot().map(keyOf);

/* 1. 보내기에 성공하면 빼고, 결과를 듣는 곳 모두에 알린다 */
setOutboxOwner('A');
outbox.add(set(1));
const heard: string[] = [];
const off = onSent((p) => heard.push(keyOf(p)));
let r = await drainOutbox(async () => ({ sets: [] }), () => undefined);
ok(r === 'done' && pending().length === 0, '성공한 세트는 대기열에서 빠진다');
ok(heard.includes('s1|ex1|1'), '보낸 결과를 onSent 로 듣는다(껍데기가 보내도 열린 화면이 안다)');

/* 2. 신호 없음은 남기고 멈춘다 */
outbox.add(set(2));
r = await drainOutbox(async () => {
  throw err('offline');
}, () => undefined);
ok(r === 'offline' && pending().includes('s1|ex2|1'), '신호 없음이면 세트를 남긴다');

/* 3. 서버 오류는 같은 세트에서 여덟 번이면 빼고 알린다(일곱 번까지는 남김) */
let errors = 0;
const heardErr: unknown[] = [];
const off2 = onSent((_p, res) => heardErr.push(res));
for (let i = 0; i < 7; i++) {
  await drainOutbox(async () => {
    errors++;
    throw err('server');
  }, () => undefined);
}
ok(pending().includes('s1|ex2|1') && errors === 7, '서버 오류 일곱 번까지는 남긴다');
await drainOutbox(async () => {
  throw err('server');
}, () => undefined);
ok(!pending().includes('s1|ex2|1'), '서버 오류 여덟 번째에 뺀다');
ok(heardErr.some((x) => typeof x === 'object' && x != null && 'error' in x), '빼면서 화면에 오류로 알린다');
off2();

/* 4. 다른 계정이 담은 세트는 보내지 않고, 보낼 때 계정 표시는 서버에 안 간다 */
setOutboxOwner('A');
outbox.add(set(3));
setOutboxOwner('B');
let sent: PendingSet[] = [];
r = await drainOutbox(async (p) => {
  sent.push(p);
  return { sets: [] };
}, () => undefined);
ok(r === 'done' && sent.length === 0 && pending().includes('s1|ex3|1'), '다른 계정(B)으로는 A 의 세트를 안 보낸다');
setOutboxOwner('A');
sent = [];
r = await drainOutbox(async (p) => {
  sent.push(p);
  return { sets: [] };
}, () => undefined);
ok(sent.length === 1 && !('owner' in sent[0]), 'A 로 돌아오면 보내고, 계정 표시(owner)는 빼고 보낸다');
setOutboxOwner(null);
outbox.add(set(4));
setOutboxOwner('C');
sent = [];
await drainOutbox(async (p) => {
  sent.push(p);
  return { sets: [] };
}, () => undefined);
ok(sent.length === 1, '계정을 모르고 담은 세트는 누구로든 보낸다(옛 줄)');

/* 5. 같은 세트를 다시 담으면 새 값 하나 · 지운 세트 표시는 다시 담으면 풀린다 */
setOutboxOwner('A');
outbox.add(set(5, { reps: 5 }));
outbox.add(set(5, { reps: 8 }));
ok(outbox.snapshot().filter((p) => p.exerciseId === 'ex5').length === 1 && outbox.snapshot().find((p) => p.exerciseId === 'ex5')?.reps === 8, '같은 세트는 새 값 하나로');
const k5 = { sessionId: 's1', exerciseId: 'ex5', setNo: 1 };
outbox.drop(k5);
ok(!pending().includes('s1|ex5|1') && outbox.isDropped(k5), '지운 세트는 빠지고 지운 표시가 남는다');
outbox.add(set(5));
ok(!outbox.isDropped(k5), '다시 담으면 지운 표시가 풀린다');

off();
console.log(fail ? `실패 ${fail}` : '모두 통과');
if (fail) process.exit(1);
