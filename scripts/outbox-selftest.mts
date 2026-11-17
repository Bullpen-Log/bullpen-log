/**
 * 신호가 없어도 세트가 안 날아가는지 — lib/workout/outbox.ts 자체 검사.
 *
 *   npm run outbox:test
 *
 * 운동 화면이 쓰는 코드를 그대로 불러와, 폰 저장소(localStorage)와 서버를
 * 흉내 내어 돌린다. 신호 없음 · 응답만 잃음 · 서버 거절 · 보내는 도중 새 세트 ·
 * 보내기 전에 지움 · 앱을 껐다 켬 · 오래된 것도 버리지 않음(EX-LOAD01-R1)을 본다.
 *
 * EX-LOAD01 — 보내기는 웹이 실제로 쓰는 drainSets(components/load/set-outbox.ts)로 돈다: 저장이 증명된 답만 빼고(outcomeOf),
 * 거절 · 모양이 틀린 답 · 저장 확인 없는 밴드는 붙들어 남긴다. 붙들린 줄 건너뛰기 · 다시 담아 풀기 · 계정 거르기 · 계정을 모르는
 * 줄의 '이 계정의 판이 아님' · 암케어 대기열(덧붙임 없음)이 예전과 같은지도 본다.
 */

/* ── 폰 저장소 흉내 ─────────────────────────────────────── */
const disk = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => void disk.set(k, v),
    removeItem: (k: string) => void disk.delete(k),
  },
  addEventListener() {},
  removeEventListener() {},
};

type Mod = typeof import('../lib/workout/outbox.ts');
let fresh = 0;
/* 앱을 껐다 켠 것처럼 — 모듈을 새로 불러오면 메모리가 비고 저장소만 남는다 */
const boot = async (): Promise<Mod> =>
  import(`../lib/workout/outbox.ts?boot=${++fresh}`);

/* ── 서버 흉내: (판, 운동, 번호)로 덮어쓴다 — 실제 logSet 과 같은 규칙 ── */
type Row = { weightKg: number | null; reps: number | null; recordedAt: string };
/* 서버 답 — 저장({ sets: [...] }) · 거절({ error }) · 그 밖에 시험이 꾸미는 모양(모양이 틀린 답 · 저장 확인) */
type Reply = { sets: unknown[]; loadAck?: unknown } | { error: string; code?: string; actionRequired?: boolean } | Record<string, unknown> | null;
const server = new Map<string, Row>();
let signal = true;
let loseReply = false;
/* 다음 한 번의 답을 시험이 정한다(저장은 하지 않는다) */
let nextReply: Reply = null;
const sent: string[] = [];

async function logSet(p: {
  sessionId: string;
  exerciseId: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  recordedAt: string;
}): Promise<Reply> {
  await new Promise((r) => setTimeout(r, 5));
  if (!signal) throw new TypeError('Failed to fetch');
  sent.push(`${p.exerciseId}#${p.setNo}`);
  if (p.sessionId === 'closed')
    return { error: '이미 마친 운동이라 이 세트는 저장하지 못했습니다.' };
  if (nextReply) {
    const r = nextReply;
    nextReply = null;
    return r;
  }
  server.set(`${p.sessionId}|${p.exerciseId}|${p.setNo}`, {
    weightKg: p.weightKg,
    reps: p.reps,
    recordedAt: p.recordedAt,
  });
  if (loseReply) {
    loseReply = false;
    throw new TypeError('Failed to fetch'); // 저장은 됐는데 답이 안 옴
  }
  return { sets: [...server.keys()] };
}

/* ── 검사 도구 ──────────────────────────────────────────── */
let bad = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) bad++;
  console.log(`${ok ? '  통과' : '  실패'}  ${name}${detail ? `  (${detail})` : ''}`);
}
/*
 * 세트를 누른 시각. 지금으로부터 세 시간 전을 0분으로 센다.
 *
 * 날짜를 박아 두지 않는다. 예전 폰은 7일이 지난 것을 버렸다(EX-LOAD01-R1 부터 운동 세트는 나이로 버리지 않는다 — ⑨). 한 번
 * 돌리는 동안에는 기준이 바뀌지 않아 누른 순서와 시각 비교는 그대로다.
 */
const BASE = Date.now() - 3 * 60 * 60 * 1000;
const at = (min: number) => new Date(BASE + min * 60_000).toISOString();
/*
 * EX-LOAD01-R1 — 세트는 담은 계정(owner)을 단다(운동 화면이 늘 withOwner 로 붙인다). 계정 표시가 없는 줄은 이제 보내지 않으므로(⑮ ⑯),
 * 보내기를 보는 시험의 세트는 시험 계정 U1 을 단다. 계정 표시가 없는 옛 줄은 owner 에 null 을 넘겨 만든다.
 */
const set = (exerciseId: string, setNo: number, min: number, sessionId = 'S1', who: string | null = 'U1') => ({
  sessionId,
  exerciseId,
  setNo,
  weightKg: 60,
  reps: 8,
  holdSeconds: null,
  recordedAt: at(min),
  ...(who ? { owner: who } : {}),
});
const handled: string[] = [];
const handle = (p: { exerciseId: string; setNo: number }, r: Reply) =>
  handled.push(`${p.exerciseId}#${p.setNo}:${r && typeof r === 'object' && 'error' in r ? '거절' : '저장'}`);

/* 웹이 쓰는 보내기 — 운동 화면(sessionId) · 앱 어디서든(SendPendingSets, sessionId 없음). 계정은 시험이 정한다 */
const { drainSets, withOwner } = await import('../components/load/set-outbox.ts');
const { createOutbox } = await import('../lib/outbox.ts');
const { ackOf } = await import('../lib/workout/load/protocol.ts');
let owner: string | null = 'U1';
const drainS = (sessionId?: string) => drainSets({ owner, sessionId, send: logSet, handle, box: m.outbox });

/* ═══════════════════════════════════════════════════════ */
let m = await boot();

console.log('\n① 신호 없음');
signal = false;
m.outbox.add(set('벤치', 1, 0));
m.outbox.add(set('벤치', 2, 3));
let r = await drainS('S1');
check("보내기 결과가 'offline'", r === 'offline', r);
check('두 세트가 폰에 그대로 남음', m.outbox.snapshot().length === 2);
check('서버에는 아무것도 없음', server.size === 0);

console.log('\n② 앱을 껐다 켬 (신호 여전히 없음)');
m = await boot();
check('폰 저장소에서 두 세트를 다시 읽음', m.outbox.snapshot().length === 2);

console.log('\n③ 신호 돌아옴');
signal = true;
r = await drainS('S1');
check("보내기 결과가 'done'", r === 'done', r);
check('누른 순서대로 보냄', sent.join(',') === '벤치#1,벤치#2', sent.join(','));
check('폰에서 비워짐', m.outbox.snapshot().length === 0);
check('저장소 칸도 지워짐', disk.size === 0);
check('누른 시각 그대로 서버에 남음', server.get('S1|벤치|1')?.recordedAt === at(0));

console.log('\n④ 저장은 됐는데 답만 못 받음 → 다시 보냄');
sent.length = 0;
m.outbox.add(set('스쿼트', 1, 10));
loseReply = true;
r = await drainS('S1');
check("첫 시도는 'offline' 로 끝남", r === 'offline', r);
check('폰에 남아 있음 (다시 보낼 것)', m.outbox.snapshot().length === 1);
r = await drainS('S1');
check('같은 번호로 다시 보냄', sent.join(',') === '스쿼트#1,스쿼트#1', sent.join(','));
const squats = [...server.keys()].filter((k) => k.startsWith('S1|스쿼트|')).length;
check('서버에는 한 줄만 (두 번 저장 안 됨)', squats === 1, `${squats}줄`);

console.log('\n⑤ 서버가 거절 (이미 마친 판) — EX-LOAD01: 지우지 않고 붙든다');
handled.length = 0;
sent.length = 0;
m.outbox.add(set('로우', 1, 20, 'closed'));
r = await drainS('closed');
check('거절을 화면에 넘김', handled.join(',') === '로우#1:거절', handled.join(','));
const kept = m.outbox.snapshot().find((p) => p.exerciseId === '로우');
check('거절된 세트는 폰에 남음 (지우지 않음)', !!kept, JSON.stringify(m.outbox.snapshot()));
check('붙든 표가 붙음 (까닭 · 코드)', kept?.held?.code === 'REJECTED' && kept.held.message.includes('이미 마친'), JSON.stringify(kept?.held));
check("한 번만 보내고 'done' (붙든 줄을 되풀이하지 않음)", r === 'done' && sent.length === 1, `${r} · ${sent.join(',')}`);
sent.length = 0;
r = await drainS('closed');
check('붙든 줄은 다음 보내기에서도 건너뜀', sent.length === 0 && r === 'done', sent.join(','));
m.outbox.remove({ sessionId: 'closed', exerciseId: '로우', setNo: 1 });

console.log('\n⑥ 다른 판의 세트는 안 보냄');
sent.length = 0;
m.outbox.add(set('데드', 1, 30, 'OLD'));
r = await drainS('S1');
check(
  'S1 을 비우는 동안 OLD 는 그대로',
  sent.length === 0 && m.outbox.snapshot().length === 1
);
m.outbox.remove({ sessionId: 'OLD', exerciseId: '데드', setNo: 1 });

console.log('\n⑦ 보내는 도중에 새 세트 · 동시에 또 부름');
sent.length = 0;
m.outbox.add(set('풀업', 1, 40));
const first = drainS('S1');
m.outbox.add(set('풀업', 2, 41));
const second = await drainS('S1');
const firstResult = await first;
check("두 번째 호출은 'busy' (한 줄만 돈다)", second === 'busy', second);
check(
  '도중에 담긴 것까지 이어서 보냄',
  sent.join(',') === '풀업#1,풀업#2',
  sent.join(',')
);
check("첫 호출은 'done'", firstResult === 'done', firstResult);

console.log('\n⑧ 보내기 전에 지움');
sent.length = 0;
signal = false;
m.outbox.add(set('컬', 1, 50));
m.outbox.remove({ sessionId: 'S1', exerciseId: '컬', setNo: 1 });
signal = true;
await drainS('S1');
check('지운 세트는 보내지 않음', sent.length === 0);

/*
 * EX-LOAD01-R1 — 바꾼 기대값: 예전에는 '8일 된 것은 버리고 1일 된 것은 남김'이었다. 그것이 바로 GPT 서브1 이 재현한 유실(저장 확인 없는
 * 세트가 다시 켜면 사라지고 다음 쓰기에서 저장소에서도 지워짐)이다. 이제 운동 세트는 나이로 버리지 않는다 — 둘 다 남고, 다음 쓰기 뒤에도 남는다.
 */
console.log('\n⑨ 일주일 넘은 것도 버리지 않음 (EX-LOAD01-R1)');
disk.set(
  'bullpen-log:pending-sets:v1',
  JSON.stringify([
    {
      ...set('옛날', 1, 0),
      recordedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    },
    {
      ...set('어제', 1, 0),
      recordedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ])
);
m = await boot();
const left = m.outbox
  .snapshot()
  .map((p) => p.exerciseId)
  .join(',');
check('8일 된 것도 1일 된 것도 남김 (나이로 버리지 않음)', left.split(',').sort().join(',') === '어제,옛날', left);
m.outbox.add(set('새것', 1, 0));
const afterWrite = JSON.parse(disk.get('bullpen-log:pending-sets:v1') ?? '[]') as { exerciseId: string }[];
check('다음 쓰기 뒤에도 저장소에 8일 된 것이 남음', afterWrite.some((p) => p.exerciseId === '옛날'), afterWrite.map((p) => p.exerciseId).join(','));
m.outbox.remove({ sessionId: 'S1', exerciseId: '옛날', setNo: 1 });
m.outbox.remove({ sessionId: 'S1', exerciseId: '어제', setNo: 1 });
m.outbox.remove({ sessionId: 'S1', exerciseId: '새것', setNo: 1 });

console.log('\n⑩ 서버가 누른 시각을 다듬는 규칙 (lib/workout/set-time.ts)');
const { clampRecordedAt } = await import('../lib/workout/set-time.ts');
const opened = new Date('2026-09-23T09:00:00.000Z');
const now = new Date('2026-09-23T10:00:00.000Z');
const iso = (d: Date) => d.toISOString();
check(
  '판 안의 시각은 그대로',
  iso(clampRecordedAt('2026-09-23T09:30:00.000Z', opened, now)) ===
    '2026-09-23T09:30:00.000Z'
);
check(
  '미래 시각(폰 시계가 빠름)은 지금으로',
  iso(clampRecordedAt('2026-09-23T10:05:00.000Z', opened, now)) === iso(now)
);
check(
  '판을 열기 전 시각은 연 시각으로',
  iso(clampRecordedAt('2026-09-23T08:50:00.000Z', opened, now)) === iso(opened)
);
check(
  '읽을 수 없는 값은 지금으로',
  iso(clampRecordedAt('아무거나', opened, now)) === iso(now)
);
check(
  '값이 없으면 지금으로',
  iso(clampRecordedAt(undefined, opened, now)) === iso(now)
);

console.log('\n⑪ 완료한 세트 고치기 — 같은 번호·같은 시각으로 다시 담는다');
/*
 * 운동 화면(session-client.tsx)이 세트를 고칠 때 하는 그대로다. 시각은 지금
 * 기준으로 잡는다(예전 폰은 7일이 지난 것을 버렸다 — 지금은 버리지 않지만 날짜를 박지 않는 것은 그대로).
 */
disk.clear();
m = await boot();
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const doneAt = ago(30);
const dead = (setNo: number, weightKg: number, reps: number, recordedAt: string) => ({
  sessionId: 'S1',
  exerciseId: '데드',
  setNo,
  weightKg,
  reps,
  holdSeconds: null,
  recordedAt,
  owner: 'U1',
});
/* 화면이 들고 있는 '저장된 세트' — 서버 줄을 그대로 옮겨 담는다 */
const savedDead = () =>
  [...server.entries()]
    .filter(([k]) => k.startsWith('S1|데드|'))
    .map(([k, v]) => ({
      exerciseId: '데드',
      setNo: Number(k.split('|')[2]),
      weightKg: v.weightKg,
      reps: v.reps,
      holdSeconds: null,
      recordedAt: v.recordedAt,
    }));
const shownDead = () =>
  m
    .withPending(
      savedDead(),
      m.outbox.snapshot().filter((p) => p.sessionId === 'S1')
    )
    .filter((s) => s.exerciseId === '데드');

signal = true;
m.outbox.add(dead(1, 60, 8, doneAt));
await drainS('S1');
check('처음 남긴 세트: 60kg × 8회', server.get('S1|데드|1')?.weightKg === 60);

signal = false;
m.outbox.add(dead(1, 65, 6, doneAt));
let row = shownDead().filter((s) => s.setNo === 1);
check(
  '신호가 없어도 고친 값이 바로 보임',
  row.length === 1 && row[0].weightKg === 65 && row[0].reps === 6,
  JSON.stringify(row)
);
check('같은 세트가 두 줄로 안 보임', row.length === 1, String(row.length));
check('고친 줄에 대기 표시', row[0]?.pending === true);

m.outbox.add(dead(2, 65, 6, ago(25)));
check(
  '새로 남긴 세트는 저장된 것 뒤에 대기로 붙음',
  shownDead().some((s) => s.setNo === 2 && s.pending === true)
);
/* 운동 화면의 지우기와 같다 — 아직 서버에 없던 세트는 폰에서 빼면 끝 */
m.outbox.remove({ sessionId: 'S1', exerciseId: '데드', setNo: 2 });
check('보내기 전에 지운 세트는 안 보임', !shownDead().some((s) => s.setNo === 2));

signal = true;
r = await drainS('S1');
check("신호가 돌아오면 'done'", r === 'done', r);
const fixed = server.get('S1|데드|1');
check('서버의 그 줄이 고친 값으로 바뀜', fixed?.weightKg === 65 && fixed?.reps === 6);
check('마친 시각은 처음 그대로', fixed?.recordedAt === doneAt, fixed?.recordedAt);
check('줄이 늘지 않음 — 덮어씀', savedDead().length === 1, String(savedDead().length));
check(
  '다 보내면 대기 표시가 사라짐',
  shownDead().every((s) => !s.pending)
);

/* 고친 값을 보내기 전에 그 세트를 지우면 — 폰의 고친 값부터 빼야 되살아나지 않는다 */
signal = false;
m.outbox.add(dead(1, 70, 5, doneAt));
m.outbox.remove({ sessionId: 'S1', exerciseId: '데드', setNo: 1 });
row = shownDead().filter((s) => s.setNo === 1);
check(
  '폰의 고친 값을 빼면 서버 값이 다시 보임',
  row.length === 1 && row[0].weightKg === 65 && !row[0].pending,
  JSON.stringify(row)
);
check('다시 보낼 것이 남지 않음', m.outbox.snapshot().length === 0);
signal = true;

/* ═══════════════ EX-LOAD01 — 붙들기 · 계정 · 저장 확인 ═══════════════ */
disk.clear();
m = await boot();
signal = true;
server.clear();
const band = {
  kind: 'band' as const,
  role: 'resistance' as const,
  bands: [
    {
      catalog: '2026-11-16.1',
      seriesId: 'theraband-professional-latex-band',
      levelId: 'theraband-professional-latex-band:yellow',
      label: { ko: '노랑', en: 'Yellow', ja: 'イエロー' },
      swatch: '#f2d43d',
    },
  ],
};
const heldOfKey = (exerciseId: string, setNo = 1) =>
  m.outbox.snapshot().find((p) => p.exerciseId === exerciseId && p.setNo === setNo)?.held ?? null;

console.log('\n⑫ 고쳐야 하는 거절(actionRequired) — 붙들고, 보내기는 건너뜀');
sent.length = 0;
nextReply = { error: '이 운동은 무게 없이 횟수 · 시간으로 기록해요.', code: 'LOAD_NOT_ALLOWED', actionRequired: true };
m.outbox.add(withOwner({ ...set('포고', 1, 100), loadProtocol: 1 }, 'U1'));
r = await drainS('S1');
check('붙든 표 LOAD_NOT_ALLOWED', heldOfKey('포고')?.code === 'LOAD_NOT_ALLOWED', JSON.stringify(heldOfKey('포고')));
check('세트 값은 그대로 남음 (kg · 횟수)', m.outbox.snapshot().some((p) => p.exerciseId === '포고' && p.weightKg === 60 && p.reps === 8));
sent.length = 0;
r = await drainS('S1');
check('붙든 줄은 다시 안 보냄', sent.length === 0, sent.join(','));
/* 예전 길(lib/workout/outbox.ts drainOutbox — 덧붙임 없음)도 붙든 줄은 고르지 않는다(lib/outbox.ts isHeld) */
await m.drainOutbox('S1', logSet, handle);
check('예전 보내기도 붙든 줄을 건너뜀 · 지우지 않음', sent.length === 0 && !!heldOfKey('포고'), sent.join(','));

console.log('\n⑬ 고쳐서 다시 담으면 붙든 표가 풀림 (같은 세트 번호)');
m.outbox.add(withOwner({ ...set('포고', 1, 100), weightKg: null, loadProtocol: 1 }, 'U1'));
check('다시 담은 줄은 붙든 표 없음', heldOfKey('포고') === null && m.outbox.snapshot().filter((p) => p.exerciseId === '포고').length === 1);
sent.length = 0;
r = await drainS('S1');
check('풀린 줄을 보내고 저장되면 뺌', sent.join(',') === '포고#1' && !m.outbox.snapshot().some((p) => p.exerciseId === '포고'), sent.join(','));
check('서버에는 고친 값(kg 없음)', server.get('S1|포고|1')?.weightKg === null);

console.log('\n⑭ 일반 오류 · 모양이 틀린 성공 · 저장 확인 없는 밴드 — 모두 붙듦');
nextReply = { error: '서버 오류' };
m.outbox.add(withOwner({ ...set('스쿼트2', 1, 110), loadProtocol: 1 }, 'U1'));
await drainS('S1');
check('코드 없는 오류 → REJECTED 로 붙듦', heldOfKey('스쿼트2')?.code === 'REJECTED', JSON.stringify(heldOfKey('스쿼트2')));
nextReply = { ok: true };
m.outbox.add(withOwner({ ...set('스쿼트3', 1, 111), loadProtocol: 1 }, 'U1'));
await drainS('S1');
check('모양이 틀린 성공 → MALFORMED 로 붙듦', heldOfKey('스쿼트3')?.code === 'MALFORMED', JSON.stringify(heldOfKey('스쿼트3')));
nextReply = { sets: [], loadAck: ackOf(false) };
m.outbox.add(withOwner({ ...set('밴드풀', 1, 112), weightKg: null, loadProtocol: 1, load: band, loadResolver: 1 }, 'U1'));
await drainS('S1');
check('밴드 + 구조화 못 하는 저장 확인(structured:false) → 붙듦', heldOfKey('밴드풀')?.code === 'LOAD_UNSUPPORTED', JSON.stringify(heldOfKey('밴드풀')));
check('붙든 밴드 줄에 밴드가 그대로', m.outbox.snapshot().find((p) => p.exerciseId === '밴드풀')?.load?.kind === 'band');
nextReply = { sets: [] };
m.outbox.add(withOwner({ ...set('밴드풀2', 1, 113), weightKg: null, loadProtocol: 1, load: band, loadResolver: 1 }, 'U1'));
await drainS('S1');
check('밴드 + 저장 확인 없음(옛 서버) → 붙듦', heldOfKey('밴드풀2')?.code === 'LOAD_UNSUPPORTED');
nextReply = { sets: [], loadAck: ackOf(true) };
m.outbox.add(withOwner({ ...set('밴드풀3', 1, 114), weightKg: null, loadProtocol: 1, load: band, loadResolver: 1 }, 'U1'));
await drainS('S1');
check('밴드 + 같은 판 구조화 저장 확인 → 저장(뺌)', !m.outbox.snapshot().some((p) => p.exerciseId === '밴드풀3'));
m.outbox.add(withOwner({ ...set('벤치2', 1, 115), loadProtocol: 1 }, 'U1'));
await drainS('S1');
check('무게만인 세트 + 확인 없는 { sets } → 저장(뺌, 꺼진 서버의 옛 칸 길)', !m.outbox.snapshot().some((p) => p.exerciseId === '벤치2'));
nextReply = { sets: [], loadAck: { protocol: 9, persisted: true } };
m.outbox.add(withOwner({ ...set('벤치3', 1, 116), loadProtocol: 1 }, 'U1'));
await drainS('S1');
check('무게만인 세트 + 다른 판 확인 → LOAD_VERSION 으로 붙듦', heldOfKey('벤치3')?.code === 'LOAD_VERSION');

console.log('\n⑮ 계정 거르기 — 다른 계정이 담은 세트는 보내지도 지우지도 않음');
disk.clear();
m = await boot();
server.clear();
m.outbox.add(withOwner(set('남의것', 1, 120), 'U2'));
m.outbox.add(withOwner(set('내것', 1, 121), 'U1'));
m.outbox.add(set('옛줄', 1, 122, 'S1', null));
sent.length = 0;
owner = 'U1';
await drainS();
/* EX-LOAD01-R1 — 바꾼 기대값: 예전에는 '내 것과 계정 표시 없는 옛 줄만 보냄'(옛 줄을 지금 계정으로 보냈다). 계정을 모르는 줄의 내용은 보내지 않는다 */
check('내 것만 보내고, 계정 표시 없는 옛 줄은 보내지 않음', sent.join(',') === '내것#1', sent.join(','));
const oldRow = m.outbox.snapshot().find((p) => p.exerciseId === '옛줄');
check('옛 줄은 남고 지금 계정 것으로 삼지 않음(계정 표시 · 붙든 표 없음)', !!oldRow && !oldRow.owner && !oldRow.held, JSON.stringify(oldRow));
check('다른 계정의 줄은 그대로 남음 (붙들지도 않음)', m.outbox.snapshot().some((p) => p.exerciseId === '남의것' && !p.held));
sent.length = 0;
owner = null;
m.outbox.add(withOwner(set('내것2', 1, 123), 'U1'));
await drainS();
check('계정을 모르면 계정 표시가 붙은 줄은 안 보냄', sent.length === 0 && m.outbox.snapshot().some((p) => p.exerciseId === '내것2'), sent.join(','));
owner = 'U2';
sent.length = 0;
await drainS();
check('그 계정으로 돌아오면 그 계정 것을 보냄(옛 줄은 여전히 안 보냄)', sent.join(',') === '남의것#1', sent.join(','));
owner = 'U1';
check('서버가 이 계정의 판이라고 확인한 뒤(bindOwner)에만 옛 줄에 계정이 붙음', m.outbox.bindOwner({ sessionId: 'S1', exerciseId: '옛줄', setNo: 1 }, 'U1') && m.outbox.snapshot().find((p) => p.exerciseId === '옛줄')?.owner === 'U1');
check('이미 계정이 있는 줄은 bindOwner 로 바꾸지 않음', !m.outbox.bindOwner({ sessionId: 'S1', exerciseId: '남의것', setNo: 1 }, 'U1'));
sent.length = 0;
await drainS();
check('계정이 붙은 뒤에는 그 계정으로 보냄', sent.includes('옛줄#1') && !m.outbox.snapshot().some((p) => p.exerciseId === '옛줄'), sent.join(','));

console.log("\n⑯ '이 계정의 판이 아님'(SESSION_UNAVAILABLE)");
disk.clear();
m = await boot();
/* EX-LOAD01-R1 — 바꾼 기대값: 예전에는 계정 표시 없는 줄을 보내고 이 답을 받아 OWNER_UNKNOWN 으로 붙들었다. 이제 아예 보내지 않는다 */
m.outbox.add(set('옛줄2', 1, 130, 'S1', null));
sent.length = 0;
await drainS('S1');
check('계정 표시 없는 줄은 보내지 않고(답을 받을 일도 없음) 그대로 남김', sent.length === 0 && !!m.outbox.snapshot().find((p) => p.exerciseId === '옛줄2') && heldOfKey('옛줄2') === null, sent.join(','));
nextReply = { error: '이미 마친 운동이라 이 세트는 저장하지 못했어요.', code: 'SESSION_UNAVAILABLE' };
nextReply = { error: '이미 마친 운동이라 이 세트는 저장하지 못했어요.', code: 'SESSION_UNAVAILABLE' };
m.outbox.add(withOwner(set('내판끝', 1, 131), 'U1'));
await drainS('S1');
check('내 계정 줄도 지우지 않고 SESSION_UNAVAILABLE 로 붙듦', heldOfKey('내판끝')?.code === 'SESSION_UNAVAILABLE', JSON.stringify(heldOfKey('내판끝')));

console.log('\n⑰ 보내는 사이 고친 값은 붙든 표로 덮지 않음');
disk.clear();
m = await boot();
nextReply = { error: '값이 이상해요', code: 'LOAD_INVALID', actionRequired: true };
m.outbox.add(withOwner({ ...set('데드2', 1, 140), loadProtocol: 1 }, 'U1'));
sent.length = 0;
const racing = drainS('S1');
m.outbox.add(withOwner({ ...set('데드2', 1, 140), reps: 5, loadProtocol: 1 }, 'U1'));
await racing;
const after = m.outbox.snapshot().filter((p) => p.exerciseId === '데드2');
check('옛 값의 거절이 고친 새 값을 붙들지 않음', !after.some((p) => p.held), JSON.stringify(after));
check('고친 새 값(5회)을 이어서 보내 저장 · 빠짐', sent.join(',') === '데드2#1,데드2#1' && after.length === 0 && server.get('S1|데드2|1')?.reps === 5, sent.join(','));

console.log('\n⑱ 암케어 체크 대기열(덧붙임 없음)은 예전 그대로 — 답을 받으면 뺀다 · 7일 지난 것은 버린다');
const checks = createOutbox<{ exerciseId: string; dateKey: string; recordedAt: string }, { exerciseId: string; dateKey: string }>({
  key: 'test:armcare',
  isItem: (v): v is { exerciseId: string; dateKey: string; recordedAt: string } => !!v && typeof v === 'object',
  same: (a, b) => a.exerciseId === b.exerciseId && a.dateKey === b.dateKey,
});
checks.add({ exerciseId: 'w', dateKey: '2026-11-16', recordedAt: at(150) });
await checks.drain(() => true, async () => ({ error: '거절' }), () => {});
check('거절 답이어도 뺀다 (암케어는 바뀌지 않음)', checks.snapshot().length === 0);
{
  /* EX-LOAD01-R1 — 암케어(기본 설정)는 7일 거르기 · 모양이 틀린 줄 버리기가 예전 그대로다 */
  disk.set('test:armcare7', JSON.stringify([
    { exerciseId: 'old', dateKey: '2026-11-01', recordedAt: new Date(Date.now() - 8 * 86400000).toISOString() },
    { exerciseId: 'new', dateKey: '2026-11-16', recordedAt: new Date(Date.now() - 86400000).toISOString() },
    { bad: true },
  ]));
  const arm = createOutbox<{ exerciseId: string; dateKey: string; recordedAt: string }, { exerciseId: string; dateKey: string }>({
    key: 'test:armcare7',
    isItem: (v): v is { exerciseId: string; dateKey: string; recordedAt: string } => !!v && typeof v === 'object' && typeof (v as { exerciseId?: unknown }).exerciseId === 'string',
    same: (a, b) => a.exerciseId === b.exerciseId && a.dateKey === b.dateKey,
  });
  check('암케어: 8일 된 체크는 예전처럼 버린다 · 1일 된 것은 남긴다', arm.snapshot().map((p) => p.exerciseId).join(',') === 'new');
  arm.add({ exerciseId: 'w2', dateKey: '2026-11-17', recordedAt: at(151) });
  const stored = JSON.parse(disk.get('test:armcare7') ?? '[]') as { exerciseId?: string }[];
  check('암케어: 다음 쓰기에서 8일 된 것 · 모양이 틀린 줄은 저장소에서도 빠진다(예전 그대로)', stored.length === 2 && !stored.some((p) => p.exerciseId === 'old'), JSON.stringify(stored));
  check('암케어: 복구 화면 묶음은 늘 비어 있다(keepUnknown 꺼짐)', arm.extras().malformed.length === 0 && arm.extras().corrupt.length === 0);
}

console.log('\n⑲ 담기 전에 거르기 — 운동 화면이 서버와 같은 정규화로 먼저 본다(components/load/set-load.ts)');
{
  const { resolveRecordingContract } = await import('../lib/workout/load/contract.ts');
  const { overridesFor } = await import('../lib/workout/load/overrides.ts');
  const { EMPTY_LOAD_DRAFT, buildSetLoad, checkSetLoad, loadForm } = await import('../components/load/set-load.ts');
  const C = (equipment: string[], id = 'x') => resolveRecordingContract({ exerciseId: id, equipment, overrides: overridesFor(id) });
  const pogo = C([], '258c0eee-85fe-46dd-b6a1-d2639bb58345');
  const pb = buildSetLoad({ contract: pogo, structured: true, weightKg: 40, draft: EMPTY_LOAD_DRAFT });
  check('포고 홉 — kg 칸 없음, 적힌 kg 은 보내지 않음', loadForm(pogo, null, true).kg === 'none' && pb.ok && pb.weightKg === null && checkSetLoad(pogo, true, pb) === null);
  const bandC = C(['밴드']);
  check('밴드 — 구조화 저장이 꺼져 있으면 고르기 대신 안내, 횟수만', loadForm(bandC, null, false).band === 'notice');
  const stale = { ...band.bands[0], catalog: '2025-01-01.1' };
  const sb = buildSetLoad({ contract: bandC, structured: true, weightKg: null, draft: { ...EMPTY_LOAD_DRAFT, role: 'resistance', bands: [stale] } });
  check('다른 판 카탈로그의 밴드는 담기 전에 걸림', sb.ok && checkSetLoad(bandC, true, sb) !== null, sb.ok ? String(checkSetLoad(bandC, true, sb)) : 'build');
  const db = C(['덤벨']);
  check('덤벨 — 칸 이름 한 손 · 한 개, 꼭 적음', loadForm(db, null, false).kgLabel === '무게(한 손 · 한 개)' && !buildSetLoad({ contract: db, structured: false, weightKg: null, draft: EMPTY_LOAD_DRAFT }).ok);
}

console.log('\n⑳ 지난 밴드 · 역할 · 기구 이름 기억은 계정마다 — A 의 것을 B 가 받지 않고, 계정을 모르면 안 쓰고, 계정 없는 옛 기억은 안 읽는다');
{
  const { recallBands, rememberBands, recallRole, rememberRole, recallSetup, rememberSetup } = await import('../components/load/set-load.ts');
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  const yellow = band.bands[0];
  rememberBands('A', 'ex1', 'resistance', [yellow], store);
  rememberRole('A', 'ex1', 'assistance', store);
  rememberSetup('A', 'ex2', 'A짐 1번', store);
  check('A 는 제 밴드 · 역할 · 기구 이름을 다시 받는다', recallBands('A', 'ex1', 'resistance', store).length === 1 && recallRole('A', 'ex1', store) === 'assistance' && recallSetup('A', 'ex2', store) === 'A짐 1번');
  check('B 는 A 의 밴드 · 역할 · 기구 이름을 받지 않는다', recallBands('B', 'ex1', 'resistance', store).length === 0 && recallRole('B', 'ex1', store) === null && recallSetup('B', 'ex2', store) === '');
  rememberBands('B', 'ex1', 'resistance', [band.bands[0]], store);
  rememberSetup('B', 'ex2', 'B짐 2번', store);
  check('B 가 저장해도 A 의 기억은 그대로', recallSetup('A', 'ex2', store) === 'A짐 1번' && recallSetup('B', 'ex2', store) === 'B짐 2번');
  rememberSetup(null, 'ex3', '모름', store);
  check('계정을 모르면 기억하지도 꺼내지도 않는다', recallSetup(null, 'ex3', store) === '' && recallBands(null, 'ex1', 'resistance', store).length === 0 && ![...mem.keys()].some((k) => mem.get(k)?.includes('모름')));
  mem.set('bullpen-log:band-last:v1', JSON.stringify({ 'ex9|resistance': [yellow] }));
  mem.set('bullpen-log:setup-last:v1', JSON.stringify({ ex9: '옛 기구' }));
  check('계정 표시가 없던 옛(v1) 기억은 누구에게도 채우지 않는다', recallBands('A', 'ex9', 'resistance', store).length === 0 && recallSetup('A', 'ex9', store) === '');
  check('역할이 다르면 밴드를 채우지 않는다(보조 밴드를 저항에)', recallBands('A', 'ex1', 'assistance', store).length === 0);
}

console.log(bad === 0 ? '\n전부 통과' : `\n${bad}개 실패`);
process.exit(bad === 0 ? 0 : 1);
