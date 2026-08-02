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
}: {
  path: string;
  title: string;
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
        controls
        autoPlay
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
      className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2 transition-colors hover:border-gold-dim disabled:cursor-wait"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-lg transition-transform group-hover:scale-110">
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
