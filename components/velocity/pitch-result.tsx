'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Maximize2, Pencil, X, ZoomIn } from 'lucide-react';
import { PITCH_TYPES } from '@/lib/velocity-meta';
import type { CameraPos } from '@/lib/velocity-setup';
import { ClipPlayer, Tracer, trailZoom, type TrailPoint } from './clip-player';

/**
 * 공 하나의 결과 화면 — 잴 때마다 카메라 위에 뜬다(SmartScout 처럼, 사용자 2026-10-07). 그 공의 영상을 되풀이 재생하며 손을 떠난 공을
 * 반투명 파란 관으로 따라 그리고(영상의 장면에 맞춰 — 미리 그려 두지 않는다), 구속 · ± · 구종을 보인다. 측정은 밑에서 계속 돈다 — 다음
 * 공을 던지면 그 공의 결과로 바뀐다.
 *
 * 클립은 결과보다 늦게 올 수 있다(녹화 조각이 닫혀야 나온다) — 그동안은 어두운 판에서 같은 빠르기로 따라 그린다.
 *
 * 클립 시각을 잘 모르면(카메라 실시간 — 녹화기의 '시작' 알림이 늦어 0.2~0.85초씩 어긋났다, 2026-10-07 아이폰) 처음엔 영상 전체를
 * 돌리며 영상 속 공으로 시각을 넓게 맞추고(clip.alignRange), 맞추면 공이 처음 보이기 0.5초 앞에서 그물에 닿고 0.7초 뒤까지만 되풀이한다.
 * 저장한 공을 목록에서 다시 볼 때도 같은 화면이다(PitchResultDialog — 버튼은 '닫기' · '고치기').
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
  onAligned,
  onEdit,
}: {
  /** 공이 바뀌면 바뀌는 값 — 영상 기다림을 새로 센다 */
  pitchKey: number | string;
  /** 몇 구째 */
  index: number;
  speed: number;
  unit: string;
  /** ± · 믿음 한 줄 */
  sub: string;
  notes: string[];
  /** 클립 시각 = 궤적 시각 + offset. alignRange(±초)는 영상 속 공으로 맞출 폭 — 0.3 넘게 모르면 처음엔 영상 전체를 돌린다 */
  clip: { url: string; offset: number; alignRange?: number } | null;
  trail: TrailPoint[] | null;
  /** 궤적을 그린 장면 크기 — 영상이 없을 때 판의 비율 */
  frame: { width: number; height: number } | null;
  cameraPos: CameraPos;
  pitchType: string | null;
  onPitchType: (key: string | null) => void;
  onClose: () => void;
  onNext: () => void;
  nextLabel: string;
  /** 영상 속 공으로 시각을 맞췄을 때 — 맞춘 offset */
  onAligned?: (offset: number) => void;
  /** 있으면 위 오른쪽에 '고치기'(구종 · 코스 · 결과 · 스피드건) — 목록에서 연 결과 화면 */
  onEdit?: () => void;
}) {
  /* 영상이 6초 넘게 안 오면 기다림 글을 거둔다(녹화를 못 하는 기기 · 끊긴 조각) */
  const [waited, setWaited] = useState<number | string | null>(null);
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
  /* 영상 속 공으로 맞춘 offset — 공 · 영상이 바뀌면 버린다 */
  const [aligned, setAligned] = useState<{ key: string; offset: number } | null>(null);
  const alignKey = `${pitchKey}|${clip?.url ?? ''}`;
  const off = aligned?.key === alignKey ? aligned.offset : (clip?.offset ?? 0);
  const unsure = (clip?.alignRange ?? 0.2) > 0.3 && aligned?.key !== alignKey;
  const loop =
    trail && trail.length && !unsure
      ? {
          from: Math.max(0, trail[0].t + off - 0.5),
          to: trail[trail.length - 1].t + off + 0.7,
        }
      : { from: 0, to: Infinity };

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
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label="고치기"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10"
          >
            <Pencil aria-hidden className="h-5 w-5" />
          </button>
        ) : (
          <span aria-hidden className="h-11 w-11" />
        )}
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
            eventSec={null}
            loop={loop}
            trail={trail}
            trailOffset={off}
            alignRange={aligned?.key === alignKey ? 0.15 : (clip.alignRange ?? 0.2)}
            onAligned={(o) => {
              setAligned({ key: alignKey, offset: o });
              onAligned?.(o);
            }}
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
              <Tracer points={trail} w={frame.width} h={frame.height} />
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

/**
 * 결과 화면을 화면 맨 위 창으로 — 그날 화면처럼 이미 창(투구 기록 팝업) 안에서 열 때도 그 위에 뜬다(<dialog> 의 맨 위 층). ESC ·
 * 닫기 단추는 onClose.
 */
export function PitchResultDialog(props: ComponentProps<typeof PitchResult>) {
  const ref = useRef<HTMLDialogElement>(null);
  const { onClose } = props;
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-black p-0 backdrop:bg-black"
    >
      <PitchResult {...props} />
    </dialog>
  );
}
