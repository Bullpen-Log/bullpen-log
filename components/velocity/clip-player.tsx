'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { zoneCellOnScreen, type CameraPos, type ZoneRect } from '@/lib/velocity-setup';
import {
  alignTrail,
  trailBox,
  trailUntil,
  tubePath,
  type ClipSample,
  type TrailPoint,
} from '@/lib/velocity-tracer';
import { ZoneOverlay } from './setup-steps';

/**
 * 공 하나의 영상 클립 — 던진 순간 조금 앞(0.4초)에서 시작한다. 설정 '영상에 스트라이크 존 표시'가 켜져 있으면 그 공을 잰
 * 순간의 스트라이크 존과 짐작한 코스 칸을 겹쳐 그린다.
 *
 * 클립은 카메라 장면 그대로 녹화한 것이라 존(장면 비율 0~1)을 영상 위에 그대로 얹으면 된다. 다만 영상은 칸 안에서
 * 줄어들어(object-contain) 위아래나 양옆이 빈다 — 그래서 영상 크기를 알면 틀의 비율을 영상 비율로 맞춰 빈 곳을 없앤다.
 * 파일에 새기지 않으니 설정을 끄면 곧바로 사라진다.
 */

/** 던진 순간 조금 앞으로 — 크롬 녹화(webm)는 길이가 Infinity 로 와도 그대로 옮긴다 */
function seekToEvent(v: HTMLVideoElement, eventSec: number) {
  seekTo(v, eventSec - 0.4);
}
function seekTo(v: HTMLVideoElement, sec: number) {
  const at = Math.max(0, sec);
  v.currentTime = Number.isFinite(v.duration) ? Math.min(at, v.duration) : at;
}

export type { TrailPoint };

/** 따라 그리는 관의 색 — 반투명 파랑(사용자 2026-10-07) */
const TRACER_BLUE = '#0a84ff';
const TRACER_OPACITY = 0.55;

/**
 * 공을 따라 그리는 반투명 파란 관 — 릴리스에서 그물까지, 지금 보이는 장면의 때까지만 그린다(미리 다 그려 두지 않는다). 굵기는 그때의
 * 공 지름이라 멀어질수록 가늘어진다. video 가 있으면 장면이 바뀔 때마다(requestVideoFrameCallback 의 mediaTime − offset), 없으면(영상이
 * 오기 전) 혼자 날아간 빠르기 그대로 되풀이한다. 장면마다 React 를 다시 그리지 않고 path 하나만 고친다.
 *
 * 카메라 실시간 클립은 offset 이 어림이라(lib/velocity-tracer.ts) 첫 재생에서 길 둘레를 잘라 받아 영상 속 공 자리로 맞춘다 — 그 뒤
 * 되풀이부터 공과 같이 간다. w · h 는 그릴 판의 크기(영상 크기).
 */
export function Tracer({
  points,
  w,
  h,
  video = null,
  offset = 0,
  alignRange = 0.2,
  onAligned,
}: {
  points: TrailPoint[];
  w: number;
  h: number;
  video?: HTMLVideoElement | null;
  offset?: number;
  /** 영상 속 공으로 시각을 맞출 폭(±초) — 클립 시각을 잘 모르면(카메라 실시간 · 저장한 옛 공) 넓게 */
  alignRange?: number;
  /** 맞췄을 때 — 맞춘 offset(부르는 쪽이 되풀이 구간을 옮기고 저장할 때 남긴다) */
  onAligned?: (offset: number) => void;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  /* 알림 함수가 바뀌어도 그리기를 다시 시작하지 않게 */
  const alignedRef = useRef(onAligned);
  useEffect(() => {
    alignedRef.current = onAligned;
  }, [onAligned]);
  useEffect(() => {
    const el = pathRef.current;
    if (!el || points.length < 2) return;
    const minR = w * 0.004;
    const draw = (t: number) =>
      el.setAttribute(
        'd',
        tubePath(
          trailUntil(points, t).map((p) => ({
            x: p.x * w,
            y: p.y * h,
            r: Math.max(minR, (p.d * w) / 2),
          }))
        )
      );
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    let stop = false;
    let raf = 0;
    if (!video) {
      /* 영상이 오기 전 — 날아간 시간 그대로 그리고 1초 쉬었다 다시 */
      const start = performance.now() / 1000;
      const tick = () => {
        if (stop) return;
        draw(t0 + ((performance.now() / 1000 - start) % (t1 - t0 + 1)));
        raf = requestAnimationFrame(tick);
      };
      tick();
      return () => {
        stop = true;
        cancelAnimationFrame(raf);
      };
    }
    let off = offset;
    const hasFrames = typeof video.requestVideoFrameCallback === 'function';
    /* 첫 재생에서 길 둘레(긴 변 320px 까지)를 장면마다 받아 둔다 — 장면 시각이 정확한 rVFC 가 있을 때만 */
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    let sampler: {
      crop: { x: number; y: number; w: number; h: number };
      W: number;
      H: number;
      ctx: CanvasRenderingContext2D;
      samples: ClipSample[];
    } | null = null;
    if (hasFrames && vw && vh) {
      const b = trailBox(points, vw / vh);
      const crop = { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
      const k = Math.min(1, 320 / Math.max(crop.w * vw, crop.h * vh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(8, Math.round(crop.w * vw * k));
      canvas.height = Math.max(8, Math.round(crop.h * vh * k));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) sampler = { crop, W: canvas.width, H: canvas.height, ctx, samples: [] };
    }
    const lo = t0 + offset - alignRange - 0.05;
    const hi = t1 + offset + alignRange + 0.05;
    const take = (time: number) => {
      const s = sampler;
      if (!s) return;
      const last = s.samples[s.samples.length - 1];
      if (time > hi || (last && time < last.time)) {
        /* 길 둘레를 다 지났거나 되감겼다 — 한 번 맞추고 그만 받는다(그리기를 막지 않게 다음 차례에) */
        sampler = null;
        setTimeout(() => {
          if (stop) return;
          const got = alignTrail({
            samples: s.samples,
            width: s.W,
            height: s.H,
            crop: s.crop,
            points,
            offset,
            range: alignRange,
          });
          if (got != null) {
            off = got;
            alignedRef.current?.(got);
          }
          el.setAttribute(
            'data-sync',
            got == null ? 'keep' : `${Math.round((got - offset) * 1000)}ms`
          );
        }, 0);
        return;
      }
      if (time < lo) return;
      try {
        s.ctx.drawImage(
          video,
          s.crop.x * vw,
          s.crop.y * vh,
          s.crop.w * vw,
          s.crop.h * vh,
          0,
          0,
          s.W,
          s.H
        );
        const d = s.ctx.getImageData(0, 0, s.W, s.H).data;
        const luma = new Uint8Array(s.W * s.H);
        for (let i = 0, j = 0; i < luma.length; i++, j += 4)
          luma[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
        s.samples.push({ time, luma });
      } catch {
        /* 다른 곳의 영상(CORS)이면 못 읽는다 — 받은 offset 그대로 */
        sampler = null;
      }
    };
    let handle = 0;
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (stop) return;
      take(meta.mediaTime);
      draw(meta.mediaTime - off);
      handle = video.requestVideoFrameCallback(onFrame);
    };
    const onRaf = () => {
      if (stop) return;
      draw(video.currentTime - off);
      raf = requestAnimationFrame(onRaf);
    };
    if (hasFrames) handle = video.requestVideoFrameCallback(onFrame);
    else onRaf();
    /* 멈춘 채 옮긴 장면(첫 장면 · 되감기) — rVFC 는 재생 중에만 확실히 온다 */
    const onSeeked = () => draw(video.currentTime - off);
    video.addEventListener('seeked', onSeeked);
    draw(video.currentTime - off);
    return () => {
      stop = true;
      if (hasFrames) video.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(raf);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [points, w, h, video, offset, alignRange]);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <g opacity={TRACER_OPACITY}>
        <path ref={pathRef} fill={TRACER_BLUE} />
      </g>
    </svg>
  );
}

export function ClipPlayer({
  src,
  eventSec,
  zoneRect,
  zone,
  cameraPos,
  showZone,
  autoPlay = false,
  maxHeight = '60dvh',
  className = '',
  onError,
  controls = true,
  loop = null,
  trail = null,
  trailOffset = 0,
  alignRange,
  onAligned,
  zoom = null,
}: {
  src: string;
  /** 클립 안에서 던진 시각(초) — 이 조금 앞에서 시작 */
  eventSec: number | null | undefined;
  /** 잰 순간의 스트라이크 존(장면 비율) — 없으면(옛 공 · 영상 파일) 안 그린다 */
  zoneRect: ZoneRect | null | undefined;
  /** 짐작 · 고친 코스(1~9, 투수가 보는 대로) — 그 칸을 밝힌다 */
  zone?: number | null;
  cameraPos: CameraPos;
  showZone: boolean;
  autoPlay?: boolean;
  /** 영상 높이의 한계(CSS 길이) */
  maxHeight?: string;
  className?: string;
  /** 영상을 못 불러왔을 때 — 서명 주소가 만료됐을 수 있다(그날 화면이 새 주소를 다시 받는다) */
  onError?: () => void;
  controls?: boolean;
  /** 이 구간(초)만 되풀이 — 결과 화면 */
  loop?: { from: number; to: number } | null;
  /** 영상에 맞춰 따라 그릴 공 길(장면 비율, t 는 궤적 시각) */
  trail?: TrailPoint[] | null;
  /** 클립 시각 = 궤적 시각 + trailOffset */
  trailOffset?: number;
  /** 영상 속 공으로 시각을 맞출 폭(±초, Tracer) · 맞췄을 때 */
  alignRange?: number;
  onAligned?: (offset: number) => void;
  /** 이 자리(장면 비율)를 가운데 두고 확대 — 영상 · 궤적 · 존이 같이 커진다 */
  zoom?: { cx: number; cy: number; scale: number } | null;
}) {
  /* 영상 크기 — 어느 영상의 것인지 같이 쥔다(주소가 바뀌면 옛 비율 · 존을 쓰지 않게) */
  const [meta, setMeta] = useState<{ src: string; w: number; h: number } | null>(null);
  /* 따라 그리기가 장면 시각을 읽을 영상 */
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const dims = meta && meta.src === src ? meta : null;
  /* 영상 그림이 뜬 뒤에 존을 드러낸다 — 던진 때로 찾아가는 동안(검은 화면) 존만 떠 있지 않게 */
  const [shownFor, setShownFor] = useState<string | null>(null);
  const zoneOn = showZone && zoneRect != null && dims != null && shownFor === src;
  /*
   * 영상이 화면에 붙기(커밋) 전에 머리를 다 받으면 React 가 그 알림(loadedmetadata)을 버린다 — 붙지 않은 요소의 알림은
   * 버리기 때문이다. Suspense 가 내용을 늦게 드러낼 때(캘린더 정보의 dynamic) 캐시된 영상에서 일어나, 비율 맞추기 · 던진
   * 순간으로 가기가 빠졌다. 붙는 순간 이미 받았으면 그때 한다(아직이면 아래 알림이 한다).
   */
  const attach = useCallback(
    (v: HTMLVideoElement | null) => {
      setVideoEl(v);
      if (!v || v.readyState < HTMLMediaElement.HAVE_METADATA) return;
      if (v.videoWidth && v.videoHeight)
        setMeta({ src, w: v.videoWidth, h: v.videoHeight });
      if (loop) seekTo(v, loop.from);
      else if (eventSec != null) seekToEvent(v, eventSec);
      else if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) setShownFor(src);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 구간은 시작점만 본다(같은 영상이면 다시 붙이지 않게)
    [src, eventSec, loop?.from]
  );
  /* 되풀이 — 구간 끝을 넘거나 영상이 끝나면 구간 앞으로(소리 없는 화면 안 재생이라 누름 없이 다시 튼다) */
  const rewind = (v: HTMLVideoElement) => {
    if (!loop) return;
    seekTo(v, loop.from);
    void v.play().catch(() => undefined);
  };
  return (
    <div
      className={`relative mx-auto overflow-hidden rounded-2xl bg-black ${className}`}
      style={
        dims
          ? {
              aspectRatio: `${dims.w} / ${dims.h}`,
              width: `min(100%, calc(${maxHeight} * ${dims.w / dims.h}))`,
            }
          : undefined
      }
    >
      <div
        className={
          dims
            ? 'absolute inset-0 motion-safe:transition-transform motion-safe:duration-300'
            : undefined
        }
        style={
          dims && zoom
            ? {
                transform: `scale(${zoom.scale}) translate(${(0.5 - zoom.cx) * 100}%, ${(0.5 - zoom.cy) * 100}%)`,
              }
            : undefined
        }
      >
        <video
          key={src}
          ref={attach}
          src={src}
          /*
           * 저장소(Supabase) 영상은 다른 출처 — 공 길을 영상 속 공에 맞추려면 장면을 읽어야 해(Tracer) 교차 출처로 받는다(저장소가
           * access-control-allow-origin * 로 준다). 방금 찍은 blob: 영상은 같은 출처라 그대로.
           */
          crossOrigin={/^https?:/.test(src) ? 'anonymous' : undefined}
          controls={controls}
          playsInline
          muted
          autoPlay={autoPlay}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight)
              setMeta({ src, w: v.videoWidth, h: v.videoHeight });
            if (loop) seekTo(v, loop.from);
            else if (eventSec != null) seekToEvent(v, eventSec);
          }}
          onTimeUpdate={(e) => {
            if (loop && e.currentTarget.currentTime >= loop.to) rewind(e.currentTarget);
          }}
          onEnded={(e) => rewind(e.currentTarget)}
          onError={onError}
          onSeeked={() => setShownFor(src)}
          onPlaying={() => setShownFor(src)}
          onLoadedData={() => {
            if (eventSec == null) setShownFor(src);
          }}
          style={dims ? undefined : { maxHeight }}
          className={
            dims
              ? 'absolute inset-0 h-full w-full object-contain'
              : 'block w-full object-contain'
          }
        />
        {trail && dims && shownFor === src && (
          <Tracer
            points={trail}
            w={dims.w}
            h={dims.h}
            video={videoEl}
            offset={trailOffset}
            alignRange={alignRange}
            onAligned={onAligned}
          />
        )}
        {zoneOn && (
          <div className="pointer-events-none absolute inset-0 motion-safe:animate-fade-in">
            <ZoneOverlay
              rect={zoneRect}
              editable={false}
              highlight={zoneCellOnScreen(zone, cameraPos)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 궤적을 크게 보이게 확대할 자리 — 투수 뒤에서 던지는 방향과 일직선이면 공이 화면에서 거의 안 움직이고 작아지기만 해
 * (실제 124 영상: 30px 남짓) 화면 전체로는 궤적이 점처럼 보인다. 궤적(공 크기까지)이 판의 60% 를 채우게, 2.5배까지.
 * aspect = 장면 가로 ÷ 세로. 1.2배도 안 되면 null(그대로).
 */
export function trailZoom(
  trail: TrailPoint[],
  aspect: number
): { cx: number; cy: number; scale: number } | null {
  if (trail.length < 2) return null;
  const { x0, y0, x1, y1 } = trailBox(trail, aspect);
  const scale = Math.min(2.5, 0.6 / Math.max(x1 - x0, y1 - y0, 1e-3));
  if (scale < 1.2) return null;
  const half = 0.5 / scale;
  const clamp = (v: number) => Math.min(1 - half, Math.max(half, v));
  return { cx: clamp((x0 + x1) / 2), cy: clamp((y0 + y1) / 2), scale };
}
