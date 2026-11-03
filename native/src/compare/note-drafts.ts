/**
 * 메모 초안(SS04) — 쓰다 닫은 메모를 그 계정 폴더(compare/<계정>/note-drafts.draft)에 남겨, 앱을 다시 켜도 이어 쓴다.
 * 서버 · DB 에는 보내지 않는다. 다른 계정은 폴더가 달라 못 보고, 파일 안의 주인(owner)이 다르면 읽지 않는다.
 * 지우는 때는 셋뿐: 저장함 · '버리기'를 누름 · 그 비교를 지움(문서 id 로). 닫기 · 뒤로 · 앱 끝은 남긴다.
 * 파일 이름은 비교 문서 파일(<id>.json · .prev · .tmp)과 겹치지 않는 확장자라 저장소의 목록 · 정리가 건드리지 않는다.
 */
import { MAX_NOTE } from '~/compare/doc';
import type { FsAdapter } from '~/compare/storage';

export const DRAFT_FILE = 'note-drafts.draft';
export const DRAFT_LIMIT = 40;
export type NoteDraft = { key: string; docId: string; sourceId: string | null; t: number | null; noteId: string | null; text: string; caret: number; at: string };

/** 초안 열쇠 — 고치는 메모면 메모 id, 새 메모면 영상 · 시각(0.01초) */
export const draftKey = (docId: string, o: { noteId?: string | null; sourceId: string | null; t: number | null }) =>
  o.noteId ? `${docId}|e:${o.noteId}` : `${docId}|n:${o.sourceId ?? '-'}:${o.t == null ? '-' : Math.round(o.t * 100)}`;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** 파일 글 → 초안 목록(깨졌거나 다른 계정이면 빈 목록) */
export function parseDrafts(text: string | null, ownerId: string): NoteDraft[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const r = raw as { v?: unknown; owner?: unknown; items?: unknown };
  if (r?.v !== 1 || r.owner !== ownerId || !Array.isArray(r.items)) return [];
  const out: NoteDraft[] = [];
  for (const x of r.items as Record<string, unknown>[]) {
    if (!x || typeof x.key !== 'string' || typeof x.docId !== 'string' || !ID.test(x.docId) || typeof x.text !== 'string') continue;
    const text = x.text.slice(0, MAX_NOTE);
    if (!text) continue;
    out.push({
      key: x.key.slice(0, 200),
      docId: x.docId,
      sourceId: typeof x.sourceId === 'string' && ID.test(x.sourceId) ? x.sourceId : null,
      t: typeof x.t === 'number' && Number.isFinite(x.t) && x.t >= 0 ? x.t : null,
      noteId: typeof x.noteId === 'string' && ID.test(x.noteId) ? x.noteId : null,
      text,
      caret: typeof x.caret === 'number' && Number.isFinite(x.caret) ? Math.min(text.length, Math.max(0, Math.floor(x.caret))) : text.length,
      at: typeof x.at === 'string' ? x.at.slice(0, 40) : '',
    });
  }
  return out.slice(0, DRAFT_LIMIT);
}
export const serializeDrafts = (ownerId: string, items: readonly NoteDraft[]) => JSON.stringify({ v: 1, owner: ownerId, items: [...items].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, DRAFT_LIMIT) });

/** 한 계정의 초안 저장소 — 메모리에 들고 바뀌면 조금 뒤(250ms) 파일에 쓴다. 쓰기는 한 줄로(겹치지 않게) */
export function createDraftStore(fs: FsAdapter, ownerId: string, opts: { delayMs?: number; setTimer?: (f: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void } = {}) {
  const map = new Map<string, NoteDraft>();
  let loaded: Promise<void> | null = null;
  let timer: unknown = null;
  let chain: Promise<unknown> = Promise.resolve();
  const setT = opts.setTimer ?? ((f, ms) => setTimeout(f, ms));
  const clearT = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  const write = () => {
    const text = serializeDrafts(ownerId, [...map.values()]);
    chain = chain.then(() => fs.write(DRAFT_FILE, text)).catch(() => undefined);
    return chain;
  };
  const schedule = () => {
    if (timer != null) clearT(timer);
    timer = setT(() => {
      timer = null;
      void write();
    }, opts.delayMs ?? 250);
  };
  return {
    ownerId,
    load(): Promise<void> {
      loaded ??= fs
        .read(DRAFT_FILE)
        .then((t) => {
          for (const d of parseDrafts(t, ownerId)) if (!map.has(d.key)) map.set(d.key, d);
          emit();
        })
        .catch(() => undefined);
      return loaded;
    },
    get: (key: string) => map.get(key) ?? null,
    list: (docId: string) => [...map.values()].filter((d) => d.docId === docId).sort((a, b) => (a.at < b.at ? 1 : -1)),
    set(d: NoteDraft) {
      const text = d.text.slice(0, MAX_NOTE);
      if (!text.trim()) map.delete(d.key);
      else map.set(d.key, { ...d, text, caret: Math.min(text.length, Math.max(0, d.caret)) });
      schedule();
      emit();
    },
    remove(key: string) {
      if (map.delete(key)) {
        schedule();
        emit();
      }
    },
    removeDoc(docId: string) {
      let n = 0;
      for (const [k, d] of map) if (d.docId === docId && map.delete(k)) n++;
      if (n) {
        schedule();
        emit();
      }
    },
    /** 미뤄 둔 쓰기를 바로(앱이 뒤로 갈 때) */
    flush(): Promise<unknown> {
      if (timer != null) {
        clearT(timer);
        timer = null;
        return write();
      }
      return chain;
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}
export type DraftStore = ReturnType<typeof createDraftStore>;
