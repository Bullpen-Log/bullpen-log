'use client';

import { useEffect, useRef, useState } from 'react';
import { Film, Loader2, Upload, X } from 'lucide-react';
import { captureThumbnail } from '@/lib/capture-thumbnail';
import { useWakeLock } from '@/components/use-wake-lock';

export const MAX_VIDEO_MB = 50;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
/** 줄여서 올릴 때 고를 수 있는 원본 크기 — 4K 원본도 1080p 로 줄이면 대개 50MB 안에 든다 */
const MAX_SOURCE_MB = 400;
/** 이보다 작으면 줄이지 않는다(이미 작은 영상을 다시 만들어도 거의 안 준다) */
const SKIP_BELOW_BYTES = 6 * 1024 * 1024;

/**
 * 올리기 전에 줄이기 — 소리를 빼고 긴 변 1080p · 6~8Mbps H.264 로 다시 만든다(lib/clip/edit.ts, 촬영 영상과 같은 엔진).
 * 아이폰 원본(.mov, HEVC · 4K 가 많다)이 3~5배 준다. 장면 수(fps)는 그대로라 슬로모 · 폼 분석에 쓸 수 있다.
 * 다시 만들 수 없는 브라우저이거나, 줄인 것이 원본의 8할보다 크면 null — 원본을 그대로 올린다.
 */
async function shrinkVideo(file: File, onProgress: (p: number) => void): Promise<File | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  try {
    const { exportMutedClip } = await import('@/lib/clip/edit');
    const clip = await exportMutedClip(
      file,
      { start: 0, end: Number.MAX_SAFE_INTEGER },
      { onProgress: (p) => onProgress(Math.round(p * 100)) }
    );
    if (clip.path !== 'transcode' || clip.file.size >= file.size * 0.8) return null;
    return new File([clip.file], file.name.replace(/\.[^.]+$/, '') + '.mp4', { type: 'video/mp4' });
  } catch {
    return null;
  }
}

export type UploadedVideo = {
  path: string;
  name: string;
  /**
   * 미리보기에 쓸 주소.
   *
   * 방금 올린 영상은 브라우저가 들고 있는 파일을 바로 가리키고, 예전에 올려둔
   * 영상은 저장소에서 발급받은 재생 주소가 들어온다. 아직 못 받았으면 비어
   * 있을 수 있다 — 그때는 이름만 보여준다.
   */
  previewUrl?: string;
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
export async function uploadToStorage(
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
  if (!res.ok) throw new Error(data.error ?? '업로드 주소를 받지 못했어요.');

  /*
   * 신호가 잠깐 끊겨 실패하면 한 번 더 올린다(2026-10-03 아이폰 점검 — 와이파이 · 데이터가 바뀌는 순간 끊겼다).
   * 받은 주소(Supabase 서명 주소)는 두 시간 쓸 수 있어 같은 주소로 다시 보낸다. 다만 앞의 것이 실제로는 다
   * 올라갔는데 대답만 못 받았으면, 같은 경로라 저장소가 '이미 있어요'(409 · Duplicate)라고 한다 — 그때는 올라간
   * 것이다(이 경로는 방금 이 파일에 받은 새 이름이라 남의 것이 있을 수 없다).
   */
  try {
    await putFile(data.signedUrl, file, onProgress, false);
  } catch (err) {
    if (!(err instanceof NetworkError)) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    onProgress(0);
    await putFile(data.signedUrl, file, onProgress, true);
  }

  return data.path as string;
}

/** 신호가 끊겨 대답을 못 받은 실패 — 이것만 다시 해 본다(서버가 거절한 것은 다시 해도 같다) */
class NetworkError extends Error {}

function putFile(
  url: string,
  file: Blob,
  onProgress: (percent: number) => void,
  retry: boolean
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      /* 다시 보낸 것인데 '이미 있어요' — 앞의 것이 다 올라갔다(위 설명) */
      const duplicate =
        xhr.status === 409 || /duplicate|already exists/i.test(xhr.responseText ?? '');
      if (retry && duplicate) return resolve();
      reject(new Error('업로드에 실패했어요.'));
    };
    xhr.onerror = () =>
      reject(
        new NetworkError(
          '신호가 끊겨 업로드에 실패했어요. 연결을 확인하고 다시 골라 주세요.'
        )
      );
    xhr.send(file);
  });
}

export function VideoUpload({
  videos,
  onChange,
  max = 2,
  disabled,
  confirmRemove,
  /** 업로드 주소를 받아올 곳. 라이브러리 영상은 관리자 전용 주소를 쓴다. */
  endpoint = '/api/pitch-log/upload-url',
  /** 목록에서 재생 전에 보여줄 이미지를 함께 만들지 여부 */
  withThumbnail = false,
  compress = false,
  onUploadingChange,
  onUploaded,
}: {
  /** 올리기 전에 줄인다(shrinkVideo) — 회원이 올리는 투구 영상. 라이브러리 · 투구 분석 샘플은 원본 그대로 */
  compress?: boolean;
  /**
   * 한 개를 다 올렸을 때 — 저장소 경로와 올린 파일을 넘긴다.
   *
   * 투구 기록 폼이 여기서 그 영상의 미리보기(영상 캘린더의 썸네일)를 뜬다. 손에 든
   * 파일에서 바로 뜨니 나중에 영상을 다시 받을 일이 없다. 기다리지 않는다 — 실패해도
   * 캘린더를 열 때 다시 뜬다.
   */
  onUploaded?: (path: string, file: File) => void;
  videos: UploadedVideo[];
  onChange: (next: UploadedVideo[]) => void;
  max?: number;
  disabled?: boolean;
  /**
   * 올리는 중인지 바깥에 알린다. 감싸는 폼이 그동안 저장을 막는 데 쓴다.
   *
   * 올리는 중에 저장하면 그 영상은 아직 목록에 없어서 영상 없이 저장됐다.
   * 사용자는 모르고, 올라간 파일은 주인 없이 저장소에 남았다.
   */
  onUploadingChange?: (uploading: boolean) => void;
  /**
   * 이 영상을 빼기 전에 알려줄 말. 비워 두면 바로 뺀다.
   *
   * 되돌릴 수 없는 일에는 한 번 물어야 한다. 다만 막지는 않는다 —
   * 알려주고 정하는 것은 쓰는 사람 몫이다.
   */
  confirmRemove?: (video: UploadedVideo) => string | undefined;
  endpoint?: string;
  withThumbnail?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  /** 'shrink' = 줄이는 중 · 'upload' = 올리는 중 */
  const [stage, setStage] = useState<'shrink' | 'upload'>('upload');
  const [error, setError] = useState<string>();
  /** 한 번 눌러 물어본 영상. 같은 것을 또 누르면 그때 뺀다. */
  const [asking, setAsking] = useState<string | null>(null);

  /*
   * 지금 목록. 올리기가 끝났을 때 여기에 더한다.
   *
   * 올리기를 시작할 때의 목록(videos)에 더하면, 올리는 동안 사용자가 뺀 영상이
   * 끝나는 순간 되살아났다. 끝날 때의 목록을 봐야 한다.
   */
  const latestVideos = useRef(videos);
  useEffect(() => {
    latestVideos.current = videos;
  }, [videos]);

  /*
   * 올리는 동안 화면을 켜 둔다 — 아이폰은 화면이 꺼지면(30초~) 곧 사이트를 멈춰 올리던 것이 끊겼다. 큰 영상은
   * 데이터로 1분 넘게 걸린다(2026-10-03 점검). 끝나면 놓는다.
   */
  useWakeLock(uploading);

  const setBusy = (value: boolean) => {
    setUploading(value);
    onUploadingChange?.(value);
  };

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // 같은 파일을 다시 골라도 동작하도록 값을 비운다.
    e.target.value = '';
    if (!picked) return;
    let file: File = picked;

    setError(undefined);

    if (!file.type.startsWith('video/')) {
      setError('영상 파일만 올릴 수 있어요.');
      return;
    }
    const canShrink = compress && typeof VideoEncoder !== 'undefined';
    if (file.size > (canShrink ? MAX_SOURCE_MB * 1024 * 1024 : MAX_VIDEO_BYTES)) {
      /*
       * 무엇을 하면 되는지까지 — 아이폰 카메라는 4K · 60fps 가 기본이라 몇 초짜리도 50MB 를 넘는다(2026-10-03).
       * 사진 앱의 '편집'으로 던지는 부분만 남기거나, 설정 › 카메라 › 비디오 녹화를 1080p 로 바꾸면 된다.
       */
      setError(
        `${canShrink ? MAX_SOURCE_MB : MAX_VIDEO_MB}MB 이하만 올릴 수 있어요(고른 영상 ${formatSize(file.size)}). 사진 앱의 '편집'에서 던지는 부분만 남기고 잘라 주세요. 다음부터는 설정 › 카메라 › 비디오 녹화를 1080p 로 찍으면 작아져요.`
      );
      return;
    }
    if (videos.length >= max) {
      setError(`영상은 최대 ${max}개까지 첨부할 수 있어요.`);
      return;
    }

    setBusy(true);
    setProgress(0);

    try {
      if (canShrink && file.size >= SKIP_BELOW_BYTES) {
        setStage('shrink');
        file = (await shrinkVideo(file, setProgress)) ?? file;
        setProgress(0);
      }
      setStage('upload');
      if (file.size > MAX_VIDEO_BYTES) {
        throw new Error(
          `줄여도 ${MAX_VIDEO_MB}MB 를 넘어요(${formatSize(file.size)}). 사진 앱의 '편집'에서 던지는 부분만 남기고 잘라 주세요.`
        );
      }
      const path = await uploadToStorage(file, endpoint, setProgress);
      onUploaded?.(path, file);

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
        ...latestVideos.current,
        { path, name: picked.name, previewUrl: URL.createObjectURL(file), thumbPath },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했어요.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const remove = (path: string) => {
    const target = videos.find((v) => v.path === path);
    if (!target) return;

    // 알릴 말이 있으면 먼저 보여주고, 같은 것을 다시 누를 때 뺀다.
    if (asking !== path && confirmRemove?.(target)) {
      setAsking(path);
      return;
    }

    /*
     * 방금 올린 영상만 주소를 거둔다.
     *
     * blob: 로 시작하는 것이 브라우저가 들고 있는 파일이다. 저장소에서 받은
     * 재생 주소를 여기 넣으면 아무 일도 일어나지 않지만, 뜻이 다른 것을 같이
     * 다루면 나중에 헷갈린다.
     */
    if (target.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(target.previewUrl);
    }
    setAsking(null);
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
          className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-4 py-3 text-sm text-ink transition-colors hover:border-sky hover:text-sky disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {stage === 'shrink' ? '영상 줄이는 중…' : '올리는 중…'} {progress}%
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {full ? '첨부 완료' : '영상 선택'}
            </>
          )}
        </button>
        <span className="text-xs text-muted">
          {videos.length} / {max} · 최대 {compress ? MAX_SOURCE_MB : MAX_VIDEO_MB}MB
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
            className="h-full rounded-full bg-sky transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
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
              {v.previewUrl ? (
                <video
                  src={v.previewUrl}
                  controls
                  playsInline
                  className="aspect-video w-full bg-black object-contain"
                />
              ) : (
                /* 재생 주소를 아직 못 받은 영상 — 이름만이라도 보여준다 */
                <div className="flex aspect-video w-full items-center justify-center bg-surface">
                  <Film className="h-6 w-6 text-line-strong" />
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-2">
                <Film className="h-3.5 w-3.5 shrink-0 text-sky" />
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {v.name}
                </span>
                <button
                  type="button"
                  onClick={() => remove(v.path)}
                  aria-label={
                    asking === v.path ? `${v.name} 정말 빼기` : `${v.name} 빼기`
                  }
                  /* 손가락 크기(40px) — 22px 라 잘 안 눌렸다. 빨강은 테마 색(text-danger)으로 */
                  className={`-my-2 -mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors ${
                    asking === v.path ? 'text-danger' : 'text-muted hover:text-danger'
                  }`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 한 번 눌렀을 때 나오는 안내 — 다시 누르면 뺀다 */}
              {asking === v.path && (
                <div className="border-t border-danger-line bg-danger-bg px-3 py-2.5">
                  <p className="text-[11px] leading-relaxed text-danger">
                    {confirmRemove?.(v)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => remove(v.path)}
                      className="rounded-lg bg-danger px-3 py-1.5 text-[11px] font-semibold text-white"
                    >
                      빼기
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsking(null)}
                      className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-ink"
                    >
                      그대로 두기
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
