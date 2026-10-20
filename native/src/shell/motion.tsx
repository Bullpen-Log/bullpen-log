import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type ViewStyle } from 'react-native';
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

/** 보기 바꿈(달력 ↔ 목록) — 웹 view-swap: 4px 아래에서 180ms cubic-bezier(0.22,1,0.36,1) 로 떠오르며 진해짐 */
export const viewSwap = FadeInDown.duration(180)
  .easing(Easing.bezier(0.22, 1, 0.36, 1))
  .withInitialValues({ opacity: 0, transform: [{ translateY: 4 }] });

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

/**
 * 숫자가 올라가며 나타남 — 웹 components/onboarding/count-up.tsx 와 같은 셈: 처음엔 value × from 에서 0.72초 동안 ease-out 으로 올라가고,
 * 값이 바뀌면 지금 보이는 숫자에서 새 값으로 이어 간다. 매일 보는 숫자는 from 0.7(첫 장면이 '0 kcal' 이 아니게). 움직임 줄이기면 바로 값.
 * 읽어 주는 글은 끝값만. 다른 <Text> 안에 넣어 쓴다(글자 모양은 바깥 것을 따른다).
 */
export function CountUp({ value, from = 0, duration = 720, format = (n: number) => Math.round(n).toLocaleString('ko-KR') }: { value: number; from?: number; duration?: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(() => value * from);
  const shownRef = useRef(shown);
  useEffect(() => {
    if (reduce) {
      shownRef.current = value;
      const raf = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(raf);
    }
    const start = Date.now();
    const begin = shownRef.current;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const n = begin + (value - begin) * (1 - (1 - t) ** 3);
      shownRef.current = n;
      setShown(n);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);
  return <Text accessibilityLabel={format(value)}>{format(shown)}</Text>;
}
