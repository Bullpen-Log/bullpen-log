import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon } from '~/shell/icon';

/**
 * 홈에서 오른쪽으로 쓸면 구속 측정 — 웹 components/tab-pager.tsx 의 camera 갈래와 같다.
 * - 홈 첫 화면에서만, 오른쪽으로만(왼쪽 · 다른 탭은 쓸기 없음 — 2026-10-15 김민 "구속 측정 쪽 쓸기만").
 * - 손가락을 따라 홈이 밀리고 왼쪽에서 검은 판(레이더 · '구속 측정')이 같이 들어온다.
 * - 폭 1/4 넘게 또는 빠르게 튕기면(0.35px/ms) 끝까지 밀린 뒤 구속 측정으로, 아니면 제자리.
 *   손 뗀 빠르기를 이어받는다(웹 settleFor — 130~280ms, cubic-bezier(0.2, y1, 0.35, 1)).
 * - 왼쪽 끝 16px 는 아이폰 뒤로 가기 몫이라 받지 않는다. 요약 칸(옆으로 넘기는 칸)은 제 손가락이 이긴다(HomeSwipeContext).
 */
const SNAP_RATIO = 0.25;
const FLICK_SPEED = 350; // px/s
const EDGE = 16;

/** 요약 칸 같은 가로 쓸기 부품이 이 쓸기를 막을 때 쓴다 — `.blocksExternalGesture(ctx)` */
export const HomeSwipeContext = createContext<GestureType | null>(null);
export const useHomeSwipe = () => useContext(HomeSwipeContext);

function settle(dist: number, speed: number) {
  const d = Math.max(1, Math.abs(dist));
  const v = Math.max(0, speed) / 1000; // px/ms
  const ms = v > 0.05 ? Math.round(Math.min(280, Math.max(130, (2.2 * d) / v))) : 200;
  const y1 = Math.min(1, (0.2 * v * ms) / d);
  return { ms, easing: Easing.bezier(0.2, y1, 0.35, 1) };
}

export function CameraSwipe({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const dx = useSharedValue(0);
  const startX = useSharedValue(0);

  const open = () => {
    router.push('/velocity');
    /* 구속 측정이 위에 덮인 뒤 제자리로(돌아오면 홈 그대로) */
    setTimeout(() => dx.set(0), 700);
  };
  const tick = () => void Haptics.selectionAsync();

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX(10)
        .failOffsetX(-10)
        .failOffsetY([-12, 12])
        .onBegin((e) => {
          startX.set(e.absoluteX);
        })
        .onUpdate((e) => {
          if (startX.get() < EDGE) return;
          dx.set(Math.max(0, e.translationX));
        })
        .onEnd((e) => {
          if (startX.get() < EDGE) return;
          const v = e.velocityX;
          const far = (dx.get() > width * SNAP_RATIO && v > -FLICK_SPEED) || v > FLICK_SPEED;
          if (far) {
            const s = settle(width - dx.get(), Math.max(0, v));
            runOnJS(tick)();
            dx.set(withTiming(width, { duration: reduce ? 0 : s.ms, easing: s.easing }, (done) => done && runOnJS(open)()));
          } else {
            const s = settle(dx.get(), Math.max(0, -v));
            dx.set(withTiming(0, { duration: reduce ? 0 : s.ms, easing: s.easing }));
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, width, reduce]
  );

  const content = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  const ghost = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }], opacity: dx.value > 0 ? 1 : 0 }));

  return (
    <HomeSwipeContext.Provider value={pan}>
      <GestureDetector gesture={pan}>
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.View style={[{ flex: 1 }, content]}>{children}</Animated.View>
          {/* 구속 측정 자리표시 — 왼쪽에서 손가락을 따라 들어오는 검은 판(웹 data-tab-ghost) */}
          <Animated.View pointerEvents="none" style={[styles.ghost, { left: -width, width }, ghost]}>
            <View style={styles.ghostIcon}>
              <Icon name="radar" size={40} color="#fff" />
            </View>
            <Text style={styles.ghostText}>구속 측정</Text>
          </Animated.View>
        </View>
      </GestureDetector>
    </HomeSwipeContext.Provider>
  );
}

const styles = StyleSheet.create({
  ghost: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 12 },
  ghostIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
