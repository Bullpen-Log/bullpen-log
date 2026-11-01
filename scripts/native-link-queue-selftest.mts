/**
 * 운동 → 일정 잇기 대기열(native/src/org/link-queue.ts)의 내구성 · 차례 시험 — 실제 대기열 코드를 결정적인 저장소 · 서버 · 세트 대기열 흉내로 돌린다.
 * 실행: npm run native-link-queue:test
 * 2026-11-01 2차 검토 G04: 활동 시작 때 적힘 · 재시작 뒤 남음 · 세트가 먼저 가야 뺌 · linked:0 만으로 안 뺌 · 저장 실패 드러냄 · 계정 바뀜에 안 섞임 · 거절은 남겨 보임.
 * 실제 아이폰의 저장 · 재시작 · 망 끊김은 이 시험이 보지 못한다.
 */
import assert from 'node:assert/strict';
import { LINK_STALE_MS, LINK_STORE_KEY, LinkQueue, linkStateText, type LinkDeps, type LinkResponse, type PendingLink } from '~/org/link-queue';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
const ok = (v: boolean, m: string) => {
  assert.ok(v, m);
  n++;
};

/* 흉내 — 저장소(실패 스위치) · 서버(답 줄 · 던지기) · 세트 대기열(판마다 남은 수) · 시계 */
const world = () => {
  const store = new Map<string, string>();
  const st = { failSave: false, now: 1_000_000, pending: new Map<string, number>(), answers: [] as (LinkResponse | Error)[], sent: [] as PendingLink[] };
  const deps: LinkDeps = {
    load: async (k) => (store.has(k) ? JSON.parse(store.get(k)!) : null),
    save: async (k, v) => {
      if (st.failSave) throw new Error('disk full');
      store.set(k, JSON.stringify(v));
    },
    send: async (l) => {
      st.sent.push({ ...l });
      const a = st.answers.shift();
      if (!a) throw Object.assign(new Error('offline'), { code: 'offline' });
      if (a instanceof Error) throw a;
      return a;
    },
    pendingSets: (s) => st.pending.get(s) ?? 0,
    now: () => st.now,
  };
  return { st, store, deps, fresh: () => new LinkQueue(deps) };
};
const E = { memberId: 'm1', eventId: 'e1' };

/* 1. 활동 시작 때 폰에 적힌다 — 나가기 전에 앱이 꺼져도(새 인스턴스) 귀속이 남고 판 번호까지 있다 */
{
  const w = world();
  const q = w.fresh();
  await q.setOwner('A');
  const l = await q.start(E);
  ok(!!l && l.state === 'active' && l.sessionId === null, '시작 — active · 판 없음');
  eq(JSON.parse(w.store.get(LINK_STORE_KEY('A'))!).length, 1, '시작하자마자 폰에 적힘');
  await q.bindSession('s1');
  eq(JSON.parse(w.store.get(LINK_STORE_KEY('A'))!)[0].sessionId, 's1', '판 번호가 폰에 적힘');
  /* 재시작: 새 인스턴스 */
  const q2 = w.fresh();
  await q2.setOwner('A');
  eq(q2.snapshot().map((x) => [x.state, x.sessionId]), [['active', 's1']], '재시작 뒤에도 active 줄 · 판 번호 그대로');
  /* 활동 중엔 보내되 빼지 않는다(서버 멱등) */
  w.st.answers.push({ ok: true, linked: 2 });
  await q2.flush();
  eq(w.st.sent.length, 1, '활동 중에도 한 번 보냄');
  eq(w.st.sent[0].sessionId, 's1', '보낼 때 판 번호로(since 범위가 아니라)');
  eq(q2.snapshot().map((x) => [x.state, x.linked]), [['active', 2]], 'ok 여도 활동 중이면 남김 · 이은 수 기록');
  /* 나가기(finish) + 세트 다 감 → 보내고 뺌 */
  await q2.finish();
  w.st.answers.push({ ok: true, linked: 1 });
  await q2.flush();
  eq(q2.snapshot(), [], '끝났고 세트가 다 갔으면 마지막 답 뒤 뺌');
  eq(JSON.parse(w.store.get(LINK_STORE_KEY('A'))!), [], '폰에서도 뺌');
}

/* 2. 나간 뒤 재시작 — queued 가 남아 새 인스턴스가 보내고 뺀다 */
{
  const w = world();
  const q = w.fresh();
  await q.setOwner('A');
  await q.start(E);
  await q.bindSession('s1');
  await q.finish();
  const q2 = w.fresh();
  await q2.setOwner('A');
  eq(q2.snapshot().map((x) => x.state), ['queued'], '재시작 뒤 queued');
  w.st.answers.push({ ok: true, linked: 3 });
  await q2.flush();
  eq(q2.snapshot(), [], '보내고 뺌');
}

/* 3. 세트보다 잇기가 먼저 — linked:0 ok 만으로 안 뺀다(waiting), 세트가 간 뒤 다시 보내 뺀다. 일부만 갔으면 아직 */
{
  const w = world();
  const q = w.fresh();
  await q.setOwner('A');
  await q.start(E);
  await q.bindSession('s1');
  await q.finish();
  w.st.pending.set('s1', 2);
  w.st.answers.push({ ok: true, linked: 0 });
  await q.flush();
  eq(q.snapshot().map((x) => x.state), ['waiting'], 'ok · linked 0 · 세트 2개 남음 → waiting(남김)');
  w.st.pending.set('s1', 1);
  w.st.answers.push({ ok: true, linked: 1 });
  await q.onSetsChanged('s1');
  eq(q.snapshot().map((x) => [x.state, x.linked]), [['waiting', 1]], '일부만 갔으면 아직 waiting');
  w.st.pending.set('s1', 0);
  w.st.answers.push({ ok: true, linked: 1 });
  await q.onSetsChanged('s1');
  eq(q.snapshot(), [], '세트가 다 간 뒤 답을 받고 뺌');
  eq(w.st.sent.length, 3, '세 번 보냄(멱등)');
}

/* 4. 늦은 · 잃은 답 — 던지면 남기고 횟수 · 까닭, 다음에 됨. 겹쳐 부르면 한 번만 */
{
  const w = world();
  const q = w.fresh();
  await q.setOwner('A');
  await q.start(E);
  await q.bindSession('s1');
  await q.finish();
  await q.flush(); /* answers 비어 → offline 던짐 */
  eq(q.snapshot().map((x) => [x.state, x.tries, x.lastError]), [['queued', 1, 'offline']], '못 보내면 남기고 횟수 · 까닭');
  eq(linkStateText(q.snapshot()[0], 0, false).text, '신호를 기다려요 · 1번 못 보냄', '화면 글 — 신호 기다림');
  w.st.answers.push({ ok: true, linked: 1 });
  const before = w.st.sent.length;
  await Promise.all([q.flush(), q.flush(), q.flush()]);
  eq(w.st.sent.length - before, 1, '겹쳐 불러도 한 번만 보냄');
  eq(q.snapshot(), [], '됐으면 뺌');
}

/* 5. 저장 실패 — 메모리에만 있음을 드러낸다 · 다시 저장되면 풀린다 */
{
  const w = world();
  const q = w.fresh();
  await q.setOwner('A');
  w.st.failSave = true;
  const l = await q.start(E);
  ok(!!l && q.persistFailed(), '저장 실패 → persistFailed · 줄은 메모리에');
  eq(w.store.has(LINK_STORE_KEY('A')), false, '폰에는 안 적힘');
  eq(linkStateText(q.snapshot()[0], 0, q.persistFailed()).tone, 'danger', '화면은 "이 기기에 저장 못 함"');
  w.st.failSave = false;
  eq(await q.retryPersist(), true, '다시 저장 성공');
  eq(JSON.parse(w.store.get(LINK_STORE_KEY('A'))!).length, 1, '이제 폰에 있음');
}

/* 6. 계정 바뀜 — A 의 줄은 B 로 안 보내고 B 에게 안 보인다, A 가 돌아오면 그대로 */
{
  const w = world();
  const q = w.fresh();
  await q.setOwner('A');
  await q.start(E);
  await q.bindSession('s1');
  await q.finish();
  await q.setOwner('B');
  eq(q.snapshot(), [], 'B 에겐 A 줄이 안 보임');
  w.st.answers.push({ ok: true, linked: 9 });
  await q.flush();
  eq(w.st.sent.length, 0, 'B 로는 아무것도 안 보냄');
  await q.setOwner(null);
  await q.setOwner('A');
  eq(q.snapshot().map((x) => [x.owner, x.state]), [['A', 'queued']], 'A 가 돌아오면 제 줄 그대로');
  await q.flush();
  eq(w.st.sent[0].owner, 'A', 'A 것으로 보냄');
  eq(q.snapshot(), [], 'ok 받아 뺌');
}

/* 7. 소속 끊김(서버 거절) — rejected 로 남겨 보이고 저절로 다시 안 보냄 · 사람이 지움. 다시 보내기도 된다 */
{
  const w = world();
  const q = w.fresh();
  await q.setOwner('A');
  await q.start(E);
  await q.bindSession('s1');
  await q.finish();
  w.st.answers.push({ ok: false, error: '이 팀 · 레슨장의 회원이 아니에요.' });
  await q.flush();
  eq(q.snapshot().map((x) => [x.state, x.rejected]), [['rejected', '이 팀 · 레슨장의 회원이 아니에요.']], '거절 → rejected');
  await q.flush();
  eq(w.st.sent.length, 1, '거절된 줄은 저절로 다시 안 보냄');
  const q2 = w.fresh();
  await q2.setOwner('A');
  eq(q2.snapshot().map((x) => x.state), ['rejected'], '재시작해도 거절 줄이 보임');
  w.st.answers.push({ ok: true, linked: 2 });
  await q2.retry(q2.snapshot()[0].key);
  eq(q2.snapshot(), [], '다시 보내기 → 됐으면 뺌');
  const q3 = w.fresh();
  await q3.setOwner('A');
  await q3.start(E);
  await q3.finish();
  w.st.answers.push({ ok: false, error: '일정을 찾을 수 없어요.' });
  await q3.flush();
  await q3.dismiss(q3.snapshot()[0].key);
  eq(q3.snapshot(), [], '지우기');
}

/* 8. 공간 · 문맥 바뀜 — 활동 중 줄은 그대로(대기열은 공간을 모른다), 두 일정을 이어서 열어도 각각 */
{
  const w = world();
  const q = w.fresh();
  await q.setOwner('A');
  await q.start(E);
  await q.bindSession('s1');
  await q.finish();
  w.st.now += 1000;
  await q.start({ memberId: 'm1', eventId: 'e2' });
  await q.bindSession('s2');
  eq(q.snapshot().map((x) => [x.eventId, x.sessionId, x.state]), [['e1', 's1', 'queued'], ['e2', 's2', 'active']], '두 활동이 따로 · 판 번호는 각각');
}

/* 9. 판 번호 없는 활동 중 줄(운동 판을 못 엶)은 오래될 때까지 안 보내고, 오래되면 since 로 보낸다 */
{
  const w = world();
  const q = w.fresh();
  await q.setOwner('A');
  await q.start(E);
  w.st.answers.push({ ok: true, linked: 0 });
  await q.flush();
  eq(w.st.sent.length, 0, '판 없는 활동 중 줄은 안 보냄');
  w.st.now += LINK_STALE_MS + 1;
  await q.flush();
  eq(w.st.sent.length, 1, '오래되면 보냄');
  eq(w.st.sent[0].sessionId, null, '그때는 판 번호 없이(since)');
  eq(q.snapshot(), [], 'ok 받아 뺌');
}

/* 10. 7일 넘은 끝난 줄은 켤 때 버린다(서버가 옛 세트를 안 받는다) · 거절 줄은 남긴다 */
{
  const w = world();
  const q = w.fresh();
  await q.setOwner('A');
  await q.start(E);
  await q.finish();
  w.st.now += 8 * 24 * 60 * 60 * 1000;
  const q2 = w.fresh();
  await q2.setOwner('A');
  eq(q2.snapshot(), [], '7일 넘은 줄은 버림');
}

/* 소스 — 화면 · 서버가 이 대기열을 쓴다 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
ok(src('native/src/app/org/my-event.tsx').includes("await startLinkedWorkout(`${org}:p`, 'schedule', { memberId: member, eventId: e.id });"), "일정 '운동하기'가 귀속을 적은 뒤 연다");
ok(src('native/src/app/workout.tsx').includes('void bindLinkSession(r.sessionId);'), '운동 화면이 판 번호를 귀속에 붙인다');
ok(src('native/src/org/space-store.ts').includes("onSent((p) => void linkQueue.onSetsChanged(p.sessionId));"), '세트가 갈 때마다 잇기를 다시 본다');
ok(src('native/src/org/space-store.ts').includes("'app-team.linkMyWork', l.memberId, l.eventId, l.since, l.sessionId"), '서버에 판 번호를 보낸다');
ok(src('app/actions/app-team.ts').includes('...(session ? { sessionId: session } : {})'), '서버는 판 번호가 오면 그 판의 세트만 잇는다');
ok(src('native/src/org/player.tsx').includes('<LinkStatus memberId={memberId} />') && src('native/src/app/org/my-event.tsx').includes('<LinkStatus memberId={member} eventId={e.id} />'), '선수 일정 탭 · 일정 화면이 잇기 상태를 그린다');
ok(!src('native/src/org/space-store.ts').includes('pendingLinkCount'), '쓰는 곳 없던 pendingLinkCount 는 없앴다');

console.log(`${n} 통과`);
