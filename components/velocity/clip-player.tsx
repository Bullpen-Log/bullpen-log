'use client';

import { useState } from 'react';
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
}) {
  /* 영상 크기 — 어느 영상의 것인지 같이 쥔다(주소가 바뀌면 옛 비율 · 존을 쓰지 않게) */
  const [meta, setMeta] = useState<{ src: string; w: number; h: number } | null>(null);
  const dims = meta && meta.src === src ? meta : null;
  /* 영상 그림이 뜬 뒤에 존을 드러낸다 — 던진 때로 찾아가는 동안(검은 화면) 존만 떠 있지 않게 */
  const [shownFor, setShownFor] = useState<string | null>(null);
  const zoneOn = showZone && zoneRect != null && dims != null && shownFor === src;
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
      <video
        key={src}
        src={src}
        controls
        playsInline
        muted
        autoPlay={autoPlay}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight)
            setMeta({ src, w: v.videoWidth, h: v.videoHeight });
          /* 크롬 녹화(webm)는 길이가 Infinity 로 온다 — 그래도 던진 때로 */
          if (eventSec != null) {
            const at = Math.max(0, eventSec - 0.4);
            v.currentTime = Number.isFinite(v.duration) ? Math.min(at, v.duration) : at;
          }
        }}
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
  );
}
