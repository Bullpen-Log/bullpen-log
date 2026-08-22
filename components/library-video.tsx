'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { referenceEmbedUrl, referenceWatchUrl } from '@/lib/reference-video';

/**
 * 라이브러리에 올린 영상 재생기.
 *
 * 목록에 영상이 여러 개 있어도 누르기 전에는 파일을 내려받지 않는다.
 * (한 화면에 20개가 있으면 20개를 미리 받아버리기 때문)
 * 누른 순간에만 재생 주소를 받아와 재생한다.
 */
export function LibraryVideo({
  path,
  referenceVideoId,
  title,
  thumbUrl,
  isAdmin = false,
}: {
  /** 우리 저장소에 올린 영상 경로. 참고 영상이면 없다. */
  path?: string | null;
  /**
   * 아직 촬영하지 않아 유튜브 참고 영상으로 대신하는 경우의 영상 ID.
   *
   * 이 값이 있으면 유튜브 재생기를 그대로 띄운다. 영상을 우리 쪽으로
   * 가져오지 않고 가리키기만 한다. (lib/reference-video.ts 참고)
   */
  referenceVideoId?: string | null;
  title: string;
  /** 재생 전에 보여줄 이미지. 없으면 빈 화면에 재생 버튼만 나온다. */
  thumbUrl?: string | null;
  /**
   * 관리자에게만 재생 막대를 보여준다.
   *
   * 재생 막대에는 음량 버튼이 딸려 있는데, 브라우저가 통째로 붙여주는 것이라
   * 음량만 빼는 방법이 없다. 그래서 관리자가 아니면 막대 자체를 감춘다.
   * 관리자는 올린 영상을 점검해야 하므로 소리를 켤 수 있어야 한다.
   */
  isAdmin?: boolean;
}) {
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  /*
   * 참고 영상은 유튜브 재생기를 그대로 띄운다.
   *
   * 누르기 전에는 미리보기 이미지만 두고 재생기를 심지 않는다. 목록에
   * 스무 개가 있으면 유튜브 창이 스무 개 뜨는 셈이라 화면이 크게 느려진다.
   */
  const [showEmbed, setShowEmbed] = useState(false);

  if (referenceVideoId) {
    if (showEmbed) {
      return (
        <iframe
          src={referenceEmbedUrl(referenceVideoId)}
          title={title}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full rounded-xl border border-line bg-black"
        />
      );
    }
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowEmbed(true)}
          aria-label={`${title} 참고 영상 재생`}
          className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-warn-line bg-surface-2 transition-colors hover:border-sky-soft"
        >
          {thumbUrl && (
            // 유튜브가 공개하는 주소라 이미지 최적화 대상이 아니다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <span className="absolute inset-0 bg-shade/40 transition-colors group-hover:bg-shade/20" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-sky text-white shadow-lg transition-transform group-hover:scale-110">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
          <span className="absolute left-2 top-2 rounded-md bg-warn-bg px-2 py-1 text-[11px] font-semibold text-warn">
            참고 영상
          </span>
        </button>
        <a
          href={referenceWatchUrl(referenceVideoId)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-muted underline-offset-2 hover:underline"
        >
          유튜브에서 열기
        </a>
      </div>
    );
  }

  const play = async () => {
    if (loading || !path) return;
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
        // 관리자만 재생 막대(=음량 버튼)를 본다. 위 isAdmin 설명 참고.
        controls={isAdmin}
        // 막대가 없으면 멈출 방법도 없으므로, 짧은 시연 영상처럼 계속 돌린다.
        loop={!isAdmin}
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
