'use client';

/**
 * 다 만든 촬영 영상을 올리기 전에 폰에 맡겨 두는 곳 — 신호가 끊기거나(야외 · 데이터) 앱이 꺼져도 다시 찍지 않게.
 *
 * 촬영 모드에서 [올리기]를 누르면: 소리 뺀 영상(+ 첫 장면 이미지)을 여기에 담고 → 저장소에 올리고 → 운동에 붙인 뒤 지운다.
 * 가운데서 실패하면 남는다. 촬영 모드 위쪽에 '올리지 못한 영상 N개 · 다시 올리기'가 뜬다. 운동 하나에 하나(새로 찍으면 바꾼다).
 *
 * 폰에만 있다. 저장소를 못 쓰는 때(사생활 보호 창 · 꽉 참)는 조용히 건너뛴다 — 그때는 올리기 실패 = 다시 찍기.
 * 같은 꼴의 구속 측정 쪽은 lib/velocity-draft.ts.
 */

const DB_NAME = 'bullpen-shoot';
const DB_VERSION = 1;
const STORE = 'outbox';

export type PendingClip = {
  exerciseId: string;
  /** '1-24 하프닐링 레터럴 레이즈' — 다시 올리기 목록에 보인다 */
  label: string;
  video: Blob;
  thumb: Blob | null;
  aspectRatio: number;
  /** 담은 때(밀리초) — 같은 운동을 다시 찍으면 바뀐다(어느 촬영본인지 가리는 값) */
  savedAt: number;
  /**
   * 저장소에 이미 올린 경로 — 올린 뒤 붙이기 대답만 못 받았으면 다시 올리지 않고 붙이기만 한다(같은 경로를 다시 붙여도 안전).
   */
  videoPath?: string | null;
  thumbPath?: string | null;
};

let opening: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'exerciseId' });
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest | void,
  fallback: T
): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve) => {
        if (!d) return resolve(fallback);
        try {
          const tx = d.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req ? (req.result as T) : fallback);
          tx.onerror = () => resolve(fallback);
          tx.onabort = () => resolve(fallback);
        } catch {
          resolve(fallback);
        }
      })
  );
}

/** 담기 — 성공하면 true(저장소를 못 쓰면 false, 그래도 올리기는 이어간다) */
export async function keepClip(clip: PendingClip): Promise<boolean> {
  const ok = await run<IDBValidKey | null>('readwrite', (s) => s.put(clip), null);
  return ok !== null;
}

/** 하나 읽기 */
export function getClip(exerciseId: string): Promise<PendingClip | undefined> {
  return run<PendingClip | undefined>('readonly', (s) => s.get(exerciseId), undefined);
}

/**
 * 지우기 — 담긴 것이 그 촬영본(savedAt)일 때만. 옛 것을 올리는 사이 새로 찍어 담은 것을 지우지 않게, 읽고 지우기를 한
 * 거래 안에서 한다.
 */
export function dropClip(exerciseId: string, savedAt: number): Promise<void> {
  return run<undefined>(
    'readwrite',
    (s) => {
      const req = s.get(exerciseId);
      req.onsuccess = () => {
        const cur = req.result as PendingClip | undefined;
        if (cur && cur.savedAt === savedAt) s.delete(exerciseId);
      };
    },
    undefined
  );
}

/** 올린 경로 적기(지우기와 같은 조건) — 경로를 비우려면 null */
export function markUploaded(
  exerciseId: string,
  savedAt: number,
  paths: { videoPath: string | null; thumbPath: string | null }
): Promise<void> {
  return run<undefined>(
    'readwrite',
    (s) => {
      const req = s.get(exerciseId);
      req.onsuccess = () => {
        const cur = req.result as PendingClip | undefined;
        if (cur && cur.savedAt === savedAt) s.put({ ...cur, ...paths });
      };
    },
    undefined
  );
}

/** 맡겨 둔 것 전부 — 오래된 것부터 */
export async function pendingClips(): Promise<PendingClip[]> {
  const all = await run<PendingClip[]>('readonly', (s) => s.getAll(), []);
  return [...all].sort((a, b) => a.savedAt - b.savedAt);
}
