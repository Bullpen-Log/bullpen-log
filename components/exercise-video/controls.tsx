'use client';

import { useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, Repeat, RotateCcw, VolumeX } from '@/components/icon';
import { finiteTime, seekRange, timeText } from '@/lib/exercise-video-state';

/**
 * 운동영상 바깥 조작부(VP01) — 영상 밑 형제 칸에 둔다. 영상 위에 겹치지 않는다.
 *
 * 핵심 줄: 재생/정지 · 재생 위치 막대 · 현재/전체 시간. 보조 줄: 반복 중 표시 · 처음부터 · 배속 · 소리 · 크게 보기.
 * 좁은 폭 · 큰 글씨에서는 보조 줄이 줄바꿈된다. 누르는 자리는 모두 44px 이상.
 * 막대 이벤트는 영상 탭(멈춤/재생)으로 번지지 않는다(stopPropagation).
 */
export type ExerciseControlsProps = {
  title: string;
  playing: boolean;
  /** 준비 전이면 재생 단추 외 조작을 끈다. */
  ready: boolean;
  duration: number | null;
  /** 실제 재생 위치(끄는 동안은 무시하고 손가락 위치를 보인다). */
  time: number;
  seekable?: { start: number; end: number } | null;
  onToggle: () => void;
  onScrubStart: () => void;
  onScrubDraft: (t: number) => void;
  /** commit=false 면 취소(원래 위치 유지). */
  onScrubEnd: (commit: boolean, t: number) => void;
  onStep: (dir: 1 | -1) => void;
  onEdge?: (edge: 'start' | 'end') => void;
  onRestart?: () => void;
  loop: boolean;
  onLoop: () => void;
  rates: number[];
  rate: number;
  onRate?: (r: number) => void;
  muted?: boolean;
  onMute?: () => void;
  expanded?: boolean;
  onExpand?: () => void;
  expandLabel?: string;
  /** 짧은 상태 글(버퍼링 · 막힘 · 오류). */
  status?: string | null;
};

const BTN = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky disabled:cursor-not-allowed disabled:opacity-40';

export function ExerciseControls(p: ExerciseControlsProps) {
  const range = seekRange(p.duration, p.seekable ?? null);
  const enabled = p.ready && range != null;
  const [draft, setDraft] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pointer = useRef<number | null>(null);

  const shown = draft ?? finiteTime(p.time);
  const frac = range ? Math.min(1, Math.max(0, (shown - range.min) / (range.max - range.min))) : 0;
  const posOf = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || !range) return 0;
    const f = Math.min(1, Math.max(0, (clientX - box.left) / Math.max(1, box.width)));
    return range.min + f * (range.max - range.min);
  };
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div
      className="mt-2 rounded-2xl border border-line bg-surface px-2 py-1 shadow-sm"
      onClick={stop}
      data-exercise-controls=""
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={BTN}
          onClick={(e) => {
            stop(e);
            p.onToggle();
          }}
          aria-label={p.playing ? `${p.title} 일시정지` : `${p.title} 재생`}
        >
          {p.playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
        </button>
        <div
          ref={track}
          role="slider"
          tabIndex={enabled ? 0 : -1}
          aria-label="재생 위치"
          aria-disabled={!enabled}
          aria-valuemin={range?.min ?? 0}
          aria-valuemax={range?.max ?? 0}
          aria-valuenow={enabled ? Math.round(shown) : 0}
          aria-valuetext={enabled ? `${timeText(shown)} / ${timeText(range!.max)}` : '길이 확인 중'}
          className={`relative flex h-11 min-w-0 flex-1 touch-none items-center ${enabled ? 'cursor-pointer' : 'opacity-40'}`}
          onPointerDown={(e) => {
            stop(e);
            // 주 버튼 · 첫 손가락만 — 오른쪽 클릭(메뉴가 떠 pointerup 이 안 올 수 있다) · 두 번째 손가락은 끌기를 새로 열지 않는다.
            if (!enabled || dragging.current || e.button !== 0 || !e.isPrimary) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = true;
            pointer.current = e.pointerId;
            p.onScrubStart();
            const t = posOf(e.clientX);
            setDraft(t);
            p.onScrubDraft(t);
          }}
          onPointerMove={(e) => {
            if (!dragging.current || e.pointerId !== pointer.current) return;
            const t = posOf(e.clientX);
            setDraft(t);
            p.onScrubDraft(t);
          }}
          onPointerUp={(e) => {
            stop(e);
            if (!dragging.current || e.pointerId !== pointer.current) return;
            dragging.current = false;
            pointer.current = null;
            const t = posOf(e.clientX);
            setDraft(null);
            p.onScrubEnd(true, t);
          }}
          onPointerCancel={(e) => {
            if (!dragging.current || e.pointerId !== pointer.current) return;
            dragging.current = false;
            pointer.current = null;
            setDraft(null);
            p.onScrubEnd(false, 0);
          }}
          onLostPointerCapture={(e) => {
            // 붙잡기를 잃으면(창 전환 · 시스템 제스처) 끌기를 취소로 끝낸다 — 끄는 상태에 매달리지 않게. pointerup 뒤면 이미 false.
            if (!dragging.current || e.pointerId !== pointer.current) return;
            dragging.current = false;
            pointer.current = null;
            setDraft(null);
            p.onScrubEnd(false, 0);
          }}
          onKeyDown={(e) => {
            if (!enabled) return;
            if (e.key === 'Escape' && dragging.current) {
              // 끌기 취소만 — 크게 보기 · 바깥 창을 함께 닫지 않는다.
              e.preventDefault();
              e.stopPropagation();
              dragging.current = false;
              if (pointer.current != null && e.currentTarget.hasPointerCapture(pointer.current)) e.currentTarget.releasePointerCapture(pointer.current);
              pointer.current = null;
              setDraft(null);
              p.onScrubEnd(false, 0);
              return;
            }
            const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
            if (dir) {
              e.preventDefault();
              p.onStep(dir);
            } else if ((e.key === 'Home' || e.key === 'End') && p.onEdge) {
              e.preventDefault();
              p.onEdge(e.key === 'Home' ? 'start' : 'end');
            }
          }}
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full bg-sky" style={{ width: `${frac * 100}%` }} />
          </div>
          <div
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-sky shadow"
            style={{ left: `${frac * 100}%` }}
          />
        </div>
        <span className="shrink-0 px-1 text-xs tabular-nums text-muted" aria-hidden>
          {enabled ? `${timeText(shown)} / ${timeText(range!.max)}` : '--:--'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted">
        <button type="button" className={`${BTN} mr-auto gap-1 px-2 text-xs`} onClick={p.onLoop} aria-pressed={p.loop} aria-label={p.loop ? '반복 재생 끄기' : '반복 재생 켜기'}>
          <Repeat className={`h-3.5 w-3.5 ${p.loop ? 'text-sky' : 'text-muted'}`} aria-hidden />
          {p.loop ? '반복 켜짐' : '반복 꺼짐'}
        </button>
        {p.status ? <span role="status" className="px-1">{p.status}</span> : null}
        {p.onRestart && (
          <button type="button" className={BTN} disabled={!p.ready} onClick={(e) => { stop(e); p.onRestart!(); }} aria-label="처음부터">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        {p.onRate && p.rates.length > 1 && (
          <button
            type="button"
            className={`${BTN} px-3 font-semibold tabular-nums`}
            disabled={!p.ready}
            onClick={(e) => {
              stop(e);
              const i = p.rates.indexOf(p.rate);
              p.onRate!(p.rates[(i + 1) % p.rates.length]);
            }}
            aria-label={`재생 속도 ${p.rate}배, 바꾸기`}
          >
            {p.rate}×
          </button>
        )}
        {p.onMute && (
          <button type="button" className={`${BTN} gap-1 px-2`} disabled={!p.ready} onClick={(e) => { stop(e); p.onMute!(); }} aria-pressed={!p.muted} aria-label={p.muted ? '소리 켜기' : '소리 끄기'}>
            {p.muted ? <VolumeX className="h-4 w-4" aria-hidden /> : null}
            <span>{p.muted ? '소리 꺼짐' : '소리 켜짐'}</span>
          </button>
        )}
        {p.onExpand && (
          <button type="button" className={BTN} onClick={(e) => { stop(e); p.onExpand!(); }} aria-label={p.expandLabel ?? (p.expanded ? '크게 보기 닫기' : '크게 보기')}>
            {p.expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
