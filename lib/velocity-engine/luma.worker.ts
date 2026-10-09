/**
 * 밝기 일꾼 — 풀어낸 장면(VideoFrame, 넘겨받음) 하나를 분석 크기 밝기로(luma-plane.ts lumaOfSample) 만들어 돌려준다. 화면 스레드에서
 * 한 장씩 하면 앱 클립 100장에 0.77초(2026-10-09 폰) — 일꾼 여럿(luma-pool.ts)이 나눠 한다. 값은 화면 스레드에서 한 것과 같다.
 */
import { boxLumaOfSample, lumaOfSample } from './luma-plane.ts';

/* 워커 전역 — 저장소 tsconfig 는 dom 만 싣는다(webworker 를 같이 실으면 이름이 겹친다) */
const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

scope.onmessage = async (e: MessageEvent) => {
  const { id, frame, rotation, W, H, box } = e.data as {
    id: number;
    frame: VideoFrame;
    rotation: number;
    W: number;
    H: number;
    box?: boolean;
  };
  const t0 = performance.now();
  try {
    const luma = await (box ? boxLumaOfSample : lumaOfSample)(
      {
        format: frame.format,
        rotation,
        codedWidth: frame.codedWidth,
        visibleRect: frame.visibleRect as DOMRectReadOnly,
        colorSpace: frame.colorSpace,
        allocationSize: () => frame.allocationSize(),
        copyTo: (dest) => frame.copyTo(dest),
      },
      W,
      H
    );
    scope.postMessage({ id, luma, ms: performance.now() - t0 }, luma ? [luma.buffer] : []);
  } catch {
    scope.postMessage({ id, luma: null, ms: performance.now() - t0 });
  } finally {
    frame.close();
  }
};
