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
  /* rim = 유리 가장자리 빛(위는 밝게 · 아래는 옅게), tint = 진짜 유리에 얹는 색, lensRim = 렌즈 캡슐의 빛 */
  if (theme === 'dark')
    return {
      base: 'rgba(28,28,30,0.88)', edge: 'rgba(255,255,255,0.18)', lens: 'rgba(255,255,255,0.16)', on: '#ffffff', off: 'rgba(255,255,255,0.62)', shadow: '#000000',
      tint: 'rgba(0,0,0,0.3)', rim: 'inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(255,255,255,0.06), inset 0 0 0 0.5px rgba(255,255,255,0.16)',
      lensRim: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.35)', drop: 0.55,
      glassRim: 'inset 0 1px 1px rgba(255,255,255,0.55), inset 0 0 0 1px rgba(255,255,255,0.22), 0 8px 22px rgba(0,0,0,0.45)',
    };
  if (theme === 'navy')
    return {
      base: 'rgba(20,29,43,0.9)', edge: 'rgba(180,205,240,0.2)', lens: 'rgba(200,220,255,0.16)', on: '#7dd3fc', off: 'rgba(200,220,255,0.6)', shadow: '#030812',
      tint: 'rgba(14,30,60,0.38)', rim: 'inset 0 1px 0 rgba(200,225,255,0.3), inset 0 -1px 0 rgba(200,225,255,0.06), inset 0 0 0 0.5px rgba(200,225,255,0.16)',
      lensRim: 'inset 0 1px 0 rgba(220,235,255,0.25), 0 2px 8px rgba(0,0,0,0.35)', drop: 0.55,
      glassRim: 'inset 0 1px 1px rgba(220,235,255,0.55), inset 0 0 0 1px rgba(200,225,255,0.22), 0 8px 22px rgba(0,0,0,0.45)',
    };
  return {
    base: 'rgba(255,255,255,0.86)', edge: 'rgba(255,255,255,0.9)', lens: 'rgba(120,130,150,0.16)', on: sky, off: muted, shadow: '#141e32',
    tint: 'rgba(255,255,255,0.3)', rim: 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.35), inset 0 0 0 0.5px rgba(255,255,255,0.6)',
    lensRim: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 4px rgba(20,30,50,0.1)', drop: 0.3,
    glassRim: 'inset 0 1px 1px rgba(255,255,255,0.95), inset 0 -1px 1px rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.6), 0 6px 18px rgba(20,30,50,0.18)',
  };
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
  /*
   * 유리 렌즈 — iOS 26 탭 막대처럼 누르거나 옮기는 동안 고른 칸이 투명한 유리(확대 · 가장자리 빛 굴절)로 바뀌어 막대 밖으로 부푼다(2026-10-19 김민
   * 화면 녹화). 유리는 알파로 숨기면 효과가 꺼져서, 스타일을 'none' ↔ 'clear' 로 바꾸고 iOS 가 맺히고 사라지는 움직임을 그린다.
   */
  const [hold, setHold] = useState(false);
  const [pulseAt, setPulseAt] = useState(0);
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (!pulseAt) return;
    const id = setTimeout(() => setPulsing(false), 520);
    return () => clearTimeout(id);
  }, [pulseAt]);
  const lensGlass = hold || pulsing;
  const pulseGlass = () => {
    setPulsing(true);
    setPulseAt(Date.now());
  };
  useEffect(() => {
    if (first.current) {
      first.current = false;
      pos.set(index);
      return;
    }
    pos.set(withSpring(index, POS_SPRING));
    /* 옮기는 동안 렌즈로 부풀었다 닿으면 가라앉는다(웹 영상의 '약간의 탄성') */
    lift.set(withSequence(withSpring(1, LIFT_SPRING), withDelay(160, withSpring(0, LIFT_SPRING))));
    pulseGlass();
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
      runOnJS(setHold)(true);
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
      runOnJS(setHold)(false);
      pos.set(withSpring(ok ? i : index, POS_SPRING));
      if (ok) runOnJS(drop)(i);
    });

  /* 유리 렌즈 — 막대 밖으로 더 크게 부푼다(영상처럼 위아래로 삐져나옴) */
  const glassLensStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: pos.value * cell },
      { scaleX: 1 + 0.32 * lift.value },
      { scaleY: 1 + 0.55 * lift.value },
    ],
  }));
  const lensStyle = useAnimatedStyle(() => ({
    /* 유리 렌즈가 뜨는 동안 회색 캡슐은 옅어진다 */
    opacity: shown.value * (glass ? 1 - 0.85 * lift.value : 1),
    transform: [
      { translateX: pos.value * cell },
      { scaleX: 1 + LIFT_SX * lift.value },
      { scaleY: 1 + LIFT_SY * lift.value },
    ],
  }));

  const body = (
    <>
      {cell > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.lens, { width: cell, backgroundColor: col.lens, boxShadow: col.lensRim }, lensStyle]} />
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
              if (!on && glass) setHold(true);
            }}
            onPressOut={() => {
              if (!on) lift.set(withSpring(0, LIFT_SPRING));
              if (!on && glass) setHold(false);
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
      {/* 떠 있는 겹 그림자(접촉 · 가까운 · 먼 그림자) — 바닥에서 떠 보이게 */}
      <View
        style={[
          styles.shadow,
          {
            boxShadow: `0 1px 2px ${withAlpha(col.shadow, col.drop * 0.4)}, 0 8px 22px -4px ${withAlpha(col.shadow, col.drop * 0.8)}, 0 22px 48px -14px ${withAlpha(col.shadow, col.drop)}`,
          },
        ]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {glass ? (
          /* iOS 26 진짜 유리 — 누르면 유리가 손가락에 반응(isInteractive), 테마 색을 살짝 얹는다 */
          <GlassView glassEffectStyle="clear" isInteractive tintColor={col.tint} colorScheme={theme === 'light' ? 'light' : 'dark'} style={styles.pill}>
            {row}
          </GlassView>
        ) : (
          <View style={[styles.pill, { backgroundColor: col.base, borderColor: col.edge, borderWidth: 1 }]}>{row}</View>
        )}
        {/* 유리 렌즈 — 알약 밖(잘리지 않게)에서 고른 칸 위에 */}
        {glass && cell > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.glassLens, { width: cell }, lensGlass && { boxShadow: col.glassRim }, glassLensStyle]}
          >
            <GlassView
              glassEffectStyle={{ style: lensGlass ? 'clear' : 'none', animate: true, animationDuration: 0.22 }}
              colorScheme={theme === 'light' ? 'light' : 'dark'}
              style={[StyleSheet.absoluteFill, { borderRadius: 999 }]}
            />
          </Animated.View>
        ) : null}
        {/* 유리 가장자리 빛 — 위 테두리가 밝게 빛나 두께가 보인다(누르기는 그대로 지나간다) */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 999, boxShadow: col.rim }]} />
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
  glassLens: { position: 'absolute', top: PAD, left: PAD, height: ITEM_H, borderRadius: 999 },
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
