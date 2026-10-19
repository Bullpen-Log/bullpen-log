import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Polygon } from 'react-native-svg';
import type { Pixel, zonePolygonPx } from '@/lib/abs/calib';
import { visibleFrameRect } from '@/lib/velocity-setup';
import type { PlateEnds } from './use-abs';

type Poly = NonNullable<ReturnType<typeof zonePolygonPx>>;
const SKY = '#0a84d6';

/**
 * 뷰파인더 위 ABS 그림(앱) — 웹 components/abs/plate-overlay.tsx 와 같은 그림: 플레이트 앞변(두 끝 · 파란 선), 존 상자(앞면 흰 선 · 뒷면 점선 ·
 * 모서리 잇기), 플레이트 오각형. 좌표는 원본 px → 뷰(미리보기가 가득 채우며 잘린 몫을 뺀 뒤) px. 직접 맞추기(manual)면 두 끝에 손잡이를 끌 수 있다
 * — 가까운 끝이 따라온다. 끝이 없으면 처음 누른 자리에 56px 너비로 둔다.
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
  const stroke = dim ? 'rgba(255,255,255,0.55)' : '#fff';
  const L = ends ? toView(ends.left) : null;
  const R = ends ? toView(ends.right) : null;
  const pts = (ps: Pixel[]) => ps.map((p) => toView(p).map((n) => n.toFixed(1)).join(',')).join(' ');

  /* 손잡이 끌기 — 손가락은 JS 스레드로 받는다(계산이 가벼워 runOnJS 로 충분). 끌고 있는 끝은 공유값에(렌더 중 ref 를 안 읽게), 손동작은 끝이 바뀔 때 다시 만든다 */
  const dragging = useSharedValue<'left' | 'right' | ''>('');
  const k = frame.width / Math.max(1, view.width);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => {
          const p = toFrame(e.x, e.y);
          if (!ends) {
            /* 끝이 없으면 처음 누른 자리에 56px(화면) 너비로 둔다 */
            onEnds?.({ left: [p[0] - 28 * k, p[1]], right: [p[0] + 28 * k, p[1]] });
            dragging.set('');
            return;
          }
          const l = toView(ends.left);
          const r = toView(ends.right);
          dragging.set(Math.hypot(e.x - l[0], e.y - l[1]) <= Math.hypot(e.x - r[0], e.y - r[1]) ? 'left' : 'right');
        })
        .onUpdate((e) => {
          const d = dragging.get();
          if (!d || !ends) return;
          const p = toFrame(e.x, e.y);
          onEnds?.(d === 'left' ? { ...ends, left: p } : { ...ends, right: p });
        })
        .onFinalize(() => {
          dragging.set('');
        }),
    // 끝 · 틀 · 뷰가 바뀌면 다시 — 변환 함수는 그 값으로만 정해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ends, onEnds, frame.width, frame.height, view.width, view.height]
  );

  const svg = (
    <Svg width={view.width} height={view.height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {poly ? (
        <G fill="none" strokeLinejoin="round">
          <Polygon points={pts(poly.plate)} stroke={stroke} strokeWidth={1.5} fill="rgba(255,255,255,0.12)" />
          <Polygon points={pts(poly.back)} stroke={stroke} strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
          {poly.front.map((p, i) => {
            const a = toView(p);
            const b = toView(poly.back[i]);
            return <Line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeWidth={1} opacity={0.5} />;
          })}
          <Polygon points={pts(poly.front)} stroke={stroke} strokeWidth={2} />
        </G>
      ) : null}
      {L && R ? (
        <G>
          <Line x1={L[0]} y1={L[1]} x2={R[0]} y2={R[1]} stroke={SKY} strokeWidth={3} strokeLinecap="round" />
          {manual
            ? [L, R].map((p, i) => (
                <G key={i}>
                  <Circle cx={p[0]} cy={p[1]} r={22} fill="rgba(10,132,214,0.18)" />
                  <Circle cx={p[0]} cy={p[1]} r={7} fill={SKY} stroke="#fff" strokeWidth={2} />
                </G>
              ))
            : null}
        </G>
      ) : null}
    </Svg>
  );
  if (!manual) return <View style={StyleSheet.absoluteFill} pointerEvents="none">{svg}</View>;
  return (
    <GestureDetector gesture={pan}>
      <View style={StyleSheet.absoluteFill}>{svg}</View>
    </GestureDetector>
  );
}
