import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useRef, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';

/**
 * 그날 투구 영상 위에 선 · 각도 그리기 — 웹 components/video-canvas.tsx(VideoCanvas · DrawingToolbar)를 옮겼다. 도구 다섯 · 색 넷 · 되돌리기 ·
 * 전체 지우기 · 셈(수직 대비 기울기 · 세 점 각)은 웹과 같다. 그리기만 캔버스 대신 svg. 사람이 짚는 2D 참고선이다(관절을 따라가지 않고 저장하지 않음).
 * 좌표(2026-10-29)는 판의 비율(0~1) — 판의 크기가 바뀌어도(전체 화면 · 회전 · 글자 크기) 영상에 붙어 있다. 각도는 원본 영상 비율(source)로 셈한다
 * (가로 · 세로 비가 다른 비율 좌표로 바로 셈하면 각이 틀어진다). 내 영상 상세는 판을 영상 비율에 맞춰(레터박스 없이) 깐다.
 */
type P = { x: number; y: number };
export type Shape =
  | { kind: 'vref'; color: string; x: number }
  | { kind: 'href'; color: string; y: number }
  | { kind: 'tilt'; color: string; a: P; b: P }
  | { kind: 'angle'; color: string; a: P; v: P; b: P }
  | { kind: 'marker'; color: string; p: P };
export type ToolKind = Shape['kind'];

/* 웹 DRAW_TOOLS · DRAW_COLORS 와 같은 글 · 색(웹 파일은 웹 그림 패키지를 불러 앱에서 못 가져온다) */
const TOOLS: { kind: ToolKind; label: string; hint: string; icon: SFSymbol }[] = [
  { kind: 'tilt', label: '기울기', hint: '두 점을 이어 수직 대비 기울기를 재요. 몸통·어깨선에 써요.', icon: 'line.diagonal' },
  { kind: 'angle', label: '각도', hint: '세 곳을 차례로 누르세요. 두 번째로 누른 곳이 꼭짓점이에요.', icon: 'angle' },
  { kind: 'vref', label: '수직 기준선', hint: '기준선을 놓을 위치를 누르세요.', icon: 'arrow.up.and.down' },
  { kind: 'href', label: '수평 기준선', hint: '기준선을 놓을 위치를 누르세요.', icon: 'arrow.left.and.right' },
  { kind: 'marker', label: '포인트', hint: '릴리스 포인트처럼 짚어둘 위치를 누르세요.', icon: 'scope' },
];
export const DRAW_COLORS = ['#F5F5F4', '#E3CB95', '#5EEAD4', '#FCA5A5'];
const SHADE = 'rgba(8,8,10,0.55)';

/** 세 점이 이루는 각도(도), v 가 꼭짓점 — 웹 angleAt. 팔이 거의 0 이면(점이 겹침) NaN 대신 null */
export function angleAt(a: P, v: P, b: P): number {
  let deg = Math.abs((Math.atan2(a.y - v.y, a.x - v.x) - Math.atan2(b.y - v.y, b.x - v.x)) * (180 / Math.PI));
  if (deg > 180) deg = 360 - deg;
  return deg;
}
export function safeAngle(a: P, v: P, b: P): number | null {
  return Math.hypot(a.x - v.x, a.y - v.y) < 1e-6 || Math.hypot(b.x - v.x, b.y - v.y) < 1e-6 ? null : angleAt(a, v, b);
}
export function safeTilt(a: P, b: P): number | null {
  return Math.hypot(b.x - a.x, b.y - a.y) < 1e-6 ? null : tiltFromVertical(a, b);
}
/** 선이 수직에서 몇 도 기울었나(0 수직 · 90 수평) — 웹 tiltFromVertical */
export function tiltFromVertical(a: P, b: P) {
  return (Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 180) / Math.PI;
}

/** 어떤 영상 위에서도 보이게 어두운 테두리를 깔고 그 위에 선 — 웹 stroke() */
function Stroke({ d, color, width = 1.5 }: { d: string; color: string; width?: number }) {
  return (
    <>
      <Path d={d} stroke={SHADE} strokeWidth={width + 2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}
/** 측정값 칩 — 웹 readout(글자 크기는 칸 폭에 맞춰 7~11) */
function Readout({ text, x, y, color, w }: { text: string; x: number; y: number; color: string; w: number }) {
  const size = Math.round(Math.max(7, Math.min(11, w / 42)));
  const bw = text.length * size * 0.62 + size * 0.7;
  const bh = size + 5;
  return (
    <G>
      <Rect x={x - bw / 2} y={y - bh / 2} width={bw} height={bh} rx={2} fill="rgba(8,8,10,0.6)" />
      <SvgText x={x} y={y + size * 0.36} fontSize={size} fontWeight="600" fontFamily="Menlo" fill={color} textAnchor="middle">
        {text}
      </SvgText>
    </G>
  );
}
/** 선 끝 손잡이 — 웹 handle(). 고칠 수 있는 판이면 조금 크게(손가락으로 잡는 자리는 HIT 반지름) */
function Handle({ p, color, big }: { p: P; color: string; big?: boolean }) {
  const r = big ? 4.5 : 1.75;
  return (
    <>
      <Rect x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} stroke="rgba(8,8,10,0.6)" strokeWidth={2} fill={big ? 'rgba(8,8,10,0.25)' : 'none'} />
      <Rect x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} stroke={color} strokeWidth={1.2} fill="none" />
    </>
  );
}
/** 손잡이를 잡는 거리(화면 px) — 작게 보여도 손가락 자리는 44pt 쯤 */
const HIT = 22;

/** 판 좌표(0~1) → 화면 px · 원본 비율 px(각도 셈) */
type Frame = { w: number; h: number; sw: number; sh: number };
const toV = (p: P, f: Frame): P => ({ x: p.x * f.w, y: p.y * f.h });
const toS = (p: P, f: Frame): P => ({ x: p.x * f.sw, y: p.y * f.sh });

function ShapeView({ s, f, big }: { s: Shape; f: Frame; big?: boolean }) {
  const { w, h } = f;
  switch (s.kind) {
    case 'vref': {
      const x = s.x * w;
      const ticks = [];
      for (let y = 24; y < h; y += 40) ticks.push(<Line key={y} x1={x - 3} x2={x + 3} y1={y} y2={y} stroke={s.color} strokeWidth={1} />);
      return (
        <G>
          <Stroke d={`M${x},0 L${x},${h}`} color={s.color} width={1} />
          {ticks}
        </G>
      );
    }
    case 'href': {
      const y = s.y * h;
      const ticks = [];
      for (let x = 24; x < w; x += 40) ticks.push(<Line key={x} x1={x} x2={x} y1={y - 3} y2={y + 3} stroke={s.color} strokeWidth={1} />);
      return (
        <G>
          <Stroke d={`M0,${y} L${w},${y}`} color={s.color} width={1} />
          {ticks}
        </G>
      );
    }
    case 'tilt': {
      const a = toV(s.a, f);
      const b = toV(s.b, f);
      const top = a.y <= b.y ? a : b;
      const bottom = a.y <= b.y ? b : a;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      /* 값은 선과 직각으로 비켜 놓는다 — 선 위에 얹으면 봐야 할 동작을 가린다(웹과 같다) */
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const deg = safeTilt(toS(s.a, f), toS(s.b, f));
      return (
        <G>
          <Stroke d={`M${a.x},${a.y} L${b.x},${b.y}`} color={s.color} />
          <Line x1={bottom.x} y1={bottom.y} x2={bottom.x} y2={top.y} stroke="rgba(245,245,244,0.35)" strokeWidth={1} strokeDasharray={[4, 4]} />
          <Handle p={a} color={s.color} big={big} />
          <Handle p={b} color={s.color} big={big} />
          {deg != null ? <Readout text={`${deg.toFixed(1)}°`} x={(a.x + b.x) / 2 + nx * 14} y={(a.y + b.y) / 2 + ny * 14} color={s.color} w={w} /> : null}
        </G>
      );
    }
    case 'angle': {
      const a = toV(s.a, f);
      const v = toV(s.v, f);
      const b = toV(s.b, f);
      const r = Math.min(30, Math.hypot(a.x - v.x, a.y - v.y) * 0.45, Math.hypot(b.x - v.x, b.y - v.y) * 0.45);
      const start = Math.atan2(a.y - v.y, a.x - v.x);
      let diff = Math.atan2(b.y - v.y, b.x - v.x) - start;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const end = start + diff;
      const arc = `M${v.x + Math.cos(start) * r},${v.y + Math.sin(start) * r} A${r},${r} 0 0 ${diff > 0 ? 1 : 0} ${v.x + Math.cos(end) * r},${v.y + Math.sin(end) * r}`;
      const mid = start + diff / 2;
      const deg = safeAngle(toS(s.a, f), toS(s.v, f), toS(s.b, f));
      return (
        <G>
          <Stroke d={`M${a.x},${a.y} L${v.x},${v.y} L${b.x},${b.y}`} color={s.color} />
          {r > 0.5 ? <Path d={arc} stroke={s.color} strokeWidth={1} fill="none" /> : null}
          <Handle p={a} color={s.color} big={big} />
          <Handle p={v} color={s.color} big={big} />
          <Handle p={b} color={s.color} big={big} />
          {deg != null ? <Readout text={`${deg.toFixed(1)}°`} x={v.x + Math.cos(mid) * (r + 15)} y={v.y + Math.sin(mid) * (r + 15)} color={s.color} w={w} /> : null}
        </G>
      );
    }
    case 'marker': {
      const { x, y } = toV(s.p, f);
      return (
        <G>
          <Stroke d={`M${x - 11},${y} L${x - 4},${y} M${x + 4},${y} L${x + 11},${y} M${x},${y - 11} L${x},${y - 4} M${x},${y + 4} L${x},${y + 11}`} color={s.color} />
          <Circle cx={x} cy={y} r={3} stroke={s.color} strokeWidth={1.5} fill="none" />
        </G>
      );
    }
  }
}

/** 도형의 손잡이(판 좌표) — 고칠 때 잡을 점들. 기준선은 선 자체가 손잡이 */
function handlesOf(s: Shape): { key: string; p: P }[] {
  switch (s.kind) {
    case 'tilt':
      return [
        { key: 'a', p: s.a },
        { key: 'b', p: s.b },
      ];
    case 'angle':
      return [
        { key: 'a', p: s.a },
        { key: 'v', p: s.v },
        { key: 'b', p: s.b },
      ];
    case 'marker':
      return [{ key: 'p', p: s.p }];
    default:
      return [];
  }
}
function moveHandle(s: Shape, key: string, p: P): Shape {
  switch (s.kind) {
    case 'tilt':
      return key === 'a' ? { ...s, a: p } : { ...s, b: p };
    case 'angle':
      return key === 'a' ? { ...s, a: p } : key === 'v' ? { ...s, v: p } : { ...s, b: p };
    case 'marker':
      return { ...s, p };
    case 'vref':
      return { ...s, x: p.x };
    case 'href':
      return { ...s, y: p.y };
  }
}

/**
 * 영상 칸 위에 깔리는 그림 판 — 켜져 있을 때만 손가락을 받는다(꺼지면 그림만 보이고 손가락은 밑의 재생기로).
 * 기울기는 끌어서, 각도는 세 번 눌러서, 기준선 · 포인트는 한 번 눌러서(웹 VideoCanvas 와 같다).
 */
export function DrawLayer({
  shapes,
  onCommit,
  onEdit,
  tool,
  color,
  enabled,
  source,
}: {
  shapes: Shape[];
  onCommit: (s: Shape) => void;
  /** 있으면 손잡이를 끌어 고친다(내 영상 상세) — 없으면 예전처럼 새로 그리기만 */
  onEdit?: (index: number, s: Shape) => void;
  tool: ToolKind;
  color: string;
  enabled: boolean;
  /** 원본 영상의 가로 · 세로(비만 쓴다) — 없으면 판 크기(예전과 같다) */
  source?: { w: number; h: number } | null;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Shape | null>(null);
  const [anglePts, setAnglePts] = useState<P[]>([]);
  const draftRef = useRef<Shape | null>(null);
  const editRef = useRef<{ i: number; key: string } | null>(null);
  /* 도구를 바꾸거나 되돌리기 · 지우기를 하면 짚다 만 각도 점은 버린다(남은 점이 다음 도형에 섞이지 않게) */
  const resetKey = `${tool}:${shapes.length}`;
  const [ptsFor, setPtsFor] = useState(resetKey);
  if (ptsFor !== resetKey) {
    setPtsFor(resetKey);
    setAnglePts([]);
  }
  const f: Frame = {
    w: size.w,
    h: size.h,
    sw: source && source.w > 0 && source.h > 0 ? (source.w / source.h) * 1000 : size.w,
    sh: source && source.w > 0 && source.h > 0 ? 1000 : size.h,
  };
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const at = (e: GestureResponderEvent): P => ({ x: clamp01(e.nativeEvent.locationX / (size.w || 1)), y: clamp01(e.nativeEvent.locationY / (size.h || 1)) });
  /* 가장 가까운 손잡이(화면 px 로 HIT 안) — 위에 그린 도형부터 */
  const hit = (e: GestureResponderEvent) => {
    if (!onEdit) return null;
    const x = e.nativeEvent.locationX;
    const y = e.nativeEvent.locationY;
    let best: { i: number; key: string; d: number } | null = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      const pts = handlesOf(s);
      for (const h of pts) {
        const d = Math.hypot(h.p.x * size.w - x, h.p.y * size.h - y);
        if (d <= HIT && (!best || d < best.d)) best = { i, key: h.key, d };
      }
      if (s.kind === 'vref' && Math.abs(s.x * size.w - x) <= HIT / 2 && !best) best = { i, key: 'x', d: 0 };
      if (s.kind === 'href' && Math.abs(s.y * size.h - y) <= HIT / 2 && !best) best = { i, key: 'y', d: 0 };
    }
    return best;
  };

  const down = (e: GestureResponderEvent) => {
    const grab = anglePts.length ? null : hit(e);
    if (grab) {
      editRef.current = { i: grab.i, key: grab.key };
      return;
    }
    const p = at(e);
    if (tool === 'vref') return onCommit({ kind: 'vref', color, x: p.x });
    if (tool === 'href') return onCommit({ kind: 'href', color, y: p.y });
    if (tool === 'marker') return onCommit({ kind: 'marker', color, p });
    if (tool === 'angle') {
      const next = [...anglePts, p];
      if (next.length === 3) {
        onCommit({ kind: 'angle', color, a: next[0], v: next[1], b: next[2] });
        setAnglePts([]);
      } else setAnglePts(next);
      return;
    }
    const start: Shape = { kind: 'tilt', color, a: p, b: p };
    draftRef.current = start;
    setDraft(start);
  };
  const move = (e: GestureResponderEvent) => {
    const ed = editRef.current;
    if (ed && onEdit) {
      const s = shapes[ed.i];
      if (s) onEdit(ed.i, moveHandle(s, ed.key, at(e)));
      return;
    }
    const prev = draftRef.current;
    if (!prev || prev.kind !== 'tilt') return;
    const next = { ...prev, b: at(e) };
    draftRef.current = next;
    setDraft(next);
  };
  const up = () => {
    editRef.current = null;
    const prev = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    /* 점만 찍고 만 것은 버린다(웹은 칸의 1% — 여기선 화면 4px) */
    if (prev?.kind === 'tilt' && Math.hypot((prev.a.x - prev.b.x) * size.w, (prev.a.y - prev.b.y) * size.h) > 4) onCommit(prev);
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={enabled ? 'auto' : 'none'}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      onStartShouldSetResponder={() => enabled}
      onMoveShouldSetResponder={() => enabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={down}
      onResponderMove={move}
      onResponderRelease={up}
      onResponderTerminate={up}
    >
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} pointerEvents="none">
          {shapes.map((s, i) => (
            <ShapeView key={i} s={s} f={f} big={enabled && !!onEdit} />
          ))}
          {draft ? <ShapeView s={draft} f={f} big={enabled && !!onEdit} /> : null}
          {anglePts.map((p, i) => (
            <Handle key={i} p={toV(p, f)} color={color} big={!!onEdit} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** 도구 모음 — 웹 DrawingToolbar(도구 다섯 · 색 넷 · 되돌리기 · 전체 지우기 · 도구 설명 한 줄) */
export function DrawToolbar({
  tool,
  onTool,
  color,
  onColor,
  onUndo,
  onClear,
  canUndo,
}: {
  tool: ToolKind;
  onTool: (t: ToolKind) => void;
  color: string;
  onColor: (c: string) => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
}) {
  const c = usePalette();
  return (
    <View style={[st.bar, { borderColor: c.line, backgroundColor: c.card }]}>
      <View style={st.row}>
        <View style={[st.tools, { borderColor: c.line }]}>
          {TOOLS.map((t, i) => (
            <Press
              key={t.kind}
              select
              selected={tool === t.kind}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: tool === t.kind }}
              onPress={() => onTool(t.kind)}
              style={[st.tool, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.line }, tool === t.kind && { backgroundColor: c.action }]}
            >
              <SymbolView name={t.icon} size={15} weight="semibold" tintColor={tool === t.kind ? '#fff' : c.muted} />
            </Press>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <Press accessibilityRole="button" accessibilityLabel="되돌리기" disabled={!canUndo} onPress={onUndo} style={[st.sq, { borderColor: c.line }, !canUndo && st.off]}>
          <SymbolView name="arrow.uturn.backward" size={15} weight="semibold" tintColor={c.muted} />
        </Press>
        <Press accessibilityRole="button" accessibilityLabel="전체 지우기" disabled={!canUndo} onPress={onClear} style={[st.sq, { borderColor: c.line }, !canUndo && st.off]}>
          <SymbolView name="eraser" size={15} weight="semibold" tintColor={c.muted} />
        </Press>
      </View>
      <View style={[st.row, { gap: 6 }]}>
        {DRAW_COLORS.map((col) => (
          <Press
            key={col}
            select
            selected={color === col}
            accessibilityRole="button"
            accessibilityLabel={`선 색 ${col}`}
            accessibilityState={{ selected: color === col }}
            onPress={() => onColor(col)}
            hitSlop={4}
            style={[st.color, { borderColor: color === col ? c.sky : c.line }]}
          >
            <View style={[st.swatch, { backgroundColor: col }]} />
          </Press>
        ))}
        <Text style={{ flex: 1, color: c.muted, fontSize: 13, marginLeft: 6 }} numberOfLines={2}>
          {TOOLS.find((t) => t.kind === tool)?.hint}
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tools: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden' },
  tool: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sq: { width: 40, height: 40, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.4 },
  color: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 16, height: 16, borderRadius: 3 },
});
