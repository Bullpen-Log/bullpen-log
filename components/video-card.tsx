'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Play } from 'lucide-react';

export function VideoPlayer({
  embedUrl,
  thumbnailUrl,
  title,
}: {
  embedUrl: string | null;
  thumbnailUrl: string | null;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);
  // 썸네일을 불러오지 못하면(삭제된 영상 등) 배경만 보여준다.
  const [thumbFailed, setThumbFailed] = useState(false);

  if (!embedUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-line bg-surface-2 text-xs text-muted">
        영상을 불러올 수 없습니다
      </div>
    );
  }

  if (playing) {
    return (
      <div className="aspect-video overflow-hidden rounded-xl border border-line bg-black">
        <iframe
          src={`${embedUrl}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`${title} 영상 재생`}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-line bg-surface-2"
    >
      {thumbnailUrl && !thumbFailed && (
        <Image
          src={thumbnailUrl}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 400px"
          onError={() => setThumbFailed(true)}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
      <span className="absolute inset-0 bg-ink/40 transition-colors group-hover:bg-ink/20" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-lg transition-transform group-hover:scale-110">
          <Play className="ml-0.5 h-6 w-6 fill-current" />
        </span>
      </span>
    </button>
  );
}
