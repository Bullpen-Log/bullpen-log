import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { PitcherMark } from '~/pitch/dock-art';
import { useTabActive } from '~/shell/tab-pager';
import { useHomeSwipe } from './camera-swipe';

export type HomeHighlight = {
  key: 'motion' | 'condition' | 'coach';
  label: string;
  title: string;
  detail: string;
  action: string;
  icon: IconName;
  accent: string;
  score?: number | null;
  onPress: () => void;
};

const INTERVAL = 7000;
const enter = FadeIn.duration(230);

export function HighlightCard({ items }: { items: HomeHighlight[] }) {
  const c = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const artSize = Math.max(100, Math.min(146, width * 0.34));
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
  if (!item) return null;

  return (
    <View>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.ink }]}>하이라이트</Text>
        {count > 1 ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={`하이라이트 ${index + 1}/${count}, 다음 보기`}
            onPress={() => advance(1)}
            onPressIn={hold}
            onPressOut={resume}
            style={styles.slideButton}
          >
            <View style={styles.dots} pointerEvents="none">
              {items.map(({ key }, i) => (
                <View key={key} style={[
                  styles.dot,
                  i === index && styles.dotCurrent,
                  { backgroundColor: i === index ? item.accent : withAlpha(c.muted, 0.36) },
                ]} />
              ))}
            </View>
            <Icon name="chevron-right" size={13} color={c.muted} />
          </Press>
        ) : null}
      </View>
      <GestureDetector gesture={swipe}>
        <Press
          card
          accessibilityRole="button"
          accessibilityLabel={`${item.label}, ${item.title.replace(/\n/g, ' ')}, ${item.detail}, ${item.action}`}
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
          style={[styles.card, { borderColor: c.line, boxShadow: c.floatHero }]}
        >
          <View style={[styles.surface, { backgroundColor: c.card }]}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg width="100%" height="100%">
                <Defs>
                  <RadialGradient id="home-highlight-glow" cx="81%" cy="42%" rx="78%" ry="94%">
                    <Stop offset="0" stopColor={item.accent} stopOpacity={0.23} />
                    <Stop offset="0.47" stopColor={item.accent} stopOpacity={0.11} />
                    <Stop offset="1" stopColor={item.accent} stopOpacity={0} />
                  </RadialGradient>
                  <LinearGradient id="home-highlight-shade" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={c.page} stopOpacity={0} />
                    <Stop offset="1" stopColor={c.page} stopOpacity={0.42} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#home-highlight-glow)" />
                <Rect width="100%" height="100%" fill="url(#home-highlight-shade)" />
              </Svg>
            </View>
            <Animated.View
              key={item.key}
              entering={!reduce && !screenReader && !holding ? enter : undefined}
              style={styles.content}
            >
              <View style={styles.copy}>
                <Text style={[styles.label, { color: item.accent }]}>{item.label}</Text>
                <Text style={[styles.title, { color: c.ink }]}>{item.title}</Text>
                <Text numberOfLines={2} style={[styles.detail, { color: c.muted }]}>{item.detail}</Text>
                <View style={styles.action}>
                  <Text style={[styles.actionLabel, { color: c.ink }]}>{item.action}</Text>
                  <Icon name="arrow-right" size={14} color={item.accent} />
                </View>
              </View>
              {fontScale < 1.4 ? <HighlightArt item={item} size={artSize} /> : null}
            </Animated.View>
          </View>
        </Press>
      </GestureDetector>
    </View>
  );
}

function HighlightArt({ item, size }: { item: HomeHighlight; size: number }) {
  const c = usePalette();
  const score = item.score;
  const isCondition = item.key === 'condition';
  const hasScore = isCondition && score != null;
  const arc = 264;
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.art, { width: size, height: size }]}
    >
      <Svg width={size} height={size} viewBox="0 0 120 120" style={StyleSheet.absoluteFill}>
        {isCondition ? (
          <>
            <Circle cx={60} cy={60} r={42} fill={withAlpha(c.page, 0.26)} stroke={withAlpha(item.accent, 0.16)} strokeWidth={5} />
            {hasScore ? (
              <Circle
                cx={60} cy={60} r={42} fill="none" stroke={item.accent} strokeWidth={5}
                strokeLinecap="round" strokeDasharray={[arc, arc]}
                strokeDashoffset={arc * (1 - score / 10)} transform="rotate(-90 60 60)"
              />
            ) : null}
          </>
        ) : (
          <>
            <Circle cx={63} cy={60} r={43} fill={withAlpha(item.accent, 0.035)} stroke={withAlpha(item.accent, 0.18)} />
            <Ellipse cx={62} cy={61} rx={56} ry={23} transform="rotate(-27 62 61)" fill="none" stroke={withAlpha(item.accent, 0.24)} />
            <Circle cx={101} cy={35} r={2.5} fill={item.accent} />
            <Circle cx={22} cy={84} r={1.6} fill={withAlpha(item.accent, 0.65)} />
          </>
        )}
      </Svg>
      {item.key === 'motion' ? <PitcherMark size={size * 0.93} />
        : hasScore ? (
          <Text style={[styles.score, { color: c.ink }]}>{score}<Text style={[styles.scoreUnit, { color: c.muted }]}>/10</Text></Text>
        ) : (
          <Icon name={item.icon} size={size * 0.30} strokeWidth={1.45} color={item.accent} />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { minHeight: 37, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 2, marginBottom: 4 },
  heading: { fontSize: 18, fontWeight: '700', letterSpacing: -0.45 },
  slideButton: { minHeight: 37, paddingHorizontal: 7, flexDirection: 'row', gap: 7, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotCurrent: { width: 14 },
  card: { borderRadius: 23, borderWidth: StyleSheet.hairlineWidth },
  surface: { borderRadius: 23, overflow: 'hidden' },
  content: { minHeight: 184, flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 18, paddingRight: 9, paddingVertical: 15 },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: -0.12 },
  title: { fontSize: 25, fontWeight: '800', letterSpacing: -1.1 },
  detail: { fontSize: 12, paddingRight: 3 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  actionLabel: { flexShrink: 1, fontSize: 13, fontWeight: '700' },
  art: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 31, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1.15 },
  scoreUnit: { fontSize: 13, fontWeight: '600' },
});
