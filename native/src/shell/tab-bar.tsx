import * as Haptics from 'expo-haptics';
import { emitRetap } from './tab-pager';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, useTheme } from '~/lib/ui';
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
  const cell = width > 0 ? (width - PAD * 2) / Math.max(1, tabs.length) : 0;

  const pos = useSharedValue(index);
  const lift = useSharedValue(0);
  const shown = useSharedValue(showLens ? 1 : 0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      pos.value = index;
      return;
    }
    pos.value = withSpring(index, POS_SPRING);
    /* 옮기는 동안 렌즈로 부풀었다 닿으면 가라앉는다(웹 영상의 '약간의 탄성') */
    lift.value = withSequence(withSpring(1, LIFT_SPRING), withDelay(160, withSpring(0, LIFT_SPRING)));
  }, [index, pos, lift]);
  useEffect(() => {
    shown.value = withSpring(showLens ? 1 : 0, LIFT_SPRING);
  }, [showLens, shown]);

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
              if (!on) lift.value = withSpring(0.3, LIFT_SPRING);
            }}
            onPressOut={() => {
              if (!on) lift.value = withSpring(0, LIFT_SPRING);
            }}
            onPress={() => {
              /* 떨림은 탭을 옮길 때만(웹 mobile-tabs) — 지금 탭을 다시 누르면 맨 위로 굴린다 */
              if (!on) void Haptics.selectionAsync();
              else emitRetap();
              onPress(t);
            }}
            style={({ pressed }) => [styles.item, t.locked && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            <View>
              <Icon name={GLYPH[t.icon] ?? 'house'} size={26} color={color} />
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

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: gap, paddingLeft: Math.max(20, inset.left), paddingRight: Math.max(20, inset.right) }]}>
      <View style={[styles.shadow, { shadowColor: col.shadow }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {glass ? (
          <GlassView glassEffectStyle="regular" colorScheme={theme === 'light' ? 'light' : 'dark'} style={styles.pill}>
            {body}
          </GlassView>
        ) : (
          <View style={[styles.pill, { backgroundColor: col.base, borderColor: col.edge, borderWidth: 1 }]}>{body}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockBadge: { position: 'absolute', right: -4, bottom: -3, width: 13, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  shadow: {
    width: '100%',
    maxWidth: 448,
    borderRadius: 999,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  pill: { flexDirection: 'row', padding: PAD, borderRadius: 999, overflow: 'hidden' },
  lens: { position: 'absolute', top: PAD, left: PAD, height: ITEM_H, borderRadius: 999 },
  item: { flex: 1, height: ITEM_H, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 2, borderRadius: 999 },
  label: { fontSize: 10 },
});
