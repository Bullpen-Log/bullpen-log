'use client';

import { useRef, useState } from 'react';
import { Film, Loader2, Upload, X } from 'lucide-react';
import { captureThumbnail } from '@/lib/capture-thumbnail';

export const MAX_VIDEO_MB = 50;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

export type UploadedVideo = {
  path: string;
  name: string;
  /** 업로드 직후 미리보기에 쓰는 로컬 주소 */
  previewUrl: string;
  /** 재생 전에 보여줄 이미지 경로. 캡처에 실패하면 없다. */
  thumbPath?: string;
};

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 브라우저에서 저장소로 파일을 직접 올린다.
 * 서버는 업로드 주소만 발급하므로 큰 파일도 통과한다.
 */
async function uploadToStorage(
  file: Blob & { name?: string },
  endpoint: string,
  onProgress: (percent: number) => void,
  kind: 'video' | 'thumbnail' = 'video'
) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name ?? 'thumbnail.jpg',
      fileSize: file.size,
      fileType: file.type,
      kind,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '업로드 주소를 받지 못했습니다.');

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', data.signedUrl);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error('업로드에 실패했습니다.'));
    xhr.onerror = () => reject(new Error('네트워크 오류로 업로드에 실패했습니다.'));
    xhr.send(file);
  });

  return data.path as string;
}

export function VideoUpload({
  videos,
  onChange,
  max = 2,
  disabled,
  /** 업로드 주소를 받아올 곳. 라이브러리 영상은 관리자 전용 주소를 쓴다. */
  endpoint = '/api/pitch-log/upload-url',
  /** 목록에서 재생 전에 보여줄 이미지를 함께 만들지 여부 */
  withThumbnail = false,
}: {
  videos: UploadedVideo[];
  onChange: (next: UploadedVideo[]) => void;
  max?: number;
  disabled?: boolean;
  endpoint?: string;
  withThumbnail?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 같은 파일을 다시 골라도 동작하도록 값을 비운다.
    e.target.value = '';
    if (!file) return;

    setError(undefined);

    if (!file.type.startsWith('video/')) {
      setError('영상 파일만 올릴 수 있습니다.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(
        `${MAX_VIDEO_MB}MB 이하만 올릴 수 있습니다. (선택한 파일 ${formatSize(file.size)})`
      );
      return;
    }
    if (videos.length >= max) {
      setError(`영상은 최대 ${max}개까지 첨부할 수 있습니다.`);
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const path = await uploadToStorage(file, endpoint, setProgress);

      // 재생 전에 보여줄 이미지. 실패해도 등록은 그대로 진행한다.
      let thumbPath: string | undefined;
      if (withThumbnail) {
        const shot = await captureThumbnail(file);
        if (shot) {
          try {
            thumbPath = await uploadToStorage(
              Object.assign(shot, { name: 'thumb.jpg' }),
              endpoint,
              () => {},
              'thumbnail'
            );
          } catch {
            thumbPath = undefined;
          }
        }
      }

      onChange([
        ...videos,
        { path, name: file.name, previewUrl: URL.createObjectURL(file), thumbPath },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const remove = (path: string) => {
    const target = videos.find((v) => v.path === path);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(videos.filter((v) => v.path !== path));
  };

  const full = videos.length >= max;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading || full}
          className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-4 py-3 text-sm text-cream transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              올리는 중… {progress}%
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {full ? '첨부 완료' : '영상 선택'}
            </>
          )}
        </button>
        <span className="text-xs text-muted">
          {videos.length} / {max} · 최대 {MAX_VIDEO_MB}MB
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handlePick}
        className="hidden"
      />

      {uploading && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {videos.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {videos.map((v) => (
            <li
              key={v.path}
              className="overflow-hidden rounded-xl border border-line bg-surface-2"
            >
              <video
                src={v.previewUrl}
                controls
                playsInline
                className="aspect-video w-full bg-black object-contain"
              />
              <div className="flex items-center gap-2 px-3 py-2">
                <Film className="h-3.5 w-3.5 shrink-0 text-gold" />
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {v.name}
                </span>
                <button
                  type="button"
                  onClick={() => remove(v.path)}
                  aria-label={`${v.name} 첨부 취소`}
                  className="rounded p-1 text-muted transition-colors hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
