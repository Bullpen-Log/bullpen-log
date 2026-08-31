'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Eraser,
  MoveHorizontal,
  MoveVertical,
  Triangle,
  Undo2,
} from 'lucide-react';

/**
 * 좌표는 '영상 화면 안'에서의 0~1 비율로 저장한다.
 * 캔버스 전체 기준이 아니라 영상이 실제로 그려지는 영역 기준이라,
 * 확대하거나 창 비율이 바뀌어 여백(레터박스)이 달라져도 그림이 몸에 붙어 있는다.
 */
export type Point = { x: number; y: number };

/** object-contain으로 그려진 영상이 캔버스 안에서 차지하는 실제 영역 */
type ContentBox = { ox: number; oy: number; dw: number; dh: number };

export function getContentBox(
  canvasW: number,
  canvasH: number,
  videoW: number,
  videoH: number
): ContentBox {
  // 영상 크기를 아직 모르면 캔버스 전체를 쓴다.
  if (!videoW || !videoH) return { ox: 0, oy: 0, dw: canvasW, dh: canvasH };

  const scale = Math.min(canvasW / videoW, canvasH / videoH);
  const dw = videoW * scale;
  const dh = videoH * scale;
  return { ox: (canvasW - dw) / 2, oy: (canvasH - dh) / 2, dw, dh };
}

export type Shape =
  /** 수직 기준선 */
  | { kind: 'vref'; color: string; x: number }
  /** 수평 기준선 */
  | { kind: 'href'; color: string; y: number }
  /** 두 점을 잇고 수직 대비 기울기를 표시 */
  | { kind: 'tilt'; color: string; a: Point; b: Point }
  /** 세 점이 이루는 각 */
  | { kind: 'angle'; color: string; a: Point; v: Point; b: Point }
  /** 릴리스 포인트 등 위치 표시 */
  | { kind: 'marker'; color: string; p: Point };

export type ToolKind = Shape['kind'];

export const DRAW_TOOLS: {
  kind: ToolKind;
  label: string;
  hint: string;
  Icon: typeof Triangle;
}[] = [
  {
    kind: 'tilt',
    label: '기울기',
    hint: '두 점을 이어 수직 대비 기울기를 잽니다. 몸통·어깨선에 씁니다.',
    Icon: Triangle,
  },
  {
    kind: 'angle',
    label: '각도',
    hint: '세 곳을 차례로 누르세요. 두 번째로 누른 곳이 꼭짓점입니다.',
    Icon: Triangle,
  },
  {
    kind: 'vref',
    label: '수직 기준선',
    hint: '기준선을 놓을 위치를 누르세요.',
    Icon: MoveVertical,
  },
  {
    kind: 'href',
    label: '수평 기준선',
    hint: '기준선을 놓을 위치를 누르세요.',
    Icon: MoveHorizontal,
  },
  {
    kind: 'marker',
    label: '포인트',
    hint: '릴리스 포인트처럼 짚어둘 위치를 누르세요.',
    Icon: Crosshair,
  },
];

/** 촬영 배경이 밝든 어둡든 읽히도록 절제된 고대비 색만 쓴다. */
export const DRAW_COLORS = ['#F5F5F4', '#E3CB95', '#5EEAD4', '#FCA5A5'];

/**
 * 측정값 글자 크기. 화면이 작을수록 함께 줄여야 영상을 덜 가린다.
 * (폰 세로에서 캔버스 폭이 300px 안팎이라 고정 크기로 두면 너무 커진다.)
 */
function readoutFont(canvasWidth: number) {
  const size = Math.round(Math.max(7, Math.min(11, canvasWidth / 42)));
  return {
    font: `600 ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
    size,
  };
}

/** 세 점이 이루는 각도(도). v가 꼭짓점. 반드시 화면 픽셀 좌표로 넘겨야 한다. */
export function angleAt(a: Point, v: Point, b: Point) {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x);
  const a2 = Math.atan2(b.y - v.y, b.x - v.x);
  let deg = Math.abs((a1 - a2) * (180 / Math.PI));
  if (deg > 180) deg = 360 - deg;
  return deg;
}

/** 선이 수직축에서 몇 도 기울었는지 (0=수직, 90=수평). 픽셀 좌표 기준. */
export function tiltFromVertical(a: Point, b: Point) {
  return (Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 180) / Math.PI;
}

/* --------------------------- 그리기 유틸 --------------------------- */

/** 어떤 영상 위에서도 보이도록 어두운 테두리를 깔고 그 위에 선을 얹는다. */
function stroke(
  ctx: CanvasRenderingContext2D,
  path: () => void,
  color: string,
  { dash, width = 1.5 }: { dash?: number[]; width?: number } = {}
) {
  ctx.save();
  ctx.setLineDash(dash ?? []);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(8,8,10,0.55)';
  ctx.lineWidth = width + 2;
  path();
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  path();
  ctx.stroke();
  ctx.restore();
}

/** 측정값을 다는 작은 칩 */
function readout(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  canvasWidth: number
) {
  const { font, size } = readoutFont(canvasWidth);
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + size * 0.7;
  const h = size + 5;

  // 테두리를 빼고 배경만 살짝 깔아 영상이 최대한 비치게 한다.
  ctx.fillStyle = 'rgba(8,8,10,0.6)';
  ctx.beginPath();
  // roundRect는 구형 사파리에 없어서 없으면 각진 사각형으로 대체한다.
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 2);
  } else {
    ctx.rect(x - w / 2, y - h / 2, w, h);
  }
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

/** 선 끝을 정확히 어디에 찍었는지 보이도록 작은 손잡이를 그린다. */
function handle(ctx: CanvasRenderingContext2D, p: Point, color: string) {
  const r = 1.75; // 반지름. 측정선을 가리지 않도록 작게 유지한다.
  ctx.save();
  ctx.strokeStyle = 'rgba(8,8,10,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
  ctx.stroke();
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  w: number,
  h: number,
  box: ContentBox
) {
  // 저장된 비율을 영상 화면 안의 실제 위치로 되돌린다.
  const px = (p: Point) => ({
    x: box.ox + p.x * box.dw,
    y: box.oy + p.y * box.dh,
  });

  switch (shape.kind) {
    case 'vref': {
      const x = box.ox + shape.x * box.dw;
      // 기준선은 측정선보다 얇은 실선으로 둬서 서로 구분되게 한다.
      stroke(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        },
        shape.color,
        { width: 1 }
      );
      // 눈금
      ctx.save();
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 1;
      for (let y = 24; y < h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x + 3, y);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'href': {
      const y = box.oy + shape.y * box.dh;
      stroke(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        },
        shape.color,
        { width: 1 }
      );
      ctx.save();
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 1;
      for (let x = 24; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x, y + 3);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'tilt': {
      const a = px(shape.a);
      const b = px(shape.b);
      stroke(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }, shape.color);

      // 기울기를 재는 기준이 되는 수직선을 옅게 함께 보여준다.
      const top = a.y <= b.y ? a : b;
      const bottom = a.y <= b.y ? b : a;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(245,245,244,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bottom.x, bottom.y);
      ctx.lineTo(bottom.x, top.y);
      ctx.stroke();
      ctx.restore();

      handle(ctx, a, shape.color);
      handle(ctx, b, shape.color);

      // 라벨을 선 위에 얹으면 정작 봐야 할 동작을 가린다.
      // 선과 직각 방향으로 살짝 비켜 놓는다.
      const deg = tiltFromVertical(a, b);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const offset = 14;
      readout(
        ctx,
        `${deg.toFixed(1)}°`,
        (a.x + b.x) / 2 + nx * offset,
        (a.y + b.y) / 2 + ny * offset,
        shape.color,
        w
      );
      break;
    }
    case 'angle': {
      const a = px(shape.a);
      const v = px(shape.v);
      const b = px(shape.b);

      stroke(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(v.x, v.y);
        ctx.lineTo(b.x, b.y);
      }, shape.color);

      const r = Math.min(
        30,
        Math.hypot(a.x - v.x, a.y - v.y) * 0.45,
        Math.hypot(b.x - v.x, b.y - v.y) * 0.45
      );
      const start = Math.atan2(a.y - v.y, a.x - v.x);
      const end = Math.atan2(b.y - v.y, b.x - v.x);
      let diff = end - start;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;

      ctx.save();
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(v.x, v.y, r, start, start + diff);
      ctx.stroke();
      ctx.restore();

      handle(ctx, a, shape.color);
      handle(ctx, v, shape.color);
      handle(ctx, b, shape.color);

      const mid = start + diff / 2;
      readout(
        ctx,
        `${angleAt(a, v, b).toFixed(1)}°`,
        v.x + Math.cos(mid) * (r + 15),
        v.y + Math.sin(mid) * (r + 15),
        shape.color,
        w
      );
      break;
    }
    case 'marker': {
      const p = px(shape.p);
      stroke(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(p.x - 11, p.y);
        ctx.lineTo(p.x - 4, p.y);
        ctx.moveTo(p.x + 4, p.y);
        ctx.lineTo(p.x + 11, p.y);
        ctx.moveTo(p.x, p.y - 11);
        ctx.lineTo(p.x, p.y - 4);
        ctx.moveTo(p.x, p.y + 4);
        ctx.lineTo(p.x, p.y + 11);
      }, shape.color);
      ctx.save();
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
}

/* ------------------------------ 캔버스 ------------------------------ */

export function VideoCanvas({
  shapes,
  onCommit,
  tool,
  color,
  enabled,
  videoRef,
}: {
  shapes: Shape[];
  onCommit: (shape: Shape) => void;
  tool: ToolKind;
  color: string;
  enabled: boolean;
  /** 영상 원본 비율을 알아야 그림을 화면에 붙여둘 수 있다. */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState<Shape | null>(null);
  // 각도는 세 번 눌러야 완성되므로 찍은 점을 모아둔다.
  const [anglePts, setAnglePts] = useState<Point[]>([]);
  const drawingRef = useRef(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const nextW = Math.round(rect.width * dpr);
    const nextH = Math.round(rect.height * dpr);
    /*
     * 화면 밀도에 맞춰 실제 픽셀 수를 맞춰야 선이 흐려지지 않는다.
     * 가로만 검사하면 '높이만 바뀌는 경우'(측정 도구를 켜서 영상 영역이 줄 때 등)에
     * 예전 높이가 남아 브라우저가 캔버스를 세로로 늘려버린다.
     * 그러면 그린 위치가 손가락보다 위/아래로 밀린다. 반드시 둘 다 확인한다.
     */
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const video = videoRef?.current;
    const box = getContentBox(
      rect.width,
      rect.height,
      video?.videoWidth ?? 0,
      video?.videoHeight ?? 0
    );

    for (const s of shapes) drawShape(ctx, s, rect.width, rect.height, box);
    if (draft) drawShape(ctx, draft, rect.width, rect.height, box);

    // 각도 만드는 중에 찍은 점 표시
    for (const p of anglePts) {
      handle(
        ctx,
        { x: box.ox + p.x * box.dw, y: box.oy + p.y * box.dh },
        color
      );
    }
  }, [shapes, draft, anglePts, color, videoRef]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // 창 크기가 바뀌면 다시 그린다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  // 영상 원본 크기는 메타데이터가 로드된 뒤에야 알 수 있다.
  // 그때 그리는 기준 영역이 바뀌므로 다시 그려야 한다.
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    video.addEventListener('loadedmetadata', redraw);
    return () => video.removeEventListener('loadedmetadata', redraw);
  }, [videoRef, redraw]);

  /** 누른 위치를 '영상 화면 안'의 비율로 바꾼다. */
  const toPoint = (e: React.PointerEvent): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    const video = videoRef?.current;
    const box = getContentBox(
      rect.width,
      rect.height,
      video?.videoWidth ?? 0,
      video?.videoHeight ?? 0
    );
    return {
      x: (e.clientX - rect.left - box.ox) / box.dw,
      y: (e.clientY - rect.top - box.oy) / box.dh,
    };
  };

  const handleDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPoint(e);

    if (tool === 'vref') return onCommit({ kind: 'vref', color, x: p.x });
    if (tool === 'href') return onCommit({ kind: 'href', color, y: p.y });
    if (tool === 'marker') return onCommit({ kind: 'marker', color, p });

    if (tool === 'angle') {
      const next = [...anglePts, p];
      if (next.length === 3) {
        onCommit({ kind: 'angle', color, a: next[0], v: next[1], b: next[2] });
        setAnglePts([]);
      } else {
        setAnglePts(next);
      }
      return;
    }

    drawingRef.current = true;
    setDraft({ kind: 'tilt', color, a: p, b: p });
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!enabled || !drawingRef.current) return;
    const p = toPoint(e);
    setDraft((prev) => (prev && prev.kind === 'tilt' ? { ...prev, b: p } : prev));
  };

  const handleUp = () => {
    if (!enabled || !drawingRef.current) return;
    drawingRef.current = false;
    setDraft((prev) => {
      // 점만 찍고 만 경우는 버린다.
      if (prev && prev.kind === 'tilt') {
        if (Math.hypot(prev.a.x - prev.b.x, prev.a.y - prev.b.y) > 0.01) onCommit(prev);
      }
      return null;
    });
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      className={`absolute inset-0 h-full w-full ${
        enabled ? 'cursor-crosshair touch-none' : 'pointer-events-none'
      }`}
    />
  );
}

/* ------------------------------ 도구 모음 ------------------------------ */

export function DrawingToolbar({
  tool,
  onTool,
  color,
  onColor,
  onUndo,
  onClear,
  canUndo,
  compact = false,
}: {
  tool: ToolKind;
  onTool: (t: ToolKind) => void;
  color: string;
  onColor: (c: string) => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
  /** 2분할처럼 좁은 곳에서는 설명을 감춘다 */
  compact?: boolean;
}) {
  const active = DRAW_TOOLS.find((t) => t.kind === tool);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line bg-surface px-3 py-2.5">
      <div className="flex overflow-hidden rounded-lg border border-line">
        {DRAW_TOOLS.map((t, i) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => onTool(t.kind)}
            aria-pressed={tool === t.kind}
            title={t.label}
            aria-label={t.label}
            className={`flex h-10 items-center gap-1.5 px-2.5 text-[11px] transition-colors ${
              i > 0 ? 'border-l border-line' : ''
            } ${
              tool === t.kind
                ? 'bg-sky font-semibold text-white'
                : 'text-muted hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <t.Icon
              className={`h-3.5 w-3.5 ${t.kind === 'tilt' ? 'rotate-90' : ''}`}
            />
            {!compact && <span className="hidden md:inline">{t.label}</span>}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        {DRAW_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColor(c)}
            aria-pressed={color === c}
            aria-label={`선 색 ${c}`}
            className={`h-7 w-7 rounded border transition-colors ${
              color === c ? 'border-sky' : 'border-line hover:border-line-strong'
            }`}
          >
            <span
              className="mx-auto block h-3.5 w-3.5 rounded-sm"
              style={{ backgroundColor: c }}
            />
          </button>
        ))}
      </div>

      <div className="ml-auto flex gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="되돌리기"
          title="되돌리기"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-sky hover:text-sky disabled:opacity-40"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canUndo}
          aria-label="전체 지우기"
          title="전체 지우기"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-40"
        >
          <Eraser className="h-4 w-4" />
        </button>
      </div>

      {!compact && active && (
        <p className="w-full text-[11px] text-muted">{active.hint}</p>
      )}
    </div>
  );
}
