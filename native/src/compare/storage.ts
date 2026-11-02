/**
 * 비교 문서 저장(R19 — 순수: 파일 손잡이를 주입받는다. 앱은 compare/fs.ts 의 expo-file-system 손잡이, 시험은 메모리 · 디스크 손잡이).
 *
 * 계정마다 폴더 하나(`compare/<ownerId>/`). 문서 하나 = `<id>.json`(본판) · `<id>.prev`(앞판) · `<id>.tmp`(쓰는 중).
 *
 * 한 계정의 모든 쓰기(저장 · 지우기 · 목록 다시 만들기 · 복사본 정리)는 **한 줄**로 차례를 지킨다(계정 잠금, `exclusive`).
 * 문서마다 따로 줄을 세우면 공통 `index.json` 을 두 문서가 같이 고쳐 한쪽이 사라졌다(F01). 잠금 안의 일은 잠금 없는 안쪽 함수만
 * 부른다 — 잠금 안에서 다시 잠금을 기다리면 멈춘다.
 *
 * 쓰기 차례(F04 — 어느 단계에서 끊겨도 정상 판 하나는 남게):
 *   1) 새 판을 `<id>.tmp` 에 쓴다.
 *   2) 본판이 **정상일 때만** 본판을 `.prev` 로 옮긴다. 본판이 깨졌거나 없으면 앞판(.prev — 지금 정상 판)을 그대로 둔다.
 *   3) tmp 를 본판으로 옮기고 4) 다시 읽어 확인한 뒤에만 5) 앞판을 지운다.
 * 실제 기기의 move(overwrite)는 '대상 지우기 → 옮기기' 두 단계라 사이에 끊길 수 있다 — 그래서 정상 판 위로는 옮기지 않는다.
 *
 * 읽기 결과는 '없음(missing)'과 '못 읽음(io)'을 가른다. 새로 만들기는 정말 없을 때(missing)만, 그리고 한 번도 저장 안 한 판(revision 0)만
 * 한다 — 미래 판 · 다른 계정 · 깨짐 · 못 읽음 위에는 쓰지 않고, 지운 문서가 늦게 온 저장으로 되살아나지 않는다(F06).
 *
 * 지우기 · 복사본 정리의 '아무도 안 쓰는 영상' 판정은 최근 목록이 아니라 **폴더의 모든 문서 파일**(본판 · 앞판 · 남은 tmp)을 읽어 한다.
 * 하나라도 못 읽으면 지우지 않는다(모르면 남긴다). 실제 파일 지우기는 그 판정과 같은 잠금 안에서 한다(사이에 다른 저장이 끼지 않게).
 */
import { parseDocument, recentOf, referencedPaths, type ComparisonDocument, type RecentEntry } from '~/compare/doc';

export type FsAdapter = {
  /** 없으면 null. 읽다 실패하면 던진다(없음과 다르다) */
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  /** 덮어쓰며 옮기기 — 원자적이라고 기대하지 않는다 */
  move(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<string[]>;
};

export type SaveFail = 'conflict' | 'io' | 'owner' | 'newer' | 'corrupt' | 'deleted';
export type SaveResult = { ok: true; doc: ComparisonDocument } | { ok: false; reason: SaveFail; current?: ComparisonDocument };
export type LoadResult = { ok: true; doc: ComparisonDocument; recovered: boolean } | { ok: false; reason: 'missing' | 'corrupt' | 'owner' | 'newer' | 'io' };
export type RemoveResult = { ok: boolean; deleted: string[]; kept: string[]; reason?: 'io' | 'assets' };

const INDEX = 'index.json';
export const RECENT_LIMIT = 30;
const INDEX_CAP = 500;

const jsonName = (id: string) => `${id}.json`;
const prevName = (id: string) => `${id}.prev`;
const tmpName = (id: string) => `${id}.tmp`;
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;
const DOC_FILE = /^([A-Za-z0-9_-]{1,64})\.(json|prev|tmp)$/;

type Parsed = { kind: 'none' } | { kind: 'io' } | { kind: 'corrupt'; text: string } | { kind: 'newer' | 'owner' } | { kind: 'ok'; doc: ComparisonDocument; text: string };

async function readParsed(fs: FsAdapter, name: string, ownerId: string): Promise<Parsed> {
  let text: string | null;
  try {
    text = await fs.read(name);
  } catch {
    return { kind: 'io' };
  }
  if (text == null) return { kind: 'none' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'corrupt', text };
  }
  const r = parseDocument(raw, ownerId);
  if (r.ok) return { kind: 'ok', doc: r.doc, text };
  return r.reason === 'corrupt' ? { kind: 'corrupt', text } : { kind: r.reason };
}

/* 계정 잠금 — 같은 계정의 저장소를 두 번 만들어도(다시 로그인) 한 줄을 쓴다 */
const accountChains = new Map<string, Promise<unknown>>();
function exclusiveFor<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prev = accountChains.get(key) ?? Promise.resolve();
  const next = prev.then(job, job);
  const tail = next.catch(() => undefined);
  accountChains.set(key, tail);
  void tail.then(() => {
    if (accountChains.get(key) === tail) accountChains.delete(key);
  });
  return next;
}

export function createStorage(fs: FsAdapter, ownerId: string, opts: { lockKey?: string } = {}) {
  const lockKey = opts.lockKey ?? `owner:${ownerId}`;
  const exclusive = <T>(job: () => Promise<T>) => exclusiveFor(lockKey, job);

  /* ---- 잠금 없는 안쪽 함수(잠금 안에서만 부른다) ---- */

  async function loadInner(id: string): Promise<LoadResult & { mainValid?: boolean }> {
    if (!ID_OK.test(id)) return { ok: false, reason: 'missing' };
    const main = await readParsed(fs, jsonName(id), ownerId);
    if (main.kind === 'ok') return { ok: true, doc: main.doc, recovered: false, mainValid: true };
    if (main.kind === 'owner' || main.kind === 'newer') return { ok: false, reason: main.kind };
    const prev = await readParsed(fs, prevName(id), ownerId);
    if (prev.kind === 'ok') return { ok: true, doc: prev.doc, recovered: true, mainValid: false };
    if (prev.kind === 'owner' || prev.kind === 'newer') return { ok: false, reason: prev.kind };
    if (main.kind === 'io' || prev.kind === 'io') return { ok: false, reason: 'io' };
    if (main.kind === 'none' && prev.kind === 'none') return { ok: false, reason: 'missing' };
    return { ok: false, reason: 'corrupt' };
  }

  async function writeIndex(entries: RecentEntry[]) {
    const sorted = [...entries].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)).slice(0, INDEX_CAP);
    await fs.write(INDEX, JSON.stringify({ v: 1, owner: ownerId, entries: sorted }));
  }

  async function readIndex(): Promise<RecentEntry[] | null> {
    const text = await fs.read(INDEX).catch(() => null);
    if (!text) return null;
    try {
      const j = JSON.parse(text) as { v?: number; owner?: string; entries?: RecentEntry[] };
      if (j.v !== 1 || j.owner !== ownerId || !Array.isArray(j.entries)) return null;
      return j.entries.filter((e) => e && typeof e.id === 'string' && ID_OK.test(e.id) && typeof e.updatedAt === 'string');
    } catch {
      return null;
    }
  }

  /** 폴더에 있는 문서 번호 — 목록을 못 읽으면 null(모름) */
  async function docIds(): Promise<{ ids: Set<string>; names: string[] } | null> {
    let names: string[];
    try {
      names = await fs.list();
    } catch {
      return null;
    }
    const ids = new Set<string>();
    for (const n of names) {
      const m = n.match(DOC_FILE);
      if (m && m[1] !== 'index' && m[2] !== 'tmp') ids.add(m[1]);
    }
    return { ids, names };
  }

  async function rebuildInner(): Promise<RecentEntry[]> {
    const listed = await docIds();
    if (!listed) return (await readIndex()) ?? [];
    const entries: RecentEntry[] = [];
    const alive = new Set<string>();
    for (const id of listed.ids) {
      const r = await loadInner(id);
      if (r.ok) {
        entries.push(recentOf(r.doc));
        alive.add(id);
      }
    }
    /* 남은 tmp 는 정상 판이 있는 문서의 것만 지운다(끊긴 저장의 찌꺼기). 정상 판이 없는 tmp 는 무엇을 참조했는지의 유일한 흔적이라 둔다 */
    for (const n of listed.names) {
      const m = n.match(DOC_FILE);
      if (m && m[2] === 'tmp' && alive.has(m[1])) await fs.remove(n).catch(() => undefined);
    }
    await writeIndex(entries).catch(() => undefined);
    return entries;
  }

  /** 목록이 깨졌거나 · 폴더의 문서와 어긋나면(옛 판의 엇갈린 쓰기 · 끊김) 문서들에서 다시 만든다 */
  async function freshIndex(): Promise<RecentEntry[]> {
    const idx = await readIndex();
    if (!idx) return rebuildInner();
    const listed = await docIds();
    if (!listed) return idx;
    const inIndex = new Set(idx.map((e) => e.id));
    const capped = idx.length >= INDEX_CAP;
    const missing = [...listed.ids].some((id) => !inIndex.has(id));
    const stale = idx.some((e) => !listed.ids.has(e.id));
    if (stale || (missing && !capped)) return rebuildInner();
    return idx;
  }

  /**
   * 이 경로들 가운데 폴더의 어느 문서(본판 · 앞판 · 남은 tmp)도 쓰지 않는 것만 돌려준다. except = 지금 지우는 문서.
   * 못 읽는 파일이 있거나 목록을 못 읽으면 아무것도 안 돌려준다(모르면 남긴다). 깨진 파일은 글자 안에 경로가 있으면 쓰는 것으로 본다.
   */
  async function unreferenced(paths: string[], except?: string): Promise<string[] | null> {
    const want = [...new Set(paths)];
    if (!want.length) return [];
    const listed = await docIds();
    if (!listed) return null;
    const used = new Set<string>();
    for (const n of listed.names) {
      const m = n.match(DOC_FILE);
      if (!m || m[1] === 'index' || m[1] === except) continue;
      const p = await readParsed(fs, n, ownerId);
      if (p.kind === 'io' || p.kind === 'newer') return null;
      if (p.kind === 'ok') {
        for (const x of referencedPaths([p.doc])) used.add(x);
        continue;
      }
      if (p.kind !== 'corrupt') continue;
      for (const path of want) {
        const tail = path.split('/').pop() ?? path;
        if (p.text.includes(path) || p.text.includes(tail)) used.add(path);
      }
    }
    return want.filter((p) => !used.has(p));
  }

  /* ---- 바깥 함수 ---- */

  /** 읽기 — 잠금 없이(읽기만 하고, 쓰기 차례상 언제 읽어도 정상 판 하나는 보인다) */
  async function load(id: string): Promise<LoadResult> {
    const r = await loadInner(id);
    if (!r.ok) return r;
    return { ok: true, doc: r.doc, recovered: r.recovered };
  }

  function recent(limit = RECENT_LIMIT): Promise<RecentEntry[]> {
    return exclusive(async () => (await freshIndex()).slice(0, limit));
  }

  function rebuildIndex(): Promise<RecentEntry[]> {
    return exclusive(rebuildInner);
  }

  /** 저장 — doc.revision 은 마지막으로 읽거나 쓴 판. 저장되면 revision + 1 의 문서를 돌려준다 */
  function save(doc: ComparisonDocument): Promise<SaveResult> {
    return exclusive(async (): Promise<SaveResult> => {
      if (doc.ownerId !== ownerId || !ID_OK.test(doc.id)) return { ok: false, reason: 'owner' };
      const cur = await loadInner(doc.id);
      if (cur.ok) {
        if (cur.doc.revision !== doc.revision) return { ok: false, reason: 'conflict', current: cur.doc };
      } else if (cur.reason === 'missing') {
        /* 한 번이라도 저장한 판인데 파일이 없으면 지워진 것 — 늦게 온 저장으로 되살리지 않는다 */
        if (doc.revision > 0) return { ok: false, reason: 'deleted' };
      } else {
        return { ok: false, reason: cur.reason };
      }
      const next: ComparisonDocument = { ...doc, revision: doc.revision + 1 };
      const keepPrev = !cur.ok || cur.mainValid !== true; /* 정상 앞판(또는 아무 판도 없음) — 앞판을 건드리지 않는다 */
      try {
        await fs.write(tmpName(doc.id), JSON.stringify(next));
        if (!keepPrev) await fs.move(jsonName(doc.id), prevName(doc.id));
        await fs.move(tmpName(doc.id), jsonName(doc.id));
        const check = await readParsed(fs, jsonName(doc.id), ownerId);
        if (check.kind !== 'ok' || check.doc.revision !== next.revision || check.doc.id !== next.id) throw new Error('verify');
      } catch {
        await fs.remove(tmpName(doc.id)).catch(() => undefined);
        return { ok: false, reason: 'io' };
      }
      await fs.remove(prevName(doc.id)).catch(() => undefined);
      try {
        const idx = await freshIndex();
        await writeIndex([recentOf(next), ...idx.filter((x) => x.id !== next.id)]);
      } catch {
        /* 목록은 편의일 뿐 — 다음 읽기가 폴더와 견줘 다시 만든다 */
      }
      return { ok: true, doc: next };
    });
  }

  /**
   * 지우기 — 문서 파일 셋을 지우고, 이 문서가 가진 앱 안 복사본(owned) 가운데 **다른 어떤 문서도 쓰지 않는 것**만
   * deleteAssets 로 지운다(같은 잠금 안에서). keep 은 열린 화면 · 가져오는 중인 영상처럼 아직 파일에 안 적힌 참조.
   * 사진 앱 원본 · 기록 영상은 owned 가 아니라 건드리지 않는다. 문서 파일을 못 지우면 ok:false(영상도 안 지움).
   */
  function remove(id: string, opt: { deleteAssets?: (paths: string[]) => Promise<void>; keep?: () => ReadonlySet<string> } = {}): Promise<RemoveResult> {
    return exclusive(async (): Promise<RemoveResult> => {
      if (!ID_OK.test(id)) return { ok: false, deleted: [], kept: [], reason: 'io' };
      const r = await loadInner(id);
      if (!r.ok && r.reason === 'owner') return { ok: false, deleted: [], kept: [], reason: 'io' };
      const owned = r.ok ? [...new Set(r.doc.sources.filter((s) => s.owned).map((s) => s.path))] : [];
      for (const n of [jsonName(id), prevName(id), tmpName(id)]) {
        try {
          await fs.remove(n);
          if ((await fs.read(n)) != null) throw new Error('still');
        } catch {
          return { ok: false, deleted: [], kept: owned, reason: 'io' };
        }
      }
      try {
        const idx = await freshIndex();
        await writeIndex(idx.filter((x) => x.id !== id));
      } catch {
        /* 목록은 다음 읽기가 다시 맞춘다 */
      }
      return { ok: true, ...(await dropAssets(owned, id, opt)) };
    });
  }

  async function dropAssets(paths: string[], except: string | undefined, opt: { deleteAssets?: (paths: string[]) => Promise<void>; keep?: () => ReadonlySet<string> }) {
    const free = await unreferenced(paths, except);
    if (!free) return { deleted: [], kept: paths, reason: 'assets' as const };
    const hold = opt.keep?.() ?? new Set<string>();
    const go = free.filter((p) => !hold.has(p));
    const kept = paths.filter((p) => !go.includes(p));
    if (!go.length || !opt.deleteAssets) return { deleted: opt.deleteAssets ? [] : go, kept };
    try {
      await opt.deleteAssets(go);
      return { deleted: go, kept };
    } catch {
      return { deleted: [], kept: paths, reason: 'assets' as const };
    }
  }

  /**
   * 가져왔다가 쓰지 않은 앱 안 복사본 정리(비교에 안 넣고 취소 · 화면을 나감) — 어느 문서도 안 쓰고 keep 에도 없는 것만 지운다.
   */
  function releaseAssets(paths: string[], opt: { deleteAssets: (paths: string[]) => Promise<void>; keep?: () => ReadonlySet<string> }) {
    return exclusive(() => dropAssets(paths, undefined, opt));
  }

  return { load, save, recent, remove, releaseAssets, rebuildIndex };
}
export type CompareStorage = ReturnType<typeof createStorage>;

/* ---- 자동 저장(미루기 · 상태 알림) ---- */

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'conflict';
export const SAVE_LABEL: Record<SaveState, string> = { idle: '', saving: '저장 중', saved: '기기에 저장됨', failed: '저장 실패', conflict: '다른 곳에서 바뀜' };

export type Timer = { set(fn: () => void, ms: number): unknown; clear(h: unknown): void };
export const realTimer: Timer = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/**
 * 고칠 때마다 schedule(doc) — 미뤄 두었다가 한 번 쓴다. flush() 는 바로(화면을 떠날 때 · 앱이 뒤로 갈 때).
 * 저장된 판(revision)은 onSaved 로 돌려준다 — 화면은 그 revision 을 다음 고침에 이어 써야 'conflict' 가 안 난다.
 * 미래 판 · 다른 계정 · 깨짐 · 지워짐은 다시 써 봐야 소용없어 막는다(blocked) — onBlocked 로 알린다.
 */
export function createAutosaver(
  save: (d: ComparisonDocument) => Promise<SaveResult>,
  opts: { delayMs?: number; timer?: Timer; onState: (s: SaveState) => void; onSaved: (d: ComparisonDocument) => void; onConflict?: (current: ComparisonDocument) => void; onBlocked?: (reason: SaveFail) => void }
) {
  const timer = opts.timer ?? realTimer;
  const delay = opts.delayMs ?? 600;
  let pending: ComparisonDocument | null = null;
  let handle: unknown = null;
  let running: Promise<void> | null = null;
  let lastRevision: number | null = null;
  let stopped = false;
  /* 충돌 뒤에는 화면이 정할 때까지(base) 쓰지 않는다 — 다른 곳 판을 이 판으로 덮지 않게 */
  let blocked = false;

  const run = async () => {
    handle = null;
    if (running) return;
    let failed = false;
    while (pending && !stopped && !blocked && !failed) {
      const doc = lastRevision != null ? { ...pending, revision: lastRevision } : pending;
      pending = null;
      opts.onState('saving');
      running = save(doc).then((r) => {
        if (stopped) return;
        if (r.ok) {
          lastRevision = r.doc.revision;
          opts.onSaved(r.doc);
          if (!pending) opts.onState('saved');
        } else if (r.reason === 'conflict' && r.current) {
          blocked = true;
          pending = null;
          opts.onState('conflict');
          opts.onConflict?.(r.current);
        } else if (r.reason === 'io') {
          /* 못 쓴 판은 다시 줄에 — 다음 고침이나 flush 가 다시 쓴다(고친 것을 버리지 않는다). 이번 차례는 여기서 쉰다 */
          if (!pending) pending = doc;
          failed = true;
          opts.onState('failed');
        } else {
          blocked = true;
          if (!pending) pending = doc;
          opts.onState('failed');
          opts.onBlocked?.(r.reason);
        }
      });
      await running;
      running = null;
    }
  };

  return {
    schedule(doc: ComparisonDocument) {
      if (stopped) return;
      pending = doc;
      if (handle != null) timer.clear(handle);
      handle = timer.set(() => void run(), delay);
    },
    async flush() {
      if (handle != null) {
        timer.clear(handle);
        handle = null;
      }
      if (running) await running;
      await run();
    },
    /** 판 번호를 정한다(처음 읽었을 때 · 다른 곳 판을 받아들였을 때) */
    base(revision: number) {
      lastRevision = revision;
      blocked = false;
    },
    stop() {
      stopped = true;
      if (handle != null) timer.clear(handle);
      handle = null;
      pending = null;
    },
    get dirty() {
      return pending != null || handle != null || running != null;
    },
  };
}
