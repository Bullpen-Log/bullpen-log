/**
 * 실시간 측정 워커 ② — 담은 장면으로 구속을 계산한다(analyzeFrames). 공 하나에 노드 0.7~1.4초, 폰은 더 걸린다 — 화면
 * 스레드에서 하면 그동안 화면이 멈추고 카메라 장면이 빠져(브라우저 시험대: 2.7~6.2초 멈춤, 거의 모든 공이 '초당 장면 수 부족'),
 * 측정 워커에서 하면 그동안 다음 공을 못 본다. 그래서 따로 둔다.
 *
 * 측정 워커(live-meter.worker.ts)가 MessagePort 로 일감을 보내고, 결과는 화면 스레드(live-capture.ts)로 보낸다. 끝나면 측정
 * 워커에 'done' 을 돌려줘 쌓인 일감을 세게 한다(MAX_JOBS_IN_FLIGHT).
 */
import { analyzeJob, unpackJob } from './live-meter.ts';
import type {
  AnalyzeWorkerDone,
  AnalyzeWorkerIn,
  AnalyzeWorkerOut,
} from './live-worker-types.ts';

/* 워커 전역 — 저장소 tsconfig 는 dom 만 싣는다(webworker 를 같이 실으면 이름이 겹친다) */
const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
};
const post = (m: AnalyzeWorkerOut) => scope.postMessage(m);

function run(m: AnalyzeWorkerIn, port: MessagePort) {
  const waitMs = performance.now() - m.postedAt;
  const a0 = performance.now();
  try {
    const job = m.type === 'packed' ? unpackJob(m.job) : m.job;
    const result = analyzeJob(job, m.camera);
    post({
      type: 'result',
      id: m.job.id,
      triggerT: m.job.triggerT,
      result,
      analyzeMs: performance.now() - a0,
      waitMs,
    });
  } catch (e) {
    post({
      type: 'error',
      id: m.job.id,
      triggerT: m.job.triggerT,
      message: e instanceof Error ? e.message : String(e),
    });
  } finally {
    port.postMessage({ type: 'done', id: m.job.id } satisfies AnalyzeWorkerDone);
  }
}

scope.onmessage = (
  e: MessageEvent<{ type: 'port'; port: MessagePort } | { type: 'ping' }>
) => {
  const m = e.data;
  if (m.type === 'port') {
    const port = m.port;
    port.onmessage = (ev: MessageEvent<AnalyzeWorkerIn>) => {
      if (ev.data?.type === 'job' || ev.data?.type === 'packed') run(ev.data, port);
    };
    post({ type: 'hello' });
  }
};

export {};
