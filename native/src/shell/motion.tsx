import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/**
 * 웹과 같은 움직임 — app/globals.css 의 유틸 둘을 앱에 옮겼다. 움직임 줄이기는 Reanimated 가 기기 설정을 따라 끈다(ReduceMotion.System).
 * - rowIn(i): animate-row-in — 줄이 8px 아래에서 260ms ease-out 으로 올라오며 나타남, 줄마다 28ms 씩 늦게(열째 줄부터는 더 안 늦춤).
 * - fadeIn: animate-fade-in — 160ms ease-out 옅어짐(칸 내용이 바뀔 때).
 * 쓰는 법: <Animated.View entering={rowIn(i)}>.
 */
export const rowIn = (i = 0) =>
  FadeInDown.duration(260)
    .delay(Math.min(i, 9) * 28)
    .easing(Easing.out(Easing.ease))
    .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] });

export const fadeIn = FadeIn.duration(160).easing(Easing.out(Easing.ease));

/** 불러오는 동안 회색 덩이 — 웹 animate-pulse(2초에 한 번 1 → 0.5 → 1, cubic-bezier(0.4,0,0.6,1)). 움직임 줄이기면 멈춘 채 */
export function Pulse({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(withTiming(0.5, { duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1) }), -1, true);
  }, [o, reduce]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View accessibilityLabel="불러오는 중이에요" style={[style, a]} />;
}
