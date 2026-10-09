'use client';

/**
 * 촬영 모드의 앱 카메라 — 아이폰 앱(mobile/ 의 'ShootCamera' 부품)이 아이폰 기본 카메라 화면을 고화질(1080p)로 띄워 찍고,
 * 찍은 파일을 조금씩 넘겨준다. 웹 카메라(<input capture>)는 쓰지 않는다 — WebKit 이 화질을 정하지 않아 480×360 쯤으로
 * 찍힌다(2026-10-09 사용자: "웹 카메라에서 못 찍게 하고 앱 카메라로").
 *
 * 앱 쪽 약속(김민이 만든다 — docs/designs/shoot-camera-native.md):
 *   status()                          → { version: 1, camera: boolean }
 *   record({ maxSeconds })            → { path, size } · 취소하면 { cancelled: true } · 권한 없음은 code 'denied' 로 거절
 *   read({ path, offset, length })    → { data(base64), size, eof }   (length 4MB 까지, record 가 준 경로만)
 *   discard({ paths })                다 읽은 파일 지우기
 * 사이트는 Capacitor 패키지 없이 window.Capacitor.nativePromise 로 부른다(lib/dual-camera.ts 와 같은 방식).
 */

export const SHOOT_CAMERA_PLUGIN = 'ShootCamera';

/** 찍을 수 있는 가장 긴 길이(초) — 영상 하나는 3분 안에 찍는다(촬영 계획) */
export const MAX_RECORD_SECONDS = 180;

/** 한 번에 넘겨받는 크기 — 앱 쪽 상한 4MB 안 */
const CHUNK = 2 * 1024 * 1024;

type Bridge = {
  isPluginAvailable?: (name: string) => boolean;
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
};

function bridge(): Bridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { Capacitor?: Bridge }).Capacitor;
}

/** 앱 카메라가 있나 — 새 앱(ShootCamera 부품이 든)에서만 true */
export function appCameraAvailable(): boolean {
  return bridge()?.isPluginAvailable?.(SHOOT_CAMERA_PLUGIN) === true;
}

/** 앱 안인가(옛 앱 포함) — 없을 때 '앱을 업데이트'와 '앱에서 열기'를 가른다 */
export function insideApp(): boolean {
  return (
    bridge()?.isNativePlatform?.() === true ||
    (typeof navigator !== 'undefined' && navigator.userAgent.includes('BullpenLogApp'))
  );
}

/** 왜 못 찍나 — 사람 말 */
export function appCameraMissingText(): string {
  return insideApp()
    ? '앱을 새 버전으로 업데이트하면(TestFlight) 여기서 바로 찍어요.'
    : '영상은 불펜로그 앱에서만 찍어요. 앱에서 이 화면을 열어 주세요.';
}

export type AppCameraErrorCode = 'denied' | 'unavailable' | 'busy' | 'failed';

export class AppCameraError extends Error {
  readonly code: AppCameraErrorCode;
  constructor(message: string, code: AppCameraErrorCode) {
    super(message);
    this.code = code;
  }
}

async function call<T>(method: string, options?: unknown): Promise<T> {
  const cap = bridge();
  if (!cap?.nativePromise || !appCameraAvailable()) {
    throw new AppCameraError(appCameraMissingText(), 'unavailable');
  }
  try {
    return (await cap.nativePromise(SHOOT_CAMERA_PLUGIN, method, options)) as T;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e?.code === 'denied') {
      throw new AppCameraError(
        '카메라 권한이 꺼져 있어요. 아이폰 설정 → 불펜로그 → 카메라를 켜 주세요.',
        'denied'
      );
    }
    if (e?.code === 'busy') throw new AppCameraError('카메라가 이미 열려 있어요.', 'busy');
    throw new AppCameraError(e?.message || '카메라를 열지 못했어요.', 'failed');
  }
}

/** base64 → 바이트 — 사파리 18.2+ 는 Uint8Array.fromBase64, 아니면 atob */
export function decodeBase64(data: string): Uint8Array<ArrayBuffer> {
  const from = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array<ArrayBuffer> })
    .fromBase64;
  if (from) return from(data);
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 앱 카메라로 찍는다 — 아이폰 기본 카메라 화면이 뜨고, 다 찍어 [비디오 사용]을 누르면 파일을 넘겨받아 돌려준다.
 * 취소하면 null. 넘겨받는 동안 onProgress(0~1). 다 받으면 앱의 임시 파일을 지운다.
 */
export async function recordWithAppCamera(
  onProgress: (p: number) => void = () => {}
): Promise<File | null> {
  const res = await call<{ cancelled?: boolean; path?: string; size?: number }>('record', {
    maxSeconds: MAX_RECORD_SECONDS,
  });
  if (res?.cancelled || !res?.path) return null;
  const path = res.path;
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  let size = res.size ?? 0;
  try {
    for (;;) {
      const chunk = await call<{ data: string; size: number; eof: boolean }>('read', {
        path,
        offset,
        length: CHUNK,
      });
      const bytes = decodeBase64(chunk.data);
      parts.push(bytes);
      offset += bytes.length;
      size = chunk.size || size;
      onProgress(size > 0 ? Math.min(1, offset / size) : 0);
      if (chunk.eof || bytes.length === 0) break;
    }
  } finally {
    await call('discard', { paths: [path] }).catch(() => undefined);
  }
  const ext = path.toLowerCase().endsWith('.mp4') ? 'mp4' : 'mov';
  return new File(parts, `app-camera.${ext}`, {
    type: ext === 'mp4' ? 'video/mp4' : 'video/quicktime',
  });
}
