import * as Haptics from 'expo-haptics';
import { emitRetap } from './tab-pager';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, useTheme, withAlpha } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';

/**
 * 앱 아래 탭 막대 — 웹 휴대폰 탭 막대(components/app-shell/mobile-tabs.tsx · app/globals.css [data-tab-bar] · components/tab-lens.ts)와 같은 모양 ·
 * 같은 움직임(2026-10-18 김민: "하단 바도 다르고 느낌이 다르다"). 바닥에서 떠 있는 둥근 유리 알약(양옆 20 · 칸 52 · 알약 62 · 밑 틈은 홈 막대 자리에
 * 13 걸쳐), 지금 탭 뒤의 캡슐(렌즈)이 스프링으로 옮겨 가고 옮기는 동안 살짝 부푼다. 테마마다 그 색의 유리 — 라이트: 흰 유리 · 고른 칸 파랑,
 * 다크: 검은 유리 · 흰 글자, 네이비: 남색 유리. iOS 26 이면 진짜 유리(GlassView), 아니면 웹 CSS 의 반투명 색.
 * 탭 이름 · 주소 · 잠김은 사이트가 알려 준다(components/app-shell/expo-tabs.tsx).
 */
export type ShellTab = { href: string; label: string; icon: string; locked?: boolean };

export const DEFAULT_TABS: ShellTab[] = [
  { href: '/today', label: '홈', icon: 'home' },
  { href: '/videos', label: '투구', icon: 'baseball' },
  { href: '/training?view=home', label: '트레이닝', icon: 'dumbbell' },
  { href: '/nutrition', label: '영양', icon: 'utensils' },
  { href: '/more', label: '더보기', icon: 'menu' },
];

/* 웹 하단 탭과 같은 선 그림(nav-icons.tsx · glyphs.tsx Squares) — 26px */
const GLYPH: Record<string, IconName> = {
  home: 'house',
  baseball: 'baseball',
  dumbbell: 'dumbbell',
  utensils: 'utensils',
  menu: 'squares',
};

/**
 * 탭 막대가 차지하는 높이(홈 막대 자리 빼고) — 본문 끝 여백이 쓴다. 떠 있는 알약의 윗변은 바닥에서 '홈 막대 자리 − 13 + 62'(아이폰 34 → 83)라
 * 예전 막대(49 + 34)와 같은 자리다. 웹 globals.css 'Expo 앱 탭'의 --tab-bar-top 도 같은 값.
 */
export const TAB_BAR_HEIGHT = 49;

const ITEM_H = 52;
const PAD = 4;
/** 웹 tab-lens.ts 의 스프링(자리 k 290 · c 25.5, 부풂 k 420 · c 34) */
const POS_SPRING = { stiffness: 290, damping: 25.5, mass: 1 };
const LIFT_SPRING = { stiffness: 420, damping: 34, mass: 1 };
const LIFT_SX = 0.22;
const LIFT_SY = 0.28;

/** 테마마다 알약 · 렌즈 · 글자 색 — globals.css [data-tab-bar] 의 --tab-base · --tab-edge · --lens-ink · --tab-on · --tab-off */
function tabColors(theme: 'light' | 'dark' | 'navy', sky: string, muted: string) {
  if (theme === 'dark')
    return { base: 'rgba(28,28,30,0.88)', edge: 'rgba(255,255,255,0.18)', lens: 'rgba(255,255,255,0.16)', on: '#ffffff', off: 'rgba(255,255,255,0.62)', shadow: '#000000' };
  if (theme === 'navy')
    return { base: 'rgba(20,29,43,0.9)', edge: 'rgba(180,205,240,0.2)', lens: 'rgba(200,220,255,0.16)', on: '#7dd3fc', off: 'rgba(200,220,255,0.6)', shadow: '#030812' };
  return { base: 'rgba(255,255,255,0.86)', edge: 'rgba(255,255,255,0.9)', lens: 'rgba(20,30,50,0.1)', on: sky, off: muted, shadow: '#141e32' };
}

export function TabBar({ tabs, active, onPress }: { tabs: ShellTab[]; active: string | null; onPress: (t: ShellTab) => void }) {
  const c = usePalette();
  const theme = useTheme();
  const inset = useSafeAreaInsets();
  const col = tabColors(theme, c.sky, c.muted);
  const glass = isLiquidGlassAvailable();
  /* 홈 막대 자리에 13 걸쳐(밖에서는 12 보다 좁지 않게) — 웹 --tab-bar-gap */
  const gap = Math.max(inset.bottom - 13, 12);
  const index = Math.max(0, tabs.findIndex((t) => t.href === active));
  const showLens = tabs.some((t) => t.href === active);
  const [width, setWidth] = useState(0);
  const [spin, setSpin] = useState(0);
  const cell = width > 0 ? (width - PAD * 2) / Math.max(1, tabs.length) : 0;

  const pos = useSharedValue(index);
  const lift = useSharedValue(0);
  const shown = useSharedValue(showLens ? 1 : 0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      pos.set(index);
      return;
    }
    pos.set(withSpring(index, POS_SPRING));
    /* 옮기는 동안 렌즈로 부풀었다 닿으면 가라앉는다(웹 영상의 '약간의 탄성') */
    lift.set(withSequence(withSpring(1, LIFT_SPRING), withDelay(160, withSpring(0, LIFT_SPRING))));
  }, [index, pos, lift]);
  useEffect(() => {
    shown.set(withSpring(showLens ? 1 : 0, LIFT_SPRING));
  }, [showLens, shown]);

  /*
   * 길게 눌러 끌기 — 웹 mobile-tabs startHold: 0.28초 누르면 렌즈가 부푼 채 손가락을 따라오고(칸을 넘을 때마다 톡), 놓은 칸으로 간다.
   * 짧게 누르기 · 지금 탭 다시 누르기는 그대로(이 손동작은 길게 누를 때만 켜진다).
   */
  const under = useSharedValue(-1);
  const haptic = (kind: 'medium' | 'selection' | 'light') =>
    void (kind === 'selection' ? Haptics.selectionAsync() : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light));
  const drop = (i: number) => {
    const t = tabs[i];
    if (!t || t.href === active) {
      pos.set(withSpring(index, POS_SPRING));
      return;
    }
    haptic('light');
    onPress(t);
  };
  const n = tabs.length;
  const cellAt = (x: number) => {
    'worklet';
    return Math.max(0, Math.min(n - 1, x / Math.max(1, cell) - 0.5));
  };
  const drag = Gesture.Pan()
    .enabled(cell > 0)
    .activateAfterLongPress(280)
    .onStart((e) => {
      const p = cellAt(e.x);
      under.set(Math.round(p));
      pos.set(p);
      lift.set(withSpring(1, LIFT_SPRING));
      runOnJS(haptic)('medium');
    })
    .onUpdate((e) => {
      const p = cellAt(e.x);
      pos.set(p);
      if (Math.round(p) !== under.get()) {
        under.set(Math.round(p));
        runOnJS(haptic)('selection');
      }
    })
    .onEnd((e, ok) => {
      const i = Math.round(cellAt(e.x));
      lift.set(withSpring(0, LIFT_SPRING));
      pos.set(withSpring(ok ? i : index, POS_SPRING));
      if (ok) runOnJS(drop)(i);
    });

  const lensStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateX: pos.value * cell },
      { scaleX: 1 + LIFT_SX * lift.value },
      { scaleY: 1 + LIFT_SY * lift.value },
    ],
  }));

  const body = (
    <>
      {cell > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.lens, { width: cell, backgroundColor: col.lens }, lensStyle]} />
      ) : null}
      {tabs.map((t) => {
        const on = active === t.href;
        const color = on ? col.on : col.off;
        return (
          <Pressable
            key={t.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.locked ? `${t.label}(설정 전)` : t.label}
            onPressIn={() => {
              if (!on) lift.set(withSpring(0.3, LIFT_SPRING));
            }}
            onPressOut={() => {
              if (!on) lift.set(withSpring(0, LIFT_SPRING));
            }}
            onPress={() => {
              /* 더보기를 열면 네모 넷이 차례로 반 바퀴(웹 glyphs Squares animate-square-spin) */
              if (t.icon === 'menu') setSpin((n) => n + 1);
              /* 떨림은 탭을 옮길 때만(웹 mobile-tabs) — 지금 탭을 다시 누르면 맨 위로 굴린다 */
              if (!on) void Haptics.selectionAsync();
              else emitRetap();
              onPress(t);
            }}
            style={({ pressed }) => [styles.item, t.locked && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            <View>
              {t.icon === 'menu' ? <SpinSquares color={color} spin={spin} /> : <Icon name={GLYPH[t.icon] ?? 'house'} size={26} color={color} />}
              {/* 잠긴 탭 — 그림 오른쪽 아래 12px 자물쇠(웹 glyphs NavGlyph) */}
              {t.locked ? (
                <View style={[styles.lockBadge, { backgroundColor: col.lens }]}>
                  <Icon name="lock" size={9} color={color} strokeWidth={3} />
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color, fontWeight: on ? '600' : '500' }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </>
  );

  /* 손동작은 유리 판 안쪽 줄에 — 유리(GlassView) 바깥에 걸면 손가락이 안 온다 */
  const row = (
    <GestureDetector gesture={drag}>
      <View collapsable={false} style={styles.row}>{body}</View>
    </GestureDetector>
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: gap, paddingLeft: Math.max(20, inset.left), paddingRight: Math.max(20, inset.right) }]}>
      <View style={[styles.shadow, { boxShadow: `0 10px 40px ${withAlpha(col.shadow, 0.22)}` }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {glass ? (
          <GlassView glassEffectStyle="regular" colorScheme={theme === 'light' ? 'light' : 'dark'} style={styles.pill}>
            {row}
          </GlassView>
        ) : (
          <View style={[styles.pill, { backgroundColor: col.base, borderColor: col.edge, borderWidth: 1 }]}>{row}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockBadge: { position: 'absolute', right: -4, bottom: -3, width: 13, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  /* 그림자는 boxShadow — 바탕 없는 칸의 shadow* 는 iOS 가 장면마다 속 그림의 모양을 다시 셈했다(유리 알약 뒤라 바탕을 못 깐다) */
  shadow: {
    width: '100%',
    maxWidth: 448,
    borderRadius: 999,
  },
  pill: { flexDirection: 'row', padding: PAD, borderRadius: 999, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  lens: { position: 'absolute', top: 0, left: 0, height: ITEM_H, borderRadius: 999 },
  item: { flex: 1, height: ITEM_H, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 2, borderRadius: 999 },
  label: { fontSize: 10 },
});

/**
 * 더보기의 네모 넷 — 열 때마다 각자 제자리에서 반 바퀴, 왼위 → 오른위 → 왼아래 → 오른아래 차례로 45ms 씩 늦게(420ms).
 * 웹 components/app-shell/glyphs.tsx Squares 와 같은 크기 비율(칸 18.4 · 네모 7.2 · 선 1.9).
 */
const SQ_AT = [
  { left: 0, top: 0 },
  { right: 0, top: 0 },
  { left: 0, bottom: 0 },
  { right: 0, bottom: 0 },
] as const;
function SpinSquares({ color, spin }: { color: string; spin: number }) {
  return (
    <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 18.4, height: 18.4 }}>
        {SQ_AT.map((at, i) => (
          <Square key={i} at={at} i={i} color={color} spin={spin} />
        ))}
      </View>
    </View>
  );
}
function Square({ at, i, color, spin }: { at: (typeof SQ_AT)[number]; i: number; color: string; spin: number }) {
  const r = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!spin || reduce) return;
    r.set(0);
    r.set(withDelay(i * 45, withTiming(180, { duration: 420, easing: Easing.bezier(0.22, 1, 0.36, 1) })));
  }, [spin, i, r, reduce]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return <Animated.View style={[{ position: 'absolute', width: 7.2, height: 7.2, borderRadius: 2, borderWidth: 1.9, borderColor: color }, at, style]} />;
}
