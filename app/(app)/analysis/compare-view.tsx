'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { EmptyState, Select } from '@/components/ui';
import {
  formatTime,
  useFrameDuration,
  type VideoWithFrameCallback,
} from '@/components/use-frame-duration';

const SPEEDS = [0.25, 0.5, 1] as const;

export type ClipOption = {
  id: string;
  date: string;
  url: string;
  label: string;
  /** 그날의 기록 요약 (구속·투구수 등) */
  summary: string;
};

/** 한쪽 화면. 영상 선택과 기준점 맞추기를 각자 담당한다. */
function ComparePane({
  side,
  clips,
  selectedId,
  onSelect,
  videoRef,
  mark,
  onMark,
}: {
  side: 'A' | 'B';
  clips: ClipOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  videoRef: React.RefObject<VideoWithFrameCallback | null>;
  mark: number;
  onMark: () => void;
}) {
  const { frameDurationRef, fps } = useFrameDuration(videoRef);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

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
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface-2">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold ${
            side === 'A' ? 'bg-gold text-ink' : 'bg-cream/80 text-ink'
          }`}
        >
          {side}
        </span>
        <Select
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          aria-label={`${side}면 영상 선택`}
          className="min-w-0 flex-1 px-3 py-2 text-xs"
        >
          {clips.map((c) => (
            <option key={c.id} value={c.id}>
              {c.date} · {c.label}
            </option>
          ))}
        </Select>
      </div>

      <video
        ref={videoRef}
        src={clip?.url}
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        className="aspect-video w-full bg-black object-contain"
        aria-label={`${side}면 영상`}
      />

      {clip && (
        <p className="border-b border-line px-3 py-2 text-[11px] text-muted">
          {clip.summary}
        </p>
      )}

      {/* 기준점 맞추기 */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="text-[11px] text-muted">기준점 맞추기</span>
        <div className="flex overflow-hidden rounded-lg border border-line">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label={`${side}면 한 프레임 뒤로`}
            className="px-2 py-1.5 text-muted transition-colors hover:bg-surface hover:text-gold"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="w-px bg-line" />
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label={`${side}면 한 프레임 앞으로`}
            className="px-2 py-1.5 text-muted transition-colors hover:bg-surface hover:text-gold"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={onMark}
          title="지금 화면을 이 영상의 기준점으로 지정"
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-gold hover:text-gold"
        >
          <Flag className="h-3 w-3" />
          여기를 기준점으로
        </button>

        <span className="ml-auto text-[11px] tabular-nums text-muted">
          {formatTime(current)} / {formatTime(duration)}
        </span>
      </div>

      <div className="border-t border-line px-3 py-1.5 text-[10px] text-muted">
        기준점 {formatTime(mark)} · 약 {fps}fps
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

  const frameA = useFrameDuration(videoA).frameDurationRef;
  const frameB = useFrameDuration(videoB).frameDurationRef;

  useEffect(() => {
    if (videoA.current) videoA.current.playbackRate = speed;
    if (videoB.current) videoB.current.playbackRate = speed;
  }, [speed]);

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
      className="space-y-4"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="group"
      aria-label="2분할 비교 재생기"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <ComparePane
          side="A"
          clips={clips}
          selectedId={idA}
          onSelect={selectA}
          videoRef={videoA}
          mark={markA}
          onMark={() => setMarkA(videoA.current?.currentTime ?? 0)}
        />
        <ComparePane
          side="B"
          clips={clips}
          selectedId={idB}
          onSelect={selectB}
          videoRef={videoB}
          mark={markB}
          onMark={() => setMarkB(videoB.current?.currentTime ?? 0)}
        />
      </div>

      {/* 공용 조작부 — 두 영상을 함께 움직인다 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-xl border border-gold-dim/40 bg-gold/[0.04] px-4 py-3">
        <button
          type="button"
          onClick={resetToMarks}
          title="두 영상을 각자의 기준점으로"
          className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-gold hover:text-gold"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={bothPlay}
          aria-label={playing ? '둘 다 정지' : '둘 다 재생'}
          className="rounded-lg bg-gold p-2 text-ink transition-colors hover:bg-gold-bright"
        >
          {playing ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          )}
        </button>

        <div className="flex overflow-hidden rounded-lg border border-line">
          <button
            type="button"
            onClick={() => stepBoth(-1)}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-muted transition-colors hover:bg-surface hover:text-gold"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            이전 프레임
          </button>
          <span className="w-px bg-line" />
          <button
            type="button"
            onClick={() => stepBoth(1)}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-muted transition-colors hover:bg-surface hover:text-gold"
          >
            다음 프레임
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

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

      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
        <strong className="text-cream">쓰는 법</strong> — 각 화면의 &ldquo;기준점 맞추기&rdquo;로
        두 영상을 같은 동작(예: 앞발 착지 순간)에 맞춘 뒤 &ldquo;여기를 기준점으로&rdquo;를
        누르세요. 그다음 아래 공용 버튼으로 함께 넘기면 같은 시점끼리 비교됩니다.
        ← → 키로도 이동할 수 있습니다.
      </p>
    </div>
  );
}
