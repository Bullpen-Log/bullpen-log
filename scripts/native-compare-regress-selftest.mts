/**
 * 투구 영상 비교 — 독립 검토(2026-11-02, F01~F08)의 재현을 옮긴 회귀 시험. 원하는 동작을 주장한다(고치기 전 코드에서는 실패한다).
 * 실행: npm run native-compare:regress (npm run native-compare:test 가 같이 돌린다)
 *
 * 저장(F01 · F04 · F06): 실제 저장 함수 + 두 손잡이 — (가) 메모리 손잡이: 실제 기기 move(overwrite) 처럼 '대상 지우기 → 옮기기' 두 단계로,
 * 단계마다 끊김을 넣는다 (나) 디스크 손잡이: 이 맥의 임시 폴더에 진짜 파일을 쓴다(compare/fs.ts 와 같은 의미 — expo 모듈 자체는 아님).
 * 재생 · 복원(F02 · F03 · F05)과 고르기(F07): 실제 소스(훅 · 문서 함수)를 가짜 재생기 · 가짜 훅 순서로 돌린다 — 실제 디코더 · React 렌더 아님.
 * 실패를 모아 끝에 한꺼번에 보이고, 하나라도 있으면 끝 코드 1.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activePair, createDocument, duplicate, parseDocument, updatePair, type ComparisonDocument, type NewSource } from '~/compare/doc';
import { createAutosaver, createStorage, type FsAdapter, type Timer } from '~/compare/storage';

const fails: string[] = [];
let passed = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    fails.push(`${name}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
}
const eq = (a: unknown, b: unknown, m = '값이 다름') => assert.deepEqual(a, b, m);
const ok = (v: unknown, m = '참이 아님') => assert.ok(v, m);

const OWNER = 'u1';
const NOW = '2026-11-02T01:00:00.000Z';
const P1 = 'u1/local-p1';
const P2 = 'u1/local-p2';
const src = (path: string, owned: boolean): NewSource => ({ path, origin: 'photos', owned, label: null, date: '2026-11-01' });
const mk = (id: string, owned = true, paths = [P1, P2], at = NOW) => ({ ...createDocument(OWNER, paths.map((p) => src(p, owned)), at, { doc: id, sources: paths.map((_, i) => `s${i}`) }), updatedAt: at });

/* ---- 손잡이 ---- */
type Op = { op: 'read' | 'write' | 'rmdest' | 'rename' | 'remove' | 'list'; name: string };
function memFs(opts: { fail?: (o: Op, i: number) => boolean; slowReadOf?: string } = {}) {
  const files = new Map<string, string>();
  const log: Op[] = [];
  const hit = (o: Op) => {
    log.push(o);
    if (opts.fail?.(o, log.length)) throw new Error(`injected ${o.op} ${o.name}`);
  };
  const fs: FsAdapter = {
    read: async (n) => {
      hit({ op: 'read', name: n });
      await Promise.resolve();
      return files.get(n) ?? null;
    },
    write: async (n, t) => {
      hit({ op: 'write', name: n });
      await Promise.resolve();
      files.set(n, t);
    },
    move: async (a, b) => {
      await Promise.resolve();
      if (!files.has(a)) throw new Error('nofile');
      if (files.has(b)) {
        hit({ op: 'rmdest', name: b });
        files.delete(b);
      }
      hit({ op: 'rename', name: `${a}>${b}` });
      files.set(b, files.get(a)!);
      files.delete(a);
    },
    remove: async (n) => {
      hit({ op: 'remove', name: n });
      files.delete(n);
    },
    list: async () => {
      hit({ op: 'list', name: '' });
      await Promise.resolve();
      return [...files.keys()];
    },
  };
  return { fs, files, log };
}
/** 이 맥의 임시 폴더 — compare/fs.ts 처럼: 없으면 null, move 는 대상 지우고 옮김 */
function diskFs() {
  const dir = mkdtempSync(join(tmpdir(), 'sinker-compare-'));
  const fs: FsAdapter = {
    read: async (n) => (existsSync(join(dir, n)) ? readFileSync(join(dir, n), 'utf8') : null),
    write: async (n, t) => writeFileSync(join(dir, n), t),
    move: async (a, b) => {
      if (!existsSync(join(dir, a))) throw new Error('nofile');
      if (existsSync(join(dir, b))) rmSync(join(dir, b));
      renameSync(join(dir, a), join(dir, b));
    },
    remove: async (n) => {
      if (existsSync(join(dir, n))) rmSync(join(dir, n));
    },
    list: async () => readdirSync(dir),
  };
  return { fs, dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const strip = (d: ComparisonDocument) => JSON.parse(JSON.stringify(d)) as ComparisonDocument;

/* =========================================================== F01 — 공통 목록 경합 · 참조 중인 영상 보존 */
let lockN = 0;
const fresh = (fs: FsAdapter) => createStorage(fs, OWNER, { lockKey: `t${lockN++}` });

await check('F01 병렬 저장 둘 — 둘 다 최근 목록에', async () => {
  const m = memFs();
  m.files.set('index.json', JSON.stringify({ v: 1, owner: OWNER, entries: [] }));
  const st = fresh(m.fs);
  await Promise.all([st.save(mk('ca', false)), st.save(mk('cb', true))]);
  eq((await st.recent()).map((e) => e.id).sort(), ['ca', 'cb']);
});

await check('F01 검토 재현 — 목록에서 빠진 문서가 쓰는 복사본은 안 지움', async () => {
  const m = memFs();
  m.files.set('index.json', JSON.stringify({ v: 1, owner: OWNER, entries: [] }));
  const st = fresh(m.fs);
  await Promise.all([st.save(mk('ca', false)), st.save(mk('cb', true))]);
  const deleted: string[] = [];
  const r = await st.remove('cb', { deleteAssets: async (p) => void deleted.push(...p) });
  ok(r.ok, '지우기 성공');
  eq(deleted, [], '실제로 지운 영상 없음');
  ok((await st.load('ca')).ok, '남은 문서');
});

await check('F01 병렬 저장 스물 — 모두 목록에', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  await Promise.all(Array.from({ length: 20 }, (_, i) => st.save(mk(`c${i}`, i === 0))));
  eq((await st.recent()).length, 20);
});

await check('F01 일부만 적힌 목록 · 깨진 목록 — 폴더에서 다시', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  for (const id of ['x1', 'x2', 'x3']) await st.save(mk(id));
  m.files.set('index.json', JSON.stringify({ v: 1, owner: OWNER, entries: [{ id: 'x1', updatedAt: NOW }] }));
  eq((await st.recent()).map((e) => e.id).sort(), ['x1', 'x2', 'x3'], '빠진 줄');
  m.files.set('index.json', '{garbage');
  eq((await st.recent()).length, 3, '깨진 목록');
  m.files.delete('x2.json');
  eq((await st.recent()).map((e) => e.id).sort(), ['x1', 'x3'], '없어진 문서는 목록에서');
});

await check('F01 문서 520개 — 목록 500개 밖의 오래된 문서가 쓰는 영상도 남김', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  const old = mk('zold', false, [P1], '2020-01-01T00:00:00.000Z');
  await st.save(old);
  for (let i = 0; i < 519; i++) await st.save(mk(`d${i}`, false, [`u1/local-q${i}`], `2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`));
  await st.save(mk('owner1', true, [P1]));
  const idx = JSON.parse(m.files.get('index.json')!) as { entries: { id: string }[] };
  ok(!idx.entries.some((e) => e.id === 'zold'), '오래된 문서는 목록 밖');
  const deleted: string[] = [];
  await st.remove('owner1', { deleteAssets: async (p) => void deleted.push(...p) });
  eq(deleted, []);
});

await check('F01 지우기와 겹친 늦은 저장 — 되살아나지 않음', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  const s1 = await st.save(mk('cz'));
  assert.ok(s1.ok);
  const [rm, late] = await Promise.all([st.remove('cz'), st.save(updatePair(s1.doc, { rel: 3 }))]);
  ok(rm.ok, '지움');
  eq(late.ok ? 'ok' : late.reason, 'deleted', '지운 뒤 저장은 거절');
  eq(await st.load('cz'), { ok: false, reason: 'missing' });
  ok(![...m.files.keys()].some((k) => k.startsWith('cz.')), '파일 없음');
});

await check('F01 지우기 중 사본 저장 — 사본이 쓰는 영상은 남김', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  const s1 = await st.save(mk('orig'));
  assert.ok(s1.ok);
  const copy = duplicate(s1.doc, NOW, 'copy1');
  const deleted: string[] = [];
  const [, rm] = await Promise.all([st.save(copy), st.remove('orig', { deleteAssets: async (p) => void deleted.push(...p) })]);
  ok(rm.ok);
  eq(deleted, []);
});

await check('F01 못 읽는 문서가 있으면 영상을 안 지움', async () => {
  const m = memFs({ fail: (o) => o.op === 'read' && o.name === 'other.json' });
  const st = fresh(m.fs);
  m.files.set('other.json', JSON.stringify(mk('other', false, [P1])));
  await st.save(mk('own'));
  const deleted: string[] = [];
  const r = await st.remove('own', { deleteAssets: async (p) => void deleted.push(...p) });
  eq(deleted, []);
  ok(r.kept.includes(P1) && r.kept.includes(P2), '남긴 영상으로 알림');
});

await check('F01 폴더 목록을 못 읽으면 영상을 안 지움', async () => {
  let failList = false;
  const m = memFs({ fail: (o) => failList && o.op === 'list' });
  const st = fresh(m.fs);
  await st.save(mk('own'));
  failList = true;
  const deleted: string[] = [];
  await st.remove('own', { deleteAssets: async (p) => void deleted.push(...p) });
  eq(deleted, []);
});

await check('F01 문서 파일을 못 지우면 실패로 · 영상도 그대로', async () => {
  const m = memFs({ fail: (o) => o.op === 'remove' && o.name === 'own.json' });
  const st = fresh(m.fs);
  await st.save(mk('own'));
  const deleted: string[] = [];
  const r = await st.remove('own', { deleteAssets: async (p) => void deleted.push(...p) });
  eq(r.ok, false);
  eq(deleted, []);
  ok(m.files.has('own.json'));
});

await check('F01 끊긴 복구 판(앞판만 · tmp 만)이 쓰는 영상도 남김', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  await st.save(mk('own'));
  m.files.set('half.prev', JSON.stringify(mk('half', false, [P1])));
  m.files.set('half2.tmp', JSON.stringify(mk('half2', false, [P2])).slice(0, -5));
  const deleted: string[] = [];
  await st.remove('own', { deleteAssets: async (p) => void deleted.push(...p) });
  eq(deleted, []);
});

await check('F01 깨진 문서 — 글자에 경로가 있으면 남기고 없으면 지움', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  await st.save(mk('own'));
  m.files.set('broken.json', `{"x":"${P1}"`);
  const deleted: string[] = [];
  await st.remove('own', { deleteAssets: async (p) => void deleted.push(...p) });
  eq(deleted, [P2]);
});

await check('F01 열린 화면이 붙든 경로(keep)는 안 지움 · 나머지는 지움', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  await st.save(mk('own'));
  const deleted: string[] = [];
  const r = await st.remove('own', { deleteAssets: async (p) => void deleted.push(...p), keep: () => new Set([P1]) });
  eq(deleted, [P2]);
  eq(r.kept, [P1]);
});

await check('F01 늦게 끝나는 실제 지우기 — 그동안 다른 저장은 기다림', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  await st.save(mk('own'));
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let deleting = false;
  const order: string[] = [];
  const rm = st.remove('own', {
    deleteAssets: async () => {
      deleting = true;
      order.push('delete-start');
      await gate;
      order.push('delete-end');
    },
  });
  await new Promise((r) => setTimeout(r, 5));
  ok(deleting, '지우기 시작');
  const sv = st.save(mk('later', false, [P1])).then(() => order.push('save'));
  await new Promise((r) => setTimeout(r, 5));
  eq(order, ['delete-start'], '지우는 중에는 저장이 끼지 않음');
  release();
  await Promise.all([rm, sv]);
  eq(order, ['delete-start', 'delete-end', 'save']);
});

await check('F01 정리(releaseAssets) — 문서가 쓰는 가져온 영상은 안 지움', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  await st.save(mk('own', true, [P1]));
  const deleted: string[] = [];
  await st.releaseAssets([P1, P2], { deleteAssets: async (p) => void deleted.push(...p) });
  eq(deleted, [P2]);
});

/* =========================================================== F04 — 복구한 정상 앞판 보존 */

/** 끊김 지점마다: 처음 상태 → 한 번 저장(그 지점에서 실패) → 다시 읽으면 옛 판이나 새 판이 통째로 */
async function everyCut(label: string, setup: (files: Map<string, string>) => Promise<ComparisonDocument>) {
  const probe = memFs();
  const base = await setup(probe.files);
  const st0 = fresh(probe.fs);
  const before = probe.log.length;
  const r0 = await st0.save(updatePair(base, { rel: 7 }));
  assert.ok(r0.ok, `${label}: 끊김 없는 저장`);
  const steps = probe.log.length - before;
  for (let k = 1; k <= steps; k++) {
    let count = 0;
    let armed = false;
    const m = memFs({ fail: () => armed && ++count === k });
    const old = await setup(m.files);
    const st = fresh(m.fs);
    armed = true;
    const want = updatePair(old, { rel: 7 });
    await st.save(want);
    armed = false;
    const after = await st.load(old.id);
    assert.ok(after.ok, `${label}: ${k}번째 단계에서 끊긴 뒤 정상 판 없음 (${m.log.at(-1)?.op} ${m.log.at(-1)?.name})`);
    const got = strip(after.doc);
    const isOld = JSON.stringify(got) === JSON.stringify(strip(old));
    const isNew = JSON.stringify({ ...got, revision: 0 }) === JSON.stringify({ ...strip(want), revision: 0 }) && got.revision === old.revision + 1;
    assert.ok(isOld || isNew, `${label}: ${k}번째 끊김 뒤 내용이 옛 판도 새 판도 아님`);
  }
}

await check('F04 검토 재현 — 깨진 본판 + 정상 앞판, 새 판 설치 실패', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  const first = await st.save(mk('rec'));
  assert.ok(first.ok);
  m.files.set('rec.prev', JSON.stringify(first.doc));
  m.files.set('rec.json', '{broken');
  const recovered = await st.load('rec');
  assert.ok(recovered.ok && recovered.recovered);
  let failInstall = true;
  const m2 = { ...m.fs, move: async (a: string, b: string) => {
    if (failInstall && a.endsWith('.tmp')) {
      failInstall = false;
      throw new Error('install');
    }
    return m.fs.move(a, b);
  } };
  const st2 = fresh(m2);
  await st2.save(recovered.doc);
  const after = await st2.load('rec');
  ok(after.ok, '정상 판이 남아야 함');
  if (after.ok) eq(strip(after.doc), strip(first.doc));
});

await check('F04 모든 끊김 지점 — 정상 본판', () =>
  everyCut('정상 본판', async (files) => {
    const d = { ...mk('g1'), revision: 3 };
    files.set('g1.json', JSON.stringify(d));
    return d;
  })
);
await check('F04 모든 끊김 지점 — 깨진 본판 + 정상 앞판', () =>
  everyCut('깨진 본판', async (files) => {
    const d = { ...mk('g2'), revision: 4 };
    files.set('g2.prev', JSON.stringify(d));
    files.set('g2.json', '{"half');
    return d;
  })
);
await check('F04 모든 끊김 지점 — 본판 없음 + 정상 앞판', () =>
  everyCut('본판 없음', async (files) => {
    const d = { ...mk('g3'), revision: 2 };
    files.set('g3.prev', JSON.stringify(d));
    return d;
  })
);
await check('F04 모든 끊김 지점 — 정상 본판 + 옛 앞판 + 남은 tmp', () =>
  everyCut('세 파일', async (files) => {
    const d = { ...mk('g4'), revision: 5 };
    files.set('g4.json', JSON.stringify(d));
    files.set('g4.prev', JSON.stringify({ ...d, revision: 4 }));
    files.set('g4.tmp', '{"half');
    return d;
  })
);

/* =========================================================== F06 — 미래 판 · 다른 계정 · 깨짐 · 못 읽음 위에 안 씀 */

await check('F06 미래 판 위에 저장 거절 · 글자 그대로', async () => {
  const m = memFs();
  const d = mk('nw');
  const bytes = JSON.stringify({ ...d, schemaVersion: 2, revision: 7 });
  m.files.set('nw.json', bytes);
  const st = fresh(m.fs);
  eq(await st.load('nw'), { ok: false, reason: 'newer' });
  const r = await st.save(d);
  eq(r.ok ? 'ok' : r.reason, 'newer');
  eq(m.files.get('nw.json'), bytes);
});
await check('F06 다른 계정 문서 위에 저장 거절', async () => {
  const m = memFs();
  const bytes = JSON.stringify({ ...mk('ow'), ownerId: 'u2' });
  m.files.set('ow.json', bytes);
  const r = await fresh(m.fs).save(mk('ow'));
  eq(r.ok ? 'ok' : r.reason, 'owner');
  eq(m.files.get('ow.json'), bytes);
});
await check('F06 깨진 문서(앞판 없음) 위에 저장 거절', async () => {
  const m = memFs();
  m.files.set('cr.json', '{"half');
  const r = await fresh(m.fs).save(mk('cr'));
  eq(r.ok ? 'ok' : r.reason, 'corrupt');
  eq(m.files.get('cr.json'), '{"half');
});
await check('F06 못 읽는 파일은 없는 것이 아님', async () => {
  const m = memFs({ fail: (o) => o.op === 'read' && o.name.startsWith('io.') });
  m.files.set('io.json', JSON.stringify({ ...mk('io'), revision: 3 }));
  const st = fresh(m.fs);
  eq(await st.load('io'), { ok: false, reason: 'io' });
  const r = await st.save(mk('io'));
  eq(r.ok ? 'ok' : r.reason, 'io');
  eq(JSON.parse(m.files.get('io.json')!).revision, 3);
});
await check('F06 정상 새 문서 · 판 올리기는 그대로', async () => {
  const m = memFs();
  const st = fresh(m.fs);
  const a = await st.save(mk('nn'));
  assert.ok(a.ok && a.doc.revision === 1);
  const b = await st.save(updatePair(a.doc, { rel: 2 }));
  ok(b.ok && b.doc.revision === 2 && activePair(b.doc)?.rel === 2);
});
await check('F06 자동 저장 — 미래 판이면 멈추고 알림(끝없이 다시 안 씀)', async () => {
  const m = memFs();
  m.files.set('au.json', JSON.stringify({ ...mk('au'), schemaVersion: 2 }));
  const st = fresh(m.fs);
  const jobs: (() => void)[] = [];
  const timer: Timer = { set: (fn) => (jobs.push(fn), jobs.length), clear: () => undefined };
  let calls = 0;
  let blocked: string | null = null;
  const auto = createAutosaver(
    (d) => {
      calls++;
      return st.save(d);
    },
    { timer, onState: () => undefined, onSaved: () => undefined, onBlocked: (r) => (blocked = r) }
  );
  auto.schedule(mk('au'));
  await auto.flush();
  auto.schedule(mk('au'));
  await auto.flush();
  eq([calls, blocked], [1, 'newer']);
});

/* =========================================================== 디스크 손잡이(진짜 파일) */
await check('디스크 — 병렬 저장 · 깨진 본판 복구 · 지우기 참조 검사', async () => {
  const d = diskFs();
  try {
    const st = fresh(d.fs);
    await Promise.all([st.save(mk('ka', false)), st.save(mk('kb', true))]);
    eq((await st.recent()).map((e) => e.id).sort(), ['ka', 'kb']);
    const kb = await st.load('kb');
    assert.ok(kb.ok);
    writeFileSync(join(d.dir, 'kb.prev'), readFileSync(join(d.dir, 'kb.json'), 'utf8'));
    writeFileSync(join(d.dir, 'kb.json'), '{"half');
    const rec = await st.load('kb');
    assert.ok(rec.ok && rec.recovered);
    const s = await st.save(updatePair(rec.doc, { rel: 4 }));
    ok(s.ok, '복구한 판에서 이어 저장');
    ok(!existsSync(join(d.dir, 'kb.prev')) && !existsSync(join(d.dir, 'kb.tmp')), '남은 파일 정리');
    const deleted: string[] = [];
    await st.remove('kb', { deleteAssets: async (p) => void deleted.push(...p) });
    eq(deleted, [], 'ka 가 쓰는 영상');
    ok(parseDocument(JSON.parse(readFileSync(join(d.dir, 'ka.json'), 'utf8')), OWNER).ok);
  } finally {
    d.done();
  }
});

/* 다음 묶음(F02 · F03 · F05 · F07 · F08)은 아래에 이어 붙는다 */
await import('./native-compare-regress-ui.mts').then((m: { run: (c: typeof check) => Promise<void> }) => m.run(check)).catch((e: unknown) => {
  if ((e as { code?: string }).code === 'ERR_MODULE_NOT_FOUND' && String((e as Error).message).includes('native-compare-regress-ui')) return;
  throw e;
});

console.log(`native-compare-regress: ${passed} 통과 · ${fails.length} 실패`);
if (fails.length) {
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
