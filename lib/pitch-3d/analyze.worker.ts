/**
 * 3D 분석 워커 — 엔진(analyzePitch3d)을 화면 밖에서 돌린다. 데스크톱 5~7초, 폰은 더 걸려 화면 스레드에서 하면 진행 표시가 멈춘다.
 * 부르는 곳: lib/pitch-3d/run.ts(못 띄우면 화면 스레드로).
 */
import { analyzePitch3d, type Pitch3dInput } from './analyze';

/* 워커 전역 — 저장소 tsconfig 는 dom 만 싣는다(lib/velocity-engine/live-analyze.worker.ts 와 같은 방식) */
const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

scope.onmessage = (e: MessageEvent) => {
  try {
    scope.postMessage({ type: 'result', result: analyzePitch3d(e.data as Pitch3dInput) });
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
