import { useState } from 'react';
import { type AccessibilityActionEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { clusterMarkers, fracOf, handleAt, nearestMarker, timeAt } from '~/compare/workspace-layout';
import { usePalette, withAlpha } from '~/lib/ui';

/**
 * 영상 비교 공통 타임라인(UI04) — 무대 바로 밑에 늘 있다. 끄는 것은 화면 굴리기가 아니라 장면 옮기기다.
 * - 보이는 막대는 얇아도 누르는 자리는 44pt. 시작하면 재생을 멈추고(onStart), 끄는 동안은 60ms 마다 마지막 자리만 보낸다(놓을 때 마지막 자리 한 번 더).
 * - 장면 표시(투구 장면 · 기준 0)는 막대 위 작은 눈금. 표시 가까이를 '톡' 누르면 그 표시로 붙는다 — 겹친 표시는 고르기 창(onCluster).
 * - 반복 구간은 막대 위 띠. loopEdit 이면 손잡이를 끌어 바꾼다(손잡이 밖을 끌면 그냥 장면 옮기기). 고른 손잡이는 이전 · 다음 장면 단추로도.
 * - VoiceOver: 조절 가능(값 · 범위 · 한 장면 늘리기 · 줄이기).
 */
export type TimelineMarker = { key: string; t: number; label: string; kind: 'event' | 'anchor' | 'note' };

export function Timeline({
  value,
  min,
  max,
  step,
  disabled,
  label,
  valueText,
  leftText,
  rightText,
  markers,
  loop,
  loopEdit,
  selectedHandle,
  onStart,
  onSeek,
  onEnd,
  onJump,
  onCluster,
  onHandle,
  onHandleSelect,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  label: string;
  valueText: string;
  leftText: string;
  rightText: string;
  markers: readonly TimelineMarker[];
  loop: { min: number; max: number } | null;
  loopEdit?: boolean;
  selectedHandle?: 'start' | 'end' | null;
  onStart: () => void;
  onSeek: (t: number) => void;
  onEnd?: (t: number) => void;
  onJump: (m: TimelineMarker) => void;
  onCluster: (ms: TimelineMarker[]) => void;
  onHandle?: (edge: 'start' | 'end', t: number) => void;
  onHandleSelect?: (edge: 'start' | 'end') => void;
}) {
  const c = usePalette();
  const [w, setW] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  /* 끄는 한 번의 상태 — 그림에 안 쓰여 화면 상태가 아니라 닫힌 값(useState 로 한 번 만든다) */
  const [g] = useState(dragSession);
  const at = (x: number) => timeAt(x, w, min, max);
  const clusters = w > 0 ? clusterMarkers(markers, w, min, max) : [];

  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(!disabled && w > 0)
    .minDistance(0)
    .onBegin((e) => {
      const h = loopEdit ? handleAt(loop, e.x, w, min, max) : null;
      g.begin(e.x, h);
      onStart();
      if (h) {
        onHandleSelect?.(h);
        return;
      }
      const t = at(e.x);
      setDrag(t);
      onSeek(t);
    })
    .onUpdate((e) => {
      g.move(e.x);
      const t = at(e.x);
      const h = g.handle();
      if (h) return g.soft(() => onHandle?.(h, t));
      setDrag(t);
      g.soft(() => onSeek(t));
    })
    .onFinalize((e) => {
      const h = g.handle();
      const t = at(e.x);
      setDrag(null);
      if (h) {
        if (g.moved()) onHandle?.(h, t);
        return;
      }
      /* 톡 누름 — 장면 표시 가까이면 그 표시로(겹쳤으면 고르기 창) */
      if (!g.moved()) {
        const near = nearestMarker(markers, e.x, w, min, max);
        if (near) {
          const group = clusters.find((cl) => cl.includes(near)) ?? [near];
          if (group.length > 1) return onCluster(group);
          return onJump(near);
        }
      }
      onSeek(t);
      onEnd?.(t);
    });

  const v = drag ?? value;
  const frac = fracOf(v, min, max);
  const onAction = (e: AccessibilityActionEvent) => {
    const t = Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step)));
    onStart();
    onSeek(t);
    onEnd?.(t);
  };
  const lx = loop ? fracOf(loop.min, min, max) * w : 0;
  const rx = loop ? fracOf(loop.max, min, max) * w : 0;
  return (
    <View style={st.row}>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[st.edge, { color: c.muted }]} importantForAccessibility="no" accessibilityElementsHidden>
        {leftText}
      </Text>
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: Math.round(min * 100), max: Math.round(max * 100), now: Math.round(v * 100), text: valueText }}
          accessibilityState={{ disabled }}
          accessibilityActions={[{ name: 'increment', label: '한 장면 뒤로' }, { name: 'decrement', label: '한 장면 앞으로' }]}
          onAccessibilityAction={onAction}
          onLayout={(e) => setW(e.nativeEvent.layout.width)}
          style={[st.hit, disabled && { opacity: 0.4 }]}
        >
          <View style={[st.track, { backgroundColor: withAlpha(c.ink, 0.14) }]}>
            <View style={[st.fill, { width: `${frac * 100}%`, backgroundColor: c.action }]} />
          </View>
          {loop && w > 0 ? <View pointerEvents="none" style={[st.loop, { left: lx, width: Math.max(2, rx - lx), backgroundColor: withAlpha(c.action, 0.22), borderColor: c.action }]} /> : null}
          {clusters.map((cl) => {
            const x = fracOf(cl[0].t, min, max) * w;
            const anchor = cl.some((m) => m.kind === 'anchor');
            return <View key={cl.map((m) => m.key).join('+')} pointerEvents="none" style={[st.tick, { left: x - 1.5, height: cl.length > 1 ? 14 : 10, backgroundColor: anchor ? c.action : withAlpha(c.ink, 0.6) }]} />;
          })}
          {loop && loopEdit && w > 0
            ? (['start', 'end'] as const).map((edge) => (
                <View
                  key={edge}
                  pointerEvents="none"
                  style={[st.handle, { left: (edge === 'start' ? lx : rx) - 7, backgroundColor: selectedHandle === edge ? c.action : c.card, borderColor: c.action }]}
                />
              ))
            : null}
          <View pointerEvents="none" style={[st.thumb, { left: frac * w - 9, backgroundColor: c.action, borderColor: c.card }]} />
        </View>
      </GestureDetector>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[st.edge, { color: c.muted, textAlign: 'right' }]} importantForAccessibility="no" accessibilityElementsHidden>
        {rightText}
      </Text>
    </View>
  );
}

function dragSession() {
  let x0 = 0;
  let moved = false;
  let handle: 'start' | 'end' | null = null;
  let last = 0;
  return {
    begin(x: number, h: 'start' | 'end' | null) {
      x0 = x;
      moved = false;
      handle = h;
      last = 0;
    },
    move(x: number) {
      if (Math.abs(x - x0) > 4) moved = true;
    },
    moved: () => moved,
    handle: () => handle,
    /** 끄는 동안 60ms 마다 한 번만 */
    soft(run: () => void) {
      const now = Date.now();
      if (now - last > 60) {
        last = now;
        run();
      }
    },
  };
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  edge: { fontSize: 11, fontVariant: ['tabular-nums'], minWidth: 34 },
  hit: { flex: 1, height: 44, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  loop: { position: 'absolute', top: 15, height: 14, borderRadius: 3, borderWidth: 1 },
  tick: { position: 'absolute', top: 6, width: 3, borderRadius: 1.5 },
  handle: { position: 'absolute', top: 13, width: 14, height: 18, borderRadius: 4, borderWidth: 2 },
  thumb: { position: 'absolute', top: 13, width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
});
