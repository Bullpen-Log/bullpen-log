import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MODES, type CameraMode } from './mode';
import { MODE_YELLOW } from './mode-sheet';

/**
 * 모드 띠 — 셔터 위에 아이폰 카메라의 '동영상 · 슬로모션' 띠처럼. 고른 것이 가운데 · 노란 글, 옆으로 밀거나 눌러 바꾼다
 * (docs/designs/camera-modes.md 2-2). 측정 중(locked)엔 잠겨 있어 흐리고 안 움직인다 — 바꾸려면 세션 종료.
 * 관리자만 쓰는 모드는 일반 사용자에겐 안 보인다(모드 시트의 '준비 중'과 다르게, 띠는 좁아서).
 */
const ITEM_W = 88;

export function ModeStrip({
  value,
  isAdmin,
  locked,
  onChange,
}: {
  value: CameraMode;
  isAdmin: boolean;
  locked: boolean;
  onChange: (mode: CameraMode) => void;
}) {
  const reduce = useReducedMotion();
  const items = useMemo(() => MODES.filter((m) => !m.adminOnly || isAdmin), [isAdmin]);
  const index = Math.max(0, items.findIndex((m) => m.key === value));
  /* 띠는 고른 칸이 띠 가운데 오게 통째로 밀린다 — 띠 폭을 재야 가운데를 안다 */
  const [stripW, setStripW] = useState(0);
  const target = stripW / 2 - ITEM_W / 2 - index * ITEM_W;
  const x = useSharedValue(target);
  const drag = useSharedValue(0);
  useEffect(() => {
    x.set(withTiming(target, { duration: reduce ? 0 : 200, easing: Easing.bezier(0.2, 0.9, 0.3, 1) }));
  }, [target, x, reduce]);

  const pick = (i: number) => {
    const next = items[Math.max(0, Math.min(items.length - 1, i))];
    if (!next || next.key === value) return;
    void Haptics.selectionAsync();
    onChange(next.key);
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!locked && items.length > 1)
        .activeOffsetX([-8, 8])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          drag.set(e.translationX);
        })
        .onEnd((e) => {
          const moved = e.translationX;
          drag.set(0);
          /* 띠 폭의 반 넘게 또는 빠르게 튕기면 옆 칸 */
          const step = Math.abs(moved) > ITEM_W / 2 || Math.abs(e.velocityX) > 400 ? (moved < 0 ? 1 : -1) : 0;
          if (step) runOnJS(pick)(index + step);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locked, items, index, value]
  );

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value + drag.value * 0.6 }] }));

  if (items.length < 2) return null;
  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.strip, locked && { opacity: 0.45 }]} accessibilityRole="tablist" onLayout={(e) => setStripW(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.row, slide]}>
          {items.map((m, i) => {
            const on = i === index;
            return (
              <Pressable
                key={m.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on, disabled: locked }}
                disabled={locked}
                onPress={() => pick(i)}
                style={styles.item}
              >
                <Text style={[styles.text, on && styles.textOn]}>{m.short}</Text>
              </Pressable>
            );
          })}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  strip: { height: 32, overflow: 'hidden', alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', height: 32 },
  item: { width: ITEM_W, height: 32, alignItems: 'center', justifyContent: 'center' },
  text: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700', letterSpacing: 0.6 },
  textOn: { color: MODE_YELLOW },
});
