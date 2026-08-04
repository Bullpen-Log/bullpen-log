'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  X,
} from 'lucide-react';
import {
  formatTime,
  useFrameDuration,
  type VideoWithFrameCallback,
} from '@/components/use-frame-duration';
import {
  DRAW_COLORS,
  DrawingToolbar,
  VideoCanvas,
  type Shape,
  type ToolKind,
} from '@/components/video-canvas';

const SPEEDS = [0.25, 0.5, 1] as const;

export function PitchVideoPlayer({
  src,
  label,
}: {
  src: string;
  label: string;
}) {
  const videoRef = useRef<VideoWithFrameCallback>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { frameDurationRef, fps } = useFrameDuration(videoRef);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(0.5);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  // 크게 보기. 화면 전체를 덮어 분석 공간을 넓힌다.
  const [expanded, setExpanded] = useState(false);

  // 영상 위에 기준선·각도를 그어 재는 기능
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<ToolKind>('tilt');
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [shapes, setShapes] = useState<Shape[]>([]);

  // 속도 변경을 실제 영상에 반영한다.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  // 크게 보는 동안에는 뒤 페이지가 스크롤되지 않게 하고, Esc로 닫는다.
  useEffect(() => {
    if (!expanded) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const stepFrame = useCallback(
    (direction: 1 | -1) => {
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
    },
    [frameDurationRef]
  );

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
      className={
        expanded
          ? 'fixed inset-0 z-[60] flex flex-col bg-ink focus:outline-none'
          : 'overflow-hidden rounded-xl border border-line bg-surface-2 focus-within:border-sky focus:outline-none focus-visible:border-sky focus-visible:ring-1 focus-visible:ring-sky'
      }
      onKeyDown={handleKeyDown}
      // Tab으로 이 영역에 들어와 화살표 키를 쓸 수 있게 한다.
      tabIndex={0}
      role="group"
      aria-label={`${label} 재생기`}
    >
      {/* 크게 보기일 때만 상단에 제목과 닫기를 둔다. */}
      {expanded && (
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{label}</span>
          <span className="hidden text-[11px] text-muted sm:inline">
            Esc 키로 닫기
          </span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="크게 보기 닫기"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 영상과 그림판을 겹쳐 둔다. 크게 보기에서는 남는 높이를 모두 쓴다. */}
      <div className={expanded ? 'relative min-h-0 flex-1' : 'relative'}>
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
          // block이 아니면 인라인 여백 때문에 캔버스가 영상보다 살짝 커져 좌표가 밀린다.
          className={`block w-full bg-black object-contain ${
            expanded ? 'h-full' : 'aspect-video'
          } ${drawing ? '' : 'cursor-pointer'}`}
          aria-label={label}
        />
        <VideoCanvas
          shapes={shapes}
          onCommit={(s) => setShapes((prev) => [...prev, s])}
          tool={tool}
          color={color}
          enabled={drawing}
          videoRef={videoRef}
        />
      </div>

      {drawing && (
        <DrawingToolbar
          tool={tool}
          onTool={setTool}
          color={color}
          onColor={setColor}
          onUndo={() => setShapes((prev) => prev.slice(0, -1))}
          onClear={() => setShapes([])}
          canUndo={shapes.length > 0}
        />
      )}

      {/* 진행 바 — 손가락으로 잡기 쉽도록 세로 여백을 넉넉히 준다. */}
      <div className="px-3 pt-2">
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
          className="h-6 w-full cursor-pointer accent-[#0ea5e9]"
        />
      </div>

      {/*
        조작부 — 좁은 화면에서는 글자를 빼고 터치 영역을 키운다.
        폭이 모자라면 속도 버튼이 아랫줄로 내려가도록 줄바꿈을 허용한다.
      */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 px-3 pb-3 pt-1 sm:gap-x-2.5">
        <button
          type="button"
          onClick={reset}
          aria-label="처음으로"
          title="처음으로"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-sky hover:text-sky"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? '일시정지' : '재생'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky text-white transition-colors hover:bg-sky-strong"
        >
          {playing ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          )}
        </button>

        {/* 프레임 이동 */}
        <div className="flex h-11 shrink-0 overflow-hidden rounded-lg border border-line">
          <button
            type="button"
            onClick={() => stepFrame(-1)}
            aria-label="이전 프레임"
            className="flex items-center gap-1 px-3 text-xs text-muted transition-colors hover:bg-surface hover:text-sky"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">이전 프레임</span>
          </button>
          <span className="w-px bg-line" />
          <button
            type="button"
            onClick={() => stepFrame(1)}
            aria-label="다음 프레임"
            className="flex items-center gap-1 px-3 text-xs text-muted transition-colors hover:bg-surface hover:text-sky"
          >
            <span className="hidden sm:inline">다음 프레임</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* 그리기 전환 */}
        <button
          type="button"
          onClick={() => setDrawing((v) => !v)}
          aria-pressed={drawing}
          title="영상 위에 선·각도 그리기"
          className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${
            drawing
              ? 'border-sky bg-sky/10 text-sky'
              : 'border-line text-muted hover:border-sky hover:text-sky'
          }`}
        >
          <Ruler className="h-4 w-4" />
          <span className="hidden sm:inline">측정</span>
        </button>

        {/* 크게 보기 */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-pressed={expanded}
          title={expanded ? '작게 보기 (Esc)' : '크게 보기'}
          aria-label={expanded ? '작게 보기' : '크게 보기'}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            expanded
              ? 'border-sky bg-sky/10 text-sky'
              : 'border-line text-muted hover:border-sky hover:text-sky'
          }`}
        >
          {expanded ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>

        {/* 재생 속도 */}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted lg:inline">재생 속도</span>
          <div className="flex h-11 shrink-0 overflow-hidden rounded-lg border border-line">
            {SPEEDS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`px-2 text-[11px] transition-colors sm:px-2.5 sm:text-xs ${
                  i > 0 ? 'border-l border-line' : ''
                } ${
                  speed === s
                    ? 'bg-sky font-semibold text-white'
                    : 'text-muted hover:bg-surface hover:text-ink'
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
