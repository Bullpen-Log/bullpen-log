/**
 * 비교 문서 저장(R19 — 순수: 파일 손잡이를 주입받는다. 앱은 compare/fs.ts 의 expo-file-system 손잡이, 시험은 메모리 손잡이).
 *
 * 계정마다 폴더 하나(`compare/<ownerId>/`). 문서 하나 = `<id>.json`. 쓰기는 한 번에(원자적):
 *   1) `<id>.tmp` 에 새 판을 쓰고  2) 지금 판을 `<id>.prev` 로 옮기고  3) tmp 를 `<id>.json` 으로 옮기고  4) prev 를 지운다.
 * 어느 단계에서 끊겨도 읽기가 json → prev 차례로 살아 있는 판을 찾는다(남은 tmp 는 버린다 — 덜 쓴 판일 수 있다).
 * 판(revision)이 저장된 것과 다르면 덮지 않고 'conflict' — 다른 화면 · 기기에서 고친 것을 잃지 않게(그때 화면이 새 판을 다시 읽는다).
 * 최근 목록은 `index.json` 하나(문서 전체를 읽지 않는다). 깨지면 문서들에서 다시 만든다.
 */
import { parseDocument, recentOf, referencedPaths, type ComparisonDocument, type RecentEntry } from '~/compare/doc';

export type FsAdapter = {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  /** 덮어쓰며 옮기기 */
  move(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<string[]>;
};

export type SaveResult = { ok: true; doc: ComparisonDocument } | { ok: false; reason: 'conflict' | 'io' | 'owner'; current?: ComparisonDocument };
export type LoadResult = { ok: true; doc: ComparisonDocument; recovered: boolean } | { ok: false; reason: 'missing' | 'corrupt' | 'owner' | 'newer' };

const INDEX = 'index.json';
export const RECENT_LIMIT = 30;

const jsonName = (id: string) => `${id}.json`;
const prevName = (id: string) => `${id}.prev`;
const tmpName = (id: string) => `${id}.tmp`;
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;

async function readParsed(fs: FsAdapter, name: string, ownerId: string) {
  const text = await fs.read(name).catch(() => null);
  if (text == null) return null;
  try {
    return parseDocument(JSON.parse(text), ownerId);
  } catch {
    return { ok: false as const, reason: 'corrupt' as const };
  }
}

export function createStorage(fs: FsAdapter, ownerId: string) {
  /* 같은 문서의 저장은 차례로(겹친 쓰기가 서로의 tmp 를 옮기지 않게) */
  const chains = new Map<string, Promise<unknown>>();
  const serial = <T>(id: string, job: () => Promise<T>): Promise<T> => {
    const prev = chains.get(id) ?? Promise.resolve();
    const next = prev.then(job, job);
    chains.set(
      id,
      next.catch(() => undefined)
    );
    return next;
  };

  async function load(id: string): Promise<LoadResult> {
    if (!ID_OK.test(id)) return { ok: false, reason: 'missing' };
    const main = await readParsed(fs, jsonName(id), ownerId);
    if (main?.ok) return { ok: true, doc: main.doc, recovered: false };
    if (main && !main.ok && (main.reason === 'owner' || main.reason === 'newer')) return { ok: false, reason: main.reason };
    const prev = await readParsed(fs, prevName(id), ownerId);
    if (prev?.ok) return { ok: true, doc: prev.doc, recovered: true };
    if (!main && !prev) return { ok: false, reason: 'missing' };
    return { ok: false, reason: 'corrupt' };
  }

  async function writeIndex(entries: RecentEntry[]) {
    const sorted = [...entries].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)).slice(0, 500);
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

  /** 문서들에서 목록을 다시 만든다(목록이 깨졌거나 없을 때) — 남은 tmp 는 지운다 */
  async function rebuildIndex(): Promise<RecentEntry[]> {
    const names = await fs.list().catch(() => [] as string[]);
    const ids = new Set(names.map((n) => n.match(/^([A-Za-z0-9_-]+)\.(json|prev)$/)?.[1]).filter((x): x is string => !!x && x !== 'index'));
    for (const n of names) if (n.endsWith('.tmp')) await fs.remove(n).catch(() => undefined);
    const entries: RecentEntry[] = [];
    for (const id of ids) {
      const r = await load(id);
      if (r.ok) entries.push(recentOf(r.doc));
    }
    await writeIndex(entries).catch(() => undefined);
    return entries;
  }

  async function recent(limit = RECENT_LIMIT): Promise<RecentEntry[]> {
    const idx = (await readIndex()) ?? (await rebuildIndex());
    return idx.slice(0, limit);
  }

  async function updateIndex(fn: (e: RecentEntry[]) => RecentEntry[]) {
    const cur = (await readIndex()) ?? (await rebuildIndex());
    await writeIndex(fn(cur));
  }

  /** 저장 — doc.revision 은 마지막으로 읽거나 쓴 판. 저장되면 revision + 1 의 문서를 돌려준다 */
  function save(doc: ComparisonDocument): Promise<SaveResult> {
    return serial(doc.id, async () => {
      if (doc.ownerId !== ownerId || !ID_OK.test(doc.id)) return { ok: false, reason: 'owner' };
      const cur = await load(doc.id);
      if (cur.ok && cur.doc.revision !== doc.revision) return { ok: false, reason: 'conflict', current: cur.doc };
      if (!cur.ok && cur.reason === 'owner') return { ok: false, reason: 'owner' };
      const next: ComparisonDocument = { ...doc, revision: doc.revision + 1 };
      try {
        await fs.write(tmpName(doc.id), JSON.stringify(next));
        const hadMain = (await fs.read(jsonName(doc.id)).catch(() => null)) != null;
        if (hadMain) await fs.move(jsonName(doc.id), prevName(doc.id));
        await fs.move(tmpName(doc.id), jsonName(doc.id));
        await fs.remove(prevName(doc.id)).catch(() => undefined);
      } catch {
        await fs.remove(tmpName(doc.id)).catch(() => undefined);
        return { ok: false, reason: 'io' };
      }
      await updateIndex((e) => [recentOf(next), ...e.filter((x) => x.id !== next.id)]).catch(() => undefined);
      return { ok: true, doc: next };
    });
  }

  /**
   * 지우기 — 문서 · 판 셋을 지우고, 이 문서만 쓰던 앱 안 복사본 경로를 돌려준다(화면이 LocalVideo 로 지운다).
   * 다른 문서가 같은 경로를 쓰면 남긴다. 사진 앱 원본 · 기록 영상은 처음부터 owned 가 아니라 건드리지 않는다.
   */
  function remove(id: string): Promise<{ ok: boolean; orphanPaths: string[] }> {
    return serial(id, async () => {
      const r = await load(id);
      const owned = r.ok ? r.doc.sources.filter((s) => s.owned).map((s) => s.path) : [];
      for (const n of [jsonName(id), prevName(id), tmpName(id)]) await fs.remove(n).catch(() => undefined);
      await updateIndex((e) => e.filter((x) => x.id !== id)).catch(() => undefined);
      if (!owned.length) return { ok: true, orphanPaths: [] };
      const others: ComparisonDocument[] = [];
      for (const e of (await readIndex()) ?? []) {
        const o = await load(e.id);
        if (o.ok) others.push(o.doc);
      }
      const still = referencedPaths(others);
      return { ok: true, orphanPaths: [...new Set(owned.filter((p) => !still.has(p)))] };
    });
  }

  return { load, save, recent, remove, rebuildIndex };
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
 */
export function createAutosaver(save: (d: ComparisonDocument) => Promise<SaveResult>, opts: { delayMs?: number; timer?: Timer; onState: (s: SaveState) => void; onSaved: (d: ComparisonDocument) => void; onConflict?: (current: ComparisonDocument) => void }) {
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
        } else {
          /* 못 쓴 판은 다시 줄에 — 다음 고침이나 flush 가 다시 쓴다(고친 것을 버리지 않는다). 이번 차례는 여기서 쉰다 */
          if (!pending) pending = doc;
          failed = true;
          opts.onState('failed');
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
