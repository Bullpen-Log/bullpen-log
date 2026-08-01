'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** 좌표는 0~1로 저장한다. 화면 크기가 바뀌어도 그림이 따라간다. */
export type Point = { x: number; y: number };

export type Shape =
  | { kind: 'line'; color: string; a: Point; b: Point }
  | { kind: 'angle'; color: string; a: Point; v: Point; b: Point }
  | { kind: 'vertical'; color: string; x: number }
  | { kind: 'horizontal'; color: string; y: number }
  | { kind: 'free'; color: string; points: Point[] };

export type ToolKind = Shape['kind'];

/** 세 점이 이루는 각도(도). v가 꼭짓점. */
export function angleAt(a: Point, v: Point, b: Point) {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x);
  const a2 = Math.atan2(b.y - v.y, b.x - v.x);
  let deg = Math.abs((a1 - a2) * (180 / Math.PI));
  if (deg > 180) deg = 360 - deg;
  return deg;
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  w: number,
  h: number
) {
  const px = (p: Point) => ({ x: p.x * w, y: p.y * h });

  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (shape.kind) {
    case 'line': {
      const a = px(shape.a);
      const b = px(shape.b);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      break;
    }
    case 'vertical': {
      const x = shape.x * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      break;
    }
    case 'horizontal': {
      const y = shape.y * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      break;
    }
    case 'free': {
      if (shape.points.length < 2) break;
      ctx.beginPath();
      const first = px(shape.points[0]);
      ctx.moveTo(first.x, first.y);
      for (const p of shape.points.slice(1)) {
        const q = px(p);
        ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      break;
    }
    case 'angle': {
      const a = px(shape.a);
      const v = px(shape.v);
      const b = px(shape.b);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(v.x, v.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // 꼭짓점에 호를 그려 각을 표시한다.
      const r = Math.min(
        34,
        Math.hypot(a.x - v.x, a.y - v.y) * 0.5,
        Math.hypot(b.x - v.x, b.y - v.y) * 0.5
      );
      const start = Math.atan2(a.y - v.y, a.x - v.x);
      const end = Math.atan2(b.y - v.y, b.x - v.x);
      let diff = end - start;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;

      ctx.beginPath();
      ctx.arc(v.x, v.y, r, start, start + diff);
      ctx.stroke();

      // 각도는 반드시 화면 픽셀 좌표로 재야 한다.
      // 0~1 정규화 좌표는 가로세로 축척이 달라 눈에 보이는 각도와 어긋난다.
      const deg = angleAt(a, v, b);
      const mid = start + diff / 2;
      const lx = v.x + Math.cos(mid) * (r + 22);
      const ly = v.y + Math.sin(mid) * (r + 22);
      const text = `${deg.toFixed(1)}°`;

      ctx.font = 'bold 15px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(10,10,11,0.78)';
      ctx.fillRect(lx - tw / 2 - 6, ly - 11, tw + 12, 22);
      ctx.fillStyle = shape.color;
      ctx.fillText(text, lx, ly);
      break;
    }
  }
}

export function VideoCanvas({
  shapes,
  onCommit,
  tool,
  color,
  enabled,
}: {
  shapes: Shape[];
  onCommit: (shape: Shape) => void;
  tool: ToolKind;
  color: string;
  enabled: boolean;
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
    // 화면 밀도에 맞춰 실제 픽셀 수를 맞춰야 선이 흐려지지 않는다.
    if (canvas.width !== Math.round(rect.width * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    for (const s of shapes) drawShape(ctx, s, rect.width, rect.height);
    if (draft) drawShape(ctx, draft, rect.width, rect.height);

    // 각도 만드는 중에 찍은 점 표시
    for (const p of anglePts) {
      ctx.beginPath();
      ctx.arc(p.x * rect.width, p.y * rect.height, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }, [shapes, draft, anglePts, color]);

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

  const toPoint = (e: React.PointerEvent): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPoint(e);

    if (tool === 'vertical') return onCommit({ kind: 'vertical', color, x: p.x });
    if (tool === 'horizontal') return onCommit({ kind: 'horizontal', color, y: p.y });

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
    if (tool === 'free') setDraft({ kind: 'free', color, points: [p] });
    else setDraft({ kind: 'line', color, a: p, b: p });
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!enabled || !drawingRef.current) return;
    const p = toPoint(e);
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.kind === 'free') return { ...prev, points: [...prev.points, p] };
      if (prev.kind === 'line') return { ...prev, b: p };
      return prev;
    });
  };

  const handleUp = () => {
    if (!enabled || !drawingRef.current) return;
    drawingRef.current = false;
    setDraft((prev) => {
      if (prev) {
        // 점만 찍고 만 경우는 버린다.
        const meaningful =
          prev.kind === 'free'
            ? prev.points.length > 2
            : prev.kind === 'line'
              ? Math.hypot(prev.a.x - prev.b.x, prev.a.y - prev.b.y) > 0.01
              : true;
        if (meaningful) onCommit(prev);
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
