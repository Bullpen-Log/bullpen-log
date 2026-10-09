/**
 * 밝기 일꾼 모음(luma.worker.ts) — 화면 스레드는 장면을 풀어 넘기기만 하고, 일꾼 여럿이 밝기를 나눠 만든다. 처음 쓸 때(또는
 * warmLumaPool) 깨워 두고 세션 동안 그대로 둔다. 일꾼을 못 만들거나 장면을 못 넘기면 null — 부르는 쪽이 화면 스레드에서 만든다.
 */
type Slot = { w: Worker; busy: number };
type Pending = { slot: Slot; resolve: (r: { luma: Float32Array | null; ms: number }) => void };

let pool: Slot[] | null = null;
let broken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

/** 일꾼 수 — 폰 코어 몇 개는 디코더 · 화면 몫으로 남긴다 */
export function lumaPoolSize(): number {
  return pool?.length ?? 0;
}

function ensurePool(): Slot[] | null {
  if (pool || broken) return pool;
  if (typeof Worker === 'undefined' || typeof VideoFrame === 'undefined') {
    broken = true;
    return null;
  }
  try {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
    pool = Array.from({ length: n }, () => {
      const slot: Slot = { w: new Worker(new URL('./luma.worker.ts', import.meta.url), { type: 'module' }), busy: 0 };
      slot.w.onmessage = (e: MessageEvent) => {
        const { id, luma, ms } = e.data as { id: number; luma: Float32Array | null; ms: number };
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        slot.busy--;
        p.resolve({ luma, ms });
      };
      /* 일꾼이 넘어지면 맡긴 장면은 null 로 끝내고(부르는 쪽이 되감기로 마저) 다음부터는 쓰지 않는다 */
      slot.w.onerror = () => {
        broken = true;
        for (const [id, p] of pending) {
          if (p.slot !== slot) continue;
          pending.delete(id);
          p.resolve({ luma: null, ms: 0 });
        }
      };
      return slot;
    });
  } catch {
    broken = true;
    pool = null;
  }
  return pool;
}

/** 장면 하나를 일꾼에게 넘긴다(frame 은 넘어가 일꾼이 닫는다). 못 넘기면 null — 그때 frame 은 부르는 쪽이 닫는다 */
export function lumaInWorker(
  frame: VideoFrame,
  rotation: number,
  W: number,
  H: number
): Promise<{ luma: Float32Array | null; ms: number }> | null {
  const slots = ensurePool();
  if (!slots || broken) return null;
  const slot = slots.reduce((a, b) => (b.busy < a.busy ? b : a));
  const id = nextId++;
  const done = new Promise<{ luma: Float32Array | null; ms: number }>((resolve) => pending.set(id, { slot, resolve }));
  try {
    slot.w.postMessage({ id, frame, rotation, W, H }, [frame]);
  } catch {
    pending.delete(id);
    return null;
  }
  slot.busy++;
  return done;
}

/** 일꾼들을 깨워 빈 장면으로 한 번씩 — JIT 와 Y 버퍼를 데운다(측정 시작 때) */
export async function warmLumaPool(): Promise<void> {
  const slots = ensurePool();
  if (!slots) return;
  const w = 1920;
  const h = 1080;
  await Promise.all(
    slots.map(() => {
      try {
        const frame = new VideoFrame(new Uint8Array((w * h * 3) / 2), {
          format: 'NV12',
          codedWidth: w,
          codedHeight: h,
          timestamp: 0,
        });
        const job = lumaInWorker(frame, 90, 720, 1280);
        if (!job) frame.close();
        return job;
      } catch {
        return null;
      }
    })
  );
}
