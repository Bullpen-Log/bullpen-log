import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useReducedMotion, useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Icon } from '~/shell/icon';
import { MODES, type CameraMode } from './mode';

/**
 * 모드 고르기 시트 — 홈에서 쓸어 카메라가 열리면 미리보기 위 아래쪽에 뜬다(docs/designs/camera-modes.md 2-1).
 * 큰 카드 둘(구속 측정 · ABS 판정), 지난 번 모드가 먼저 골라져 있어 한 번 누르면 들어간다. 관리자만 쓰는 모드는
 * 일반 사용자에게 흐리게 '준비 중'.
 */
export function ModeSheet({
  value,
  isAdmin,
  onPick,
  bottom,
}: {
  value: CameraMode;
  isAdmin: boolean;
  onPick: (mode: CameraMode) => void;
  /** 뷰파인더 바닥에서 띄우는 간격 */
  bottom: number;
}) {
  const reduce = useReducedMotion();
  const y = useSharedValue(reduce ? 0 : 40);
  const alpha = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    y.set(withTiming(0, { duration: reduce ? 0 : 220, easing: Easing.bezier(0.2, 0.9, 0.3, 1) }));
    alpha.set(withTiming(1, { duration: reduce ? 0 : 180 }));
  }, [y, alpha, reduce]);
  const rise = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: alpha.value }));

  return (
    <Animated.View style={[styles.sheet, { bottom }, rise]}>
      <Text style={styles.title}>무엇을 할까요?</Text>
      <View style={styles.cards}>
        {MODES.map((m) => {
          const locked = m.adminOnly && !isAdmin;
          const on = m.key === value;
          return (
            <Pressable
              key={m.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: locked }}
              accessibilityLabel={`${m.title}${locked ? ' · 준비 중' : ''}`}
              disabled={locked}
              onPress={() => {
                void Haptics.selectionAsync();
                onPick(m.key);
              }}
              style={({ pressed }) => [styles.card, on && styles.cardOn, locked && styles.cardLocked, pressed && !locked && { opacity: 0.85 }]}
            >
              <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
                <Icon name={m.icon} size={28} color={on ? '#000' : '#fff'} />
              </View>
              <Text style={styles.cardTitle}>{m.title}</Text>
              <Text style={styles.cardBlurb}>{locked ? '준비 중이에요' : m.blurb}</Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

/* 아이폰 카메라의 노란 선택색 — 모드 띠(mode-strip.tsx)와 같다 */
export const MODE_YELLOW = '#ffd60a';

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 16,
    gap: 12,
    borderRadius: 28,
    backgroundColor: 'rgba(20,20,22,0.78)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 0 0.5px rgba(255,255,255,0.12), 0 12px 30px -8px rgba(0,0,0,0.6)',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  cards: { flexDirection: 'row', gap: 10 },
  card: {
    flex: 1,
    minHeight: 132,
    padding: 14,
    gap: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardOn: { borderColor: MODE_YELLOW, backgroundColor: 'rgba(255,214,10,0.12)' },
  cardLocked: { opacity: 0.45 },
  iconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  iconWrapOn: { backgroundColor: MODE_YELLOW },
  cardTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 4 },
  cardBlurb: { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 18 },
});
