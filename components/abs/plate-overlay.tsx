'use client';

import { useRef } from 'react';
import type { Pixel, zonePolygonPx } from '@/lib/abs/calib';
import { visibleFrameRect } from '@/lib/velocity-setup';
import type { PlateEnds } from './use-abs-session';

type Poly = NonNullable<ReturnType<typeof zonePolygonPx>>;

/**
 * 뷰파인더 위 ABS 그림 — 플레이트 앞변(두 끝 · 선), 존 상자(앞면 흰 선 · 뒷면 점선 · 모서리 잇기), 플레이트 오각형. 좌표는 원본 px → 뷰(object-cover 로
 * 잘린 몫을 뺀 뒤) px. 직접 맞추기(manual)면 두 끝에 손잡이(누르는 자리 44px)를 끌 수 있다.
 */
export function PlateOverlay({
  ends,
  poly,
  frame,
  view,
  manual,
  onEnds,
  dim = false,
}: {
  ends: PlateEnds | null;
  poly: Poly | null;
  frame: { width: number; height: number };
  view: { width: number; height: number };
  manual: boolean;
  onEnds?: (e: PlateEnds) => void;
  /** 측정 중엔 옅게 */
  dim?: boolean;
}) {
  const v = visibleFrameRect(frame, view);
  const toView = (p: Pixel): Pixel => [((p[0] / frame.width - v.x) / v.w) * view.width, ((p[1] / frame.height - v.y) / v.h) * view.height];
  const toFrame = (x: number, y: number): Pixel => [(v.x + (x / view.width) * v.w) * frame.width, (v.y + (y / view.height) * v.h) * frame.height];
  const dragging = useRef<'left' | 'right' | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointOf = (e: React.PointerEvent) => {
    const box = svgRef.current?.getBoundingClientRect();
    return box ? toFrame(e.clientX - box.left, e.clientY - box.top) : null;
  };
  const stroke = dim ? 'rgba(255,255,255,0.55)' : 'white';
  const L = ends ? toView(ends.left) : null;
  const R = ends ? toView(ends.right) : null;
  const pts = (ps: Pixel[]) => ps.map((p) => toView(p).map((n) => n.toFixed(1)).join(',')).join(' ');
  return (
    <svg
      ref={svgRef}
      aria-hidden
      className={`absolute inset-0 h-full w-full ${manual ? 'touch-none' : 'pointer-events-none'}`}
      width={view.width}
      height={view.height}
      onPointerMove={(e) => {
        if (!dragging.current || !ends || !onEnds) return;
        const p = pointOf(e);
        if (!p) return;
        onEnds(dragging.current === 'left' ? { ...ends, left: p } : { ...ends, right: p });
      }}
      onPointerUp={() => (dragging.current = null)}
      onPointerCancel={() => (dragging.current = null)}
      onPointerDown={(e) => {
        if (!manual || !onEnds) return;
        const p = pointOf(e);
        if (!p) return;
        /* 끝이 없으면 처음 누른 자리에 56px 너비로 둔다 */
        if (!ends) {
          onEnds({ left: [p[0] - 28, p[1]], right: [p[0] + 28, p[1]] });
          return;
        }
        const pv = toView(p);
        const dl = L ? Math.hypot(pv[0] - L[0], pv[1] - L[1]) : Infinity;
        const dr = R ? Math.hypot(pv[0] - R[0], pv[1] - R[1]) : Infinity;
        dragging.current = dl <= dr ? 'left' : 'right';
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }}
    >
      {poly && (
        <g fill="none" strokeLinejoin="round">
          <polygon points={pts(poly.plate)} stroke={stroke} strokeWidth={1.5} fill="rgba(255,255,255,0.12)" />
          <polygon points={pts(poly.back)} stroke={stroke} strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
          {poly.front.map((p, i) => {
            const a = toView(p);
            const b = toView(poly.back[i]);
            return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeWidth={1} opacity={0.5} />;
          })}
          <polygon points={pts(poly.front)} stroke={stroke} strokeWidth={2} style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,.6))' }} />
        </g>
      )}
      {L && R && (
        <g>
          <line x1={L[0]} y1={L[1]} x2={R[0]} y2={R[1]} stroke="#0a84d6" strokeWidth={3} strokeLinecap="round" />
          {manual &&
            [L, R].map((p, i) => (
              <g key={i}>
                <circle cx={p[0]} cy={p[1]} r={22} fill="rgba(10,132,214,0.18)" />
                <circle cx={p[0]} cy={p[1]} r={7} fill="#0a84d6" stroke="white" strokeWidth={2} />
              </g>
            ))}
        </g>
      )}
    </svg>
  );
}
