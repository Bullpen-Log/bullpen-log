import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Image, StyleSheet, Text, View, useWindowDimensions, type DimensionValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useReducedMotion } from 'react-native-reanimated';
import { ACWR_ZONE_ORDER, ACWR_ZONES, zoneOf } from '@/lib/pitch-stats';
import type { HomeBoard } from '@/lib/report/home-board';
import { usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { useTabActive } from '~/shell/tab-pager';
import { useHomeSwipe } from './camera-swipe';

export type HomeHighlightKey = 'motion' | 'compare' | 'mechanics' | 'armcare' | 'load' | 'program' | 'coach';

export type HomeHighlight = {
  key: HomeHighlightKey;
  label: string;
  title: string;
  detail?: string;
  action: string;
  load?: HomeBoard['load'];
  onPress: () => void;
};

const ART: Record<HomeHighlightKey, { image?: number; background: string; ink: string; accent: string }> = {
  motion: { image: require('../../assets/home-highlights/motion.webp'), background: '#101e31', ink: '#f4f8ff', accent: '#a6eaff' },
  compare: { image: require('../../assets/home-highlights/compare.webp'), background: '#afcbdc', ink: '#132c43', accent: '#173e5f' },
  mechanics: { image: require('../../assets/home-highlights/mechanics.webp'), background: '#b9d1b9', ink: '#172f25', accent: '#284a38' },
  armcare: { image: require('../../assets/home-highlights/armcare.webp'), background: '#e2d3f5', ink: '#272038', accent: '#48316c' },
  load: { background: '#252830', ink: '#f1f6ff', accent: '#e0e4eb' },
  program: { image: require('../../assets/home-highlights/program.webp'), background: '#ffffff', ink: '#172f47', accent: '#205b91' },
  coach: { image: require('../../assets/home-highlights/coach.webp'), background: '#1044ad', ink: '#f6f9ff', accent: '#f2f7ff' },
};
const LOAD_COLORS = ['#88a8c8', '#99ddcd', '#dfbb82', '#d79195'];
const INTERVAL = 3000;
const enter = FadeIn.duration(230);

export function HighlightCard({ items, onVisible }: { items: HomeHighlight[]; onVisible: (key: HomeHighlightKey) => void }) {
  const c = usePalette();
  const { fontScale } = useWindowDimensions();
  const count = items.length;
  const [page, setPage] = useState(0);
  const [holding, setHolding] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [screenReader, setScreenReader] = useState(true);
  const focused = useIsFocused();
  const active = useTabActive();
  const reduce = useReducedMotion();
  const homeSwipe = useHomeSwipe();

  const advance = useCallback((direction: number) => {
    if (count > 1) setPage((current) => (current + direction + count) % count);
  }, [count]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) setScreenReader(enabled);
    }).catch(() => undefined);
    const screen = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    const app = AppState.addEventListener('change', (next) => setForeground(next === 'active'));
    return () => {
      mounted = false;
      screen.remove();
      app.remove();
    };
  }, []);

  useEffect(() => {
    if (count < 2 || holding || !active || !focused || !foreground || screenReader || reduce) return;
    const timer = setTimeout(() => advance(1), INTERVAL);
    return () => clearTimeout(timer);
  }, [active, advance, count, focused, foreground, holding, page, reduce, screenReader]);

  const hold = useCallback(() => setHolding(true), []);
  const resume = useCallback(() => setHolding(false), []);
  let swipe = Gesture.Pan()
    .enabled(count > 1)
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onBegin(() => runOnJS(hold)())
    .onEnd(({ translationX, velocityX }) => {
      if (Math.abs(translationX) > 33 || Math.abs(velocityX) > 440)
        runOnJS(advance)(translationX < 0 ? 1 : -1);
    })
    .onFinalize(() => runOnJS(resume)());
  if (homeSwipe) swipe = swipe.blocksExternalGesture(homeSwipe);

  const index = count ? page % count : 0;
  const item = items[index];
  const visibleKey = item?.key;
  useEffect(() => {
    if (active && focused && foreground && visibleKey) onVisible(visibleKey);
  }, [active, focused, foreground, onVisible, visibleKey]);
  if (!item) return null;
  const art = ART[item.key];
  const showArt = art.image != null && fontScale < 1.35;
  const load = item.load;
  const zone = load ? zoneOf(load.ratio) : null;
  const pressLabel = [item.label, load?.ratio.toFixed(2) ?? item.title.replace(/\n/g, ' '), zone && ACWR_ZONES[zone].short, item.detail, item.action]
    .filter(Boolean).join(', ');

  return (
    <View>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.ink }]}>하이라이트</Text>
        {count > 1 ? (
          <View style={styles.navigation}>
            <Press accessibilityRole="button" accessibilityLabel="이전 하이라이트" onPress={() => advance(-1)} style={styles.navButton}>
              <Icon name="chevron-left" size={15} color={c.muted} />
            </Press>
            <Text style={[styles.counter, { color: c.sky }]}>{index + 1} / {count}</Text>
            <Press accessibilityRole="button" accessibilityLabel="다음 하이라이트" onPress={() => advance(1)} style={styles.navButton}>
              <Icon name="chevron-right" size={15} color={c.muted} />
            </Press>
          </View>
        ) : null}
      </View>
      <GestureDetector gesture={swipe}>
        <Press
          card
          accessibilityRole="button"
          accessibilityLabel={pressLabel}
          accessibilityActions={count > 1 ? [
            { name: 'increment', label: '다음 하이라이트' },
            { name: 'decrement', label: '이전 하이라이트' },
          ] : undefined}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'increment') advance(1);
            if (nativeEvent.actionName === 'decrement') advance(-1);
          }}
          onPress={item.onPress}
          onPressIn={hold}
          onPressOut={resume}
          style={[styles.card, { borderColor: c.line, boxShadow: c.floatHero, backgroundColor: art.background }]}
        >
          <Animated.View
            key={item.key}
            entering={!reduce && !screenReader && !holding ? enter : undefined}
            style={styles.surface}
          >
            {showArt ? (
              <Image accessibilityIgnoresInvertColors resizeMode="stretch" source={art.image} style={[StyleSheet.absoluteFill, styles.image]} />
            ) : null}
            <View style={styles.content}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: art.accent }]}>{item.label}</Text>
                {zone ? <Text style={[styles.label, { color: LOAD_COLORS[ACWR_ZONE_ORDER.indexOf(zone)] }]}>• {ACWR_ZONES[zone].short}</Text> : null}
              </View>
              {load ? (
                <View style={styles.valueRow}>
                  <Text style={[styles.value, { color: art.ink }]}>{load.ratio.toFixed(2)}</Text>
                  <Text style={[styles.detail, { color: art.accent }]}>평소 기준 1.00</Text>
                </View>
              ) : (
                <View style={showArt && item.key !== 'load' ? styles.copy : undefined}>
                  <Text numberOfLines={2} style={[styles.title, { color: art.ink }]}>{item.title}</Text>
                  {item.detail ? <Text numberOfLines={2} style={[styles.detail, { color: art.accent }]}>{item.detail}</Text> : null}
                </View>
              )}
              {item.key === 'load' ? <LoadScale ratio={load?.ratio} /> : null}
              <View style={styles.action}>
                <Text style={[styles.actionLabel, { color: art.accent }]}>{item.action}</Text>
                <Icon name="arrow-right" size={13} color={art.accent} />
              </View>
            </View>
          </Animated.View>
        </Press>
      </GestureDetector>
    </View>
  );
}

function LoadScale({ ratio }: { ratio?: number }) {
  const index = ratio == null ? -1 : ACWR_ZONE_ORDER.indexOf(zoneOf(ratio));
  const stops = [0, 0.8, 1.3, 1.5, 2];
  const fraction = ratio == null ? null
    : (index + Math.max(0.06, Math.min(0.94, (ratio - stops[index]) / (stops[index + 1] - stops[index])))) * 25;
  return (
    <View accessible={false} accessibilityElementsHidden style={styles.scale}>
      <View style={styles.track}>
        {LOAD_COLORS.map(color => <View key={color} style={{ flex: 1, backgroundColor: color }} />)}
        {fraction != null ? (
          <View style={[styles.marker, { left: (String(fraction) + '%') as DimensionValue, borderColor: LOAD_COLORS[index] }]} />
        ) : null}
      </View>
      <View style={styles.scaleLabels}>
        {ACWR_ZONE_ORDER.map(zone => <Text key={zone} style={styles.scaleLabel}>{ACWR_ZONES[zone].short}</Text>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 1 },
  heading: { fontSize: 16, fontWeight: '700', letterSpacing: -0.35 },
  navigation: { flexDirection: 'row', alignItems: 'center' },
  navButton: { minHeight: 44, minWidth: 36, alignItems: 'center', justifyContent: 'center' },
  counter: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  card: { borderRadius: 21, borderWidth: StyleSheet.hairlineWidth },
  surface: { borderRadius: 20, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  content: { minHeight: 178, gap: 6, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  copy: { maxWidth: '55%' },
  label: { fontSize: 12, fontWeight: '700' },
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.78 },
  detail: { marginTop: 3, fontSize: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, marginTop: 'auto' },
  actionLabel: { flexShrink: 1, fontSize: 12, fontWeight: '700' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  value: { fontSize: 35, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1.1 },
  scale: { gap: 5, marginTop: 2 },
  track: { height: 7, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 8, marginLeft: -4, borderWidth: 1, borderRadius: 5, backgroundColor: '#f2f7ff' },
  scaleLabels: { flexDirection: 'row' },
  scaleLabel: { flex: 1, fontSize: 11, color: '#c4cbd6', textAlign: 'center' },
});
