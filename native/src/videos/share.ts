import { createUploadTask, FileSystemUploadType } from 'expo-file-system/legacy';
import { isPhoneVideoPath, phoneAssetId } from '@/lib/phone-video-path';
import { MEDIA_VIDEO_MAX_MB } from '@/lib/community';
import { LocalVideo } from '../../modules/local-video';
import { rpc, syncSession } from '~/lib/rpc';
import { SITE_URL } from '~/lib/site';

/**
 * 덕아웃 공유용 사본(2026-10-28 설계 docs/designs/overseas-sinker-dugout.md 5-6) — 글은 개인 원본을 가리키지 않는다.
 * 폰에만 있는 영상은 그 파일을 커뮤니티 업로드 주소로 한 번 올리고, 서버에 있는 영상은 저장소 안에서 복사한다(다시 안 올림).
 * 그래서 내 영상을 지워도 글이 안 깨지고, 글을 지워도 내 영상은 그대로다. 줄이기 · 자르기는 아직 없다 — 한도(50MB)를 넘으면 알린다.
 */
export const SHARE_MAX_BYTES = MEDIA_VIDEO_MAX_MB * 1024 * 1024;

export async function uploadShareCopy(path: string, onProgress: (percent: number) => void): Promise<string> {
  if (!isPhoneVideoPath(path)) {
    const r = await rpc<{ ok: true; path: string } | { ok: false; error: string }>('community.copyShareVideo', path);
    if (!r.ok) throw new Error(r.error);
    onProgress(100);
    return r.path;
  }
  const id = phoneAssetId(path);
  const file = await LocalVideo.load({ id }).catch(() => null);
  if (!file) throw new Error('이 폰에서 영상을 찾지 못했어요.');
  try {
    if (file.size > SHARE_MAX_BYTES) throw new Error(`${MEDIA_VIDEO_MAX_MB}MB 넘는 영상은 아직 올릴 수 없어요.`);
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
    const put = async () => {
      const task = createUploadTask(
        json.signedUrl!,
        url,
        { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { 'content-type': type } },
        (p) => p.totalBytesExpectedToSend > 0 && onProgress(Math.round((p.totalBytesSent / p.totalBytesExpectedToSend) * 100))
      );
      const r = await task.uploadAsync();
      if (!r || r.status < 200 || r.status >= 300) throw new Error('영상을 올리지 못했어요.');
    };
    try {
      await put();
    } catch {
      /* 신호가 잠깐 끊긴 것일 수 있다 — 같은 주소로 한 번 더(투구 분석 올리기와 같다) */
      await new Promise((r) => setTimeout(r, 1500));
      onProgress(0);
      await put();
    }
    return json.path;
  } finally {
    /* load 가 내준 읽기를 닫는다(앱 안 영상은 그대로) */
    void LocalVideo.discard({ paths: [file.path] }).catch(() => undefined);
  }
}
