import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useRef, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';

/**
 * 그날 투구 영상 위에 선 · 각도 그리기 — 웹 components/video-canvas.tsx(VideoCanvas · DrawingToolbar)를 옮겼다. 도구 다섯 · 색 넷 · 되돌리기 ·
 * 전체 지우기 · 셈(수직 대비 기울기 · 세 점 각)은 웹과 같다. 그리기만 캔버스 대신 svg.
 * 좌표는 영상 칸의 픽셀 — 영상은 contain 으로 고르게 줄어 각도가 그대로이고, 그림은 이 칸에서만 쓰니(저장 안 함) 웹의 레터박스 셈은 뺐다.
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

/** 세 점이 이루는 각도(도), v 가 꼭짓점 — 웹 angleAt */
export function angleAt(a: P, v: P, b: P) {
  let deg = Math.abs((Math.atan2(a.y - v.y, a.x - v.x) - Math.atan2(b.y - v.y, b.x - v.x)) * (180 / Math.PI));
  if (deg > 180) deg = 360 - deg;
  return deg;
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
/** 선 끝 손잡이 — 웹 handle() */
function Handle({ p, color }: { p: P; color: string }) {
  return (
    <>
      <Rect x={p.x - 1.75} y={p.y - 1.75} width={3.5} height={3.5} stroke="rgba(8,8,10,0.6)" strokeWidth={2} fill="none" />
      <Rect x={p.x - 1.75} y={p.y - 1.75} width={3.5} height={3.5} stroke={color} strokeWidth={1} fill="none" />
    </>
  );
}

function ShapeView({ s, w, h }: { s: Shape; w: number; h: number }) {
  switch (s.kind) {
    case 'vref': {
      const ticks = [];
      for (let y = 24; y < h; y += 40) ticks.push(<Line key={y} x1={s.x - 3} x2={s.x + 3} y1={y} y2={y} stroke={s.color} strokeWidth={1} />);
      return (
        <G>
          <Stroke d={`M${s.x},0 L${s.x},${h}`} color={s.color} width={1} />
          {ticks}
        </G>
      );
    }
    case 'href': {
      const ticks = [];
      for (let x = 24; x < w; x += 40) ticks.push(<Line key={x} x1={x} x2={x} y1={s.y - 3} y2={s.y + 3} stroke={s.color} strokeWidth={1} />);
      return (
        <G>
          <Stroke d={`M0,${s.y} L${w},${s.y}`} color={s.color} width={1} />
          {ticks}
        </G>
      );
    }
    case 'tilt': {
      const { a, b } = s;
      const top = a.y <= b.y ? a : b;
      const bottom = a.y <= b.y ? b : a;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      /* 값은 선과 직각으로 비켜 놓는다 — 선 위에 얹으면 봐야 할 동작을 가린다(웹과 같다) */
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      return (
        <G>
          <Stroke d={`M${a.x},${a.y} L${b.x},${b.y}`} color={s.color} />
          <Line x1={bottom.x} y1={bottom.y} x2={bottom.x} y2={top.y} stroke="rgba(245,245,244,0.35)" strokeWidth={1} strokeDasharray={[4, 4]} />
          <Handle p={a} color={s.color} />
          <Handle p={b} color={s.color} />
          <Readout text={`${tiltFromVertical(a, b).toFixed(1)}°`} x={(a.x + b.x) / 2 + nx * 14} y={(a.y + b.y) / 2 + ny * 14} color={s.color} w={w} />
        </G>
      );
    }
    case 'angle': {
      const { a, v, b } = s;
      const r = Math.min(30, Math.hypot(a.x - v.x, a.y - v.y) * 0.45, Math.hypot(b.x - v.x, b.y - v.y) * 0.45);
      const start = Math.atan2(a.y - v.y, a.x - v.x);
      let diff = Math.atan2(b.y - v.y, b.x - v.x) - start;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const end = start + diff;
      const arc = `M${v.x + Math.cos(start) * r},${v.y + Math.sin(start) * r} A${r},${r} 0 0 ${diff > 0 ? 1 : 0} ${v.x + Math.cos(end) * r},${v.y + Math.sin(end) * r}`;
      const mid = start + diff / 2;
      return (
        <G>
          <Stroke d={`M${a.x},${a.y} L${v.x},${v.y} L${b.x},${b.y}`} color={s.color} />
          {r > 0 ? <Path d={arc} stroke={s.color} strokeWidth={1} fill="none" /> : null}
          <Handle p={a} color={s.color} />
          <Handle p={v} color={s.color} />
          <Handle p={b} color={s.color} />
          <Readout text={`${angleAt(a, v, b).toFixed(1)}°`} x={v.x + Math.cos(mid) * (r + 15)} y={v.y + Math.sin(mid) * (r + 15)} color={s.color} w={w} />
        </G>
      );
    }
    case 'marker': {
      const { x, y } = s.p;
      return (
        <G>
          <Stroke d={`M${x - 11},${y} L${x - 4},${y} M${x + 4},${y} L${x + 11},${y} M${x},${y - 11} L${x},${y - 4} M${x},${y + 4} L${x},${y + 11}`} color={s.color} />
          <Circle cx={x} cy={y} r={3} stroke={s.color} strokeWidth={1.5} fill="none" />
        </G>
      );
    }
  }
}

/**
 * 영상 칸 위에 깔리는 그림 판 — 켜져 있을 때만 손가락을 받는다(꺼지면 그림만 보이고 손가락은 밑의 재생기로).
 * 기울기는 끌어서, 각도는 세 번 눌러서, 기준선 · 포인트는 한 번 눌러서(웹 VideoCanvas 와 같다).
 */
export function DrawLayer({
  shapes,
  onCommit,
  tool,
  color,
  enabled,
}: {
  shapes: Shape[];
  onCommit: (s: Shape) => void;
  tool: ToolKind;
  color: string;
  enabled: boolean;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Shape | null>(null);
  const [anglePts, setAnglePts] = useState<P[]>([]);
  const draftRef = useRef<Shape | null>(null);
  const at = (e: GestureResponderEvent): P => ({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });

  const down = (e: GestureResponderEvent) => {
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
    const prev = draftRef.current;
    if (!prev || prev.kind !== 'tilt') return;
    const next = { ...prev, b: at(e) };
    draftRef.current = next;
    setDraft(next);
  };
  const up = () => {
    const prev = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    /* 점만 찍고 만 것은 버린다(웹은 칸의 1% — 여기선 픽셀이라 4px) */
    if (prev?.kind === 'tilt' && Math.hypot(prev.a.x - prev.b.x, prev.a.y - prev.b.y) > 4) onCommit(prev);
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
            <ShapeView key={i} s={s} w={size.w} h={size.h} />
          ))}
          {draft ? <ShapeView s={draft} w={size.w} h={size.h} /> : null}
          {anglePts.map((p, i) => (
            <Handle key={i} p={p} color={color} />
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
