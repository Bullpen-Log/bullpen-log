'use client';

/**
 * 회원 영상은 폰의 사진 앱 '불펜로그' 앨범에 둔다(아이폰 앱의 'LocalVideo' 부품 — mobile/ios/App/App/LocalVideoPlugin.swift).
 * 서버(Supabase)에는 올리지 않는다 — 2026-10-10 사용자: "폰에 저장해도 되는 것과 서버에 저장해야 하는 것을 확실히 구분".
 * 서버에 두는 것: 관리자가 올리는 라이브러리 · 촬영 · 투구 분석 샘플 · 구속 보정용 클립, 나중의 유료 클라우드 · 팀 기능.
 *
 * DB 에는 영상 자리에 '{userId}/local-<사진 앱 영상 번호>' 를 적는다(lib/phone-video-path.ts — 칸은 그대로).
 * 그 영상은 찍은 폰에서만 열린다. 다른 기기 · 웹에서는 '찍은 폰에 있어요'.
 * 사이트는 Capacitor 패키지 없이 window.Capacitor.nativePromise 로 부른다(lib/shoot-camera.ts 와 같은 방식).
 */

import { decodeBase64 } from '@/lib/shoot-camera';
import { isPhoneVideoPath, phoneAssetId } from '@/lib/phone-video-path';

export const LOCAL_VIDEO_PLUGIN = 'LocalVideo';
export { isPhoneVideoPath } from '@/lib/phone-video-path';

/** 앱 쪽 상한 4MB 안 · base64 로 커지는 것까지 */
const CHUNK = 2 * 1024 * 1024;

type Bridge = {
  isPluginAvailable?: (name: string) => boolean;
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
};

function bridge(): Bridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { Capacitor?: Bridge }).Capacitor;
}

/** 폰에 저장할 수 있나 — 새 앱(LocalVideo 부품이 든)에서만 true */
export function localVideoAvailable(): boolean {
  return bridge()?.isPluginAvailable?.(LOCAL_VIDEO_PLUGIN) === true;
}

export class LocalVideoError extends Error {
  readonly code: 'denied' | 'missing' | 'unavailable' | 'failed';
  constructor(message: string, code: LocalVideoError['code']) {
    super(message);
    this.code = code;
  }
}

const DENIED_TEXT = '사진 접근이 꺼져 있어요. 아이폰 설정 → 불펜로그 → 사진에서 \'모든 사진\'이나 \'선택한 사진\'을 켜 주세요.';

async function call<T>(method: string, options?: unknown): Promise<T> {
  const cap = bridge();
  if (!cap?.nativePromise || !localVideoAvailable()) {
    throw new LocalVideoError('앱을 새 버전으로 업데이트해 주세요(TestFlight).', 'unavailable');
  }
  try {
    return (await cap.nativePromise(LOCAL_VIDEO_PLUGIN, method, options)) as T;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e?.code === 'denied') throw new LocalVideoError(DENIED_TEXT, 'denied');
    if (e?.code === 'missing')
      throw new LocalVideoError('사진 앱에서 이 영상을 찾지 못했어요. 지웠거나 다른 폰에서 찍은 영상이에요.', 'missing');
    throw new LocalVideoError(e?.message || '영상을 다루지 못했어요.', 'failed');
  }
}

/** 사진 접근 허락 — 처음이면 묻는다. 거절이면 던진다 */
export async function ensurePhotoAccess(): Promise<void> {
  const { access } = await call<{ access: string }>('status');
  if (access === 'authorized' || access === 'limited') return;
  if (access === 'denied') throw new LocalVideoError(DENIED_TEXT, 'denied');
  const res = await call<{ access: string }>('requestAccess');
  if (res.access !== 'authorized' && res.access !== 'limited') {
    throw new LocalVideoError(DENIED_TEXT, 'denied');
  }
}

function toBase64(bytes: Uint8Array): string {
  const to = (bytes as unknown as { toBase64?: () => string }).toBase64;
  if (to) return to.call(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** 사이트가 가진 영상(Blob)을 사진 앱 '불펜로그' 앨범에 넣고 영상 번호를 돌려준다(경로는 서버가 붙인다 — phoneVideoPath) */
export async function saveBlobToPhone(
  blob: Blob,
  onProgress: (p: number) => void = () => {}
): Promise<string> {
  await ensurePhotoAccess();
  const ext = blob.type === 'video/quicktime' ? 'mov' : 'mp4';
  const { token } = await call<{ token: string }>('begin', { ext });
  for (let offset = 0; offset < blob.size; offset += CHUNK) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer());
    await call('append', { token, data: toBase64(bytes) });
    onProgress(Math.min(1, (offset + bytes.length) / blob.size));
  }
  const { id } = await call<{ id: string }>('finish', { token });
  return id;
}

/** 앱이 이미 가진 파일(구속 측정 클립 — 앱 임시 폴더)을 앨범에 넣고 영상 번호를 돌려준다 */
export async function saveAppFileToPhone(path: string): Promise<string> {
  await ensurePhotoAccess();
  const { id } = await call<{ id: string }>('saveFile', { path });
  return id;
}

/* 한 번 꺼낸 영상은 화면이 살아 있는 동안 다시 쓴다 */
const loaded = new Map<string, Promise<string>>();

/** 폰 영상 경로를 꺼내 재생 주소(blob:)로. 없거나 허락이 없으면 던진다 */
export function loadPhoneVideo(path: string, onProgress: (p: number) => void = () => {}): Promise<string> {
  const hit = loaded.get(path);
  if (hit) return hit;
  const job = (async () => {
    const res = await call<{ path: string; size: number }>('load', { id: phoneAssetId(path) });
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let offset = 0;
    try {
      for (;;) {
        const chunk = await call<{ data: string; size: number; eof: boolean }>('read', {
          path: res.path,
          offset,
          length: CHUNK,
        });
        const bytes = decodeBase64(chunk.data);
        parts.push(bytes);
        offset += bytes.length;
        onProgress(chunk.size > 0 ? Math.min(1, offset / chunk.size) : 0);
        if (chunk.eof || bytes.length === 0) break;
      }
    } finally {
      await call('discard', { paths: [res.path] }).catch(() => undefined);
    }
    const type = res.path.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
    return URL.createObjectURL(new Blob(parts, { type }));
  })();
  loaded.set(path, job);
  job.catch(() => loaded.delete(path));
  return job;
}

/** 아직 사진 앱에 있는 것만 — 앱이 아니면 빈 집합 */
export async function phoneVideosPresent(paths: string[]): Promise<Set<string>> {
  const local = paths.filter(isPhoneVideoPath);
  if (!local.length || !localVideoAvailable()) return new Set();
  const { found } = await call<{ found: string[] }>('exists', { ids: local.map(phoneAssetId) });
  const have = new Set(found);
  return new Set(local.filter((p) => have.has(phoneAssetId(p))));
}

/** 이 폰에서 열 수 없는 영상의 말 — 웹 · 다른 기기 · 옛 앱 */
export function phoneVideoElsewhereText(): string {
  return localVideoAvailable()
    ? '이 영상은 이 폰의 사진 앱에 없어요. 찍은 폰에서 볼 수 있어요.'
    : '이 영상은 찍은 폰의 불펜로그 앱에서 볼 수 있어요.';
}
