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

    const onFrame = (_now: number, meta: VideoFrameMeta) => {
      if (cancelled) return;
      const prev = lastFrameTimeRef.current;

      if (prev != null) {
        const delta = meta.mediaTime - prev;
        // 재생 속도 배율을 걷어내야 실제 프레임 간격이 나온다.
        const normalized = delta / (video.playbackRate || 1);
        if (normalized > 0.001 && normalized < 0.2) {
          frameDurationRef.current = normalized;
          setFps(Math.round(1 / normalized));
        }
      }
      lastFrameTimeRef.current = meta.mediaTime;

      handle = video.requestVideoFrameCallback?.(onFrame);
    };

    handle = video.requestVideoFrameCallback(onFrame);

    return () => {
      cancelled = true;
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
