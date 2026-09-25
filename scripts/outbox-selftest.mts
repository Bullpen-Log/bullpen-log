/**
 * 신호가 없어도 세트가 안 날아가는지 — lib/workout/outbox.ts 자체 검사.
 *
 *   npm run outbox:test
 *
 * 운동 화면이 쓰는 코드를 그대로 불러와, 폰 저장소(localStorage)와 서버를
 * 흉내 내어 돌린다. 신호 없음 · 응답만 잃음 · 서버 거절 · 보내는 도중 새 세트 ·
 * 보내기 전에 지움 · 앱을 껐다 켬 · 오래된 것 정리를 본다.
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
const server = new Map<string, Row>();
let signal = true;
let loseReply = false;
const sent: string[] = [];

async function logSet(p: {
  sessionId: string;
  exerciseId: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  recordedAt: string;
}): Promise<{ sets: number } | { error: string }> {
  await new Promise((r) => setTimeout(r, 5));
  if (!signal) throw new TypeError('Failed to fetch');
  sent.push(`${p.exerciseId}#${p.setNo}`);
  if (p.sessionId === 'closed')
    return { error: '이미 마친 운동이라 이 세트는 저장하지 못했습니다.' };
  server.set(`${p.sessionId}|${p.exerciseId}|${p.setNo}`, {
    weightKg: p.weightKg,
    reps: p.reps,
    recordedAt: p.recordedAt,
  });
  if (loseReply) {
    loseReply = false;
    throw new TypeError('Failed to fetch'); // 저장은 됐는데 답이 안 옴
  }
  return { sets: server.size };
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
 * 날짜를 박아 두지 않는다. 폰은 7일이 지난 것을 버리므로(⑨), 예전처럼
 * 9월 23일로 박아 두면 그 주가 지난 뒤에 돌릴 때 '앱을 껐다 켜니 세트가
 * 사라졌다'로 엉뚱하게 실패한다. 한 번 돌리는 동안에는 기준이 바뀌지 않아
 * 누른 순서와 시각 비교는 그대로다.
 */
const BASE = Date.now() - 3 * 60 * 60 * 1000;
const at = (min: number) => new Date(BASE + min * 60_000).toISOString();
const set = (exerciseId: string, setNo: number, min: number, sessionId = 'S1') => ({
  sessionId,
  exerciseId,
  setNo,
  weightKg: 60,
  reps: 8,
  holdSeconds: null,
  recordedAt: at(min),
});
const handled: string[] = [];
const handle = (
  p: { exerciseId: string; setNo: number },
  r: { sets: number } | { error: string }
) => handled.push(`${p.exerciseId}#${p.setNo}:${'error' in r ? '거절' : '저장'}`);

/* ═══════════════════════════════════════════════════════ */
let m = await boot();

console.log('\n① 신호 없음');
signal = false;
m.outbox.add(set('벤치', 1, 0));
m.outbox.add(set('벤치', 2, 3));
let r = await m.drainOutbox('S1', logSet, handle);
check("보내기 결과가 'offline'", r === 'offline', r);
check('두 세트가 폰에 그대로 남음', m.outbox.snapshot().length === 2);
check('서버에는 아무것도 없음', server.size === 0);

console.log('\n② 앱을 껐다 켬 (신호 여전히 없음)');
m = await boot();
check('폰 저장소에서 두 세트를 다시 읽음', m.outbox.snapshot().length === 2);

console.log('\n③ 신호 돌아옴');
signal = true;
r = await m.drainOutbox('S1', logSet, handle);
check("보내기 결과가 'done'", r === 'done', r);
check('누른 순서대로 보냄', sent.join(',') === '벤치#1,벤치#2', sent.join(','));
check('폰에서 비워짐', m.outbox.snapshot().length === 0);
check('저장소 칸도 지워짐', disk.size === 0);
check('누른 시각 그대로 서버에 남음', server.get('S1|벤치|1')?.recordedAt === at(0));

console.log('\n④ 저장은 됐는데 답만 못 받음 → 다시 보냄');
sent.length = 0;
m.outbox.add(set('스쿼트', 1, 10));
loseReply = true;
r = await m.drainOutbox('S1', logSet, handle);
check("첫 시도는 'offline' 로 끝남", r === 'offline', r);
check('폰에 남아 있음 (다시 보낼 것)', m.outbox.snapshot().length === 1);
r = await m.drainOutbox('S1', logSet, handle);
check('같은 번호로 다시 보냄', sent.join(',') === '스쿼트#1,스쿼트#1', sent.join(','));
const squats = [...server.keys()].filter((k) => k.startsWith('S1|스쿼트|')).length;
check('서버에는 한 줄만 (두 번 저장 안 됨)', squats === 1, `${squats}줄`);

console.log('\n⑤ 서버가 거절 (이미 마친 판)');
handled.length = 0;
m.outbox.add(set('로우', 1, 20, 'closed'));
r = await m.drainOutbox('closed', logSet, handle);
check('거절을 화면에 넘김', handled.join(',') === '로우#1:거절', handled.join(','));
check(
  '거절된 것은 폰에서 뺌 (계속 다시 보내지 않음)',
  m.outbox.snapshot().length === 0
);

console.log('\n⑥ 다른 판의 세트는 안 보냄');
sent.length = 0;
m.outbox.add(set('데드', 1, 30, 'OLD'));
r = await m.drainOutbox('S1', logSet, handle);
check(
  'S1 을 비우는 동안 OLD 는 그대로',
  sent.length === 0 && m.outbox.snapshot().length === 1
);
m.outbox.remove({ sessionId: 'OLD', exerciseId: '데드', setNo: 1 });

console.log('\n⑦ 보내는 도중에 새 세트 · 동시에 또 부름');
sent.length = 0;
m.outbox.add(set('풀업', 1, 40));
const first = m.drainOutbox('S1', logSet, handle);
m.outbox.add(set('풀업', 2, 41));
const second = await m.drainOutbox('S1', logSet, handle);
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
await m.drainOutbox('S1', logSet, handle);
check('지운 세트는 보내지 않음', sent.length === 0);

console.log('\n⑨ 일주일 넘은 것은 정리');
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
check('8일 된 것은 버리고 1일 된 것은 남김', left === '어제', left);

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
 * 기준으로 잡는다 — 7일이 지난 것은 폰이 버리므로(⑨), 날짜를 박아 두면 그
 * 날이 지나서 돌릴 때 엉뚱하게 실패한다.
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
await m.drainOutbox('S1', logSet, handle);
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
r = await m.drainOutbox('S1', logSet, handle);
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

console.log(bad === 0 ? '\n전부 통과' : `\n${bad}개 실패`);
process.exit(bad === 0 ? 0 : 1);
