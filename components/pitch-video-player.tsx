'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  MoveHorizontal,
  MoveVertical,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Slash,
  Spline,
  Triangle,
  Undo2,
} from 'lucide-react';
import {
  formatTime,
  useFrameDuration,
  type VideoWithFrameCallback,
} from '@/components/use-frame-duration';
import { VideoCanvas, type Shape, type ToolKind } from '@/components/video-canvas';

const SPEEDS = [0.25, 0.5, 1] as const;

const TOOLS: { kind: ToolKind; label: string; Icon: typeof Slash }[] = [
  { kind: 'line', label: '직선', Icon: Slash },
  { kind: 'angle', label: '각도', Icon: Triangle },
  { kind: 'vertical', label: '수직선', Icon: MoveVertical },
  { kind: 'horizontal', label: '수평선', Icon: MoveHorizontal },
  { kind: 'free', label: '자유선', Icon: Spline },
];

const COLORS = ['#c9a96a', '#ef4444', '#38bdf8', '#f4f2ee'];

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

  // 영상 위에 선·각도를 그리는 기능
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<ToolKind>('line');
  const [color, setColor] = useState(COLORS[0]);
  const [shapes, setShapes] = useState<Shape[]>([]);

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
      className="overflow-hidden rounded-xl border border-line bg-surface-2 focus-within:border-gold focus:outline-none focus-visible:border-gold focus-visible:ring-1 focus-visible:ring-gold"
      onKeyDown={handleKeyDown}
      // Tab으로 이 영역에 들어와 화살표 키를 쓸 수 있게 한다.
      tabIndex={0}
      role="group"
      aria-label={`${label} 재생기`}
    >
      {/* 영상과 그림판을 겹쳐 둔다. */}
      <div className="relative">
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
          className={`aspect-video w-full bg-black object-contain ${
            drawing ? '' : 'cursor-pointer'
          }`}
          aria-label={label}
        />
        <VideoCanvas
          shapes={shapes}
          onCommit={(s) => setShapes((prev) => [...prev, s])}
          tool={tool}
          color={color}
          enabled={drawing}
        />
      </div>

      {/* 그리기 도구 */}
      {drawing && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line bg-surface px-3 py-2.5">
          <div className="flex overflow-hidden rounded-lg border border-line">
            {TOOLS.map((t, i) => (
              <button
                key={t.kind}
                type="button"
                onClick={() => setTool(t.kind)}
                aria-pressed={tool === t.kind}
                title={t.label}
                aria-label={t.label}
                className={`flex h-10 w-10 items-center justify-center transition-colors ${
                  i > 0 ? 'border-l border-line' : ''
                } ${
                  tool === t.kind
                    ? 'bg-gold text-ink'
                    : 'text-muted hover:bg-surface-2 hover:text-cream'
                }`}
              >
                <t.Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                aria-label={`색상 ${c}`}
                style={{ backgroundColor: c }}
                className={`h-7 w-7 rounded-full transition-transform ${
                  color === c
                    ? 'scale-110 ring-2 ring-cream ring-offset-2 ring-offset-surface'
                    : 'opacity-70 hover:opacity-100'
                }`}
              />
            ))}
          </div>

          <div className="ml-auto flex gap-1.5">
            <button
              type="button"
              onClick={() => setShapes((prev) => prev.slice(0, -1))}
              disabled={shapes.length === 0}
              aria-label="되돌리기"
              title="되돌리기"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-gold hover:text-gold disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShapes([])}
              disabled={shapes.length === 0}
              aria-label="전체 지우기"
              title="전체 지우기"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-red-800 hover:text-red-400 disabled:opacity-40"
            >
              <Eraser className="h-4 w-4" />
            </button>
          </div>

          <p className="w-full text-[11px] text-muted">
            {tool === 'angle'
              ? '세 곳을 차례로 누르세요. 두 번째로 누른 곳이 각의 꼭짓점이 되고 각도가 표시됩니다.'
              : tool === 'vertical' || tool === 'horizontal'
                ? '기준선을 놓을 위치를 누르세요.'
                : '드래그해서 그립니다.'}
          </p>
        </div>
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
          className="h-6 w-full cursor-pointer accent-[#c9a96a]"
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-gold hover:text-gold"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? '일시정지' : '재생'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gold text-ink transition-colors hover:bg-gold-bright"
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
            className="flex items-center gap-1 px-3 text-xs text-muted transition-colors hover:bg-surface hover:text-gold"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">이전 프레임</span>
          </button>
          <span className="w-px bg-line" />
          <button
            type="button"
            onClick={() => stepFrame(1)}
            aria-label="다음 프레임"
            className="flex items-center gap-1 px-3 text-xs text-muted transition-colors hover:bg-surface hover:text-gold"
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
              ? 'border-gold bg-gold/10 text-gold'
              : 'border-line text-muted hover:border-gold hover:text-gold'
          }`}
        >
          <Pencil className="h-4 w-4" />
          <span className="hidden sm:inline">그리기</span>
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
