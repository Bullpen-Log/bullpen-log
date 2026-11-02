/**
 * 그림 고치기(UI06 — 순수). 손잡이(꼭짓점) 하나 옮기기 · 통째 옮기기. 좌표는 늘 원본 영상 좌표(0~1) — 화면 px 로 바꿔 두지 않는다.
 * 그림 판(annotation-layer.tsx)은 끄는 동안 이 값으로 그리기만 하고, 손을 뗄 때 한 번만 문서에 쓴다(되돌리기 한 번 = 끌기 한 번).
 */
import type { Geometry } from '~/compare/annotations';
import type { Pt } from '~/compare/geometry';

/** 손잡이로 고칠 수 있는 점(원본 좌표) — 자유선은 통째 옮기기만 */
export function handlesOf(g: Geometry): Pt[] {
  switch (g.kind) {
    case 'free':
      return [];
    case 'line':
    case 'arrow':
    case 'rect':
    case 'tilt':
      return [g.a, g.b];
    case 'circle':
      return [g.c, g.edge];
    case 'label':
    case 'point':
      return [g.p];
    case 'href':
      return [{ u: 0.5, v: g.v }];
    case 'vref':
      return [{ u: g.u, v: 0.5 }];
    case 'angle':
      return [g.a, g.vtx, g.b];
  }
}
/** 손잡이 하나만 옮긴 그림 */
export function withHandle(g: Geometry, i: number, p: Pt): Geometry {
  switch (g.kind) {
    case 'free':
      return g;
    case 'line':
    case 'arrow':
    case 'rect':
    case 'tilt':
      return i === 0 ? { ...g, a: p } : { ...g, b: p };
    case 'circle':
      /* 가운데를 옮기면 원 통째, 가장자리를 옮기면 크기 */
      return i === 0 ? { ...g, c: p, edge: { u: g.edge.u + p.u - g.c.u, v: g.edge.v + p.v - g.c.v } } : { ...g, edge: p };
    case 'label':
    case 'point':
      return { ...g, p };
    case 'href':
      return { ...g, v: p.v };
    case 'vref':
      return { ...g, u: p.u };
    case 'angle':
      return i === 0 ? { ...g, a: p } : i === 1 ? { ...g, vtx: p } : { ...g, b: p };
  }
}

/** 그림 통째 옮기기(원본 좌표) */
export function translate(g: Geometry, du: number, dv: number): Geometry {
  const m = (p: Pt): Pt => ({ u: p.u + du, v: p.v + dv });
  switch (g.kind) {
    case 'free':
      return { ...g, pts: g.pts.map(m) };
    case 'line':
    case 'arrow':
    case 'rect':
    case 'tilt':
      return { ...g, a: m(g.a), b: m(g.b) };
    case 'circle':
      return { ...g, c: m(g.c), edge: m(g.edge) };
    case 'label':
    case 'point':
      return { ...g, p: m(g.p) };
    case 'href':
      return { ...g, v: Math.min(1, Math.max(0, g.v + dv)) };
    case 'vref':
      return { ...g, u: Math.min(1, Math.max(0, g.u + du)) };
    case 'angle':
      return { ...g, a: m(g.a), vtx: m(g.vtx), b: m(g.b) };
  }
}

