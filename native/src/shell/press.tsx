import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { type GestureResponderEvent, Pressable, type PressableProps, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * 누름 표시 — 웹 components/press-feedback.tsx · globals.css [data-pressed] 와 같다.
 * - 손가락이 닿고 60ms 지나면 옅어짐(opacity 0.55, 160×160 넘는 큰 것은 0.8). 그보다 빨리 떼도 한 번은 보인다.
 * - 떼고 100ms 더 유지 — 너무 빨리 사라져 누른 줄 모르는 일이 없게.
 * - 손가락이 8px 넘게 움직이면(굴리기) 취소 — Pressable 이 누름을 거두면 onPressOut 이 온다.
 * - card: 카드처럼 큰 판 — 0.985 배로 살짝 눌리고(180ms cubic-bezier(0.2,0,0,1), gc:3411-3428) 옅어짐은 0.8.
 * - select: 고르는 것(칩 · 날짜 · 탭) — 누르면 햅틱 selection(웹 haptic-feedback.tsx). selected 면 이미 고른 것이라 안 떤다.
 * 화면은 Pressable 대신 이것을 쓴다.
 */
const SHOW_AFTER_MS = 60;
const HOLD_AFTER_UP_MS = 100;
const BIG_AREA = 160 * 160;
const CARD_EASE = Easing.bezier(0.2, 0, 0, 1);

const APressable = Animated.createAnimatedComponent(Pressable);

export function Press({
  card = false,
  select = false,
  selected = false,
  style,
  children,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  card?: boolean;
  select?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const lit = useSharedValue(0);
  const [big, setBig] = useState(card);
  const show = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (show.current) clearTimeout(show.current);
      if (hide.current) clearTimeout(hide.current);
    },
    []
  );
  const on = () => {
    lit.value = card && !reduce ? withTiming(1, { duration: 180, easing: CARD_EASE }) : 1;
  };
  const off = () => {
    lit.value = card && !reduce ? withTiming(0, { duration: 180, easing: CARD_EASE }) : 0;
  };
  const dim = card || big ? 0.8 : 0.55;
  /* 부르는 쪽이 준 투명도(못 누르는 단추의 0.3 같은 것)에 누름 표시를 곱한다 — 예전엔 아래 opacity 가 뒤에 와 덮어써, 흐리게 둔 단추가 늘 또렷했다 */
  const flat = StyleSheet.flatten(style as never) as ViewStyle | undefined;
  const base = typeof flat?.opacity === 'number' ? flat.opacity : 1;
  const anim = useAnimatedStyle(() => ({
    opacity: base * (1 - (1 - dim) * lit.value),
    transform: card ? [{ scale: 1 - 0.015 * lit.value }] : [],
  }));
  return (
    <APressable
      {...rest}
      onLayout={(e) => {
        rest.onLayout?.(e);
        const { width, height } = e.nativeEvent.layout;
        setBig(card || width * height > BIG_AREA);
      }}
      onPressIn={(e: GestureResponderEvent) => {
        if (hide.current) clearTimeout(hide.current);
        show.current = setTimeout(on, SHOW_AFTER_MS);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        /* 굴리기 등으로 누름이 거둬지면 여기서 끝 — 진짜 누름이면 바로 뒤 onPress 가 다시 켜고 100ms 뒤 끈다 */
        if (show.current) clearTimeout(show.current);
        off();
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        on();
        if (hide.current) clearTimeout(hide.current);
        hide.current = setTimeout(off, HOLD_AFTER_UP_MS);
        if (select && !selected) void Haptics.selectionAsync();
        onPress?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </APressable>
  );
}
