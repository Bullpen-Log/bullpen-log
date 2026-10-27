import * as Haptics from 'expo-haptics';
import { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from './icon';

/**
 * 잠깐 뜨는 알림 — 웹 components/toast.tsx 와 같다: '저장했어요' 한 줄이 시계 밑에 1.8초 떴다 사라진다.
 * 위에서 12px 내려오며 진해지고(200ms) 사라질 때는 빠르게(150ms). 성공은 떨림 success, 오류는 error.
 * 어디서든 toast('…') — 뿌리(_layout)에 <Toaster /> 하나.
 * 안내(info)는 아이콘 · 떨림 없이 글만 — 정보만 알리는 알림창을 대신한다(2026-10-27 HIG 검토, alerts.md "Avoid using an alert merely to provide information").
 * 긴 글(오류 까닭 · 안내)은 읽을 시간만큼 오래(최대 7초) 떠 있고, VoiceOver 가 읽는다(accessibilityLiveRegion 은 안드로이드에만 먹었다).
 */
export type ToastTone = 'success' | 'error' | 'info';
type Item = { id: number; text: string; tone: ToastTone; ms: number };
const SHOW_MS = 1800;
let current: Item | null = null;
let seq = 0;
const listeners = new Set<() => void>();

export function toast(text: string, tone: ToastTone = 'success') {
  current = { id: ++seq, text, tone, ms: Math.min(7000, Math.max(SHOW_MS, 800 + text.length * 70)) };
  listeners.forEach((l) => l());
  if (tone !== 'info')
    void Haptics.notificationAsync(tone === 'error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
  AccessibilityInfo.announceForAccessibility(text);
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
    const t = setTimeout(() => shown.set(withTiming(0, { duration: 150, easing: Easing.out(Easing.ease) })), item.ms);
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
        {item.tone === 'info' ? null : (
          <Icon name={item.tone === 'error' ? 'circle-alert' : 'check'} size={18} color={item.tone === 'error' ? c.danger : '#8cc8f0'} />
        )}
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
  text: { flexShrink: 1, fontSize: 15, fontWeight: '600' },
});
