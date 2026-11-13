'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Play } from '@/components/icon';
import { OwnedExercisePlayer } from '@/components/exercise-video/owned-player';
import { YouTubeExercisePlayer } from '@/components/exercise-video/youtube-player';
import { YT_ID } from '@/lib/exercise-video-state';
import { referenceWatchUrl, videoFrameClass } from '@/lib/reference-video';
import { libraryVideoFromPhone } from '@/lib/local-video';

/**
 * 라이브러리에 올린 영상 재생기.
 *
 * 목록에 영상이 여러 개 있어도 누르기 전에는 파일을 내려받지 않는다.
 * (한 화면에 20개가 있으면 20개를 미리 받아버리기 때문)
 * 누른 순간에만 재생 주소를 받아와 재생한다.
 */
/** 재생 주소 받기를 기다리는 한도 — 폰 다리 · 서버 주소 모두 포함. */
const URL_WAIT_MS = 20_000;

export function LibraryVideo(props: LibraryVideoProps) {
  return <LibraryVideoSource key={`${props.path ?? ""}|${props.referenceVideoId ?? ""}`} {...props} />;
}

type LibraryVideoProps = {
  path?: string | null; referenceVideoId?: string | null; title: string; thumbUrl?: string | null; aspectRatio?: number | null; isAdmin?: boolean;
};

function LibraryVideoSource({
  path,
  referenceVideoId,
  title,
  thumbUrl,
  aspectRatio,
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
   * 영상의 가로세로 비율. 없으면 가로(16:9)로 본다.
   *
   * 세로로 찍은 쇼츠를 가로 틀에 넣으면 좌우가 검게 막히고 영상이 손바닥만
   * 해진다. 등록할 때 재 둔 값으로 틀을 바꾼다.
   */
  aspectRatio?: number | null;
  /**
   * 관리자에게만 '참고 영상' 표시와 '유튜브에서 열기'를 보인다.
   * 재생 방식(반복 · 조작부)은 VP01 부터 관리자 · 일반 사용자가 같다.
   */
  isAdmin?: boolean;
}) {
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  /* 주소 받기 세대 — 늦게 끝난 받기가 새 요청(다시 불러오기)을 덮지 않게. 해제 뒤에 온 blob 은 놓아 준다 */
  const gen = useRef(0);
  useEffect(() => () => {
    gen.current += 1;
  }, []);

  /* 폰에서 꺼낸 영상(blob:)은 다 보면 놓아 준다 — 운동 목록을 넘기며 여러 개를 틀어도 메모리에 쌓이지 않게 */
  useEffect(() => {
    if (!url?.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  /*
   * 참고 영상은 유튜브 재생기를 그대로 띄운다.
   *
   * 누르기 전에는 미리보기 이미지만 두고 재생기를 심지 않는다. 목록에
   * 스무 개가 있으면 유튜브 창이 스무 개 뜨는 셈이라 화면이 크게 느려진다.
   */
  const [showEmbed, setShowEmbed] = useState(false);

  /* 세로 영상이면 세로 틀. 자세한 규칙은 lib/reference-video.ts */
  const frame = videoFrameClass(aspectRatio);

  if (!path && !referenceVideoId) return <div className={`flex ${frame} items-center justify-center rounded-xl bg-surface-2 p-4 text-center text-sm text-muted`} role="status">아직 재생할 영상이 없어요.</div>;

  if (referenceVideoId) {
    const validId = YT_ID.test(referenceVideoId);
    if (showEmbed && validId) {
      return <YouTubeExercisePlayer videoId={referenceVideoId} title={title} frame={frame} />;
    }
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowEmbed(true)}
          aria-label={`${title} 영상 재생`}
          className={`group relative flex ${frame} items-center justify-center overflow-hidden rounded-xl bg-surface-2`}
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
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-transform group-hover:scale-105">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
          {/*
            '참고 영상' 표시 · '유튜브에서 열기'는 관리자에게만 — 촬영 상황은 쓰는 사람이 알 일이 아니고, 밑줄 링크는 누르면
            앱 밖(유튜브 · 사파리)으로 나갔다(2026-10-04 '앱 안에 머물기'). 재생은 이 자리에서 그대로 된다.
          */}
          {isAdmin && (
            <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              참고 영상
            </span>
          )}
          {/* 영상 번호가 형식에 맞지 않으면 재생기를 띄우지 않는다 — 누르고 아무 일도 없지 않게 까닭을 보인다 */}
          {showEmbed && !validId && (
            <span className="absolute inset-x-0 bottom-0 bg-red-950/80 px-3 py-2 text-xs text-red-200">
              이 영상은 재생할 수 없어요.
            </span>
          )}
        </button>
        {isAdmin && (
          <a
            href={referenceWatchUrl(referenceVideoId)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-muted underline-offset-2 hover:underline"
          >
            유튜브에서 열기
          </a>
        )}
      </div>
    );
  }

  const play = async (force = false) => {
    if ((loading && !force) || !path) return;
    const mine = ++gen.current;
    setLoading(true);
    setError(undefined);
    /* 주소 받기 제한 시간 — 신호가 멎어 영영 안 끝나면 단추가 잠긴 채 남았다. 넘기면 이 요청을 버리고(세대 올림) 다시 누를 수 있게 */
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      if (mine !== gen.current) return;
      gen.current += 1;
      abort.abort();
      setError('영상 주소를 받지 못했어요. 다시 눌러 주세요.');
      setLoading(false);
    }, URL_WAIT_MS);

    try {
      let signed: Promise<string> | undefined;
      const signedUrl = () =>
        (signed ??= (async () => {
          const res = await fetch('/api/library/video-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: [path], small: true }),
            signal: abort.signal,
          });
          const data = await res.json().catch(() => ({}));
          const found = data.urls?.[path];
          if (!found) throw new Error('영상을 불러올 수 없어요.');
          return found as string;
        })());

      /* 아이폰 앱이면 앱 안 · 폰에 받아 둔 영상으로(서버에서 다시 받지 않는다). 안 되면 서버에서 바로 */
      const local = await libraryVideoFromPhone(path, signedUrl);
      const got = local ?? (await signedUrl());
      if (mine !== gen.current) {
        if (got.startsWith('blob:')) URL.revokeObjectURL(got);
        return;
      }
      setUrl(got);
    } catch (err) {
      if (mine === gen.current) setError(err instanceof Error ? err.message : '영상을 불러올 수 없어요.');
    } finally {
      window.clearTimeout(timer);
      if (mine === gen.current) setLoading(false);
    }
  };

  if (url) {
    return (
      <OwnedExercisePlayer
        key={url}
        url={url}
        poster={thumbUrl}
        title={title}
        frame={frame}
        onRetry={() => {
          /* 주소가 만료됐을 수 있어 새로 받는다(이 영상만 — 운동 입력 · 메모는 그대로) */
          setUrl(undefined);
          void play(true);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => void play()}
      disabled={loading}
      aria-label={`${title} 재생`}
      className={`group relative flex ${frame} items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2 transition-colors hover:border-sky-soft disabled:cursor-wait`}
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
