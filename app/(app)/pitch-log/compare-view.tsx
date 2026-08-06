'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Flag,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  Undo2,
  X,
} from 'lucide-react';
import { EmptyState } from '@/components/ui';
import {
  formatTime,
  useFrameDuration,
  type VideoWithFrameCallback,
} from '@/components/use-frame-duration';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import {
  DRAW_COLORS,
  DrawingToolbar,
  VideoCanvas,
  type Shape,
  type ToolKind,
} from '@/components/video-canvas';
import { ClipPicker } from './clip-picker';

const SPEEDS = [0.25, 0.5, 1] as const;

export type ClipOption = {
  id: string;
  date: string;
  /** 저장소 경로. 재생 주소는 고른 시점에 따로 받아온다. */
  path: string;
  label: string;
  /** 그날의 기록 요약 (구속·투구수 등) */
  summary: string;
};

/**
 * 한쪽 화면. 모바일에서도 두 영상이 동시에 보이도록
 * 영상 위에 라벨을 얹고 조작부는 아이콘만 남겼다.
 */
function ComparePane({
  side,
  clips,
  selectedId,
  onSelect,
  videoRef,
  mark,
  onMark,
  url,
  loading,
  drawing,
  tool,
  color,
  shapes,
  onShapes,
  expanded,
}: {
  side: 'A' | 'B';
  clips: ClipOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  videoRef: React.RefObject<VideoWithFrameCallback | null>;
  mark: number;
  onMark: () => void;
  url?: string;
  loading: boolean;
  drawing: boolean;
  tool: ToolKind;
  color: string;
  shapes: Shape[];
  onShapes: (next: (prev: Shape[]) => Shape[]) => void;
  expanded: boolean;
}) {
  const { frameDurationRef } = useFrameDuration(videoRef);
  const [current, setCurrent] = useState(0);

  const clip = clips.find((c) => c.id === selectedId);

  // 기준점을 맞출 때만 쓰는 개별 프레임 이동
  const nudge = (direction: 1 | -1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const next = Math.min(
      Math.max(video.currentTime + frameDurationRef.current * direction, 0),
      video.duration || Infinity
    );
    video.currentTime = next;
    setCurrent(next);
  };

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface-2">
      {/* 영상 선택 */}
      <div className="flex items-center gap-1.5 border-b border-line p-1.5 sm:gap-2 sm:p-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold ${
            side === 'A' ? 'bg-sky text-white' : 'bg-white text-ink border border-line'
          }`}
        >
          {side}
        </span>
        <ClipPicker
          clips={clips}
          selectedId={selectedId}
          onSelect={onSelect}
          side={side}
        />
      </div>

      <div className={expanded ? 'relative min-h-0 flex-1' : 'relative'}>
        <video
          ref={videoRef}
          src={url}
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          // 세로/가로 영상 모두 무난한 정사각형으로 두고, 넓어지면 16:9로 바꾼다.
          // block이 아니면 인라인 여백 때문에 캔버스가 영상보다 살짝 커져 좌표가 밀린다.
          className={`block w-full bg-black object-contain ${
            expanded ? 'h-full' : 'aspect-square sm:aspect-video'
          }`}
          aria-label={`${side}면 영상`}
        />
        <VideoCanvas
          shapes={shapes}
          onCommit={(s) => onShapes((prev) => [...prev, s])}
          tool={tool}
          color={color}
          enabled={drawing}
          videoRef={videoRef}
        />
        {!url && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
            {loading ? '불러오는 중…' : '영상을 선택하세요'}
          </p>
        )}
      </div>

      {/* 측정 중에는 화면별로 되돌리기·지우기를 둔다. */}
      {drawing && (
        <div className="flex items-center gap-1.5 border-t border-line px-2 py-1.5">
          <span className="text-[10px] text-muted">{side}면 측정 {shapes.length}</span>
          <button
            type="button"
            onClick={() => onShapes((prev) => prev.slice(0, -1))}
            disabled={shapes.length === 0}
            aria-label={`${side}면 되돌리기`}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-sky hover:text-sky disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onShapes(() => [])}
            disabled={shapes.length === 0}
            aria-label={`${side}면 전체 지우기`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-40"
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {clip && (
        <p className="truncate border-t border-line px-2 py-1.5 text-[10px] text-muted sm:text-[11px]">
          {clip.summary}
        </p>
      )}

      {/* 기준점 맞추기 — 좁은 화면에서는 아이콘만 */}
      <div className="flex items-center gap-1 border-t border-line p-1.5">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label={`${side}면 한 프레임 뒤로`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-sky hover:text-sky"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label={`${side}면 한 프레임 앞으로`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-sky hover:text-sky"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onMark}
          title="지금 화면을 기준점으로 지정"
          aria-label={`${side}면 기준점 지정`}
          className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-line text-[11px] text-muted transition-colors hover:border-sky hover:text-sky"
        >
          <Flag className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">기준점</span>
        </button>
      </div>

      <div className="border-t border-line px-2 py-1 text-[10px] tabular-nums text-muted">
        {formatTime(current)} · 기준 {formatTime(mark)}
      </div>
    </div>
  );
}

export function CompareView({ clips }: { clips: ClipOption[] }) {
  const videoA = useRef<VideoWithFrameCallback>(null);
  const videoB = useRef<VideoWithFrameCallback>(null);

  // 기본값: 가장 예전 영상과 가장 최근 영상을 비교
  const [idA, setIdA] = useState(clips[0]?.id ?? '');
  const [idB, setIdB] = useState(clips.at(-1)?.id ?? '');

  const [markA, setMarkA] = useState(0);
  const [markB, setMarkB] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(0.5);

  // 크게 보기. 두 영상을 나란히 보려면 공간이 넓을수록 좋다.
  const [expanded, setExpanded] = useState(false);

  // 측정 도구는 양쪽이 함께 쓰고, 그은 선은 화면별로 따로 갖는다.
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<ToolKind>('tilt');
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [shapesA, setShapesA] = useState<Shape[]>([]);
  const [shapesB, setShapesB] = useState<Shape[]>([]);

  const frameA = useFrameDuration(videoA).frameDurationRef;
  const frameB = useFrameDuration(videoB).frameDurationRef;

  // 지금 고른 두 영상의 재생 주소만 받아온다.
  const clipA = clips.find((c) => c.id === idA);
  const clipB = clips.find((c) => c.id === idB);
  const { urls, loading, ready } = usePlaybackUrls([clipA?.path, clipB?.path]);

  useEffect(() => {
    if (videoA.current) videoA.current.playbackRate = speed;
    if (videoB.current) videoB.current.playbackRate = speed;
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

  // 영상을 바꾸면 기준점도 함께 처음으로 되돌린다.
  const selectA = (id: string) => {
    setIdA(id);
    setMarkA(0);
  };
  const selectB = (id: string) => {
    setIdB(id);
    setMarkB(0);
  };

  const bothPlay = useCallback(() => {
    const a = videoA.current;
    const b = videoB.current;
    if (!a || !b) return;

    if (a.paused || b.paused) {
      a.playbackRate = speed;
      b.playbackRate = speed;
      void a.play().catch(() => {});
      void b.play().catch(() => {});
      setPlaying(true);
    } else {
      a.pause();
      b.pause();
      setPlaying(false);
    }
  }, [speed]);

  /** 두 영상을 동시에 한 프레임씩 움직인다. 벌어진 간격은 그대로 유지된다. */
  const stepBoth = (direction: 1 | -1) => {
    for (const [ref, frame] of [
      [videoA, frameA],
      [videoB, frameB],
    ] as const) {
      const video = ref.current;
      if (!video) continue;
      video.pause();
      const next = Math.min(
        Math.max(video.currentTime + frame.current * direction, 0),
        video.duration || Infinity
      );
      video.currentTime = next;
    }
    setPlaying(false);
  };

  /** 각자 지정해둔 기준점으로 되돌린다. */
  const resetToMarks = () => {
    if (videoA.current) {
      videoA.current.pause();
      videoA.current.currentTime = markA;
    }
    if (videoB.current) {
      videoB.current.pause();
      videoB.current.currentTime = markB;
    }
    setPlaying(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepBoth(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepBoth(1);
    } else if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      bothPlay();
    }
  };

  if (clips.length < 2) {
    return (
      <EmptyState
        title="비교하려면 영상이 2개 이상 필요합니다"
        description="서로 다른 날짜에 투구 영상을 하나씩 더 올리면, 예전 폼과 지금 폼을 나란히 놓고 비교할 수 있습니다."
      />
    );
  }

  return (
    <div
      className={
        expanded
          ? 'fixed inset-0 z-[60] flex flex-col gap-2 bg-shade p-2 focus:outline-none'
          : 'space-y-4'
      }
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="group"
      aria-label="2분할 비교 재생기"
    >
      {expanded && (
        <div className="flex shrink-0 items-center gap-3 px-1">
          <span className="text-sm text-ink">2분할 비교</span>
          <span className="hidden text-[11px] text-muted sm:inline">
            Esc 키로 닫기
          </span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="크게 보기 닫기"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* 측정 도구 — 양쪽 화면에 공통으로 적용된다. */}
      {drawing && (
        <div className="overflow-hidden rounded-xl border border-line">
          <DrawingToolbar
            tool={tool}
            onTool={setTool}
            color={color}
            onColor={setColor}
            onUndo={() => {
              setShapesA((p) => p.slice(0, -1));
              setShapesB((p) => p.slice(0, -1));
            }}
            onClear={() => {
              setShapesA([]);
              setShapesB([]);
            }}
            canUndo={shapesA.length > 0 || shapesB.length > 0}
          />
        </div>
      )}

      {/* 좁은 화면에서도 둘을 동시에 봐야 비교가 되므로 항상 좌우로 둔다. */}
      <div
        className={`grid grid-cols-2 gap-2 sm:gap-4 ${
          expanded ? 'min-h-0 flex-1' : ''
        }`}
      >
        <ComparePane
          side="A"
          clips={clips}
          selectedId={idA}
          onSelect={selectA}
          videoRef={videoA}
          mark={markA}
          onMark={() => setMarkA(videoA.current?.currentTime ?? 0)}
          url={clipA ? urls[clipA.path] : undefined}
          loading={loading || !ready}
          drawing={drawing}
          tool={tool}
          color={color}
          shapes={shapesA}
          onShapes={setShapesA}
          expanded={expanded}
        />
        <ComparePane
          side="B"
          clips={clips}
          selectedId={idB}
          onSelect={selectB}
          videoRef={videoB}
          mark={markB}
          onMark={() => setMarkB(videoB.current?.currentTime ?? 0)}
          url={clipB ? urls[clipB.path] : undefined}
          loading={loading || !ready}
          drawing={drawing}
          tool={tool}
          color={color}
          shapes={shapesB}
          onShapes={setShapesB}
          expanded={expanded}
        />
      </div>

      {/*
        공용 조작부 — 스크롤해도 항상 손이 닿도록 아래에 붙여둔다.
        모바일 하단 탭(약 3.25rem) 위에 오도록 위치를 잡는다.
      */}
      <div
        className={`z-30 rounded-xl border border-sky-soft/50 bg-shade/95 p-2 backdrop-blur-xl sm:p-3 ${
          expanded
            ? 'shrink-0'
            : 'sticky bottom-[calc(3rem_+_env(safe-area-inset-bottom))] lg:bottom-4'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 sm:gap-x-3">
          <button
            type="button"
            onClick={resetToMarks}
            aria-label="두 영상을 기준점으로"
            title="두 영상을 각자의 기준점으로"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={bothPlay}
            aria-label={playing ? '둘 다 정지' : '둘 다 재생'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky text-white transition-colors hover:bg-sky-strong"
          >
            {playing ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            )}
          </button>

          <div className="flex h-11 shrink-0 overflow-hidden rounded-lg border border-line">
            <button
              type="button"
              onClick={() => stepBoth(-1)}
              aria-label="두 영상 이전 프레임"
              className="flex items-center gap-1 px-3 text-xs text-muted transition-colors hover:bg-surface hover:text-sky"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">이전</span>
            </button>
            <span className="w-px bg-line" />
            <button
              type="button"
              onClick={() => stepBoth(1)}
              aria-label="두 영상 다음 프레임"
              className="flex items-center gap-1 px-3 text-xs text-muted transition-colors hover:bg-surface hover:text-sky"
            >
              <span className="hidden sm:inline">다음</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setDrawing((v) => !v)}
            aria-pressed={drawing}
            title="영상 위에 기준선·각도 긋기"
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${
              drawing
                ? 'border-sky bg-sky/10 text-sky'
                : 'border-line text-muted hover:border-sky hover:text-sky'
            }`}
          >
            <Ruler className="h-4 w-4" />
            <span className="hidden sm:inline">측정</span>
          </button>

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

          <div className="ml-auto flex h-11 shrink-0 overflow-hidden rounded-lg border border-line">
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

      <details
        className={`rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted ${
          expanded ? 'hidden' : ''
        }`}
      >
        <summary className="cursor-pointer font-medium text-ink">쓰는 법</summary>
        <p className="mt-2 leading-relaxed">
          각 화면의 <strong className="text-ink">◀ ▶</strong>로 두 영상을 같은
          동작(예: 앞발 착지 순간)에 맞춘 뒤{' '}
          <strong className="text-ink">기준점</strong>을 누르세요. 그다음 아래 공용
          버튼으로 함께 넘기면 같은 시점끼리 비교됩니다. 폰을 가로로 눕히면 더 크게
          볼 수 있습니다.
        </p>
      </details>
    </div>
  );
}
