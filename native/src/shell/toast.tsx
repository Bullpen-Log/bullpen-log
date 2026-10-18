import * as Haptics from 'expo-haptics';
import { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from './icon';

/**
 * 잠깐 뜨는 알림 — 웹 components/toast.tsx 와 같다: '저장했어요' 한 줄이 시계 밑에 1.8초 떴다 사라진다.
 * 위에서 12px 내려오며 진해지고(200ms) 사라질 때는 빠르게(150ms). 성공은 떨림 success, 오류는 error.
 * 어디서든 toast('…') — 뿌리(_layout)에 <Toaster /> 하나.
 */
export type ToastTone = 'success' | 'error';
type Item = { id: number; text: string; tone: ToastTone };
const SHOW_MS = 1800;
let current: Item | null = null;
let seq = 0;
const listeners = new Set<() => void>();

export function toast(text: string, tone: ToastTone = 'success') {
  current = { id: ++seq, text, tone };
  listeners.forEach((l) => l());
  void Haptics.notificationAsync(tone === 'error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function Toaster() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const item = useSyncExternalStore(subscribe, () => current);
  const shown = useSharedValue(0);
  useEffect(() => {
    if (!item) return;
    shown.set(withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) }));
    const t = setTimeout(() => shown.set(withTiming(0, { duration: 150, easing: Easing.out(Easing.ease) })), SHOW_MS);
    return () => clearTimeout(t);
  }, [item, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: reduce ? 0 : (1 - shown.value) * -12 }],
  }));
  if (!item) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { top: inset.top + 8 }, style]}
    >
      <Animated.View style={[styles.pill, { backgroundColor: withAlpha(c.ink, 0.92) }]}>
        <Icon name={item.tone === 'error' ? 'circle-alert' : 'check'} size={18} color={item.tone === 'error' ? c.danger : '#8cc8f0'} />
        <Text style={[styles.text, { color: c.page }]}>{item.text}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 100 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 22,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 20,
    boxShadow: '0 10px 30px -10px rgba(0,0,0,0.45)',
  },
  text: { fontSize: 15, fontWeight: '600' },
});
