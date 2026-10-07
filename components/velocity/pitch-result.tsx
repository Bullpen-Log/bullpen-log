'use client';

import { useEffect, useState } from 'react';
import { Maximize2, X, ZoomIn } from 'lucide-react';
import { PITCH_TYPES } from '@/lib/velocity-meta';
import type { CameraPos } from '@/lib/velocity-setup';
import { ClipPlayer, TrailOverlay, trailZoom, type TrailPoint } from './clip-player';

/**
 * 공 하나의 결과 화면 — 잴 때마다 카메라 위에 뜬다(SmartScout 처럼, 사용자 2026-10-07). 그 공의 영상을 되풀이 재생하며 색을 입힌
 * 궤적을 겹치고, 구속 · ± · 구종을 보인다. 측정은 밑에서 계속 돈다 — 다음 공을 던지면 그 공의 결과로 바뀐다.
 *
 * 클립은 결과보다 늦게 올 수 있다(녹화 조각이 닫혀야 나온다) — 그동안은 궤적만 어두운 판에 그린다.
 */
export function PitchResult({
  pitchKey,
  index,
  speed,
  unit,
  sub,
  notes,
  clip,
  trail,
  frame,
  cameraPos,
  pitchType,
  onPitchType,
  onClose,
  onNext,
  nextLabel,
}: {
  /** 공이 바뀌면 바뀌는 값 — 영상 기다림을 새로 센다 */
  pitchKey: number;
  /** 몇 구째 */
  index: number;
  speed: number;
  unit: string;
  /** ± · 믿음 한 줄 */
  sub: string;
  notes: string[];
  clip: { url: string; eventSec: number; loop: { from: number; to: number } } | null;
  trail: TrailPoint[] | null;
  /** 궤적을 그린 장면 크기 — 영상이 없을 때 판의 비율 */
  frame: { width: number; height: number } | null;
  cameraPos: CameraPos;
  pitchType: string | null;
  onPitchType: (key: string | null) => void;
  onClose: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  /* 영상이 6초 넘게 안 오면 기다림 글을 거둔다(녹화를 못 하는 기기 · 끊긴 조각) */
  const [waited, setWaited] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setWaited(pitchKey), 6000);
    return () => clearTimeout(t);
  }, [pitchKey]);
  const gaveUp = waited === pitchKey;
  /* 궤적 둘레 확대 — 처음엔 켬, 단추로 전체 보기와 오간다 */
  const [full, setFull] = useState(false);
  const zoom =
    !full && trail && frame ? trailZoom(trail, frame.width / frame.height) : null;
  const canZoom =
    trail != null &&
    frame != null &&
    trailZoom(trail, frame.width / frame.height) != null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-black text-white motion-safe:animate-fade-in">
      <div className="box-content flex h-12 shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-white/80 tabular-nums">
          {index}구째
        </span>
        <span aria-hidden className="h-11 w-11" />
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        {clip && canZoom && (
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            aria-label={full ? '궤적 확대' : '전체 보기'}
            className="absolute right-6 top-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/70"
          >
            {full ? (
              <ZoomIn aria-hidden className="h-5 w-5" />
            ) : (
              <Maximize2 aria-hidden className="h-5 w-5" />
            )}
          </button>
        )}
        {clip ? (
          <ClipPlayer
            key={clip.url}
            src={clip.url}
            eventSec={clip.eventSec}
            loop={clip.loop}
            trail={trail}
            zoom={zoom}
            controls={false}
            autoPlay
            zoneRect={null}
            cameraPos={cameraPos}
            showZone={false}
            maxHeight="52dvh"
            className="w-full"
          />
        ) : (
          <div
            className="relative mx-auto overflow-hidden rounded-2xl bg-white/5"
            style={{
              aspectRatio: frame ? `${frame.width} / ${frame.height}` : '9 / 16',
              height: '52dvh',
            }}
          >
            {trail && frame && (
              <TrailOverlay points={trail} w={frame.width} h={frame.height} />
            )}
            <p className="absolute inset-x-0 bottom-3 text-center text-xs text-white/60">
              {gaveUp ? '영상이 없어요' : '영상 준비 중…'}
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <p className="text-display text-7xl leading-none tabular-nums motion-safe:animate-fade-in">
          {speed}
          <span className="ml-2 text-xl text-white/70">{unit}</span>
        </p>
        <p className="mt-1.5 text-sm text-white/75">{sub}</p>
        {notes.slice(0, 2).map((n) => (
          <p key={n} className="mt-1 text-xs leading-snug text-warn-line">
            {n}
          </p>
        ))}
        <div className="no-scrollbar -mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-0.5">
          {PITCH_TYPES.map((t) => {
            const on = pitchType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onPitchType(on ? null : t.key)}
                aria-pressed={on}
                className={`h-10 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                  on ? 'bg-sky text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onNext}
          className="mt-4 h-12 w-full rounded-full bg-white text-base font-semibold text-black transition-colors active:bg-white/85"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
