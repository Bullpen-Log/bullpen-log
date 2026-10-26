/**
 * 암케어 체크 대기열(native/src/armcare/outbox.ts)의 계정 나눔 시험 — 실제 대기열을 부른다(폰 저장소는 메모리 흉내).
 * 실행: npm run native-check-outbox:test
 * 2026-10-26 재현: B 가 같은 운동 · 날을 체크하면 A 의 못 보낸 체크가 지워짐 · A 를 보낸 답이 B 의 체크까지 뺌.
 * 실제 아이폰의 저장 · 로그아웃 흐름은 이 시험이 보지 못한다.
 */
import assert from 'node:assert/strict';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
const KEY = 'bullpen-armcare:pending-checks:v1';
const recent = (min: number) => new Date(Date.now() - 60_000 * (100 - min)).toISOString();

/* 앱을 켜기 전 폰에 남아 있던 것 — 계정 모르는 옛 줄 하나 · A 의 줄 하나(켤 때 읽기를 거치게 모듈보다 먼저 넣는다) */
// @ts-expect-error 앱 패키지라 scripts/ 에서는 타입을 못 찾는다 — 경로 해석기가 메모리 흉내로 바꾼다
const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default as {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
};
await AsyncStorage.setItem(
  KEY,
  JSON.stringify([
    { exerciseId: 'old', dateKey: '2026-10-25', recordedAt: recent(1) },
    { exerciseId: 'Y', dateKey: '2026-10-25', recordedAt: recent(2), owner: 'A' },
  ])
);
const { checkOutbox, drainChecks } = await import('~/armcare/outbox');
const { setOutboxOwner } = await import('~/workout/outbox');

const D = '2026-10-26';
const ids = () => checkOutbox.visible().map((p) => `${p.exerciseId}@${p.dateKey}`).sort();
const stored = async () => (JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as { exerciseId: string; owner?: string; recordedAt: string }[]).map((x) => `${x.owner ?? '-'}:${x.exerciseId}`).sort();
const defer = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const p = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { p, resolve, reject };
};
const offline = () => Object.assign(new Error('offline'), { code: 'offline' });

/* 0. 계정을 모르면(로그아웃 · 꺼진 망에서 켬) 아무것도 안 보내고 아무것도 안 지운다 */
setOutboxOwner(null);
eq(await drainChecks(async () => ({ ok: true }), () => undefined), 'offline', '계정 모름 — 안 보냄');
await new Promise((r) => setTimeout(r, 0));
eq(await stored(), ['-:old', 'A:Y'], '켤 때 읽은 옛 줄 · A 의 줄 그대로');

/* 1. 재현 A — A 가 X 를 D 에 체크(못 보냄) → B 가 같은 X · D 를 체크해도 A 의 체크는 남는다 */
setOutboxOwner('A');
checkOutbox.add({ exerciseId: 'X', dateKey: D, recordedAt: recent(10) });
setOutboxOwner('B');
eq(ids(), ['old@2026-10-25'], 'B 화면엔 A 의 체크가 안 보인다(옛 줄만)');
checkOutbox.add({ exerciseId: 'X', dateKey: D, recordedAt: recent(11) });
eq((await stored()).filter((x) => x.endsWith(':X')), ['A:X', 'B:X'], 'A 의 X 가 남고 B 의 X 가 따로');
/* B 가 자기 체크를 풀어도 A 의 것은 그대로 */
checkOutbox.drop({ exerciseId: 'X', dateKey: D });
eq((await stored()).filter((x) => x.endsWith(':X')), ['A:X'], 'B 의 풀기는 B 의 줄만');

/* 2. 재현 B — A 의 X 를 보내는 중에 B 로 바꿔 같은 X · D 를 체크 → A 의 답이 와도 B 의 체크는 남는다 */
setOutboxOwner('A');
const inFlight = defer<{ ok: true }>();
const sent: string[] = [];
let calls = 0;
const draining = drainChecks(
  async (p) => {
    calls++;
    sent.push(`${p.exerciseId}`);
    if (calls === 1) return inFlight.p; // 옛 줄(가장 오래됨)
    if (calls === 2) return { ok: true }; // A:Y
    if (calls === 3) return inFlight2.p; // A:X — 보내는 중
    throw offline(); // 그 뒤(B 의 줄)는 신호 없음
  },
  () => undefined
);
const inFlight2 = defer<{ ok: true }>();
inFlight.resolve({ ok: true });
await new Promise((r) => setTimeout(r, 5));
eq(sent, ['old', 'Y', 'X'], 'A 로는 옛 줄 · A 의 줄을 마친 순서대로');
/* A:X 를 보내는 사이 B 로 로그인해 같은 X · D 체크 */
setOutboxOwner('B');
checkOutbox.add({ exerciseId: 'X', dateKey: D, recordedAt: recent(20) });
/* 동시에 다른 곳(껍데기)이 보내기를 부르면 기다린다 */
eq(await drainChecks(async () => ({ ok: true }), () => undefined), 'busy', '동시 보내기는 하나만');
inFlight2.resolve({ ok: true });
eq(await draining, 'offline', 'B 의 줄은 신호 없음으로 남음');
eq(await stored(), ['B:X'], 'A 의 X 를 보낸 답이 B 의 X 를 빼지 않았다');
eq(sent.at(-1), 'X', 'B 의 X 는 B 로 보내려다 신호 없음');

/* 3. 보내는 사이 같은 사람이 다시 담으면(새 판) — 보낸 옛 판만 빠지고 새 판은 남는다 */
const v1 = defer<{ ok: true }>();
let first = true;
const run = drainChecks(
  async () => {
    if (first) {
      first = false;
      return v1.p;
    }
    throw offline();
  },
  () => undefined
);
await new Promise((r) => setTimeout(r, 0));
checkOutbox.add({ exerciseId: 'X', dateKey: D, recordedAt: recent(30) });
v1.resolve({ ok: true });
await run;
const left = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as { recordedAt: string; owner?: string }[];
eq(left.map((x) => [x.owner, x.recordedAt]), [['B', recent(30)]], '새 판이 남음');

/* 4. 보내는 사이 풀면(drop) — 답이 와도 다른 줄을 건드리지 않는다 */
setOutboxOwner('A');
checkOutbox.add({ exerciseId: 'Z', dateKey: D, recordedAt: recent(40) });
const v2 = defer<{ ok: true }>();
const run2 = drainChecks(async () => v2.p, () => undefined);
await new Promise((r) => setTimeout(r, 0));
checkOutbox.drop({ exerciseId: 'Z', dateKey: D });
v2.resolve({ ok: true });
eq(await run2, 'done', '보내기 끝');
eq(await stored(), ['B:X'], 'B 의 줄은 그대로 · 푼 Z 는 없음');

/* 5. 다시 B 로 로그인하면 B 의 체크를 보낸다(계정 표시는 서버에 안 감) */
setOutboxOwner('B');
const bodies: unknown[] = [];
eq(await drainChecks(async (p) => (bodies.push(p), { ok: true }), () => undefined), 'done', 'B 로 보냄');
eq(bodies.length === 1 && !('owner' in (bodies[0] as object)), true, '계정 표시 없이 하나');
eq(await stored(), [], '다 보냄');

console.log(`암케어 체크 대기열 계정 나눔 ${n}개 통과`);
