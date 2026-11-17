/**
 * EX-LOAD01-R1 R1-01 — 못 보낸 운동 세트를 나이 · 오류 · 깨진 저장 값 때문에 잃지 않는가(웹 · 앱 실제 대기열 모듈).
 *
 *   node --import ./scripts/native-test-register.mjs scripts/load-r1-retention-selftest.mts
 *
 * 저장소는 흉내(웹 localStorage 는 Map, 앱 AsyncStorage 는 scripts/native-test-loader.mjs 의 메모리)이고 서버 · 망 · DB 는 부르지 않는다.
 * '앱을 다시 켬'은 모듈을 새로 불러오는 것이다(메모리는 비고 저장소만 남는다).
 *
 * 보는 것: 8일 · 30일 된 붙든 줄 · 안 붙든 줄이 다시 켜고 새로 쓴 뒤에도 남음 · 모르는 판(약속 · 해석기 · 카탈로그 · 새 칸)의 줄이 그대로 ·
 * 일반 오류 · 응답 유실(중복 없이 한 줄) · 계정 A→B→A · 사람의 [버리기] · 저장 확인 뒤 빼기 · 모양이 틀린 줄 · 깨진 저장 값(JSON 아님 ·
 * 배열이 아닌 값)의 원래 글자가 다시 켜고 새로 쓴 뒤에도 남음 · 암케어 7일 거르기는 예전 그대로 · 복구 화면용 말(describe.ts).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

let fails = 0;
let passes = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) passes++;
  else fails++;
  console.log(`${ok ? '  통과' : '  실패'}  ${name}${!ok && detail ? `  (${detail})` : ''}`);
};

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const band = {
  kind: 'band',
  role: 'resistance',
  bands: [{ catalog: '2026-11-16.1', seriesId: 'theraband-professional-latex-band', levelId: 'theraband-professional-latex-band:yellow', label: { ko: '노랑', en: 'Yellow', ja: 'イエロー' }, swatch: '#f2d43d' }],
};
const heldMark = { code: 'LOAD_UNSUPPORTED', message: '서버가 이 기록을 저장했다는 확인이 없어요.', at: ago(7) };
type Row = import('../lib/workout/outbox.ts').PendingSet & Record<string, unknown>;
const row = (exerciseId: string, recordedAt: string, extra: Record<string, unknown> = {}): Row =>
  ({
    sessionId: 'S-old',
    exerciseId,
    setNo: 1,
    weightKg: null,
    reps: 8,
    holdSeconds: null,
    recordedAt,
    ...extra,
  }) as Row;
/* 모르는 판의 줄 — 약속 2 · 해석기 99 · 다른 카탈로그 밴드 · 이 앱이 모르는 칸 */
const future = row('미래', ago(9), {
  owner: 'A',
  loadProtocol: 2,
  loadResolver: 99,
  load: { kind: 'band', role: 'resistance', bands: [{ catalog: '2099-01-01.1', seriesId: 'future-series', levelId: 'future-series:x', label: { ko: '미래', en: 'Future', ja: '未来' }, swatch: null }] },
  futureField: { nested: [1, 2, 3], note: '앞으로 나올 칸' },
});
const MALFORMED = [{ bad: 1 }, { sessionId: 'S-old', exerciseId: '번호없음', recordedAt: ago(3) }, 'text-row', 42];

/* ═══════════════════════════ 웹 ═══════════════════════════ */
const disk = new Map<string, string>();
let failQuarantineWrite = false;
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failQuarantineWrite && k.endsWith(':quarantine')) throw new Error('quota');
      disk.set(k, v);
    },
    removeItem: (k: string) => void disk.delete(k),
  },
  addEventListener() {},
  removeEventListener() {},
};
const WKEY = 'bullpen-log:pending-sets:v1';
type WebMod = typeof import('../lib/workout/outbox.ts');
let wn = 0;
const bootWeb = async (): Promise<WebMod> => import(`../lib/workout/outbox.ts?r1=${++wn}`);
const { drainSets } = await import('../components/load/set-outbox.ts');
const { createOutbox } = await import('../lib/outbox.ts');
const { ackOf } = await import('../lib/workout/load/protocol.ts');
const D = await import('../lib/workout/load/describe.ts');
const stored = (k = WKEY): unknown => {
  const raw = disk.get(k);
  return raw == null ? null : JSON.parse(raw);
};
const storedRows = () => (Array.isArray(stored()) ? (stored() as Row[]) : []);

console.log('\n[웹] ① 8일 · 30일 된 붙든 줄 · 안 붙든 줄 — 다시 켜고 새로 써도 남음');
disk.clear();
const seeded = [
  row('밴드8', ago(8), { owner: 'A', loadProtocol: 1, loadResolver: 1, load: band, held: heldMark }),
  row('밴드30', ago(30), { owner: 'A', loadProtocol: 1, loadResolver: 1, load: band, held: heldMark }),
  row('스쿼트8', ago(8), { owner: 'A', weightKg: 60 }),
  row('스쿼트30', ago(30), { owner: 'A', weightKg: 60 }),
  future,
  ...MALFORMED,
];
disk.set(WKEY, JSON.stringify(seeded));
let w = await bootWeb();
const names = (rows: readonly { exerciseId: string }[]) => rows.map((p) => p.exerciseId).sort().join(',');
check('다시 켜면 다섯 줄이 모두 보인다(나이로 거르지 않음)', names(w.outbox.snapshot()) === '미래,밴드30,밴드8,스쿼트30,스쿼트8', names(w.outbox.snapshot()));
check('모양이 틀린 줄 넷은 보내지 않는 쪽에 원래 값 그대로', JSON.stringify(w.outbox.extras().malformed) === JSON.stringify(MALFORMED));
w.outbox.add(row('새세트', new Date().toISOString(), { sessionId: 'S-new', owner: 'A' }));
check('새로 쓴 뒤 저장소에 옛 줄 다섯 + 새 줄', names(storedRows().filter((x) => typeof x === 'object' && x && 'exerciseId' in x && typeof x.setNo === 'number')) === '미래,밴드30,밴드8,새세트,스쿼트30,스쿼트8');
check('새로 쓴 뒤에도 모양이 틀린 줄 넷이 저장소에 그대로', MALFORMED.every((m) => (stored() as unknown[]).some((x) => JSON.stringify(x) === JSON.stringify(m))));
const fut = storedRows().find((p) => p.exerciseId === '미래');
check('모르는 판의 줄(약속 2 · 해석기 99 · 다른 카탈로그 · 새 칸)이 한 글자도 안 바뀜', JSON.stringify(fut) === JSON.stringify(future), JSON.stringify(fut));
check('붙든 표 · 누른 시각이 그대로', storedRows().find((p) => p.exerciseId === '밴드30')?.recordedAt === (seeded[1] as Row).recordedAt && JSON.stringify(storedRows().find((p) => p.exerciseId === '밴드30')?.held) === JSON.stringify(heldMark));
w = await bootWeb();
check('한 번 더 켜도 그대로(여섯 줄 · 모양 틀린 넷)', w.outbox.snapshot().length === 6 && w.outbox.extras().malformed.length === 4);

console.log('\n[웹] ② 보내기 — 모르는 판은 붙들고 원래 값 그대로 · 모양 틀린 줄은 안 보냄 · 일반 오류 · 응답 유실');
const sent: string[] = [];
let reply: unknown = null;
let lose = false;
let offline = false;
const server = new Map<string, number>();
const send = async (p: Row) => {
  if (offline) throw new TypeError('Failed to fetch');
  sent.push(`${p.exerciseId}#${p.setNo}`);
  if (reply) {
    const r = reply;
    reply = null;
    return r;
  }
  if (p.loadProtocol === 2) return { error: '이 서버가 모르는 약속이에요.', code: 'LOAD_VERSION', actionRequired: true };
  const k = `${p.sessionId}|${p.exerciseId}|${p.setNo}`;
  server.set(k, (server.get(k) ?? 0) + 1);
  if (lose) {
    lose = false;
    throw new TypeError('Failed to fetch');
  }
  return p.load ? { sets: [], loadAck: ackOf(true) } : { sets: [] };
};
const handle = () => undefined;
offline = true;
let r = await drainSets({ owner: 'A', send: send as never, handle, box: w.outbox });
check("신호 없음 — 'offline', 아무것도 안 빠짐", r === 'offline' && w.outbox.snapshot().length === 6);
offline = false;
reply = { error: '서버 오류' };
r = await drainSets({ owner: 'A', sessionId: 'S-new', send: send as never, handle, box: w.outbox });
check('일반 오류 답 → 빼지 않고 REJECTED 로 붙듦', w.outbox.snapshot().find((p) => p.exerciseId === '새세트')?.held?.code === 'REJECTED');
sent.length = 0;
r = await drainSets({ owner: 'A', send: send as never, handle, box: w.outbox });
check('모양이 틀린 줄 · 붙든 줄은 보내지 않음', !sent.some((s) => s.startsWith('번호없음')) && !sent.includes('밴드8#1') && !sent.includes('새세트#1'), sent.join(','));
const futNow = w.outbox.snapshot().find((p) => p.exerciseId === '미래');
check('모르는 판의 줄 → LOAD_VERSION 으로 붙듦', futNow?.held?.code === 'LOAD_VERSION');
const futNoHeld: Record<string, unknown> = { ...(futNow ?? {}) };
delete futNoHeld.held;
check('붙든 뒤에도 원래 값(새 칸 포함) 그대로', JSON.stringify(futNoHeld) === JSON.stringify(future));
check('안 붙든 8일 · 30일 줄은 저장 확인을 받고 빠짐', !w.outbox.snapshot().some((p) => p.exerciseId === '스쿼트8' || p.exerciseId === '스쿼트30'));
w.outbox.add(row('유실', ago(0.01), { sessionId: 'S-new', owner: 'A', weightKg: 40 }));
lose = true;
r = await drainSets({ owner: 'A', sessionId: 'S-new', send: send as never, handle, box: w.outbox });
check('응답 유실(저장은 됨) → 남김', r === 'offline' && w.outbox.snapshot().some((p) => p.exerciseId === '유실'));
w = await bootWeb();
r = await drainSets({ owner: 'A', sessionId: 'S-new', send: send as never, handle, box: w.outbox });
check('다시 켜고 다시 보냄 → 서버에 한 줄(같은 번호) · 빠짐', server.get('S-new|유실|1') === 2 && !w.outbox.snapshot().some((p) => p.exerciseId === '유실'));

console.log('\n[웹] ③ 다시 보내기 · 버리기 · 끝난 판');
const before30 = w.outbox.snapshot().find((p) => p.exerciseId === '밴드30')!;
check('release — 붙든 표만 풀림(값 · 누른 시각 · 계정 그대로)', w.outbox.release(before30) && !w.outbox.snapshot().find((p) => p.exerciseId === '밴드30')?.held && w.outbox.snapshot().find((p) => p.exerciseId === '밴드30')?.recordedAt === before30.recordedAt);
reply = { error: '이미 마친 운동이라 이 세트는 저장하지 못했어요.', code: 'SESSION_UNAVAILABLE' };
sent.length = 0;
await drainSets({ owner: 'A', sessionId: 'S-old', send: send as never, handle, box: w.outbox });
const again = w.outbox.snapshot().find((p) => p.exerciseId === '밴드30');
check('끝난 · 지워진 판으로 다시 보내면 원래 값 그대로 다시 붙듦(SESSION_UNAVAILABLE)', again?.held?.code === 'SESSION_UNAVAILABLE' && again.recordedAt === before30.recordedAt && JSON.stringify(again.load) === JSON.stringify(band));
check('다시 보내기는 같은 판 번호로만(새 운동을 만들지 않음)', sent.length === 1 && sent[0] === '밴드30#1');
w.outbox.release(again!);
reply = null;
await drainSets({ owner: 'A', sessionId: 'S-old', send: send as never, handle, box: w.outbox });
check('구조화 저장 확인(structured) → 빠짐', !w.outbox.snapshot().some((p) => p.exerciseId === '밴드30'));
w.outbox.discard({ sessionId: 'S-old', exerciseId: '밴드8', setNo: 1 });
check('[버리기] → 빠짐(다른 줄은 그대로)', !w.outbox.snapshot().some((p) => p.exerciseId === '밴드8') && w.outbox.snapshot().some((p) => p.exerciseId === '미래'));
const mk = w.outbox.extras().malformed.map((v) => v);
check('모양이 틀린 줄 하나 버리기', w.outbox.discardMalformed(`j:${JSON.stringify(mk[0])}`) && w.outbox.extras().malformed.length === 3);
w = await bootWeb();
check('버린 것은 다시 켜도 없음 · 나머지는 남음', !w.outbox.snapshot().some((p) => p.exerciseId === '밴드8') && w.outbox.extras().malformed.length === 3);

console.log('\n[웹] ④ 계정 A → B → A');
disk.clear();
w = await bootWeb();
w.outbox.add(row('A세트', ago(10), { sessionId: 'SA', owner: 'A', held: heldMark }));
w.outbox.add(row('A세트2', ago(10), { sessionId: 'SA', owner: 'A', setNo: 2 }));
w.outbox.add(row('옛줄', ago(10), { sessionId: 'SX' }));
w.outbox.add(row('옛줄B', ago(10), { sessionId: 'SY' }));
sent.length = 0;
await drainSets({ owner: 'B', send: async (p: Row) => (sent.push(p.exerciseId), { error: 'x', code: 'SESSION_UNAVAILABLE' }) as never, handle, box: w.outbox });
check('B 는 A 의 줄도, 계정을 모르는 옛 줄도 보내지 않음(보낸 수 0)', sent.length === 0, sent.join(','));
check('계정 모르는 옛 줄은 남고, 붙들리지도 계정이 붙지도 않음', ['옛줄', '옛줄B'].every((x) => { const r = w.outbox.snapshot().find((p) => p.exerciseId === x); return !!r && !r.held && !r.owner; }));
const groupsB = w.outbox.snapshot().map((p) => `${p.exerciseId}:${D.ownerGroupOf(p, 'B')}`).sort().join(',');
check('B 에게: A 의 줄은 other · 옛 줄은 unknown(내 기록으로 안 보임)', groupsB === 'A세트2:other,A세트:other,옛줄:unknown,옛줄B:unknown', groupsB);
const sumB = D.recoverySummary(w.outbox.snapshot(), 'B', Date.now());
check('B 의 요약: 내 것 0 · 다른 계정 2 · 모름 2', sumB.mine === 0 && sumB.other === 2 && sumB.unknown === 2);
w = await bootWeb();
check('다시 켜도 옛 줄 둘은 그대로(계정 없음)', w.outbox.snapshot().filter((p) => p.exerciseId.startsWith('옛줄') && !p.owner).length === 2);
w.outbox.add(row('B새것', ago(0.01), { sessionId: 'SB', owner: 'B' }));
check('새로 쓴 뒤에도 옛 줄 둘이 저장소에 그대로(계정 없음)', storedRows().filter((p) => typeof p.exerciseId === 'string' && p.exerciseId.startsWith('옛줄') && !p.owner).length === 2);
sent.length = 0;
await drainSets({ owner: 'A', send: async (p: Row) => (sent.push(p.exerciseId), { sets: [] }) as never, handle, box: w.outbox });
check('A 로 돌아오면 A 의 안 붙든 줄만 보내고, 붙든 줄 · 옛 줄 · B 의 줄은 남음', sent.join(',') === 'A세트2' && w.outbox.snapshot().some((p) => p.exerciseId === 'A세트' && p.held) && w.outbox.snapshot().some((p) => p.exerciseId === 'B새것'));
const sumA = D.recoverySummary(w.outbox.snapshot(), 'A', Date.now());
check('A 의 요약: 붙든 내 것 1 · 모름 2 · 다른 계정 1', sumA.mineHeld === 1 && sumA.unknown === 2 && sumA.other === 1);
/* 복구 화면의 '내 기록으로 확인하기' — 서버(읽기만)가 SX 만 A 의 판이라고 확인했다고 치고, 확인된 줄에만 계정을 붙인다 */
const confirmedByServer = new Set(['SX']);
for (const p of w.outbox.snapshot().filter((x) => D.ownerGroupOf(x, 'A') === 'unknown')) if (confirmedByServer.has(p.sessionId)) w.outbox.bindOwner(p, 'A');
check('확인된 옛 줄만 A 의 것이 되고, 확인되지 않은 줄은 모름 그대로', w.outbox.snapshot().find((p) => p.exerciseId === '옛줄')?.owner === 'A' && !w.outbox.snapshot().find((p) => p.exerciseId === '옛줄B')?.owner);
sent.length = 0;
await drainSets({ owner: 'B', send: async (p: Row) => (sent.push(p.exerciseId), { sets: [] }) as never, handle, box: w.outbox });
check('A 의 것이 된 옛 줄은 B 로는 보내지 않음', !sent.includes('옛줄') && !sent.includes('옛줄B'));
sent.length = 0;
await drainSets({ owner: 'A', send: async (p: Row) => (sent.push(p.exerciseId), { sets: [] }) as never, handle, box: w.outbox });
check('A 로는 확인된 옛 줄만 보내고, 확인 안 된 줄은 여전히 안 보냄', sent.join(',') === '옛줄' && !!w.outbox.snapshot().find((p) => p.exerciseId === '옛줄B'));

console.log('\n[웹] ⑤ 깨진 저장 값 · 배열이 아닌 값 — 원래 글자가 다시 켜고 새로 써도 남음');
for (const raw of ['{bad', '{"x":1}', '5', '"글자"']) {
  disk.clear();
  disk.set(WKEY, raw);
  w = await bootWeb();
  check(`(${raw}) 다시 켜면 보낼 줄은 없음 · 깨진 값 하나`, w.outbox.snapshot().length === 0 && w.outbox.extras().corrupt.length === 1 && w.outbox.extras().corrupt[0].raw === raw);
  check(`(${raw}) 쓰기 전에는 원래 칸 그대로`, disk.get(WKEY) === raw);
  w = await bootWeb();
  w.outbox.add(row('뒤세트', ago(0.01), { sessionId: 'S9', owner: 'A' }));
  const q = stored(`${WKEY}:quarantine`) as { raw: string }[] | null;
  check(`(${raw}) 새로 쓰면 원래 글자가 옮겨진 칸에 한 글자도 안 바뀌고, 원래 칸은 새 목록`, !!q && q.length === 1 && q[0].raw === raw && Array.isArray(stored()));
  w = await bootWeb();
  w.outbox.add(row('뒤세트2', ago(0.01), { sessionId: 'S9', owner: 'A', setNo: 2 }));
  const q2 = stored(`${WKEY}:quarantine`) as { raw: string }[] | null;
  check(`(${raw}) 다시 켜고 또 써도 옮겨 둔 원래 글자 그대로 · 보낼 줄 둘`, !!q2 && q2.length === 1 && q2[0].raw === raw && w.outbox.snapshot().length === 2 && w.outbox.extras().corrupt[0]?.raw === raw);
}
disk.clear();
disk.set(WKEY, '{bad');
failQuarantineWrite = true;
w = await bootWeb();
w.outbox.add(row('막힘', ago(0.01), { sessionId: 'S9', owner: 'A' }));
check('옮기지 못하면(저장소 막힘) 원래 칸을 덮지 않음 · 새 줄은 메모리에', disk.get(WKEY) === '{bad' && w.outbox.snapshot().length === 1);
failQuarantineWrite = false;
w.outbox.add(row('막힘2', ago(0.01), { sessionId: 'S9', owner: 'A', setNo: 2 }));
check('저장소가 풀리면 옮기고 새 목록을 씀', (stored(`${WKEY}:quarantine`) as { raw: string }[])[0]?.raw === '{bad' && storedRows().length === 2);
const ck = `${w.outbox.extras().corrupt[0].foundAt}|{bad`;
check('깨진 값 하나를 사람이 버림 → 옮긴 칸이 비워짐', w.outbox.discardCorrupt(ck) && !disk.has(`${WKEY}:quarantine`) && w.outbox.extras().corrupt.length === 0);
disk.clear();
disk.set(WKEY, '{"x":1}');
w = await bootWeb();
check('아직 옮기지 않은 깨진 값도 버릴 수 있음(원래 칸이 새 목록으로)', w.outbox.discardCorrupt('|{"x":1}') && !disk.has(WKEY) && w.outbox.extras().corrupt.length === 0);

console.log('\n[웹] ⑥ 대기열 틀의 기본값 — 붙든 줄은 어느 대기열에서도 나이로 안 버림 · 암케어 체크는 7일 그대로');
disk.clear();
disk.set('generic', JSON.stringify([{ sessionId: 'g', recordedAt: ago(8), held: heldMark }, { sessionId: 'h', recordedAt: ago(8) }]));
const generic = createOutbox<{ sessionId: string; recordedAt: string }, { sessionId: string }>({
  key: 'generic',
  isItem: (v): v is { sessionId: string; recordedAt: string } => !!v && typeof (v as { sessionId?: unknown }).sessionId === 'string',
  same: (a, b) => a.sessionId === b.sessionId,
});
check('기본(7일) 대기열: 8일 된 붙든 줄은 남고, 안 붙든 줄은 예전처럼 빠짐', generic.snapshot().map((p) => p.sessionId).join(',') === 'g');
disk.set('bullpen-log:pending-armcare-checks:v1', JSON.stringify([
  { exerciseId: 'old', dateKey: '2026-11-01', recordedAt: ago(8) },
  { exerciseId: 'new', dateKey: '2026-11-16', recordedAt: ago(1) },
]));
const armPath = '../lib/armcare/check-outbox.ts?r1=1';
const arm = (await import(armPath)) as typeof import('../lib/armcare/check-outbox.ts');
check('실제 암케어 체크 대기열: 8일 된 체크는 예전처럼 버리고 1일 된 것은 남김', arm.checkOutbox.snapshot().map((p) => p.exerciseId).join(',') === 'new');

console.log('\n[웹 · 앱 공용] ⑦ 복구 화면의 말(describe.ts)');
check('밴드: 역할 · 계열 · 단계 그대로, kg 없음', D.describeLoad({ weightKg: null, load: band }).text === '저항 밴드 · 노랑 · THERABAND Professional Latex Resistance Bands' || /^저항 밴드 · 노랑/.test(D.describeLoad({ weightKg: null, load: band }).text ?? ''), String(D.describeLoad({ weightKg: null, load: band }).text));
const combined = { kind: 'combined', mass: { basis: 'barbellTotal', apparatusFamily: null, setup: null, kg: 60, parts: null }, band: { role: 'assistance', bands: [{ custom: { brand: 'Rogue', series: null, level: '#2' }, unstandardized: true }] } };
const cd = D.describeLoad({ weightKg: 60, load: combined });
check('섞임: 무게(기준) + 밴드 따로, 둘을 더한 kg 없음', cd.kind === 'combined' && cd.lines.length === 2 && cd.lines[0] === '60kg(봉 포함 합계)' && cd.lines[1] === '보조 밴드 · Rogue · 계열 모름 · #2', JSON.stringify(cd.lines));
const un = D.describeLoad({ weightKg: null, load: { kind: 'mass', basis: 'perImplement', apparatusFamily: null, setup: null, kg: null, parts: [{ kg: 10, count: 1, side: 'left' }, { kg: 12, count: 1, side: 'right' }] } });
check('양손 다른 무게: 합치지 않고 그대로', un.kind === 'unequal' && un.text === '왼손 10kg · 오른손 12kg', String(un.text));
const st = D.describeLoad({ weightKg: 25, load: { kind: 'mass', basis: 'stackSetting', apparatusFamily: '케이블', setup: { key: '2번', label: '2번 케이블' }, kg: 25, parts: null } });
check('기구 이름 · 설정값', st.text === '25kg(기구 설정값) · 2번 케이블', String(st.text));
check('모르는 모양의 load 도 던지지 않음', D.describeLoad({ weightKg: 5, load: { kind: 'hologram', x: 1 } }).kind === 'unknown' && D.describeLoad({ load: 'garbage' }).kind === 'unknown');
const { resolveRecordingContract } = await import('../lib/workout/load/contract.ts');
const pogo = resolveRecordingContract({ exerciseId: 'x', equipment: ['맨몸'] });
const pd = D.describeLoad({ weightKg: 20, load: undefined }, { contract: pogo });
check('맨몸 운동의 옛 kg 은 무게 글에 안 쓰고 따로', pd.text === null && pd.excludedKg === 20);
check('세트 한 줄: 무게 · 양 · 여유', D.describeSet({ weightKg: 60, reps: 8, rir: 4 }) === '60kg · 8회 · 여유 4+' && D.describeSet({ holdSeconds: 70 }) === '1분 10초');
check('붙든 까닭: 제목 + 서버 말', D.heldReasonOf(heldMark)?.title === '서버가 아직 이 기록을 저장하지 못해요' && D.heldReasonOf(heldMark)?.message === heldMark.message && D.heldReasonOf(null) === null && D.heldReasonOf({ code: 'NEW_CODE' })?.title === '보내지 못했어요');
const stale = D.recoverySummary([{ owner: 'A', recordedAt: ago(1) }, { owner: 'A', recordedAt: new Date().toISOString() }], 'A', Date.now());
check('오래 못 보낸 내 세트(6시간 넘음)만 알림 대상', stale.mineStale === 1 && stale.mine === 2);

console.log('\n[웹] ⑧ 새 판의 줄 — 고치기는 내놓지 않고, 다시 보내기는 원래 값 그대로 · 아는 줄의 고치기는 계정 · 칸을 지킴');
const FUTURE_ROWS: Record<string, Row> = {
  '약속 2 · 무게': row('F1', ago(9), { owner: 'A', loadProtocol: 2, weightKg: 60, load: { kind: 'mass', basis: 'barbellTotal', apparatusFamily: null, setup: null, kg: 60, parts: null }, held: heldMark }),
  '해석기 2': row('F2', ago(9), { owner: 'A', loadProtocol: 1, loadResolver: 2, load: band, held: heldMark }),
  '다른 카탈로그 밴드': row('F3', ago(9), { owner: 'A', loadProtocol: 1, loadResolver: 1, load: { kind: 'band', role: 'resistance', bands: [{ ...band.bands[0], catalog: '2099-01-01.1' }] }, held: heldMark }),
  '모르는 무게 모양': row('F4', ago(9), { owner: 'A', loadProtocol: 1, loadResolver: 1, load: { kind: 'hologram', x: 1 }, held: heldMark }),
  '모르는 칸': row('F5', ago(9), { owner: 'A', loadProtocol: 1, futureField: { a: 1 }, held: heldMark }),
};
const SUPPORTED = row('S1x', ago(9), { owner: 'A', loadProtocol: 1, loadResolver: 1, load: band, held: heldMark });
const SUPPORTED_KG = row('S2x', ago(9), { owner: 'A', weightKg: 40, held: heldMark });
const withoutHeld = (r: Record<string, unknown>) => {
  const c: Record<string, unknown> = { ...r };
  delete c.held;
  return c;
};
disk.clear();
w = await bootWeb();
for (const r of [...Object.values(FUTURE_ROWS), SUPPORTED, SUPPORTED_KG]) w.outbox.add(r);
for (const [name, r] of Object.entries(FUTURE_ROWS)) {
  const acts = D.recoveryActionsOf(w.outbox.snapshot().find((p) => p.exerciseId === r.exerciseId)!, 'A');
  check(`(${name}) 고치기를 내놓지 않음 · 새 앱 안내 · 다시 보내기와 버리기는 있음`, !acts.correct && !!acts.readOnlyReason?.includes('새 앱 버전') && acts.retry && acts.discard);
}
check('아는 줄(이 판 밴드 · 무게만)은 고치기를 내놓음', D.recoveryActionsOf(SUPPORTED, 'A').correct && D.recoveryActionsOf(SUPPORTED_KG, 'A').correct);
check('다른 계정 · 계정 모름은 고치기 · 다시 보내기 없음', !D.recoveryActionsOf(SUPPORTED, 'B').correct && !D.recoveryActionsOf(SUPPORTED, 'B').retry && !D.recoveryActionsOf(SUPPORTED, 'B').discard && D.recoveryActionsOf({ ...SUPPORTED, owner: undefined }, 'A').confirmOwner);
const sentPayloads: Record<string, string> = {};
for (const r of Object.values(FUTURE_ROWS)) {
  check(`(${r.exerciseId}) 다시 보내기 — 붙든 표만 풀림`, w.outbox.release(r, 'A'));
  await drainSets({
    owner: 'A',
    sessionId: r.sessionId,
    send: (async (p: Row) => {
      sentPayloads[p.exerciseId] = JSON.stringify(p);
      return { error: '이 서버가 모르는 판이에요.', code: 'LOAD_VERSION', actionRequired: true };
    }) as never,
    handle,
    box: w.outbox,
  });
}
for (const [name, r] of Object.entries(FUTURE_ROWS)) {
  check(`(${name}) 다시 보낸 값이 원래 줄과 한 글자도 같음(붙든 표만 빠짐)`, sentPayloads[r.exerciseId] === JSON.stringify(withoutHeld(r)), sentPayloads[r.exerciseId]);
  const now = w.outbox.snapshot().find((p) => p.exerciseId === r.exerciseId)!;
  check(`(${name}) 다시 붙든 뒤에도 원래 값 그대로`, JSON.stringify(withoutHeld(now)) === JSON.stringify(withoutHeld(r)));
}
const editedKg: Row = { ...SUPPORTED_KG, reps: 5, weightKg: 42.5 };
check('아는 줄 고치기(계정 A 로) — 됨', w.outbox.correct(SUPPORTED_KG, editedKg, 'A'));
const fixedKg = w.outbox.snapshot().find((p) => p.exerciseId === 'S2x')!;
check('고친 줄: 계정 A 그대로 · 붙든 표 풀림 · 누른 시각 그대로 · 고친 값', fixedKg.owner === 'A' && !fixedKg.held && fixedKg.recordedAt === SUPPORTED_KG.recordedAt && fixedKg.reps === 5 && fixedKg.weightKg === 42.5);
/* 화면이 떠 있는 채로 A → B — 웹은 화면의 계정(ownerId)이 B 가 되면 A 의 줄에는 아무것도 못 한다 */
const beforeSwitch = JSON.stringify(w.outbox.snapshot().find((p) => p.exerciseId === 'S1x'));
check('B 의 계정으로 A 의 줄 고치기 → 거절', !w.outbox.correct(SUPPORTED, { ...SUPPORTED, reps: 1 }, 'B'));
check('B 의 계정으로 A 의 줄 다시 보내기 → 거절', !w.outbox.release(SUPPORTED, 'B'));
check('B 의 계정으로 A 의 줄 버리기 → 거절', !w.outbox.discardOwned(SUPPORTED, 'B'));
check('계정 모름 칸으로 A 의 줄 버리기 → 거절', !w.outbox.discardOwned(SUPPORTED, null));
check('A 의 줄은 그대로 · 여전히 A', JSON.stringify(w.outbox.snapshot().find((p) => p.exerciseId === 'S1x')) === beforeSwitch && w.outbox.snapshot().find((p) => p.exerciseId === 'S1x')?.owner === 'A');
sent.length = 0;
await drainSets({ owner: 'B', send: (async (p: Row) => (sent.push(p.exerciseId), { sets: [] })) as never, handle, box: w.outbox });
check('B 로 보내기 — A 의 줄은 하나도 안 감', sent.length === 0, sent.join(','));
check('A 는 제 줄을 확인을 받고 버릴 수 있음(새 판 줄도)', w.outbox.discardOwned(FUTURE_ROWS['모르는 칸'], 'A') && !w.outbox.snapshot().some((p) => p.exerciseId === 'F5'));

/* ═══════════════════════════ 앱 ═══════════════════════════ */
// @ts-expect-error 앱 패키지라 루트에서는 타입을 못 찾는다(경로 해석기가 메모리 흉내로 바꾼다)
const AS = (await import('@react-native-async-storage/async-storage')).default as {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  removeItem(k: string): Promise<void>;
};
const NKEY = 'bullpen-workout:pending-sets:v1';
type NativeOutbox = {
  outbox: {
    snapshot(): readonly Row[];
    ready(): Promise<void>;
    add(p: Row): void;
    discard(k: { sessionId: string; exerciseId: string; setNo: number }): void;
    release(k: { sessionId: string; exerciseId: string; setNo: number }, expectOwner?: string | null): boolean;
    bindOwner(k: { sessionId: string; exerciseId: string; setNo: number }, expectOwner?: string | null): boolean;
    correct(k: { sessionId: string; exerciseId: string; setNo: number }, next: Row, expectOwner: string | null): boolean;
    discardOwned(k: { sessionId: string; exerciseId: string; setNo: number }, expectOwner: string | null, screenOwner: string | null): boolean;
    retryPersist(): Promise<boolean>;
    extras(): { malformed: readonly unknown[]; corrupt: readonly { raw: string; foundAt: string }[] };
    discardMalformed(k: string): boolean;
    discardCorrupt(k: string): Promise<boolean>;
    persistFailed(): boolean;
  };
  setOutboxOwner(id: string | null): void;
  subscribeOutboxOwner(l: () => void): () => void;
  outboxOwner(): string | null;
  drainOutbox(send: (p: Row) => Promise<unknown>, handle: () => void): Promise<string>;
  extraKey(v: unknown): string;
};
let nn = 0;
const nativeFile = pathToFileURL(path.resolve(import.meta.dirname, '../native/src/workout/outbox.ts')).href;
/* 앱을 다시 켬 — 모듈을 새로 부르고 저장소 읽기가 끝날 때까지 기다린다 */
const bootNative = async (): Promise<NativeOutbox> => {
  const m = (await import(`${nativeFile}?r1=${++nn}`)) as NativeOutbox;
  await m.outbox.ready();
  return m;
};
const nStored = async (k = NKEY): Promise<unknown> => {
  const raw = await AS.getItem(k);
  return raw == null ? null : JSON.parse(raw);
};
const nRows = async () => {
  const v = await nStored();
  return Array.isArray(v) ? (v as Row[]) : [];
};
const nNames = (rows: readonly Row[]) => rows.filter((x) => x && typeof x === 'object' && typeof x.setNo === 'number').map((p) => p.exerciseId).sort().join(',');
const clearNative = async () => {
  await AS.removeItem(NKEY);
  await AS.removeItem(`${NKEY}:quarantine`);
};

console.log('\n[앱] ① 8일 · 30일 된 붙든 줄 · 안 붙든 줄 — 다시 켜고 새로 써도 남음');
await clearNative();
await AS.setItem(NKEY, JSON.stringify(seeded));
let n = await bootNative();
check('다시 켜면 다섯 줄이 모두 보인다(나이로 거르지 않음)', nNames(n.outbox.snapshot()) === '미래,밴드30,밴드8,스쿼트30,스쿼트8', nNames(n.outbox.snapshot()));
check('모양이 틀린 줄 넷은 보내지 않는 쪽에 원래 값 그대로', JSON.stringify(n.outbox.extras().malformed) === JSON.stringify(MALFORMED));
n.setOutboxOwner('A');
n.outbox.add(row('새세트', new Date().toISOString(), { sessionId: 'S-new' }));
await n.outbox.retryPersist();
check('새로 쓴 뒤 저장소에 옛 줄 다섯 + 새 줄', nNames(await nRows()) === '미래,밴드30,밴드8,새세트,스쿼트30,스쿼트8', nNames(await nRows()));
const nAll = (await nStored()) as unknown[];
check('새로 쓴 뒤에도 모양이 틀린 줄 넷이 저장소에 그대로', MALFORMED.every((mm) => nAll.some((x) => JSON.stringify(x) === JSON.stringify(mm))));
check('모르는 판의 줄이 한 글자도 안 바뀜', JSON.stringify((await nRows()).find((p) => p && p.exerciseId === '미래')) === JSON.stringify(future));
n = await bootNative();
check('한 번 더 켜도 그대로(여섯 줄 · 모양 틀린 넷)', n.outbox.snapshot().length === 6 && n.outbox.extras().malformed.length === 4);

console.log('\n[앱] ② 보내기 — 모르는 판 붙듦 · 모양 틀린 줄 안 보냄 · 일반 오류 여덟 번 · 응답 유실');
n.setOutboxOwner('A');
sent.length = 0;
const nerr = (code: string) => Object.assign(new Error(code), { code });
let nr = await n.drainOutbox(async () => {
  throw nerr('offline');
}, handle);
check("신호 없음 — 'offline', 아무것도 안 빠짐", nr === 'offline' && n.outbox.snapshot().length === 6);
nr = await n.drainOutbox(send as never, handle);
const nfut = n.outbox.snapshot().find((p) => p.exerciseId === '미래');
check('모르는 판의 줄 → LOAD_VERSION 으로 붙듦, 원래 값 그대로', (nfut?.held as { code?: string })?.code === 'LOAD_VERSION' && JSON.stringify({ ...nfut, held: undefined, heldUnder: undefined }) === JSON.stringify({ ...future, held: undefined, heldUnder: undefined }));
check('안 붙든 8일 · 30일 줄은 저장 확인을 받고 빠짐', !n.outbox.snapshot().some((p) => p.exerciseId === '스쿼트8' || p.exerciseId === '스쿼트30'));
check('모양이 틀린 줄은 보내지 않음', !sent.some((s) => s.startsWith('번호없음')));
n.outbox.add(row('오류세트', ago(0.02), { sessionId: 'S-new' }));
for (let i = 0; i < 8; i++)
  await n.drainOutbox(async () => {
    throw nerr('bad-body');
  }, handle);
const errRow = n.outbox.snapshot().find((p) => p.exerciseId === '오류세트');
check('정해진 오류 여덟 번 → 빼지 않고 SEND_FAILED 로 붙듦(값 그대로)', (errRow?.held as { code?: string })?.code === 'SEND_FAILED' && errRow?.reps === 8);
n.outbox.add(row('유실N', ago(0.01), { sessionId: 'S-new', weightKg: 40 }));
lose = true;
nr = await n.drainOutbox(send as never, handle);
check('응답 유실 → 남김', nr === 'offline' && n.outbox.snapshot().some((p) => p.exerciseId === '유실N'));
await n.outbox.retryPersist();
n = await bootNative();
n.setOutboxOwner('A');
await n.drainOutbox(send as never, handle);
check('다시 켜고 다시 보냄 → 서버에 같은 번호 한 줄 · 빠짐', server.get('S-new|유실N|1') === 2 && !n.outbox.snapshot().some((p) => p.exerciseId === '유실N'));

console.log('\n[앱] ③ 다시 보내기 · 버리기 · 끝난 판');
const n30 = n.outbox.snapshot().find((p) => p.exerciseId === '밴드30')!;
check('release — 붙든 표만 풀림(값 · 누른 시각 그대로)', n.outbox.release(n30) && !n.outbox.snapshot().find((p) => p.exerciseId === '밴드30')?.held && n.outbox.snapshot().find((p) => p.exerciseId === '밴드30')?.recordedAt === n30.recordedAt);
reply = { error: '이미 마친 운동이라 이 세트는 저장하지 못했어요.', code: 'SESSION_UNAVAILABLE' };
sent.length = 0;
await n.drainOutbox(send as never, handle);
const nAgain = n.outbox.snapshot().find((p) => p.exerciseId === '밴드30');
check('끝난 판으로 다시 보내면 원래 값 그대로 다시 붙듦', (nAgain?.held as { code?: string })?.code === 'SESSION_UNAVAILABLE' && nAgain?.recordedAt === n30.recordedAt && JSON.stringify(nAgain?.load) === JSON.stringify(band) && sent.join(',') === '밴드30#1');
n.setOutboxOwner('B');
check('다른 계정(B)은 A 의 줄을 다시 보내기로 풀 수 없음', !n.outbox.release(nAgain!) && !!n.outbox.snapshot().find((p) => p.exerciseId === '밴드30')?.held);
n.setOutboxOwner('A');
n.outbox.release(nAgain!);
reply = null;
await n.drainOutbox(send as never, handle);
check('구조화 저장 확인 → 빠짐', !n.outbox.snapshot().some((p) => p.exerciseId === '밴드30'));
n.outbox.discard({ sessionId: 'S-old', exerciseId: '밴드8', setNo: 1 });
check('[버리기] → 빠짐', !n.outbox.snapshot().some((p) => p.exerciseId === '밴드8'));
check('모양이 틀린 줄 하나 버리기', n.outbox.discardMalformed(n.extraKey(n.outbox.extras().malformed[0])) && n.outbox.extras().malformed.length === 3);
await n.outbox.retryPersist();
n = await bootNative();
check('버린 것은 다시 켜도 없음 · 나머지는 남음', !n.outbox.snapshot().some((p) => p.exerciseId === '밴드8') && n.outbox.extras().malformed.length === 3);

console.log('\n[앱] ④ 계정 A → B → A · 계정을 모르는 옛 줄');
await clearNative();
await AS.setItem(NKEY, JSON.stringify([row('옛줄', ago(10), { sessionId: 'SX' }), row('옛줄B', ago(10), { sessionId: 'SY' })]));
n = await bootNative();
n.setOutboxOwner('A');
n.outbox.add(row('A세트', ago(10), { sessionId: 'SA' }));
n.setOutboxOwner('B');
n.outbox.add(row('B세트', ago(10), { sessionId: 'SB' }));
sent.length = 0;
const sentOwners: unknown[] = [];
await n.drainOutbox(async (p) => (sent.push(p.exerciseId), sentOwners.push(p.owner), { error: '연결이 잠깐 끊겼어요', code: 'SESSION_UNAVAILABLE' }), handle);
check('B 는 B 의 줄만 보내고(옛 줄 · A 의 줄은 보낸 수 0), 계정 표시는 서버로 안 감', sent.join(',') === 'B세트' && sentOwners.every((o) => o === undefined), sent.join(','));
check('계정 모르는 옛 줄은 남고, 붙들리지도 계정이 붙지도 않음', ['옛줄', '옛줄B'].every((x) => { const r = n.outbox.snapshot().find((p) => p.exerciseId === x); return !!r && !r.held && !r.owner; }));
check('B 의 판이 끝났어도 빼지 않고 붙듦 · A 의 줄은 그대로', (n.outbox.snapshot().find((p) => p.exerciseId === 'B세트')?.held as { code?: string })?.code === 'SESSION_UNAVAILABLE' && !n.outbox.snapshot().find((p) => p.exerciseId === 'A세트')?.held);
await n.outbox.retryPersist();
n = await bootNative();
n.setOutboxOwner('A');
const grpA = n.outbox.snapshot().map((p) => `${p.exerciseId}:${D.ownerGroupOf(p, 'A')}`).sort().join(',');
check('다시 켠 A 에게: 제 줄은 mine · B 의 줄은 other · 옛 줄은 unknown', grpA === 'A세트:mine,B세트:other,옛줄:unknown,옛줄B:unknown', grpA);
sent.length = 0;
await n.drainOutbox(async (p) => (sent.push(p.exerciseId), { sets: [] }), handle);
check('A 로 돌아오면 A 의 줄만 보내고 B 의 붙든 줄 · 옛 줄은 남음', sent.join(',') === 'A세트' && n.outbox.snapshot().some((p) => p.exerciseId === 'B세트') && n.outbox.snapshot().filter((p) => p.exerciseId.startsWith('옛줄')).length === 2);
check('다시 켜고 새로 쓴 뒤에도 옛 줄 둘이 저장소에 그대로(계정 없음)', (await nRows()).filter((p) => typeof p.exerciseId === 'string' && p.exerciseId.startsWith('옛줄') && !p.owner).length === 2);
/* 복구 화면의 '내 기록으로 확인하기' — 서버(workout.finishStatus, 읽기만)가 SX 만 A 의 판이라고 확인했다고 치고, 확인된 줄에만 계정을 붙인다 */
for (const p of n.outbox.snapshot().filter((x) => D.ownerGroupOf(x, 'A') === 'unknown')) if (p.sessionId === 'SX') n.outbox.bindOwner(p);
check('확인된 옛 줄만 A 의 것이 되고, 확인되지 않은 줄은 모름 그대로', n.outbox.snapshot().find((p) => p.exerciseId === '옛줄')?.owner === 'A' && !n.outbox.snapshot().find((p) => p.exerciseId === '옛줄B')?.owner);
check('이미 계정이 있는 줄은 bindOwner 로 바꾸지 않음', !n.outbox.bindOwner({ sessionId: 'SB', exerciseId: 'B세트', setNo: 1 }));
n.setOutboxOwner('B');
sent.length = 0;
await n.drainOutbox(async (p) => (sent.push(p.exerciseId), { sets: [] }), handle);
check('A 의 것이 된 옛 줄은 B 로 보내지 않음', !sent.includes('옛줄') && !sent.includes('옛줄B'));
n.setOutboxOwner('A');
sent.length = 0;
await n.drainOutbox(async (p) => (sent.push(p.exerciseId), { sets: [] }), handle);
check('A 로는 확인된 옛 줄만 보내고, 확인 안 된 줄은 여전히 안 보냄', sent.join(',') === '옛줄' && !!n.outbox.snapshot().find((p) => p.exerciseId === '옛줄B'));

console.log('\n[앱] ⑤ 깨진 저장 값 · 배열이 아닌 값 — 원래 글자가 다시 켜고 새로 써도 남음');
for (const raw of ['{bad', '{"x":1}', '5']) {
  await clearNative();
  await AS.setItem(NKEY, raw);
  n = await bootNative();
  check(`(${raw}) 다시 켜면 보낼 줄 없음 · 깨진 값 하나 · 원래 칸 그대로`, n.outbox.snapshot().length === 0 && n.outbox.extras().corrupt[0]?.raw === raw && (await AS.getItem(NKEY)) === raw);
  n.setOutboxOwner('A');
  n.outbox.add(row('뒤세트', ago(0.01), { sessionId: 'S9' }));
  await n.outbox.retryPersist();
  const q = (await nStored(`${NKEY}:quarantine`)) as { raw: string }[] | null;
  check(`(${raw}) 새로 쓰면 원래 글자가 옮긴 칸에 그대로 · 원래 칸은 새 목록`, !!q && q.length === 1 && q[0].raw === raw && Array.isArray(await nStored()));
  n = await bootNative();
  n.setOutboxOwner('A');
  n.outbox.add(row('뒤세트2', ago(0.01), { sessionId: 'S9', setNo: 2 }));
  await n.outbox.retryPersist();
  const q2 = (await nStored(`${NKEY}:quarantine`)) as { raw: string }[] | null;
  check(`(${raw}) 다시 켜고 또 써도 옮긴 원래 글자 그대로 · 보낼 줄 둘`, !!q2 && q2.length === 1 && q2[0].raw === raw && n.outbox.snapshot().length === 2 && n.outbox.extras().corrupt[0]?.raw === raw);
  check(`(${raw}) 깨진 값을 사람이 버림`, (await n.outbox.discardCorrupt(`${n.outbox.extras().corrupt[0].foundAt}|${raw}`)) && (await AS.getItem(`${NKEY}:quarantine`)) === null);
}

console.log('\n[앱] ⑦ 새 판의 줄 · 화면이 떠 있는 채로 계정 A → B');
await clearNative();
const UNOWNED = row('모름줄', ago(9), { sessionId: 'SU' });
const SUPPORTED_2 = row('S3x', ago(9), { owner: 'A', weightKg: 30, held: heldMark });
await AS.setItem(NKEY, JSON.stringify([...Object.values(FUTURE_ROWS), SUPPORTED, SUPPORTED_KG, SUPPORTED_2, UNOWNED]));
n = await bootNative();
n.setOutboxOwner('A');
for (const [name, r] of Object.entries(FUTURE_ROWS)) {
  const acts = D.recoveryActionsOf(n.outbox.snapshot().find((p) => p.exerciseId === r.exerciseId)!, n.outboxOwner());
  check(`(앱 ${name}) 고치기를 내놓지 않음 · 새 앱 안내`, !acts.correct && !!acts.readOnlyReason?.includes('새 앱 버전') && acts.retry && acts.discard);
}
const nSent: Record<string, string> = {};
for (const r of Object.values(FUTURE_ROWS)) n.outbox.release(r, 'A');
await n.drainOutbox(async (p) => {
  nSent[p.exerciseId] = JSON.stringify(p);
  return { error: '이 서버가 모르는 판이에요.', code: 'LOAD_VERSION', actionRequired: true };
}, handle);
const plainOf = (r: Record<string, unknown>) => {
  const c = withoutHeld(r);
  delete c.owner;
  delete c.heldUnder;
  return c;
};
for (const [name, r] of Object.entries(FUTURE_ROWS)) {
  check(`(앱 ${name}) 다시 보낸 값이 원래 줄과 한 글자도 같음(폰 표시 칸만 빠짐)`, nSent[r.exerciseId] === JSON.stringify(plainOf(r)), nSent[r.exerciseId]);
  const now = n.outbox.snapshot().find((p) => p.exerciseId === r.exerciseId)!;
  check(`(앱 ${name}) 다시 붙든 뒤에도 원래 값 · 계정 그대로`, JSON.stringify(withoutHeld(now)) === JSON.stringify(withoutHeld(r)) && now.owner === 'A');
}
check('(앱) 아는 줄 고치기(A 로) — 됨 · 계정 A 그대로 · 붙든 표 풀림', n.outbox.correct(SUPPORTED_KG, { ...SUPPORTED_KG, reps: 6 }, 'A') && (() => { const x = n.outbox.snapshot().find((p) => p.exerciseId === 'S2x')!; return x.owner === 'A' && !x.held && x.reps === 6 && x.recordedAt === SUPPORTED_KG.recordedAt; })());
/* 화면이 A 로 떠 있고 고치기 창이 열린 채(row · 'A' 를 쥠) 계정이 B 로 바뀐다 */
let ownerEvents = 0;
const offOwner = n.subscribeOutboxOwner(() => ownerEvents++);
const openedRow = n.outbox.snapshot().find((p) => p.exerciseId === 'S3x')!;
const openedAs = n.outboxOwner();
const beforeS3 = JSON.stringify(openedRow);
n.setOutboxOwner('B');
check('(앱) 계정이 바뀌면 듣는 화면에 알린다(subscribeOutboxOwner)', ownerEvents === 1 && n.outboxOwner() === 'B');
check('(앱) A 로 연 창에서 저장 → 거절(지금 계정 B)', !n.outbox.correct(openedRow, { ...openedRow, reps: 1 }, openedAs));
check('(앱) A 로 연 화면에서 다시 보내기 → 거절', !n.outbox.release(openedRow, openedAs));
check('(앱) A 로 연 화면에서 버리기 → 거절', !n.outbox.discardOwned(openedRow, openedAs, openedAs));
check('(앱) A 로 연 화면에서 계정 모름 줄 확인(붙이기) → 거절', !n.outbox.bindOwner(UNOWNED, openedAs));
check('(앱) B 로 새로 그린 화면도 A 의 줄은 고치기 · 버리기 거절', !n.outbox.correct(openedRow, { ...openedRow, reps: 1 }, 'B') && !n.outbox.discardOwned(openedRow, 'B', 'B'));
sent.length = 0;
await n.drainOutbox(async (p) => (sent.push(p.exerciseId), { sets: [] }), handle);
const s3 = n.outbox.snapshot().find((p) => p.exerciseId === 'S3x');
check('(앱) A 의 줄은 그대로 · 여전히 A · B 로 하나도 안 감', JSON.stringify(s3) === beforeS3 && s3?.owner === 'A' && !sent.includes('S3x'), sent.join(','));
check('(앱) 계정 모름 줄은 여전히 모름(계정 없음)', !n.outbox.snapshot().find((p) => p.exerciseId === '모름줄')?.owner);
n.setOutboxOwner('A');
check('(앱) A 로 돌아오면 A 의 줄을 다시 고칠 수 있음', n.outbox.correct(openedRow, { ...openedRow, reps: 9 }, 'A') && n.outbox.snapshot().find((p) => p.exerciseId === 'S3x')?.reps === 9);
offOwner();

console.log('\n[앱] ⑥ 암케어 체크 대기열 — 7일 거르기는 예전 그대로');
await AS.setItem('bullpen-armcare:pending-checks:v1', JSON.stringify([
  { exerciseId: 'old', dateKey: '2026-11-01', recordedAt: ago(8) },
  { exerciseId: 'new', dateKey: '2026-11-16', recordedAt: ago(1) },
]));
const narm = (await import(`${pathToFileURL(path.resolve(import.meta.dirname, '../native/src/armcare/outbox.ts')).href}?r1=1`)) as {
  checkOutbox: { snapshot(): readonly { exerciseId: string }[] };
  drainChecks(send: () => Promise<unknown>, handle: () => void): Promise<string>;
};
await narm.drainChecks(async () => {
  throw nerr('offline');
}, () => undefined);
check('앱 암케어: 8일 된 체크는 예전처럼 버리고 1일 된 것은 남김', narm.checkOutbox.snapshot().map((p) => p.exerciseId).join(',') === 'new', narm.checkOutbox.snapshot().map((p) => p.exerciseId).join(','));

console.log(fails === 0 ? `\n전부 통과 (${passes})` : `\n${fails}개 실패 · ${passes}개 통과`);
process.exit(fails === 0 ? 0 : 1);
