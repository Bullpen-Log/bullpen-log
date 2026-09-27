'use client';

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Check, Loader2, Ruler } from 'lucide-react';
import type { CameraInfo, LiveCapture } from '@/lib/velocity-engine/live-capture';

/** 카메라의 지금 장면 — LiveCapture.snapshot() 이 주는 것 */
export type FrameSnapshot = NonNullable<ReturnType<LiveCapture['snapshot']>>;
import {
  CALIBRATION_DISTANCES,
  FOV_SANITY_DEG,
  RECOMMENDED_DISTANCE_M,
  aspectOf,
  focalFromBall,
  fovDegFromFocal,
  saveLens,
  type LensCalibration,
} from '@/lib/velocity-lens';
import { BigButton, Chips, Note, Panel, SectionLabel } from './kit';

/**
 * 렌즈 보정 — 공을 아는 거리에 두고 화면에서 크기를 재 초점거리를 얻는다(lib/velocity-lens.ts).
 *
 * 흐름: 줄자로 카메라 유리에서 공의 앞면까지 1.0m(권장) 를 재고 공을 고정한다 → 화면의 원을 공에
 * 대충 맞춘다(끌기 · 손잡이) → '재기' 를 누르면 약 1초 동안 여러 장을 받아 각 장에서 밝기 총량으로
 * 공의 면적을 잰 뒤 지름의 중앙값을 쓴다(측정 엔진과 같은 방법). 장 사이 퍼짐이 크면 손떨림으로 보고
 * 거절한다 → 저장. 원은 어림이고 정확한 값은 자동으로 잰다 — 사람 손으로 1px 을 맞출 수는 없다.
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

/** 여러 장 재기 — 약 1초 동안 이 간격으로 최대 이만큼 */
const SAMPLE_INTERVAL_MS = 50;
const SAMPLE_MAX = 20;
const SAMPLE_MIN = 5;
/** 장 사이 지름 퍼짐((최대−최소)/중앙값)이 이걸 넘으면 손이 흔들린 것 */
const SPREAD_LIMIT = 0.01;

const median = (a: number[]) => {
  const s = [...a].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
};

/** 장면이 바뀌었는지 싸게 보는 지문 — 밝기 배열을 성기게 더한다 */
function frameStamp(luma: ArrayLike<number>): number {
  let sum = 0;
  const step = Math.max(1, Math.floor(luma.length / 4096));
  for (let i = 0; i < luma.length; i += step) {
    sum = (sum + luma[i] * ((i % 251) + 1)) % 2147483647;
  }
  return sum;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  const [distance, setDistance] = useState<string>(String(RECOMMENDED_DISTANCE_M));
  const [measured, setMeasured] = useState<{
    sourcePx: number;
    contrast: number;
    frames: number;
    spreadPct: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* 재는 도중 부품이 내려가면 상태를 더 만지지 않는다 */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const measure = async () => {
    if (busy) return;
    setError(null);
    setMeasured(null);
    const view = finderRef.current?.getBoundingClientRect();
    if (!snapshot() || !view || !camera) {
      setError('카메라가 켜져 있어야 잴 수 있어요.');
      return;
    }
    setBusy(true);
    const diameters: number[] = [];
    const contrasts: number[] = [];
    let noContrast = 0;
    let lastStamp: number | null = null;
    let lastLuma: ArrayLike<number> | null = null;
    try {
      for (let i = 0; i < SAMPLE_MAX; i++) {
        if (i > 0) await sleep(SAMPLE_INTERVAL_MS);
        if (!alive.current) return;
        const snap = snapshot();
        if (!snap) continue;
        /* 같은 장면(같은 버퍼 · 같은 지문)이면 건너뛴다 — 카메라가 아직 새 장을 안 줬다 */
        if (snap.luma === lastLuma) continue;
        const stamp = frameStamp(snap.luma);
        if (stamp === lastStamp) continue;
        lastLuma = snap.luma;
        lastStamp = stamp;
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
          noContrast++;
          continue;
        }
        diameters.push(got.diameterPx / k);
        contrasts.push(got.contrast);
      }
      if (!alive.current) return;
      if (diameters.length < SAMPLE_MIN) {
        setError(
          noContrast > 0
            ? '공과 배경이 잘 구별되지 않아요. 공 뒤가 어둡고 단순한 곳에서, 원을 공에 더 가깝게 맞춰 보세요.'
            : '카메라에서 새 장면을 받지 못했어요. 카메라가 켜져 있는지 보고 다시 재세요.'
        );
        return;
      }
      const mid = median(diameters);
      const spread = (Math.max(...diameters) - Math.min(...diameters)) / mid;
      if (spread > SPREAD_LIMIT) {
        setError('손이 흔들려요 — 공을 고정하고 다시 재세요.');
        return;
      }
      const longSide = Math.max(camera.width, camera.height);
      const fov = fovDegFromFocal(focalFromBall(mid, Number(distance)), longSide);
      if (fov < FOV_SANITY_DEG[0] || fov > FOV_SANITY_DEG[1]) {
        setError('잘못 잰 것 같아요 — 거리나 원 위치를 확인하세요.');
        return;
      }
      setMeasured({
        sourcePx: mid,
        contrast: Math.round(median(contrasts)),
        frames: diameters.length,
        spreadPct: Math.round(spread * 1000) / 10,
      });
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const zoom = camera?.zoom ?? 1;
  /* 줌이 1× 가 아니면 저장을 막는다 — 보정 · 측정이 같은 줌이어야 한다(lensMatches) */
  const zoomOff = camera?.zoom != null && Math.abs(camera.zoom - 1) > 0.05;

  const save = () => {
    if (!measured || !camera || zoomOff) return;
    const dist = Number(distance);
    const longSide = Math.max(camera.width, camera.height);
    const focalPx = focalFromBall(measured.sourcePx, dist);
    onSaved(
      saveLens({
        focalPerLongSide: focalPx / longSide,
        ballPx: Math.round(measured.sourcePx * 10) / 10,
        surfaceDistanceM: dist,
        longSide,
        label: camera.label,
        aspect: aspectOf(camera.width, camera.height),
        zoom,
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
        <SectionLabel>카메라 유리에서 공의 앞면까지 거리(줄자로)</SectionLabel>
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
          권장 {RECOMMENDED_DISTANCE_M.toFixed(1)}m — 줄자 1cm 오차의 몫이 0.5m 에서는
          두 배가 돼요. 폰의 카메라 유리 면에서 공의 가장 앞면까지 재세요. 공은 렌즈
          정면, 배경은 어둡고 단순하게.
        </p>
      </div>

      <BigButton
        variant="secondary"
        onClick={measure}
        disabled={busy}
        aria-busy={busy}
        className="w-full flex-none"
      >
        {busy ? (
          <>
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            재는 중… 움직이지 마세요
          </>
        ) : (
          <>
            <Ruler aria-hidden className="h-4 w-4" />원 안의 공 재기
          </>
        )}
      </BigButton>

      {error && <Note tone="danger">{error}</Note>}

      {measured && preview && camera && (
        <Panel className="p-4">
          <p className="text-sm text-ink">
            공 지름 <b className="tabular-nums">{measured.sourcePx.toFixed(1)}px</b>
            {' · '}대비 {measured.contrast}
            {' → '}초점거리{' '}
            <b className="tabular-nums">{Math.round(preview.focalPx)}px</b> (화각 약{' '}
            {preview.fov}°)
          </p>
          <p className="mt-1 text-xs text-muted">
            {measured.frames}장의 중앙값 · 퍼짐 {measured.spreadPct}%
          </p>
          <p className="mt-1 text-xs text-muted">
            이 카메라 서명: {camera.label || '이름 없음'} · 비율{' '}
            {aspectOf(camera.width, camera.height)} · 줌 {zoom}
          </p>
          {current && (
            <p className="mt-1 text-xs text-muted">
              지금 값: {Math.round(current.focalPerLongSide * longSide)}px (
              {fovDegFromFocal(current.focalPerLongSide * longSide, longSide)}°)
            </p>
          )}
          {zoomOff && (
            <div className="mt-3">
              <Note tone="warn">
                줌이 1× 가 아니에요 — 보정 · 측정 모두 1× 에서 하세요
              </Note>
            </div>
          )}
          <BigButton
            onClick={save}
            disabled={zoomOff}
            className="mt-3 w-full flex-none"
          >
            <Check aria-hidden className="h-4 w-4" />이 값으로 보정 저장
          </BigButton>
        </Panel>
      )}

      <Note tone="info">
        실제로 던질 그 공으로 재세요(공 크기 차이까지 함께 맞춰져요). 공을 쥔 손이 원
        둘레 고리에 들어오지 않게 아래에서 받치고, 측정과 같은 초점 상태(네트 있음이면
        수동초점 그대로)에서 재세요. 저장하면 이 폰에서 재는 구속에 이 초점거리를
        써요(화각 가정 대신). 폰 · 렌즈(1x · 0.5x) · 촬영 모드가 바뀌면 다시 재세요.
      </Note>
    </div>
  );
}
