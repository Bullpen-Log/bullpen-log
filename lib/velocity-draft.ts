'use client';

/**
 * 저장하지 않은 구속 측정 세션을 폰에 맡겨 두는 곳 — 앱이 꺼져도(전화 · 메모리 부족 · 잠금 뒤 정리) 잰 공과 영상이 남게.
 *
 * 예전에는 공과 영상이 '세션 저장하기'를 누를 때까지 메모리에만 있어, 그 전에 앱이 꺼지면 세션이 통째로 사라졌다. 불펜은 신호가
 * 약해 마지막 저장이 실패하기도 했다(2026-10-08 검토). 이제 공 목록은 바뀔 때마다, 영상은 도착할 때마다 IndexedDB 에 담는다
 * (영상이 커서 localStorage 는 못 쓴다). 측정 화면을 다시 열면 이어서 담고, 저장하거나 '저장하지 않고 나가기'를 하면 지운다.
 * 저장한 뒤 영상 올리기에 실패한 것은 따로 맡겨 두었다가 다음에 열 때 다시 올린다.
 *
 * 폰에만 있다(다른 기기 · 다른 사람에게 안 간다). 저장소를 못 쓰는 때(사생활 보호 창 · 꽉 참)는 조용히 예전처럼 메모리만 쓴다.
 */

const DB_NAME = 'bullpen-velocity';
const DB_VERSION = 1;
const DRAFT = 'draft';
const CLIPS = 'clips';
const UPLOADS = 'uploads';

export type StoredClip = { blob: Blob; durationSec: number; eventSec: number };
export type Draft<P, M> = { date: string; meta: M; pitches: P[]; savedAt: number };
export type PendingUpload = {
  pitchId: string;
  blob: Blob;
  sec: number | null;
  eventSec: number | null;
  kind: 'main' | 'wide';
  /** 폰 사진 앱에 둘 클립(회원) — 없으면 서버(옛 대기열 · 보정용) */
  phone?: boolean;
};

let opening: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(DRAFT)) d.createObjectStore(DRAFT);
        if (!d.objectStoreNames.contains(CLIPS)) d.createObjectStore(CLIPS);
        if (!d.objectStoreNames.contains(UPLOADS)) d.createObjectStore(UPLOADS, { autoIncrement: true });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

/** 한 저장소에 한 번 — 실패하면 fallback */
async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => { readonly result: unknown } | void,
  fallback: T
): Promise<T> {
  const d = await db();
  if (!d) return fallback;
  return new Promise<T>((resolve) => {
    try {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? (req.result as T) : fallback);
      tx.onerror = () => resolve(fallback);
      tx.onabort = () => resolve(fallback);
    } catch {
      resolve(fallback);
    }
  });
}

export const saveDraft = <P, M>(d: Draft<P, M>) =>
  run(DRAFT, 'readwrite', (s) => s.put(d, 'current'), undefined);

export const loadDraft = <P, M>() =>
  run<Draft<P, M> | undefined>(DRAFT, 'readonly', (s) => s.get('current'), undefined);

/** 공 하나의 영상을 담고, 담은 것(디스크에 놓인 Blob)을 돌려준다 — 메모리의 큰 Blob 을 이것으로 바꿔 쥐면 메모리가 준다 */
export async function putClip(id: number, clip: StoredClip): Promise<StoredClip | null> {
  await run(CLIPS, 'readwrite', (s) => s.put(clip, id), undefined);
  return run<StoredClip | null>(CLIPS, 'readonly', (s) => s.get(id), null);
}

export async function loadClips(): Promise<Map<number, StoredClip>> {
  const keys = await run<IDBValidKey[]>(CLIPS, 'readonly', (s) => s.getAllKeys(), []);
  const vals = await run<StoredClip[]>(CLIPS, 'readonly', (s) => s.getAll(), []);
  return new Map(keys.map((k, i) => [Number(k), vals[i]]));
}

export const deleteClip = (id: number) => run(CLIPS, 'readwrite', (s) => s.delete(id), undefined);

/** 세션을 저장했거나 버렸다 — 공 목록과 영상을 지운다(올리지 못한 영상 대기열은 그대로) */
export async function clearDraft() {
  await run(DRAFT, 'readwrite', (s) => s.clear(), undefined);
  await run(CLIPS, 'readwrite', (s) => s.clear(), undefined);
}

export const queueUpload = (u: PendingUpload) => run(UPLOADS, 'readwrite', (s) => s.add(u), undefined);

let retrying = false;
/**
 * 올리지 못한 영상을 다시 올린다 — 측정 화면 · 구속 측정 첫 화면을 열 때. 올린 것만 지운다. 몇 개 남았나를 돌려준다.
 * ponytail: 한 번에 차례로(동시 여러 개면 약한 신호에서 모두 실패한다)
 */
export async function retryUploads(upload: (u: PendingUpload) => Promise<boolean>): Promise<number> {
  if (retrying) return -1;
  retrying = true;
  try {
    const keys = await run<IDBValidKey[]>(UPLOADS, 'readonly', (s) => s.getAllKeys(), []);
    let left = keys.length;
    for (const key of keys) {
      const u = await run<PendingUpload | undefined>(UPLOADS, 'readonly', (s) => s.get(key), undefined);
      if (!u) continue;
      if (await upload(u).catch(() => false)) {
        await run(UPLOADS, 'readwrite', (s) => s.delete(key), undefined);
        left--;
      }
    }
    return left;
  } finally {
    retrying = false;
  }
}
