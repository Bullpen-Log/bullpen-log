/** 읽기 전체(인증 동기화 · 응답 본문 포함)에만 적용한다. 쓰기를 자동 재시도하지 않는다. */
export function readDeadline<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, timeout: () => Error, onTimeout: () => void = () => {}): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      // abort에 따른 fetch 거절보다 명확한 시간 초과를 먼저 전달한다.
      reject(timeout());
      controller.abort();
      onTimeout();
    }, ms);
    Promise.resolve().then(() => run(controller.signal)).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
