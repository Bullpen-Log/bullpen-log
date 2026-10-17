import { useEffect, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import type { FeedItem, FeedVariant } from '@/lib/report/feed-items';
import type { HighlightChart } from '@/lib/report/highlights';
import { formatSpeed } from '@/lib/units';
import { usePalette } from '~/lib/ui';

/**
 * 홈 요약 칸(우리끼리 '뉴스' — 화면에는 그 말이 없다). 웹 feed-card.tsx 와 같은 장(lib/report/feed-items.ts): 3초마다 다음 장, 손으로
 * 한 번 넘기면 자동 넘김을 멈춘다(WCAG 2.2.2 — 웹과 같다). 장 안의 말(variants)은 한 바퀴 돌 때마다 다음 것으로.
 * 누르면 그 장의 곳으로(onOpen — 체크인 장은 체크인 흐름). 구속 단위는 앱이 아직 km/h 만.
 */
const DWELL_MS = 3000;
const DWELL_NONE_MS = 2000;

export function FeedCard({ items, onOpen }: { items: FeedItem[]; onOpen: (item: FeedItem) => void }) {
  const c = usePalette();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [lap, setLap] = useState(0);
  const [manual, setManual] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const n = items.length;

  useEffect(() => {
    if (manual || n < 2 || !width) return;
    const t = setTimeout(
      () => {
        const next = (index + 1) % n;
        if (next === 0) setLap((l) => l + 1);
        setIndex(next);
        scroll.current?.scrollTo({ x: next * width, animated: next !== 0 });
      },
      items[index]?.tone === 'none' ? DWELL_NONE_MS : DWELL_MS
    );
    return () => clearTimeout(t);
  }, [index, manual, n, width, items]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  if (!n) return null;
  return (
    <View style={[styles.card, { backgroundColor: c.card }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setManual(true)}
        onMomentumScrollEnd={onEnd}
      >
        {items.map((it, i) => {
          const v = it.variants[lap % Math.max(1, it.variants.length)] ?? it.variants[0];
          return <Page key={it.key} item={it} variant={v ?? it} width={width} onPress={() => onOpen(it)} active={i === index} />;
        })}
      </ScrollView>
      <View style={styles.dots} accessibilityElementsHidden>
        {items.map((it, i) => (
          <View key={it.key} style={[styles.dotSmall, { backgroundColor: i === index ? c.sky : c.line }]} />
        ))}
      </View>
    </View>
  );
}

function fill(text: string, v: Pick<FeedVariant, 'speed' | 'diff' | 'best'>) {
  return text
    .replace('{speed}', formatSpeed(v.speed, 'kmh') ?? '')
    .replace('{diff}', formatSpeed(v.diff, 'kmh') ?? '')
    .replace('{best}', formatSpeed(v.best, 'kmh') ?? '');
}

function Page({
  item,
  variant,
  width,
  onPress,
  active,
}: {
  item: FeedItem;
  variant: FeedVariant | FeedItem;
  width: number;
  onPress: () => void;
  active: boolean;
}) {
  const c = usePalette();
  const warn = variant.warn ?? item.warn;
  const tappable = item.href != null || item.checkin;
  const text = fill(variant.text, variant);
  const sub = variant.sub ? fill(variant.sub, variant) : null;
  const detail = 'detail' in variant ? variant.detail : undefined;
  return (
    <Pressable
      accessibilityRole={tappable ? 'button' : 'text'}
      accessibilityLabel={`${item.label}. ${text}${sub ? `. ${sub}` : ''}`}
      accessibilityElementsHidden={!active}
      disabled={!tappable}
      onPress={onPress}
      style={({ pressed }) => [{ width, padding: 16, gap: 6, minHeight: 156 }, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.head}>
        <Text style={[styles.label, { color: warn ? c.danger : c.sky }]}>{item.label}</Text>
        {item.tone === 'past' ? <Text style={[styles.past, { color: c.muted }]}>지난 기록</Text> : null}
        {tappable ? <Text style={{ color: c.muted, fontSize: 17, marginLeft: 'auto' }}>›</Text> : null}
      </View>
      <View style={styles.body}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.text, { color: warn ? c.danger : item.tone === 'none' ? c.muted : c.ink }]} numberOfLines={3}>
            {text}
          </Text>
          {sub ? (
            <Text style={[styles.sub, { color: c.muted }]} numberOfLines={2}>
              {sub}
            </Text>
          ) : null}
          {detail ? (
            <Text style={[styles.sub, { color: c.muted, opacity: 0.8 }]} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        {variant.chart ? <MiniChart chart={variant.chart} warn={!!warn} /> : null}
      </View>
    </Pressable>
  );
}

/** 작은 그래프 — 주별 막대 · 날짜별 선 · 이레 점(웹 highlights.tsx MiniChart 와 같은 재료) */
function MiniChart({ chart, warn }: { chart: HighlightChart; warn: boolean }) {
  const c = usePalette();
  const color = warn ? c.danger : c.sky;
  const W = 96;
  const H = 48;
  if (chart.kind === 'dots') {
    const step = W / chart.values.length;
    return (
      <Svg width={W} height={H}>
        {chart.values.map((on, i) => (
          <Circle key={i} cx={step * (i + 0.5)} cy={H / 2} r={5} fill={on ? color : c.line} />
        ))}
      </Svg>
    );
  }
  if (chart.kind === 'bars') {
    const max = Math.max(1, ...chart.values);
    const step = W / chart.values.length;
    return (
      <Svg width={W} height={H}>
        {chart.values.map((v, i) => {
          const h = Math.max(2, (v / max) * H);
          return (
            <Rect
              key={i}
              x={step * i + step * 0.15}
              y={H - h}
              width={step * 0.7}
              height={h}
              rx={2}
              fill={i === chart.values.length - 1 ? color : c.line}
            />
          );
        })}
      </Svg>
    );
  }
  const vals = chart.values.filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals, lo + chart.minSpan);
  const step = W / Math.max(1, chart.values.length - 1);
  const pts = chart.values
    .map((v, i) => (v == null ? null : `${(i * step).toFixed(1)},${(H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8)).toFixed(1)}`))
    .filter((p): p is string => p != null)
    .join(' ');
  const last = pts.split(' ').at(-1)!.split(',').map(Number);
  return (
    <Svg width={W} height={H}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={4} fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  past: { fontSize: 12 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  sub: { fontSize: 14, lineHeight: 19 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 12 },
  dotSmall: { width: 6, height: 6, borderRadius: 3 },
});
