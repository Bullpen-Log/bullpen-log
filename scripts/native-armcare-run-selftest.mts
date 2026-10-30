/**
 * 암케어 따라 하기의 진행 셈(native/src/armcare/run-state.ts)과 체크 대기열의 저장 상태(native/src/armcare/outbox.ts) 시험 — npm run native-armcare-run:test
 * 실제 모듈을 부른다(폰 저장소는 메모리 흉내, 실패는 시험이 넣는다). 실제 아이폰의 타이머 · 알림 · 잠금 · 저장소 오류는 이 시험이 보지 못한다.
 */
import assert from 'node:assert/strict';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};

const { reduce, initState } = await import('~/armcare/run-state');
const { checkOutbox, checkStorage, drainChecks, settleWrites } = await import('~/armcare/outbox');
const { setOutboxOwner } = await import('~/workout/outbox');

type Item = Parameters<typeof initState>[0][number];
const item = (id: string, o: Partial<Item> = {}): Item =>
  ({
    exercise: { id, title: id } as Item['exercise'],
    sets: 2,
    reps: 12,
    holdSeconds: null,
    restSeconds: 30,
    perSide: false,
    doneBefore: false,
    unsafe: false,
    ...o,
  }) as Item;

/* ---------- 1. 반복 운동 — 세트 → 쉬기 → 세트 → '이 운동 끝'에 머문다 ---------- */
{
  const items = [item('a'), item('b')];
  let s = initState(items);
  const r = (a: Parameters<typeof reduce>[1]) => (s = reduce(s, a, items));
  r({ type: 'set', at: 0 });
  eq([s.sets[0], s.clock?.kind, s.clock?.endsAt], [1, 'rest', 30_000], '1세트 뒤 쉬기 30초');
  const rest = s.clock!;
  r({ type: 'clock-end', clock: rest, at: 30_000 });
  eq([s.clock, s.sets[0], s.done[0]], [null, 1, false], '쉬기가 끝나도 세트 · 완료는 그대로');
  r({ type: 'set', at: 31_000 });
  eq([s.done[0], s.completed, s.index, s.clock], [true, 0, 0, null], '마지막 세트 — 완료, 같은 운동에 머묾, 시계 없음');
  r({ type: 'set', at: 31_100 });
  eq([s.sets[0], s.sets[1], s.index], [2, 0, 0], '끝난 운동에 늦은 세트 누름은 버림(다음 운동 1세트로 안 들어감)');
  r({ type: 'hold', at: 31_200 });
  eq(s.clock, null, '끝난 운동에서 시계를 안 켬');
  r({ type: 'next' });
  eq([s.index, s.completed, s.clock, s.sets[1]], [1, null, null, 0], '다음 운동은 눌러야 — 시계 · 세트를 저절로 시작하지 않음');
}

/* ---------- 2. 좌우 반복 — 양쪽 하고 한 번 = 한 세트(두 배로 세지 않음) ---------- */
{
  const items = [item('p', { perSide: true, sets: 1 })];
  let s = initState(items);
  s = reduce(s, { type: 'set', at: 0 }, items);
  eq([s.sets[0], s.done[0]], [1, true], '좌우 반복은 한 번 눌러 한 세트');
}

/* ---------- 3. 좌우 버티기 — 한쪽 → 반대쪽 준비 → 반대쪽, 양쪽 뒤에만 세트+1 ---------- */
{
  const items = [item('h', { reps: null, holdSeconds: 20, perSide: true, sets: 2, restSeconds: 10 })];
  let s = initState(items);
  const r = (a: Parameters<typeof reduce>[1]) => (s = reduce(s, a, items));
  r({ type: 'hold', at: 0 });
  const c1 = s.clock!;
  r({ type: 'clock-end', clock: c1, at: 20_000 });
  eq([s.side, s.sets[0], s.clock], [1, 0, null], '한쪽 끝 — 반대쪽 준비, 세트 그대로, 시계를 저절로 안 켬');
  r({ type: 'hold', at: 25_000 });
  const c2 = s.clock!;
  r({ type: 'clock-end', clock: c2, at: 45_000 });
  eq([s.side, s.sets[0], s.clock?.kind], [0, 1, 'rest'], '양쪽 끝 — 세트+1, 쉬기');

  /* 4. 일시정지 · 계속 — 남은 시간으로 새 끝 시각, 멈춘 동안 지난 시간으로 끝나지 않음 */
  r({ type: 'clock-end', clock: s.clock!, at: 55_000 });
  r({ type: 'hold', at: 60_000 });
  const run = s.clock!;
  r({ type: 'pause', clock: run, at: 65_000 });
  eq(s.clock?.left, 15_000, '일시정지 — 남은 15초를 쥠');
  const paused = s.clock!;
  r({ type: 'clock-end', clock: run, at: 80_000 });
  eq(s.clock, paused, '멈추기 전 시계의 늦은 끝 알림은 버림');
  r({ type: 'resume', clock: paused, at: 200_000 });
  eq([s.clock?.endsAt, s.clock?.left], [215_000, undefined], '계속 — 지금부터 남은 15초(멈춘 동안은 안 셈)');

  /* 5. 현재 버티기 취소 — 그 쪽은 안 한 것으로, 세트는 그대로 */
  const live = s.clock!;
  r({ type: 'cancel', clock: live });
  eq([s.clock, s.side, s.sets[0]], [null, 0, 1], '취소 — 한쪽 준비로, 세트 그대로');
  r({ type: 'hold', at: 210_000 });
  r({ type: 'clock-end', clock: s.clock!, at: 230_000 });
  eq(s.side, 1, '한쪽 마침');
  r({ type: 'hold', at: 231_000 });
  r({ type: 'cancel', clock: s.clock! });
  eq([s.side, s.sets[0]], [1, 1], '반대쪽 취소 — 마친 한쪽은 남음');

  /* 6. 직접 완료와 자연 만료가 같은 순간 — 한 번만 반영 */
  r({ type: 'hold', at: 240_000 });
  const same = s.clock!;
  r({ type: 'clock-end', clock: same, at: 260_000 });
  r({ type: 'clock-end', clock: same, at: 260_001 });
  eq([s.sets[0], s.done[0], s.completed], [2, true, 0], '같은 시계 두 번 — 세트 한 번만, 운동 끝');
}

/* ---------- 7. 운동을 옮긴 뒤 늦은 만료는 다른 운동을 완료시키지 않음 · 건너뛰기는 수행 아님 ---------- */
{
  const items = [item('h1', { reps: null, holdSeconds: 20, sets: 1 }), item('x')];
  let s = initState(items);
  const r = (a: Parameters<typeof reduce>[1]) => (s = reduce(s, a, items));
  r({ type: 'hold', at: 0 });
  const old = s.clock!;
  r({ type: 'go', index: 1 });
  r({ type: 'clock-end', clock: old, at: 20_000 });
  eq([s.done, s.sets, s.index], [[false, false], [0, 0], 1], '옮긴 뒤 옛 시계 끝 — 아무것도 안 바뀜');
  r({ type: 'go', index: 0 });
  eq(s.done, [false, false], '이전 · 다음 · 건너뛰기는 수행이 아님');

  /* 8. 일부만 하고 마치기 · 수행 0개 · 남은 운동 이어하기 */
  r({ type: 'finish' });
  eq([s.finished, s.done.filter(Boolean).length], [true, 0], '0개여도 마칠 수 있음(체크 없음)');
  r({ type: 'reopen' });
  eq([s.finished, s.index], [false, 0], '남은 운동 이어하기 — 첫 안 한 운동');
}

/* ---------- 9. 다시 열기 — 마친 운동은 건너뛰고 첫 안 한 운동, 모두 했으면 기록 열람 ---------- */
{
  const resumed = initState([item('a', { doneBefore: true }), item('b'), item('c')]);
  eq([resumed.index, resumed.finished, resumed.sets], [1, false, [2, 0, 0]], '이어하기 — 첫 안 한 운동, 하던 세트는 처음부터');
  const all = initState([item('a', { doneBefore: true }), item('b', { doneBefore: true })]);
  eq(all.finished, true, '모두 한 루틴 — 완료(기록 열람)로 엶');
  /* 폰에 담긴(못 보낸) 체크는 한 것, 보낼 해제는 안 한 것 — 첫 화면의 수와 같은 셈 */
  const queued = initState([item('a'), item('b', { doneBefore: true }), item('c')], [true, false, false]);
  eq([queued.done, queued.index, queued.sets], [[true, false, false], 1, [2, 0, 0]], '대기 체크는 건너뛰고 해제한 운동은 다시 함');
}

/* ---------- 10. 대기열 — 기기 저장 실패를 관찰하고 다시 저장 ---------- */
const real = { ...checkStorage };
setOutboxOwner('A');
const D = '2026-10-30';
{
  checkStorage.set = async () => {
    throw new Error('disk full');
  };
  const ok = await checkOutbox.add({ exerciseId: 'F', dateKey: D, recordedAt: new Date(Date.now() - 9_000).toISOString() });
  eq([ok, checkOutbox.entry({ exerciseId: 'F', dateKey: D })?.storage], [false, 'failed'], '쓰기 실패 — 결과 false, 줄은 기기 저장 실패');
  checkStorage.set = real.set;
  eq(await checkOutbox.persistAgain(), true, '다시 저장 — 성공');
  eq(checkOutbox.entry({ exerciseId: 'F', dateKey: D })?.storage, 'durable', '디스크에 들어간 줄은 보관됨');
}

/* ---------- 11. 쓰기 차례 — 앞 쓰기가 늦게 끝나도 마지막 대기열이 디스크에 남음 ---------- */
{
  const gate: (() => void)[] = [];
  const order: string[] = [];
  checkStorage.set = (k, v) =>
    new Promise<void>((resolve) => {
      order.push(v);
      gate.push(() => real.set(k, v).then(resolve));
    });
  void checkOutbox.add({ exerciseId: 'G', dateKey: D, recordedAt: new Date(Date.now() - 8_000).toISOString() });
  void checkOutbox.add({ exerciseId: 'H', dateKey: D, recordedAt: new Date(Date.now() - 7_000).toISOString() });
  await new Promise((r) => setTimeout(r, 5));
  eq(gate.length, 1, '둘째 쓰기는 첫 쓰기가 끝나기를 기다림');
  gate.shift()!();
  await new Promise((r) => setTimeout(r, 5));
  gate.shift()!();
  await settleWrites();
  checkStorage.set = real.set;
  const disk = JSON.parse((await real.get('bullpen-armcare:pending-checks:v1')) ?? '[]') as { exerciseId: string }[];
  eq(disk.map((x) => x.exerciseId).sort(), ['F', 'G', 'H'], '디스크는 마지막 대기열');
}

/* ---------- 12. 영수증 — 성공 응답만 저장, 거절은 까닭과 함께, 신호 없음은 대기 ---------- */
{
  let call = 0;
  const outcome = await drainChecks(
    async (p) => {
      call++;
      if (p.exerciseId === 'F') return { ok: true };
      if (p.exerciseId === 'G') return { error: '운동을 찾을 수 없어요.' };
      throw Object.assign(new Error('offline'), { code: 'offline' });
    },
    () => undefined
  );
  eq([outcome, call], ['offline', 3], '세 줄을 보내다 신호 없음에서 멈춤');
  eq(checkOutbox.receipt({ exerciseId: 'F', dateKey: D }), { status: 'saved' }, '성공 답 — 저장됨');
  eq(checkOutbox.receipt({ exerciseId: 'G', dateKey: D }), { status: 'refused', message: '운동을 찾을 수 없어요.' }, '거절 — 까닭과 함께, 대기열에서 빠져도 저장 아님');
  eq([checkOutbox.receipt({ exerciseId: 'H', dateKey: D }), checkOutbox.entry({ exerciseId: 'H', dateKey: D })?.tried], [null, true], '신호 없음 — 영수증 없음, 줄은 남고 보냈다는 표시');
  /* 같은 체크를 다시 보내도 줄 · 결과가 늘지 않음 */
  const sent: string[] = [];
  await drainChecks(async (p) => (sent.push(p.exerciseId), { ok: true }), () => undefined);
  eq(sent, ['H'], '남은 한 줄만 같은 키로');
  eq(checkOutbox.visible().length, 0, '대기열 비움');
}

/* ---------- 13. 해제와 보내기 경합 — 보내는 중에 풀면 해제를 보내고, 늦은 성공은 저장으로 안 셈 ---------- */
{
  await checkOutbox.add({ exerciseId: 'U', dateKey: D, recordedAt: new Date(Date.now() - 5_000).toISOString() });
  let release!: (v: { ok: true }) => void;
  const bodies: { id: string; undo: boolean }[] = [];
  const run = drainChecks(
    (p) => {
      bodies.push({ id: p.exerciseId, undo: !!p.undo });
      if (bodies.length === 1) return new Promise<{ ok: true }>((r) => (release = r));
      return Promise.resolve({ ok: true as const });
    },
    () => undefined
  );
  await new Promise((r) => setTimeout(r, 5));
  await checkOutbox.drop({ exerciseId: 'U', dateKey: D });
  eq(checkOutbox.entry({ exerciseId: 'U', dateKey: D })?.undo, true, '보내는 중에 풀면 해제 줄');
  release({ ok: true });
  await run;
  eq(bodies, [{ id: 'U', undo: false }, { id: 'U', undo: true }], '체크 뒤 해제를 보냄(최신 뜻)');
  eq([checkOutbox.receipt({ exerciseId: 'U', dateKey: D }), checkOutbox.entry({ exerciseId: 'U', dateKey: D })], [null, null], '늦은 성공이 해제를 되살리지 않음');
  /* 보낸 적 없는 체크는 빼기만 */
  await checkOutbox.add({ exerciseId: 'V', dateKey: D, recordedAt: new Date().toISOString() });
  await checkOutbox.drop({ exerciseId: 'V', dateKey: D });
  eq(checkOutbox.entry({ exerciseId: 'V', dateKey: D }), null, '안 보낸 체크는 해제 없이 뺌');
}

/* ---------- 14. 계정 — 다른 사람의 영수증 · 줄은 안 보임, 바꾼 계정으로 안 보냄 ---------- */
{
  await checkOutbox.add({ exerciseId: 'W', dateKey: D, recordedAt: new Date().toISOString() });
  setOutboxOwner('B');
  eq([checkOutbox.entry({ exerciseId: 'W', dateKey: D }), checkOutbox.receipt({ exerciseId: 'F', dateKey: D })], [null, null], 'B 에게 A 의 줄 · 영수증 없음');
  const sent: string[] = [];
  eq(await drainChecks(async (p) => (sent.push(p.exerciseId), { ok: true }), () => undefined), 'done', 'B 로 보내기');
  eq(sent, [], 'A 의 체크를 B 로 안 보냄');
  setOutboxOwner('A');
}

console.log(`암케어 따라 하기 · 저장 상태 ${n}개 통과`);
