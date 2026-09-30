'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/** 프레임 정보를 못 읽었을 때 쓰는 기본값 (30fps 기준) */
export const DEFAULT_FRAME_DURATION = 1 / 30;

/** 브라우저마다 지원이 갈리는 API라 최소한의 타입만 직접 선언한다. */
type VideoFrameMeta = { mediaTime: number };
export type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, meta: VideoFrameMeta) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * 재생 중 연속한 두 프레임의 간격을 재서 실제 프레임 길이를 알아낸다.
 * 60fps로 찍은 영상도 정확히 한 프레임씩 넘길 수 있게 해준다.
 *
 * mediaTime 은 그 장면의 영상 속 시각이라, 두 장면의 차이는 재생 속도와 상관없이 한 장의 길이다. 예전에는 재생 속도로
 * 나눠서 기본 0.5배속에서 한 번 누르면 두 장씩(0.25배속은 네 장) 넘어갔고 'fps' 도 절반으로 보였다 — 릴리스 장면을
 * 맞추는 도구인데 한 장씩 맞출 수가 없었다. 브라우저가 장면을 건너뛰면 간격이 두 배 · 세 배로 오므로 지금까지 본 가장
 * 짧은 간격을 쓰고, 영상이 바뀌면(loadedmetadata) 처음부터 다시 잰다.
 *
 * 이동 계산에는 항상 최신 값이 필요해 ref로, 화면 표시에는 state로 함께 돌려준다.
 */
export function useFrameDuration(videoRef: RefObject<VideoWithFrameCallback | null>) {
  const frameDurationRef = useRef(DEFAULT_FRAME_DURATION);
  const lastFrameTimeRef = useRef<number | null>(null);
  const [fps, setFps] = useState(Math.round(1 / DEFAULT_FRAME_DURATION));

  useEffect(() => {
    const video = videoRef.current;
    if (!video?.requestVideoFrameCallback) return;

    let handle: number | undefined;
    let cancelled = false;
    /* 이 영상에서 본 가장 짧은 장면 간격 */
    let shortest = Infinity;

    const onFrame = (_now: number, meta: VideoFrameMeta) => {
      if (cancelled) return;
      const prev = lastFrameTimeRef.current;

      if (prev != null) {
        const delta = meta.mediaTime - prev;
        if (delta > 0.001 && delta < 0.2 && delta < shortest - 1e-4) {
          shortest = delta;
          frameDurationRef.current = delta;
          setFps(Math.round(1 / delta));
        }
      }
      lastFrameTimeRef.current = meta.mediaTime;

      handle = video.requestVideoFrameCallback?.(onFrame);
    };

    /* 다른 영상으로 바뀌면 처음부터 다시 잰다 */
    const onLoaded = () => {
      shortest = Infinity;
      lastFrameTimeRef.current = null;
      frameDurationRef.current = DEFAULT_FRAME_DURATION;
      setFps(Math.round(1 / DEFAULT_FRAME_DURATION));
    };
    video.addEventListener('loadedmetadata', onLoaded);

    handle = video.requestVideoFrameCallback(onFrame);

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', onLoaded);
      if (handle != null) video.cancelVideoFrameCallback?.(handle);
    };
  }, [videoRef]);

  return { frameDurationRef, fps };
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00.00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
