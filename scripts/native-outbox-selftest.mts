/**
 * 아이폰 앱 운동 세트 · 암케어 체크 대기열(native/src/workout/outbox.ts · native/src/armcare/outbox.ts)의 시험 — `npm run native-outbox:test`.
 * 신호가 약한 체육관에서 세트를 잃지 않게 하는 곳이라 규칙을 못 박아 둔다: 성공한 것만 빼기 · 신호 없음 · 서버가 잠깐 멈춤은 남기기 ·
 * 다른 계정 것은 안 보내기(계정 표시는 서버에 안 감) · 지운 세트 표시 · 같은 세트는 새 값으로.
 * EX-LOAD01 — 말없이 버리지 않기: 저장이 증명된 답(outcomeOf 'saved')만 뺀다. 거절 답 무엇이든 · 틀린 모양의 성공 · 저장 확인(structured)
 * 없는 구조화 무게 · 계정을 모르는 줄의 '이 계정의 판이 아님' · 여덟 번 거듭된 정해진 오류는 붙들고(held), 보내기는 건너뛰고, 다시 담으면
 * 풀리고, [버리기]로만 뺀다. 계정 바꾸기는 시험마다 대기열을 비워 따로 본다.
 */
import { drainOutbox, onSent, outbox, setOutboxOwner, withPending, type PendingSet } from '~/workout/outbox';
import { ackOf, LOAD_PROTOCOL } from '@/lib/workout/load/protocol';
import { resolveRecordingContract, type RecordingContract } from '@/lib/workout/load/contract';
import { overridesFor } from '@/lib/workout/load/overrides';
import { cleanBandComponent, levelById, type BandComponent } from '@/lib/workout/load/band-catalog';
import { normalizeSetLoad } from '@/lib/workout/load/recorded';
import {
  EMPTY_LOAD_DRAFT,
  buildSetLoad,
  kgLabel,
  kgRequired,
  loadDraftOfSet,
  loadPlan,
  recallBands,
  rememberBands,
  setLoadText,
  showsKg,
  type LoadDraft,
} from '~/workout/load-model';
import { checkOutbox, drainChecks, type PendingCheck } from '~/armcare/outbox';
import { adoptWebValues, cacheClear, cacheEpoch, cacheGet, cacheSet, loadJson, saveJson } from '~/lib/store';

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
const find = (n: number) => outbox.snapshot().find((p) => p.exerciseId === `ex${n}`);
const kOf = (n: number) => ({ sessionId: 's1', exerciseId: `ex${n}`, setNo: 1 });
/** 시험 사이 대기열을 비운다 — 앞 시험이 남긴 줄이 뒤 시험의 '몇 개 보냈나'를 흐리지 않게 */
const clear = () => {
  for (const p of [...outbox.snapshot()]) outbox.remove(p);
};

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

/*
 * 3. 서버가 잠깐 멈춘 오류(server)는 몇 번이든 남긴다(예전의 '여덟 번째에 뺀다'는 없앴다 — 2분 오류에 세트가 지워졌다).
 *    정해진 오류(bad-body)가 여덟 번 거듭되면 빼지 않고 붙들고(SEND_FAILED), 뒤 세트는 막지 않는다.
 */
let errors = 0;
const heardErr: unknown[] = [];
const off2 = onSent((_p, res) => heardErr.push(res));
for (let i = 0; i < 12; i++) {
  await drainOutbox(async () => {
    errors++;
    throw err('server');
  }, () => undefined);
}
ok(pending().includes('s1|ex2|1') && errors === 12, '서버가 잠깐 멈춘 오류(server)는 열두 번이어도 남긴다');
ok(heardErr.length === 0, '남기는 동안 화면에 오류로 알리지 않는다(지운 것이 아니다)');
for (let i = 0; i < 7; i++) {
  await drainOutbox(async () => {
    throw err('bad-body');
  }, () => undefined);
}
ok(pending().includes('s1|ex2|1') && !find(2)?.held, '정해진 오류(bad-body)는 일곱 번까지 그대로 남긴다');
await drainOutbox(async () => {
  throw err('bad-body');
}, () => undefined);
ok(pending().includes('s1|ex2|1') && find(2)?.held?.code === 'SEND_FAILED', '정해진 오류 여덟 번째에도 빼지 않고 붙든다(SEND_FAILED)');
outbox.add(set(6));
let tried: string[] = [];
r = await drainOutbox(async (p) => {
  tried.push(p.exerciseId);
  return { sets: [] };
}, () => undefined);
ok(r === 'done' && tried.join() === 'ex6' && pending().includes('s1|ex2|1'), '붙든 세트는 건너뛰고 뒤 세트는 보낸다(막지 않는다)');
off2();
clear();

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
sent = [];
r = await drainOutbox(async (p) => {
  sent.push(p);
  return { sets: [] };
}, () => undefined);
ok(r === 'offline' && sent.length === 0, '지금 계정을 모르면 아무것도 안 보낸다(꺼진 망에서 켜 계정을 못 읽은 앱)');
setOutboxOwner('C');
sent = [];
await drainOutbox(async (p) => {
  sent.push(p);
  return { sets: [] };
}, () => undefined);
/* EX-LOAD01-R1 — 바꾼 기대값: 예전에는 '계정을 모르고 담은 세트는 누구로든 보낸다(옛 줄)'. 계정을 모르는 줄의 내용은 보내지 않는다(남기고, 삼지 않는다) */
ok(sent.length === 0 && pending().includes('s1|ex4|1') && !(find(4) as { owner?: string } | undefined)?.owner, '계정을 모르고 담은 세트는 아무 계정으로도 보내지 않고 남긴다(지금 계정 것으로 삼지 않음)');
ok(outbox.bindOwner(kOf(4)) && (find(4) as { owner?: string } | undefined)?.owner === 'C', '서버가 이 계정의 판이라고 확인한 뒤(bindOwner)에만 계정이 붙는다');
await drainOutbox(async (p) => {
  sent.push(p);
  return { sets: [] };
}, () => undefined);
ok(sent.length === 1 && !pending().includes('s1|ex4|1'), '계정이 붙은 뒤에는 그 계정으로 보낸다');

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
clear();

/* 5-1. EX-LOAD01 — 고쳐야 하는 거절(actionRequired)은 빼지 않고 붙들고, 보내기는 건너뛰고, 다시 담으면 풀리고, [버리기]로만 뺀다 */
setOutboxOwner('A');
const heardHeld: string[] = [];
const off3 = onSent((p) => heardHeld.push(keyOf(p)));
outbox.add(set(10, { loadProtocol: LOAD_PROTOCOL, weightKg: 20 }));
r = await drainOutbox(async () => ({ error: '이 운동은 무게 없이 횟수 · 시간으로 기록해요.', code: 'LOAD_NOT_ALLOWED', actionRequired: true }), () => undefined);
ok(r === 'done' && find(10)?.held?.code === 'LOAD_NOT_ALLOWED' && !!find(10)?.held?.message.includes('횟수'), '고쳐야 하는 거절은 까닭과 함께 붙든다(빼지 않음)');
ok(!heardHeld.includes('s1|ex10|1'), '붙든 것은 보낸 결과(onSent)로 알리지 않는다');
tried = [];
r = await drainOutbox(async (p) => {
  tried.push(p.exerciseId);
  return { sets: [] };
}, () => undefined);
ok(r === 'done' && tried.length === 0 && !!find(10)?.held, '붙든 세트는 다음 보내기에서도 건너뛴다');
ok(withPending([], outbox.snapshot()).find((x) => x.exerciseId === 'ex10')?.held?.code === 'LOAD_NOT_ALLOWED', '화면 목록(withPending)에 붙든 까닭이 실린다');
outbox.add(set(10, { loadProtocol: LOAD_PROTOCOL, weightKg: null }));
ok(!find(10)?.held, '고쳐 다시 담으면 붙든 표시가 풀린다');
let sentPlain: PendingSet[] = [];
r = await drainOutbox(async (p) => {
  sentPlain.push(p);
  return { sets: [], loadAck: ackOf(false) };
}, () => undefined);
ok(r === 'done' && sentPlain.length === 1 && sentPlain[0].weightKg === null && !('held' in sentPlain[0]) && !find(10), '다시 담은 값을 보내고, 붙든 표시는 서버에 안 간다');
outbox.add(set(13, { loadProtocol: LOAD_PROTOCOL }));
await drainOutbox(async () => ({ error: '같은 세트에 서로 다른 무게가 들어 있어요.', code: 'LOAD_CONFLICT', actionRequired: true }), () => undefined);
ok(find(13)?.held?.code === 'LOAD_CONFLICT', '(버리기 전) 붙든 세트');
outbox.discard(kOf(13));
ok(!find(13), '[버리기]를 눌러야 뺀다');
off3();
clear();

/* 5-2. 구조화 무게(밴드)를 보냈는데 저장 확인(loadAck)이 없으면(옛 서버) 저장된 것으로 보지 않고 붙든다 */
setOutboxOwner('A');
const band = { kind: 'band' as const, role: 'resistance' as const, bands: [{ catalog: '2026-11-16.1', seriesId: 'theraband-professional-latex-band', levelId: 'theraband-professional-latex-band:yellow', label: { ko: '노랑', en: 'Yellow', ja: 'イエロー' }, swatch: '#f2d43d' }] };
outbox.add(set(12, { loadProtocol: LOAD_PROTOCOL, loadResolver: 1, weightKg: null, load: band }));
r = await drainOutbox(async () => ({ sets: [] }), () => undefined);
ok(find(12)?.held?.code === 'LOAD_UNSUPPORTED', '밴드를 보냈는데 저장 확인이 없으면 붙든다(LOAD_UNSUPPORTED)');
outbox.add(set(12, { loadProtocol: LOAD_PROTOCOL, loadResolver: 1, weightKg: null, load: band }));
sentPlain = [];
r = await drainOutbox(async (p) => {
  sentPlain.push(p);
  return { sets: [], loadAck: ackOf(true) };
}, () => undefined);
ok(!find(12) && sentPlain.length === 1 && JSON.stringify(sentPlain[0].load) === JSON.stringify(band), '같은 판의 구조화 저장 확인(structured: true)이 오면 빼고, 밴드 값은 그대로 보냈다');
outbox.add(set(16, { loadProtocol: LOAD_PROTOCOL, loadResolver: 1, weightKg: null, load: band }));
r = await drainOutbox(async () => ({ sets: [], loadAck: ackOf(false) }), () => undefined);
ok(find(16)?.held?.code === 'LOAD_UNSUPPORTED', '밴드에 저장 못 하는 서버의 확인(structured: false)은 저장으로 보지 않고 붙든다');
outbox.add(set(17, { loadProtocol: LOAD_PROTOCOL, loadResolver: 1, weightKg: null, load: band }));
r = await drainOutbox(async () => ({ error: '저장하지 못했어요.' }), () => undefined);
ok(find(17)?.held?.code === 'REJECTED' && find(17)?.held?.message === '저장하지 못했어요.', '밴드를 보냈는데 코드 없는 오류 답(옛 서버)이 오면 붙든다(REJECTED)');
outbox.add(set(14, { loadProtocol: LOAD_PROTOCOL, weightKg: 40 }));
r = await drainOutbox(async () => ({ sets: [] }), () => undefined);
ok(!find(14), '무게만 보낸 새 세트는 옛 서버(확인 없음)여도 저장된 것으로 본다(kg 칸은 옛 서버도 안다)');
outbox.add(set(18, { loadProtocol: LOAD_PROTOCOL, weightKg: 40 }));
r = await drainOutbox(async () => ({ sets: [], loadAck: { ...ackOf(true), catalog: '1999-01-01.1' } }), () => undefined);
ok(find(18)?.held?.code === 'LOAD_VERSION', '무게만 보냈어도 판이 다른 저장 확인이 오면 붙든다(LOAD_VERSION)');
outbox.add(set(19, { loadProtocol: LOAD_PROTOCOL, weightKg: 40 }));
r = await drainOutbox(async () => ({ ok: true }), () => undefined);
ok(find(19)?.held?.code === 'MALFORMED', '모양이 틀린 성공 답은 저장으로 보지 않고 붙든다(MALFORMED)');
outbox.add(set(22, { loadProtocol: LOAD_PROTOCOL, weightKg: 40 }));
r = await drainOutbox(async () => undefined, () => undefined);
ok(find(22)?.held?.code === 'MALFORMED', '빈 답도 붙든다(MALFORMED)');
outbox.add(set(23));
r = await drainOutbox(async () => ({ error: '오늘 목록에 없는 운동이에요.' }), () => undefined);
ok(find(23)?.held?.code === 'REJECTED', '무게만 보낸 세트도 거절 답이면 빼지 않고 붙든다(REJECTED — 예전에는 뺐다)');
clear();

/*
 * 5-3. 계정을 모르고 담은 옛 줄 — EX-LOAD01-R1 바꾼 기대값: 예전에는 누구로든 보내고 '이 계정의 판이 아님'이면 OWNER_UNKNOWN 으로 붙든 뒤
 * 다른 계정으로 한 번 더 보냈다(다른 사람의 세트 내용을 서버에 보낸 것). 이제 어느 계정으로도 보내지 않고, 지우지 않고, 삼지 않는다.
 */
setOutboxOwner(null);
outbox.add(set(11));
setOutboxOwner('B');
const unavailable = { error: '이미 마친 운동이라 이 세트는 저장하지 못했어요.', code: 'SESSION_UNAVAILABLE' };
tried = [];
r = await drainOutbox(async (p) => {
  tried.push(p.exerciseId);
  return unavailable;
}, () => undefined);
ok(tried.length === 0 && !!find(11) && !find(11)?.held, '계정을 모르는 줄은 B 로 보내지 않고(답도 없음) 그대로 남긴다');
setOutboxOwner('A');
tried = [];
r = await drainOutbox(async (p) => {
  tried.push(p.exerciseId);
  return { sets: [] };
}, () => undefined);
ok(tried.length === 0 && !!find(11) && !(find(11) as { owner?: string } | undefined)?.owner, '다른 계정(A)이 로그인해도 보내지 않고 삼지 않는다');
outbox.add(set(15));
let heardGone: unknown = null;
const off4 = onSent((p, res) => {
  if (p.exerciseId === 'ex15') heardGone = res;
});
r = await drainOutbox(async () => unavailable, () => undefined);
ok(find(15)?.held?.code === 'SESSION_UNAVAILABLE' && heardGone === null, '지금 계정(A)이 담은 줄의 같은 답(이미 마친 판)도 빼지 않고 붙든다(사람이 버린다)');
off4();
clear();

/* 5-4. 계정 A → B → A — 따로 담은 줄을 시험마다 비운 대기열에서. 다른 계정 것은 보내지 않고, A 가 돌아와야 A 것을 보낸다 */
setOutboxOwner('A');
outbox.add(set(20));
setOutboxOwner('B');
outbox.add(set(21));
const byB: string[] = [];
await drainOutbox(async (p) => {
  byB.push(p.exerciseId);
  return { sets: [] };
}, () => undefined);
ok(byB.join() === 'ex21' && !!find(20), 'B 로는 B 의 세트만 보내고 A 의 세트는 남긴다');
setOutboxOwner('A');
const byA: PendingSet[] = [];
await drainOutbox(async (p) => {
  byA.push(p);
  return { sets: [] };
}, () => undefined);
ok(byA.length === 1 && byA[0].exerciseId === 'ex20' && !('owner' in byA[0]) && !find(20), 'A 로 돌아오면 A 의 세트만 보내고, 계정 표시는 빼고 보낸다');
clear();

/*
 * 5-5. EX-LOAD01 — 운동 화면이 담는 값(native/src/workout/load-model.ts buildSetLoad)이 서버와 같은 정규화(normalizeSetLoad)를 지나는가.
 * 화면은 담기 전에 같은 검사를 한다 — 여기서 통과하는 모양만 대기열에 들어간다.
 */
const contractFor = (equipment: string[], id?: string, overrides?: Parameters<typeof resolveRecordingContract>[0]['overrides']) =>
  resolveRecordingContract({ exerciseId: id ?? null, equipment, overrides: overrides ?? overridesFor(id) });
const passes = (c: RecordingContract, b: ReturnType<typeof buildSetLoad>, structured: boolean) => {
  if (!b.ok) return { ok: false as const, error: b.error };
  return normalizeSetLoad({
    hasProtocol: true,
    protocol: LOAD_PROTOCOL,
    resolver: b.loadResolver,
    contract: c,
    variant: b.variant,
    weightKg: b.weightKg,
    hasLoad: b.load !== undefined,
    load: b.load,
    structured,
  });
};
const draftOf = (d: Partial<LoadDraft>): LoadDraft => ({ ...EMPTY_LOAD_DRAFT, ...d });
const yellow = (seriesId: string): BandComponent => {
  const lv = levelById(seriesId, `${seriesId}:yellow`)!;
  return { catalog: '2026-11-16.1', seriesId, levelId: lv.id, label: lv.label, swatch: lv.swatch };
};
const LATEX = 'theraband-professional-latex-band';
const TUBE = 'theraband-resistance-tubing';

/* 포고 홉(맨몸) — kg 칸 없음, 보내는 kg 없음. 옛 kg 은 줄에 흐리게 따로(지우지 않음) */
const pogo = contractFor(['맨몸'], '258c0eee-85fe-46dd-b6a1-d2639bb58345');
ok(pogo.mode === 'none' && !showsKg(pogo, null) && !kgRequired({ needsWeight: false, load: pogo }, null), '포고 홉: kg 칸이 없다(none)');
let b = buildSetLoad({ contract: pogo, draft: EMPTY_LOAD_DRAFT, structured: false, kg: null, unit: 'kg' });
ok(b.ok && b.weightKg === null && b.load === undefined && passes(pogo, b, false).ok, '포고 홉: 횟수만 담고 서버 정규화를 지난다');
const pogoKg = normalizeSetLoad({ hasProtocol: true, protocol: LOAD_PROTOCOL, contract: pogo, weightKg: 20, hasLoad: false, load: undefined, structured: false });
ok(!pogoKg.ok && pogoKg.code === 'LOAD_NOT_ALLOWED' && pogoKg.actionRequired, '포고 홉에 kg 을 담으면(새 앱) 담기 전에 막힌다(LOAD_NOT_ALLOWED)');
const pogoText = setLoadText({ weightKg: 20, load: null }, pogo, 'kg');
ok(pogoText.kg === null && pogoText.excludedKg === 20, '포고 홉의 옛 kg 은 무게 글에 안 쓰고 따로(계산에서 뺐어요) 돌려준다');

/* 바벨 — '무게(봉 포함)', 꼭 적는다. 무게만이면 load 없이 weightKg 만(옛 서버도 받는다) */
const bar = contractFor(['바벨', '벤치']);
ok(kgLabel(bar, null) === '무게(봉 포함)' && kgRequired({ needsWeight: false, load: bar }, null), '바벨: 무게(봉 포함) · 꼭 적음(벤치는 받침)');
b = buildSetLoad({ contract: bar, draft: EMPTY_LOAD_DRAFT, structured: true, kg: 60, unit: 'kg' });
ok(b.ok && b.weightKg === 60 && b.load === undefined && passes(bar, b, true).ok, '바벨 60kg: load 없이 weightKg 만 담는다');

/* 덤벨 — '무게(한 손 · 한 개)', 두 배로 안 셈. 양손 다른 무게는 parts(구조화 켜짐에서만 화면이 낸다) */
const db = contractFor(['덤벨']);
ok(kgLabel(db, null) === '무게(한 손 · 한 개)', '덤벨: 무게(한 손 · 한 개)');
ok(loadPlan(db, null, true).unequal && !loadPlan(db, null, false).unequal, '양손 다른 무게 칸은 서버가 저장할 수 있을 때만');
b = buildSetLoad({ contract: db, draft: draftOf({ unequal: true, left: '10', right: '12' }), structured: true, kg: null, unit: 'kg' });
ok(
  b.ok && b.weightKg === null && b.load?.kind === 'mass' && b.load.kg === null && b.load.parts?.length === 2 && b.load.parts[0].side === 'left' && b.load.parts[1].kg === 12 && passes(db, b, true).ok,
  '양손 10 · 12kg: 한 kg 을 만들지 않고 parts 로(평균 · 두 배 없음), 정규화 통과'
);
ok(!passes(db, b, false).ok, '같은 parts 를 저장 못 하는 서버로는 담기 전에 막힌다(LOAD_UNSUPPORTED)');
b = buildSetLoad({ contract: db, draft: draftOf({ unequal: true, left: '22', right: '22' }), structured: true, kg: null, unit: 'lb' });
ok(b.ok && b.weightKg === 9.98 && b.load?.kind === 'mass' && b.load.kg === 9.98 && passes(db, b, true).ok, '양손 같은 22lb: 한 개의 무게 9.98kg 로(두 배 아님)');
const partsText = setLoadText({ weightKg: null, load: { kind: 'mass', basis: 'perImplement', apparatusFamily: null, setup: null, kg: null, parts: [{ kg: 10, count: 1, side: 'left' }, { kg: 12, count: 1, side: 'right' }] } }, db, 'kg');
ok(partsText.kg === '왼 10kg · 오 12kg', '양손 다른 세트 줄: 왼 10kg · 오 12kg');
ok(loadDraftOfSet({ weightKg: null, load: b.ok ? (b.load ?? null) : null }, db, 'kg').unequal, '고칠 때 양손 무게를 그대로 채운다');

/* 케이블 — '케이블 머신 설정값', 기구 이름은 선택(구조화 켜짐에서만) */
const cable = contractFor(['케이블']);
ok(kgLabel(cable, null) === '케이블 머신 설정값' && !kgRequired({ needsWeight: false, load: cable }, null), '케이블: 케이블 머신 설정값 · 선택');
b = buildSetLoad({ contract: cable, draft: draftOf({ setup: '  2번   케이블 ' }), structured: true, kg: 25, unit: 'kg' });
ok(b.ok && b.load?.kind === 'mass' && b.load.setup?.label === '2번 케이블' && b.load.setup.key === '2번 케이블' && passes(cable, b, true).ok, '기구 이름은 다듬어 붙이고 정규화를 지난다');
b = buildSetLoad({ contract: cable, draft: draftOf({ setup: '2번 케이블' }), structured: false, kg: 25, unit: 'kg' });
ok(b.ok && b.load === undefined && b.weightKg === 25, '저장 못 하는 서버면 기구 이름 없이 무게만');

/* 메디신볼 — '도구 무게', 꼭은 아님 */
const ball = contractFor(['메디신볼']);
ok(kgLabel(ball, null) === '도구 무게' && showsKg(ball, null) && !kgRequired({ needsWeight: false, load: ball }, null), '메디신볼: 도구 무게(선택)');

/* 밴드 — 역할을 모르는 운동은 저항 · 보조 · 모름, 계열마다 따로. 저장 못 하는 서버면 고르개 없이 안내만 */
const bandC = contractFor(['밴드']);
ok(!showsKg(bandC, null) && loadPlan(bandC, null, true).bandPicker && loadPlan(bandC, null, true).roleChips, '밴드: kg 칸 없음 · 밴드 고르개 · 역할 고르기');
ok(!loadPlan(bandC, null, false).bandPicker && !!loadPlan(bandC, null, false).notice?.includes('업데이트 뒤에'), '저장 못 하는 서버: 고르개 없이 업데이트 안내');
b = buildSetLoad({ contract: bandC, draft: draftOf({ role: 'assistance', bands: [yellow(LATEX), yellow(TUBE)] }), structured: true, kg: null, unit: 'kg' });
ok(b.ok && b.load?.kind === 'band' && b.load.role === 'assistance' && b.load.bands.length === 2 && b.loadResolver === 1 && passes(bandC, b, true).ok, '노랑 밴드 + 노랑 튜브(다른 계열 같은 색) 보조: 정규화 통과');
b = buildSetLoad({ contract: bandC, draft: draftOf({ bands: [yellow(LATEX)] }), structured: false, kg: null, unit: 'kg' });
ok(b.ok && b.load === undefined && b.weightKg === null && passes(bandC, b, false).ok, '저장 못 하는 서버: 밴드 없이 횟수만(정규화 통과)');
const custom = cleanBandComponent({ custom: { brand: 'Rogue', series: '', level: '#2' } })!;
b = buildSetLoad({ contract: bandC, draft: draftOf({ bands: [custom] }), structured: true, kg: null, unit: 'kg' });
ok(b.ok && b.load?.kind === 'band' && b.load.role === 'unknown' && passes(bandC, b, true).ok, '다른 상표(계열 모름) · 역할 모름도 담긴다');
ok(setLoadText({ weightKg: null, load: b.ok ? (b.load ?? null) : null }, bandC, 'kg').detail === '역할 모름 · Rogue · 계열 모름 · #2', '다른 상표 줄: 상표 · 계열 모름 · 단계 그대로');
const assist = contractFor(['밴드', '철봉'], '6533120b-38ae-4db7-9257-a6956447bc1a');
ok(assist.bandRole === 'assistance' && !loadPlan(assist, null, true).roleChips && loadPlan(assist, null, true).roleText === '보조 밴드', '검토한 보조 밴드 운동: 역할을 묻지 않고 보조 밴드로');

/* 밴드 + 바벨 같이(combined) — 무게 성분과 밴드를 따로, 둘을 더한 kg 없음 */
const combo = contractFor(['바벨', '밴드'], '50298d2b-fd1f-4265-8b67-e95c7815335e');
b = buildSetLoad({ contract: combo, draft: draftOf({ bands: [yellow(LATEX)] }), structured: true, kg: 60, unit: 'kg' });
ok(combo.mode === 'combined' && b.ok && b.load?.kind === 'combined' && b.load.mass?.kg === 60 && b.load.band.role === 'resistance' && b.weightKg === 60 && passes(combo, b, true).ok, '바벨 60kg + 저항 밴드: 따로 담고 정규화 통과');
b = buildSetLoad({ contract: combo, draft: EMPTY_LOAD_DRAFT, structured: false, kg: 60, unit: 'kg' });
ok(b.ok && b.load === undefined && b.weightKg === 60 && passes(combo, b, false).ok && !!loadPlan(combo, null, false).notice, '저장 못 하는 서버: 무게만 + 안내');

/* 밴드 · 덤벨 중 고르기(alternative) — 세트마다 변형을 고른다 */
const alt = contractFor(['덤벨', '밴드'], undefined, { use: 'alternative' });
b = buildSetLoad({ contract: alt, draft: EMPTY_LOAD_DRAFT, structured: true, kg: null, unit: 'kg' });
ok(alt.mode === 'alternative' && !b.ok, '고르는 운동: 밴드인지 무게인지 안 고르면 담지 않는다');
b = buildSetLoad({ contract: alt, draft: draftOf({ variant: 'band', bands: [yellow(LATEX)], role: 'resistance' }), structured: true, kg: null, unit: 'kg' });
ok(b.ok && b.variant === 'band' && b.load?.kind === 'band' && passes(alt, b, true).ok, '밴드로 한 세트: variant band + 밴드');
b = buildSetLoad({ contract: alt, draft: draftOf({ variant: 'mass' }), structured: true, kg: 12, unit: 'kg' });
ok(b.ok && b.variant === 'mass' && b.weightKg === 12 && b.load === undefined && passes(alt, b, true).ok && kgLabel(alt, 'mass') === '무게(한 손 · 한 개)', '덤벨로 한 세트: variant mass + 한 손 12kg');
ok(!showsKg(alt, null) && showsKg(alt, 'mass') && !showsKg(alt, 'band'), 'kg 칸은 무게 변형을 고를 때만');

/* 장비 확인 중(unresolved) — kg 칸 없이 횟수 · 시간만 + 한 줄 안내 */
const unres = contractFor(['바벨', '덤벨']);
ok(unres.mode === 'unresolved' && !showsKg(unres, null) && loadPlan(unres, null, true).notice === '장비 확인 중인 운동이라 횟수 · 시간만 적어요', '장비 확인 중: kg 칸 없음 · 안내 한 줄');

/* 옛 서버(계약 없음) — 예전 needsWeight 그대로, kg 칸 늘 */
ok(showsKg(null, null) && kgRequired({ needsWeight: true }, null) && buildSetLoad({ contract: null, draft: EMPTY_LOAD_DRAFT, structured: false, kg: 50, unit: 'kg' }).ok, '옛 서버: kg 칸 · needsWeight 그대로');

/* 마지막 밴드 기억 — 계정 · 운동 · 역할마다, 다른 판의 카탈로그는 맞지 않아 지운다 */
await rememberBands('A', 'exB', 'resistance', [yellow(LATEX)]);
ok(JSON.stringify(await recallBands('A', 'exB', 'resistance')) === JSON.stringify([yellow(LATEX)]), '같은 계정 · 운동 · 역할이면 마지막 밴드를 되살린다');
ok((await recallBands('B', 'exB', 'resistance')) === null && (await recallBands('A', 'exB', 'assistance')) === null, '다른 계정 · 다른 역할에는 안 섞인다');
// @ts-expect-error 앱 패키지라 scripts/ 에서는 타입을 못 찾는다(경로 해석기가 메모리 흉내로 바꾼다)
const AS = (await import('@react-native-async-storage/async-storage')).default as { setItem(k: string, v: string): Promise<void>; getItem(k: string): Promise<string | null> };
await AS.setItem('bullpen-band-last:v1:A:exC:resistance', JSON.stringify({ catalog: '2025-01-01.1', bands: [yellow(LATEX)] }));
ok((await recallBands('A', 'exC', 'resistance')) === null && (await AS.getItem('bullpen-band-last:v1:A:exC:resistance')) === null, '다른 판의 카탈로그로 고른 밴드는 되살리지 않고 지운다');

/* 6. 암케어 체크 — 같은 규칙(성공만 빼기 · 신호 없음 남기기 · 서버 오류 여덟 번째 빼기 · 다른 계정 안 보냄 · 마친 순서대로) */
const check = (id: string, at: string): PendingCheck => ({ exerciseId: id, dateKey: '2026-10-18', recordedAt: at });
const checks = () => checkOutbox.snapshot().map((p) => p.exerciseId);
setOutboxOwner('A');
checkOutbox.add(check('b', '2026-10-18T10:02:00.000Z'));
checkOutbox.add(check('a', '2026-10-18T10:01:00.000Z'));
const order: string[] = [];
let cr = await drainChecks(async (p) => {
  order.push(p.exerciseId);
  return { ok: true };
}, () => undefined);
ok(cr === 'done' && order.join() === 'a,b' && checks().length === 0, '암케어 체크는 마친 순서대로 보내고 빠진다');
checkOutbox.add(check('c', '2026-10-18T10:03:00.000Z'));
checkOutbox.add(check('c', '2026-10-18T10:04:00.000Z'));
ok(checks().filter((x) => x === 'c').length === 1, '같은 체크(운동 · 날)는 새것 하나로');
cr = await drainChecks(async () => {
  throw err('offline');
}, () => undefined);
ok(cr === 'offline' && checks().includes('c'), '암케어: 신호 없음이면 남긴다');
for (let i = 0; i < 20; i++) {
  await drainChecks(async () => {
    throw err('server');
  }, () => undefined);
}
ok(checks().includes('c'), '암케어: 서버가 잠깐 멈춘 오류(server)는 몇 번이든 남긴다');
for (let i = 0; i < 7; i++) {
  await drainChecks(async () => {
    throw err('bad-body');
  }, () => undefined);
}
ok(checks().includes('c'), '암케어: 정해진 오류(bad-body)도 일곱 번까지는 남긴다');
let rejected: unknown = null;
await drainChecks(async () => {
  throw err('bad-body');
}, (_p, res) => (rejected = res));
ok(!checks().includes('c') && typeof rejected === 'object' && rejected != null && 'error' in rejected, '암케어: 정해진 오류 여덟 번째에 빼고 오류로 알린다');
checkOutbox.add(check('d', '2026-10-18T10:05:00.000Z'));
setOutboxOwner('B');
const sentChecks: PendingCheck[] = [];
await drainChecks(async (p) => {
  sentChecks.push(p);
  return { ok: true };
}, () => undefined);
ok(sentChecks.length === 0 && checks().includes('d'), '암케어: 다른 계정(B)으로는 A 의 체크를 안 보낸다');
setOutboxOwner('A');
await drainChecks(async (p) => {
  sentChecks.push(p);
  return { ok: true };
}, () => undefined);
ok(sentChecks.length === 1 && !('owner' in sentChecks[0]), '암케어: A 로 돌아오면 보내고, 계정 표시는 빼고 보낸다');

/* 7. 받아 둔 값 · 웹 값 옮기기(native/src/lib/store.ts) — 로그아웃은 받아 둔 서버 값만 지우고 세대를 올린다 */
await cacheSet('home', { n: 1 });
await saveJson('bullpen-velocity-setup', { keep: true });
const e0 = cacheEpoch();
await cacheClear();
ok(cacheEpoch() === e0 + 1 && (await cacheGet('home')) === null, '로그아웃하면 받아 둔 값이 지워지고 세대가 오른다');
ok(JSON.stringify(await loadJson('bullpen-velocity-setup')) === '{"keep":true}', '로그아웃해도 기기 설정은 남는다');
await adoptWebValues({ 'bullpen-velocity-setup': '{"web":true}', 'new-json': '{"a":1}', broken: '{no', 'bullpen-unit-weight': 'lb' }, ['bullpen-unit-weight']);
ok(JSON.stringify(await loadJson('bullpen-velocity-setup')) === '{"keep":true}', '웹 JSON 값은 앱에 이미 있으면 안 덮는다');
ok(JSON.stringify(await loadJson('new-json')) === '{"a":1}' && (await loadJson('broken')) === null, '처음 보는 웹 JSON 은 옮기고, 깨진 값은 건너뛴다');
await adoptWebValues({ 'bullpen-unit-weight': 'kg' }, ['bullpen-unit-weight']);
/* 앱 패키지라 scripts/ 에서는 타입을 못 찾는다 — 시험에서는 경로 해석기(scripts/native-test-loader.mjs)가 메모리 흉내로 바꾼다 */
// @ts-expect-error 위 까닭
const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default as { getItem(k: string): Promise<string | null> };
ok((await AsyncStorage.getItem('bullpen-unit-weight')) === 'kg', '글자 값(무게 단위)은 늘 웹을 따른다');

console.log(fail ? `실패 ${fail}` : '모두 통과');
if (fail) process.exit(1);
