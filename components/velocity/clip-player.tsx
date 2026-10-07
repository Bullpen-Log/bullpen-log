'use client';

import { useCallback, useId, useState } from 'react';
import { zoneCellOnScreen, type CameraPos, type ZoneRect } from '@/lib/velocity-setup';
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

/** 공 궤적의 한 점 — 장면 비율(x · y 는 0~1, d 는 공 지름 ÷ 장면 가로) */
export type TrailPoint = { x: number; y: number; d: number };

/**
 * 공이 날아간 길 — 릴리스(하늘색)에서 그물(분홍)로 색이 바뀌는 선과, 그 길 위에 듬성듬성 그 순간 크기의 공. 그려지며 들어온다.
 * 클립은 벽시계로, 궤적은 카메라 장면 시각으로 잰 것이라 재생에 맞춰 따라 그리면 수십 ms 어긋나 공과 따로 논다 — 길 전체를
 * 고정해 그리고 그 밑에서 영상이 되풀이된다. w · h 는 그릴 판의 크기(영상 크기).
 */
export function TrailOverlay({
  points,
  w,
  h,
}: {
  points: TrailPoint[];
  w: number;
  h: number;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (points.length < 2) return null;
  const P = points.map((p) => ({ x: p.x * w, y: p.y * h, r: (p.d * w) / 2 }));
  const first = P[0];
  const last = P[P.length - 1];
  const line = Math.max(3, w * 0.007);
  const d = P.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(
    ' '
  );
  const every = Math.max(1, Math.ceil(P.length / 12));
  const ghosts = P.filter((_, i) => i % every === 0);
  const grad = `url(#${id}g)`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <style>{`@keyframes trail-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}.trail-draw{stroke-dasharray:1;animation:trail-draw .8s ease-out both}@media (prefers-reduced-motion:reduce){.trail-draw{animation:none}}`}</style>
      <defs>
        <linearGradient
          id={`${id}g`}
          gradientUnits="userSpaceOnUse"
          x1={first.x}
          y1={first.y}
          x2={last.x}
          y2={last.y}
        >
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.55" stopColor="#facc15" />
          <stop offset="1" stopColor="#f43f5e" />
        </linearGradient>
      </defs>
      <path
        d={d}
        pathLength={1}
        className="trail-draw"
        fill="none"
        stroke="rgba(0,0,0,0.5)"
        strokeWidth={line * 2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        pathLength={1}
        className="trail-draw"
        fill="none"
        stroke={grad}
        strokeWidth={line}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {ghosts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={Math.max(line * 0.9, p.r)}
          fill={grad}
          fillOpacity={0.16}
          stroke={grad}
          strokeWidth={line * 0.35}
        />
      ))}
      <circle
        cx={first.x}
        cy={first.y}
        r={line * 1.4}
        fill="#fff"
        stroke="#22d3ee"
        strokeWidth={line * 0.6}
      />
      <circle
        cx={last.x}
        cy={last.y}
        r={line * 1.4}
        fill="#f43f5e"
        stroke="#fff"
        strokeWidth={line * 0.5}
      />
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
  /** 겹쳐 그릴 공 궤적(장면 비율) */
  trail?: TrailPoint[] | null;
  /** 이 자리(장면 비율)를 가운데 두고 확대 — 영상 · 궤적 · 존이 같이 커진다 */
  zoom?: { cx: number; cy: number; scale: number } | null;
}) {
  /* 영상 크기 — 어느 영상의 것인지 같이 쥔다(주소가 바뀌면 옛 비율 · 존을 쓰지 않게) */
  const [meta, setMeta] = useState<{ src: string; w: number; h: number } | null>(null);
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
          <TrailOverlay points={trail} w={dims.w} h={dims.h} />
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
  let x0 = 1;
  let x1 = 0;
  let y0 = 1;
  let y1 = 0;
  for (const p of trail) {
    const rx = p.d / 2;
    const ry = (p.d / 2) * aspect;
    x0 = Math.min(x0, p.x - rx);
    x1 = Math.max(x1, p.x + rx);
    y0 = Math.min(y0, p.y - ry);
    y1 = Math.max(y1, p.y + ry);
  }
  const scale = Math.min(2.5, 0.6 / Math.max(x1 - x0, y1 - y0, 1e-3));
  if (scale < 1.2) return null;
  const half = 0.5 / scale;
  const clamp = (v: number) => Math.min(1 - half, Math.max(half, v));
  return { cx: clamp((x0 + x1) / 2), cy: clamp((y0 + y1) / 2), scale };
}
