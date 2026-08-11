'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';

/**
 * 라이브러리에 올린 영상 재생기.
 *
 * 목록에 영상이 여러 개 있어도 누르기 전에는 파일을 내려받지 않는다.
 * (한 화면에 20개가 있으면 20개를 미리 받아버리기 때문)
 * 누른 순간에만 재생 주소를 받아와 재생한다.
 */
export function LibraryVideo({
  path,
  title,
  thumbUrl,
}: {
  path: string;
  title: string;
  /** 재생 전에 보여줄 이미지. 없으면 빈 화면에 재생 버튼만 나온다. */
  thumbUrl?: string | null;
}) {
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const play = async () => {
    if (loading) return;
    setLoading(true);
    setError(undefined);

    try {
      const res = await fetch('/api/library/video-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [path] }),
      });
      const data = await res.json().catch(() => ({}));
      const found = data.urls?.[path];

      if (!found) throw new Error('영상을 불러올 수 없습니다.');
      setUrl(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : '영상을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (url) {
    return (
      <video
        src={url}
        // 미리보기 이미지가 있으면 첫 프레임을 받기 전에도 화면이 비지 않는다.
        poster={thumbUrl ?? undefined}
        controls
        autoPlay
        /*
         * 라이브러리 영상은 소리 없이 튼다.
         *
         * 동작을 보여주는 시연 영상이라 소리가 필요 없고, 촬영할 때 들어간
         * 주변 소음이 그대로 나가면 곤란하다. 헬스장에서 폰으로 열었을 때
         * 갑자기 소리가 나는 것도 막는다.
         *
         * 더불어 브라우저는 소리 있는 영상의 자동 재생을 막는다.
         * 음소거로 두면 autoPlay 가 실제로 동작한다.
         * 소리를 듣고 싶으면 재생기의 음량 버튼으로 켤 수 있다.
         */
        muted
        playsInline
        aria-label={title}
        className="aspect-video w-full rounded-xl border border-line bg-black object-contain"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={play}
      disabled={loading}
      aria-label={`${title} 재생`}
      className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2 transition-colors hover:border-sky-soft disabled:cursor-wait"
    >
      {thumbUrl && (
        <>
          {/* 서명된 임시 주소라 이미지 최적화 대상이 아니다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute inset-0 bg-shade/40 transition-colors group-hover:bg-shade/20" />
        </>
      )}

      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-sky text-white shadow-lg transition-transform group-hover:scale-110">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Play className="ml-0.5 h-6 w-6 fill-current" />
        )}
      </span>

      {error && (
        <span className="absolute inset-x-0 bottom-0 bg-red-950/80 px-3 py-2 text-xs text-red-200">
          {error}
        </span>
      )}
    </button>
  );
}
