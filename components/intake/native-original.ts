/** Private, bounded reads from an original held by the intake-only native screen. */
export const ORIGINAL_CHUNK_BYTES = 2 * 1024 * 1024;
export const NATIVE_INTAKE_MARKER = 'SinkerIntakeOriginal/1';
type Reply = { id: string; result?: unknown; error?: string };
type NativeWindow = Window & {
  ReactNativeWebView?: { postMessage(data: string): void };
};
export function nativeOriginalAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    navigator.userAgent.includes(NATIVE_INTAKE_MARKER) &&
    !!(window as NativeWindow).ReactNativeWebView
  );
}
export function originalRequest(
  op: 'pick' | 'read' | 'cancel' | 'authorize',
  args: Record<string, unknown> = {}
): Promise<unknown> {
  if (!nativeOriginalAvailable())
    return Promise.reject(new Error('원본 선택을 지원하는 앱에서 엽니다.'));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('intake-original-reply', receive);
    };
    const receive = (event: Event) => {
      const reply = (event as CustomEvent<Reply>).detail;
      if (reply?.id !== id) return;
      done();
      if (reply.error) reject(new Error(reply.error));
      else resolve(reply.result);
    };
    const timer = setTimeout(
      () => {
        done();
        const timeout = new Error(
          '원본을 준비하는 시간이 길어졌습니다. 다시 선택합니다.'
        );
        if (op === 'pick') {
          // Retire this pick before allowing a retry. A late cancel must never cancel
          // a newer pick, and a result already queued for this ID must be discarded.
          void originalRequest('cancel', { pickId: id })
            .catch(() => undefined)
            .finally(() => reject(timeout));
        } else reject(timeout);
      },
      op === 'pick' ? 10 * 60_000 : 60_000
    );
    window.addEventListener('intake-original-reply', receive);
    try {
      (window as NativeWindow).ReactNativeWebView!.postMessage(
        JSON.stringify({ t: 'intake-original', id, op, ...args })
      );
    } catch {
      done();
      reject(new Error('앱 연결을 확인하지 못했습니다. 파일 방식을 사용합니다.'));
    }
  });
}
const remoteFiles = new WeakSet<object>();
export const isNativeOriginal = (file: File) => remoteFiles.has(file);
export function originalFile(meta: {
  handle: string;
  name: string;
  size: number;
}): File {
  if (
    !meta ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(meta.handle) ||
    !Number.isSafeInteger(meta.size) ||
    meta.size <= 0 ||
    typeof meta.name !== 'string'
  )
    throw new Error('원본 파일 정보를 확인하지 못했습니다.');
  // All consumers use size and slice().arrayBuffer(), including the existing TUS reader.
  const file = new File([], meta.name, {
    type: /\.mp4$/i.test(meta.name) ? 'video/mp4' : 'video/quicktime',
  });
  Object.defineProperties(file, {
    size: { value: meta.size },
    slice: {
      value: (start = 0, end = meta.size) => ({
        arrayBuffer: async () => {
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end))
            throw new Error('원본 읽기 범위가 올바르지 않습니다.');
          const from = Math.max(
            0,
            Math.min(meta.size, start < 0 ? meta.size + start : start)
          );
          const stop = Math.max(
            from,
            Math.min(meta.size, end < 0 ? meta.size + end : end)
          );
          const bytes = new Uint8Array(stop - from);
          for (let at = from; at < stop; at += ORIGINAL_CHUNK_BYTES) {
            const to = Math.min(stop, at + ORIGINAL_CHUNK_BYTES);
            const data = await originalRequest('read', {
              handle: meta.handle,
              start: at,
              end: to,
            });
            if (typeof data !== 'string') throw new Error('원본을 읽지 못했습니다.');
            const raw = atob(data);
            if (raw.length !== to - at) throw new Error('원본 읽기 길이가 다릅니다.');
            for (let i = 0; i < raw.length; i++)
              bytes[at - from + i] = raw.charCodeAt(i);
          }
          return bytes.buffer;
        },
      }),
    },
  });
  remoteFiles.add(file);
  return file;
}
export async function pickNativeOriginal(): Promise<File | null> {
  const meta = await originalRequest('pick');
  return meta == null ? null : originalFile(meta as Parameters<typeof originalFile>[0]);
}
