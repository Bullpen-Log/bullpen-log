'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Ruler } from 'lucide-react';
import type { CameraInfo, LiveCapture } from '@/lib/velocity-engine/live-capture';

/** 카메라의 지금 장면 — LiveCapture.snapshot() 이 주는 것 */
export type FrameSnapshot = NonNullable<ReturnType<LiveCapture['snapshot']>>;
import {
  CALIBRATION_DISTANCES,
  focalFromBall,
  fovDegFromFocal,
  saveLens,
  type LensCalibration,
} from '@/lib/velocity-lens';
import { BigButton, Chips, Note, Panel, SectionLabel } from './kit';

/**
 * 렌즈 보정 — 공을 아는 거리에 두고 화면에서 크기를 재 초점거리를 얻는다(lib/velocity-lens.ts).
 *
 * 흐름: 줄자로 카메라 렌즈에서 공까지 0.5m(권장) 를 재고 공을 들고 있는다 → 화면의 원을 공에
 * 대충 맞춘다(끌기 · 손잡이) → '재기' 를 누르면 원 둘레의 밝기로 공의 면적을 정확히 잰다(대비 50%
 * 기준, 측정 엔진과 같은 방법) → 저장. 원은 어림이고 정확한 값은 자동으로 잰다 — 사람 손으로 1px 을
 * 맞출 수는 없다.
 *
 * 공 뒤 배경은 어둡고 단순해야 한다(공보다 밝은 것이 원 둘레에 있으면 잘못 잰다).
 */

export type Circle = { x: number; y: number; d: number }; // 뷰파인더 폭 기준 0~1 (d 는 지름/폭)

export const DEFAULT_CIRCLE: Circle = { x: 0.5, y: 0.5, d: 0.28 };

/** 끌어서 옮기고 손잡이로 키우는 원 — 스트라이크 존(ZoneOverlay)과 같은 만듦새 */
export function CircleOverlay({
  value,
  onChange,
}: {
  value: Circle;
  onChange: (next: Circle) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: 'move' | 'resize';
    startX: number;
    startY: number;
    circle: Circle;
    w: number;
    h: number;
  } | null>(null);

  const begin = (kind: 'move' | 'resize', e: ReactPointerEvent) => {
    const parent = box.current?.parentElement;
    if (!parent) return;
    const r = parent.getBoundingClientRect();
    drag.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      circle: value,
      w: r.width,
      h: r.height,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.w;
    const dy = (e.clientY - d.startY) / d.h;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (d.kind === 'move') {
      onChange({
        ...d.circle,
        x: clamp(d.circle.x + dx, 0.1, 0.9),
        y: clamp(d.circle.y + dy, 0.1, 0.9),
      });
    } else {
      /* 손잡이는 오른쪽 아래 45° — 대각선으로 끈 만큼 지름을 바꾼다 */
      onChange({
        ...d.circle,
        d: clamp(d.circle.d + (dx + dy * (d.h / d.w)) * 0.7, 0.06, 0.8),
      });
    }
  };
  const end = () => {
    drag.current = null;
  };

  const size = `${value.d * 100}%`;
  return (
    <div
      ref={box}
      role="application"
      aria-label="공에 맞출 원"
      onPointerDown={(e) => begin('move', e)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{
        left: `${value.x * 100}%`,
        top: `${value.y * 100}%`,
        width: size,
        aspectRatio: '1 / 1',
      }}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded-full border-2 border-sky-soft shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
    >
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-soft" />
      <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        공에 대충 맞추세요
      </span>
      <button
        type="button"
        aria-label="크기 바꾸기"
        onPointerDown={(e) => begin('resize', e)}
        className="absolute -bottom-2 -right-2 h-8 w-8 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-sky shadow"
      />
    </div>
  );
}

/**
 * 멈춘 장면에서 공의 지름을 잰다 — 밝기 총량으로 면적(측정 엔진의 refineTrack 과 같은 원리).
 * 배경은 원 둘레 고리(1.25~1.6R)의 중앙값, 대비는 원 가운데(지름의 ¼ 안)의 중앙값. 창 안의
 * (밝기 − 배경)/대비 를 자르지 않고 다 더한다 — 잡음은 상쇄되고 번진 꼬리도 들어간다. 지름(분석
 * 픽셀)과 대비를 돌려준다. 대비가 낮으면(공이 배경과 구별이 안 되면) null.
 */
export function measureStaticBall(
  luma: ArrayLike<number>,
  width: number,
  height: number,
  cx: number,
  cy: number,
  roughD: number
): { diameterPx: number; contrast: number } | null {
  const R = roughD * 0.8 + 2;
  const ring: number[] = [];
  const core: number[] = [];
  const x0 = Math.max(0, Math.floor(cx - 1.7 * R));
  const x1 = Math.min(width - 1, Math.ceil(cx + 1.7 * R));
  const y0 = Math.max(0, Math.floor(cy - 1.7 * R));
  const y1 = Math.min(height - 1, Math.ceil(cy + 1.7 * R));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const v = luma[y * width + x];
      if (dist >= 1.25 * R && dist <= 1.6 * R) ring.push(v);
      else if (dist <= roughD / 4) core.push(v);
    }
  }
  if (ring.length < 20 || core.length < 5) return null;
  const median = (a: number[]) => {
    const s = [...a].sort((p, q) => p - q);
    return s[Math.floor(s.length / 2)];
  };
  const bg = median(ring);
  const C = median(core) - bg;
  if (C < 20) return null;
  let area = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (Math.hypot(x - cx, y - cy) > R) continue;
      let c = (luma[y * width + x] - bg) / C;
      if (c > 1.5) c = 1.5;
      else if (c < -0.5) c = -0.5;
      area += c;
    }
  }
  if (area < 10) return null;
  return { diameterPx: 2 * Math.sqrt(area / Math.PI), contrast: C };
}

/** 뷰파인더(object-cover) 위의 원 → 카메라 프레임 픽셀. frameToView 의 반대 */
function viewToFrame(
  circle: Circle,
  frame: { width: number; height: number },
  view: { width: number; height: number }
) {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const offX = (view.width - frame.width * scale) / 2;
  const offY = (view.height - frame.height * scale) / 2;
  return {
    cx: (circle.x * view.width - offX) / scale,
    cy: (circle.y * view.height - offY) / scale,
    d: (circle.d * view.width) / scale,
  };
}

export function LensCalibrationPanel({
  snapshot,
  camera,
  finderRef,
  circle,
  current,
  onSaved,
}: {
  /** 카메라의 지금 장면을 준다 — 렌더 중이 아니라 단추를 눌렀을 때 읽는다 */
  snapshot: () => FrameSnapshot | null;
  camera: CameraInfo | null;
  finderRef: React.RefObject<HTMLDivElement | null>;
  circle: Circle;
  current: LensCalibration | null;
  onSaved: (cal: LensCalibration) => void;
}) {
  const [distance, setDistance] = useState<string>('0.5');
  const [measured, setMeasured] = useState<{
    sourcePx: number;
    contrast: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const measure = () => {
    setError(null);
    setMeasured(null);
    const snap = snapshot();
    const view = finderRef.current?.getBoundingClientRect();
    if (!snap || !view || !camera) {
      setError('카메라가 켜져 있어야 잴 수 있어요.');
      return;
    }
    const f = viewToFrame(
      circle,
      { width: snap.sourceWidth, height: snap.sourceHeight },
      view
    );
    const k = snap.width / snap.sourceWidth; // 원본 → 분석 픽셀
    const got = measureStaticBall(
      snap.luma,
      snap.width,
      snap.height,
      f.cx * k,
      f.cy * k,
      f.d * k
    );
    if (!got) {
      setError(
        '공과 배경이 잘 구별되지 않아요. 공 뒤가 어둡고 단순한 곳에서, 원을 공에 더 가깝게 맞춰 보세요.'
      );
      return;
    }
    setMeasured({ sourcePx: got.diameterPx / k, contrast: Math.round(got.contrast) });
  };

  const save = () => {
    if (!measured || !camera) return;
    const dist = Number(distance);
    const longSide = Math.max(camera.width, camera.height);
    const focalPx = focalFromBall(measured.sourcePx, dist);
    onSaved(
      saveLens({
        focalPerLongSide: focalPx / longSide,
        ballPx: Math.round(measured.sourcePx * 10) / 10,
        distanceM: dist,
        longSide,
        label: camera.label,
      })
    );
  };

  const longSide = camera ? Math.max(camera.width, camera.height) : 0;
  const preview =
    measured && camera
      ? {
          focalPx: focalFromBall(measured.sourcePx, Number(distance)),
          fov: fovDegFromFocal(
            focalFromBall(measured.sourcePx, Number(distance)),
            longSide
          ),
        }
      : null;

  return (
    <div className="mt-4 space-y-4">
      <div>
        <SectionLabel>렌즈에서 공까지 거리(줄자로)</SectionLabel>
        <Chips
          label="거리"
          options={CALIBRATION_DISTANCES.map((d) => ({
            value: String(d),
            label: `${d}m`,
          }))}
          value={distance}
          onChange={(v) => v && setDistance(v)}
          allowNone={false}
        />
        <p className="mt-2 text-xs leading-relaxed text-muted">
          0.5m 가 가장 정확해요(공이 크게 찍혀 1픽셀의 몫이 작아요). 공은 삼각대에 올린
          폰의 카메라 렌즈 정면, 배경은 어둡고 단순하게.
        </p>
      </div>

      <BigButton variant="secondary" onClick={measure} className="w-full flex-none">
        <Ruler aria-hidden className="h-4 w-4" />원 안의 공 재기
      </BigButton>

      {error && <Note tone="danger">{error}</Note>}

      {measured && preview && (
        <Panel className="p-4">
          <p className="text-sm text-ink">
            공 지름 <b className="tabular-nums">{measured.sourcePx.toFixed(1)}px</b> ·
            대비 {measured.contrast}
            {' → '}초점거리{' '}
            <b className="tabular-nums">{Math.round(preview.focalPx)}px</b> (화각 약{' '}
            {preview.fov}°)
          </p>
          {current && (
            <p className="mt-1 text-xs text-muted">
              지금 값: {Math.round(current.focalPerLongSide * longSide)}px (
              {fovDegFromFocal(current.focalPerLongSide * longSide, longSide)}°)
            </p>
          )}
          <BigButton onClick={save} className="mt-3 w-full flex-none">
            <Check aria-hidden className="h-4 w-4" />이 값으로 보정 저장
          </BigButton>
        </Panel>
      )}

      <Note tone="info">
        저장하면 이 폰에서 재는 구속에 이 초점거리를 써요(화각 가정 대신). 폰이나
        렌즈(1x·0.5x)를 바꾸면 다시 재세요. 같은 공으로 재므로 공 크기 차이도 함께
        맞춰져요.
      </Note>
    </div>
  );
}
