'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Loader2, Play, Pause } from 'lucide-react';
import { extractPoseTrack, frameAt } from '@/lib/pose/extract';
import { detectPitchEvents } from '@/lib/pose/detect';
import { LM, QUALITY_THRESHOLD, type PoseTrack } from '@/lib/pose/types';
import { getContentBox } from '@/components/video-canvas';
import type { VideoWithFrameCallback } from '@/components/use-frame-duration';

/**
 * 폼 분석 (베타) — 영상에서 관절을 뽑아 스켈레톤을 겹쳐 보여준다.
 *
 * 분석은 전부 이 기기 안에서 돌아가고 영상은 어디로도 전송되지 않는다.
 * 지금 단계(v0)는 추출·표시까지이고, 구간 검출과 수치 측정은 다음 단계다.
 */

const BODY_START = 11; // 얼굴 세부 관절(0~10)은 선을 긋지 않는다.

type EventKey = 'kneeUp' | 'footPlant' | 'release';

const EVENT_ORDER: EventKey[] = ['kneeUp', 'footPlant', 'release'];

const EVENT_LABELS: Record<EventKey, string> = {
  kneeUp: '니업',
  footPlant: '착지',
  release: '릴리스',
};

/** "현재 프레임을 ~로 지정" 버튼 문구용 조사 처리 */
const EVENT_AS: Record<EventKey, string> = {
  kneeUp: '니업으로',
  footPlant: '착지로',
  release: '릴리스로',
};

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  track: PoseTrack,
  t: number,
  canvasW: number,
  canvasH: number
) {
  const frame = frameAt(track, t);
  if (!frame) return;

  const box = getContentBox(canvasW, canvasH, track.videoWidth, track.videoHeight);
  const px = (x: number) => box.ox + x * box.dw;
  const py = (y: number) => box.oy + y * box.dh;
  const pts = frame.landmarks;

  // 연결선
  ctx.lineWidth = Math.max(1.5, canvasW / 480);
  for (const { start, end } of track.connections) {
    if (start < BODY_START && start !== LM.nose) continue;
    if (end < BODY_START && end !== LM.nose) continue;
    const a = pts[start];
    const b = pts[end];
    if (!a || !b) continue;
    const ok = Math.min(a.visibility, b.visibility) >= QUALITY_THRESHOLD;
    ctx.strokeStyle = ok ? 'rgba(94, 234, 212, 0.9)' : 'rgba(252, 165, 165, 0.5)';
    ctx.beginPath();
    ctx.moveTo(px(a.x), py(a.y));
    ctx.lineTo(px(b.x), py(b.y));
    ctx.stroke();
  }

  // 관절점
  const r = Math.max(2, canvasW / 320);
  for (let i = 0; i < pts.length; i++) {
    if (i < BODY_START && i !== LM.nose) continue;
    const p = pts[i];
    ctx.fillStyle =
      p.visibility >= QUALITY_THRESHOLD
        ? 'rgba(227, 203, 149, 0.95)'
        : 'rgba(252, 165, 165, 0.6)';
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function PoseAnalysis({ src, label }: { src: string; label: string }) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'analyzing' | 'ready' | 'error'>(
    'idle'
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [track, setTrack] = useState<PoseTrack | null>(null);
  const [playing, setPlaying] = useState(false);

  // 구간(니업·착지·릴리스) — 자동 감지 결과 + 사용자가 프레임으로 직접 보정한 값
  const [forcedSide, setForcedSide] = useState<'left' | 'right' | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<EventKey, number>>>({});
  const [selected, setSelected] = useState<EventKey | null>(null);
  const [now, setNow] = useState(0);

  const videoRef = useRef<VideoWithFrameCallback>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const events = useMemo(
    () => (track ? detectPitchEvents(track, forcedSide ?? undefined) : null),
    [track, forcedSide]
  );

  const effectiveTime = (key: EventKey): number | null =>
    overrides[key] ?? events?.[key]?.t ?? null;

  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
    setNow(t);
  };

  const stepFrame = (dir: 1 | -1) => {
    const v = videoRef.current;
    if (!v || !track) return;
    v.pause();
    const max = Number.isFinite(v.duration) ? v.duration : Infinity;
    const t = Math.min(Math.max(v.currentTime + dir * track.sampleStep, 0), max);
    v.currentTime = t;
    setNow(t);
  };

  const run = async () => {
    setPhase('loading');
    setError(undefined);
    setProgress(0);
    abortRef.current = new AbortController();

    try {
      const result = await extractPoseTrack(
        src,
        (ratio) => {
          setPhase('analyzing');
          setProgress(ratio);
        },
        abortRef.current.signal
      );
      setTrack(result);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석에 실패했습니다.');
      setPhase('error');
    }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  // 재생 시각에 맞춰 스켈레톤을 계속 다시 그린다.
  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !track) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    drawSkeleton(ctx, track, video.currentTime, w, h);
  }, [track]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const video = videoRef.current;
    if (!video) return;

    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, draw]);

  if (phase === 'idle' || phase === 'error') {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={run}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs text-cream transition-colors hover:border-gold hover:text-gold"
        >
          <Activity className="h-3.5 w-3.5" />
          폼 분석 (베타)
        </button>
        {phase === 'error' && (
          <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs leading-relaxed text-red-300">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (phase === 'loading' || phase === 'analyzing') {
    return (
      <div className="space-y-2 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
          {phase === 'loading'
            ? '분석 도구 준비 중… (처음 한 번만 내려받습니다)'
            : `관절 위치 추출 중… ${Math.round(progress * 100)}%`}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-muted/60">
          영상은 전송되지 않고 이 기기 안에서만 분석됩니다.
        </p>
      </div>
    );
  }

  // ready
  const lowQuality = track && track.quality < QUALITY_THRESHOLD;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-gold-dim/50 bg-black">
        <video
          ref={videoRef}
          src={src}
          playsInline
          muted
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) v.play().catch(() => {});
            else v.pause();
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
          className="block aspect-video w-full cursor-pointer object-contain"
          aria-label={`${label} 스켈레톤 보기`}
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        <button
          type="button"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) v.play().catch(() => {});
            else v.pause();
          }}
          aria-label={playing ? '일시정지' : '재생'}
          className="absolute bottom-2 left-2 flex h-9 w-9 items-center justify-center rounded-full bg-gold text-ink shadow-lg"
        >
          {playing ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          )}
        </button>

        <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-2.5 py-1 text-[10px] text-teal-300">
          스켈레톤 · 인식 신뢰도 {Math.round((track?.quality ?? 0) * 100)}%
        </span>
      </div>

      {/* 구간 — 자동 감지된 순간으로 이동하고, 틀리면 프레임 단위로 직접 지정 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-surface-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {EVENT_ORDER.map((key) => {
            const t = effectiveTime(key);
            const auto = events?.[key];
            const overridden = overrides[key] != null;
            const blurry = !overridden && auto != null && auto.confidence < QUALITY_THRESHOLD;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelected(key);
                  if (t != null) seekTo(t);
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  selected === key
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-line text-muted hover:border-gold-dim hover:text-cream'
                }`}
              >
                {EVENT_LABELS[key]}{' '}
                {t != null ? `${t.toFixed(2)}초` : '감지 못함'}
                {blurry && '?'}
                {overridden && ' ✎'}
              </button>
            );
          })}
          {events && (
            <button
              type="button"
              onClick={() =>
                setForcedSide(events.throwingSide === 'right' ? 'left' : 'right')
              }
              className="ml-auto rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-gold-dim hover:text-cream"
            >
              {events.throwingSide === 'right' ? '우투로 인식' : '좌투로 인식'} · 전환
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => stepFrame(-1)}
            aria-label="이전 프레임"
            className="rounded-lg border border-line p-1.5 text-muted transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => stepFrame(1)}
            aria-label="다음 프레임"
            className="rounded-lg border border-line p-1.5 text-muted transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <span className="px-1 text-[11px] tabular-nums text-muted">
            현재 {now.toFixed(2)}초
          </span>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              const v = videoRef.current;
              if (!v) return;
              setOverrides((prev) => ({ ...prev, [selected]: v.currentTime }));
            }}
            className="rounded-lg border border-line-strong px-2.5 py-1.5 text-[11px] text-cream transition-colors enabled:hover:border-gold enabled:hover:text-gold disabled:opacity-40"
          >
            현재 프레임을 {selected ? EVENT_AS[selected] : '구간으로'} 지정
          </button>
          {selected && overrides[selected] != null && (
            <button
              type="button"
              onClick={() =>
                setOverrides((prev) => {
                  const next = { ...prev };
                  delete next[selected];
                  return next;
                })
              }
              className="rounded-lg px-2 py-1.5 text-[11px] text-muted underline-offset-2 hover:text-cream hover:underline"
            >
              자동값 복원
            </button>
          )}
        </div>

        {events && !events.kneeUp && !events.footPlant && !events.release ? (
          <p className="text-[11px] leading-relaxed text-amber-200/90">
            투구 동작을 자동으로 찾지 못했습니다. 구간을 누른 뒤 ◀ ▶로 프레임을
            맞추고 직접 지정해주세요.
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted/60">
            구간을 누르면 그 순간으로 이동합니다. 위치가 틀리면 ◀ ▶로 맞춘 뒤
            지정을 누르세요. ?는 그 순간 관절 인식이 흐렸다는 표시입니다.
          </p>
        )}
      </div>

      {lowQuality && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
          관절 인식 신뢰도가 낮습니다. 밝은 곳에서 전신이 다 나오게, 배경과 구분되는
          옷으로 다시 찍으면 좋아집니다. 이 상태의 측정값은 신뢰하기 어렵습니다.
        </p>
      )}
    </div>
  );
}
