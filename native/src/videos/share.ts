import { File } from 'expo-file-system';
import { createUploadTask, FileSystemUploadType } from 'expo-file-system/legacy';
import { isPhoneVideoPath, phoneAssetId } from '@/lib/phone-video-path';
import { MEDIA_VIDEO_MAX_MB } from '@/lib/community';
import { LocalVideo } from '../../modules/local-video';
import { rpc, syncSession } from '~/lib/rpc';
import { SITE_URL } from '~/lib/site';

/**
 * 덕아웃 공유용 사본(2026-10-28 설계 docs/designs/overseas-sinker-dugout.md 5-6) — 글은 개인 원본을 가리키지 않는다.
 * 폰에만 있는 영상은 그 파일을 커뮤니티 업로드 주소로 한 번 올리고, 서버에 있는 영상은 저장소 안에서 복사한다(다시 안 올림).
 * 그래서 내 영상을 지워도 글이 안 깨지고, 글을 지워도 내 영상은 그대로다. 줄이기 · 자르기는 아직 없다 — 한도(50MB)를 넘으면 올리기 전에 알린다.
 * 2026-10-29: 올릴 주소를 받으면 그 경로를 먼저 알린다(onPath — 끊겨도 같은 시도로 정리 · 재사용하게), 진행률은 실제 바이트만, 멈추기(cancel) 가능.
 */
export const SHARE_MAX_BYTES = MEDIA_VIDEO_MAX_MB * 1024 * 1024;
const MB = 1024 * 1024;

export class ShareFileError extends Error {}

/** 올리기 전에 — 이 기기에 파일이 있나 · 한도 안인가(서버 영상은 서버가 복사하며 본다) */
export async function checkShareFile(path: string): Promise<{ ok: true; size: number | null } | { ok: false; reason: 'missing' | 'big'; size: number | null }> {
  if (!isPhoneVideoPath(path)) return { ok: true, size: null };
  const id = phoneAssetId(path);
  const url = await LocalVideo.fileUrl({ id }).then(
    (r) => r.url,
    () => null
  );
  if (!url) return { ok: false, reason: 'missing', size: null };
  let size: number | null = null;
  try {
    size = new File(url).size ?? null;
  } catch {
    size = null;
  }
  if (size != null && size > SHARE_MAX_BYTES) return { ok: false, reason: 'big', size };
  return { ok: true, size };
}
export const bigText = (size: number | null) =>
  `${MEDIA_VIDEO_MAX_MB}MB 넘는 영상은 아직 덕아웃에 올릴 수 없어요${size ? `(이 영상 ${Math.round(size / MB)}MB)` : ''}. 사진 앱에서 던지는 부분만 남겨 새로 추가하면 올릴 수 있어요.`;

export type ShareUpload = {
  /** 바이트 진행률(0~100) — 서버 복사는 부르지 않는다(모름) */
  onProgress?: (percent: number) => void;
  /** 올릴 경로가 정해졌을 때(올리기 전) — 끊겨도 정리 · 같은 시도로 쓴다 */
  onPath?: (path: string) => void;
  /** 멈추기를 꽂는다 — 부르면 올리기를 멈추고 ShareFileError('멈춤') */
  onCancelable?: (cancel: () => void) => void;
};

export async function uploadShareCopy(path: string, opts: ShareUpload = {}): Promise<string> {
  if (!isPhoneVideoPath(path)) {
    const r = await rpc<{ ok: true; path: string } | { ok: false; error: string }>('community.copyShareVideo', path);
    if (!r.ok) throw new ShareFileError(r.error);
    opts.onPath?.(r.path);
    return r.path;
  }
  const id = phoneAssetId(path);
  const file = await LocalVideo.load({ id }).catch(() => null);
  if (!file) throw new ShareFileError('이 기기에서 영상을 찾지 못했어요. 찍은 기기의 싱커 앱에서 올려 주세요.');
  try {
    if (file.size > SHARE_MAX_BYTES) throw new ShareFileError(bigText(file.size));
    const { url } = await LocalVideo.fileUrl({ id });
    const type = /\.mov$/i.test(file.path) ? 'video/quicktime' : 'video/mp4';
    await syncSession();
    const res = await fetch(`${SITE_URL}/api/community/upload-url`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileSize: file.size, fileType: type }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { path?: string; signedUrl?: string; error?: string } | null;
    if (!res?.ok || !json?.path || !json.signedUrl) throw new Error(json?.error ?? '신호가 약해 올릴 주소를 못 받았어요.');
    opts.onPath?.(json.path);
    let cancelled = false;
    let current: ReturnType<typeof createUploadTask> | null = null;
    opts.onCancelable?.(() => {
      cancelled = true;
      void current?.cancelAsync().catch(() => undefined);
    });
    const put = async () => {
      current = createUploadTask(
        json.signedUrl!,
        url,
        { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { 'content-type': type } },
        (p) => p.totalBytesExpectedToSend > 0 && opts.onProgress?.(Math.round((p.totalBytesSent / p.totalBytesExpectedToSend) * 100))
      );
      const r = await current.uploadAsync();
      if (cancelled) throw new ShareFileError('전송을 멈췄어요.');
      if (!r || r.status < 200 || r.status >= 300) throw new Error('영상을 올리지 못했어요.');
    };
    try {
      await put();
    } catch (e) {
      if (cancelled || e instanceof ShareFileError) throw e;
      /* 신호가 잠깐 끊긴 것일 수 있다 — 같은 주소로 한 번 더(투구 분석 올리기와 같다) */
      await new Promise((r) => setTimeout(r, 1500));
      opts.onProgress?.(0);
      await put();
    }
    return json.path;
  } finally {
    /* load 가 내준 읽기를 닫는다(앱 안 영상은 그대로) */
    void LocalVideo.discard({ paths: [file.path] }).catch(() => undefined);
  }
}
