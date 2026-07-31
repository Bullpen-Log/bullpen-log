'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';

const SPEEDS = [0.25, 0.5, 1] as const;

/** 프레임 정보를 못 읽었을 때 쓰는 기본값 (30fps 기준) */
const DEFAULT_FRAME_DURATION = 1 / 30;

/** 브라우저마다 지원이 갈리는 API라 최소한의 타입만 직접 선언한다. */
type VideoFrameMeta = { mediaTime: number };
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, meta: VideoFrameMeta) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00.00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function PitchVideoPlayer({
  src,
  label,
}: {
  src: string;
  label: string;
}) {
  const videoRef = useRef<VideoWithFrameCallback>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameDurationRef = useRef(DEFAULT_FRAME_DURATION);
  const lastFrameTimeRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(0.5);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fps, setFps] = useState(Math.round(1 / DEFAULT_FRAME_DURATION));

  /**
   * 재생 중 연속한 두 프레임의 간격을 재서 실제 프레임 길이를 알아낸다.
   * 60fps로 찍은 영상도 정확히 한 프레임씩 넘길 수 있다.
   */
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
  }, []);

  // 속도 변경을 실제 영상에 반영한다.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const stepFrame = useCallback((direction: 1 | -1) => {
    const video = videoRef.current;
    if (!video) return;

    // 프레임 이동은 멈춘 상태에서만 의미가 있다.
    video.pause();
    const step = frameDurationRef.current * direction;
    const next = Math.min(
      Math.max(video.currentTime + step, 0),
      video.duration || Infinity
    );
    video.currentTime = next;
    setCurrent(next);
  }, []);

  const reset = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setCurrent(0);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 진행 바에 포커스가 있을 때는 화살표가 그쪽 동작이어야 한다.
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepFrame(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepFrame(1);
    } else if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      togglePlay();
    }
  };

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border border-line bg-surface-2 focus-within:border-gold focus:outline-none focus-visible:border-gold focus-visible:ring-1 focus-visible:ring-gold"
      onKeyDown={handleKeyDown}
      // Tab으로 이 영역에 들어와 화살표 키를 쓸 수 있게 한다.
      tabIndex={0}
      role="group"
      aria-label={`${label} 재생기`}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        onClick={() => {
          // 영상을 클릭한 뒤 바로 화살표 키를 쓸 수 있도록 포커스를 옮긴다.
          containerRef.current?.focus();
          togglePlay();
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          e.currentTarget.playbackRate = speed;
        }}
        className="aspect-video w-full cursor-pointer bg-black object-contain"
        aria-label={label}
      />

      {/* 진행 바 */}
      <div className="px-3 pt-3">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={current}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (videoRef.current) videoRef.current.currentTime = v;
            setCurrent(v);
          }}
          aria-label="재생 위치"
          className="w-full accent-[#c9a96a]"
        />
      </div>

      {/* 조작부 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-3 pb-3 pt-1">
        <button
          type="button"
          onClick={reset}
          aria-label="처음으로"
          title="처음으로"
          className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-gold hover:text-gold"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? '일시정지' : '재생'}
          className="rounded-lg bg-gold p-2 text-ink transition-colors hover:bg-gold-bright"
        >
          {playing ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          )}
        </button>

        {/* 프레임 이동 */}
        <div className="flex overflow-hidden rounded-lg border border-line">
          <button
            type="button"
            onClick={() => stepFrame(-1)}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-muted transition-colors hover:bg-surface hover:text-gold"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            이전 프레임
          </button>
          <span className="w-px bg-line" />
          <button
            type="button"
            onClick={() => stepFrame(1)}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-muted transition-colors hover:bg-surface hover:text-gold"
          >
            다음 프레임
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 재생 속도 */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted">재생 속도</span>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {SPEEDS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`px-2.5 py-2 text-xs transition-colors ${
                  i > 0 ? 'border-l border-line' : ''
                } ${
                  speed === s
                    ? 'bg-gold font-semibold text-ink'
                    : 'text-muted hover:bg-surface hover:text-cream'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 시간 · 프레임 정보 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2 text-[11px] text-muted">
        <span className="tabular-nums">
          {formatTime(current)} / {formatTime(duration)}
        </span>
        <span className="text-line-strong">·</span>
        <span className="tabular-nums">약 {fps}fps</span>
        <span className="ml-auto hidden sm:inline">
          ← → 프레임 이동 · 스페이스 재생/정지
        </span>
      </div>
    </div>
  );
}
