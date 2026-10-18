import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import type { FeedItem, FeedVariant } from '@/lib/report/feed-items';
import type { HighlightChart } from '@/lib/report/highlights';
import { formatSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/**
 * 홈 요약 칸 — 웹 app/(app)/today/feed-card.tsx 와 같은 꼴 · 같은 움직임.
 * - 위 이름표 줄(그림 · 하늘색 이름 · '지난 기록' 알약)은 고정, 밑의 장만 민다. 넘어가는 동안 이름표는 다음 장 것.
 * - 장 셋(앞 · 지금 · 다음)을 나란히 두고 끝없이 돈다 — 마지막에서 처음으로 휙 되감지 않는다(웹과 같다).
 * - 3초마다(기록 없음 장은 2초) 다음 장으로 320ms 곡선 cubic-bezier(0.32, 0.72, 0, 1). 직접 한 번 넘기면 그 뒤로 저절로 안 넘긴다.
 *   누르는 동안 · 움직임 줄이기면 안 넘긴다.
 * - 손가락으로 6px 넘게 옆으로 끌면 따라오고, 폭의 25% 넘게 또는 빠르게 튕기면(0.45px/ms) 넘어간다.
 * - 오른쪽 아래 점: 지금 장은 긴 하늘색(20 × 8), 나머지 8 × 8 — 너비가 300ms 에 바뀐다. 누르면 그 장으로.
 */
const DWELL_MS = 3000;
const DWELL_NONE_MS = 2000;
const SLIDE_MS = 320;
const SLIDE_EASE = Easing.bezier(0.32, 0.72, 0, 1);
const SNAP_RATIO = 0.25;
const FLICK_SPEED = 0.45 * 1000; // px/s
const TRACK_H = 156;

export function FeedCard({ items, onOpen }: { items: FeedItem[]; onOpen: (item: FeedItem) => void }) {
  const c = usePalette();
  const reduce = useReducedMotion();
  const n = items.length;
  const [w, setW] = useState(0);
  /* 지금 장 자리 — 늘 늘어나기만 한다(끝없이 돌기). 장 번호 = pos mod n */
  const [pos, setPos] = useState(0);
  const [moving, setMoving] = useState<1 | -1 | null>(null);
  const [manual, setManual] = useState(false);
  const [held, setHeld] = useState(false);
  const x = useSharedValue(0);
  const at = useCallback((p: number) => ((p % n) + n) % n, [n]);

  const land = useCallback((to: number) => {
    setPos(to);
    setMoving(null);
  }, []);
  const go = useCallback(
    (dir: 1 | -1, from = pos) => {
      if (!w || n < 2) return;
      const to = from + dir;
      setMoving(dir);
      x.set(
        withTiming(-to * w, { duration: reduce ? 0 : SLIDE_MS, easing: SLIDE_EASE }, (done) => {
          if (done) runOnJS(land)(to);
        })
      );
    },
    [w, n, pos, x, reduce, land]
  );

  /* 폭이 바뀌면 지금 장 자리에 맞춘다 */
  useEffect(() => {
    if (w) x.set(-pos * w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w]);

  /* 저절로 넘기기 */
  useEffect(() => {
    if (n < 2 || !w || reduce || manual || held || moving != null) return;
    const dwell = items[at(pos)]?.tone === 'none' ? DWELL_NONE_MS : DWELL_MS;
    const t = setTimeout(() => go(1), dwell);
    return () => clearTimeout(t);
  }, [n, w, reduce, manual, held, moving, pos, items, at, go]);

  const posSV = useSharedValue(0);
  useEffect(() => {
    posSV.set(pos);
  }, [pos, posSV]);
  const onSwiped = useCallback(
    (dir: 1 | -1 | 0) => {
      setHeld(false);
      if (dir === 0) return;
      setManual(true);
      void Haptics.selectionAsync();
      go(dir);
    },
    [go]
  );
  const pan = Gesture.Pan()
    .enabled(n > 1 && moving == null)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onBegin(() => runOnJS(setHeld)(true))
    .onUpdate((e) => {
      x.set(-posSV.get() * w + Math.max(-w, Math.min(w, e.translationX)));
    })
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > w * SNAP_RATIO || Math.abs(e.velocityX) > FLICK_SPEED;
      if (far) {
        runOnJS(onSwiped)(e.translationX < 0 ? 1 : -1);
      } else {
        x.set(withTiming(-posSV.get() * w, { duration: 200, easing: SLIDE_EASE }));
        runOnJS(onSwiped)(0);
      }
    })
    .onFinalize(() => runOnJS(setHeld)(false));

  const track = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  if (!n) return null;
  const shown = moving != null ? at(pos + moving) : at(pos);
  const head = items[shown];
  const slides = n > 1 ? [pos - 1, pos, pos + 1] : [pos];

  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <FeedLabel item={head} c={c} />
      <GestureDetector gesture={pan}>
        <View style={{ height: TRACK_H, overflow: 'hidden' }}>
          <Animated.View style={[StyleSheet.absoluteFill, track]}>
            {w
              ? slides.map((p) => (
                  <View key={p} style={{ position: 'absolute', top: 0, bottom: 0, left: p * w, width: w }}>
                    <Slide item={items[at(p)]} lap={Math.floor(p / n)} c={c} active={p === pos} onPress={() => onOpen(items[at(p)])} />
                  </View>
                ))
              : null}
          </Animated.View>
        </View>
      </GestureDetector>
      {n > 1 ? (
        <View style={styles.dots} accessibilityRole="tablist" accessibilityLabel={`${n}장 중 ${shown + 1}번째`}>
          {items.map((it, i) => (
            <Pressable
              key={it.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === shown }}
              accessibilityLabel={`${i + 1}번째 장 · ${it.label}`}
              onPress={() => {
                if (i === shown || moving != null) return;
                setManual(true);
                void Haptics.selectionAsync();
                const d = (((i - shown) % n) + n) % n;
                if (d === 1) go(1);
                else if (d === n - 1) go(-1);
                else {
                  /* 멀면 미끄러짐 없이 바로(웹과 같다) */
                  const to = pos + d;
                  x.set(-to * w);
                  setPos(to);
                }
              }}
              style={styles.dotHit}
            >
              <Dot on={i === shown} c={c} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Dot({ on, c }: { on: boolean; c: Palette }) {
  const width = useSharedValue(on ? 20 : 8);
  useEffect(() => {
    width.value = withTiming(on ? 20 : 8, { duration: 300, easing: Easing.out(Easing.quad) });
  }, [on, width]);
  const style = useAnimatedStyle(() => ({ width: width.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: on ? c.sky : 'rgba(29,29,31,0.2)' }, style]} />;
}

function FeedLabel({ item, c }: { item: FeedItem; c: Palette }) {
  const tone = item.warn ? c.warn : c.sky;
  return (
    <View style={styles.head}>
      {item.icon ? <Icon name={item.icon} size={16} color={tone} /> : null}
      <Text style={[styles.label, { color: tone }]}>{item.label}</Text>
      {item.tone === 'past' ? (
        <View style={[styles.pastChip, { backgroundColor: 'rgba(29,29,31,0.06)' }]}>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '500' }}>지난 기록</Text>
        </View>
      ) : null}
    </View>
  );
}

function Slide({ item, lap, c, active, onPress }: { item: FeedItem; lap: number; c: Palette; active: boolean; onPress: () => void }) {
  const speed = usePrefs().speed;
  /* 한 바퀴 돌 때마다 다음 말(웹 variants 와 같다) */
  const v: FeedVariant = item.variants[((lap % Math.max(1, item.variants.length)) + item.variants.length) % Math.max(1, item.variants.length)] ?? item.variants[0];
  if (!v) return null;
  const warn = !!v.warn;
  const fill = (t: string) =>
    t
      .replace('{speed}', formatSpeed(v.speed, speed) ?? '')
      .replace('{diff}', formatSpeed(v.diff, speed) ?? '')
      .replace('{best}', formatSpeed(v.best, speed) ?? '');
  const text = fill(v.text);
  const sub = v.sub ? fill(v.sub) : null;
  const tappable = item.href != null || !!item.checkin;
  return (
    <Pressable
      accessibilityRole={tappable ? 'button' : 'text'}
      accessibilityLabel={`${item.label}. ${text}${sub ? `. ${sub}` : ''}`}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      disabled={!tappable}
      onPress={onPress}
      style={({ pressed }) => [styles.slide, pressed && { opacity: 0.8 }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.text, { color: warn ? c.warn : item.tone === 'none' ? c.muted : c.ink }]} numberOfLines={3}>
          {text}
        </Text>
        {sub && item.tone === 'none' ? (
          <View style={[styles.addPill, { borderColor: c.lineStrong }]}>
            <Text style={{ color: c.sky, fontSize: 12, fontWeight: '500' }}>{sub}</Text>
          </View>
        ) : sub ? (
          <Text style={[styles.sub, { color: c.muted }]} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
        {v.detail ? (
          <Text style={[styles.detail, { color: c.muted }]} numberOfLines={1}>
            {v.detail}
          </Text>
        ) : null}
      </View>
      {v.chart ? <MiniChart chart={v.chart} warn={warn} size="lg" /> : null}
      {item.href ? <Icon name="chevron-right" size={16} color={c.lineStrong} /> : null}
    </Pressable>
  );
}

/** 작은 그림 — 웹 highlights.tsx MiniChart 와 같은 판(64 × 36), lg 는 96 × 54 로 키운다(선도 같이 굵어짐). 지금 것(마지막)만 칠한다 */
const W = 64;
const H = 36;
export function MiniChart({ chart, warn, size = 'sm' }: { chart: HighlightChart; warn: boolean; size?: 'sm' | 'lg' }) {
  const c = usePalette();
  const tone = warn ? c.warn : c.sky;
  const box = size === 'lg' ? { width: 96, height: 54 } : { width: W, height: H };
  if (chart.kind === 'dots') {
    return (
      <Svg {...box} viewBox={`0 0 ${W} ${H}`}>
        {chart.values.map((on, i) => (
          <Circle key={i} cx={5 + i * 9} cy={H / 2} r={3.5} fill={on ? tone : 'none'} stroke={on ? tone : c.lineStrong} strokeWidth={on ? 0 : 1} />
        ))}
      </Svg>
    );
  }
  if (chart.kind === 'bars') {
    const max = Math.max(1, ...chart.values);
    const n = chart.values.length;
    const bw = 10;
    const gap = (W - bw * n) / Math.max(1, n - 1);
    return (
      <Svg {...box} viewBox={`0 0 ${W} ${H}`}>
        {chart.values.map((v, i) => {
          const h = Math.max(2, (v / max) * (H - 2));
          return <Rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={2} fill={i === n - 1 ? tone : c.lineStrong} />;
        })}
      </Svg>
    );
  }
  const pts = chart.values.map((v, i) => (v == null ? null : { i, v })).filter((p): p is { i: number; v: number } => p != null);
  if (!pts.length) return null;
  const vLo = Math.min(...pts.map((p) => p.v));
  const vHi = Math.max(...pts.map((p) => p.v));
  const span = Math.max(vHi - vLo, chart.minSpan);
  const lo = (vLo + vHi) / 2 - span / 2;
  const hi = lo + span;
  const step = (W - 6) / Math.max(1, chart.values.length - 1);
  const xy = (p: { i: number; v: number }) => ({ x: 3 + p.i * step, y: hi === lo ? H / 2 : H - 4 - ((p.v - lo) / (hi - lo)) * (H - 8) });
  const last = xy(pts[pts.length - 1]);
  return (
    <Svg {...box} viewBox={`0 0 ${W} ${H}`}>
      {pts.length > 1 ? (
        <Polyline
          points={pts.map((p) => `${xy(p).x},${xy(p).y}`).join(' ')}
          fill="none"
          stroke={tone}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <Circle cx={last.x} cy={last.y} r={3} fill={tone} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 20 },
  label: { fontSize: 15, fontWeight: '600' },
  pastChip: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  slide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 32 },
  text: { fontSize: 18, fontWeight: '600', lineHeight: 25 },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  detail: { fontSize: 12, lineHeight: 16, marginTop: 4, opacity: 0.8 },
  addPill: { alignSelf: 'flex-start', marginTop: 8, minHeight: 28, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 10, justifyContent: 'center' },
  dots: { position: 'absolute', right: 20, bottom: 2, flexDirection: 'row', alignItems: 'center' },
  dotHit: { width: 28, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { height: 8, borderRadius: 4 },
});
