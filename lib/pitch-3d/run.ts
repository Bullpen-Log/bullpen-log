'use client';

import type { Pitch3dInput, Pitch3dResult } from './analyze';

/**
 * 3D 분석을 워커에서 돌린다 — 못 띄우면(오래된 브라우저 · 묶기 실패) 화면 스레드에서. 취소하면 워커를 끝낸다.
 */
export async function runPitch3d(input: Pitch3dInput, signal?: AbortSignal): Promise<Pitch3dResult> {
  if (typeof Worker !== 'undefined') {
    let worker: Worker | null = null;
    try {
      /* Next.js 는 이 모양(new URL + import.meta.url)을 보고 워커를 따로 묶는다 */
      worker = new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' });
      const w = worker;
      return await new Promise<Pitch3dResult>((resolve, reject) => {
        const stop = () => {
          w.terminate();
          reject(new Error('분석을 멈췄어요.'));
        };
        signal?.addEventListener('abort', stop, { once: true });
        w.onmessage = (e: MessageEvent) => {
          signal?.removeEventListener('abort', stop);
          w.terminate();
          if (e.data?.type === 'result') resolve(e.data.result as Pitch3dResult);
          else reject(new Error(e.data?.message ?? '3D 계산에 실패했어요.'));
        };
        w.onerror = () => {
          signal?.removeEventListener('abort', stop);
          w.terminate();
          reject(new Error('worker'));
        };
        w.postMessage(input);
      });
    } catch (err) {
      worker?.terminate();
      if (signal?.aborted || (err instanceof Error && err.message !== 'worker')) throw err;
      /* 워커를 못 띄웠으면 아래 화면 스레드로 */
    }
  }
  const { analyzePitch3d } = await import('./analyze');
  if (signal?.aborted) throw new Error('분석을 멈췄어요.');
  return analyzePitch3d(input);
}
