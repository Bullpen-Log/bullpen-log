import { useRef, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { measureText, simplifyFree, type Annotation, type Geometry, type ToolKind } from '~/compare/annotations';
import { clampPt, inside, panBy, toScreen, toSource, zoomAt, type Calibration, type Pane, type Pt, type Px, type ViewTransform } from '~/compare/geometry';

/**
 * 비교 칸 위 그림 판(R12 · R13) — 그림은 원본 영상 좌표로 받고(geometry.toSource), 화면에는 칸의 보기 변환(확대 · 이동 · 반전)을 거쳐 그린다.
 * 손가락: 그리는 중이면 한 손가락 = 그리기(끌기 도구) · 짚기(누르기 도구), 두 손가락 = 확대 · 이동. 그리지 않을 땐 두 손가락 확대 · 이동만
 * (한 손가락은 밑의 칸 고르기 · 굴리기로 간다). 고르기 도구는 가까운 그림을 골라 끌어 옮긴다.
 */
export type DrawTool = ToolKind | 'select';
const SHADE = 'rgba(8,8,10,0.55)';
const HIT = 24;

export function AnnotationLayer({
  pane,
  view,
  items,
  drawing,
  tool,
  color,
  width,
  selectedId,
  calibration,
  onCreate,
  onMove,
  onSelect,
  onView,
  onNeedText,
  onStroke,
}: {
  pane: Pane;
  view: ViewTransform;
  /** 지금 보이는 그림(이 칸 · 이 시각) */
  items: Annotation[];
  drawing: boolean;
  tool: DrawTool;
  color: string;
  width: number;
  selectedId: string | null;
  calibration: Calibration | null;
  onCreate: (g: Geometry) => void;
  onMove: (id: string, g: Geometry) => void;
  onSelect: (id: string | null) => void;
  onView: (v: ViewTransform) => void;
  /** 글 도구 — 글자를 물어 받는다(화면이 창을 띄운다) */
  onNeedText: (p: Pt) => void;
  /** 손가락으로 그리는 중인가(F08 — 그 동안만 바깥 화면 굴림을 멈춘다. 그리기 도구를 켰다고 화면 전체를 잠그지 않는다) */
  onStroke?: (active: boolean) => void;
}) {
  const [draft, setDraft] = useState<Geometry | null>(null);
  const [anglePts, setAnglePts] = useState<Pt[]>([]);
  /* 한 손가락 — RN 터치(responder). 두 손가락이 닿으면 밑의 확대 손짓이 가져가 이 터치는 끊긴다(onResponderTerminate) */
  const touch = useRef<{ x0: number; y0: number; t0: number; moved: boolean; start: Pt; free: Pt[]; grab: { id: string; from: Pt; geom: Geometry } | null; draft: Geometry | null } | null>(null);
  const [pinchBase, setPinchBase] = useState<ViewTransform | null>(null);
  const toolKey = `${tool}:${drawing}`;
  const [ptsFor, setPtsFor] = useState(toolKey);
  if (ptsFor !== toolKey) {
    setPtsFor(toolKey);
    setAnglePts([]);
    setDraft(null);
  }

  const src = (x: number, y: number) => toSource({ x, y }, pane, view);
  const scr = (p: Pt) => toScreen(p, pane, view);
  const dragTools: ToolKind[] = ['free', 'line', 'arrow', 'rect', 'circle', 'tilt'];
  const isDrag = (t: DrawTool): t is ToolKind => dragTools.includes(t as ToolKind);

  const hitTest = (x: number, y: number): Annotation | null => {
    let best: { a: Annotation; d: number } | null = null;
    for (const a of items) {
      const d = distanceTo(a.geom, { x, y }, scr, pane);
      if (d <= HIT && (!best || d < best.d)) best = { a, d };
    }
    return best?.a ?? null;
  };

  const down = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    const p = src(x, y);
    const hit = tool === 'select' ? hitTest(x, y) : null;
    touch.current = { x0: x, y0: y, t0: Date.now(), moved: false, start: p, free: [p], grab: hit ? { id: hit.id, from: p, geom: hit.geom } : null, draft: null };
    onStroke?.(true);
    if (hit) onSelect(hit.id);
  };
  const move = (e: GestureResponderEvent) => {
    const t = touch.current;
    if (!t) return;
    const { locationX: x, locationY: y } = e.nativeEvent;
    if (!t.moved && Math.hypot(x - t.x0, y - t.y0) < 4) return;
    t.moved = true;
    const p = src(x, y);
    if (tool === 'select') {
      if (t.grab) onMove(t.grab.id, translate(t.grab.geom, p.u - t.grab.from.u, p.v - t.grab.from.v));
      return;
    }
    if (!isDrag(tool) || !inside(t.start)) return;
    const q = clampPt(p);
    if (tool === 'free') {
      t.free.push(q);
      t.draft = { kind: 'free', pts: [...t.free] };
    } else t.draft = dragGeom(tool, t.start, q);
    setDraft(t.draft);
  };
  const tapAt = (p: Pt, x: number, y: number) => {
    if (tool === 'select') return onSelect(hitTest(x, y)?.id ?? null);
    if (!inside(p)) return;
    if (tool === 'point') return onCreate({ kind: 'point', p });
    if (tool === 'href') return onCreate({ kind: 'href', v: p.v });
    if (tool === 'vref') return onCreate({ kind: 'vref', u: p.u });
    if (tool === 'label') return onNeedText(p);
    if (tool === 'angle') {
      const next = [...anglePts, p];
      if (next.length === 3) {
        setAnglePts([]);
        onCreate({ kind: 'angle', a: next[0], vtx: next[1], b: next[2] });
      } else setAnglePts(next);
    }
  };
  const up = () => {
    const t = touch.current;
    touch.current = null;
    setDraft(null);
    onStroke?.(false);
    if (!t) return;
    if (!t.moved) return tapAt(t.start, t.x0, t.y0);
    const d = t.draft;
    if (!d) return;
    if (d.kind === 'free') {
      const pts = simplifyFree(t.free);
      if (pts.length >= 2) onCreate({ kind: 'free', pts });
      return;
    }
    if (!tooSmall(d, scr)) onCreate(d);
  };
  /* 두 손가락에 빼앗기면 그리던 것은 버린다 */
  const cancel = () => {
    touch.current = null;
    setDraft(null);
    onStroke?.(false);
  };

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => setPinchBase(view))
    .onUpdate((e) => {
      const base = pinchBase ?? view;
      onView(zoomAt(base, pane, { x: e.focalX, y: e.focalY }, base.zoom * e.scale));
    })
    .onFinalize(() => setPinchBase(null));
  const twoPan = Gesture.Pan()
    .runOnJS(true)
    .minPointers(2)
    .onUpdate((e) => {
      const base = pinchBase ?? view;
      if (view.zoom <= 1) return;
      onView(panBy(base, pane, e.translationX, e.translationY));
    });
  const gesture = Gesture.Simultaneous(pinch, twoPan);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={StyleSheet.absoluteFill}
        collapsable={false}
        onStartShouldSetResponder={() => drawing}
        onMoveShouldSetResponder={() => drawing}
        onResponderTerminationRequest={() => true}
        onResponderGrant={down}
        onResponderMove={move}
        onResponderRelease={up}
        onResponderTerminate={cancel}
      >
        {pane.w > 0 ? (
          <Svg width={pane.w} height={pane.h} pointerEvents="none">
            {items.map((a) => (
              <Shape key={a.id} g={a.geom} color={a.color} width={a.width} scr={scr} pane={pane} label={measureText(a.geom, pane.aspect, calibration)} selected={a.id === selectedId} />
            ))}
            {draft ? <Shape g={draft} color={color} width={width} scr={scr} pane={pane} label={measureText(draft, pane.aspect, calibration)} selected={false} /> : null}
            {anglePts.map((p, i) => {
              const s = scr(p);
              return <Circle key={i} cx={s.x} cy={s.y} r={5} stroke={color} strokeWidth={2} fill={SHADE} />;
            })}
          </Svg>
        ) : null}
      </View>
    </GestureDetector>
  );
}

function dragGeom(tool: ToolKind, a: Pt, b: Pt): Geometry {
  switch (tool) {
    case 'circle':
      return { kind: 'circle', c: a, edge: b };
    case 'line':
    case 'arrow':
    case 'rect':
    case 'tilt':
      return { kind: tool, a, b };
    default:
      return { kind: 'line', a, b };
  }
}

function tooSmall(g: Geometry, scr: (p: Pt) => Px): boolean {
  if (g.kind === 'line' || g.kind === 'arrow' || g.kind === 'rect' || g.kind === 'tilt') {
    const a = scr(g.a);
    const b = scr(g.b);
    return Math.hypot(a.x - b.x, a.y - b.y) < 6;
  }
  if (g.kind === 'circle') {
    const a = scr(g.c);
    const b = scr(g.edge);
    return Math.hypot(a.x - b.x, a.y - b.y) < 6;
  }
  return false;
}

/** 그림 통째 옮기기(원본 좌표) */
function translate(g: Geometry, du: number, dv: number): Geometry {
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

const segDist = (p: Px, a: Px, b: Px) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** 화면 px 거리(고르기) */
function distanceTo(g: Geometry, p: Px, scr: (q: Pt) => Px, pane: Pane): number {
  switch (g.kind) {
    case 'free': {
      let d = Infinity;
      for (let i = 1; i < g.pts.length; i++) d = Math.min(d, segDist(p, scr(g.pts[i - 1]), scr(g.pts[i])));
      return d;
    }
    case 'line':
    case 'arrow':
    case 'tilt':
      return segDist(p, scr(g.a), scr(g.b));
    case 'rect': {
      const a = scr(g.a);
      const b = scr(g.b);
      const c1 = { x: a.x, y: b.y };
      const c2 = { x: b.x, y: a.y };
      return Math.min(segDist(p, a, c1), segDist(p, c1, b), segDist(p, b, c2), segDist(p, c2, a));
    }
    case 'circle': {
      const c = scr(g.c);
      const e = scr(g.edge);
      return Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(e.x - c.x, e.y - c.y));
    }
    case 'label':
    case 'point': {
      const s = scr(g.p);
      return Math.hypot(p.x - s.x, p.y - s.y);
    }
    case 'href':
      return Math.abs(scr({ u: 0, v: g.v }).y - p.y);
    case 'vref':
      return Math.abs(scr({ u: g.u, v: 0 }).x - p.x);
    case 'angle':
      return Math.min(segDist(p, scr(g.a), scr(g.vtx)), segDist(p, scr(g.vtx), scr(g.b)));
  }
  void pane;
}

function Stroke({ d, color, width, dash }: { d: string; color: string; width: number; dash?: number[] }) {
  return (
    <>
      <Path d={d} stroke={SHADE} strokeWidth={width + 2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={dash} />
    </>
  );
}

function Readout({ text, at, color }: { text: string; at: Px; color: string }) {
  const size = 11;
  const w = text.length * size * 0.62 + 10;
  return (
    <G>
      <Rect x={at.x - w / 2} y={at.y - 9} width={w} height={18} rx={4} fill="rgba(8,8,10,0.66)" />
      <SvgText x={at.x} y={at.y + 4} fontSize={size} fontWeight="600" fill={color} textAnchor="middle">
        {text}
      </SvgText>
    </G>
  );
}

function Shape({ g, color, width, scr, pane, label, selected }: { g: Geometry; color: string; width: number; scr: (p: Pt) => Px; pane: Pane; label: string | null; selected: boolean }) {
  const sel = selected ? <Selection g={g} scr={scr} /> : null;
  switch (g.kind) {
    case 'free':
      return (
        <G>
          <Stroke d={g.pts.map((p, i) => `${i ? 'L' : 'M'}${scr(p).x},${scr(p).y}`).join(' ')} color={color} width={width} />
          {sel}
        </G>
      );
    case 'line':
    case 'tilt': {
      const a = scr(g.a);
      const b = scr(g.b);
      return (
        <G>
          <Stroke d={`M${a.x},${a.y} L${b.x},${b.y}`} color={color} width={width} />
          {g.kind === 'tilt' ? <Line x1={a.y > b.y ? a.x : b.x} y1={Math.max(a.y, b.y)} x2={a.y > b.y ? a.x : b.x} y2={Math.min(a.y, b.y)} stroke="rgba(245,245,244,0.4)" strokeWidth={1} strokeDasharray={[4, 4]} /> : null}
          {label ? <Readout text={label} at={{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 16 }} color={color} /> : null}
          {sel}
        </G>
      );
    }
    case 'arrow': {
      const a = scr(g.a);
      const b = scr(g.b);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const h = 10 + width * 2;
      const p1 = { x: b.x - h * Math.cos(ang - 0.45), y: b.y - h * Math.sin(ang - 0.45) };
      const p2 = { x: b.x - h * Math.cos(ang + 0.45), y: b.y - h * Math.sin(ang + 0.45) };
      return (
        <G>
          <Stroke d={`M${a.x},${a.y} L${b.x},${b.y}`} color={color} width={width} />
          <Polygon points={`${b.x},${b.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={color} stroke={SHADE} strokeWidth={1} />
          {label ? <Readout text={label} at={{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 16 }} color={color} /> : null}
          {sel}
        </G>
      );
    }
    case 'rect': {
      const a = scr(g.a);
      const b = scr(g.b);
      return (
        <G>
          <Stroke d={`M${a.x},${a.y} L${b.x},${a.y} L${b.x},${b.y} L${a.x},${b.y} Z`} color={color} width={width} />
          {sel}
        </G>
      );
    }
    case 'circle': {
      const c = scr(g.c);
      const e = scr(g.edge);
      const r = Math.hypot(e.x - c.x, e.y - c.y);
      return (
        <G>
          <Circle cx={c.x} cy={c.y} r={r} stroke={SHADE} strokeWidth={width + 2} fill="none" />
          <Circle cx={c.x} cy={c.y} r={r} stroke={color} strokeWidth={width} fill="none" />
          {sel}
        </G>
      );
    }
    case 'label': {
      const p = scr(g.p);
      return (
        <G>
          <Readout text={g.text} at={p} color={color} />
          {sel}
        </G>
      );
    }
    case 'point': {
      const { x, y } = scr(g.p);
      return (
        <G>
          <Stroke d={`M${x - 12},${y} L${x - 4},${y} M${x + 4},${y} L${x + 12},${y} M${x},${y - 12} L${x},${y - 4} M${x},${y + 4} L${x},${y + 12}`} color={color} width={width} />
          <Circle cx={x} cy={y} r={3} stroke={color} strokeWidth={1.5} fill="none" />
          {sel}
        </G>
      );
    }
    case 'href': {
      const y = scr({ u: 0, v: g.v }).y;
      return (
        <G>
          <Stroke d={`M0,${y} L${pane.w},${y}`} color={color} width={1} dash={[8, 6]} />
          {sel}
        </G>
      );
    }
    case 'vref': {
      const x = scr({ u: g.u, v: 0 }).x;
      return (
        <G>
          <Stroke d={`M${x},0 L${x},${pane.h}`} color={color} width={1} dash={[8, 6]} />
          {sel}
        </G>
      );
    }
    case 'angle': {
      const a = scr(g.a);
      const v = scr(g.vtx);
      const b = scr(g.b);
      return (
        <G>
          <Stroke d={`M${a.x},${a.y} L${v.x},${v.y} L${b.x},${b.y}`} color={color} width={width} />
          <Circle cx={v.x} cy={v.y} r={4} stroke={color} strokeWidth={1.5} fill={SHADE} />
          {label ? <Readout text={label} at={{ x: v.x, y: v.y - 22 }} color={color} /> : null}
          {sel}
        </G>
      );
    }
  }
}

/** 고른 그림 표시 — 점선 테두리 */
function Selection({ g, scr }: { g: Geometry; scr: (p: Pt) => Px }) {
  const pts: Px[] =
    g.kind === 'free'
      ? g.pts.map(scr)
      : g.kind === 'circle'
        ? [scr(g.c), scr(g.edge)]
        : g.kind === 'label' || g.kind === 'point'
          ? [scr(g.p)]
          : g.kind === 'angle'
            ? [scr(g.a), scr(g.vtx), scr(g.b)]
            : g.kind === 'href' || g.kind === 'vref'
              ? []
              : [scr(g.a), scr(g.b)];
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = 10;
  return (
    <Rect
      x={Math.min(...xs) - pad}
      y={Math.min(...ys) - pad}
      width={Math.max(...xs) - Math.min(...xs) + pad * 2}
      height={Math.max(...ys) - Math.min(...ys) + pad * 2}
      stroke="#93C5FD"
      strokeWidth={1.5}
      strokeDasharray={[5, 4]}
      fill="none"
    />
  );
}
